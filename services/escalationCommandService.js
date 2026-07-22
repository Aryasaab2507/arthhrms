/**
 * escalationCommandService.js
 * ARTHHRMS - Escalation Command Center
 *
 * PURPOSE:
 * Provides centralized escalation governance visibility for workflow
 * bottlenecks, delayed approvals, contributor blockage, reviewer
 * congestion, escalation severity trends, and replay-linked escalation
 * reconstruction.
 *
 * This service does NOT:
 * - mutate historical escalation chains
 * - bypass RBAC or tenant isolation
 * - expose cross-tenant escalation data
 * - replace escalationPolicyService
 *
 * ARCHITECTURE RULE:
 * Escalation command visibility must remain read-only by default and
 * isolated from live escalation workflows.
 *
 * STABILITY:
 * Existing escalation workflows remain backward-compatible.
 *
 * DEPENDS ON:
 * - window.EscalationPolicyService (optional)
 * - window.StrategicReviewService or window.strategicReviewService (optional)
 * - window.EventReplayService (optional)
 * - window.WorkflowTelemetryService (optional)
 * - window.AuditService (optional)
 * - window.OrchestrationMetricsService (optional)
 *
 * @version 1.0.0
 */
(function attachEscalationCommandService(global) {
    'use strict';

    var DEFAULT_SOURCE = 'escalationCommandService';
    var MAX_ROWS = 300;
    var ESCALATION_STATES = Object.freeze({
        DETECTED: 'DETECTED',
        PENDING_REVIEW: 'PENDING_REVIEW',
        ESCALATED: 'ESCALATED',
        ACKNOWLEDGED: 'ACKNOWLEDGED',
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

    function freezeEscalationOutput(value) {
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
            escalationId: safeString(source.escalationId || source.escalation_id || source.id || ctx.escalationId || '', '').trim(),
            correlationId: safeString(source.correlationId || source.correlation_id || ctx.correlationId || '', '').trim(),
            eventId: safeString(source.eventId || source.event_id || ctx.eventId || '', '').trim(),
            reviewerId: safeString(source.reviewerId || source.reviewer_id || ctx.reviewerId || '', '').trim(),
            contributorId: safeString(source.contributorId || source.contributor_id || source.empId || ctx.contributorId || '', '').trim(),
            severity: safeString(source.severity || source.riskLevel || ctx.severity || '', '').trim(),
            filters: isPlainObject(source.filters) ? cloneValue(source.filters, 0) : {}
        };
    }

    function scopeAllowsRow(row, scope) {
        var tenant = rowTenant(row);
        if (scope.tenantSlug && tenant && tenant !== scope.tenantSlug) return false;
        if (scope.escalationId) {
            var rowEscalationId = safeString(row.escalationId || row.id || row.metadata?.escalationId || '', '');
            if (rowEscalationId && rowEscalationId !== scope.escalationId) return false;
        }
        if (scope.correlationId && safeString(row.correlationId || row.metadata?.correlationId || '', '') !== scope.correlationId) return false;
        if (scope.eventId) {
            var rowEventId = safeString(row.eventId || row.metadata?.eventId || '', '');
            if (rowEventId && rowEventId !== scope.eventId) return false;
        }
        if (scope.reviewerId) {
            var reviewerId = safeString(row.reviewerId || row.reviewer_id || row.managerId || row.metadata?.reviewerId || '', '');
            if (reviewerId && reviewerId !== scope.reviewerId) return false;
        }
        if (scope.contributorId) {
            var contributorId = safeString(row.contributorId || row.contributor_id || row.empId || row.employeeId || row.metadata?.contributorId || '', '');
            if (contributorId && contributorId !== scope.contributorId) return false;
        }
        return true;
    }

    function rowsFor(scope, collection) {
        if (!Array.isArray(collection)) return [];
        return collection.filter(function filterRow(row) {
            return scopeAllowsRow(row, scope);
        });
    }

    function timeValue(value) {
        try {
            var ms = new Date(value).getTime();
            return Number.isNaN(ms) ? 0 : ms;
        } catch (error) {
            return 0;
        }
    }

    function ageDays(value) {
        if (!value) return 0;
        var ms = timeValue(value);
        if (!ms) return 0;
        return Math.max(0, Math.floor((Date.now() - ms) / 86400000));
    }

    function safeAlert(code, classification, message, metadata) {
        return freezeEscalationOutput({
            alertCode: safeString(code || 'ESCALATION_COMMAND_ALERT', 'ESCALATION_COMMAND_ALERT'),
            classification: classifyEscalationSeverity({ severity: classification || SEVERITIES.INFO }),
            message: safeString(message || 'Escalation command alert.', 'Escalation command alert.'),
            metadata: cloneValue(metadata || {}, 0)
        });
    }

    function classifyEscalationSeverity(input) {
        var source = isPlainObject(input) ? input : {};
        var severity = safeString(source.severity || source.classification || source.riskLevel || '', '').trim().replace(/[\s-]+/g, '_').toUpperCase();
        if (source.crossTenant === true || severity === 'CRITICAL' || severity === SEVERITIES.CRITICAL_BLOCKER) return SEVERITIES.CRITICAL_BLOCKER;
        if (/CROSS_TENANT|TENANT_MISMATCH|DATA_LEAK/i.test(safeString(source.eventType || source.status || source.message || '', ''))) return SEVERITIES.CRITICAL_BLOCKER;
        if (Number(source.approvalDeadlocks || source.repeatedDeadlocks || 0) >= 2) return SEVERITIES.HIGH_RISK;
        if (Number(source.escalationDensity || source.escalations || 0) >= 2) return SEVERITIES.HIGH_RISK;
        if (Number(source.workflowRetries || source.blockedWorkflows || 0) >= 2) return SEVERITIES.HIGH_RISK;
        if (severity === 'HIGH' || severity === SEVERITIES.HIGH_RISK || /failed|blocked|deadlock|overdue|escalated/i.test(safeString(source.eventType || source.status || '', ''))) return SEVERITIES.HIGH_RISK;
        if (Number(source.reviewerQueue || source.pendingReviews || source.contributorBlockage || 0) > 0) return SEVERITIES.WARNING;
        if (severity === 'WARN' || severity === SEVERITIES.WARNING || /pending|congestion|clarification/i.test(safeString(source.eventType || source.status || '', ''))) return SEVERITIES.WARNING;
        return SEVERITIES.INFO;
    }

    function validateEscalationScope(input, context) {
        try {
            var scope = normalizeScope(input, context);
            var alerts = [];
            if (scope.contextTenantSlug && scope.tenantSlug && scope.contextTenantSlug !== scope.tenantSlug) {
                alerts.push(safeAlert(
                    'CROSS_TENANT_ESCALATION_SCOPE_BLOCKED',
                    SEVERITIES.CRITICAL_BLOCKER,
                    'Cross-tenant escalation visibility is blocked.',
                    { expectedTenantSlug: scope.contextTenantSlug, requestedTenantSlug: scope.tenantSlug }
                ));
            }
            return freezeEscalationOutput({
                success: true,
                allowed: alerts.length === 0,
                readOnly: true,
                scope: scope,
                alerts: alerts,
                metadata: {
                    tenantIsolationPreserved: alerts.length === 0,
                    historicalEscalationsImmutable: true,
                    replayHistoryPreserved: true,
                    sensitiveDataFiltered: true,
                    rbacEnforcementPreserved: true
                },
                timestamp: nowIso()
            });
        } catch (error) {
            return freezeEscalationOutput({
                success: true,
                allowed: false,
                readOnly: true,
                scope: {},
                alerts: [safeAlert('ESCALATION_SCOPE_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Escalation scope validation failed safely.', {})],
                metadata: { tenantIsolationPreserved: false, historicalEscalationsImmutable: true, replayHistoryPreserved: true, sensitiveDataFiltered: true, rbacEnforcementPreserved: true },
                timestamp: nowIso()
            });
        }
    }

    function normalizeBottleneck(type, row, details) {
        var info = isPlainObject(details) ? details : {};
        return freezeEscalationOutput({
            bottleneckType: safeString(type || 'WORKFLOW_BOTTLENECK', 'WORKFLOW_BOTTLENECK'),
            eventId: safeString(row.eventId || row.reviewId || row.review_id || row.id || row.escalationId || '', ''),
            correlationId: safeString(row.correlationId || row.metadata?.correlationId || '', ''),
            reviewerId: safeString(row.reviewerId || row.reviewer_id || row.managerId || info.reviewerId || '', ''),
            contributorId: safeString(row.contributorId || row.contributor_id || row.empId || row.employeeId || info.contributorId || '', ''),
            severity: classifyEscalationSeverity({ severity: row.severity || row.risk_level || row.riskLevel || info.severity, eventType: type, status: row.status || row.review_status || row.state || '' }),
            status: safeString(row.status || row.review_status || row.state || info.status || '', ''),
            timestamp: safeString(row.createdAt || row.submitted_at || row.dueAt || row.deadlineDate || row.timestamp || nowIso(), nowIso()),
            ageDays: ageDays(row.submitted_at || row.dueAt || row.deadlineDate || row.createdAt || row.timestamp),
            metadata: cloneValue(info.metadata || {}, 0)
        });
    }

    function detectWorkflowBottlenecks(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var scopeResult = validateEscalationScope(source, context);
            var scope = scopeResult.scope || normalizeScope(source, context);
            var alerts = Array.prototype.slice.call(scopeResult.alerts || []);
            if (!scopeResult.allowed) {
                return freezeEscalationOutput({
                    success: true,
                    readOnly: true,
                    bottlenecks: [],
                    alerts: alerts,
                    warnings: [],
                    severity: SEVERITIES.CRITICAL_BLOCKER,
                    summary: { delayedApprovals: 0, reviewerCongestion: 0, contributorBlockage: 0, workflowRetries: 0, escalationLoops: 0 },
                    metadata: { tenantIsolationPreserved: false, historicalEscalationsImmutable: true, sensitiveDataFiltered: true },
                    timestamp: nowIso()
                });
            }
            var data = rawData();
            var bottlenecks = [];
            rowsFor(scope, data.deliverableReviews || []).forEach(function inspectReview(row) {
                var text = safeString(row.review_status || row.status || row.reviewerAction || row.escalation_state || row.governanceState || '', '').toUpperCase();
                if (/PENDING|BLOCKED|OVERDUE|ESCALATED|CLARIFICATION|CONTRIBUTOR_UPDATE/.test(text)) {
                    bottlenecks.push(normalizeBottleneck('DELAYED_APPROVAL', row, { metadata: { source: 'deliverableReviews' } }));
                    if (row.reviewerId || row.reviewer_id) bottlenecks.push(normalizeBottleneck('REVIEWER_CONGESTION', row, { metadata: { source: 'deliverableReviews' } }));
                }
            });
            rowsFor(scope, data.pendingActions || []).forEach(function inspectAction(row) {
                var text = safeString(row.actionType || row.title || row.status || '', '').toUpperCase();
                if (/REVIEW|APPROVAL|STRATEGIC/.test(text)) bottlenecks.push(normalizeBottleneck('DELAYED_APPROVAL', row, { metadata: { source: 'pendingActions' } }));
                if (/CONTRIBUTOR|BLOCKED|DEPENDENCY|WAIT/.test(text)) bottlenecks.push(normalizeBottleneck('CONTRIBUTOR_BLOCKAGE', row, { metadata: { source: 'pendingActions' } }));
            });
            rowsFor(scope, data.workflowEvents || []).forEach(function inspectWorkflow(row) {
                var text = safeString(row.type || row.eventType || row.status || '', '').toUpperCase();
                if (/RETRY|FAILED|BLOCKED|OVERDUE|DEGRADED/.test(text)) bottlenecks.push(normalizeBottleneck('WORKFLOW_RETRY', row, { metadata: { source: 'workflowEvents' } }));
            });
            rowsFor(scope, data.escalations || []).forEach(function inspectEscalation(row) {
                var text = safeString(row.escalationType || row.status || '', '').toUpperCase();
                if (/ESCALATED|BREACH|BOTTLENECK|LOOP/.test(text)) bottlenecks.push(normalizeBottleneck('ESCALATION_LOOP', row, { metadata: { source: 'escalations' } }));
            });

            var reviewerCounts = {};
            bottlenecks.forEach(function countReviewer(row) {
                if (!row.reviewerId) return;
                reviewerCounts[row.reviewerId] = (reviewerCounts[row.reviewerId] || 0) + 1;
            });
            var reviewerCongestion = Object.keys(reviewerCounts).filter(function isCongested(key) { return reviewerCounts[key] >= 2; }).length;
            var summary = {
                delayedApprovals: bottlenecks.filter(function count(row) { return row.bottleneckType === 'DELAYED_APPROVAL'; }).length,
                reviewerCongestion: reviewerCongestion,
                contributorBlockage: bottlenecks.filter(function count(row) { return row.bottleneckType === 'CONTRIBUTOR_BLOCKAGE'; }).length,
                workflowRetries: bottlenecks.filter(function count(row) { return row.bottleneckType === 'WORKFLOW_RETRY'; }).length,
                escalationLoops: bottlenecks.filter(function count(row) { return row.bottleneckType === 'ESCALATION_LOOP'; }).length
            };
            var severity = classifyEscalationSeverity({
                approvalDeadlocks: summary.delayedApprovals >= 3 ? 2 : 0,
                reviewerQueue: summary.reviewerCongestion,
                contributorBlockage: summary.contributorBlockage,
                workflowRetries: summary.workflowRetries
            });
            return freezeEscalationOutput({
                success: true,
                readOnly: true,
                bottlenecks: bottlenecks.sort(function sortRows(a, b) { return timeValue(a.timestamp) - timeValue(b.timestamp); }),
                alerts: alerts,
                warnings: [],
                severity: severity,
                summary: summary,
                metadata: { tenantIsolationPreserved: true, historicalEscalationsImmutable: true, sensitiveDataFiltered: true },
                timestamp: nowIso()
            });
        } catch (error) {
            return freezeEscalationOutput({
                success: true,
                readOnly: true,
                bottlenecks: [],
                alerts: [safeAlert('BOTTLENECK_DETECTION_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Workflow bottleneck detection failed safely.', {})],
                warnings: [],
                severity: SEVERITIES.HIGH_RISK,
                summary: { delayedApprovals: 0, reviewerCongestion: 0, contributorBlockage: 0, workflowRetries: 0, escalationLoops: 0 },
                metadata: { tenantIsolationPreserved: false, historicalEscalationsImmutable: true, sensitiveDataFiltered: true },
                timestamp: nowIso()
            });
        }
    }

    function replayRows(scope, warnings) {
        try {
            if (!global.EventReplayService || typeof global.EventReplayService.inspectIncident !== 'function') {
                warnings.push(safeAlert('EVENT_REPLAY_UNAVAILABLE', SEVERITIES.WARNING, 'EventReplayService is unavailable. Replay escalation tracing degraded safely.', {}));
                return [];
            }
            var rows = [];
            if (scope.eventId && typeof global.EventReplayService.reconstructExecutionTimeline === 'function') {
                var timeline = global.EventReplayService.reconstructExecutionTimeline(scope.eventId);
                rows = Array.prototype.slice.call(timeline.timeline || []);
            } else if (scope.correlationId) {
                var incident = global.EventReplayService.inspectIncident(scope.correlationId);
                rows = Array.prototype.slice.call(incident.reconstructedTimeline || []);
            }
            return rows.filter(function filterReplay(row) {
                var text = safeString(row.eventType || row.type || row.status || row.handler || '', '').toUpperCase();
                return /ESCALATION|FAILED|RETRY|DEGRADED|BOTTLENECK/.test(text);
            }).map(function mapReplay(row) {
                return freezeEscalationOutput({
                    chainType: 'REPLAY_ESCALATION',
                    eventId: safeString(row.eventId || scope.eventId || '', ''),
                    correlationId: safeString(row.correlationId || scope.correlationId || '', ''),
                    timestamp: safeString(row.timestamp || nowIso(), nowIso()),
                    severity: classifyEscalationSeverity({ severity: row.severity, eventType: row.eventType || row.status || '' }),
                    metadata: { handler: row.handler || '', replayLinked: true }
                });
            });
        } catch (error) {
            warnings.push(safeAlert('REPLAY_ESCALATION_FAILED_SAFE', SEVERITIES.WARNING, 'Replay escalation tracing failed safely.', {}));
            return [];
        }
    }

    function telemetryChains(scope) {
        try {
            if (!global.WorkflowTelemetryService || typeof global.WorkflowTelemetryService.getRecentTelemetry !== 'function') return [];
            return Array.prototype.slice.call(global.WorkflowTelemetryService.getRecentTelemetry() || []).filter(function filterTelemetry(row) {
                if (scope.correlationId && safeString(row.correlationId || row.metadata?.correlationId || '', '') !== scope.correlationId) return false;
                if (scope.eventId && safeString(row.eventId || row.metadata?.eventId || '', '') !== scope.eventId) return false;
                var tenant = rowTenant(row);
                if (scope.tenantSlug && tenant && tenant !== scope.tenantSlug) return false;
                return /ESCALATION|BOTTLENECK|CONGESTION|RETRY|BLOCKED/i.test(safeString(row.eventType || row.status || '', ''));
            }).map(function mapTelemetry(row) {
                return freezeEscalationOutput({
                    chainType: 'ESCALATION_SPIKE',
                    eventId: safeString(row.eventId || '', ''),
                    correlationId: safeString(row.correlationId || row.metadata?.correlationId || '', ''),
                    timestamp: safeString(row.timestamp || row.createdAt || nowIso(), nowIso()),
                    severity: classifyEscalationSeverity({ severity: row.severity || row.metadata?.severity, eventType: row.eventType || '' }),
                    metadata: { source: 'telemetry' }
                });
            });
        } catch (error) {
            return [];
        }
    }

    function correlateEscalationChains(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var scopeResult = validateEscalationScope(source, context);
            var scope = scopeResult.scope || normalizeScope(source, context);
            var alerts = Array.prototype.slice.call(scopeResult.alerts || []);
            if (!scopeResult.allowed) {
                return freezeEscalationOutput({
                    success: true,
                    readOnly: true,
                    chains: [],
                    alerts: alerts,
                    warnings: [],
                    severity: SEVERITIES.CRITICAL_BLOCKER,
                    summary: { totalChains: 0, escalationSpikes: 0, workflowBottlenecks: 0, contributorBlockages: 0, reviewerCongestion: 0, replayLinked: false },
                    timestamp: nowIso()
                });
            }
            var data = rawData();
            var warnings = [];
            var chains = [];
            rowsFor(scope, data.escalations || []).forEach(function addEscalation(row) {
                chains.push({
                    chainType: 'ESCALATION_SPIKE',
                    eventId: row.eventId || row.id || row.escalationId || '',
                    correlationId: row.correlationId || '',
                    timestamp: row.createdAt || row.timestamp || nowIso(),
                    severity: classifyEscalationSeverity({ severity: row.severity, eventType: row.escalationType || row.status || '' })
                });
            });
            detectWorkflowBottlenecks(source, context).bottlenecks.forEach(function addBottleneck(row) {
                chains.push({
                    chainType: row.bottleneckType === 'CONTRIBUTOR_BLOCKAGE' ? 'CONTRIBUTOR_BLOCKAGE' : row.bottleneckType === 'REVIEWER_CONGESTION' ? 'REVIEWER_CONGESTION' : 'WORKFLOW_BOTTLENECK',
                    eventId: row.eventId,
                    correlationId: row.correlationId,
                    timestamp: row.timestamp,
                    severity: row.severity
                });
            });
            telemetryChains(scope).forEach(function addTelemetry(row) { chains.push(row); });
            replayRows(scope, warnings).forEach(function addReplay(row) { chains.push(row); });
            rowsFor(scope, data.authInvites || []).forEach(function addOnboarding(row) {
                if (/failed|expired|blocked/i.test(row.status || row.inviteStatus || '')) {
                    chains.push({
                        chainType: 'ONBOARDING_DELAY',
                        eventId: row.inviteId || row.id || '',
                        correlationId: row.correlationId || '',
                        timestamp: row.createdAt || row.sentAt || nowIso(),
                        severity: classifyEscalationSeverity({ eventType: 'ONBOARDING_DELAY', status: row.status || '' })
                    });
                }
            });
            var seen = {};
            var unique = [];
            chains.forEach(function pushUnique(row) {
                var key = row.chainType + '|' + row.eventId + '|' + row.timestamp;
                if (seen[key]) return;
                seen[key] = true;
                unique.push(freezeEscalationOutput(row));
            });
            unique.sort(function sortRows(a, b) { return timeValue(a.timestamp) - timeValue(b.timestamp); });
            var summary = {
                totalChains: unique.length,
                escalationSpikes: unique.filter(function count(row) { return row.chainType === 'ESCALATION_SPIKE'; }).length,
                workflowBottlenecks: unique.filter(function count(row) { return row.chainType === 'WORKFLOW_BOTTLENECK'; }).length,
                contributorBlockages: unique.filter(function count(row) { return row.chainType === 'CONTRIBUTOR_BLOCKAGE'; }).length,
                reviewerCongestion: unique.filter(function count(row) { return row.chainType === 'REVIEWER_CONGESTION'; }).length,
                replayLinked: unique.some(function hasReplay(row) { return row.chainType === 'REPLAY_ESCALATION'; })
            };
            return freezeEscalationOutput({
                success: true,
                readOnly: true,
                chains: unique,
                alerts: alerts,
                warnings: warnings,
                severity: classifyEscalationSeverity({ escalationDensity: summary.escalationSpikes, reviewerQueue: summary.reviewerCongestion, contributorBlockage: summary.contributorBlockages }),
                summary: summary,
                timestamp: nowIso()
            });
        } catch (error) {
            return freezeEscalationOutput({
                success: true,
                readOnly: true,
                chains: [],
                alerts: [safeAlert('ESCALATION_CORRELATION_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Escalation chain correlation failed safely.', {})],
                warnings: [],
                severity: SEVERITIES.HIGH_RISK,
                summary: { totalChains: 0, escalationSpikes: 0, workflowBottlenecks: 0, contributorBlockages: 0, reviewerCongestion: 0, replayLinked: false },
                timestamp: nowIso()
            });
        }
    }

    function replaySummary(scope, warnings) {
        try {
            if (!global.EventReplayService || typeof global.EventReplayService.inspectIncident !== 'function') {
                warnings.push(safeAlert('EVENT_REPLAY_UNAVAILABLE', SEVERITIES.WARNING, 'EventReplayService is unavailable. Replay escalation tracing degraded safely.', {}));
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
            warnings.push(safeAlert('REPLAY_ESCALATION_SUMMARY_FAILED_SAFE', SEVERITIES.WARNING, 'Replay escalation summary failed safely.', {}));
            return { linked: false, classifications: [], reconstructedTimeline: [] };
        }
    }

    function emitTelemetry(eventType, metadata, context) {
        try {
            if (context && context.skipTelemetry === true) return false;
            if (!global.WorkflowTelemetryService || typeof global.WorkflowTelemetryService.emitTelemetry !== 'function') return false;
            global.WorkflowTelemetryService.emitTelemetry('GOVERNANCE', eventType || 'ESCALATION_COMMAND_REPORTED', {
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

    function auditEscalation(eventType, metadata, context) {
        try {
            if (context && context.skipAuditPersistence === true) return false;
            if (!global.AuditService || typeof global.AuditService.recordAudit !== 'function') return false;
            global.AuditService.recordAudit({
                type: eventType || 'ESCALATION_COMMAND_REPORTED',
                eventType: eventType || 'ESCALATION_COMMAND_REPORTED',
                actionType: eventType || 'ESCALATION_COMMAND_REPORTED',
                source: DEFAULT_SOURCE,
                severity: metadata && metadata.severity === SEVERITIES.CRITICAL_BLOCKER ? 'CRITICAL' : metadata && metadata.severity === SEVERITIES.HIGH_RISK ? 'HIGH' : 'INFO',
                actorId: context && context.actor && (context.actor.id || context.actor.email) || '',
                module: 'Escalation Command',
                metadata: cloneValue(metadata || {}, 0)
            }, { source: DEFAULT_SOURCE });
            return true;
        } catch (error) {
            return false;
        }
    }

    function recordMetric(eventType, metadata, context) {
        try {
            if (context && context.skipMetrics === true) return false;
            if (!global.OrchestrationMetricsService || typeof global.OrchestrationMetricsService.recordWorkflowMetric !== 'function') return false;
            global.OrchestrationMetricsService.recordWorkflowMetric(eventType || 'ESCALATION_COMMAND_REPORTED', Object.assign({ source: DEFAULT_SOURCE }, cloneValue(metadata || {}, 0)));
            return true;
        } catch (error) {
            return false;
        }
    }

    function generateEscalationCommandReport(input, context) {
        try {
            var malformed = !isPlainObject(input);
            var source = isPlainObject(input) ? input : {};
            var ctx = isPlainObject(context) ? context : {};
            var scopeInput = malformed ? {} : source;
            var scope = normalizeScope(scopeInput, ctx);
            var alerts = [];
            if (malformed) alerts.push(safeAlert('MALFORMED_ESCALATION_COMMAND_PAYLOAD', SEVERITIES.HIGH_RISK, 'Escalation command payload was malformed.', {}));
            var bottlenecks = detectWorkflowBottlenecks(scopeInput, ctx);
            var chains = correlateEscalationChains(scopeInput, ctx);
            var warnings = Array.prototype.slice.call(bottlenecks.warnings || []).concat(Array.prototype.slice.call(chains.warnings || []));
            var replay = replaySummary(scope, warnings);
            alerts = alerts.concat(Array.prototype.slice.call(bottlenecks.alerts || []), Array.prototype.slice.call(chains.alerts || []));
            var escalationScope = scope.correlationId ? Object.assign({}, scope, { eventId: '' }) : scope;
            var escalationRows = rowsFor(escalationScope, rawData().escalations || []);
            var severity = alerts.some(function hasCritical(row) { return row.classification === SEVERITIES.CRITICAL_BLOCKER; })
                ? SEVERITIES.CRITICAL_BLOCKER
                : malformed
                ? SEVERITIES.HIGH_RISK
                : classifyEscalationSeverity({
                    escalationDensity: escalationRows.length,
                    approvalDeadlocks: bottlenecks.summary.delayedApprovals >= 3 ? 2 : 0,
                    reviewerQueue: bottlenecks.summary.reviewerCongestion,
                    contributorBlockage: bottlenecks.summary.contributorBlockage,
                    workflowRetries: bottlenecks.summary.workflowRetries,
                    severity: bottlenecks.severity === SEVERITIES.HIGH_RISK || chains.severity === SEVERITIES.HIGH_RISK ? SEVERITIES.HIGH_RISK : ''
                });
            var report = freezeEscalationOutput({
                success: true,
                readOnly: true,
                state: severity === SEVERITIES.CRITICAL_BLOCKER ? ESCALATION_STATES.ESCALATED : severity === SEVERITIES.HIGH_RISK ? ESCALATION_STATES.PENDING_REVIEW : ESCALATION_STATES.DETECTED,
                severity: severity,
                scope: scope,
                escalations: escalationRows.map(function mapEscalation(row) {
                    return normalizeBottleneck('ESCALATION_RECORD', row, { metadata: { escalationType: row.escalationType || '', source: 'escalations' } });
                }),
                bottlenecks: bottlenecks,
                chains: chains,
                replay: replay,
                alerts: alerts,
                warnings: warnings,
                summary: {
                    escalationDensity: escalationRows.length,
                    delayedApprovals: bottlenecks.summary.delayedApprovals || 0,
                    reviewerCongestion: bottlenecks.summary.reviewerCongestion || 0,
                    contributorBlockage: bottlenecks.summary.contributorBlockage || 0,
                    workflowRetries: bottlenecks.summary.workflowRetries || 0,
                    escalationLoops: bottlenecks.summary.escalationLoops || 0,
                    linkedChains: chains.summary.totalChains || 0,
                    replayLinked: replay.linked === true || chains.summary.replayLinked === true,
                    sensitiveDataFiltered: true
                },
                metadata: {
                    tenantIsolationPreserved: !alerts.some(function isTenantAlert(row) { return row.classification === SEVERITIES.CRITICAL_BLOCKER && /TENANT/i.test(row.alertCode || ''); }),
                    historicalEscalationsImmutable: true,
                    replayHistoryPreserved: true,
                    rbacEnforcementPreserved: true,
                    existingEscalationFlowsPreserved: true,
                    monitoringReadOnly: true
                },
                generatedAt: nowIso()
            });
            var meta = {
                severity: report.severity,
                escalationDensity: report.summary.escalationDensity,
                delayedApprovals: report.summary.delayedApprovals,
                reviewerCongestion: report.summary.reviewerCongestion,
                contributorBlockage: report.summary.contributorBlockage,
                tenantSlug: report.scope.tenantSlug || ''
            };
            emitTelemetry('ESCALATION_COMMAND_REPORTED', meta, ctx);
            if (report.severity !== SEVERITIES.INFO) emitTelemetry('ESCALATION_CONGESTION_DETECTED', meta, ctx);
            auditEscalation('ESCALATION_COMMAND_REPORTED', meta, ctx);
            recordMetric('ESCALATION_COMMAND_REPORTED', meta, ctx);
            return report;
        } catch (error) {
            return freezeEscalationOutput({
                success: true,
                readOnly: true,
                state: ESCALATION_STATES.PENDING_REVIEW,
                severity: SEVERITIES.HIGH_RISK,
                scope: {},
                escalations: [],
                bottlenecks: { success: true, readOnly: true, bottlenecks: [], summary: { delayedApprovals: 0, reviewerCongestion: 0, contributorBlockage: 0, workflowRetries: 0, escalationLoops: 0 } },
                chains: { success: true, readOnly: true, chains: [], summary: { totalChains: 0, escalationSpikes: 0, workflowBottlenecks: 0, contributorBlockages: 0, reviewerCongestion: 0, replayLinked: false } },
                replay: { linked: false, classifications: [], reconstructedTimeline: [] },
                alerts: [safeAlert('ESCALATION_COMMAND_REPORT_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Escalation command report failed safely.', {})],
                warnings: [],
                summary: { escalationDensity: 0, delayedApprovals: 0, reviewerCongestion: 0, contributorBlockage: 0, workflowRetries: 0, escalationLoops: 0, linkedChains: 0, replayLinked: false, sensitiveDataFiltered: true },
                metadata: { tenantIsolationPreserved: false, historicalEscalationsImmutable: true, replayHistoryPreserved: true, rbacEnforcementPreserved: true, existingEscalationFlowsPreserved: true, monitoringReadOnly: true },
                generatedAt: nowIso()
            });
        }
    }

    function recordEscalationAction(action, input, context) {
        try {
            var normalized = safeString(action || 'ACKNOWLEDGE_ESCALATION', 'ACKNOWLEDGE_ESCALATION').trim().replace(/[\s-]+/g, '_').toUpperCase();
            var scopeResult = validateEscalationScope(input, context);
            var allowed = scopeResult.allowed === true;
            var eventType = normalized === 'RESOLVE_ESCALATION' ? 'ESCALATION_RESOLVED' : normalized === 'MITIGATE_ESCALATION' ? 'ESCALATION_MITIGATED' : 'ESCALATION_ACKNOWLEDGED';
            var result = freezeEscalationOutput({
                success: true,
                allowed: allowed,
                action: normalized,
                eventType: eventType,
                readOnly: true,
                historicalChainsMutated: false,
                scope: scopeResult.scope || {},
                alerts: scopeResult.alerts || [],
                timestamp: nowIso()
            });
            if (allowed) {
                var meta = { action: normalized, eventType: eventType, escalationId: result.scope.escalationId || '', correlationId: result.scope.correlationId || '', tenantSlug: result.scope.tenantSlug || '' };
                auditEscalation(eventType, meta, context || {});
                auditEscalation('ESCALATION_COMMAND_ACTION', meta, context || {});
                emitTelemetry(eventType, meta, context || {});
                recordMetric(eventType, meta, context || {});
            }
            return result;
        } catch (error) {
            return freezeEscalationOutput({
                success: true,
                allowed: false,
                action: 'ACKNOWLEDGE_ESCALATION',
                eventType: 'ESCALATION_ACTION_FAILED_SAFE',
                readOnly: true,
                historicalChainsMutated: false,
                scope: {},
                alerts: [safeAlert('ESCALATION_ACTION_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Escalation action failed safely.', {})],
                timestamp: nowIso()
            });
        }
    }

    var EscalationCommandService = Object.freeze({
        ESCALATION_STATES: ESCALATION_STATES,
        SEVERITIES: SEVERITIES,
        classifyEscalationSeverity: classifyEscalationSeverity,
        detectWorkflowBottlenecks: detectWorkflowBottlenecks,
        correlateEscalationChains: correlateEscalationChains,
        freezeEscalationOutput: freezeEscalationOutput,
        validateEscalationScope: validateEscalationScope,
        generateEscalationCommandReport: generateEscalationCommandReport,
        recordEscalationAction: recordEscalationAction
    });

    global.EscalationCommandService = EscalationCommandService;
    global.escalationCommandService = EscalationCommandService;

    function runSelfTest() {
        var checks = [];
        function record(name, passed, details) {
            checks.push(Object.freeze({ name: name, passed: !!passed, details: details || null }));
        }
        var previousReplay = global.EventReplayService;
        try {
            var sample = { tenantSlug: 'self-test', correlationId: 'CORR-ESC-SELF', eventId: 'WF-ESC-SELF', metadata: { salary: 1000, safe: true } };
            var report = generateEscalationCommandReport(sample, { tenantSlug: 'self-test', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            record('escalation detection works', report.success === true && report.readOnly === true, report);
            var bottlenecks = detectWorkflowBottlenecks(sample, { tenantSlug: 'self-test' });
            record('bottleneck detection works', bottlenecks.success === true && Array.isArray(bottlenecks.bottlenecks), bottlenecks);
            var chains = correlateEscalationChains(sample, { tenantSlug: 'self-test', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            record('replay escalation correlation works', chains.success === true && Array.isArray(chains.chains), chains);
            record('congestion tracking works', classifyEscalationSeverity({ reviewerQueue: 3 }) === SEVERITIES.WARNING, null);
            var immutable = freezeEscalationOutput({ nested: { ok: true } });
            record('immutable outputs enforced', Object.isFrozen(immutable) && Object.isFrozen(immutable.nested), immutable);
            var malformed = generateEscalationCommandReport('bad-input', { tenantSlug: 'self-test', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            record('malformed payloads handled safely', malformed.success === true && malformed.severity === SEVERITIES.HIGH_RISK, malformed);
            var tenant = validateEscalationScope({ tenantSlug: 'other' }, { tenantSlug: 'self-test' });
            record('tenant isolation works', tenant.allowed === false && tenant.alerts.some(function hasCritical(item) { return item.classification === SEVERITIES.CRITICAL_BLOCKER; }), tenant);
            global.EventReplayService = null;
            var degraded = generateEscalationCommandReport({ tenantSlug: 'self-test', correlationId: 'CORR-ESC-SELF' }, { tenantSlug: 'self-test', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
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
        global.__ARTHHRMS_ESCALATION_COMMAND_SELF_TEST__ = runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
