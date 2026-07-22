/**
 * notificationRoutingService.js
 * ARTHHRMS — Notification Routing Intelligence Layer
 *
 * PURPOSE:
 * Provides centralized workflow notification routing logic
 * independent from workflow orchestration internals.
 *
 * This service decides:
 * - who should receive notifications
 * - routing escalation behavior
 * - role targeting
 * - employee targeting
 *
 * This service does NOT:
 * - send notifications
 * - own orchestration
 * - inspect monitoring systems
 *
 * ARCHITECTURE RULE:
 * Routing logic must remain isolated from workflow orchestration.
 *
 * STABILITY:
 * Existing workflow notification behavior must remain compatible.
 *
 * DEPENDS ON:
 * - window.WorkflowTelemetryService (optional)
 *
 * @version 1.0.0
 */
(function (global) {
    'use strict';

    const PREFIX = '[NotificationRoutingService]';
    const PRIORITIES = Object.freeze({
        LOW: 'LOW',
        MEDIUM: 'MEDIUM',
        HIGH: 'HIGH',
        CRITICAL: 'CRITICAL'
    });

    const WORKFLOW_EVENTS = Object.freeze({
        LEAVE_APPLIED: 'LEAVE_APPLIED',
        LEAVE_APPROVED: 'LEAVE_APPROVED',
        LEAVE_REJECTED: 'LEAVE_REJECTED',
        ATTENDANCE_REGULARIZATION_REQUESTED: 'ATTENDANCE_REGULARIZATION_REQUESTED',
        ATTENDANCE_REGULARIZATION_APPROVED: 'ATTENDANCE_REGULARIZATION_APPROVED',
        ATTENDANCE_REGULARIZATION_REJECTED: 'ATTENDANCE_REGULARIZATION_REJECTED',
        EXPENSE_SUBMITTED: 'EXPENSE_SUBMITTED',
        EXPENSE_APPROVED: 'EXPENSE_APPROVED',
        EXPENSE_FINANCE_APPROVED: 'EXPENSE_FINANCE_APPROVED',
        EXPENSE_REJECTED: 'EXPENSE_REJECTED',
        EXPENSE_PAID: 'EXPENSE_PAID',
        PAYROLL_GENERATED: 'PAYROLL_GENERATED',
        PAYROLL_APPROVED: 'PAYROLL_APPROVED',
        PAYROLL_PAID: 'PAYROLL_PAID',
        PAYROLL_MODIFIED: 'PAYROLL_MODIFIED',
        IMPORT_STAGED: 'IMPORT_STAGED',
        IMPORT_VALIDATION_FAILED: 'IMPORT_VALIDATION_FAILED',
        IMPORT_COMMITTED: 'IMPORT_COMMITTED',
        IMPORT_ROLLED_BACK: 'IMPORT_ROLLED_BACK',
        IMPORT_COMPLETED: 'IMPORT_COMPLETED',
        DELIVERABLE_ASSIGNED: 'DELIVERABLE_ASSIGNED',
        DELIVERABLE_REVIEWED: 'DELIVERABLE_REVIEWED',
        DELIVERABLE_CLOSED: 'DELIVERABLE_CLOSED',
        DELIVERABLE_OVERDUE: 'DELIVERABLE_OVERDUE',
        HELPDESK_TICKET_RAISED: 'HELPDESK_TICKET_RAISED',
        HELPDESK_TICKET_RESOLVED: 'HELPDESK_TICKET_RESOLVED',
        ONBOARDING_COLLECTION_SAVED: 'ONBOARDING_COLLECTION_SAVED',
        DOCUMENT_VERIFICATION_SAVED: 'DOCUMENT_VERIFICATION_SAVED',
        GENERIC_NOTIFICATION: 'GENERIC_NOTIFICATION'
    });

    const EVENT_MODULES = Object.freeze({
        LEAVE_APPLIED: 'Leave',
        LEAVE_APPROVED: 'Leave',
        LEAVE_REJECTED: 'Leave',
        ATTENDANCE_REGULARIZATION_REQUESTED: 'Attendance Regularization',
        ATTENDANCE_REGULARIZATION_APPROVED: 'Attendance Regularization',
        ATTENDANCE_REGULARIZATION_REJECTED: 'Attendance Regularization',
        EXPENSE_SUBMITTED: 'Expense',
        EXPENSE_APPROVED: 'Expense',
        EXPENSE_FINANCE_APPROVED: 'Expense',
        EXPENSE_REJECTED: 'Expense',
        EXPENSE_PAID: 'Expense',
        PAYROLL_GENERATED: 'Payroll',
        PAYROLL_APPROVED: 'Payroll',
        PAYROLL_PAID: 'Payroll',
        PAYROLL_MODIFIED: 'Payroll',
        IMPORT_STAGED: 'Import Center',
        IMPORT_VALIDATION_FAILED: 'Import Center',
        IMPORT_COMMITTED: 'Import Center',
        IMPORT_ROLLED_BACK: 'Import Center',
        IMPORT_COMPLETED: 'Import Center',
        DELIVERABLE_ASSIGNED: 'Strategic Deliverables',
        DELIVERABLE_REVIEWED: 'Strategic Deliverables',
        DELIVERABLE_CLOSED: 'Strategic Deliverables',
        DELIVERABLE_OVERDUE: 'Strategic Deliverables',
        HELPDESK_TICKET_RAISED: 'Helpdesk',
        HELPDESK_TICKET_RESOLVED: 'Helpdesk',
        ONBOARDING_COLLECTION_SAVED: 'Onboarding',
        DOCUMENT_VERIFICATION_SAVED: 'Documents',
        GENERIC_NOTIFICATION: 'General'
    });

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

    function normalizeRole(role) {
        const value = safeString(role || '', '').trim();
        if (!value) return '';
        try {
            if (db() && typeof db().normalizeRoleTarget === 'function') return db().normalizeRoleTarget(value);
        } catch (e) {}
        return value.toUpperCase().replace(/\s+/g, '_');
    }

    function resolveEmpId(empId, data) {
        const value = safeString(empId || '', '').trim();
        if (!value) return '';
        try {
            if (db() && typeof db().resolveEmployeeId === 'function') return db().resolveEmployeeId(value, data);
        } catch (e) {}
        return value;
    }

    function getEmployee(empId, data) {
        const d = data || getData();
        const officialId = resolveEmpId(empId, d);
        return ((d && d.employees) || []).find(employee => employee.id === officialId || employee.empId === officialId) || null;
    }

    function getManagerId(empId, data) {
        const employee = getEmployee(empId, data);
        return employee ? employee.managerId || '' : '';
    }

    function normalizePriority(priority) {
        const value = safeString(priority || PRIORITIES.MEDIUM, PRIORITIES.MEDIUM).trim().toUpperCase();
        return PRIORITIES[value] || PRIORITIES.MEDIUM;
    }

    function employeeDisplayName(employee, empId) {
        return employee?.name || employee?.fullName || empId || 'Employee';
    }

    function telemetryService() {
        return global.WorkflowTelemetryService || null;
    }

    function escalationPolicyService() {
        return global.EscalationPolicyService || null;
    }

    if (typeof global.WorkflowTelemetryService === 'undefined') {
        safeWarn(`${PREFIX} Optional dependency window.WorkflowTelemetryService is unavailable. Routing will continue without telemetry.`);
    }

    function emitRoutingTelemetry(eventType, payload) {
        if (telemetryForwarding) return { success: false, warning: 'Routing telemetry skipped to avoid recursion.' };
        const service = telemetryService();
        if (!service || typeof service.emitWorkflowTelemetry !== 'function') return { success: true, warning: '' };
        try {
            telemetryForwarding = true;
            return service.emitWorkflowTelemetry(eventType, {
                source: 'notificationRoutingService',
                severity: payload && payload.severity ? payload.severity : 'INFO',
                status: payload && payload.status ? payload.status : 'ROUTED',
                eventId: payload && payload.eventId ? payload.eventId : '',
                correlationId: payload && payload.correlationId ? payload.correlationId : '',
                metadata: cloneObject(payload && payload.metadata)
            });
        } catch (err) {
            return {
                success: false,
                warning: `Routing telemetry failed safely: ${err && err.message ? err.message : safeString(err, 'unknown telemetry failure')}`
            };
        } finally {
            telemetryForwarding = false;
        }
    }

    function routeBase(type, event) {
        return {
            type,
            module: event.module || EVENT_MODULES[type] || 'General',
            priority: normalizePriority(event.priority),
            targetId: event.targetId || '',
            actionLink: event.actionLink || '',
            metadata: cloneObject(event.metadata)
        };
    }

    function normalizeRoute(route) {
        const source = isPlainObject(route) ? cloneObject(route) : {};
        const type = safeString(source.type || WORKFLOW_EVENTS.GENERIC_NOTIFICATION, WORKFLOW_EVENTS.GENERIC_NOTIFICATION).trim() || WORKFLOW_EVENTS.GENERIC_NOTIFICATION;
        return {
            targetRole: normalizeRole(source.targetRole || source.toRole || ''),
            targetEmpId: resolveEmpId(source.targetEmpId || source.toEmpId || ''),
            title: safeString(source.title || 'Workflow Update', 'Workflow Update').trim() || 'Workflow Update',
            message: safeString(source.message || source.msg || '', '').trim(),
            module: safeString(source.module || EVENT_MODULES[type] || 'General', 'General').trim() || 'General',
            priority: normalizePriority(source.priority),
            metadata: cloneObject(source.metadata),
            actionLink: safeString(source.actionLink || '', '').trim(),
            targetId: safeString(source.targetId || '', '').trim(),
            type
        };
    }

    function safeRoute(route) {
        try {
            return normalizeRoute(route);
        } catch (err) {
            emitRoutingTelemetry('NOTIFICATION_ROUTE_NORMALIZATION_FAILED', {
                severity: 'WARNING',
                status: 'ROUTE_FILTERED',
                metadata: {
                    error: err && err.message ? err.message : safeString(err, 'unknown route normalization failure')
                }
            });
            return null;
        }
    }

    function isValidRoute(route) {
        return !!(route && (route.targetRole || route.targetEmpId || route.targetRole === 'ALL'));
    }

    function filterValidRoutes(routes) {
        const normalized = [];
        (Array.isArray(routes) ? routes : []).forEach(route => {
            const row = safeRoute(route);
            if (isValidRoute(row)) {
                normalized.push(Object.freeze({
                    ...row,
                    metadata: Object.freeze(cloneObject(row.metadata))
                }));
            } else {
                emitRoutingTelemetry('NOTIFICATION_ROUTE_FILTERED', {
                    severity: 'WARNING',
                    status: 'ROUTE_FILTERED',
                    metadata: {
                        reason: 'missing target role or employee',
                        routeType: row && row.type ? row.type : ''
                    }
                });
            }
        });
        return Object.freeze(normalized);
    }

    function normalizeEvent(event) {
        const source = isPlainObject(event) ? cloneObject(event) : {};
        source.metadata = cloneObject(source.metadata);
        source.targetEmpId = resolveEmpId(source.targetEmpId || source.empId || source.employeeId || source.metadata.empId || source.metadata.employeeId || '');
        source.targetRole = normalizeRole(source.targetRole || '');
        source.priority = normalizePriority(source.priority);
        source.module = source.module || 'General';
        return source;
    }

    function pushImportRoute(routes, base, event) {
        routes.push({
            ...base,
            targetRole: 'HR',
            targetEmpId: '',
            title: event.title || 'Import Center Update',
            message: event.message || 'Import center workflow updated. Review import logs for details.'
        });
    }

    function escalationRecommendedRoles(type, event) {
        const fallback = Object.freeze(['HR', 'SUPER_ADMIN']);
        const service = escalationPolicyService();
        if (!service || typeof service.evaluateEscalation !== 'function') return fallback;
        try {
            const evaluation = service.evaluateEscalation({
                ...event,
                type,
                priority: PRIORITIES.CRITICAL,
                module: event.module || 'Strategic Deliverables',
                status: event.status || 'overdue'
            });
            if (!evaluation || !Array.isArray(evaluation.recommendedRoles) || !evaluation.recommendedRoles.length) return fallback;
            return Object.freeze(evaluation.recommendedRoles.slice());
        } catch (err) {
            safeWarn(`${PREFIX} EscalationPolicyService targeting guidance failed safely.`, err && err.message ? err.message : err);
            return fallback;
        }
    }

    function buildRoutes(type, event) {
        const data = getData();
        const empId = event.targetEmpId || event.metadata.empId || event.metadata.employeeId || '';
        const emp = empId ? getEmployee(empId, data) : null;
        const managerId = event.metadata.managerId || (emp ? emp.managerId : '') || getManagerId(empId, data);
        const employeeName = employeeDisplayName(emp, empId);
        const routes = [];
        const base = routeBase(type, event);

        if (type === WORKFLOW_EVENTS.LEAVE_APPLIED) {
            routes.push({
                ...base,
                targetRole: managerId ? '' : 'HR',
                targetEmpId: managerId,
                title: 'New Leave Request',
                message: `${employeeName} applied for leave. Manager review is pending.`
            });
        }
        if (type === WORKFLOW_EVENTS.LEAVE_APPROVED) {
            routes.push({
                ...base,
                targetRole: 'HR',
                targetEmpId: '',
                title: 'Leave Approved by Manager',
                message: `${employeeName} leave request is waiting for HR final action.`
            });
            routes.push({
                ...base,
                targetRole: '',
                targetEmpId: empId,
                title: 'Leave Approved',
                message: 'Your leave request has moved forward in approval workflow.'
            });
        }
        if (type === WORKFLOW_EVENTS.LEAVE_REJECTED) {
            routes.push({
                ...base,
                targetRole: '',
                targetEmpId: empId,
                title: 'Leave Rejected',
                message: 'Your leave request was rejected.'
            });
        }
        if (type === WORKFLOW_EVENTS.ATTENDANCE_REGULARIZATION_REQUESTED) {
            routes.push({
                ...base,
                targetRole: 'ADMIN',
                targetEmpId: '',
                title: 'Attendance Regularization Request',
                message: `${employeeName} requested attendance correction.`
            });
        }
        if (type === WORKFLOW_EVENTS.ATTENDANCE_REGULARIZATION_APPROVED || type === WORKFLOW_EVENTS.ATTENDANCE_REGULARIZATION_REJECTED) {
            routes.push({
                ...base,
                targetRole: '',
                targetEmpId: empId,
                title: type === WORKFLOW_EVENTS.ATTENDANCE_REGULARIZATION_APPROVED ? 'Attendance Regularization Approved' : 'Attendance Regularization Rejected',
                message: 'Your attendance regularization request has been updated.'
            });
            routes.push({
                ...base,
                targetRole: 'HR',
                targetEmpId: '',
                title: 'Attendance Regularization Updated',
                message: `${employeeName} attendance regularization has been processed by admin.`
            });
        }
        if (type === WORKFLOW_EVENTS.EXPENSE_SUBMITTED) {
            routes.push({
                ...base,
                targetRole: managerId ? '' : 'MANAGER',
                targetEmpId: managerId,
                title: 'Expense Claim Submitted',
                message: `${employeeName} submitted an expense claim for approval.`
            });
        }
        if (type === WORKFLOW_EVENTS.EXPENSE_APPROVED) {
            routes.push({
                ...base,
                targetRole: 'HR',
                targetEmpId: '',
                title: 'Expense Pending HR Payment',
                message: `${employeeName} expense claim is manager approved and pending HR payment.`
            });
        }
        if (type === WORKFLOW_EVENTS.EXPENSE_FINANCE_APPROVED) {
            routes.push({
                ...base,
                targetRole: '',
                targetEmpId: empId,
                title: 'Expense Approved for Payment',
                message: 'Your expense claim has been approved by finance and is pending payment.'
            });
        }
        if (type === WORKFLOW_EVENTS.EXPENSE_REJECTED || type === WORKFLOW_EVENTS.EXPENSE_PAID) {
            routes.push({
                ...base,
                targetRole: '',
                targetEmpId: empId,
                title: type === WORKFLOW_EVENTS.EXPENSE_PAID ? 'Expense Paid' : 'Expense Rejected',
                message: type === WORKFLOW_EVENTS.EXPENSE_PAID ? 'Your expense claim has been marked paid.' : 'Your expense claim has been rejected.'
            });
        }
        if (type === WORKFLOW_EVENTS.PAYROLL_GENERATED) {
            routes.push({
                ...base,
                targetRole: '',
                targetEmpId: empId,
                title: 'Payroll Generated',
                message: event.message || 'Your payroll record has been generated for review.'
            });
        }
        if (type === WORKFLOW_EVENTS.PAYROLL_APPROVED) {
            routes.push({
                ...base,
                targetRole: 'HR',
                targetEmpId: '',
                title: 'Payroll Approved',
                message: event.message || `${employeeName} payroll has been approved and is ready for payment.`
            });
        }
        if (type === WORKFLOW_EVENTS.PAYROLL_PAID) {
            routes.push({
                ...base,
                targetRole: '',
                targetEmpId: empId,
                title: 'Salary Paid',
                message: event.message || 'Your salary has been marked paid.'
            });
        }
        if (type === WORKFLOW_EVENTS.PAYROLL_MODIFIED) {
            routes.push({
                ...base,
                targetRole: 'HR',
                targetEmpId: '',
                title: 'Payroll Modified',
                message: event.message || `${employeeName} payroll record was modified.`
            });
        }
        if ([WORKFLOW_EVENTS.IMPORT_STAGED, WORKFLOW_EVENTS.IMPORT_VALIDATION_FAILED, WORKFLOW_EVENTS.IMPORT_COMMITTED, WORKFLOW_EVENTS.IMPORT_ROLLED_BACK, WORKFLOW_EVENTS.IMPORT_COMPLETED].indexOf(type) !== -1) {
            pushImportRoute(routes, base, event);
        }
        if (type === WORKFLOW_EVENTS.DELIVERABLE_ASSIGNED) {
            routes.push({
                ...base,
                targetRole: '',
                targetEmpId: empId,
                title: 'Strategic Deliverable Assigned',
                message: event.message || 'A strategic deliverable has been assigned to you.'
            });
            if (managerId) {
                routes.push({
                    ...base,
                    targetRole: '',
                    targetEmpId: managerId,
                    title: 'Team Deliverable Assigned',
                    message: `${employeeName} has a deliverable requiring manager review.`
                });
            }
        }
        if (type === WORKFLOW_EVENTS.DELIVERABLE_REVIEWED) {
            routes.push({
                ...base,
                targetRole: 'HR',
                targetEmpId: '',
                title: 'Deliverable Review Submitted',
                message: `${employeeName} deliverable review has been submitted.`
            });
        }
        if (type === WORKFLOW_EVENTS.DELIVERABLE_CLOSED) {
            routes.push({
                ...base,
                targetRole: '',
                targetEmpId: empId,
                title: 'Strategic Deliverable Closed',
                message: event.message || 'Your strategic deliverable has been closed by HR.'
            });
        }
        if (type === WORKFLOW_EVENTS.DELIVERABLE_OVERDUE) {
            const roles = escalationRecommendedRoles(type, event);
            if (roles.indexOf('HR') !== -1) {
                routes.push({
                    ...base,
                    priority: PRIORITIES.CRITICAL,
                    targetRole: 'HR',
                    targetEmpId: '',
                    title: 'Deliverable Overdue',
                    message: `${employeeName} has an overdue strategic deliverable.`
                });
            }
            if (roles.indexOf('SUPER_ADMIN') !== -1) {
                routes.push({
                    ...base,
                    priority: PRIORITIES.CRITICAL,
                    targetRole: 'SUPER_ADMIN',
                    targetEmpId: '',
                    title: 'Strategic Accountability Risk',
                    message: `${employeeName} has an overdue strategic commitment.`
                });
            }
        }
        if (type === WORKFLOW_EVENTS.HELPDESK_TICKET_RAISED) {
            routes.push({
                ...base,
                targetRole: 'ADMIN',
                targetEmpId: '',
                title: 'New Helpdesk Ticket',
                message: `${employeeName} raised a helpdesk ticket.`
            });
        }
        if (type === WORKFLOW_EVENTS.HELPDESK_TICKET_RESOLVED) {
            routes.push({
                ...base,
                targetRole: '',
                targetEmpId: empId,
                title: 'Helpdesk Ticket Resolved',
                message: 'Your helpdesk ticket has been resolved.'
            });
        }
        if (type === WORKFLOW_EVENTS.ONBOARDING_COLLECTION_SAVED) {
            routes.push({
                ...base,
                targetRole: '',
                targetEmpId: empId,
                title: 'Onboarding Documents Updated',
                message: 'Your onboarding document collection status has been updated.'
            });
            routes.push({
                ...base,
                targetRole: 'HR',
                targetEmpId: '',
                title: 'Onboarding Collection Updated',
                message: `Onboarding collection saved for ${employeeName}.`
            });
        }
        if (type === WORKFLOW_EVENTS.DOCUMENT_VERIFICATION_SAVED) {
            routes.push({
                ...base,
                targetRole: '',
                targetEmpId: empId,
                title: 'Document Verification Updated',
                message: 'Your document verification status has been updated.'
            });
        }
        if (event.explicitTarget && (event.targetRole || event.targetEmpId)) {
            routes.push({
                ...base,
                targetRole: event.targetRole,
                targetEmpId: event.targetEmpId,
                title: event.title,
                message: event.message
            });
        }

        return routes;
    }

    function routeNotifications(type, event) {
        try {
            const eventType = safeString(type || WORKFLOW_EVENTS.GENERIC_NOTIFICATION, WORKFLOW_EVENTS.GENERIC_NOTIFICATION).trim() || WORKFLOW_EVENTS.GENERIC_NOTIFICATION;
            const normalizedEvent = normalizeEvent(event);
            const routes = filterValidRoutes(buildRoutes(eventType, normalizedEvent));
            emitRoutingTelemetry('NOTIFICATION_ROUTES_GENERATED', {
                status: 'ROUTED',
                eventId: normalizedEvent.eventId || '',
                correlationId: normalizedEvent.correlationId || '',
                metadata: {
                    workflowType: eventType,
                    routeCount: routes.length,
                    hasEscalationRoute: routes.some(route => route.priority === PRIORITIES.CRITICAL)
                }
            });
            if (routes.some(route => route.priority === PRIORITIES.CRITICAL)) {
                emitRoutingTelemetry('NOTIFICATION_ESCALATION_ROUTE_CREATED', {
                    severity: 'WARNING',
                    status: 'ESCALATION_ROUTE',
                    eventId: normalizedEvent.eventId || '',
                    correlationId: normalizedEvent.correlationId || '',
                    metadata: { workflowType: eventType }
                });
            }
            return routes;
        } catch (err) {
            safeWarn(`${PREFIX} Routing failed safely.`, err && err.message ? err.message : err);
            emitRoutingTelemetry('NOTIFICATION_ROUTING_FAILED_SAFE', {
                severity: 'WARNING',
                status: 'FAILED_SAFE',
                metadata: {
                    workflowType: safeString(type || '', ''),
                    error: err && err.message ? err.message : safeString(err, 'unknown routing failure')
                }
            });
            return Object.freeze([]);
        }
    }

    const NotificationRoutingService = Object.freeze({
        routeNotifications,
        normalizeRoute,
        safeRoute,
        filterValidRoutes
    });

    global.NotificationRoutingService = NotificationRoutingService;

    if (global.__ARTHHRMS_DEV__) {
        (function runSelfTest() {
            const tests = [];
            const previousTelemetry = global.WorkflowTelemetryService;
            const previousEscalationPolicy = global.EscalationPolicyService;

            function check(name, condition) {
                tests.push({ name, passed: !!condition });
            }

            try {
                global.WorkflowTelemetryService = undefined;
                const event = {
                    eventId: 'WF-ROUTE-SELF',
                    correlationId: 'CORR-ROUTE-SELF',
                    targetEmpId: 'EMP1001',
                    module: 'Leave',
                    priority: 'MEDIUM',
                    metadata: { managerId: 'EMP2001' }
                };
                const before = JSON.stringify(event);
                const leaveRoutes = routeNotifications(WORKFLOW_EVENTS.LEAVE_APPLIED, event);
                check('routes generate correctly', leaveRoutes.length === 1 && leaveRoutes[0].targetEmpId === 'EMP2001');
                check('input event is never mutated', JSON.stringify(event) === before);

                const escalationRoutes = routeNotifications(WORKFLOW_EVENTS.DELIVERABLE_OVERDUE, {
                    targetEmpId: 'EMP1001',
                    module: 'Strategic Deliverables',
                    metadata: {}
                });
                check(
                    'escalation routes preserved',
                    escalationRoutes.length === 2 &&
                        escalationRoutes.every(route => route.priority === PRIORITIES.CRITICAL) &&
                        escalationRoutes.some(route => route.targetRole === 'SUPER_ADMIN')
                );

                global.EscalationPolicyService = {
                    evaluateEscalation() {
                        return {
                            escalated: true,
                            severity: 'CRITICAL',
                            escalationType: 'SLA_BREACH',
                            recommendedRoles: ['HR'],
                            reason: 'HR-only test guidance.',
                            metadata: {}
                        };
                    }
                };
                const guidedRoutes = routeNotifications(WORKFLOW_EVENTS.DELIVERABLE_OVERDUE, {
                    targetEmpId: 'EMP1001',
                    module: 'Strategic Deliverables',
                    metadata: {}
                });
                check('escalation policy targeting guidance is optional-safe', guidedRoutes.length === 1 && guidedRoutes[0].targetRole === 'HR');
                global.EscalationPolicyService = previousEscalationPolicy;

                const malformed = routeNotifications(Symbol('bad-type'), Symbol('bad-event'));
                check('malformed events handled safely', Object.isFrozen(malformed) && malformed.length === 0);

                const filtered = filterValidRoutes([
                    { type: WORKFLOW_EVENTS.GENERIC_NOTIFICATION, targetRole: '', targetEmpId: '', title: 'Bad' },
                    { type: WORKFLOW_EVENTS.GENERIC_NOTIFICATION, targetRole: 'HR', title: 'Good' }
                ]);
                check('invalid routes filtered', filtered.length === 1 && filtered[0].targetRole === 'HR');

                global.WorkflowTelemetryService = {
                    emitWorkflowTelemetry() {
                        throw new Error('telemetry down');
                    }
                };
                const telemetryIsolated = routeNotifications(WORKFLOW_EVENTS.HELPDESK_TICKET_RAISED, {
                    targetEmpId: 'EMP1001',
                    module: 'Helpdesk',
                    metadata: {}
                });
                check('telemetry failures isolated', telemetryIsolated.length === 1 && telemetryIsolated[0].targetRole === 'ADMIN');

                check('export is frozen', Object.isFrozen(NotificationRoutingService));

                const passed = tests.every(test => test.passed);
                global.__ARTHHRMS_NOTIFICATION_ROUTING_SELF_TEST__ = Object.freeze({
                    passed,
                    tests: Object.freeze(tests.map(test => Object.freeze({ ...test })))
                });
                if (passed) safeInfo(`${PREFIX} development self-test passed.`, global.__ARTHHRMS_NOTIFICATION_ROUTING_SELF_TEST__);
                else safeWarn(`${PREFIX} development self-test reported failures.`, global.__ARTHHRMS_NOTIFICATION_ROUTING_SELF_TEST__);
            } catch (err) {
                global.__ARTHHRMS_NOTIFICATION_ROUTING_SELF_TEST__ = Object.freeze({
                    passed: false,
                    tests: Object.freeze(tests.map(test => Object.freeze({ ...test }))),
                    error: err && err.message ? err.message : safeString(err, 'unknown self-test error')
                });
                safeWarn(`${PREFIX} development self-test failed safely.`, global.__ARTHHRMS_NOTIFICATION_ROUTING_SELF_TEST__);
            } finally {
                global.WorkflowTelemetryService = previousTelemetry;
                global.EscalationPolicyService = previousEscalationPolicy;
            }
        })();
    }
})(typeof window !== 'undefined' ? window : globalThis);
