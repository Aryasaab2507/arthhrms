/**
 * workflowEngine.js
 * ARTHHRMS — Workflow Orchestrator Layer
 *
 * PURPOSE:
 * Coordinates workflow events across isolated handlers without
 * tightly coupling execution responsibilities together.
 *
 * This file acts as an ORCHESTRATOR.
 * It is NOT a business logic container.
 *
 * STABILITY:
 * Existing emitWorkflowEvent() consumers remain backward-compatible.
 *
 * ARCHITECTURE RULE:
 * Handler failures must never cascade into total workflow failure.
 *
 * DEPENDS ON:
 * - window.WorkflowEventSchema (optional)
 * - window.WorkflowTelemetryService (optional)
 * - window.WorkflowTraceStore (optional)
 * - window.AuditService (optional)
 * - window.OrchestrationMetricsService (optional)
 * - window.EventReplayService (optional)
 *
 * @version 2.0.0
 */
(function (global) {
    function db() { return global.DB; }

    const ENGINE_PREFIX = '[workflowEngine]';

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

    const PRIORITIES = Object.freeze({
        LOW: 'LOW',
        MEDIUM: 'MEDIUM',
        HIGH: 'HIGH',
        CRITICAL: 'CRITICAL'
    });

    const EVENT_MODULES = {
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
    };

    const HANDLER_ORDER = Object.freeze([
        'auditHandler',
        'telemetryHandler',
        'notificationHandler',
        'pendingActionHandler',
        'escalationHandler'
    ]);

    const handlerRegistry = [];
    let traceStoreMissingWarned = false;

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

    function safeString(value, fallback = '') {
        try {
            if (typeof value === 'symbol') return value.toString();
            return String(value);
        } catch (e) {
            return fallback;
        }
    }

    function safePayload(payload) {
        const output = {};
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return output;
        try {
            Object.keys(payload).forEach(key => {
                try {
                    output[key] = payload[key];
                } catch (e) {}
            });
        } catch (e) {}
        return output;
    }

    function safeMetadata(metadata) {
        return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
            ? safePayload(metadata)
            : {};
    }

    function normalizeSeverity(severity, priority) {
        const raw = safeString(severity || '', '').trim().toUpperCase();
        if (['INFO', 'WARNING', 'ERROR', 'CRITICAL'].includes(raw)) return raw;
        const p = normalizePriority(priority);
        if (p === PRIORITIES.CRITICAL) return 'CRITICAL';
        if (p === PRIORITIES.HIGH) return 'WARNING';
        return 'INFO';
    }

    function workflowSchema(options = {}) {
        if (options.forceMissingSchema) return null;
        return global.WorkflowEventSchema || null;
    }

    function telemetryService(options = {}) {
        if (options.forceMissingTelemetry) return null;
        return global.WorkflowTelemetryService || null;
    }

    function workflowHandlersService(options = {}) {
        if (options.forceInternalHandlers) return null;
        return global.WorkflowHandlers || null;
    }

    function notificationRoutingService(options = {}) {
        if (options.forceLegacyNotificationRouting) return null;
        return global.NotificationRoutingService || null;
    }

    function pendingActionService(options = {}) {
        if (options.forceLegacyPendingActions) return null;
        return global.PendingActionService || null;
    }

    function escalationPolicyService(options = {}) {
        if (options.forceLegacyEscalationPolicy) return null;
        return global.EscalationPolicyService || null;
    }

    function auditService(options = {}) {
        if (options.forceLegacyAuditService) return null;
        return global.AuditService || null;
    }

    function orchestrationMetricsService(options = {}) {
        if (options.forceMissingMetricsService || options.forceMissingOrchestrationMetrics) return null;
        return global.OrchestrationMetricsService || null;
    }

    function eventReplayService(options = {}) {
        if (options.forceMissingEventReplayService) return null;
        return global.EventReplayService || null;
    }

    function workflowTraceStore(options = {}) {
        if (options.forceMissingTraceStore) return null;
        return global.WorkflowTraceStore || null;
    }

    function recordMetricSafely(methodName, args = [], options = {}) {
        try {
            const service = orchestrationMetricsService(options);
            if (!service || typeof service[methodName] !== 'function') return null;
            return service[methodName].apply(service, Array.isArray(args) ? args : []);
        } catch (err) {
            safeWarn(`${ENGINE_PREFIX} OrchestrationMetricsService failed safely. Workflow execution continued.`, err && err.message ? err.message : err);
            return null;
        }
    }

    function registerHandler(handlerName, handlerFn) {
        if (!handlerName || typeof handlerFn !== 'function') return false;
        handlerRegistry.push({ handlerName, handlerFn });
        return true;
    }

    function nowIso() {
        return new Date().toISOString();
    }

    function today() {
        return db()?.today ? db().today() : new Date().toISOString().split('T')[0];
    }

    function makeId(prefix) {
        const random = Math.random().toString(36).slice(2, 7).toUpperCase();
        return `${prefix}${Date.now()}${random}`;
    }

    function normalizeRole(role) {
        const value = String(role || '').trim();
        if (!value) return '';
        return db()?.normalizeRoleTarget ? db().normalizeRoleTarget(value) : value.toUpperCase().replace(/\s+/g, '_');
    }

    function resolveEmpId(empId, data) {
        if (!empId) return '';
        return db()?.resolveEmployeeId ? db().resolveEmployeeId(empId, data) : empId;
    }

    function getData() {
        const data = db()?.get ? db().get() : {};
        data.workflowEvents = data.workflowEvents || [];
        data.pendingActions = data.pendingActions || [];
        data.notifications = data.notifications || [];
        data.auditLogs = data.auditLogs || [];
        return data;
    }

    function saveData(data) {
        if (db()?.save) db().save(data);
    }

    function getEmployee(empId, data) {
        const d = data || getData();
        const officialId = resolveEmpId(empId, d);
        return (d.employees || []).find(e => e.id === officialId) || null;
    }

    function getManagerId(empId, data) {
        return getEmployee(empId, data)?.managerId || '';
    }

    function priorityType(priority) {
        const p = String(priority || PRIORITIES.MEDIUM).toUpperCase();
        if (p === PRIORITIES.CRITICAL || p === PRIORITIES.HIGH) return 'warn';
        if (p === PRIORITIES.LOW) return 'info';
        return 'info';
    }

    function normalizePriority(priority) {
        const value = String(priority || PRIORITIES.MEDIUM).toUpperCase();
        return PRIORITIES[value] || PRIORITIES.MEDIUM;
    }

    function ageDays(dateValue) {
        if (!dateValue) return 0;
        const start = new Date(String(dateValue).slice(0, 10) + 'T00:00:00');
        if (Number.isNaN(start.getTime())) return 0;
        const end = new Date(today() + 'T00:00:00');
        return Math.max(0, Math.floor((end - start) / 86400000));
    }

    function legacyNormalizeEvent(type, payload = {}) {
        const safe = safePayload(payload);
        const metadata = safeMetadata(safe.metadata);
        const eventType = safeString(type || safe.type || safe.eventType || WORKFLOW_EVENTS.GENERIC_NOTIFICATION, WORKFLOW_EVENTS.GENERIC_NOTIFICATION).trim() || WORKFLOW_EVENTS.GENERIC_NOTIFICATION;
        const module = safe.module || EVENT_MODULES[eventType] || 'General';
        const priority = normalizePriority(safe.priority);
        const eventId = safe.eventId || metadata.eventId || makeId('WF');
        return {
            eventId,
            correlationId: safe.correlationId || metadata.correlationId || eventId,
            source: safe.source || metadata.source || 'workflowEngine',
            severity: normalizeSeverity(safe.severity || metadata.severity, priority),
            type: eventType,
            module,
            priority,
            actionType: safe.actionType || '',
            actorRole: normalizeRole(safe.actorRole || safe.role || ''),
            actorId: resolveEmpId(safe.actorId || safe.userId || ''),
            targetRole: normalizeRole(safe.targetRole || ''),
            targetEmpId: resolveEmpId(safe.targetEmpId || safe.empId || safe.employeeId || ''),
            targetId: safe.targetId || safe.recordId || safe.leaveId || safe.expenseId || safe.deliverableId || '',
            explicitTarget: !!(safe.targetRole || safe.targetEmpId),
            title: safe.title || eventType.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()),
            message: safe.message || safe.description || '',
            actionLink: safe.actionLink || '',
            metadata,
            status: safe.status || 'Open',
            suppressAudit: !!safe.suppressAudit,
            suppressNotification: !!safe.suppressNotification,
            suppressPendingAction: !!safe.suppressPendingAction,
            suppressEscalation: !!safe.suppressEscalation,
            createdAt: safe.createdAt || nowIso()
        };
    }

    function mergeSchemaEvent(base, schemaEvent) {
        const candidate = schemaEvent && typeof schemaEvent === 'object' && !Array.isArray(schemaEvent)
            ? safePayload(schemaEvent)
            : {};
        const merged = { ...base, ...candidate };
        merged.type = candidate.type || candidate.eventType || base.type;
        merged.eventId = candidate.eventId || candidate.id || base.eventId;
        merged.correlationId = candidate.correlationId || base.correlationId || merged.eventId;
        merged.source = candidate.source || base.source || 'workflowEngine';
        merged.severity = normalizeSeverity(candidate.severity || base.severity, candidate.priority || base.priority);
        merged.priority = normalizePriority(candidate.priority || base.priority);
        merged.module = candidate.module || base.module || EVENT_MODULES[merged.type] || 'General';
        merged.actorRole = normalizeRole(candidate.actorRole || base.actorRole || '');
        merged.actorId = resolveEmpId(candidate.actorId || base.actorId || '');
        merged.targetRole = normalizeRole(candidate.targetRole || base.targetRole || '');
        merged.targetEmpId = resolveEmpId(candidate.targetEmpId || base.targetEmpId || '');
        merged.metadata = { ...(base.metadata || {}), ...safeMetadata(candidate.metadata) };
        return merged;
    }

    function normalizeEvent(type, payload = {}, warnings = [], options = {}) {
        const safe = safePayload(payload);
        const base = legacyNormalizeEvent(type, safe);
        const schema = workflowSchema(options);
        let event = base;

        if (schema && typeof schema.createEvent === 'function') {
            try {
                event = mergeSchemaEvent(base, schema.createEvent(base.type, { ...safe, ...base }));
            } catch (err) {
                warnings.push({
                    warningCode: 'WORKFLOW_SCHEMA_CREATE_FAILED',
                    handlerName: 'eventNormalization',
                    message: `WorkflowEventSchema.createEvent failed safely: ${err && err.message ? err.message : safeString(err, 'unknown error')}`
                });
                event = base;
            }
        }

        if (schema && typeof schema.validateEvent === 'function') {
            try {
                const validation = schema.validateEvent(event);
                if (validation === false || validation?.success === false || validation?.valid === false) {
                    warnings.push({
                        warningCode: 'WORKFLOW_SCHEMA_VALIDATION_WARNING',
                        handlerName: 'eventNormalization',
                        message: validation?.message || 'WorkflowEventSchema.validateEvent reported a non-fatal validation warning.'
                    });
                }
            } catch (err) {
                warnings.push({
                    warningCode: 'WORKFLOW_SCHEMA_VALIDATE_FAILED',
                    handlerName: 'eventNormalization',
                    message: `WorkflowEventSchema.validateEvent failed safely: ${err && err.message ? err.message : safeString(err, 'unknown error')}`
                });
            }
        }

        return event;
    }

    function recordWorkflowEvent(event) {
        const data = getData();
        data.workflowEvents.unshift(event);
        data.workflowEvents = data.workflowEvents.slice(0, 500);
        saveData(data);
        return event;
    }

    function enrichNotification(notification, extras = {}) {
        if (!notification?.id || !db()?.get || !db()?.save) return notification;
        const data = getData();
        const row = (data.notifications || []).find(n => n.id === notification.id);
        if (row) {
            Object.assign(row, extras);
            saveData(data);
            return row;
        }
        return notification;
    }

    function dispatchNotification(payload = {}) {
        const targetRole = normalizeRole(payload.targetRole || payload.toRole || '');
        const targetEmpId = resolveEmpId(payload.targetEmpId || payload.toEmpId || '');
        const title = payload.title || 'Workflow Update';
        const message = payload.message || payload.msg || '';
        const module = payload.module || EVENT_MODULES[payload.type] || 'General';
        const priority = normalizePriority(payload.priority);
        const notifType = payload.notificationType || priorityType(priority);
        let row = null;

        if (global.notificationService?.pushNotification) {
            row = global.notificationService.pushNotification(targetRole, targetEmpId, title, message, module);
        } else if (db()?.pushNotification) {
            row = db().pushNotification(targetRole, targetEmpId, title, message, module);
        } else if (db()?._pushNotification) {
            const data = getData();
            row = db()._pushNotification(data, targetRole, targetEmpId, title, message, module, notifType);
            saveData(data);
        }

        return enrichNotification(row, {
            priority,
            type: notifType,
            workflowType: payload.type || WORKFLOW_EVENTS.GENERIC_NOTIFICATION,
            actionLink: payload.actionLink || '',
            metadata: payload.metadata || {},
            createdAt: row?.createdAt || nowIso()
        });
    }

    function writeAuditLog(payload = {}) {
        const safe = safePayload(payload);
        const options = safeMetadata(safe.options);
        const actorRole = normalizeRole(safe.actorRole || safe.role || '');
        const actorId = resolveEmpId(safe.actorId || '');
        const actionType = safe.actionType || safe.type || 'workflow event';
        const module = safe.module || EVENT_MODULES[safe.type] || 'General';
        const targetId = safe.targetId || safe.recordId || '';
        const description = safe.description || safe.message || actionType;
        const auditPayload = {
            ...safe,
            actorRole,
            actorId,
            actionType,
            module,
            targetId,
            description
        };
        const service = auditService(options);
        if (service && typeof service.recordAudit === 'function') {
            try {
                const result = service.recordAudit(auditPayload, {
                    eventId: auditPayload.eventId || auditPayload.metadata?.eventId || '',
                    correlationId: auditPayload.correlationId || auditPayload.metadata?.correlationId || '',
                    source: auditPayload.source || auditPayload.metadata?.source || 'workflowEngine',
                    severity: auditPayload.severity || auditPayload.metadata?.severity || 'INFO'
                });
                if (result && result.success !== false) {
                    if (result.warning) safeWarn(`${ENGINE_PREFIX} AuditService warning.`, result.warning);
                    return result.recorded ? (result.audit || null) : null;
                }
                safeWarn(`${ENGINE_PREFIX} AuditService returned an unsafe result. Falling back to legacy audit writer.`, result?.warning || result);
            } catch (err) {
                safeWarn(`${ENGINE_PREFIX} AuditService failed safely. Falling back to legacy audit writer.`, err && err.message ? err.message : err);
            }
        }

        let row = null;
        if (db()?.writeAuditLog) row = db().writeAuditLog(actorRole, actorId, actionType, module, targetId, description);
        if (row?.id && safe.metadata) {
            const data = getData();
            const auditRow = (data.auditLogs || []).find(a => a.id === row.id || a.logId === row.id);
            if (auditRow) {
                auditRow.metadata = safe.metadata;
                saveData(data);
            }
        }
        return row;
    }

    function routeNotifications(type, event) {
        const router = notificationRoutingService();
        if (router && typeof router.routeNotifications === 'function') {
            try {
                const routed = router.routeNotifications(type, event);
                return Array.isArray(routed) ? routed : [];
            } catch (err) {
                safeWarn(`${ENGINE_PREFIX} NotificationRoutingService failed safely. Falling back to legacy routing.`, err && err.message ? err.message : err);
            }
        }

        const data = getData();
        const empId = event.targetEmpId || event.metadata.empId || event.metadata.employeeId || '';
        const emp = empId ? getEmployee(empId, data) : null;
        const managerId = event.metadata.managerId || emp?.managerId || getManagerId(empId, data);
        const employeeName = emp?.name || empId || 'Employee';
        const routes = [];
        const base = {
            type,
            module: event.module,
            priority: event.priority,
            targetId: event.targetId,
            actionLink: event.actionLink,
            metadata: event.metadata
        };

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
        if ([WORKFLOW_EVENTS.IMPORT_STAGED, WORKFLOW_EVENTS.IMPORT_VALIDATION_FAILED, WORKFLOW_EVENTS.IMPORT_COMMITTED, WORKFLOW_EVENTS.IMPORT_ROLLED_BACK, WORKFLOW_EVENTS.IMPORT_COMPLETED].includes(type)) {
            routes.push({
                ...base,
                targetRole: 'HR',
                targetEmpId: '',
                title: event.title || 'Import Center Update',
                message: event.message || 'Import center workflow updated. Review import logs for details.'
            });
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
            routes.push({
                ...base,
                priority: PRIORITIES.CRITICAL,
                targetRole: 'HR',
                targetEmpId: '',
                title: 'Deliverable Overdue',
                message: `${employeeName} has an overdue strategic deliverable.`
            });
            routes.push({
                ...base,
                priority: PRIORITIES.CRITICAL,
                targetRole: 'SUPER_ADMIN',
                targetEmpId: '',
                title: 'Strategic Accountability Risk',
                message: `${employeeName} has an overdue strategic commitment.`
            });
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
        return routes.filter(route => route.targetRole || route.targetEmpId || route.targetRole === 'ALL');
    }

    function createPendingAction(action = {}) {
        const data = getData();
        const sourceType = action.sourceType || action.module || 'Workflow';
        const sourceId = action.sourceId || action.targetId || action.recordId || '';
        const assigneeRole = normalizeRole(action.assigneeRole || action.targetRole || '');
        const assigneeEmpId = resolveEmpId(action.assigneeEmpId || action.targetEmpId || '');
        const key = [sourceType, sourceId, assigneeRole, assigneeEmpId].join('|');
        let row = data.pendingActions.find(p => p.key === key);
        if (!row) {
            row = { id: makeId('PA'), key, createdAt: nowIso(), status: 'Open' };
            data.pendingActions.unshift(row);
        }
        Object.assign(row, {
            sourceType,
            sourceId,
            assigneeRole,
            assigneeEmpId,
            title: action.title || 'Pending Action',
            module: action.module || sourceType,
            priority: normalizePriority(action.priority),
            dueDate: action.dueDate || '',
            actionLink: action.actionLink || '',
            metadata: action.metadata || row.metadata || {},
            updatedAt: nowIso()
        });
        saveData(data);
        return row;
    }

    function resolvePendingAction(sourceType, sourceId, note = '') {
        const data = getData();
        (data.pendingActions || []).forEach(row => {
            if ((!sourceType || row.sourceType === sourceType) && (!sourceId || row.sourceId === sourceId)) {
                row.status = 'Resolved';
                row.resolvedAt = nowIso();
                row.resolutionNote = note;
            }
        });
        saveData(data);
        return true;
    }

    function isOpenStatus(status) {
        return !['Resolved', 'Closed', 'Approved', 'Rejected', 'Paid', 'Finalized', 'Completed'].includes(String(status || '').trim());
    }

    function addAction(actions, action) {
        if (!action) return;
        actions.push({
            id: action.id || makeId('PA'),
            sourceType: action.sourceType || action.module || 'Workflow',
            sourceId: action.sourceId || '',
            module: action.module || action.sourceType || 'Workflow',
            title: action.title || 'Pending Action',
            priority: normalizePriority(action.priority),
            assigneeRole: normalizeRole(action.assigneeRole || action.targetRole || ''),
            assigneeEmpId: resolveEmpId(action.assigneeEmpId || action.targetEmpId || ''),
            dueDate: action.dueDate || '',
            createdAt: action.createdAt || '',
            actionLink: action.actionLink || '',
            metadata: action.metadata || {}
        });
    }

    function computedPendingActions(target = {}) {
        const data = getData();
        const role = normalizeRole(target.role || target.targetRole || '');
        const empId = resolveEmpId(target.empId || target.targetEmpId || '');
        const actions = [];
        const employees = data.employees || [];
        const teamIds = new Set(employees.filter(e => e.managerId === empId).map(e => e.id));

        if (role === 'EMPLOYEE' && empId) {
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

        if (role === 'MANAGER') {
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
        }

        if (role === 'ADMIN') {
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

        if (role === 'HR') {
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

        if (role === 'SUPER_ADMIN') {
            computedPendingActions({ role: 'HR' }).filter(a => a.priority === PRIORITIES.CRITICAL || a.priority === PRIORITIES.HIGH).forEach(a => addAction(actions, {
                ...a,
                assigneeRole: 'SUPER_ADMIN',
                title: 'Critical organizational action: ' + a.title
            }));
        }

        (data.pendingActions || []).filter(a => a.status !== 'Resolved').forEach(a => {
            const sameRole = !role || normalizeRole(a.assigneeRole) === role;
            const sameEmp = !empId || resolveEmpId(a.assigneeEmpId) === empId;
            if (sameRole && sameEmp) addAction(actions, a);
        });

        return actions;
    }

    function getPendingActions(target = {}) {
        const service = pendingActionService();
        if (service && typeof service.getPendingActions === 'function') {
            try {
                const actions = service.getPendingActions(target);
                return Array.isArray(actions) ? actions : [];
            } catch (err) {
                safeWarn(`${ENGINE_PREFIX} PendingActionService failed safely. Falling back to legacy pending action computation.`, err && err.message ? err.message : err);
            }
        }
        return computedPendingActions(target);
    }

    function getPendingSummary(target = {}) {
        const service = pendingActionService();
        if (service && typeof service.getPendingSummary === 'function') {
            try {
                const summary = service.getPendingSummary(target);
                if (summary && typeof summary === 'object') return summary;
            } catch (err) {
                safeWarn(`${ENGINE_PREFIX} PendingActionService summary failed safely. Falling back to legacy pending action summary.`, err && err.message ? err.message : err);
            }
        }
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

    function getEscalationCandidates() {
        const service = escalationPolicyService();
        if (service && typeof service.getEscalationCandidates === 'function') {
            try {
                const candidates = service.getEscalationCandidates();
                return Array.isArray(candidates) ? candidates : [];
            } catch (err) {
                safeWarn(`${ENGINE_PREFIX} EscalationPolicyService candidates failed safely. Falling back to legacy escalation candidates.`, err && err.message ? err.message : err);
            }
        }
        const data = getData();
        const candidates = [];
        (data.strategicDeliverables || []).forEach(d => {
            if (d.deadlineDate && d.deadlineDate < today() && !['Achieved', 'Failed', 'Exceeded', 'Closed'].includes(d.finalClosureStatus || d.currentStatus)) {
                candidates.push({
                    type: WORKFLOW_EVENTS.DELIVERABLE_OVERDUE,
                    module: 'Strategic Deliverables',
                    targetId: d.deliverableId || d.id,
                    empId: d.empId,
                    priority: PRIORITIES.CRITICAL,
                    ageDays: ageDays(d.deadlineDate),
                    title: 'Overdue deliverable'
                });
            }
        });
        (data.leaveRequests || []).forEach(l => {
            if (!['Approved', 'Rejected'].includes(l.finalStatus || l.status) && ageDays(l.appliedOn || l.appliedAt) > 2) {
                candidates.push({
                    type: WORKFLOW_EVENTS.LEAVE_APPLIED,
                    module: 'Leave',
                    targetId: l.leaveId || l.id,
                    empId: l.empId,
                    priority: PRIORITIES.HIGH,
                    ageDays: ageDays(l.appliedOn || l.appliedAt),
                    title: 'Leave pending beyond SLA'
                });
            }
        });
        (data.helpdeskTickets || []).forEach(t => {
            if (isOpenStatus(t.status) && ageDays(t.createdOn || t.date) > 2) {
                candidates.push({
                    type: WORKFLOW_EVENTS.GENERIC_NOTIFICATION,
                    module: 'Helpdesk',
                    targetId: t.id,
                    empId: t.empId,
                    priority: PRIORITIES.HIGH,
                    ageDays: ageDays(t.createdOn || t.date),
                    title: 'Helpdesk ticket pending beyond SLA'
                });
            }
        });
        return candidates.sort((a, b) => (b.ageDays || 0) - (a.ageDays || 0));
    }

    function dispatchExternalChannels(notification, channels = {}) {
        return {
            notificationId: notification?.id || '',
            email: !!channels.email && false,
            whatsapp: !!channels.whatsapp && false,
            push: !!channels.push && false,
            queued: false,
            message: 'External channels are prepared as hooks and not enabled yet.'
        };
    }

    function replayWorkflowEvent(event = {}, options = {}) {
        const service = eventReplayService(options);
        if (service && typeof service.replayWorkflowEvent === 'function') {
            try {
                return service.replayWorkflowEvent(event, options);
            } catch (err) {
                safeWarn(`${ENGINE_PREFIX} EventReplayService failed safely. Replay inspection returned unavailable state.`, err && err.message ? err.message : err);
            }
        }
        return Object.freeze({
            success: false,
            replayMode: true,
            readOnly: true,
            sideEffectsSuppressed: true,
            event: safePayload(event),
            context: {
                replayMode: true,
                skipPersistence: true,
                suppressNotification: true,
                suppressAudit: true,
                suppressPendingAction: true,
                suppressEscalation: true,
                suppressExternalChannels: true
            },
            handlers: [],
            reconstructedTimeline: [],
            warnings: [Object.freeze({
                warningCode: 'EVENT_REPLAY_SERVICE_UNAVAILABLE',
                message: 'EventReplayService is unavailable. Live workflow behavior was not affected.',
                metadata: {}
            })],
            safety: {
                dispatchNotifications: false,
                writeAudits: false,
                createPendingActions: false,
                mutateDatabase: false,
                emitEscalationSideEffects: false,
                triggerExternalChannels: false
            }
        });
    }

    function createExecutionContext(event, warnings = [], options = {}) {
        return {
            success: true,
            eventId: event.eventId,
            correlationId: event.correlationId || event.eventId,
            executedHandlers: [],
            failedHandlers: [],
            traceCount: 0,
            warnings: warnings.slice(),
            event,
            notifications: [],
            audit: null,
            telemetry: null,
            pendingActions: [],
            escalations: [],
            options
        };
    }

    function buildHandlerContext(context) {
        return {
            eventId: context.eventId,
            correlationId: context.correlationId,
            warnings: context.warnings.slice(),
            options: { ...(context.options || {}) },
            adapters: {
                recordWorkflowEvent,
                writeAuditLog,
                routeNotifications,
                dispatchNotification,
                createPendingAction,
                safeWarn
            }
        };
    }

    function cloneTraceMetadata(metadata = {}) {
        const output = {};
        if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return output;
        try {
            Object.keys(metadata).forEach(key => {
                try {
                    output[key] = metadata[key];
                } catch (e) {}
            });
        } catch (e) {}
        return output;
    }

    function addTraceWarning(context, warningCode, message, metadata = {}) {
        if (!context || !Array.isArray(context.warnings)) return;
        context.warnings.push({
            warningCode,
            handlerName: 'workflowTraceStore',
            message,
            metadata: cloneTraceMetadata(metadata)
        });
    }

    function buildWorkflowTrace(event = {}, eventType, handler, status, metadata = {}) {
        const traceMetadata = cloneTraceMetadata(metadata);
        const workflowType = event.type || traceMetadata.workflowType || WORKFLOW_EVENTS.GENERIC_NOTIFICATION;
        return {
            correlationId: event.correlationId || traceMetadata.correlationId || event.eventId || '',
            eventId: event.eventId || traceMetadata.eventId || '',
            eventType: eventType || 'WORKFLOW_TRACE',
            source: event.source || traceMetadata.source || 'workflowEngine',
            handler: handler || 'orchestrator',
            status: status || 'RECORDED',
            severity: normalizeSeverity(event.severity || traceMetadata.severity, event.priority || traceMetadata.priority),
            metadata: {
                ...traceMetadata,
                workflowType,
                module: event.module || traceMetadata.module || EVENT_MODULES[workflowType] || 'Workflow',
                targetId: event.targetId || traceMetadata.targetId || '',
                priority: event.priority || traceMetadata.priority || PRIORITIES.MEDIUM
            }
        };
    }

    function recordWorkflowTraceSafely(trace, context = {}) {
        try {
            const store = workflowTraceStore(context.options || {});
            if (!store || typeof store.recordTrace !== 'function') {
                if (!traceStoreMissingWarned) {
                    traceStoreMissingWarned = true;
                    safeWarn(`${ENGINE_PREFIX} WorkflowTraceStore is unavailable. Workflow execution will continue without trace storage.`);
                }
                return { success: false, stored: false, warning: 'WorkflowTraceStore unavailable.' };
            }

            const result = store.recordTrace({
                ...trace,
                metadata: cloneTraceMetadata(trace && trace.metadata)
            });

            if (result && result.stored && context) {
                context.traceCount = (context.traceCount || 0) + 1;
            }

            if (result && result.warning) {
                addTraceWarning(context, 'WORKFLOW_TRACE_WARNING', result.warning, {
                    traceEventType: trace && trace.eventType,
                    eventId: trace && trace.eventId,
                    correlationId: trace && trace.correlationId
                });
            }

            if (!result || result.success === false) {
                addTraceWarning(context, 'WORKFLOW_TRACE_RECORD_FAILED', result?.warning || 'Workflow trace could not be recorded.', {
                    traceEventType: trace && trace.eventType,
                    eventId: trace && trace.eventId,
                    correlationId: trace && trace.correlationId
                });
            }

            return result || { success: false, stored: false, warning: 'WorkflowTraceStore returned no result.' };
        } catch (err) {
            const message = `Workflow trace recording failed safely: ${err && err.message ? err.message : safeString(err, 'unknown trace failure')}`;
            safeWarn(`${ENGINE_PREFIX} ${message}`);
            addTraceWarning(context, 'WORKFLOW_TRACE_FAILED', message, {
                traceEventType: trace && trace.eventType,
                eventId: trace && trace.eventId,
                correlationId: trace && trace.correlationId
            });
            return { success: false, stored: false, warning: message };
        }
    }

    function recordHandlerWorkflowTrace(event, handlerName, eventType, status, context, metadata = {}) {
        return recordWorkflowTraceSafely(
            buildWorkflowTrace(event, eventType, handlerName, status, {
                ...metadata,
                handlerName
            }),
            context
        );
    }

    function mergeHandlerWarnings(context, handlerName, warnings = []) {
        if (!Array.isArray(warnings)) return;
        warnings.forEach(row => {
            if (!row) return;
            context.warnings.push({
                warningCode: row.warningCode || 'WORKFLOW_HANDLER_WARNING',
                handlerName: row.handlerName || handlerName,
                message: row.message || 'Workflow handler warning.',
                metadata: row.metadata || {}
            });
        });
    }

    function applyHandlerMetadata(context, metadata = {}) {
        if (!metadata || typeof metadata !== 'object') return;
        if (Object.prototype.hasOwnProperty.call(metadata, 'workflowEvent') && metadata.workflowEvent) context.event = metadata.workflowEvent;
        if (Object.prototype.hasOwnProperty.call(metadata, 'audit')) context.audit = metadata.audit;
        if (Object.prototype.hasOwnProperty.call(metadata, 'telemetry')) context.telemetry = metadata.telemetry;
        if (Object.prototype.hasOwnProperty.call(metadata, 'notifications')) context.notifications = Array.isArray(metadata.notifications) ? metadata.notifications : [];
        if (Object.prototype.hasOwnProperty.call(metadata, 'pendingActions')) context.pendingActions = Array.isArray(metadata.pendingActions) ? metadata.pendingActions : [];
        if (Object.prototype.hasOwnProperty.call(metadata, 'escalations')) context.escalations = Array.isArray(metadata.escalations) ? metadata.escalations : [];
    }

    function isGovernedExecution(value) {
        return !!(value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'handler') && Object.prototype.hasOwnProperty.call(value, 'failed') && Object.prototype.hasOwnProperty.call(value, 'result'));
    }

    function executeHandlerSafely(handlerName, handlerFn, event, context) {
        const startedAt = Date.now();
        recordHandlerWorkflowTrace(event, handlerName, 'HANDLER_EXECUTION_STARTED', 'STARTED', context);
        try {
            const value = handlerFn(event, context);
            if (isGovernedExecution(value)) {
                const handlerResult = value.result || {};
                mergeHandlerWarnings(context, handlerName, value.warnings || handlerResult.warnings || []);
                applyHandlerMetadata(context, handlerResult.metadata || {});
                const durationMs = Math.max(0, Date.now() - startedAt);
                if (value.failed || value.success === false || handlerResult.success === false) {
                    const error = (value.warnings || handlerResult.warnings || [])[0]?.message || `${handlerName} failed safely.`;
                    context.failedHandlers.push({
                        handlerName,
                        status: 'FAILED',
                        error
                    });
                    recordHandlerWorkflowTrace(event, handlerName, 'HANDLER_EXECUTION_FAILED', 'FAILED', context, {
                        durationMs,
                        error
                    });
                    recordMetricSafely('recordHandlerMetric', [handlerName, 'FAILED'], context.options || {});
                } else {
                    const handlerStatus = (value.warnings || handlerResult.warnings || []).length ? 'DEGRADED' : 'SUCCESS';
                    context.executedHandlers.push({
                        handlerName,
                        status: 'SUCCESS',
                        durationMs
                    });
                    recordHandlerWorkflowTrace(event, handlerName, 'HANDLER_EXECUTION_SUCCESS', 'SUCCESS', context, {
                        durationMs
                    });
                    recordMetricSafely('recordHandlerMetric', [handlerName, handlerStatus], context.options || {});
                }
                return value;
            }
            const durationMs = Math.max(0, Date.now() - startedAt);
            context.executedHandlers.push({
                handlerName,
                status: 'SUCCESS',
                durationMs
            });
            recordHandlerWorkflowTrace(event, handlerName, 'HANDLER_EXECUTION_SUCCESS', 'SUCCESS', context, {
                durationMs
            });
            recordMetricSafely('recordHandlerMetric', [handlerName, 'SUCCESS'], context.options || {});
            return value;
        } catch (err) {
            const durationMs = Math.max(0, Date.now() - startedAt);
            const failure = {
                handlerName,
                status: 'FAILED',
                error: err && err.message ? err.message : safeString(err, 'unknown handler failure')
            };
            context.failedHandlers.push(failure);
            context.warnings.push({
                warningCode: 'WORKFLOW_HANDLER_FAILED',
                handlerName,
                message: `${handlerName} failed safely: ${failure.error}`
            });
            recordHandlerWorkflowTrace(event, handlerName, 'HANDLER_EXECUTION_FAILED', 'FAILED', context, {
                durationMs,
                error: failure.error
            });
            recordMetricSafely('recordHandlerMetric', [handlerName, 'FAILED'], context.options || {});
            return null;
        }
    }

    function auditHandler(event, context) {
        if (!context.options.skipPersistence) {
            context.event = recordWorkflowEvent(event);
        }
        if (event.suppressAudit) return { workflowEvent: context.event, audit: null };
        context.audit = writeAuditLog({
            type: event.type,
            actionType: event.actionType || event.type.toLowerCase().replace(/_/g, ' '),
            actorRole: event.actorRole,
            actorId: event.actorId,
            module: event.module,
            targetId: event.targetId,
            description: event.message || event.title,
            metadata: {
                ...(event.metadata || {}),
                eventId: event.eventId,
                correlationId: event.correlationId
            }
        });
        return { workflowEvent: context.event, audit: context.audit };
    }

    function telemetryHandler(event, context) {
        const telemetry = telemetryService(context.options);
        if (!telemetry || typeof telemetry.emitWorkflowTelemetry !== 'function') {
            const message = 'WorkflowTelemetryService is unavailable. Workflow continued without telemetry emission.';
            context.warnings.push({
                warningCode: 'WORKFLOW_TELEMETRY_UNAVAILABLE',
                handlerName: 'telemetryHandler',
                message
            });
            safeWarn(`${ENGINE_PREFIX} ${message}`);
            return null;
        }
        context.telemetry = telemetry.emitWorkflowTelemetry(event.type, {
            source: event.source || 'workflowEngine',
            severity: event.severity,
            status: event.status,
            eventId: event.eventId,
            correlationId: event.correlationId,
            metadata: {
                ...(event.metadata || {}),
                module: event.module,
                targetId: event.targetId,
                priority: event.priority,
                failedHandlers: context.failedHandlers.length
            }
        });
        if (context.telemetry?.warning) {
            context.warnings.push({
                warningCode: 'WORKFLOW_TELEMETRY_WARNING',
                handlerName: 'telemetryHandler',
                message: context.telemetry.warning
            });
        }
        return context.telemetry;
    }

    function notificationHandler(event, context) {
        if (event.suppressNotification) return [];
        const notifications = [];
        routeNotifications(event.type, event).forEach(route => {
            const notification = dispatchNotification(route);
            if (notification) notifications.push(notification);
        });
        context.notifications = notifications;
        return notifications;
    }

    function pendingActionHandler(event, context) {
        if (event.suppressPendingAction) return [];
        // Phase 1 intentionally keeps legacy emit behavior: pending actions are exposed
        // through computed queues and explicit createPendingAction() calls.
        context.pendingActions = [];
        return context.pendingActions;
    }

    function escalationHandler(event, context) {
        if (event.suppressEscalation) return [];
        const policy = escalationPolicyService(context.options || {});
        if (policy && typeof policy.evaluateEscalation === 'function') {
            try {
                const evaluation = policy.evaluateEscalation(event, {
                    failedHandlers: context.failedHandlers,
                    warningCount: context.warnings.length
                });
                if (!evaluation || !evaluation.escalated) return [];
                const escalation = {
                    eventId: event.eventId,
                    correlationId: event.correlationId,
                    module: event.module || 'Workflow',
                    severity: evaluation.severity || event.severity || (event.priority === PRIORITIES.CRITICAL ? 'CRITICAL' : 'WARNING'),
                    title: event.title || `${event.type} requires operational review`,
                    targetId: event.targetId || '',
                    recommendation: evaluation.reason || 'Review the source module and reconcile related audit, notification, and pending action records.',
                    escalationType: evaluation.escalationType || 'CRITICAL_OPERATION',
                    recommendedRoles: evaluation.recommendedRoles || [],
                    metadata: evaluation.metadata || {}
                };
                context.escalations.push(escalation);
                return context.escalations;
            } catch (err) {
                safeWarn(`${ENGINE_PREFIX} EscalationPolicyService failed safely. Falling back to legacy escalation logic.`, err && err.message ? err.message : err);
            }
        }
        const isEscalationCandidate = /failed|blocked/i.test(`${event.status || ''} ${event.type || ''}`) || event.priority === PRIORITIES.CRITICAL || event.severity === 'CRITICAL';
        if (!isEscalationCandidate) return [];
        const escalation = {
            eventId: event.eventId,
            correlationId: event.correlationId,
            module: event.module || 'Workflow',
            severity: event.severity || (event.priority === PRIORITIES.CRITICAL ? 'CRITICAL' : 'WARNING'),
            title: event.title || `${event.type} requires operational review`,
            targetId: event.targetId || '',
            recommendation: 'Review the source module and reconcile related audit, notification, and pending action records.'
        };
        context.escalations.push(escalation);
        return context.escalations;
    }

    registerHandler('auditHandler', auditHandler);
    registerHandler('telemetryHandler', telemetryHandler);
    registerHandler('notificationHandler', notificationHandler);
    registerHandler('pendingActionHandler', pendingActionHandler);
    registerHandler('escalationHandler', escalationHandler);

    function orderedHandlers(options = {}) {
        const governed = workflowHandlersService(options);
        if (!Array.isArray(options.handlers) && governed && typeof governed.executeHandler === 'function' && typeof governed.getHandler === 'function') {
            return HANDLER_ORDER
                .map(handlerName => governed.getHandler(handlerName) ? {
                    handlerName,
                    handlerFn: handlerName === 'escalationHandler'
                        ? escalationHandler
                        : (event, context) => governed.executeHandler(handlerName, event, buildHandlerContext(context))
                } : null)
                .filter(Boolean);
        }
        const registry = Array.isArray(options.handlers) ? options.handlers : handlerRegistry;
        return HANDLER_ORDER.map(handlerName => registry.find(row => row.handlerName === handlerName)).filter(Boolean);
    }

    function handoffWorkflowFailure(event, executionContext = {}, details = {}) {
        const options = executionContext.options || {};
        if (options.skipPersistence || options.skipRecoveryHandoff) return null;
        try {
            const service = options.workflowRecoveryService || global.WorkflowRecoveryService;
            if (!service || typeof service.detectWorkflowFailure !== 'function') return null;
            const metadata = event && event.metadata && typeof event.metadata === 'object' ? event.metadata : {};
            const tenantSlug = safeString(
                metadata.tenantSlug || metadata.tenantId || event.tenantSlug || event.tenantId || '',
                ''
            ).trim();
            if (!tenantSlug) return null;
            const authenticatedActor = options.authorizationActor || global.__ARTHHRMS_AUTH_CONTEXT__ ||
                (global.authService && typeof global.authService.getCurrentUser === 'function' ? global.authService.getCurrentUser() : null);
            const actorTenant = safeString(authenticatedActor && (authenticatedActor.tenantSlug || authenticatedActor.tenantId) || '', '').trim();
            if (!authenticatedActor || !authenticatedActor.id || !actorTenant || actorTenant !== tenantSlug) return null;
            const failedHandlers = Array.isArray(executionContext.failedHandlers)
                ? executionContext.failedHandlers.map(row => safeString(row && row.handlerName || 'handler', 'handler'))
                : ['orchestrator'];
            return service.detectWorkflowFailure({
                workflowId: event.eventId,
                workflowType: event.type,
                tenantSlug,
                ownerId: event.targetEmpId || event.employeeId || event.actorId || '',
                state: 'PROCESSING',
                source: 'WORKFLOW_ENGINE',
                errorCode: details.errorCode || 'WORKFLOW_EXECUTION_FAILURE',
                partialExecution: !!(executionContext.executedHandlers && executionContext.executedHandlers.length),
                dependency: details.dependency || failedHandlers.join(','),
                stateData: {
                    eventId: event.eventId,
                    correlationId: event.correlationId,
                    workflowType: event.type,
                    failedHandlers
                }
            }, { tenantSlug, actor: authenticatedActor });
        } catch (error) {
            return null;
        }
    }

    function orchestrateWorkflowEvent(type, payload = {}, options = {}) {
        const warnings = [];
        const initialPayload = safePayload(payload);
        const receivedEvent = legacyNormalizeEvent(type, initialPayload);
        const traceContext = {
            warnings,
            options,
            traceCount: 0
        };

        recordWorkflowTraceSafely(
            buildWorkflowTrace(receivedEvent, 'WORKFLOW_RECEIVED', 'orchestrator', 'RECEIVED', {
                workflowType: receivedEvent.type,
                rawType: safeString(type || receivedEvent.type, receivedEvent.type)
            }),
            traceContext
        );
        recordMetricSafely('recordWorkflowMetric', ['WORKFLOW_RECEIVED', {
            workflowType: receivedEvent.type,
            eventId: receivedEvent.eventId,
            correlationId: receivedEvent.correlationId,
            status: 'RECEIVED'
        }], options);

        const event = normalizeEvent(receivedEvent.type, { ...initialPayload, ...receivedEvent }, warnings, options);
        const context = createExecutionContext(event, warnings, options);
        context.traceCount = traceContext.traceCount || 0;

        recordWorkflowTraceSafely(
            buildWorkflowTrace(context.event, 'WORKFLOW_NORMALIZED', 'orchestrator', 'NORMALIZED', {
                warningCount: context.warnings.length
            }),
            context
        );
        recordMetricSafely('recordWorkflowMetric', [context.warnings.length ? 'WORKFLOW_NORMALIZATION_WARNING' : 'WORKFLOW_NORMALIZED', {
            workflowType: context.event.type,
            eventId: context.eventId,
            correlationId: context.correlationId,
            warningCount: context.warnings.length,
            status: context.warnings.length ? 'WARNING' : 'NORMALIZED',
            severity: context.warnings.length ? 'WARNING' : 'INFO'
        }], options);

        orderedHandlers(options).forEach(row => {
            executeHandlerSafely(row.handlerName, row.handlerFn, context.event, context);
        });

        if (context.failedHandlers.length) {
            recordWorkflowTraceSafely(
                buildWorkflowTrace(context.event, 'WORKFLOW_DEGRADED', 'orchestrator', 'DEGRADED', {
                    failedHandlers: context.failedHandlers.map(row => row.handlerName),
                    warningCount: context.warnings.length
                }),
                context
            );
            recordMetricSafely('recordWorkflowMetric', ['WORKFLOW_DEGRADED', {
                workflowType: context.event.type,
                eventId: context.eventId,
                correlationId: context.correlationId,
                failedHandlers: context.failedHandlers.map(row => row.handlerName),
                warningCount: context.warnings.length,
                status: 'DEGRADED',
                severity: 'WARNING',
                degraded: true
            }], options);
            handoffWorkflowFailure(context.event, context, {
                errorCode: 'WORKFLOW_HANDLER_FAILURE',
                dependency: context.failedHandlers.map(row => row.handlerName).join(',')
            });
        }

        recordWorkflowTraceSafely(
            buildWorkflowTrace(context.event, 'WORKFLOW_COMPLETED', 'orchestrator', context.failedHandlers.length ? 'DEGRADED' : 'COMPLETED', {
                executedHandlerCount: context.executedHandlers.length,
                failedHandlerCount: context.failedHandlers.length,
                warningCount: context.warnings.length
            }),
            context
        );
        recordMetricSafely('recordWorkflowMetric', ['WORKFLOW_COMPLETED', {
            workflowType: context.event.type,
            eventId: context.eventId,
            correlationId: context.correlationId,
            executedHandlerCount: context.executedHandlers.length,
            failedHandlerCount: context.failedHandlers.length,
            warningCount: context.warnings.length,
            status: context.failedHandlers.length ? 'DEGRADED' : 'COMPLETED',
            severity: context.failedHandlers.length ? 'WARNING' : 'INFO',
            degraded: context.failedHandlers.length > 0
        }], options);
        if (context.audit) {
            recordMetricSafely('recordAuditMetric', [context.event.type], options);
        }
        (context.notifications || []).forEach(() => {
            recordMetricSafely('recordNotificationMetric', [context.event.type], options);
        });
        (context.escalations || []).forEach(escalation => {
            recordMetricSafely('recordEscalationMetric', [escalation.escalationType || context.event.type, escalation.severity || context.event.severity], options);
        });

        return {
            success: true,
            eventId: context.eventId,
            correlationId: context.correlationId,
            traceCount: context.traceCount || 0,
            executedHandlers: context.executedHandlers,
            failedHandlers: context.failedHandlers,
            warnings: context.warnings,
            event: context.event,
            notifications: context.notifications,
            audit: context.audit,
            telemetry: context.telemetry,
            pendingActions: context.pendingActions,
            escalations: context.escalations
        };
    }

    function emitWorkflowEvent(type, payload = {}) {
        try {
            const authorizationActor = global.__ARTHHRMS_AUTH_CONTEXT__ ||
                (global.authService && typeof global.authService.getCurrentUser === 'function' ? global.authService.getCurrentUser() : null);
            return orchestrateWorkflowEvent(type, payload, { authorizationActor });
        } catch (err) {
            const safeType = safeString(type || WORKFLOW_EVENTS.GENERIC_NOTIFICATION, WORKFLOW_EVENTS.GENERIC_NOTIFICATION);
            const fallbackEvent = legacyNormalizeEvent(safeType, safePayload(payload));
            const fallbackWarnings = [{
                warningCode: 'WORKFLOW_ORCHESTRATOR_FAILED',
                handlerName: 'orchestrator',
                message: `Workflow orchestrator failed safely: ${err && err.message ? err.message : safeString(err, 'unknown error')}`
            }];
            const fallbackTraceContext = {
                warnings: fallbackWarnings,
                options: {},
                traceCount: 0
            };

            recordWorkflowTraceSafely(
                buildWorkflowTrace(fallbackEvent, 'WORKFLOW_FAILED_SAFE', 'orchestrator', 'FAILED_SAFE', {
                    error: err && err.message ? err.message : safeString(err, 'unknown error')
                }),
                fallbackTraceContext
            );
            recordMetricSafely('recordWorkflowMetric', ['WORKFLOW_FAILED_SAFE', {
                workflowType: fallbackEvent.type,
                eventId: fallbackEvent.eventId,
                correlationId: fallbackEvent.correlationId,
                error: err && err.message ? err.message : safeString(err, 'unknown error'),
                status: 'FAILED_SAFE',
                severity: 'ERROR',
                failed: true
            }], {});
            handoffWorkflowFailure(fallbackEvent, fallbackTraceContext, {
                errorCode: 'WORKFLOW_ORCHESTRATOR_FAILURE',
                dependency: 'orchestrator'
            });

            return {
                success: false,
                eventId: fallbackEvent.eventId,
                correlationId: fallbackEvent.correlationId,
                traceCount: fallbackTraceContext.traceCount || 0,
                executedHandlers: [],
                failedHandlers: [{
                    handlerName: 'orchestrator',
                    status: 'FAILED',
                    error: err && err.message ? err.message : safeString(err, 'unknown orchestrator failure')
                }],
                warnings: fallbackWarnings,
                event: fallbackEvent,
                notifications: [],
                audit: null,
                telemetry: null,
                pendingActions: [],
                escalations: []
            };
        }
    }

    function runSelfTest() {
        const tests = [];
        const record = (name, ok, details) => tests.push({ name, ok: !!ok, details: details || null });
        const previousSchema = global.WorkflowEventSchema;
        const previousTelemetry = global.WorkflowTelemetryService;
        const previousTraceStore = global.WorkflowTraceStore;
        const previousNotificationRoutingService = global.NotificationRoutingService;
        const previousPendingActionService = global.PendingActionService;
        const previousEscalationPolicyService = global.EscalationPolicyService;
        const previousAuditService = global.AuditService;
        const previousOrchestrationMetricsService = global.OrchestrationMetricsService;
        const previousEventReplayService = global.EventReplayService;

        try {
            const order = [];
            const isolated = orchestrateWorkflowEvent('GENERIC_NOTIFICATION', {
                eventId: 'WF-SELF-TEST',
                correlationId: 'CORR-SELF-TEST',
                suppressAudit: true,
                suppressNotification: true
            }, {
                skipPersistence: true,
                handlers: [
                    { handlerName: 'auditHandler', handlerFn: () => { order.push('auditHandler'); return true; } },
                    { handlerName: 'telemetryHandler', handlerFn: () => { order.push('telemetryHandler'); return true; } },
                    { handlerName: 'notificationHandler', handlerFn: () => { order.push('notificationHandler'); throw new Error('notification down'); } },
                    { handlerName: 'pendingActionHandler', handlerFn: () => { order.push('pendingActionHandler'); return true; } },
                    { handlerName: 'escalationHandler', handlerFn: () => { order.push('escalationHandler'); return true; } }
                ]
            });
            record(
                'audit executes first',
                order[0] === 'auditHandler',
                { order }
            );
            record(
                'notification failure isolated',
                isolated.success === true &&
                    isolated.failedHandlers.some(row => row.handlerName === 'notificationHandler') &&
                    isolated.executedHandlers.some(row => row.handlerName === 'auditHandler') &&
                    isolated.executedHandlers.some(row => row.handlerName === 'telemetryHandler') &&
                    isolated.executedHandlers.some(row => row.handlerName === 'pendingActionHandler') &&
                    isolated.executedHandlers.some(row => row.handlerName === 'escalationHandler'),
                isolated
            );

            global.WorkflowEventSchema = {
                createEvent(type, payload) {
                    return {
                        ...payload,
                        type,
                        eventId: payload.eventId || 'WF-SCHEMA',
                        correlationId: payload.correlationId || 'CORR-SCHEMA',
                        source: 'schema-self-test'
                    };
                },
                validateEvent(event) {
                    return !!event.eventId;
                }
            };
            const schemaResult = orchestrateWorkflowEvent('GENERIC_NOTIFICATION', {
                eventId: 'WF-SCHEMA-KEEP',
                correlationId: 'CORR-SCHEMA-KEEP',
                suppressAudit: true,
                suppressNotification: true
            }, {
                skipPersistence: true,
                handlers: [
                    { handlerName: 'auditHandler', handlerFn: () => true },
                    { handlerName: 'telemetryHandler', handlerFn: () => true },
                    { handlerName: 'notificationHandler', handlerFn: () => true },
                    { handlerName: 'pendingActionHandler', handlerFn: () => true },
                    { handlerName: 'escalationHandler', handlerFn: () => true }
                ]
            });
            record(
                'WorkflowEventSchema IDs preserved',
                schemaResult.eventId === 'WF-SCHEMA-KEEP' &&
                    schemaResult.correlationId === 'CORR-SCHEMA-KEEP' &&
                    schemaResult.event.source === 'schema-self-test',
                schemaResult
            );

            global.WorkflowEventSchema = undefined;
            global.WorkflowTelemetryService = undefined;
            const missingDeps = orchestrateWorkflowEvent(Symbol('legacy-event'), 'bad-payload', {
                skipPersistence: true,
                forceMissingSchema: true,
                forceMissingTelemetry: true,
                handlers: [
                    { handlerName: 'auditHandler', handlerFn: () => true },
                    { handlerName: 'telemetryHandler', handlerFn: telemetryHandler },
                    { handlerName: 'notificationHandler', handlerFn: () => true },
                    { handlerName: 'pendingActionHandler', handlerFn: () => true },
                    { handlerName: 'escalationHandler', handlerFn: () => true }
                ]
            });
            record(
                'missing dependencies handled safely',
                missingDeps.success === true &&
                    missingDeps.warnings.some(row => row.warningCode === 'WORKFLOW_TELEMETRY_UNAVAILABLE'),
                missingDeps
            );
            record(
                'legacy payloads normalize safely',
                missingDeps.event.eventId &&
                    missingDeps.event.type.includes('Symbol') &&
                    Array.isArray(missingDeps.executedHandlers),
                missingDeps
            );

            const structured = orchestrateWorkflowEvent('GENERIC_NOTIFICATION', {
                suppressAudit: true,
                suppressNotification: true
            }, {
                skipPersistence: true,
                handlers: [
                    { handlerName: 'auditHandler', handlerFn: () => true },
                    { handlerName: 'telemetryHandler', handlerFn: () => true },
                    { handlerName: 'notificationHandler', handlerFn: () => true },
                    { handlerName: 'pendingActionHandler', handlerFn: () => true },
                    { handlerName: 'escalationHandler', handlerFn: () => true }
                ]
            });
            record(
                'structured result returned',
                structured.success === true &&
                    !!structured.eventId &&
                    !!structured.correlationId &&
                    Array.isArray(structured.executedHandlers) &&
                    Array.isArray(structured.failedHandlers) &&
                    Array.isArray(structured.warnings) &&
                    structured.event,
                structured
            );

            let delegatedRoutingCalled = false;
            global.NotificationRoutingService = {
                routeNotifications(type, event) {
                    delegatedRoutingCalled = true;
                    return [{
                        type,
                        targetRole: 'HR',
                        targetEmpId: '',
                        title: 'Delegated Route',
                        message: event.message || '',
                        module: event.module || 'General',
                        priority: event.priority || PRIORITIES.MEDIUM,
                        metadata: { ...(event.metadata || {}) },
                        actionLink: event.actionLink || ''
                    }];
                }
            };
            const delegatedRoute = routeNotifications('GENERIC_NOTIFICATION', {
                module: 'General',
                priority: PRIORITIES.MEDIUM,
                targetRole: 'HR',
                metadata: {}
            });
            record(
                'NotificationRoutingService delegation remains compatible',
                delegatedRoutingCalled === true && delegatedRoute.length === 1 && delegatedRoute[0].targetRole === 'HR',
                delegatedRoute
            );
            global.NotificationRoutingService = {
                routeNotifications() {
                    throw new Error('routing service down');
                }
            };
            const fallbackRoute = routeNotifications('GENERIC_NOTIFICATION', {
                explicitTarget: true,
                targetRole: 'HR',
                title: 'Fallback Route',
                message: 'Legacy fallback should route.',
                module: 'General',
                priority: PRIORITIES.MEDIUM,
                metadata: {}
            });
            record(
                'legacy notification routing fallback remains safe',
                fallbackRoute.length === 1 && fallbackRoute[0].targetRole === 'HR',
                fallbackRoute
            );

            let pendingDelegationCalled = false;
            global.PendingActionService = {
                getPendingActions(target) {
                    pendingDelegationCalled = true;
                    return [{
                        id: 'PA-DELEGATED',
                        sourceType: 'delegated',
                        sourceId: 'D1',
                        module: 'Delegated',
                        title: 'Delegated pending action',
                        priority: PRIORITIES.HIGH,
                        assigneeRole: target.role || 'HR',
                        assigneeEmpId: target.empId || '',
                        dueDate: '',
                        createdAt: '',
                        actionLink: '',
                        metadata: {}
                    }];
                },
                getPendingSummary() {
                    return {
                        total: 1,
                        critical: 0,
                        high: 1,
                        medium: 0,
                        low: 0,
                        byModule: { Delegated: 1 },
                        actions: this.getPendingActions({})
                    };
                }
            };
            const delegatedPending = getPendingActions({ role: 'HR' });
            const delegatedSummary = getPendingSummary({ role: 'HR' });
            record(
                'PendingActionService delegation remains compatible',
                pendingDelegationCalled === true &&
                    delegatedPending.length === 1 &&
                    delegatedPending[0].title === 'Delegated pending action' &&
                    delegatedSummary.total === 1,
                { delegatedPending, delegatedSummary }
            );
            global.PendingActionService = {
                getPendingActions() {
                    throw new Error('pending service down');
                },
                getPendingSummary() {
                    throw new Error('pending summary down');
                }
            };
            const fallbackPending = getPendingActions({ role: 'HR' });
            const fallbackSummary = getPendingSummary({ role: 'HR' });
            record(
                'legacy pending action fallback remains safe',
                Array.isArray(fallbackPending) &&
                    fallbackSummary &&
                    typeof fallbackSummary.total === 'number',
                { fallbackPendingLength: fallbackPending.length, fallbackSummaryTotal: fallbackSummary.total }
            );

            let escalationDelegationCalled = false;
            global.EscalationPolicyService = {
                evaluateEscalation(event) {
                    escalationDelegationCalled = true;
                    return {
                        escalated: true,
                        severity: 'CRITICAL',
                        escalationType: 'WORKFLOW_FAILURE',
                        recommendedRoles: ['HR'],
                        reason: 'Delegated escalation policy.',
                        metadata: { eventId: event.eventId || '' }
                    };
                },
                getEscalationCandidates() {
                    return [{
                        type: 'DELIVERABLE_OVERDUE',
                        module: 'Strategic Deliverables',
                        targetId: 'D-DELEGATED',
                        empId: 'EMP1',
                        priority: PRIORITIES.CRITICAL,
                        ageDays: 9,
                        title: 'Delegated overdue deliverable'
                    }];
                }
            };
            const delegatedEscalation = orchestrateWorkflowEvent('GENERIC_NOTIFICATION', {
                eventId: 'WF-ESC-DELEGATED',
                correlationId: 'CORR-ESC-DELEGATED',
                suppressAudit: true,
                suppressNotification: true,
                suppressPendingAction: true,
                priority: PRIORITIES.CRITICAL
            }, {
                skipPersistence: true,
                forceInternalHandlers: true
            });
            const delegatedCandidates = getEscalationCandidates();
            record(
                'EscalationPolicyService delegation remains compatible',
                escalationDelegationCalled === true &&
                    delegatedEscalation.escalations.length === 1 &&
                    delegatedEscalation.escalations[0].escalationType === 'WORKFLOW_FAILURE' &&
                    delegatedCandidates.length === 1 &&
                    delegatedCandidates[0].targetId === 'D-DELEGATED',
                { delegatedEscalation: delegatedEscalation.escalations, delegatedCandidates }
            );
            global.EscalationPolicyService = {
                evaluateEscalation() {
                    throw new Error('escalation policy down');
                },
                getEscalationCandidates() {
                    throw new Error('candidate policy down');
                }
            };
            const fallbackEscalation = orchestrateWorkflowEvent('GENERIC_NOTIFICATION', {
                eventId: 'WF-ESC-FALLBACK',
                correlationId: 'CORR-ESC-FALLBACK',
                suppressAudit: true,
                suppressNotification: true,
                suppressPendingAction: true,
                priority: PRIORITIES.CRITICAL
            }, {
                skipPersistence: true,
                forceInternalHandlers: true
            });
            const fallbackCandidates = getEscalationCandidates();
            record(
                'legacy escalation fallback remains safe',
                fallbackEscalation.escalations.length === 1 &&
                    Array.isArray(fallbackCandidates),
                { fallbackEscalation: fallbackEscalation.escalations, fallbackCandidatesLength: fallbackCandidates.length }
            );

            let auditDelegationCalled = false;
            global.AuditService = {
                recordAudit(event, context) {
                    auditDelegationCalled = true;
                    return {
                        success: true,
                        auditId: 'AL-DELEGATED',
                        recorded: true,
                        warning: '',
                        audit: {
                            id: 'AL-DELEGATED',
                            eventId: event.metadata?.eventId || context.eventId || '',
                            correlationId: event.metadata?.correlationId || context.correlationId || '',
                            actionType: event.actionType || '',
                            module: event.module || ''
                        }
                    };
                }
            };
            const delegatedAudit = writeAuditLog({
                actionType: 'delegated audit',
                actorRole: 'hr',
                actorId: 'EMP1',
                module: 'Workflow',
                targetId: 'WF-AUDIT-DELEGATED',
                description: 'Delegated audit path.',
                metadata: {
                    eventId: 'WF-AUDIT-DELEGATED',
                    correlationId: 'CORR-AUDIT-DELEGATED'
                }
            });
            record(
                'AuditService delegation remains compatible',
                auditDelegationCalled === true &&
                    delegatedAudit &&
                    delegatedAudit.id === 'AL-DELEGATED' &&
                    delegatedAudit.eventId === 'WF-AUDIT-DELEGATED',
                delegatedAudit
            );
            global.AuditService = {
                recordAudit() {
                    throw new Error('audit service down');
                }
            };
            const fallbackAudit = writeAuditLog({
                actionType: 'fallback audit',
                actorRole: 'hr',
                actorId: 'EMP1',
                module: 'Workflow',
                targetId: 'WF-AUDIT-FALLBACK',
                description: 'Fallback audit path.',
                metadata: {
                    eventId: 'WF-AUDIT-FALLBACK',
                    correlationId: 'CORR-AUDIT-FALLBACK'
                }
            });
            record(
                'legacy audit fallback remains safe',
                fallbackAudit === null || fallbackAudit.actionType === 'fallback audit' || fallbackAudit.action === 'fallback audit',
                fallbackAudit
            );

            const metricCalls = [];
            global.OrchestrationMetricsService = {
                recordWorkflowMetric(type, metadata) {
                    metricCalls.push({ method: 'recordWorkflowMetric', type, metadata: { ...(metadata || {}) } });
                    return { success: true };
                },
                recordHandlerMetric(handler, status) {
                    metricCalls.push({ method: 'recordHandlerMetric', handler, status });
                    return { success: true };
                },
                recordEscalationMetric(type, severity) {
                    metricCalls.push({ method: 'recordEscalationMetric', type, severity });
                    return { success: true };
                },
                recordNotificationMetric(type) {
                    metricCalls.push({ method: 'recordNotificationMetric', type });
                    return { success: true };
                },
                recordAuditMetric(type) {
                    metricCalls.push({ method: 'recordAuditMetric', type });
                    return { success: true };
                }
            };
            const metricsResult = orchestrateWorkflowEvent('GENERIC_NOTIFICATION', {
                eventId: 'WF-METRICS-SELF',
                correlationId: 'CORR-METRICS-SELF',
                suppressAudit: true,
                suppressNotification: true,
                suppressPendingAction: true,
                suppressEscalation: true
            }, {
                skipPersistence: true,
                forceInternalHandlers: true
            });
            record(
                'OrchestrationMetricsService workflow and handler hooks remain compatible',
                metricsResult.success === true &&
                    metricCalls.some(row => row.method === 'recordWorkflowMetric' && row.type === 'WORKFLOW_RECEIVED') &&
                    metricCalls.some(row => row.method === 'recordWorkflowMetric' && row.type === 'WORKFLOW_COMPLETED') &&
                    metricCalls.filter(row => row.method === 'recordHandlerMetric').length === HANDLER_ORDER.length,
                { metricCalls }
            );
            global.OrchestrationMetricsService = {
                recordWorkflowMetric() {
                    throw new Error('metrics down');
                },
                recordHandlerMetric() {
                    throw new Error('metrics down');
                }
            };
            const metricsFailure = orchestrateWorkflowEvent('GENERIC_NOTIFICATION', {
                eventId: 'WF-METRICS-FAIL',
                correlationId: 'CORR-METRICS-FAIL',
                suppressAudit: true,
                suppressNotification: true,
                suppressPendingAction: true,
                suppressEscalation: true
            }, {
                skipPersistence: true,
                forceInternalHandlers: true
            });
            record(
                'metrics failures never block workflow execution',
                metricsFailure.success === true &&
                    metricsFailure.executedHandlers.length === HANDLER_ORDER.length,
                metricsFailure
            );

            let replayDelegationCalled = false;
            global.EventReplayService = {
                replayWorkflowEvent(event, options) {
                    replayDelegationCalled = true;
                    return Object.freeze({
                        success: true,
                        replayMode: true,
                        readOnly: true,
                        sideEffectsSuppressed: true,
                        event: { ...(event || {}) },
                        context: { ...(options || {}), replayMode: true },
                        handlers: [],
                        reconstructedTimeline: [],
                        warnings: [],
                        safety: {
                            dispatchNotifications: false,
                            writeAudits: false,
                            createPendingActions: false,
                            mutateDatabase: false,
                            emitEscalationSideEffects: false,
                            triggerExternalChannels: false
                        }
                    });
                }
            };
            const replayDelegated = replayWorkflowEvent({
                eventId: 'WF-REPLAY-DELEGATED',
                correlationId: 'CORR-REPLAY-DELEGATED',
                type: 'GENERIC_NOTIFICATION'
            }, {});
            record(
                'EventReplayService delegation remains compatible',
                replayDelegationCalled === true &&
                    replayDelegated.success === true &&
                    replayDelegated.replayMode === true &&
                    replayDelegated.safety.dispatchNotifications === false,
                replayDelegated
            );
            global.EventReplayService = {
                replayWorkflowEvent() {
                    throw new Error('replay service down');
                }
            };
            const replayFallback = replayWorkflowEvent({
                eventId: 'WF-REPLAY-FALLBACK',
                correlationId: 'CORR-REPLAY-FALLBACK'
            }, {});
            record(
                'missing or failing replay service remains read-only',
                replayFallback.success === false &&
                    replayFallback.replayMode === true &&
                    replayFallback.readOnly === true &&
                    replayFallback.safety.mutateDatabase === false,
                replayFallback
            );

            const traces = [];
            global.WorkflowTraceStore = {
                recordTrace(trace) {
                    traces.push({
                        ...trace,
                        metadata: { ...(trace.metadata || {}) }
                    });
                    return {
                        success: true,
                        stored: true,
                        traceId: `TRACE-SELF-${traces.length}`
                    };
                }
            };
            const traced = orchestrateWorkflowEvent('GENERIC_NOTIFICATION', {
                eventId: 'WF-TRACE-SELF',
                correlationId: 'CORR-TRACE-SELF',
                suppressAudit: true,
                suppressNotification: true,
                suppressPendingAction: true,
                suppressEscalation: true
            }, {
                skipPersistence: true,
                handlers: [
                    { handlerName: 'auditHandler', handlerFn: () => true },
                    { handlerName: 'telemetryHandler', handlerFn: () => true },
                    { handlerName: 'notificationHandler', handlerFn: () => true },
                    { handlerName: 'pendingActionHandler', handlerFn: () => true },
                    { handlerName: 'escalationHandler', handlerFn: () => true }
                ]
            });
            const traceEventTypes = traces.map(row => row.eventType);
            record(
                'workflow traces record',
                traced.traceCount === traces.length &&
                    traceEventTypes.includes('WORKFLOW_RECEIVED') &&
                    traceEventTypes.includes('WORKFLOW_NORMALIZED') &&
                    traceEventTypes.includes('WORKFLOW_COMPLETED'),
                { traceCount: traced.traceCount, traceEventTypes }
            );
            record(
                'handler traces record',
                traceEventTypes.filter(type => type === 'HANDLER_EXECUTION_STARTED').length === HANDLER_ORDER.length &&
                    traceEventTypes.filter(type => type === 'HANDLER_EXECUTION_SUCCESS').length === HANDLER_ORDER.length,
                { traceEventTypes }
            );
            record(
                'correlation continuity preserved',
                traces.every(row => row.correlationId === 'CORR-TRACE-SELF' && row.eventId === 'WF-TRACE-SELF'),
                traces.map(row => ({ eventType: row.eventType, eventId: row.eventId, correlationId: row.correlationId }))
            );

            global.WorkflowTraceStore = {
                recordTrace() {
                    throw new Error('trace store down');
                }
            };
            const traceFailure = orchestrateWorkflowEvent('GENERIC_NOTIFICATION', {
                eventId: 'WF-TRACE-FAILURE',
                correlationId: 'CORR-TRACE-FAILURE',
                suppressAudit: true,
                suppressNotification: true
            }, {
                skipPersistence: true,
                handlers: [
                    { handlerName: 'auditHandler', handlerFn: () => true },
                    { handlerName: 'telemetryHandler', handlerFn: () => true },
                    { handlerName: 'notificationHandler', handlerFn: () => true },
                    { handlerName: 'pendingActionHandler', handlerFn: () => true },
                    { handlerName: 'escalationHandler', handlerFn: () => true }
                ]
            });
            record(
                'trace failures never block workflow execution',
                traceFailure.success === true &&
                    traceFailure.executedHandlers.length === HANDLER_ORDER.length &&
                    traceFailure.warnings.some(row => row.warningCode === 'WORKFLOW_TRACE_FAILED'),
                traceFailure
            );

            global.WorkflowTraceStore = undefined;
            const missingTraceStore = orchestrateWorkflowEvent('GENERIC_NOTIFICATION', {
                eventId: 'WF-TRACE-MISSING',
                correlationId: 'CORR-TRACE-MISSING',
                suppressAudit: true,
                suppressNotification: true
            }, {
                skipPersistence: true,
                forceMissingTraceStore: true,
                handlers: [
                    { handlerName: 'auditHandler', handlerFn: () => true },
                    { handlerName: 'telemetryHandler', handlerFn: () => true },
                    { handlerName: 'notificationHandler', handlerFn: () => true },
                    { handlerName: 'pendingActionHandler', handlerFn: () => true },
                    { handlerName: 'escalationHandler', handlerFn: () => true }
                ]
            });
            record(
                'missing trace store handled safely',
                missingTraceStore.success === true &&
                    missingTraceStore.traceCount === 0 &&
                    missingTraceStore.executedHandlers.length === HANDLER_ORDER.length,
                missingTraceStore
            );
        } catch (err) {
            record('self-test has no uncaught failure', false, err && err.message ? err.message : safeString(err, 'unknown error'));
        } finally {
            global.WorkflowEventSchema = previousSchema;
            global.WorkflowTelemetryService = previousTelemetry;
            global.WorkflowTraceStore = previousTraceStore;
            global.NotificationRoutingService = previousNotificationRoutingService;
            global.PendingActionService = previousPendingActionService;
            global.EscalationPolicyService = previousEscalationPolicyService;
            global.AuditService = previousAuditService;
            global.OrchestrationMetricsService = previousOrchestrationMetricsService;
            global.EventReplayService = previousEventReplayService;
        }

        const report = Object.freeze({
            passed: tests.every(test => test.ok),
            tests
        });
        try {
            global.__ARTHHRMS_WORKFLOW_ENGINE_SELF_TEST__ = report;
        } catch (e) {}
        if (report.passed) safeInfo(`${ENGINE_PREFIX} Development self-test passed.`, report);
        else safeWarn(`${ENGINE_PREFIX} Development self-test failed.`, report);
    }

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }

    const workflowEngine = {
        EVENTS: WORKFLOW_EVENTS,
        PRIORITIES,
        emitWorkflowEvent,
        dispatchNotification,
        writeAuditLog,
        createPendingAction,
        resolvePendingAction,
        getPendingActions,
        getPendingSummary,
        getEscalationCandidates,
        dispatchExternalChannels,
        routeNotifications,
        replayWorkflowEvent
    };

    global.WORKFLOW_EVENTS = global.WORKFLOW_EVENTS || WORKFLOW_EVENTS;
    global.WORKFLOW_PRIORITIES = global.WORKFLOW_PRIORITIES || PRIORITIES;
    global.workflowEngine = global.workflowEngine || workflowEngine;
})(typeof window !== 'undefined' ? window : globalThis);
