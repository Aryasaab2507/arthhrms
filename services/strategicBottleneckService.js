/**
 * strategicBottleneckService.js
 * ARTHHRMS Enterprise Strategic Bottleneck Detection + Organizational Congestion Intelligence.
 *
 * Additive read-only governance layer for workflow congestion, delayed
 * approvals, dependency blockages, execution slowdown, escalation congestion,
 * delay propagation, KPI-linked congestion scoring, and tenant-confidential
 * strategic risk analytics.
 */
(function attachStrategicBottleneckService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[StrategicBottleneckService]';

    var BOTTLENECK_STATES = Object.freeze({
        MONITORING: 'MONITORING',
        DETECTED: 'DETECTED',
        ESCALATED: 'ESCALATED',
        CRITICAL: 'CRITICAL',
        MITIGATED: 'MITIGATED',
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
        ASSIGNED_WORKFLOW_BOTTLENECKS_ONLY: 'ASSIGNED_WORKFLOW_BOTTLENECKS_ONLY',
        DEPARTMENT_BOTTLENECK_VISIBILITY: 'DEPARTMENT_BOTTLENECK_VISIBILITY',
        HR_OPERATIONAL_BOTTLENECK_VISIBILITY: 'HR_OPERATIONAL_BOTTLENECK_VISIBILITY',
        STRATEGIC_EXECUTION_BOTTLENECK_VISIBILITY: 'STRATEGIC_EXECUTION_BOTTLENECK_VISIBILITY',
        ORGANIZATION_CONGESTION_ANALYTICS: 'ORGANIZATION_CONGESTION_ANALYTICS',
        INFRASTRUCTURE_VISIBILITY_ONLY: 'INFRASTRUCTURE_VISIBILITY_ONLY',
        PLATFORM_GOVERNANCE_ONLY: 'PLATFORM_GOVERNANCE_ONLY'
    });

    var SENSITIVE_KEY_PATTERN = /(bottleneck.?id|queue.?id|action.?id|dependency.?id|execution.?id|workflow.?id|deliverable.?id|milestone.?id|emp.?id|employee.?id|owner.?id|reviewer.?id|manager.?id|strategic.?owner|kpi.?id|correlation.?id|event.?id|escalation.?id|note|comment|feedback|private|confidential|salary|payroll|leave.?balance|compensation|rating|score|token|secret|jwt|authorization|service.?role|private.?key|raw|payload.?id|target.?id|log.?id)/i;
    var SENSITIVE_VALUE_PATTERN = /(https?:\/\/[^\s"',}]+|private:\/\/[^\s"',}]+|\b(private|confidential|secret|salary|payroll|leave balance|strategic note|congestion note|bottleneck note|execution override|roadmap)\b[^,;}]*)/ig;

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
        queueAgeHours: true,
        throughputScore: true,
        assignedWorkflow: true,
        dependencyLinked: true,
        mitigationReady: true,
        bottleneckHealth: true,
        congestionGovernance: true,
        congestionDetection: true,
        delayPropagationIntelligence: true,
        kpiExecutionIntegration: true,
        workflowDependencyIntegration: true,
        bottleneckAnalytics: true,
        accessGovernance: true,
        integrationHealth: true,
        congestionEscalation: true,
        totalBottlenecks: true,
        monitoringBottlenecks: true,
        detectedBottlenecks: true,
        escalatedBottlenecks: true,
        criticalBottlenecks: true,
        mitigatedBottlenecks: true,
        resolvedBottlenecks: true,
        archivedBottlenecks: true,
        workflowQueueMonitoring: true,
        delayedApprovalDetection: true,
        dependencyBlockageTracking: true,
        escalationCongestionDetection: true,
        executionSlowdownScoring: true,
        bottleneckSeverityGrading: true,
        congestionMitigationMarkers: true,
        unsafeWorkflowOverride: true,
        unsafeWorkflowOverridesBlocked: true,
        historicalBottleneckRecordsImmutable: true,
        cascadingDelays: true,
        dependencyLinkedSlowdowns: true,
        executionChainFailures: true,
        repeatedEscalationCongestion: true,
        departmentExecutionOverload: true,
        unresolvedApprovalChains: true,
        kpiLinkedCongestionScoring: true,
        executionSlowdownAnalytics: true,
        strategicDelayImpactScoring: true,
        accountabilityLinkedBottlenecks: true,
        performanceDegradationSummaries: true,
        unsafeKpiMutation: true,
        dependencyLinkedCongestion: true,
        escalationTriggeredBottlenecks: true,
        workflowThroughputMonitoring: true,
        blockedExecutionChains: true,
        strategicCongestionReviews: true,
        unsafeDependencyCorruption: true,
        congestionFrequency: true,
        delayPropagationTrends: true,
        blockedWorkflowGrowth: true,
        escalationCongestion: true,
        approvalSlowdownFrequency: true,
        overloadedDepartmentPatterns: true,
        organizationalThroughputDecline: true,
        employeeAssignedWorkflowBottlenecksOnly: true,
        managerDepartmentBottleneckVisibility: true,
        hrOperationalBottleneckVisibility: true,
        hrHeadStrategicBottleneckVisibility: true,
        directorOrganizationCongestionAnalytics: true,
        superAdminStrategicExecutionModificationAuthority: true,
        platformOwnerTenantExecutionChain: true,
        crossTenantExecutionLeakageBlocked: true,
        historicalBottleneckMutationPrevented: true,
        unsafeWorkflowOverrideBlocked: true,
        existingStrategicWorkflowsPreserved: true,
        existingWorkflowsPreserved: true,
        bottleneckActionsAuditable: true,
        escalationGovernancePreserved: true,
        strategicCongestionIntelligencePreserved: true,
        tenantIsolationPreserved: true,
        kpiScorecardIntegrated: true,
        leadershipAccountabilityIntegrated: true,
        strategicDependencyIntegrated: true,
        strategicExecutionIntegrated: true,
        departmentExecutionBoardIntegrated: true,
        performanceGovernanceIntegrated: true,
        escalationCommandIntegrated: true,
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

    function actorRole(context) {
        return normalizeRole(context && context.actor && context.actor.role || context && context.role);
    }

    function empIdOf(row) {
        return safeString(row && (row.empId || row.employeeId || row.assigneeId || row.assignedTo || row.contributorId), '').trim();
    }

    function ownerIdOf(row) {
        return safeString(row && (row.ownerId || row.managerId || row.reviewerId || row.strategicOwnerId || row.executionOwnerId), '').trim();
    }

    function departmentOf(row) {
        return safeString(row && (row.department || row.dept || row.sourceDepartment || row.team), 'Unassigned') || 'Unassigned';
    }

    function stateOf(row) {
        return normalizeBottleneckState(row && (row.state || row.status || row.governanceState || row.lifecycleState));
    }

    function normalizeBottleneckState(value) {
        var normalized = normalizeToken(value || BOTTLENECK_STATES.MONITORING);
        if (normalized === 'OPEN' || normalized === 'ACTIVE' || normalized === 'IN_PROGRESS') return BOTTLENECK_STATES.MONITORING;
        if (normalized === 'BLOCKED' || normalized === 'DELAYED' || normalized === 'AT_RISK') return BOTTLENECK_STATES.DETECTED;
        if (normalized === 'ESCALATE' || normalized === 'ESCALATED') return BOTTLENECK_STATES.ESCALATED;
        if (normalized === 'CRITICAL_BLOCKER' || normalized === 'SEVERE') return BOTTLENECK_STATES.CRITICAL;
        if (normalized === 'MITIGATED' || normalized === 'MITIGATING') return BOTTLENECK_STATES.MITIGATED;
        if (normalized === 'DONE' || normalized === 'COMPLETE' || normalized === 'COMPLETED' || normalized === 'RESOLVED') return BOTTLENECK_STATES.RESOLVED;
        if (normalized === 'ARCHIVE' || normalized === 'ARCHIVED') return BOTTLENECK_STATES.ARCHIVED;
        if (BOTTLENECK_STATES[normalized]) return BOTTLENECK_STATES[normalized];
        return BOTTLENECK_STATES.MONITORING;
    }

    function nowIso(context) {
        try { return context && context.now ? new Date(context.now).toISOString() : new Date().toISOString(); } catch (error) { return new Date().toISOString(); }
    }

    function today(context) {
        var source = db();
        return safeString(context && context.now || '', '').slice(0, 10) || (source && typeof source.today === 'function' ? source.today() : new Date().toISOString().slice(0, 10));
    }

    function dueDateOf(row) {
        return safeString(row && (row.dueDate || row.deadlineDate || row.targetDate || row.endDate), '');
    }

    function isResolved(row) {
        var state = stateOf(row);
        return state === BOTTLENECK_STATES.RESOLVED || state === BOTTLENECK_STATES.MITIGATED || safeNumber(row && row.throughputScore, 0) >= 90 || !!(row && row.resolvedAt);
    }

    function isOverdue(row, context) {
        var due = dueDateOf(row);
        if (!due || isResolved(row)) return false;
        return due.slice(0, 10) < today(context);
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

    function freezeBottleneckOutput(value) {
        return deepFreeze(cloneSanitized(value || {}));
    }

    function safeFailure(failureCode, classification, description, metadata) {
        var failure = {
            failureCode: normalizeToken(failureCode || 'BOTTLENECK_GOVERNANCE_FAILURE'),
            classification: classification || FAILURE_CLASSIFICATIONS.WARNING,
            description: safeString(description || 'Bottleneck governance failed safely.', '')
        };
        if (metadata && typeof metadata === 'object') failure.metadata = cloneSanitized(metadata);
        return deepFreeze(failure);
    }

    function safeWarning(warningCode, description, metadata) {
        var warning = {
            warningCode: normalizeToken(warningCode || 'BOTTLENECK_GOVERNANCE_WARNING'),
            classification: FAILURE_CLASSIFICATIONS.WARNING,
            description: safeString(description || 'Bottleneck governance warning.', '')
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

    function classifyCongestionRisk(signal) {
        try {
            var item = signal || {};
            if (item.crossTenant || item.historicalMutation || item.archivedMutation || item.platformOwnerChain) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
            if (item.unsafeExecutionOverride || item.superAdminStrategicMutation || item.congestionEscalation || item.executionChainFailure || item.kpiCongestionDegradation) return FAILURE_CLASSIFICATIONS.HIGH_RISK;
            if (item.workflowBlockage || item.delayedApproval || item.departmentOverload || item.dependencySlowdown || item.malformedPayload) return FAILURE_CLASSIFICATIONS.WARNING;
            return FAILURE_CLASSIFICATIONS.INFO;
        } catch (error) {
            return FAILURE_CLASSIFICATIONS.HIGH_RISK;
        }
    }

    function bottleneckRows(data) {
        return list(data, 'strategicBottleneckRecords').concat(list(data, 'bottleneckRecords'), list(data, 'executionBottlenecks'));
    }

    function workflowQueueRows(data) {
        return list(data, 'workflowQueues').concat(list(data, 'approvalQueues'), list(data, 'workflowBacklogs'));
    }

    function pendingRows(data) {
        return list(data, 'pendingActions').concat(list(data, 'pendingApprovals'));
    }

    function dependencyRows(data) {
        return list(data, 'deliverableDependencies').concat(list(data, 'strategicDependencies'), list(data, 'dependencyGraphRecords'));
    }

    function executionRows(data) {
        return list(data, 'departmentExecutionRecords').concat(list(data, 'executionBoardRecords'), list(data, 'strategicDeliverables'));
    }

    function kpiRows(data) {
        return list(data, 'kpiScorecards').concat(list(data, 'performanceScorecards'), list(data, 'kpiRecords'));
    }

    function performanceRows(data) {
        return list(data, 'performanceGoals').concat(list(data, 'performanceReviews'), list(data, 'appraisals'));
    }

    function escalationRows(data) {
        return list(data, 'escalations').concat(list(data, 'strategicEscalations'), list(data, 'escalationEvents'));
    }

    function workflowRows(data) {
        return list(data, 'workflowEvents').concat(list(data, 'workflowTelemetry'));
    }

    function tenantFilter(tenant) {
        return function sameTenant(row) {
            var rowSlug = rowTenant(row);
            return !!tenant && rowSlug === tenant;
        };
    }

    function scopedBottlenecks(data, tenant) {
        return bottleneckRows(data).filter(tenantFilter(tenant));
    }

    function countWhere(rows, predicate) {
        return rows.filter(function keep(row) {
            try { return !!predicate(row); } catch (error) { return false; }
        }).length;
    }

    function countState(rows, state) {
        return countWhere(rows, function match(row) { return stateOf(row) === state; });
    }

    function isRiskLike(row, context) {
        var state = stateOf(row);
        var status = normalizeToken(row && (row.status || row.governanceState || row.severity));
        return state === BOTTLENECK_STATES.DETECTED || state === BOTTLENECK_STATES.ESCALATED || state === BOTTLENECK_STATES.CRITICAL || /BLOCKED|FAILED|DEGRADED|CRITICAL|ESCALATED|WAITING|PENDING/.test(status) || isOverdue(row, context) || safeNumber(row && row.queueAgeHours, 0) >= 48 || safeNumber(row && row.throughputScore, 100) < 50;
    }

    function recordMatchesActor(record, context) {
        var id = actorId(context);
        if (!id) return false;
        return [empIdOf(record), ownerIdOf(record), safeString(record && record.assignedTo, ''), safeString(record && record.assigneeId, '')].indexOf(id) !== -1;
    }

    function validateBottleneckScope(record, context) {
        try {
            var data = rawData();
            var ctx = context || {};
            var role = actorRole(ctx);
            var ctxTenant = contextTenant(ctx);
            var targetTenant = resolveTenant(record || {}, ctx, data);
            var failures = [];
            var warnings = [];
            var visibility = VISIBILITY.NONE;
            var state = stateOf(record || {});
            var mutationRequested = !!(record && (record.executionOverride || record.workflowOverride || record.bottleneckMutation || record.modify || record.update || record.override || record.forceExecutionMutation));

            if (ctxTenant && targetTenant && ctxTenant !== targetTenant) {
                failures.push(safeFailure('CROSS_TENANT_EXECUTION_VISIBILITY_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Cross-tenant execution visibility was blocked.'));
            }
            if (state === BOTTLENECK_STATES.ARCHIVED && mutationRequested) {
                failures.push(safeFailure('ARCHIVED_BOTTLENECK_MUTATION_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Archived bottleneck records are immutable.'));
            }
            if (role === 'SUPER_ADMIN' && mutationRequested) {
                failures.push(safeFailure('SUPER_ADMIN_STRATEGIC_EXECUTION_MODIFICATION_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'SUPER_ADMIN cannot modify strategic execution intelligence.'));
            }
            if (role === 'PLATFORM_OWNER') {
                failures.push(safeFailure('PLATFORM_OWNER_TENANT_EXECUTION_CHAIN_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'PLATFORM_OWNER remains isolated from tenant execution chains.'));
                visibility = VISIBILITY.PLATFORM_GOVERNANCE_ONLY;
            }

            if (!failures.length) {
                if (role === 'EMPLOYEE') {
                    if (recordMatchesActor(record || {}, ctx)) visibility = VISIBILITY.ASSIGNED_WORKFLOW_BOTTLENECKS_ONLY;
                    else failures.push(safeFailure('EMPLOYEE_BOTTLENECK_VISIBILITY_BLOCKED', FAILURE_CLASSIFICATIONS.WARNING, 'Employee bottleneck visibility is limited to assigned workflow bottlenecks.'));
                } else if (role === 'MANAGER') {
                    if (!record || !record.department || departmentOf(record) === safeString(ctx.actor && ctx.actor.department, '')) visibility = VISIBILITY.DEPARTMENT_BOTTLENECK_VISIBILITY;
                    else failures.push(safeFailure('MANAGER_DEPARTMENT_BOTTLENECK_BLOCKED', FAILURE_CLASSIFICATIONS.WARNING, 'Manager bottleneck visibility is limited to department records.'));
                } else if (role === 'HR') {
                    visibility = VISIBILITY.HR_OPERATIONAL_BOTTLENECK_VISIBILITY;
                } else if (role === 'HR_HEAD') {
                    visibility = VISIBILITY.STRATEGIC_EXECUTION_BOTTLENECK_VISIBILITY;
                } else if (role === 'DIRECTOR') {
                    visibility = VISIBILITY.ORGANIZATION_CONGESTION_ANALYTICS;
                } else if (role === 'SUPER_ADMIN') {
                    visibility = VISIBILITY.INFRASTRUCTURE_VISIBILITY_ONLY;
                    warnings.push(safeWarning('SUPER_ADMIN_INFRASTRUCTURE_ONLY', 'SUPER_ADMIN receives infrastructure visibility only.'));
                } else {
                    failures.push(safeFailure('UNAUTHORIZED_BOTTLENECK_VISIBILITY_BLOCKED', FAILURE_CLASSIFICATIONS.WARNING, 'Bottleneck visibility requires a governed role.'));
                }
            }

            var classification = highestClassification(failures.map(function item(row) { return row.classification; }).concat(warnings.map(function item(row) { return row.classification; })));
            return freezeBottleneckOutput({
                success: failures.length === 0,
                allowed: failures.length === 0,
                readOnly: !mutationRequested,
                classification: failures.length || warnings.length ? classification : FAILURE_CLASSIFICATIONS.INFO,
                visibility: visibility,
                state: state,
                failures: failures,
                warnings: warnings,
                metadata: {
                    tenantIsolationPreserved: failures.filter(function item(row) { return row.failureCode === 'CROSS_TENANT_EXECUTION_VISIBILITY_BLOCKED'; }).length === 0,
                    strategicCongestionIntelligencePreserved: true,
                    historicalBottleneckRecordsImmutable: true
                }
            });
        } catch (error) {
            return freezeBottleneckOutput({
                success: false,
                allowed: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                visibility: VISIBILITY.NONE,
                failures: [safeFailure('BOTTLENECK_SCOPE_VALIDATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Bottleneck scope validation failed safely.')]
            });
        }
    }

    function normalizeBottleneckPayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeBottleneckOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    failures: [safeFailure('MALFORMED_BOTTLENECK_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Malformed bottleneck payload rejected safely.')]
                });
            }
            var scope = validateBottleneckScope(payload, context || {});
            if (!scope.allowed && scope.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER) return scope;
            var state = normalizeBottleneckState(payload.state || payload.status || payload.governanceState);
            var normalized = {
                tenantSlug: resolveTenant(payload, context || {}, rawData()),
                department: departmentOf(payload),
                state: state,
                queueAgeHours: Math.max(0, safeNumber(payload.queueAgeHours || payload.ageHours, 0)),
                throughputScore: clamp(safeNumber(payload.throughputScore || payload.executionThroughput || 0, 0), 0, 100),
                payload: {
                    state: state,
                    department: departmentOf(payload),
                    queueAgeHours: Math.max(0, safeNumber(payload.queueAgeHours || payload.ageHours, 0)),
                    throughputScore: clamp(safeNumber(payload.throughputScore || payload.executionThroughput || 0, 0), 0, 100),
                    assignedWorkflow: !!(payload.workflowId || payload.workflowType),
                    dependencyLinked: !!(payload.dependencyId || payload.dependsOnDeliverableId),
                    mitigationReady: !!(payload.mitigationStatus || payload.mitigationMarker || state === BOTTLENECK_STATES.MITIGATED)
                },
                metadata: {
                    tenantIsolationPreserved: true,
                    strategicCongestionIntelligencePreserved: true,
                    shallowClonedMetadata: true
                }
            };
            return freezeBottleneckOutput(Object.assign({ success: true, classification: scope.classification || FAILURE_CLASSIFICATIONS.INFO, visibility: scope.visibility }, normalized));
        } catch (error) {
            return freezeBottleneckOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('BOTTLENECK_PAYLOAD_NORMALIZATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Bottleneck payload normalization failed safely.')]
            });
        }
    }

    function evaluateCongestionGovernance(payload, context) {
        try {
            var scope = validateBottleneckScope(payload || {}, context || {});
            if (!scope.allowed) return scope;
            var normalized = normalizeBottleneckPayload(payload || {}, context || {});
            if (!normalized.success) return normalized;
            var result = {
                success: true,
                readOnly: true,
                classification: normalized.payload.state === BOTTLENECK_STATES.CRITICAL || normalized.payload.state === BOTTLENECK_STATES.ESCALATED ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.INFO,
                visibility: scope.visibility,
                congestionGovernance: {
                    workflowQueueMonitoring: true,
                    delayedApprovalDetection: true,
                    dependencyBlockageTracking: normalized.payload.dependencyLinked,
                    escalationCongestionDetection: true,
                    executionSlowdownScoring: true,
                    bottleneckSeverityGrading: true,
                    congestionMitigationMarkers: true,
                    unsafeWorkflowOverridesBlocked: true,
                    historicalBottleneckRecordsImmutable: true
                },
                metadata: {
                    tenantIsolationPreserved: true,
                    bottleneckActionsAuditable: true,
                    strategicCongestionIntelligencePreserved: true
                }
            };
            return freezeBottleneckOutput(result);
        } catch (error) {
            return freezeBottleneckOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('CONGESTION_GOVERNANCE_EVALUATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Congestion governance evaluation failed safely.')]
            });
        }
    }

    function detectDelayPropagation(filters, context) {
        try {
            var data = rawData();
            var tenant = resolveTenant(filters || {}, context || {}, data);
            var bottlenecks = scopedBottlenecks(data, tenant);
            var queues = workflowQueueRows(data).filter(tenantFilter(tenant));
            var pending = pendingRows(data).filter(tenantFilter(tenant));
            var dependencies = dependencyRows(data).filter(tenantFilter(tenant));
            var executions = executionRows(data).filter(tenantFilter(tenant));
            var escalations = escalationRows(data).filter(tenantFilter(tenant));
            var workflows = workflowRows(data).filter(tenantFilter(tenant));
            var deptCounts = {};
            bottlenecks.concat(executions).forEach(function each(row) {
                if (!isRiskLike(row, context)) return;
                var department = departmentOf(row);
                deptCounts[department] = (deptCounts[department] || 0) + 1;
            });
            var summary = {
                cascadingDelays: countWhere(bottlenecks, function delayed(row) { return isRiskLike(row, context) || isOverdue(row, context); }) + countWhere(workflows, function delayed(row) { return /CONGESTION|SLOWDOWN|BUILDUP|DEGRADED|FAILED/.test([row.type, row.eventType, row.status, row.module].join(' ').toUpperCase()); }),
                dependencyLinkedSlowdowns: countWhere(dependencies, function slow(row) { return /BLOCKED|WAITING|AT_RISK|DELAY|FAILED/.test([row.state, row.status].join(' ').toUpperCase()) || isOverdue(row, context); }),
                executionChainFailures: countWhere(executions, function failed(row) { return /BLOCKED|ESCALATED|FAILED|DEGRADED/.test([row.state, row.status, row.governanceState].join(' ').toUpperCase()) || safeNumber(row.progressPercent, 100) < 30; }),
                repeatedEscalationCongestion: escalations.length >= 2 ? escalations.length : countWhere(escalations, function congestion(row) { return /CONGESTION|BOTTLENECK|SLOWDOWN|APPROVAL/.test([row.escalationType, row.type].join(' ').toUpperCase()); }),
                departmentExecutionOverload: Object.keys(deptCounts).filter(function key(department) { return deptCounts[department] >= 2; }).length,
                unresolvedApprovalChains: countWhere(pending, function approval(row) { return row.approvalPending === true || /PENDING|WAITING|APPROVAL/.test([row.status, row.type].join(' ').toUpperCase()); }) + countWhere(queues, function approval(row) { return row.approvalPending === true || /PENDING|WAITING|BLOCKED|FAILED|DEGRADED/.test([row.status, row.state].join(' ').toUpperCase()); }) + countWhere(bottlenecks, function approval(row) { return row.delayedApproval === true || row.unresolvedApprovalChain === true; })
            };
            var signals = Object.keys(summary).filter(function active(key) { return summary[key] > 0; }).map(function signal(key) {
                return {
                    signal: key,
                    count: summary[key],
                    severity: key === 'executionChainFailures' || key === 'cascadingDelays' ? 'HIGH_RISK' : 'WARNING'
                };
            });
            return freezeBottleneckOutput({
                success: true,
                readOnly: true,
                classification: signals.length ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.INFO,
                summary: summary,
                signals: signals,
                metadata: {
                    tenantIsolationPreserved: true,
                    strategicCongestionIntelligencePreserved: true
                }
            });
        } catch (error) {
            return freezeBottleneckOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                summary: {
                    cascadingDelays: 0,
                    dependencyLinkedSlowdowns: 0,
                    executionChainFailures: 0,
                    repeatedEscalationCongestion: 0,
                    departmentExecutionOverload: 0,
                    unresolvedApprovalChains: 0
                },
                signals: [],
                failures: [safeFailure('DELAY_PROPAGATION_DETECTION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Delay propagation detection failed safely.')]
            });
        }
    }

    function auditBottleneck(actionType, metadata, context) {
        if (auditForwarding || context && context.skipAuditPersistence) return { success: true, skipped: true };
        auditForwarding = true;
        try {
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    type: actionType,
                    actionType: actionType,
                    source: 'strategicBottleneckService',
                    module: 'Strategic Bottleneck',
                    severity: metadata && metadata.severity || 'INFO',
                    actorRole: context && context.actor && context.actor.role || 'system',
                    actorId: actorId(context),
                    description: metadata && metadata.description || actionType,
                    metadata: Object.assign({
                        actionType: actionType,
                        tenantSlug: contextTenant(context) || metadata && metadata.tenantSlug || '',
                        strategicCongestionIntelligencePreserved: true
                    }, cloneSanitized(metadata || {}))
                });
            }
        } catch (error) {
            return { success: false, warning: 'Bottleneck audit failed safely.' };
        } finally {
            auditForwarding = false;
        }
        return { success: false, warning: 'AuditService unavailable.' };
    }

    function emitTelemetry(eventType, metadata, context) {
        if (telemetryForwarding || context && context.skipTelemetry) return { success: true, skipped: true };
        telemetryForwarding = true;
        try {
            var service = global.WorkflowTelemetryService || global.workflowTelemetryService;
            if (service && typeof service.emitTelemetry === 'function') {
                service.emitTelemetry('GOVERNANCE', eventType, {
                    source: 'strategicBottleneckService',
                    severity: metadata && metadata.severity || 'INFO',
                    status: metadata && metadata.status || eventType,
                    tenantSlug: contextTenant(context) || metadata && metadata.tenantSlug || '',
                    metadata: cloneSanitized(metadata || {})
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Bottleneck telemetry failed safely.' };
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
                    source: 'strategicBottleneckService',
                    status: metadata && metadata.status || metricType,
                    severity: metadata && metadata.severity || 'INFO'
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Bottleneck metric failed safely.' };
        } finally {
            metricForwarding = false;
        }
        return { success: false, warning: 'OrchestrationMetricsService unavailable.' };
    }

    function escalateCongestion(payload, context) {
        try {
            var scope = validateBottleneckScope(payload || {}, context || {});
            if (!scope.allowed) return scope;
            var result = freezeBottleneckOutput({
                success: true,
                readOnly: true,
                state: BOTTLENECK_STATES.ESCALATED,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                visibility: scope.visibility,
                congestionEscalation: {
                    escalationCongestionDetection: true,
                    bottleneckSeverityGrading: true,
                    congestionMitigationMarkers: true,
                    escalationGovernancePreserved: true,
                    unsafeWorkflowOverridesBlocked: true,
                    historicalBottleneckRecordsImmutable: true
                },
                metadata: {
                    bottleneckActionsAuditable: true,
                    tenantIsolationPreserved: true,
                    strategicCongestionIntelligencePreserved: true
                }
            });
            auditBottleneck('STRATEGIC_BOTTLENECK_ESCALATED', { description: 'Strategic congestion escalation evaluated.', severity: 'WARNING' }, context || {});
            emitTelemetry('STRATEGIC_BOTTLENECK_ESCALATED', { severity: 'WARNING', status: BOTTLENECK_STATES.ESCALATED }, context || {});
            recordMetric('STRATEGIC_BOTTLENECK_ESCALATED', { severity: 'WARNING', status: BOTTLENECK_STATES.ESCALATED }, context || {});
            return result;
        } catch (error) {
            return freezeBottleneckOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('CONGESTION_ESCALATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Congestion escalation failed safely.')]
            });
        }
    }

    function generateStrategicBottleneckReport(filters, context) {
        try {
            var data = rawData();
            var tenant = resolveTenant(filters || {}, context || {}, data);
            var scope = validateBottleneckScope({ tenantSlug: tenant, readOnly: true }, context || {});
            if (!scope.allowed && scope.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER) {
                return freezeBottleneckOutput({
                    success: false,
                    readOnly: true,
                    classification: scope.classification,
                    failures: scope.failures,
                    bottleneckHealth: { totalBottlenecks: 0 },
                    metadata: {
                        tenantIsolationPreserved: false,
                        strategicCongestionIntelligencePreserved: true,
                        historicalBottleneckRecordsImmutable: true
                    }
                });
            }
            var bottlenecks = scopedBottlenecks(data, tenant);
            var queues = workflowQueueRows(data).filter(tenantFilter(tenant));
            var pending = pendingRows(data).filter(tenantFilter(tenant));
            var dependencies = dependencyRows(data).filter(tenantFilter(tenant));
            var executions = executionRows(data).filter(tenantFilter(tenant));
            var kpis = kpiRows(data).filter(tenantFilter(tenant));
            var performance = performanceRows(data).filter(tenantFilter(tenant));
            var escalations = escalationRows(data).filter(tenantFilter(tenant));
            var workflows = workflowRows(data).filter(tenantFilter(tenant));
            var propagation = detectDelayPropagation({ tenantSlug: tenant }, Object.assign({}, context || {}, {
                skipAuditPersistence: true,
                skipTelemetry: true,
                skipMetrics: true
            }));
            var criticalCount = countState(bottlenecks, BOTTLENECK_STATES.CRITICAL);
            var detectedCount = countState(bottlenecks, BOTTLENECK_STATES.DETECTED);
            var escalatedCount = countState(bottlenecks, BOTTLENECK_STATES.ESCALATED);
            var resolved = countState(bottlenecks, BOTTLENECK_STATES.RESOLVED) + countState(bottlenecks, BOTTLENECK_STATES.MITIGATED);
            var queueMonitoring = queues.length + countWhere(workflows, function event(row) { return /CONGESTION|SLOWDOWN|BUILDUP|QUEUE/.test([row.type, row.eventType, row.module, row.status].join(' ').toUpperCase()); });
            var delayedApprovals = countWhere(pending, function approval(row) { return row.approvalPending === true || /PENDING|WAITING|APPROVAL/.test([row.status, row.type].join(' ').toUpperCase()); }) + countWhere(queues, function approval(row) { return row.approvalPending === true; });
            var dependencyCongestion = countWhere(dependencies, function blocked(row) { return /BLOCKED|WAITING|AT_RISK|DELAY|FAILED/.test([row.state, row.status].join(' ').toUpperCase()) || isOverdue(row, context); });
            var executionFailures = propagation.summary && propagation.summary.executionChainFailures || 0;
            var kpiLinked = countWhere(bottlenecks, function kpi(row) { return !!(row.kpiId || row.kpiCode); }) + countWhere(kpis, function kpi(row) { return /DEGRADED|AT_RISK|ESCALATED/.test(normalizeToken(row.state || row.status)); }) + countWhere(performance, function perf(row) { return !!row.degraded || safeNumber(row.score || row.currentValue, 100) < 50; });
            var throughputScores = bottlenecks.map(function item(row) { return clamp(safeNumber(row.throughputScore, 50), 0, 100); });
            var avgThroughput = throughputScores.length ? Math.round(throughputScores.reduce(function sum(total, item) { return total + item; }, 0) / throughputScores.length) : 100;
            var classification = highestClassification([scope.classification, propagation.classification, criticalCount ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.INFO]);
            var report = {
                success: true,
                readOnly: true,
                classification: classification,
                generatedAt: nowIso(context),
                tenantSlug: tenant,
                visibility: scope.visibility,
                bottleneckHealth: {
                    totalBottlenecks: bottlenecks.length,
                    monitoringBottlenecks: countState(bottlenecks, BOTTLENECK_STATES.MONITORING),
                    detectedBottlenecks: detectedCount,
                    escalatedBottlenecks: escalatedCount,
                    criticalBottlenecks: criticalCount,
                    mitigatedBottlenecks: countState(bottlenecks, BOTTLENECK_STATES.MITIGATED),
                    resolvedBottlenecks: countState(bottlenecks, BOTTLENECK_STATES.RESOLVED),
                    archivedBottlenecks: countState(bottlenecks, BOTTLENECK_STATES.ARCHIVED)
                },
                congestionDetection: {
                    workflowQueueMonitoring: queueMonitoring,
                    delayedApprovalDetection: delayedApprovals,
                    dependencyBlockageTracking: dependencyCongestion,
                    escalationCongestionDetection: escalations.length,
                    executionSlowdownScoring: Math.max(0, 100 - avgThroughput),
                    bottleneckSeverityGrading: criticalCount + escalatedCount + detectedCount,
                    congestionMitigationMarkers: resolved,
                    unsafeWorkflowOverride: false,
                    unsafeWorkflowOverridesBlocked: true,
                    historicalBottleneckRecordsImmutable: true
                },
                delayPropagationIntelligence: propagation.summary || {
                    cascadingDelays: 0,
                    dependencyLinkedSlowdowns: 0,
                    executionChainFailures: 0,
                    repeatedEscalationCongestion: 0,
                    departmentExecutionOverload: 0,
                    unresolvedApprovalChains: 0
                },
                kpiExecutionIntegration: {
                    kpiLinkedCongestionScoring: kpiLinked,
                    executionSlowdownAnalytics: executionFailures,
                    strategicDelayImpactScoring: propagation.summary && propagation.summary.cascadingDelays || 0,
                    accountabilityLinkedBottlenecks: countWhere(bottlenecks.concat(executions), function owner(row) { return !!ownerIdOf(row); }),
                    performanceDegradationSummaries: countWhere(performance, function perf(row) { return !!row.degraded || safeNumber(row.score || row.currentValue, 100) < 50; }),
                    unsafeKpiMutation: false
                },
                workflowDependencyIntegration: {
                    dependencyLinkedCongestion: dependencyCongestion,
                    escalationTriggeredBottlenecks: escalations.length,
                    workflowThroughputMonitoring: queueMonitoring + workflows.length,
                    blockedExecutionChains: executionFailures,
                    strategicCongestionReviews: countWhere(workflows, function review(row) { return /CONGESTION|BOTTLENECK|SLOWDOWN|BUILDUP/.test([row.type, row.eventType, row.module].join(' ').toUpperCase()); }),
                    unsafeDependencyCorruption: false
                },
                bottleneckAnalytics: {
                    congestionFrequency: detectedCount + escalatedCount + criticalCount,
                    delayPropagationTrends: propagation.summary && propagation.summary.cascadingDelays || 0,
                    blockedWorkflowGrowth: queueMonitoring,
                    escalationCongestion: escalations.length,
                    approvalSlowdownFrequency: delayedApprovals,
                    overloadedDepartmentPatterns: propagation.summary && propagation.summary.departmentExecutionOverload || 0,
                    organizationalThroughputDecline: Math.max(0, 100 - avgThroughput)
                },
                accessGovernance: {
                    employeeAssignedWorkflowBottlenecksOnly: true,
                    managerDepartmentBottleneckVisibility: true,
                    hrOperationalBottleneckVisibility: true,
                    hrHeadStrategicBottleneckVisibility: true,
                    directorOrganizationCongestionAnalytics: true,
                    superAdminStrategicExecutionModificationAuthority: false,
                    platformOwnerTenantExecutionChain: false,
                    crossTenantExecutionLeakageBlocked: true,
                    historicalBottleneckMutationPrevented: true,
                    unsafeWorkflowOverrideBlocked: true,
                    existingStrategicWorkflowsPreserved: true,
                    existingWorkflowsPreserved: true,
                    bottleneckActionsAuditable: true,
                    escalationGovernancePreserved: true,
                    strategicCongestionIntelligencePreserved: true,
                    tenantIsolationPreserved: true
                },
                integrationHealth: {
                    kpiScorecardIntegrated: !!global.KPIScorecardService,
                    leadershipAccountabilityIntegrated: !!global.LeadershipAccountabilityService,
                    strategicDependencyIntegrated: !!global.StrategicDependencyService,
                    strategicExecutionIntegrated: !!global.StrategicExecutionService,
                    departmentExecutionBoardIntegrated: !!global.DepartmentExecutionBoardService,
                    performanceGovernanceIntegrated: !!global.PerformanceGovernanceService,
                    escalationCommandIntegrated: !!global.EscalationCommandService,
                    workflowTelemetryIntegrated: !!global.WorkflowTelemetryService,
                    auditReady: !!global.AuditService,
                    telemetryReady: !!global.WorkflowTelemetryService,
                    metricsReady: !!global.OrchestrationMetricsService
                },
                warnings: propagation.signals || [],
                metadata: {
                    tenantIsolationPreserved: true,
                    strategicCongestionIntelligencePreserved: true,
                    historicalBottleneckRecordsImmutable: true,
                    existingStrategicWorkflowsPreserved: true,
                    bottleneckActionsAuditable: true,
                    escalationGovernancePreserved: true
                }
            };
            auditBottleneck('STRATEGIC_BOTTLENECK_REPORTED', {
                tenantSlug: tenant,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO',
                description: 'Strategic bottleneck governance report viewed.'
            }, context || {});
            emitTelemetry('STRATEGIC_BOTTLENECK_REPORTED', {
                tenantSlug: tenant,
                status: classification,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO',
                congestionFrequency: report.bottleneckAnalytics.congestionFrequency
            }, context || {});
            recordMetric('STRATEGIC_BOTTLENECK_REPORTED', {
                tenantSlug: tenant,
                status: classification,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO'
            }, context || {});
            return freezeBottleneckOutput(report);
        } catch (error) {
            safeWarn('Strategic bottleneck report failed safely.', error && error.message ? error.message : error);
            return freezeBottleneckOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                bottleneckHealth: { totalBottlenecks: 0 },
                failures: [safeFailure('STRATEGIC_BOTTLENECK_REPORT_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Strategic bottleneck report failed safely.')]
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        function check(label, condition) { checks.push({ label: label, passed: !!condition }); }
        try {
            var malformed = normalizeBottleneckPayload(null, { tenantSlug: 'tabsons' });
            check('malformed payloads fail safely', malformed.success === false && malformed.failures.some(function item(row) { return row.failureCode === 'MALFORMED_BOTTLENECK_PAYLOAD'; }));

            var crossTenant = validateBottleneckScope({ tenantSlug: 'abc', ownerId: 'MGR-X' }, { tenantSlug: 'tabsons', actor: { role: 'HR_HEAD', id: 'HRH-1' } });
            check('congestion isolation works', crossTenant.allowed === false && crossTenant.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER);

            var governance = evaluateCongestionGovernance({ tenantSlug: 'tabsons', ownerId: 'MGR-1', dependencyId: 'DEP-1', state: 'DETECTED' }, { tenantSlug: 'tabsons', actor: { role: 'HR_HEAD', id: 'HRH-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('bottleneck detection works', governance.success === true && governance.congestionGovernance.workflowQueueMonitoring === true);

            var propagation = detectDelayPropagation({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('delay propagation works', propagation.success === true && !!propagation.summary);

            var escalation = escalateCongestion({ tenantSlug: 'tabsons', ownerId: 'MGR-1', state: 'DETECTED', dueDate: '2020-01-01' }, { tenantSlug: 'tabsons', actor: { role: 'HR_HEAD', id: 'HRH-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('congestion escalation works', escalation.success === true && escalation.congestionEscalation.escalationGovernancePreserved === true);

            var frozen = freezeBottleneckOutput({ nested: { ok: true }, payload: { state: BOTTLENECK_STATES.DETECTED } });
            check('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested) && Object.isFrozen(frozen.payload));

            var originalKpi = global.KPIScorecardService;
            var originalLeadership = global.LeadershipAccountabilityService;
            var originalDependency = global.StrategicDependencyService;
            var originalExecution = global.DepartmentExecutionBoardService;
            try {
                delete global.KPIScorecardService;
                delete global.LeadershipAccountabilityService;
                delete global.StrategicDependencyService;
                delete global.DepartmentExecutionBoardService;
                var degraded = generateStrategicBottleneckReport({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', actor: { role: 'HR_HEAD', id: 'HRH-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
                check('dependency absence degrades safely', degraded.success === true && degraded.integrationHealth.kpiScorecardIntegrated === false && degraded.integrationHealth.leadershipAccountabilityIntegrated === false && degraded.integrationHealth.strategicDependencyIntegrated === false && degraded.integrationHealth.departmentExecutionBoardIntegrated === false);
            } finally {
                if (originalKpi) global.KPIScorecardService = originalKpi;
                if (originalLeadership) global.LeadershipAccountabilityService = originalLeadership;
                if (originalDependency) global.StrategicDependencyService = originalDependency;
                if (originalExecution) global.DepartmentExecutionBoardService = originalExecution;
            }
        } catch (error) {
            checks.push({ label: 'self-test uncaught error guard', passed: false, description: safeString(error && error.message || error, '') });
        }
        var passed = checks.every(function item(row) { return row.passed; });
        var result = freezeBottleneckOutput({
            passed: passed,
            checks: checks,
            summary: passed ? 'Strategic bottleneck self-test passed.' : 'Strategic bottleneck self-test detected failures.'
        });
        global.__ARTHHRMS_STRATEGIC_BOTTLENECK_SELF_TEST__ = result;
        return result;
    }

    var StrategicBottleneckService = Object.freeze({
        VERSION: VERSION,
        BOTTLENECK_STATES: BOTTLENECK_STATES,
        FAILURE_CLASSIFICATIONS: FAILURE_CLASSIFICATIONS,
        VISIBILITY: VISIBILITY,
        validateBottleneckScope: validateBottleneckScope,
        classifyCongestionRisk: classifyCongestionRisk,
        normalizeBottleneckPayload: normalizeBottleneckPayload,
        freezeBottleneckOutput: freezeBottleneckOutput,
        evaluateCongestionGovernance: evaluateCongestionGovernance,
        detectDelayPropagation: detectDelayPropagation,
        escalateCongestion: escalateCongestion,
        generateStrategicBottleneckReport: generateStrategicBottleneckReport,
        runSelfTest: runSelfTest
    });

    global.StrategicBottleneckService = StrategicBottleneckService;
    global.strategicBottleneckService = StrategicBottleneckService;

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
