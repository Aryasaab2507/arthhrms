/**
 * strategicReviewService.js
 * ARTHHRMS - Manager Strategic Review + Accountability Center
 *
 * PURPOSE:
 * Provides centralized reviewer visibility and governed review actions
 * for Strategic Deliverables.
 *
 * This service manages:
 * - pending contributor update queues
 * - reviewer decisions
 * - clarification and escalation flows
 * - accountability health snapshots
 *
 * This service does NOT:
 * - auto-approve contributor updates
 * - replace workflow orchestration
 * - make SUPER_ADMIN a strategic owner
 *
 * @version 1.0.0
 */
(function (global) {
    'use strict';

    const REVIEW_ACTIONS = Object.freeze([
        'APPROVE_PROGRESS',
        'REQUEST_CLARIFICATION',
        'REJECT_PROGRESS',
        'ESCALATE_RISK',
        'MARK_AT_RISK',
        'COMPLETE_DELIVERABLE'
    ]);

    const REVIEW_STATUSES = Object.freeze({
        PENDING_REVIEW: 'PENDING_REVIEW',
        APPROVED: 'APPROVED',
        NEEDS_CLARIFICATION: 'NEEDS_CLARIFICATION',
        REJECTED: 'REJECTED',
        ESCALATED: 'ESCALATED',
        AT_RISK: 'AT_RISK',
        COMPLETED: 'COMPLETED',
        OVERDUE_REVIEW: 'OVERDUE_REVIEW'
    });

    function freezeReviewOutput(value) {
        if (Array.isArray(value)) return Object.freeze(value.map(item => freezeReviewOutput(item)));
        if (value && typeof value === 'object') {
            const clone = {};
            Object.keys(value).forEach(key => { clone[key] = freezeReviewOutput(value[key]); });
            return Object.freeze(clone);
        }
        return value;
    }

    function db() {
        return global.DB || null;
    }

    function data() {
        try { return db()?.get ? db().get() : {}; } catch (err) { return {}; }
    }

    function today() {
        try { return db()?.today ? db().today() : new Date().toISOString().slice(0, 10); } catch (err) { return new Date().toISOString().slice(0, 10); }
    }

    function ageDays(dateValue) {
        if (!dateValue) return 0;
        const t = new Date(dateValue).getTime();
        if (!Number.isFinite(t)) return 0;
        return Math.max(0, Math.floor((Date.now() - t) / 86400000));
    }

    function normalizeReviewAction(action) {
        try {
            const raw = String(action || '').trim().replace(/[\s-]+/g, '_').toUpperCase();
            if (raw === 'APPROVE' || raw === 'ACCEPT') return 'APPROVE_PROGRESS';
            if (raw === 'CLARIFY' || raw === 'NEEDS_CLARIFICATION') return 'REQUEST_CLARIFICATION';
            if (raw === 'REJECT') return 'REJECT_PROGRESS';
            if (raw === 'ESCALATE' || raw === 'CRITICAL') return 'ESCALATE_RISK';
            if (raw === 'AT_RISK' || raw === 'RISK') return 'MARK_AT_RISK';
            if (raw === 'COMPLETE' || raw === 'CLOSE' || raw === 'CLOSE_DELIVERABLE') return 'COMPLETE_DELIVERABLE';
            if (REVIEW_ACTIONS.includes(raw)) return raw;
            return 'APPROVE_PROGRESS';
        } catch (err) {
            return 'APPROVE_PROGRESS';
        }
    }

    function findEmployee(empId, sourceData = data()) {
        const id = String(empId || '').trim();
        return (sourceData.employees || []).find(emp => emp.id === id || emp.empId === id) || null;
    }

    function findDeliverable(deliverableId, sourceData = data()) {
        const id = String(deliverableId || '').trim();
        return (sourceData.strategicDeliverables || []).find(row => row.id === id || row.deliverableId === id) || null;
    }

    function findReview(reviewId, sourceData = data()) {
        const id = String(reviewId || '').trim();
        return (sourceData.deliverableReviews || []).find(row => row.id === id || row.reviewId === id || row.review_id === id) || null;
    }

    function governedDeliverable(deliverable, sourceData = data()) {
        try {
            return global.deliverableGovernanceService?.normalizeDeliverableRecord
                ? global.deliverableGovernanceService.normalizeDeliverableRecord(deliverable, sourceData)
                : freezeReviewOutput({ ...(deliverable || {}) });
        } catch (err) {
            return freezeReviewOutput({ ...(deliverable || {}) });
        }
    }

    function calculateReviewRisk(item = {}) {
        try {
            const age = Number(item.ageDays ?? ageDays(item.submitted_at || item.reviewDate || item.deadlineDate)) || 0;
            const due = item.deadlineDate || item.dueDate || '';
            const overdue = due && due < today();
            const state = String(item.escalation_state || item.governanceState || item.review_status || '').toUpperCase();
            if (state.includes('ESCALATED') || item.risk_level === 'CRITICAL') return 'CRITICAL';
            if (overdue || age > 7) return 'HIGH';
            if (age > 2 || state.includes('CLARIFICATION') || state.includes('AT_RISK')) return 'MEDIUM';
            return 'LOW';
        } catch (err) {
            return 'LOW';
        }
    }

    function queueStatusForReview(review = {}) {
        const action = String(review.reviewerAction || '').toUpperCase();
        if (action === 'CONTRIBUTOR_UPDATE') return REVIEW_STATUSES.PENDING_REVIEW;
        const state = String(review.governanceState || review.reviewStatus || '').toUpperCase();
        if (state.includes('CLARIFICATION')) return REVIEW_STATUSES.NEEDS_CLARIFICATION;
        if (state.includes('ESCALATED')) return REVIEW_STATUSES.ESCALATED;
        if (state.includes('AT_RISK')) return REVIEW_STATUSES.AT_RISK;
        if (state.includes('COMPLETED')) return REVIEW_STATUSES.COMPLETED;
        if (state.includes('REJECT')) return REVIEW_STATUSES.REJECTED;
        if (state.includes('APPROVED')) return REVIEW_STATUSES.APPROVED;
        return REVIEW_STATUSES.PENDING_REVIEW;
    }

    function isReviewPending(review = {}) {
        return queueStatusForReview(review) === REVIEW_STATUSES.PENDING_REVIEW && String(review.reviewerAction || '').toUpperCase() === 'CONTRIBUTOR_UPDATE';
    }

    function normalizeQueueItem(review = {}, deliverable = {}, sourceData = data()) {
        try {
            const governed = governedDeliverable(deliverable, sourceData);
            const contributorId = review.empId || deliverable.empId || '';
            const contributor = findEmployee(contributorId, sourceData);
            const submittedAt = review.submittedAt || review.submitted_at || review.reviewDate || review.reviewedOn || today();
            const base = {
                review_id: review.reviewId || review.id || review.review_id || '',
                deliverable_id: governed.deliverableId || governed.id || review.deliverableId || '',
                contributor_id: contributorId,
                contributor_name: contributor?.name || governed.employeeName || contributorId,
                reviewer_id: review.reviewerId || review.reviewer_id || governed.reviewerId || governed.managerId || governed.strategicOwnerId || '',
                strategic_owner_id: governed.strategicOwnerId || '',
                strategic_owner_name: governed.strategicOwnerName || '',
                submitted_at: submittedAt,
                review_status: queueStatusForReview(review),
                risk_level: review.risk_level || review.riskLevel || governed.lastRiskLevel || 'Attention',
                escalation_state: review.escalation_state || review.governanceState || governed.governanceState || 'UNDER_REVIEW',
                deliverable_title: governed.deliverableTitle || governed.title || '',
                deadlineDate: governed.deadlineDate || governed.dueDate || '',
                progressPercent: Number(review.progressPercent ?? review.progress ?? governed.progressPercent ?? governed.progress ?? 0) || 0,
                ageDays: ageDays(submittedAt),
                metadata: {
                    source: 'strategicReviewService',
                    reviewerAction: review.reviewerAction || '',
                    governanceState: review.governanceState || governed.governanceState || ''
                }
            };
            return freezeReviewOutput({ ...base, calculatedRisk: calculateReviewRisk(base) });
        } catch (err) {
            return freezeReviewOutput({
                review_id: review.reviewId || review.id || '',
                deliverable_id: review.deliverableId || '',
                contributor_id: review.empId || '',
                reviewer_id: review.reviewerId || '',
                submitted_at: review.reviewDate || today(),
                review_status: REVIEW_STATUSES.PENDING_REVIEW,
                risk_level: 'Attention',
                escalation_state: 'UNDER_REVIEW',
                metadata: { warning: 'QUEUE_NORMALIZATION_FAILED' }
            });
        }
    }

    function matchesReviewer(item, target = {}) {
        const reviewerId = String(target.reviewerId || target.empId || target.id || '').trim();
        const role = String(target.role || '').trim().toLowerCase();
        if (!reviewerId && !role) return true;
        if (reviewerId && [item.reviewer_id, item.strategic_owner_id].includes(reviewerId)) return true;
        if (role === 'director') return true;
        if (role === 'hr' || role === 'hr_head') return true;
        return false;
    }

    function createReviewQueue(target = {}) {
        try {
            const sourceData = data();
            const items = [];
            (sourceData.deliverableReviews || []).forEach(review => {
                if (!isReviewPending(review)) return;
                const deliverable = findDeliverable(review.deliverableId, sourceData);
                if (!deliverable) return;
                const item = normalizeQueueItem(review, deliverable, sourceData);
                if (matchesReviewer(item, target)) items.push(item);
            });
            (sourceData.strategicDeliverables || []).forEach(deliverable => {
                const governed = governedDeliverable(deliverable, sourceData);
                const closed = ['Achieved', 'Failed', 'Exceeded', 'Closed'].includes(governed.finalClosureStatus || governed.currentStatus);
                const overdue = (governed.deadlineDate || governed.dueDate || '') < today();
                if (!closed && overdue && !items.some(item => item.deliverable_id === (governed.deliverableId || governed.id))) {
                    const item = freezeReviewOutput({
                        review_id: `OVERDUE-${governed.deliverableId || governed.id}`,
                        deliverable_id: governed.deliverableId || governed.id,
                        contributor_id: governed.empId || '',
                        contributor_name: governed.employeeName || governed.empId || '',
                        reviewer_id: governed.reviewerId || governed.managerId || governed.strategicOwnerId || '',
                        strategic_owner_id: governed.strategicOwnerId || '',
                        strategic_owner_name: governed.strategicOwnerName || '',
                        submitted_at: governed.lastReviewOn || governed.assignedDate || governed.createdOn || today(),
                        review_status: REVIEW_STATUSES.OVERDUE_REVIEW,
                        risk_level: 'Critical',
                        escalation_state: governed.governanceState || 'AT_RISK',
                        deliverable_title: governed.deliverableTitle || governed.title || '',
                        deadlineDate: governed.deadlineDate || governed.dueDate || '',
                        progressPercent: Number(governed.progressPercent ?? governed.progress ?? 0) || 0,
                        ageDays: ageDays(governed.deadlineDate || governed.dueDate),
                        calculatedRisk: 'HIGH',
                        metadata: { source: 'strategicReviewService', synthetic: true }
                    });
                    if (matchesReviewer(item, target)) items.push(item);
                }
            });
            items.sort((a, b) => {
                const riskRank = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
                return (riskRank[b.calculatedRisk] || 0) - (riskRank[a.calculatedRisk] || 0) ||
                    String(a.submitted_at || '').localeCompare(String(b.submitted_at || ''));
            });
            recordMetric('STRATEGIC_REVIEW_QUEUE_GENERATED', { count: items.length, reviewerId: target.reviewerId || target.empId || '' });
            return freezeReviewOutput(items);
        } catch (err) {
            safeWarn('createReviewQueue failed', err);
            return Object.freeze([]);
        }
    }

    function safeReviewEscalation(action, context = {}) {
        const normalized = normalizeReviewAction(action);
        const risk = calculateReviewRisk(context);
        if (normalized === 'ESCALATE_RISK') {
            let policy = null;
            try {
                if (global.EscalationPolicyService?.evaluateEscalation) {
                    policy = global.EscalationPolicyService.evaluateEscalation({
                        type: 'STRATEGIC_REVIEW_ESCALATION',
                        module: 'Strategic Deliverables',
                        status: 'failed',
                        priority: 'CRITICAL',
                        metadata: { deliverableId: context.deliverableId || context.id || '' }
                    }, context);
                }
            } catch (err) {
                policy = { warning: 'ESCALATION_POLICY_UNAVAILABLE' };
            }
            return freezeReviewOutput({
                escalated: true,
                escalationState: 'ESCALATED',
                targetRole: policy?.recommendedRoles?.[0] || (risk === 'CRITICAL' ? 'DIRECTOR' : 'HR_HEAD'),
                reason: context.remark || 'Reviewer escalated strategic accountability risk.',
                policy
            });
        }
        if (normalized === 'MARK_AT_RISK') {
            return freezeReviewOutput({
                escalated: false,
                escalationState: 'AT_RISK',
                targetRole: 'HR_HEAD',
                reason: context.remark || 'Reviewer marked strategic accountability at risk.'
            });
        }
        return freezeReviewOutput({ escalated: false, escalationState: 'NORMAL', targetRole: '', reason: '' });
    }

    function recordMetric(type, metadata = {}) {
        try {
            if (global.OrchestrationMetricsService?.recordWorkflowMetric) {
                global.OrchestrationMetricsService.recordWorkflowMetric(type, { module: 'Strategic Deliverables', ...metadata });
            }
        } catch (err) {}
    }

    function auditReview(action, event = {}, context = {}) {
        try {
            if (global.AuditService?.recordAudit) {
                global.AuditService.recordAudit({
                    eventType: action,
                    module: 'Strategic Deliverables',
                    eventId: event.reviewId || event.review_id || event.deliverableId || event.deliverable_id || '',
                    actorId: context.reviewerId || context.actorId || '',
                    employeeId: event.empId || event.contributor_id || '',
                    source: 'strategicReviewService',
                    severity: action === 'ESCALATE_RISK' ? 'HIGH' : 'INFO',
                    metadata: { ...event.metadata, reviewAction: action }
                }, context);
            }
        } catch (err) {}
    }

    function safeWarn(message, err) {
        try { console.warn('[strategicReviewService]', message, err?.message || err || ''); } catch (e) {}
    }

    function actionReviewStatus(action) {
        if (action === 'REQUEST_CLARIFICATION') return 'Needs Clarification';
        if (action === 'REJECT_PROGRESS') return 'Rejected';
        if (action === 'ESCALATE_RISK') return 'Critical';
        if (action === 'MARK_AT_RISK') return 'At Risk';
        if (action === 'COMPLETE_DELIVERABLE') return 'Approved';
        return 'On Track';
    }

    function performReviewAction(reviewId, action, options = {}) {
        try {
            const normalized = normalizeReviewAction(action);
            const sourceData = data();
            const review = findReview(reviewId, sourceData);
            const deliverableId = review?.deliverableId || String(reviewId || '').replace(/^OVERDUE-/, '');
            const deliverable = findDeliverable(deliverableId, sourceData);
            if (!deliverable) return freezeReviewOutput({ success: false, error: 'DELIVERABLE_NOT_FOUND', reviewAction: normalized });
            const reviewerId = db()?.resolveEmployeeId ? db().resolveEmployeeId(options.reviewerId || options.empId || options.actorId || deliverable.reviewerId || deliverable.managerId || deliverable.strategicOwnerId || '', sourceData) : (options.reviewerId || deliverable.reviewerId || '');
            if (!review && !String(reviewId || '').startsWith('OVERDUE-')) return freezeReviewOutput({ success: false, error: 'REVIEW_NOT_FOUND', reviewAction: normalized });
            if (normalized === 'COMPLETE_DELIVERABLE' && (!options.kpiValidated || !String(options.closureRemarks || options.remark || '').trim())) {
                return freezeReviewOutput({ success: false, error: 'KPI_VALIDATION_AND_CLOSURE_REMARKS_REQUIRED', reviewAction: normalized });
            }

            const escalation = safeReviewEscalation(normalized, { ...options, ...deliverable });
            const resultReview = db().addDeliverableReview({
                deliverableId: deliverable.deliverableId || deliverable.id,
                managerId: reviewerId,
                reviewerId,
                reviewerAction: normalized,
                reviewDate: options.reviewDate || today(),
                reviewMonth: String(options.reviewDate || today()).slice(0, 7),
                progressPercent: normalized === 'COMPLETE_DELIVERABLE' ? 100 : (options.progressPercent ?? review?.progressPercent ?? deliverable.progressPercent ?? deliverable.progress ?? 0),
                reviewStatus: actionReviewStatus(normalized),
                managerRemark: options.remark || options.closureRemarks || '',
                managerAchievements: options.kpiValidated ? 'KPI validated' : (options.achievements || ''),
                managerBottlenecks: options.bottlenecks || ''
            });

            if (normalized === 'COMPLETE_DELIVERABLE') {
                db().closeDeliverable(deliverable.deliverableId || deliverable.id, 'Achieved', options.closureRemarks || options.remark || 'Completed by reviewer');
            }

            const latest = findDeliverable(deliverable.deliverableId || deliverable.id, data()) || deliverable;
            recordMetric(`STRATEGIC_REVIEW_${normalized}`, {
                reviewId,
                deliverableId: deliverable.deliverableId || deliverable.id,
                reviewerId,
                escalationState: escalation.escalationState
            });
            auditReview(normalized, resultReview || review || deliverable, { reviewerId, actorId: reviewerId, options: { ...options } });
            return freezeReviewOutput({
                success: true,
                reviewId,
                reviewAction: normalized,
                escalation,
                review: resultReview,
                deliverable: latest,
                replayVisible: true
            });
        } catch (err) {
            safeWarn('performReviewAction failed', err);
            return freezeReviewOutput({ success: false, error: err?.message || 'REVIEW_ACTION_FAILED', reviewAction: normalizeReviewAction(action) });
        }
    }

    function getReviewCenterSnapshot(target = {}) {
        try {
            const queue = createReviewQueue(target);
            const sourceData = data();
            const deliverables = (sourceData.strategicDeliverables || []).map(row => governedDeliverable(row, sourceData));
            const reviews = sourceData.deliverableReviews || [];
            const active = deliverables.filter(row => !['Achieved', 'Failed', 'Exceeded', 'Closed'].includes(row.finalClosureStatus || row.currentStatus));
            const delayed = active.filter(row => (row.deadlineDate || row.dueDate || '') < today());
            const escalations = active.filter(row => ['ESCALATED', 'AT_RISK'].includes(row.governanceState || '') || ['Critical', 'At Risk'].includes(row.lastRiskLevel || ''));
            const reviewEscalations = reviews.filter(row => ['ESCALATE_RISK', 'MARK_AT_RISK'].includes(row.reviewerAction) || ['ESCALATED', 'AT_RISK'].includes(row.governanceState || ''));
            const clarification = active.filter(row => row.governanceState === 'NEEDS_CLARIFICATION');
            const snapshot = {
                success: true,
                reviewerId: target.reviewerId || target.empId || target.id || '',
                queue,
                metrics: {
                    pendingReviews: queue.filter(item => item.review_status === REVIEW_STATUSES.PENDING_REVIEW).length,
                    overdueReviews: queue.filter(item => item.review_status === REVIEW_STATUSES.OVERDUE_REVIEW).length,
                    delayedApprovals: queue.filter(item => item.ageDays > 2).length,
                    escalations: Math.max(escalations.length, reviewEscalations.length),
                    clarificationLoops: clarification.length,
                    delayedDeliverables: delayed.length,
                    accountabilityHealth: active.length ? Math.max(0, Math.round(100 - delayed.length * 10 - escalations.length * 12 - queue.length * 4)) : 100
                },
                generatedAt: new Date().toISOString()
            };
            return freezeReviewOutput(snapshot);
        } catch (err) {
            safeWarn('getReviewCenterSnapshot failed', err);
            return freezeReviewOutput({ success: false, queue: [], metrics: {}, error: err?.message || 'SNAPSHOT_FAILED' });
        }
    }

    function runSelfTest() {
        const malformed = normalizeQueueItem({ reviewId: 'R1' }, {}, { employees: [], strategicDeliverables: [] });
        const queue = createReviewQueue({});
        const escalation = safeReviewEscalation('ESCALATE_RISK', { ageDays: 9 });
        const checks = [
            normalizeReviewAction('complete') === 'COMPLETE_DELIVERABLE',
            malformed.review_id === 'R1',
            Object.isFrozen(malformed),
            Object.isFrozen(queue),
            escalation.escalated === true
        ];
        if (!checks.every(Boolean)) safeWarn('self-test warnings detected', checks);
        return checks.every(Boolean);
    }

    const api = Object.freeze({
        REVIEW_ACTIONS,
        REVIEW_STATUSES,
        createReviewQueue,
        getReviewCenterSnapshot,
        performReviewAction,
        normalizeReviewAction,
        safeReviewEscalation,
        freezeReviewOutput,
        calculateReviewRisk,
        runSelfTest
    });

    global.StrategicReviewService = api;
    global.strategicReviewService = api;

    if (global.__ARTHHRMS_DEV__) {
        try { runSelfTest(); } catch (err) { safeWarn('self-test failed safely', err); }
    }
})(typeof window !== 'undefined' ? window : globalThis);
