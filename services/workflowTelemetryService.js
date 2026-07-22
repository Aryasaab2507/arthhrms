/**
 * workflowTelemetryService.js
 * ARTHHRMS — Workflow Telemetry Foundation Layer
 *
 * PURPOSE:
 * Provides structured operational telemetry emission for workflows,
 * orchestration events, notifications, payroll operations, imports,
 * onboarding, and deployment flows.
 *
 * This service emits telemetry ONLY.
 * It does NOT inspect monitoring internals.
 *
 * STABILITY:
 * Public APIs must remain synchronous and backward-compatible.
 * This file must never introduce async-only runtime behavior.
 *
 * DEPENDS ON:
 * - window.WorkflowEventSchema (optional)
 * - window.operationsMonitoringService (optional)
 *
 * @version 1.0.0
 */
(function (global) {
    'use strict';

    const PREFIX = '[WorkflowTelemetryService]';
    const MAX_BUFFER_SIZE = 100;
    const SEVERITIES = Object.freeze(['INFO', 'WARNING', 'ERROR', 'CRITICAL']);
    const CATEGORIES = Object.freeze([
        'WORKFLOW',
        'AUTH',
        'PAYROLL',
        'IMPORT',
        'NOTIFICATION',
        'GOVERNANCE',
        'STORAGE',
        'DEPLOYMENT'
    ]);

    const telemetryBuffer = [];
    let forwarding = false;

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
        if (!value || (typeof value !== 'object' && typeof value !== 'function') || Object.isFrozen(value)) {
            return value;
        }
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

    function safeCloneObject(input) {
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

    if (typeof global.WorkflowEventSchema === 'undefined') {
        safeWarn(`${PREFIX} Optional dependency window.WorkflowEventSchema is unavailable. Telemetry tracing will use supplied options only.`);
    }

    if (
        typeof global.operationsMonitoringService === 'undefined' ||
        typeof global.operationsMonitoringService.recordTelemetry !== 'function'
    ) {
        safeWarn(`${PREFIX} Optional monitoring adapter recordTelemetry() is unavailable. Telemetry will remain in the in-memory buffer.`);
    }

    function normalizeToken(value, allowed, fallback) {
        const normalized = safeString(value || fallback, fallback)
            .trim()
            .replace(/[\s-]+/g, '_')
            .toUpperCase();
        return allowed.includes(normalized) ? normalized : fallback;
    }

    function normalizeCategory(category) {
        return normalizeToken(category, CATEGORIES, 'WORKFLOW');
    }

    function normalizeSeverity(severity) {
        return normalizeToken(severity, SEVERITIES, 'INFO');
    }

    function normalizeStatus(status) {
        const normalized = safeString(status || 'SUCCESS', 'SUCCESS')
            .trim()
            .replace(/[\s-]+/g, '_')
            .toUpperCase();
        return normalized || 'SUCCESS';
    }

    function normalizeSource(source) {
        const normalized = safeString(source || 'UNKNOWN_SOURCE', 'UNKNOWN_SOURCE').trim();
        return normalized || 'UNKNOWN_SOURCE';
    }

    function schemaTrace(options) {
        const schema = global.WorkflowEventSchema;
        const supplied = safeCloneObject(options);
        const trace = {
            correlationId: supplied.correlationId || '',
            eventId: supplied.eventId || ''
        };

        if (!schema || typeof schema !== 'object') return trace;

        try {
            if (!trace.correlationId && schema.correlationId) trace.correlationId = schema.correlationId;
            if (!trace.eventId && schema.eventId) trace.eventId = schema.eventId;
            if (!trace.correlationId && schema.currentEvent?.correlationId) trace.correlationId = schema.currentEvent.correlationId;
            if (!trace.eventId && schema.currentEvent?.eventId) trace.eventId = schema.currentEvent.eventId;
            if (!trace.correlationId && typeof schema.getCurrentTrace === 'function') {
                const currentTrace = schema.getCurrentTrace();
                trace.correlationId = currentTrace?.correlationId || trace.correlationId;
                trace.eventId = currentTrace?.eventId || trace.eventId;
            }
        } catch (e) {}

        return trace;
    }

    function generateTelemetryId() {
        return `TEL-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    function buildTelemetry(category, eventType, options) {
        const supplied = safeCloneObject(options);
        const trace = schemaTrace(supplied);
        return {
            telemetryId: supplied.telemetryId || generateTelemetryId(),
            timestamp: supplied.timestamp || new Date().toISOString(),
            source: normalizeSource(supplied.source),
            category: normalizeCategory(category),
            severity: normalizeSeverity(supplied.severity),
            eventType: safeString(eventType || supplied.eventType || 'UNKNOWN_EVENT', 'UNKNOWN_EVENT').trim() || 'UNKNOWN_EVENT',
            correlationId: supplied.correlationId || trace.correlationId || '',
            eventId: supplied.eventId || trace.eventId || '',
            status: normalizeStatus(supplied.status),
            metadata: safeCloneObject(supplied.metadata)
        };
    }

    function pushBuffer(telemetry) {
        telemetryBuffer.push(Object.freeze({ ...telemetry, metadata: Object.freeze({ ...(telemetry.metadata || {}) }) }));
        while (telemetryBuffer.length > MAX_BUFFER_SIZE) {
            telemetryBuffer.shift();
        }
    }

    function forwardToMonitoring(telemetry) {
        if (forwarding) {
            return { forwarded: false, warning: 'Monitoring adapter forwarding skipped to avoid recursion.' };
        }

        const adapter = global.operationsMonitoringService;
        if (!adapter || typeof adapter.recordTelemetry !== 'function') {
            return { forwarded: false, warning: 'Monitoring adapter recordTelemetry() is unavailable.' };
        }

        try {
            forwarding = true;
            adapter.recordTelemetry({ ...telemetry, metadata: { ...(telemetry.metadata || {}) } });
            return { forwarded: true, warning: '' };
        } catch (err) {
            return {
                forwarded: false,
                warning: `Monitoring adapter failed safely: ${err && err.message ? err.message : safeString(err, 'unknown error')}`
            };
        } finally {
            forwarding = false;
        }
    }

    function emitTelemetry(category, eventType, options) {
        try {
            const telemetry = buildTelemetry(category, eventType, options);
            pushBuffer(telemetry);
            const forwardResult = forwardToMonitoring(telemetry);
            return {
                success: true,
                telemetryId: telemetry.telemetryId,
                emitted: !!forwardResult.forwarded,
                warning: forwardResult.warning || '',
                telemetry
            };
        } catch (err) {
            return {
                success: false,
                telemetryId: '',
                emitted: false,
                warning: `Telemetry emission failed safely: ${err && err.message ? err.message : safeString(err, 'unknown error')}`,
                telemetry: null
            };
        }
    }

    function getRecentTelemetry() {
        return Object.freeze(telemetryBuffer.map(row => Object.freeze({
            ...row,
            metadata: Object.freeze({ ...(row.metadata || {}) })
        })));
    }

    function emitWorkflowTelemetry(eventType, options) {
        return emitTelemetry('WORKFLOW', eventType, options);
    }

    function emitAuthTelemetry(eventType, options) {
        return emitTelemetry('AUTH', eventType, options);
    }

    function emitPayrollTelemetry(eventType, options) {
        return emitTelemetry('PAYROLL', eventType, options);
    }

    function emitImportTelemetry(eventType, options) {
        return emitTelemetry('IMPORT', eventType, options);
    }

    const WorkflowTelemetryService = Object.freeze({
        emitTelemetry,
        generateTelemetryId,
        getRecentTelemetry,
        emitWorkflowTelemetry,
        emitAuthTelemetry,
        emitPayrollTelemetry,
        emitImportTelemetry
    });

    global.WorkflowTelemetryService = WorkflowTelemetryService;

    function runSelfTest() {
        const tests = [];
        const record = (name, ok, details) => tests.push({ name, ok: !!ok, details: details || null });
        const previousMonitoring = global.operationsMonitoringService;
        const previousSchema = global.WorkflowEventSchema;

        try {
            global.operationsMonitoringService = undefined;
            const safeEmit = emitWorkflowTelemetry('SELF_TEST_WORKFLOW', {
                source: 'self-test',
                metadata: { step: 'missing-monitoring' }
            });
            record(
                'telemetry emits safely without monitoring dependency',
                safeEmit.success === true && safeEmit.telemetry.category === 'WORKFLOW' && safeEmit.emitted === false,
                safeEmit
            );

            const malformed = emitTelemetry('not-a-category', 'BAD_INPUT', {
                severity: 'strange',
                source: '',
                status: '',
                metadata: 'bad-metadata'
            });
            record(
                'invalid categories normalized safely',
                malformed.success === true &&
                    malformed.telemetry.category === 'WORKFLOW' &&
                    malformed.telemetry.severity === 'INFO' &&
                    malformed.telemetry.source === 'UNKNOWN_SOURCE',
                malformed
            );

            global.WorkflowEventSchema = {
                currentEvent: {
                    correlationId: 'CORR-SELF-TEST',
                    eventId: 'WF-SELF-TEST'
                }
            };
            const traced = emitAuthTelemetry('AUTH_TRACE_TEST', { source: 'self-test' });
            record(
                'WorkflowEventSchema tracing is optional-safe',
                traced.telemetry.correlationId === 'CORR-SELF-TEST' && traced.telemetry.eventId === 'WF-SELF-TEST',
                traced
            );

            global.operationsMonitoringService = {
                recordTelemetry() {
                    throw new Error('adapter failed');
                }
            };
            const isolated = emitPayrollTelemetry('ADAPTER_FAILURE_TEST', { source: 'self-test' });
            record(
                'monitoring adapter failures isolated',
                isolated.success === true && isolated.emitted === false && /failed safely/i.test(isolated.warning),
                isolated
            );

            global.operationsMonitoringService = {
                recordTelemetry() {
                    emitImportTelemetry('RECURSION_TEST_INNER', { source: 'adapter' });
                }
            };
            const recursion = emitImportTelemetry('RECURSION_TEST_OUTER', { source: 'self-test' });
            record(
                'monitoring recursion is prevented',
                recursion.success === true,
                recursion
            );

            global.operationsMonitoringService = undefined;
            for (let i = 0; i < MAX_BUFFER_SIZE + 5; i += 1) {
                emitTelemetry('DEPLOYMENT', `BUFFER_ROLLOVER_${i}`, { source: 'self-test', metadata: { i } });
            }
            const recent = getRecentTelemetry();
            record(
                'ring buffer rollover works',
                recent.length === MAX_BUFFER_SIZE &&
                    recent[0].eventType !== 'SELF_TEST_WORKFLOW' &&
                    recent[recent.length - 1].eventType === `BUFFER_ROLLOVER_${MAX_BUFFER_SIZE + 4}`,
                { length: recent.length, first: recent[0]?.eventType, last: recent[recent.length - 1]?.eventType }
            );

            const original = { source: 'self-test', metadata: { stable: true } };
            const before = JSON.stringify(original);
            emitTelemetry('AUTH', 'MUTATION_TEST', original);
            record('inputs are never mutated', JSON.stringify(original) === before, original);
        } catch (err) {
            record('self-test has no uncaught failure', false, err && err.message ? err.message : safeString(err, 'unknown error'));
        } finally {
            global.operationsMonitoringService = previousMonitoring;
            global.WorkflowEventSchema = previousSchema;
        }

        const report = Object.freeze({
            passed: tests.every(test => test.ok),
            tests: deepFreeze(tests)
        });

        try {
            global.__ARTHHRMS_WORKFLOW_TELEMETRY_SELF_TEST__ = report;
        } catch (e) {}

        if (report.passed) safeInfo(`${PREFIX} Development self-test passed.`, report);
        else safeWarn(`${PREFIX} Development self-test failed.`, report);
    }

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
