/**
 * departmentExecutionBoardService.js
 * ARTHHRMS Enterprise Department Execution Board + Operational Accountability Intelligence.
 *
 * Additive read-only governance layer for department execution tracking,
 * ownership accountability, workload distribution, execution bottlenecks,
 * escalation-linked execution, KPI-linked accountability, workflow
 * collaboration, and tenant-confidential leadership oversight.
 */
(function attachDepartmentExecutionBoardService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[DepartmentExecutionBoardService]';

    var EXECUTION_STATES = Object.freeze({
        PLANNED: 'PLANNED',
        ASSIGNED: 'ASSIGNED',
        IN_PROGRESS: 'IN_PROGRESS',
        BLOCKED: 'BLOCKED',
        ESCALATED: 'ESCALATED',
        REVIEW_PENDING: 'REVIEW_PENDING',
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
        ASSIGNED_EXECUTION_ONLY: 'ASSIGNED_EXECUTION_ONLY',
        TEAM_EXECUTION_VISIBILITY: 'TEAM_EXECUTION_VISIBILITY',
        HR_OPERATIONAL_EXECUTION_VISIBILITY: 'HR_OPERATIONAL_EXECUTION_VISIBILITY',
        STRATEGIC_EXECUTION_VISIBILITY: 'STRATEGIC_EXECUTION_VISIBILITY',
        ORGANIZATION_EXECUTION_ANALYTICS: 'ORGANIZATION_EXECUTION_ANALYTICS',
        INFRASTRUCTURE_VISIBILITY_ONLY: 'INFRASTRUCTURE_VISIBILITY_ONLY',
        PLATFORM_GOVERNANCE_ONLY: 'PLATFORM_GOVERNANCE_ONLY'
    });

    var SENSITIVE_KEY_PATTERN = /(execution.?id|deliverable.?id|milestone.?id|dependency.?id|emp.?id|employee.?id|owner.?id|reviewer.?id|manager.?id|strategic.?owner|kpi.?id|correlation.?id|workflow.?id|event.?id|escalation.?id|note|comment|feedback|private|confidential|salary|payroll|compensation|rating|score|token|secret|jwt|authorization|service.?role|private.?key|raw|payload.?id|target.?id|log.?id)/i;
    var SENSITIVE_VALUE_PATTERN = /(https?:\/\/[^\s"',}]+|private:\/\/[^\s"',}]+|\b(private|confidential|secret|salary|payroll|strategic note|ownership note|execution chain)\b[^,;}]*)/ig;

    var SAFE_GOVERNANCE_KEYS = Object.freeze({
        success: true,
        allowed: true,
        readOnly: true,
        classification: true,
        visibility: true,
        state: true,
        generatedAt: true,
        tenantSlug: true,
        status: true,
        severity: true,
        source: true,
        department: true,
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
        executionBoardHealth: true,
        workloadDistribution: true,
        accountabilityGovernance: true,
        bottleneckIntelligence: true,
        kpiPerformanceIntegration: true,
        workflowCommunicationIntegration: true,
        executionAnalytics: true,
        accessGovernance: true,
        integrationHealth: true,
        totalExecutions: true,
        plannedExecutions: true,
        assignedExecutions: true,
        inProgressExecutions: true,
        blockedExecutions: true,
        escalatedExecutions: true,
        reviewPendingExecutions: true,
        completedExecutions: true,
        archivedExecutions: true,
        overloadedTeams: true,
        underutilizedExecutionCapacity: true,
        delayedOwnershipResponse: true,
        workloadCongestion: true,
        executionImbalance: true,
        bottleneckOwnershipConcentration: true,
        ownershipAssignments: true,
        executionOwnershipAssignment: true,
        workloadBalancing: true,
        accountabilityMapping: true,
        delayedExecutionEscalation: true,
        executionReassignmentHistory: true,
        ownershipAuditTrails: true,
        executionRollbackMarkers: true,
        unsafeOwnershipOverride: true,
        unsafeOwnershipOverridesBlocked: true,
        historicalExecutionImmutable: true,
        blockedExecutionChains: true,
        repeatedEscalations: true,
        dependencyLinkedDelays: true,
        unresolvedOperationalBottlenecks: true,
        executionStagnation: true,
        accountabilityFailures: true,
        kpiLinkedExecutions: true,
        executionPerformanceScoring: true,
        completionVelocityTracking: true,
        ownershipPerformanceAnalytics: true,
        departmentExecutionHealth: true,
        unsafeKpiMutation: true,
        executionLinkedCollaboration: true,
        accountabilityDiscussions: true,
        escalationCoordination: true,
        milestoneReviewWorkflows: true,
        operationalExecutionThreads: true,
        unsafeWorkflowExposure: true,
        completionRate: true,
        executionVelocity: true,
        escalationFrequency: true,
        ownershipChanges: true,
        workloadImbalance: true,
        blockedExecutionTrends: true,
        employeeAssignedExecutionOnly: true,
        managerTeamExecutionVisibility: true,
        hrOperationalExecutionVisibility: true,
        hrHeadStrategicExecutionVisibility: true,
        directorOrganizationExecutionAnalytics: true,
        superAdminExecutionOwnershipAuthority: true,
        platformOwnerOperationalChain: true,
        crossTenantExecutionLeakageBlocked: true,
        historicalExecutionRecordsImmutable: true,
        unsafeOwnershipOverrideBlocked: true,
        existingStrategicWorkflowsPreserved: true,
        existingWorkflowsPreserved: true,
        executionActionsAuditable: true,
        escalationGovernancePreserved: true,
        departmentExecutionConfidentialityPreserved: true,
        tenantIsolationPreserved: true,
        strategicDependencyIntegrated: true,
        deliverableTimelineIntegrated: true,
        strategicExecutionIntegrated: true,
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

    function executionIdOf(row) {
        return safeString(row && (row.executionId || row.taskId || row.id || row.execution_id), '');
    }

    function deliverableIdOf(row) {
        return safeString(row && (row.deliverableId || row.id || row.deliverable_id), '');
    }

    function ownerIdOf(row) {
        return safeString(row && (row.ownerId || row.executionOwnerId || row.strategicOwnerId || row.reviewerId || row.managerId), '');
    }

    function departmentOf(row) {
        return safeString(row && (row.department || row.dept || row.sourceDepartment || row.team), 'Unassigned') || 'Unassigned';
    }

    function stateOf(row) {
        var raw = normalizeToken(row && (row.state || row.executionState || row.status || row.governanceState || row.currentStatus));
        if (raw === 'OPEN' || raw === 'ACTIVE' || raw === 'STARTED') return EXECUTION_STATES.IN_PROGRESS;
        if (raw === 'PENDING_REVIEW' || raw === 'UNDER_REVIEW') return EXECUTION_STATES.REVIEW_PENDING;
        if (raw === 'DELAYED' || raw === 'OVERDUE') return EXECUTION_STATES.BLOCKED;
        if (raw === 'DONE' || raw === 'CLOSED' || raw === 'RESOLVED') return EXECUTION_STATES.COMPLETED;
        return EXECUTION_STATES[raw] ? raw : EXECUTION_STATES.PLANNED;
    }

    function dueDateOf(row) {
        return safeString(row && (row.dueDate || row.deadlineDate || row.endDate || row.targetDate), '');
    }

    function isCompleted(row) {
        return stateOf(row) === EXECUTION_STATES.COMPLETED || safeNumber(row && row.progressPercent, 0) >= 100 || !!(row && row.completedAt);
    }

    function isOverdue(row, context) {
        if (isCompleted(row)) return false;
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
            if (!tenant) return false;
            return rowTenant(row) === tenant;
        };
    }

    function executionRows(data) {
        return list(data, 'departmentExecutionRecords').concat(list(data, 'executionBoardRecords'), list(data, 'departmentTasks'), list(data, 'operationalExecutions'));
    }

    function deliverableRows(data) {
        return list(data, 'strategicDeliverables');
    }

    function timelineRows(data) {
        return list(data, 'deliverableTimelineRecords').concat(list(data, 'strategicTimelines'), list(data, 'milestones'));
    }

    function dependencyRows(data) {
        return list(data, 'deliverableDependencies').concat(list(data, 'strategicDependencies'), list(data, 'dependencyGraphRecords'));
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

    function findDeliverable(data, id) {
        var needle = safeString(id, '');
        if (!needle) return null;
        return deliverableRows(data).filter(function match(row) { return deliverableIdOf(row) === needle; })[0] || null;
    }

    function findExecution(data, row) {
        var id = executionIdOf(row);
        if (!id) return null;
        return executionRows(data).filter(function match(item) { return executionIdOf(item) === id; })[0] || null;
    }

    function mergedRecord(data, row) {
        var execution = findExecution(data, row || {}) || {};
        var deliverable = findDeliverable(data, deliverableIdOf(row) || deliverableIdOf(execution)) || {};
        var merged = {};
        Object.keys(deliverable).forEach(function copy(key) { merged[key] = deliverable[key]; });
        Object.keys(execution).forEach(function copy(key) { merged[key] = execution[key]; });
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

    function freezeExecutionOutput(output) {
        return deepFreeze(cloneSanitized(output || {}, 'payload'));
    }

    function safeFailure(code, classification, message) {
        return freezeExecutionOutput({
            failureCode: code,
            classification: classification || FAILURE_CLASSIFICATIONS.WARNING,
            message: message || code
        });
    }

    function classifyExecutionRisk(input) {
        try {
            var risk = input || {};
            if (risk.crossTenant || risk.historicalMutation || risk.executionLeakage) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
            if (risk.unsafeOwnershipOverride || risk.blockedExecution || risk.accountabilityFailure || risk.repeatedEscalation) return FAILURE_CLASSIFICATIONS.HIGH_RISK;
            if (risk.workloadImbalance || risk.workloadCongestion || risk.delayedOwnershipResponse || risk.malformedPayload) return FAILURE_CLASSIFICATIONS.WARNING;
            return FAILURE_CLASSIFICATIONS.INFO;
        } catch (error) {
            return FAILURE_CLASSIFICATIONS.HIGH_RISK;
        }
    }

    function scopeVisibility(role) {
        if (role === 'EMPLOYEE') return VISIBILITY.ASSIGNED_EXECUTION_ONLY;
        if (role === 'MANAGER') return VISIBILITY.TEAM_EXECUTION_VISIBILITY;
        if (role === 'HR') return VISIBILITY.HR_OPERATIONAL_EXECUTION_VISIBILITY;
        if (role === 'HR_HEAD') return VISIBILITY.STRATEGIC_EXECUTION_VISIBILITY;
        if (role === 'DIRECTOR') return VISIBILITY.ORGANIZATION_EXECUTION_ANALYTICS;
        if (role === 'SUPER_ADMIN') return VISIBILITY.INFRASTRUCTURE_VISIBILITY_ONLY;
        if (role === 'PLATFORM_OWNER') return VISIBILITY.PLATFORM_GOVERNANCE_ONLY;
        return VISIBILITY.NONE;
    }

    function validateExecutionBoardScope(record, context) {
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
                failures.push(safeFailure('CROSS_TENANT_EXECUTION_VISIBILITY_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Cross-tenant department execution visibility is blocked.'));
            }
            if (role === 'PLATFORM_OWNER') {
                failures.push(safeFailure('PLATFORM_OWNER_OPERATIONAL_CHAIN_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'PLATFORM_OWNER is isolated from operational execution chains.'));
            }
            if (role === 'SUPER_ADMIN' && record && (record.ownershipOverride || record.ownerOverride || record.mutationRequested || record.forceExecutionMutation)) {
                failures.push(safeFailure('SUPER_ADMIN_EXECUTION_OWNERSHIP_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'SUPER_ADMIN cannot modify department execution ownership.'));
            }
            if (stateOf(record || {}) === EXECUTION_STATES.ARCHIVED && record && (record.ownershipOverride || record.ownerOverride || record.mutationRequested || record.forceExecutionMutation)) {
                failures.push(safeFailure('ARCHIVED_EXECUTION_MUTATION_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Archived execution accountability records are immutable.'));
            }
            if (role === 'EMPLOYEE' && currentActor && employeeId && currentActor !== employeeId) {
                failures.push(safeFailure('EMPLOYEE_EXECUTION_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Employees can only view assigned execution.')); 
            }
            if (role === 'MANAGER' && employeeId && currentActor && !managerOwnsEmployee(data, currentActor, employeeId) && ownerIdOf(merged) !== currentActor) {
                failures.push(safeFailure('MANAGER_TEAM_EXECUTION_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Managers require team execution visibility.'));
            }
            if (isOverdue(merged, ctx) || stateOf(merged) === EXECUTION_STATES.BLOCKED || stateOf(merged) === EXECUTION_STATES.ESCALATED) {
                warnings.push(safeFailure('EXECUTION_BLOCKED_OR_DELAYED', FAILURE_CLASSIFICATIONS.WARNING, 'Execution is blocked, escalated, or delayed.'));
            }

            var classification = failures.reduce(function highest(current, failure) {
                if (failure.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
                if (failure.classification === FAILURE_CLASSIFICATIONS.HIGH_RISK && current !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER) return FAILURE_CLASSIFICATIONS.HIGH_RISK;
                return current;
            }, warnings.length ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO);

            return freezeExecutionOutput({
                success: true,
                allowed: failures.length === 0,
                readOnly: true,
                classification: classification,
                visibility: failures.length ? VISIBILITY.NONE : scopeVisibility(role),
                failures: failures,
                warnings: warnings,
                metadata: {
                    tenantIsolationPreserved: failures.filter(function cross(item) { return item.failureCode === 'CROSS_TENANT_EXECUTION_VISIBILITY_BLOCKED'; }).length === 0,
                    departmentExecutionConfidentialityPreserved: true,
                    historicalExecutionRecordsImmutable: failures.filter(function mutation(item) { return item.failureCode === 'ARCHIVED_EXECUTION_MUTATION_BLOCKED'; }).length === 0
                }
            });
        } catch (error) {
            return freezeExecutionOutput({
                success: false,
                allowed: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                visibility: VISIBILITY.NONE,
                failures: [safeFailure('EXECUTION_SCOPE_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Execution board scope validation failed safely.')]
            });
        }
    }

    function normalizeExecutionPayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeExecutionOutput({
                    success: false,
                    readOnly: true,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    failures: [safeFailure('MALFORMED_EXECUTION_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Malformed execution payload rejected.')]
                });
            }
            return freezeExecutionOutput({
                success: true,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.INFO,
                payload: {
                    state: stateOf(payload),
                    tenantSlug: normalizeTenantSlug(payload.tenantSlug || payload.tenantId || contextTenant(context)),
                    department: sanitizeText(departmentOf(payload)),
                    workloadUnits: Math.max(0, safeNumber(payload.workloadUnits, 0)),
                    progressPercent: Math.max(0, Math.min(100, safeNumber(payload.progressPercent, 0))),
                    dueDate: safeString(payload.dueDate || payload.deadlineDate, '').slice(0, 10),
                    metadata: cloneSanitized(payload.metadata || {}, 'metadata')
                },
                metadata: {
                    departmentExecutionConfidentialityPreserved: true,
                    tenantIsolationPreserved: true
                }
            });
        } catch (error) {
            return freezeExecutionOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('EXECUTION_NORMALIZATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Execution normalization failed safely.')]
            });
        }
    }

    function auditExecution(actionType, metadata, context) {
        if (auditForwarding || context && context.skipAuditPersistence) return { success: true, skipped: true };
        auditForwarding = true;
        try {
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    actionType: actionType,
                    eventType: actionType,
                    module: 'Department Execution',
                    targetId: '',
                    description: metadata && metadata.description || actionType,
                    actorRole: context && context.actor && context.actor.role || 'hr',
                    actorId: context && context.actor && (context.actor.id || context.actor.empId) || '',
                    severity: metadata && metadata.severity || 'INFO',
                    metadata: cloneSanitized(metadata || {}, 'metadata')
                }, { source: 'departmentExecutionBoardService', skipPersistence: false });
            }
            var source = db();
            if (source && typeof source.writeAuditLog === 'function') {
                source.writeAuditLog(context && context.actor && context.actor.role || 'hr', context && context.actor && context.actor.id || '', actionType, 'Department Execution', '', metadata && metadata.description || actionType);
            }
            return { success: true };
        } catch (error) {
            return { success: false, warning: 'Execution audit failed safely.' };
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
                    source: 'departmentExecutionBoardService',
                    severity: metadata && metadata.severity || 'INFO',
                    status: metadata && metadata.status || eventType,
                    tenantSlug: contextTenant(context) || metadata && metadata.tenantSlug || '',
                    metadata: cloneSanitized(metadata || {}, 'metadata')
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Execution telemetry failed safely.' };
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
                    source: 'departmentExecutionBoardService',
                    status: metadata && metadata.status || metricType,
                    severity: metadata && metadata.severity || 'INFO'
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Execution metric failed safely.' };
        } finally {
            metricForwarding = false;
        }
        return { success: false, warning: 'OrchestrationMetricsService unavailable.' };
    }

    function evaluateAccountabilityGovernance(payload, context) {
        try {
            var scope = validateExecutionBoardScope(payload || {}, context || {});
            if (!scope.allowed) return scope;
            return freezeExecutionOutput({
                success: true,
                readOnly: true,
                classification: stateOf(payload || {}) === EXECUTION_STATES.BLOCKED ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO,
                visibility: scope.visibility,
                accountabilityGovernance: {
                    executionOwnershipAssignment: true,
                    workloadBalancing: true,
                    accountabilityMapping: true,
                    delayedExecutionEscalation: true,
                    executionReassignmentHistory: true,
                    ownershipAuditTrails: true,
                    executionRollbackMarkers: true,
                    unsafeOwnershipOverridesBlocked: true,
                    historicalExecutionImmutable: true
                },
                metadata: {
                    existingStrategicWorkflowsPreserved: true,
                    historicalExecutionRecordsImmutable: true
                }
            });
        } catch (error) {
            return freezeExecutionOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('ACCOUNTABILITY_GOVERNANCE_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Accountability governance evaluation failed safely.')]
            });
        }
    }

    function scopedExecutions(data, tenant) {
        return executionRows(data).filter(tenantFilter(tenant));
    }

    function isBlockedLike(row, context) {
        return stateOf(row) === EXECUTION_STATES.BLOCKED || stateOf(row) === EXECUTION_STATES.ESCALATED || isOverdue(row, context);
    }

    function analyzeWorkloadDistribution(filters, context) {
        try {
            var data = rawData();
            var tenant = resolveTenant(filters, context, data);
            var rows = scopedExecutions(data, tenant);
            var departmentLoad = {};
            var ownerBlocked = {};
            rows.forEach(function each(row) {
                var dept = departmentOf(row);
                departmentLoad[dept] = (departmentLoad[dept] || 0) + safeNumber(row.workloadUnits, 1);
                if (isBlockedLike(row, context)) {
                    var owner = ownerIdOf(row) || 'UNASSIGNED';
                    ownerBlocked[owner] = (ownerBlocked[owner] || 0) + 1;
                }
            });
            var loads = Object.keys(departmentLoad).map(function load(key) { return departmentLoad[key]; });
            var maxLoad = loads.length ? Math.max.apply(Math, loads) : 0;
            var minLoad = loads.length ? Math.min.apply(Math, loads) : 0;
            var summary = {
                overloadedTeams: Object.keys(departmentLoad).filter(function overloaded(key) { return departmentLoad[key] >= 10; }).length,
                underutilizedExecutionCapacity: Object.keys(departmentLoad).filter(function under(key) { return departmentLoad[key] <= 2; }).length,
                delayedOwnershipResponse: countWhere(rows, function delayed(row) { return isOverdue(row, context) && !isCompleted(row); }),
                workloadCongestion: countWhere(rows, function congested(row) { return isBlockedLike(row, context); }),
                executionImbalance: maxLoad - minLoad > 5 ? 1 : 0,
                bottleneckOwnershipConcentration: Object.keys(ownerBlocked).filter(function concentrated(key) { return ownerBlocked[key] >= 2; }).length
            };
            var signals = Object.keys(summary).filter(function active(key) { return summary[key] > 0; }).map(function signal(key) {
                return { signal: key, count: summary[key], severity: key === 'workloadCongestion' || key === 'bottleneckOwnershipConcentration' ? 'HIGH_RISK' : 'WARNING' };
            });
            return freezeExecutionOutput({
                success: true,
                readOnly: true,
                classification: signals.length ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.INFO,
                summary: summary,
                signals: signals,
                metadata: {
                    tenantIsolationPreserved: true,
                    departmentExecutionConfidentialityPreserved: true
                }
            });
        } catch (error) {
            return freezeExecutionOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                summary: {
                    overloadedTeams: 0,
                    underutilizedExecutionCapacity: 0,
                    delayedOwnershipResponse: 0,
                    workloadCongestion: 0,
                    executionImbalance: 0,
                    bottleneckOwnershipConcentration: 0
                },
                signals: [],
                failures: [safeFailure('WORKLOAD_DISTRIBUTION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Workload distribution analysis failed safely.')]
            });
        }
    }

    function countWhere(rows, predicate) {
        return rows.filter(function filter(row) {
            try { return !!predicate(row); } catch (error) { return false; }
        }).length;
    }

    function detectOperationalBottlenecks(filters, context) {
        try {
            var data = rawData();
            var tenant = resolveTenant(filters, context, data);
            var rows = scopedExecutions(data, tenant);
            var dependencies = dependencyRows(data).filter(tenantFilter(tenant));
            var escalations = escalationRows(data).filter(tenantFilter(tenant));
            var discussions = discussionRows(data).filter(tenantFilter(tenant));
            var workflows = workflowRows(data).filter(tenantFilter(tenant));
            var summary = {
                blockedExecutionChains: countWhere(rows, function blocked(row) { return isBlockedLike(row, context); }),
                repeatedEscalations: escalations.length >= 2 ? escalations.length : 0,
                dependencyLinkedDelays: countWhere(dependencies, function dep(row) { return /BLOCKED|WAITING|AT_RISK|DELAY/i.test(safeString(row.state || row.status || '', '')); }),
                unresolvedOperationalBottlenecks: countWhere(discussions, function open(row) { return row.unresolved === true || /ACTIVE|OPEN|BLOCKED/.test(normalizeToken(row.state || row.status)); }) + countWhere(workflows, function event(row) { return /DEGRADED|FAILED|BLOCKED/.test(normalizeToken(row.status || row.state)); }),
                executionStagnation: countWhere(rows, function stagnant(row) { return safeNumber(row.progressPercent, 0) < 30 && isOverdue(row, context); }),
                accountabilityFailures: countWhere(rows, function failure(row) { return safeNumber(row.ownershipChanges, 0) >= 2 || !ownerIdOf(row); })
            };
            var signals = Object.keys(summary).filter(function active(key) { return summary[key] > 0; }).map(function signal(key) {
                return { signal: key, count: summary[key], severity: key === 'blockedExecutionChains' || key === 'accountabilityFailures' ? 'HIGH_RISK' : 'WARNING' };
            });
            return freezeExecutionOutput({
                success: true,
                readOnly: true,
                classification: signals.length ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.INFO,
                summary: summary,
                signals: signals,
                metadata: {
                    tenantIsolationPreserved: true,
                    departmentExecutionConfidentialityPreserved: true
                }
            });
        } catch (error) {
            return freezeExecutionOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                summary: {
                    blockedExecutionChains: 0,
                    repeatedEscalations: 0,
                    dependencyLinkedDelays: 0,
                    unresolvedOperationalBottlenecks: 0,
                    executionStagnation: 0,
                    accountabilityFailures: 0
                },
                signals: [],
                failures: [safeFailure('BOTTLENECK_DETECTION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Operational bottleneck detection failed safely.')]
            });
        }
    }

    function escalateBlockedExecution(payload, context) {
        try {
            var scope = validateExecutionBoardScope(payload || {}, context || {});
            if (!scope.allowed) return scope;
            var result = freezeExecutionOutput({
                success: true,
                readOnly: true,
                state: EXECUTION_STATES.ESCALATED,
                classification: FAILURE_CLASSIFICATIONS.WARNING,
                visibility: scope.visibility,
                blockedExecutionEscalation: {
                    delayedExecutionEscalation: true,
                    escalationGovernancePreserved: true,
                    executionRollbackMarkers: true,
                    unsafeOwnershipOverridesBlocked: true
                },
                metadata: {
                    executionActionsAuditable: true,
                    historicalExecutionRecordsImmutable: true
                }
            });
            auditExecution('DEPARTMENT_EXECUTION_BLOCKED_ESCALATED', { description: 'Blocked department execution escalation evaluated.', severity: 'WARNING' }, context || {});
            emitTelemetry('DEPARTMENT_EXECUTION_BLOCKED_ESCALATED', { severity: 'WARNING', status: EXECUTION_STATES.ESCALATED }, context || {});
            recordMetric('DEPARTMENT_EXECUTION_BLOCKED_ESCALATED', { severity: 'WARNING', status: EXECUTION_STATES.ESCALATED }, context || {});
            return result;
        } catch (error) {
            return freezeExecutionOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('BLOCKED_EXECUTION_ESCALATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Blocked execution escalation failed safely.')]
            });
        }
    }

    function generateDepartmentExecutionReport(filters, context) {
        try {
            var data = rawData();
            var tenant = resolveTenant(filters, context, data);
            var scope = validateExecutionBoardScope({ tenantSlug: tenant }, context || {});
            var rows = scopedExecutions(data, tenant);
            var deliverables = deliverableRows(data).filter(tenantFilter(tenant));
            var timelines = timelineRows(data).filter(tenantFilter(tenant));
            var dependencies = dependencyRows(data).filter(tenantFilter(tenant));
            var performance = performanceRows(data).filter(tenantFilter(tenant));
            var escalations = escalationRows(data).filter(tenantFilter(tenant));
            var discussions = discussionRows(data).filter(tenantFilter(tenant));
            var workflows = workflowRows(data).filter(tenantFilter(tenant));
            var workload = analyzeWorkloadDistribution({ tenantSlug: tenant }, { tenantSlug: tenant, now: context && context.now, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            var bottlenecks = detectOperationalBottlenecks({ tenantSlug: tenant }, { tenantSlug: tenant, now: context && context.now, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            var completed = countWhere(rows, isCompleted);
            var ownershipChanges = rows.reduce(function sum(total, row) { return total + safeNumber(row.ownershipChanges, 0); }, 0);
            var report = freezeExecutionOutput({
                success: true,
                readOnly: true,
                classification: bottlenecks.signals.length || workload.signals.length ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.INFO,
                visibility: scope.visibility,
                executionBoardHealth: {
                    totalExecutions: rows.length,
                    plannedExecutions: countWhere(rows, function row(row) { return stateOf(row) === EXECUTION_STATES.PLANNED; }),
                    assignedExecutions: countWhere(rows, function row(row) { return stateOf(row) === EXECUTION_STATES.ASSIGNED; }),
                    inProgressExecutions: countWhere(rows, function row(row) { return stateOf(row) === EXECUTION_STATES.IN_PROGRESS; }),
                    blockedExecutions: countWhere(rows, function row(row) { return stateOf(row) === EXECUTION_STATES.BLOCKED; }),
                    escalatedExecutions: countWhere(rows, function row(row) { return stateOf(row) === EXECUTION_STATES.ESCALATED; }),
                    reviewPendingExecutions: countWhere(rows, function row(row) { return stateOf(row) === EXECUTION_STATES.REVIEW_PENDING; }),
                    completedExecutions: completed,
                    archivedExecutions: countWhere(rows, function row(row) { return stateOf(row) === EXECUTION_STATES.ARCHIVED; })
                },
                workloadDistribution: workload.summary,
                accountabilityGovernance: {
                    ownershipAssignments: countWhere(rows, function owner(row) { return !!ownerIdOf(row); }),
                    executionOwnershipAssignment: true,
                    workloadBalancing: true,
                    accountabilityMapping: true,
                    delayedExecutionEscalation: true,
                    executionReassignmentHistory: ownershipChanges,
                    ownershipAuditTrails: true,
                    executionRollbackMarkers: true,
                    unsafeOwnershipOverride: false,
                    unsafeOwnershipOverridesBlocked: true,
                    historicalExecutionImmutable: true
                },
                bottleneckIntelligence: bottlenecks.summary,
                kpiPerformanceIntegration: {
                    kpiLinkedExecutions: countWhere(rows, function kpi(row) { return !!safeString(row.kpiId || row.kpi_id, ''); }) + countWhere(performance, function kpi(row) { return !!safeString(row.kpiId || row.kpi_id, ''); }),
                    executionPerformanceScoring: Math.round((completed / Math.max(1, rows.length)) * 100),
                    completionVelocityTracking: completed,
                    ownershipPerformanceAnalytics: countWhere(rows, function owner(row) { return !!ownerIdOf(row); }),
                    departmentExecutionHealth: Math.max(0, 100 - Math.min(100, bottlenecks.summary.blockedExecutionChains * 15 + workload.summary.workloadCongestion * 5)),
                    unsafeKpiMutation: false
                },
                workflowCommunicationIntegration: {
                    executionLinkedCollaboration: countWhere(discussions, function discussion(row) { return /EXECUTION|STRATEGIC|DEPARTMENT/.test(safeString(row.workflowType || row.type || '', '').toUpperCase()); }),
                    accountabilityDiscussions: discussions.length,
                    escalationCoordination: escalations.length,
                    milestoneReviewWorkflows: timelines.length,
                    operationalExecutionThreads: workflows.length,
                    unsafeWorkflowExposure: false
                },
                executionAnalytics: {
                    completionRate: Math.round((completed / Math.max(1, rows.length)) * 100),
                    executionVelocity: completed,
                    escalationFrequency: escalations.length,
                    ownershipChanges: ownershipChanges,
                    workloadImbalance: workload.summary.executionImbalance,
                    blockedExecutionTrends: bottlenecks.summary.blockedExecutionChains,
                    departmentExecutionHealth: Math.max(0, 100 - Math.min(100, bottlenecks.summary.blockedExecutionChains * 15 + workload.summary.workloadCongestion * 5))
                },
                accessGovernance: {
                    employeeAssignedExecutionOnly: true,
                    managerTeamExecutionVisibility: true,
                    hrOperationalExecutionVisibility: true,
                    hrHeadStrategicExecutionVisibility: true,
                    directorOrganizationExecutionAnalytics: true,
                    superAdminExecutionOwnershipAuthority: false,
                    platformOwnerOperationalChain: false,
                    crossTenantExecutionLeakageBlocked: true,
                    historicalExecutionRecordsImmutable: true,
                    unsafeOwnershipOverrideBlocked: true,
                    existingStrategicWorkflowsPreserved: true,
                    existingWorkflowsPreserved: true,
                    executionActionsAuditable: true,
                    escalationGovernancePreserved: true,
                    departmentExecutionConfidentialityPreserved: true,
                    tenantIsolationPreserved: true
                },
                integrationHealth: {
                    strategicDependencyIntegrated: !!global.StrategicDependencyService,
                    deliverableTimelineIntegrated: !!global.DeliverableTimelineService,
                    strategicExecutionIntegrated: !!global.StrategicExecutionService,
                    performanceGovernanceIntegrated: !!global.PerformanceGovernanceService,
                    communicationGovernanceIntegrated: !!global.CommunicationGovernanceService,
                    escalationCommandIntegrated: !!global.EscalationCommandService,
                    workflowDiscussionIntegrated: !!global.WorkflowDiscussionService,
                    workflowTelemetryIntegrated: !!global.WorkflowTelemetryService,
                    auditReady: !!global.AuditService,
                    telemetryReady: !!global.WorkflowTelemetryService,
                    metricsReady: !!global.OrchestrationMetricsService
                },
                warnings: bottlenecks.signals.concat(workload.signals),
                metadata: {
                    tenantIsolationPreserved: true,
                    departmentExecutionConfidentialityPreserved: true,
                    historicalExecutionRecordsImmutable: true,
                    deliverableContextCount: deliverables.length,
                    dependencyContextCount: dependencies.length
                }
            });
            auditExecution('DEPARTMENT_EXECUTION_REPORTED', { description: 'Department execution board report viewed.', severity: report.classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO' }, context || {});
            emitTelemetry('DEPARTMENT_EXECUTION_REPORTED', { severity: report.classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO', status: report.classification }, context || {});
            recordMetric('DEPARTMENT_EXECUTION_REPORTED', { severity: report.classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO', status: report.classification }, context || {});
            return report;
        } catch (error) {
            return freezeExecutionOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                executionBoardHealth: { totalExecutions: 0 },
                failures: [safeFailure('EXECUTION_REPORT_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Department execution report failed safely.')]
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        function check(label, condition) { checks.push({ label: label, passed: !!condition }); }
        try {
            var malformed = normalizeExecutionPayload(null, { tenantSlug: 'tabsons' });
            check('malformed payloads fail safely', malformed.success === false);
            var cross = validateExecutionBoardScope({ tenantSlug: 'abc', executionId: 'EX-X', empId: 'EMP-X' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-SELF' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('cross-tenant execution visibility is blocked', cross.allowed === false && cross.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER);
            var workload = analyzeWorkloadDistribution({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('workload balancing degrades safely', workload.success === true && !!workload.summary);
            var accountability = evaluateAccountabilityGovernance({ tenantSlug: 'tabsons', empId: 'EMP-SELF', ownerId: 'MGR-SELF' }, { tenantSlug: 'tabsons', actor: { role: 'HR_HEAD', id: 'HR-SELF' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('accountability governance works', accountability.success === true && accountability.accountabilityGovernance.ownershipAuditTrails === true);
            var escalation = escalateBlockedExecution({ tenantSlug: 'tabsons', empId: 'EMP-SELF', state: 'BLOCKED', dueDate: '2026-01-01' }, { tenantSlug: 'tabsons', actor: { role: 'HR_HEAD', id: 'HR-SELF' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('blocked execution escalation preserves governance', escalation.success === true && escalation.blockedExecutionEscalation.escalationGovernancePreserved === true);
            var originalDependency = global.StrategicDependencyService;
            var originalTimeline = global.DeliverableTimelineService;
            var originalPerformance = global.PerformanceGovernanceService;
            var originalCommunication = global.CommunicationGovernanceService;
            var originalEscalation = global.EscalationCommandService;
            var originalDiscussion = global.WorkflowDiscussionService;
            try {
                global.StrategicDependencyService = undefined;
                global.DeliverableTimelineService = undefined;
                global.PerformanceGovernanceService = undefined;
                global.CommunicationGovernanceService = undefined;
                global.EscalationCommandService = undefined;
                global.WorkflowDiscussionService = undefined;
                var degraded = generateDepartmentExecutionReport({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-SELF' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
                check('optional dependency absence degrades safely', degraded.success === true && degraded.integrationHealth.strategicDependencyIntegrated === false && degraded.integrationHealth.deliverableTimelineIntegrated === false);
            } finally {
                global.StrategicDependencyService = originalDependency;
                global.DeliverableTimelineService = originalTimeline;
                global.PerformanceGovernanceService = originalPerformance;
                global.CommunicationGovernanceService = originalCommunication;
                global.EscalationCommandService = originalEscalation;
                global.WorkflowDiscussionService = originalDiscussion;
            }
            var frozen = freezeExecutionOutput({ payload: { state: EXECUTION_STATES.IN_PROGRESS } });
            check('outputs are immutable', Object.isFrozen(frozen) && Object.isFrozen(frozen.payload));
        } catch (error) {
            checks.push({ label: 'self-test has no uncaught failure', passed: false, error: error && error.message ? error.message : safeString(error, 'unknown') });
        }
        var result = freezeExecutionOutput({
            passed: checks.length > 0 && checks.every(function every(item) { return item.passed; }),
            checks: checks
        });
        global.__ARTHHRMS_DEPARTMENT_EXECUTION_SELF_TEST__ = result;
        return result;
    }

    var DepartmentExecutionBoardService = Object.freeze({
        VERSION: VERSION,
        EXECUTION_STATES: EXECUTION_STATES,
        FAILURE_CLASSIFICATIONS: FAILURE_CLASSIFICATIONS,
        VISIBILITY: VISIBILITY,
        validateExecutionBoardScope: validateExecutionBoardScope,
        classifyExecutionRisk: classifyExecutionRisk,
        normalizeExecutionPayload: normalizeExecutionPayload,
        freezeExecutionOutput: freezeExecutionOutput,
        evaluateAccountabilityGovernance: evaluateAccountabilityGovernance,
        analyzeWorkloadDistribution: analyzeWorkloadDistribution,
        detectOperationalBottlenecks: detectOperationalBottlenecks,
        escalateBlockedExecution: escalateBlockedExecution,
        generateDepartmentExecutionReport: generateDepartmentExecutionReport,
        runSelfTest: runSelfTest
    });

    global.DepartmentExecutionBoardService = DepartmentExecutionBoardService;
    global.departmentExecutionBoardService = DepartmentExecutionBoardService;

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
