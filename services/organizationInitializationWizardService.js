(function attachOrganizationInitializationWizardService(global) {
    'use strict';

    var ORGANIZATION_STATES = Object.freeze(['DRAFT', 'CONFIGURING', 'VALIDATING', 'READY', 'ACTIVE', 'ARCHIVED']);
    var INITIALIZATION_WORKFLOW = Object.freeze([
        'COMPANY_CREATION',
        'ORGANIZATION_PROFILE',
        'DEPARTMENT_SETUP',
        'HIERARCHY_SETUP',
        'EMPLOYEE_IMPORT',
        'POLICY_CONFIGURATION',
        'VALIDATION_REVIEW',
        'LAUNCH_READINESS',
        'ORGANIZATION_ACTIVATION'
    ]);
    var REQUIRED_PROFILE_FIELDS = Object.freeze(['companyName', 'companyCode', 'legalEntity', 'industry', 'timezone', 'country', 'currency', 'fiscalYear']);
    var ACCESS_ROLES = Object.freeze(['HR', 'DIRECTOR', 'PLATFORM_OWNER']);
    var SENSITIVE_KEYS = /salary|payroll|compensation|leave\s*balance|leaveBalance|password|secret|token|bank|account|aadhaar|\bpan\b|panNumber|taxPan|ssn|private|medical|document|activationUrl/i;

    function db() { return global.DB || null; }

    function rawData() {
        try {
            return db() && typeof db().get === 'function' ? db().get() : {};
        } catch (error) {
            return {};
        }
    }

    function saveData(data) {
        try {
            if (db() && typeof db().save === 'function') {
                db().save(data);
                return true;
            }
        } catch (error) {}
        return false;
    }

    function nowIso() { return new Date().toISOString(); }

    function normalizeText(value) {
        return String(value == null ? '' : value).trim();
    }

    function normalizeTenantSlug(value) {
        return normalizeText(value)
            .toLowerCase()
            .replace(/^ten[-_]/, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
    }

    function normalizeRole(value) {
        var role = normalizeText(value || 'EMPLOYEE').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
        if (role === 'SUPERADMIN') role = 'SUPER_ADMIN';
        if (role === 'PLATFORMOWNER' || role === 'ROOT') role = 'PLATFORM_OWNER';
        if (role === 'HRHEAD') role = 'HR_HEAD';
        return role || 'EMPLOYEE';
    }

    function normalizeCode(value) {
        return normalizeText(value).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    }

    function clampScore(value) {
        var number = Number(value);
        if (!Number.isFinite(number)) return 0;
        return Math.max(0, Math.min(100, Math.round(number)));
    }

    function freezeInitializationOutput(value) {
        if (Array.isArray(value)) return Object.freeze(value.map(freezeInitializationOutput));
        if (value && typeof value === 'object') {
            var clone = {};
            Object.keys(value).forEach(function each(key) {
                clone[key] = freezeInitializationOutput(value[key]);
            });
            return Object.freeze(clone);
        }
        return value;
    }

    function cloneSanitized(value, keyHint) {
        if (Array.isArray(value)) return value.map(function each(item) { return cloneSanitized(item, keyHint); });
        if (value && typeof value === 'object') {
            var clone = {};
            Object.keys(value).forEach(function each(key) {
                if (SENSITIVE_KEYS.test(key)) return;
                clone[key] = cloneSanitized(value[key], key);
            });
            return clone;
        }
        if (SENSITIVE_KEYS.test(String(keyHint || ''))) return undefined;
        return value;
    }

    function issue(code, message, severity, metadata) {
        return freezeInitializationOutput({
            code: code,
            message: message,
            severity: severity || 'WARNING',
            metadata: cloneSanitized(metadata || {})
        });
    }

    function actorFromContext(context) {
        var actor = context && context.actor ? context.actor : {};
        return {
            id: normalizeText(actor.id || actor.userId || actor.empId || actor.employeeId || ''),
            empId: normalizeText(actor.empId || actor.employeeId || actor.id || ''),
            role: normalizeRole(actor.role || context?.role || 'EMPLOYEE'),
            tenantSlug: normalizeTenantSlug(actor.tenantSlug || actor.tenantId || context?.tenantSlug || ''),
            name: normalizeText(actor.name || actor.email || actor.id || '')
        };
    }

    function tenantFromContext(context) {
        var actor = context && context.actor ? context.actor : {};
        var data = rawData();
        return normalizeTenantSlug(
            context?.tenantSlug ||
            context?.tenantId ||
            context?.companyId ||
            actor.tenantSlug ||
            actor.tenantId ||
            actor.companyId ||
            data.companySettings?.tenantSlug ||
            data.companySettings?.tenantId ||
            'default'
        );
    }

    function recordTenant(row) {
        return normalizeTenantSlug(row?.tenantSlug || row?.tenantId || row?.companyId || row?.organizationId || '');
    }

    function sameTenant(row, tenantSlug) {
        var scope = recordTenant(row);
        if (scope) return scope === normalizeTenantSlug(tenantSlug);
        var settings = rawData().companySettings || {};
        var defaultTenant = normalizeTenantSlug(settings.tenantSlug || settings.tenantId || settings.companyId || 'default');
        return normalizeTenantSlug(tenantSlug) === defaultTenant;
    }

    function arrayFor(key) {
        var data = rawData();
        return Array.isArray(data[key]) ? data[key] : [];
    }

    function tenantRows(key, tenantSlug) {
        return arrayFor(key).filter(function filter(row) { return sameTenant(row, tenantSlug); });
    }

    function profileFromInput(input, tenantSlug) {
        var source = input && typeof input === 'object' ? input : {};
        var nested = source.companyProfile || source.company_profile || source.profile || {};
        var settings = rawData().companySettings || {};
        return {
            companyName: normalizeText(nested.companyName || nested.company_name || source.companyName || settings.companyName || ''),
            companyCode: normalizeCode(nested.companyCode || nested.company_code || source.companyCode || settings.companyCode || tenantSlug),
            legalEntity: normalizeText(nested.legalEntity || nested.legal_entity || source.legalEntity || ''),
            industry: normalizeText(nested.industry || source.industry || ''),
            timezone: normalizeText(nested.timezone || source.timezone || settings.timezone || ''),
            country: normalizeText(nested.country || source.country || settings.country || ''),
            currency: normalizeText(nested.currency || nested.default_currency || source.currency || settings.currency || ''),
            fiscalYear: normalizeText(nested.fiscalYear || nested.fiscal_year || source.fiscalYear || settings.fiscalYear || '')
        };
    }

    function platformProfile(profile) {
        return {
            companyName: 'Governance Organization',
            companyCode: profile.companyCode ? 'GOV-' + profile.companyCode.slice(0, 4) : 'GOV',
            legalEntity: '',
            industry: profile.industry || '',
            timezone: profile.timezone || '',
            country: profile.country || '',
            currency: profile.currency || '',
            fiscalYear: profile.fiscalYear || ''
        };
    }

    function modulesFromInput(input) {
        var source = input && typeof input === 'object' ? input : {};
        var modules = source.initializationModules || source.modules || {};
        return {
            roles: Array.isArray(modules.roles || source.roles) ? (modules.roles || source.roles).map(normalizeRole).filter(Boolean) : [],
            permissionsConfigured: modules.permissionsConfigured === true || modules.permissions === true || source.permissionsConfigured === true,
            leavePoliciesConfigured: modules.leavePoliciesConfigured === true || modules.leavePolicies === true || source.leavePoliciesConfigured === true,
            attendanceSettingsConfigured: modules.attendanceSettingsConfigured === true || modules.attendanceSettings === true || source.attendanceSettingsConfigured === true,
            companySettingsConfigured: modules.companySettingsConfigured === true || modules.companySettings === true || source.companySettingsConfigured === true
        };
    }

    function latestInitializationRecord(tenantSlug) {
        return tenantRows('organizationInitializationRecords', tenantSlug)
            .sort(function sort(a, b) { return String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')); })[0] || null;
    }

    function normalizePayload(input, context) {
        var source = input && typeof input === 'object' ? input : {};
        var tenantSlug = normalizeTenantSlug(source.tenantSlug || source.tenantId || tenantFromContext(context || {}));
        var existing = latestInitializationRecord(tenantSlug) || {};
        var hasSetupFields = !!(
            source.companyProfile ||
            source.company_profile ||
            source.initializationModules ||
            source.modules ||
            source.roles ||
            source.companyName ||
            source.companyCode ||
            source.legalEntity ||
            source.industry ||
            source.timezone ||
            source.country ||
            source.currency ||
            source.fiscalYear
        );
        var setupSource = hasSetupFields ? source : existing;
        return freezeInitializationOutput({
            tenantSlug: tenantSlug,
            organizationId: normalizeText(source.organizationId || source.initializationId || existing.organizationId || existing.initializationId || ''),
            companyProfile: profileFromInput(setupSource, tenantSlug),
            initializationModules: modulesFromInput(setupSource),
            readinessApproved: source.readinessApproved === true || source.validationApproved === true,
            sourceProvided: Object.keys(source).filter(function meaningful(key) { return !/^tenant(Slug|Id)$/.test(key); }).length > 0
        });
    }

    function validateAccess(operation, context, tenantSlug) {
        var actor = actorFromContext(context || {});
        var actorTenant = normalizeTenantSlug(context?.tenantSlug || context?.actor?.tenantSlug || tenantSlug);
        if (!ACCESS_ROLES.includes(actor.role)) {
            return { allowed: false, actor: actor, issues: [issue('ORGANIZATION_INITIALIZATION_ACCESS_DENIED', 'Role cannot access organization initialization.', 'ERROR', { role: actor.role })] };
        }
        if (actor.role === 'PLATFORM_OWNER' && !context?.governanceOnly && operation !== 'VIEW') {
            return { allowed: false, actor: actor, issues: [issue('PLATFORM_OWNER_INITIALIZATION_VISIBILITY_ONLY', 'Platform Owner visibility is governance-only and cannot mutate tenant initialization.', 'ERROR')] };
        }
        if (actorTenant && normalizeTenantSlug(tenantSlug) !== actorTenant && actor.role !== 'PLATFORM_OWNER') {
            return { allowed: false, actor: actor, issues: [issue('CROSS_TENANT_INITIALIZATION_BLOCKED', 'Cross-tenant organization initialization is blocked.', 'CRITICAL', { actorTenant: actorTenant, tenantSlug: tenantSlug })] };
        }
        if (operation === 'INITIALIZE' && actor.role !== 'HR') {
            return { allowed: false, actor: actor, issues: [issue('ORGANIZATION_INITIALIZATION_ACCESS_DENIED', 'Only HR may manage organization initialization.', 'ERROR', { role: actor.role })] };
        }
        if (operation === 'ACTIVATE' && actor.role !== 'DIRECTOR') {
            return { allowed: false, actor: actor, issues: [issue('ORGANIZATION_ACTIVATION_DENIED', 'Only Director approval may activate an initialized organization.', 'ERROR', { role: actor.role })] };
        }
        return { allowed: true, actor: actor, issues: [] };
    }

    function failureOutput(state, tenantSlug, issues) {
        return freezeInitializationOutput({
            success: false,
            state: state || 'BLOCKED',
            tenantSlug: normalizeTenantSlug(tenantSlug),
            issues: issues && issues.length ? issues : [issue('ORGANIZATION_INITIALIZATION_FAILED_SAFE', 'Organization initialization failed safely.', 'ERROR')],
            checklist: [],
            governance: {
                tenantIsolationPreserved: true,
                organizationGovernancePreserved: true,
                rbacPreserved: true,
                activationValidationRequired: true
            }
        });
    }

    function profileIssues(profile) {
        return REQUIRED_PROFILE_FIELDS
            .filter(function required(field) { return !normalizeText(profile[field]); })
            .map(function toIssue(field) {
                return issue('REQUIRED_COMPANY_PROFILE_MISSING', field + ' is required before organization launch.', 'ERROR', { field: field });
            });
    }

    function departmentEvidence(input, tenantSlug, context) {
        if (Array.isArray(input?.departments)) {
            var count = input.departments.length;
            return { status: count ? 'COMPLETE' : 'BLOCKED', score: count ? 80 : 0, count: count, issues: count ? [] : [issue('DEPARTMENT_SETUP_INCOMPLETE', 'Department setup must be completed before activation.', 'ERROR')] };
        }
        var svc = global.TenantDepartmentSetupService || global.tenantDepartmentSetupService;
        if (svc && typeof svc.calculateStructureReadiness === 'function') {
            var report = svc.calculateStructureReadiness({ tenantSlug: tenantSlug }, { actor: { id: 'INIT-READ', role: 'DIRECTOR' }, tenantSlug: tenantSlug, skipPersistence: true, skipAuditPersistence: true });
            var blocked = report.success === false || (report.issues || []).some(function blocker(item) { return item.severity === 'CRITICAL' || item.severity === 'ERROR'; }) || !(report.analytics?.departmentCount > 0);
            return { status: blocked ? 'BLOCKED' : 'COMPLETE', score: report.structureReadinessScore || 0, count: report.analytics?.departmentCount || 0, issues: blocked ? (report.issues && report.issues.length ? report.issues : [issue('DEPARTMENT_SETUP_INCOMPLETE', 'Department setup must be completed before activation.', 'ERROR')]) : [] };
        }
        var rows = tenantRows('tenantDepartmentRecords', tenantSlug);
        return { status: rows.length ? 'COMPLETE' : 'BLOCKED', score: rows.length ? 75 : 0, count: rows.length, issues: rows.length ? [] : [issue('DEPARTMENT_SETUP_INCOMPLETE', 'Department setup evidence is missing.', 'ERROR')] };
    }

    function hierarchyEvidence(input, tenantSlug) {
        var svc = global.ManagerHierarchyService || global.managerHierarchyService;
        if (svc && typeof svc.calculateHierarchyHealth === 'function') {
            var report = svc.calculateHierarchyHealth({ tenantSlug: tenantSlug }, { actor: { id: 'INIT-READ', role: 'HR' }, tenantSlug: tenantSlug, skipPersistence: true, skipAuditPersistence: true });
            var blocked = report.success === false || (report.issues || []).some(function blocker(item) { return item.severity === 'CRITICAL' || item.severity === 'ERROR'; }) || !(report.analytics?.employeeCount > 0);
            return { status: blocked ? 'BLOCKED' : 'COMPLETE', score: report.organizationalHealthScore || 0, count: report.analytics?.employeeCount || 0, issues: blocked ? (report.issues && report.issues.length ? report.issues : [issue('HIERARCHY_SETUP_INCOMPLETE', 'Hierarchy setup must be valid before activation.', 'ERROR')]) : [] };
        }
        var employees = tenantRows('employees', tenantSlug);
        return { status: employees.length ? 'COMPLETE' : 'BLOCKED', score: employees.length ? 75 : 0, count: employees.length, issues: employees.length ? [] : [issue('HIERARCHY_SETUP_INCOMPLETE', 'Hierarchy evidence is missing.', 'ERROR')] };
    }

    function employeeImportEvidence(tenantSlug) {
        var previews = tenantRows('employeeBulkImportPreviewHistory', tenantSlug);
        var latest = previews[0] || {};
        var summary = latest.summary || {};
        var ok = Number(summary.validRows || 0) > 0 && Number(summary.invalidRows || 0) === 0;
        return { status: ok ? 'COMPLETE' : 'BLOCKED', score: ok ? 90 : 0, count: Number(summary.validRows || 0), issues: ok ? [] : [issue('EMPLOYEE_IMPORT_INCOMPLETE', 'Employee import preview evidence is required before launch.', 'ERROR')] };
    }

    function validationEvidence(tenantSlug) {
        var quality = tenantRows('importQualityReports', tenantSlug)[0] || {};
        var readiness = tenantRows('onboardingReadinessReports', tenantSlug)[0] || {};
        var qualityScore = Number(quality.quality?.qualityScore || quality.qualityScore || 0);
        var onboardingScore = Number(readiness.onboardingReadiness?.onboardingReadinessScore || readiness.onboardingReadinessScore || 0);
        var ok = qualityScore >= 75 && onboardingScore >= 75 && readiness.onboardingReadiness?.onboardingBlocked !== true;
        return { status: ok ? 'COMPLETE' : 'BLOCKED', score: ok ? Math.round((qualityScore + onboardingScore) / 2) : 0, count: ok ? 1 : 0, issues: ok ? [] : [issue('VALIDATION_REVIEW_INCOMPLETE', 'Import validation and onboarding readiness reports are required before launch.', 'ERROR')] };
    }

    function invitationEvidence(tenantSlug) {
        var invitations = tenantRows('employeeInvitationRecords', tenantSlug);
        var deliveryLogs = tenantRows('invitationDeliveryLogs', tenantSlug);
        var delivered = invitations.filter(function deliveredRow(row) { return /SENT|DELIVERED|OPENED|ACTIVATED|COMPLETED/i.test(String(row.state || row.status || '')); }).length;
        var ok = delivered > 0 || deliveryLogs.some(function log(row) { return /SENT|DELIVERED|BULK_CREATED/i.test(String(row.state || row.status || '')); });
        return { status: ok ? 'COMPLETE' : 'BLOCKED', score: ok ? 85 : 0, count: delivered || deliveryLogs.length, issues: ok ? [] : [issue('INVITATION_WORKFLOW_INCOMPLETE', 'Invitation delivery evidence is required before launch.', 'ERROR')] };
    }

    function activationEvidence(tenantSlug) {
        var activations = tenantRows('employeeActivationRecords', tenantSlug);
        var active = activations.filter(function activeRow(row) { return /ACTIVE|ONBOARDING_COMPLETED|PROFILE_COMPLETED/i.test(String(row.state || row.activationStatus || '')); }).length;
        var ok = active > 0;
        return { status: ok ? 'COMPLETE' : 'BLOCKED', score: ok ? 85 : 0, count: active, issues: ok ? [] : [issue('ACTIVATION_WORKFLOW_INCOMPLETE', 'Activation or onboarding completion evidence is required before launch.', 'ERROR')] };
    }

    function moduleEvidence(payload, tenantSlug, context) {
        var modules = payload.initializationModules || {};
        var roleOk = modules.roles && modules.roles.length >= 3 && !modules.roles.includes('PLATFORM_OWNER');
        return {
            companyProfile: {
                status: profileIssues(payload.companyProfile).length ? 'BLOCKED' : 'COMPLETE',
                score: profileIssues(payload.companyProfile).length ? 0 : 100,
                issues: profileIssues(payload.companyProfile)
            },
            departments: departmentEvidence(payload.sourceProvided ? payload : {}, tenantSlug, context),
            hierarchy: hierarchyEvidence(payload.sourceProvided ? payload : {}, tenantSlug),
            employees: employeeImportEvidence(tenantSlug),
            validation: validationEvidence(tenantSlug),
            invitations: invitationEvidence(tenantSlug),
            activation: activationEvidence(tenantSlug),
            roles: {
                status: roleOk ? 'COMPLETE' : 'BLOCKED',
                score: roleOk ? 90 : 0,
                count: modules.roles ? modules.roles.length : 0,
                issues: roleOk ? [] : [issue('ROLE_CONFIGURATION_INCOMPLETE', 'Role configuration must include tenant business roles and exclude PLATFORM_OWNER.', 'ERROR')]
            },
            permissions: {
                status: modules.permissionsConfigured ? 'COMPLETE' : 'BLOCKED',
                score: modules.permissionsConfigured ? 90 : 0,
                issues: modules.permissionsConfigured ? [] : [issue('PERMISSION_CONFIGURATION_INCOMPLETE', 'Permissions must be configured before launch.', 'ERROR')]
            },
            policies: {
                status: modules.leavePoliciesConfigured ? 'COMPLETE' : 'BLOCKED',
                score: modules.leavePoliciesConfigured ? 85 : 0,
                issues: modules.leavePoliciesConfigured ? [] : [issue('POLICY_CONFIGURATION_INCOMPLETE', 'Leave policy configuration is required before launch.', 'ERROR')]
            },
            attendanceSettings: {
                status: modules.attendanceSettingsConfigured ? 'COMPLETE' : 'BLOCKED',
                score: modules.attendanceSettingsConfigured ? 85 : 0,
                issues: modules.attendanceSettingsConfigured ? [] : [issue('ATTENDANCE_CONFIGURATION_INCOMPLETE', 'Attendance settings are required before launch.', 'ERROR')]
            },
            companySettings: {
                status: modules.companySettingsConfigured ? 'COMPLETE' : 'BLOCKED',
                score: modules.companySettingsConfigured ? 85 : 0,
                issues: modules.companySettingsConfigured ? [] : [issue('COMPANY_SETTINGS_INCOMPLETE', 'Company settings must be configured before launch.', 'ERROR')]
            }
        };
    }

    function integrationHealth() {
        return freezeInitializationOutput({
            employeeImportIntegrated: !!(global.EmployeeBulkImportService && typeof global.EmployeeBulkImportService.generateImportPreview === 'function'),
            excelValidationIntegrated: !!(global.ExcelValidationService && typeof global.ExcelValidationService.generateValidationReport === 'function'),
            inviteSystemIntegrated: !!(global.InviteMailDeliveryService && typeof global.InviteMailDeliveryService.calculateInvitationReadiness === 'function'),
            activationWizardIntegrated: !!(global.EmployeeActivationWizardService && typeof global.EmployeeActivationWizardService.calculateOnboardingReadiness === 'function'),
            hierarchyVisualizerIntegrated: !!(global.ManagerHierarchyService && typeof global.ManagerHierarchyService.calculateHierarchyHealth === 'function'),
            departmentSetupIntegrated: !!(global.TenantDepartmentSetupService && typeof global.TenantDepartmentSetupService.calculateStructureReadiness === 'function'),
            auditIntegrated: !!(global.AuditService && typeof global.AuditService.recordAudit === 'function'),
            tenantIsolationIntegrated: !!(global.TenantIsolationService || global.tenantIsolationService)
        });
    }

    function checklistFromEvidence(evidence) {
        var rows = [
            ['COMPANY_CREATION', evidence.companyProfile],
            ['ORGANIZATION_PROFILE', evidence.companyProfile],
            ['DEPARTMENT_SETUP', evidence.departments],
            ['HIERARCHY_SETUP', evidence.hierarchy],
            ['EMPLOYEE_IMPORT', evidence.employees],
            ['POLICY_CONFIGURATION', evidence.policies],
            ['VALIDATION_REVIEW', evidence.validation],
            ['LAUNCH_READINESS', { status: 'PENDING', score: 0, issues: [] }],
            ['ORGANIZATION_ACTIVATION', { status: 'LOCKED', score: 0, issues: [] }]
        ];
        return rows.map(function map(row, index) {
            return {
                step: row[0],
                order: index + 1,
                status: row[1].status,
                score: clampScore(row[1].score || 0),
                issueCount: (row[1].issues || []).length,
                count: row[1].count || 0
            };
        });
    }

    function collectIssues(evidence) {
        return Object.keys(evidence).reduce(function collect(acc, key) {
            return acc.concat(evidence[key].issues || []);
        }, []);
    }

    function scoreFromEvidence(evidence) {
        var keys = ['companyProfile', 'departments', 'hierarchy', 'employees', 'validation', 'invitations', 'activation', 'roles', 'permissions', 'policies', 'attendanceSettings', 'companySettings'];
        var scores = keys.map(function score(key) { return Number(evidence[key]?.score || 0); });
        var readinessScore = clampScore(scores.reduce(function sum(a, b) { return a + b; }, 0) / Math.max(1, scores.length));
        var onboardingScore = clampScore((evidence.employees.score + evidence.validation.score + evidence.invitations.score + evidence.activation.score) / 4);
        var governanceScore = clampScore((evidence.departments.score + evidence.hierarchy.score + evidence.roles.score + evidence.permissions.score + evidence.policies.score + evidence.companySettings.score) / 6);
        var activationScore = clampScore((readinessScore + onboardingScore + governanceScore) / 3);
        return {
            readinessScore: readinessScore,
            launchReadinessScore: readinessScore,
            onboardingScore: onboardingScore,
            governanceScore: governanceScore,
            activationScore: activationScore
        };
    }

    function persistHistory(key, row, context) {
        try {
            if (context?.skipPersistence) return false;
            var data = rawData();
            if (!Array.isArray(data[key])) data[key] = [];
            data[key].unshift(cloneSanitized({ ...row, immutable: true }));
            data[key] = data[key].slice(0, 500);
            return saveData(data);
        } catch (error) {
            return false;
        }
    }

    function upsertInitializationRecord(record, context) {
        if (context?.dryRun || context?.skipPersistence) return record;
        var data = rawData();
        if (!Array.isArray(data.organizationInitializationRecords)) data.organizationInitializationRecords = [];
        var index = data.organizationInitializationRecords.findIndex(function match(row) { return normalizeTenantSlug(row.tenantSlug) === normalizeTenantSlug(record.tenantSlug); });
        if (index >= 0) data.organizationInitializationRecords[index] = cloneSanitized({ ...data.organizationInitializationRecords[index], ...record, updatedAt: nowIso() });
        else data.organizationInitializationRecords.unshift(cloneSanitized(record));
        saveData(data);
        return index >= 0 ? data.organizationInitializationRecords[index] : record;
    }

    function audit(actionType, metadata, context) {
        try {
            if (context?.skipAuditPersistence) return false;
            var actor = actorFromContext(context || {});
            var clean = cloneSanitized(metadata || {});
            if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                global.AuditService.recordAudit({
                    eventId: clean.initializationId || clean.readinessId || clean.activationId || '',
                    actionType: actionType,
                    actorRole: actor.role,
                    actorId: actor.id || actor.empId,
                    module: 'Organization Initialization',
                    targetId: clean.tenantSlug || clean.initializationId || '',
                    description: clean.description || actionType,
                    metadata: clean,
                    severity: clean.severity || 'INFO'
                }, context || {});
                return true;
            }
            if (db() && typeof db().writeAuditLog === 'function') {
                db().writeAuditLog(actor.role, actor.id || actor.empId, actionType, 'Organization Initialization', clean.tenantSlug || '', clean.description || actionType);
                return true;
            }
        } catch (error) {
            return false;
        }
        return false;
    }

    function generateInitializationChecklist(input, context) {
        try {
            var payload = normalizePayload(input, context || {});
            var tenantSlug = payload.tenantSlug || tenantFromContext(context || {});
            var access = validateAccess('VIEW', context || {}, tenantSlug);
            if (!access.allowed) return failureOutput('ACCESS_BLOCKED', tenantSlug, access.issues);
            var evidence = moduleEvidence(payload, tenantSlug, context || {});
            var scores = scoreFromEvidence(evidence);
            var issues = collectIssues(evidence);
            var platformView = access.actor.role === 'PLATFORM_OWNER' || context?.governanceOnly === true;
            var output = {
                checklistId: 'OIC-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
                success: true,
                state: issues.length ? 'CONFIGURING' : 'READY',
                tenantSlug: tenantSlug,
                companyProfile: platformView ? platformProfile(payload.companyProfile) : payload.companyProfile,
                checklist: checklistFromEvidence(evidence),
                evidence: evidence,
                issues: issues,
                readinessScore: scores.readinessScore,
                launchReadinessScore: scores.launchReadinessScore,
                onboardingScore: scores.onboardingScore,
                governanceScore: scores.governanceScore,
                activationScore: scores.activationScore,
                integrationHealth: integrationHealth(),
                governance: {
                    tenantIsolationPreserved: true,
                    organizationGovernancePreserved: true,
                    rbacPreserved: true,
                    platformOwnerVisibilityOnly: platformView
                },
                readOnly: true,
                generatedAt: nowIso()
            };
            audit('ORGANIZATION_INITIALIZATION_CHECKLIST_REVIEWED', { tenantSlug: tenantSlug, description: 'Organization initialization checklist reviewed.' }, context || {});
            return freezeInitializationOutput(output);
        } catch (error) {
            return failureOutput('FAILED_SAFE', tenantFromContext(context || {}), [issue('ORGANIZATION_CHECKLIST_FAILED_SAFE', 'Initialization checklist failed safely.', 'ERROR')]);
        }
    }

    function calculateReadinessScore(input, context) {
        try {
            var checklist = generateInitializationChecklist(input, { ...(context || {}), skipAuditPersistence: true });
            if (!checklist.success) return checklist;
            var report = {
                readinessId: 'ORS-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
                success: true,
                state: checklist.issues.length ? 'VALIDATING' : 'READY',
                tenantSlug: checklist.tenantSlug,
                readinessScore: checklist.readinessScore,
                launchReadinessScore: checklist.launchReadinessScore,
                onboardingScore: checklist.onboardingScore,
                governanceScore: checklist.governanceScore,
                activationScore: checklist.activationScore,
                issues: checklist.issues,
                analytics: {
                    setupCompletion: checklist.checklist.filter(function complete(row) { return row.status === 'COMPLETE'; }).length,
                    totalSteps: checklist.checklist.length,
                    validationFailures: checklist.issues.length,
                    configurationCoverage: checklist.launchReadinessScore
                },
                governance: checklist.governance,
                integrationHealth: checklist.integrationHealth,
                generatedAt: nowIso()
            };
            persistHistory('organizationReadinessReports', report, context || {});
            audit('ORGANIZATION_READINESS_SCORE_REVIEWED', { readinessId: report.readinessId, tenantSlug: report.tenantSlug, description: 'Organization readiness score reviewed.' }, context || {});
            return freezeInitializationOutput(report);
        } catch (error) {
            return failureOutput('FAILED_SAFE', tenantFromContext(context || {}), [issue('ORGANIZATION_READINESS_SCORE_FAILED_SAFE', 'Readiness scoring failed safely.', 'ERROR')]);
        }
    }

    function validateLaunchReadiness(input, context) {
        try {
            var score = calculateReadinessScore(input, { ...(context || {}), skipAuditPersistence: true });
            if (!score.success) return score;
            var activationReady = score.issues.length === 0 && score.launchReadinessScore >= 80 && score.governanceScore >= 80 && score.activationScore >= 80;
            var report = {
                readinessId: 'OLR-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
                success: activationReady,
                state: activationReady ? 'READY' : 'VALIDATING',
                tenantSlug: score.tenantSlug,
                activationReady: activationReady,
                readinessScore: score.readinessScore,
                launchReadinessScore: score.launchReadinessScore,
                onboardingScore: score.onboardingScore,
                governanceScore: score.governanceScore,
                activationScore: score.activationScore,
                issues: score.issues,
                integrationSummary: {
                    integrationsValidated: Object.keys(score.integrationHealth || {}).every(function ok(key) { return score.integrationHealth[key] === true; }),
                    integrationHealth: score.integrationHealth
                },
                governance: {
                    tenantIsolationPreserved: true,
                    organizationGovernancePreserved: true,
                    activationBlockedIfIncomplete: !activationReady,
                    rbacPreserved: true
                },
                generatedAt: nowIso()
            };
            persistHistory('organizationReadinessReports', report, context || {});
            audit('LAUNCH_READINESS_VALIDATED', { readinessId: report.readinessId, tenantSlug: report.tenantSlug, description: 'Organization launch readiness validated.' }, context || {});
            return freezeInitializationOutput(report);
        } catch (error) {
            return failureOutput('FAILED_SAFE', tenantFromContext(context || {}), [issue('LAUNCH_READINESS_FAILED_SAFE', 'Launch readiness validation failed safely.', 'ERROR')]);
        }
    }

    function initializeOrganization(input, context) {
        try {
            var payload = normalizePayload(input, context || {});
            var tenantSlug = payload.tenantSlug || tenantFromContext(context || {});
            var access = validateAccess('INITIALIZE', context || {}, tenantSlug);
            if (!access.allowed) return failureOutput('ACCESS_BLOCKED', tenantSlug, access.issues);
            var profileProblems = profileIssues(payload.companyProfile);
            if (profileProblems.length) return failureOutput('VALIDATION_BLOCKED', tenantSlug, profileProblems);
            var now = nowIso();
            var record = {
                initializationId: payload.organizationId || 'OINIT-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
                tenantSlug: tenantSlug,
                state: 'CONFIGURING',
                companyProfile: payload.companyProfile,
                initializationModules: payload.initializationModules,
                workflow: INITIALIZATION_WORKFLOW,
                createdBy: access.actor.id || access.actor.empId,
                createdAt: latestInitializationRecord(tenantSlug)?.createdAt || now,
                updatedAt: now,
                immutable: true
            };
            var persisted = upsertInitializationRecord(record, context || {});
            persistHistory('organizationInitializationHistory', {
                eventId: record.initializationId,
                tenantSlug: tenantSlug,
                action: 'INITIALIZED',
                state: 'CONFIGURING',
                createdAt: now
            }, context || {});
            audit('ORGANIZATION_INITIALIZATION_STARTED', { initializationId: record.initializationId, tenantSlug: tenantSlug, description: 'Organization initialization wizard started.' }, context || {});
            return freezeInitializationOutput({
                success: true,
                state: 'CONFIGURING',
                tenantSlug: tenantSlug,
                organization: cloneSanitized(persisted),
                checklist: generateInitializationChecklist({ tenantSlug: tenantSlug }, { ...(context || {}), skipAuditPersistence: true }).checklist || [],
                governance: {
                    tenantIsolationPreserved: true,
                    organizationGovernancePreserved: true,
                    activationValidationRequired: true,
                    rbacPreserved: true
                },
                integrationHealth: integrationHealth(),
                issues: []
            });
        } catch (error) {
            return failureOutput('FAILED_SAFE', tenantFromContext(context || {}), [issue('ORGANIZATION_INITIALIZATION_FAILED_SAFE', 'Organization initialization failed safely.', 'ERROR')]);
        }
    }

    function activateOrganization(input, context) {
        try {
            var payload = normalizePayload(input, context || {});
            var tenantSlug = payload.tenantSlug || tenantFromContext(context || {});
            var access = validateAccess('ACTIVATE', context || {}, tenantSlug);
            if (!access.allowed) return failureOutput('ACCESS_BLOCKED', tenantSlug, access.issues);
            if (!payload.readinessApproved) return failureOutput('VALIDATION_BLOCKED', tenantSlug, [issue('READINESS_APPROVAL_REQUIRED', 'Director activation requires explicit readiness approval.', 'CRITICAL')]);
            var readiness = validateLaunchReadiness({ tenantSlug: tenantSlug }, { ...(context || {}), skipAuditPersistence: true });
            if (!readiness.success || !readiness.activationReady) return failureOutput('VALIDATION_BLOCKED', tenantSlug, readiness.issues && readiness.issues.length ? readiness.issues : [issue('LAUNCH_READINESS_INCOMPLETE', 'Organization cannot activate before readiness validation passes.', 'CRITICAL')]);
            var existing = latestInitializationRecord(tenantSlug) || {};
            var now = nowIso();
            var activated = {
                ...existing,
                initializationId: existing.initializationId || 'OINIT-' + Date.now().toString(36),
                tenantSlug: tenantSlug,
                state: 'ACTIVE',
                activatedAt: now,
                updatedAt: now,
                immutable: true
            };
            upsertInitializationRecord(activated, context || {});
            var activation = {
                activationId: 'OACT-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
                tenantSlug: tenantSlug,
                state: 'ACTIVE',
                readinessScore: readiness.launchReadinessScore,
                governanceScore: readiness.governanceScore,
                activationScore: readiness.activationScore,
                activatedBy: access.actor.id || access.actor.empId,
                activatedAt: now
            };
            persistHistory('organizationActivationHistory', activation, context || {});
            persistHistory('organizationInitializationHistory', { ...activation, action: 'ACTIVATED' }, context || {});
            audit('ORGANIZATION_ACTIVATED', { activationId: activation.activationId, tenantSlug: tenantSlug, description: 'Organization activated after readiness validation.' }, context || {});
            return freezeInitializationOutput({
                success: true,
                state: 'ACTIVE',
                tenantSlug: tenantSlug,
                organization: cloneSanitized(activated),
                activation: activation,
                activationReadiness: readiness,
                issues: [],
                governance: {
                    tenantIsolationPreserved: true,
                    organizationGovernancePreserved: true,
                    directorApprovalRequired: true,
                    activationValidationCompleted: true
                }
            });
        } catch (error) {
            return failureOutput('FAILED_SAFE', tenantFromContext(context || {}), [issue('ORGANIZATION_ACTIVATION_FAILED_SAFE', 'Organization activation failed safely.', 'ERROR')]);
        }
    }

    function runSelfTest() {
        try {
            var context = { actor: { id: 'SELF-HR', role: 'HR' }, tenantSlug: 'self-test', skipPersistence: true, skipAuditPersistence: true };
            var payload = {
                tenantSlug: 'self-test',
                companyProfile: {
                    companyName: 'Self Test',
                    companyCode: 'SELF',
                    legalEntity: 'Self Test Ltd',
                    industry: 'Technology',
                    timezone: 'UTC',
                    country: 'US',
                    currency: 'USD',
                    fiscalYear: 'JAN-DEC'
                },
                initializationModules: {
                    roles: ['EMPLOYEE', 'MANAGER', 'HR', 'DIRECTOR'],
                    permissionsConfigured: true,
                    leavePoliciesConfigured: true,
                    attendanceSettingsConfigured: true,
                    companySettingsConfigured: true
                },
                departments: [{ departmentCode: 'SELF', departmentName: 'Self Department', ownerId: 'SELF-HR' }]
            };
            var initialized = initializeOrganization(payload, context);
            var checklist = generateInitializationChecklist(payload, context);
            var score = calculateReadinessScore(payload, context);
            var blocked = activateOrganization({ tenantSlug: 'self-test', readinessApproved: true }, { actor: { id: 'SELF-HR', role: 'HR' }, tenantSlug: 'self-test', skipPersistence: true, skipAuditPersistence: true });
            return freezeInitializationOutput({
                passed: !!(initialized.success && checklist.success && score.success && blocked.success === false && Object.isFrozen(initialized) && Object.isFrozen(checklist)),
                checks: {
                    organizationSetup: initialized.success === true,
                    readinessValidation: checklist.success === true,
                    activationWorkflow: blocked.success === false,
                    integrations: !!integrationHealth(),
                    immutableOutputs: Object.isFrozen(initialized) && Object.isFrozen(checklist)
                }
            });
        } catch (error) {
            return freezeInitializationOutput({ passed: false, error: 'Organization initialization self-test failed safely.' });
        }
    }

    var OrganizationInitializationWizardService = Object.freeze({
        ORGANIZATION_STATES: ORGANIZATION_STATES,
        INITIALIZATION_WORKFLOW: INITIALIZATION_WORKFLOW,
        initializeOrganization: initializeOrganization,
        validateLaunchReadiness: validateLaunchReadiness,
        calculateReadinessScore: calculateReadinessScore,
        activateOrganization: activateOrganization,
        generateInitializationChecklist: generateInitializationChecklist,
        normalizeInitializationPayload: normalizePayload,
        freezeInitializationOutput: freezeInitializationOutput
    });

    global.OrganizationInitializationWizardService = OrganizationInitializationWizardService;
    global.organizationInitializationWizardService = OrganizationInitializationWizardService;

    if (global.__ARTHHRMS_DEV__) {
        global.__ARTHHRMS_ORGANIZATION_INITIALIZATION_SELF_TEST__ = runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
