/**
 * pendingActionService.js
 * ARTHHRMS — Pending Action Intelligence Layer
 *
 * PURPOSE:
 * Provides centralized operational pending-action computation
 * independent from workflow orchestration internals.
 *
 * This service computes:
 * - pending approvals
 * - SLA risks
 * - overdue actions
 * - workflow accountability visibility
 * - operational action summaries
 *
 * This service does NOT:
 * - own orchestration
 * - own telemetry systems
 * - mutate workflowEngine state
 *
 * ARCHITECTURE RULE:
 * Pending-action intelligence must remain isolated from orchestration.
 *
 * STABILITY:
 * Existing pending-action behavior must remain compatible.
 *
 * DEPENDS ON:
 * - window.WorkflowTelemetryService (optional)
 *
 * @version 1.0.0
 */
(function (global) {
    'use strict';

    const PREFIX = '[PendingActionService]';
    const PRIORITIES = Object.freeze({
        LOW: 'LOW',
        MEDIUM: 'MEDIUM',
        HIGH: 'HIGH',
        CRITICAL: 'CRITICAL'
    });
    const CLOSED_STATUSES = Object.freeze(['Resolved', 'Closed', 'Approved', 'Rejected', 'Paid', 'Finalized', 'Completed']);
    let telemetryForwarding = false;

    function safeWarn(message, details) {
        try {
            if (global.console && typeof global.console.warn === 'function') {
                if (details !== undefined) global.console.warn(message, details);
                else global.console.warn(message);
            }
        } catch (e) {}
    }

    function safeInfo(message, details) {
        try {
            if (global.console && typeof global.console.info === 'function') {
                if (details !== undefined) global.console.info(message, details);
                else global.console.info(message);
            }
        } catch (e) {}
    }

    function safeString(value, fallback) {
        try {
            if (value === undefined || value === null) return fallback;
            if (typeof value === 'symbol') return value.toString();
            return String(value);
        } catch (e) {
            return fallback;
        }
    }

    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function cloneObject(input) {
        const output = {};
        if (!isPlainObject(input)) return output;
        try {
            Object.keys(input).forEach(key => {
                try {
                    output[key] = input[key];
                } catch (e) {}
            });
        } catch (e) {}
        return output;
    }

    function db() {
        return global.DB || null;
    }

    function getData() {
        try {
            if (db() && typeof db().get === 'function') return db().get() || {};
        } catch (e) {}
        return {};
    }

    function today() {
        try {
            if (db() && typeof db().today === 'function') return db().today();
        } catch (e) {}
        return new Date().toISOString().split('T')[0];
    }

    function makeId(prefix) {
        const random = Math.random().toString(36).slice(2, 7).toUpperCase();
        return `${prefix}${Date.now()}${random}`;
    }

    function normalizeRole(role) {
        const value = safeString(role || '', '').trim();
        if (!value) return '';
        try {
            if (db() && typeof db().normalizeRoleTarget === 'function') return db().normalizeRoleTarget(value);
        } catch (e) {}
        return value.toUpperCase().replace(/\s+/g, '_');
    }

    function resolveEmpId(empId) {
        const value = safeString(empId || '', '').trim();
        if (!value) return '';
        try {
            if (db() && typeof db().resolveEmployeeId === 'function') return db().resolveEmployeeId(value);
        } catch (e) {}
        return value;
    }

    function safePriority(priority) {
        const value = safeString(priority || PRIORITIES.MEDIUM, PRIORITIES.MEDIUM).trim().toUpperCase();
        return PRIORITIES[value] || PRIORITIES.MEDIUM;
    }

    function ageDays(dateValue) {
        if (!dateValue) return 0;
        try {
            const start = new Date(String(dateValue).slice(0, 10) + 'T00:00:00');
            if (Number.isNaN(start.getTime())) return 0;
            const end = new Date(today() + 'T00:00:00');
            return Math.max(0, Math.floor((end - start) / 86400000));
        } catch (e) {
            return 0;
        }
    }

    function isOpenStatus(status) {
        return CLOSED_STATUSES.indexOf(safeString(status || '', '').trim()) === -1;
    }

    function normalizeAction(action = {}) {
        const source = isPlainObject(action) ? cloneObject(action) : {};
        return {
            id: source.id || makeId('PA'),
            sourceType: source.sourceType || source.module || 'Workflow',
            sourceId: source.sourceId || '',
            module: source.module || source.sourceType || 'Workflow',
            title: source.title || 'Pending Action',
            priority: safePriority(source.priority),
            assigneeRole: normalizeRole(source.assigneeRole || source.targetRole || ''),
            assigneeEmpId: resolveEmpId(source.assigneeEmpId || source.targetEmpId || ''),
            dueDate: source.dueDate || '',
            createdAt: source.createdAt || '',
            actionLink: source.actionLink || '',
            metadata: cloneObject(source.metadata)
        };
    }

    function addAction(actions, action) {
        if (!Array.isArray(actions) || !action) return null;
        const normalized = normalizeAction(action);
        actions.push(normalized);
        return normalized;
    }

    function telemetryService() {
        return global.WorkflowTelemetryService || null;
    }

    if (typeof global.WorkflowTelemetryService === 'undefined') {
        safeWarn(`${PREFIX} Optional dependency window.WorkflowTelemetryService is unavailable. Pending action computation will continue without telemetry.`);
    }

    function emitPendingTelemetry(eventType, payload = {}) {
        if (telemetryForwarding) return { success: false, warning: 'Pending telemetry skipped to avoid recursion.' };
        const service = telemetryService();
        if (!service || typeof service.emitWorkflowTelemetry !== 'function') return { success: true, warning: '' };
        try {
            telemetryForwarding = true;
            return service.emitWorkflowTelemetry(eventType, {
                source: 'pendingActionService',
                severity: payload.severity || 'INFO',
                status: payload.status || 'COMPUTED',
                eventId: payload.eventId || '',
                correlationId: payload.correlationId || '',
                metadata: cloneObject(payload.metadata)
            });
        } catch (err) {
            return {
                success: false,
                warning: `Pending telemetry failed safely: ${err && err.message ? err.message : safeString(err, 'unknown telemetry failure')}`
            };
        } finally {
            telemetryForwarding = false;
        }
    }

    function normalizeTarget(target = {}) {
        const source = isPlainObject(target) ? cloneObject(target) : {};
        return {
            role: normalizeRole(source.role || source.targetRole || ''),
            empId: resolveEmpId(source.empId || source.targetEmpId || '')
        };
    }

    function employeeTeamIds(employees, managerEmpId) {
        return new Set((Array.isArray(employees) ? employees : [])
            .filter(employee => employee && employee.managerId === managerEmpId)
            .map(employee => employee.id));
    }

    function addEmployeeActions(actions, data, empId) {
        (data.leaveRequests || []).filter(l => l.empId === empId && !['Approved', 'Rejected'].includes(l.finalStatus || l.status)).forEach(l => addAction(actions, {
            sourceType: 'leave',
            sourceId: l.leaveId || l.id,
            module: 'Leave',
            title: 'Leave decision pending',
            priority: ageDays(l.appliedOn || l.appliedAt) > 2 ? PRIORITIES.HIGH : PRIORITIES.MEDIUM,
            assigneeEmpId: empId,
            createdAt: l.appliedOn || l.appliedAt
        }));
        (data.expenseClaims || []).filter(c => c.empId === empId && !['Paid', 'Rejected by Manager', 'Rejected by HR'].includes(c.status)).forEach(c => addAction(actions, {
            sourceType: 'expense',
            sourceId: c.id,
            module: 'Expense',
            title: 'Expense claim awaiting closure',
            priority: c.status === 'Approved by Manager' ? PRIORITIES.HIGH : PRIORITIES.MEDIUM,
            assigneeEmpId: empId,
            createdAt: c.date || c.submittedOn
        }));
        (data.helpdeskTickets || []).filter(t => t.empId === empId && t.status !== 'Resolved').forEach(t => addAction(actions, {
            sourceType: 'helpdesk',
            sourceId: t.id,
            module: 'Helpdesk',
            title: 'Helpdesk ticket open',
            priority: PRIORITIES.MEDIUM,
            assigneeEmpId: empId,
            createdAt: t.createdOn || t.date
        }));
        (data.strategicDeliverables || []).filter(d => d.empId === empId && !['Achieved', 'Failed', 'Exceeded', 'Closed'].includes(d.finalClosureStatus || d.currentStatus)).forEach(d => addAction(actions, {
            sourceType: 'deliverable',
            sourceId: d.deliverableId || d.id,
            module: 'Strategic Deliverables',
            title: 'Deliverable progress pending',
            priority: d.deadlineDate && d.deadlineDate < today() ? PRIORITIES.CRITICAL : PRIORITIES.MEDIUM,
            assigneeEmpId: empId,
            dueDate: d.deadlineDate
        }));
    }

    function addManagerActions(actions, data, empId, teamIds) {
        (data.leaveRequests || []).filter(l => teamIds.has(l.empId) && (l.managerStatus || l.status) === 'Pending').forEach(l => addAction(actions, {
            sourceType: 'leave',
            sourceId: l.leaveId || l.id,
            module: 'Leave',
            title: 'Leave approval pending',
            priority: ageDays(l.appliedOn || l.appliedAt) > 2 ? PRIORITIES.HIGH : PRIORITIES.MEDIUM,
            assigneeEmpId: empId,
            createdAt: l.appliedOn || l.appliedAt
        }));
        (data.expenseClaims || []).filter(c => teamIds.has(c.empId) && ['Submitted', 'Pending Manager Approval', 'Pending'].includes(c.status)).forEach(c => addAction(actions, {
            sourceType: 'expense',
            sourceId: c.id,
            module: 'Expense',
            title: 'Expense decision pending',
            priority: PRIORITIES.MEDIUM,
            assigneeEmpId: empId,
            createdAt: c.date || c.submittedOn
        }));
        (data.strategicDeliverables || []).filter(d => d.managerId === empId && !['Achieved', 'Failed', 'Exceeded', 'Closed'].includes(d.finalClosureStatus || d.currentStatus)).forEach(d => addAction(actions, {
            sourceType: 'deliverable',
            sourceId: d.deliverableId || d.id,
            module: 'Strategic Deliverables',
            title: 'Team deliverable review pending',
            priority: d.deadlineDate && d.deadlineDate < today() ? PRIORITIES.CRITICAL : PRIORITIES.MEDIUM,
            assigneeEmpId: empId,
            dueDate: d.deadlineDate
        }));
        if (global.StrategicReviewService?.createReviewQueue) {
            global.StrategicReviewService.createReviewQueue({ reviewerId: empId, role: 'manager' }).forEach(item => addAction(actions, {
                sourceType: 'deliverableReview',
                sourceId: item.review_id,
                module: 'Strategic Deliverables',
                title: 'Contributor update review pending',
                priority: item.calculatedRisk === 'CRITICAL' ? PRIORITIES.CRITICAL : item.calculatedRisk === 'HIGH' ? PRIORITIES.HIGH : PRIORITIES.MEDIUM,
                assigneeEmpId: empId,
                dueDate: item.deadlineDate,
                createdAt: item.submitted_at,
                metadata: { deliverableId: item.deliverable_id, contributorId: item.contributor_id, reviewStatus: item.review_status }
            }));
        }
    }

    function addAdminActions(actions, data) {
        (data.attendanceRegularizations || []).filter(r => ['Pending', 'Open', 'In Review'].includes(r.status || 'Pending')).forEach(r => addAction(actions, {
            sourceType: 'attendanceRegularization',
            sourceId: r.id,
            module: 'Attendance Regularization',
            title: 'Attendance correction pending',
            priority: ageDays(r.createdOn || r.requestedOn || r.date) > 1 ? PRIORITIES.HIGH : PRIORITIES.MEDIUM,
            assigneeRole: 'ADMIN',
            createdAt: r.createdOn || r.requestedOn
        }));
        (data.helpdeskTickets || []).filter(t => t.status !== 'Resolved').forEach(t => addAction(actions, {
            sourceType: 'helpdesk',
            sourceId: t.id,
            module: 'Helpdesk',
            title: 'Helpdesk ticket open',
            priority: ageDays(t.createdOn || t.date) > 2 ? PRIORITIES.HIGH : PRIORITIES.MEDIUM,
            assigneeRole: 'ADMIN',
            createdAt: t.createdOn || t.date
        }));
        (data.onboardingCollections || []).filter(o => !o.completed && !o.allComplete).forEach(o => addAction(actions, {
            sourceType: 'onboardingCollection',
            sourceId: o.id,
            module: 'Onboarding',
            title: 'Onboarding collection incomplete',
            priority: PRIORITIES.MEDIUM,
            assigneeRole: 'ADMIN'
        }));
        (data.documentVerifications || []).filter(v => ['Missing', 'Reupload Required', 'Pending'].includes(v.overallStatus || v.status || 'Pending')).forEach(v => addAction(actions, {
            sourceType: 'documentVerification',
            sourceId: v.id,
            module: 'Documents',
            title: 'Document verification pending',
            priority: PRIORITIES.MEDIUM,
            assigneeRole: 'ADMIN'
        }));
    }

    function addHrActions(actions, data) {
        (data.leaveRequests || []).filter(l => (l.managerStatus === 'Approved' || l.finalStatus === 'Manager Approved') && !['Approved', 'Rejected'].includes(l.finalStatus)).forEach(l => addAction(actions, {
            sourceType: 'leave',
            sourceId: l.leaveId || l.id,
            module: 'Leave',
            title: 'Final leave action pending',
            priority: PRIORITIES.HIGH,
            assigneeRole: 'HR',
            createdAt: l.reviewedAt || l.appliedOn
        }));
        (data.expenseClaims || []).filter(c => ['Approved by Manager', 'Payment Pending', 'Pending HR Payment', 'Finance Approved', 'Pending Payment'].includes(c.status)).forEach(c => addAction(actions, {
            sourceType: 'expense',
            sourceId: c.id,
            module: 'Expense',
            title: 'Expense payment action pending',
            priority: PRIORITIES.HIGH,
            assigneeRole: 'HR'
        }));
        (data.payroll || []).filter(p => !['Paid', 'Rejected', 'Cancelled'].includes(p.payrollStatus || p.status)).forEach(p => addAction(actions, {
            sourceType: 'payroll',
            sourceId: p.payrollId || p.id,
            module: 'Payroll',
            title: (p.payrollStatus || p.status) === 'Approved' ? 'Payroll payment pending' : 'Payroll approval pending',
            priority: PRIORITIES.HIGH,
            assigneeRole: 'HR',
            createdAt: p.processedAt || p.createdAt
        }));
        (data.strategicDeliverables || []).filter(d => d.deadlineDate && d.deadlineDate < today() && !['Achieved', 'Failed', 'Exceeded', 'Closed'].includes(d.finalClosureStatus || d.currentStatus)).forEach(d => addAction(actions, {
            sourceType: 'deliverable',
            sourceId: d.deliverableId || d.id,
            module: 'Strategic Deliverables',
            title: 'Overdue deliverable requires HR action',
            priority: PRIORITIES.CRITICAL,
            assigneeRole: 'HR',
            dueDate: d.deadlineDate
        }));
    }

    function addStoredPendingActions(actions, data, role, empId) {
        (data.pendingActions || []).filter(a => a.status !== 'Resolved').forEach(a => {
            const sameRole = !role || normalizeRole(a.assigneeRole) === role;
            const sameEmp = !empId || resolveEmpId(a.assigneeEmpId) === empId;
            if (sameRole && sameEmp) addAction(actions, a);
        });
    }

    function computePendingActions(target = {}, recursionGuard) {
        const data = getData();
        const normalizedTarget = normalizeTarget(target);
        const role = normalizedTarget.role;
        const empId = normalizedTarget.empId;
        const actions = [];
        const employees = data.employees || [];
        const teamIds = employeeTeamIds(employees, empId);

        if (role === 'EMPLOYEE' && empId) addEmployeeActions(actions, data, empId);
        if (role === 'MANAGER') addManagerActions(actions, data, empId, teamIds);
        if (role === 'ADMIN') addAdminActions(actions, data);
        if (role === 'HR') addHrActions(actions, data);
        if (role === 'SUPER_ADMIN' && !recursionGuard) {
            computePendingActions({ role: 'HR' }, true)
                .filter(action => action.priority === PRIORITIES.CRITICAL || action.priority === PRIORITIES.HIGH)
                .forEach(action => addAction(actions, {
                    ...action,
                    assigneeRole: 'SUPER_ADMIN',
                    title: 'Critical organizational action: ' + action.title
                }));
        }

        addStoredPendingActions(actions, data, role, empId);
        return actions;
    }

    function getPendingActions(target = {}) {
        try {
            const before = isPlainObject(target) ? JSON.stringify(target) : '';
            const actions = computePendingActions(target);
            const critical = actions.filter(action => action.priority === PRIORITIES.CRITICAL).length;
            const high = actions.filter(action => action.priority === PRIORITIES.HIGH).length;
            emitPendingTelemetry('PENDING_ACTIONS_COMPUTED', {
                severity: critical ? 'WARNING' : 'INFO',
                status: critical ? 'SLA_RISK' : 'COMPUTED',
                metadata: {
                    target: normalizeTarget(target),
                    total: actions.length,
                    critical,
                    high
                }
            });
            if (critical || high) {
                emitPendingTelemetry('PENDING_ACTION_SLA_RISK_DETECTED', {
                    severity: critical ? 'CRITICAL' : 'WARNING',
                    status: 'SLA_RISK',
                    metadata: { critical, high }
                });
            }
            if (before && JSON.stringify(target) !== before) {
                safeWarn(`${PREFIX} Target mutation guard detected an unexpected mutation.`);
            }
            return actions;
        } catch (err) {
            safeWarn(`${PREFIX} Pending action computation failed safely.`, err && err.message ? err.message : err);
            emitPendingTelemetry('PENDING_ACTION_COMPUTE_FAILED_SAFE', {
                severity: 'WARNING',
                status: 'FAILED_SAFE',
                metadata: { error: err && err.message ? err.message : safeString(err, 'unknown pending action failure') }
            });
            return [];
        }
    }

    function getPendingSummary(target = {}) {
        const actions = getPendingActions(target);
        const byModule = {};
        actions.forEach(action => {
            byModule[action.module] = (byModule[action.module] || 0) + 1;
        });
        return {
            total: actions.length,
            critical: actions.filter(a => a.priority === PRIORITIES.CRITICAL).length,
            high: actions.filter(a => a.priority === PRIORITIES.HIGH).length,
            medium: actions.filter(a => a.priority === PRIORITIES.MEDIUM).length,
            low: actions.filter(a => a.priority === PRIORITIES.LOW).length,
            byModule,
            actions
        };
    }

    const PendingActionService = Object.freeze({
        getPendingActions,
        getPendingSummary,
        addAction,
        normalizeAction,
        safePriority,
        ageDays
    });

    global.PendingActionService = PendingActionService;

    if (global.__ARTHHRMS_DEV__) {
        (function runSelfTest() {
            const tests = [];
            const previousTelemetry = global.WorkflowTelemetryService;
            const previousDb = global.DB;

            function check(name, condition) {
                tests.push({ name, passed: !!condition });
            }

            try {
                const data = {
                    employees: [
                        { id: 'EMP1001', managerId: 'EMP2001' },
                        { id: 'EMP2001', managerId: '' }
                    ],
                    leaveRequests: [
                        { id: 'L1', leaveId: 'L1', empId: 'EMP1001', managerStatus: 'Pending', status: 'Pending', appliedOn: '2026-05-10' },
                        { id: 'L2', leaveId: 'L2', empId: 'EMP1001', managerStatus: 'Approved', finalStatus: 'Manager Approved', reviewedAt: '2026-05-11' }
                    ],
                    expenseClaims: [
                        { id: 'E1', empId: 'EMP1001', status: 'Approved by Manager' }
                    ],
                    strategicDeliverables: [
                        { id: 'D1', deliverableId: 'D1', empId: 'EMP1001', managerId: 'EMP2001', deadlineDate: '2026-05-01', currentStatus: 'Open' }
                    ],
                    attendanceRegularizations: [
                        { id: 'A1', status: 'Pending', requestedOn: '2026-05-12' }
                    ],
                    helpdeskTickets: [
                        { id: 'H1', empId: 'EMP1001', status: 'Open', createdOn: '2026-05-10' }
                    ],
                    onboardingCollections: [
                        { id: 'O1', completed: false }
                    ],
                    documentVerifications: [
                        { id: 'V1', status: 'Pending' }
                    ],
                    payroll: [
                        { id: 'P1', payrollStatus: 'Approved' }
                    ],
                    pendingActions: [
                        { id: 'PA1', sourceType: 'manual', sourceId: 'M1', module: 'Manual', title: 'Manual HR task', priority: 'LOW', assigneeRole: 'HR', status: 'Open' }
                    ]
                };
                global.DB = {
                    get() { return data; },
                    today() { return '2026-05-19'; },
                    normalizeRoleTarget(role) { return String(role || '').trim().toUpperCase().replace(/\s+/g, '_'); },
                    resolveEmployeeId(id) { return String(id || '').trim(); }
                };
                global.WorkflowTelemetryService = undefined;

                const managerTarget = { role: 'manager', empId: 'EMP2001' };
                const before = JSON.stringify(managerTarget);
                const managerActions = getPendingActions(managerTarget);
                check('pending actions compute correctly', managerActions.some(action => action.title === 'Leave approval pending'));
                check('role visibility preserved', managerActions.every(action => action.assigneeEmpId === 'EMP2001' || action.assigneeRole === ''));
                check('overdue calculations preserved', managerActions.some(action => action.priority === PRIORITIES.HIGH || action.priority === PRIORITIES.CRITICAL));
                check('target input is never mutated', JSON.stringify(managerTarget) === before);

                const hrSummary = getPendingSummary({ role: 'HR' });
                check('pending summaries compute correctly', hrSummary.total > 0 && hrSummary.high > 0 && hrSummary.byModule.Leave >= 1);

                const superActions = getPendingActions({ role: 'SUPER_ADMIN' });
                check('super admin critical visibility preserved', superActions.some(action => action.title.indexOf('Critical organizational action:') === 0));

                const malformed = getPendingActions(Symbol('bad-target'));
                check('malformed payloads handled safely', Array.isArray(malformed));

                global.WorkflowTelemetryService = {
                    emitWorkflowTelemetry() {
                        throw new Error('telemetry down');
                    }
                };
                const telemetryIsolated = getPendingActions({ role: 'ADMIN' });
                check('telemetry failures isolated', telemetryIsolated.some(action => action.module === 'Helpdesk'));

                check('export is frozen', Object.isFrozen(PendingActionService));

                const passed = tests.every(test => test.passed);
                global.__ARTHHRMS_PENDING_ACTION_SELF_TEST__ = Object.freeze({
                    passed,
                    tests: Object.freeze(tests.map(test => Object.freeze({ ...test })))
                });
                if (passed) safeInfo(`${PREFIX} development self-test passed.`, global.__ARTHHRMS_PENDING_ACTION_SELF_TEST__);
                else safeWarn(`${PREFIX} development self-test reported failures.`, global.__ARTHHRMS_PENDING_ACTION_SELF_TEST__);
            } catch (err) {
                global.__ARTHHRMS_PENDING_ACTION_SELF_TEST__ = Object.freeze({
                    passed: false,
                    tests: Object.freeze(tests.map(test => Object.freeze({ ...test }))),
                    error: err && err.message ? err.message : safeString(err, 'unknown self-test error')
                });
                safeWarn(`${PREFIX} development self-test failed safely.`, global.__ARTHHRMS_PENDING_ACTION_SELF_TEST__);
            } finally {
                global.WorkflowTelemetryService = previousTelemetry;
                global.DB = previousDb;
            }
        })();
    }
})(typeof window !== 'undefined' ? window : globalThis);
