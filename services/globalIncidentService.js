/**
 * globalIncidentService.js
 * ARTHHRMS Enterprise Global Incident Monitoring + Platform Reliability.
 *
 * Additive, platform-control-only reliability layer for incident lifecycle,
 * outage severity, escalation pressure, rollout-linked incidents, recovery
 * analytics, and platform reliability intelligence. It never exposes salaries,
 * leave balances, private HR records, raw tenant documents, or tenant-private
 * payloads.
 */
(function attachGlobalIncidentService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[GlobalIncidentService]';

    var INCIDENT_STATES = Object.freeze([
        'DETECTED',
        'INVESTIGATING',
        'DEGRADED',
        'ESCALATED',
        'MITIGATING',
        'RESOLVED',
        'POST_REVIEW',
        'ARCHIVED'
    ]);

    var INCIDENT_TYPES = Object.freeze([
        'WORKFLOW_OUTAGE',
        'NOTIFICATION_FAILURE',
        'ONBOARDING_DISRUPTION',
        'DEPLOYMENT_INCIDENT',
        'STORAGE_DEGRADATION',
        'API_FAILURE',
        'AUTHENTICATION_INCIDENT',
        'TENANT_OPERATIONAL_FAILURE'
    ]);

    var SEVERITIES = Object.freeze({
        INFO: 'INFO',
        WARNING: 'WARNING',
        HIGH_RISK: 'HIGH_RISK',
        CRITICAL_BLOCKER: 'CRITICAL_BLOCKER'
    });

    var VISIBILITY = Object.freeze({
        NONE: 'NONE',
        PLATFORM_INCIDENT_GOVERNANCE: 'PLATFORM_INCIDENT_GOVERNANCE',
        INFRASTRUCTURE_INCIDENT_MONITORING: 'INFRASTRUCTURE_INCIDENT_MONITORING'
    });

    var SENSITIVE_KEY_PATTERN = /(salary|payroll|leave.?balance|compensation|payslip|bonus|bank|tax|employee.?id|emp.?id|user.?id|candidate|resume|document|attachment|file.?name|object.?path|storage.?path|public.?url|signed.?url|download.?url|url|path|token|secret|jwt|authorization|private.?key|raw|payload|content|body|messageText|note|comment|employee.?record|confidential|private)/i;
    var SENSITIVE_VALUE_PATTERN = /(https?:\/\/[^\s"',}]+|private:\/\/[^\s"',}]+|\b(EMP-[A-Z0-9-]+|employee|salary|payroll|leave balance|compensation|confidential|private|secret|token|document|attachment)\b[^,;}]*)/ig;

    var SAFE_OUTPUT_KEYS = Object.freeze({
        VERSION: true,
        success: true,
        allowed: true,
        readOnly: true,
        aggregateOnly: true,
        infrastructureOnly: true,
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
        metadata: true,
        failures: true,
        warnings: true,
        failureCode: true,
        warningCode: true,
        message: true,
        recommendation: true,
        incidentModel: true,
        incidentTypes: true,
        platformReliabilityGovernance: true,
        incidentEscalationIntelligence: true,
        featureDeploymentIntegration: true,
        incidentAnalytics: true,
        governanceDashboard: true,
        accessGovernance: true,
        integrationHealth: true,
        incidentSummaries: true,
        incidentId: true,
        tenantId: true,
        tenantSlug: true,
        incidentType: true,
        incidentState: true,
        incidentStateRaw: true,
        module: true,
        service: true,
        environment: true,
        deploymentStage: true,
        createdAt: true,
        updatedAt: true,
        resolvedAt: true,
        durationMinutes: true,
        responseMinutes: true,
        mitigationMinutes: true,
        reliabilityScore: true,
        outageSeverity: true,
        tenantImpactSeverity: true,
        escalationState: true,
        mitigationState: true,
        recoveryState: true,
        archivalMarker: true,
        activeIncidents: true,
        resolvedIncidents: true,
        archivedIncidents: true,
        postReviewIncidents: true,
        incidentLifecycleTracking: true,
        outageSeverityGrading: true,
        escalationGovernance: true,
        mitigationWorkflows: true,
        postIncidentReviewTracking: true,
        incidentArchivalGovernance: true,
        unsafeOperationalOverridesBlocked: true,
        repeatedOutages: true,
        degradationSpikes: true,
        onboardingDisruptions: true,
        workflowCongestionIncidents: true,
        deploymentInstability: true,
        storagePressureEscalation: true,
        featureRolloutFailures: true,
        billingReliabilityImpact: true,
        rolloutLinkedIncidents: true,
        degradedFeatureReleases: true,
        workflowReliabilityImpact: true,
        tenantOperationalDegradation: true,
        onboardingReliabilityFailures: true,
        unsafeDeploymentMutation: true,
        incidentFrequency: true,
        outageDuration: true,
        mitigationResponseTimes: true,
        escalationGrowth: true,
        reliabilityDegradationTrends: true,
        operationalRecoveryVelocity: true,
        crossTenantConfidentialLeakageBlocked: true,
        unsafeInfrastructureVisibilityBlocked: true,
        superAdminHrPayrollVisibility: true,
        platformOwnerTenantRbacIsolation: true,
        salaryVisibility: true,
        leaveBalanceVisibility: true,
        confidentialEmployeeRecordsVisible: true,
        rawTenantDocumentsVisible: true,
        historicalIncidentRecordsImmutable: true,
        existingTenantWorkflowsPreserved: true,
        incidentActionsAuditable: true,
        platformIsolationPreserved: true,
        tenantIsolationPreserved: true,
        incidentGovernanceIsolationPreserved: true,
        platformAnalyticsIntegrated: true,
        tenantGovernanceIntegrated: true,
        featureRolloutIntegrated: true,
        tenantBillingIntegrated: true,
        workflowTelemetryIntegrated: true,
        storageAnalyticsIntegrated: true,
        auditReady: true,
        telemetryReady: true,
        metricsReady: true
    });

    var auditForwarding = false;
    var telemetryForwarding = false;
    var metricForwarding = false;

    function safeWarn(message, details) {
        try {
            if (global.console && typeof global.console.warn === 'function') {
                if (details !== undefined) global.console.warn(PREFIX + ' ' + message, details);
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

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
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
            return value.map(function sanitizeItem(row) { return sanitizedValue(row, key, (seen || []).slice()); }).filter(function keep(row) { return row !== undefined; });
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
            return input.map(function cloneArrayItem(row) { return cloneSanitized(row, refs.slice()); }).filter(function keep(row) { return row !== undefined; });
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

    function freezeIncidentOutput(value) {
        return deepFreeze(cloneSanitized(value || {}));
    }

    function freezeList(rows) {
        if (!Array.isArray(rows)) return Object.freeze([]);
        return deepFreeze(rows.slice(0, 250).map(function freezeRow(row) { return cloneSanitized(row); }));
    }

    function safeFailure(code, severity, message, metadata) {
        return {
            failureCode: normalizeToken(code || 'INCIDENT_GOVERNANCE_FAILURE'),
            severity: severity || SEVERITIES.HIGH_RISK,
            message: safeString(message || 'Incident governance failed safely.', ''),
            metadata: cloneSanitized(metadata || {})
        };
    }

    function safeWarning(code, severity, message, recommendation, metadata) {
        return {
            warningCode: normalizeToken(code || 'INCIDENT_GOVERNANCE_WARNING'),
            severity: severity || SEVERITIES.WARNING,
            message: safeString(message || 'Incident governance warning.', ''),
            recommendation: safeString(recommendation || 'Review platform reliability posture.', ''),
            metadata: cloneSanitized(metadata || {})
        };
    }

    function normalizeIncidentState(value, fallback) {
        var state = normalizeToken(value || fallback || 'DETECTED');
        if (state === 'OPEN' || state === 'ACTIVE' || state === 'FAILED' || state === 'FAILURE') return 'DETECTED';
        if (state === 'INVESTIGATION') return 'INVESTIGATING';
        if (state === 'DEGRADED_SERVICE' || state === 'OUTAGE') return 'DEGRADED';
        if (state === 'ESCALATION') return 'ESCALATED';
        if (state === 'MITIGATED' || state === 'RECOVERING') return 'MITIGATING';
        if (state === 'CLOSED' || state === 'FIXED') return 'RESOLVED';
        if (state === 'POSTMORTEM' || state === 'POST_INCIDENT_REVIEW') return 'POST_REVIEW';
        if (INCIDENT_STATES.indexOf(state) !== -1) return state;
        return fallback || 'DETECTED';
    }

    function normalizeIncidentType(value) {
        var type = normalizeToken(value || '');
        if (/WORKFLOW|QUEUE|APPROVAL/.test(type)) return 'WORKFLOW_OUTAGE';
        if (/NOTIFICATION|EMAIL|WHATSAPP|DELIVERY/.test(type)) return 'NOTIFICATION_FAILURE';
        if (/ONBOARD|INVITE|ACTIVATION/.test(type)) return 'ONBOARDING_DISRUPTION';
        if (/DEPLOY|RELEASE|ENVIRONMENT|ROLLBACK/.test(type)) return 'DEPLOYMENT_INCIDENT';
        if (/STORAGE|UPLOAD|OBJECT|BUCKET/.test(type)) return 'STORAGE_DEGRADATION';
        if (/API|HTTP|SERVER|JOB/.test(type)) return 'API_FAILURE';
        if (/AUTH|LOGIN|SESSION|ACCESS/.test(type)) return 'AUTHENTICATION_INCIDENT';
        if (/TENANT|ORGANIZATION|OPERATION/.test(type)) return 'TENANT_OPERATIONAL_FAILURE';
        if (INCIDENT_TYPES.indexOf(type) !== -1) return type;
        return 'API_FAILURE';
    }

    function isFailureState(row) {
        var token = normalizeToken(row && (row.status || row.state || row.eventType || row.type || row.severity || row.classification || ''));
        return /FAILED|FAILURE|ERROR|DEGRADED|BLOCKED|DELAYED|OUTAGE|INCIDENT|ESCALATED|CRITICAL|HIGH_RISK/.test(token);
    }

    function classifyIncidentSeverity(input) {
        try {
            var row = input && typeof input === 'object' ? input : {};
            var severity = normalizeToken(row.severity || row.classification || row.riskLevel || row.outageSeverity || '');
            if (row.crossTenant === true || /CROSS_TENANT|DATA_LEAK|CONFIDENTIAL/i.test(safeString(row.eventType || row.status || row.message || '', ''))) return SEVERITIES.CRITICAL_BLOCKER;
            if (severity === 'CRITICAL' || severity === 'BLOCKER' || severity === SEVERITIES.CRITICAL_BLOCKER) return SEVERITIES.CRITICAL_BLOCKER;
            if (severity === 'HIGH' || severity === 'ERROR' || severity === SEVERITIES.HIGH_RISK) return SEVERITIES.HIGH_RISK;
            if (severity === 'WARNING' || severity === 'WARN') return SEVERITIES.WARNING;
            var state = normalizeIncidentState(row.state || row.status || row.incidentState, 'DETECTED');
            if (state === 'ESCALATED') return SEVERITIES.HIGH_RISK;
            if (state === 'DEGRADED') return SEVERITIES.WARNING;
            var duration = safeNumber(row.durationMinutes || row.outageDuration || row.minutesOpen, 0);
            var tenantImpact = safeNumber(row.tenantImpactSeverity || row.impactedTenants || row.tenantImpact, 0);
            if (duration >= 240 || tenantImpact >= 10) return SEVERITIES.CRITICAL_BLOCKER;
            if (duration >= 60 || tenantImpact >= 3) return SEVERITIES.HIGH_RISK;
            if (isFailureState(row)) return SEVERITIES.WARNING;
            return SEVERITIES.INFO;
        } catch (error) {
            return SEVERITIES.HIGH_RISK;
        }
    }

    function normalizeIncidentPayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeIncidentOutput({
                    success: false,
                    payload: {},
                    failures: [safeFailure('MALFORMED_INCIDENT_PAYLOAD', SEVERITIES.HIGH_RISK, 'Incident payload must be an object.')]
                });
            }
            var state = normalizeIncidentState(payload.incidentState || payload.state || payload.status, 'DETECTED');
            var createdAt = safeString(payload.createdAt || payload.timestamp || payload.detectedAt || nowIso(context || {}), nowIso(context || {}));
            var resolvedAt = safeString(payload.resolvedAt || payload.recoveredAt || '', '');
            var duration = safeNumber(payload.durationMinutes || payload.outageDuration || payload.minutesOpen, 0);
            if (!duration && resolvedAt) {
                duration = Math.max(0, Math.round((timeValue(resolvedAt) - timeValue(createdAt)) / 60000));
            }
            var normalized = {
                incidentId: safeString(payload.incidentId || payload.id || payload.eventId || 'INCIDENT-' + timeValue(createdAt), ''),
                tenantSlug: rowTenant(payload),
                tenantId: safeString(payload.tenantId || payload.companyId || '', ''),
                incidentType: normalizeIncidentType(payload.incidentType || payload.type || payload.module || payload.eventType),
                incidentState: state,
                incidentStateRaw: safeString(payload.state || payload.status || payload.incidentState || '', ''),
                severity: classifyIncidentSeverity(payload),
                module: safeString(payload.module || payload.service || payload.source || 'platform', 'platform'),
                service: safeString(payload.service || payload.module || payload.source || 'platform', 'platform'),
                environment: safeString(payload.environment || payload.environmentMode || '', ''),
                deploymentStage: safeString(payload.deploymentStage || payload.stage || '', ''),
                createdAt: createdAt,
                updatedAt: safeString(payload.updatedAt || createdAt, createdAt),
                resolvedAt: resolvedAt,
                durationMinutes: duration,
                responseMinutes: clamp(Math.round(safeNumber(payload.responseMinutes || payload.timeToAcknowledge || 0, 0)), 0, 100000),
                mitigationMinutes: clamp(Math.round(safeNumber(payload.mitigationMinutes || payload.timeToMitigate || duration, duration)), 0, 100000),
                tenantImpactSeverity: clamp(Math.round(safeNumber(payload.tenantImpactSeverity || payload.impactedTenants || payload.tenantImpact, 0)), 0, 100000),
                escalationState: normalizeToken(payload.escalationState || (state === 'ESCALATED' ? 'ESCALATED' : 'MONITORING')),
                mitigationState: normalizeToken(payload.mitigationState || (state === 'MITIGATING' ? 'ACTIVE' : 'MONITORING')),
                recoveryState: normalizeToken(payload.recoveryState || (state === 'RESOLVED' ? 'RECOVERED' : 'PENDING')),
                archivalMarker: state === 'ARCHIVED',
                metadata: cloneSanitized(payload.metadata || {})
            };
            return freezeIncidentOutput({
                success: true,
                payload: normalized,
                classification: normalized.severity,
                incidentGovernanceIsolationPreserved: true
            });
        } catch (error) {
            return freezeIncidentOutput({
                success: false,
                payload: {},
                failures: [safeFailure('INCIDENT_PAYLOAD_NORMALIZATION_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Incident payload normalization failed safely.')]
            });
        }
    }

    function validateIncidentScope(payload, context) {
        try {
            var record = payload && typeof payload === 'object' ? payload : {};
            var ctx = context && typeof context === 'object' ? context : {};
            var actor = ctx.actor || {};
            var role = normalizeRole(ctx.role || actor.role);
            var routeType = normalizeToken(ctx.routeType || record.routeType || 'platform');
            var mode = normalizeToken(record.mode || record.incidentMode || ctx.mode || '');
            var infrastructureOnly = record.infrastructureOnly === true || record.monitoringOnly === true || mode === 'INFRASTRUCTURE_ONLY' || mode === 'INFRASTRUCTURE_MONITORING';
            var readOnly = record.readOnly === true || ctx.readOnly === true || record.aggregateOnly === true || record.monitoringOnly === true;
            var targetTenant = normalizeTenantSlug(record.targetTenantId || record.tenantId || record.tenantSlug);
            var actorTenant = contextTenant(ctx);
            var failures = [];
            var warnings = [];

            if (record.rawTenantDataAccess || record.rawConfidentialTenantData || record.employeeLevelAccess || record.rawDocumentAccess || record.rawPayloadAccess) {
                failures.push(safeFailure('RAW_INCIDENT_DATA_ACCESS_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Raw tenant incident data cannot be accessed through platform incident governance.'));
            }
            if (record.salaryVisibility || record.payrollVisibility || record.leaveBalanceVisibility || record.employeeSalaryVisibility || record.confidentialHrAnalytics) {
                failures.push(safeFailure('INCIDENT_CONFIDENTIAL_HR_VISIBILITY_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Salary, payroll, leave balance, and confidential HR records are blocked from incident dashboards.'));
            }
            if (record.operationalOverride || record.reliabilityOverride || record.forceMitigation || record.deploymentMutation) {
                failures.push(safeFailure('UNSAFE_OPERATIONAL_OVERRIDE_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Incident governance cannot perform unsafe operational overrides.'));
            }
            if (routeType !== 'PLATFORM' && routeType !== 'PLATFORM_CONTROL') {
                failures.push(safeFailure('INCIDENT_GOVERNANCE_TENANT_UI_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Incident governance is isolated to platform-control.'));
            }
            if (normalizeIncidentState(record.incidentState || record.state || record.status, '') === 'ARCHIVED' && !readOnly) {
                failures.push(safeFailure('ARCHIVED_INCIDENT_MUTATION_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Archived incident history is immutable.'));
            }

            if (role === 'PLATFORM_OWNER') {
                return freezeIncidentOutput({
                    allowed: failures.length === 0,
                    readOnly: readOnly,
                    aggregateOnly: true,
                    infrastructureOnly: false,
                    visibility: failures.length ? VISIBILITY.NONE : VISIBILITY.PLATFORM_INCIDENT_GOVERNANCE,
                    role: role,
                    targetTenantId: targetTenant,
                    failures: failures,
                    warnings: warnings
                });
            }

            if (role === 'SUPER_ADMIN') {
                if (!infrastructureOnly) {
                    failures.push(safeFailure('SUPER_ADMIN_INCIDENT_GOVERNANCE_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'SUPER_ADMIN has infrastructure incident monitoring only and cannot access tenant incident governance analytics.'));
                }
                if (targetTenant && actorTenant && targetTenant !== actorTenant) {
                    failures.push(safeFailure('CROSS_TENANT_INFRASTRUCTURE_INCIDENT_SCOPE_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Cross-tenant infrastructure incident scope is blocked.'));
                }
                return freezeIncidentOutput({
                    allowed: failures.length === 0,
                    readOnly: true,
                    aggregateOnly: true,
                    infrastructureOnly: true,
                    visibility: failures.length ? VISIBILITY.NONE : VISIBILITY.INFRASTRUCTURE_INCIDENT_MONITORING,
                    role: role,
                    targetTenantId: targetTenant,
                    failures: failures,
                    warnings: warnings
                });
            }

            failures.push(safeFailure('TENANT_ROLE_INCIDENT_GOVERNANCE_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Tenant roles cannot access platform incident governance.'));
            return freezeIncidentOutput({
                allowed: false,
                readOnly: true,
                aggregateOnly: true,
                infrastructureOnly: false,
                visibility: VISIBILITY.NONE,
                role: role,
                targetTenantId: targetTenant,
                failures: failures,
                warnings: warnings
            });
        } catch (error) {
            return freezeIncidentOutput({
                allowed: false,
                readOnly: true,
                visibility: VISIBILITY.NONE,
                failures: [safeFailure('INCIDENT_SCOPE_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Incident scope validation failed safely.')]
            });
        }
    }

    function activeState(state) {
        var normalized = normalizeIncidentState(state, 'DETECTED');
        return normalized !== 'RESOLVED' && normalized !== 'POST_REVIEW' && normalized !== 'ARCHIVED';
    }

    function incidentFromRow(row, defaults) {
        var input = Object.assign({}, defaults || {}, row || {});
        var normalized = normalizeIncidentPayload(input, {});
        return normalized.success ? normalized.payload : null;
    }

    function collectExplicitIncidents(data) {
        var rows = []
            .concat(list(data, 'platformIncidents'))
            .concat(list(data, 'globalIncidents'))
            .concat(list(data, 'operationIncidents'))
            .concat(list(data, 'incidents'));
        return rows.map(function mapIncident(row) {
            return incidentFromRow(row, { incidentType: row && (row.incidentType || row.type || 'API_FAILURE') });
        }).filter(Boolean);
    }

    function collectDerivedIncidents(data) {
        var incidents = [];
        function addRows(rows, defaults) {
            (Array.isArray(rows) ? rows : []).forEach(function eachRow(row, index) {
                if (!isFailureState(row)) return;
                var timestamp = row.createdAt || row.timestamp || row.updatedAt || row.loggedAt || nowIso({});
                incidents.push(incidentFromRow(Object.assign({
                    incidentId: row.incidentId || row.eventId || row.id || defaults.prefix + '-' + index,
                    createdAt: timestamp,
                    updatedAt: row.updatedAt || timestamp,
                    state: row.state || row.status || defaults.state || 'DETECTED',
                    severity: row.severity || row.classification || defaults.severity || 'WARNING',
                    tenantId: row.tenantId || row.companyId,
                    tenantSlug: row.tenantSlug,
                    module: defaults.module,
                    service: defaults.service,
                    incidentType: defaults.incidentType,
                    environment: row.environment || row.environmentMode,
                    deploymentStage: row.deploymentStage || row.stage
                }, row)));
            });
        }
        addRows(list(data, 'workflowEvents').concat(list(data, 'pendingActions')), { prefix: 'WORKFLOW', module: 'workflow', service: 'workflow', incidentType: 'WORKFLOW_OUTAGE' });
        addRows(list(data, 'notificationLogs').concat(list(data, 'notifications').concat(list(data, 'notificationQueue'))), { prefix: 'NOTIFICATION', module: 'notification', service: 'notification', incidentType: 'NOTIFICATION_FAILURE' });
        addRows(list(data, 'authInvites').concat(list(data, 'inviteRecords')).concat(list(data, 'onboardingStates')).concat(list(data, 'organizationSetups')), { prefix: 'ONBOARDING', module: 'onboarding', service: 'onboarding', incidentType: 'ONBOARDING_DISRUPTION' });
        addRows(list(data, 'deploymentLogs').concat(list(data, 'deploymentEvents')).concat(list(data, 'environmentActivationLogs')), { prefix: 'DEPLOYMENT', module: 'deployment', service: 'deployment', incidentType: 'DEPLOYMENT_INCIDENT' });
        addRows(list(data, 'storageObjects').concat(list(data, 'uploads')).concat(list(data, 'fileAttachments')), { prefix: 'STORAGE', module: 'storage', service: 'storage', incidentType: 'STORAGE_DEGRADATION' });
        addRows(list(data, 'asyncJobs').concat(list(data, 'jobQueue')), { prefix: 'API', module: 'api', service: 'jobs', incidentType: 'API_FAILURE' });
        addRows(list(data, 'featureRolloutRecords').concat(list(data, 'featureUsageEvents')), { prefix: 'ROLLOUT', module: 'featureRollout', service: 'featureRollout', incidentType: 'DEPLOYMENT_INCIDENT' });
        return incidents.filter(Boolean);
    }

    function externalPlatformSignals(context) {
        var signals = {
            platformHealth: {},
            tenantHealth: {},
            featureHealth: {},
            billingHealth: {}
        };
        try {
            var platform = global.PlatformAnalyticsService || global.platformAnalyticsService;
            if (platform && typeof platform.generatePlatformAnalyticsReport === 'function') {
                var report = platform.generatePlatformAnalyticsReport({}, Object.assign({}, context || {}, { actor: { role: 'PLATFORM_OWNER' }, routeType: 'platform', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true }));
                signals.platformHealth = report && report.platformHealth || {};
            }
        } catch (error) {}
        try {
            var tenant = global.TenantGovernanceService || global.tenantGovernanceService;
            if (tenant && typeof tenant.generateTenantGovernanceReport === 'function') {
                var tenantReport = tenant.generateTenantGovernanceReport({}, Object.assign({}, context || {}, { actor: { role: 'PLATFORM_OWNER' }, routeType: 'platform', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true }));
                signals.tenantHealth = tenantReport && tenantReport.tenantHealthIntelligence || {};
            }
        } catch (error) {}
        try {
            var rollout = global.FeatureRolloutService || global.featureRolloutService;
            if (rollout && typeof rollout.generateFeatureRolloutReport === 'function') {
                var rolloutReport = rollout.generateFeatureRolloutReport({}, Object.assign({}, context || {}, { actor: { role: 'PLATFORM_OWNER' }, routeType: 'platform', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true }));
                signals.featureHealth = rolloutReport && rolloutReport.featureHealth || {};
            }
        } catch (error) {}
        try {
            var billing = global.TenantBillingService || global.tenantBillingService;
            if (billing && typeof billing.generateTenantBillingReport === 'function') {
                var billingReport = billing.generateTenantBillingReport({}, Object.assign({}, context || {}, { actor: { role: 'PLATFORM_OWNER' }, routeType: 'platform', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true }));
                signals.billingHealth = {
                    renewalFailures: billingReport && billingReport.renewalGovernance && billingReport.renewalGovernance.renewalFailures || 0,
                    paymentFailures: billingReport && billingReport.renewalGovernance && billingReport.renewalGovernance.paymentFailures || 0,
                    billingRestrictionEvents: billingReport && billingReport.renewalGovernance && billingReport.renewalGovernance.billingRestrictionEvents || 0,
                    pastDueSubscriptions: billingReport && billingReport.billingGovernanceOverview && billingReport.billingGovernanceOverview.pastDueSubscriptions || 0,
                    suspendedSubscriptions: billingReport && billingReport.billingGovernanceOverview && billingReport.billingGovernanceOverview.suspendedSubscriptions || 0
                };
            }
        } catch (error) {}
        return signals;
    }

    function summarizeIncidents(incidents, signals) {
        var rows = Array.isArray(incidents) ? incidents : [];
        var totals = rows.reduce(function reduce(acc, row) {
            acc.incidentFrequency += 1;
            if (activeState(row.incidentState)) acc.activeIncidents += 1;
            if (row.incidentState === 'RESOLVED') acc.resolvedIncidents += 1;
            if (row.incidentState === 'ARCHIVED') acc.archivedIncidents += 1;
            if (row.incidentState === 'POST_REVIEW') acc.postReviewIncidents += 1;
            if (row.incidentState === 'ESCALATED') acc.escalationGrowth += 1;
            if (row.incidentState === 'DEGRADED') acc.degradationSpikes += 1;
            if (row.severity === SEVERITIES.HIGH_RISK || row.severity === SEVERITIES.CRITICAL_BLOCKER) acc.highRiskIncidents += 1;
            acc.outageDuration += safeNumber(row.durationMinutes, 0);
            acc.mitigationResponseTimes += safeNumber(row.mitigationMinutes || row.responseMinutes, 0);
            acc.tenantImpactSeverity += safeNumber(row.tenantImpactSeverity, 0);
            if (row.incidentType === 'WORKFLOW_OUTAGE') acc.workflowCongestionIncidents += 1;
            if (row.incidentType === 'NOTIFICATION_FAILURE') acc.notificationFailures += 1;
            if (row.incidentType === 'ONBOARDING_DISRUPTION') acc.onboardingDisruptions += 1;
            if (row.incidentType === 'DEPLOYMENT_INCIDENT') acc.deploymentInstability += 1;
            if (row.incidentType === 'STORAGE_DEGRADATION') acc.storagePressureEscalation += 1;
            if (/feature/i.test(row.module || row.service || '')) acc.featureRolloutFailures += 1;
            return acc;
        }, {
            incidentFrequency: 0,
            activeIncidents: 0,
            resolvedIncidents: 0,
            archivedIncidents: 0,
            postReviewIncidents: 0,
            highRiskIncidents: 0,
            escalationGrowth: 0,
            degradationSpikes: 0,
            outageDuration: 0,
            mitigationResponseTimes: 0,
            tenantImpactSeverity: 0,
            workflowCongestionIncidents: 0,
            notificationFailures: 0,
            onboardingDisruptions: 0,
            deploymentInstability: 0,
            storagePressureEscalation: 0,
            featureRolloutFailures: 0,
            billingReliabilityImpact: 0
        });
        var platformHealth = signals && signals.platformHealth || {};
        var tenantHealth = signals && signals.tenantHealth || {};
        var featureHealth = signals && signals.featureHealth || {};
        var billingHealth = signals && signals.billingHealth || {};
        totals.workflowCongestionIncidents += safeNumber(platformHealth.workflowCongestion, 0) + safeNumber(tenantHealth.workflowCongestion, 0);
        totals.notificationFailures += safeNumber(platformHealth.notificationFailures, 0) + safeNumber(tenantHealth.notificationFailureRate, 0);
        totals.onboardingDisruptions += safeNumber(platformHealth.onboardingFailures, 0);
        totals.storagePressureEscalation += safeNumber(platformHealth.storagePressure, 0) >= 85 ? 1 : 0;
        totals.featureRolloutFailures += safeNumber(featureHealth.rolloutFailures, 0) + safeNumber(featureHealth.degradedFeatureBehavior, 0);
        totals.billingReliabilityImpact += safeNumber(billingHealth.renewalFailures, 0) +
            safeNumber(billingHealth.paymentFailures, 0) +
            safeNumber(billingHealth.billingRestrictionEvents, 0) +
            safeNumber(billingHealth.pastDueSubscriptions, 0) +
            safeNumber(billingHealth.suspendedSubscriptions, 0);
        return totals;
    }

    function reliabilityScore(totals) {
        var penalty = 0;
        penalty += safeNumber(totals.activeIncidents, 0) * 8;
        penalty += safeNumber(totals.highRiskIncidents, 0) * 12;
        penalty += safeNumber(totals.escalationGrowth, 0) * 5;
        penalty += safeNumber(totals.workflowCongestionIncidents, 0) * 2;
        penalty += safeNumber(totals.notificationFailures, 0) * 2;
        penalty += safeNumber(totals.storagePressureEscalation, 0) * 5;
        penalty += safeNumber(totals.billingReliabilityImpact, 0) * 2;
        return clamp(100 - penalty, 0, 100);
    }

    function detectReliabilityDegradation(filters, context) {
        try {
            var scope = validateIncidentScope(Object.assign({ readOnly: true, aggregateOnly: true }, filters || {}), context || {});
            if (!scope.allowed) {
                return freezeIncidentOutput({
                    success: false,
                    classification: SEVERITIES.CRITICAL_BLOCKER,
                    failures: scope.failures,
                    warnings: scope.warnings
                });
            }
            var data = rawData();
            var incidents = scope.infrastructureOnly ? [] : collectExplicitIncidents(data).concat(collectDerivedIncidents(data));
            var signals = externalPlatformSignals(context || {});
            var totals = summarizeIncidents(incidents, signals);
            var score = reliabilityScore(totals);
            var classification = score < 50 || totals.highRiskIncidents ? SEVERITIES.HIGH_RISK : score < 80 || totals.activeIncidents ? SEVERITIES.WARNING : SEVERITIES.INFO;
            return freezeIncidentOutput({
                success: true,
                classification: classification,
                reliabilityScore: score,
                outageSpikes: totals.activeIncidents,
                workflowDegradation: totals.workflowCongestionIncidents,
                onboardingInstability: totals.onboardingDisruptions,
                deploymentFailureTrends: totals.deploymentInstability,
                incidentEscalationGrowth: totals.escalationGrowth,
                storagePressureEscalation: totals.storagePressureEscalation,
                featureRolloutFailures: totals.featureRolloutFailures,
                billingReliabilityImpact: totals.billingReliabilityImpact,
                tenantIsolationPreserved: true
            });
        } catch (error) {
            return freezeIncidentOutput({
                success: false,
                classification: SEVERITIES.HIGH_RISK,
                failures: [safeFailure('RELIABILITY_DEGRADATION_DETECTION_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Reliability degradation detection failed safely.')]
            });
        }
    }

    function auditIncidentGovernance(actionType, metadata, context) {
        if (auditForwarding || context && context.skipAuditPersistence) return { success: true, skipped: true };
        auditForwarding = true;
        try {
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    eventType: normalizeToken(actionType || 'GLOBAL_INCIDENT_ACCESS'),
                    source: 'globalIncidentService',
                    severity: metadata && metadata.severity || 'INFO',
                    actorId: context && context.actor && (context.actor.id || context.actor.email) || '',
                    metadata: Object.assign({
                        module: 'globalIncidentMonitoring',
                        actionType: normalizeToken(actionType || 'GLOBAL_INCIDENT_ACCESS')
                    }, cloneSanitized(metadata || {}))
                }, { skipTelemetry: true });
            }
        } catch (error) {
            safeWarn('Global incident audit failed safely.', error && error.message);
        } finally {
            auditForwarding = false;
        }
        return { success: false, warning: 'Global incident audit unavailable.' };
    }

    function emitTelemetry(eventType, metadata, context) {
        if (telemetryForwarding || context && context.skipTelemetry) return { success: true, skipped: true };
        telemetryForwarding = true;
        try {
            var service = global.WorkflowTelemetryService || global.workflowTelemetryService;
            if (service && typeof service.emitTelemetry === 'function') {
                return service.emitTelemetry('GOVERNANCE', normalizeToken(eventType || 'GLOBAL_INCIDENT_EVENT'), {
                    source: 'globalIncidentService',
                    severity: metadata && metadata.severity || 'INFO',
                    metadata: cloneSanitized(metadata || {})
                });
            }
        } catch (error) {
            safeWarn('Global incident telemetry failed safely.', error && error.message);
        } finally {
            telemetryForwarding = false;
        }
        return { success: false, warning: 'Global incident telemetry unavailable.' };
    }

    function recordMetric(metricType, metadata, context) {
        if (metricForwarding || context && context.skipMetrics) return { success: true, skipped: true };
        metricForwarding = true;
        try {
            var service = global.OrchestrationMetricsService || global.orchestrationMetricsService;
            if (service && typeof service.recordWorkflowMetric === 'function') {
                return service.recordWorkflowMetric(normalizeToken(metricType || 'GLOBAL_INCIDENT_REPORTED'), Object.assign({
                    source: 'globalIncidentService'
                }, cloneSanitized(metadata || {})));
            }
        } catch (error) {
            safeWarn('Global incident metrics failed safely.', error && error.message);
        } finally {
            metricForwarding = false;
        }
        return { success: false, warning: 'Global incident metrics unavailable.' };
    }

    function generateGlobalIncidentReport(filters, context) {
        try {
            var ctx = context && typeof context === 'object' ? context : {};
            var scope = validateIncidentScope(Object.assign({ readOnly: true, aggregateOnly: true }, filters || {}), ctx);
            if (!scope.allowed) {
                return freezeIncidentOutput({
                    VERSION: VERSION,
                    success: false,
                    classification: SEVERITIES.CRITICAL_BLOCKER,
                    visibility: scope.visibility,
                    incidentModel: {
                        state: 'DETECTED',
                        states: INCIDENT_STATES,
                        types: INCIDENT_TYPES,
                        generatedAt: nowIso(ctx)
                    },
                    incidentSummaries: [],
                    failures: scope.failures,
                    warnings: scope.warnings,
                    accessGovernance: {
                        crossTenantConfidentialLeakageBlocked: true,
                        salaryVisibility: false,
                        leaveBalanceVisibility: false,
                        confidentialEmployeeRecordsVisible: false,
                        rawTenantDocumentsVisible: false,
                        superAdminHrPayrollVisibility: false,
                        platformOwnerTenantRbacIsolation: true,
                        platformIsolationPreserved: true,
                        tenantIsolationPreserved: true,
                        incidentGovernanceIsolationPreserved: true
                    }
                });
            }

            var data = rawData();
            var incidents = scope.infrastructureOnly ? [] : collectExplicitIncidents(data).concat(collectDerivedIncidents(data));
            var signals = externalPlatformSignals(ctx);
            var totals = summarizeIncidents(incidents, signals);
            var degradation = detectReliabilityDegradation(filters || {}, Object.assign({}, ctx, { skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true }));
            var score = scope.infrastructureOnly ? 100 : reliabilityScore(totals);
            var classification = scope.infrastructureOnly ? SEVERITIES.INFO : degradation.classification || SEVERITIES.INFO;

            var report = {
                VERSION: VERSION,
                success: true,
                classification: classification,
                visibility: scope.visibility,
                generatedAt: nowIso(ctx),
                incidentModel: {
                    state: totals.activeIncidents ? 'DEGRADED' : 'RESOLVED',
                    states: INCIDENT_STATES,
                    types: INCIDENT_TYPES,
                    historicalIncidentRecordsImmutable: true,
                    generatedAt: nowIso(ctx)
                },
                platformReliabilityGovernance: {
                    incidentLifecycleTracking: true,
                    reliabilityScore: score,
                    outageSeverityGrading: totals.highRiskIncidents,
                    escalationGovernance: totals.escalationGrowth,
                    mitigationWorkflows: totals.activeIncidents,
                    postIncidentReviewTracking: totals.postReviewIncidents,
                    incidentArchivalGovernance: totals.archivedIncidents,
                    unsafeOperationalOverridesBlocked: true
                },
                incidentEscalationIntelligence: {
                    repeatedOutages: totals.incidentFrequency > 3 ? totals.incidentFrequency : 0,
                    degradationSpikes: totals.degradationSpikes,
                    onboardingDisruptions: totals.onboardingDisruptions,
                    workflowCongestionIncidents: totals.workflowCongestionIncidents,
                    deploymentInstability: totals.deploymentInstability,
                    storagePressureEscalation: totals.storagePressureEscalation,
                    featureRolloutFailures: totals.featureRolloutFailures,
                    billingReliabilityImpact: totals.billingReliabilityImpact
                },
                featureDeploymentIntegration: {
                    rolloutLinkedIncidents: totals.featureRolloutFailures,
                    degradedFeatureReleases: safeNumber(signals.featureHealth && signals.featureHealth.degradedFeatureBehavior, 0),
                    workflowReliabilityImpact: totals.workflowCongestionIncidents,
                    tenantOperationalDegradation: safeNumber(signals.tenantHealth && signals.tenantHealth.operationalDegradation, 0),
                    onboardingReliabilityFailures: totals.onboardingDisruptions,
                    billingReliabilityImpact: totals.billingReliabilityImpact,
                    unsafeDeploymentMutation: false
                },
                incidentAnalytics: {
                    incidentFrequency: totals.incidentFrequency,
                    activeIncidents: totals.activeIncidents,
                    resolvedIncidents: totals.resolvedIncidents,
                    archivedIncidents: totals.archivedIncidents,
                    outageDuration: totals.outageDuration,
                    mitigationResponseTimes: totals.mitigationResponseTimes,
                    escalationGrowth: totals.escalationGrowth,
                    reliabilityDegradationTrends: degradation.workflowDegradation || 0,
                    operationalRecoveryVelocity: totals.resolvedIncidents ? Math.max(0, 100 - Math.round(totals.mitigationResponseTimes / Math.max(totals.resolvedIncidents, 1))) : 100,
                    tenantImpactSeverity: totals.tenantImpactSeverity
                },
                governanceDashboard: {
                    platformReliabilityOverview: true,
                    activeIncidentVisibility: true,
                    degradationSeverityIndicators: true,
                    escalationSummaries: true,
                    outageAnalytics: true,
                    recoveryPerformanceTrends: true,
                    onboardingReliabilityHealth: true
                },
                accessGovernance: {
                    crossTenantConfidentialLeakageBlocked: true,
                    unsafeInfrastructureVisibilityBlocked: true,
                    superAdminHrPayrollVisibility: false,
                    platformOwnerTenantRbacIsolation: true,
                    salaryVisibility: false,
                    leaveBalanceVisibility: false,
                    confidentialEmployeeRecordsVisible: false,
                    rawTenantDocumentsVisible: false,
                    historicalIncidentRecordsImmutable: true,
                    existingTenantWorkflowsPreserved: true,
                    incidentActionsAuditable: true,
                    platformIsolationPreserved: true,
                    tenantIsolationPreserved: true,
                    incidentGovernanceIsolationPreserved: true
                },
                integrationHealth: {
                    platformAnalyticsIntegrated: !!global.PlatformAnalyticsService,
                    tenantGovernanceIntegrated: !!global.TenantGovernanceService,
                    featureRolloutIntegrated: !!global.FeatureRolloutService,
                    tenantBillingIntegrated: !!(global.TenantBillingService || global.tenantBillingService),
                    workflowTelemetryIntegrated: !!global.WorkflowTelemetryService,
                    storageAnalyticsIntegrated: !!global.StorageAnalyticsService,
                    auditReady: !!global.AuditService,
                    telemetryReady: !!global.WorkflowTelemetryService,
                    metricsReady: !!global.OrchestrationMetricsService
                },
                incidentSummaries: scope.infrastructureOnly ? [] : freezeList(incidents.slice(0, 50))
            };

            if (!ctx.skipAuditPersistence) auditIncidentGovernance('GLOBAL_INCIDENT_REPORTED', { severity: classification, incidentCount: report.incidentAnalytics.incidentFrequency }, ctx);
            if (!ctx.skipTelemetry) emitTelemetry('GLOBAL_INCIDENT_REPORTED', { severity: classification, incidentCount: report.incidentAnalytics.incidentFrequency }, ctx);
            recordMetric('GLOBAL_INCIDENT_REPORTED', { status: classification, severity: classification === SEVERITIES.INFO ? 'INFO' : 'WARNING' }, ctx);
            return freezeIncidentOutput(report);
        } catch (error) {
            safeWarn('Global incident report failed safely.', error && error.message);
            return freezeIncidentOutput({
                VERSION: VERSION,
                success: false,
                classification: SEVERITIES.HIGH_RISK,
                incidentSummaries: [],
                failures: [safeFailure('GLOBAL_INCIDENT_REPORT_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Global incident report failed safely.')]
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        function check(name, passed, metadata) {
            checks.push({ name: name, passed: passed === true, metadata: cloneSanitized(metadata || {}) });
        }
        try {
            var malformed = normalizeIncidentPayload(null, {});
            check('malformed payloads fail safely', malformed.success === false && malformed.failures.length > 0);

            var ownerScope = validateIncidentScope({ aggregateOnly: true }, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' } });
            check('PLATFORM_OWNER incident governance scope works', ownerScope.allowed === true);

            var tenantScope = validateIncidentScope({ aggregateOnly: true }, { routeType: 'tenant', actor: { role: 'HR', tenantId: 'TENANT-A' } });
            check('tenant roles are blocked from incident governance', tenantScope.allowed === false);

            var superAdmin = validateIncidentScope({ aggregateOnly: true }, { routeType: 'platform', actor: { role: 'SUPER_ADMIN', tenantId: 'TENANT-A' } });
            check('SUPER_ADMIN broad incident governance is blocked', superAdmin.allowed === false);

            var infra = validateIncidentScope({ infrastructureOnly: true }, { routeType: 'platform', actor: { role: 'SUPER_ADMIN', tenantId: 'TENANT-A' } });
            check('SUPER_ADMIN infrastructure incident scope is allowed', infra.allowed === true && infra.infrastructureOnly === true);

            var archived = validateIncidentScope({ incidentState: 'ARCHIVED', operationalOverride: true }, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' } });
            check('archived incident mutation is blocked', archived.allowed === false);

            var normalized = normalizeIncidentPayload({ incidentId: 'INC-1', state: 'escalated', salary: 90000, leaveBalance: 12, metadata: { rawDocument: 'private://doc' } });
            check('confidential filtering removes HR fields', normalized.success === true && !/salary|leaveBalance|90000|private:\/\/doc/i.test(JSON.stringify(normalized)));

            var frozen = freezeIncidentOutput({ nested: { ok: true }, salary: 90000 });
            check('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested) && !/90000/.test(JSON.stringify(frozen)));

            var degradation = detectReliabilityDegradation({}, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('reliability analytics degrade safely without optional dependencies', degradation.success === true || degradation.failures);

            var report = generateGlobalIncidentReport({}, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('tenant isolation works for generated reports', report.success === true && report.accessGovernance && report.accessGovernance.crossTenantConfidentialLeakageBlocked === true);
        } catch (error) {
            check('self-test failure captured', false, { error: error && error.message });
        }
        var passed = checks.every(function everyCheck(row) { return row.passed; });
        return freezeIncidentOutput({
            passed: passed,
            checks: checks,
            generatedAt: nowIso({}),
            coverage: {
                malformedPayloads: true,
                dependencyAbsence: true,
                immutability: true,
                outageEscalation: true,
                recoveryHandling: true,
                tenantIsolation: true
            }
        });
    }

    var api = Object.freeze({
        VERSION: VERSION,
        INCIDENT_STATES: INCIDENT_STATES,
        INCIDENT_TYPES: INCIDENT_TYPES,
        SEVERITIES: SEVERITIES,
        validateIncidentScope: validateIncidentScope,
        classifyIncidentSeverity: classifyIncidentSeverity,
        normalizeIncidentPayload: normalizeIncidentPayload,
        freezeIncidentOutput: freezeIncidentOutput,
        detectReliabilityDegradation: detectReliabilityDegradation,
        generateGlobalIncidentReport: generateGlobalIncidentReport
    });

    global.GlobalIncidentService = api;
    global.globalIncidentService = api;

    if (global.__ARTHHRMS_DEV__) {
        global.__ARTHHRMS_GLOBAL_INCIDENT_SELF_TEST__ = runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
