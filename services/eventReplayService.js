/**
 * eventReplayService.js
 * ARTHHRMS — Event Replay + Incident Inspection Foundation
 *
 * PURPOSE:
 * Provides safe operational workflow replay visibility
 * for debugging, incident inspection, and orchestration analysis.
 *
 * This service allows:
 * - workflow reconstruction
 * - handler execution inspection
 * - failure chain visibility
 * - orchestration debugging
 *
 * This service does NOT:
 * - mutate production state
 * - dispatch notifications
 * - write audits
 * - replay external side effects
 *
 * ARCHITECTURE RULE:
 * Replay execution must remain isolated from live workflow execution.
 *
 * STABILITY:
 * Replay mode must never affect live orchestration state.
 *
 * DEPENDS ON:
 * - window.WorkflowTraceStore (optional)
 * - window.WorkflowTelemetryService (optional)
 * - window.WorkflowEventSchema (optional)
 *
 * @version 1.0.0
 */
(function (global) {
    'use strict';

    const PREFIX = '[EventReplayService]';
    const HANDLER_ORDER = Object.freeze([
        'auditHandler',
        'telemetryHandler',
        'notificationHandler',
        'pendingActionHandler',
        'escalationHandler'
    ]);
    const INCIDENT_CLASSIFICATIONS = Object.freeze({
        WORKFLOW_FAILURE: 'WORKFLOW_FAILURE',
        DEGRADED_EXECUTION: 'DEGRADED_EXECUTION',
        HANDLER_FAILURE: 'HANDLER_FAILURE',
        SLA_RISK: 'SLA_RISK',
        ESCALATION_RISK: 'ESCALATION_RISK',
        NOTIFICATION_FAILURE: 'NOTIFICATION_FAILURE'
    });
    const REPLAY_SUPPRESSION_FLAGS = Object.freeze({
        replayMode: true,
        skipPersistence: true,
        suppressNotification: true,
        suppressAudit: true,
        suppressPendingAction: true,
        suppressEscalation: true,
        suppressExternalChannels: true
    });

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
        if (Array.isArray(value)) return value.map(item => cloneValue(item, refs.slice()));
        if (value instanceof Date) return new Date(value.getTime()).toISOString();
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

    function cloneReplayPayload(payload) {
        return isPlainObject(payload) ? cloneValue(payload, []) : {};
    }

    function safeMetadata(metadata) {
        return isPlainObject(metadata) ? cloneValue(metadata, []) : {};
    }

    function deepFreeze(value, seen) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        const refs = seen || [];
        if (refs.indexOf(value) !== -1) return value;
        refs.push(value);
        try {
            Object.keys(value).forEach(key => deepFreeze(value[key], refs));
            Object.freeze(value);
        } catch (e) {}
        return value;
    }

    function freezeReplayOutput(output) {
        return deepFreeze(output);
    }

    function safeReplayWarning(warningCode, message, metadata) {
        return {
            warningCode: safeString(warningCode || 'REPLAY_WARNING', 'REPLAY_WARNING'),
            message: safeString(message || 'Replay warning.', 'Replay warning.'),
            metadata: safeMetadata(metadata)
        };
    }

    function normalizeReplayContext(options) {
        const supplied = cloneReplayPayload(options);
        return {
            ...supplied,
            ...REPLAY_SUPPRESSION_FLAGS
        };
    }

    function normalizeReplayEvent(event) {
        const input = cloneReplayPayload(event);
        const metadata = safeMetadata(input.metadata);
        const eventId = safeString(input.eventId || metadata.eventId || input.id || '', '').trim();
        const correlationId = safeString(input.correlationId || metadata.correlationId || eventId || '', '').trim();
        const type = safeString(input.type || input.eventType || metadata.eventType || 'UNKNOWN_WORKFLOW_EVENT', 'UNKNOWN_WORKFLOW_EVENT').trim() || 'UNKNOWN_WORKFLOW_EVENT';
        return {
            ...input,
            ...REPLAY_SUPPRESSION_FLAGS,
            eventId,
            correlationId,
            type,
            eventType: type,
            source: safeString(input.source || metadata.source || 'eventReplayService', 'eventReplayService'),
            severity: safeString(input.severity || metadata.severity || 'INFO', 'INFO').toUpperCase(),
            metadata: {
                ...metadata,
                eventId,
                correlationId,
                replayMode: true
            }
        };
    }

    function timeValue(timestamp) {
        try {
            const value = new Date(timestamp).getTime();
            return Number.isNaN(value) ? 0 : value;
        } catch (e) {
            return 0;
        }
    }

    function cloneTrace(trace) {
        const row = cloneReplayPayload(trace);
        row.metadata = safeMetadata(row.metadata);
        return row;
    }

    function traceStore() {
        try {
            return global.WorkflowTraceStore || null;
        } catch (e) {
            return null;
        }
    }

    function telemetryStore() {
        try {
            return global.WorkflowTelemetryService || null;
        } catch (e) {
            return null;
        }
    }

    function getTracesByEventId(eventId, warnings) {
        const store = traceStore();
        if (!store || typeof store.getTraceByEventId !== 'function') {
            warnings.push(safeReplayWarning('TRACE_STORE_UNAVAILABLE', 'WorkflowTraceStore is unavailable. Replay continued without trace history.'));
            return [];
        }
        try {
            return Array.prototype.slice.call(store.getTraceByEventId(eventId) || []).map(cloneTrace);
        } catch (err) {
            warnings.push(safeReplayWarning('TRACE_LOOKUP_FAILED', `Trace lookup failed safely: ${err && err.message ? err.message : safeString(err, 'unknown trace error')}`, { eventId }));
            return [];
        }
    }

    function getTracesByCorrelationId(correlationId, warnings) {
        const store = traceStore();
        if (!store || typeof store.getTraceByCorrelationId !== 'function') {
            warnings.push(safeReplayWarning('TRACE_STORE_UNAVAILABLE', 'WorkflowTraceStore is unavailable. Incident inspection continued without trace history.'));
            return [];
        }
        try {
            return Array.prototype.slice.call(store.getTraceByCorrelationId(correlationId) || []).map(cloneTrace);
        } catch (err) {
            warnings.push(safeReplayWarning('TRACE_CORRELATION_LOOKUP_FAILED', `Trace correlation lookup failed safely: ${err && err.message ? err.message : safeString(err, 'unknown trace error')}`, { correlationId }));
            return [];
        }
    }

    function getTelemetryByCorrelationId(correlationId, warnings) {
        const telemetry = telemetryStore();
        if (!telemetry || typeof telemetry.getRecentTelemetry !== 'function') {
            return [];
        }
        try {
            return Array.prototype.slice.call(telemetry.getRecentTelemetry() || [])
                .filter(row => safeString(row.correlationId || row.metadata?.correlationId || '', '') === correlationId)
                .map(row => {
                    const copy = cloneReplayPayload(row);
                    copy.metadata = safeMetadata(copy.metadata);
                    return copy;
                });
        } catch (err) {
            warnings.push(safeReplayWarning('TELEMETRY_LOOKUP_FAILED', `Telemetry inspection failed safely: ${err && err.message ? err.message : safeString(err, 'unknown telemetry error')}`, { correlationId }));
            return [];
        }
    }

    function getAuditsByCorrelationId(correlationId, warnings) {
        try {
            const database = global.DB || null;
            const data = database && typeof database.get === 'function' ? database.get() : {};
            return Array.prototype.slice.call(data.auditLogs || [])
                .filter(row => safeString(row.correlationId || row.metadata?.correlationId || '', '') === correlationId)
                .map(row => {
                    const copy = cloneReplayPayload(row);
                    copy.metadata = safeMetadata(copy.metadata);
                    return copy;
                });
        } catch (err) {
            warnings.push(safeReplayWarning('AUDIT_INSPECTION_FAILED', `Audit inspection failed safely: ${err && err.message ? err.message : safeString(err, 'unknown audit error')}`, { correlationId }));
            return [];
        }
    }

    function getMetricsSnapshot(warnings) {
        try {
            const service = global.OrchestrationMetricsService || null;
            if (!service || typeof service.getMetricsSnapshot !== 'function') return null;
            return cloneReplayPayload(service.getMetricsSnapshot());
        } catch (err) {
            warnings.push(safeReplayWarning('METRICS_INSPECTION_FAILED', `Metrics inspection failed safely: ${err && err.message ? err.message : safeString(err, 'unknown metrics error')}`));
            return null;
        }
    }

    function sortTimelineRows(rows) {
        return rows.slice().sort((a, b) => {
            const delta = timeValue(a.timestamp) - timeValue(b.timestamp);
            if (delta !== 0) return delta;
            return safeString(a.eventType || '', '').localeCompare(safeString(b.eventType || '', ''));
        });
    }

    function timelineFromTraces(traces) {
        return sortTimelineRows(traces.map(trace => ({
            eventId: safeString(trace.eventId || '', ''),
            correlationId: safeString(trace.correlationId || '', ''),
            eventType: safeString(trace.eventType || trace.type || 'UNKNOWN_TRACE', 'UNKNOWN_TRACE'),
            handler: safeString(trace.handler || 'UNKNOWN_HANDLER', 'UNKNOWN_HANDLER'),
            status: safeString(trace.status || 'RECORDED', 'RECORDED'),
            severity: safeString(trace.severity || 'INFO', 'INFO'),
            timestamp: safeString(trace.timestamp || '', ''),
            metadata: safeMetadata(trace.metadata)
        })));
    }

    function classifyTimeline(timeline) {
        const classifications = [];
        timeline.forEach(row => {
            const eventType = safeString(row.eventType || '', '').toUpperCase();
            const status = safeString(row.status || '', '').toUpperCase();
            const handler = safeString(row.handler || '', '');
            if (eventType.indexOf('FAILED_SAFE') !== -1 || status.indexOf('FAILED_SAFE') !== -1) classifications.push(INCIDENT_CLASSIFICATIONS.WORKFLOW_FAILURE);
            if (eventType.indexOf('DEGRADED') !== -1 || status.indexOf('DEGRADED') !== -1) classifications.push(INCIDENT_CLASSIFICATIONS.DEGRADED_EXECUTION);
            if (eventType.indexOf('HANDLER_EXECUTION_FAILED') !== -1 || (handler && status.indexOf('FAILED') !== -1)) classifications.push(INCIDENT_CLASSIFICATIONS.HANDLER_FAILURE);
            if (eventType.indexOf('ESCALATION') !== -1 || status.indexOf('ESCALATION') !== -1) classifications.push(INCIDENT_CLASSIFICATIONS.ESCALATION_RISK);
            if (eventType.indexOf('NOTIFICATION') !== -1 && status.indexOf('FAILED') !== -1) classifications.push(INCIDENT_CLASSIFICATIONS.NOTIFICATION_FAILURE);
            if (eventType.indexOf('SLA') !== -1) classifications.push(INCIDENT_CLASSIFICATIONS.SLA_RISK);
        });
        return Array.from(new Set(classifications));
    }

    function reconstructExecutionTimeline(eventId) {
        const warnings = [];
        try {
            const safeEventId = safeString(eventId || '', '').trim();
            if (!safeEventId) {
                warnings.push(safeReplayWarning('EVENT_ID_REQUIRED', 'Event ID is required for timeline reconstruction.'));
                return freezeReplayOutput({
                    success: false,
                    eventId: '',
                    timeline: [],
                    classifications: [],
                    warnings
                });
            }

            const traces = getTracesByEventId(safeEventId, warnings);
            const timeline = timelineFromTraces(traces);
            return freezeReplayOutput({
                success: true,
                eventId: safeEventId,
                timeline,
                classifications: classifyTimeline(timeline),
                warnings
            });
        } catch (err) {
            return freezeReplayOutput({
                success: false,
                eventId: safeString(eventId || '', ''),
                timeline: [],
                classifications: [],
                warnings: [safeReplayWarning('TIMELINE_RECONSTRUCTION_FAILED', `Timeline reconstruction failed safely: ${err && err.message ? err.message : safeString(err, 'unknown timeline error')}`)]
            });
        }
    }

    function replayWorkflowEvent(event, options) {
        const warnings = [];
        try {
            const originalEvent = cloneReplayPayload(event);
            if (!isPlainObject(event)) {
                warnings.push(safeReplayWarning('MALFORMED_REPLAY_EVENT', 'Malformed replay event normalized safely.'));
            }
            const replayEvent = normalizeReplayEvent(event);
            const context = normalizeReplayContext(options);
            const timelineResult = replayEvent.eventId ? reconstructExecutionTimeline(replayEvent.eventId) : freezeReplayOutput({ success: true, eventId: '', timeline: [], classifications: [], warnings: [] });
            const replayHandlers = HANDLER_ORDER.map(handler => ({
                handler,
                status: 'SUPPRESSED_READ_ONLY',
                sideEffectsSuppressed: true,
                wouldInspect: true
            }));

            const timelineWarnings = Array.prototype.slice.call(timelineResult.warnings || []);
            return freezeReplayOutput({
                success: true,
                replayMode: true,
                readOnly: true,
                sideEffectsSuppressed: true,
                event: replayEvent,
                originalEvent,
                context,
                handlers: replayHandlers,
                reconstructedTimeline: Array.prototype.slice.call(timelineResult.timeline || []),
                classifications: Array.prototype.slice.call(timelineResult.classifications || []),
                warnings: warnings.concat(timelineWarnings),
                safety: {
                    dispatchNotifications: false,
                    writeAudits: false,
                    createPendingActions: false,
                    mutateDatabase: false,
                    emitEscalationSideEffects: false,
                    triggerExternalChannels: false
                }
            });
        } catch (err) {
            return freezeReplayOutput({
                success: false,
                replayMode: true,
                readOnly: true,
                sideEffectsSuppressed: true,
                event: normalizeReplayEvent({}),
                originalEvent: {},
                context: normalizeReplayContext(options),
                handlers: [],
                reconstructedTimeline: [],
                classifications: [INCIDENT_CLASSIFICATIONS.WORKFLOW_FAILURE],
                warnings: [safeReplayWarning('REPLAY_FAILED_SAFE', `Replay inspection failed safely: ${err && err.message ? err.message : safeString(err, 'unknown replay error')}`)],
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
    }

    function inspectIncident(correlationId) {
        const warnings = [];
        try {
            const safeCorrelationId = safeString(correlationId || '', '').trim();
            if (!safeCorrelationId) {
                warnings.push(safeReplayWarning('CORRELATION_ID_REQUIRED', 'Correlation ID is required for incident inspection.'));
            }
            const traces = safeCorrelationId ? getTracesByCorrelationId(safeCorrelationId, warnings) : [];
            const audits = safeCorrelationId ? getAuditsByCorrelationId(safeCorrelationId, warnings) : [];
            const telemetry = safeCorrelationId ? getTelemetryByCorrelationId(safeCorrelationId, warnings) : [];
            const metrics = getMetricsSnapshot(warnings);
            const reconstructedTimeline = timelineFromTraces(traces);

            return freezeReplayOutput({
                success: true,
                correlationId: safeCorrelationId,
                traces,
                audits,
                telemetry,
                metrics,
                warnings,
                reconstructedTimeline,
                classifications: classifyTimeline(reconstructedTimeline)
            });
        } catch (err) {
            return freezeReplayOutput({
                success: false,
                correlationId: safeString(correlationId || '', ''),
                traces: [],
                audits: [],
                telemetry: [],
                metrics: null,
                warnings: [safeReplayWarning('INCIDENT_INSPECTION_FAILED', `Incident inspection failed safely: ${err && err.message ? err.message : safeString(err, 'unknown incident error')}`)],
                reconstructedTimeline: [],
                classifications: [INCIDENT_CLASSIFICATIONS.WORKFLOW_FAILURE]
            });
        }
    }

    if (typeof global.WorkflowTraceStore === 'undefined') {
        safeWarn(`${PREFIX} Optional dependency window.WorkflowTraceStore is unavailable. Replay inspection will degrade safely.`);
    }

    if (typeof global.WorkflowTelemetryService === 'undefined') {
        safeWarn(`${PREFIX} Optional dependency window.WorkflowTelemetryService is unavailable. Telemetry inspection will degrade safely.`);
    }

    if (typeof global.WorkflowEventSchema === 'undefined') {
        safeWarn(`${PREFIX} Optional dependency window.WorkflowEventSchema is unavailable. Replay normalization will use supplied event fields.`);
    }

    const EventReplayService = Object.freeze({
        CLASSIFICATIONS: INCIDENT_CLASSIFICATIONS,
        replayWorkflowEvent,
        inspectIncident,
        reconstructExecutionTimeline,
        cloneReplayPayload,
        freezeReplayOutput,
        safeReplayWarning,
        normalizeReplayContext
    });

    global.EventReplayService = EventReplayService;

    function runSelfTest() {
        const tests = [];
        const record = (name, ok, details) => tests.push(Object.freeze({ name, ok: !!ok, details: details || null }));
        const previousTraceStore = global.WorkflowTraceStore;
        const previousTelemetry = global.WorkflowTelemetryService;
        const previousDB = global.DB;
        const previousMetrics = global.OrchestrationMetricsService;

        try {
            const liveState = { notifications: [], auditLogs: [], pendingActions: [], workflowEvents: [] };
            global.DB = {
                get() {
                    return liveState;
                }
            };
            const traces = [
                {
                    traceId: 'TRACE-2',
                    correlationId: 'CORR-REPLAY-SELF',
                    eventId: 'WF-REPLAY-SELF',
                    eventType: 'HANDLER_EXECUTION_STARTED',
                    handler: 'auditHandler',
                    status: 'STARTED',
                    severity: 'INFO',
                    timestamp: '2026-05-19T10:00:02.000Z',
                    metadata: {}
                },
                {
                    traceId: 'TRACE-1',
                    correlationId: 'CORR-REPLAY-SELF',
                    eventId: 'WF-REPLAY-SELF',
                    eventType: 'WORKFLOW_RECEIVED',
                    handler: 'orchestrator',
                    status: 'RECEIVED',
                    severity: 'INFO',
                    timestamp: '2026-05-19T10:00:01.000Z',
                    metadata: {}
                },
                {
                    traceId: 'TRACE-3',
                    correlationId: 'CORR-REPLAY-SELF',
                    eventId: 'WF-REPLAY-SELF',
                    eventType: 'HANDLER_EXECUTION_FAILED',
                    handler: 'notificationHandler',
                    status: 'FAILED',
                    severity: 'ERROR',
                    timestamp: '2026-05-19T10:00:03.000Z',
                    metadata: {}
                },
                {
                    traceId: 'TRACE-4',
                    correlationId: 'CORR-REPLAY-SELF',
                    eventId: 'WF-REPLAY-SELF',
                    eventType: 'WORKFLOW_DEGRADED',
                    handler: 'orchestrator',
                    status: 'DEGRADED',
                    severity: 'WARNING',
                    timestamp: '2026-05-19T10:00:04.000Z',
                    metadata: {}
                }
            ];
            global.WorkflowTraceStore = {
                getTraceByEventId(eventId) {
                    if (eventId === 'THROW_TRACE') throw new Error('trace down');
                    return traces.filter(row => row.eventId === eventId);
                },
                getTraceByCorrelationId(correlationId) {
                    return traces.filter(row => row.correlationId === correlationId);
                }
            };
            global.WorkflowTelemetryService = {
                getRecentTelemetry() {
                    return [{
                        telemetryId: 'TEL-1',
                        correlationId: 'CORR-REPLAY-SELF',
                        eventId: 'WF-REPLAY-SELF',
                        eventType: 'WORKFLOW_TELEMETRY',
                        metadata: {}
                    }];
                },
                emitWorkflowTelemetry() {
                    throw new Error('replay must not emit telemetry');
                }
            };
            liveState.auditLogs.push({
                id: 'AL0001',
                correlationId: 'CORR-REPLAY-SELF',
                eventId: 'WF-REPLAY-SELF',
                metadata: { correlationId: 'CORR-REPLAY-SELF' }
            });
            global.OrchestrationMetricsService = {
                getMetricsSnapshot() {
                    return { workflows: { WORKFLOW_DEGRADED: { count: 1 } }, recentEvents: [] };
                }
            };

            const original = {
                eventId: 'WF-REPLAY-SELF',
                correlationId: 'CORR-REPLAY-SELF',
                type: 'GENERIC_NOTIFICATION',
                suppressAudit: false,
                metadata: { stable: true }
            };
            const before = JSON.stringify(original);
            const replay = replayWorkflowEvent(original, { custom: true });
            record(
                'replay mode suppresses side effects',
                replay.success === true &&
                    replay.replayMode === true &&
                    replay.event.suppressNotification === true &&
                    replay.event.suppressAudit === true &&
                    replay.handlers.every(row => row.status === 'SUPPRESSED_READ_ONLY') &&
                    liveState.notifications.length === 0 &&
                    liveState.pendingActions.length === 0,
                replay.safety
            );
            record('replay never mutates live input', JSON.stringify(original) === before, original);
            record('replay outputs are immutable', Object.isFrozen(replay) && Object.isFrozen(replay.handlers) && Object.isFrozen(replay.event), {
                replayFrozen: Object.isFrozen(replay),
                handlersFrozen: Object.isFrozen(replay.handlers),
                eventFrozen: Object.isFrozen(replay.event)
            });

            const incident = inspectIncident('CORR-REPLAY-SELF');
            record(
                'incident reconstruction works',
                incident.success === true &&
                    incident.traces.length === 4 &&
                    incident.audits.length === 1 &&
                    incident.telemetry.length === 1 &&
                    incident.metrics.workflows.WORKFLOW_DEGRADED.count === 1,
                incident
            );
            record(
                'degraded execution reconstruction works',
                incident.classifications.indexOf(INCIDENT_CLASSIFICATIONS.DEGRADED_EXECUTION) !== -1 &&
                    incident.classifications.indexOf(INCIDENT_CLASSIFICATIONS.HANDLER_FAILURE) !== -1,
                incident.classifications
            );

            const timeline = reconstructExecutionTimeline('WF-REPLAY-SELF');
            record(
                'timeline ordering works',
                timeline.success === true &&
                    timeline.timeline.length === 4 &&
                    timeline.timeline[0].eventType === 'WORKFLOW_RECEIVED' &&
                    timeline.timeline[3].eventType === 'WORKFLOW_DEGRADED',
                timeline.timeline
            );

            const malformed = replayWorkflowEvent(Symbol('bad-event'), {});
            record(
                'malformed payloads handled safely',
                malformed.success === true &&
                    malformed.warnings.some(row => row.warningCode === 'MALFORMED_REPLAY_EVENT'),
                malformed.warnings
            );

            global.WorkflowTraceStore = undefined;
            global.WorkflowTelemetryService = undefined;
            global.DB = undefined;
            global.OrchestrationMetricsService = undefined;
            const missingDeps = inspectIncident('CORR-MISSING');
            record(
                'dependency absence is safe',
                missingDeps.success === true &&
                    missingDeps.traces.length === 0 &&
                    missingDeps.warnings.some(row => row.warningCode === 'TRACE_STORE_UNAVAILABLE'),
                missingDeps
            );
        } catch (err) {
            record('self-test has no uncaught failure', false, err && err.message ? err.message : safeString(err, 'unknown self-test error'));
        } finally {
            global.WorkflowTraceStore = previousTraceStore;
            global.WorkflowTelemetryService = previousTelemetry;
            global.DB = previousDB;
            global.OrchestrationMetricsService = previousMetrics;
        }

        const report = Object.freeze({
            passed: tests.every(test => test.ok),
            tests: Object.freeze(tests)
        });
        try {
            global.__ARTHHRMS_EVENT_REPLAY_SELF_TEST__ = report;
        } catch (e) {}
        if (report.passed) safeInfo(`${PREFIX} Development self-test passed.`, report);
        else safeWarn(`${PREFIX} Development self-test failed.`, report);
    }

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
