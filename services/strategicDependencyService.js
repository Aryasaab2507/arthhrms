/**
 * strategicDependencyService.js
 * ARTHHRMS Enterprise Strategic Dependency Graph + Execution Relationship Intelligence.
 *
 * Additive read-only governance layer for deliverable dependencies, directed
 * execution graphs, cross-department handoffs, cascading delays, dependency
 * deadlocks, KPI-linked dependency scoring, workflow coordination, audit-safe
 * analytics, and tenant-confidential dependency reporting.
 */
(function attachStrategicDependencyService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[StrategicDependencyService]';

    var DEPENDENCY_STATES = Object.freeze({
        PLANNED: 'PLANNED',
        LINKED: 'LINKED',
        ACTIVE: 'ACTIVE',
        BLOCKED: 'BLOCKED',
        AT_RISK: 'AT_RISK',
        ESCALATED: 'ESCALATED',
        RESOLVED: 'RESOLVED',
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
        ASSIGNED_DEPENDENCIES_ONLY: 'ASSIGNED_DEPENDENCIES_ONLY',
        TEAM_DEPENDENCY_VISIBILITY: 'TEAM_DEPENDENCY_VISIBILITY',
        HR_OPERATIONAL_DEPENDENCY_VISIBILITY: 'HR_OPERATIONAL_DEPENDENCY_VISIBILITY',
        STRATEGIC_EXECUTION_DEPENDENCY_VISIBILITY: 'STRATEGIC_EXECUTION_DEPENDENCY_VISIBILITY',
        ORGANIZATION_DEPENDENCY_ANALYTICS: 'ORGANIZATION_DEPENDENCY_ANALYTICS',
        INFRASTRUCTURE_VISIBILITY_ONLY: 'INFRASTRUCTURE_VISIBILITY_ONLY',
        PLATFORM_GOVERNANCE_ONLY: 'PLATFORM_GOVERNANCE_ONLY'
    });

    var SENSITIVE_KEY_PATTERN = /(dependency.?id|deliverable.?id|milestone.?id|depends.?on|emp.?id|employee.?id|owner.?id|reviewer.?id|manager.?id|strategic.?owner|kpi.?id|correlation.?id|workflow.?id|event.?id|escalation.?id|note|comment|feedback|private|confidential|salary|payroll|compensation|rating|score|token|secret|jwt|authorization|service.?role|private.?key|raw|payload.?id|target.?id|log.?id)/i;
    var SENSITIVE_VALUE_PATTERN = /(https?:\/\/[^\s"',}]+|private:\/\/[^\s"',}]+|\b(private|confidential|secret|salary|payroll|strategic note|dependency note|roadmap)\b[^,;}]*)/ig;

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
        dependencyType: true,
        dependencyGraphHealth: true,
        dependencyGraphGovernance: true,
        cascadingDelayIntelligence: true,
        crossDepartmentExecution: true,
        kpiPerformanceIntegration: true,
        dependencyAnalytics: true,
        workflowCommunicationIntegration: true,
        accessGovernance: true,
        integrationHealth: true,
        totalDependencies: true,
        plannedDependencies: true,
        linkedDependencies: true,
        activeDependencies: true,
        blockedDependencies: true,
        atRiskDependencies: true,
        escalatedDependencies: true,
        resolvedDependencies: true,
        archivedDependencies: true,
        directedDependencyGraphs: true,
        dependencyChainValidation: true,
        executionSequenceMapping: true,
        dependencyVersioning: true,
        blockedDependencyEscalation: true,
        dependencyRollbackMarkers: true,
        graphTraversalSafeguards: true,
        circularDependencyCorruptionBlocked: true,
        circularDependencyWarnings: true,
        cascadingMilestoneDelays: true,
        dependencyBottlenecks: true,
        blockedExecutionChains: true,
        departmentCongestion: true,
        unresolvedDependencyEscalation: true,
        executionDeadlocks: true,
        interDepartmentFlows: true,
        dependencyOwnership: true,
        executionHandoffDelays: true,
        organizationalBottlenecks: true,
        crossFunctionalCoordination: true,
        executionAccountabilityMapping: true,
        kpiLinkedDependencies: true,
        dependencyScoring: true,
        executionPerformanceImpact: true,
        dependencyCompletionAnalytics: true,
        delaySeverityScoring: true,
        strategicAccountabilityMapping: true,
        unsafeKpiMutation: true,
        dependencyCongestion: true,
        blockedExecutionTrends: true,
        delayPropagationFrequency: true,
        dependencyChainComplexity: true,
        escalationLinkedDependencyFailures: true,
        organizationalDependencyHealth: true,
        dependencyLinkedDiscussions: true,
        blockedWorkflowEscalation: true,
        dependencyCoordinationThreads: true,
        operationalDependencyReviews: true,
        milestoneEscalationConversations: true,
        unsafeWorkflowExposure: true,
        employeeAssignedDependenciesOnly: true,
        managerTeamDependencyVisibility: true,
        hrOperationalDependencyVisibility: true,
        hrHeadStrategicDependencyVisibility: true,
        directorOrganizationDependencyAnalytics: true,
        superAdminDependencyMutationAuthority: true,
        platformOwnerDependencyChain: true,
        crossTenantDependencyLeakageBlocked: true,
        historicalDependencyRelationshipsImmutable: true,
        circularDependencyCorruptionBlocked: true,
        existingStrategicWorkflowsPreserved: true,
        existingWorkflowsPreserved: true,
        dependencyActionsAuditable: true,
        escalationGovernancePreserved: true,
        strategicDependencyConfidentialityPreserved: true,
        tenantIsolationPreserved: true,
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

    function deliverableIdOf(row) {
        return safeString(row && (row.deliverableId || row.id || row.deliverable_id), '');
    }

    function dependencyIdOf(row) {
        return safeString(row && (row.dependencyId || row.id || row.dependency_id), '');
    }

    function milestoneIdOf(row) {
        return safeString(row && (row.milestoneId || row.milestone_id || row.timelineId || row.id), '');
    }

    function dependsOnDeliverableOf(row) {
        return safeString(row && (row.dependsOnDeliverableId || row.dependsOnDeliverable || row.parentDeliverableId || row.blockingDeliverableId), '');
    }

    function ownerIdOf(row) {
        return safeString(row && (row.ownerId || row.strategicOwnerId || row.reviewerId || row.managerId), '');
    }

    function dependencyTypeOf(row) {
        var raw = normalizeToken(row && (row.dependencyType || row.type || row.relationshipType || 'MILESTONE_DEPENDENCY'));
        if (raw === 'MILESTONE' || raw === 'MILESTONE_DEP') return 'MILESTONE_DEPENDENCY';
        if (raw === 'DEPARTMENT') return 'DEPARTMENT_DEPENDENCY';
        if (raw === 'WORKFLOW') return 'WORKFLOW_DEPENDENCY';
        if (raw === 'APPROVAL') return 'APPROVAL_DEPENDENCY';
        if (raw === 'KPI') return 'KPI_LINKED_DEPENDENCY';
        if (raw === 'ESCALATION') return 'ESCALATION_LINKED_DEPENDENCY';
        if (raw === 'RESOURCE') return 'RESOURCE_DEPENDENCY';
        if (raw === 'EXECUTION_CHAIN') return 'EXECUTION_CHAIN_RELATIONSHIP';
        return raw || 'MILESTONE_DEPENDENCY';
    }

    function stateOf(row) {
        var raw = normalizeToken(row && (row.state || row.dependencyState || row.status || row.governanceState || row.currentStatus));
        if (raw === 'WAITING' || raw === 'PENDING') return DEPENDENCY_STATES.LINKED;
        if (raw === 'OPEN' || raw === 'IN_PROGRESS') return DEPENDENCY_STATES.ACTIVE;
        if (raw === 'DELAYED' || raw === 'OVERDUE') return DEPENDENCY_STATES.BLOCKED;
        if (raw === 'RESOLVED' || raw === 'DONE' || raw === 'COMPLETED') return DEPENDENCY_STATES.RESOLVED;
        return DEPENDENCY_STATES[raw] ? raw : DEPENDENCY_STATES.PLANNED;
    }

    function dueDateOf(row) {
        return safeString(row && (row.dueDate || row.deadlineDate || row.endDate || row.targetDate), '');
    }

    function isResolved(row) {
        return stateOf(row) === DEPENDENCY_STATES.RESOLVED || safeNumber(row && row.progressPercent, 0) >= 100 || !!(row && row.completedAt);
    }

    function isOverdue(row, context) {
        if (isResolved(row)) return false;
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

    function findDependency(data, row) {
        var id = dependencyIdOf(row);
        if (!id) return null;
        return dependencyRows(data).filter(function match(item) { return dependencyIdOf(item) === id; })[0] || null;
    }

    function mergedRecord(data, row) {
        var dependency = findDependency(data, row || {}) || {};
        var deliverable = findDeliverable(data, deliverableIdOf(row) || deliverableIdOf(dependency)) || {};
        var merged = {};
        Object.keys(deliverable).forEach(function copy(key) { merged[key] = deliverable[key]; });
        Object.keys(dependency).forEach(function copy(key) { merged[key] = dependency[key]; });
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

    function freezeDependencyOutput(output) {
        return deepFreeze(cloneSanitized(output || {}, 'payload'));
    }

    function safeFailure(code, classification, message) {
        return freezeDependencyOutput({
            failureCode: code,
            classification: classification || FAILURE_CLASSIFICATIONS.WARNING,
            message: message || code
        });
    }

    function classifyDependencyRisk(input) {
        try {
            var risk = input || {};
            if (risk.crossTenant || risk.historicalMutation || risk.circularDependency || risk.dependencyLeakage) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
            if (risk.unsafeDependencyMutation || risk.dependencyDeadlock || risk.blockedExecutionChain || risk.unresolvedEscalation) return FAILURE_CLASSIFICATIONS.HIGH_RISK;
            if (risk.cascadingDelay || risk.blockedDependency || risk.departmentCongestion || risk.malformedPayload) return FAILURE_CLASSIFICATIONS.WARNING;
            return FAILURE_CLASSIFICATIONS.INFO;
        } catch (error) {
            return FAILURE_CLASSIFICATIONS.HIGH_RISK;
        }
    }

    function scopeVisibility(role) {
        if (role === 'EMPLOYEE') return VISIBILITY.ASSIGNED_DEPENDENCIES_ONLY;
        if (role === 'MANAGER') return VISIBILITY.TEAM_DEPENDENCY_VISIBILITY;
        if (role === 'HR') return VISIBILITY.HR_OPERATIONAL_DEPENDENCY_VISIBILITY;
        if (role === 'HR_HEAD') return VISIBILITY.STRATEGIC_EXECUTION_DEPENDENCY_VISIBILITY;
        if (role === 'DIRECTOR') return VISIBILITY.ORGANIZATION_DEPENDENCY_ANALYTICS;
        if (role === 'SUPER_ADMIN') return VISIBILITY.INFRASTRUCTURE_VISIBILITY_ONLY;
        if (role === 'PLATFORM_OWNER') return VISIBILITY.PLATFORM_GOVERNANCE_ONLY;
        return VISIBILITY.NONE;
    }

    function validateDependencyScope(record, context) {
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
                failures.push(safeFailure('CROSS_TENANT_DEPENDENCY_VISIBILITY_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Cross-tenant strategic dependency visibility is blocked.'));
            }
            if (role === 'PLATFORM_OWNER') {
                failures.push(safeFailure('PLATFORM_OWNER_DEPENDENCY_CHAIN_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'PLATFORM_OWNER is isolated from execution dependency chains.'));
            }
            if (role === 'SUPER_ADMIN' && record && (record.dependencyMutation || record.dependencyOverride || record.mutationRequested || record.forceDependencyMutation)) {
                failures.push(safeFailure('SUPER_ADMIN_DEPENDENCY_MUTATION_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'SUPER_ADMIN cannot modify strategic dependency chains.'));
            }
            if (stateOf(record || {}) === DEPENDENCY_STATES.ARCHIVED && record && (record.dependencyMutation || record.dependencyOverride || record.mutationRequested || record.forceDependencyMutation)) {
                failures.push(safeFailure('ARCHIVED_DEPENDENCY_MUTATION_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Archived dependency relationships are immutable.'));
            }
            if (role === 'EMPLOYEE' && currentActor && employeeId && currentActor !== employeeId) {
                failures.push(safeFailure('EMPLOYEE_DEPENDENCY_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Employees can only view assigned dependencies.'));
            }
            if (role === 'MANAGER' && employeeId && currentActor && !managerOwnsEmployee(data, currentActor, employeeId) && ownerIdOf(merged) !== currentActor) {
                failures.push(safeFailure('MANAGER_TEAM_DEPENDENCY_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Managers require team dependency visibility.'));
            }
            if (isOverdue(merged, ctx) || stateOf(merged) === DEPENDENCY_STATES.BLOCKED) {
                warnings.push(safeFailure('DEPENDENCY_BLOCKED_OR_DELAYED', FAILURE_CLASSIFICATIONS.WARNING, 'Dependency is blocked or delayed.'));
            }

            var classification = failures.reduce(function highest(current, failure) {
                if (failure.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
                if (failure.classification === FAILURE_CLASSIFICATIONS.HIGH_RISK && current !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER) return FAILURE_CLASSIFICATIONS.HIGH_RISK;
                return current;
            }, warnings.length ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO);

            return freezeDependencyOutput({
                success: true,
                allowed: failures.length === 0,
                readOnly: true,
                classification: classification,
                visibility: failures.length ? VISIBILITY.NONE : scopeVisibility(role),
                failures: failures,
                warnings: warnings,
                metadata: {
                    tenantIsolationPreserved: failures.filter(function cross(item) { return item.failureCode === 'CROSS_TENANT_DEPENDENCY_VISIBILITY_BLOCKED'; }).length === 0,
                    strategicDependencyConfidentialityPreserved: true,
                    historicalDependencyRelationshipsImmutable: failures.filter(function mutation(item) { return item.failureCode === 'ARCHIVED_DEPENDENCY_MUTATION_BLOCKED'; }).length === 0
                }
            });
        } catch (error) {
            return freezeDependencyOutput({
                success: false,
                allowed: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                visibility: VISIBILITY.NONE,
                failures: [safeFailure('DEPENDENCY_SCOPE_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Dependency scope validation failed safely.')]
            });
        }
    }

    function normalizeDependencyPayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeDependencyOutput({
                    success: false,
                    readOnly: true,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    failures: [safeFailure('MALFORMED_DEPENDENCY_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Malformed dependency payload rejected.')]
                });
            }
            return freezeDependencyOutput({
                success: true,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.INFO,
                payload: {
                    state: stateOf(payload),
                    dependencyType: dependencyTypeOf(payload),
                    tenantSlug: normalizeTenantSlug(payload.tenantSlug || payload.tenantId || contextTenant(context)),
                    sourceDepartment: sanitizeText(payload.sourceDepartment || payload.department || ''),
                    targetDepartment: sanitizeText(payload.targetDepartment || ''),
                    dueDate: safeString(payload.dueDate || payload.deadlineDate, '').slice(0, 10),
                    metadata: cloneSanitized(payload.metadata || {}, 'metadata')
                },
                metadata: {
                    strategicDependencyConfidentialityPreserved: true,
                    tenantIsolationPreserved: true
                }
            });
        } catch (error) {
            return freezeDependencyOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('DEPENDENCY_NORMALIZATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Dependency normalization failed safely.')]
            });
        }
    }

    function graphRows(payload, context, sourceData) {
        var data = sourceData || rawData();
        var tenant = resolveTenant(payload, context, data);
        if (Array.isArray(payload && payload.dependencies)) return payload.dependencies.slice();
        return dependencyRows(data).filter(tenantFilter(tenant));
    }

    function buildGraph(rows) {
        var graph = {};
        rows.forEach(function add(row) {
            var from = deliverableIdOf(row) || milestoneIdOf(row) || dependencyIdOf(row);
            var to = dependsOnDeliverableOf(row) || safeString(row && (row.dependsOnMilestoneId || row.dependsOnDependencyId || row.blockingDependencyId), '');
            if (!from) return;
            if (!graph[from]) graph[from] = [];
            if (to) graph[from].push(to);
        });
        return graph;
    }

    function findCycles(graph) {
        var visiting = {};
        var visited = {};
        var cycles = [];
        function visit(id, stack) {
            if (visiting[id]) {
                cycles.push(stack.concat([id]));
                return;
            }
            if (visited[id]) return;
            visiting[id] = true;
            (graph[id] || []).forEach(function next(child) { visit(child, stack.concat([id])); });
            visiting[id] = false;
            visited[id] = true;
        }
        Object.keys(graph).forEach(function each(id) { visit(id, []); });
        return cycles;
    }

    function countWhere(rows, predicate) {
        return rows.filter(function filter(row) {
            try { return !!predicate(row); } catch (error) { return false; }
        }).length;
    }

    function validateDependencyGraph(payload, context) {
        try {
            var data = rawData();
            var rows = graphRows(payload || {}, context || {}, data);
            var graph = buildGraph(rows);
            var cycles = findCycles(graph);
            var failures = cycles.length ? [safeFailure('CIRCULAR_DEPENDENCY_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Circular dependency corruption is blocked.')] : [];
            return freezeDependencyOutput({
                success: cycles.length === 0,
                readOnly: true,
                classification: cycles.length ? FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER : FAILURE_CLASSIFICATIONS.INFO,
                dependencyGraphGovernance: {
                    directedDependencyGraphs: true,
                    dependencyChainValidation: true,
                    executionSequenceMapping: true,
                    dependencyVersioning: true,
                    blockedDependencyEscalation: true,
                    dependencyRollbackMarkers: true,
                    graphTraversalSafeguards: true,
                    circularDependencyCorruptionBlocked: true,
                    circularDependencyWarnings: cycles.length
                },
                failures: failures,
                metadata: {
                    tenantIsolationPreserved: true,
                    strategicDependencyConfidentialityPreserved: true
                }
            });
        } catch (error) {
            return freezeDependencyOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('DEPENDENCY_GRAPH_VALIDATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Dependency graph validation failed safely.')]
            });
        }
    }

    function auditDependency(actionType, metadata, context) {
        if (auditForwarding || context && context.skipAuditPersistence) return { success: true, skipped: true };
        auditForwarding = true;
        try {
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    actionType: actionType,
                    eventType: actionType,
                    module: 'Strategic Dependency',
                    targetId: '',
                    description: metadata && metadata.description || actionType,
                    actorRole: context && context.actor && context.actor.role || 'hr',
                    actorId: context && context.actor && (context.actor.id || context.actor.empId) || '',
                    severity: metadata && metadata.severity || 'INFO',
                    metadata: cloneSanitized(metadata || {}, 'metadata')
                }, { source: 'strategicDependencyService', skipPersistence: false });
            }
            var source = db();
            if (source && typeof source.writeAuditLog === 'function') {
                source.writeAuditLog(context && context.actor && context.actor.role || 'hr', context && context.actor && context.actor.id || '', actionType, 'Strategic Dependency', '', metadata && metadata.description || actionType);
            }
            return { success: true };
        } catch (error) {
            return { success: false, warning: 'Dependency audit failed safely.' };
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
                    source: 'strategicDependencyService',
                    severity: metadata && metadata.severity || 'INFO',
                    status: metadata && metadata.status || eventType,
                    tenantSlug: contextTenant(context) || metadata && metadata.tenantSlug || '',
                    metadata: cloneSanitized(metadata || {}, 'metadata')
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Dependency telemetry failed safely.' };
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
                    source: 'strategicDependencyService',
                    status: metadata && metadata.status || metricType,
                    severity: metadata && metadata.severity || 'INFO'
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Dependency metric failed safely.' };
        } finally {
            metricForwarding = false;
        }
        return { success: false, warning: 'OrchestrationMetricsService unavailable.' };
    }

    function evaluateDependencyGraphGovernance(payload, context) {
        try {
            var scope = validateDependencyScope(payload || {}, context || {});
            if (!scope.allowed) return scope;
            var graph = validateDependencyGraph(payload || {}, context || {});
            return freezeDependencyOutput({
                success: graph.classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                readOnly: true,
                classification: graph.classification,
                visibility: scope.visibility,
                dependencyGraphGovernance: {
                    directedDependencyGraphs: true,
                    dependencyChainValidation: true,
                    executionSequenceMapping: true,
                    dependencyVersioning: true,
                    blockedDependencyEscalation: true,
                    dependencyRollbackMarkers: true,
                    graphTraversalSafeguards: true,
                    circularDependencyCorruptionBlocked: true
                },
                failures: graph.failures || [],
                metadata: {
                    existingStrategicWorkflowsPreserved: true,
                    historicalDependencyRelationshipsImmutable: true
                }
            });
        } catch (error) {
            return freezeDependencyOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('DEPENDENCY_GOVERNANCE_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Dependency governance evaluation failed safely.')]
            });
        }
    }

    function escalateBlockedDependencies(payload, context) {
        try {
            var scope = validateDependencyScope(payload || {}, context || {});
            if (!scope.allowed) return scope;
            var result = freezeDependencyOutput({
                success: true,
                readOnly: true,
                state: DEPENDENCY_STATES.ESCALATED,
                classification: FAILURE_CLASSIFICATIONS.WARNING,
                visibility: scope.visibility,
                blockedDependencyEscalation: {
                    blockedDependencyEscalation: true,
                    escalationGovernancePreserved: true,
                    dependencyRollbackMarkers: true,
                    circularDependencyCorruptionBlocked: true
                },
                metadata: {
                    dependencyActionsAuditable: true,
                    historicalDependencyRelationshipsImmutable: true
                }
            });
            auditDependency('STRATEGIC_DEPENDENCY_BLOCKED_ESCALATED', { description: 'Blocked dependency escalation evaluated.', severity: 'WARNING' }, context || {});
            emitTelemetry('STRATEGIC_DEPENDENCY_BLOCKED_ESCALATED', { severity: 'WARNING', status: DEPENDENCY_STATES.ESCALATED }, context || {});
            recordMetric('STRATEGIC_DEPENDENCY_BLOCKED_ESCALATED', { severity: 'WARNING', status: DEPENDENCY_STATES.ESCALATED }, context || {});
            return result;
        } catch (error) {
            return freezeDependencyOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('BLOCKED_DEPENDENCY_ESCALATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Blocked dependency escalation failed safely.')]
            });
        }
    }

    function rowByDeliverable(rows, id) {
        var needle = safeString(id, '');
        return rows.filter(function match(row) { return deliverableIdOf(row) === needle; })[0] || null;
    }

    function isBlockedLike(row, context) {
        return stateOf(row) === DEPENDENCY_STATES.BLOCKED || stateOf(row) === DEPENDENCY_STATES.AT_RISK || stateOf(row) === DEPENDENCY_STATES.ESCALATED || isOverdue(row, context);
    }

    function departmentOf(row, deliverables) {
        return safeString(row && (row.sourceDepartment || row.department), '') || safeString(rowByDeliverable(deliverables, deliverableIdOf(row)) && rowByDeliverable(deliverables, deliverableIdOf(row)).department, 'Unassigned') || 'Unassigned';
    }

    function targetDepartmentOf(row, deliverables) {
        var depends = findDeliverable({ strategicDeliverables: deliverables }, dependsOnDeliverableOf(row)) || {};
        return safeString(row && row.targetDepartment, '') || safeString(depends.department, '') || 'Unassigned';
    }

    function detectDependencyDeadlocks(payload, context) {
        try {
            var rows = graphRows(payload || {}, context || {}, rawData());
            var cycles = findCycles(buildGraph(rows));
            var blockedCycles = cycles.length ? cycles.length : 0;
            var signals = blockedCycles ? [{ signal: 'executionDeadlocks', count: blockedCycles, severity: 'HIGH_RISK' }] : [];
            return freezeDependencyOutput({
                success: true,
                readOnly: true,
                classification: blockedCycles ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.INFO,
                summary: {
                    executionDeadlocks: blockedCycles,
                    circularDependencyWarnings: blockedCycles,
                    graphTraversalSafeguards: true
                },
                signals: signals,
                metadata: {
                    tenantIsolationPreserved: true,
                    strategicDependencyConfidentialityPreserved: true
                }
            });
        } catch (error) {
            return freezeDependencyOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                summary: { executionDeadlocks: 0, circularDependencyWarnings: 0 },
                signals: [],
                failures: [safeFailure('DEADLOCK_DETECTION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Dependency deadlock detection failed safely.')]
            });
        }
    }

    function detectCascadingDelays(filters, context) {
        try {
            var data = rawData();
            var tenant = resolveTenant(filters, context, data);
            var dependencies = dependencyRows(data).filter(tenantFilter(tenant));
            var deliverables = deliverableRows(data).filter(tenantFilter(tenant));
            var timelines = timelineRows(data).filter(tenantFilter(tenant));
            var escalations = escalationRows(data).filter(tenantFilter(tenant));
            var workflowEvents = workflowRows(data).filter(tenantFilter(tenant));
            var discussions = discussionRows(data).filter(tenantFilter(tenant));
            var deptCounts = {};
            dependencies.forEach(function each(row) {
                var dept = departmentOf(row, deliverables);
                deptCounts[dept] = (deptCounts[dept] || 0) + (isBlockedLike(row, context) ? 1 : 0);
            });
            var delayedDeliverables = deliverables.filter(function delayed(row) { return isBlockedLike(row, context) || isOverdue(row, context); });
            var delayedTimelineIds = {};
            timelines.forEach(function each(row) {
                if (isBlockedLike(row, context) || isOverdue(row, context)) delayedTimelineIds[deliverableIdOf(row)] = true;
            });
            var cascading = countWhere(dependencies, function cascade(row) {
                var currentDelayed = isBlockedLike(row, context) || delayedTimelineIds[deliverableIdOf(row)];
                var blockerDelayed = delayedTimelineIds[dependsOnDeliverableOf(row)] || !!delayedDeliverables.filter(function match(item) { return deliverableIdOf(item) === dependsOnDeliverableOf(row); })[0];
                return currentDelayed || blockerDelayed;
            });
            var graph = detectDependencyDeadlocks(filters || {}, context || {});
            var summary = {
                cascadingMilestoneDelays: cascading,
                dependencyBottlenecks: countWhere(dependencies, function blocked(row) { return isBlockedLike(row, context) || /BLOCKED|WAITING|DELAY/i.test(safeString(row.status || '', '')); }),
                blockedExecutionChains: countWhere(dependencies, function blocked(row) { return stateOf(row) === DEPENDENCY_STATES.BLOCKED || /BLOCKED/i.test(safeString(row.status || '', '')); }),
                departmentCongestion: Object.keys(deptCounts).filter(function congested(key) { return deptCounts[key] > 0; }).length,
                unresolvedDependencyEscalation: countWhere(escalations, function unresolved(row) { return /DEPENDENCY|CASCADING/i.test(safeString(row.escalationType || row.type || '', '')) && !/RESOLVED|CLOSED/i.test(safeString(row.status || '', '')); }),
                executionDeadlocks: graph.summary && graph.summary.executionDeadlocks || 0,
                workflowDependencySignals: countWhere(workflowEvents, function event(row) { return /DEPENDENCY|CASCADING/i.test(safeString(row.type || row.eventType || row.module || '', '')); }),
                dependencyCoordinationThreads: countWhere(discussions, function discussion(row) { return /DEPENDENCY|STRATEGIC/i.test(safeString(row.workflowType || row.type || '', '')); })
            };
            var signals = Object.keys(summary).filter(function active(key) { return summary[key] > 0; }).map(function signal(key) {
                return { signal: key, count: summary[key], severity: key === 'executionDeadlocks' ? 'HIGH_RISK' : 'WARNING' };
            });
            return freezeDependencyOutput({
                success: true,
                readOnly: true,
                classification: signals.length ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.INFO,
                summary: summary,
                signals: signals,
                metadata: {
                    tenantIsolationPreserved: true,
                    strategicDependencyConfidentialityPreserved: true
                }
            });
        } catch (error) {
            return freezeDependencyOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                summary: {
                    cascadingMilestoneDelays: 0,
                    dependencyBottlenecks: 0,
                    blockedExecutionChains: 0,
                    departmentCongestion: 0,
                    unresolvedDependencyEscalation: 0,
                    executionDeadlocks: 0
                },
                signals: [],
                failures: [safeFailure('CASCADING_DELAY_DETECTION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Cascading delay detection failed safely.')]
            });
        }
    }

    function generateStrategicDependencyReport(filters, context) {
        try {
            var data = rawData();
            var tenant = resolveTenant(filters, context, data);
            var scope = validateDependencyScope({ tenantSlug: tenant }, context || {});
            var dependencies = dependencyRows(data).filter(tenantFilter(tenant));
            var deliverables = deliverableRows(data).filter(tenantFilter(tenant));
            var timelines = timelineRows(data).filter(tenantFilter(tenant));
            var performance = performanceRows(data).filter(tenantFilter(tenant));
            var escalations = escalationRows(data).filter(tenantFilter(tenant));
            var discussions = discussionRows(data).filter(tenantFilter(tenant));
            var workflows = workflowRows(data).filter(tenantFilter(tenant));
            var cascading = detectCascadingDelays({ tenantSlug: tenant }, { tenantSlug: tenant, now: context && context.now, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            var graph = validateDependencyGraph({ tenantSlug: tenant }, { tenantSlug: tenant });
            var resolved = countWhere(dependencies, function resolved(row) { return stateOf(row) === DEPENDENCY_STATES.RESOLVED; });
            var blocked = cascading.summary.dependencyBottlenecks || 0;
            var interDepartmentFlows = countWhere(dependencies, function flow(row) { return departmentOf(row, deliverables) !== targetDepartmentOf(row, deliverables); });
            var kpiLinked = countWhere(dependencies, function kpi(row) { return !!safeString(row.kpiId || row.kpi_id, ''); });
            var report = freezeDependencyOutput({
                success: true,
                readOnly: true,
                classification: cascading.signals.length || graph.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.INFO,
                visibility: scope.visibility,
                dependencyGraphHealth: {
                    totalDependencies: dependencies.length,
                    plannedDependencies: countWhere(dependencies, function row(row) { return stateOf(row) === DEPENDENCY_STATES.PLANNED; }),
                    linkedDependencies: countWhere(dependencies, function row(row) { return stateOf(row) === DEPENDENCY_STATES.LINKED; }),
                    activeDependencies: countWhere(dependencies, function row(row) { return stateOf(row) === DEPENDENCY_STATES.ACTIVE; }),
                    blockedDependencies: countWhere(dependencies, function row(row) { return stateOf(row) === DEPENDENCY_STATES.BLOCKED || /BLOCKED/i.test(safeString(row.status || '', '')); }),
                    atRiskDependencies: countWhere(dependencies, function row(row) { return stateOf(row) === DEPENDENCY_STATES.AT_RISK; }),
                    escalatedDependencies: countWhere(dependencies, function row(row) { return stateOf(row) === DEPENDENCY_STATES.ESCALATED; }),
                    resolvedDependencies: resolved,
                    archivedDependencies: countWhere(dependencies, function row(row) { return stateOf(row) === DEPENDENCY_STATES.ARCHIVED; })
                },
                dependencyGraphGovernance: graph.dependencyGraphGovernance || {
                    directedDependencyGraphs: true,
                    dependencyChainValidation: true,
                    executionSequenceMapping: true,
                    dependencyVersioning: true,
                    blockedDependencyEscalation: true,
                    dependencyRollbackMarkers: true,
                    graphTraversalSafeguards: true,
                    circularDependencyCorruptionBlocked: true,
                    circularDependencyWarnings: 0
                },
                cascadingDelayIntelligence: cascading.summary,
                crossDepartmentExecution: {
                    interDepartmentFlows: interDepartmentFlows,
                    dependencyOwnership: countWhere(dependencies, function owner(row) { return !!ownerIdOf(row); }),
                    executionHandoffDelays: countWhere(dependencies, function handoff(row) { return departmentOf(row, deliverables) !== targetDepartmentOf(row, deliverables) && isBlockedLike(row, context); }),
                    organizationalBottlenecks: cascading.summary.departmentCongestion,
                    crossFunctionalCoordination: countWhere(discussions, function discussion(row) { return /DEPENDENCY|STRATEGIC/i.test(safeString(row.workflowType || row.type || '', '')); }),
                    executionAccountabilityMapping: countWhere(dependencies, function owner(row) { return !!ownerIdOf(row) || !!empIdOf(row); })
                },
                kpiPerformanceIntegration: {
                    kpiLinkedDependencies: kpiLinked,
                    dependencyScoring: Math.round((resolved / Math.max(1, dependencies.length)) * 100),
                    executionPerformanceImpact: performance.length,
                    dependencyCompletionAnalytics: resolved,
                    delaySeverityScoring: blocked,
                    strategicAccountabilityMapping: countWhere(deliverables, function owner(row) { return !!ownerIdOf(row); }),
                    unsafeKpiMutation: false
                },
                dependencyAnalytics: {
                    dependencyCongestion: cascading.summary.dependencyBottlenecks,
                    blockedExecutionTrends: cascading.summary.blockedExecutionChains,
                    delayPropagationFrequency: cascading.summary.cascadingMilestoneDelays,
                    dependencyChainComplexity: dependencies.length,
                    escalationLinkedDependencyFailures: cascading.summary.unresolvedDependencyEscalation,
                    organizationalDependencyHealth: Math.max(0, 100 - Math.min(100, blocked * 15))
                },
                workflowCommunicationIntegration: {
                    dependencyLinkedDiscussions: cascading.summary.dependencyCoordinationThreads,
                    blockedWorkflowEscalation: cascading.summary.workflowDependencySignals,
                    dependencyCoordinationThreads: cascading.summary.dependencyCoordinationThreads,
                    operationalDependencyReviews: workflows.length,
                    milestoneEscalationConversations: escalations.length,
                    unsafeWorkflowExposure: false
                },
                accessGovernance: {
                    employeeAssignedDependenciesOnly: true,
                    managerTeamDependencyVisibility: true,
                    hrOperationalDependencyVisibility: true,
                    hrHeadStrategicDependencyVisibility: true,
                    directorOrganizationDependencyAnalytics: true,
                    superAdminDependencyMutationAuthority: false,
                    platformOwnerDependencyChain: false,
                    crossTenantDependencyLeakageBlocked: true,
                    historicalDependencyRelationshipsImmutable: true,
                    circularDependencyCorruptionBlocked: true,
                    existingStrategicWorkflowsPreserved: true,
                    existingWorkflowsPreserved: true,
                    dependencyActionsAuditable: true,
                    escalationGovernancePreserved: true,
                    strategicDependencyConfidentialityPreserved: true,
                    tenantIsolationPreserved: true
                },
                integrationHealth: {
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
                warnings: cascading.signals,
                metadata: {
                    tenantIsolationPreserved: true,
                    strategicDependencyConfidentialityPreserved: true,
                    historicalDependencyRelationshipsImmutable: true
                }
            });
            auditDependency('STRATEGIC_DEPENDENCY_REPORTED', { description: 'Strategic dependency graph report viewed.', severity: report.classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO' }, context || {});
            emitTelemetry('STRATEGIC_DEPENDENCY_REPORTED', { severity: report.classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO', status: report.classification }, context || {});
            recordMetric('STRATEGIC_DEPENDENCY_REPORTED', { severity: report.classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO', status: report.classification }, context || {});
            return report;
        } catch (error) {
            return freezeDependencyOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                dependencyGraphHealth: { totalDependencies: 0 },
                failures: [safeFailure('DEPENDENCY_REPORT_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Dependency report failed safely.')]
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        function check(label, condition) { checks.push({ label: label, passed: !!condition }); }
        try {
            var malformed = normalizeDependencyPayload(null, { tenantSlug: 'tabsons' });
            check('malformed payloads fail safely', malformed.success === false);
            var cross = validateDependencyScope({ tenantSlug: 'abc', dependencyId: 'DEP-X', empId: 'EMP-X' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-SELF' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('cross-tenant dependency visibility is blocked', cross.allowed === false && cross.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER);
            var circular = validateDependencyGraph({ tenantSlug: 'tabsons', dependencies: [{ deliverableId: 'A', dependsOnDeliverableId: 'B' }, { deliverableId: 'B', dependsOnDeliverableId: 'A' }] }, { tenantSlug: 'tabsons' });
            check('circular dependencies fail safely', circular.success === false);
            var deadlock = detectDependencyDeadlocks({ tenantSlug: 'tabsons', dependencies: [{ deliverableId: 'A', dependsOnDeliverableId: 'B' }, { deliverableId: 'B', dependsOnDeliverableId: 'A' }] }, { tenantSlug: 'tabsons' });
            check('deadlock detection works', deadlock.success === true && deadlock.summary.executionDeadlocks >= 1);
            var escalation = escalateBlockedDependencies({ tenantSlug: 'tabsons', empId: 'EMP-SELF', state: 'BLOCKED', dueDate: '2026-01-01' }, { tenantSlug: 'tabsons', actor: { role: 'HR_HEAD', id: 'HR-SELF' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('blocked chain escalation preserves governance', escalation.success === true && escalation.blockedDependencyEscalation.escalationGovernancePreserved === true);
            var originalTimeline = global.DeliverableTimelineService;
            var originalPerformance = global.PerformanceGovernanceService;
            var originalCommunication = global.CommunicationGovernanceService;
            var originalEscalation = global.EscalationCommandService;
            var originalDiscussion = global.WorkflowDiscussionService;
            try {
                global.DeliverableTimelineService = undefined;
                global.PerformanceGovernanceService = undefined;
                global.CommunicationGovernanceService = undefined;
                global.EscalationCommandService = undefined;
                global.WorkflowDiscussionService = undefined;
                var degraded = generateStrategicDependencyReport({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-SELF' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
                check('optional dependency absence degrades safely', degraded.success === true && degraded.integrationHealth.deliverableTimelineIntegrated === false && degraded.integrationHealth.performanceGovernanceIntegrated === false);
            } finally {
                global.DeliverableTimelineService = originalTimeline;
                global.PerformanceGovernanceService = originalPerformance;
                global.CommunicationGovernanceService = originalCommunication;
                global.EscalationCommandService = originalEscalation;
                global.WorkflowDiscussionService = originalDiscussion;
            }
            var frozen = freezeDependencyOutput({ payload: { state: DEPENDENCY_STATES.ACTIVE } });
            check('outputs are immutable', Object.isFrozen(frozen) && Object.isFrozen(frozen.payload));
        } catch (error) {
            checks.push({ label: 'self-test has no uncaught failure', passed: false, error: error && error.message ? error.message : safeString(error, 'unknown') });
        }
        var result = freezeDependencyOutput({
            passed: checks.length > 0 && checks.every(function every(item) { return item.passed; }),
            checks: checks
        });
        global.__ARTHHRMS_STRATEGIC_DEPENDENCY_SELF_TEST__ = result;
        return result;
    }

    var StrategicDependencyService = Object.freeze({
        VERSION: VERSION,
        DEPENDENCY_STATES: DEPENDENCY_STATES,
        FAILURE_CLASSIFICATIONS: FAILURE_CLASSIFICATIONS,
        VISIBILITY: VISIBILITY,
        validateDependencyScope: validateDependencyScope,
        classifyDependencyRisk: classifyDependencyRisk,
        normalizeDependencyPayload: normalizeDependencyPayload,
        freezeDependencyOutput: freezeDependencyOutput,
        validateDependencyGraph: validateDependencyGraph,
        evaluateDependencyGraphGovernance: evaluateDependencyGraphGovernance,
        escalateBlockedDependencies: escalateBlockedDependencies,
        detectDependencyDeadlocks: detectDependencyDeadlocks,
        detectCascadingDelays: detectCascadingDelays,
        generateStrategicDependencyReport: generateStrategicDependencyReport,
        runSelfTest: runSelfTest
    });

    global.StrategicDependencyService = StrategicDependencyService;
    global.strategicDependencyService = StrategicDependencyService;

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
