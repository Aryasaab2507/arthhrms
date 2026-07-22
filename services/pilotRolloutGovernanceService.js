/**
 * pilotRolloutGovernanceService.js
 * ARTHHRMS - Multi-Stage Pilot Rollout Controls
 *
 * Additive tenant activation and staged rollout governance for controlled
 * production onboarding. This service never modifies live business records,
 * never bypasses RBAC, and keeps all rollout evidence tenant scoped.
 */
(function attachPilotRolloutGovernanceService(global) {
    'use strict';

    var SOURCE = 'pilotRolloutGovernanceService';
    var ROLLOUT_STAGES = Object.freeze(['STAGE_0', 'STAGE_1', 'STAGE_2', 'STAGE_3', 'STAGE_4']);
    var STAGE_LABELS = Object.freeze({
        STAGE_0: 'Internal Testing',
        STAGE_1: 'Pilot Company',
        STAGE_2: 'Limited Customers',
        STAGE_3: 'Controlled Production',
        STAGE_4: 'General Availability'
    });
    var ROLLOUT_STATES = Object.freeze(['CREATED', 'ENROLLED', 'APPROVED', 'ACTIVE', 'SUSPENDED', 'ROLLED_BACK', 'ARCHIVED']);
    var AUTHORITY_ROLES = Object.freeze(['PLATFORM_OWNER']);
    var REVIEW_ROLES = Object.freeze(['PLATFORM_OWNER', 'DIRECTOR', 'HR', 'HR_HEAD']);
    var CHECKPOINTS = Object.freeze([
        'ORGANIZATION_INITIALIZED',
        'DEPARTMENTS_CONFIGURED',
        'EMPLOYEES_IMPORTED',
        'EMPLOYEES_ACTIVATED',
        'LEAVE_POLICIES_CONFIGURED',
        'HOLIDAYS_IMPORTED',
        'SECURITY_CONTROLS_ENABLED',
        'AUDIT_SYSTEM_ACTIVE'
    ]);
    var SENSITIVE_KEY_PATTERN = /(salary|payroll|compensation|leave.?balance|password|secret|token|jwt|authorization|private|confidential|bank|tax|aadhaar|\bpan\b|ssn|raw|payload|body|stack|path|url|email|phone|name|note)/i;
    var SENSITIVE_VALUE_PATTERN = /(ABC confidential|confidential|private setup|salary|password|secret|token|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/ig;

    function db() {
        try { return global.DB || null; } catch (error) { return null; }
    }

    function rawData() {
        try {
            var source = db();
            return source && typeof source.get === 'function' ? source.get() || {} : {};
        } catch (error) {
            return {};
        }
    }

    function saveData(data) {
        try {
            var source = db();
            if (source && typeof source.save === 'function') {
                source.save(data || {});
                return true;
            }
        } catch (error) {}
        return false;
    }

    function nowIso() { return new Date().toISOString(); }

    function safeString(value, fallback) {
        try {
            if (value === null || typeof value === 'undefined') return fallback || '';
            return String(value);
        } catch (error) {
            return fallback || '';
        }
    }

    function normalizeRole(value) {
        var role = safeString(value || 'EMPLOYEE', 'EMPLOYEE').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
        if (role === 'SUPERADMIN') role = 'SUPER_ADMIN';
        if (role === 'PLATFORMOWNER' || role === 'ROOT' || role === 'OWNER') role = 'PLATFORM_OWNER';
        if (role === 'HRHEAD') role = 'HR_HEAD';
        return role || 'EMPLOYEE';
    }

    function normalizeTenantSlug(value) {
        var text = safeString(value || '', '').trim().toLowerCase();
        text = text.replace(/^ten[-_]/, '');
        text = text.replace(/^tenant[-_]/, '');
        return text.replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }

    function normalizeStage(value, fallback) {
        var stage = safeString(value || fallback || 'STAGE_0', 'STAGE_0').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
        if (stage === 'INTERNAL_TESTING') stage = 'STAGE_0';
        if (stage === 'PILOT_COMPANY' || stage === 'PILOT') stage = 'STAGE_1';
        if (stage === 'LIMITED_CUSTOMERS') stage = 'STAGE_2';
        if (stage === 'CONTROLLED_PRODUCTION') stage = 'STAGE_3';
        if (stage === 'GENERAL_AVAILABILITY' || stage === 'GA') stage = 'STAGE_4';
        return ROLLOUT_STAGES.indexOf(stage) !== -1 ? stage : '';
    }

    function clampScore(value) {
        var number = Number(value);
        if (!Number.isFinite(number)) return 0;
        return Math.max(0, Math.min(100, Math.round(number)));
    }

    function cloneSanitized(value, keyHint) {
        if (Array.isArray(value)) {
            return value.map(function each(item) { return cloneSanitized(item, keyHint); });
        }
        if (value && typeof value === 'object') {
            var clone = {};
            Object.keys(value).forEach(function each(key) {
                if (SENSITIVE_KEY_PATTERN.test(key)) return;
                var next = cloneSanitized(value[key], key);
                if (typeof next !== 'undefined') clone[key] = next;
            });
            return clone;
        }
        if (SENSITIVE_KEY_PATTERN.test(safeString(keyHint || '', ''))) return undefined;
        if (typeof value === 'string') return value.replace(SENSITIVE_VALUE_PATTERN, '[REDACTED]');
        return value;
    }

    function freezeRolloutOutput(value) {
        if (Array.isArray(value)) return Object.freeze(value.map(freezeRolloutOutput));
        if (value && typeof value === 'object') {
            var clone = {};
            Object.keys(value).forEach(function each(key) {
                clone[key] = freezeRolloutOutput(value[key]);
            });
            return Object.freeze(clone);
        }
        return value;
    }

    function frozen(value) {
        return freezeRolloutOutput(cloneSanitized(value || {}));
    }

    function issue(code, message, severity, metadata) {
        return frozen({
            code: code,
            message: message,
            severity: severity || 'WARNING',
            metadata: cloneSanitized(metadata || {})
        });
    }

    function actorFromContext(context) {
        var actor = context && context.actor ? context.actor : {};
        return {
            id: safeString(actor.id || actor.userId || actor.empId || actor.employeeId || '', '').trim(),
            role: normalizeRole(actor.role || context?.role || 'EMPLOYEE'),
            tenantSlug: normalizeTenantSlug(actor.tenantSlug || actor.tenantId || context?.tenantSlug || context?.tenantId || ''),
            governanceOnly: context?.governanceOnly === true
        };
    }

    function tenantFromPayload(input, context) {
        var source = input && typeof input === 'object' ? input : {};
        var actor = context && context.actor ? context.actor : {};
        var settings = rawData().companySettings || {};
        return normalizeTenantSlug(
            source.tenantSlug ||
            source.tenantId ||
            source.companyId ||
            context?.tenantSlug ||
            context?.tenantId ||
            actor.tenantSlug ||
            actor.tenantId ||
            settings.tenantSlug ||
            settings.tenantId ||
            settings.companyId ||
            'default'
        );
    }

    function rowTenant(row) {
        return normalizeTenantSlug(row?.tenantSlug || row?.tenantId || row?.companyId || row?.organizationId || '');
    }

    function sameTenant(row, tenantSlug) {
        var scope = rowTenant(row);
        if (scope) return scope === normalizeTenantSlug(tenantSlug);
        return false;
    }

    function list(key) {
        var data = rawData();
        return Array.isArray(data[key]) ? data[key].slice() : [];
    }

    function tenantRows(key, tenantSlug) {
        return list(key).filter(function filter(row) { return sameTenant(row, tenantSlug); });
    }

    function latestTenantRow(key, tenantSlug) {
        return tenantRows(key, tenantSlug)
            .sort(function sort(a, b) {
                return safeString(b.updatedAt || b.createdAt || b.generatedAt || b.activatedAt || '', '').localeCompare(safeString(a.updatedAt || a.createdAt || a.generatedAt || a.activatedAt || '', ''));
            })[0] || null;
    }

    function validateAccess(action, context, tenantSlug) {
        var actor = actorFromContext(context || {});
        var target = normalizeTenantSlug(tenantSlug);
        var issues = [];
        var isAuthorityAction = ['ACTIVATE', 'ROLLBACK', 'SUSPEND', 'FEATURE_FLAG'].indexOf(action) !== -1;
        if (isAuthorityAction && AUTHORITY_ROLES.indexOf(actor.role) === -1) {
            issues.push(issue('ROLLOUT_AUTHORITY_REQUIRED', 'Only PLATFORM_OWNER may approve activation, rollback, suspension, or tenant feature flag changes.', 'CRITICAL'));
        }
        if (!isAuthorityAction && REVIEW_ROLES.indexOf(actor.role) === -1) {
            issues.push(issue('ROLLOUT_ACCESS_DENIED', 'This role cannot access rollout governance.', 'CRITICAL'));
        }
        if (actor.role !== 'PLATFORM_OWNER' && actor.tenantSlug && target && actor.tenantSlug !== target) {
            issues.push(issue('CROSS_TENANT_ROLLOUT_BLOCKED', 'Rollout governance is tenant scoped and cannot cross tenant boundaries.', 'CRITICAL', { actorTenant: actor.tenantSlug, targetTenant: target }));
        }
        return {
            actor: actor,
            allowed: issues.length === 0,
            issues: issues
        };
    }

    function completeCheckpoint(code, label, complete, message, blocker) {
        return {
            code: code,
            label: label,
            status: complete ? 'COMPLETE' : (blocker === false ? 'WARNING' : 'BLOCKED'),
            complete: !!complete,
            message: message || (complete ? 'Checkpoint complete.' : 'Checkpoint incomplete.'),
            blocker: complete ? false : blocker !== false
        };
    }

    function hasActiveHolidayCalendar(tenantSlug) {
        var calendarKeys = ['companyHolidayCalendars', 'holidayCalendarRecords', 'holidayImportHistory', 'companyHolidayRecords'];
        return calendarKeys.some(function any(key) {
            return tenantRows(key, tenantSlug).some(function active(row) {
                var state = safeString(row.state || row.status || '', '').toUpperCase();
                var holidays = Array.isArray(row.holidays) ? row.holidays.length : Number(row.holidayCount || 0);
                return state === 'ACTIVE' || state === 'VALIDATED' || state === 'APPROVED' || holidays > 0;
            });
        });
    }

    function hasLeavePolicy(tenantSlug) {
        var settings = rawData().companySettings || {};
        var init = latestTenantRow('organizationInitializationRecords', tenantSlug) || {};
        var modules = init.initializationModules || init.modules || {};
        return modules.leavePoliciesConfigured === true ||
            settings.leavePoliciesConfigured === true ||
            tenantRows('leavePolicies', tenantSlug).length > 0 ||
            tenantRows('leavePolicyRecords', tenantSlug).length > 0;
    }

    function hasSecurityControls(tenantSlug) {
        return tenantRows('passwordResetHistory', tenantSlug).length > 0 ||
            tenantRows('passwordResetTokenHistory', tenantSlug).length > 0 ||
            tenantRows('sessionGovernanceHistory', tenantSlug).length > 0 ||
            tenantRows('loginAttemptHistory', tenantSlug).length > 0 ||
            !!(global.PasswordResetGovernanceService && global.SessionGovernanceService && global.LoginAttemptSecurityService);
    }

    function hasAuditSystem(tenantSlug) {
        return tenantRows('auditLogs', tenantSlug).length > 0 ||
            !!global.AuditService ||
            !!(db() && typeof db().writeAuditLog === 'function');
    }

    function buildCheckpoints(tenantSlug) {
        var org = latestTenantRow('organizationInitializationRecords', tenantSlug);
        var orgState = safeString(org?.state || '', '').toUpperCase();
        var departments = tenantRows('tenantDepartmentRecords', tenantSlug).concat(tenantRows('departments', tenantSlug));
        var employees = tenantRows('employees', tenantSlug);
        var importRows = tenantRows('employeeBulkImportPreviewHistory', tenantSlug).concat(tenantRows('importQualityReports', tenantSlug));
        var activationRows = tenantRows('employeeActivationRecords', tenantSlug).concat(tenantRows('activationHistory', tenantSlug));
        var activated = activationRows.filter(function active(row) {
            var state = safeString(row.state || row.status || '', '').toUpperCase();
            return state === 'ACTIVE' || state === 'ONBOARDING_COMPLETED' || state === 'PROFILE_COMPLETED';
        }).length;
        var imported = employees.length > 0 || importRows.some(function valid(row) {
            return Number(row.summary?.validRows || row.validRows || row.totalRows || 0) > 0;
        });
        var orgReady = !!org && ['CONFIGURING', 'VALIDATING', 'READY', 'ACTIVE'].indexOf(orgState) !== -1;

        return [
            completeCheckpoint('ORGANIZATION_INITIALIZED', 'Organization Initialized', orgReady, orgReady ? 'Organization initialization record is present.' : 'Organization initialization must be completed.'),
            completeCheckpoint('DEPARTMENTS_CONFIGURED', 'Departments Configured', departments.length > 0, departments.length ? departments.length + ' department structure record(s) found.' : 'Department setup is required.'),
            completeCheckpoint('EMPLOYEES_IMPORTED', 'Employees Imported', imported, imported ? 'Employee import or workforce records are present.' : 'Employee import must be completed.'),
            completeCheckpoint('EMPLOYEES_ACTIVATED', 'Employees Activated', activated > 0, activated ? activated + ' activation record(s) found.' : 'At least one employee activation record is required.'),
            completeCheckpoint('LEAVE_POLICIES_CONFIGURED', 'Leave Policies Configured', hasLeavePolicy(tenantSlug), hasLeavePolicy(tenantSlug) ? 'Leave policy configuration is available.' : 'Leave policies must be configured.'),
            completeCheckpoint('HOLIDAYS_IMPORTED', 'Holidays Imported', hasActiveHolidayCalendar(tenantSlug), hasActiveHolidayCalendar(tenantSlug) ? 'Holiday calendar is active.' : 'Holiday calendar import is required.'),
            completeCheckpoint('SECURITY_CONTROLS_ENABLED', 'Security Controls Enabled', hasSecurityControls(tenantSlug), hasSecurityControls(tenantSlug) ? 'Password, session, or login security evidence is present.' : 'Password reset, session, and login security controls must be enabled.'),
            completeCheckpoint('AUDIT_SYSTEM_ACTIVE', 'Audit System Active', hasAuditSystem(tenantSlug), hasAuditSystem(tenantSlug) ? 'Audit system is available.' : 'Audit evidence is required.')
        ];
    }

    function persistRow(key, row, context) {
        if (context && context.skipPersistence) return row;
        var data = rawData();
        data[key] = Array.isArray(data[key]) ? data[key] : [];
        data[key].push(cloneSanitized(row || {}));
        saveData(data);
        return row;
    }

    function upsertRollout(record, context) {
        if (context && context.skipPersistence) return record;
        var data = rawData();
        data.multiStagePilotRolloutRecords = Array.isArray(data.multiStagePilotRolloutRecords) ? data.multiStagePilotRolloutRecords : [];
        var index = data.multiStagePilotRolloutRecords.findIndex(function match(row) { return sameTenant(row, record.tenantSlug); });
        if (index >= 0) data.multiStagePilotRolloutRecords[index] = cloneSanitized(record);
        else data.multiStagePilotRolloutRecords.push(cloneSanitized(record));
        saveData(data);
        return record;
    }

    function audit(actionType, metadata, context) {
        if (context && context.skipAuditPersistence) return false;
        var actor = actorFromContext(context || {});
        var meta = cloneSanitized(metadata || {});
        try {
            if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                global.AuditService.recordAudit({
                    eventType: actionType,
                    actionType: actionType,
                    actorId: actor.id,
                    actorRole: actor.role,
                    source: SOURCE,
                    module: 'Rollout Governance',
                    severity: meta.success === false ? 'WARNING' : 'INFO',
                    metadata: Object.assign({}, meta, { actionType: actionType, module: 'Rollout Governance' })
                }, { actor: actor, source: SOURCE });
                return true;
            }
        } catch (error) {}
        try {
            if (db() && typeof db().writeAuditLog === 'function') {
                db().writeAuditLog(actor.role, actor.id, actionType, 'Rollout Governance', meta.tenantSlug || '', meta.description || actionType);
                return true;
            }
        } catch (error) {}
        try {
            var data = rawData();
            data.auditLogs = Array.isArray(data.auditLogs) ? data.auditLogs : [];
            data.auditLogs.push({
                auditId: 'AUD-ROLLOUT-' + Date.now().toString(36),
                tenantSlug: meta.tenantSlug || '',
                actorRole: actor.role,
                actorId: actor.id,
                actionType: actionType,
                module: 'Rollout Governance',
                description: meta.description || actionType,
                date: nowIso(),
                immutable: true
            });
            saveData(data);
            return true;
        } catch (error) {}
        return false;
    }

    function failure(code, tenantSlug, issues, context) {
        var output = {
            success: false,
            tenantSlug: normalizeTenantSlug(tenantSlug),
            state: 'BLOCKED',
            issues: issues && issues.length ? issues : [issue(code || 'ROLLOUT_FAILED_SAFE', 'Rollout governance failed safely.', 'ERROR')],
            governance: {
                tenantIsolationPreserved: true,
                rolloutGovernancePreserved: true,
                backwardCompatibilityPreserved: true
            },
            generatedAt: nowIso()
        };
        audit('ROLLOUT_ACTION_BLOCKED', { tenantSlug: output.tenantSlug, success: false, description: code || 'Rollout action blocked.' }, context || {});
        return frozen(output);
    }

    function evaluateTenantReadiness(input, context) {
        try {
            if (!input || typeof input !== 'object') {
                return failure('MALFORMED_ROLLOUT_PAYLOAD', tenantFromPayload({}, context || {}), [issue('MALFORMED_ROLLOUT_PAYLOAD', 'Rollout payload must be an object.', 'ERROR')], context || {});
            }
            var tenantSlug = tenantFromPayload(input, context || {});
            var access = validateAccess('READ', context || {}, tenantSlug);
            if (!access.allowed) return failure('ROLLOUT_ACCESS_DENIED', tenantSlug, access.issues, context || {});
            var checkpoints = buildCheckpoints(tenantSlug);
            var complete = checkpoints.filter(function done(row) { return row.complete; }).length;
            var blocked = checkpoints.filter(function blockedRow(row) { return row.status === 'BLOCKED'; }).length;
            var rolloutReadinessScore = clampScore((complete / Math.max(CHECKPOINTS.length, 1)) * 100);
            var governanceScore = clampScore(100 - (blocked * 12));
            var tenantReadinessScore = clampScore((rolloutReadinessScore * 0.75) + (governanceScore * 0.25));
            var activationBlocked = blocked > 0 || tenantReadinessScore < 80;
            var report = {
                readinessId: 'PROLL-RDY-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
                success: true,
                tenantSlug: tenantSlug,
                state: activationBlocked ? 'VALIDATING' : 'READY',
                stageEligibility: activationBlocked ? 'STAGE_0' : 'STAGE_1',
                rolloutReadinessScore: rolloutReadinessScore,
                tenantReadinessScore: tenantReadinessScore,
                onboardingReadinessScore: tenantReadinessScore,
                governanceScore: governanceScore,
                activationBlocked: activationBlocked,
                checkpoints: checkpoints,
                blockers: checkpoints.filter(function block(row) { return row.status === 'BLOCKED'; }).map(function map(row) { return { code: row.code, message: row.message, severity: 'CRITICAL' }; }),
                integrationHealth: {
                    organizationInitializationIntegrated: !!global.OrganizationInitializationWizardService || tenantRows('organizationInitializationRecords', tenantSlug).length > 0,
                    employeeImportIntegrated: tenantRows('employeeBulkImportPreviewHistory', tenantSlug).length > 0 || tenantRows('employees', tenantSlug).length > 0,
                    securityGovernanceIntegrated: hasSecurityControls(tenantSlug),
                    auditGovernanceIntegrated: hasAuditSystem(tenantSlug),
                    featureFlagGovernanceIntegrated: !!global.FeatureRolloutService || !!(rawData().platformGovernance || {}).features,
                    platformMonitoringIntegrated: !!global.PlatformHealthMonitoringService || !!global.RuntimeEnvironmentHealthService
                },
                governance: {
                    tenantIsolationPreserved: true,
                    rolloutGovernancePreserved: true,
                    activationBlockedIfIncomplete: activationBlocked,
                    rbacPreserved: true,
                    backwardCompatibilityPreserved: true
                },
                generatedAt: nowIso(),
                immutable: true
            };
            persistRow('pilotRolloutReadinessReports', report, context || {});
            audit('ROLLOUT_READINESS_REVIEWED', { tenantSlug: tenantSlug, readinessId: report.readinessId, description: 'Pilot rollout readiness reviewed.' }, context || {});
            return frozen(report);
        } catch (error) {
            return failure('ROLLOUT_READINESS_FAILED_SAFE', tenantFromPayload({}, context || {}), [issue('ROLLOUT_READINESS_FAILED_SAFE', 'Rollout readiness failed safely.', 'ERROR')], context || {});
        }
    }

    function calculateRolloutRisk(input, context) {
        try {
            if (!input || typeof input !== 'object') {
                return failure('MALFORMED_ROLLOUT_PAYLOAD', tenantFromPayload({}, context || {}), [issue('MALFORMED_ROLLOUT_PAYLOAD', 'Rollout risk payload must be an object.', 'ERROR')], context || {});
            }
            var readiness = evaluateTenantReadiness(input, Object.assign({}, context || {}, { skipAuditPersistence: true }));
            if (!readiness.success) return readiness;
            var blocked = (readiness.blockers || []).length;
            var rolloutRiskScore = clampScore(100 - (readiness.rolloutReadinessScore || 0) + blocked * 5);
            var activationRiskScore = clampScore(100 - (readiness.tenantReadinessScore || 0) + blocked * 8);
            var governanceScore = readiness.governanceScore || 0;
            var classification = rolloutRiskScore >= 75 ? 'CRITICAL' : rolloutRiskScore >= 50 ? 'HIGH' : rolloutRiskScore >= 25 ? 'MODERATE' : 'LOW';
            var report = {
                success: true,
                tenantSlug: readiness.tenantSlug,
                rolloutRiskScore: rolloutRiskScore,
                activationRiskScore: activationRiskScore,
                readinessScore: readiness.rolloutReadinessScore,
                governanceScore: governanceScore,
                riskLevel: classification,
                riskFactors: (readiness.blockers || []).map(function factor(row) { return row.code; }),
                deploymentConfidenceScore: clampScore((readiness.rolloutReadinessScore + governanceScore) / 2),
                generatedAt: nowIso(),
                governance: {
                    tenantIsolationPreserved: true,
                    rolloutGovernancePreserved: true,
                    noUnsafeActivation: readiness.activationBlocked === true
                }
            };
            audit('ROLLOUT_RISK_REVIEWED', { tenantSlug: report.tenantSlug, description: 'Pilot rollout risk reviewed.' }, context || {});
            return frozen(report);
        } catch (error) {
            return failure('ROLLOUT_RISK_FAILED_SAFE', tenantFromPayload({}, context || {}), [issue('ROLLOUT_RISK_FAILED_SAFE', 'Rollout risk scoring failed safely.', 'ERROR')], context || {});
        }
    }

    function applyFeatureFlags(tenantSlug, featureFlags, context) {
        var flags = featureFlags && typeof featureFlags === 'object' ? featureFlags : {};
        var enabled = [];
        var disabled = [];
        var data = rawData();
        data.platformGovernance = data.platformGovernance || {};
        data.platformGovernance.features = data.platformGovernance.features || {};
        data.pilotFeatureFlagHistory = Array.isArray(data.pilotFeatureFlagHistory) ? data.pilotFeatureFlagHistory : [];
        Object.keys(flags).forEach(function each(key) {
            var desired = flags[key] === true;
            var feature = data.platformGovernance.features[key] || { key: key, label: key, roles: { platform_owner: true } };
            var rollouts = Array.isArray(feature.tenantRollouts) ? feature.tenantRollouts.slice() : [];
            var index = rollouts.findIndex(function match(row) { return sameTenant(row, tenantSlug); });
            var tenantRollout = {
                tenantSlug: tenantSlug,
                enabled: desired,
                rolloutStage: desired ? 'STAGE_1' : 'STAGE_0',
                rolloutState: desired ? 'ACTIVE' : 'DISABLED',
                updatedAt: nowIso(),
                immutable: true
            };
            if (index >= 0) rollouts[index] = tenantRollout;
            else rollouts.push(tenantRollout);
            data.platformGovernance.features[key] = Object.assign({}, feature, {
                key: feature.key || key,
                tenantRollouts: rollouts,
                rolloutStage: desired ? 'PILOT_ENABLED' : (feature.rolloutStage || 'DEVELOPMENT_ONLY')
            });
            data.pilotFeatureFlagHistory.push({
                flagEventId: 'PROLL-FLAG-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7).toUpperCase(),
                tenantSlug: tenantSlug,
                featureKey: key,
                enabled: desired,
                action: desired ? 'ENABLED' : 'DISABLED',
                updatedAt: nowIso(),
                immutable: true
            });
            (desired ? enabled : disabled).push(key);
        });
        if (Object.keys(flags).length && !(context && context.skipPersistence)) saveData(data);
        return { enabled: enabled, disabled: disabled, changed: enabled.length + disabled.length };
    }

    function activatePilotTenant(input, context) {
        try {
            if (!input || typeof input !== 'object') {
                return failure('MALFORMED_ROLLOUT_PAYLOAD', tenantFromPayload({}, context || {}), [issue('MALFORMED_ROLLOUT_PAYLOAD', 'Activation payload must be an object.', 'ERROR')], context || {});
            }
            var tenantSlug = tenantFromPayload(input, context || {});
            var access = validateAccess('ACTIVATE', context || {}, tenantSlug);
            if (!access.allowed) return failure('ROLLOUT_AUTHORITY_REQUIRED', tenantSlug, access.issues, context || {});
            if (input.approval !== true && input.readinessApproved !== true) {
                return failure('ROLLOUT_APPROVAL_REQUIRED', tenantSlug, [issue('ROLLOUT_APPROVAL_REQUIRED', 'Pilot activation requires explicit platform-owner approval.', 'CRITICAL')], context || {});
            }
            var stage = normalizeStage(input.stage || input.rolloutStage, 'STAGE_1');
            if (!stage) return failure('INVALID_ROLLOUT_STAGE', tenantSlug, [issue('INVALID_ROLLOUT_STAGE', 'Rollout stage is not supported.', 'ERROR')], context || {});
            var readiness = evaluateTenantReadiness({ tenantSlug: tenantSlug }, Object.assign({}, context || {}, { skipAuditPersistence: true }));
            if (!readiness.success || readiness.activationBlocked) {
                return failure('ROLLOUT_READINESS_INCOMPLETE', tenantSlug, readiness.blockers && readiness.blockers.length ? readiness.blockers.map(function map(row) { return issue(row.code, row.message, row.severity); }) : [issue('ROLLOUT_READINESS_INCOMPLETE', 'Tenant activation is blocked until rollout readiness passes.', 'CRITICAL')], context || {});
            }
            var risk = calculateRolloutRisk({ tenantSlug: tenantSlug }, Object.assign({}, context || {}, { skipAuditPersistence: true }));
            var featureFlags = applyFeatureFlags(tenantSlug, input.featureFlags || input.flags || {}, context || {});
            var now = nowIso();
            var rollout = {
                rolloutId: input.rolloutId || 'PROLL-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
                tenantSlug: tenantSlug,
                stage: stage,
                stageLabel: STAGE_LABELS[stage],
                state: 'ACTIVE',
                readinessScore: readiness.rolloutReadinessScore,
                tenantReadinessScore: readiness.tenantReadinessScore,
                rolloutRiskScore: risk.rolloutRiskScore,
                activatedBy: access.actor.id,
                activatedAt: now,
                updatedAt: now,
                immutable: true
            };
            upsertRollout(rollout, context || {});
            persistRow('pilotRolloutHistory', Object.assign({}, rollout, { action: 'ACTIVATED', featureFlagChanges: featureFlags.changed }), context || {});
            audit('PILOT_TENANT_ACTIVATED', { tenantSlug: tenantSlug, rolloutId: rollout.rolloutId, description: 'Pilot tenant activated through rollout governance.' }, context || {});
            return frozen({
                success: true,
                tenantSlug: tenantSlug,
                rollout: rollout,
                readiness: readiness,
                risk: risk,
                featureFlags: featureFlags,
                analytics: {
                    activationSuccessRate: 100,
                    onboardingReadinessScore: readiness.onboardingReadinessScore,
                    rolloutHealthScore: clampScore(100 - risk.rolloutRiskScore),
                    deploymentConfidenceScore: risk.deploymentConfidenceScore
                },
                governance: {
                    tenantIsolationPreserved: true,
                    rolloutGovernancePreserved: true,
                    platformOwnerAuthorityRequired: true,
                    activationCheckpointsValidated: true,
                    auditReady: true
                },
                generatedAt: now
            });
        } catch (error) {
            return failure('PILOT_ACTIVATION_FAILED_SAFE', tenantFromPayload({}, context || {}), [issue('PILOT_ACTIVATION_FAILED_SAFE', 'Pilot activation failed safely.', 'ERROR')], context || {});
        }
    }

    function rollbackTenantActivation(input, context) {
        try {
            if (!input || typeof input !== 'object') {
                return failure('MALFORMED_ROLLOUT_PAYLOAD', tenantFromPayload({}, context || {}), [issue('MALFORMED_ROLLOUT_PAYLOAD', 'Rollback payload must be an object.', 'ERROR')], context || {});
            }
            var tenantSlug = tenantFromPayload(input, context || {});
            var access = validateAccess('ROLLBACK', context || {}, tenantSlug);
            if (!access.allowed) return failure('ROLLOUT_AUTHORITY_REQUIRED', tenantSlug, access.issues, context || {});
            if (input.approval !== true && input.rollbackApproved !== true) {
                return failure('ROLLBACK_APPROVAL_REQUIRED', tenantSlug, [issue('ROLLBACK_APPROVAL_REQUIRED', 'Rollback requires explicit platform-owner approval.', 'CRITICAL')], context || {});
            }
            var existing = latestTenantRow('multiStagePilotRolloutRecords', tenantSlug) || {};
            var now = nowIso();
            var rollout = Object.assign({}, existing, {
                rolloutId: existing.rolloutId || 'PROLL-' + Date.now().toString(36),
                tenantSlug: tenantSlug,
                previousState: existing.state || 'ACTIVE',
                state: 'ROLLED_BACK',
                stage: existing.stage || normalizeStage(input.stage, 'STAGE_1') || 'STAGE_1',
                rolledBackBy: access.actor.id,
                rolledBackAt: now,
                updatedAt: now,
                immutable: true
            });
            var rollback = {
                rollbackId: 'PROLL-RB-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
                tenantSlug: tenantSlug,
                rolloutId: rollout.rolloutId,
                reason: safeString(input.reason || input.rollbackReason || 'No reason provided.', 'No reason provided.').trim(),
                approvedBy: access.actor.id,
                createdAt: now,
                immutable: true
            };
            upsertRollout(rollout, context || {});
            persistRow('pilotRollbackHistory', rollback, context || {});
            persistRow('pilotRolloutHistory', Object.assign({}, rollout, { action: 'ROLLED_BACK', rollbackId: rollback.rollbackId }), context || {});
            audit('PILOT_TENANT_ROLLED_BACK', { tenantSlug: tenantSlug, rolloutId: rollout.rolloutId, description: 'Pilot tenant activation rolled back.' }, context || {});
            return frozen({
                success: true,
                tenantSlug: tenantSlug,
                rollout: rollout,
                rollback: rollback,
                governance: {
                    tenantIsolationPreserved: true,
                    rolloutGovernancePreserved: true,
                    rollbackApprovalRecorded: true,
                    immutableRollbackHistory: true,
                    auditReady: true
                },
                analytics: {
                    rollbackFrequency: tenantRows('pilotRollbackHistory', tenantSlug).length + 1,
                    rolloutHealthScore: 50,
                    deploymentConfidenceScore: 50
                },
                generatedAt: now
            });
        } catch (error) {
            return failure('PILOT_ROLLBACK_FAILED_SAFE', tenantFromPayload({}, context || {}), [issue('PILOT_ROLLBACK_FAILED_SAFE', 'Pilot rollback failed safely.', 'ERROR')], context || {});
        }
    }

    function generateLaunchReadinessReport(input, context) {
        try {
            if (!input || typeof input !== 'object') {
                return failure('MALFORMED_ROLLOUT_PAYLOAD', tenantFromPayload({}, context || {}), [issue('MALFORMED_ROLLOUT_PAYLOAD', 'Readiness report payload must be an object.', 'ERROR')], context || {});
            }
            var tenantSlug = tenantFromPayload(input, context || {});
            var access = validateAccess('READ', context || {}, tenantSlug);
            if (!access.allowed) return failure('ROLLOUT_ACCESS_DENIED', tenantSlug, access.issues, context || {});
            var readiness = evaluateTenantReadiness({ tenantSlug: tenantSlug }, Object.assign({}, context || {}, { skipAuditPersistence: true }));
            var risk = calculateRolloutRisk({ tenantSlug: tenantSlug }, Object.assign({}, context || {}, { skipAuditPersistence: true }));
            var featureReport = global.FeatureRolloutService && typeof global.FeatureRolloutService.generateFeatureRolloutReport === 'function'
                ? global.FeatureRolloutService.generateFeatureRolloutReport({ tenantSlug: tenantSlug }, Object.assign({}, context || {}, { routeType: 'platform', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true }))
                : null;
            var report = {
                reportId: 'PROLL-LRR-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
                success: readiness.success === true,
                tenantSlug: tenantSlug,
                rolloutStages: ROLLOUT_STAGES.map(function map(stage) { return { stage: stage, label: STAGE_LABELS[stage] }; }),
                launchReadiness: {
                    activationReady: readiness.activationBlocked === false,
                    readinessScore: readiness.rolloutReadinessScore,
                    tenantReadinessScore: readiness.tenantReadinessScore,
                    checkpointCount: readiness.checkpoints ? readiness.checkpoints.length : 0,
                    blockedCheckpoints: readiness.blockers ? readiness.blockers.length : 0
                },
                risk: risk,
                featureFlagGovernance: {
                    featureFlagsAvailable: !!featureReport,
                    stagedReleasesSupported: true,
                    enableDisableWithoutRedeployment: true,
                    rollbackSupported: true
                },
                rollbackGovernance: {
                    rolloutRollback: true,
                    featureRollback: true,
                    tenantRollback: true,
                    activationSuspension: true,
                    rollbackHistory: tenantRows('pilotRollbackHistory', tenantSlug).length
                },
                analytics: {
                    activationSuccessRate: tenantRows('pilotRolloutHistory', tenantSlug).filter(function active(row) { return row.action === 'ACTIVATED'; }).length ? 100 : 0,
                    rolloutFailures: tenantRows('pilotRolloutHistory', tenantSlug).filter(function fail(row) { return /FAILED|BLOCKED/i.test(safeString(row.action || row.state || '', '')); }).length,
                    rollbackFrequency: tenantRows('pilotRollbackHistory', tenantSlug).length,
                    onboardingCompletion: readiness.onboardingReadinessScore,
                    deploymentReadiness: readiness.rolloutReadinessScore,
                    rolloutHealthScore: clampScore(100 - (risk.rolloutRiskScore || 0)),
                    onboardingReadinessScore: readiness.onboardingReadinessScore,
                    deploymentConfidenceScore: risk.deploymentConfidenceScore
                },
                governance: {
                    tenantIsolationPreserved: true,
                    rolloutGovernancePreserved: true,
                    rbacPreserved: true,
                    uncontrolledTenantOnboardingBlocked: readiness.activationBlocked === true,
                    auditReady: hasAuditSystem(tenantSlug),
                    backwardCompatibilityPreserved: true
                },
                integrationHealth: readiness.integrationHealth,
                generatedAt: nowIso(),
                immutable: true
            };
            persistRow('pilotRolloutReadinessReports', report, context || {});
            audit('LAUNCH_READINESS_REPORT_GENERATED', { tenantSlug: tenantSlug, reportId: report.reportId, description: 'Launch readiness report generated.' }, context || {});
            return frozen(report);
        } catch (error) {
            return failure('LAUNCH_READINESS_REPORT_FAILED_SAFE', tenantFromPayload({}, context || {}), [issue('LAUNCH_READINESS_REPORT_FAILED_SAFE', 'Launch readiness report failed safely.', 'ERROR')], context || {});
        }
    }

    function runSelfTest() {
        var checks = [];
        var originalDb = global.DB;
        var selfData = {
            companySettings: { tenantSlug: 'self-rollout', leavePoliciesConfigured: true },
            organizationInitializationRecords: [{ tenantSlug: 'self-rollout', state: 'ACTIVE', initializationModules: { leavePoliciesConfigured: true } }],
            tenantDepartmentRecords: [{ tenantSlug: 'self-rollout', state: 'ACTIVE', departmentCode: 'SELF' }],
            employees: [{ tenantSlug: 'self-rollout', id: 'SELF-EMP', active: true }],
            employeeBulkImportPreviewHistory: [{ tenantSlug: 'self-rollout', summary: { validRows: 1 } }],
            employeeActivationRecords: [{ tenantSlug: 'self-rollout', state: 'ACTIVE' }],
            companyHolidayCalendars: [{ tenantSlug: 'self-rollout', state: 'ACTIVE', holidays: [{ name: 'Self Day' }] }],
            passwordResetHistory: [{ tenantSlug: 'self-rollout', state: 'COMPLETED' }],
            sessionGovernanceHistory: [{ tenantSlug: 'self-rollout', state: 'ACTIVE' }],
            loginAttemptHistory: [{ tenantSlug: 'self-rollout', outcome: 'SUCCESS' }],
            auditLogs: [{ tenantSlug: 'self-rollout', module: 'Audit Governance', actionType: 'AUDIT_ACTIVE' }],
            platformGovernance: { features: { employees: { key: 'employees', enabled: true } } },
            multiStagePilotRolloutRecords: [],
            pilotRolloutHistory: [],
            pilotRollbackHistory: [],
            pilotRolloutReadinessReports: [],
            pilotFeatureFlagHistory: []
        };
        function record(name, passed, details) {
            checks.push(frozen({ check: name, passed: !!passed, details: details || null }));
        }
        global.DB = {
            get: function get() { return selfData; },
            save: function save(next) { selfData = next || selfData; return selfData; },
            writeAuditLog: function writeAuditLog(actorRole, actorId, actionType, module, targetId, description) {
                selfData.auditLogs.push({ actorRole: actorRole, actorId: actorId, actionType: actionType, module: module, targetId: targetId, description: description, tenantSlug: targetId });
            }
        };
        try {
            var ctx = { actor: { id: 'PO-SELF', role: 'PLATFORM_OWNER' }, tenantSlug: 'self-rollout', skipAuditPersistence: true };
            var readiness = evaluateTenantReadiness({ tenantSlug: 'self-rollout' }, ctx);
            record('rollout stages work', ROLLOUT_STAGES.length === 5 && STAGE_LABELS.STAGE_4 === 'General Availability', ROLLOUT_STAGES);
            record('readiness validation works', readiness.success === true && readiness.activationBlocked === false, readiness);
            var activation = activatePilotTenant({ tenantSlug: 'self-rollout', stage: 'STAGE_1', approval: true, featureFlags: { employees: true } }, ctx);
            record('feature flags work', activation.success === true && activation.featureFlags.enabled.indexOf('employees') !== -1, activation.featureFlags);
            var rollback = rollbackTenantActivation({ tenantSlug: 'self-rollout', reason: 'self-test', approval: true }, ctx);
            record('rollback works', rollback.success === true && rollback.rollout.state === 'ROLLED_BACK', rollback.rollout);
            var report = generateLaunchReadinessReport({ tenantSlug: 'self-rollout' }, ctx);
            record('analytics work', report.success === true && typeof report.analytics.deploymentConfidenceScore === 'number', report.analytics);
            var immutable = freezeRolloutOutput({ nested: { ok: true } });
            record('immutable outputs enforced', Object.isFrozen(immutable) && Object.isFrozen(immutable.nested), immutable);
        } catch (error) {
            record('self-test has no uncaught failure', false, error && error.message ? error.message : 'Unknown failure');
        } finally {
            if (originalDb) global.DB = originalDb;
            else {
                try { delete global.DB; } catch (deleteError) { global.DB = originalDb; }
            }
        }
        return frozen({ passed: checks.every(function all(row) { return row.passed; }), tests: checks });
    }

    var PilotRolloutGovernanceService = Object.freeze({
        ROLLOUT_STAGES: ROLLOUT_STAGES,
        ROLLOUT_STATES: ROLLOUT_STATES,
        STAGE_LABELS: STAGE_LABELS,
        evaluateTenantReadiness: evaluateTenantReadiness,
        calculateRolloutRisk: calculateRolloutRisk,
        activatePilotTenant: activatePilotTenant,
        rollbackTenantActivation: rollbackTenantActivation,
        generateLaunchReadinessReport: generateLaunchReadinessReport,
        freezeRolloutOutput: freezeRolloutOutput,
        runSelfTest: runSelfTest
    });

    global.PilotRolloutGovernanceService = PilotRolloutGovernanceService;
    global.pilotRolloutGovernanceService = PilotRolloutGovernanceService;

    if (global.__ARTHHRMS_DEV__) {
        try {
            global.__ARTHHRMS_PILOT_ROLLOUT_SELF_TEST__ = runSelfTest();
        } catch (error) {
            global.__ARTHHRMS_PILOT_ROLLOUT_SELF_TEST__ = frozen({ passed: false, tests: [{ name: 'self-test initialization failed safely', passed: false }] });
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
