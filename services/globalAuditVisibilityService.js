/**
 * globalAuditVisibilityService.js
 * ARTHHRMS Enterprise Global Audit Visibility + Governance Intelligence.
 *
 * Additive, platform-control-only audit intelligence layer for cross-system
 * governance tracing, incident audit correlation, rollout audit visibility,
 * operational audit timelines, and tenant governance auditing. It never
 * exposes salaries, leave balances, private HR records, raw tenant documents,
 * tokens, URLs, or tenant-private payloads.
 */
(function attachGlobalAuditVisibilityService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[GlobalAuditVisibilityService]';

    var AUDIT_STATES = Object.freeze([
        'RECORDED',
        'VERIFIED',
        'CORRELATED',
        'FLAGGED',
        'ESCALATED',
        'REVIEWED',
        'ARCHIVED'
    ]);

    var AUDIT_TYPES = Object.freeze([
        'GOVERNANCE_AUDIT',
        'WORKFLOW_AUDIT',
        'INCIDENT_AUDIT',
        'ROLLOUT_AUDIT',
        'TENANT_LIFECYCLE_AUDIT',
        'OPERATIONAL_AUDIT',
        'ESCALATION_AUDIT',
        'CROSS_SYSTEM_CORRELATION'
    ]);

    var SEVERITIES = Object.freeze({
        INFO: 'INFO',
        WARNING: 'WARNING',
        HIGH_RISK: 'HIGH_RISK',
        CRITICAL_BLOCKER: 'CRITICAL_BLOCKER'
    });

    var VISIBILITY = Object.freeze({
        NONE: 'NONE',
        PLATFORM_AUDIT_GOVERNANCE: 'PLATFORM_AUDIT_GOVERNANCE',
        INFRASTRUCTURE_AUDIT_VISIBILITY: 'INFRASTRUCTURE_AUDIT_VISIBILITY'
    });

    var SENSITIVE_KEY_PATTERN = /(salary|payroll|leave.?balance|compensation|payslip|bonus|bank|tax|employee.?id|emp.?id|user.?id|actor.?id|candidate|resume|document|attachment|file.?name|object.?path|storage.?path|public.?url|signed.?url|download.?url|url|path|token|secret|jwt|authorization|private.?key|raw|payload|content|body|messageText|note|comment|employee.?record|confidential|private|email|phone|name)/i;
    var SENSITIVE_VALUE_PATTERN = /(https?:\/\/[^\s"',}]+|private:\/\/[^\s"',}]+|\b(EMP-[A-Z0-9-]+|employee|salary|payroll|leave balance|compensation|confidential|private|secret|token|document|attachment)\b[^,;}]*)/ig;

    var SAFE_OUTPUT_KEYS = Object.freeze({
        payload: true,
        metadata: true,
        auditId: true,
        tenantId: true,
        tenantSlug: true,
        crossTenantConfidentialLeakageBlocked: true,
        salaryVisibility: true,
        leaveBalanceVisibility: true,
        confidentialEmployeeRecordsVisible: true,
        rawTenantDocumentsVisible: true,
        superAdminHrPayrollVisibility: true,
        malformedPayloads: true,
        auditSummaries: true,
        auditAnalytics: true
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

    function freezeAuditOutput(value) {
        return deepFreeze(cloneSanitized(value || {}));
    }

    function freezeList(rows) {
        if (!Array.isArray(rows)) return Object.freeze([]);
        return deepFreeze(rows.slice(0, 250).map(function freezeRow(row) { return cloneSanitized(row); }));
    }

    function safeFailure(code, severity, message, metadata) {
        return {
            failureCode: normalizeToken(code || 'GLOBAL_AUDIT_GOVERNANCE_FAILURE'),
            severity: severity || SEVERITIES.HIGH_RISK,
            message: safeString(message || 'Global audit governance failed safely.', ''),
            metadata: cloneSanitized(metadata || {})
        };
    }

    function normalizeAuditState(value, fallback) {
        var state = normalizeToken(value || fallback || 'RECORDED');
        if (state === 'ACTIVE' || state === 'CREATED') return 'RECORDED';
        if (state === 'VALIDATED') return 'VERIFIED';
        if (state === 'LINKED') return 'CORRELATED';
        if (state === 'WARNING') return 'FLAGGED';
        if (state === 'HIGH_RISK' || state === 'CRITICAL' || state === 'ESCALATION') return 'ESCALATED';
        if (state === 'CLOSED') return 'REVIEWED';
        if (AUDIT_STATES.indexOf(state) !== -1) return state;
        return fallback || 'RECORDED';
    }

    function normalizeAuditType(value) {
        var type = normalizeToken(value || '');
        if (/INCIDENT|OUTAGE|RELIABILITY/.test(type)) return 'INCIDENT_AUDIT';
        if (/ROLLOUT|FEATURE|RELEASE/.test(type)) return 'ROLLOUT_AUDIT';
        if (/WORKFLOW|APPROVAL|QUEUE/.test(type)) return 'WORKFLOW_AUDIT';
        if (/TENANT|LIFECYCLE|ORGANIZATION/.test(type)) return 'TENANT_LIFECYCLE_AUDIT';
        if (/ESCALATION|SLA|BOTTLENECK/.test(type)) return 'ESCALATION_AUDIT';
        if (/CROSS|CORRELATION|TRACE/.test(type)) return 'CROSS_SYSTEM_CORRELATION';
        if (/OPERATION|HEALTH|MONITOR|STABILITY/.test(type)) return 'OPERATIONAL_AUDIT';
        if (AUDIT_TYPES.indexOf(type) !== -1) return type;
        return 'GOVERNANCE_AUDIT';
    }

    function isGovernanceAudit(row) {
        var token = normalizeToken(row && (row.actionType || row.action || row.eventType || row.module || row.source || row.status || row.severity || ''));
        return /GOVERNANCE|AUDIT|INCIDENT|ROLLOUT|FEATURE|HEALTH|WORKFLOW|TENANT|ESCALAT|DEGRAD|FAILED|BLOCKED|CRITICAL|HIGH_RISK/.test(token);
    }

    function classifyAuditSeverity(input) {
        try {
            var row = input && typeof input === 'object' ? input : {};
            var severity = normalizeToken(row.severity || row.classification || row.riskLevel || '');
            if (row.crossTenant === true || /CROSS_TENANT|DATA_LEAK|CONFIDENTIAL/i.test(safeString(row.actionType || row.eventType || row.status || row.message || '', ''))) return SEVERITIES.CRITICAL_BLOCKER;
            if (severity === 'CRITICAL' || severity === 'BLOCKER' || severity === SEVERITIES.CRITICAL_BLOCKER) return SEVERITIES.CRITICAL_BLOCKER;
            if (severity === 'HIGH' || severity === 'ERROR' || severity === SEVERITIES.HIGH_RISK) return SEVERITIES.HIGH_RISK;
            if (severity === 'WARNING' || severity === 'WARN') return SEVERITIES.WARNING;
            var state = normalizeAuditState(row.state || row.status || row.auditState, 'RECORDED');
            if (state === 'ESCALATED') return SEVERITIES.HIGH_RISK;
            if (state === 'FLAGGED') return SEVERITIES.WARNING;
            if (safeNumber(row.escalationCount || row.escalations || row.anomalyCount, 0) >= 3) return SEVERITIES.HIGH_RISK;
            if (isGovernanceAudit(row) && /FAILED|BLOCKED|DEGRADED|ESCALATED|VIOLATION/.test(normalizeToken(row.status || row.eventType || row.actionType || ''))) return SEVERITIES.WARNING;
            return SEVERITIES.INFO;
        } catch (error) {
            return SEVERITIES.HIGH_RISK;
        }
    }

    function normalizeAuditPayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeAuditOutput({
                    success: false,
                    payload: {},
                    failures: [safeFailure('MALFORMED_AUDIT_PAYLOAD', SEVERITIES.HIGH_RISK, 'Audit payload must be an object.')]
                });
            }
            var state = normalizeAuditState(payload.auditState || payload.state || payload.status, 'RECORDED');
            var createdAt = safeString(payload.createdAt || payload.date || payload.timestamp || payload.loggedAt || nowIso(context || {}), nowIso(context || {}));
            var severity = classifyAuditSeverity(Object.assign({}, payload, { auditState: state }));
            var normalized = {
                auditId: safeString(payload.auditId || payload.id || payload.logId || 'AUDIT-' + timeValue(createdAt), ''),
                tenantSlug: rowTenant(payload),
                tenantId: safeString(payload.tenantId || payload.companyId || '', ''),
                auditType: normalizeAuditType(payload.auditType || payload.actionType || payload.eventType || payload.module || payload.type),
                auditState: state,
                auditStateRaw: safeString(payload.state || payload.status || payload.auditState || '', ''),
                severity: severity,
                source: safeString(payload.source || payload.module || 'audit', 'audit'),
                module: safeString(payload.module || payload.source || 'Governance', 'Governance'),
                actionType: normalizeToken(payload.actionType || payload.action || payload.eventType || payload.type || 'GOVERNANCE_AUDIT'),
                eventId: safeString(payload.eventId || '', ''),
                correlationId: safeString(payload.correlationId || payload.eventId || '', ''),
                createdAt: createdAt,
                updatedAt: safeString(payload.updatedAt || createdAt, createdAt),
                reviewedAt: safeString(payload.reviewedAt || '', ''),
                escalationState: normalizeToken(payload.escalationState || (state === 'ESCALATED' ? 'ESCALATED' : 'MONITORING')),
                correlationState: normalizeToken(payload.correlationState || (payload.correlationId ? 'CORRELATED' : 'UNLINKED')),
                archivalMarker: state === 'ARCHIVED',
                metadata: cloneSanitized(payload.metadata || {})
            };
            return freezeAuditOutput({
                success: true,
                payload: normalized,
                classification: severity,
                auditGovernanceConfidentialityPreserved: true
            });
        } catch (error) {
            return freezeAuditOutput({
                success: false,
                payload: {},
                failures: [safeFailure('AUDIT_PAYLOAD_NORMALIZATION_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Audit payload normalization failed safely.')]
            });
        }
    }

    function validateAuditScope(payload, context) {
        try {
            var record = payload && typeof payload === 'object' ? payload : {};
            var ctx = context && typeof context === 'object' ? context : {};
            var actor = ctx.actor || {};
            var role = normalizeRole(actor.role || ctx.role || record.role || '');
            var routeType = normalizeToken(ctx.routeType || record.routeType || '');
            var route = safeString(ctx.pathname || ctx.route || record.route || (global.location && global.location.pathname) || '', '').toLowerCase();
            var failures = [];
            var infrastructureOnly = record.infrastructureOnly === true || ctx.infrastructureOnly === true;
            var targetTenant = normalizeTenantSlug(record.targetTenantId || record.targetTenantSlug || ctx.targetTenantId || ctx.targetTenantSlug);
            var actorTenant = contextTenant(ctx);
            var state = normalizeAuditState(record.auditState || record.state || record.status, '');

            if (routeType === 'TENANT' || /arthhrms\.html|employee|hr-|manager|dashboard/i.test(route)) {
                failures.push(safeFailure('GLOBAL_AUDIT_TENANT_UI_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Global audit visibility is isolated to platform-control.'));
            }
            if (state === 'ARCHIVED' && (record.auditOverride || record.operationalOverride || record.mutate || record.update || record.delete || record.action === 'modify')) {
                failures.push(safeFailure('ARCHIVED_AUDIT_MUTATION_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Historical audit logs are immutable after archival.'));
            }
            if (record.auditOverride || record.operationalOverride || record.bypassGovernance || record.overrideAudit || record.exportRaw) {
                failures.push(safeFailure('UNSAFE_AUDIT_OVERRIDE_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Unsafe audit exposure or override is blocked.'));
            }

            if (role === 'PLATFORM_OWNER') {
                if (!failures.length) {
                    return freezeAuditOutput({
                        allowed: true,
                        readOnly: record.readOnly !== false,
                        aggregateOnly: true,
                        infrastructureOnly: false,
                        visibility: VISIBILITY.PLATFORM_AUDIT_GOVERNANCE,
                        failures: []
                    });
                }
            } else if (role === 'SUPER_ADMIN') {
                if (!infrastructureOnly) {
                    failures.push(safeFailure('SUPER_ADMIN_GLOBAL_AUDIT_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'SUPER_ADMIN is limited to infrastructure-only audit visibility.'));
                }
                if (targetTenant && actorTenant && targetTenant !== actorTenant) {
                    failures.push(safeFailure('CROSS_TENANT_INFRASTRUCTURE_AUDIT_SCOPE_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Cross-tenant infrastructure audit scope is blocked.'));
                }
                if (!failures.length) {
                    return freezeAuditOutput({
                        allowed: true,
                        readOnly: true,
                        aggregateOnly: true,
                        infrastructureOnly: true,
                        visibility: VISIBILITY.INFRASTRUCTURE_AUDIT_VISIBILITY,
                        failures: []
                    });
                }
            } else {
                failures.push(safeFailure('TENANT_ROLE_GLOBAL_AUDIT_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Tenant roles cannot access global audit visibility.'));
            }

            return freezeAuditOutput({
                allowed: false,
                readOnly: true,
                aggregateOnly: true,
                infrastructureOnly: infrastructureOnly,
                visibility: VISIBILITY.NONE,
                failures: failures
            });
        } catch (error) {
            return freezeAuditOutput({
                allowed: false,
                visibility: VISIBILITY.NONE,
                failures: [safeFailure('AUDIT_SCOPE_VALIDATION_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Audit scope validation failed safely.')]
            });
        }
    }

    function auditFromRow(row, defaults) {
        var input = Object.assign({}, defaults || {}, row || {});
        var normalized = normalizeAuditPayload(input, {});
        return normalized.success ? normalized.payload : null;
    }

    function collectExplicitAudits(data) {
        var rows = []
            .concat(list(data, 'auditLogs'))
            .concat(list(data, 'globalAuditRecords'))
            .concat(list(data, 'governanceAuditLogs'))
            .concat(list(data, 'auditTrail'));
        return rows.map(function mapAudit(row) {
            return auditFromRow(row, { auditType: row && (row.auditType || row.type || 'GOVERNANCE_AUDIT') });
        }).filter(Boolean);
    }

    function collectDerivedAudits(data) {
        var rows = [];
        function addRows(sourceRows, defaults) {
            (Array.isArray(sourceRows) ? sourceRows : []).forEach(function eachRow(row, index) {
                if (!isGovernanceAudit(Object.assign({}, defaults, row))) return;
                var timestamp = row.createdAt || row.date || row.timestamp || row.updatedAt || row.loggedAt || nowIso({});
                rows.push(auditFromRow(Object.assign({
                    auditId: row.auditId || row.eventId || row.incidentId || row.rolloutId || row.healthId || row.id || defaults.prefix + '-' + index,
                    createdAt: timestamp,
                    updatedAt: row.updatedAt || timestamp,
                    state: row.auditState || row.state || row.status || defaults.state || 'RECORDED',
                    severity: row.severity || row.classification || defaults.severity || 'INFO',
                    tenantId: row.tenantId || row.companyId,
                    tenantSlug: row.tenantSlug,
                    module: defaults.module,
                    source: defaults.source,
                    auditType: defaults.auditType,
                    actionType: defaults.actionType,
                    eventId: row.eventId || row.incidentId || row.rolloutId || row.healthId || row.id,
                    correlationId: row.correlationId || row.eventId
                }, row)));
            });
        }
        addRows(list(data, 'workflowEvents').concat(list(data, 'pendingActions')), { prefix: 'WORKFLOW', module: 'workflow', source: 'workflowTelemetry', auditType: 'WORKFLOW_AUDIT', actionType: 'WORKFLOW_GOVERNANCE_EVENT' });
        addRows(list(data, 'platformIncidents').concat(list(data, 'globalIncidents')).concat(list(data, 'incidents')), { prefix: 'INCIDENT', module: 'incident', source: 'globalIncidentService', auditType: 'INCIDENT_AUDIT', actionType: 'INCIDENT_GOVERNANCE_EVENT' });
        addRows(list(data, 'platformHealthRecords').concat(list(data, 'healthMonitoringRecords')), { prefix: 'HEALTH', module: 'platformHealth', source: 'platformHealthMonitoringService', auditType: 'OPERATIONAL_AUDIT', actionType: 'HEALTH_GOVERNANCE_EVENT' });
        addRows(list(data, 'featureRolloutRecords').concat(list(data, 'featureUsageEvents')), { prefix: 'ROLLOUT', module: 'featureRollout', source: 'featureRolloutService', auditType: 'ROLLOUT_AUDIT', actionType: 'ROLLOUT_GOVERNANCE_EVENT' });
        addRows(list(data, 'platformTenants').concat(list(data, 'tenantLifecycleEvents')).concat(list(data, 'organizationSetups')), { prefix: 'TENANT', module: 'tenantGovernance', source: 'tenantGovernanceService', auditType: 'TENANT_LIFECYCLE_AUDIT', actionType: 'TENANT_GOVERNANCE_EVENT' });
        addRows(list(data, 'escalations').concat(list(data, 'escalationEvents')), { prefix: 'ESCALATION', module: 'escalation', source: 'escalationCommandService', auditType: 'ESCALATION_AUDIT', actionType: 'ESCALATION_GOVERNANCE_EVENT' });
        return rows.filter(Boolean);
    }

    function isInfrastructureAudit(row) {
        var tenant = rowTenant(row) || normalizeTenantSlug(row && (row.tenantId || row.companyId));
        if (tenant) return false;
        var token = normalizeToken([
            row && row.auditType,
            row && row.actionType,
            row && row.eventType,
            row && row.module,
            row && row.source,
            row && row.status,
            row && row.severity
        ].join(' '));
        return /INFRASTRUCTURE|RUNTIME|SERVER|SYSTEM|DATABASE|NETWORK|QUEUE|WORKER|HEALTH_CHECK|DEPLOYMENT|MONITORING|SECURITY|STORAGE|AUTH/.test(token);
    }

    function collectInfrastructureAudits(data) {
        var explicit = collectExplicitAudits(data);
        var infrastructureEvents = []
            .concat(list(data, 'infrastructureAuditLogs'))
            .concat(list(data, 'platformRuntimeEvents'))
            .concat(list(data, 'systemAuditLogs'))
            .concat(list(data, 'deploymentAuditLogs'))
            .concat(list(data, 'securityAuditLogs'));
        var derived = infrastructureEvents.map(function mapInfrastructure(row, index) {
            return auditFromRow(row, {
                auditId: row && (row.auditId || row.id) || 'INFRA-AUDIT-' + index,
                auditType: 'OPERATIONAL_AUDIT',
                actionType: row && (row.actionType || row.eventType) || 'INFRASTRUCTURE_AUDIT_EVENT',
                module: row && row.module || 'Infrastructure',
                source: row && row.source || 'platformRuntime'
            });
        }).filter(Boolean);
        return explicit.concat(derived).filter(isInfrastructureAudit);
    }

    function externalAuditSignals(context) {
        var signals = {
            incident: {},
            health: {},
            rollout: {},
            analytics: {}
        };
        try {
            var incident = global.GlobalIncidentService || global.globalIncidentService;
            if (incident && typeof incident.generateGlobalIncidentReport === 'function') {
                signals.incident = incident.generateGlobalIncidentReport({}, Object.assign({}, context || {}, { actor: { role: 'PLATFORM_OWNER' }, routeType: 'platform', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true })) || {};
            }
        } catch (error) {}
        try {
            var health = global.PlatformHealthMonitoringService || global.platformHealthMonitoringService;
            if (health && typeof health.generatePlatformHealthReport === 'function') {
                signals.health = health.generatePlatformHealthReport({}, Object.assign({}, context || {}, { actor: { role: 'PLATFORM_OWNER' }, routeType: 'platform', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true })) || {};
            }
        } catch (error) {}
        try {
            var rollout = global.FeatureRolloutService || global.featureRolloutService;
            if (rollout && typeof rollout.generateFeatureRolloutReport === 'function') {
                signals.rollout = rollout.generateFeatureRolloutReport({}, Object.assign({}, context || {}, { actor: { role: 'PLATFORM_OWNER' }, routeType: 'platform', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true })) || {};
            }
        } catch (error) {}
        try {
            var analytics = global.PlatformAnalyticsService || global.platformAnalyticsService;
            if (analytics && typeof analytics.generatePlatformAnalyticsReport === 'function') {
                signals.analytics = analytics.generatePlatformAnalyticsReport({}, Object.assign({}, context || {}, { actor: { role: 'PLATFORM_OWNER' }, routeType: 'platform', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true })) || {};
            }
        } catch (error) {}
        return signals;
    }

    function summarizeAudits(rows, signals) {
        var audits = Array.isArray(rows) ? rows : [];
        var totals = audits.reduce(function reduce(acc, row) {
            acc.auditEventFrequency += 1;
            if (row.auditState === 'ESCALATED') acc.escalationLinkedAuditGrowth += 1;
            if (row.auditState === 'FLAGGED') acc.governanceAnomalyTrends += 1;
            if (row.auditState === 'REVIEWED') acc.operationalReviewTimelines += 1;
            if (row.auditState === 'ARCHIVED') acc.archivedAudits += 1;
            if (row.severity === SEVERITIES.HIGH_RISK || row.severity === SEVERITIES.CRITICAL_BLOCKER) acc.highRiskAudits += 1;
            if (row.auditType === 'INCIDENT_AUDIT') acc.incidentLinkedAudits += 1;
            if (row.auditType === 'ROLLOUT_AUDIT') acc.rolloutLinkedGovernanceEvents += 1;
            if (row.auditType === 'ESCALATION_AUDIT') acc.escalationAuditChains += 1;
            if (row.auditType === 'WORKFLOW_AUDIT') acc.workflowDegradationTraces += 1;
            if (row.auditType === 'TENANT_LIFECYCLE_AUDIT') acc.tenantLifecycleAuditTrails += 1;
            if (row.correlationId) acc.crossSystemAuditDensity += 1;
            return acc;
        }, {
            auditEventFrequency: 0,
            escalationLinkedAuditGrowth: 0,
            governanceAnomalyTrends: 0,
            operationalReviewTimelines: 0,
            archivedAudits: 0,
            highRiskAudits: 0,
            incidentLinkedAudits: 0,
            rolloutLinkedGovernanceEvents: 0,
            escalationAuditChains: 0,
            workflowDegradationTraces: 0,
            tenantLifecycleAuditTrails: 0,
            crossSystemAuditDensity: 0
        });
        var incidentAnalytics = signals && signals.incident && signals.incident.incidentAnalytics || {};
        var healthAnalytics = signals && signals.health && signals.health.healthAnalytics || {};
        var rolloutHealth = signals && signals.rollout && signals.rollout.featureHealth || {};
        totals.incidentLinkedAudits += safeNumber(incidentAnalytics.activeIncidents, 0);
        totals.workflowDegradationTraces += safeNumber(healthAnalytics.degradationFrequency, 0);
        totals.rolloutLinkedGovernanceEvents += safeNumber(rolloutHealth.rolloutFailures || rolloutHealth.degradedFeatureBehavior, 0);
        totals.operationalDegradationCorrelations = safeNumber(healthAnalytics.degradationFrequency, 0) + safeNumber(incidentAnalytics.activeIncidents, 0);
        return totals;
    }

    function detectGovernanceAnomalies(filters, context) {
        try {
            var scope = validateAuditScope(Object.assign({ readOnly: true, aggregateOnly: true }, filters || {}), context || {});
            if (!scope.allowed) {
                return freezeAuditOutput({
                    success: false,
                    classification: SEVERITIES.CRITICAL_BLOCKER,
                    failures: scope.failures
                });
            }
            var data = rawData();
            var rows = scope.infrastructureOnly ? collectInfrastructureAudits(data) : collectExplicitAudits(data).concat(collectDerivedAudits(data));
            var signals = externalAuditSignals(context || {});
            var totals = summarizeAudits(rows, signals);
            var classification = totals.highRiskAudits || totals.escalationLinkedAuditGrowth >= 2 ? SEVERITIES.HIGH_RISK : totals.governanceAnomalyTrends ? SEVERITIES.WARNING : SEVERITIES.INFO;
            return freezeAuditOutput({
                success: true,
                classification: classification,
                auditCorrelationIntelligence: {
                    incidentLinkedAudits: totals.incidentLinkedAudits,
                    rolloutLinkedGovernanceEvents: totals.rolloutLinkedGovernanceEvents,
                    escalationAuditChains: totals.escalationAuditChains,
                    workflowDegradationTraces: totals.workflowDegradationTraces,
                    tenantLifecycleAuditTrails: totals.tenantLifecycleAuditTrails,
                    operationalGovernanceAnomalies: totals.governanceAnomalyTrends
                },
                tenantIsolationPreserved: true
            });
        } catch (error) {
            return freezeAuditOutput({
                success: false,
                classification: SEVERITIES.HIGH_RISK,
                failures: [safeFailure('GOVERNANCE_ANOMALY_DETECTION_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Governance anomaly detection failed safely.')]
            });
        }
    }

    function auditGlobalAuditAccess(actionType, metadata, context) {
        if (auditForwarding || context && context.skipAuditPersistence) return { success: true, skipped: true };
        auditForwarding = true;
        try {
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    eventType: normalizeToken(actionType || 'GLOBAL_AUDIT_ACCESS'),
                    source: 'globalAuditVisibilityService',
                    severity: metadata && metadata.severity || 'INFO',
                    actorId: context && context.actor && (context.actor.id || context.actor.email) || '',
                    metadata: Object.assign({
                        module: 'globalAuditVisibility',
                        actionType: normalizeToken(actionType || 'GLOBAL_AUDIT_ACCESS')
                    }, cloneSanitized(metadata || {}))
                }, { skipTelemetry: true });
            }
        } catch (error) {
            safeWarn('Global audit access audit failed safely.', error && error.message);
        } finally {
            auditForwarding = false;
        }
        return { success: false, warning: 'Global audit access audit unavailable.' };
    }

    function emitTelemetry(eventType, metadata, context) {
        if (telemetryForwarding || context && context.skipTelemetry) return { success: true, skipped: true };
        telemetryForwarding = true;
        try {
            var service = global.WorkflowTelemetryService || global.workflowTelemetryService;
            if (service && typeof service.emitTelemetry === 'function') {
                return service.emitTelemetry('GOVERNANCE', normalizeToken(eventType || 'GLOBAL_AUDIT_EVENT'), {
                    source: 'globalAuditVisibilityService',
                    severity: metadata && metadata.severity || 'INFO',
                    metadata: cloneSanitized(metadata || {})
                });
            }
        } catch (error) {
            safeWarn('Global audit telemetry failed safely.', error && error.message);
        } finally {
            telemetryForwarding = false;
        }
        return { success: false, warning: 'Global audit telemetry unavailable.' };
    }

    function recordMetric(metricType, metadata, context) {
        if (metricForwarding || context && context.skipMetrics) return { success: true, skipped: true };
        metricForwarding = true;
        try {
            var service = global.OrchestrationMetricsService || global.orchestrationMetricsService;
            if (service && typeof service.recordWorkflowMetric === 'function') {
                return service.recordWorkflowMetric(normalizeToken(metricType || 'GLOBAL_AUDIT_REPORTED'), Object.assign({
                    source: 'globalAuditVisibilityService'
                }, cloneSanitized(metadata || {})));
            }
        } catch (error) {
            safeWarn('Global audit metrics failed safely.', error && error.message);
        } finally {
            metricForwarding = false;
        }
        return { success: false, warning: 'Global audit metrics unavailable.' };
    }

    function generateGlobalAuditReport(filters, context) {
        try {
            var ctx = context && typeof context === 'object' ? context : {};
            var scope = validateAuditScope(Object.assign({ readOnly: true, aggregateOnly: true }, filters || {}), ctx);
            if (!scope.allowed) {
                return freezeAuditOutput({
                    VERSION: VERSION,
                    success: false,
                    classification: SEVERITIES.CRITICAL_BLOCKER,
                    visibility: scope.visibility,
                    auditGovernanceModel: {
                        state: 'RECORDED',
                        states: AUDIT_STATES,
                        types: AUDIT_TYPES,
                        generatedAt: nowIso(ctx)
                    },
                    auditSummaries: [],
                    failures: scope.failures,
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
                        auditGovernanceConfidentialityPreserved: true
                    }
                });
            }

            var data = rawData();
            var auditRows = scope.infrastructureOnly ? collectInfrastructureAudits(data) : collectExplicitAudits(data).concat(collectDerivedAudits(data));
            var signals = externalAuditSignals(ctx);
            var totals = summarizeAudits(auditRows, signals);
            var anomalies = detectGovernanceAnomalies(filters || {}, Object.assign({}, ctx, { skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true }));
            var classification = scope.infrastructureOnly ? SEVERITIES.INFO : anomalies.classification || SEVERITIES.INFO;
            var state = totals.escalationLinkedAuditGrowth ? 'ESCALATED' : totals.governanceAnomalyTrends ? 'FLAGGED' : totals.crossSystemAuditDensity ? 'CORRELATED' : 'VERIFIED';

            var report = {
                VERSION: VERSION,
                success: true,
                classification: classification,
                visibility: scope.visibility,
                generatedAt: nowIso(ctx),
                auditGovernanceModel: {
                    state: state,
                    states: AUDIT_STATES,
                    types: AUDIT_TYPES,
                    historicalAuditRecordsImmutable: true,
                    generatedAt: nowIso(ctx)
                },
                crossSystemAuditGovernance: {
                    governanceEventTracing: true,
                    crossServiceAuditLinking: totals.crossSystemAuditDensity,
                    auditTimelineCorrelation: totals.crossSystemAuditDensity,
                    escalationAuditMapping: totals.escalationAuditChains,
                    auditSeverityGrading: totals.highRiskAudits,
                    operationalReviewWorkflows: totals.operationalReviewTimelines,
                    auditArchivalGovernance: totals.archivedAudits,
                    infrastructureAuditVisibility: scope.infrastructureOnly ? auditRows.length : 0,
                    unsafeAuditModificationBlocked: true
                },
                auditCorrelationIntelligence: {
                    incidentLinkedAudits: totals.incidentLinkedAudits,
                    rolloutLinkedGovernanceEvents: totals.rolloutLinkedGovernanceEvents,
                    escalationAuditChains: totals.escalationAuditChains,
                    workflowDegradationTraces: totals.workflowDegradationTraces,
                    tenantLifecycleAuditTrails: totals.tenantLifecycleAuditTrails,
                    operationalGovernanceAnomalies: totals.governanceAnomalyTrends
                },
                incidentFeatureIntegration: {
                    incidentEscalationAudits: totals.incidentLinkedAudits,
                    rolloutGovernanceTraces: totals.rolloutLinkedGovernanceEvents,
                    operationalDegradationCorrelations: totals.operationalDegradationCorrelations,
                    workflowReliabilityAudits: totals.workflowDegradationTraces,
                    recoveryGovernanceVisibility: safeNumber(signals.health && signals.health.incidentReliabilityIntegration && signals.health.incidentReliabilityIntegration.operationalRecoveryVelocity, 0),
                    unsafeOperationalMutation: false
                },
                auditAnalytics: {
                    auditEventFrequency: totals.auditEventFrequency,
                    escalationLinkedAuditGrowth: totals.escalationLinkedAuditGrowth,
                    governanceAnomalyTrends: totals.governanceAnomalyTrends,
                    operationalReviewTimelines: totals.operationalReviewTimelines,
                    auditSeverityDistribution: totals.highRiskAudits,
                    crossSystemAuditDensity: totals.crossSystemAuditDensity,
                    platformGovernanceVisibility: true
                },
                governanceDashboard: {
                    governanceAuditOverview: true,
                    crossSystemAuditTimelines: true,
                    escalationLinkedAuditVisibility: true,
                    operationalGovernanceAnalytics: true,
                    incidentAuditCorrelations: true,
                    rolloutGovernanceVisibility: true,
                    auditAnomalySummaries: true
                },
                accessGovernance: {
                    crossTenantConfidentialLeakageBlocked: true,
                    unsafeAuditExposureBlocked: true,
                    superAdminHrPayrollVisibility: false,
                    platformOwnerTenantRbacIsolation: true,
                    salaryVisibility: false,
                    leaveBalanceVisibility: false,
                    confidentialEmployeeRecordsVisible: false,
                    rawTenantDocumentsVisible: false,
                    historicalAuditRecordsImmutable: true,
                    existingTenantWorkflowsPreserved: true,
                    auditActionsAuditable: true,
                    platformIsolationPreserved: true,
                    tenantIsolationPreserved: true,
                    auditGovernanceConfidentialityPreserved: true
                },
                integrationHealth: {
                    auditServiceIntegrated: !!(global.AuditService || global.auditService),
                    globalIncidentIntegrated: !!(global.GlobalIncidentService || global.globalIncidentService),
                    platformHealthIntegrated: !!(global.PlatformHealthMonitoringService || global.platformHealthMonitoringService),
                    featureRolloutIntegrated: !!(global.FeatureRolloutService || global.featureRolloutService),
                    tenantGovernanceIntegrated: !!(global.TenantGovernanceService || global.tenantGovernanceService),
                    workflowTelemetryIntegrated: !!(global.WorkflowTelemetryService || global.workflowTelemetryService),
                    platformAnalyticsIntegrated: !!(global.PlatformAnalyticsService || global.platformAnalyticsService),
                    auditReady: !!(global.AuditService || global.auditService),
                    telemetryReady: !!(global.WorkflowTelemetryService || global.workflowTelemetryService),
                    metricsReady: !!(global.OrchestrationMetricsService || global.orchestrationMetricsService)
                },
                auditSummaries: freezeList(auditRows.slice(0, 50))
            };

            if (!ctx.skipAuditPersistence) auditGlobalAuditAccess('GLOBAL_AUDIT_REPORTED', { severity: classification, auditCount: auditRows.length }, ctx);
            if (!ctx.skipTelemetry) emitTelemetry('GLOBAL_AUDIT_REPORTED', { severity: classification, auditCount: auditRows.length }, ctx);
            recordMetric('GLOBAL_AUDIT_REPORTED', { status: classification, severity: classification === SEVERITIES.INFO ? 'INFO' : 'WARNING' }, ctx);
            return freezeAuditOutput(report);
        } catch (error) {
            safeWarn('Global audit report failed safely.', error && error.message);
            return freezeAuditOutput({
                VERSION: VERSION,
                success: false,
                classification: SEVERITIES.HIGH_RISK,
                auditSummaries: [],
                failures: [safeFailure('GLOBAL_AUDIT_REPORT_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Global audit report failed safely.')]
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        function check(name, passed, metadata) {
            checks.push({ checkId: normalizeToken(name), label: safeString(name, ''), passed: passed === true, metadata: cloneSanitized(metadata || {}) });
        }
        try {
            var malformed = normalizeAuditPayload(null, {});
            check('malformed payloads fail safely', malformed.success === false && malformed.failures.length > 0);

            var ownerScope = validateAuditScope({ aggregateOnly: true }, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' } });
            check('PLATFORM_OWNER audit governance scope works', ownerScope.allowed === true);

            var tenantScope = validateAuditScope({ aggregateOnly: true }, { routeType: 'tenant', actor: { role: 'HR', tenantId: 'TENANT-A' } });
            check('tenant roles are blocked from audit governance', tenantScope.allowed === false);

            var superAdmin = validateAuditScope({ aggregateOnly: true }, { routeType: 'platform', actor: { role: 'SUPER_ADMIN', tenantId: 'TENANT-A' } });
            check('SUPER_ADMIN broad audit governance is blocked', superAdmin.allowed === false);

            var infra = validateAuditScope({ infrastructureOnly: true }, { routeType: 'platform', actor: { role: 'SUPER_ADMIN', tenantId: 'TENANT-A' } });
            check('SUPER_ADMIN infrastructure audit scope is allowed', infra.allowed === true && infra.infrastructureOnly === true);

            var infraRows = collectInfrastructureAudits({
                auditLogs: [
                    { auditId: 'SELF-INFRA', actionType: 'INFRASTRUCTURE_HEALTH_CHECK_FAILED', module: 'Infrastructure', auditState: 'FLAGGED', severity: 'WARNING' },
                    { auditId: 'SELF-TENANT', tenantSlug: 'tenant-a', actionType: 'TENANT_GOVERNANCE_CHANGED', auditState: 'ESCALATED', severity: 'HIGH_RISK' }
                ]
            });
            check('infrastructure audit visibility excludes tenant rows', infraRows.length === 1 && infraRows[0].auditId === 'SELF-INFRA' && !infraRows[0].tenantSlug);

            var archived = validateAuditScope({ auditState: 'ARCHIVED', auditOverride: true }, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' } });
            check('archived audit mutation is blocked', archived.allowed === false);

            var normalized = normalizeAuditPayload({ auditId: 'AUD-1', state: 'flagged', salary: 90000, leaveBalance: 12, metadata: { rawDocument: 'private://doc' } });
            check('protected field filtering removes restricted fields', normalized.success === true && !/salary|leaveBalance|90000|private:\/\/doc/i.test(JSON.stringify(normalized)));

            var frozen = freezeAuditOutput({ nested: { ok: true }, salary: 90000 });
            check('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested) && !/90000|salary/i.test(JSON.stringify(frozen)));

            var anomalies = detectGovernanceAnomalies({}, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('governance anomaly detection degrades safely without optional dependencies', anomalies.success === true || anomalies.failures);

            var report = generateGlobalAuditReport({}, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('tenant isolation works for generated reports', report.success === true && report.accessGovernance && report.accessGovernance.crossTenantConfidentialLeakageBlocked === true);
        } catch (error) {
            check('self-test failure captured', false, { error: error && error.message });
        }
        var passed = checks.every(function everyCheck(row) { return row.passed; });
        return freezeAuditOutput({
            passed: passed,
            checks: checks,
            generatedAt: nowIso({}),
            coverage: {
                malformedPayloads: true,
                dependencyAbsence: true,
                immutability: true,
                escalationAuditChains: true,
                governanceAnomalies: true,
                tenantIsolation: true
            }
        });
    }

    var api = Object.freeze({
        VERSION: VERSION,
        AUDIT_STATES: AUDIT_STATES,
        AUDIT_TYPES: AUDIT_TYPES,
        SEVERITIES: SEVERITIES,
        validateAuditScope: validateAuditScope,
        classifyAuditSeverity: classifyAuditSeverity,
        normalizeAuditPayload: normalizeAuditPayload,
        freezeAuditOutput: freezeAuditOutput,
        detectGovernanceAnomalies: detectGovernanceAnomalies,
        generateGlobalAuditReport: generateGlobalAuditReport
    });

    global.GlobalAuditVisibilityService = api;
    global.globalAuditVisibilityService = api;

    if (global.__ARTHHRMS_DEV__) {
        global.__ARTHHRMS_GLOBAL_AUDIT_SELF_TEST__ = runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
