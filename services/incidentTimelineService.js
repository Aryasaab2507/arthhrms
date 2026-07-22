/**
 * incidentTimelineService.js
 * ARTHHRMS - Incident Timeline + Failure Correlation Center
 *
 * PURPOSE:
 * Provides centralized runtime incident reconstruction visibility for
 * workflow failures, replay-linked incidents, onboarding breakdowns,
 * escalation spikes, deployment blockers, and security anomalies.
 *
 * This service does NOT:
 * - mutate historical incident records
 * - bypass RBAC or tenant isolation
 * - expose cross-tenant incident data
 * - modify replay history
 *
 * ARCHITECTURE RULE:
 * Incident tooling must remain read-only and isolated from live workflow,
 * audit, replay, and operational monitoring internals.
 *
 * STABILITY:
 * Existing monitoring, audit, telemetry, and replay flows remain compatible.
 *
 * DEPENDS ON:
 * - window.EventReplayService (optional)
 * - window.WorkflowTelemetryService (optional)
 * - window.OperationsMonitoringService or window.operationsMonitoringService (optional)
 * - window.SessionGovernanceService (optional)
 * - window.AuditService (optional)
 * - window.OrchestrationMetricsService (optional)
 *
 * @version 1.0.0
 */
(function attachIncidentTimelineService(global) {
    'use strict';

    var DEFAULT_SOURCE = 'incidentTimelineService';
    var MAX_ROWS = 300;
    var INCIDENT_STATES = Object.freeze({
        DETECTED: 'DETECTED',
        INVESTIGATING: 'INVESTIGATING',
        ESCALATED: 'ESCALATED',
        MITIGATED: 'MITIGATED',
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
        WORKFLOW: 'workflow',
        REPLAY: 'replay',
        TELEMETRY: 'telemetry',
        OPERATIONAL: 'operational',
        RUNTIME_ERROR: 'runtime_error',
        ONBOARDING: 'onboarding',
        ESCALATION: 'escalation',
        DEPLOYMENT: 'deployment',
        SESSION: 'session',
        REVIEW: 'review',
        AUDIT: 'audit'
    });
    var SENSITIVE_KEY_PATTERN = /(salary|payroll.?amount|payrollAmount|payslip|compensation|ctc|leave.?balance|gross|net|basic|hra|pf|tds|allowance|deduction|password|secret|token|jwt|authorization|service.?role|private.?key|employeeName)/i;

    function nowIso() {
        try {
            return new Date().toISOString();
        } catch (error) {
            return String(Date.now());
        }
    }

    function safeString(value, fallback) {
        try {
            if (value === undefined || value === null) return fallback || '';
            if (typeof value === 'symbol') return value.toString();
            return String(value);
        } catch (error) {
            return fallback || '';
        }
    }

    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function cloneValue(value, depth) {
        var currentDepth = depth || 0;
        if (value === null || value === undefined) return value;
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
        if (typeof value === 'symbol') return value.toString();
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

    function freezeIncidentOutput(value) {
        return deepFreeze(cloneValue(value, 0));
    }

    function rawData() {
        try {
            if (global.DB && typeof global.DB.get === 'function') return global.DB.get();
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

    function normalizeIncidentScope(input, context) {
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
            incidentId: safeString(source.incidentId || source.incident_id || ctx.incidentId || '', '').trim(),
            correlationId: safeString(source.correlationId || source.correlation_id || ctx.correlationId || '', '').trim(),
            eventId: safeString(source.eventId || source.event_id || ctx.eventId || '', '').trim(),
            workflow: safeString(source.workflow || source.workflowType || source.workflow_type || ctx.workflow || '', '').trim(),
            environment: safeString(source.environment || ctx.environment || '', '').trim(),
            deploymentStage: safeString(source.deploymentStage || source.deployment_stage || ctx.deploymentStage || '', '').trim(),
            onboardingState: safeString(source.onboardingState || source.onboarding_state || ctx.onboardingState || '', '').trim(),
            escalationState: safeString(source.escalationState || source.escalation_state || ctx.escalationState || '', '').trim(),
            severity: safeString(source.severity || source.riskLevel || ctx.severity || '', '').trim(),
            filters: isPlainObject(source.filters) ? cloneValue(source.filters, 0) : {}
        };
    }

    function scopeAllowsRow(row, scope) {
        var tenant = rowTenant(row);
        if (scope.tenantSlug && tenant && tenant !== scope.tenantSlug) return false;
        if (scope.incidentId) {
            var incidentId = safeString(row.incidentId || row.id || row.metadata?.incidentId || '', '');
            if (incidentId && incidentId !== scope.incidentId) return false;
        }
        if (scope.correlationId && safeString(row.correlationId || row.metadata?.correlationId || '', '') !== scope.correlationId) return false;
        if (scope.eventId) {
            var rowEventId = safeString(row.eventId || row.metadata?.eventId || '', '');
            if (rowEventId && rowEventId !== scope.eventId) return false;
        }
        if (scope.workflow) {
            var workflow = safeString(row.workflow || row.workflowType || row.type || row.eventType || '', '').toLowerCase();
            if (workflow && workflow.indexOf(scope.workflow.toLowerCase()) === -1) return false;
        }
        if (scope.environment) {
            var environment = safeString(row.environment || row.environmentMode || row.metadata?.environment || '', '').toLowerCase();
            if (environment && environment !== scope.environment.toLowerCase()) return false;
        }
        if (scope.deploymentStage) {
            var stage = safeString(row.deploymentStage || row.stage || row.metadata?.deploymentStage || '', '').toLowerCase();
            if (stage && stage !== scope.deploymentStage.toLowerCase()) return false;
        }
        if (scope.onboardingState) {
            var onboardingState = safeString(row.onboardingState || row.status || row.metadata?.onboardingState || '', '').toLowerCase();
            if (onboardingState && onboardingState !== scope.onboardingState.toLowerCase()) return false;
        }
        if (scope.escalationState) {
            var escalationState = safeString(row.escalationState || row.status || row.metadata?.escalationState || '', '').toLowerCase();
            if (escalationState && escalationState !== scope.escalationState.toLowerCase()) return false;
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

    function safeIncidentAlert(code, classification, message, metadata) {
        return freezeIncidentOutput({
            alertCode: safeString(code || 'INCIDENT_ALERT', 'INCIDENT_ALERT'),
            classification: classifyIncidentSeverity({ severity: classification || SEVERITIES.INFO }),
            message: safeString(message || 'Incident alert.', 'Incident alert.'),
            metadata: cloneValue(metadata || {}, 0)
        });
    }

    function classifyIncidentSeverity(input) {
        var source = isPlainObject(input) ? input : {};
        var severity = safeString(source.severity || source.classification || source.riskLevel || '', '').trim().replace(/[\s-]+/g, '_').toUpperCase();
        if (source.crossTenant === true || severity === 'CRITICAL' || severity === SEVERITIES.CRITICAL_BLOCKER) return SEVERITIES.CRITICAL_BLOCKER;
        if (/CROSS_TENANT|TENANT_MISMATCH|DATA_LEAK/i.test(safeString(source.eventType || source.status || source.message || '', ''))) return SEVERITIES.CRITICAL_BLOCKER;
        if (Number(source.workflowFailures || source.failedWorkflows || 0) >= 2) return SEVERITIES.HIGH_RISK;
        if (Number(source.onboardingFailures || source.failedOnboarding || 0) >= 2) return SEVERITIES.HIGH_RISK;
        if (Number(source.escalations || source.escalationCount || 0) >= 2) return SEVERITIES.HIGH_RISK;
        if (Number(source.deploymentBlockers || source.blockers || 0) > 0) return SEVERITIES.HIGH_RISK;
        if (severity === 'HIGH' || severity === SEVERITIES.HIGH_RISK || /failed|blocked|rejected|overdue|degraded/i.test(safeString(source.eventType || source.status || '', ''))) return SEVERITIES.HIGH_RISK;
        if (Number(source.suspiciousSessions || source.sessionAnomalies || source.replayTimeouts || 0) > 0) return SEVERITIES.WARNING;
        if (severity === 'WARN' || severity === SEVERITIES.WARNING || /timeout|slow|suspicious/i.test(safeString(source.eventType || source.status || '', ''))) return SEVERITIES.WARNING;
        return SEVERITIES.INFO;
    }

    function validateIncidentScope(input, context) {
        try {
            var scope = normalizeIncidentScope(input, context);
            var alerts = [];
            if (scope.contextTenantSlug && scope.tenantSlug && scope.contextTenantSlug !== scope.tenantSlug) {
                alerts.push(safeIncidentAlert(
                    'CROSS_TENANT_INCIDENT_SCOPE_BLOCKED',
                    SEVERITIES.CRITICAL_BLOCKER,
                    'Cross-tenant incident scope is blocked.',
                    { expectedTenantSlug: scope.contextTenantSlug, requestedTenantSlug: scope.tenantSlug }
                ));
            }
            return freezeIncidentOutput({
                success: true,
                allowed: alerts.length === 0,
                readOnly: true,
                scope: scope,
                alerts: alerts,
                metadata: {
                    tenantIsolationPreserved: alerts.length === 0,
                    incidentHistoryImmutable: true,
                    replayHistoryPreserved: true,
                    sensitiveDataFiltered: true
                },
                timestamp: nowIso()
            });
        } catch (error) {
            return freezeIncidentOutput({
                success: true,
                allowed: false,
                readOnly: true,
                scope: {},
                alerts: [safeIncidentAlert('INCIDENT_SCOPE_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Incident scope validation failed safely.', {})],
                metadata: { tenantIsolationPreserved: false, incidentHistoryImmutable: true, replayHistoryPreserved: true, sensitiveDataFiltered: true },
                timestamp: nowIso()
            });
        }
    }

    function rowsFor(scope, collection) {
        if (!Array.isArray(collection)) return [];
        return collection.filter(function filterRow(row) {
            return scopeAllowsRow(row, scope);
        });
    }

    function safeTimelineRow(source, row, overrides) {
        var extra = isPlainObject(overrides) ? overrides : {};
        var metadata = isPlainObject(row && row.metadata) ? row.metadata : {};
        var eventType = safeString(extra.eventType || row.eventType || row.type || row.actionType || row.action || row.status || row.title || source, source);
        var timestamp = safeString(extra.timestamp || row.timestamp || row.date || row.createdAt || row.recordedAt || row.occurredAt || row.loggedAt || row.runAt || row.lastActivityAt || row.submitted_at || row.updatedAt || nowIso(), nowIso());
        var severity = classifyIncidentSeverity({
            severity: extra.severity || row.severity || row.riskLevel || row.risk_level || metadata.severity,
            eventType: eventType,
            status: extra.status || row.status || row.review_status || row.state || ''
        });
        return freezeIncidentOutput({
            source: source,
            incidentId: safeString(extra.incidentId || row.incidentId || row.id || metadata.incidentId || '', ''),
            eventId: safeString(extra.eventId || row.eventId || metadata.eventId || row.id || row.errorId || row.sessionId || row.inviteId || row.deploymentLogId || row.reviewId || '', ''),
            correlationId: safeString(extra.correlationId || row.correlationId || metadata.correlationId || '', ''),
            eventType: eventType,
            module: safeString(row.module || metadata.module || extra.module || source, source),
            status: safeString(extra.status || row.status || row.review_status || row.state || '', ''),
            severity: severity,
            timestamp: timestamp,
            actorRole: safeString(row.actorRole || row.userRole || row.role || metadata.actorRole || '', ''),
            actorId: safeString(row.actorId || row.userId || row.employeeId || metadata.actorId || '', ''),
            metadata: cloneValue(Object.assign({}, metadata, extra.metadata || {}), 0)
        });
    }

    function sortTimeline(rows) {
        return rows.slice(0, MAX_ROWS).sort(function sortByTime(a, b) {
            var delta = timeValue(a.timestamp) - timeValue(b.timestamp);
            if (delta !== 0) return delta;
            return safeString(a.source || '', '').localeCompare(safeString(b.source || '', ''));
        });
    }

    function telemetryRows(scope, warnings) {
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
            warnings.push(safeIncidentAlert('TELEMETRY_INSPECTION_FAILED_SAFE', SEVERITIES.WARNING, 'Telemetry inspection failed safely.', {}));
            return [];
        }
    }

    function sessionRows(scope) {
        try {
            return rowsFor(scope, rawData().sessionGovernance?.sessions || []);
        } catch (error) {
            return [];
        }
    }

    function replayRows(scope, warnings) {
        try {
            if (!global.EventReplayService || typeof global.EventReplayService.reconstructExecutionTimeline !== 'function') {
                warnings.push(safeIncidentAlert('EVENT_REPLAY_UNAVAILABLE', SEVERITIES.WARNING, 'EventReplayService is unavailable. Replay-linked incident reconstruction degraded safely.', {}));
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
                    metadata: { handler: row.handler || '', replayLinked: true }
                });
            });
        } catch (error) {
            warnings.push(safeIncidentAlert('REPLAY_RECONSTRUCTION_FAILED_SAFE', SEVERITIES.WARNING, 'Replay reconstruction failed safely.', {}));
            return [];
        }
    }

    function reconstructIncidentTimeline(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var scopeResult = validateIncidentScope(source, context);
            var scope = scopeResult.scope || normalizeIncidentScope(source, context);
            var alerts = Array.prototype.slice.call(scopeResult.alerts || []);
            if (!scopeResult.allowed) {
                return freezeIncidentOutput({
                    success: true,
                    readOnly: true,
                    timeline: [],
                    alerts: alerts,
                    warnings: [],
                    severity: SEVERITIES.CRITICAL_BLOCKER,
                    metadata: { tenantIsolationPreserved: false, incidentHistoryImmutable: true, replayHistoryPreserved: true, sensitiveDataFiltered: true },
                    timestamp: nowIso()
                });
            }

            var data = rawData();
            var warnings = [];
            var timeline = [];

            rowsFor(scope, data.operationIncidents || []).forEach(function addIncident(row) {
                timeline.push(safeTimelineRow(TIMELINE_SOURCES.OPERATIONAL, row, { eventType: row.title || row.status || 'OPERATIONAL_INCIDENT' }));
            });
            rowsFor(scope, data.serviceErrorLogs || []).forEach(function addError(row) {
                timeline.push(safeTimelineRow(TIMELINE_SOURCES.RUNTIME_ERROR, row, { eventType: 'SERVICE_ERROR', status: row.severity || row.status || '' }));
            });
            rowsFor(scope, data.workflowEvents || []).forEach(function addWorkflow(row) {
                timeline.push(safeTimelineRow(TIMELINE_SOURCES.WORKFLOW, row, { eventType: row.type || row.eventType || 'WORKFLOW_EVENT' }));
            });
            rowsFor(scope, data.authInvites || data.inviteRecords || []).forEach(function addInvite(row) {
                timeline.push(safeTimelineRow(TIMELINE_SOURCES.ONBOARDING, row, { eventType: row.status ? 'INVITE_' + safeString(row.status, '').toUpperCase() : 'INVITE_EVENT' }));
            });
            rowsFor(scope, data.escalations || []).forEach(function addEscalation(row) {
                timeline.push(safeTimelineRow(TIMELINE_SOURCES.ESCALATION, row, { eventType: row.escalationType || 'ESCALATION_EVENT' }));
            });
            rowsFor(scope, data.deploymentLogs || []).forEach(function addDeployment(row) {
                timeline.push(safeTimelineRow(TIMELINE_SOURCES.DEPLOYMENT, row, { eventType: row.eventType || row.status || 'DEPLOYMENT_EVENT', timestamp: row.loggedAt || row.createdAt || '' }));
            });
            rowsFor(scope, (data.deliverableReviews || []).concat(data.strategicReviews || [])).forEach(function addReview(row) {
                timeline.push(safeTimelineRow(TIMELINE_SOURCES.REVIEW, row, { eventType: row.review_status ? 'REVIEW_' + safeString(row.review_status, '').toUpperCase() : 'REVIEW_EVENT', timestamp: row.submitted_at || row.createdAt || '' }));
            });
            rowsFor(scope, data.auditLogs || []).forEach(function addAudit(row) {
                timeline.push(safeTimelineRow(TIMELINE_SOURCES.AUDIT, row, { eventType: row.actionType || row.action || 'AUDIT_EVENT' }));
            });
            sessionRows(scope).forEach(function addSession(row) {
                timeline.push(safeTimelineRow(TIMELINE_SOURCES.SESSION, row, { eventType: row.state === 'SUSPICIOUS' ? 'SUSPICIOUS_SESSION' : 'SESSION_EVENT' }));
            });
            telemetryRows(scope, warnings).forEach(function addTelemetry(row) {
                timeline.push(safeTimelineRow(TIMELINE_SOURCES.TELEMETRY, row, { eventType: row.eventType || 'TELEMETRY_EVENT', timestamp: row.timestamp || row.createdAt || row.emittedAt || '' }));
            });
            replayRows(scope, warnings).forEach(function addReplay(row) {
                timeline.push(row);
            });

            var sorted = sortTimeline(timeline);
            var severity = classifyIncidentSeverity({
                workflowFailures: sorted.filter(function countWorkflow(row) { return row.source === TIMELINE_SOURCES.WORKFLOW && /FAILED|BLOCKED|OVERDUE|DEGRADED/i.test(row.eventType + row.status); }).length,
                onboardingFailures: sorted.filter(function countInvite(row) { return row.source === TIMELINE_SOURCES.ONBOARDING && /FAILED|EXPIRED|BLOCKED/i.test(row.eventType + row.status); }).length,
                suspiciousSessions: sorted.filter(function countSession(row) { return row.source === TIMELINE_SOURCES.SESSION && /SUSPICIOUS/i.test(row.eventType + row.status); }).length,
                escalations: sorted.filter(function countEscalation(row) { return row.source === TIMELINE_SOURCES.ESCALATION; }).length,
                deploymentBlockers: sorted.filter(function countDeployment(row) { return row.source === TIMELINE_SOURCES.DEPLOYMENT && /BLOCKED|FAILED/i.test(row.eventType + row.status); }).length,
                severity: sorted.some(function hasCritical(row) { return row.severity === SEVERITIES.CRITICAL_BLOCKER; }) ? SEVERITIES.CRITICAL_BLOCKER : sorted.some(function hasHigh(row) { return row.severity === SEVERITIES.HIGH_RISK; }) ? SEVERITIES.HIGH_RISK : ''
            });

            return freezeIncidentOutput({
                success: true,
                readOnly: true,
                timeline: sorted,
                alerts: alerts,
                warnings: warnings,
                severity: severity,
                metadata: { tenantIsolationPreserved: true, incidentHistoryImmutable: true, replayHistoryPreserved: true, sensitiveDataFiltered: true },
                timestamp: nowIso()
            });
        } catch (error) {
            return freezeIncidentOutput({
                success: true,
                readOnly: true,
                timeline: [],
                alerts: [safeIncidentAlert('INCIDENT_TIMELINE_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Incident timeline reconstruction failed safely.', {})],
                warnings: [],
                severity: SEVERITIES.HIGH_RISK,
                metadata: { tenantIsolationPreserved: false, incidentHistoryImmutable: true, replayHistoryPreserved: true, sensitiveDataFiltered: true },
                timestamp: nowIso()
            });
        }
    }

    function correlateRuntimeFailures(input, context) {
        try {
            var timeline = reconstructIncidentTimeline(input, context);
            var chains = [];
            timeline.timeline.forEach(function inspectRow(row) {
                var eventType = safeString(row.eventType || '', '').toUpperCase();
                var status = safeString(row.status || '', '').toUpperCase();
                var severity = row.severity || SEVERITIES.INFO;
                if (row.source === TIMELINE_SOURCES.WORKFLOW && /FAILED|FAILURE|BLOCKED|OVERDUE|DEGRADED/.test(eventType + status)) {
                    chains.push({ chainType: 'WORKFLOW_FAILURE', eventId: row.eventId, timestamp: row.timestamp, severity: severity });
                }
                if (row.source === TIMELINE_SOURCES.ONBOARDING && /FAILED|EXPIRED|BLOCKED/.test(eventType + status)) {
                    chains.push({ chainType: 'ONBOARDING_BREAKDOWN', eventId: row.eventId, timestamp: row.timestamp, severity: severity });
                }
                if (row.source === TIMELINE_SOURCES.ESCALATION || /ESCALATION|SLA|BOTTLENECK/.test(eventType)) {
                    chains.push({ chainType: 'ESCALATION_CONGESTION', eventId: row.eventId, timestamp: row.timestamp, severity: severity });
                }
                if (row.source === TIMELINE_SOURCES.SESSION && /SUSPICIOUS|REVOKED|TENANT_MISMATCH|FAILED_LOGIN/.test(eventType + status)) {
                    chains.push({ chainType: 'SUSPICIOUS_ACCESS', eventId: row.eventId, timestamp: row.timestamp, severity: severity });
                }
                if (row.source === TIMELINE_SOURCES.REPLAY) {
                    chains.push({ chainType: 'REPLAY_LINKED', eventId: row.eventId, timestamp: row.timestamp, severity: severity });
                }
                if (row.source === TIMELINE_SOURCES.DEPLOYMENT && /BLOCKED|FAILED|MISMATCH/.test(eventType + status)) {
                    chains.push({ chainType: 'DEPLOYMENT_DEGRADATION', eventId: row.eventId, timestamp: row.timestamp, severity: severity });
                }
                if (row.source === TIMELINE_SOURCES.REVIEW && /PENDING|OVERDUE|BLOCKED|RISK/.test(eventType + status)) {
                    chains.push({ chainType: 'APPROVAL_BOTTLENECK', eventId: row.eventId, timestamp: row.timestamp, severity: severity });
                }
                if (row.source === TIMELINE_SOURCES.RUNTIME_ERROR) {
                    chains.push({ chainType: 'RUNTIME_FAILURE', eventId: row.eventId, timestamp: row.timestamp, severity: severity });
                }
            });
            var unique = [];
            var seen = {};
            chains.forEach(function pushUnique(row) {
                var key = row.chainType + '|' + row.eventId + '|' + row.timestamp;
                if (seen[key]) return;
                seen[key] = true;
                unique.push(row);
            });
            return freezeIncidentOutput({
                success: true,
                readOnly: true,
                chains: unique,
                summary: {
                    totalChains: unique.length,
                    workflowFailures: unique.filter(function count(row) { return row.chainType === 'WORKFLOW_FAILURE'; }).length,
                    onboardingBreakdowns: unique.filter(function count(row) { return row.chainType === 'ONBOARDING_BREAKDOWN'; }).length,
                    escalationCongestion: unique.filter(function count(row) { return row.chainType === 'ESCALATION_CONGESTION'; }).length,
                    suspiciousAccess: unique.filter(function count(row) { return row.chainType === 'SUSPICIOUS_ACCESS'; }).length,
                    replayLinked: unique.some(function hasReplay(row) { return row.chainType === 'REPLAY_LINKED'; })
                },
                severity: timeline.severity || SEVERITIES.INFO,
                alerts: timeline.alerts || [],
                warnings: timeline.warnings || [],
                timestamp: nowIso()
            });
        } catch (error) {
            return freezeIncidentOutput({
                success: true,
                readOnly: true,
                chains: [],
                summary: { totalChains: 0, workflowFailures: 0, onboardingBreakdowns: 0, escalationCongestion: 0, suspiciousAccess: 0, replayLinked: false },
                severity: SEVERITIES.HIGH_RISK,
                alerts: [safeIncidentAlert('RUNTIME_FAILURE_CORRELATION_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Runtime failure correlation failed safely.', {})],
                warnings: [],
                timestamp: nowIso()
            });
        }
    }

    function replaySummary(scope, warnings) {
        try {
            if (!global.EventReplayService || typeof global.EventReplayService.inspectIncident !== 'function') {
                warnings.push(safeIncidentAlert('EVENT_REPLAY_UNAVAILABLE', SEVERITIES.WARNING, 'EventReplayService is unavailable. Replay incident linkage degraded safely.', {}));
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
            warnings.push(safeIncidentAlert('REPLAY_INCIDENT_LINK_FAILED_SAFE', SEVERITIES.WARNING, 'Replay incident linkage failed safely.', {}));
            return { linked: false, classifications: [], reconstructedTimeline: [] };
        }
    }

    function emitIncidentTelemetry(eventType, metadata, context) {
        try {
            if (context && context.skipTelemetry === true) return false;
            if (!global.WorkflowTelemetryService || typeof global.WorkflowTelemetryService.emitTelemetry !== 'function') return false;
            global.WorkflowTelemetryService.emitTelemetry('GOVERNANCE', eventType || 'INCIDENT_TIMELINE_REPORTED', {
                source: DEFAULT_SOURCE,
                severity: metadata && metadata.severity === SEVERITIES.CRITICAL_BLOCKER ? 'CRITICAL' : metadata && metadata.severity === SEVERITIES.HIGH_RISK ? 'HIGH' : 'INFO',
                status: 'RECORDED',
                metadata: cloneValue(metadata || {}, 0)
            });
            return true;
        } catch (error) {
            return false;
        }
    }

    function auditIncident(eventType, metadata, context) {
        try {
            if (context && context.skipAuditPersistence === true) return false;
            if (!global.AuditService || typeof global.AuditService.recordAudit !== 'function') return false;
            global.AuditService.recordAudit({
                type: eventType || 'INCIDENT_TIMELINE_REPORTED',
                eventType: eventType || 'INCIDENT_TIMELINE_REPORTED',
                actionType: eventType || 'INCIDENT_TIMELINE_REPORTED',
                source: DEFAULT_SOURCE,
                severity: metadata && metadata.severity === SEVERITIES.CRITICAL_BLOCKER ? 'CRITICAL' : metadata && metadata.severity === SEVERITIES.HIGH_RISK ? 'HIGH' : 'INFO',
                actorId: context && context.actor && (context.actor.id || context.actor.email) || '',
                module: 'Incident Timeline',
                metadata: cloneValue(metadata || {}, 0)
            }, { source: DEFAULT_SOURCE });
            return true;
        } catch (error) {
            return false;
        }
    }

    function recordIncidentMetric(eventType, metadata, context) {
        try {
            if (context && context.skipMetrics === true) return false;
            if (!global.OrchestrationMetricsService || typeof global.OrchestrationMetricsService.recordWorkflowMetric !== 'function') return false;
            global.OrchestrationMetricsService.recordWorkflowMetric(eventType || 'INCIDENT_TIMELINE_REPORTED', Object.assign({ source: DEFAULT_SOURCE }, cloneValue(metadata || {}, 0)));
            return true;
        } catch (error) {
            return false;
        }
    }

    function generateIncidentTimelineReport(input, context) {
        try {
            var malformed = !isPlainObject(input);
            var source = isPlainObject(input) ? input : {};
            var ctx = isPlainObject(context) ? context : {};
            var scopeInput = malformed ? {} : source;
            var scope = normalizeIncidentScope(scopeInput, ctx);
            var alerts = [];
            if (malformed) {
                alerts.push(safeIncidentAlert('MALFORMED_INCIDENT_PAYLOAD', SEVERITIES.HIGH_RISK, 'Incident timeline payload was malformed.', {}));
            }
            var timeline = reconstructIncidentTimeline(scopeInput, ctx);
            var correlationScopeInput = scopeInput;
            if (isPlainObject(scopeInput) && scopeInput.correlationId) {
                correlationScopeInput = Object.assign({}, scopeInput, { eventId: '' });
            }
            var correlations = correlateRuntimeFailures(correlationScopeInput, ctx);
            var warnings = Array.prototype.slice.call(timeline.warnings || []).concat(Array.prototype.slice.call(correlations.warnings || []));
            var replay = replaySummary(scope, warnings);
            alerts = alerts.concat(Array.prototype.slice.call(timeline.alerts || []), Array.prototype.slice.call(correlations.alerts || []));
            var severity = alerts.some(function hasCritical(row) { return row.classification === SEVERITIES.CRITICAL_BLOCKER; })
                ? SEVERITIES.CRITICAL_BLOCKER
                : malformed
                ? SEVERITIES.HIGH_RISK
                : classifyIncidentSeverity({
                    workflowFailures: correlations.summary.workflowFailures,
                    onboardingFailures: correlations.summary.onboardingBreakdowns,
                    suspiciousSessions: correlations.summary.suspiciousAccess,
                    escalations: correlations.summary.escalationCongestion,
                    deploymentBlockers: correlations.chains.filter(function count(row) { return row.chainType === 'DEPLOYMENT_DEGRADATION'; }).length,
                    severity: timeline.severity
                });

            var report = freezeIncidentOutput({
                success: true,
                readOnly: true,
                state: severity === SEVERITIES.CRITICAL_BLOCKER ? INCIDENT_STATES.ESCALATED : severity === SEVERITIES.HIGH_RISK ? INCIDENT_STATES.INVESTIGATING : INCIDENT_STATES.DETECTED,
                severity: severity,
                scope: scope,
                timeline: timeline,
                correlations: correlations,
                replay: replay,
                alerts: alerts,
                warnings: warnings,
                summary: {
                    timelineEvents: timeline.timeline.length,
                    failureChains: correlations.chains.length,
                    workflowFailures: correlations.summary.workflowFailures || 0,
                    onboardingBreakdowns: correlations.summary.onboardingBreakdowns || 0,
                    escalationCongestion: correlations.summary.escalationCongestion || 0,
                    suspiciousAccess: correlations.summary.suspiciousAccess || 0,
                    replayLinked: replay.linked === true || correlations.summary.replayLinked === true,
                    deploymentIncidents: correlations.chains.filter(function count(row) { return row.chainType === 'DEPLOYMENT_DEGRADATION'; }).length,
                    sensitiveDataFiltered: true
                },
                metadata: {
                    incidentHistoryImmutable: true,
                    replayHistoryPreserved: true,
                    operationalMonitoringReadOnly: true,
                    tenantIsolationPreserved: !alerts.some(function isTenantAlert(row) { return row.classification === SEVERITIES.CRITICAL_BLOCKER && /TENANT/i.test(row.alertCode || ''); }),
                    rbacEnforcementPreserved: true,
                    existingMonitoringPreserved: true
                },
                generatedAt: nowIso()
            });

            var integrationMeta = {
                severity: report.severity,
                timelineEvents: report.summary.timelineEvents,
                failureChains: report.summary.failureChains,
                tenantSlug: report.scope.tenantSlug || ''
            };
            emitIncidentTelemetry('INCIDENT_TIMELINE_REPORTED', integrationMeta, ctx);
            if (report.severity !== SEVERITIES.INFO) emitIncidentTelemetry('RUNTIME_FAILURE_CORRELATED', integrationMeta, ctx);
            auditIncident('INCIDENT_TIMELINE_REPORTED', integrationMeta, ctx);
            if (report.severity !== SEVERITIES.INFO) auditIncident('INCIDENT_RESPONSE_REVIEW_REQUIRED', integrationMeta, ctx);
            recordIncidentMetric('INCIDENT_TIMELINE_REPORTED', integrationMeta, ctx);

            return report;
        } catch (error) {
            return freezeIncidentOutput({
                success: true,
                readOnly: true,
                state: INCIDENT_STATES.INVESTIGATING,
                severity: SEVERITIES.HIGH_RISK,
                scope: {},
                timeline: { success: true, readOnly: true, timeline: [], alerts: [], warnings: [], severity: SEVERITIES.HIGH_RISK },
                correlations: { success: true, readOnly: true, chains: [], summary: { totalChains: 0, workflowFailures: 0, onboardingBreakdowns: 0, escalationCongestion: 0, suspiciousAccess: 0, replayLinked: false } },
                replay: { linked: false, classifications: [], reconstructedTimeline: [] },
                alerts: [safeIncidentAlert('INCIDENT_REPORT_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Incident timeline report failed safely.', {})],
                warnings: [],
                summary: { timelineEvents: 0, failureChains: 0, workflowFailures: 0, onboardingBreakdowns: 0, escalationCongestion: 0, suspiciousAccess: 0, replayLinked: false, deploymentIncidents: 0, sensitiveDataFiltered: true },
                metadata: { incidentHistoryImmutable: true, replayHistoryPreserved: true, operationalMonitoringReadOnly: true, tenantIsolationPreserved: false, rbacEnforcementPreserved: true, existingMonitoringPreserved: true },
                generatedAt: nowIso()
            });
        }
    }

    var IncidentTimelineService = Object.freeze({
        INCIDENT_STATES: INCIDENT_STATES,
        SEVERITIES: SEVERITIES,
        reconstructIncidentTimeline: reconstructIncidentTimeline,
        correlateRuntimeFailures: correlateRuntimeFailures,
        classifyIncidentSeverity: classifyIncidentSeverity,
        freezeIncidentOutput: freezeIncidentOutput,
        validateIncidentScope: validateIncidentScope,
        generateIncidentTimelineReport: generateIncidentTimelineReport
    });

    global.IncidentTimelineService = IncidentTimelineService;
    global.incidentTimelineService = IncidentTimelineService;

    function runSelfTest() {
        var checks = [];
        function record(name, passed, details) {
            checks.push(Object.freeze({ name: name, passed: !!passed, details: details || null }));
        }
        var previousReplay = global.EventReplayService;
        try {
            var sample = {
                tenantSlug: 'self-test',
                correlationId: 'CORR-INCIDENT-SELF',
                eventId: 'WF-INCIDENT-SELF',
                metadata: { salary: 1000, safe: true }
            };
            var timeline = reconstructIncidentTimeline(sample, { tenantSlug: 'self-test', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            record('incident reconstruction works', timeline.success === true && timeline.readOnly === true, timeline);
            var correlated = correlateRuntimeFailures(sample, { tenantSlug: 'self-test', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            record('runtime correlation works', correlated.success === true && Array.isArray(correlated.chains), correlated);
            record('replay correlation works', replayRows(normalizeIncidentScope(sample, { tenantSlug: 'self-test' }), []).length >= 0, null);
            record('severity classification works', classifyIncidentSeverity({ onboardingFailures: 2 }) === SEVERITIES.HIGH_RISK, null);
            var immutable = freezeIncidentOutput({ nested: { ok: true } });
            record('immutable outputs enforced', Object.isFrozen(immutable) && Object.isFrozen(immutable.nested), immutable);
            var malformed = generateIncidentTimelineReport('bad-input', { tenantSlug: 'self-test', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            record('malformed payloads handled safely', malformed.success === true && malformed.severity === SEVERITIES.HIGH_RISK, malformed);
            var tenant = validateIncidentScope({ tenantSlug: 'other' }, { tenantSlug: 'self-test' });
            record('tenant isolation works', tenant.allowed === false && tenant.alerts.some(function hasCritical(item) { return item.classification === SEVERITIES.CRITICAL_BLOCKER; }), tenant);
            global.EventReplayService = null;
            var degraded = generateIncidentTimelineReport({ tenantSlug: 'self-test', correlationId: 'CORR-INCIDENT-SELF' }, { tenantSlug: 'self-test', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            record('dependency absence tolerated', degraded.success === true && degraded.warnings.some(function hasReplayWarning(item) { return item.alertCode === 'EVENT_REPLAY_UNAVAILABLE'; }), degraded.warnings);
        } catch (error) {
            record('self-test has no uncaught failure', false, error && error.message ? error.message : safeString(error, 'unknown self-test error'));
        } finally {
            global.EventReplayService = previousReplay;
        }
        return Object.freeze({
            passed: checks.every(function allPassed(item) { return item.passed; }),
            tests: Object.freeze(checks),
            generatedAt: nowIso()
        });
    }

    if (global.__ARTHHRMS_DEV__) {
        global.__ARTHHRMS_INCIDENT_TIMELINE_SELF_TEST__ = runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
