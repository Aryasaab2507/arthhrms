/**
 * workflowHandlers.js
 * ARTHHRMS — Workflow Execution Handlers
 *
 * PURPOSE:
 * Provides isolated workflow execution handlers used by
 * workflowEngine orchestrator.
 *
 * This file intentionally separates:
 * - orchestration
 * - telemetry
 * - notifications
 * - pending actions
 * - escalation
 * - audit execution
 *
 * ARCHITECTURE RULE:
 * Handlers execute independently and must never
 * directly mutate workflowEngine internals.
 *
 * STABILITY:
 * Handler failures must remain isolated.
 *
 * DEPENDS ON:
 * - window.WorkflowTelemetryService (optional)
 * - window.IdempotencyService (optional)
 *
 * @version 1.0.0
 */
(function (global) {
    'use strict';

    const PREFIX = '[WorkflowHandlers]';
    const HANDLER_ORDER = Object.freeze([
        'auditHandler',
        'telemetryHandler',
        'notificationHandler',
        'pendingActionHandler',
        'escalationHandler'
    ]);

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

    function deepFreeze(value) {
        if (!value || (typeof value !== 'object' && typeof value !== 'function') || Object.isFrozen(value)) return value;
        Object.keys(value).forEach(key => deepFreeze(value[key]));
        return Object.freeze(value);
    }

    function safeString(value, fallback) {
        try {
            if (typeof value === 'symbol') return value.toString();
            return String(value);
        } catch (e) {
            return fallback;
        }
    }

    function cloneObject(input) {
        const output = {};
        if (!input || typeof input !== 'object' || Array.isArray(input)) return output;
        try {
            Object.keys(input).forEach(key => {
                try {
                    output[key] = input[key];
                } catch (e) {}
            });
        } catch (e) {}
        return output;
    }

    function cloneEvent(event) {
        const copy = cloneObject(event);
        copy.metadata = cloneObject(copy.metadata);
        copy.eventId = copy.eventId || copy.id || '';
        copy.correlationId = copy.correlationId || copy.eventId || '';
        copy.source = copy.source || 'workflowEngine';
        copy.severity = safeString(copy.severity || 'INFO', 'INFO').toUpperCase();
        copy.type = safeString(copy.type || copy.eventType || 'UNKNOWN_WORKFLOW_EVENT', 'UNKNOWN_WORKFLOW_EVENT');
        copy.module = copy.module || 'Workflow';
        copy.status = copy.status || 'Open';
        return copy;
    }

    function normalizeContext(context) {
        const copy = cloneObject(context);
        copy.options = cloneObject(copy.options);
        copy.adapters = cloneObject(copy.adapters);
        return copy;
    }

    function handlerResult(handler, success, warnings, metadata) {
        return {
            success: !!success,
            handler,
            warnings: Array.isArray(warnings) ? warnings.slice() : [],
            metadata: metadata && typeof metadata === 'object' ? cloneObject(metadata) : {}
        };
    }

    function warning(warningCode, message, metadata) {
        return {
            warningCode,
            message,
            metadata: metadata || {}
        };
    }

    function telemetryService(context) {
        if (context.options && context.options.forceMissingTelemetry) return null;
        return global.WorkflowTelemetryService || null;
    }

    if (typeof global.WorkflowTelemetryService === 'undefined') {
        safeWarn(`${PREFIX} Optional dependency window.WorkflowTelemetryService is unavailable. Telemetry handlers will degrade safely.`);
    }

    if (typeof global.IdempotencyService === 'undefined') {
        safeWarn(`${PREFIX} Optional dependency window.IdempotencyService is unavailable. Handler idempotency hints are informational only.`);
    }

    function createHandler(handlerName, body) {
        return function (eventInput, contextInput) {
            const event = cloneEvent(eventInput);
            const context = normalizeContext(contextInput);
            try {
                const result = body(event, context) || {};
                return handlerResult(
                    handlerName,
                    result.success !== false,
                    result.warnings || [],
                    result.metadata || {}
                );
            } catch (err) {
                return handlerResult(
                    handlerName,
                    false,
                    [warning(
                        'WORKFLOW_HANDLER_FAILED',
                        `${handlerName} failed safely: ${err && err.message ? err.message : safeString(err, 'unknown handler failure')}`
                    )],
                    {}
                );
            }
        };
    }

    const auditHandler = createHandler('auditHandler', (event, context) => {
        const warnings = [];
        let workflowEvent = event;
        let audit = null;
        const adapters = context.adapters || {};

        if (!context.options.skipPersistence) {
            if (typeof adapters.recordWorkflowEvent === 'function') {
                workflowEvent = adapters.recordWorkflowEvent(event) || event;
            } else {
                warnings.push(warning('WORKFLOW_EVENT_RECORDER_MISSING', 'Workflow event recorder adapter is unavailable.'));
            }
        }

        if (!event.suppressAudit) {
            if (typeof adapters.writeAuditLog === 'function') {
                audit = adapters.writeAuditLog({
                    type: event.type,
                    actionType: event.actionType || safeString(event.type || 'workflow event', 'workflow event').toLowerCase().replace(/_/g, ' '),
                    actorRole: event.actorRole || '',
                    actorId: event.actorId || '',
                    module: event.module || 'Workflow',
                    targetId: event.targetId || '',
                    description: event.message || event.title || event.type,
                    metadata: {
                        ...(event.metadata || {}),
                        eventId: event.eventId,
                        correlationId: event.correlationId,
                        source: event.source,
                        severity: event.severity
                    }
                });
            } else {
                warnings.push(warning('AUDIT_ADAPTER_MISSING', 'Audit adapter is unavailable.'));
            }
        }

        return {
            success: true,
            warnings,
            metadata: { workflowEvent, audit }
        };
    });

    const telemetryHandler = createHandler('telemetryHandler', (event, context) => {
        const warnings = [];
        let telemetry = null;
        const service = telemetryService(context);

        if (!service || typeof service.emitWorkflowTelemetry !== 'function') {
            warnings.push(warning('WORKFLOW_TELEMETRY_UNAVAILABLE', 'WorkflowTelemetryService is unavailable. Workflow continued without telemetry emission.'));
            return { success: true, warnings, metadata: { telemetry } };
        }

        telemetry = service.emitWorkflowTelemetry(event.type, {
            source: event.source || 'workflowEngine',
            severity: event.severity || 'INFO',
            status: event.status || 'Open',
            eventId: event.eventId,
            correlationId: event.correlationId,
            metadata: {
                ...(event.metadata || {}),
                module: event.module,
                targetId: event.targetId || '',
                priority: event.priority || '',
                handler: 'telemetryHandler'
            }
        });

        if (telemetry && telemetry.warning) {
            warnings.push(warning('WORKFLOW_TELEMETRY_WARNING', telemetry.warning));
        }

        return {
            success: true,
            warnings,
            metadata: { telemetry }
        };
    });

    const notificationHandler = createHandler('notificationHandler', (event, context) => {
        const warnings = [];
        const notifications = [];
        const adapters = context.adapters || {};

        if (event.suppressNotification) {
            return { success: true, warnings, metadata: { notifications } };
        }

        if (typeof adapters.routeNotifications !== 'function' || typeof adapters.dispatchNotification !== 'function') {
            warnings.push(warning('NOTIFICATION_ADAPTER_MISSING', 'Notification routing or dispatch adapter is unavailable.'));
            return { success: true, warnings, metadata: { notifications } };
        }

        let routes = [];
        try {
            routes = adapters.routeNotifications(event.type, event) || [];
        } catch (err) {
            warnings.push(warning(
                'NOTIFICATION_ROUTE_FAILED',
                `Notification routing failed safely: ${err && err.message ? err.message : safeString(err, 'unknown routing failure')}`
            ));
            routes = [];
        }

        routes.forEach((route, index) => {
            try {
                const row = adapters.dispatchNotification(route);
                if (row) notifications.push(row);
            } catch (err) {
                warnings.push(warning(
                    'NOTIFICATION_DISPATCH_FAILED',
                    `Notification dispatch failed safely for route ${index + 1}: ${err && err.message ? err.message : safeString(err, 'unknown dispatch failure')}`,
                    { routeIndex: index }
                ));
            }
        });

        return {
            success: true,
            warnings,
            metadata: { notifications }
        };
    });

    const pendingActionHandler = createHandler('pendingActionHandler', (event, context) => {
        const warnings = [];
        const pendingActions = [];
        const adapters = context.adapters || {};

        if (event.suppressPendingAction) {
            return { success: true, warnings, metadata: { pendingActions } };
        }

        const requested = event.pendingAction || event.metadata?.pendingAction || null;
        if (!requested) {
            return { success: true, warnings, metadata: { pendingActions } };
        }

        if (typeof adapters.createPendingAction !== 'function') {
            warnings.push(warning('PENDING_ACTION_ADAPTER_MISSING', 'Pending action adapter is unavailable.'));
            return { success: true, warnings, metadata: { pendingActions } };
        }

        try {
            const row = adapters.createPendingAction({
                ...cloneObject(requested),
                sourceId: requested.sourceId || event.targetId || event.eventId,
                sourceType: requested.sourceType || event.module || 'Workflow',
                module: requested.module || event.module || 'Workflow',
                priority: requested.priority || event.priority || 'MEDIUM',
                metadata: {
                    ...(requested.metadata || {}),
                    eventId: event.eventId,
                    correlationId: event.correlationId
                }
            });
            if (row) pendingActions.push(row);
        } catch (err) {
            warnings.push(warning(
                'PENDING_ACTION_CREATE_FAILED',
                `Pending action creation failed safely: ${err && err.message ? err.message : safeString(err, 'unknown pending action failure')}`
            ));
        }

        return {
            success: true,
            warnings,
            metadata: { pendingActions }
        };
    });

    const escalationHandler = createHandler('escalationHandler', (event, context) => {
        const warnings = [];
        const escalations = [];
        let escalationTelemetry = null;

        if (event.suppressEscalation) {
            return { success: true, warnings, metadata: { escalations, escalationTelemetry } };
        }

        const priority = safeString(event.priority || '', '').toUpperCase();
        const severity = safeString(event.severity || '', '').toUpperCase();
        const statusText = `${event.status || ''} ${event.type || ''}`;
        const shouldEscalate = /failed|blocked/i.test(statusText) || priority === 'CRITICAL' || severity === 'CRITICAL';

        if (!shouldEscalate) {
            return { success: true, warnings, metadata: { escalations, escalationTelemetry } };
        }

        const escalation = {
            eventId: event.eventId,
            correlationId: event.correlationId,
            module: event.module || 'Workflow',
            severity: severity || (priority === 'CRITICAL' ? 'CRITICAL' : 'WARNING'),
            title: event.title || `${event.type} requires operational review`,
            targetId: event.targetId || '',
            recommendation: 'Review the source module and reconcile related audit, notification, and pending action records.'
        };
        escalations.push(escalation);

        const service = telemetryService(context);
        if (service && typeof service.emitWorkflowTelemetry === 'function') {
            escalationTelemetry = service.emitWorkflowTelemetry('WORKFLOW_ESCALATION_CANDIDATE', {
                source: event.source || 'workflowHandlers',
                severity: escalation.severity,
                status: 'ESCALATION_CANDIDATE',
                eventId: event.eventId,
                correlationId: event.correlationId,
                metadata: escalation
            });
            if (escalationTelemetry && escalationTelemetry.warning) {
                warnings.push(warning('ESCALATION_TELEMETRY_WARNING', escalationTelemetry.warning));
            }
        } else {
            warnings.push(warning('ESCALATION_TELEMETRY_UNAVAILABLE', 'Escalation telemetry could not be emitted because WorkflowTelemetryService is unavailable.'));
        }

        return {
            success: true,
            warnings,
            metadata: { escalations, escalationTelemetry }
        };
    });

    const HANDLER_REGISTRY = deepFreeze({
        auditHandler,
        telemetryHandler,
        notificationHandler,
        pendingActionHandler,
        escalationHandler
    });

    function getHandler(handlerName) {
        return HANDLER_REGISTRY[handlerName] || null;
    }

    function getHandlers() {
        return Object.freeze(HANDLER_ORDER
            .map(handlerName => ({ handlerName, handlerFn: HANDLER_REGISTRY[handlerName] }))
            .filter(row => typeof row.handlerFn === 'function'));
    }

    function executeHandler(handlerName, event, context) {
        const name = safeString(handlerName || '', '');
        const handler = getHandler(name);
        if (!handler) {
            return {
                success: false,
                handler: name,
                warnings: [warning('WORKFLOW_HANDLER_NOT_FOUND', `Workflow handler "${name}" was not found.`)],
                failed: true,
                result: handlerResult(name, false, [warning('WORKFLOW_HANDLER_NOT_FOUND', `Workflow handler "${name}" was not found.`)], {})
            };
        }

        let result = null;
        try {
            result = handler(event, context);
        } catch (err) {
            result = handlerResult(name, false, [warning(
                'WORKFLOW_HANDLER_UNCAUGHT_FAILURE',
                `${name} failed safely: ${err && err.message ? err.message : safeString(err, 'unknown handler failure')}`
            )], {});
        }

        const normalized = handlerResult(name, result && result.success !== false, result?.warnings || [], result?.metadata || {});
        return {
            success: normalized.success,
            handler: name,
            warnings: normalized.warnings,
            failed: normalized.success === false,
            result: normalized
        };
    }

    const WorkflowHandlers = Object.freeze({
        HANDLER_ORDER,
        HANDLER_REGISTRY,
        getHandler,
        getHandlers,
        executeHandler,
        auditHandler,
        telemetryHandler,
        notificationHandler,
        pendingActionHandler,
        escalationHandler
    });

    global.WorkflowHandlers = WorkflowHandlers;

    function runSelfTest() {
        const tests = [];
        const record = (name, ok, details) => tests.push({ name, ok: !!ok, details: details || null });
        const previousTelemetry = global.WorkflowTelemetryService;

        try {
            record(
                'immutable registry protected',
                Object.isFrozen(HANDLER_REGISTRY) && Object.isFrozen(WorkflowHandlers),
                { registryFrozen: Object.isFrozen(HANDLER_REGISTRY), exportFrozen: Object.isFrozen(WorkflowHandlers) }
            );

            const malformed = executeHandler('telemetryHandler', Symbol('bad-event'), Symbol('bad-context'));
            record(
                'malformed events handled safely',
                malformed.success === true && malformed.result.handler === 'telemetryHandler',
                malformed
            );

            global.WorkflowTelemetryService = undefined;
            const degraded = executeHandler('telemetryHandler', { eventId: 'WF-HANDLER-SELF', type: 'GENERIC_NOTIFICATION' }, {});
            record(
                'telemetry degradation safe',
                degraded.success === true &&
                    degraded.warnings.some(row => row.warningCode === 'WORKFLOW_TELEMETRY_UNAVAILABLE'),
                degraded
            );

            const failed = executeHandler('auditHandler', { eventId: 'WF-HANDLER-FAIL', type: 'GENERIC_NOTIFICATION' }, {
                adapters: {
                    recordWorkflowEvent() {
                        throw new Error('record failed');
                    }
                }
            });
            record(
                'handler failures isolated',
                failed.failed === true &&
                    failed.warnings.some(row => row.warningCode === 'WORKFLOW_HANDLER_FAILED'),
                failed
            );

            const notify = executeHandler('notificationHandler', { eventId: 'WF-NOTIFY', type: 'GENERIC_NOTIFICATION' }, {
                adapters: {
                    routeNotifications() {
                        return [{ targetRole: 'HR', title: 'Test' }];
                    },
                    dispatchNotification() {
                        throw new Error('dispatch failed');
                    }
                }
            });
            record(
                'warning generation works',
                notify.success === true &&
                    notify.warnings.some(row => row.warningCode === 'NOTIFICATION_DISPATCH_FAILED'),
                notify
            );

            const original = { eventId: 'WF-MUTATION', metadata: { stable: true }, type: 'GENERIC_NOTIFICATION' };
            const before = JSON.stringify(original);
            executeHandler('pendingActionHandler', original, {});
            record('original events are never mutated', JSON.stringify(original) === before, original);

            const ordered = getHandlers().map(row => row.handlerName).join(',');
            record(
                'handlers execute independently',
                ordered === HANDLER_ORDER.join(',') &&
                    executeHandler('auditHandler', { eventId: 'WF-AUDIT', type: 'GENERIC_NOTIFICATION', suppressAudit: true }, { options: { skipPersistence: true } }).success === true,
                { ordered }
            );
        } catch (err) {
            record('self-test has no uncaught failure', false, err && err.message ? err.message : safeString(err, 'unknown error'));
        } finally {
            global.WorkflowTelemetryService = previousTelemetry;
        }

        const report = Object.freeze({
            passed: tests.every(test => test.ok),
            tests: deepFreeze(tests)
        });
        try {
            global.__ARTHHRMS_WORKFLOW_HANDLERS_SELF_TEST__ = report;
        } catch (e) {}
        if (report.passed) safeInfo(`${PREFIX} Development self-test passed.`, report);
        else safeWarn(`${PREFIX} Development self-test failed.`, report);
    }

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
