/**
 * deliverableGovernanceService.js
 * ARTHHRMS - Strategic Deliverables Governance Layer
 *
 * PURPOSE:
 * Converts Strategic Deliverables from employee task assignment into
 * leadership accountability governance while preserving legacy records.
 *
 * This service owns:
 * - strategic ownership rules
 * - contributor/reviewer/sponsor role normalization
 * - review action governance
 * - immutable compatibility shaping
 *
 * This service does NOT:
 * - own workflow orchestration
 * - mutate dashboard state
 * - rewrite existing deliverable records destructively
 *
 * @version 1.0.0
 */
(function (global) {
    'use strict';

    const OWNER_ROLES = Object.freeze(['manager', 'hr', 'hr_head', 'director']);
    const CONTRIBUTOR_ROLES = Object.freeze(['employee', 'manager', 'hr', 'hr_head', 'director']);
    const STRATEGIC_ROLES = Object.freeze(['strategic_owner', 'reviewer', 'sponsor', 'contributor', 'contributors']);
    const WORKFLOW_STATES = Object.freeze(['DRAFT', 'ACTIVE', 'UNDER_REVIEW', 'NEEDS_CLARIFICATION', 'AT_RISK', 'ESCALATED', 'APPROVED', 'COMPLETED']);
    const REVIEW_ACTIONS = Object.freeze(['APPROVE_PROGRESS', 'REQUEST_CLARIFICATION', 'REJECT_PROGRESS', 'ESCALATE_RISK', 'MARK_AT_RISK', 'COMPLETE_DELIVERABLE']);

    function freezeDeliverableGovernance(value) {
        if (Array.isArray(value)) return Object.freeze(value.map(item => freezeDeliverableGovernance(item)));
        if (value && typeof value === 'object') {
            const clone = {};
            Object.keys(value).forEach(key => { clone[key] = freezeDeliverableGovernance(value[key]); });
            return Object.freeze(clone);
        }
        return value;
    }

    function normalizeRole(role) {
        return String(role || '').trim().replace(/[\s-]+/g, '_').toLowerCase();
    }

    function normalizeDeliverableRole(role) {
        const normalized = normalizeRole(role);
        if (normalized === 'owner' || normalized === 'accountable_owner' || normalized === 'primary_owner') return 'strategic_owner';
        if (normalized === 'approver' || normalized === 'manager_reviewer') return 'reviewer';
        if (normalized === 'executive_sponsor' || normalized === 'leadership_sponsor') return 'sponsor';
        if (normalized === 'employee' || normalized === 'assignee' || normalized === 'contributor') return 'contributor';
        return STRATEGIC_ROLES.includes(normalized) ? normalized : 'contributor';
    }

    function isStrategicOwnerRole(role) {
        return OWNER_ROLES.includes(normalizeRole(role));
    }

    function isContributorRole(role) {
        return CONTRIBUTOR_ROLES.includes(normalizeRole(role));
    }

    function safeData(data) {
        if (data && typeof data === 'object') return data;
        try {
            return global.DB?.get ? global.DB.get() : {};
        } catch (err) {
            return {};
        }
    }

    function findEmployee(empId, data) {
        const d = safeData(data);
        const id = String(empId || '').trim();
        return (d.employees || []).find(emp => emp.id === id || emp.empId === id) || null;
    }

    function findUserForEmployee(emp, data) {
        if (!emp) return null;
        const d = safeData(data);
        return (d.users || []).find(user =>
            (user.empId && user.empId === emp.id) ||
            (user.email && emp.email && String(user.email).toLowerCase() === String(emp.email).toLowerCase())
        ) || null;
    }

    function inferEmployeeRole(emp, data) {
        const user = findUserForEmployee(emp, data);
        const explicit = normalizeRole(user?.role || emp?.role || emp?.accessRole);
        if (explicit) return explicit;
        const title = String(emp?.desig || emp?.designation || '').toLowerCase();
        const dept = String(emp?.dept || emp?.department || '').toLowerCase();
        if (title.includes('director')) return 'director';
        if (title.includes('head') && dept.includes('hr')) return 'hr_head';
        if (title.includes('manager') || title.includes('lead')) return 'manager';
        if (dept === 'hr' && (title.includes('hr') || title.includes('people'))) return 'hr';
        return 'employee';
    }

    function displayNameForRole(role) {
        const normalized = normalizeRole(role);
        if (normalized === 'hr_head') return 'HR Head';
        if (normalized === 'hr') return 'HR';
        if (normalized === 'director') return 'Director';
        if (normalized === 'manager') return 'Manager';
        return normalized ? normalized.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Contributor';
    }

    function normalizeContributor(input, data) {
        const d = safeData(data);
        const empId = String(input?.empId || input?.id || input || '').trim();
        const emp = findEmployee(empId, d);
        const role = inferEmployeeRole(emp || input, d);
        return {
            empId,
            role: isContributorRole(role) ? role : 'employee',
            name: input?.name || emp?.name || input?.employeeName || empId
        };
    }

    function uniqueContributors(contributors, data) {
        const seen = new Set();
        const normalized = [];
        (contributors || []).forEach(item => {
            const next = normalizeContributor(item, data);
            const key = next.empId || next.name;
            if (!key || seen.has(key)) return;
            seen.add(key);
            normalized.push(next);
        });
        return normalized;
    }

    function resolveOwner(record, data) {
        const d = safeData(data);
        const explicitId = record.strategicOwnerId || record.ownerEmpId || record.ownerId || record.owner || '';
        const explicitEmp = findEmployee(explicitId, d);
        const explicitRole = normalizeRole(record.strategicOwnerRole || record.ownerRole || inferEmployeeRole(explicitEmp, d));
        if (explicitId && isStrategicOwnerRole(explicitRole)) {
            return {
                strategicOwnerId: explicitId,
                strategicOwnerRole: explicitRole,
                strategicOwnerName: record.strategicOwnerName || explicitEmp?.name || explicitId
            };
        }

        const legacyEmp = findEmployee(record.empId, d);
        const legacyRole = inferEmployeeRole(legacyEmp || { role: record.role }, d);
        if (record.empId && isStrategicOwnerRole(legacyRole)) {
            return {
                strategicOwnerId: record.empId,
                strategicOwnerRole: legacyRole,
                strategicOwnerName: legacyEmp?.name || record.employeeName || record.empId
            };
        }

        const managerEmp = findEmployee(record.managerId || legacyEmp?.managerId, d);
        const managerRole = inferEmployeeRole(managerEmp, d);
        if (managerEmp && isStrategicOwnerRole(managerRole)) {
            return {
                strategicOwnerId: managerEmp.id,
                strategicOwnerRole: managerRole,
                strategicOwnerName: managerEmp.name || managerEmp.id
            };
        }

        const leadershipUser = (d.users || []).find(user => isStrategicOwnerRole(user.role));
        if (leadershipUser) {
            return {
                strategicOwnerId: leadershipUser.empId || leadershipUser.id || '',
                strategicOwnerRole: normalizeRole(leadershipUser.role),
                strategicOwnerName: leadershipUser.name || leadershipUser.email || displayNameForRole(leadershipUser.role)
            };
        }

        return {
            strategicOwnerId: '',
            strategicOwnerRole: 'hr',
            strategicOwnerName: 'HR'
        };
    }

    function safeState(value) {
        const raw = String(value || '').trim().replace(/[\s-]+/g, '_').toUpperCase();
        const map = {
            ACTIVE: 'ACTIVE',
            OPEN: 'ACTIVE',
            DRAFT: 'DRAFT',
            UNDER_REVIEW: 'UNDER_REVIEW',
            READY_FOR_CLOSURE: 'UNDER_REVIEW',
            NEEDS_CLARIFICATION: 'NEEDS_CLARIFICATION',
            AT_RISK: 'AT_RISK',
            CRITICAL: 'AT_RISK',
            ESCALATED: 'ESCALATED',
            APPROVED: 'APPROVED',
            ACHIEVED: 'COMPLETED',
            CLOSED: 'COMPLETED',
            COMPLETED: 'COMPLETED',
            FAILED: 'COMPLETED',
            EXCEEDED: 'COMPLETED',
            PARTIALLY_ACHIEVED: 'COMPLETED'
        };
        return map[raw] || 'ACTIVE';
    }

    function normalizeDeliverableRecord(record = {}, data = null) {
        try {
            const d = safeData(data);
            const source = { ...record };
            const owner = resolveOwner(source, d);
            const legacyContributor = source.empId ? [normalizeContributor({ empId: source.empId, name: source.employeeName }, d)] : [];
            const contributors = uniqueContributors([...(source.contributors || []), ...legacyContributor], d);
            const reviewerId = source.reviewerId || source.managerId || owner.strategicOwnerId || '';
            const reviewerEmp = findEmployee(reviewerId, d);
            const reviewerRole = normalizeRole(source.reviewerRole || inferEmployeeRole(reviewerEmp, d) || owner.strategicOwnerRole || 'manager');
            const sponsorRole = normalizeRole(source.sponsorRole || (source.priority === 'Critical' ? 'director' : 'hr_head'));
            const state = safeState(source.governanceState || source.workflowState || source.currentStatus || source.status);
            return freezeDeliverableGovernance({
                ...source,
                strategicOwnerId: owner.strategicOwnerId,
                strategicOwnerRole: owner.strategicOwnerRole,
                strategicOwnerName: owner.strategicOwnerName,
                reviewerId,
                reviewerRole: isStrategicOwnerRole(reviewerRole) ? reviewerRole : 'manager',
                sponsorRole: isStrategicOwnerRole(sponsorRole) ? sponsorRole : 'hr_head',
                contributors,
                governanceState: state,
                workflowState: state,
                strategicRoles: {
                    strategic_owner: { empId: owner.strategicOwnerId, role: owner.strategicOwnerRole, name: owner.strategicOwnerName },
                    reviewer: { empId: reviewerId, role: isStrategicOwnerRole(reviewerRole) ? reviewerRole : 'manager', name: reviewerEmp?.name || source.reviewerName || owner.strategicOwnerName },
                    sponsor: { role: isStrategicOwnerRole(sponsorRole) ? sponsorRole : 'hr_head' },
                    contributors
                },
                employeeIsContributorOnly: !!source.empId && owner.strategicOwnerId !== source.empId,
                accountabilityModel: 'ENTERPRISE_ACCOUNTABILITY'
            });
        } catch (err) {
            return freezeDeliverableGovernance({ ...record, governanceWarning: 'DELIVERABLE_NORMALIZATION_FAILED' });
        }
    }

    function filterStrategicOwnership(candidates = [], data = null) {
        try {
            const d = safeData(data);
            return freezeDeliverableGovernance((candidates || []).filter(item => {
                const emp = item?.id || item?.empId ? findEmployee(item.id || item.empId, d) || item : item;
                return isStrategicOwnerRole(item?.role || inferEmployeeRole(emp, d));
            }));
        } catch (err) {
            return Object.freeze([]);
        }
    }

    function getStrategicOwnerOptions(data = null) {
        try {
            const d = safeData(data);
            const fromEmployees = (d.employees || []).map(emp => ({
                id: emp.id,
                empId: emp.id,
                name: emp.name || emp.id,
                role: inferEmployeeRole(emp, d),
                department: emp.dept || emp.department || '',
                designation: emp.desig || emp.designation || ''
            }));
            const filtered = filterStrategicOwnership(fromEmployees, d).map(item => ({
                value: item.empId || item.id,
                label: `${item.name} - ${displayNameForRole(item.role)}${item.department ? ' - ' + item.department : ''}`,
                role: item.role,
                name: item.name
            }));
            return freezeDeliverableGovernance(filtered);
        } catch (err) {
            return Object.freeze([]);
        }
    }

    function normalizeReviewAction(action, status) {
        const raw = String(action || '').trim().replace(/[\s-]+/g, '_').toUpperCase();
        if (raw === 'COMPLETE' || raw === 'CLOSE' || raw === 'CLOSE_DELIVERABLE') return 'COMPLETE_DELIVERABLE';
        if (raw === 'AT_RISK' || raw === 'MARK_RISK') return 'MARK_AT_RISK';
        if (REVIEW_ACTIONS.includes(raw)) return raw;
        const st = String(status || '').trim().toLowerCase();
        if (st === 'critical' || st === 'at risk') return 'ESCALATE_RISK';
        if (st === 'attention' || st.includes('clarification')) return 'REQUEST_CLARIFICATION';
        if (st === 'rejected' || st.includes('reject')) return 'REJECT_PROGRESS';
        return 'APPROVE_PROGRESS';
    }

    function normalizeReviewEntry(review = {}, deliverable = {}, data = null) {
        try {
            const governed = normalizeDeliverableRecord(deliverable, data);
            const isContributorUpdate = !review.managerId && !review.reviewerId && !!review.employeeProgressNote;
            const reviewerAction = isContributorUpdate ? 'CONTRIBUTOR_UPDATE' : normalizeReviewAction(review.reviewerAction || review.actionType, review.reviewStatus || review.riskLevel);
            const reviewStatus = isContributorUpdate
                ? 'UNDER_REVIEW'
                : reviewerAction === 'ESCALATE_RISK'
                    ? 'Critical'
                    : reviewerAction === 'REQUEST_CLARIFICATION'
                        ? 'Needs Clarification'
                        : reviewerAction === 'REJECT_PROGRESS'
                            ? 'Rejected'
                            : (review.reviewStatus || 'On Track');
            return freezeDeliverableGovernance({
                ...review,
                reviewerAction,
                reviewStatus,
                riskLevel: reviewerAction === 'ESCALATE_RISK' ? 'Critical' : reviewStatus,
                contributorUpdate: isContributorUpdate,
                reviewerId: review.reviewerId || review.managerId || governed.reviewerId || '',
                reviewerRole: review.reviewerRole || governed.reviewerRole || 'manager',
                sponsorRole: governed.sponsorRole || 'hr_head',
                governanceState: isContributorUpdate ? 'UNDER_REVIEW' : actionState(reviewerAction)
            });
        } catch (err) {
            return freezeDeliverableGovernance({ ...review, reviewerAction: 'APPROVE_PROGRESS', reviewStatus: review.reviewStatus || 'On Track' });
        }
    }

    function actionState(action) {
        if (action === 'REQUEST_CLARIFICATION' || action === 'REJECT_PROGRESS') return 'NEEDS_CLARIFICATION';
        if (action === 'MARK_AT_RISK') return 'AT_RISK';
        if (action === 'COMPLETE_DELIVERABLE') return 'COMPLETED';
        if (action === 'ESCALATE_RISK') return 'ESCALATED';
        return 'APPROVED';
    }

    function applyReviewOutcome(deliverable = {}, review = {}) {
        try {
            const action = review.reviewerAction || normalizeReviewAction(review.actionType, review.reviewStatus);
            if (action === 'CONTRIBUTOR_UPDATE') return freezeDeliverableGovernance({ currentStatus: 'Under Review', status: 'Under Review', governanceState: 'UNDER_REVIEW' });
            if (action === 'REQUEST_CLARIFICATION') return freezeDeliverableGovernance({ currentStatus: 'Needs Clarification', status: 'Needs Clarification', governanceState: 'NEEDS_CLARIFICATION' });
            if (action === 'REJECT_PROGRESS') return freezeDeliverableGovernance({ currentStatus: 'Needs Clarification', status: 'Needs Clarification', governanceState: 'NEEDS_CLARIFICATION' });
            if (action === 'MARK_AT_RISK') return freezeDeliverableGovernance({ currentStatus: 'At Risk', status: 'At Risk', governanceState: 'AT_RISK', lastRiskLevel: 'At Risk' });
            if (action === 'ESCALATE_RISK') return freezeDeliverableGovernance({ currentStatus: 'Escalated', status: 'Escalated', governanceState: 'ESCALATED', lastRiskLevel: 'Critical' });
            if (action === 'COMPLETE_DELIVERABLE') return freezeDeliverableGovernance({ currentStatus: 'Approved', status: 'Approved', governanceState: 'APPROVED' });
            const progress = Number(review.progressPercent ?? review.progress ?? deliverable.progressPercent ?? deliverable.progress ?? 0) || 0;
            return freezeDeliverableGovernance({
                currentStatus: progress >= 100 ? 'Approved' : 'Active',
                status: progress >= 100 ? 'Approved' : 'Active',
                governanceState: progress >= 100 ? 'APPROVED' : 'ACTIVE'
            });
        } catch (err) {
            return freezeDeliverableGovernance({});
        }
    }

    function isContributorOnDeliverable(deliverable = {}, empId = '', data = null) {
        try {
            const id = String(empId || '').trim();
            if (!id) return false;
            const governed = normalizeDeliverableRecord(deliverable, data);
            return (governed.contributors || []).some(c => c.empId === id) || deliverable.empId === id;
        } catch (err) {
            return false;
        }
    }

    function canViewDeliverable(deliverable = {}, viewer = {}, data = null) {
        try {
            const role = normalizeRole(viewer.role || viewer.userRole);
            const empId = viewer.empId || viewer.id || '';
            const governed = normalizeDeliverableRecord(deliverable, data);
            if (role === 'director') return true;
            if (role === 'hr' || role === 'hr_head') return true;
            if (role === 'manager') return governed.strategicOwnerId === empId || governed.reviewerId === empId || deliverable.managerId === empId || isContributorOnDeliverable(deliverable, empId, data);
            if (role === 'employee') return isContributorOnDeliverable(deliverable, empId, data);
            return false;
        } catch (err) {
            return false;
        }
    }

    function recordGovernanceMetric(type, metadata = {}) {
        try {
            if (global.OrchestrationMetricsService?.recordWorkflowMetric) {
                global.OrchestrationMetricsService.recordWorkflowMetric(type, { module: 'Strategic Deliverables', ...metadata });
            }
        } catch (err) {}
    }

    function auditGovernance(action, event = {}, context = {}) {
        try {
            if (global.AuditService?.recordAudit) {
                global.AuditService.recordAudit({
                    eventType: action,
                    module: 'Strategic Deliverables',
                    eventId: event.reviewId || event.deliverableId || event.id || '',
                    actorId: context.actorId || event.actorId || '',
                    employeeId: event.empId || '',
                    source: 'deliverableGovernanceService',
                    severity: event.severity || 'INFO',
                    metadata: { ...event.metadata, action }
                }, context);
            }
        } catch (err) {}
    }

    function runSelfTest() {
        const data = {
            users: [
                { id: 'U1', role: 'employee', empId: 'E1', email: 'e1@example.com' },
                { id: 'U2', role: 'manager', empId: 'M1', email: 'm1@example.com' }
            ],
            employees: [
                { id: 'E1', name: 'Employee One', email: 'e1@example.com', managerId: 'M1' },
                { id: 'M1', name: 'Manager One', email: 'm1@example.com', desig: 'Manager' }
            ]
        };
        const governed = normalizeDeliverableRecord({ id: 'D1', empId: 'E1', managerId: 'M1', status: 'Active' }, data);
        const update = normalizeReviewEntry({ employeeProgressNote: 'Done' }, governed, data);
        const escalation = normalizeReviewEntry({ reviewerAction: 'ESCALATE_RISK' }, governed, data);
        const checks = [
            !isStrategicOwnerRole('employee'),
            governed.strategicOwnerId === 'M1',
            governed.contributors.some(c => c.empId === 'E1'),
            update.governanceState === 'UNDER_REVIEW',
            escalation.governanceState === 'ESCALATED',
            Object.isFrozen(governed),
            Object.isFrozen(getStrategicOwnerOptions(data))
        ];
        if (!checks.every(Boolean)) console.warn('[deliverableGovernanceService] Self-test warnings detected.', checks);
        return checks.every(Boolean);
    }

    const api = Object.freeze({
        OWNER_ROLES,
        CONTRIBUTOR_ROLES,
        WORKFLOW_STATES,
        REVIEW_ACTIONS,
        isStrategicOwnerRole,
        isContributorRole,
        normalizeDeliverableRole,
        filterStrategicOwnership,
        freezeDeliverableGovernance,
        getStrategicOwnerOptions,
        normalizeDeliverableRecord,
        normalizeReviewEntry,
        applyReviewOutcome,
        isContributorOnDeliverable,
        canViewDeliverable,
        recordGovernanceMetric,
        auditGovernance,
        runSelfTest
    });

    global.deliverableGovernanceService = api;
    global.DeliverableGovernanceService = api;

    if (global.__ARTHHRMS_DEV__) {
        try { runSelfTest(); } catch (err) { console.warn('[deliverableGovernanceService] Self-test failed safely.', err?.message || err); }
    }
})(typeof window !== 'undefined' ? window : globalThis);
