/**
 * workflowTraceStore.js
 * ARTHHRMS — Workflow Trace Store Foundation
 *
 * PURPOSE:
 * Provides lightweight in-memory workflow trace tracking
 * for orchestration visibility and correlation debugging.
 *
 * This service stores execution traces ONLY.
 * It is NOT a monitoring engine.
 * It is NOT a persistence layer.
 *
 * ARCHITECTURE RULE:
 * Trace storage must never block workflow execution.
 *
 * STABILITY:
 * Public APIs must remain synchronous and backward-compatible.
 *
 * DEPENDS ON:
 * - window.WorkflowTelemetryService (optional)
 *
 * @version 1.0.0
 */
(function (global) {
    'use strict';

    const PREFIX = '[WorkflowTraceStore]';
    const MAX_TRACES = 250;
    const SEVERITIES = Object.freeze(['INFO', 'WARNING', 'ERROR', 'CRITICAL']);
    const DEFAULT_SEVERITY = 'INFO';
    const DEFAULT_SOURCE = 'UNKNOWN_SOURCE';
    const DEFAULT_STATUS = 'RECORDED';
    const DEFAULT_HANDLER = 'UNKNOWN_HANDLER';
    const DEFAULT_EVENT_TYPE = 'UNKNOWN_EVENT';
    const traceStore = [];
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

    function cloneValue(value, seen) {
        if (!value || typeof value !== 'object') return value;
        const refs = seen || [];
        if (refs.indexOf(value) !== -1) return '[Circular]';
        refs.push(value);

        if (Array.isArray(value)) {
            return value.map(item => cloneValue(item, refs.slice()));
        }

        if (value instanceof Date) {
            return new Date(value.getTime());
        }

        if (!isPlainObject(value)) return value;

        const output = {};
        try {
            Object.keys(value).forEach(key => {
                try {
                    output[key] = cloneValue(value[key], refs.slice());
                } catch (e) {}
            });
        } catch (e) {}
        return output;
    }

    function cloneObject(input) {
        const output = {};
        if (!isPlainObject(input)) return output;
        try {
            Object.keys(input).forEach(key => {
                try {
                    output[key] = cloneValue(input[key], []);
                } catch (e) {}
            });
        } catch (e) {}
        return output;
    }

    function deepFreeze(value, seen) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        if (!Array.isArray(value) && !isPlainObject(value) && !(value instanceof Date)) return value;
        const refs = seen || [];
        if (refs.indexOf(value) !== -1) return value;
        refs.push(value);
        try {
            Object.keys(value).forEach(key => deepFreeze(value[key], refs));
            Object.freeze(value);
        } catch (e) {}
        return value;
    }

    function cloneTrace(trace) {
        const metadata = cloneObject(trace && trace.metadata);
        return Object.freeze({
            traceId: safeString(trace && trace.traceId, ''),
            correlationId: safeString(trace && trace.correlationId, ''),
            eventId: safeString(trace && trace.eventId, ''),
            eventType: safeString(trace && trace.eventType, DEFAULT_EVENT_TYPE),
            source: safeString(trace && trace.source, DEFAULT_SOURCE),
            timestamp: safeString(trace && trace.timestamp, ''),
            handler: safeString(trace && trace.handler, DEFAULT_HANDLER),
            status: safeString(trace && trace.status, DEFAULT_STATUS),
            severity: safeString(trace && trace.severity, DEFAULT_SEVERITY),
            metadata: deepFreeze(metadata)
        });
    }

    function freezeTrace(trace) {
        const metadata = deepFreeze(cloneObject(trace.metadata));
        return Object.freeze({
            ...trace,
            metadata
        });
    }

    function normalizeToken(value, allowed, fallback) {
        const normalized = safeString(value, fallback)
            .trim()
            .replace(/[\s-]+/g, '_')
            .toUpperCase();
        return allowed.indexOf(normalized) !== -1 ? normalized : fallback;
    }

    function normalizeSeverity(severity) {
        return normalizeToken(severity, SEVERITIES, DEFAULT_SEVERITY);
    }

    function normalizeSource(source) {
        const normalized = safeString(source, DEFAULT_SOURCE).trim();
        return normalized || DEFAULT_SOURCE;
    }

    function normalizeStatus(status) {
        const normalized = safeString(status, DEFAULT_STATUS)
            .trim()
            .replace(/[\s-]+/g, '_')
            .toUpperCase();
        return normalized || DEFAULT_STATUS;
    }

    function normalizeHandler(handler) {
        const normalized = safeString(handler, DEFAULT_HANDLER).trim();
        return normalized || DEFAULT_HANDLER;
    }

    function normalizeEventType(eventType, fallback) {
        const normalized = safeString(eventType || fallback, DEFAULT_EVENT_TYPE).trim();
        return normalized || DEFAULT_EVENT_TYPE;
    }

    function normalizeTimestamp(timestamp) {
        const supplied = safeString(timestamp, '').trim();
        if (!supplied) return new Date().toISOString();
        const parsed = new Date(supplied);
        return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : supplied;
    }

    function generateTraceId() {
        try {
            return `TRACE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        } catch (e) {
            return `TRACE-${new Date().getTime()}-safe`;
        }
    }

    function traceInput(trace) {
        if (!isPlainObject(trace)) {
            return {
                supplied: {},
                warning: 'Malformed trace input normalized safely.'
            };
        }
        return {
            supplied: cloneObject(trace),
            warning: ''
        };
    }

    function normalizeTrace(trace) {
        const input = traceInput(trace);
        const supplied = input.supplied;
        const metadata = cloneObject(supplied.metadata);
        const traceId = supplied.traceId || generateTraceId();
        const eventId = supplied.eventId || metadata.eventId || '';
        const correlationId = supplied.correlationId || metadata.correlationId || eventId || '';

        return {
            trace: {
                traceId: safeString(traceId, generateTraceId()).trim() || generateTraceId(),
                correlationId: safeString(correlationId, '').trim(),
                eventId: safeString(eventId, '').trim(),
                eventType: normalizeEventType(supplied.eventType || supplied.type, metadata.eventType),
                source: normalizeSource(supplied.source || metadata.source),
                timestamp: normalizeTimestamp(supplied.timestamp),
                handler: normalizeHandler(supplied.handler || metadata.handler),
                status: normalizeStatus(supplied.status),
                severity: normalizeSeverity(supplied.severity),
                metadata
            },
            warning: input.warning
        };
    }

    function pushTrace(trace) {
        traceStore.push(freezeTrace(trace));
        while (traceStore.length > MAX_TRACES) {
            traceStore.shift();
        }
    }

    function telemetryService() {
        return global.WorkflowTelemetryService || null;
    }

    if (typeof global.WorkflowTelemetryService === 'undefined') {
        safeWarn(`${PREFIX} Optional dependency window.WorkflowTelemetryService is unavailable. Traces will remain in memory only.`);
    }

    function emitTraceTelemetry(eventType, trace, severity, metadata) {
        if (telemetryForwarding) {
            return { emitted: false, warning: 'Telemetry forwarding skipped to avoid recursion.' };
        }

        const service = telemetryService();
        if (!service || typeof service.emitWorkflowTelemetry !== 'function') {
            return { emitted: false, warning: '' };
        }

        try {
            telemetryForwarding = true;
            service.emitWorkflowTelemetry(eventType, {
                source: 'workflowTraceStore',
                severity: severity || DEFAULT_SEVERITY,
                status: trace && trace.status ? trace.status : DEFAULT_STATUS,
                eventId: trace && trace.eventId ? trace.eventId : '',
                correlationId: trace && trace.correlationId ? trace.correlationId : '',
                metadata: {
                    ...(metadata || {}),
                    traceId: trace && trace.traceId ? trace.traceId : '',
                    handler: trace && trace.handler ? trace.handler : DEFAULT_HANDLER,
                    eventType: trace && trace.eventType ? trace.eventType : DEFAULT_EVENT_TYPE
                }
            });
            return { emitted: true, warning: '' };
        } catch (err) {
            return {
                emitted: false,
                warning: `Telemetry forwarding failed safely: ${err && err.message ? err.message : safeString(err, 'unknown error')}`
            };
        } finally {
            telemetryForwarding = false;
        }
    }

    function recordTrace(trace) {
        try {
            const normalized = normalizeTrace(trace);
            pushTrace(normalized.trace);

            let warning = normalized.warning || '';
            const telemetryResult = emitTraceTelemetry(
                normalized.warning ? 'TRACE_MALFORMED_NORMALIZED' : 'TRACE_RECORDED',
                normalized.trace,
                normalized.warning ? 'WARNING' : normalized.trace.severity,
                { warning: normalized.warning || '' }
            );

            if (telemetryResult.warning) {
                warning = warning ? `${warning} ${telemetryResult.warning}` : telemetryResult.warning;
            }

            return {
                success: true,
                traceId: normalized.trace.traceId,
                stored: true,
                warning
            };
        } catch (err) {
            return {
                success: false,
                traceId: '',
                stored: false,
                warning: `Trace recording failed safely: ${err && err.message ? err.message : safeString(err, 'unknown error')}`
            };
        }
    }

    function getRecentTraces() {
        try {
            return Object.freeze(traceStore.map(trace => cloneTrace(trace)));
        } catch (err) {
            return Object.freeze([]);
        }
    }

    function lookupTrace(field, value, telemetryType) {
        try {
            const needle = safeString(value, '').trim();
            if (!needle) {
                const empty = Object.freeze([]);
                emitTraceTelemetry(telemetryType || 'TRACE_LOOKUP_FAILED', {
                    traceId: '',
                    correlationId: field === 'correlationId' ? needle : '',
                    eventId: field === 'eventId' ? needle : '',
                    eventType: 'TRACE_LOOKUP',
                    source: 'workflowTraceStore',
                    timestamp: new Date().toISOString(),
                    handler: 'lookupTrace',
                    status: 'LOOKUP_FAILED',
                    severity: 'WARNING',
                    metadata: {}
                }, 'WARNING', { lookupField: field, reason: 'missing lookup value' });
                return empty;
            }

            const matches = traceStore
                .filter(trace => safeString(trace[field], '').trim() === needle)
                .map(trace => cloneTrace(trace));

            if (!matches.length) {
                emitTraceTelemetry(telemetryType || 'TRACE_LOOKUP_FAILED', {
                    traceId: '',
                    correlationId: field === 'correlationId' ? needle : '',
                    eventId: field === 'eventId' ? needle : '',
                    eventType: 'TRACE_LOOKUP',
                    source: 'workflowTraceStore',
                    timestamp: new Date().toISOString(),
                    handler: 'lookupTrace',
                    status: 'LOOKUP_MISS',
                    severity: 'WARNING',
                    metadata: {}
                }, 'WARNING', { lookupField: field, lookupValue: needle });
            }

            return Object.freeze(matches);
        } catch (err) {
            return Object.freeze([]);
        }
    }

    function getTraceByCorrelationId(correlationId) {
        return lookupTrace('correlationId', correlationId, 'TRACE_CORRELATION_LOOKUP_MISS');
    }

    function getTraceByEventId(eventId) {
        return lookupTrace('eventId', eventId, 'TRACE_EVENT_LOOKUP_MISS');
    }

    function toTime(timestamp) {
        try {
            const time = new Date(timestamp).getTime();
            return Number.isNaN(time) ? 0 : time;
        } catch (e) {
            return 0;
        }
    }

    function getCorrelationTimeline(correlationId) {
        try {
            const traces = getTraceByCorrelationId(correlationId).slice();
            traces.sort((a, b) => {
                const delta = toTime(a.timestamp) - toTime(b.timestamp);
                if (delta !== 0) return delta;
                return safeString(a.traceId, '').localeCompare(safeString(b.traceId, ''));
            });

            return Object.freeze(traces.map(trace => Object.freeze({
                handler: trace.handler,
                eventType: trace.eventType,
                timestamp: trace.timestamp,
                status: trace.status
            })));
        } catch (err) {
            return Object.freeze([]);
        }
    }

    const WorkflowTraceStore = Object.freeze({
        recordTrace,
        generateTraceId,
        getRecentTraces,
        getTraceByCorrelationId,
        getTraceByEventId,
        getCorrelationTimeline
    });

    global.WorkflowTraceStore = WorkflowTraceStore;

    if (global.__ARTHHRMS_DEV__) {
        (function runSelfTest() {
            const tests = [];
            const previousTelemetry = global.WorkflowTelemetryService;

            function check(name, condition) {
                tests.push({ name, passed: !!condition });
            }

            try {
                global.WorkflowTelemetryService = undefined;
                const input = {
                    correlationId: 'SELF-CORR-1',
                    eventId: 'SELF-EVENT-1',
                    eventType: 'SELF_TEST_STARTED',
                    source: 'selfTest',
                    timestamp: '2026-05-18T10:00:00.000Z',
                    handler: 'auditHandler',
                    status: 'RECORDED',
                    severity: 'INFO',
                    metadata: { preserved: true }
                };
                const before = { ...input, metadata: { ...input.metadata } };
                const recorded = recordTrace(input);
                check('trace records without telemetry dependency', recorded.success && recorded.stored);
                check('input object is not mutated', JSON.stringify(input) === JSON.stringify(before));

                const malformed = recordTrace(Symbol('bad-trace'));
                check('malformed traces normalize safely', malformed.success && malformed.stored && !!malformed.warning);

                const lookup = getTraceByCorrelationId('SELF-CORR-1');
                check('correlation lookup works', lookup.length >= 1 && lookup[0].correlationId === 'SELF-CORR-1');

                recordTrace({
                    correlationId: 'SELF-CORR-ORDER',
                    eventId: 'SELF-EVENT-ORDER-2',
                    eventType: 'ORDER_TWO',
                    timestamp: '2026-05-18T10:02:00.000Z',
                    handler: 'notificationHandler'
                });
                recordTrace({
                    correlationId: 'SELF-CORR-ORDER',
                    eventId: 'SELF-EVENT-ORDER-1',
                    eventType: 'ORDER_ONE',
                    timestamp: '2026-05-18T10:01:00.000Z',
                    handler: 'auditHandler'
                });
                const timeline = getCorrelationTimeline('SELF-CORR-ORDER');
                check('timeline ordering works', timeline.length >= 2 && timeline[0].eventType === 'ORDER_ONE');

                global.WorkflowTelemetryService = {
                    emitWorkflowTelemetry: function () {
                        throw new Error('adapter down');
                    }
                };
                const telemetryFailure = recordTrace({
                    correlationId: 'SELF-CORR-TELEMETRY',
                    eventId: 'SELF-EVENT-TELEMETRY',
                    eventType: 'TELEMETRY_FAILURE_ISOLATION',
                    handler: 'telemetryHandler'
                });
                check('telemetry failures are isolated', telemetryFailure.success && telemetryFailure.stored && telemetryFailure.warning.indexOf('failed safely') !== -1);

                global.WorkflowTelemetryService = undefined;
                for (let i = 0; i < MAX_TRACES + 5; i += 1) {
                    recordTrace({
                        correlationId: 'SELF-CORR-EVICT',
                        eventId: `SELF-EVENT-EVICT-${i}`,
                        eventType: `EVICT_${i}`,
                        timestamp: `2026-05-18T11:${String(i % 60).padStart(2, '0')}:00.000Z`,
                        handler: 'evictionHandler'
                    });
                }
                const recent = getRecentTraces();
                check('ring eviction keeps max traces', recent.length === MAX_TRACES);
                check('returned arrays are frozen', Object.isFrozen(recent) && Object.isFrozen(timeline));
                check('stored trace snapshots are frozen', recent.length > 0 && Object.isFrozen(recent[0]) && Object.isFrozen(recent[0].metadata));

                const missing = getTraceByEventId('SELF-EVENT-NOT-FOUND');
                check('lookup failures are safe', Object.isFrozen(missing) && missing.length === 0);

                const passed = tests.every(test => test.passed);
                global.__ARTHHRMS_WORKFLOW_TRACE_STORE_SELF_TEST__ = Object.freeze({
                    passed,
                    tests: Object.freeze(tests.map(test => Object.freeze({ ...test })))
                });

                if (passed) {
                    safeInfo(`${PREFIX} development self-test passed.`, global.__ARTHHRMS_WORKFLOW_TRACE_STORE_SELF_TEST__);
                } else {
                    safeWarn(`${PREFIX} development self-test reported failures.`, global.__ARTHHRMS_WORKFLOW_TRACE_STORE_SELF_TEST__);
                }
            } catch (err) {
                global.__ARTHHRMS_WORKFLOW_TRACE_STORE_SELF_TEST__ = Object.freeze({
                    passed: false,
                    tests: Object.freeze(tests.map(test => Object.freeze({ ...test }))),
                    error: err && err.message ? err.message : safeString(err, 'unknown self-test error')
                });
                safeWarn(`${PREFIX} development self-test failed safely.`, global.__ARTHHRMS_WORKFLOW_TRACE_STORE_SELF_TEST__);
            } finally {
                global.WorkflowTelemetryService = previousTelemetry;
            }
        })();
    }
})(typeof window !== 'undefined' ? window : globalThis);
