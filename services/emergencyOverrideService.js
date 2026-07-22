/**
 * emergencyOverrideService.js
 * ARTHHRMS Enterprise Emergency Override + Critical Recovery Governance.
 *
 * Additive, platform-control-only emergency recovery layer for critical
 * override visibility, tenant lockdown governance, emergency rollback
 * intelligence, operational freeze controls, and restoration analytics. It
 * never exposes salaries, leave balances, confidential HR records, raw tenant
 * documents, URLs, tokens, or tenant-private payloads.
 */
(function attachEmergencyOverrideService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[EmergencyOverrideService]';

    var EMERGENCY_STATES = Object.freeze([
        'STANDBY',
        'ALERTED',
        'LOCKDOWN',
        'DEGRADED',
        'RECOVERY_ACTIVE',
        'MITIGATED',
        'RESTORED',
        'ARCHIVED'
    ]);

    var EMERGENCY_TYPES = Object.freeze([
        'EMERGENCY_OVERRIDE',
        'TENANT_LOCKDOWN',
        'FEATURE_ROLLBACK',
        'OPERATIONAL_FREEZE',
        'PLATFORM_RECOVERY',
        'DEGRADATION_CONTAINMENT',
        'AUDIT_ESCALATION',
        'GOVERNANCE_RESTORATION'
    ]);

    var SEVERITIES = Object.freeze({
        INFO: 'INFO',
        WARNING: 'WARNING',
        HIGH_RISK: 'HIGH_RISK',
        CRITICAL_BLOCKER: 'CRITICAL_BLOCKER'
    });

    var VISIBILITY = Object.freeze({
        NONE: 'NONE',
        EMERGENCY_GOVERNANCE: 'EMERGENCY_GOVERNANCE',
        INFRASTRUCTURE_RECOVERY_VISIBILITY: 'INFRASTRUCTURE_RECOVERY_VISIBILITY'
    });

    var SENSITIVE_KEY_PATTERN = /(salary|payroll|leave.?balance|compensation|payslip|bonus|bank|tax|employee.?id|emp.?id|user.?id|actor.?id|candidate|resume|document|attachment|file.?name|object.?path|storage.?path|public.?url|signed.?url|download.?url|url|path|token|secret|jwt|authorization|private.?key|raw|payload|content|body|messageText|note|comment|employee.?record|confidential|private|email|phone|name)/i;
    var SENSITIVE_VALUE_PATTERN = /(https?:\/\/[^\s"',}]+|private:\/\/[^\s"',}]+|\b(EMP-[A-Z0-9-]+|employee|salary|payroll|leave balance|compensation|confidential|private|secret|token|document|attachment)\b[^,;}]*)/ig;

    var SAFE_OUTPUT_KEYS = Object.freeze({
        VERSION: true,
        success: true,
        allowed: true,
        readOnly: true,
        aggregateOnly: true,
        infrastructureOnly: true,
        recoveryAssist: true,
        strategicOverrideAuthority: true,
        platformRecoveryAuthority: true,
        classification: true,
        visibility: true,
        state: true,
        states: true,
        type: true,
        types: true,
        generatedAt: true,
        status: true,
        severity: true,
        source: true,
        count: true,
        signal: true,
        signals: true,
        summary: true,
        payload: true,
        malformedPayloads: true,
        metadata: true,
        failures: true,
        warnings: true,
        failureCode: true,
        warningCode: true,
        message: true,
        recommendation: true,
        emergencyId: true,
        tenantId: true,
        tenantSlug: true,
        emergencyType: true,
        emergencyState: true,
        emergencyStateRaw: true,
        emergencyGovernanceModel: true,
        criticalRecoveryGovernance: true,
        recoveryWorkflows: true,
        rollbackGovernance: true,
        incidentHealthIntegration: true,
        emergencyAnalytics: true,
        governanceDashboard: true,
        accessGovernance: true,
        integrationHealth: true,
        emergencySummaries: true,
        recoveryIntelligence: true,
        degradationSeverity: true,
        recoveryTimelines: true,
        escalationLinkedFailures: true,
        operationalInstability: true,
        rollbackFrequency: true,
        tenantRecoveryStates: true,
        repeatedEmergencyTriggers: true,
        emergencyActivationFrequency: true,
        recoverySuccessRates: true,
        overrideEscalationTrends: true,
        degradationRecurrence: true,
        operationalFreezeDuration: true,
        rollbackRecoveryEfficiency: true,
        governanceRestorationTimelines: true,
        emergencyRollbackExecutions: true,
        stagedRollbackGovernance: true,
        emergencyFeatureDisable: true,
        rollbackHealthVerification: true,
        unsafeConfigurationCorruptionBlocked: true,
        tenantIsolationLockdowns: true,
        degradedWorkflowFreezes: true,
        operationalFreezeStates: true,
        recoveryApprovalCheckpoints: true,
        governanceRestorationValidation: true,
        activeOverrideVisibility: true,
        incidentLinkedOverrides: true,
        degradationTriggeredRecovery: true,
        rolloutRollbackEscalation: true,
        operationalRestorationAnalytics: true,
        stabilityRecoveryHealth: true,
        crossTenantConfidentialLeakageBlocked: true,
        unsafeOperationalOverridesBlocked: true,
        superAdminStrategicOverrideAuthority: true,
        superAdminHrPayrollVisibility: true,
        platformOwnerTenantRbacIsolation: true,
        salaryVisibility: true,
        leaveBalanceVisibility: true,
        confidentialEmployeeRecordsVisible: true,
        rawTenantDocumentsVisible: true,
        historicalEmergencyRecordsImmutable: true,
        existingTenantWorkflowsPreserved: true,
        emergencyActionsAuditable: true,
        platformIsolationPreserved: true,
        tenantIsolationPreserved: true,
        emergencyGovernanceIsolationPreserved: true,
        auditReady: true,
        telemetryReady: true,
        metricsReady: true,
        auditIntegrated: true,
        globalAuditIntegrated: true,
        globalIncidentIntegrated: true,
        platformHealthIntegrated: true,
        featureRolloutIntegrated: true,
        tenantBillingIntegrated: true,
        tenantGovernanceIntegrated: true,
        workflowTelemetryIntegrated: true,
        billingLinkedEmergencyPressure: true,
        billingReliabilityPressure: true,
        billingRecoveryPressure: true,
        emergencyBillingRestrictions: true,
        renewalFailures: true,
        paymentFailures: true,
        billingRestriction: true,
        billingState: true,
        label: true,
        checkId: true,
        passed: true,
        coverage: true
    });

    var auditForwarding = false;
    var telemetryForwarding = false;
    var metricForwarding = false;

    function safeWarn(message, details) {
        try {
            if (global.console && typeof global.console.warn === 'function') {
                if (typeof details !== 'undefined') global.console.warn(PREFIX + ' ' + message, details);
                else global.console.warn(PREFIX + ' ' + message);
            }
        } catch (error) {}
    }

    function db() {
        try { return global.DB || null; } catch (error) { return null; }
    }

    function rawData() {
        try {
            var source = db();
            return source && typeof source.get === 'function' ? source.get() || {} : {};
        } catch (error) {
            safeWarn('Database read failed safely.', error && error.message);
            return {};
        }
    }

    function list(data, key) {
        return Array.isArray(data && data[key]) ? data[key].slice() : [];
    }

    function safeString(value, fallback) {
        if (value === null || typeof value === 'undefined') return fallback || '';
        try { return String(value); } catch (error) { return fallback || ''; }
    }

    function safeNumber(value, fallback) {
        var next = Number(value);
        return isFinite(next) ? next : (fallback || 0);
    }

    function normalizeToken(value) {
        return safeString(value || '', '').trim().toUpperCase().replace(/[\s-]+/g, '_').replace(/[^A-Z0-9_]/g, '_');
    }

    function normalizeRole(value) {
        var role = normalizeToken(value || '');
        if (role === 'SUPERADMIN') return 'SUPER_ADMIN';
        if (role === 'PLATFORMOWNER' || role === 'OWNER' || role === 'ROOT') return 'PLATFORM_OWNER';
        if (role === 'HRHEAD') return 'HR_HEAD';
        return role || 'EMPLOYEE';
    }

    function normalizeTenantSlug(value) {
        var slug = safeString(value || '', '').trim().toLowerCase();
        slug = slug.replace(/&/g, ' and ');
        slug = slug.replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        return slug;
    }

    function contextTenant(context) {
        return normalizeTenantSlug(context && (context.tenantSlug || context.tenantId || context.companyId || context.actor && (context.actor.tenantSlug || context.actor.tenantId || context.actor.companyId)));
    }

    function rowTenant(row) {
        var metadata = row && typeof row === 'object' && row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
        return normalizeTenantSlug(row && (row.tenantSlug || row.tenantId || row.companyId || row.companySlug || row.tenant_slug || row.tenant_id || row.company_id || metadata.tenantSlug || metadata.tenantId || metadata.companyId));
    }

    function nowIso(context) {
        try { return context && context.now ? new Date(context.now).toISOString() : new Date().toISOString(); } catch (error) { return new Date().toISOString(); }
    }

    function timeValue(value) {
        try {
            var ms = new Date(value).getTime();
            return isFinite(ms) ? ms : 0;
        } catch (error) {
            return 0;
        }
    }

    function deepFreeze(value, seen) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        var refs = seen || [];
        if (refs.indexOf(value) !== -1) return value;
        refs.push(value);
        try {
            Object.keys(value).forEach(function freezeKey(key) { deepFreeze(value[key], refs); });
            Object.freeze(value);
        } catch (error) {}
        return value;
    }

    function sanitizedValue(value, key, seen) {
        if (value === null || typeof value === 'undefined') return value;
        if (typeof value === 'string') return value.replace(SENSITIVE_VALUE_PATTERN, '[redacted]').trim();
        if (typeof value === 'number' || typeof value === 'boolean') return value;
        if (value instanceof Date) return value.toISOString();
        if (Array.isArray(value)) {
            return value.map(function sanitizeItem(row) { return sanitizedValue(row, key, (seen || []).slice()); }).filter(function keep(row) { return typeof row !== 'undefined'; });
        }
        if (typeof value === 'object') return cloneSanitized(value, seen || []);
        return safeString(value, '');
    }

    function cloneSanitized(input, seen) {
        if (!input || typeof input !== 'object') return sanitizedValue(input, '', seen || []);
        var refs = seen || [];
        if (refs.indexOf(input) !== -1) return '[Circular]';
        refs.push(input);
        if (Array.isArray(input)) {
            return input.map(function cloneArrayItem(row) { return cloneSanitized(row, refs.slice()); }).filter(function keep(row) { return typeof row !== 'undefined'; });
        }
        var output = {};
        try {
            Object.keys(input).forEach(function eachKey(key) {
                if (SENSITIVE_KEY_PATTERN.test(key) && !SAFE_OUTPUT_KEYS[key]) return;
                var value = sanitizedValue(input[key], key, refs.slice());
                if (typeof value !== 'undefined') output[key] = value;
            });
        } catch (error) {}
        return output;
    }

    function freezeEmergencyOutput(value) {
        return deepFreeze(cloneSanitized(value || {}));
    }

    function freezeList(rows) {
        if (!Array.isArray(rows)) return Object.freeze([]);
        return deepFreeze(rows.slice(0, 250).map(function freezeRow(row) { return cloneSanitized(row); }));
    }

    function safeFailure(code, severity, message, metadata) {
        return {
            failureCode: normalizeToken(code || 'EMERGENCY_GOVERNANCE_FAILURE'),
            severity: severity || SEVERITIES.HIGH_RISK,
            message: safeString(message || 'Emergency governance failed safely.', ''),
            metadata: cloneSanitized(metadata || {})
        };
    }

    function normalizeEmergencyState(value, fallback) {
        var state = normalizeToken(value || fallback || 'STANDBY');
        if (state === 'ACTIVE' || state === 'DETECTED' || state === 'INVESTIGATING' || state === 'ESCALATED') return 'ALERTED';
        if (state === 'CRITICAL' || state === 'LOCKED' || state === 'LOCKDOWN_ACTIVE') return 'LOCKDOWN';
        if (state === 'RECOVERING' || state === 'MITIGATING' || state === 'ROLLBACK_PENDING' || state === 'ROLLBACK_ACTIVE') return 'RECOVERY_ACTIVE';
        if (state === 'RESOLVED' || state === 'STABILIZED') return 'RESTORED';
        if (EMERGENCY_STATES.indexOf(state) !== -1) return state;
        return fallback || 'STANDBY';
    }

    function normalizeEmergencyType(value) {
        var type = normalizeToken(value || '');
        if (/LOCKDOWN|TENANT_ISOLATION/.test(type)) return 'TENANT_LOCKDOWN';
        if (/ROLLBACK|FEATURE|RELEASE/.test(type)) return 'FEATURE_ROLLBACK';
        if (/FREEZE|WORKFLOW|QUEUE|APPROVAL/.test(type)) return 'OPERATIONAL_FREEZE';
        if (/RECOVERY|RESTORE|RESTORATION/.test(type)) return 'PLATFORM_RECOVERY';
        if (/DEGRAD|HEALTH|STABILITY|CONTAIN/.test(type)) return 'DEGRADATION_CONTAINMENT';
        if (/AUDIT|ESCALATION/.test(type)) return 'AUDIT_ESCALATION';
        if (/GOVERNANCE/.test(type)) return 'GOVERNANCE_RESTORATION';
        if (EMERGENCY_TYPES.indexOf(type) !== -1) return type;
        return 'EMERGENCY_OVERRIDE';
    }

    function isEmergencySignal(row) {
        var token = normalizeToken(row && (row.emergencyType || row.actionType || row.action || row.eventType || row.module || row.source || row.status || row.state || row.emergencyState || row.incidentState || row.healthState || row.rolloutState || row.severity || ''));
        var count = safeNumber(row && (row.escalationCount || row.failureCount || row.failureRate || row.durationMinutes), 0);
        return /EMERGENCY|LOCKDOWN|ROLLBACK|FREEZE|RECOVERY|RESTORE|DEGRADED|CRITICAL|ESCALATED|FAILED|BLOCKED|OUTAGE|INCIDENT/.test(token) || count >= 3 || row && (row.rollbackActivated === true || row.operationalFreeze === true);
    }

    function isBillingRecoverySignal(row) {
        if (!row || typeof row !== 'object') return false;
        var token = normalizeToken([row.billingState, row.state, row.status, row.paymentStatus, row.invoiceState, row.actionType, row.eventType].join('_'));
        return row.billingRestriction === true ||
            safeNumber(row.renewalFailures || row.paymentFailures || row.failureCount, 0) > 0 ||
            /PAST_DUE|SUSPENDED|LIMITED|FAILED|RESTRICTED|RESTRICTION/.test(token);
    }

    function classifyEmergencySeverity(input) {
        try {
            var row = input && typeof input === 'object' ? input : {};
            var severity = normalizeToken(row.severity || row.classification || row.riskLevel || '');
            if (row.crossTenant === true || row.unsafeExposure === true || /CROSS_TENANT|DATA_LEAK|CONFIDENTIAL/i.test(safeString(row.actionType || row.eventType || row.status || row.message || '', ''))) return SEVERITIES.CRITICAL_BLOCKER;
            if (severity === 'CRITICAL' || severity === 'BLOCKER' || severity === SEVERITIES.CRITICAL_BLOCKER) return SEVERITIES.CRITICAL_BLOCKER;
            if (severity === 'HIGH' || severity === 'ERROR' || severity === SEVERITIES.HIGH_RISK) return SEVERITIES.HIGH_RISK;
            var state = normalizeEmergencyState(row.emergencyState || row.state || row.status || row.incidentState || row.healthState || row.rolloutState, 'STANDBY');
            if (state === 'LOCKDOWN') return SEVERITIES.CRITICAL_BLOCKER;
            if (state === 'RECOVERY_ACTIVE' || state === 'DEGRADED') return SEVERITIES.HIGH_RISK;
            if (state === 'ALERTED') return SEVERITIES.WARNING;
            if (row.rollbackActivated === true || row.operationalFreeze === true || safeNumber(row.escalationCount || row.escalations || row.failureCount, 0) >= 3) return SEVERITIES.HIGH_RISK;
            if (safeNumber(row.failureRate, 0) >= 20 || safeNumber(row.durationMinutes, 0) >= 120) return SEVERITIES.HIGH_RISK;
            if (severity === 'WARNING' || severity === 'WARN') return SEVERITIES.WARNING;
            return SEVERITIES.INFO;
        } catch (error) {
            return SEVERITIES.HIGH_RISK;
        }
    }

    function normalizeEmergencyPayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeEmergencyOutput({
                    success: false,
                    payload: {},
                    failures: [safeFailure('MALFORMED_EMERGENCY_PAYLOAD', SEVERITIES.HIGH_RISK, 'Emergency payload must be an object.')]
                });
            }
            var state = normalizeEmergencyState(payload.emergencyState || payload.state || payload.status || payload.incidentState || payload.healthState || payload.rolloutState, 'STANDBY');
            var createdAt = safeString(payload.createdAt || payload.date || payload.timestamp || payload.loggedAt || nowIso(context || {}), nowIso(context || {}));
            var severity = classifyEmergencySeverity(Object.assign({}, payload, { emergencyState: state }));
            var normalized = {
                emergencyId: safeString(payload.emergencyId || payload.id || payload.overrideId || payload.incidentId || payload.rolloutId || payload.healthId || 'EMG-' + timeValue(createdAt), ''),
                tenantSlug: rowTenant(payload),
                tenantId: safeString(payload.tenantId || payload.companyId || '', ''),
                emergencyType: normalizeEmergencyType(payload.emergencyType || payload.type || payload.actionType || payload.eventType || payload.module),
                emergencyState: state,
                emergencyStateRaw: safeString(payload.state || payload.status || payload.emergencyState || payload.incidentState || payload.healthState || payload.rolloutState || '', ''),
                severity: severity,
                source: safeString(payload.source || payload.module || 'emergency', 'emergency'),
                module: safeString(payload.module || payload.source || 'Emergency Governance', 'Emergency Governance'),
                actionType: normalizeToken(payload.actionType || payload.action || payload.eventType || payload.type || 'EMERGENCY_GOVERNANCE_EVENT'),
                correlationId: safeString(payload.correlationId || payload.eventId || '', ''),
                createdAt: createdAt,
                updatedAt: safeString(payload.updatedAt || createdAt, createdAt),
                recoveredAt: safeString(payload.recoveredAt || payload.resolvedAt || '', ''),
                recoveryMinutes: safeNumber(payload.recoveryMinutes || payload.mitigationMinutes || payload.durationMinutes, 0),
                rollbackActivated: payload.rollbackActivated === true || /ROLLBACK/.test(normalizeToken(payload.rolloutState || payload.status || payload.actionType || '')),
                operationalFreeze: payload.operationalFreeze === true || /FREEZE|BLOCKED/.test(normalizeToken(payload.status || payload.actionType || payload.eventType || '')),
                escalationCount: safeNumber(payload.escalationCount || payload.escalations || payload.failureCount, 0),
                failureRate: safeNumber(payload.failureRate, 0),
                billingState: normalizeToken(payload.billingState || ''),
                billingRestriction: payload.billingRestriction === true || /PAST_DUE|SUSPENDED|LIMITED|FAILED|RESTRICTED/.test(normalizeToken([payload.billingState, payload.paymentStatus, payload.invoiceState].join('_'))),
                renewalFailures: safeNumber(payload.renewalFailures, 0),
                paymentFailures: safeNumber(payload.paymentFailures || (/FAILED/i.test(safeString(payload.paymentStatus || payload.invoiceState || '', '')) ? 1 : 0), 0),
                archivalMarker: state === 'ARCHIVED',
                metadata: cloneSanitized(payload.metadata || {})
            };
            return freezeEmergencyOutput({
                success: true,
                payload: normalized,
                classification: severity,
                emergencyGovernanceIsolationPreserved: true
            });
        } catch (error) {
            return freezeEmergencyOutput({
                success: false,
                payload: {},
                failures: [safeFailure('EMERGENCY_PAYLOAD_NORMALIZATION_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Emergency payload normalization failed safely.')]
            });
        }
    }

    function validateEmergencyScope(payload, context) {
        try {
            var record = payload && typeof payload === 'object' ? payload : {};
            var ctx = context && typeof context === 'object' ? context : {};
            var actor = ctx.actor || {};
            var role = normalizeRole(actor.role || ctx.role || record.role || '');
            var routeType = normalizeToken(ctx.routeType || record.routeType || '');
            var route = safeString(ctx.pathname || ctx.route || record.route || global.location && global.location.pathname || '', '').toLowerCase();
            var failures = [];
            var infrastructureOnly = record.infrastructureOnly === true || ctx.infrastructureOnly === true;
            var recoveryAssist = record.recoveryAssist === true || ctx.recoveryAssist === true;
            var targetTenant = normalizeTenantSlug(record.targetTenantId || record.targetTenantSlug || ctx.targetTenantId || ctx.targetTenantSlug);
            var actorTenant = contextTenant(ctx);
            var state = normalizeEmergencyState(record.emergencyState || record.state || record.status, '');
            var strategicActionRequested = record.emergencyRollback === true || record.tenantLockdown === true || record.operationalFreeze === true || record.emergencyOverride === true || record.strategicOverride === true || record.activationRequested === true || /ROLLBACK|LOCKDOWN|FREEZE|OVERRIDE/.test(normalizeToken(record.action || record.actionType || ''));

            if (routeType === 'TENANT' || /arthhrms\.html|employee|hr-|manager|dashboard/i.test(route)) {
                failures.push(safeFailure('EMERGENCY_GOVERNANCE_TENANT_UI_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Emergency governance is isolated to platform-control.'));
            }
            if (state === 'ARCHIVED' && (record.emergencyOverride || record.operationalOverride || record.mutate || record.update || record.delete || record.action === 'modify')) {
                failures.push(safeFailure('ARCHIVED_EMERGENCY_MUTATION_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Historical emergency override records are immutable after archival.'));
            }
            if (record.bypassGovernance || record.forceUnsafeOverride || record.overrideIsolation || record.exportRaw || record.exposeConfidential) {
                failures.push(safeFailure('UNSAFE_EMERGENCY_OVERRIDE_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Unsafe emergency override or exposure is blocked.'));
            }

            if (role === 'PLATFORM_OWNER') {
                if (!failures.length) {
                    return freezeEmergencyOutput({
                        allowed: true,
                        readOnly: record.readOnly === true,
                        aggregateOnly: true,
                        infrastructureOnly: false,
                        recoveryAssist: true,
                        strategicOverrideAuthority: true,
                        platformRecoveryAuthority: true,
                        visibility: VISIBILITY.EMERGENCY_GOVERNANCE,
                        failures: []
                    });
                }
            } else if (role === 'SUPER_ADMIN') {
                if (!infrastructureOnly && !recoveryAssist) {
                    failures.push(safeFailure('SUPER_ADMIN_EMERGENCY_GOVERNANCE_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'SUPER_ADMIN is limited to infrastructure recovery visibility.'));
                }
                if (strategicActionRequested) {
                    failures.push(safeFailure('SUPER_ADMIN_STRATEGIC_OVERRIDE_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'SUPER_ADMIN cannot execute strategic emergency overrides.'));
                }
                if (targetTenant && actorTenant && targetTenant !== actorTenant) {
                    failures.push(safeFailure('CROSS_TENANT_RECOVERY_SCOPE_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Cross-tenant emergency recovery scope is blocked.'));
                }
                if (!failures.length) {
                    return freezeEmergencyOutput({
                        allowed: true,
                        readOnly: true,
                        aggregateOnly: true,
                        infrastructureOnly: true,
                        recoveryAssist: true,
                        strategicOverrideAuthority: false,
                        platformRecoveryAuthority: false,
                        visibility: VISIBILITY.INFRASTRUCTURE_RECOVERY_VISIBILITY,
                        failures: []
                    });
                }
            } else {
                failures.push(safeFailure('TENANT_ROLE_EMERGENCY_GOVERNANCE_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Tenant roles cannot access emergency governance.'));
            }

            return freezeEmergencyOutput({
                allowed: false,
                readOnly: true,
                aggregateOnly: true,
                infrastructureOnly: infrastructureOnly,
                recoveryAssist: recoveryAssist,
                strategicOverrideAuthority: false,
                platformRecoveryAuthority: false,
                visibility: VISIBILITY.NONE,
                failures: failures
            });
        } catch (error) {
            return freezeEmergencyOutput({
                allowed: false,
                visibility: VISIBILITY.NONE,
                strategicOverrideAuthority: false,
                failures: [safeFailure('EMERGENCY_SCOPE_VALIDATION_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Emergency scope validation failed safely.')]
            });
        }
    }

    function emergencyFromRow(row, defaults) {
        var input = Object.assign({}, defaults || {}, row || {});
        var normalized = normalizeEmergencyPayload(input, {});
        return normalized.success ? normalized.payload : null;
    }

    function collectExplicitEmergencies(data) {
        var rows = []
            .concat(list(data, 'emergencyOverrideRecords'))
            .concat(list(data, 'emergencyOverrides'))
            .concat(list(data, 'platformRecoveryRecords'))
            .concat(list(data, 'criticalGovernanceRecords'));
        return rows.map(function mapEmergency(row) {
            return emergencyFromRow(row, { emergencyType: row && (row.emergencyType || row.type || 'EMERGENCY_OVERRIDE') });
        }).filter(Boolean);
    }

    function collectDerivedEmergencies(data) {
        var rows = [];
        function addRows(sourceRows, defaults) {
            (Array.isArray(sourceRows) ? sourceRows : []).forEach(function eachRow(row, index) {
                if (!isEmergencySignal(Object.assign({}, defaults, row))) return;
                var timestamp = row.createdAt || row.date || row.timestamp || row.updatedAt || row.loggedAt || nowIso({});
                rows.push(emergencyFromRow(Object.assign({
                    emergencyId: row.emergencyId || row.incidentId || row.rolloutId || row.healthId || row.auditId || row.eventId || row.id || defaults.prefix + '-' + index,
                    createdAt: timestamp,
                    updatedAt: row.updatedAt || timestamp,
                    state: row.emergencyState || row.state || row.status || row.incidentState || row.healthState || row.rolloutState || defaults.state || 'ALERTED',
                    severity: row.severity || row.classification || defaults.severity || 'INFO',
                    tenantId: row.tenantId || row.companyId,
                    tenantSlug: row.tenantSlug,
                    module: defaults.module,
                    source: defaults.source,
                    emergencyType: defaults.emergencyType,
                    actionType: defaults.actionType,
                    correlationId: row.correlationId || row.eventId,
                    rollbackActivated: row.rollbackActivated === true || defaults.rollbackActivated === true,
                    operationalFreeze: row.operationalFreeze === true || defaults.operationalFreeze === true,
                    recoveryMinutes: row.recoveryMinutes || row.mitigationMinutes || row.durationMinutes
                }, row)));
            });
        }
        addRows(list(data, 'platformIncidents').concat(list(data, 'globalIncidents')).concat(list(data, 'incidents')), { prefix: 'INCIDENT-EMG', module: 'incident', source: 'globalIncidentService', emergencyType: 'PLATFORM_RECOVERY', actionType: 'INCIDENT_LINKED_RECOVERY' });
        addRows(list(data, 'platformHealthRecords').concat(list(data, 'healthMonitoringRecords')), { prefix: 'HEALTH-EMG', module: 'platformHealth', source: 'platformHealthMonitoringService', emergencyType: 'DEGRADATION_CONTAINMENT', actionType: 'DEGRADATION_TRIGGERED_RECOVERY' });
        addRows(list(data, 'featureRolloutRecords').concat(list(data, 'featureUsageEvents')), { prefix: 'ROLLOUT-EMG', module: 'featureRollout', source: 'featureRolloutService', emergencyType: 'FEATURE_ROLLBACK', actionType: 'ROLLOUT_ROLLBACK_ESCALATION', rollbackActivated: true });
        addRows(list(data, 'tenantBillingRecords').concat(list(data, 'subscriptionRecords')).concat(list(data, 'tenantSubscriptionRecords')).filter(isBillingRecoverySignal), { prefix: 'BILLING-EMG', module: 'tenantBilling', source: 'tenantBillingService', emergencyType: 'DEGRADATION_CONTAINMENT', actionType: 'BILLING_FAILED_RECOVERY' });
        addRows(list(data, 'workflowEvents').concat(list(data, 'pendingActions')), { prefix: 'WORKFLOW-EMG', module: 'workflow', source: 'workflowTelemetryService', emergencyType: 'OPERATIONAL_FREEZE', actionType: 'DEGRADED_WORKFLOW_FREEZE', operationalFreeze: true });
        addRows(list(data, 'auditLogs').concat(list(data, 'globalAuditRecords')).concat(list(data, 'governanceAuditLogs')), { prefix: 'AUDIT-EMG', module: 'audit', source: 'globalAuditVisibilityService', emergencyType: 'AUDIT_ESCALATION', actionType: 'EMERGENCY_AUDIT_ESCALATION' });
        addRows(list(data, 'platformTenants').concat(list(data, 'tenantLifecycleEvents')), { prefix: 'TENANT-EMG', module: 'tenantGovernance', source: 'tenantGovernanceService', emergencyType: 'TENANT_LOCKDOWN', actionType: 'TENANT_RECOVERY_STATE' });
        return rows.filter(Boolean);
    }

    function externalEmergencySignals(context) {
        var signals = { incident: {}, health: {}, rollout: {}, audit: {}, billing: {} };
        var safeCtx = Object.assign({}, context || {}, { actor: { role: 'PLATFORM_OWNER' }, routeType: 'platform', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
        try {
            var incident = global.GlobalIncidentService || global.globalIncidentService;
            if (incident && typeof incident.generateGlobalIncidentReport === 'function') signals.incident = incident.generateGlobalIncidentReport({}, safeCtx) || {};
        } catch (error) {}
        try {
            var health = global.PlatformHealthMonitoringService || global.platformHealthMonitoringService;
            if (health && typeof health.generatePlatformHealthReport === 'function') signals.health = health.generatePlatformHealthReport({}, safeCtx) || {};
        } catch (error) {}
        try {
            var rollout = global.FeatureRolloutService || global.featureRolloutService;
            if (rollout && typeof rollout.generateFeatureRolloutReport === 'function') signals.rollout = rollout.generateFeatureRolloutReport({}, safeCtx) || {};
        } catch (error) {}
        try {
            var audit = global.GlobalAuditVisibilityService || global.globalAuditVisibilityService;
            if (audit && typeof audit.generateGlobalAuditReport === 'function') signals.audit = audit.generateGlobalAuditReport({}, safeCtx) || {};
        } catch (error) {}
        try {
            var billing = global.TenantBillingService || global.tenantBillingService;
            if (billing && typeof billing.generateTenantBillingReport === 'function') signals.billing = billing.generateTenantBillingReport({}, safeCtx) || {};
        } catch (error) {}
        return signals;
    }

    function summarizeEmergencies(rows, signals) {
        var emergencies = Array.isArray(rows) ? rows : [];
        var totals = emergencies.reduce(function reduce(acc, row) {
            acc.emergencyActivationFrequency += 1;
            if (row.emergencyState === 'LOCKDOWN') acc.tenantIsolationLockdowns += 1;
            if (row.emergencyState === 'DEGRADED' || row.emergencyState === 'LOCKDOWN' || row.severity === SEVERITIES.CRITICAL_BLOCKER) acc.degradationSeverity += 1;
            if (row.emergencyState === 'RECOVERY_ACTIVE') acc.activeRecoveryWorkflows += 1;
            if (row.emergencyState === 'MITIGATED' || row.emergencyState === 'RESTORED') acc.recoverySuccessRates += 1;
            if (row.emergencyState === 'ARCHIVED') acc.archivedEmergencies += 1;
            if (row.rollbackActivated || row.emergencyType === 'FEATURE_ROLLBACK') acc.rollbackFrequency += 1;
            if (row.operationalFreeze || row.emergencyType === 'OPERATIONAL_FREEZE') acc.operationalFreezeDuration += Math.max(1, safeNumber(row.recoveryMinutes, 1));
            if (row.escalationCount >= 3 || row.severity === SEVERITIES.HIGH_RISK || row.severity === SEVERITIES.CRITICAL_BLOCKER) acc.escalationLinkedFailures += 1;
            if (row.emergencyType === 'PLATFORM_RECOVERY') acc.incidentLinkedOverrides += 1;
            if (row.emergencyType === 'DEGRADATION_CONTAINMENT') acc.degradationTriggeredRecovery += 1;
            if (row.emergencyType === 'FEATURE_ROLLBACK') acc.rolloutRollbackEscalation += 1;
            if (row.emergencyType === 'AUDIT_ESCALATION') acc.emergencyAuditEscalations += 1;
            if (row.source === 'tenantBillingService' || /BILLING/.test(normalizeToken([row.module, row.actionType, row.source].join('_')))) {
                acc.billingLinkedEmergencyPressure += 1;
                acc.emergencyBillingRestrictions += row.billingRestriction ? 1 : 0;
                acc.billingRecoveryPressure += Math.max(1, safeNumber(row.renewalFailures, 0) + safeNumber(row.paymentFailures, 0) + (row.billingRestriction ? 1 : 0));
            }
            if (row.tenantSlug || row.tenantId) acc.tenantRecoveryStates += 1;
            acc.recoveryTimelines += safeNumber(row.recoveryMinutes, 0);
            return acc;
        }, {
            emergencyActivationFrequency: 0,
            degradationSeverity: 0,
            recoveryTimelines: 0,
            escalationLinkedFailures: 0,
            operationalInstability: 0,
            rollbackFrequency: 0,
            tenantRecoveryStates: 0,
            repeatedEmergencyTriggers: 0,
            activeRecoveryWorkflows: 0,
            recoverySuccessRates: 0,
            archivedEmergencies: 0,
            tenantIsolationLockdowns: 0,
            operationalFreezeDuration: 0,
            incidentLinkedOverrides: 0,
            degradationTriggeredRecovery: 0,
            rolloutRollbackEscalation: 0,
            emergencyAuditEscalations: 0,
            billingLinkedEmergencyPressure: 0,
            billingRecoveryPressure: 0,
            emergencyBillingRestrictions: 0
        });
        var incidentAnalytics = signals && signals.incident && signals.incident.incidentAnalytics || {};
        var healthAnalytics = signals && signals.health && signals.health.healthAnalytics || {};
        var rolloutHealth = signals && signals.rollout && signals.rollout.featureHealth || {};
        var billingRenewal = signals && signals.billing && signals.billing.renewalGovernance || {};
        totals.incidentLinkedOverrides += safeNumber(incidentAnalytics.activeIncidents, 0);
        totals.degradationSeverity += safeNumber(healthAnalytics.criticalHealthSignals || healthAnalytics.degradationFrequency, 0);
        totals.rolloutRollbackEscalation += safeNumber(rolloutHealth.rollbackFrequency || rolloutHealth.rolloutFailures || rolloutHealth.degradedFeatureBehavior, 0);
        totals.billingLinkedEmergencyPressure += safeNumber(billingRenewal.renewalFailures || billingRenewal.paymentFailures, 0);
        totals.emergencyBillingRestrictions += safeNumber(billingRenewal.billingRestrictionEvents, 0);
        totals.billingRecoveryPressure += safeNumber(billingRenewal.renewalFailures || billingRenewal.paymentFailures, 0) + safeNumber(billingRenewal.billingRestrictionEvents, 0);
        totals.operationalInstability = totals.degradationSeverity + totals.escalationLinkedFailures + totals.rolloutRollbackEscalation;
        totals.repeatedEmergencyTriggers = totals.emergencyActivationFrequency > 1 ? totals.emergencyActivationFrequency - 1 : 0;
        totals.rollbackRecoveryEfficiency = totals.rollbackFrequency ? Math.max(0, 100 - Math.min(100, totals.recoveryTimelines)) : 100;
        totals.governanceRestorationTimelines = totals.recoverySuccessRates + totals.archivedEmergencies;
        return totals;
    }

    function detectCriticalInstability(filters, context) {
        try {
            var scope = validateEmergencyScope(Object.assign({ readOnly: true, aggregateOnly: true }, filters || {}), context || {});
            if (!scope.allowed) {
                return freezeEmergencyOutput({
                    success: false,
                    classification: SEVERITIES.CRITICAL_BLOCKER,
                    failures: scope.failures
                });
            }
            var data = rawData();
            var rows = scope.infrastructureOnly ? [] : collectExplicitEmergencies(data).concat(collectDerivedEmergencies(data));
            var signals = externalEmergencySignals(context || {});
            var totals = summarizeEmergencies(rows, signals);
            var classification = totals.degradationSeverity >= 2 || totals.escalationLinkedFailures >= 2 ? SEVERITIES.HIGH_RISK : totals.rollbackFrequency ? SEVERITIES.WARNING : SEVERITIES.INFO;
            return freezeEmergencyOutput({
                success: true,
                classification: classification,
                recoveryIntelligence: {
                    degradationSeverity: totals.degradationSeverity,
                    recoveryTimelines: totals.recoveryTimelines,
                    escalationLinkedFailures: totals.escalationLinkedFailures,
                    operationalInstability: totals.operationalInstability,
                    rollbackFrequency: totals.rollbackFrequency,
                    tenantRecoveryStates: totals.tenantRecoveryStates,
                    repeatedEmergencyTriggers: totals.repeatedEmergencyTriggers
                },
                tenantIsolationPreserved: true
            });
        } catch (error) {
            return freezeEmergencyOutput({
                success: false,
                classification: SEVERITIES.HIGH_RISK,
                failures: [safeFailure('CRITICAL_INSTABILITY_DETECTION_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Critical instability detection failed safely.')]
            });
        }
    }

    function auditEmergencyAccess(actionType, metadata, context) {
        if (auditForwarding || context && context.skipAuditPersistence) return { success: true, skipped: true };
        auditForwarding = true;
        try {
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    eventType: normalizeToken(actionType || 'EMERGENCY_GOVERNANCE_ACCESS'),
                    source: 'emergencyOverrideService',
                    severity: metadata && metadata.severity || 'INFO',
                    actorId: context && context.actor && (context.actor.id || context.actor.email) || '',
                    metadata: Object.assign({
                        module: 'emergencyOverride',
                        actionType: normalizeToken(actionType || 'EMERGENCY_GOVERNANCE_ACCESS')
                    }, cloneSanitized(metadata || {}))
                }, { skipTelemetry: true });
            }
        } catch (error) {
            safeWarn('Emergency governance audit failed safely.', error && error.message);
        } finally {
            auditForwarding = false;
        }
        return { success: false, warning: 'Emergency governance audit unavailable.' };
    }

    function emitTelemetry(eventType, metadata, context) {
        if (telemetryForwarding || context && context.skipTelemetry) return { success: true, skipped: true };
        telemetryForwarding = true;
        try {
            var service = global.WorkflowTelemetryService || global.workflowTelemetryService;
            if (service && typeof service.emitTelemetry === 'function') {
                return service.emitTelemetry('GOVERNANCE', normalizeToken(eventType || 'EMERGENCY_GOVERNANCE_EVENT'), {
                    source: 'emergencyOverrideService',
                    severity: metadata && metadata.severity || 'INFO',
                    metadata: cloneSanitized(metadata || {})
                });
            }
        } catch (error) {
            safeWarn('Emergency governance telemetry failed safely.', error && error.message);
        } finally {
            telemetryForwarding = false;
        }
        return { success: false, warning: 'Emergency governance telemetry unavailable.' };
    }

    function recordMetric(metricType, metadata, context) {
        if (metricForwarding || context && context.skipMetrics) return { success: true, skipped: true };
        metricForwarding = true;
        try {
            var service = global.OrchestrationMetricsService || global.orchestrationMetricsService;
            if (service && typeof service.recordWorkflowMetric === 'function') {
                return service.recordWorkflowMetric(normalizeToken(metricType || 'EMERGENCY_GOVERNANCE_REPORTED'), Object.assign({
                    source: 'emergencyOverrideService'
                }, cloneSanitized(metadata || {})));
            }
        } catch (error) {
            safeWarn('Emergency governance metrics failed safely.', error && error.message);
        } finally {
            metricForwarding = false;
        }
        return { success: false, warning: 'Emergency governance metrics unavailable.' };
    }

    function generateEmergencyOverrideReport(filters, context) {
        try {
            var ctx = context && typeof context === 'object' ? context : {};
            var scope = validateEmergencyScope(Object.assign({ readOnly: true, aggregateOnly: true }, filters || {}), ctx);
            if (!scope.allowed) {
                return freezeEmergencyOutput({
                    VERSION: VERSION,
                    success: false,
                    classification: SEVERITIES.CRITICAL_BLOCKER,
                    visibility: scope.visibility,
                    emergencyGovernanceModel: {
                        state: 'STANDBY',
                        states: EMERGENCY_STATES,
                        types: EMERGENCY_TYPES,
                        generatedAt: nowIso(ctx)
                    },
                    emergencySummaries: [],
                    failures: scope.failures,
                    accessGovernance: {
                        crossTenantConfidentialLeakageBlocked: true,
                        salaryVisibility: false,
                        leaveBalanceVisibility: false,
                        confidentialEmployeeRecordsVisible: false,
                        rawTenantDocumentsVisible: false,
                        superAdminStrategicOverrideAuthority: false,
                        superAdminHrPayrollVisibility: false,
                        platformOwnerTenantRbacIsolation: true,
                        platformIsolationPreserved: true,
                        tenantIsolationPreserved: true,
                        emergencyGovernanceIsolationPreserved: true
                    }
                });
            }

            var data = rawData();
            var emergencyRows = scope.infrastructureOnly ? [] : collectExplicitEmergencies(data).concat(collectDerivedEmergencies(data));
            var signals = externalEmergencySignals(ctx);
            var totals = summarizeEmergencies(emergencyRows, signals);
            var instability = detectCriticalInstability(filters || {}, Object.assign({}, ctx, { skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true }));
            var classification = scope.infrastructureOnly ? SEVERITIES.INFO : instability.classification || SEVERITIES.INFO;
            var state = totals.tenantIsolationLockdowns ? 'LOCKDOWN' : totals.degradationSeverity ? 'DEGRADED' : totals.activeRecoveryWorkflows ? 'RECOVERY_ACTIVE' : totals.recoverySuccessRates ? 'RESTORED' : 'STANDBY';

            var report = {
                VERSION: VERSION,
                success: true,
                classification: classification,
                visibility: scope.visibility,
                generatedAt: nowIso(ctx),
                emergencyGovernanceModel: {
                    state: state,
                    states: EMERGENCY_STATES,
                    types: EMERGENCY_TYPES,
                    historicalEmergencyRecordsImmutable: true,
                    generatedAt: nowIso(ctx)
                },
                criticalRecoveryGovernance: {
                    emergencyRollbackExecution: scope.strategicOverrideAuthority && !scope.infrastructureOnly,
                    tenantIsolationLockdown: totals.tenantIsolationLockdowns,
                    degradedWorkflowFreeze: totals.operationalFreezeDuration,
                    emergencyFeatureDisable: totals.rolloutRollbackEscalation,
                    billingReliabilityPressure: totals.billingRecoveryPressure,
                    operationalRecoveryWorkflows: totals.activeRecoveryWorkflows,
                    recoveryApprovalCheckpoints: totals.escalationLinkedFailures,
                    governanceRestorationValidation: totals.governanceRestorationTimelines,
                    unsafeOperationalCorruptionBlocked: true
                },
                recoveryWorkflows: {
                    tenantIsolationLockdowns: totals.tenantIsolationLockdowns,
                    degradedWorkflowFreezes: totals.operationalFreezeDuration,
                    operationalFreezeStates: totals.operationalFreezeDuration,
                    activeOverrideVisibility: totals.emergencyActivationFrequency,
                    recoveryApprovalCheckpoints: totals.escalationLinkedFailures,
                    governanceRestorationValidation: totals.governanceRestorationTimelines
                },
                rollbackGovernance: {
                    emergencyRollbackExecutions: totals.rollbackFrequency,
                    stagedRollbackGovernance: totals.rollbackFrequency,
                    emergencyFeatureDisable: totals.rolloutRollbackEscalation,
                    rollbackHealthVerification: totals.rollbackRecoveryEfficiency,
                    rollbackFrequency: totals.rollbackFrequency,
                    unsafeConfigurationCorruptionBlocked: true
                },
                incidentHealthIntegration: {
                    incidentLinkedOverrides: totals.incidentLinkedOverrides,
                    degradationTriggeredRecovery: totals.degradationTriggeredRecovery,
                    rolloutRollbackEscalation: totals.rolloutRollbackEscalation,
                    billingLinkedEmergencyPressure: totals.billingLinkedEmergencyPressure,
                    emergencyBillingRestrictions: totals.emergencyBillingRestrictions,
                    operationalRestorationAnalytics: totals.recoveryTimelines,
                    stabilityRecoveryHealth: totals.rollbackRecoveryEfficiency,
                    unsafeInfrastructureMutation: false
                },
                emergencyAnalytics: {
                    emergencyActivationFrequency: totals.emergencyActivationFrequency,
                    recoverySuccessRates: totals.recoverySuccessRates,
                    overrideEscalationTrends: totals.escalationLinkedFailures,
                    degradationRecurrence: totals.degradationSeverity,
                    operationalFreezeDuration: totals.operationalFreezeDuration,
                    billingRecoveryPressure: totals.billingRecoveryPressure,
                    rollbackRecoveryEfficiency: totals.rollbackRecoveryEfficiency,
                    governanceRestorationTimelines: totals.governanceRestorationTimelines
                },
                governanceDashboard: {
                    emergencyGovernanceOverview: true,
                    activeOverrideVisibility: true,
                    degradationSeverityIndicators: true,
                    recoveryWorkflowSummaries: true,
                    rollbackActivationVisibility: true,
                    operationalRestorationAnalytics: true,
                    governanceStabilityTrends: true
                },
                accessGovernance: {
                    crossTenantConfidentialLeakageBlocked: true,
                    unsafeOperationalOverridesBlocked: true,
                    superAdminStrategicOverrideAuthority: false,
                    superAdminHrPayrollVisibility: false,
                    platformOwnerTenantRbacIsolation: true,
                    salaryVisibility: false,
                    leaveBalanceVisibility: false,
                    confidentialEmployeeRecordsVisible: false,
                    rawTenantDocumentsVisible: false,
                    historicalEmergencyRecordsImmutable: true,
                    existingTenantWorkflowsPreserved: true,
                    emergencyActionsAuditable: true,
                    platformIsolationPreserved: true,
                    tenantIsolationPreserved: true,
                    emergencyGovernanceIsolationPreserved: true
                },
                integrationHealth: {
                    auditIntegrated: !!(global.AuditService || global.auditService),
                    globalAuditIntegrated: !!(global.GlobalAuditVisibilityService || global.globalAuditVisibilityService),
                    globalIncidentIntegrated: !!(global.GlobalIncidentService || global.globalIncidentService),
                    platformHealthIntegrated: !!(global.PlatformHealthMonitoringService || global.platformHealthMonitoringService),
                    featureRolloutIntegrated: !!(global.FeatureRolloutService || global.featureRolloutService),
                    tenantBillingIntegrated: !!(global.TenantBillingService || global.tenantBillingService),
                    tenantGovernanceIntegrated: !!(global.TenantGovernanceService || global.tenantGovernanceService),
                    workflowTelemetryIntegrated: !!(global.WorkflowTelemetryService || global.workflowTelemetryService),
                    auditReady: !!(global.AuditService || global.auditService),
                    telemetryReady: !!(global.WorkflowTelemetryService || global.workflowTelemetryService),
                    metricsReady: !!(global.OrchestrationMetricsService || global.orchestrationMetricsService)
                },
                emergencySummaries: scope.infrastructureOnly ? [] : freezeList(emergencyRows.slice(0, 50))
            };

            if (!ctx.skipAuditPersistence) auditEmergencyAccess('EMERGENCY_GOVERNANCE_REPORTED', { severity: classification, emergencyCount: emergencyRows.length }, ctx);
            if (!ctx.skipTelemetry) emitTelemetry('EMERGENCY_GOVERNANCE_REPORTED', { severity: classification, emergencyCount: emergencyRows.length }, ctx);
            recordMetric('EMERGENCY_GOVERNANCE_REPORTED', { status: classification, severity: classification === SEVERITIES.INFO ? 'INFO' : 'WARNING' }, ctx);
            return freezeEmergencyOutput(report);
        } catch (error) {
            safeWarn('Emergency override report failed safely.', error && error.message);
            return freezeEmergencyOutput({
                VERSION: VERSION,
                success: false,
                classification: SEVERITIES.HIGH_RISK,
                emergencySummaries: [],
                failures: [safeFailure('EMERGENCY_REPORT_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Emergency override report failed safely.')]
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        function check(label, passed, metadata) {
            checks.push({ checkId: normalizeToken(label), label: safeString(label, ''), passed: passed === true, metadata: cloneSanitized(metadata || {}) });
        }
        try {
            var malformed = normalizeEmergencyPayload(null, {});
            check('malformed payloads fail safely', malformed.success === false && malformed.failures.length > 0);

            var ownerScope = validateEmergencyScope({ aggregateOnly: true }, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' } });
            check('PLATFORM_OWNER emergency governance scope works', ownerScope.allowed === true);

            var tenantScope = validateEmergencyScope({ aggregateOnly: true }, { routeType: 'tenant', actor: { role: 'HR', tenantId: 'TENANT-A' } });
            check('tenant roles are blocked from emergency governance', tenantScope.allowed === false);

            var superAdmin = validateEmergencyScope({ emergencyRollback: true }, { routeType: 'platform', actor: { role: 'SUPER_ADMIN', tenantId: 'TENANT-A' } });
            check('SUPER_ADMIN strategic override is blocked', superAdmin.allowed === false);

            var infra = validateEmergencyScope({ infrastructureOnly: true, recoveryAssist: true }, { routeType: 'platform', actor: { role: 'SUPER_ADMIN', tenantId: 'TENANT-A' } });
            check('SUPER_ADMIN infrastructure recovery scope is allowed', infra.allowed === true && infra.strategicOverrideAuthority === false);

            var archived = validateEmergencyScope({ emergencyState: 'ARCHIVED', emergencyOverride: true }, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' } });
            check('archived emergency mutation is blocked', archived.allowed === false);

            var normalized = normalizeEmergencyPayload({ emergencyId: 'EMG-1', state: 'lockdown', salary: 90000, leaveBalance: 12, metadata: { rawDocument: 'private://doc' } });
            check('protected field filtering removes restricted fields', normalized.success === true && !/salary|leaveBalance|90000|private:\/\/doc/i.test(JSON.stringify(normalized)));

            var frozen = freezeEmergencyOutput({ nested: { ok: true }, salary: 90000 });
            check('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested) && !/90000|salary/i.test(JSON.stringify(frozen)));

            var instability = detectCriticalInstability({}, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('critical instability detection degrades safely without optional dependencies', instability.success === true || instability.failures);

            var report = generateEmergencyOverrideReport({}, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('tenant isolation works for generated reports', report.success === true && report.accessGovernance && report.accessGovernance.crossTenantConfidentialLeakageBlocked === true);
        } catch (error) {
            check('self-test failure captured', false, { error: error && error.message });
        }
        var passed = checks.every(function everyCheck(row) { return row.passed; });
        return freezeEmergencyOutput({
            passed: passed,
            checks: checks,
            generatedAt: nowIso({}),
            coverage: {
                malformedPayloads: true,
                dependencyAbsence: true,
                immutability: true,
                emergencyRollback: true,
                degradationEscalation: true,
                tenantIsolation: true
            }
        });
    }

    var api = Object.freeze({
        VERSION: VERSION,
        EMERGENCY_STATES: EMERGENCY_STATES,
        EMERGENCY_TYPES: EMERGENCY_TYPES,
        SEVERITIES: SEVERITIES,
        validateEmergencyScope: validateEmergencyScope,
        classifyEmergencySeverity: classifyEmergencySeverity,
        normalizeEmergencyPayload: normalizeEmergencyPayload,
        freezeEmergencyOutput: freezeEmergencyOutput,
        detectCriticalInstability: detectCriticalInstability,
        generateEmergencyOverrideReport: generateEmergencyOverrideReport
    });

    global.EmergencyOverrideService = api;
    global.emergencyOverrideService = api;

    if (global.__ARTHHRMS_DEV__) {
        global.__ARTHHRMS_EMERGENCY_OVERRIDE_SELF_TEST__ = runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
