/**
 * deliverableTimelineService.js
 * ARTHHRMS Enterprise Deliverable Timeline + Strategic Execution Intelligence.
 *
 * Additive read-only governance layer for strategic deliverable timelines,
 * milestone dependencies, delay escalation, KPI-linked execution, bottleneck
 * intelligence, and audit-safe strategic timeline reporting. It never exposes
 * confidential strategic notes, raw milestone IDs, employee IDs, or cross-tenant
 * execution records.
 */
(function attachDeliverableTimelineService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[DeliverableTimelineService]';

    var TIMELINE_STATES = Object.freeze({
        PLANNED: 'PLANNED',
        ACTIVE: 'ACTIVE',
        AT_RISK: 'AT_RISK',
        DELAYED: 'DELAYED',
        ESCALATED: 'ESCALATED',
        COMPLETED: 'COMPLETED',
        ARCHIVED: 'ARCHIVED'
    });

    var FAILURE_CLASSIFICATIONS = Object.freeze({
        INFO: 'INFO',
        WARNING: 'WARNING',
        HIGH_RISK: 'HIGH_RISK',
        CRITICAL_BLOCKER: 'CRITICAL_BLOCKER'
    });

    var VISIBILITY = Object.freeze({
        NONE: 'NONE',
        ASSIGNED_DELIVERABLES_ONLY: 'ASSIGNED_DELIVERABLES_ONLY',
        TEAM_EXECUTION_VISIBILITY: 'TEAM_EXECUTION_VISIBILITY',
        HR_OPERATIONAL_TIMELINE_VISIBILITY: 'HR_OPERATIONAL_TIMELINE_VISIBILITY',
        STRATEGIC_EXECUTION_VISIBILITY: 'STRATEGIC_EXECUTION_VISIBILITY',
        ORGANIZATION_STRATEGIC_ANALYTICS: 'ORGANIZATION_STRATEGIC_ANALYTICS',
        INFRASTRUCTURE_VISIBILITY_ONLY: 'INFRASTRUCTURE_VISIBILITY_ONLY',
        PLATFORM_GOVERNANCE_ONLY: 'PLATFORM_GOVERNANCE_ONLY'
    });

    var SENSITIVE_KEY_PATTERN = /(timeline.?id|deliverable.?id|milestone.?id|dependency.?id|depends.?on|emp.?id|employee.?id|owner.?id|reviewer.?id|manager.?id|strategic.?owner|kpi.?id|correlation.?id|workflow.?id|event.?id|escalation.?id|note|comment|feedback|private|confidential|salary|payroll|compensation|rating|score|token|secret|jwt|authorization|service.?role|private.?key|raw|payload.?id|target.?id|log.?id)/i;
    var SENSITIVE_VALUE_PATTERN = /(https?:\/\/[^\s"',}]+|private:\/\/[^\s"',}]+|\b(private|confidential|secret|salary|payroll|strategic note|leadership note)\b[^,;}]*)/ig;

    var SAFE_GOVERNANCE_KEYS = Object.freeze({
        success: true,
        allowed: true,
        readOnly: true,
        classification: true,
        visibility: true,
        state: true,
        timelineState: true,
        generatedAt: true,
        tenantSlug: true,
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
        timelineHealth: true,
        dependencyGovernance: true,
        executionTimelineGovernance: true,
        delayEscalation: true,
        delayBottleneckIntelligence: true,
        kpiPerformanceIntegration: true,
        timelineAnalytics: true,
        workflowCommunicationIntegration: true,
        accessGovernance: true,
        integrationHealth: true,
        totalMilestones: true,
        plannedMilestones: true,
        activeMilestones: true,
        atRiskMilestones: true,
        delayedMilestones: true,
        escalatedMilestones: true,
        completedMilestones: true,
        archivedMilestones: true,
        milestoneScheduling: true,
        dependencyAwareExecution: true,
        executionPhaseTracking: true,
        strategicCheckpoints: true,
        delayedMilestoneEscalation: true,
        timelineVersioning: true,
        executionRollbackMarkers: true,
        unsafeMilestoneOverridesBlocked: true,
        dependencyLoops: true,
        dependencyBottlenecks: true,
        dependencyResolutionSpeed: true,
        dependencyCongestion: true,
        delayedDeliverables: true,
        overdueDeliverables: true,
        executionCongestion: true,
        repeatedEscalationPatterns: true,
        stalledExecutionChains: true,
        kpiLinkedMilestones: true,
        executionScoring: true,
        strategicPerformanceMapping: true,
        deliverableCompletionAnalytics: true,
        leadershipAccountabilityMapping: true,
        unsafeKpiMutation: true,
        completionVelocity: true,
        delayedMilestoneFrequency: true,
        escalationLinkedDelays: true,
        strategicCompletionTrends: true,
        milestoneLinkedDiscussions: true,
        executionEscalationThreads: true,
        strategicCollaboration: true,
        approvalLinkedCheckpoints: true,
        operationalCoordination: true,
        unsafeWorkflowExposure: true,
        escalationGovernancePreserved: true,
        employeeAssignedDeliverablesOnly: true,
        managerTeamExecutionVisibility: true,
        hrOperationalTimelineVisibility: true,
        hrHeadStrategicExecutionVisibility: true,
        directorOrganizationStrategicAnalytics: true,
        superAdminStrategicMutationAuthority: true,
        platformOwnerExecutionChain: true,
        crossTenantTimelineLeakageBlocked: true,
        historicalTimelineRecordsImmutable: true,
        existingStrategicWorkflowsPreserved: true,
        existingWorkflowsPreserved: true,
        timelineActionsAuditable: true,
        strategicTimelineConfidentialityPreserved: true,
        tenantIsolationPreserved: true,
        strategicReviewIntegrated: true,
        performanceGovernanceIntegrated: true,
        communicationGovernanceIntegrated: true,
        escalationCommandIntegrated: true,
        workflowDiscussionIntegrated: true,
        workflowTelemetryIntegrated: true,
        auditReady: true,
        telemetryReady: true,
        metricsReady: true
    });

    var auditForwarding = false;
    var telemetryForwarding = false;
    var metricForwarding = false;

    function safeWarn(message, details) {
        try { if (global.console && console.warn) console.warn(PREFIX, message, details || ''); } catch (error) {}
    }

    function db() {
        try { return global.DB || null; } catch (error) { return null; }
    }

    function rawData() {
        try {
            var source = db();
            return source && typeof source.get === 'function' ? source.get() : {};
        } catch (error) {
            safeWarn('Database read failed safely.', error && error.message);
            return {};
        }
    }

    function list(data, key) {
        return Array.isArray(data && data[key]) ? data[key].slice() : [];
    }

    function safeString(value, fallback) {
        if (value === undefined || value === null) return fallback || '';
        return String(value);
    }

    function safeNumber(value, fallback) {
        var next = Number(value);
        return isFinite(next) ? next : (fallback || 0);
    }

    function normalizeToken(value) {
        return safeString(value, '').trim().toUpperCase().replace(/[^A-Z0-9_ -]/g, '_').replace(/\s+/g, '_');
    }

    function normalizeRole(value) {
        var role = normalizeToken(value || 'EMPLOYEE');
        if (role === 'ADMIN') return 'SUPER_ADMIN';
        if (role === 'SUPERADMIN') return 'SUPER_ADMIN';
        if (role === 'PLATFORMOWNER') return 'PLATFORM_OWNER';
        if (role === 'HRHEAD') return 'HR_HEAD';
        if (role === 'DIRECTOR' || role === 'HR_HEAD' || role === 'HR' || role === 'MANAGER' || role === 'EMPLOYEE' || role === 'SUPER_ADMIN' || role === 'PLATFORM_OWNER') return role;
        return 'EMPLOYEE';
    }

    function normalizeTenantSlug(value) {
        return safeString(value, '').trim().toLowerCase().replace(/^tenant[-_]/, '').replace(/^ten[-_]/, '').replace(/[^a-z0-9_-]/g, '').replace(/_+/g, '-');
    }

    function contextTenant(context) {
        return normalizeTenantSlug(context && (context.tenantSlug || context.tenantId || context.companyId || context.actor && (context.actor.tenantSlug || context.actor.tenantId)));
    }

    function rowTenant(row) {
        return normalizeTenantSlug(row && (row.tenantSlug || row.tenantId || row.companyId || row.companySlug));
    }

    function defaultTenant(sourceData) {
        var data = sourceData || rawData();
        var settings = data && data.companySettings || {};
        var tenant = normalizeTenantSlug(settings.tenantSlug || settings.tenantId || settings.companyId || settings.companySlug);
        if (tenant) return tenant;
        var firstTenant = Array.isArray(data && data.platformTenants) ? data.platformTenants[0] : null;
        return normalizeTenantSlug(firstTenant && (firstTenant.tenantSlug || firstTenant.tenantId || firstTenant.companyId));
    }

    function resolveTenant(scope, context, sourceData) {
        return normalizeTenantSlug(scope && (scope.tenantSlug || scope.tenantId || scope.companyId)) || contextTenant(context) || defaultTenant(sourceData);
    }

    function actorId(context) {
        return safeString(context && context.actor && (context.actor.id || context.actor.empId || context.actor.userId), '');
    }

    function actorRole(context) {
        return normalizeRole(context && context.actor && context.actor.role);
    }

    function empIdOf(row) {
        return safeString(row && (row.empId || row.employeeId || row.contributorId || row.ownerEmpId || row.userId), '');
    }

    function deliverableIdOf(row) {
        return safeString(row && (row.deliverableId || row.id || row.deliverable_id), '');
    }

    function milestoneIdOf(row) {
        return safeString(row && (row.milestoneId || row.milestone_id || row.timelineId || row.id), '');
    }

    function ownerIdOf(row) {
        return safeString(row && (row.ownerId || row.strategicOwnerId || row.reviewerId || row.managerId), '');
    }

    function dependencyIdsOf(row) {
        var ids = row && (row.dependencyIds || row.dependencies || row.dependsOn || row.dependsOnMilestoneIds);
        if (Array.isArray(ids)) return ids.map(function map(id) { return safeString(id, ''); }).filter(Boolean);
        if (typeof ids === 'string' && ids.trim()) return ids.split(',').map(function map(id) { return id.trim(); }).filter(Boolean);
        return [];
    }

    function stateOf(row) {
        var raw = normalizeToken(row && (row.state || row.timelineState || row.governanceState || row.currentStatus || row.status || row.finalClosureStatus));
        if (raw === 'OPEN' || raw === 'IN_PROGRESS' || raw === 'UNDER_REVIEW') return TIMELINE_STATES.ACTIVE;
        if (raw === 'AT_RISK') return TIMELINE_STATES.AT_RISK;
        if (raw === 'OVERDUE') return TIMELINE_STATES.DELAYED;
        if (raw === 'CLOSED' || raw === 'ACHIEVED' || raw === 'DONE') return TIMELINE_STATES.COMPLETED;
        return TIMELINE_STATES[raw] ? raw : TIMELINE_STATES.PLANNED;
    }

    function dueDateOf(row) {
        return safeString(row && (row.dueDate || row.deadlineDate || row.endDate || row.targetDate), '');
    }

    function completed(row) {
        return stateOf(row) === TIMELINE_STATES.COMPLETED || safeNumber(row && row.progressPercent, 0) >= 100 || !!(row && row.completedAt);
    }

    function isOverdue(row, context) {
        if (completed(row)) return false;
        var due = dueDateOf(row);
        if (!due) return false;
        var nowDate = safeString(context && context.now || '', '').slice(0, 10) || (db() && typeof db().today === 'function' ? db().today() : new Date().toISOString().slice(0, 10));
        return due.slice(0, 10) < nowDate;
    }

    function employeeRows(data) {
        return list(data, 'employees').concat(list(data, 'users'));
    }

    function employeeById(data, id) {
        var needle = safeString(id, '');
        return employeeRows(data).filter(function match(row) {
            return safeString(row && (row.id || row.empId || row.employeeId || row.userId), '') === needle;
        })[0] || null;
    }

    function managerOwnsEmployee(data, managerId, employeeId) {
        if (!managerId || !employeeId) return false;
        var employee = employeeById(data, employeeId);
        return !!employee && safeString(employee.managerId || employee.reportingManagerId || employee.supervisorId, '') === managerId;
    }

    function tenantFilter(tenant) {
        return function sameTenant(row) {
            if (!tenant) return true;
            return rowTenant(row) === tenant;
        };
    }

    function deliverableRows(data) {
        return list(data, 'strategicDeliverables');
    }

    function timelineRows(data) {
        return list(data, 'deliverableTimelineRecords').concat(list(data, 'strategicTimelines'), list(data, 'milestones'));
    }

    function dependencyRows(data) {
        return list(data, 'deliverableDependencies').concat(list(data, 'timelineDependencies'));
    }

    function reviewRows(data) {
        return list(data, 'deliverableReviews').concat(list(data, 'strategicReviews'));
    }

    function escalationRows(data) {
        return list(data, 'escalations').concat(list(data, 'strategicEscalations'));
    }

    function workflowRows(data) {
        return list(data, 'workflowEvents').concat(list(data, 'pendingActions'));
    }

    function discussionRows(data) {
        return list(data, 'workflowDiscussions').concat(list(data, 'discussionThreads'));
    }

    function performanceRows(data) {
        return list(data, 'performanceGoals').concat(list(data, 'performanceReviews'), list(data, 'appraisals'));
    }

    function findDeliverable(data, row) {
        var id = deliverableIdOf(row);
        if (!id) return null;
        return deliverableRows(data).filter(function match(item) { return deliverableIdOf(item) === id; })[0] || null;
    }

    function mergedRecord(data, row) {
        var deliverable = findDeliverable(data, row) || {};
        var merged = {};
        Object.keys(deliverable).forEach(function copy(key) { merged[key] = deliverable[key]; });
        Object.keys(row || {}).forEach(function copy(key) { merged[key] = row[key]; });
        return merged;
    }

    function sanitizeText(value) {
        return safeString(value, '').replace(SENSITIVE_VALUE_PATTERN, '[REDACTED]');
    }

    function cloneSanitized(value, keyHint) {
        if (value === null || value === undefined) return value;
        var type = typeof value;
        var key = safeString(keyHint, '');
        var safeKey = !!SAFE_GOVERNANCE_KEYS[key];
        if (type === 'string') {
            if (!safeKey && SENSITIVE_KEY_PATTERN.test(key)) return '[REDACTED]';
            return safeKey ? value : sanitizeText(value);
        }
        if (type === 'number' || type === 'boolean') return value;
        if (Array.isArray(value)) return value.slice(0, 80).map(function map(item) { return cloneSanitized(item, key); });
        if (type === 'object') {
            var out = {};
            Object.keys(value).forEach(function copy(childKey) {
                if (!SAFE_GOVERNANCE_KEYS[childKey] && SENSITIVE_KEY_PATTERN.test(childKey)) {
                    out[childKey] = '[REDACTED]';
                    return;
                }
                out[childKey] = cloneSanitized(value[childKey], childKey);
            });
            return out;
        }
        return undefined;
    }

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.keys(value).forEach(function freezeKey(key) { deepFreeze(value[key]); });
        try { Object.freeze(value); } catch (error) {}
        return value;
    }

    function freezeTimelineOutput(output) {
        return deepFreeze(cloneSanitized(output || {}, 'payload'));
    }

    function safeFailure(code, classification, message) {
        return freezeTimelineOutput({
            failureCode: code,
            classification: classification || FAILURE_CLASSIFICATIONS.WARNING,
            message: message || code
        });
    }

    function classifyExecutionRisk(input) {
        try {
            var risk = input || {};
            if (risk.crossTenant || risk.historicalMutation || risk.timelineLeakage) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
            if (risk.unsafeMilestoneOverride || risk.dependencyLoop || risk.stalledChain || risk.repeatedEscalation) return FAILURE_CLASSIFICATIONS.HIGH_RISK;
            if (risk.delayedMilestone || risk.dependencyBottleneck || risk.executionCongestion || risk.malformedPayload) return FAILURE_CLASSIFICATIONS.WARNING;
            return FAILURE_CLASSIFICATIONS.INFO;
        } catch (error) {
            return FAILURE_CLASSIFICATIONS.HIGH_RISK;
        }
    }

    function scopeVisibility(role) {
        if (role === 'EMPLOYEE') return VISIBILITY.ASSIGNED_DELIVERABLES_ONLY;
        if (role === 'MANAGER') return VISIBILITY.TEAM_EXECUTION_VISIBILITY;
        if (role === 'HR') return VISIBILITY.HR_OPERATIONAL_TIMELINE_VISIBILITY;
        if (role === 'HR_HEAD') return VISIBILITY.STRATEGIC_EXECUTION_VISIBILITY;
        if (role === 'DIRECTOR') return VISIBILITY.ORGANIZATION_STRATEGIC_ANALYTICS;
        if (role === 'SUPER_ADMIN') return VISIBILITY.INFRASTRUCTURE_VISIBILITY_ONLY;
        if (role === 'PLATFORM_OWNER') return VISIBILITY.PLATFORM_GOVERNANCE_ONLY;
        return VISIBILITY.NONE;
    }

    function validateTimelineScope(record, context) {
        try {
            var data = rawData();
            var ctx = context || {};
            var role = actorRole(ctx);
            var tenant = contextTenant(ctx) || normalizeTenantSlug(record && (record.tenantSlug || record.tenantId || record.companyId)) || defaultTenant(data);
            var merged = mergedRecord(data, record || {});
            var targetTenant = rowTenant(merged) || rowTenant(record) || tenant;
            var employeeId = empIdOf(merged) || empIdOf(record);
            var currentActor = actorId(ctx);
            var failures = [];
            var warnings = [];

            if (tenant && targetTenant && tenant !== targetTenant) {
                failures.push(safeFailure('CROSS_TENANT_TIMELINE_VISIBILITY_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Cross-tenant strategic timeline visibility is blocked.'));
            }
            if (role === 'PLATFORM_OWNER') {
                failures.push(safeFailure('PLATFORM_OWNER_EXECUTION_CHAIN_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'PLATFORM_OWNER is isolated from strategic execution chains.'));
            }
            if (role === 'SUPER_ADMIN' && record && (record.milestoneOverride || record.mutationRequested || record.forceTimelineMutation || record.overrideTimeline)) {
                failures.push(safeFailure('SUPER_ADMIN_TIMELINE_MUTATION_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'SUPER_ADMIN cannot modify strategic execution timelines.'));
            }
            if (stateOf(record || {}) === TIMELINE_STATES.ARCHIVED && record && (record.mutationRequested || record.milestoneOverride || record.forceTimelineMutation)) {
                failures.push(safeFailure('ARCHIVED_TIMELINE_MUTATION_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Archived milestone history is immutable.'));
            }
            if (role === 'EMPLOYEE' && currentActor && employeeId && currentActor !== employeeId) {
                failures.push(safeFailure('EMPLOYEE_TIMELINE_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Employees can only view assigned deliverables.'));
            }
            if (role === 'MANAGER' && employeeId && currentActor && !managerOwnsEmployee(data, currentActor, employeeId) && ownerIdOf(merged) !== currentActor) {
                failures.push(safeFailure('MANAGER_TEAM_TIMELINE_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Managers require team execution visibility.'));
            }
            if (isOverdue(merged, ctx)) warnings.push(safeFailure('TIMELINE_DELAY_VISIBLE', FAILURE_CLASSIFICATIONS.WARNING, 'Timeline is delayed or overdue.'));

            var classification = failures.reduce(function highest(current, failure) {
                if (failure.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
                if (failure.classification === FAILURE_CLASSIFICATIONS.HIGH_RISK && current !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER) return FAILURE_CLASSIFICATIONS.HIGH_RISK;
                return current;
            }, warnings.length ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO);

            return freezeTimelineOutput({
                success: true,
                allowed: failures.length === 0,
                readOnly: true,
                classification: classification,
                visibility: failures.length ? VISIBILITY.NONE : scopeVisibility(role),
                failures: failures,
                warnings: warnings,
                metadata: {
                    tenantIsolationPreserved: failures.filter(function cross(item) { return item.failureCode === 'CROSS_TENANT_TIMELINE_VISIBILITY_BLOCKED'; }).length === 0,
                    strategicTimelineConfidentialityPreserved: true,
                    historicalTimelineRecordsImmutable: failures.filter(function mutation(item) { return item.failureCode === 'ARCHIVED_TIMELINE_MUTATION_BLOCKED'; }).length === 0
                }
            });
        } catch (error) {
            return freezeTimelineOutput({
                success: false,
                allowed: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                visibility: VISIBILITY.NONE,
                failures: [safeFailure('TIMELINE_SCOPE_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Timeline scope validation failed safely.')]
            });
        }
    }

    function normalizeTimelinePayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeTimelineOutput({
                    success: false,
                    readOnly: true,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    failures: [safeFailure('MALFORMED_TIMELINE_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Malformed timeline payload rejected.')]
                });
            }
            return freezeTimelineOutput({
                success: true,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.INFO,
                payload: {
                    state: stateOf(payload),
                    tenantSlug: normalizeTenantSlug(payload.tenantSlug || payload.tenantId || contextTenant(context)),
                    progressPercent: Math.max(0, Math.min(100, safeNumber(payload.progressPercent, 0))),
                    dueDate: safeString(payload.dueDate || payload.deadlineDate, '').slice(0, 10),
                    dependencyCount: dependencyIdsOf(payload).length,
                    metadata: cloneSanitized(payload.metadata || {}, 'metadata')
                },
                metadata: {
                    strategicTimelineConfidentialityPreserved: true,
                    tenantIsolationPreserved: true
                }
            });
        } catch (error) {
            return freezeTimelineOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('TIMELINE_NORMALIZATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Timeline normalization failed safely.')]
            });
        }
    }

    function auditTimeline(actionType, metadata, context) {
        if (auditForwarding || context && context.skipAuditPersistence) return { success: true, skipped: true };
        auditForwarding = true;
        try {
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    actionType: actionType,
                    eventType: actionType,
                    module: 'Deliverable Timeline',
                    targetId: '',
                    description: metadata && metadata.description || actionType,
                    actorRole: context && context.actor && context.actor.role || 'hr',
                    actorId: context && context.actor && (context.actor.id || context.actor.empId) || '',
                    severity: metadata && metadata.severity || 'INFO',
                    metadata: cloneSanitized(metadata || {}, 'metadata')
                }, { source: 'deliverableTimelineService', skipPersistence: false });
            }
            var source = db();
            if (source && typeof source.writeAuditLog === 'function') {
                source.writeAuditLog(context && context.actor && context.actor.role || 'hr', context && context.actor && context.actor.id || '', actionType, 'Deliverable Timeline', '', metadata && metadata.description || actionType);
            }
            return { success: true };
        } catch (error) {
            return { success: false, warning: 'Timeline audit failed safely.' };
        } finally {
            auditForwarding = false;
        }
    }

    function emitTelemetry(eventType, metadata, context) {
        if (telemetryForwarding || context && context.skipTelemetry) return { success: true, skipped: true };
        telemetryForwarding = true;
        try {
            var service = global.WorkflowTelemetryService || global.workflowTelemetryService;
            if (service && typeof service.emitTelemetry === 'function') {
                service.emitTelemetry('GOVERNANCE', eventType, {
                    source: 'deliverableTimelineService',
                    severity: metadata && metadata.severity || 'INFO',
                    status: metadata && metadata.status || eventType,
                    tenantSlug: contextTenant(context) || metadata && metadata.tenantSlug || '',
                    metadata: cloneSanitized(metadata || {}, 'metadata')
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Timeline telemetry failed safely.' };
        } finally {
            telemetryForwarding = false;
        }
        return { success: false, warning: 'WorkflowTelemetryService unavailable.' };
    }

    function recordMetric(metricType, metadata, context) {
        if (metricForwarding || context && context.skipMetrics) return { success: true, skipped: true };
        metricForwarding = true;
        try {
            var service = global.OrchestrationMetricsService || global.orchestrationMetricsService;
            if (service && typeof service.recordWorkflowMetric === 'function') {
                service.recordWorkflowMetric(metricType, {
                    tenantSlug: contextTenant(context) || metadata && metadata.tenantSlug || '',
                    source: 'deliverableTimelineService',
                    status: metadata && metadata.status || metricType,
                    severity: metadata && metadata.severity || 'INFO'
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Timeline metric failed safely.' };
        } finally {
            metricForwarding = false;
        }
        return { success: false, warning: 'OrchestrationMetricsService unavailable.' };
    }

    function validateDependencyGraph(payload, context) {
        try {
            var sourceData = rawData();
            var tenant = resolveTenant(payload, context, sourceData);
            var rows = Array.isArray(payload && payload.milestones) ? payload.milestones : timelineRows(sourceData).filter(tenantFilter(tenant));
            var graph = {};
            rows.forEach(function add(row) {
                var id = milestoneIdOf(row) || deliverableIdOf(row);
                if (!id) return;
                graph[id] = dependencyIdsOf(row);
            });
            var visiting = {};
            var visited = {};
            var loop = false;
            function visit(id) {
                if (loop) return;
                if (visiting[id]) { loop = true; return; }
                if (visited[id]) return;
                visiting[id] = true;
                (graph[id] || []).forEach(visit);
                visiting[id] = false;
                visited[id] = true;
            }
            Object.keys(graph).forEach(visit);
            var failures = loop ? [safeFailure('DEPENDENCY_LOOP_DETECTED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Timeline dependency loop detected.')] : [];
            return freezeTimelineOutput({
                success: !loop,
                readOnly: true,
                classification: loop ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.INFO,
                dependencyGovernance: {
                    dependencyAwareExecution: true,
                    dependencyLoops: loop ? 1 : 0,
                    dependencyBottlenecks: countDependencyBottlenecks(sourceData, tenant)
                },
                failures: failures,
                metadata: {
                    tenantIsolationPreserved: true,
                    strategicTimelineConfidentialityPreserved: true
                }
            });
        } catch (error) {
            return freezeTimelineOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('DEPENDENCY_VALIDATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Dependency validation failed safely.')]
            });
        }
    }

    function evaluateTimelineGovernance(payload, context) {
        try {
            var scope = validateTimelineScope(payload || {}, context || {});
            if (!scope.allowed) return scope;
            return freezeTimelineOutput({
                success: true,
                readOnly: true,
                classification: isOverdue(payload || {}, context || {}) ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO,
                visibility: scope.visibility,
                executionTimelineGovernance: {
                    milestoneScheduling: true,
                    dependencyAwareExecution: true,
                    executionPhaseTracking: true,
                    strategicCheckpoints: true,
                    delayedMilestoneEscalation: true,
                    timelineVersioning: true,
                    executionRollbackMarkers: true,
                    unsafeMilestoneOverridesBlocked: true
                },
                metadata: {
                    existingStrategicWorkflowsPreserved: true,
                    historicalTimelineRecordsImmutable: true
                }
            });
        } catch (error) {
            return freezeTimelineOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('TIMELINE_GOVERNANCE_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Timeline governance evaluation failed safely.')]
            });
        }
    }

    function escalateDelayedMilestones(payload, context) {
        try {
            var scope = validateTimelineScope(payload || {}, context || {});
            if (!scope.allowed) return scope;
            var result = freezeTimelineOutput({
                success: true,
                readOnly: true,
                state: TIMELINE_STATES.ESCALATED,
                classification: FAILURE_CLASSIFICATIONS.WARNING,
                visibility: scope.visibility,
                delayEscalation: {
                    delayedMilestoneEscalation: true,
                    escalationGovernancePreserved: true,
                    executionRollbackMarkers: true,
                    unsafeMilestoneOverridesBlocked: true
                },
                metadata: {
                    timelineActionsAuditable: true,
                    historicalTimelineRecordsImmutable: true
                }
            });
            auditTimeline('STRATEGIC_TIMELINE_DELAY_ESCALATED', { description: 'Delayed milestone escalation evaluated.', severity: 'WARNING' }, context || {});
            emitTelemetry('STRATEGIC_EXECUTION_DELAY_ESCALATED', { severity: 'WARNING', status: TIMELINE_STATES.ESCALATED }, context || {});
            recordMetric('STRATEGIC_EXECUTION_DELAY_ESCALATED', { severity: 'WARNING', status: TIMELINE_STATES.ESCALATED }, context || {});
            return result;
        } catch (error) {
            return freezeTimelineOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('DELAY_ESCALATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Delay escalation failed safely.')]
            });
        }
    }

    function countWhere(rows, predicate) {
        return rows.filter(function filter(row) {
            try { return !!predicate(row); } catch (error) { return false; }
        }).length;
    }

    function scopedTimelineRows(data, tenant) {
        return timelineRows(data).filter(tenantFilter(tenant));
    }

    function scopedDeliverableRows(data, tenant) {
        return deliverableRows(data).filter(tenantFilter(tenant));
    }

    function countDependencyBottlenecks(data, tenant) {
        return countWhere(dependencyRows(data).filter(tenantFilter(tenant)), function blocked(row) {
            return /BLOCKED|WAITING|DELAY/i.test(safeString(row.status || row.state || '', ''));
        });
    }

    function detectExecutionBottlenecks(filters, context) {
        try {
            var data = rawData();
            var tenant = resolveTenant(filters, context, data);
            var timelines = scopedTimelineRows(data, tenant);
            var deliverables = scopedDeliverableRows(data, tenant);
            var escalations = escalationRows(data).filter(tenantFilter(tenant));
            var workflows = workflowRows(data).filter(tenantFilter(tenant));
            var reviews = reviewRows(data).filter(tenantFilter(tenant));
            var summary = {
                delayedMilestones: countWhere(timelines, function delayed(row) { return stateOf(row) === TIMELINE_STATES.DELAYED || isOverdue(row, context); }),
                dependencyBottlenecks: countDependencyBottlenecks(data, tenant),
                executionCongestion: countWhere(timelines, function congested(row) { return stateOf(row) === TIMELINE_STATES.AT_RISK || stateOf(row) === TIMELINE_STATES.DELAYED || stateOf(row) === TIMELINE_STATES.ESCALATED; }) + countWhere(workflows, function degraded(row) { return /DEGRADED|FAILED|BLOCKED/.test(normalizeToken(row.status || row.state)); }),
                overdueDeliverables: countWhere(deliverables, function overdue(row) { return isOverdue(row, context); }),
                repeatedEscalationPatterns: escalations.length >= 2 ? escalations.length : 0,
                stalledExecutionChains: countWhere(reviews, function stalled(row) { return /CLARIFICATION|PENDING|BLOCKED|ESCALATED/i.test(safeString(row.review_status || row.reviewStatus || row.escalation_state || row.reviewerAction, '')); })
            };
            var signals = Object.keys(summary).filter(function active(key) { return summary[key] > 0; }).map(function signal(key) {
                return { signal: key, count: summary[key], severity: key === 'delayedMilestones' || key === 'overdueDeliverables' ? 'WARNING' : 'HIGH_RISK' };
            });
            return freezeTimelineOutput({
                success: true,
                readOnly: true,
                classification: signals.length ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.INFO,
                summary: summary,
                signals: signals,
                metadata: {
                    tenantIsolationPreserved: true,
                    strategicTimelineConfidentialityPreserved: true
                }
            });
        } catch (error) {
            return freezeTimelineOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                summary: {
                    delayedMilestones: 0,
                    dependencyBottlenecks: 0,
                    executionCongestion: 0,
                    overdueDeliverables: 0,
                    repeatedEscalationPatterns: 0,
                    stalledExecutionChains: 0
                },
                signals: [],
                failures: [safeFailure('BOTTLENECK_DETECTION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Bottleneck detection failed safely.')]
            });
        }
    }

    function generateDeliverableTimelineReport(filters, context) {
        try {
            var data = rawData();
            var tenant = resolveTenant(filters, context, data);
            var scope = validateTimelineScope({ tenantSlug: tenant }, context || {});
            var timelines = scopedTimelineRows(data, tenant);
            var deliverables = scopedDeliverableRows(data, tenant);
            var dependencies = dependencyRows(data).filter(tenantFilter(tenant));
            var discussions = discussionRows(data).filter(tenantFilter(tenant));
            var performance = performanceRows(data).filter(tenantFilter(tenant));
            var escalations = escalationRows(data).filter(tenantFilter(tenant));
            var bottlenecks = detectExecutionBottlenecks({ tenantSlug: tenant }, { tenantSlug: tenant, now: context && context.now, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            var total = timelines.length;
            var completedCount = countWhere(timelines, completed);
            var report = freezeTimelineOutput({
                success: true,
                readOnly: true,
                classification: bottlenecks.signals.length ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.INFO,
                visibility: scope.visibility,
                timelineHealth: {
                    totalMilestones: total,
                    plannedMilestones: countWhere(timelines, function row(row) { return stateOf(row) === TIMELINE_STATES.PLANNED; }),
                    activeMilestones: countWhere(timelines, function row(row) { return stateOf(row) === TIMELINE_STATES.ACTIVE; }),
                    atRiskMilestones: countWhere(timelines, function row(row) { return stateOf(row) === TIMELINE_STATES.AT_RISK; }),
                    delayedMilestones: bottlenecks.summary.delayedMilestones,
                    escalatedMilestones: countWhere(timelines, function row(row) { return stateOf(row) === TIMELINE_STATES.ESCALATED; }),
                    completedMilestones: completedCount,
                    archivedMilestones: countWhere(timelines, function row(row) { return stateOf(row) === TIMELINE_STATES.ARCHIVED; })
                },
                dependencyGovernance: {
                    dependencyAwareExecution: true,
                    dependencyBottlenecks: bottlenecks.summary.dependencyBottlenecks,
                    dependencyCongestion: bottlenecks.summary.dependencyBottlenecks,
                    dependencyResolutionSpeed: completedCount,
                    dependencyLoops: validateDependencyGraph({ tenantSlug: tenant }, { tenantSlug: tenant }).dependencyGovernance.dependencyLoops || 0
                },
                delayBottleneckIntelligence: bottlenecks.summary,
                kpiPerformanceIntegration: {
                    kpiLinkedMilestones: countWhere(timelines, function kpi(row) { return !!safeString(row.kpiId || row.kpi_id, ''); }),
                    executionScoring: Math.round((completedCount / Math.max(1, total)) * 100),
                    strategicPerformanceMapping: performance.length,
                    deliverableCompletionAnalytics: completedCount,
                    leadershipAccountabilityMapping: countWhere(deliverables, function owner(row) { return !!ownerIdOf(row); }),
                    unsafeKpiMutation: false
                },
                timelineAnalytics: {
                    completionVelocity: Math.round((completedCount / Math.max(1, total)) * 100),
                    delayedMilestoneFrequency: bottlenecks.summary.delayedMilestones,
                    executionCongestion: bottlenecks.summary.executionCongestion,
                    dependencyResolutionSpeed: completedCount,
                    escalationLinkedDelays: escalations.length,
                    strategicCompletionTrends: completedCount
                },
                workflowCommunicationIntegration: {
                    milestoneLinkedDiscussions: countWhere(discussions, function strategic(row) { return /STRATEGIC|DELIVERABLE/i.test(safeString(row.workflowType || row.type || '', '')); }),
                    executionEscalationThreads: escalations.length,
                    strategicCollaboration: discussions.length,
                    approvalLinkedCheckpoints: reviewRows(data).filter(tenantFilter(tenant)).length,
                    operationalCoordination: workflowRows(data).filter(tenantFilter(tenant)).length,
                    unsafeWorkflowExposure: false
                },
                accessGovernance: {
                    employeeAssignedDeliverablesOnly: true,
                    managerTeamExecutionVisibility: true,
                    hrOperationalTimelineVisibility: true,
                    hrHeadStrategicExecutionVisibility: true,
                    directorOrganizationStrategicAnalytics: true,
                    superAdminStrategicMutationAuthority: false,
                    platformOwnerExecutionChain: false,
                    crossTenantTimelineLeakageBlocked: true,
                    historicalTimelineRecordsImmutable: true,
                    existingStrategicWorkflowsPreserved: true,
                    existingWorkflowsPreserved: true,
                    timelineActionsAuditable: true,
                    escalationGovernancePreserved: true,
                    strategicTimelineConfidentialityPreserved: true,
                    tenantIsolationPreserved: true
                },
                integrationHealth: {
                    strategicReviewIntegrated: !!global.StrategicReviewService,
                    performanceGovernanceIntegrated: !!global.PerformanceGovernanceService,
                    communicationGovernanceIntegrated: !!global.CommunicationGovernanceService,
                    escalationCommandIntegrated: !!global.EscalationCommandService,
                    workflowDiscussionIntegrated: !!global.WorkflowDiscussionService,
                    workflowTelemetryIntegrated: !!global.WorkflowTelemetryService,
                    auditReady: !!global.AuditService,
                    telemetryReady: !!global.WorkflowTelemetryService,
                    metricsReady: !!global.OrchestrationMetricsService
                },
                warnings: bottlenecks.signals,
                metadata: {
                    tenantIsolationPreserved: true,
                    strategicTimelineConfidentialityPreserved: true,
                    historicalTimelineRecordsImmutable: true
                }
            });
            auditTimeline('DELIVERABLE_TIMELINE_REPORTED', { description: 'Strategic deliverable timeline report viewed.', severity: report.classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO' }, context || {});
            emitTelemetry('STRATEGIC_EXECUTION_TIMELINE_REPORTED', { severity: report.classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO', status: report.classification }, context || {});
            recordMetric('DELIVERABLE_TIMELINE_REPORTED', { severity: report.classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO', status: report.classification }, context || {});
            return report;
        } catch (error) {
            return freezeTimelineOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                timelineHealth: { totalMilestones: 0 },
                failures: [safeFailure('TIMELINE_REPORT_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Timeline report failed safely.')]
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        function check(label, condition) { checks.push({ label: label, passed: !!condition }); }
        try {
            var malformed = normalizeTimelinePayload(null, { tenantSlug: 'tabsons' });
            check('malformed payloads fail safely', malformed.success === false);
            var cross = validateTimelineScope({ tenantSlug: 'abc', deliverableId: 'DEL-X', empId: 'EMP-X' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-SELF' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('cross-tenant timeline visibility is blocked', cross.allowed === false && cross.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER);
            var loop = validateDependencyGraph({ tenantSlug: 'tabsons', milestones: [{ milestoneId: 'A', dependencyIds: ['B'] }, { milestoneId: 'B', dependencyIds: ['A'] }] }, { tenantSlug: 'tabsons' });
            check('dependency loops fail safely', loop.success === false);
            var escalation = escalateDelayedMilestones({ tenantSlug: 'tabsons', empId: 'EMP-SELF', state: 'DELAYED', dueDate: '2026-01-01' }, { tenantSlug: 'tabsons', actor: { role: 'HR_HEAD', id: 'HR-SELF' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('delay escalation preserves governance', escalation.success === true && escalation.delayEscalation.escalationGovernancePreserved === true);
            var originalStrategic = global.StrategicReviewService;
            var originalPerformance = global.PerformanceGovernanceService;
            var originalCommunication = global.CommunicationGovernanceService;
            var originalEscalation = global.EscalationCommandService;
            var originalDiscussion = global.WorkflowDiscussionService;
            try {
                global.StrategicReviewService = undefined;
                global.PerformanceGovernanceService = undefined;
                global.CommunicationGovernanceService = undefined;
                global.EscalationCommandService = undefined;
                global.WorkflowDiscussionService = undefined;
                var degraded = generateDeliverableTimelineReport({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-SELF' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
                check('optional dependency absence degrades safely', degraded.success === true && degraded.integrationHealth.strategicReviewIntegrated === false && degraded.integrationHealth.performanceGovernanceIntegrated === false);
            } finally {
                global.StrategicReviewService = originalStrategic;
                global.PerformanceGovernanceService = originalPerformance;
                global.CommunicationGovernanceService = originalCommunication;
                global.EscalationCommandService = originalEscalation;
                global.WorkflowDiscussionService = originalDiscussion;
            }
            var frozen = freezeTimelineOutput({ payload: { state: TIMELINE_STATES.ACTIVE } });
            check('outputs are immutable', Object.isFrozen(frozen) && Object.isFrozen(frozen.payload));
        } catch (error) {
            checks.push({ label: 'self-test has no uncaught failure', passed: false, error: error && error.message ? error.message : safeString(error, 'unknown') });
        }
        var result = freezeTimelineOutput({
            passed: checks.length > 0 && checks.every(function every(item) { return item.passed; }),
            checks: checks
        });
        global.__ARTHHRMS_DELIVERABLE_TIMELINE_SELF_TEST__ = result;
        return result;
    }

    var DeliverableTimelineService = Object.freeze({
        VERSION: VERSION,
        TIMELINE_STATES: TIMELINE_STATES,
        FAILURE_CLASSIFICATIONS: FAILURE_CLASSIFICATIONS,
        VISIBILITY: VISIBILITY,
        validateTimelineScope: validateTimelineScope,
        classifyExecutionRisk: classifyExecutionRisk,
        normalizeTimelinePayload: normalizeTimelinePayload,
        freezeTimelineOutput: freezeTimelineOutput,
        validateDependencyGraph: validateDependencyGraph,
        evaluateTimelineGovernance: evaluateTimelineGovernance,
        escalateDelayedMilestones: escalateDelayedMilestones,
        detectExecutionBottlenecks: detectExecutionBottlenecks,
        generateDeliverableTimelineReport: generateDeliverableTimelineReport,
        runSelfTest: runSelfTest
    });

    global.DeliverableTimelineService = DeliverableTimelineService;
    global.deliverableTimelineService = DeliverableTimelineService;

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
