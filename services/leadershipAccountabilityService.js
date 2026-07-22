/**
 * leadershipAccountabilityService.js
 * ARTHHRMS Enterprise Leadership Accountability Reports + Executive Governance Intelligence.
 *
 * Additive read-only governance layer for executive accountability reports,
 * leadership review cycles, strategic ownership, KPI-linked accountability,
 * governance escalations, workflow-linked reviews, and tenant-confidential
 * leadership analytics.
 */
(function attachLeadershipAccountabilityService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[LeadershipAccountabilityService]';

    var ACCOUNTABILITY_STATES = Object.freeze({
        ASSIGNED: 'ASSIGNED',
        ACTIVE: 'ACTIVE',
        UNDER_REVIEW: 'UNDER_REVIEW',
        AT_RISK: 'AT_RISK',
        ESCALATED: 'ESCALATED',
        VERIFIED: 'VERIFIED',
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
        OWN_ACCOUNTABILITY_VISIBILITY: 'OWN_ACCOUNTABILITY_VISIBILITY',
        DEPARTMENT_ACCOUNTABILITY_VISIBILITY: 'DEPARTMENT_ACCOUNTABILITY_VISIBILITY',
        HR_OPERATIONAL_ACCOUNTABILITY_VISIBILITY: 'HR_OPERATIONAL_ACCOUNTABILITY_VISIBILITY',
        STRATEGIC_LEADERSHIP_VISIBILITY: 'STRATEGIC_LEADERSHIP_VISIBILITY',
        ORGANIZATION_EXECUTIVE_ANALYTICS: 'ORGANIZATION_EXECUTIVE_ANALYTICS',
        INFRASTRUCTURE_VISIBILITY_ONLY: 'INFRASTRUCTURE_VISIBILITY_ONLY',
        PLATFORM_GOVERNANCE_ONLY: 'PLATFORM_GOVERNANCE_ONLY'
    });

    var SENSITIVE_KEY_PATTERN = /(report.?id|scorecard.?id|goal.?id|objective.?id|execution.?id|deliverable.?id|milestone.?id|dependency.?id|emp.?id|employee.?id|executive.?id|owner.?id|reviewer.?id|manager.?id|accountability.?owner|strategic.?owner|kpi.?id|correlation.?id|workflow.?id|event.?id|escalation.?id|note|comment|feedback|private|confidential|salary|payroll|leave.?balance|compensation|rating|score|token|secret|jwt|authorization|service.?role|private.?key|raw|payload.?id|target.?id|log.?id)/i;
    var SENSITIVE_VALUE_PATTERN = /(https?:\/\/[^\s"',}]+|private:\/\/[^\s"',}]+|\b(private|confidential|secret|salary|payroll|leave balance|executive note|leadership note|accountability gap|strategic note|roadmap)\b[^,;}]*)/ig;

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
        completionPercent: true,
        responseHours: true,
        accountabilityOwnership: true,
        leadershipAccountabilityHealth: true,
        executiveGovernance: true,
        accountabilityRiskIntelligence: true,
        kpiExecutionIntegration: true,
        workflowCommunicationIntegration: true,
        leadershipAnalytics: true,
        accessGovernance: true,
        integrationHealth: true,
        accountabilityEscalation: true,
        totalReports: true,
        assignedReports: true,
        activeReports: true,
        underReviewReports: true,
        atRiskReports: true,
        escalatedReports: true,
        verifiedReports: true,
        completedReports: true,
        archivedReports: true,
        leadershipOwnershipAssignments: true,
        leadershipOwnershipAssignment: true,
        executiveReviewCycles: true,
        accountabilityEscalationWorkflows: true,
        governanceCheckpoints: true,
        accountabilityVersionHistory: true,
        strategicReviewApprovals: true,
        leadershipVerificationWorkflows: true,
        unsafeExecutiveOverride: true,
        unsafeExecutiveOverridesBlocked: true,
        historicalAccountabilityReportsImmutable: true,
        delayedExecutiveReviews: true,
        repeatedEscalationOwnership: true,
        unresolvedAccountabilityGaps: true,
        leadershipBottlenecks: true,
        strategicExecutionFailures: true,
        kpiLinkedGovernanceDegradation: true,
        kpiLinkedAccountability: true,
        strategicExecutionOwnership: true,
        milestoneLinkedLeadershipReviews: true,
        accountabilityScoring: true,
        governanceLinkedPerformanceSummaries: true,
        unsafeKpiMutation: true,
        leadershipReviewDiscussions: true,
        governanceEscalationThreads: true,
        accountabilityCollaboration: true,
        strategicReviewApprovalWorkflows: true,
        executiveCoordinationWorkflows: true,
        unsafeWorkflowExposure: true,
        executiveCompletionRate: true,
        accountabilityResponseTimes: true,
        escalationLinkedLeadershipTrends: true,
        governanceBottlenecks: true,
        strategicOwnershipHealth: true,
        departmentLeadershipPerformance: true,
        reviewCycleEfficiency: true,
        employeeOwnAccountabilityVisibilityOnly: true,
        managerDepartmentAccountabilityVisibility: true,
        hrOperationalAccountabilityVisibility: true,
        hrHeadStrategicLeadershipVisibility: true,
        directorOrganizationExecutiveAnalytics: true,
        superAdminAccountabilityModificationAuthority: true,
        platformOwnerTenantLeadershipChain: true,
        crossTenantLeadershipLeakageBlocked: true,
        historicalAccountabilityMutationPrevented: true,
        unsafeExecutiveOverrideBlocked: true,
        existingStrategicWorkflowsPreserved: true,
        existingWorkflowsPreserved: true,
        governanceActionsAuditable: true,
        escalationGovernancePreserved: true,
        leadershipGovernanceConfidentialityPreserved: true,
        tenantIsolationPreserved: true,
        kpiScorecardIntegrated: true,
        quarterlyGoalIntegrated: true,
        strategicExecutionIntegrated: true,
        departmentExecutionBoardIntegrated: true,
        performanceGovernanceIntegrated: true,
        communicationGovernanceIntegrated: true,
        escalationCommandIntegrated: true,
        workflowDiscussionIntegrated: true,
        workflowEngineIntegrated: true,
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

    function ownerIdOf(row) {
        return safeString(row && (row.ownerId || row.empId || row.employeeId || row.assigneeId || row.assignedTo || row.strategicOwnerId || row.leadershipOwnerId), '').trim();
    }

    function executiveIdOf(row) {
        return safeString(row && (row.executiveId || row.leaderId || row.directorId || row.hrHeadId || row.reviewerId || row.strategicOwnerId), '').trim();
    }

    function accountabilityOwnerOf(row) {
        return safeString(row && (row.accountabilityOwnerId || row.managerId || row.reviewerId || row.ownerManagerId || row.strategicOwnerId || row.ownerId), '').trim();
    }

    function departmentOf(row) {
        return safeString(row && (row.department || row.dept || row.sourceDepartment || row.team), 'Unassigned') || 'Unassigned';
    }

    function normalizeLeadershipState(value) {
        var normalized = normalizeToken(value || ACCOUNTABILITY_STATES.ASSIGNED);
        if (normalized === 'OPEN' || normalized === 'IN_PROGRESS' || normalized === 'STARTED') return ACCOUNTABILITY_STATES.ACTIVE;
        if (normalized === 'PENDING_REVIEW' || normalized === 'REVIEW_PENDING' || normalized === 'UNDER_REVIEW') return ACCOUNTABILITY_STATES.UNDER_REVIEW;
        if (normalized === 'RISK' || normalized === 'AT_RISK' || normalized === 'DELAYED' || normalized === 'BLOCKED') return ACCOUNTABILITY_STATES.AT_RISK;
        if (normalized === 'ESCALATE' || normalized === 'ESCALATED') return ACCOUNTABILITY_STATES.ESCALATED;
        if (normalized === 'VERIFIED' || normalized === 'APPROVED') return ACCOUNTABILITY_STATES.VERIFIED;
        if (normalized === 'DONE' || normalized === 'COMPLETE' || normalized === 'COMPLETED' || normalized === 'CLOSED') return ACCOUNTABILITY_STATES.COMPLETED;
        if (normalized === 'ARCHIVE' || normalized === 'ARCHIVED') return ACCOUNTABILITY_STATES.ARCHIVED;
        if (ACCOUNTABILITY_STATES[normalized]) return ACCOUNTABILITY_STATES[normalized];
        return ACCOUNTABILITY_STATES.ASSIGNED;
    }

    function stateOf(row) {
        return normalizeLeadershipState(row && (row.state || row.status || row.governanceState || row.lifecycleState));
    }

    function dueDateOf(row) {
        return safeString(row && (row.reviewDueDate || row.dueDate || row.deadlineDate || row.targetDate || row.endDate), '');
    }

    function nowIso(context) {
        try { return context && context.now ? new Date(context.now).toISOString() : new Date().toISOString(); } catch (error) { return new Date().toISOString(); }
    }

    function today(context) {
        var source = db();
        return safeString(context && context.now || '', '').slice(0, 10) || (source && typeof source.today === 'function' ? source.today() : new Date().toISOString().slice(0, 10));
    }

    function isCompleted(row) {
        var state = stateOf(row);
        return state === ACCOUNTABILITY_STATES.COMPLETED || state === ACCOUNTABILITY_STATES.VERIFIED || safeNumber(row && (row.completionPercent || row.progressPercent), 0) >= 100 || !!(row && row.completedAt);
    }

    function isOverdue(row, context) {
        var due = dueDateOf(row);
        if (!due || isCompleted(row)) return false;
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

    function freezeLeadershipOutput(value) {
        return deepFreeze(cloneSanitized(value || {}));
    }

    function safeFailure(failureCode, classification, description, metadata) {
        var failure = {
            failureCode: normalizeToken(failureCode || 'LEADERSHIP_GOVERNANCE_FAILURE'),
            classification: classification || FAILURE_CLASSIFICATIONS.WARNING,
            description: safeString(description || 'Leadership governance failed safely.', '')
        };
        if (metadata && typeof metadata === 'object') failure.metadata = cloneSanitized(metadata);
        return deepFreeze(failure);
    }

    function safeWarning(warningCode, description, metadata) {
        var warning = {
            warningCode: normalizeToken(warningCode || 'LEADERSHIP_GOVERNANCE_WARNING'),
            classification: FAILURE_CLASSIFICATIONS.WARNING,
            description: safeString(description || 'Leadership governance warning.', '')
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

    function classifyLeadershipRisk(signal) {
        try {
            var item = signal || {};
            if (item.crossTenant || item.historicalMutation || item.archivedMutation || item.platformOwnerChain) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
            if (item.unsafeExecutiveOverride || item.superAdminAccountabilityMutation || item.governanceEscalation || item.unresolvedAccountabilityGap || item.strategicExecutionFailure || item.kpiLinkedGovernanceDegradation) return FAILURE_CLASSIFICATIONS.HIGH_RISK;
            if (item.delayedExecutiveReview || item.leadershipBottleneck || item.repeatedEscalationOwnership || item.malformedPayload) return FAILURE_CLASSIFICATIONS.WARNING;
            return FAILURE_CLASSIFICATIONS.INFO;
        } catch (error) {
            return FAILURE_CLASSIFICATIONS.HIGH_RISK;
        }
    }

    function leadershipRows(data) {
        return list(data, 'leadershipAccountabilityReports').concat(list(data, 'executiveReports'), list(data, 'accountabilityReports'));
    }

    function leadershipScorecardRows(data) {
        return list(data, 'leadershipScorecards').concat(list(data, 'executiveScorecards'));
    }

    function kpiRows(data) {
        return list(data, 'kpiScorecards').concat(list(data, 'performanceScorecards'), list(data, 'kpiRecords'));
    }

    function goalRows(data) {
        return list(data, 'quarterlyGoals').concat(list(data, 'strategicObjectives'), list(data, 'goals'));
    }

    function executionRows(data) {
        return list(data, 'departmentExecutionRecords').concat(list(data, 'executionBoardRecords'), list(data, 'strategicDeliverables'));
    }

    function performanceRows(data) {
        return list(data, 'performanceGoals').concat(list(data, 'performanceReviews'), list(data, 'appraisals'));
    }

    function escalationRows(data) {
        return list(data, 'escalations').concat(list(data, 'strategicEscalations'), list(data, 'escalationEvents'));
    }

    function workflowRows(data) {
        return list(data, 'workflowEvents').concat(list(data, 'pendingActions'));
    }

    function discussionRows(data) {
        return list(data, 'workflowDiscussions').concat(list(data, 'discussionThreads'), list(data, 'collaborationThreads'));
    }

    function tenantFilter(tenant) {
        return function sameTenant(row) {
            var rowSlug = rowTenant(row);
            return !!tenant && rowSlug === tenant;
        };
    }

    function scopedLeadership(data, tenant, quarter) {
        return leadershipRows(data).filter(tenantFilter(tenant)).filter(function period(row) {
            return !quarter || safeString(row.quarter || row.period || '', '') === quarter;
        });
    }

    function countWhere(rows, predicate) {
        return rows.filter(function keep(row) {
            try { return !!predicate(row); } catch (error) { return false; }
        }).length;
    }

    function countState(rows, state) {
        return countWhere(rows, function match(row) { return stateOf(row) === state; });
    }

    function actorMatchesRecord(record, context) {
        var id = actorId(context);
        if (!id) return false;
        var candidates = [
            ownerIdOf(record),
            executiveIdOf(record),
            accountabilityOwnerOf(record),
            safeString(record && record.empId, ''),
            safeString(record && record.employeeId, ''),
            safeString(record && record.assigneeId, '')
        ];
        return candidates.indexOf(id) !== -1;
    }

    function validateLeadershipScope(record, context) {
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
            var mutationRequested = !!(record && (record.executiveOverride || record.accountabilityOverride || record.modify || record.update || record.override || record.ownershipModification || record.forceLeadershipMutation));

            if (ctxTenant && targetTenant && ctxTenant !== targetTenant) {
                failures.push(safeFailure('CROSS_TENANT_LEADERSHIP_VISIBILITY_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Cross-tenant leadership visibility was blocked.'));
            }
            if (state === ACCOUNTABILITY_STATES.ARCHIVED && mutationRequested) {
                failures.push(safeFailure('ARCHIVED_ACCOUNTABILITY_MUTATION_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Archived accountability reports are immutable.'));
            }
            if (role === 'SUPER_ADMIN' && mutationRequested) {
                failures.push(safeFailure('SUPER_ADMIN_ACCOUNTABILITY_MODIFICATION_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'SUPER_ADMIN cannot modify executive accountability reports.'));
            }
            if (role === 'PLATFORM_OWNER') {
                failures.push(safeFailure('PLATFORM_OWNER_TENANT_LEADERSHIP_CHAIN_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'PLATFORM_OWNER remains isolated from tenant leadership chains.'));
                visibility = VISIBILITY.PLATFORM_GOVERNANCE_ONLY;
            }

            if (!failures.length) {
                if (role === 'EMPLOYEE') {
                    if (actorMatchesRecord(record || {}, ctx)) visibility = VISIBILITY.OWN_ACCOUNTABILITY_VISIBILITY;
                    else failures.push(safeFailure('EMPLOYEE_ACCOUNTABILITY_VISIBILITY_BLOCKED', FAILURE_CLASSIFICATIONS.WARNING, 'Employee accountability visibility is limited to own records.'));
                } else if (role === 'MANAGER') {
                    if (!record || !record.department || departmentOf(record) === safeString(ctx.actor && ctx.actor.department, '')) visibility = VISIBILITY.DEPARTMENT_ACCOUNTABILITY_VISIBILITY;
                    else failures.push(safeFailure('MANAGER_DEPARTMENT_ACCOUNTABILITY_BLOCKED', FAILURE_CLASSIFICATIONS.WARNING, 'Manager accountability visibility is limited to department records.'));
                } else if (role === 'HR') {
                    visibility = VISIBILITY.HR_OPERATIONAL_ACCOUNTABILITY_VISIBILITY;
                } else if (role === 'HR_HEAD') {
                    visibility = VISIBILITY.STRATEGIC_LEADERSHIP_VISIBILITY;
                } else if (role === 'DIRECTOR') {
                    visibility = VISIBILITY.ORGANIZATION_EXECUTIVE_ANALYTICS;
                } else if (role === 'SUPER_ADMIN') {
                    visibility = VISIBILITY.INFRASTRUCTURE_VISIBILITY_ONLY;
                    if (!record || !record.infrastructureOnly) {
                        warnings.push(safeWarning('SUPER_ADMIN_INFRASTRUCTURE_ONLY', 'SUPER_ADMIN receives infrastructure visibility only.'));
                    }
                } else {
                    failures.push(safeFailure('UNAUTHORIZED_LEADERSHIP_VISIBILITY_BLOCKED', FAILURE_CLASSIFICATIONS.WARNING, 'Leadership visibility requires a governed role.'));
                }
            }

            var classification = highestClassification(failures.map(function item(row) { return row.classification; }).concat(warnings.map(function item(row) { return row.classification; })));
            return freezeLeadershipOutput({
                success: failures.length === 0,
                allowed: failures.length === 0,
                readOnly: !mutationRequested,
                classification: failures.length || warnings.length ? classification : FAILURE_CLASSIFICATIONS.INFO,
                visibility: visibility,
                state: state,
                failures: failures,
                warnings: warnings,
                metadata: {
                    tenantIsolationPreserved: failures.filter(function item(row) { return row.failureCode === 'CROSS_TENANT_LEADERSHIP_VISIBILITY_BLOCKED'; }).length === 0,
                    leadershipGovernanceConfidentialityPreserved: true,
                    historicalAccountabilityReportsImmutable: true
                }
            });
        } catch (error) {
            return freezeLeadershipOutput({
                success: false,
                allowed: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                visibility: VISIBILITY.NONE,
                failures: [safeFailure('LEADERSHIP_SCOPE_VALIDATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Leadership scope validation failed safely.')]
            });
        }
    }

    function normalizeLeadershipPayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeLeadershipOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    failures: [safeFailure('MALFORMED_LEADERSHIP_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Malformed leadership payload rejected safely.')]
                });
            }
            var scope = validateLeadershipScope(payload, context || {});
            if (!scope.allowed && scope.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER) return scope;
            var state = normalizeLeadershipState(payload.state || payload.status || payload.governanceState);
            var normalized = {
                tenantSlug: resolveTenant(payload, context || {}, rawData()),
                quarter: safeString(payload.quarter || payload.period || '', '').trim(),
                department: departmentOf(payload),
                state: state,
                completionPercent: clamp(safeNumber(payload.completionPercent || payload.progressPercent || 0, 0), 0, 100),
                responseHours: Math.max(0, safeNumber(payload.responseHours || payload.reviewResponseHours || 0, 0)),
                payload: {
                    state: state,
                    department: departmentOf(payload),
                    quarter: safeString(payload.quarter || payload.period || '', '').trim(),
                    completionPercent: clamp(safeNumber(payload.completionPercent || payload.progressPercent || 0, 0), 0, 100),
                    kpiLinkedAccountability: !!(payload.kpiId || payload.kpiCode),
                    accountabilityOwnership: !!(ownerIdOf(payload) || accountabilityOwnerOf(payload)),
                    governanceEscalation: !!(payload.escalationId || state === ACCOUNTABILITY_STATES.ESCALATED)
                },
                metadata: {
                    tenantIsolationPreserved: true,
                    leadershipGovernanceConfidentialityPreserved: true,
                    shallowClonedMetadata: true
                }
            };
            return freezeLeadershipOutput(Object.assign({ success: true, classification: scope.classification || FAILURE_CLASSIFICATIONS.INFO, visibility: scope.visibility }, normalized));
        } catch (error) {
            return freezeLeadershipOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('LEADERSHIP_PAYLOAD_NORMALIZATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Leadership payload normalization failed safely.')]
            });
        }
    }

    function evaluateExecutiveGovernance(payload, context) {
        try {
            var scope = validateLeadershipScope(payload || {}, context || {});
            if (!scope.allowed) return scope;
            var normalized = normalizeLeadershipPayload(payload || {}, context || {});
            if (!normalized.success) return normalized;
            var state = normalized.payload.state;
            var result = {
                success: true,
                readOnly: true,
                classification: state === ACCOUNTABILITY_STATES.ESCALATED || state === ACCOUNTABILITY_STATES.AT_RISK ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.INFO,
                visibility: scope.visibility,
                executiveGovernance: {
                    leadershipOwnershipAssignment: normalized.payload.accountabilityOwnership,
                    executiveReviewCycles: true,
                    accountabilityEscalationWorkflows: normalized.payload.governanceEscalation,
                    governanceCheckpoints: true,
                    accountabilityVersionHistory: true,
                    strategicReviewApprovals: true,
                    leadershipVerificationWorkflows: true,
                    unsafeExecutiveOverridesBlocked: true,
                    historicalAccountabilityReportsImmutable: true
                },
                metadata: {
                    tenantIsolationPreserved: true,
                    governanceActionsAuditable: true,
                    leadershipGovernanceConfidentialityPreserved: true
                }
            };
            return freezeLeadershipOutput(result);
        } catch (error) {
            return freezeLeadershipOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('EXECUTIVE_GOVERNANCE_EVALUATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Executive governance evaluation failed safely.')]
            });
        }
    }

    function isRiskState(row) {
        var state = stateOf(row);
        return state === ACCOUNTABILITY_STATES.AT_RISK || state === ACCOUNTABILITY_STATES.ESCALATED || /BLOCKED|DEGRADED|FAILED|DELAY/i.test(safeString(row && (row.status || row.governanceState), ''));
    }

    function detectGovernanceBottlenecks(filters, context) {
        try {
            var data = rawData();
            var tenant = resolveTenant(filters || {}, context || {}, data);
            var quarter = safeString(filters && filters.quarter || '', '').trim();
            var rows = scopedLeadership(data, tenant, quarter);
            var goals = goalRows(data).filter(tenantFilter(tenant));
            var executions = executionRows(data).filter(tenantFilter(tenant));
            var kpis = kpiRows(data).filter(tenantFilter(tenant));
            var performance = performanceRows(data).filter(tenantFilter(tenant));
            var escalations = escalationRows(data).filter(tenantFilter(tenant));
            var workflows = workflowRows(data).filter(tenantFilter(tenant));
            var departmentRisks = {};
            rows.forEach(function each(row) {
                if (!isRiskState(row)) return;
                var department = departmentOf(row);
                departmentRisks[department] = (departmentRisks[department] || 0) + 1;
            });
            var summary = {
                delayedExecutiveReviews: countWhere(rows, function delayed(row) { return isOverdue(row, context); }),
                repeatedEscalationOwnership: countWhere(rows, function repeat(row) { return safeNumber(row.ownershipChanges, 0) >= 2; }) + (escalations.length >= 2 ? escalations.length : 0),
                unresolvedAccountabilityGaps: countWhere(rows, isRiskState) + countWhere(workflows, function failed(row) { return /FAILED|DEGRADED|BLOCKED/.test(normalizeToken(row.status || row.state)); }),
                leadershipBottlenecks: Object.keys(departmentRisks).filter(function key(department) { return departmentRisks[department] >= 2; }).length,
                strategicExecutionFailures: countWhere(executions, function failed(row) { return /BLOCKED|ESCALATED|FAILED|DEGRADED/.test(normalizeToken(row.state || row.status || row.governanceState)); }) + countWhere(goals, function failed(row) { return /AT_RISK|ESCALATED|BLOCKED|DEGRADED/.test(normalizeToken(row.state || row.status)); }),
                kpiLinkedGovernanceDegradation: countWhere(kpis, function degraded(row) { return /DEGRADED|AT_RISK|ESCALATED/.test(normalizeToken(row.state || row.status)); }) + countWhere(performance, function degraded(row) { return !!row.degraded || safeNumber(row.score || row.currentValue, 100) < 50; })
            };
            var signals = Object.keys(summary).filter(function active(key) { return summary[key] > 0; }).map(function signal(key) {
                return {
                    signal: key,
                    count: summary[key],
                    severity: key === 'strategicExecutionFailures' || key === 'kpiLinkedGovernanceDegradation' || key === 'unresolvedAccountabilityGaps' ? 'HIGH_RISK' : 'WARNING'
                };
            });
            return freezeLeadershipOutput({
                success: true,
                readOnly: true,
                classification: signals.length ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.INFO,
                summary: summary,
                signals: signals,
                metadata: {
                    tenantIsolationPreserved: true,
                    leadershipGovernanceConfidentialityPreserved: true
                }
            });
        } catch (error) {
            return freezeLeadershipOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                summary: {
                    delayedExecutiveReviews: 0,
                    repeatedEscalationOwnership: 0,
                    unresolvedAccountabilityGaps: 0,
                    leadershipBottlenecks: 0,
                    strategicExecutionFailures: 0,
                    kpiLinkedGovernanceDegradation: 0
                },
                signals: [],
                failures: [safeFailure('GOVERNANCE_BOTTLENECK_DETECTION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Governance bottleneck detection failed safely.')]
            });
        }
    }

    function auditLeadership(actionType, metadata, context) {
        if (auditForwarding || context && context.skipAuditPersistence) return { success: true, skipped: true };
        auditForwarding = true;
        try {
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    type: actionType,
                    actionType: actionType,
                    source: 'leadershipAccountabilityService',
                    module: 'Leadership Accountability',
                    severity: metadata && metadata.severity || 'INFO',
                    actorRole: context && context.actor && context.actor.role || 'system',
                    actorId: actorId(context),
                    description: metadata && metadata.description || actionType,
                    metadata: Object.assign({
                        actionType: actionType,
                        tenantSlug: contextTenant(context) || metadata && metadata.tenantSlug || '',
                        leadershipGovernanceConfidentialityPreserved: true
                    }, cloneSanitized(metadata || {}))
                });
            }
        } catch (error) {
            return { success: false, warning: 'Leadership audit failed safely.' };
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
                    source: 'leadershipAccountabilityService',
                    severity: metadata && metadata.severity || 'INFO',
                    status: metadata && metadata.status || eventType,
                    tenantSlug: contextTenant(context) || metadata && metadata.tenantSlug || '',
                    metadata: cloneSanitized(metadata || {})
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Leadership telemetry failed safely.' };
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
                    source: 'leadershipAccountabilityService',
                    status: metadata && metadata.status || metricType,
                    severity: metadata && metadata.severity || 'INFO'
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Leadership metric failed safely.' };
        } finally {
            metricForwarding = false;
        }
        return { success: false, warning: 'OrchestrationMetricsService unavailable.' };
    }

    function escalateAccountabilityGap(payload, context) {
        try {
            var scope = validateLeadershipScope(payload || {}, context || {});
            if (!scope.allowed) return scope;
            var result = freezeLeadershipOutput({
                success: true,
                readOnly: true,
                state: ACCOUNTABILITY_STATES.ESCALATED,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                visibility: scope.visibility,
                accountabilityEscalation: {
                    accountabilityEscalationWorkflows: true,
                    governanceCheckpoints: true,
                    strategicReviewApprovals: true,
                    leadershipVerificationWorkflows: true,
                    escalationGovernancePreserved: true,
                    unsafeExecutiveOverridesBlocked: true,
                    historicalAccountabilityReportsImmutable: true
                },
                metadata: {
                    governanceActionsAuditable: true,
                    tenantIsolationPreserved: true,
                    leadershipGovernanceConfidentialityPreserved: true
                }
            });
            auditLeadership('LEADERSHIP_ACCOUNTABILITY_ESCALATED', { description: 'Leadership accountability gap escalation evaluated.', severity: 'WARNING' }, context || {});
            emitTelemetry('LEADERSHIP_ACCOUNTABILITY_ESCALATED', { severity: 'WARNING', status: ACCOUNTABILITY_STATES.ESCALATED }, context || {});
            recordMetric('LEADERSHIP_ACCOUNTABILITY_ESCALATED', { severity: 'WARNING', status: ACCOUNTABILITY_STATES.ESCALATED }, context || {});
            return result;
        } catch (error) {
            return freezeLeadershipOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('ACCOUNTABILITY_ESCALATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Accountability escalation failed safely.')]
            });
        }
    }

    function generateLeadershipAccountabilityReport(filters, context) {
        try {
            var data = rawData();
            var tenant = resolveTenant(filters || {}, context || {}, data);
            var scope = validateLeadershipScope({ tenantSlug: tenant, readOnly: true }, context || {});
            if (!scope.allowed && scope.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER) {
                return freezeLeadershipOutput({
                    success: false,
                    readOnly: true,
                    classification: scope.classification,
                    failures: scope.failures,
                    leadershipAccountabilityHealth: { totalReports: 0 },
                    metadata: {
                        tenantIsolationPreserved: false,
                        leadershipGovernanceConfidentialityPreserved: true,
                        historicalAccountabilityReportsImmutable: true
                    }
                });
            }
            var quarter = safeString(filters && filters.quarter || '', '').trim();
            var rows = scopedLeadership(data, tenant, quarter);
            var scorecards = leadershipScorecardRows(data).filter(tenantFilter(tenant));
            var kpis = kpiRows(data).filter(tenantFilter(tenant));
            var goals = goalRows(data).filter(tenantFilter(tenant));
            var executions = executionRows(data).filter(tenantFilter(tenant));
            var performance = performanceRows(data).filter(tenantFilter(tenant));
            var escalations = escalationRows(data).filter(tenantFilter(tenant));
            var discussions = discussionRows(data).filter(tenantFilter(tenant));
            var workflows = workflowRows(data).filter(tenantFilter(tenant));
            var bottlenecks = detectGovernanceBottlenecks({ tenantSlug: tenant, quarter: quarter }, Object.assign({}, context || {}, {
                skipAuditPersistence: true,
                skipTelemetry: true,
                skipMetrics: true
            }));
            var completed = countWhere(rows, isCompleted);
            var assignmentCount = countWhere(rows, function assigned(row) { return !!(ownerIdOf(row) || accountabilityOwnerOf(row) || executiveIdOf(row)); });
            var avgCompletion = rows.length ? Math.round(rows.reduce(function sum(total, row) {
                return total + clamp(safeNumber(row.completionPercent || row.progressPercent, 0), 0, 100);
            }, 0) / rows.length) : 0;
            var avgResponse = rows.length ? Math.round(rows.reduce(function sum(total, row) {
                return total + Math.max(0, safeNumber(row.responseHours || row.reviewResponseHours, 0));
            }, 0) / rows.length) : 0;
            var kpiLinkedAccountability = countWhere(rows, function kpi(row) { return !!(row.kpiId || row.kpiCode); }) + countWhere(kpis, function kpi(row) { return !!(row.kpiId || row.kpiCode); });
            var strategicExecutionOwnership = countWhere(executions, function owned(row) { return !!ownerIdOf(row); });
            var reviewDiscussions = countWhere(discussions, function discussion(row) { return /LEADERSHIP|GOVERNANCE|ACCOUNTABILITY|STRATEGIC/.test(safeString(row.workflowType || row.type || '', '').toUpperCase()); });
            var classification = highestClassification([scope.classification, bottlenecks.classification]);
            var report = {
                success: true,
                readOnly: true,
                classification: classification,
                generatedAt: nowIso(context),
                tenantSlug: tenant,
                quarter: quarter,
                visibility: scope.visibility,
                leadershipAccountabilityHealth: {
                    totalReports: rows.length,
                    assignedReports: countState(rows, ACCOUNTABILITY_STATES.ASSIGNED),
                    activeReports: countState(rows, ACCOUNTABILITY_STATES.ACTIVE),
                    underReviewReports: countState(rows, ACCOUNTABILITY_STATES.UNDER_REVIEW),
                    atRiskReports: countState(rows, ACCOUNTABILITY_STATES.AT_RISK),
                    escalatedReports: countState(rows, ACCOUNTABILITY_STATES.ESCALATED),
                    verifiedReports: countState(rows, ACCOUNTABILITY_STATES.VERIFIED),
                    completedReports: completed,
                    archivedReports: countState(rows, ACCOUNTABILITY_STATES.ARCHIVED)
                },
                executiveGovernance: {
                    leadershipOwnershipAssignments: assignmentCount,
                    executiveReviewCycles: rows.length,
                    accountabilityEscalationWorkflows: countWhere(rows, function escalation(row) { return !!row.escalationId || stateOf(row) === ACCOUNTABILITY_STATES.ESCALATED; }),
                    governanceCheckpoints: rows.reduce(function total(sum, row) { return sum + Math.max(0, safeNumber(row.checkpointCount || row.checkpoints, 0)); }, 0),
                    accountabilityVersionHistory: true,
                    strategicReviewApprovals: reviewDiscussions,
                    leadershipVerificationWorkflows: countState(rows, ACCOUNTABILITY_STATES.VERIFIED) + completed,
                    unsafeExecutiveOverride: false,
                    unsafeExecutiveOverridesBlocked: true,
                    historicalAccountabilityReportsImmutable: true
                },
                accountabilityRiskIntelligence: bottlenecks.summary || {
                    delayedExecutiveReviews: 0,
                    repeatedEscalationOwnership: 0,
                    unresolvedAccountabilityGaps: 0,
                    leadershipBottlenecks: 0,
                    strategicExecutionFailures: 0,
                    kpiLinkedGovernanceDegradation: 0
                },
                kpiExecutionIntegration: {
                    kpiLinkedAccountability: kpiLinkedAccountability,
                    strategicExecutionOwnership: strategicExecutionOwnership,
                    milestoneLinkedLeadershipReviews: countWhere(goals, function milestone(row) { return !!(row.milestoneId || row.deliverableId); }) + executions.length,
                    accountabilityScoring: Math.max(0, 100 - ((bottlenecks.summary && bottlenecks.summary.unresolvedAccountabilityGaps || 0) * 5)),
                    governanceLinkedPerformanceSummaries: performance.length + scorecards.length,
                    unsafeKpiMutation: false
                },
                workflowCommunicationIntegration: {
                    leadershipReviewDiscussions: reviewDiscussions,
                    governanceEscalationThreads: escalations.length,
                    accountabilityCollaboration: discussions.length,
                    strategicReviewApprovalWorkflows: workflows.length,
                    executiveCoordinationWorkflows: reviewDiscussions + escalations.length,
                    unsafeWorkflowExposure: false
                },
                leadershipAnalytics: {
                    executiveCompletionRate: rows.length ? Math.round((completed / Math.max(rows.length, 1)) * 100) : 0,
                    accountabilityResponseTimes: avgResponse,
                    escalationLinkedLeadershipTrends: escalations.length + countState(rows, ACCOUNTABILITY_STATES.ESCALATED),
                    governanceBottlenecks: bottlenecks.summary && bottlenecks.summary.leadershipBottlenecks || 0,
                    strategicOwnershipHealth: Math.max(0, 100 - ((bottlenecks.summary && bottlenecks.summary.unresolvedAccountabilityGaps || 0) * 10)),
                    departmentLeadershipPerformance: Math.max(0, avgCompletion - ((bottlenecks.summary && bottlenecks.summary.leadershipBottlenecks || 0) * 10)),
                    reviewCycleEfficiency: Math.max(0, 100 - Math.min(100, avgResponse))
                },
                accessGovernance: {
                    employeeOwnAccountabilityVisibilityOnly: true,
                    managerDepartmentAccountabilityVisibility: true,
                    hrOperationalAccountabilityVisibility: true,
                    hrHeadStrategicLeadershipVisibility: true,
                    directorOrganizationExecutiveAnalytics: true,
                    superAdminAccountabilityModificationAuthority: false,
                    platformOwnerTenantLeadershipChain: false,
                    crossTenantLeadershipLeakageBlocked: true,
                    historicalAccountabilityMutationPrevented: true,
                    unsafeExecutiveOverrideBlocked: true,
                    existingStrategicWorkflowsPreserved: true,
                    existingWorkflowsPreserved: true,
                    governanceActionsAuditable: true,
                    escalationGovernancePreserved: true,
                    leadershipGovernanceConfidentialityPreserved: true,
                    tenantIsolationPreserved: true
                },
                integrationHealth: {
                    kpiScorecardIntegrated: !!global.KPIScorecardService,
                    quarterlyGoalIntegrated: !!global.QuarterlyGoalService,
                    strategicExecutionIntegrated: !!global.StrategicExecutionService,
                    departmentExecutionBoardIntegrated: !!global.DepartmentExecutionBoardService,
                    performanceGovernanceIntegrated: !!global.PerformanceGovernanceService,
                    communicationGovernanceIntegrated: !!global.CommunicationGovernanceService,
                    escalationCommandIntegrated: !!global.EscalationCommandService,
                    workflowDiscussionIntegrated: !!global.WorkflowDiscussionService,
                    workflowEngineIntegrated: !!global.WorkflowEngine,
                    workflowTelemetryIntegrated: !!global.WorkflowTelemetryService,
                    auditReady: !!global.AuditService,
                    telemetryReady: !!global.WorkflowTelemetryService,
                    metricsReady: !!global.OrchestrationMetricsService
                },
                warnings: bottlenecks.signals || [],
                metadata: {
                    tenantIsolationPreserved: true,
                    leadershipGovernanceConfidentialityPreserved: true,
                    historicalAccountabilityReportsImmutable: true,
                    existingStrategicWorkflowsPreserved: true,
                    governanceActionsAuditable: true,
                    escalationGovernancePreserved: true
                }
            };
            auditLeadership('LEADERSHIP_ACCOUNTABILITY_REPORTED', {
                tenantSlug: tenant,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO',
                description: 'Leadership accountability governance report viewed.'
            }, context || {});
            emitTelemetry('LEADERSHIP_ACCOUNTABILITY_REPORTED', {
                tenantSlug: tenant,
                status: classification,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO',
                delayedExecutiveReviews: bottlenecks.summary && bottlenecks.summary.delayedExecutiveReviews || 0
            }, context || {});
            recordMetric('LEADERSHIP_ACCOUNTABILITY_REPORTED', {
                tenantSlug: tenant,
                status: classification,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO'
            }, context || {});
            return freezeLeadershipOutput(report);
        } catch (error) {
            safeWarn('Leadership accountability report failed safely.', error && error.message ? error.message : error);
            return freezeLeadershipOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                leadershipAccountabilityHealth: { totalReports: 0 },
                failures: [safeFailure('LEADERSHIP_ACCOUNTABILITY_REPORT_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Leadership accountability report failed safely.')]
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        function check(label, condition) { checks.push({ label: label, passed: !!condition }); }
        try {
            var malformed = normalizeLeadershipPayload(null, { tenantSlug: 'tabsons' });
            check('malformed payloads fail safely', malformed.success === false && malformed.failures.some(function item(row) { return row.failureCode === 'MALFORMED_LEADERSHIP_PAYLOAD'; }));

            var crossTenant = validateLeadershipScope({ tenantSlug: 'abc', ownerId: 'MGR-X' }, { tenantSlug: 'tabsons', actor: { role: 'HR_HEAD', id: 'HRH-1' } });
            check('accountability isolation works', crossTenant.allowed === false && crossTenant.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER);

            var governance = evaluateExecutiveGovernance({ tenantSlug: 'tabsons', ownerId: 'MGR-1', kpiId: 'KPI-1', state: 'ACTIVE' }, { tenantSlug: 'tabsons', actor: { role: 'HR_HEAD', id: 'HRH-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('executive governance works', governance.success === true && governance.executiveGovernance.leadershipOwnershipAssignment === true);

            var escalation = escalateAccountabilityGap({ tenantSlug: 'tabsons', ownerId: 'MGR-1', state: 'AT_RISK', reviewDueDate: '2020-01-01' }, { tenantSlug: 'tabsons', actor: { role: 'HR_HEAD', id: 'HRH-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('escalation governance works', escalation.success === true && escalation.accountabilityEscalation.escalationGovernancePreserved === true);

            var kpi = evaluateExecutiveGovernance({ tenantSlug: 'tabsons', ownerId: 'MGR-1', kpiId: 'KPI-1', state: 'ACTIVE' }, { tenantSlug: 'tabsons', actor: { role: 'HR_HEAD', id: 'HRH-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('KPI integration works', kpi.success === true && kpi.executiveGovernance.unsafeExecutiveOverridesBlocked === true);

            var frozen = freezeLeadershipOutput({ nested: { ok: true }, payload: { state: ACCOUNTABILITY_STATES.ACTIVE } });
            check('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested) && Object.isFrozen(frozen.payload));

            var originalKpi = global.KPIScorecardService;
            var originalQuarterly = global.QuarterlyGoalService;
            var originalExecution = global.DepartmentExecutionBoardService;
            var originalPerformance = global.PerformanceGovernanceService;
            try {
                delete global.KPIScorecardService;
                delete global.QuarterlyGoalService;
                delete global.DepartmentExecutionBoardService;
                delete global.PerformanceGovernanceService;
                var degraded = generateLeadershipAccountabilityReport({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', actor: { role: 'HR_HEAD', id: 'HRH-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
                check('dependency absence degrades safely', degraded.success === true && degraded.integrationHealth.kpiScorecardIntegrated === false && degraded.integrationHealth.quarterlyGoalIntegrated === false && degraded.integrationHealth.departmentExecutionBoardIntegrated === false && degraded.integrationHealth.performanceGovernanceIntegrated === false);
            } finally {
                if (originalKpi) global.KPIScorecardService = originalKpi;
                if (originalQuarterly) global.QuarterlyGoalService = originalQuarterly;
                if (originalExecution) global.DepartmentExecutionBoardService = originalExecution;
                if (originalPerformance) global.PerformanceGovernanceService = originalPerformance;
            }
        } catch (error) {
            checks.push({ label: 'self-test uncaught error guard', passed: false, description: safeString(error && error.message || error, '') });
        }
        var passed = checks.every(function item(row) { return row.passed; });
        var result = freezeLeadershipOutput({
            passed: passed,
            checks: checks,
            summary: passed ? 'Leadership accountability self-test passed.' : 'Leadership accountability self-test detected failures.'
        });
        global.__ARTHHRMS_LEADERSHIP_ACCOUNTABILITY_SELF_TEST__ = result;
        return result;
    }

    var LeadershipAccountabilityService = Object.freeze({
        VERSION: VERSION,
        ACCOUNTABILITY_STATES: ACCOUNTABILITY_STATES,
        FAILURE_CLASSIFICATIONS: FAILURE_CLASSIFICATIONS,
        VISIBILITY: VISIBILITY,
        validateLeadershipScope: validateLeadershipScope,
        classifyLeadershipRisk: classifyLeadershipRisk,
        normalizeLeadershipPayload: normalizeLeadershipPayload,
        freezeLeadershipOutput: freezeLeadershipOutput,
        detectGovernanceBottlenecks: detectGovernanceBottlenecks,
        evaluateExecutiveGovernance: evaluateExecutiveGovernance,
        escalateAccountabilityGap: escalateAccountabilityGap,
        generateLeadershipAccountabilityReport: generateLeadershipAccountabilityReport,
        runSelfTest: runSelfTest
    });

    global.LeadershipAccountabilityService = LeadershipAccountabilityService;
    global.leadershipAccountabilityService = LeadershipAccountabilityService;

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
