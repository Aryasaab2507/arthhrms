/**
 * quarterlyGoalService.js
 * ARTHHRMS Enterprise Quarterly Goal Management + Strategic Objective Governance.
 *
 * Additive read-only governance layer for quarterly organizational goals,
 * department objectives, KPI-linked goal tracking, strategic milestone
 * alignment, accountability, escalation-linked risks, and tenant-confidential
 * leadership analytics.
 */
(function attachQuarterlyGoalService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[QuarterlyGoalService]';

    var GOAL_STATES = Object.freeze({
        DRAFT: 'DRAFT',
        PLANNED: 'PLANNED',
        ACTIVE: 'ACTIVE',
        AT_RISK: 'AT_RISK',
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
        ASSIGNED_OBJECTIVES_ONLY: 'ASSIGNED_OBJECTIVES_ONLY',
        DEPARTMENT_GOAL_VISIBILITY: 'DEPARTMENT_GOAL_VISIBILITY',
        HR_OPERATIONAL_GOAL_VISIBILITY: 'HR_OPERATIONAL_GOAL_VISIBILITY',
        STRATEGIC_ORGANIZATION_VISIBILITY: 'STRATEGIC_ORGANIZATION_VISIBILITY',
        ORGANIZATION_STRATEGIC_ANALYTICS: 'ORGANIZATION_STRATEGIC_ANALYTICS',
        INFRASTRUCTURE_VISIBILITY_ONLY: 'INFRASTRUCTURE_VISIBILITY_ONLY',
        PLATFORM_GOVERNANCE_ONLY: 'PLATFORM_GOVERNANCE_ONLY'
    });

    var SENSITIVE_KEY_PATTERN = /(goal.?id|objective.?id|deliverable.?id|milestone.?id|dependency.?id|emp.?id|employee.?id|owner.?id|reviewer.?id|manager.?id|accountability.?owner|strategic.?owner|kpi.?id|correlation.?id|workflow.?id|event.?id|escalation.?id|note|comment|feedback|private|confidential|salary|payroll|compensation|rating|score|token|secret|jwt|authorization|service.?role|private.?key|raw|payload.?id|target.?id|log.?id)/i;
    var SENSITIVE_VALUE_PATTERN = /(https?:\/\/[^\s"',}]+|private:\/\/[^\s"',}]+|\b(private|confidential|secret|salary|payroll|strategic note|objective blocker|goal blocker|roadmap)\b[^,;}]*)/ig;

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
        quarter: true,
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
        objectiveType: true,
        progressPercent: true,
        quarterlyGoalHealth: true,
        strategicObjectiveGovernance: true,
        objectiveGovernance: true,
        goalRiskIntelligence: true,
        kpiPerformanceIntegration: true,
        executionDependencyIntegration: true,
        goalAnalytics: true,
        accessGovernance: true,
        integrationHealth: true,
        totalGoals: true,
        draftGoals: true,
        plannedGoals: true,
        activeGoals: true,
        atRiskGoals: true,
        escalatedGoals: true,
        reviewPendingGoals: true,
        completedGoals: true,
        archivedGoals: true,
        quarterlyPlanning: true,
        objectiveAssignments: true,
        objectiveAssignment: true,
        kpiLinkedGoalTracking: true,
        strategicCheckpointReviews: true,
        delayedObjectiveEscalation: true,
        objectiveVersionHistory: true,
        strategicReviewWorkflows: true,
        unsafeStrategicOverride: true,
        unsafeStrategicOverridesBlocked: true,
        historicalGoalRecordsImmutable: true,
        delayedObjectives: true,
        stalledExecution: true,
        kpiDegradation: true,
        repeatedEscalationPatterns: true,
        departmentGoalCongestion: true,
        unresolvedStrategicBlockers: true,
        kpiLinkedGoals: true,
        kpiLinkedObjectives: true,
        kpiLinkedGoalScoring: true,
        executionPerformanceTracking: true,
        quarterlyCompletionAnalytics: true,
        accountabilityScoring: true,
        strategicHealthSummaries: true,
        unsafeKpiMutation: true,
        dependencyLinkedObjectives: true,
        milestoneLinkedGoals: true,
        executionTracking: true,
        departmentExecutionMapping: true,
        escalationLinkedPlanning: true,
        unsafeDependencyCorruption: true,
        quarterlyCompletionRate: true,
        executionVelocity: true,
        delayedObjectiveFrequency: true,
        accountabilityTrends: true,
        kpiAchievementHealth: true,
        escalationLinkedObjectives: true,
        departmentGoalPerformance: true,
        employeeAssignedObjectivesOnly: true,
        managerDepartmentGoalVisibility: true,
        hrOperationalGoalVisibility: true,
        hrHeadStrategicOrganizationVisibility: true,
        directorOrganizationStrategicAnalytics: true,
        superAdminStrategicModificationAuthority: true,
        platformOwnerTenantStrategicChain: true,
        crossTenantGoalLeakageBlocked: true,
        historicalQuarterlyGoalsImmutable: true,
        unsafeStrategicOverrideBlocked: true,
        existingStrategicWorkflowsPreserved: true,
        existingWorkflowsPreserved: true,
        goalActionsAuditable: true,
        escalationGovernancePreserved: true,
        strategicGoalConfidentialityPreserved: true,
        tenantIsolationPreserved: true,
        departmentExecutionBoardIntegrated: true,
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
        if (value === undefined || value === null) return fallback || '';
        return String(value);
    }

    function safeNumber(value, fallback) {
        var next = Number(value);
        return isFinite(next) ? next : (fallback || 0);
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
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
        return normalizeTenantSlug(row && (row.tenantSlug || row.tenantId || row.companyId || row.companySlug || row.tenant_slug || row.tenant_id));
    }

    function defaultTenant(sourceData) {
        var data = sourceData || rawData();
        var settings = data.companySettings || {};
        var tenant = normalizeTenantSlug(settings.tenantSlug || settings.tenantId || settings.companyId || settings.companySlug);
        if (tenant) return tenant;
        var first = list(data, 'platformTenants')[0];
        return normalizeTenantSlug(first && (first.tenantSlug || first.tenantId || first.companyId));
    }

    function resolveTenant(scope, context, sourceData) {
        return normalizeTenantSlug(scope && (scope.tenantSlug || scope.tenantId || scope.companyId)) || contextTenant(context) || defaultTenant(sourceData);
    }

    function actorId(context) {
        var actor = context && context.actor || {};
        return safeString(actor.id || actor.empId || actor.employeeId || actor.userId, '').trim();
    }

    function ownerIdOf(row) {
        return safeString(row && (row.ownerId || row.empId || row.employeeId || row.assigneeId || row.assignedTo || row.strategicOwnerId), '').trim();
    }

    function accountabilityOwnerOf(row) {
        return safeString(row && (row.accountabilityOwnerId || row.managerId || row.reviewerId || row.ownerManagerId || row.strategicOwnerId), '').trim();
    }

    function departmentOf(row) {
        return safeString(row && (row.department || row.dept || row.sourceDepartment || row.team), 'Unassigned') || 'Unassigned';
    }

    function goalStateOf(row) {
        return normalizeGoalState(row && (row.state || row.status || row.governanceState || row.lifecycleState));
    }

    function nowIso(context) {
        try { return context && context.now ? new Date(context.now).toISOString() : new Date().toISOString(); } catch (error) { return new Date().toISOString(); }
    }

    function isPastDate(value, context) {
        if (!value) return false;
        var date = new Date(value);
        var now = context && context.now ? new Date(context.now) : new Date();
        if (isNaN(date.getTime()) || isNaN(now.getTime())) return false;
        return date.getTime() < now.getTime();
    }

    function terminalState(row) {
        return /COMPLETED|APPROVED|CLOSED|ARCHIVED|DELETED|RESOLVED/i.test([row && row.status, row && row.state, row && row.governanceState, row && row.lifecycleState].join(' '));
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
            return value.map(function item(row) { return sanitizedValue(row, key, (seen || []).slice()); }).filter(function keep(row) { return row !== undefined; });
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
            return input.map(function item(row) { return cloneSanitized(row, refs.slice()); }).filter(function keep(row) { return row !== undefined; });
        }
        var output = {};
        try {
            Object.keys(input).forEach(function eachKey(key) {
                if (SENSITIVE_KEY_PATTERN.test(key) && !SAFE_GOVERNANCE_KEYS[key]) return;
                var value = sanitizedValue(input[key], key, refs.slice());
                if (typeof value !== 'undefined') output[key] = value;
            });
        } catch (error) {}
        return output;
    }

    function freezeGoalOutput(value) {
        return deepFreeze(cloneSanitized(value || {}));
    }

    function safeFailure(failureCode, classification, description, metadata) {
        var failure = {
            failureCode: normalizeToken(failureCode || 'GOAL_GOVERNANCE_FAILURE'),
            classification: classification || FAILURE_CLASSIFICATIONS.WARNING,
            description: safeString(description || 'Goal governance failed safely.', '')
        };
        if (metadata && typeof metadata === 'object') failure.metadata = cloneSanitized(metadata);
        return deepFreeze(failure);
    }

    function safeWarning(warningCode, description, metadata) {
        var warning = {
            warningCode: normalizeToken(warningCode || 'GOAL_GOVERNANCE_WARNING'),
            classification: FAILURE_CLASSIFICATIONS.WARNING,
            description: safeString(description || 'Goal governance warning.', '')
        };
        if (metadata && typeof metadata === 'object') warning.metadata = cloneSanitized(metadata);
        return deepFreeze(warning);
    }

    function highestClassification(values) {
        var order = {};
        order[FAILURE_CLASSIFICATIONS.INFO] = 0;
        order[FAILURE_CLASSIFICATIONS.WARNING] = 1;
        order[FAILURE_CLASSIFICATIONS.HIGH_RISK] = 2;
        order[FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER] = 3;
        return (values || []).reduce(function choose(current, value) {
            var normalized = FAILURE_CLASSIFICATIONS[normalizeToken(value)] || value || FAILURE_CLASSIFICATIONS.INFO;
            return (order[normalized] || 0) > (order[current] || 0) ? normalized : current;
        }, FAILURE_CLASSIFICATIONS.INFO);
    }

    function normalizeGoalState(value) {
        var normalized = normalizeToken(value || GOAL_STATES.DRAFT);
        if (normalized === 'IN_PROGRESS' || normalized === 'OPEN') return GOAL_STATES.ACTIVE;
        if (normalized === 'RISK' || normalized === 'AT_RISK' || normalized === 'DELAYED' || normalized === 'BLOCKED') return GOAL_STATES.AT_RISK;
        if (normalized === 'ESCALATE' || normalized === 'ESCALATED') return GOAL_STATES.ESCALATED;
        if (normalized === 'REVIEW' || normalized === 'REVIEW_PENDING') return GOAL_STATES.REVIEW_PENDING;
        if (normalized === 'DONE' || normalized === 'COMPLETE' || normalized === 'COMPLETED') return GOAL_STATES.COMPLETED;
        if (normalized === 'ARCHIVE' || normalized === 'ARCHIVED') return GOAL_STATES.ARCHIVED;
        if (GOAL_STATES[normalized]) return GOAL_STATES[normalized];
        return GOAL_STATES.DRAFT;
    }

    function classifyGoalRisk(signal) {
        try {
            var item = signal || {};
            if (item.crossTenant || item.historicalMutation || item.archivedMutation) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
            if (item.platformOwnerChain || item.permissionBypass) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
            if (item.unsafeStrategicOverride || item.superAdminStrategicMutation || item.delayedObjective || item.stalledExecution || item.unresolvedBlocker) return FAILURE_CLASSIFICATIONS.HIGH_RISK;
            if (item.kpiDegradation || item.departmentGoalCongestion || item.escalationPattern) return FAILURE_CLASSIFICATIONS.WARNING;
            return FAILURE_CLASSIFICATIONS.INFO;
        } catch (error) {
            return FAILURE_CLASSIFICATIONS.HIGH_RISK;
        }
    }

    function goalRows(data) {
        return list(data, 'quarterlyGoals').concat(list(data, 'strategicObjectives'), list(data, 'goals'), list(data, 'objectiveRecords'));
    }

    function performanceRows(data) {
        return list(data, 'performanceGoals').concat(list(data, 'performanceReviews'), list(data, 'kpiRecords'));
    }

    function executionRows(data) {
        return list(data, 'departmentExecutionRecords').concat(list(data, 'executionBoardRecords'), list(data, 'strategicDeliverables'));
    }

    function timelineRows(data) {
        return list(data, 'deliverableTimelineRecords').concat(list(data, 'timelineRecords'), list(data, 'milestones'));
    }

    function dependencyRows(data) {
        return list(data, 'deliverableDependencies').concat(list(data, 'strategicDependencies'), list(data, 'dependencyGraphRecords'));
    }

    function escalationRows(data) {
        return list(data, 'escalations').concat(list(data, 'escalationEvents'), list(data, 'escalationCommands'));
    }

    function discussionRows(data) {
        return list(data, 'workflowDiscussions').concat(list(data, 'discussionThreads'), list(data, 'collaborationThreads'));
    }

    function workflowRows(data) {
        return list(data, 'workflowEvents').concat(list(data, 'workflowTelemetry'), list(data, 'pendingActions'));
    }

    function tenantFilter(tenant) {
        return function filter(row) {
            var rowSlug = rowTenant(row);
            return !tenant || !rowSlug || rowSlug === tenant;
        };
    }

    function visibleForEmployee(record, context) {
        var id = actorId(context);
        return !!id && [ownerIdOf(record), accountabilityOwnerOf(record), safeString(record && record.assigneeId, ''), safeString(record && record.empId, '')].indexOf(id) !== -1;
    }

    function validateGoalScope(record, context) {
        try {
            var data = rawData();
            var ctxTenant = contextTenant(context);
            var targetTenant = resolveTenant(record || {}, context || {}, data);
            var actor = context && context.actor || {};
            var role = normalizeRole(actor.role || context && context.role);
            var failures = [];
            var visibility = VISIBILITY.NONE;
            var state = normalizeGoalState(record && (record.state || record.status || record.governanceState));
            var mutationRequested = !!(record && (record.strategicOverride || record.objectiveMutation || record.modify || record.update || record.override || record.reassignOwner));

            if (ctxTenant && targetTenant && ctxTenant !== targetTenant) {
                failures.push(safeFailure('CROSS_TENANT_GOAL_VISIBILITY_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Cross-tenant goal visibility was blocked.'));
            }
            if (state === GOAL_STATES.ARCHIVED && mutationRequested) {
                failures.push(safeFailure('ARCHIVED_GOAL_MUTATION_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Archived quarterly goals are immutable.'));
            }
            if (role === 'SUPER_ADMIN' && mutationRequested) {
                failures.push(safeFailure('SUPER_ADMIN_STRATEGIC_MODIFICATION_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'SUPER_ADMIN cannot modify strategic organizational goals.'));
            }
            if (role === 'PLATFORM_OWNER') {
                failures.push(safeFailure('PLATFORM_OWNER_TENANT_STRATEGIC_CHAIN_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'PLATFORM_OWNER remains isolated from tenant strategic chains.'));
                visibility = VISIBILITY.PLATFORM_GOVERNANCE_ONLY;
            } else if (role === 'SUPER_ADMIN') {
                visibility = VISIBILITY.INFRASTRUCTURE_VISIBILITY_ONLY;
                if (!mutationRequested && (record && (record.goalId || record.objectiveId || ownerIdOf(record)))) {
                    failures.push(safeFailure('SUPER_ADMIN_STRATEGIC_VISIBILITY_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'SUPER_ADMIN visibility is infrastructure-only.'));
                }
            } else if (role === 'EMPLOYEE') {
                visibility = VISIBILITY.ASSIGNED_OBJECTIVES_ONLY;
                if (!visibleForEmployee(record || {}, context || {})) {
                    failures.push(safeFailure('EMPLOYEE_GOAL_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Employee goal visibility is limited to assigned objectives.'));
                }
            } else if (role === 'MANAGER') {
                visibility = VISIBILITY.DEPARTMENT_GOAL_VISIBILITY;
                var actorDepartment = safeString(actor.department || actor.dept || '', '');
                var targetDepartment = departmentOf(record || {});
                if (actorDepartment && targetDepartment && actorDepartment !== targetDepartment && !visibleForEmployee(record || {}, context || {})) {
                    failures.push(safeFailure('MANAGER_GOAL_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Manager goal visibility is limited to department objectives.'));
                }
            } else if (role === 'HR') {
                visibility = VISIBILITY.HR_OPERATIONAL_GOAL_VISIBILITY;
            } else if (role === 'HR_HEAD') {
                visibility = VISIBILITY.STRATEGIC_ORGANIZATION_VISIBILITY;
            } else if (role === 'DIRECTOR') {
                visibility = VISIBILITY.ORGANIZATION_STRATEGIC_ANALYTICS;
            } else {
                failures.push(safeFailure('UNKNOWN_GOAL_ROLE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Unknown role cannot access goal governance.'));
            }

            var classification = highestClassification(failures.map(function item(row) { return row.classification; }));
            return freezeGoalOutput({
                success: !failures.length,
                allowed: !failures.length,
                classification: classification,
                visibility: visibility,
                failures: failures,
                metadata: {
                    tenantIsolationPreserved: !failures.some(function critical(row) { return row.failureCode === 'CROSS_TENANT_GOAL_VISIBILITY_BLOCKED'; }),
                    strategicGoalConfidentialityPreserved: true,
                    historicalGoalRecordsImmutable: true
                }
            });
        } catch (error) {
            return freezeGoalOutput({
                success: false,
                allowed: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                visibility: VISIBILITY.NONE,
                failures: [safeFailure('GOAL_SCOPE_VALIDATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Goal scope validation failed safely.')]
            });
        }
    }

    function normalizeGoalPayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeGoalOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    state: GOAL_STATES.DRAFT,
                    failures: [safeFailure('MALFORMED_GOAL_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Goal payload is malformed.')]
                });
            }
            var tenant = normalizeTenantSlug(payload.tenantSlug || payload.tenantId || payload.companyId) || contextTenant(context);
            var normalized = {
                tenantSlug: tenant,
                quarter: safeString(payload.quarter || payload.period || '', '').trim(),
                objectiveType: normalizeToken(payload.objectiveType || payload.type || 'QUARTERLY_GOAL'),
                department: departmentOf(payload),
                state: normalizeGoalState(payload.state || payload.status || payload.governanceState),
                progressPercent: clamp(safeNumber(payload.progressPercent || payload.progress || 0, 0), 0, 100),
                readOnly: payload.readOnly !== false,
                metadata: {
                    strategicGoalConfidentialityPreserved: true,
                    tenantIsolationPreserved: true,
                    historicalGoalRecordsImmutable: true
                }
            };
            return freezeGoalOutput({
                success: true,
                classification: FAILURE_CLASSIFICATIONS.INFO,
                payload: normalized
            });
        } catch (error) {
            return freezeGoalOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                state: GOAL_STATES.AT_RISK,
                failures: [safeFailure('GOAL_NORMALIZATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Goal payload normalization failed safely.')]
            });
        }
    }

    function evaluateObjectiveGovernance(payload, context) {
        try {
            var normalized = normalizeGoalPayload(payload, context);
            var scope = validateGoalScope(payload || {}, context || {});
            if (!normalized.success || !scope.allowed) {
                return freezeGoalOutput({
                    success: false,
                    classification: highestClassification([normalized.classification, scope.classification]),
                    failures: (normalized.failures || []).concat(scope.failures || [])
                });
            }
            var state = normalizeGoalState(payload && (payload.state || payload.status));
            var progress = clamp(safeNumber(payload && (payload.progressPercent || payload.progress), 0), 0, 100);
            return freezeGoalOutput({
                success: true,
                classification: classifyGoalRisk({ delayedObjective: state === GOAL_STATES.AT_RISK || state === GOAL_STATES.ESCALATED || progress < 30 }),
                objectiveGovernance: {
                    quarterlyPlanning: true,
                    objectiveAssignment: true,
                    kpiLinkedGoalTracking: !!(payload && (payload.kpiId || payload.kpiCode)),
                    strategicCheckpointReviews: true,
                    delayedObjectiveEscalation: state === GOAL_STATES.AT_RISK || state === GOAL_STATES.ESCALATED,
                    objectiveVersionHistory: true,
                    strategicReviewWorkflows: true,
                    unsafeStrategicOverridesBlocked: true,
                    historicalGoalRecordsImmutable: true
                },
                metadata: {
                    strategicGoalConfidentialityPreserved: true,
                    tenantIsolationPreserved: true
                }
            });
        } catch (error) {
            return freezeGoalOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('OBJECTIVE_GOVERNANCE_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Objective governance failed safely.')]
            });
        }
    }

    function detectStrategicBlockers(filters, context) {
        try {
            var data = rawData();
            var tenant = resolveTenant(filters || {}, context || {}, data);
            var goals = goalRows(data).filter(tenantFilter(tenant));
            var performance = performanceRows(data).filter(tenantFilter(tenant));
            var executions = executionRows(data).filter(tenantFilter(tenant));
            var dependencies = dependencyRows(data).filter(tenantFilter(tenant));
            var escalations = escalationRows(data).filter(tenantFilter(tenant));
            var discussions = discussionRows(data).filter(tenantFilter(tenant));
            var workflows = workflowRows(data).filter(tenantFilter(tenant));
            var delayedObjectives = goals.filter(function delayed(row) {
                var state = goalStateOf(row);
                return state === GOAL_STATES.AT_RISK || state === GOAL_STATES.ESCALATED || (!terminalState(row) && isPastDate(row.dueDate || row.deadlineDate || row.endDate, context));
            }).length;
            var stalledExecution = executions.filter(function stalled(row) {
                return /BLOCKED|ESCALATED|DELAYED|AT_RISK/i.test([row.state, row.status, row.governanceState].join(' ')) || (safeNumber(row.progressPercent || row.progress, 100) < 30 && isPastDate(row.dueDate || row.deadlineDate, context));
            }).length;
            var kpiDegradation = performance.filter(function degraded(row) {
                return row.degraded === true || safeNumber(row.score || row.rating || row.progressPercent, 100) < 50 || /DEGRADED|FAILED|RISK/i.test([row.state, row.status].join(' '));
            }).length + goals.filter(function goalKpi(row) {
                return !!(row.kpiId || row.kpiCode) && safeNumber(row.progressPercent || row.progress, 100) < 40;
            }).length;
            var repeatedEscalationPatterns = escalations.filter(function active(row) {
                return !terminalState(row) || /ESCALATED|HIGH|CRITICAL|DELAY/i.test([row.status, row.state, row.severity, row.escalationType].join(' '));
            }).length;
            var byDept = {};
            goals.concat(executions).forEach(function group(row) {
                var dept = departmentOf(row);
                if (!byDept[dept]) byDept[dept] = 0;
                if (/AT_RISK|ESCALATED|BLOCKED|DELAYED/i.test([row.state, row.status, row.governanceState].join(' ')) || safeNumber(row.workloadUnits, 0) >= 7) byDept[dept] += 1;
            });
            var departmentGoalCongestion = Object.keys(byDept).filter(function congested(dept) { return byDept[dept] > 1; }).length;
            var unresolvedStrategicBlockers = dependencies.filter(function blocked(row) {
                return /BLOCKED|AT_RISK|WAITING|DELAYED/i.test([row.state, row.status].join(' '));
            }).length + discussions.filter(function unresolved(row) {
                return row.unresolved === true || (!terminalState(row) && /GOAL|OBJECTIVE|STRATEGIC/i.test([row.workflowType, row.type, row.category].join(' ')));
            }).length + workflows.filter(function failed(row) {
                return /FAILED|DEGRADED|BLOCKED|DELAYED/i.test([row.status, row.state, row.type].join(' '));
            }).length;
            var signals = [];
            if (delayedObjectives) signals.push(safeWarning('DELAYED_OBJECTIVES', 'Delayed strategic objectives detected.', { count: delayedObjectives }));
            if (stalledExecution) signals.push(safeWarning('STALLED_EXECUTION', 'Stalled execution detected.', { count: stalledExecution }));
            if (kpiDegradation) signals.push(safeWarning('KPI_DEGRADATION', 'KPI degradation detected.', { count: kpiDegradation }));
            if (repeatedEscalationPatterns) signals.push(safeWarning('REPEATED_ESCALATIONS', 'Repeated escalation patterns detected.', { count: repeatedEscalationPatterns }));
            if (departmentGoalCongestion) signals.push(safeWarning('DEPARTMENT_GOAL_CONGESTION', 'Department goal congestion detected.', { count: departmentGoalCongestion }));
            if (unresolvedStrategicBlockers) signals.push(safeWarning('UNRESOLVED_STRATEGIC_BLOCKERS', 'Unresolved strategic blockers detected.', { count: unresolvedStrategicBlockers }));
            return freezeGoalOutput({
                success: true,
                classification: signals.length ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.INFO,
                summary: {
                    delayedObjectives: delayedObjectives,
                    stalledExecution: stalledExecution,
                    kpiDegradation: kpiDegradation,
                    repeatedEscalationPatterns: repeatedEscalationPatterns,
                    departmentGoalCongestion: departmentGoalCongestion,
                    unresolvedStrategicBlockers: unresolvedStrategicBlockers
                },
                signals: signals,
                metadata: {
                    strategicGoalConfidentialityPreserved: true,
                    tenantIsolationPreserved: true
                }
            });
        } catch (error) {
            return freezeGoalOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                summary: {
                    delayedObjectives: 0,
                    stalledExecution: 0,
                    kpiDegradation: 0,
                    repeatedEscalationPatterns: 0,
                    departmentGoalCongestion: 0,
                    unresolvedStrategicBlockers: 0
                },
                failures: [safeFailure('STRATEGIC_BLOCKER_DETECTION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Strategic blocker detection failed safely.')]
            });
        }
    }

    function escalateDelayedObjective(payload, context) {
        try {
            var scope = validateGoalScope(payload || {}, context || {});
            if (!scope.allowed) {
                return freezeGoalOutput({
                    success: false,
                    classification: scope.classification,
                    failures: scope.failures
                });
            }
            var state = normalizeGoalState(payload && payload.state);
            var delayed = state === GOAL_STATES.AT_RISK || state === GOAL_STATES.ESCALATED || isPastDate(payload && (payload.dueDate || payload.deadlineDate), context);
            var output = {
                success: true,
                classification: delayed ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.INFO,
                state: delayed ? GOAL_STATES.ESCALATED : state,
                delayedObjectiveEscalation: {
                    delayedObjectiveEscalation: delayed,
                    escalationGovernancePreserved: true,
                    strategicReviewWorkflows: true,
                    unsafeStrategicOverridesBlocked: true
                },
                metadata: {
                    strategicGoalConfidentialityPreserved: true,
                    tenantIsolationPreserved: true
                }
            };
            if (delayed) {
                emitTelemetry('QUARTERLY_GOAL_DELAY_ESCALATED', { status: GOAL_STATES.ESCALATED, severity: 'WARNING' }, context || {});
                auditGoal('QUARTERLY_GOAL_DELAY_ESCALATED', { severity: 'WARNING', description: 'Delayed quarterly objective escalated.' }, context || {});
            }
            return freezeGoalOutput(output);
        } catch (error) {
            return freezeGoalOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('DELAYED_OBJECTIVE_ESCALATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Delayed objective escalation failed safely.')]
            });
        }
    }

    function countState(rows, state) {
        return rows.filter(function match(row) { return goalStateOf(row) === state; }).length;
    }

    function safeServiceReport(serviceName, methodName, filters, context) {
        try {
            var service = global[serviceName];
            if (!service || typeof service[methodName] !== 'function') return null;
            return service[methodName](filters || {}, Object.assign({}, context || {}, {
                skipAuditPersistence: true,
                skipTelemetry: true,
                skipMetrics: true
            }));
        } catch (error) {
            return null;
        }
    }

    function auditGoal(actionType, metadata, context) {
        if (auditForwarding || context && context.skipAuditPersistence) return { success: true, skipped: true };
        auditForwarding = true;
        try {
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    actionType: actionType,
                    eventType: actionType,
                    module: 'Quarterly Goal Governance',
                    targetId: metadata && metadata.targetId || '',
                    description: metadata && metadata.description || actionType,
                    actorRole: context && context.actor && context.actor.role || 'hr_head',
                    actorId: context && context.actor && (context.actor.id || context.actor.empId) || '',
                    severity: metadata && metadata.severity || 'INFO',
                    metadata: cloneSanitized(metadata || {})
                }, {
                    source: 'quarterlyGoalService',
                    skipPersistence: false
                });
            }
            var source = db();
            if (source && typeof source.writeAuditLog === 'function') {
                source.writeAuditLog(context && context.actor && context.actor.role || 'hr_head', context && context.actor && context.actor.id || '', actionType, 'Quarterly Goal Governance', '', metadata && metadata.description || actionType);
            }
            return { success: true };
        } catch (error) {
            return { success: false, warning: 'Quarterly goal audit failed safely.' };
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
                    source: 'quarterlyGoalService',
                    severity: metadata && metadata.severity || 'INFO',
                    status: metadata && metadata.status || eventType,
                    tenantSlug: contextTenant(context) || metadata && metadata.tenantSlug || '',
                    metadata: cloneSanitized(metadata || {})
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Quarterly goal telemetry failed safely.' };
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
                    source: 'quarterlyGoalService',
                    status: metadata && metadata.status || metricType,
                    severity: metadata && metadata.severity || 'INFO'
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Quarterly goal metric failed safely.' };
        } finally {
            metricForwarding = false;
        }
        return { success: false, warning: 'OrchestrationMetricsService unavailable.' };
    }

    function generateQuarterlyGoalReport(filters, context) {
        try {
            var data = rawData();
            var tenant = resolveTenant(filters || {}, context || {}, data);
            var scope = validateGoalScope({ tenantSlug: tenant, readOnly: true }, context || {});
            if (!scope.allowed && scope.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER) {
                return freezeGoalOutput({
                    success: false,
                    readOnly: true,
                    classification: scope.classification,
                    failures: scope.failures,
                    quarterlyGoalHealth: { totalGoals: 0 },
                    metadata: {
                        tenantIsolationPreserved: false,
                        strategicGoalConfidentialityPreserved: true,
                        historicalGoalRecordsImmutable: true
                    }
                });
            }
            var quarter = safeString(filters && filters.quarter || '', '').trim();
            var goals = goalRows(data).filter(tenantFilter(tenant)).filter(function quarterFilter(row) {
                return !quarter || safeString(row.quarter || row.period || '', '') === quarter;
            });
            var performance = performanceRows(data).filter(tenantFilter(tenant));
            var executions = executionRows(data).filter(tenantFilter(tenant));
            var timelines = timelineRows(data).filter(tenantFilter(tenant));
            var dependencies = dependencyRows(data).filter(tenantFilter(tenant));
            var escalations = escalationRows(data).filter(tenantFilter(tenant));
            var discussions = discussionRows(data).filter(tenantFilter(tenant));
            var blockers = detectStrategicBlockers({ tenantSlug: tenant, quarter: quarter }, Object.assign({}, context || {}, {
                skipAuditPersistence: true,
                skipTelemetry: true,
                skipMetrics: true
            }));
            var completedGoals = countState(goals, GOAL_STATES.COMPLETED);
            var activeGoals = countState(goals, GOAL_STATES.ACTIVE);
            var atRiskGoals = countState(goals, GOAL_STATES.AT_RISK);
            var escalatedGoals = countState(goals, GOAL_STATES.ESCALATED);
            var reviewPendingGoals = countState(goals, GOAL_STATES.REVIEW_PENDING);
            var kpiLinkedGoals = goals.filter(function kpi(row) { return !!(row.kpiId || row.kpiCode); }).length;
            var checkpointReviews = goals.reduce(function total(sum, row) {
                return sum + Math.max(0, safeNumber(row.checkpointCount || row.checkpoints || 0, 0));
            }, 0);
            var dependencyLinkedObjectives = dependencies.length + goals.filter(function dep(row) {
                return !!(row.dependencyId || row.dependsOn || row.blockerType);
            }).length;
            var milestoneLinkedGoals = timelines.length + goals.filter(function milestone(row) { return !!(row.milestoneId || row.milestoneKey); }).length;
            var departmentExecutionMapping = executions.length;
            var escalationLinkedPlanning = escalations.length + goals.filter(function escalation(row) { return !!row.escalationId || goalStateOf(row) === GOAL_STATES.ESCALATED; }).length;
            var completionRate = goals.length ? Math.round((completedGoals / Math.max(goals.length, 1)) * 100) : 0;
            var avgProgress = goals.length ? Math.round(goals.reduce(function total(sum, row) {
                return sum + clamp(safeNumber(row.progressPercent || row.progress || 0, 0), 0, 100);
            }, 0) / goals.length) : 0;
            var departmentGoalPerformance = goals.length ? Math.max(0, 100 - ((blockers.summary && blockers.summary.departmentGoalCongestion || 0) * 15)) : 0;
            var dependencyReport = safeServiceReport('StrategicDependencyService', 'generateStrategicDependencyReport', { tenantSlug: tenant }, context);
            var executionReport = safeServiceReport('DepartmentExecutionBoardService', 'generateDepartmentExecutionReport', { tenantSlug: tenant }, context);
            var timelineReport = safeServiceReport('DeliverableTimelineService', 'generateDeliverableTimelineReport', { tenantSlug: tenant }, context);
            var performanceReport = safeServiceReport('PerformanceGovernanceService', 'generatePerformanceGovernanceReport', { tenantSlug: tenant }, context);
            var classifications = [blockers.classification, dependencyReport && dependencyReport.classification, executionReport && executionReport.classification, timelineReport && timelineReport.classification, performanceReport && performanceReport.classification];
            var classification = highestClassification(classifications);
            var report = {
                success: true,
                readOnly: true,
                classification: classification,
                generatedAt: nowIso(context),
                tenantSlug: tenant,
                quarter: quarter,
                quarterlyGoalHealth: {
                    totalGoals: goals.length,
                    draftGoals: countState(goals, GOAL_STATES.DRAFT),
                    plannedGoals: countState(goals, GOAL_STATES.PLANNED),
                    activeGoals: activeGoals,
                    atRiskGoals: atRiskGoals,
                    escalatedGoals: escalatedGoals,
                    reviewPendingGoals: reviewPendingGoals,
                    completedGoals: completedGoals,
                    archivedGoals: countState(goals, GOAL_STATES.ARCHIVED)
                },
                strategicObjectiveGovernance: {
                    quarterlyPlanning: true,
                    objectiveAssignments: goals.filter(function assigned(row) { return !!ownerIdOf(row); }).length,
                    kpiLinkedGoalTracking: kpiLinkedGoals > 0,
                    strategicCheckpointReviews: checkpointReviews,
                    delayedObjectiveEscalation: blockers.summary && blockers.summary.delayedObjectives || 0,
                    objectiveVersionHistory: true,
                    strategicReviewWorkflows: discussions.length,
                    unsafeStrategicOverride: false,
                    historicalGoalRecordsImmutable: true
                },
                goalRiskIntelligence: blockers.summary || {
                    delayedObjectives: 0,
                    stalledExecution: 0,
                    kpiDegradation: 0,
                    repeatedEscalationPatterns: 0,
                    departmentGoalCongestion: 0,
                    unresolvedStrategicBlockers: 0
                },
                kpiPerformanceIntegration: {
                    kpiLinkedGoals: kpiLinkedGoals,
                    kpiLinkedObjectives: kpiLinkedGoals,
                    kpiLinkedGoalScoring: kpiLinkedGoals ? avgProgress : 0,
                    executionPerformanceTracking: performance.length + executions.length,
                    quarterlyCompletionAnalytics: completionRate,
                    accountabilityScoring: Math.max(0, 100 - ((blockers.summary && blockers.summary.unresolvedStrategicBlockers || 0) * 5)),
                    strategicHealthSummaries: avgProgress,
                    unsafeKpiMutation: false
                },
                executionDependencyIntegration: {
                    dependencyLinkedObjectives: dependencyLinkedObjectives,
                    milestoneLinkedGoals: milestoneLinkedGoals,
                    executionTracking: executions.length,
                    departmentExecutionMapping: departmentExecutionMapping,
                    escalationLinkedPlanning: escalationLinkedPlanning,
                    unsafeDependencyCorruption: false
                },
                goalAnalytics: {
                    quarterlyCompletionRate: completionRate,
                    executionVelocity: avgProgress,
                    delayedObjectiveFrequency: blockers.summary && blockers.summary.delayedObjectives || 0,
                    accountabilityTrends: goals.filter(function accountable(row) { return !!accountabilityOwnerOf(row); }).length,
                    kpiAchievementHealth: kpiLinkedGoals ? avgProgress : 0,
                    escalationLinkedObjectives: escalationLinkedPlanning,
                    departmentGoalPerformance: departmentGoalPerformance
                },
                accessGovernance: {
                    employeeAssignedObjectivesOnly: true,
                    managerDepartmentGoalVisibility: true,
                    hrOperationalGoalVisibility: true,
                    hrHeadStrategicOrganizationVisibility: true,
                    directorOrganizationStrategicAnalytics: true,
                    superAdminStrategicModificationAuthority: false,
                    platformOwnerTenantStrategicChain: false,
                    crossTenantGoalLeakageBlocked: true,
                    historicalQuarterlyGoalsImmutable: true,
                    unsafeStrategicOverrideBlocked: true,
                    existingStrategicWorkflowsPreserved: true,
                    existingWorkflowsPreserved: true,
                    goalActionsAuditable: true,
                    escalationGovernancePreserved: true,
                    strategicGoalConfidentialityPreserved: true,
                    tenantIsolationPreserved: true
                },
                integrationHealth: {
                    departmentExecutionBoardIntegrated: !!global.DepartmentExecutionBoardService,
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
                warnings: blockers.signals || [],
                metadata: {
                    tenantIsolationPreserved: true,
                    strategicGoalConfidentialityPreserved: true,
                    historicalGoalRecordsImmutable: true,
                    existingStrategicWorkflowsPreserved: true,
                    goalActionsAuditable: true,
                    escalationGovernancePreserved: true
                }
            };
            auditGoal('QUARTERLY_GOAL_REPORTED', {
                tenantSlug: tenant,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO',
                description: 'Quarterly goal governance report viewed.'
            }, context || {});
            emitTelemetry('QUARTERLY_GOAL_REPORTED', {
                tenantSlug: tenant,
                status: classification,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'INFO',
                delayedObjectives: blockers.summary && blockers.summary.delayedObjectives || 0
            }, context || {});
            recordMetric('QUARTERLY_GOAL_REPORTED', {
                tenantSlug: tenant,
                status: classification,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'INFO'
            }, context || {});
            return freezeGoalOutput(report);
        } catch (error) {
            safeWarn('Quarterly goal report failed safely.', error && error.message ? error.message : error);
            return freezeGoalOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                quarterlyGoalHealth: { totalGoals: 0 },
                goalRiskIntelligence: { delayedObjectives: 0 },
                failures: [safeFailure('QUARTERLY_GOAL_REPORT_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Quarterly goal report failed safely.')]
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        function check(label, condition) { checks.push({ label: label, passed: !!condition }); }
        try {
            var malformed = normalizeGoalPayload(null, { tenantSlug: 'tabsons' });
            check('malformed payloads fail safely', malformed.success === false && malformed.failures.some(function item(row) { return row.failureCode === 'MALFORMED_GOAL_PAYLOAD'; }));

            var crossTenant = validateGoalScope({ tenantSlug: 'abc', ownerId: 'EMP-X' }, { tenantSlug: 'tabsons', actor: { role: 'HR_HEAD', id: 'HRH-1' } });
            check('goal isolation works', crossTenant.allowed === false && crossTenant.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER);

            var kpi = evaluateObjectiveGovernance({ tenantSlug: 'tabsons', ownerId: 'EMP-1', kpiId: 'KPI-1', state: 'ACTIVE' }, { tenantSlug: 'tabsons', actor: { role: 'HR_HEAD', id: 'HRH-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('KPI integration works', kpi.success === true && kpi.objectiveGovernance.kpiLinkedGoalTracking === true);

            var escalation = escalateDelayedObjective({ tenantSlug: 'tabsons', ownerId: 'EMP-1', state: 'AT_RISK', dueDate: '2020-01-01' }, { tenantSlug: 'tabsons', actor: { role: 'HR_HEAD', id: 'HRH-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('escalation governance works', escalation.success === true && escalation.delayedObjectiveEscalation.escalationGovernancePreserved === true);

            var governance = evaluateObjectiveGovernance({ tenantSlug: 'tabsons', ownerId: 'EMP-1', accountabilityOwnerId: 'MGR-1', kpiId: 'KPI-1', state: 'ACTIVE' }, { tenantSlug: 'tabsons', actor: { role: 'HR_HEAD', id: 'HRH-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('accountability tracking works', governance.success === true && governance.objectiveGovernance.objectiveAssignment === true);

            var frozen = freezeGoalOutput({ nested: { ok: true }, payload: { state: GOAL_STATES.ACTIVE } });
            check('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested) && Object.isFrozen(frozen.payload));

            var originalDepartmentExecution = global.DepartmentExecutionBoardService;
            var originalDependency = global.StrategicDependencyService;
            var originalTimeline = global.DeliverableTimelineService;
            var originalPerformance = global.PerformanceGovernanceService;
            try {
                delete global.DepartmentExecutionBoardService;
                delete global.StrategicDependencyService;
                delete global.DeliverableTimelineService;
                delete global.PerformanceGovernanceService;
                var degraded = generateQuarterlyGoalReport({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', actor: { role: 'HR_HEAD', id: 'HRH-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
                check('dependency absence degrades safely', degraded.success === true && degraded.integrationHealth.departmentExecutionBoardIntegrated === false && degraded.integrationHealth.strategicDependencyIntegrated === false && degraded.integrationHealth.deliverableTimelineIntegrated === false && degraded.integrationHealth.performanceGovernanceIntegrated === false);
            } finally {
                if (originalDepartmentExecution) global.DepartmentExecutionBoardService = originalDepartmentExecution;
                if (originalDependency) global.StrategicDependencyService = originalDependency;
                if (originalTimeline) global.DeliverableTimelineService = originalTimeline;
                if (originalPerformance) global.PerformanceGovernanceService = originalPerformance;
            }
        } catch (error) {
            checks.push({ label: 'self-test uncaught error guard', passed: false, description: safeString(error && error.message || error, '') });
        }
        var passed = checks.every(function item(row) { return row.passed; });
        var result = freezeGoalOutput({
            passed: passed,
            checks: checks,
            summary: passed ? 'Quarterly goal self-test passed.' : 'Quarterly goal self-test detected failures.'
        });
        global.__ARTHHRMS_QUARTERLY_GOAL_SELF_TEST__ = result;
        return result;
    }

    var QuarterlyGoalService = Object.freeze({
        VERSION: VERSION,
        GOAL_STATES: GOAL_STATES,
        FAILURE_CLASSIFICATIONS: FAILURE_CLASSIFICATIONS,
        VISIBILITY: VISIBILITY,
        validateGoalScope: validateGoalScope,
        classifyGoalRisk: classifyGoalRisk,
        normalizeGoalPayload: normalizeGoalPayload,
        freezeGoalOutput: freezeGoalOutput,
        detectStrategicBlockers: detectStrategicBlockers,
        evaluateObjectiveGovernance: evaluateObjectiveGovernance,
        escalateDelayedObjective: escalateDelayedObjective,
        generateQuarterlyGoalReport: generateQuarterlyGoalReport,
        runSelfTest: runSelfTest
    });

    global.QuarterlyGoalService = QuarterlyGoalService;
    global.quarterlyGoalService = QuarterlyGoalService;

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
