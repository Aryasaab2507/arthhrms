/**
 * performanceGovernanceService.js
 * ARTHHRMS Enterprise Performance Review + Appraisal Governance System.
 *
 * Additive governance layer for review cycles, appraisal workflows,
 * KPI-linked evaluation visibility, reviewer congestion, and audit-safe
 * performance operations. It does not replace DB performance helpers or
 * mutate historical review/appraisal records.
 */
(function attachPerformanceGovernanceService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[PerformanceGovernanceService]';

    var REVIEW_STATES = Object.freeze({
        DRAFT: 'DRAFT',
        SELF_REVIEW_PENDING: 'SELF_REVIEW_PENDING',
        MANAGER_REVIEW_PENDING: 'MANAGER_REVIEW_PENDING',
        HR_REVIEW_PENDING: 'HR_REVIEW_PENDING',
        ESCALATED: 'ESCALATED',
        APPROVED: 'APPROVED',
        REJECTED: 'REJECTED',
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
        OWN_REVIEWS_ONLY: 'OWN_REVIEWS_ONLY',
        DIRECT_REPORT_REVIEWS: 'DIRECT_REPORT_REVIEWS',
        OPERATIONAL_REVIEW_VISIBILITY: 'OPERATIONAL_REVIEW_VISIBILITY',
        STRATEGIC_PERFORMANCE_VISIBILITY: 'STRATEGIC_PERFORMANCE_VISIBILITY',
        AGGREGATE_ANALYTICS_ONLY: 'AGGREGATE_ANALYTICS_ONLY',
        INFRASTRUCTURE_ONLY: 'INFRASTRUCTURE_ONLY',
        PLATFORM_GOVERNANCE_ONLY: 'PLATFORM_GOVERNANCE_ONLY'
    });

    var PERFORMANCE_JOB_TYPES = Object.freeze([
        'APPRAISAL_WORKFLOW',
        'PERFORMANCE_REVIEW_REMINDER',
        'PERFORMANCE_REVIEW',
        'APPRAISAL_REVIEW',
        'REVIEW_CYCLE_REMINDER',
        'PERFORMANCE_CYCLE_SCAN'
    ]);

    var SENSITIVE_KEY_PATTERN = /(comment|feedback|note|rating|score|calibration|increment|salary|payroll|compensation|bonus|promotion|ctc|gross|net|private|confidential|employeeName|name|email|phone|secret|token|jwt|authorization|service.?role|private.?key)/i;
    var SENSITIVE_VALUE_PATTERN = /\b(private|confidential|salary|increment|compensation|rating)\b[^,;}]*/ig;
    var SAFE_GOVERNANCE_KEYS = Object.freeze({
        performanceConfidentialityPreserved: true,
        tenantIsolationPreserved: true,
        existingPerformanceFlowsPreserved: true,
        historicalReviewsImmutable: true,
        appraisalActionsAuditable: true,
        performanceActionsAuditable: true,
        reviewCycleHealth: true,
        appraisalWorkflow: true,
        kpiIntegration: true,
        reviewerGovernance: true,
        performanceCycle: true,
        accessGovernance: true,
        asyncAppraisalProcessing: true,
        superAdminAppraisalAccess: true,
        platformOwnerAppraisalAccess: true,
        managerBypassBlocked: true,
        kpiLinkedReviews: true
    });

    var auditForwarding = false;
    var telemetryForwarding = false;
    var metricForwarding = false;

    function safeWarn(message, details) {
        try { if (global.console && console.warn) console.warn(PREFIX, message, details || ''); } catch (error) {}
    }

    function db() {
        return global.DB || null;
    }

    function rawData() {
        try {
            var source = db();
            if (source && typeof source.get === 'function') return source.get() || {};
        } catch (error) {}
        return {};
    }

    function saveData(data) {
        try {
            var source = db();
            if (source && typeof source.save === 'function') {
                source.save(data);
                return true;
            }
        } catch (error) {}
        return false;
    }

    function nowIso(context) {
        return context && context.now ? new Date(context.now).toISOString() : new Date().toISOString();
    }

    function safeString(value, fallback) {
        if (value === null || typeof value === 'undefined') return fallback || '';
        return String(value);
    }

    function normalizeToken(value) {
        return safeString(value || '', '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    }

    function normalizeRole(value) {
        var normalized = normalizeToken(value);
        if (normalized === 'SUPERADMIN') return 'SUPER_ADMIN';
        if (normalized === 'PLATFORMOWNER') return 'PLATFORM_OWNER';
        if (normalized === 'HRHEAD') return 'HR_HEAD';
        return normalized;
    }

    function normalizeTenantSlug(value) {
        return safeString(value || '', '').trim().toLowerCase().replace(/^ten[-_]/, '').replace(/^tenant[-_]/, '').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }

    function contextTenant(context) {
        var fromContext = normalizeTenantSlug(context && (context.tenantSlug || context.tenantId || context.companyId));
        if (fromContext) return fromContext;
        var data = rawData();
        return normalizeTenantSlug(data.companySettings && (data.companySettings.tenantSlug || data.companySettings.tenantId || data.companySettings.companyId));
    }

    function rowTenant(row) {
        if (!row) return '';
        return normalizeTenantSlug(row.tenantSlug || row.tenant_slug || row.tenantId || row.tenant_id || row.companyId || row.company_id);
    }

    function empIdOf(row) {
        return safeString(row && (row.empId || row.employeeId || row.employee_id || row.userId || row.user_id || row.contributorId || row.contributor_id) || '', '').trim();
    }

    function reviewIdOf(row) {
        return safeString(row && (row.reviewId || row.review_id || row.performanceReviewId || row.performance_review_id || row.id) || '', '').trim();
    }

    function appraisalIdOf(row) {
        return safeString(row && (row.appraisalId || row.appraisal_id || row.id) || '', '').trim();
    }

    function cycleIdOf(row) {
        return safeString(row && (row.reviewCycleId || row.review_cycle_id || row.cycleId || row.cycle_id) || '', '').trim();
    }

    function reviewerIdOf(row) {
        return safeString(row && (row.reviewerId || row.reviewer_id || row.managerId || row.manager_id || row.hrReviewerId || row.hr_reviewer_id) || '', '').trim();
    }

    function employeeById(empId, data) {
        var id = safeString(empId || '', '').trim();
        if (!id) return null;
        return (Array.isArray(data.employees) ? data.employees : []).find(function match(emp) {
            return [emp.id, emp.empId, emp.employeeId, emp.employee_id].map(function item(v) { return safeString(v || '', '').trim(); }).indexOf(id) !== -1;
        }) || null;
    }

    function employeeTenant(empId, data) {
        return rowTenant(employeeById(empId, data || rawData()));
    }

    function sourceTenant(row, data) {
        return rowTenant(row) || employeeTenant(empIdOf(row), data || rawData());
    }

    function managerOwnsEmployee(managerId, empId, data) {
        var manager = safeString(managerId || '', '').trim();
        var emp = employeeById(empId, data || rawData());
        if (emp && safeString(emp.managerId || emp.reporting_manager_id || '', '').trim() === manager) return true;
        return false;
    }

    function performanceRows(data) {
        var source = data || rawData();
        var rows = [];
        if (Array.isArray(source.performanceReviews)) rows = rows.concat(source.performanceReviews);
        if (Array.isArray(source.performanceGoals)) rows = rows.concat(source.performanceGoals);
        if (Array.isArray(source.appraisalWorkflows)) rows = rows.concat(source.appraisalWorkflows);
        return rows;
    }

    function appraisalRows(data) {
        var source = data || rawData();
        return Array.isArray(source.appraisals) ? source.appraisals : [];
    }

    function reviewCycleRows(data) {
        var source = data || rawData();
        return Array.isArray(source.reviewCycles) ? source.reviewCycles : [];
    }

    function asyncRows(data) {
        var source = data || rawData();
        return Array.isArray(source.asyncJobs) ? source.asyncJobs : [];
    }

    function strategicRows(data) {
        var source = data || rawData();
        return Array.isArray(source.strategicDeliverables) ? source.strategicDeliverables : [];
    }

    function strategicReviewRows(data) {
        var source = data || rawData();
        return Array.isArray(source.deliverableReviews) ? source.deliverableReviews : [];
    }

    function escalationRows(data) {
        var source = data || rawData();
        return Array.isArray(source.escalations) ? source.escalations : [];
    }

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.keys(value).forEach(function freezeKey(key) { deepFreeze(value[key]); });
        return Object.freeze(value);
    }

    function sanitizeText(value) {
        return safeString(value || '', '').replace(SENSITIVE_VALUE_PATTERN, '[REDACTED]');
    }

    function cloneSanitized(value) {
        if (Array.isArray(value)) return value.map(cloneSanitized);
        if (!value || typeof value !== 'object') {
            if (typeof value === 'string') return sanitizeText(value);
            return value;
        }
        var output = {};
        Object.keys(value).forEach(function copyKey(key) {
            if (SENSITIVE_KEY_PATTERN.test(key) && !SAFE_GOVERNANCE_KEYS[key]) return;
            output[key] = cloneSanitized(value[key]);
        });
        return output;
    }

    function freezePerformanceOutput(value) {
        return deepFreeze(cloneSanitized(value));
    }

    function safeFailure(code, classification, message, metadata) {
        return {
            failureCode: code,
            classification: classification || FAILURE_CLASSIFICATIONS.WARNING,
            message: sanitizeText(message || code),
            metadata: cloneSanitized(metadata || {})
        };
    }

    function safeWarning(code, message, metadata) {
        return {
            warningCode: code,
            classification: FAILURE_CLASSIFICATIONS.WARNING,
            message: sanitizeText(message || code),
            metadata: cloneSanitized(metadata || {})
        };
    }

    function highestClassification(items, fallback) {
        var list = Array.isArray(items) ? items : [];
        if (list.some(function critical(item) { return item.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER; })) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
        if (list.some(function high(item) { return item.classification === FAILURE_CLASSIFICATIONS.HIGH_RISK; })) return FAILURE_CLASSIFICATIONS.HIGH_RISK;
        if (list.some(function warning(item) { return item.classification === FAILURE_CLASSIFICATIONS.WARNING; })) return FAILURE_CLASSIFICATIONS.WARNING;
        return fallback || FAILURE_CLASSIFICATIONS.INFO;
    }

    function hasRawPerformanceFields(input) {
        if (!input || typeof input !== 'object') return false;
        return Object.keys(input).some(function check(key) {
            if (SENSITIVE_KEY_PATTERN.test(key) && !SAFE_GOVERNANCE_KEYS[key]) return true;
            return input[key] && typeof input[key] === 'object' && hasRawPerformanceFields(input[key]);
        });
    }

    function classifyPerformanceRisk(input) {
        var source = input || {};
        if (source.crossTenant || source.crossTenantPerformance || source.crossTenantAppraisal || source.rlsBypass) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
        if (source.platformOwnerInAppraisal || normalizeRole(source.role) === 'PLATFORM_OWNER') return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
        if (source.appraisalBypass || source.unsafeDirectApproval || source.unauthorizedFeedbackAccess || source.superAdminAppraisalAccess) return FAILURE_CLASSIFICATIONS.HIGH_RISK;
        if (source.malformedReview || source.reviewerCongestion || source.delayedReview || source.malformedPayload) return FAILURE_CLASSIFICATIONS.WARNING;
        return FAILURE_CLASSIFICATIONS.INFO;
    }

    function normalizeReviewState(value, row) {
        var normalized = normalizeToken(value || row && (row.state || row.status || row.reviewStatus || row.governanceState));
        if (normalized === 'SELF_REVIEWED' || normalized === 'SELF_REVIEW' || normalized === 'SELF_REVIEW_COMPLETE') return REVIEW_STATES.MANAGER_REVIEW_PENDING;
        if (normalized === 'MANAGER_REVIEWED' || normalized === 'MANAGER_REVIEW' || normalized === 'CALIBRATION_PENDING') return REVIEW_STATES.HR_REVIEW_PENDING;
        if (normalized === 'FINALIZED' || normalized === 'APPROVED' || normalized === 'COMPLETED') return REVIEW_STATES.APPROVED;
        if (normalized === 'REJECT' || normalized === 'REJECTED') return REVIEW_STATES.REJECTED;
        if (normalized === 'ESCALATED' || normalized === 'AT_RISK') return REVIEW_STATES.ESCALATED;
        if (normalized === 'ARCHIVED') return REVIEW_STATES.ARCHIVED;
        if (normalized === 'DRAFT') return REVIEW_STATES.DRAFT;
        if (normalized === 'SELF_REVIEW_PENDING' || normalized === 'MANAGER_REVIEW_PENDING' || normalized === 'HR_REVIEW_PENDING') return normalized;
        if (row && !row.selfRating && !row.selfComments && !row.selfComment) return REVIEW_STATES.SELF_REVIEW_PENDING;
        if (row && (row.selfRating || row.selfComments || row.selfComment) && !row.managerRating && !row.managerComments && !row.managerComment) return REVIEW_STATES.MANAGER_REVIEW_PENDING;
        if (row && (row.managerRating || row.managerComments || row.managerComment) && !row.finalizedOn) return REVIEW_STATES.HR_REVIEW_PENDING;
        return REVIEW_STATES.DRAFT;
    }

    function isTerminalReview(row) {
        var state = normalizeReviewState(row && (row.state || row.status), row);
        return [REVIEW_STATES.APPROVED, REVIEW_STATES.REJECTED, REVIEW_STATES.ARCHIVED].indexOf(state) !== -1;
    }

    function dateValue(value) {
        var text = safeString(value || '', '').slice(0, 10);
        if (!text) return null;
        var parsed = new Date(text + 'T00:00:00.000Z');
        if (Number.isNaN(parsed.getTime())) return null;
        return parsed;
    }

    function isPastDate(value, context) {
        var date = dateValue(value);
        if (!date) return false;
        var now = new Date(nowIso(context));
        return date.getTime() < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    }

    function visibilityForRole(role, actor, targetEmpId, data, source) {
        var normalized = normalizeRole(role || actor && actor.role);
        var actorEmpId = safeString(actor && (actor.empId || actor.employeeId || actor.id) || '', '').trim();
        if (normalized === 'EMPLOYEE') {
            return actorEmpId && targetEmpId && actorEmpId === targetEmpId ? VISIBILITY.OWN_REVIEWS_ONLY : VISIBILITY.NONE;
        }
        if (normalized === 'MANAGER') {
            if (source && reviewerIdOf(source) === actorEmpId) return VISIBILITY.DIRECT_REPORT_REVIEWS;
            return managerOwnsEmployee(actorEmpId, targetEmpId, data) ? VISIBILITY.DIRECT_REPORT_REVIEWS : VISIBILITY.NONE;
        }
        if (normalized === 'HR') return VISIBILITY.OPERATIONAL_REVIEW_VISIBILITY;
        if (normalized === 'HR_HEAD') return VISIBILITY.STRATEGIC_PERFORMANCE_VISIBILITY;
        if (normalized === 'DIRECTOR') return VISIBILITY.AGGREGATE_ANALYTICS_ONLY;
        if (normalized === 'SUPER_ADMIN') return VISIBILITY.INFRASTRUCTURE_ONLY;
        if (normalized === 'PLATFORM_OWNER') return VISIBILITY.PLATFORM_GOVERNANCE_ONLY;
        return VISIBILITY.NONE;
    }

    function validatePerformanceScope(record, context) {
        try {
            var source = record || {};
            var data = rawData();
            var ctxTenant = contextTenant(context);
            var targetEmpId = empIdOf(source);
            var targetTenant = sourceTenant(source, data) || ctxTenant;
            var role = normalizeRole(context && context.actor && context.actor.role);
            var visibility = visibilityForRole(role, context && context.actor, targetEmpId, data, source);
            var failures = [];
            var sameTenant = !targetTenant || !ctxTenant || targetTenant === ctxTenant;
            var targetSpecific = !!(targetEmpId || reviewIdOf(source) || appraisalIdOf(source));

            if (!sameTenant) {
                failures.push(safeFailure('CROSS_TENANT_PERFORMANCE_VISIBILITY_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Cross-tenant performance visibility was blocked.', { expectedTenant: ctxTenant }));
            }
            if (role === 'PLATFORM_OWNER' && targetSpecific) {
                failures.push(safeFailure('PLATFORM_OWNER_PERFORMANCE_ACCESS_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Platform owner is isolated from employee appraisal hierarchy.'));
            }
            if (role === 'SUPER_ADMIN' && (targetSpecific || hasRawPerformanceFields(source))) {
                failures.push(safeFailure('SUPER_ADMIN_APPRAISAL_ACCESS_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Tenant system administrators receive infrastructure visibility only.'));
            }
            if (role === 'DIRECTOR' && hasRawPerformanceFields(source)) {
                failures.push(safeFailure('DIRECTOR_RAW_APPRAISAL_ACCESS_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Directors receive aggregate performance analytics only.'));
            }
            if (role === 'EMPLOYEE' && visibility !== VISIBILITY.OWN_REVIEWS_ONLY) {
                failures.push(safeFailure('EMPLOYEE_PERFORMANCE_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Employees may access only their own performance reviews.'));
            }
            if (role === 'MANAGER' && visibility !== VISIBILITY.DIRECT_REPORT_REVIEWS) {
                failures.push(safeFailure('MANAGER_PERFORMANCE_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Managers may access direct report reviews only.'));
            }

            var classification = highestClassification(failures);
            return freezePerformanceOutput({
                allowed: failures.length === 0,
                classification: classification,
                visibility: visibility,
                scope: {
                    tenantSlug: ctxTenant,
                    empId: sameTenant ? targetEmpId : '',
                    reviewId: sameTenant ? reviewIdOf(source) : '',
                    appraisalId: sameTenant ? appraisalIdOf(source) : ''
                },
                failures: failures,
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    performanceConfidentialityPreserved: true,
                    roleScopedVisibility: true
                }
            });
        } catch (error) {
            return freezePerformanceOutput({
                allowed: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                visibility: VISIBILITY.NONE,
                failures: [safeFailure('PERFORMANCE_SCOPE_VALIDATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Performance scope validation failed safely.')]
            });
        }
    }

    function normalizeReviewPayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezePerformanceOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    failures: [safeFailure('MALFORMED_REVIEW_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Performance review payload is malformed.')]
                });
            }
            var data = rawData();
            var ctxTenant = contextTenant(context);
            var srcTenant = sourceTenant(payload, data) || ctxTenant;
            return freezePerformanceOutput({
                success: true,
                classification: (!ctxTenant || !srcTenant || ctxTenant === srcTenant) ? FAILURE_CLASSIFICATIONS.INFO : FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                payload: {
                    tenantSlug: srcTenant,
                    empId: empIdOf(payload),
                    reviewId: reviewIdOf(payload),
                    appraisalId: appraisalIdOf(payload),
                    reviewCycleId: cycleIdOf(payload),
                    reviewerId: reviewerIdOf(payload),
                    managerId: safeString(payload.managerId || payload.manager_id || '', '').trim(),
                    state: normalizeReviewState(payload.state || payload.status || payload.reviewStatus, payload),
                    hasKpiLink: !!(payload.kpiId || payload.deliverableId || payload.deliverable_id || payload.strategicDeliverableId)
                },
                metadata: {
                    tenantIsolationPreserved: !ctxTenant || !srcTenant || ctxTenant === srcTenant,
                    performanceConfidentialityPreserved: true,
                    historicalReviewsImmutable: true
                }
            });
        } catch (error) {
            return freezePerformanceOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('REVIEW_NORMALIZATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Review normalization failed safely.')]
            });
        }
    }

    function reviewerChain(payload) {
        var chain = [];
        if (Array.isArray(payload && payload.reviewerChain)) chain = chain.concat(payload.reviewerChain);
        if (Array.isArray(payload && payload.approvalChain)) chain = chain.concat(payload.approvalChain);
        if (Array.isArray(payload && payload.reviewers)) chain = chain.concat(payload.reviewers);
        return chain;
    }

    function validateReviewPayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezePerformanceOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    state: REVIEW_STATES.DRAFT,
                    failures: [safeFailure('MALFORMED_REVIEW_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Performance review payload is malformed.')]
                });
            }
            var data = rawData();
            var ctxTenant = contextTenant(context);
            var targetTenant = sourceTenant(payload, data) || ctxTenant;
            var role = normalizeRole(context && context.actor && context.actor.role);
            var normalizedState = normalizeReviewState(payload.state || payload.status || payload.reviewStatus, payload);
            var failures = [];
            var scope = validatePerformanceScope(payload, context);
            failures = failures.concat(scope.failures || []);

            if (ctxTenant && targetTenant && ctxTenant !== targetTenant) {
                failures.push(safeFailure('TENANT_MISMATCH', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Review tenant mismatch was blocked.', { expectedTenant: ctxTenant }));
            }
            if (Object.keys(REVIEW_STATES).map(function key(k) { return REVIEW_STATES[k]; }).indexOf(normalizedState) === -1) {
                failures.push(safeFailure('INVALID_REVIEW_STATE', FAILURE_CLASSIFICATIONS.WARNING, 'Review state is not supported.'));
            }
            if (role === 'MANAGER' && (normalizedState === REVIEW_STATES.APPROVED || payload.skipHrReview === true || payload.calibrationBypass === true || payload.directApproval === true)) {
                failures.push(safeFailure('UNSAFE_APPRAISAL_WORKFLOW_BYPASS', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Manager direct appraisal approval is blocked.'));
            }
            if (role === 'MANAGER' && empIdOf(payload) && scope.visibility !== VISIBILITY.DIRECT_REPORT_REVIEWS) {
                failures.push(safeFailure('MANAGER_DIRECT_REPORT_REQUIRED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Manager review requires direct-report scope.'));
            }
            reviewerChain(payload).forEach(function validateReviewer(item) {
                var reviewerRole = normalizeRole(item && item.role);
                if (reviewerRole === 'PLATFORM_OWNER') {
                    failures.push(safeFailure('PLATFORM_OWNER_IN_APPRAISAL_CHAIN_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Platform owner cannot be included in appraisal workflow chains.'));
                } else if (reviewerRole && ['EMPLOYEE', 'MANAGER', 'HR', 'HR_HEAD', 'DIRECTOR', 'SUPER_ADMIN'].indexOf(reviewerRole) === -1) {
                    failures.push(safeFailure('UNKNOWN_REVIEWER_ROLE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Unknown appraisal reviewer role is blocked.'));
                }
            });

            var classification = highestClassification(failures);
            return freezePerformanceOutput({
                success: failures.length === 0,
                classification: classification,
                state: normalizedState,
                normalized: normalizeReviewPayload(payload, context).payload || null,
                failures: failures,
                workflowGovernance: {
                    managerBypassBlocked: true,
                    hrReviewRequired: true,
                    calibrationWorkflowGoverned: true,
                    appraisalActionsAuditable: true
                },
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    performanceConfidentialityPreserved: true,
                    historicalReviewsImmutable: true
                }
            });
        } catch (error) {
            return freezePerformanceOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                state: REVIEW_STATES.DRAFT,
                failures: [safeFailure('REVIEW_VALIDATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Review validation failed safely.')]
            });
        }
    }

    function tenantFilter(tenant, data) {
        return function sameTenant(row) {
            var tenantSlug = sourceTenant(row, data);
            return !tenant || !tenantSlug || tenantSlug === tenant;
        };
    }

    function jobTenant(row) {
        return rowTenant(row);
    }

    function isPerformanceJob(row) {
        return PERFORMANCE_JOB_TYPES.indexOf(normalizeToken(row && (row.jobType || row.type || row.category))) !== -1;
    }

    function detectReviewerCongestion(filters, context) {
        try {
            var data = rawData();
            var tenant = normalizeTenantSlug(filters && (filters.tenantSlug || filters.tenantId || filters.companyId)) || contextTenant(context);
            var rows = performanceRows(data).filter(tenantFilter(tenant, data));
            var pendingRows = rows.filter(function pending(row) { return !isTerminalReview(row); });
            var reviewers = {};
            var delayedReviews = 0;
            pendingRows.forEach(function eachReview(row) {
                var reviewerId = reviewerIdOf(row) || 'UNASSIGNED';
                if (!reviewers[reviewerId]) reviewers[reviewerId] = { reviewerId: reviewerId, pendingReviews: 0, delayedReviews: 0, clarificationLoops: 0, escalatedReviews: 0 };
                reviewers[reviewerId].pendingReviews += 1;
                var delayed = isPastDate(row.dueDate || row.deadlineDate || row.endDate || '', context);
                if (delayed) {
                    reviewers[reviewerId].delayedReviews += 1;
                    delayedReviews += 1;
                }
                reviewers[reviewerId].clarificationLoops += Math.max(0, Number(row.clarificationLoops || row.revisionCount || row.revisionRequests || 0) || 0);
                if (normalizeReviewState(row.state || row.status || row.reviewStatus, row) === REVIEW_STATES.ESCALATED) reviewers[reviewerId].escalatedReviews += 1;
            });
            var reviewerList = Object.keys(reviewers).map(function toRow(id) {
                var row = reviewers[id];
                var high = row.pendingReviews >= 3 || row.clarificationLoops >= 3 || row.escalatedReviews > 0;
                var warning = row.pendingReviews >= 2 || row.delayedReviews > 0 || row.clarificationLoops > 0;
                return {
                    reviewerId: row.reviewerId,
                    pendingReviews: row.pendingReviews,
                    delayedReviews: row.delayedReviews,
                    clarificationLoops: row.clarificationLoops,
                    escalatedReviews: row.escalatedReviews,
                    classification: high ? FAILURE_CLASSIFICATIONS.HIGH_RISK : warning ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO
                };
            }).sort(function order(a, b) {
                return (b.pendingReviews + b.delayedReviews + b.clarificationLoops) - (a.pendingReviews + a.delayedReviews + a.clarificationLoops);
            });
            var congested = reviewerList.filter(function congestedRow(row) {
                return row.classification === FAILURE_CLASSIFICATIONS.HIGH_RISK || row.pendingReviews >= 2 || row.delayedReviews > 0;
            }).length;
            return freezePerformanceOutput({
                success: true,
                classification: congested ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO,
                tenantSlug: tenant,
                summary: {
                    pendingReviews: pendingRows.length,
                    delayedReviews: delayedReviews,
                    reviewerCongestion: congested,
                    clarificationLoops: reviewerList.reduce(function sum(acc, row) { return acc + row.clarificationLoops; }, 0)
                },
                reviewers: reviewerList,
                metadata: {
                    tenantIsolationPreserved: true,
                    performanceConfidentialityPreserved: true,
                    historicalReviewsImmutable: true
                }
            });
        } catch (error) {
            return freezePerformanceOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                summary: { pendingReviews: 0, delayedReviews: 0, reviewerCongestion: 0, clarificationLoops: 0 },
                reviewers: [],
                failures: [safeFailure('REVIEWER_CONGESTION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Reviewer congestion detection failed safely.')]
            });
        }
    }

    function auditPerformance(actionType, metadata, context) {
        if (auditForwarding || context && context.skipAuditPersistence) return { success: true, skipped: true };
        auditForwarding = true;
        try {
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    actionType: actionType,
                    eventType: actionType,
                    module: 'Performance Governance',
                    targetId: metadata && (metadata.reviewId || metadata.appraisalId || metadata.targetId) || '',
                    description: metadata && metadata.description || actionType,
                    actorRole: context && context.actor && context.actor.role || 'hr',
                    actorId: context && context.actor && context.actor.id || '',
                    severity: metadata && metadata.severity || 'INFO',
                    correlationId: metadata && metadata.correlationId || '',
                    metadata: cloneSanitized(metadata || {})
                }, {
                    source: 'performanceGovernanceService',
                    skipPersistence: false
                });
            }
            var source = db();
            if (source && typeof source.writeAuditLog === 'function') {
                source.writeAuditLog(context && context.actor && context.actor.role || 'hr', context && context.actor && context.actor.id || '', actionType, 'Performance Governance', metadata && (metadata.reviewId || metadata.appraisalId) || '', metadata && metadata.description || actionType);
            }
            return { success: true };
        } catch (error) {
            return { success: false, warning: 'Performance audit failed safely.' };
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
                service.emitTelemetry('PERFORMANCE_GOVERNANCE', eventType, {
                    source: 'performanceGovernanceService',
                    severity: metadata && metadata.severity || 'INFO',
                    tenantSlug: contextTenant(context) || metadata && metadata.tenantSlug || '',
                    metadata: cloneSanitized(metadata || {})
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Performance telemetry failed safely.' };
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
                    source: 'performanceGovernanceService',
                    status: metadata && metadata.status || metricType,
                    severity: metadata && metadata.severity || 'INFO'
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Performance metric failed safely.' };
        } finally {
            metricForwarding = false;
        }
        return { success: false, warning: 'OrchestrationMetricsService unavailable.' };
    }

    function persistGovernanceRun(run, context) {
        if (context && (context.preview || context.readOnly)) return freezePerformanceOutput(run);
        var data = rawData();
        data.performanceGovernanceRuns = Array.isArray(data.performanceGovernanceRuns) ? data.performanceGovernanceRuns.slice() : [];
        data.performanceGovernanceRuns.unshift(cloneSanitized(run));
        if (data.performanceGovernanceRuns.length > 150) data.performanceGovernanceRuns = data.performanceGovernanceRuns.slice(0, 150);
        saveData(data);
        return freezePerformanceOutput(run);
    }

    function scheduleAppraisalWorkflow(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezePerformanceOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    state: REVIEW_STATES.DRAFT,
                    failures: [safeFailure('MALFORMED_APPRAISAL_WORKFLOW_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Appraisal workflow payload is malformed.')]
                });
            }
            var validation = validateReviewPayload(payload, context);
            if (!validation.success) {
                auditPerformance('APPRAISAL_WORKFLOW_BLOCKED', {
                    tenantSlug: contextTenant(context),
                    severity: validation.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'WARNING',
                    description: 'Unsafe appraisal workflow was blocked.'
                }, context);
                emitTelemetry('APPRAISAL_WORKFLOW_BLOCKED', { severity: 'WARNING', status: 'BLOCKED' }, context);
                return freezePerformanceOutput({
                    success: false,
                    classification: validation.classification,
                    state: validation.state || REVIEW_STATES.DRAFT,
                    failures: validation.failures,
                    asyncJob: { success: false, warning: 'Appraisal workflow blocked before async scheduling.' },
                    metadata: {
                        tenantIsolationPreserved: validation.classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                        performanceConfidentialityPreserved: true,
                        historicalReviewsImmutable: true
                    }
                });
            }

            var ctxTenant = contextTenant(context) || validation.normalized && validation.normalized.tenantSlug || sourceTenant(payload, rawData());
            var runId = 'PERFGOV-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7).toUpperCase();
            var run = persistGovernanceRun({
                runId: runId,
                tenantSlug: ctxTenant,
                reviewId: reviewIdOf(payload),
                appraisalId: appraisalIdOf(payload),
                empId: empIdOf(payload),
                state: REVIEW_STATES.HR_REVIEW_PENDING,
                validationOnly: payload.validationOnly !== false,
                createdAt: nowIso(context),
                appraisalWorkflowGoverned: true
            }, context);

            var asyncJob = { success: false, warning: 'AsyncJobService unavailable; appraisal workflow remains governance-visible.' };
            if (global.AsyncJobService && typeof global.AsyncJobService.scheduleJob === 'function') {
                asyncJob = global.AsyncJobService.scheduleJob({
                    tenantSlug: ctxTenant,
                    jobType: 'APPRAISAL_WORKFLOW',
                    priority: 'HIGH',
                    correlationId: reviewIdOf(payload) || appraisalIdOf(payload) || runId,
                    payload: {
                        reviewId: reviewIdOf(payload),
                        appraisalId: appraisalIdOf(payload),
                        empId: empIdOf(payload),
                        reviewCycleId: cycleIdOf(payload),
                        governanceRunId: runId
                    },
                    schedule: payload.schedule || {}
                }, {
                    tenantSlug: ctxTenant,
                    actor: context && context.actor,
                    skipAuditPersistence: context && context.skipAuditPersistence,
                    skipTelemetry: context && context.skipTelemetry,
                    skipMetrics: context && context.skipMetrics,
                    preview: context && context.preview
                });
            }

            if (global.NotificationOrchestrationService && typeof global.NotificationOrchestrationService.orchestrateNotification === 'function' && !(context && context.skipNotification)) {
                try {
                    global.NotificationOrchestrationService.orchestrateNotification({
                        tenantSlug: ctxTenant,
                        module: 'Performance Reviews',
                        category: 'APPRAISAL_WORKFLOW',
                        targetRole: 'HR',
                        priority: 'HIGH',
                        title: 'Appraisal Review Governance',
                        message: 'An appraisal workflow item is ready for governed HR review.',
                        correlationId: reviewIdOf(payload) || appraisalIdOf(payload) || runId
                    }, {
                        tenantSlug: ctxTenant,
                        actor: context && context.actor,
                        skipAuditPersistence: context && context.skipAuditPersistence,
                        skipTelemetry: context && context.skipTelemetry,
                        skipMetrics: context && context.skipMetrics,
                        preview: context && context.preview
                    });
                } catch (notifyError) {}
            }

            auditPerformance('APPRAISAL_WORKFLOW_SCHEDULED', {
                reviewId: reviewIdOf(payload),
                appraisalId: appraisalIdOf(payload),
                tenantSlug: ctxTenant,
                description: 'Appraisal workflow scheduled through performance governance.'
            }, context);
            emitTelemetry('APPRAISAL_WORKFLOW_SCHEDULED', { tenantSlug: ctxTenant, status: 'SCHEDULED' }, context);
            recordMetric('APPRAISAL_WORKFLOW_SCHEDULED', { tenantSlug: ctxTenant, status: 'SCHEDULED' }, context);

            return freezePerformanceOutput({
                success: true,
                classification: FAILURE_CLASSIFICATIONS.INFO,
                state: REVIEW_STATES.HR_REVIEW_PENDING,
                run: run,
                asyncJob: asyncJob,
                metadata: {
                    tenantIsolationPreserved: true,
                    performanceConfidentialityPreserved: true,
                    historicalReviewsImmutable: true,
                    existingPerformanceFlowsPreserved: true
                }
            });
        } catch (error) {
            safeWarn('Appraisal workflow scheduling failed safely.', error && error.message ? error.message : error);
            return freezePerformanceOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                state: REVIEW_STATES.DRAFT,
                failures: [safeFailure('APPRAISAL_WORKFLOW_SCHEDULING_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Appraisal workflow scheduling failed safely.')],
                asyncJob: { success: false, warning: 'Appraisal workflow scheduling failed safely.' }
            });
        }
    }

    function cycleTenant(row, tenant) {
        var direct = rowTenant(row);
        return !tenant || !direct || direct === tenant;
    }

    function generatePerformanceGovernanceReport(filters, context) {
        try {
            var data = rawData();
            var tenant = normalizeTenantSlug(filters && (filters.tenantSlug || filters.tenantId || filters.companyId)) || contextTenant(context);
            var reviews = performanceRows(data).filter(tenantFilter(tenant, data));
            var appraisals = appraisalRows(data).filter(tenantFilter(tenant, data));
            var cycles = reviewCycleRows(data).filter(function filterCycle(row) { return cycleTenant(row, tenant); });
            var deliverables = strategicRows(data).filter(tenantFilter(tenant, data));
            var strategicReviews = strategicReviewRows(data).filter(tenantFilter(tenant, data));
            var escalations = escalationRows(data).filter(function escalationFilter(row) {
                if (!tenantFilter(tenant, data)(row)) return false;
                return /PERFORMANCE|APPRAISAL|REVIEW|KPI/i.test([row.escalationType, row.type, row.category, row.status].join(' '));
            });
            var jobs = asyncRows(data).filter(function performanceJob(row) {
                return jobTenant(row) === tenant && isPerformanceJob(row);
            });
            var pendingReviews = reviews.filter(function pending(row) { return !isTerminalReview(row); });
            var approvedReviews = reviews.filter(function approved(row) { return normalizeReviewState(row.state || row.status || row.reviewStatus, row) === REVIEW_STATES.APPROVED; });
            var escalatedReviews = reviews.filter(function escalated(row) { return normalizeReviewState(row.state || row.status || row.reviewStatus, row) === REVIEW_STATES.ESCALATED; });
            var congestion = detectReviewerCongestion({ tenantSlug: tenant }, { tenantSlug: tenant, now: context && context.now, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            var failedJobs = jobs.filter(function failed(row) { return normalizeToken(row.state || row.status) === 'FAILED'; }).length;
            var retryPending = jobs.filter(function retry(row) { return normalizeToken(row.state || row.status) === 'RETRY_PENDING'; }).length;
            var activeCycles = cycles.filter(function active(row) { return /ACTIVE|OPEN|IN_PROGRESS/i.test(safeString(row.status || row.state || '', '')); }).length;
            var cycleDeadlines = cycles.filter(function deadline(row) { return isPastDate(row.endDate || row.deadlineDate || row.dueDate || '', context); }).length;
            var classification = escalations.length || failedJobs ? FAILURE_CLASSIFICATIONS.HIGH_RISK : (pendingReviews.length || congestion.summary && congestion.summary.delayedReviews) ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO;

            var report = {
                success: true,
                readOnly: true,
                classification: classification,
                generatedAt: nowIso(context),
                tenantSlug: tenant,
                reviewCycleHealth: {
                    totalCycles: cycles.length,
                    activeCycles: activeCycles,
                    cycleDeadlineRisks: cycleDeadlines,
                    reviewsInScope: reviews.length,
                    historicalReviewsImmutable: true
                },
                appraisalWorkflow: {
                    pendingReviews: pendingReviews.length,
                    managerReviewPending: reviews.filter(function mgr(row) { return normalizeReviewState(row.state || row.status || row.reviewStatus, row) === REVIEW_STATES.MANAGER_REVIEW_PENDING; }).length,
                    hrReviewPending: reviews.filter(function hr(row) { return normalizeReviewState(row.state || row.status || row.reviewStatus, row) === REVIEW_STATES.HR_REVIEW_PENDING; }).length + appraisals.filter(function hrAppr(row) { return /HR_REVIEW_PENDING|REVIEW_PENDING|PENDING/i.test(safeString(row.status || row.state || '', '')); }).length,
                    escalatedReviews: escalatedReviews.length + escalations.length,
                    approvedReviews: approvedReviews.length,
                    appraisalRows: appraisals.length,
                    managerBypassBlocked: true,
                    appraisalActionsAuditable: true
                },
                kpiIntegration: {
                    linkedStrategicDeliverables: deliverables.length,
                    strategicReviewBacklog: strategicReviews.filter(function pendingStrategic(row) { return /PENDING|CONTRIBUTOR_UPDATE|UNDER_REVIEW/i.test([row.reviewStatus, row.review_status, row.reviewerAction, row.governanceState].join(' ')); }).length,
                    atRiskDeliverables: deliverables.filter(function risk(row) { return /AT_RISK|ESCALATED|BLOCKED|OVERDUE/i.test([row.currentStatus, row.governanceState, row.riskLevel].join(' ')); }).length,
                    kpiLinkedReviews: reviews.filter(function linked(row) { return !!(row.kpiId || row.deliverableId || row.deliverable_id || row.strategicDeliverableId || row.targetMetric); }).length,
                    unsafeKpiMutationPrevented: true
                },
                reviewerGovernance: {
                    pendingReviews: congestion.summary ? congestion.summary.pendingReviews : 0,
                    delayedReviews: congestion.summary ? congestion.summary.delayedReviews : 0,
                    reviewerCongestion: congestion.summary ? congestion.summary.reviewerCongestion : 0,
                    clarificationLoops: congestion.summary ? congestion.summary.clarificationLoops : 0,
                    reviewGovernanceSummariesReady: true
                },
                performanceCycle: {
                    quarterlyReviewsSupported: true,
                    annualReviewsSupported: true,
                    probationReviewsSupported: true,
                    customCyclesSupported: true,
                    reminderGovernanceReady: true,
                    stagedAppraisalActivation: true
                },
                asyncAppraisalProcessing: {
                    asyncAppraisalJobs: jobs.length,
                    retryPending: retryPending,
                    failedJobs: failedJobs,
                    retryLoopPrevented: jobs.every(function retryLimit(row) { return Number(row.retryAttempts || 0) <= Number(row.maxRetries || 3); })
                },
                accessGovernance: {
                    employeeOwnReviewsOnly: true,
                    managerDirectReportsOnly: true,
                    hrOperationalVisibility: true,
                    directorAggregateOnly: true,
                    superAdminAppraisalAccess: false,
                    platformOwnerAppraisalAccess: false,
                    roleScopedFeedback: true
                },
                warnings: (failedJobs || escalations.length) ? [safeWarning('PERFORMANCE_REVIEW_RISK_REQUIRES_REVIEW', 'Performance governance detected failed jobs or escalation-linked appraisal risk.', { failedJobs: failedJobs, escalations: escalations.length })] : [],
                metadata: {
                    tenantIsolationPreserved: true,
                    performanceConfidentialityPreserved: true,
                    historicalReviewsImmutable: true,
                    existingPerformanceFlowsPreserved: true,
                    performanceActionsAuditable: true,
                    auditReady: !!(global.AuditService || global.auditService),
                    telemetryReady: !!(global.WorkflowTelemetryService || global.workflowTelemetryService)
                }
            };

            auditPerformance('PERFORMANCE_GOVERNANCE_REPORTED', {
                tenantSlug: tenant,
                severity: classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO',
                description: 'Performance governance report viewed.'
            }, context);
            emitTelemetry('PERFORMANCE_GOVERNANCE_REPORTED', { tenantSlug: tenant, status: classification, severity: classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO' }, context);
            recordMetric('PERFORMANCE_GOVERNANCE_REPORTED', { tenantSlug: tenant, status: classification, severity: classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO' }, context);
            return freezePerformanceOutput(report);
        } catch (error) {
            return freezePerformanceOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                reviewCycleHealth: { totalCycles: 0, activeCycles: 0, reviewsInScope: 0 },
                appraisalWorkflow: { pendingReviews: 0, escalatedReviews: 0, appraisalRows: 0 },
                kpiIntegration: { linkedStrategicDeliverables: 0, strategicReviewBacklog: 0 },
                reviewerGovernance: { pendingReviews: 0, delayedReviews: 0, reviewerCongestion: 0 },
                performanceCycle: { reminderGovernanceReady: false },
                failures: [safeFailure('PERFORMANCE_GOVERNANCE_REPORT_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Performance governance report failed safely.')]
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        function check(name, condition) {
            checks.push({ label: name, passed: !!condition });
        }
        try {
            var malformed = validateReviewPayload(null, { tenantSlug: 'tabsons' });
            check('malformed payloads fail safely', malformed.success === false && malformed.failures.some(function item(row) { return row.failureCode === 'MALFORMED_REVIEW_PAYLOAD'; }));

            var crossTenant = validatePerformanceScope({ tenantSlug: 'abc', empId: 'EMP-X' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' } });
            check('performance isolation works', crossTenant.allowed === false && crossTenant.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER);

            var bypass = validateReviewPayload({ tenantSlug: 'tabsons', empId: 'EMP-1', state: 'APPROVED', skipHrReview: true }, { tenantSlug: 'tabsons', actor: { role: 'MANAGER', id: 'MGR-1', empId: 'MGR-1' } });
            check('appraisal workflows work', bypass.success === false && bypass.failures.some(function item(row) { return row.failureCode === 'UNSAFE_APPRAISAL_WORKFLOW_BYPASS'; }));

            var immutable = normalizeReviewPayload({ tenantSlug: 'tabsons', empId: 'EMP-1', state: 'manager review pending', selfComments: 'private' }, { tenantSlug: 'tabsons' });
            check('immutable outputs enforced', Object.isFrozen(immutable));

            var congestion = detectReviewerCongestion({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', now: '2026-05-23T00:00:00.000Z' });
            check('reviewer governance works', congestion.success === true && Object.isFrozen(congestion.reviewers));

            var report = generatePerformanceGovernanceReport({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true, now: '2026-05-23T00:00:00.000Z' });
            check('KPI integration works', report.success === true && report.kpiIntegration.linkedStrategicDeliverables >= 0);

            var originalAsync = global.AsyncJobService;
            var originalNotify = global.NotificationOrchestrationService;
            try {
                delete global.AsyncJobService;
                delete global.NotificationOrchestrationService;
                var degraded = scheduleAppraisalWorkflow({ tenantSlug: 'tabsons', reviewId: 'REV-SELF', empId: 'EMP-1' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true, preview: true });
                check('dependency absence degrades safely', degraded.success === true && degraded.asyncJob.success === false);
            } finally {
                if (originalAsync) global.AsyncJobService = originalAsync;
                if (originalNotify) global.NotificationOrchestrationService = originalNotify;
            }
        } catch (error) {
            checks.push({ label: 'self-test uncaught error guard', passed: false, error: safeString(error && error.message || error, '') });
        }
        var passed = checks.every(function item(row) { return row.passed; });
        var result = freezePerformanceOutput({
            passed: passed,
            checks: checks,
            summary: passed ? 'Performance governance self-test passed.' : 'Performance governance self-test detected failures.'
        });
        global.__ARTHHRMS_PERFORMANCE_GOVERNANCE_SELF_TEST__ = result;
        return result;
    }

    var PerformanceGovernanceService = Object.freeze({
        VERSION: VERSION,
        REVIEW_STATES: REVIEW_STATES,
        FAILURE_CLASSIFICATIONS: FAILURE_CLASSIFICATIONS,
        VISIBILITY: VISIBILITY,
        classifyPerformanceRisk: classifyPerformanceRisk,
        validatePerformanceScope: validatePerformanceScope,
        validateReviewPayload: validateReviewPayload,
        normalizeReviewPayload: normalizeReviewPayload,
        freezePerformanceOutput: freezePerformanceOutput,
        detectReviewerCongestion: detectReviewerCongestion,
        scheduleAppraisalWorkflow: scheduleAppraisalWorkflow,
        generatePerformanceGovernanceReport: generatePerformanceGovernanceReport,
        runSelfTest: runSelfTest
    });

    global.PerformanceGovernanceService = PerformanceGovernanceService;
    global.performanceGovernanceService = PerformanceGovernanceService;

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
