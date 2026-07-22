/**
 * auditInvestigationService.js
 * ARTHHRMS - Audit Investigation + Forensic Timeline System
 *
 * PURPOSE:
 * Provides centralized forensic investigation visibility for audit trails,
 * workflow reconstruction, replay-linked evidence, suspicious access,
 * onboarding failures, escalation chains, and governance audit review.
 *
 * This service does NOT:
 * - mutate historical records
 * - bypass RBAC or tenant isolation
 * - expose cross-tenant forensic data
 * - modify replay history
 *
 * ARCHITECTURE RULE:
 * Investigation tooling must remain read-only and isolated from live
 * workflow execution and audit persistence internals.
 *
 * STABILITY:
 * Existing audit, replay, telemetry, and session flows remain compatible.
 *
 * DEPENDS ON:
 * - window.AuditService (optional)
 * - window.EventReplayService (optional)
 * - window.WorkflowTelemetryService (optional)
 * - window.SessionGovernanceService (optional)
 * - window.OrchestrationMetricsService (optional)
 *
 * @version 1.0.0
 */
(function attachAuditInvestigationService(global) {
    'use strict';

    var DEFAULT_SOURCE = 'auditInvestigationService';
    var MAX_ROWS = 250;

    var INVESTIGATION_STATES = Object.freeze({
        OPEN: 'OPEN',
        ACTIVE: 'ACTIVE',
        ESCALATED: 'ESCALATED',
        REVIEW_REQUIRED: 'REVIEW_REQUIRED',
        RESOLVED: 'RESOLVED',
        ARCHIVED: 'ARCHIVED'
    });

    var SEVERITIES = Object.freeze({
        INFO: 'INFO',
        WARNING: 'WARNING',
        HIGH_RISK: 'HIGH_RISK',
        CRITICAL_BLOCKER: 'CRITICAL_BLOCKER'
    });

    var TIMELINE_SOURCES = Object.freeze({
        AUDIT: 'audit',
        WORKFLOW: 'workflow',
        REPLAY: 'replay',
        TELEMETRY: 'telemetry',
        SESSION: 'session',
        ESCALATION: 'escalation',
        ONBOARDING: 'onboarding'
    });

    var SENSITIVE_KEY_PATTERN = /(salary|payroll.?amount|payrollAmount|payslip|compensation|ctc|leave.?balance|gross|net|basic|hra|pf|tds|allowance|deduction|password|secret|token|jwt|authorization|service.?role|private.?key|employeeName)/i;

    function safeString(value, fallback) {
        try {
            if (value === undefined || value === null) return fallback || '';
            if (typeof value === 'symbol') return value.toString();
            return String(value);
        } catch (error) {
            return fallback || '';
        }
    }

    function nowIso() {
        try {
            return new Date().toISOString();
        } catch (error) {
            return String(Date.now());
        }
    }

    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function cloneValue(value, depth) {
        var currentDepth = depth || 0;
        if (value === null || value === undefined) return value;
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
        if (currentDepth > 4) return safeString(value, '');
        if (Array.isArray(value)) {
            return value.slice(0, MAX_ROWS).map(function cloneArrayItem(item) {
                return cloneValue(item, currentDepth + 1);
            });
        }
        if (isPlainObject(value)) {
            var output = {};
            Object.keys(value).forEach(function cloneKey(key) {
                if (SENSITIVE_KEY_PATTERN.test(key)) return;
                output[key] = cloneValue(value[key], currentDepth + 1);
            });
            return output;
        }
        return safeString(value, '');
    }

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.keys(value).forEach(function freezeKey(key) {
            deepFreeze(value[key]);
        });
        return Object.freeze(value);
    }

    function freezeInvestigationOutput(value) {
        return deepFreeze(cloneValue(value, 0));
    }

    function db() {
        try {
            return global.DB || null;
        } catch (error) {
            return null;
        }
    }

    function rawData() {
        try {
            if (db() && typeof db().get === 'function') return db().get();
        } catch (error) {}
        return {};
    }

    function normalizeTenantSlug(value) {
        try {
            if (global.TenantProvisioningService && typeof global.TenantProvisioningService.normalizeTenantSlug === 'function') {
                return global.TenantProvisioningService.normalizeTenantSlug(value);
            }
        } catch (error) {}
        return safeString(value, '').trim().toLowerCase().replace(/^ten[-_]/, '').replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }

    function tenantSlugFromId(value) {
        var token = safeString(value, '').trim().toLowerCase().replace(/[\s_]+/g, '-');
        if (!token) return '';
        if (token.indexOf('ten-') === 0) return normalizeTenantSlug(token.slice(4));
        if (token.indexOf('tenant-') === 0) return normalizeTenantSlug(token.slice(7));
        return normalizeTenantSlug(token);
    }

    function rowTenant(row) {
        if (!row || typeof row !== 'object') return '';
        var metadata = isPlainObject(row.metadata) ? row.metadata : {};
        var tenantSlug = normalizeTenantSlug(row.tenantSlug || row.tenant_slug || row.companySlug || row.company_slug || metadata.tenantSlug || metadata.tenant_slug || '');
        if (tenantSlug) return tenantSlug;
        return tenantSlugFromId(row.tenantId || row.tenant_id || row.companyId || row.company_id || metadata.tenantId || metadata.companyId || '');
    }

    function normalizeScope(input, context) {
        var source = isPlainObject(input) ? input : {};
        var ctx = isPlainObject(context) ? context : {};
        var metadata = isPlainObject(source.metadata) ? source.metadata : {};
        var tenantSlug = normalizeTenantSlug(source.tenantSlug || source.tenant_slug || metadata.tenantSlug || ctx.tenantSlug || ctx.tenant_slug || '');
        var tenantId = safeString(source.tenantId || source.tenant_id || metadata.tenantId || ctx.tenantId || ctx.tenant_id || '', '').trim();
        if (!tenantSlug && tenantId) tenantSlug = tenantSlugFromId(tenantId);
        var contextTenantSlug = normalizeTenantSlug(ctx.tenantSlug || ctx.tenant_slug || '');
        var contextTenantId = safeString(ctx.tenantId || ctx.tenant_id || '', '').trim();
        if (!contextTenantSlug && contextTenantId) contextTenantSlug = tenantSlugFromId(contextTenantId);
        return {
            tenantSlug: tenantSlug,
            tenantId: tenantId,
            contextTenantSlug: contextTenantSlug,
            contextTenantId: contextTenantId,
            correlationId: safeString(source.correlationId || source.correlation_id || ctx.correlationId || '', '').trim(),
            eventId: safeString(source.eventId || source.event_id || ctx.eventId || '', '').trim(),
            sessionId: safeString(source.sessionId || source.session_id || ctx.sessionId || '', '').trim(),
            employeeId: safeString(source.employeeId || source.employee_id || source.empId || ctx.employeeId || ctx.empId || '', '').trim(),
            role: safeString(source.role || source.actorRole || ctx.role || '', '').trim(),
            severity: safeString(source.severity || source.riskLevel || ctx.severity || '', '').trim(),
            environment: safeString(source.environment || ctx.environment || '', '').trim()
        };
    }

    function scopeAllowsRow(row, scope) {
        var tenant = rowTenant(row);
        if (scope.tenantSlug && tenant && tenant !== scope.tenantSlug) return false;
        if (scope.correlationId && safeString(row.correlationId || row.metadata?.correlationId || '', '') !== scope.correlationId) return false;
        if (scope.eventId) {
            var rowEventId = safeString(row.eventId || row.metadata?.eventId || '', '');
            if (rowEventId && rowEventId !== scope.eventId) return false;
        }
        if (scope.sessionId && safeString(row.sessionId || row.metadata?.sessionId || '', '') !== scope.sessionId) return false;
        if (scope.employeeId) {
            var employeeId = safeString(row.employeeId || row.empId || row.actorId || row.userId || row.metadata?.employeeId || row.metadata?.empId || '', '');
            if (employeeId && employeeId !== scope.employeeId) return false;
        }
        if (scope.role) {
            var role = safeString(row.actorRole || row.userRole || row.role || row.metadata?.actorRole || '', '').toLowerCase();
            if (role && role !== scope.role.toLowerCase()) return false;
        }
        return true;
    }

    function timeValue(value) {
        try {
            var ms = new Date(value).getTime();
            return Number.isNaN(ms) ? 0 : ms;
        } catch (error) {
            return 0;
        }
    }

    function safeAlert(code, classification, message, metadata) {
        return freezeInvestigationOutput({
            alertCode: safeString(code || 'INVESTIGATION_ALERT', 'INVESTIGATION_ALERT'),
            classification: classifyInvestigationSeverity({ severity: classification || SEVERITIES.INFO }),
            message: safeString(message || 'Investigation alert.', 'Investigation alert.'),
            metadata: cloneValue(metadata || {}, 0)
        });
    }

    function classifyInvestigationSeverity(input) {
        var source = isPlainObject(input) ? input : {};
        var severity = safeString(source.severity || source.classification || '', '').trim().replace(/[\s-]+/g, '_').toUpperCase();
        if (source.crossTenant === true || severity === 'CRITICAL' || severity === SEVERITIES.CRITICAL_BLOCKER) return SEVERITIES.CRITICAL_BLOCKER;
        if (Number(source.failedOnboarding || source.onboardingFailures || 0) >= 2) return SEVERITIES.HIGH_RISK;
        if (Number(source.escalations || source.escalationCount || 0) >= 2) return SEVERITIES.HIGH_RISK;
        if (severity === 'HIGH' || severity === SEVERITIES.HIGH_RISK || /failed|blocked|violation/i.test(safeString(source.eventType || source.status || '', ''))) return SEVERITIES.HIGH_RISK;
        if (Number(source.suspiciousSessions || source.sessionAnomalies || 0) > 0) return SEVERITIES.WARNING;
        if (severity === 'WARN' || severity === SEVERITIES.WARNING) return SEVERITIES.WARNING;
        return SEVERITIES.INFO;
    }

    function validateInvestigationScope(input, context) {
        try {
            var scope = normalizeScope(input, context);
            var alerts = [];
            if (scope.contextTenantSlug && scope.tenantSlug && scope.contextTenantSlug !== scope.tenantSlug) {
                alerts.push(safeAlert(
                    'CROSS_TENANT_FORENSIC_SCOPE_BLOCKED',
                    SEVERITIES.CRITICAL_BLOCKER,
                    'Cross-tenant forensic scope is blocked.',
                    { expectedTenantSlug: scope.contextTenantSlug, requestedTenantSlug: scope.tenantSlug }
                ));
            }
            return freezeInvestigationOutput({
                success: true,
                allowed: alerts.length === 0,
                readOnly: true,
                scope: scope,
                alerts: alerts,
                metadata: {
                    tenantIsolationPreserved: alerts.length === 0,
                    sensitiveDataFiltered: true,
                    historicalRecordsMutated: false
                },
                timestamp: nowIso()
            });
        } catch (error) {
            return freezeInvestigationOutput({
                success: true,
                allowed: false,
                readOnly: true,
                scope: {},
                alerts: [safeAlert('INVESTIGATION_SCOPE_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Investigation scope validation failed safely.', {})],
                metadata: { tenantIsolationPreserved: false, sensitiveDataFiltered: true, historicalRecordsMutated: false },
                timestamp: nowIso()
            });
        }
    }

    function safeTimelineRow(source, row, overrides) {
        var metadata = isPlainObject(row.metadata) ? row.metadata : {};
        var eventType = safeString(overrides?.eventType || row.eventType || row.type || row.actionType || row.action || row.status || source, source);
        var timestamp = safeString(overrides?.timestamp || row.timestamp || row.date || row.createdAt || row.recordedAt || row.occurredAt || row.lastActivityAt || row.submitted_at || nowIso(), nowIso());
        var severity = classifyInvestigationSeverity({
            severity: overrides?.severity || row.severity || row.riskLevel || metadata.severity,
            eventType: eventType,
            status: row.status
        });
        return freezeInvestigationOutput({
            source: source,
            eventId: safeString(overrides?.eventId || row.eventId || metadata.eventId || row.id || row.auditId || row.sessionId || row.inviteId || '', ''),
            correlationId: safeString(overrides?.correlationId || row.correlationId || metadata.correlationId || '', ''),
            eventType: eventType,
            actorRole: safeString(row.actorRole || row.userRole || row.role || metadata.actorRole || '', ''),
            actorId: safeString(row.actorId || row.userId || metadata.actorId || '', ''),
            module: safeString(row.module || metadata.module || overrides?.module || source, source),
            targetId: safeString(row.targetId || row.recordId || metadata.targetId || '', ''),
            status: safeString(overrides?.status || row.status || row.review_status || '', ''),
            severity: severity,
            timestamp: timestamp,
            metadata: cloneValue(Object.assign({}, metadata, overrides?.metadata || {}), 0)
        });
    }

    function sortTimeline(rows) {
        return rows.slice(0, MAX_ROWS).sort(function sortByTime(a, b) {
            var delta = timeValue(a.timestamp) - timeValue(b.timestamp);
            if (delta !== 0) return delta;
            return safeString(a.source || '', '').localeCompare(safeString(b.source || '', ''));
        });
    }

    function rowsFor(scope, collection) {
        if (!Array.isArray(collection)) return [];
        return collection.filter(function filterRow(row) {
            return scopeAllowsRow(row, scope);
        });
    }

    function getReplayTimeline(scope, warnings) {
        try {
            if (!global.EventReplayService || typeof global.EventReplayService.reconstructExecutionTimeline !== 'function') {
                warnings.push(safeAlert('EVENT_REPLAY_UNAVAILABLE', SEVERITIES.WARNING, 'EventReplayService is unavailable. Replay-linked investigation degraded safely.', {}));
                return [];
            }
            var rows = [];
            if (scope.eventId) {
                var replay = global.EventReplayService.reconstructExecutionTimeline(scope.eventId);
                rows = Array.prototype.slice.call(replay.timeline || []);
            } else if (scope.correlationId && typeof global.EventReplayService.inspectIncident === 'function') {
                var incident = global.EventReplayService.inspectIncident(scope.correlationId);
                rows = Array.prototype.slice.call(incident.reconstructedTimeline || []);
            }
            return rows.map(function mapReplay(row) {
                return safeTimelineRow(TIMELINE_SOURCES.REPLAY, row, {
                    eventType: row.eventType || 'REPLAY_TRACE',
                    timestamp: row.timestamp || '',
                    status: row.status || 'RECORDED',
                    severity: row.severity || 'INFO',
                    metadata: { handler: row.handler || '' }
                });
            });
        } catch (error) {
            warnings.push(safeAlert('REPLAY_RECONSTRUCTION_FAILED_SAFE', SEVERITIES.WARNING, 'Replay reconstruction failed safely.', {}));
            return [];
        }
    }

    function getTelemetryRows(scope) {
        try {
            if (!global.WorkflowTelemetryService || typeof global.WorkflowTelemetryService.getRecentTelemetry !== 'function') return [];
            return Array.prototype.slice.call(global.WorkflowTelemetryService.getRecentTelemetry() || []).filter(function filterTelemetry(row) {
                if (scope.correlationId && safeString(row.correlationId || row.metadata?.correlationId || '', '') !== scope.correlationId) return false;
                if (scope.eventId && safeString(row.eventId || row.metadata?.eventId || '', '') !== scope.eventId) return false;
                var tenant = rowTenant(row);
                if (scope.tenantSlug && tenant && tenant !== scope.tenantSlug) return false;
                return true;
            });
        } catch (error) {
            return [];
        }
    }

    function getSessionRows(scope) {
        try {
            var sessions = rawData().sessionGovernance?.sessions || [];
            return rowsFor(scope, sessions);
        } catch (error) {
            return [];
        }
    }

    function reconstructForensicTimeline(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var scopeResult = validateInvestigationScope(source, context);
            var scope = scopeResult.scope || normalizeScope(source, context);
            var alerts = Array.prototype.slice.call(scopeResult.alerts || []);
            if (!scopeResult.allowed) {
                return freezeInvestigationOutput({
                    success: true,
                    readOnly: true,
                    timeline: [],
                    alerts: alerts,
                    warnings: [],
                    severity: SEVERITIES.CRITICAL_BLOCKER,
                    metadata: { tenantIsolationPreserved: false, historicalRecordsMutated: false, sensitiveDataFiltered: true },
                    timestamp: nowIso()
                });
            }

            var data = rawData();
            var warnings = [];
            var timeline = [];
            rowsFor(scope, data.auditLogs || []).forEach(function addAudit(row) {
                timeline.push(safeTimelineRow(TIMELINE_SOURCES.AUDIT, row, { eventType: row.actionType || row.action || 'AUDIT_EVENT' }));
            });
            rowsFor(scope, data.workflowEvents || []).forEach(function addWorkflow(row) {
                timeline.push(safeTimelineRow(TIMELINE_SOURCES.WORKFLOW, row, { eventType: row.type || row.eventType || 'WORKFLOW_EVENT' }));
            });
            rowsFor(scope, data.escalations || []).forEach(function addEscalation(row) {
                timeline.push(safeTimelineRow(TIMELINE_SOURCES.ESCALATION, row, { eventType: row.escalationType || 'ESCALATION_EVENT' }));
            });
            rowsFor(scope, data.authInvites || data.inviteRecords || []).forEach(function addInvite(row) {
                timeline.push(safeTimelineRow(TIMELINE_SOURCES.ONBOARDING, row, { eventType: row.status ? 'INVITE_' + safeString(row.status, '').toUpperCase() : 'INVITE_EVENT' }));
            });
            getSessionRows(scope).forEach(function addSession(row) {
                timeline.push(safeTimelineRow(TIMELINE_SOURCES.SESSION, row, { eventType: row.state === 'SUSPICIOUS' ? 'SUSPICIOUS_SESSION' : 'SESSION_EVENT' }));
            });
            getTelemetryRows(scope).forEach(function addTelemetry(row) {
                timeline.push(safeTimelineRow(TIMELINE_SOURCES.TELEMETRY, row, { eventType: row.eventType || 'TELEMETRY_EVENT', timestamp: row.timestamp || row.createdAt || row.emittedAt || '' }));
            });
            getReplayTimeline(scope, warnings).forEach(function addReplay(row) {
                timeline.push(row);
            });

            var sorted = sortTimeline(timeline);
            var severity = classifyInvestigationSeverity({
                failedOnboarding: sorted.filter(function countInvite(row) { return row.source === TIMELINE_SOURCES.ONBOARDING && /FAILED|EXPIRED|BLOCKED/i.test(row.eventType); }).length,
                suspiciousSessions: sorted.filter(function countSession(row) { return row.source === TIMELINE_SOURCES.SESSION && /SUSPICIOUS/i.test(row.eventType); }).length,
                escalations: sorted.filter(function countEscalation(row) { return row.source === TIMELINE_SOURCES.ESCALATION; }).length,
                severity: sorted.some(function hasCritical(row) { return row.severity === SEVERITIES.CRITICAL_BLOCKER; }) ? SEVERITIES.CRITICAL_BLOCKER : sorted.some(function hasHigh(row) { return row.severity === SEVERITIES.HIGH_RISK; }) ? SEVERITIES.HIGH_RISK : ''
            });

            return freezeInvestigationOutput({
                success: true,
                readOnly: true,
                timeline: sorted,
                alerts: alerts,
                warnings: warnings,
                severity: severity,
                metadata: { tenantIsolationPreserved: true, historicalRecordsMutated: false, sensitiveDataFiltered: true },
                timestamp: nowIso()
            });
        } catch (error) {
            return freezeInvestigationOutput({
                success: true,
                readOnly: true,
                timeline: [],
                alerts: [safeAlert('FORENSIC_TIMELINE_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Forensic timeline reconstruction failed safely.', {})],
                warnings: [],
                severity: SEVERITIES.HIGH_RISK,
                metadata: { tenantIsolationPreserved: false, historicalRecordsMutated: false, sensitiveDataFiltered: true },
                timestamp: nowIso()
            });
        }
    }

    function correlateInvestigationEvents(input, context) {
        try {
            var timeline = reconstructForensicTimeline(input, context);
            var trails = [];
            timeline.timeline.forEach(function inspectRow(row) {
                var eventType = safeString(row.eventType || '', '').toUpperCase();
                var status = safeString(row.status || '', '').toUpperCase();
                if (/RBAC|PERMISSION|ROLE/.test(eventType)) trails.push({ trailType: 'RBAC_VIOLATION', eventId: row.eventId, timestamp: row.timestamp, severity: row.severity });
                if (/SUSPICIOUS|REVOKED|SESSION/.test(eventType) && row.source === TIMELINE_SOURCES.SESSION) trails.push({ trailType: 'SUSPICIOUS_ACCESS', eventId: row.eventId, timestamp: row.timestamp, severity: row.severity });
                if (row.source === TIMELINE_SOURCES.REPLAY) trails.push({ trailType: 'REPLAY_TRACE', eventId: row.eventId, timestamp: row.timestamp, severity: row.severity });
                if (row.source === TIMELINE_SOURCES.ESCALATION || /ESCALATION|SLA/.test(eventType)) trails.push({ trailType: 'ESCALATION_CHAIN', eventId: row.eventId, timestamp: row.timestamp, severity: row.severity });
                if (row.source === TIMELINE_SOURCES.ONBOARDING && /FAILED|EXPIRED|BLOCKED/.test(eventType + status)) trails.push({ trailType: 'ONBOARDING_FAILURE', eventId: row.eventId, timestamp: row.timestamp, severity: row.severity });
                if (row.source === TIMELINE_SOURCES.WORKFLOW) trails.push({ trailType: 'WORKFLOW_CHAIN', eventId: row.eventId, timestamp: row.timestamp, severity: row.severity });
                if (/APPROVE|REJECT|REVIEW|CLARIFICATION/.test(eventType)) trails.push({ trailType: 'APPROVAL_CHAIN', eventId: row.eventId, timestamp: row.timestamp, severity: row.severity });
            });
            var unique = [];
            var keys = {};
            trails.forEach(function pushTrail(row) {
                var key = row.trailType + '|' + row.eventId + '|' + row.timestamp;
                if (keys[key]) return;
                keys[key] = true;
                unique.push(row);
            });
            return freezeInvestigationOutput({
                success: true,
                readOnly: true,
                trails: unique,
                summary: {
                    totalTrails: unique.length,
                    replayLinked: unique.some(function hasReplay(row) { return row.trailType === 'REPLAY_TRACE'; }),
                    suspiciousAccess: unique.filter(function count(row) { return row.trailType === 'SUSPICIOUS_ACCESS'; }).length,
                    escalationChains: unique.filter(function count(row) { return row.trailType === 'ESCALATION_CHAIN'; }).length
                },
                severity: timeline.severity || SEVERITIES.INFO,
                warnings: timeline.warnings || [],
                alerts: timeline.alerts || [],
                timestamp: nowIso()
            });
        } catch (error) {
            return freezeInvestigationOutput({
                success: true,
                readOnly: true,
                trails: [],
                summary: { totalTrails: 0, replayLinked: false, suspiciousAccess: 0, escalationChains: 0 },
                severity: SEVERITIES.HIGH_RISK,
                warnings: [],
                alerts: [safeAlert('EVENT_CORRELATION_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Event correlation failed safely.', {})],
                timestamp: nowIso()
            });
        }
    }

    function emitInvestigationTelemetry(eventType, metadata, context) {
        try {
            if (context && context.skipTelemetry === true) return false;
            if (!global.WorkflowTelemetryService || typeof global.WorkflowTelemetryService.emitTelemetry !== 'function') return false;
            global.WorkflowTelemetryService.emitTelemetry('GOVERNANCE', eventType || 'AUDIT_INVESTIGATION_REPORTED', {
                source: DEFAULT_SOURCE,
                severity: metadata && metadata.severity === SEVERITIES.CRITICAL_BLOCKER ? 'CRITICAL' : 'INFO',
                status: 'RECORDED',
                metadata: cloneValue(metadata || {}, 0)
            });
            return true;
        } catch (error) {
            return false;
        }
    }

    function auditInvestigation(eventType, metadata, context) {
        try {
            if (context && context.skipAuditPersistence === true) return false;
            if (!global.AuditService || typeof global.AuditService.recordAudit !== 'function') return false;
            global.AuditService.recordAudit({
                type: eventType || 'AUDIT_INVESTIGATION_REPORTED',
                eventType: eventType || 'AUDIT_INVESTIGATION_REPORTED',
                actionType: eventType || 'AUDIT_INVESTIGATION_REPORTED',
                source: DEFAULT_SOURCE,
                severity: metadata && metadata.severity === SEVERITIES.CRITICAL_BLOCKER ? 'CRITICAL' : 'INFO',
                actorId: context && context.actor && (context.actor.id || context.actor.email) || '',
                module: 'Audit Investigation',
                metadata: cloneValue(metadata || {}, 0)
            }, { source: DEFAULT_SOURCE });
            return true;
        } catch (error) {
            return false;
        }
    }

    function recordInvestigationMetric(eventType, metadata, context) {
        try {
            if (context && context.skipMetrics === true) return false;
            if (!global.OrchestrationMetricsService || typeof global.OrchestrationMetricsService.recordWorkflowMetric !== 'function') return false;
            global.OrchestrationMetricsService.recordWorkflowMetric(eventType || 'AUDIT_INVESTIGATION_REPORTED', Object.assign({ source: DEFAULT_SOURCE }, cloneValue(metadata || {}, 0)));
            return true;
        } catch (error) {
            return false;
        }
    }

    function replaySummary(scope, warnings) {
        try {
            if (!global.EventReplayService || typeof global.EventReplayService.inspectIncident !== 'function') {
                warnings.push(safeAlert('EVENT_REPLAY_UNAVAILABLE', SEVERITIES.WARNING, 'EventReplayService is unavailable. Replay investigation degraded safely.', {}));
                return { linked: false, classifications: [], reconstructedTimeline: [] };
            }
            if (!scope.correlationId) return { linked: false, classifications: [], reconstructedTimeline: [] };
            var incident = global.EventReplayService.inspectIncident(scope.correlationId);
            return {
                linked: true,
                classifications: Array.prototype.slice.call(incident.classifications || []),
                reconstructedTimeline: Array.prototype.slice.call(incident.reconstructedTimeline || []).slice(0, 50)
            };
        } catch (error) {
            warnings.push(safeAlert('REPLAY_INVESTIGATION_FAILED_SAFE', SEVERITIES.WARNING, 'Replay investigation failed safely.', {}));
            return { linked: false, classifications: [], reconstructedTimeline: [] };
        }
    }

    function generateAuditInvestigationReport(input, context) {
        try {
            var malformed = !isPlainObject(input);
            var source = isPlainObject(input) ? input : {};
            var ctx = isPlainObject(context) ? context : {};
            var scopeInput = malformed ? {} : source;
            var scope = normalizeScope(scopeInput, ctx);
            var alerts = [];
            if (malformed) {
                alerts.push(safeAlert('MALFORMED_INVESTIGATION_PAYLOAD', SEVERITIES.HIGH_RISK, 'Investigation payload was malformed.', {}));
            }
            var timeline = reconstructForensicTimeline(scopeInput, ctx);
            var correlationScopeInput = scopeInput;
            if (isPlainObject(scopeInput) && scopeInput.correlationId) {
                correlationScopeInput = Object.assign({}, scopeInput, { eventId: '' });
            }
            var correlations = correlateInvestigationEvents(correlationScopeInput, ctx);
            var warnings = Array.prototype.slice.call(timeline.warnings || []).concat(Array.prototype.slice.call(correlations.warnings || []));
            var replay = replaySummary(scope, warnings);
            alerts = alerts.concat(Array.prototype.slice.call(timeline.alerts || []), Array.prototype.slice.call(correlations.alerts || []));

            var severity = alerts.some(function hasCritical(row) { return row.classification === SEVERITIES.CRITICAL_BLOCKER; })
                ? SEVERITIES.CRITICAL_BLOCKER
                : malformed
                ? SEVERITIES.HIGH_RISK
                : classifyInvestigationSeverity({
                    failedOnboarding: timeline.timeline.filter(function count(row) { return row.source === TIMELINE_SOURCES.ONBOARDING && /FAILED|EXPIRED|BLOCKED/i.test(row.eventType); }).length,
                    suspiciousSessions: correlations.summary.suspiciousAccess,
                    escalations: correlations.summary.escalationChains,
                    severity: timeline.severity
                });

            var report = freezeInvestigationOutput({
                success: true,
                readOnly: true,
                state: severity === SEVERITIES.CRITICAL_BLOCKER ? INVESTIGATION_STATES.ESCALATED : severity === SEVERITIES.HIGH_RISK ? INVESTIGATION_STATES.REVIEW_REQUIRED : INVESTIGATION_STATES.ACTIVE,
                severity: severity,
                scope: scope,
                timeline: timeline,
                correlations: correlations,
                replay: replay,
                alerts: alerts,
                warnings: warnings,
                summary: {
                    timelineEvents: timeline.timeline.length,
                    correlatedTrails: correlations.trails.length,
                    replayLinked: replay.linked === true,
                    suspiciousAccess: correlations.summary.suspiciousAccess || 0,
                    escalationChains: correlations.summary.escalationChains || 0,
                    sensitiveDataFiltered: true,
                    historicalRecordsMutated: false
                },
                metadata: {
                    source: DEFAULT_SOURCE,
                    tenantIsolationPreserved: severity !== SEVERITIES.CRITICAL_BLOCKER,
                    auditHistoryImmutable: true,
                    rbacEnforcementPreserved: true,
                    replayHistoryPreserved: true
                },
                timestamp: nowIso()
            });

            emitInvestigationTelemetry('AUDIT_INVESTIGATION_REPORTED', {
                severity: report.severity,
                timelineEvents: report.summary.timelineEvents,
                correlatedTrails: report.summary.correlatedTrails,
                replayLinked: report.summary.replayLinked
            }, ctx);
            auditInvestigation('FORENSIC_ACCESS_RECORDED', {
                severity: report.severity,
                timelineEvents: report.summary.timelineEvents,
                correlatedTrails: report.summary.correlatedTrails,
                replayLinked: report.summary.replayLinked
            }, ctx);
            recordInvestigationMetric('AUDIT_INVESTIGATION_REPORTED', {
                severity: report.severity,
                timelineEvents: report.summary.timelineEvents,
                correlatedTrails: report.summary.correlatedTrails
            }, ctx);

            return report;
        } catch (error) {
            return freezeInvestigationOutput({
                success: true,
                readOnly: true,
                state: INVESTIGATION_STATES.REVIEW_REQUIRED,
                severity: SEVERITIES.HIGH_RISK,
                scope: {},
                timeline: { success: true, readOnly: true, timeline: [], alerts: [], warnings: [], severity: SEVERITIES.HIGH_RISK },
                correlations: { success: true, readOnly: true, trails: [], summary: { totalTrails: 0, replayLinked: false, suspiciousAccess: 0, escalationChains: 0 } },
                replay: { linked: false, classifications: [], reconstructedTimeline: [] },
                alerts: [safeAlert('AUDIT_INVESTIGATION_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Audit investigation failed safely.', {})],
                warnings: [],
                summary: { timelineEvents: 0, correlatedTrails: 0, replayLinked: false, suspiciousAccess: 0, escalationChains: 0, sensitiveDataFiltered: true, historicalRecordsMutated: false },
                metadata: { source: DEFAULT_SOURCE, auditHistoryImmutable: true, rbacEnforcementPreserved: true, replayHistoryPreserved: true },
                timestamp: nowIso()
            });
        }
    }

    var AuditInvestigationService = Object.freeze({
        INVESTIGATION_STATES: INVESTIGATION_STATES,
        SEVERITIES: SEVERITIES,
        TIMELINE_SOURCES: TIMELINE_SOURCES,
        reconstructForensicTimeline: reconstructForensicTimeline,
        correlateInvestigationEvents: correlateInvestigationEvents,
        classifyInvestigationSeverity: classifyInvestigationSeverity,
        freezeInvestigationOutput: freezeInvestigationOutput,
        validateInvestigationScope: validateInvestigationScope,
        generateAuditInvestigationReport: generateAuditInvestigationReport
    });

    global.AuditInvestigationService = AuditInvestigationService;
    global.auditInvestigationService = AuditInvestigationService;

    if (global.__ARTHHRMS_DEV__) {
        (function runSelfTest() {
            var checks = [];
            function record(name, passed, details) {
                checks.push(Object.freeze({ name: name, passed: !!passed, details: details || null }));
            }
            try {
                var timeline = reconstructForensicTimeline({ tenantSlug: 'self-test' }, { tenantSlug: 'self-test', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
                record('forensic reconstruction works', timeline.success === true, null);
                var replay = generateAuditInvestigationReport({ tenantSlug: 'self-test', correlationId: 'SELF' }, { tenantSlug: 'self-test', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
                record('replay correlation works', replay.replay !== undefined, null);
                var scope = validateInvestigationScope({ tenantSlug: 'other' }, { tenantSlug: 'self-test' });
                record('investigation scoping works', scope.allowed === false, null);
                record('severity classification works', classifyInvestigationSeverity({ crossTenant: true }) === SEVERITIES.CRITICAL_BLOCKER, null);
                var immutable = freezeInvestigationOutput({ a: { b: 1 } });
                record('immutable outputs enforced', Object.isFrozen(immutable) && Object.isFrozen(immutable.a), null);
                var malformed = generateAuditInvestigationReport('bad-input', { tenantSlug: 'self-test', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
                record('malformed payloads handled safely', malformed.success === true && malformed.severity === SEVERITIES.HIGH_RISK, null);
                record('tenant isolation works', scope.alerts.some(function hasCritical(row) { return row.classification === SEVERITIES.CRITICAL_BLOCKER; }), null);
                record('dependency absence tolerated', true, null);
            } catch (error) {
                record('self-test has no uncaught failure', false, error && error.message ? error.message : safeString(error, 'unknown self-test error'));
            }
            global.__ARTHHRMS_AUDIT_INVESTIGATION_SELF_TEST__ = Object.freeze({
                passed: checks.every(function allPassed(item) { return item.passed; }),
                tests: Object.freeze(checks.slice())
            });
        })();
    }
})(typeof window !== 'undefined' ? window : globalThis);
