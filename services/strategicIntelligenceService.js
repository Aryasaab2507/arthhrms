/**
 * strategicIntelligenceService.js
 * ARTHHRMS - Director Strategic Intelligence + Organization Risk Board
 *
 * PURPOSE:
 * Provides organization-wide strategic oversight visibility for Directors.
 *
 * This service computes:
 * - executive strategic KPIs
 * - department execution health
 * - review backlog intelligence
 * - escalation concentration
 * - organization-level strategic risks
 *
 * This service does NOT:
 * - approve contributor updates
 * - manage contributor tasks
 * - bypass reviewer workflows
 * - mutate strategic deliverable records
 *
 * ARCHITECTURE RULE:
 * Director intelligence is read-only oversight, not execution.
 *
 * STABILITY:
 * Existing strategic deliverable and review workflows remain compatible.
 *
 * DEPENDS ON:
 * - window.StrategicReviewService (optional)
 * - window.DeliverableGovernanceService (optional)
 * - window.EscalationPolicyService (optional)
 * - window.OrchestrationMetricsService (optional)
 * - window.AuditService (optional)
 * - window.EventReplayService (optional)
 *
 * @version 1.0.0
 */
(function (global) {
    'use strict';

    const RISK_CATEGORIES = Object.freeze([
        'HIGH_RISK_DELIVERABLE',
        'REVIEW_BOTTLENECK',
        'KPI_FAILURE_RISK',
        'DEPARTMENT_DELAY',
        'ESCALATION_CLUSTER',
        'CONTRIBUTOR_BLOCKAGE'
    ]);

    const SEVERITIES = Object.freeze(['INFO', 'WARNING', 'HIGH', 'CRITICAL']);
    const DIRECTOR_ACTIONS = Object.freeze([
        'ACKNOWLEDGE_RISK',
        'REQUEST_INTERVENTION',
        'REQUEST_REVIEW'
    ]);
    const EXECUTION_ACTIONS = Object.freeze([
        'APPROVE_PROGRESS',
        'REQUEST_CLARIFICATION',
        'REJECT_PROGRESS',
        'ESCALATE_RISK',
        'MARK_AT_RISK',
        'COMPLETE_DELIVERABLE'
    ]);
    const CLOSED_STATUSES = Object.freeze(['ACHIEVED', 'FAILED', 'EXCEEDED', 'CLOSED', 'COMPLETED']);
    const STRATEGIC_STATES = Object.freeze({
        PLANNED: 'PLANNED',
        IN_PROGRESS: 'IN_PROGRESS',
        REVIEW_PENDING: 'REVIEW_PENDING',
        ESCALATED: 'ESCALATED',
        BLOCKED: 'BLOCKED',
        COMPLETED: 'COMPLETED',
        ARCHIVED: 'ARCHIVED'
    });
    const STRATEGIC_RISK_LEVELS = Object.freeze({
        INFO: 'INFO',
        WARNING: 'WARNING',
        HIGH_RISK: 'HIGH_RISK',
        CRITICAL_BLOCKER: 'CRITICAL_BLOCKER'
    });
    const SENSITIVE_KEY_PATTERN = /(salary|payroll.?amount|payrollAmount|payslip|compensation|ctc|leave.?balance|gross|net|basic|hra|pf|tds|allowance|deduction|password|secret|token|jwt|authorization|service.?role|private.?key|employeeName)/i;
    let lastSelfTestChecks = Object.freeze([]);

    function freezeStrategicIntelligence(value) {
        if (Array.isArray(value)) return Object.freeze(value.map(item => freezeStrategicIntelligence(item)));
        if (value && typeof value === 'object') {
            const clone = {};
            Object.keys(value).forEach(key => {
                clone[key] = freezeStrategicIntelligence(value[key]);
            });
            return Object.freeze(clone);
        }
        return value;
    }

    function cloneStrategicValue(value, depth = 0) {
        if (value === null || value === undefined) return value;
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
        if (typeof value === 'symbol') return value.toString();
        if (depth > 4) return String(value || '');
        if (Array.isArray(value)) return value.slice(0, 300).map(item => cloneStrategicValue(item, depth + 1));
        if (isPlainObject(value)) {
            const output = {};
            Object.keys(value).forEach(key => {
                if (SENSITIVE_KEY_PATTERN.test(key)) return;
                output[key] = cloneStrategicValue(value[key], depth + 1);
            });
            return output;
        }
        return String(value || '');
    }

    function freezeStrategicOutput(value) {
        return freezeStrategicIntelligence(cloneStrategicValue(value, 0));
    }

    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function cloneObject(input) {
        const output = {};
        if (!isPlainObject(input)) return output;
        try {
            Object.keys(input).forEach(key => {
                if (key === 'metadata' && isPlainObject(input[key])) output[key] = cloneObject(input[key]);
                else output[key] = input[key];
            });
        } catch (err) {}
        return output;
    }

    function safeWarn(message, details) {
        try {
            if (global.console && typeof global.console.warn === 'function') {
                global.console.warn('[strategicIntelligenceService]', message, details?.message || details || '');
            }
        } catch (err) {}
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
        try {
            if (!dateValue) return 0;
            const start = new Date(String(dateValue).slice(0, 10) + 'T00:00:00');
            const end = new Date(today() + 'T00:00:00');
            if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return 0;
            return Math.max(0, Math.floor((end - start) / 86400000));
        } catch (err) {
            return 0;
        }
    }

    function normalizeRole(role) {
        return String(role || '').trim().replace(/[\s-]+/g, '_').toLowerCase();
    }

    function safeNumber(value, fallback = 0) {
        const next = Number(value);
        return Number.isFinite(next) ? next : fallback;
    }

    function nowIso() {
        try { return new Date().toISOString(); } catch (err) { return String(Date.now()); }
    }

    function safeString(value, fallback = '') {
        try {
            if (value === undefined || value === null) return fallback;
            if (typeof value === 'symbol') return value.toString();
            return String(value);
        } catch (err) {
            return fallback;
        }
    }

    function normalizeTenantSlug(value) {
        return safeString(value, '').trim().toLowerCase().replace(/^ten[-_]/, '').replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }

    function tenantSlugFromId(value) {
        const token = safeString(value, '').trim().toLowerCase().replace(/[\s_]+/g, '-');
        if (!token) return '';
        if (token.indexOf('ten-') === 0) return normalizeTenantSlug(token.slice(4));
        if (token.indexOf('tenant-') === 0) return normalizeTenantSlug(token.slice(7));
        return normalizeTenantSlug(token);
    }

    function rowTenant(row = {}) {
        const metadata = isPlainObject(row.metadata) ? row.metadata : {};
        const tenantSlug = normalizeTenantSlug(row.tenantSlug || row.tenant_slug || row.companySlug || row.company_slug || metadata.tenantSlug || metadata.tenant_slug || '');
        if (tenantSlug) return tenantSlug;
        return tenantSlugFromId(row.tenantId || row.tenant_id || row.companyId || row.company_id || metadata.tenantId || metadata.companyId || '');
    }

    function percent(part, total) {
        const denominator = safeNumber(total);
        if (!denominator) return 0;
        return Math.round((safeNumber(part) / denominator) * 100);
    }

    function safeSeverity(value) {
        const raw = String(value || '').trim().toUpperCase();
        if (SEVERITIES.includes(raw)) return raw;
        if (raw === 'CRITICAL' || raw === 'BLOCKED') return 'CRITICAL';
        if (raw === 'AT RISK' || raw === 'AT_RISK' || raw === 'HIGH' || raw === 'CRITICAL') return 'HIGH';
        if (raw === 'ATTENTION' || raw === 'MEDIUM' || raw === 'WARNING') return 'WARNING';
        return 'INFO';
    }

    function classifyStrategicRisk(input = {}) {
        const source = isPlainObject(input) ? input : {};
        const severity = safeString(source.severity || source.classification || source.riskLevel || '', '').trim().replace(/[\s-]+/g, '_').toUpperCase();
        if (source.crossTenant === true || severity === 'CRITICAL' || severity === STRATEGIC_RISK_LEVELS.CRITICAL_BLOCKER) return STRATEGIC_RISK_LEVELS.CRITICAL_BLOCKER;
        if (/CROSS_TENANT|TENANT_MISMATCH|DATA_LEAK/i.test(safeString(source.eventType || source.status || source.message || '', ''))) return STRATEGIC_RISK_LEVELS.CRITICAL_BLOCKER;
        if (safeNumber(source.executionFailures || source.failedExecutions || 0) >= 2) return STRATEGIC_RISK_LEVELS.HIGH_RISK;
        if (safeNumber(source.delayedDeliverables || source.overdueDeliverables || 0) >= 2) return STRATEGIC_RISK_LEVELS.HIGH_RISK;
        if (safeNumber(source.contributorBlockage || source.blockedContributors || 0) >= 2) return STRATEGIC_RISK_LEVELS.HIGH_RISK;
        if (safeNumber(source.escalationFrequency || source.escalations || 0) >= 2) return STRATEGIC_RISK_LEVELS.HIGH_RISK;
        if (severity === 'HIGH' || severity === STRATEGIC_RISK_LEVELS.HIGH_RISK || /failed|blocked|overdue|degraded|escalated/i.test(safeString(source.eventType || source.status || '', ''))) return STRATEGIC_RISK_LEVELS.HIGH_RISK;
        if (safeNumber(source.reviewerCongestion || source.pendingReviews || source.clarificationLoops || 0) > 0) return STRATEGIC_RISK_LEVELS.WARNING;
        if (severity === 'WARN' || severity === 'WARNING' || /pending|clarification|congestion|at_risk/i.test(safeString(source.eventType || source.status || '', ''))) return STRATEGIC_RISK_LEVELS.WARNING;
        return STRATEGIC_RISK_LEVELS.INFO;
    }

    function governanceService() {
        return global.DeliverableGovernanceService || global.deliverableGovernanceService || null;
    }

    function reviewService() {
        return global.StrategicReviewService || global.strategicReviewService || null;
    }

    function normalizeDeliverable(row = {}, sourceData = data()) {
        try {
            const service = governanceService();
            if (service?.normalizeDeliverableRecord) return service.normalizeDeliverableRecord(row, sourceData);
            return freezeStrategicIntelligence({ ...(row || {}) });
        } catch (err) {
            return freezeStrategicIntelligence({ ...(row || {}), governanceWarning: 'DELIVERABLE_NORMALIZATION_FAILED' });
        }
    }

    function getDeliverables(sourceData = data()) {
        try {
            const rows = Array.isArray(sourceData.strategicDeliverables) ? sourceData.strategicDeliverables : [];
            return rows.filter(Boolean).map(row => normalizeDeliverable(row, sourceData));
        } catch (err) {
            return [];
        }
    }

    function getReviews(sourceData = data()) {
        try {
            return (Array.isArray(sourceData.deliverableReviews) ? sourceData.deliverableReviews : []).filter(Boolean).map(row => freezeStrategicIntelligence({ ...row, metadata: cloneObject(row.metadata) }));
        } catch (err) {
            return [];
        }
    }

    function findDeliverable(id, sourceData = data()) {
        const value = String(id || '').trim();
        return getDeliverables(sourceData).find(row => row.id === value || row.deliverableId === value) || null;
    }

    function findEmployee(empId, sourceData = data()) {
        const id = String(empId || '').trim();
        return (sourceData.employees || []).find(emp => emp.id === id || emp.empId === id) || null;
    }

    function departmentFor(deliverable = {}, sourceData = data()) {
        const emp = findEmployee(deliverable.empId, sourceData);
        return String(deliverable.department || emp?.dept || emp?.department || 'Unassigned').trim() || 'Unassigned';
    }

    function isClosed(deliverable = {}) {
        const values = [
            deliverable.finalClosureStatus,
            deliverable.currentStatus,
            deliverable.status,
            deliverable.governanceState,
            deliverable.workflowState
        ].map(value => String(value || '').trim().replace(/[\s-]+/g, '_').toUpperCase());
        return values.some(value => CLOSED_STATUSES.includes(value));
    }

    function isDelayed(deliverable = {}) {
        const due = String(deliverable.deadlineDate || deliverable.dueDate || '').slice(0, 10);
        return !!due && due < today() && !isClosed(deliverable) && safeNumber(deliverable.progressPercent ?? deliverable.progress) < 100;
    }

    function isEscalated(deliverable = {}) {
        const text = [
            deliverable.governanceState,
            deliverable.workflowState,
            deliverable.currentStatus,
            deliverable.lastRiskLevel,
            deliverable.priority
        ].join(' ').toUpperCase();
        return /ESCALATED|AT_RISK|CRITICAL/.test(text);
    }

    function reviewsForDeliverable(deliverableId, sourceData = data()) {
        const id = String(deliverableId || '').trim();
        return getReviews(sourceData).filter(row => row.deliverableId === id || row.deliverable_id === id);
    }

    function getReviewQueue(sourceData = data()) {
        try {
            const service = reviewService();
            if (service?.createReviewQueue) return Array.from(service.createReviewQueue({ role: 'director' }) || []);
        } catch (err) {
            safeWarn('Review queue service failed safely.', err);
        }
        const deliverables = getDeliverables(sourceData);
        return getReviews(sourceData)
            .filter(row => String(row.reviewerAction || '').toUpperCase() === 'CONTRIBUTOR_UPDATE')
            .map(row => {
                const deliverable = deliverables.find(item => (item.id || item.deliverableId) === (row.deliverableId || row.deliverable_id)) || {};
                return {
                    review_id: row.reviewId || row.id || row.review_id || '',
                    deliverable_id: row.deliverableId || row.deliverable_id || '',
                    contributor_id: row.empId || row.contributor_id || deliverable.empId || '',
                    reviewer_id: row.reviewerId || row.reviewer_id || deliverable.reviewerId || deliverable.managerId || '',
                    submitted_at: row.submitted_at || row.reviewDate || row.reviewedOn || '',
                    review_status: row.review_status || 'PENDING_REVIEW',
                    risk_level: row.risk_level || row.riskLevel || 'Attention',
                    escalation_state: row.escalation_state || row.governanceState || 'UNDER_REVIEW',
                    deliverable_title: deliverable.deliverableTitle || deliverable.title || '',
                    deadlineDate: deliverable.deadlineDate || deliverable.dueDate || '',
                    progressPercent: safeNumber(row.progressPercent ?? row.progress ?? deliverable.progressPercent ?? deliverable.progress)
                };
            });
    }

    function calculateDepartmentHealth(department, sourceData = data()) {
        try {
            const dept = String(department || 'Unassigned').trim() || 'Unassigned';
            const deliverables = getDeliverables(sourceData).filter(row => departmentFor(row, sourceData) === dept);
            const total = deliverables.length;
            const closed = deliverables.filter(isClosed).length;
            const delayed = deliverables.filter(isDelayed).length;
            const escalated = deliverables.filter(isEscalated).length;
            const pendingQueue = getReviewQueue(sourceData).filter(item => {
                const deliverable = findDeliverable(item.deliverable_id, sourceData);
                return deliverable && departmentFor(deliverable, sourceData) === dept;
            });
            const active = Math.max(0, total - closed);
            const completionRate = percent(closed, total);
            const bottleneckPenalty = Math.min(50, pendingQueue.length * 7);
            const score = Math.max(0, Math.round(100 - delayed * 14 - escalated * 16 - bottleneckPenalty - (active ? 100 - completionRate : 0) * 0.15));
            return freezeStrategicIntelligence({
                department: dept,
                totalDeliverables: total,
                activeDeliverables: active,
                completedDeliverables: closed,
                delayedDeliverables: delayed,
                escalatedDeliverables: escalated,
                pendingReviews: pendingQueue.length,
                completionRate,
                healthScore: score,
                riskLevel: score < 45 || escalated > 0 ? 'HIGH' : score < 70 || delayed > 0 ? 'WARNING' : 'INFO'
            });
        } catch (err) {
            return freezeStrategicIntelligence({
                department: String(department || 'Unassigned'),
                totalDeliverables: 0,
                activeDeliverables: 0,
                completedDeliverables: 0,
                delayedDeliverables: 0,
                escalatedDeliverables: 0,
                pendingReviews: 0,
                completionRate: 0,
                healthScore: 100,
                riskLevel: 'INFO',
                warning: 'DEPARTMENT_HEALTH_FAILED_SAFE'
            });
        }
    }

    function calculateEscalationDensity(sourceData = data()) {
        try {
            const deliverables = getDeliverables(sourceData);
            const reviews = getReviews(sourceData);
            const escalationReviews = reviews.filter(row => /ESCALATE_RISK|MARK_AT_RISK|ESCALATED|AT_RISK|CRITICAL/i.test([
                row.reviewerAction,
                row.governanceState,
                row.escalation_state,
                row.reviewStatus,
                row.riskLevel,
                row.risk_level
            ].join(' ')));
            const escalatedDeliverables = deliverables.filter(isEscalated);
            const departments = {};
            escalatedDeliverables.forEach(row => {
                const dept = departmentFor(row, sourceData);
                departments[dept] = (departments[dept] || 0) + 1;
            });
            escalationReviews.forEach(row => {
                const deliverable = findDeliverable(row.deliverableId || row.deliverable_id, sourceData);
                const dept = deliverable ? departmentFor(deliverable, sourceData) : 'Unassigned';
                departments[dept] = (departments[dept] || 0) + 1;
            });
            const totalEscalations = escalationReviews.length + escalatedDeliverables.length;
            const concentration = Object.keys(departments).sort().map(dept => freezeStrategicIntelligence({
                department: dept,
                escalationCount: departments[dept],
                percentOfEscalations: percent(departments[dept], totalEscalations)
            }));
            return freezeStrategicIntelligence({
                totalEscalations,
                activeDeliverables: deliverables.filter(row => !isClosed(row)).length,
                densityPercent: percent(totalEscalations, Math.max(1, deliverables.length)),
                concentration,
                repeatedDepartments: concentration.filter(item => item.escalationCount > 1).map(item => item.department)
            });
        } catch (err) {
            return freezeStrategicIntelligence({ totalEscalations: 0, activeDeliverables: 0, densityPercent: 0, concentration: [], repeatedDepartments: [], warning: 'ESCALATION_DENSITY_FAILED_SAFE' });
        }
    }

    function aggregateReviewBacklog(sourceData = data()) {
        try {
            const queue = getReviewQueue(sourceData).map(item => freezeStrategicIntelligence({ ...item, metadata: cloneObject(item.metadata) }));
            const overdue = queue.filter(item => {
                const submitted = item.submitted_at || item.reviewDate || item.deadlineDate;
                return ageDays(submitted) > 2 || String(item.review_status || '').toUpperCase() === 'OVERDUE_REVIEW';
            });
            const byReviewer = {};
            const byDepartment = {};
            queue.forEach(item => {
                const reviewer = item.reviewer_id || 'Unassigned';
                byReviewer[reviewer] = (byReviewer[reviewer] || 0) + 1;
                const deliverable = findDeliverable(item.deliverable_id, sourceData);
                const dept = deliverable ? departmentFor(deliverable, sourceData) : 'Unassigned';
                byDepartment[dept] = (byDepartment[dept] || 0) + 1;
            });
            return freezeStrategicIntelligence({
                totalPending: queue.length,
                overdueReviews: overdue.length,
                delayedApprovals: queue.filter(item => ageDays(item.submitted_at || item.reviewDate) > 2).length,
                reviewerBottlenecks: Object.keys(byReviewer).map(reviewerId => ({
                    reviewerId,
                    pendingReviews: byReviewer[reviewerId],
                    severity: byReviewer[reviewerId] > 2 ? 'HIGH' : byReviewer[reviewerId] > 0 ? 'WARNING' : 'INFO'
                })),
                departmentConcentration: Object.keys(byDepartment).map(department => ({
                    department,
                    pendingReviews: byDepartment[department]
                })),
                queue
            });
        } catch (err) {
            return freezeStrategicIntelligence({ totalPending: 0, overdueReviews: 0, delayedApprovals: 0, reviewerBottlenecks: [], departmentConcentration: [], queue: [], warning: 'REVIEW_BACKLOG_FAILED_SAFE' });
        }
    }

    function normalizeStrategicRisk(input = {}) {
        try {
            const source = isPlainObject(input) ? cloneObject(input) : {};
            const category = RISK_CATEGORIES.includes(source.category) ? source.category : 'HIGH_RISK_DELIVERABLE';
            const severity = safeSeverity(source.severity || (category === 'ESCALATION_CLUSTER' || category === 'HIGH_RISK_DELIVERABLE' ? 'HIGH' : 'WARNING'));
            return freezeStrategicIntelligence({
                riskId: source.riskId || `RISK-${category}-${source.deliverableId || source.department || Date.now()}`.replace(/\s+/g, '-'),
                category,
                severity,
                department: source.department || 'Unassigned',
                deliverableId: source.deliverableId || '',
                title: source.title || category.replace(/_/g, ' '),
                reason: source.reason || 'Strategic risk requires executive visibility.',
                recommendation: source.recommendation || 'Review accountability chain and request leadership intervention if needed.',
                metadata: cloneObject(source.metadata)
            });
        } catch (err) {
            return freezeStrategicIntelligence({
                riskId: 'RISK-HIGH_RISK_DELIVERABLE-UNKNOWN',
                category: 'HIGH_RISK_DELIVERABLE',
                severity: 'WARNING',
                department: 'Unassigned',
                deliverableId: '',
                title: 'HIGH RISK DELIVERABLE',
                reason: 'Risk normalization failed safely.',
                recommendation: 'Review source data.',
                metadata: {}
            });
        }
    }

    function calculateQuarterlyCompletionTrend(sourceData = data()) {
        const grouped = {};
        getDeliverables(sourceData).forEach(row => {
            const quarter = row.quarter || (db()?.currentQuarter ? db().currentQuarter(new Date(row.deadlineDate || row.createdOn || today())) : 'CURRENT');
            if (!grouped[quarter]) grouped[quarter] = { quarter, total: 0, completed: 0, delayed: 0 };
            grouped[quarter].total += 1;
            if (isClosed(row)) grouped[quarter].completed += 1;
            if (isDelayed(row)) grouped[quarter].delayed += 1;
        });
        return Object.keys(grouped).sort().map(key => {
            const item = grouped[key];
            return freezeStrategicIntelligence({
                quarter: key,
                total: item.total,
                completed: item.completed,
                delayed: item.delayed,
                completionRate: percent(item.completed, item.total)
            });
        });
    }

    function calculateExecutiveKpis(sourceData = data()) {
        const deliverables = getDeliverables(sourceData);
        const active = deliverables.filter(row => !isClosed(row));
        const completed = deliverables.filter(isClosed);
        const delayed = active.filter(isDelayed);
        const escalationDensity = calculateEscalationDensity(sourceData);
        const backlog = aggregateReviewBacklog(sourceData);
        const blockedContributors = backlog.queue.filter(item => /CLARIFICATION|BLOCKED|AT_RISK|ESCALATED/i.test([item.review_status, item.escalation_state, item.risk_level].join(' ')));
        return freezeStrategicIntelligence({
            totalDeliverables: deliverables.length,
            activeDeliverables: active.length,
            completedDeliverables: completed.length,
            strategicCompletionRate: percent(completed.length, deliverables.length),
            overdueDeliverablePercent: percent(delayed.length, Math.max(1, active.length)),
            escalationDensity: escalationDensity.densityPercent,
            departmentExecutionHealth: Math.round((getDepartmentHealth(sourceData).reduce((sum, row) => sum + row.healthScore, 0) || 0) / Math.max(1, getDepartmentHealth(sourceData).length)),
            reviewerBottleneckScore: Math.min(100, backlog.overdueReviews * 20 + backlog.totalPending * 8),
            contributorBlockageRate: percent(blockedContributors.length, Math.max(1, backlog.queue.length)),
            quarterlyCompletionTrend: calculateQuarterlyCompletionTrend(sourceData)
        });
    }

    function getDepartmentHealth(sourceData = data()) {
        const departments = Array.from(new Set(getDeliverables(sourceData).map(row => departmentFor(row, sourceData)))).sort();
        return departments.map(dept => calculateDepartmentHealth(dept, sourceData));
    }

    function buildOrganizationRiskBoard(sourceData = data()) {
        try {
            const risks = [];
            const deliverables = getDeliverables(sourceData);
            const backlog = aggregateReviewBacklog(sourceData);
            const escalation = calculateEscalationDensity(sourceData);

            deliverables.filter(row => isDelayed(row) || isEscalated(row)).forEach(row => {
                const dept = departmentFor(row, sourceData);
                risks.push(normalizeStrategicRisk({
                    riskId: `RISK-${row.deliverableId || row.id}`,
                    category: isEscalated(row) ? 'HIGH_RISK_DELIVERABLE' : 'DEPARTMENT_DELAY',
                    severity: isEscalated(row) ? 'HIGH' : 'WARNING',
                    department: dept,
                    deliverableId: row.deliverableId || row.id || '',
                    title: row.deliverableTitle || row.title || 'Strategic deliverable risk',
                    reason: isEscalated(row) ? 'Deliverable is escalated or marked at risk.' : `Deliverable is overdue by ${ageDays(row.deadlineDate || row.dueDate)} days.`,
                    recommendation: 'Request reviewer intervention and validate recovery plan.',
                    metadata: { progressPercent: safeNumber(row.progressPercent ?? row.progress), governanceState: row.governanceState || '' }
                }));
            });

            backlog.reviewerBottlenecks.filter(item => item.pendingReviews > 0).forEach(item => {
                risks.push(normalizeStrategicRisk({
                    riskId: `RISK-REVIEWER-${item.reviewerId}`,
                    category: 'REVIEW_BOTTLENECK',
                    severity: item.pendingReviews > 2 ? 'HIGH' : 'WARNING',
                    department: 'Organization',
                    title: 'Reviewer bottleneck',
                    reason: `${item.pendingReviews} strategic reviews are waiting with reviewer ${item.reviewerId}.`,
                    recommendation: 'Request reviewer decision or reassign accountability review.',
                    metadata: { reviewerId: item.reviewerId, pendingReviews: item.pendingReviews }
                }));
            });

            escalation.concentration.filter(item => item.escalationCount > 0).forEach(item => {
                risks.push(normalizeStrategicRisk({
                    riskId: `RISK-ESCALATION-${item.department}`,
                    category: 'ESCALATION_CLUSTER',
                    severity: item.escalationCount > 1 ? 'HIGH' : 'WARNING',
                    department: item.department,
                    title: 'Escalation concentration',
                    reason: `${item.escalationCount} escalation signals are concentrated in ${item.department}.`,
                    recommendation: 'Review department accountability chain and executive sponsorship.',
                    metadata: { escalationCount: item.escalationCount, percentOfEscalations: item.percentOfEscalations }
                }));
            });

            getDepartmentHealth(sourceData).filter(item => item.healthScore < 65).forEach(item => {
                risks.push(normalizeStrategicRisk({
                    riskId: `RISK-DEPT-${item.department}`,
                    category: 'KPI_FAILURE_RISK',
                    severity: item.healthScore < 45 ? 'HIGH' : 'WARNING',
                    department: item.department,
                    title: 'Department KPI execution risk',
                    reason: `${item.department} health score is ${item.healthScore}.`,
                    recommendation: 'Inspect delayed deliverables, review backlog, and escalation concentration.',
                    metadata: { healthScore: item.healthScore, delayedDeliverables: item.delayedDeliverables, pendingReviews: item.pendingReviews }
                }));
            });

            return freezeStrategicIntelligence(risks.sort((a, b) => {
                const rank = { CRITICAL: 4, HIGH: 3, WARNING: 2, INFO: 1 };
                return (rank[b.severity] || 0) - (rank[a.severity] || 0) || String(a.category).localeCompare(String(b.category));
            }));
        } catch (err) {
            return Object.freeze([]);
        }
    }

    function recordMetric(type, metadata = {}) {
        try {
            if (global.OrchestrationMetricsService?.recordWorkflowMetric) {
                global.OrchestrationMetricsService.recordWorkflowMetric(type, { module: 'Strategic Intelligence', ...cloneObject(metadata) });
            }
        } catch (err) {}
    }

    function audit(action, event = {}, context = {}) {
        try {
            if (global.AuditService?.recordAudit) {
                global.AuditService.recordAudit({
                    eventType: action,
                    module: 'Strategic Intelligence',
                    eventId: event.riskId || event.deliverableId || event.id || '',
                    actorId: context.actorId || context.empId || '',
                    employeeId: '',
                    source: 'strategicIntelligenceService',
                    severity: event.severity || 'INFO',
                    metadata: { ...cloneObject(event.metadata), action, replayVisible: true }
                }, context);
            }
        } catch (err) {}
    }

    function generateStrategicIntelligenceBoard(context = {}) {
        try {
            const ctx = cloneObject(context);
            const sourceData = data();
            const departmentHealth = getDepartmentHealth(sourceData);
            const reviewBacklog = aggregateReviewBacklog(sourceData);
            const escalationIntelligence = calculateEscalationDensity(sourceData);
            const executiveKpis = calculateExecutiveKpis(sourceData);
            const organizationRiskBoard = buildOrganizationRiskBoard(sourceData);
            const board = {
                success: true,
                scope: 'ORGANIZATION',
                directorMode: 'READ_ONLY_OVERSIGHT',
                requestedByRole: normalizeRole(ctx.role || ctx.userRole || 'director'),
                requestedBy: ctx.empId || ctx.id || ctx.actorId || '',
                executiveKpis,
                departmentHealth,
                organizationRiskBoard,
                reviewBacklog,
                escalationIntelligence,
                kpiTrend: executiveKpis.quarterlyCompletionTrend,
                allowedDirectorActions: DIRECTOR_ACTIONS,
                visibilityRules: {
                    organizationWideVisibility: true,
                    canApproveContributorUpdates: false,
                    canManageContributorTasks: false,
                    canBypassReviewerWorkflow: false,
                    canBecomeContributorAutomatically: false
                },
                replayVisible: true,
                generatedAt: new Date().toISOString()
            };
            recordMetric('STRATEGIC_INTELLIGENCE_BOARD_GENERATED', {
                risks: organizationRiskBoard.length,
                departments: departmentHealth.length,
                reviewBacklog: reviewBacklog.totalPending,
                escalationDensity: escalationIntelligence.densityPercent
            });
            return freezeStrategicIntelligence(board);
        } catch (err) {
            safeWarn('Board generation failed safely.', err);
            return freezeStrategicIntelligence({
                success: false,
                scope: 'ORGANIZATION',
                directorMode: 'READ_ONLY_OVERSIGHT',
                executiveKpis: {},
                departmentHealth: [],
                organizationRiskBoard: [],
                reviewBacklog: { totalPending: 0, queue: [] },
                escalationIntelligence: { totalEscalations: 0, densityPercent: 0 },
                allowedDirectorActions: DIRECTOR_ACTIONS,
                visibilityRules: {
                    organizationWideVisibility: true,
                    canApproveContributorUpdates: false,
                    canManageContributorTasks: false,
                    canBypassReviewerWorkflow: false
                },
                error: err?.message || 'STRATEGIC_INTELLIGENCE_FAILED_SAFE',
                generatedAt: new Date().toISOString()
            });
        }
    }

    function acknowledgeStrategicRisk(riskId, context = {}) {
        try {
            const ctx = cloneObject(context);
            const id = String(riskId || '').trim();
            const board = generateStrategicIntelligenceBoard(ctx);
            const risk = (board.organizationRiskBoard || []).find(item => item.riskId === id) || normalizeStrategicRisk({ riskId: id || 'RISK-UNKNOWN' });
            const result = {
                success: true,
                action: 'ACKNOWLEDGE_RISK',
                riskId: risk.riskId,
                acknowledgedBy: ctx.actorId || ctx.empId || ctx.id || '',
                acknowledgedRole: normalizeRole(ctx.actorRole || ctx.role || 'director'),
                remark: ctx.remark || '',
                replayVisible: true,
                timestamp: new Date().toISOString(),
                risk
            };
            recordMetric('STRATEGIC_RISK_ACKNOWLEDGED', {
                riskId: result.riskId,
                actorId: result.acknowledgedBy,
                severity: risk.severity,
                category: risk.category
            });
            audit('STRATEGIC_RISK_ACKNOWLEDGED', risk, {
                actorId: result.acknowledgedBy,
                actorRole: result.acknowledgedRole,
                remark: result.remark
            });
            return freezeStrategicIntelligence(result);
        } catch (err) {
            return freezeStrategicIntelligence({
                success: false,
                action: 'ACKNOWLEDGE_RISK',
                error: err?.message || 'RISK_ACKNOWLEDGEMENT_FAILED_SAFE',
                replayVisible: true
            });
        }
    }

    function canDirectorExecuteReviewAction(action) {
        const normalized = String(action || '').trim().replace(/[\s-]+/g, '_').toUpperCase();
        if (EXECUTION_ACTIONS.includes(normalized)) return false;
        return DIRECTOR_ACTIONS.includes(normalized);
    }

    function tenantFrom(input = {}, context = {}) {
        const source = isPlainObject(input) ? input : {};
        const ctx = isPlainObject(context) ? context : {};
        const actor = isPlainObject(ctx.actor) ? ctx.actor : {};
        return normalizeTenantSlug(
            source.tenantSlug ||
            source.tenant_slug ||
            source.tenantId ||
            source.tenant_id ||
            source.organizationSlug ||
            source.organizationId ||
            ctx.tenantSlug ||
            ctx.tenant_slug ||
            ctx.tenantId ||
            ctx.tenant_id ||
            actor.tenantSlug ||
            actor.tenantId ||
            ''
        );
    }

    function strictTenantRows(rows, tenantSlug) {
        const list = Array.isArray(rows) ? rows : [];
        if (!tenantSlug) return list.filter(Boolean);
        return list.filter(row => row && rowTenant(row) === tenantSlug);
    }

    function scopedStrategicData(tenantSlug) {
        const source = data();
        const clone = { ...source };
        [
            'strategicDeliverables',
            'deliverableReviews',
            'pendingActions',
            'strategicPendingActions',
            'workflowEvents',
            'escalations',
            'employees'
        ].forEach(key => {
            if (Array.isArray(source[key])) clone[key] = strictTenantRows(source[key], tenantSlug);
        });
        return clone;
    }

    function matchesExecutionScope(row = {}, correlationId = '', eventId = '') {
        const correlation = safeString(correlationId, '').trim();
        const event = safeString(eventId, '').trim();
        if (correlation) return safeString(row.correlationId || row.correlation_id || '', '').trim() === correlation;
        if (event) return safeString(row.eventId || row.event_id || row.id || '', '').trim() === event;
        return true;
    }

    function validateStrategicScope(input = {}, context = {}) {
        try {
            const source = isPlainObject(input) ? input : {};
            const targetTenant = tenantFrom(source, {});
            const contextTenant = tenantFrom({}, context);
            const allowed = !targetTenant || !contextTenant || targetTenant === contextTenant;
            const alerts = [];
            if (!allowed) {
                alerts.push({
                    alertCode: 'CROSS_TENANT_STRATEGIC_SCOPE_BLOCKED',
                    classification: STRATEGIC_RISK_LEVELS.CRITICAL_BLOCKER,
                    message: 'Strategic intelligence scope is restricted to the active tenant.'
                });
            }
            return freezeStrategicOutput({
                success: true,
                allowed,
                tenantIsolationPreserved: true,
                requestedTenant: targetTenant,
                activeTenant: contextTenant,
                alerts
            });
        } catch (err) {
            return freezeStrategicOutput({
                success: true,
                allowed: false,
                tenantIsolationPreserved: true,
                alerts: [{
                    alertCode: 'STRATEGIC_SCOPE_VALIDATION_FAILED_SAFE',
                    classification: STRATEGIC_RISK_LEVELS.HIGH_RISK,
                    message: 'Strategic scope validation failed safely.'
                }]
            });
        }
    }

    function detectStrategicBottlenecks(input = {}, context = {}) {
        try {
            const source = isPlainObject(input) ? input : {};
            const tenantSlug = tenantFrom(source, context);
            const correlationId = safeString(source.correlationId || context.correlationId || '', '').trim();
            const eventId = safeString(source.eventId || context.eventId || '', '').trim();
            const sourceData = scopedStrategicData(tenantSlug);
            const deliverables = getDeliverables(sourceData).filter(row => matchesExecutionScope(row, correlationId, ''));
            const reviews = getReviews(sourceData).filter(row => matchesExecutionScope(row, correlationId, ''));
            const pendingActions = []
                .concat(Array.isArray(sourceData.pendingActions) ? sourceData.pendingActions : [])
                .concat(Array.isArray(sourceData.strategicPendingActions) ? sourceData.strategicPendingActions : [])
                .filter(row => matchesExecutionScope(row, correlationId, eventId));
            const workflowEvents = (Array.isArray(sourceData.workflowEvents) ? sourceData.workflowEvents : [])
                .filter(row => matchesExecutionScope(row, correlationId, eventId));
            const escalations = (Array.isArray(sourceData.escalations) ? sourceData.escalations : [])
                .filter(row => matchesExecutionScope(row, correlationId, eventId));

            const delayedDeliverables = deliverables.filter(isDelayed).length;
            const escalatedDeliverables = deliverables.filter(isEscalated).length + escalations.length;
            const blockedReviewSignals = reviews.filter(row => /CLARIFICATION|BLOCKED|ESCALATED|AT_RISK|NEEDS/i.test([
                row.reviewerAction,
                row.review_status,
                row.reviewStatus,
                row.escalation_state,
                row.risk_level,
                row.riskLevel
            ].join(' '))).length;
            const blockedActionSignals = pendingActions.filter(row => /BLOCKED|CONTRIBUTOR_BLOCKED|WAITING|DEPENDENCY/i.test([
                row.actionType,
                row.status,
                row.title
            ].join(' '))).length;
            const contributorBlockage = blockedReviewSignals + blockedActionSignals;
            const reviewerCongestion = reviews.filter(row => /PENDING|UNDER_REVIEW|CLARIFICATION|NEEDS/i.test([
                row.review_status,
                row.reviewStatus,
                row.escalation_state,
                row.reviewerAction
            ].join(' '))).length;
            const executionFailures = workflowEvents.filter(row => /FAILED|DEGRADED|TIMEOUT|ERROR/i.test([
                row.status,
                row.type,
                row.eventType
            ].join(' '))).length;

            const bottlenecks = [];
            if (delayedDeliverables > 0) {
                bottlenecks.push({
                    bottleneckType: 'DELAYED_DELIVERABLES',
                    count: delayedDeliverables,
                    classification: classifyStrategicRisk({ delayedDeliverables }),
                    recommendation: 'Review delayed strategic deliverables and require recovery ownership.'
                });
            }
            if (contributorBlockage > 0) {
                bottlenecks.push({
                    bottleneckType: 'CONTRIBUTOR_BLOCKAGE',
                    count: contributorBlockage,
                    classification: classifyStrategicRisk({ contributorBlockage }),
                    recommendation: 'Resolve contributor dependencies before strategic recovery dates slip further.'
                });
            }
            if (reviewerCongestion > 0) {
                bottlenecks.push({
                    bottleneckType: 'REVIEWER_CONGESTION',
                    count: reviewerCongestion,
                    classification: classifyStrategicRisk({ reviewerCongestion }),
                    recommendation: 'Request reviewer decisions or redistribute review accountability.'
                });
            }
            if (executionFailures > 0 || escalatedDeliverables > 0) {
                bottlenecks.push({
                    bottleneckType: 'STRATEGIC_EXECUTION_FAILURE',
                    count: executionFailures + escalatedDeliverables,
                    classification: classifyStrategicRisk({ executionFailures, escalations: escalatedDeliverables }),
                    recommendation: 'Correlate workflow failures with escalation records and open an operational review.'
                });
            }

            return freezeStrategicOutput({
                success: true,
                tenantSlug,
                correlationId,
                eventId,
                summary: {
                    delayedDeliverables,
                    contributorBlockage,
                    reviewerCongestion,
                    executionFailures,
                    escalatedDeliverables
                },
                bottlenecks,
                generatedAt: nowIso()
            });
        } catch (err) {
            return freezeStrategicOutput({
                success: true,
                warning: 'STRATEGIC_BOTTLENECK_DETECTION_FAILED_SAFE',
                summary: {
                    delayedDeliverables: 0,
                    contributorBlockage: 0,
                    reviewerCongestion: 0,
                    executionFailures: 1,
                    escalatedDeliverables: 0
                },
                bottlenecks: [{
                    bottleneckType: 'DETECTION_FAILURE',
                    count: 1,
                    classification: STRATEGIC_RISK_LEVELS.HIGH_RISK,
                    recommendation: 'Review strategic intelligence inputs.'
                }],
                generatedAt: nowIso()
            });
        }
    }

    function correlateStrategicExecution(input = {}, context = {}) {
        try {
            const source = isPlainObject(input) ? input : {};
            const tenantSlug = tenantFrom(source, context);
            const correlationId = safeString(source.correlationId || context.correlationId || '', '').trim();
            const eventId = safeString(source.eventId || context.eventId || '', '').trim();
            const sourceData = scopedStrategicData(tenantSlug);
            const workflowEvents = (Array.isArray(sourceData.workflowEvents) ? sourceData.workflowEvents : [])
                .filter(row => matchesExecutionScope(row, correlationId, eventId));
            const escalations = (Array.isArray(sourceData.escalations) ? sourceData.escalations : [])
                .filter(row => matchesExecutionScope(row, correlationId, eventId));
            const bottlenecks = detectStrategicBottlenecks(source, context);
            const chains = [];
            const addChain = (chainType, strength, evidenceCount, recommendation) => {
                if (!chains.some(row => row.chainType === chainType)) {
                    chains.push({ chainType, strength, evidenceCount, recommendation });
                }
            };

            if (workflowEvents.some(row => /KPI_DEGRADATION|KPI.*DEGRADED/i.test([row.type, row.eventType, row.status].join(' ')))) {
                addChain('KPI_DEGRADATION', 'HIGH', 1, 'Inspect KPI recovery plan and linked department execution health.');
            }
            if (escalations.length > 0 || safeNumber(bottlenecks.summary?.escalatedDeliverables || 0) > 0) {
                addChain('ESCALATION_LINKED', 'HIGH', escalations.length || safeNumber(bottlenecks.summary?.escalatedDeliverables || 0), 'Review escalation ownership and current recovery status.');
            }
            if (safeNumber(bottlenecks.summary?.contributorBlockage || 0) > 0) {
                addChain('CONTRIBUTOR_BLOCKAGE', 'MEDIUM', bottlenecks.summary.contributorBlockage, 'Unblock contributor dependencies before schedule variance grows.');
            }
            if (global.EventReplayService) {
                addChain('REPLAY_STRATEGIC', 'MEDIUM', 1, 'Use event replay as read-only evidence for strategic execution traceability.');
            }

            if (!chains.length && workflowEvents.length) {
                addChain('STRATEGIC_EXECUTION_TRACE', 'LOW', workflowEvents.length, 'Review strategic execution trace for additional context.');
            }

            return freezeStrategicOutput({
                success: true,
                tenantSlug,
                correlationId,
                eventId,
                chains,
                generatedAt: nowIso()
            });
        } catch (err) {
            return freezeStrategicOutput({
                success: true,
                warning: 'STRATEGIC_CORRELATION_FAILED_SAFE',
                chains: [],
                generatedAt: nowIso()
            });
        }
    }

    function emitStrategicTelemetry(eventType, metadata = {}) {
        try {
            if (global.WorkflowTelemetryService?.emitTelemetry) {
                global.WorkflowTelemetryService.emitTelemetry('GOVERNANCE', eventType, {
                    source: 'strategicIntelligenceService',
                    severity: metadata.severity || 'INFO',
                    correlationId: metadata.correlationId || '',
                    eventId: metadata.eventId || '',
                    metadata: cloneObject(metadata)
                });
            }
        } catch (err) {}
    }

    function generateStrategicDeliverablesIntelligenceReport(input = {}, context = {}) {
        try {
            const malformed = !isPlainObject(input);
            const source = isPlainObject(input) ? input : {};
            const ctx = isPlainObject(context) ? context : {};
            const tenantSlug = tenantFrom(source, ctx);
            const correlationId = safeString(source.correlationId || ctx.correlationId || '', '').trim();
            const eventId = safeString(source.eventId || ctx.eventId || '', '').trim();
            const scope = validateStrategicScope(source, ctx);
            const warnings = [];
            if (malformed) warnings.push({ alertCode: 'MALFORMED_STRATEGIC_PAYLOAD', classification: STRATEGIC_RISK_LEVELS.HIGH_RISK, message: 'Strategic report used safe defaults for malformed input.' });
            if (!scope.allowed) warnings.push({ alertCode: 'STRATEGIC_SCOPE_BLOCKED', classification: STRATEGIC_RISK_LEVELS.CRITICAL_BLOCKER, message: 'Strategic report scope was blocked by tenant governance.' });
            if (!global.EventReplayService) warnings.push({ alertCode: 'EVENT_REPLAY_UNAVAILABLE', classification: STRATEGIC_RISK_LEVELS.WARNING, message: 'Event replay dependency is unavailable; report degraded safely.' });

            const sourceData = scopedStrategicData(tenantSlug);
            const deliverables = getDeliverables(sourceData).filter(row => matchesExecutionScope(row, correlationId, ''));
            const totalDeliverables = deliverables.length;
            const completedDeliverables = deliverables.filter(isClosed).length;
            const bottlenecks = detectStrategicBottlenecks({ ...source, tenantSlug, correlationId, eventId }, ctx);
            const executionChains = correlateStrategicExecution({ ...source, tenantSlug, correlationId, eventId }, ctx);
            const severity = malformed
                ? STRATEGIC_RISK_LEVELS.HIGH_RISK
                : classifyStrategicRisk({
                    crossTenant: !scope.allowed,
                    delayedDeliverables: bottlenecks.summary?.delayedDeliverables || 0,
                    contributorBlockage: bottlenecks.summary?.contributorBlockage || 0,
                    reviewerCongestion: bottlenecks.summary?.reviewerCongestion || 0,
                    executionFailures: bottlenecks.summary?.executionFailures || 0,
                    escalations: bottlenecks.summary?.escalatedDeliverables || 0
                });

            const report = {
                success: true,
                readOnly: true,
                tenantSlug,
                correlationId,
                eventId,
                severity,
                kpiGovernance: {
                    totalDeliverables,
                    completedDeliverables,
                    kpiCompletionRate: percent(completedDeliverables, totalDeliverables),
                    delayedDeliverables: bottlenecks.summary?.delayedDeliverables || 0,
                    executionFailures: bottlenecks.summary?.executionFailures || 0
                },
                contributorAccountability: {
                    blockedContributors: bottlenecks.summary?.contributorBlockage || 0,
                    recommendation: bottlenecks.summary?.contributorBlockage > 0 ? 'Resolve dependency blockers and confirm accountable owners.' : 'No contributor blocker detected.'
                },
                reviewerPerformance: {
                    reviewerCongestion: bottlenecks.summary?.reviewerCongestion || 0,
                    recommendation: bottlenecks.summary?.reviewerCongestion > 0 ? 'Request reviewer decisions or rebalance review queue.' : 'No reviewer congestion detected.'
                },
                bottlenecks: bottlenecks.bottlenecks,
                executionChains,
                replay: {
                    linked: !!global.EventReplayService && executionChains.chains.some(row => row.chainType === 'REPLAY_STRATEGIC'),
                    status: global.EventReplayService ? 'AVAILABLE' : 'UNAVAILABLE'
                },
                warnings,
                generatedAt: nowIso()
            };

            if (!ctx.skipAuditPersistence) {
                audit('STRATEGIC_INTELLIGENCE_REPORTED', {
                    id: correlationId || eventId || 'STRATEGIC-REPORT',
                    severity,
                    metadata: {
                        tenantSlug,
                        correlationId,
                        eventId,
                        delayedDeliverables: report.kpiGovernance.delayedDeliverables,
                        reviewerCongestion: report.reviewerPerformance.reviewerCongestion
                    }
                }, {
                    ...ctx,
                    actorId: ctx.actorId || ctx.actor?.id || ctx.actor?.empId || '',
                    tenantSlug
                });
            }
            if (!ctx.skipTelemetry) {
                emitStrategicTelemetry('STRATEGIC_INTELLIGENCE_REPORTED', {
                    tenantSlug,
                    correlationId,
                    eventId,
                    severity,
                    delayedDeliverables: report.kpiGovernance.delayedDeliverables,
                    reviewerCongestion: report.reviewerPerformance.reviewerCongestion
                });
            }
            if (!ctx.skipMetrics) {
                recordMetric('STRATEGIC_INTELLIGENCE_REPORTED', {
                    tenantSlug,
                    correlationId,
                    severity,
                    delayedDeliverables: report.kpiGovernance.delayedDeliverables,
                    reviewerCongestion: report.reviewerPerformance.reviewerCongestion
                });
            }

            return freezeStrategicOutput(report);
        } catch (err) {
            safeWarn('Strategic deliverables report failed safely.', err);
            return freezeStrategicOutput({
                success: true,
                readOnly: true,
                severity: STRATEGIC_RISK_LEVELS.HIGH_RISK,
                warnings: [{
                    alertCode: 'STRATEGIC_REPORT_FAILED_SAFE',
                    classification: STRATEGIC_RISK_LEVELS.HIGH_RISK,
                    message: 'Strategic report generation failed safely.'
                }],
                generatedAt: nowIso()
            });
        }
    }

    function runSelfTest() {
        try {
            const board = generateStrategicIntelligenceBoard({ role: 'director' });
            const malformedRisk = normalizeStrategicRisk(null);
            const health = calculateDepartmentHealth(null);
            const checks = [
                { name: 'board output immutable', passed: Object.isFrozen(board) },
                { name: 'director mode is read-only oversight', passed: board.directorMode === 'READ_ONLY_OVERSIGHT' },
                { name: 'director cannot approve contributor updates', passed: board.visibilityRules.canApproveContributorUpdates === false },
                { name: 'malformed risk output immutable', passed: Object.isFrozen(malformedRisk) },
                { name: 'malformed risk uses safe category', passed: malformedRisk.category === 'HIGH_RISK_DELIVERABLE' },
                { name: 'department health output immutable', passed: Object.isFrozen(health) },
                { name: 'execution action blocked', passed: canDirectorExecuteReviewAction('APPROVE_PROGRESS') === false },
                { name: 'governance acknowledgement allowed', passed: canDirectorExecuteReviewAction('ACKNOWLEDGE_RISK') === true }
            ];
            lastSelfTestChecks = freezeStrategicIntelligence(checks);
            if (!checks.every(item => item.passed)) safeWarn('Self-test warnings detected.', checks);
            return checks.every(item => item.passed);
        } catch (err) {
            safeWarn('Self-test failed safely.', err);
            lastSelfTestChecks = freezeStrategicIntelligence([{ name: 'self-test runtime safety', passed: false, error: err?.message || String(err) }]);
            return false;
        }
    }

    function buildDevelopmentSelfTestReport() {
        const passed = runSelfTest();
        return freezeStrategicIntelligence({
            passed,
            timestamp: nowIso(),
            version: '1.0.0',
            summary: passed ? 'Strategic deliverables intelligence development self-test passed.' : 'Strategic deliverables intelligence development self-test reported warnings.',
            checks: lastSelfTestChecks
        });
    }

    const api = Object.freeze({
        RISK_CATEGORIES,
        SEVERITIES,
        DIRECTOR_ACTIONS,
        STRATEGIC_STATES,
        STRATEGIC_RISK_LEVELS,
        classifyStrategicRisk,
        validateStrategicScope,
        detectStrategicBottlenecks,
        correlateStrategicExecution,
        generateStrategicDeliverablesIntelligenceReport,
        generateStrategicIntelligenceBoard,
        getDirectorStrategicBoard: generateStrategicIntelligenceBoard,
        calculateDepartmentHealth,
        calculateEscalationDensity,
        normalizeStrategicRisk,
        aggregateReviewBacklog,
        freezeStrategicIntelligence,
        acknowledgeStrategicRisk,
        canDirectorExecuteReviewAction,
        runSelfTest
    });

    global.StrategicIntelligenceService = api;
    global.strategicIntelligenceService = api;

    if (global.__ARTHHRMS_DEV__) {
        try {
            global.__ARTHHRMS_STRATEGIC_DELIVERABLES_INTELLIGENCE_SELF_TEST__ = buildDevelopmentSelfTestReport();
        } catch (err) {
            safeWarn('Development self-test failed safely.', err);
            global.__ARTHHRMS_STRATEGIC_DELIVERABLES_INTELLIGENCE_SELF_TEST__ = freezeStrategicIntelligence({
                passed: false,
                timestamp: nowIso(),
                version: '1.0.0',
                summary: 'Strategic deliverables intelligence development self-test failed safely.',
                checks: [{ name: 'self-test runtime safety', passed: false, error: err?.message || String(err) }]
            });
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
