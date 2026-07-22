/**
 * orchestrationMetricsService.js
 * ARTHHRMS — Orchestration Metrics Foundation Layer
 *
 * PURPOSE:
 * Provides centralized operational metrics aggregation
 * for workflow orchestration visibility.
 *
 * This service tracks:
 * - workflow execution counts
 * - handler execution counts
 * - degraded workflows
 * - escalation frequency
 * - notification routing activity
 * - audit recording activity
 *
 * This service does NOT:
 * - own orchestration
 * - own monitoring systems
 * - own telemetry systems
 * - persist metrics externally
 *
 * ARCHITECTURE RULE:
 * Metrics aggregation must never block workflow execution.
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

    const PREFIX = '[OrchestrationMetricsService]';
    const MAX_METRIC_EVENTS = 500;
    const SEVERITIES = Object.freeze(['INFO', 'WARNING', 'ERROR', 'CRITICAL']);
    const HANDLERS = Object.freeze([
        'auditHandler',
        'telemetryHandler',
        'notificationHandler',
        'pendingActionHandler',
        'escalationHandler'
    ]);
    const BUCKETS = Object.freeze([
        'workflows',
        'handlers',
        'escalations',
        'notifications',
        'audits',
        'degraded',
        'failures'
    ]);

    const metrics = {
        workflows: {},
        handlers: {},
        escalations: {},
        notifications: {},
        audits: {},
        degraded: {},
        failures: {}
    };
    const metricEvents = [];
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

    function normalizeMetricMetadata(metadata) {
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

    function safeMetricKey(value, fallback) {
        const raw = safeString(value, fallback || 'UNKNOWN_METRIC').trim();
        const normalized = raw
            .replace(/[^a-zA-Z0-9_:-]+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '')
            .toUpperCase();
        return normalized || (fallback || 'UNKNOWN_METRIC');
    }

    function safeSeverity(severity) {
        const value = safeMetricKey(severity || 'INFO', 'INFO');
        return SEVERITIES.indexOf(value) !== -1 ? value : 'INFO';
    }

    function nowIso() {
        return new Date().toISOString();
    }

    function makeMetricId() {
        return `MET-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    }

    function ensureCounter(bucket, key) {
        if (!metrics[bucket]) metrics[bucket] = {};
        if (!metrics[bucket][key]) {
            metrics[bucket][key] = {
                count: 0,
                firstSeenAt: '',
                lastSeenAt: '',
                byStatus: {},
                bySeverity: {}
            };
        }
        return metrics[bucket][key];
    }

    function pushMetricEvent(event) {
        metricEvents.push(Object.freeze({
            ...event,
            metadata: Object.freeze(normalizeMetricMetadata(event.metadata))
        }));
        while (metricEvents.length > MAX_METRIC_EVENTS) {
            metricEvents.shift();
        }
    }

    function emitMetricsTelemetry(eventType, metadata, severity) {
        if (telemetryForwarding) return { emitted: false, warning: 'Metrics telemetry skipped to avoid recursion.' };
        const telemetry = global.WorkflowTelemetryService;
        if (!telemetry || typeof telemetry.emitWorkflowTelemetry !== 'function') return { emitted: false, warning: '' };

        try {
            telemetryForwarding = true;
            const result = telemetry.emitWorkflowTelemetry(eventType, {
                source: 'orchestrationMetricsService',
                severity: safeSeverity(severity || metadata.severity || 'INFO'),
                status: metadata.status || 'RECORDED',
                eventId: metadata.eventId || '',
                correlationId: metadata.correlationId || '',
                metadata
            });
            return {
                emitted: !!(result && result.success !== false),
                warning: result && result.warning ? result.warning : ''
            };
        } catch (err) {
            return {
                emitted: false,
                warning: `Metrics telemetry failed safely: ${err && err.message ? err.message : safeString(err, 'unknown telemetry error')}`
            };
        } finally {
            telemetryForwarding = false;
        }
    }

    function incrementMetric(bucket, key, metadata) {
        const safeBucket = BUCKETS.indexOf(bucket) !== -1 ? bucket : 'workflows';
        const metricKey = safeMetricKey(key, 'UNKNOWN_METRIC');
        const meta = normalizeMetricMetadata(metadata);
        const timestamp = nowIso();
        const status = safeMetricKey(meta.status || 'RECORDED', 'RECORDED');
        const severity = safeSeverity(meta.severity || 'INFO');
        const counter = ensureCounter(safeBucket, metricKey);

        counter.count += 1;
        counter.firstSeenAt = counter.firstSeenAt || timestamp;
        counter.lastSeenAt = timestamp;
        counter.byStatus[status] = (counter.byStatus[status] || 0) + 1;
        counter.bySeverity[severity] = (counter.bySeverity[severity] || 0) + 1;
        counter.lastMetadata = normalizeMetricMetadata(meta);

        const metricEvent = {
            metricId: makeMetricId(),
            bucket: safeBucket,
            key: metricKey,
            timestamp,
            status,
            severity,
            metadata: meta
        };
        pushMetricEvent(metricEvent);

        const telemetryResult = emitMetricsTelemetry(
            safeBucket === 'degraded' || safeBucket === 'failures' ? 'ORCHESTRATION_METRIC_ATTENTION' : 'ORCHESTRATION_METRIC_RECORDED',
            {
                metricId: metricEvent.metricId,
                bucket: safeBucket,
                key: metricKey,
                count: counter.count,
                status,
                severity,
                ...meta
            },
            severity
        );

        return {
            success: true,
            bucket: safeBucket,
            key: metricKey,
            count: counter.count,
            eventId: metricEvent.metricId,
            warning: telemetryResult.warning || ''
        };
    }

    function recordWorkflowMetric(type, metadata) {
        try {
            const meta = normalizeMetricMetadata(metadata);
            const key = safeMetricKey(type || meta.type || meta.eventType || 'UNKNOWN_WORKFLOW', 'UNKNOWN_WORKFLOW');
            const result = incrementMetric('workflows', key, {
                ...meta,
                status: meta.status || key,
                severity: meta.severity || (key.indexOf('FAILED') !== -1 ? 'ERROR' : key.indexOf('DEGRADED') !== -1 ? 'WARNING' : 'INFO')
            });

            if (key.indexOf('DEGRADED') !== -1 || meta.degraded === true) {
                incrementMetric('degraded', key, { ...meta, status: 'DEGRADED', severity: 'WARNING' });
            }
            if (key.indexOf('FAILED') !== -1 || key.indexOf('FAILURE') !== -1 || meta.failed === true) {
                incrementMetric('failures', key, { ...meta, status: 'FAILED', severity: 'ERROR' });
            }
            if (key.indexOf('NORMALIZATION') !== -1 && (meta.warningCount || meta.failed)) {
                incrementMetric('failures', 'WORKFLOW_NORMALIZATION_WARNING', { ...meta, status: 'WARNING', severity: 'WARNING' });
            }

            return result;
        } catch (err) {
            return {
                success: false,
                bucket: 'workflows',
                key: 'UNKNOWN_WORKFLOW',
                count: 0,
                eventId: '',
                warning: `Workflow metric failed safely: ${err && err.message ? err.message : safeString(err, 'unknown metric error')}`
            };
        }
    }

    function recordHandlerMetric(handler, status) {
        try {
            const handlerKey = safeMetricKey(handler || 'UNKNOWN_HANDLER', 'UNKNOWN_HANDLER');
            const statusKey = safeMetricKey(status || 'EXECUTED', 'EXECUTED');
            const severity = statusKey === 'FAILED' ? 'ERROR' : statusKey === 'DEGRADED' ? 'WARNING' : 'INFO';
            const result = incrementMetric('handlers', handlerKey, {
                status: statusKey,
                severity,
                handler: handlerKey
            });
            if (statusKey === 'FAILED') {
                incrementMetric('failures', `HANDLER_${handlerKey}`, {
                    status: 'FAILED',
                    severity: 'ERROR',
                    handler: handlerKey
                });
            }
            if (statusKey === 'DEGRADED') {
                incrementMetric('degraded', `HANDLER_${handlerKey}`, {
                    status: 'DEGRADED',
                    severity: 'WARNING',
                    handler: handlerKey
                });
            }
            return result;
        } catch (err) {
            return {
                success: false,
                bucket: 'handlers',
                key: 'UNKNOWN_HANDLER',
                count: 0,
                eventId: '',
                warning: `Handler metric failed safely: ${err && err.message ? err.message : safeString(err, 'unknown handler metric error')}`
            };
        }
    }

    function recordEscalationMetric(type, severity) {
        try {
            return incrementMetric('escalations', type || 'UNKNOWN_ESCALATION', {
                status: 'ESCALATED',
                severity: safeSeverity(severity || 'WARNING'),
                escalationType: safeMetricKey(type || 'UNKNOWN_ESCALATION', 'UNKNOWN_ESCALATION')
            });
        } catch (err) {
            return {
                success: false,
                bucket: 'escalations',
                key: 'UNKNOWN_ESCALATION',
                count: 0,
                eventId: '',
                warning: `Escalation metric failed safely: ${err && err.message ? err.message : safeString(err, 'unknown escalation metric error')}`
            };
        }
    }

    function recordNotificationMetric(type) {
        try {
            return incrementMetric('notifications', type || 'UNKNOWN_NOTIFICATION', {
                status: 'ROUTED',
                severity: 'INFO'
            });
        } catch (err) {
            return {
                success: false,
                bucket: 'notifications',
                key: 'UNKNOWN_NOTIFICATION',
                count: 0,
                eventId: '',
                warning: `Notification metric failed safely: ${err && err.message ? err.message : safeString(err, 'unknown notification metric error')}`
            };
        }
    }

    function recordAuditMetric(type) {
        try {
            const key = safeMetricKey(type || 'UNKNOWN_AUDIT', 'UNKNOWN_AUDIT');
            const severity = key.indexOf('FAIL') !== -1 || key.indexOf('ERROR') !== -1 ? 'ERROR' : key.indexOf('WARNING') !== -1 ? 'WARNING' : 'INFO';
            const result = incrementMetric('audits', key, {
                status: severity === 'ERROR' ? 'FAILED' : 'RECORDED',
                severity
            });
            if (severity === 'ERROR') {
                incrementMetric('failures', `AUDIT_${key}`, {
                    status: 'FAILED',
                    severity: 'ERROR'
                });
            }
            return result;
        } catch (err) {
            return {
                success: false,
                bucket: 'audits',
                key: 'UNKNOWN_AUDIT',
                count: 0,
                eventId: '',
                warning: `Audit metric failed safely: ${err && err.message ? err.message : safeString(err, 'unknown audit metric error')}`
            };
        }
    }

    function cloneCounters(input) {
        const output = {};
        try {
            Object.keys(input || {}).forEach(key => {
                const row = input[key] || {};
                output[key] = {
                    count: row.count || 0,
                    firstSeenAt: row.firstSeenAt || '',
                    lastSeenAt: row.lastSeenAt || '',
                    byStatus: { ...(row.byStatus || {}) },
                    bySeverity: { ...(row.bySeverity || {}) },
                    lastMetadata: normalizeMetricMetadata(row.lastMetadata)
                };
            });
        } catch (e) {}
        return output;
    }

    function getMetricsSnapshot() {
        try {
            return deepFreeze({
                workflows: cloneCounters(metrics.workflows),
                handlers: cloneCounters(metrics.handlers),
                escalations: cloneCounters(metrics.escalations),
                notifications: cloneCounters(metrics.notifications),
                audits: cloneCounters(metrics.audits),
                degraded: cloneCounters(metrics.degraded),
                failures: cloneCounters(metrics.failures),
                recentEvents: metricEvents.map(event => ({
                    ...event,
                    metadata: normalizeMetricMetadata(event.metadata)
                })),
                limits: {
                    maxMetricEvents: MAX_METRIC_EVENTS
                },
                generatedAt: nowIso()
            });
        } catch (err) {
            return deepFreeze({
                workflows: {},
                handlers: {},
                escalations: {},
                notifications: {},
                audits: {},
                degraded: {},
                failures: {},
                recentEvents: [],
                limits: {
                    maxMetricEvents: MAX_METRIC_EVENTS
                },
                generatedAt: nowIso(),
                warning: `Metrics snapshot failed safely: ${err && err.message ? err.message : safeString(err, 'unknown snapshot error')}`
            });
        }
    }

    HANDLERS.forEach(handler => {
        ensureCounter('handlers', safeMetricKey(handler, 'UNKNOWN_HANDLER'));
    });

    if (typeof global.WorkflowTelemetryService === 'undefined') {
        safeWarn(`${PREFIX} Optional dependency window.WorkflowTelemetryService is unavailable. Metrics will remain in memory only.`);
    }

    const OrchestrationMetricsService = Object.freeze({
        recordWorkflowMetric,
        recordHandlerMetric,
        recordEscalationMetric,
        recordNotificationMetric,
        recordAuditMetric,
        getMetricsSnapshot
    });

    global.OrchestrationMetricsService = OrchestrationMetricsService;

    function runSelfTest() {
        const tests = [];
        const record = (name, ok, details) => tests.push(Object.freeze({ name, ok: !!ok, details: details || null }));
        const previousTelemetry = global.WorkflowTelemetryService;

        try {
            global.WorkflowTelemetryService = undefined;
            const original = { status: 'completed', nested: { stable: true } };
            original.self = original;
            const workflow = recordWorkflowMetric('WORKFLOW_COMPLETED', original);
            record('workflow metrics aggregate', workflow.success === true && workflow.count >= 1, workflow);
            record('malformed metadata handled safely', recordWorkflowMetric(Symbol('bad-workflow'), 'bad-metadata').success === true, null);
            record('original metadata never mutated', original.nested.stable === true && original.self === original, null);

            const handlerFailure = recordHandlerMetric('notificationHandler', 'FAILED');
            const degradedWorkflow = recordWorkflowMetric('WORKFLOW_DEGRADED', { warningCount: 2 });
            record('handler failures aggregate', handlerFailure.success === true, handlerFailure);
            record('degraded workflows aggregate', degradedWorkflow.success === true, degradedWorkflow);

            global.WorkflowTelemetryService = {
                emitWorkflowTelemetry() {
                    throw new Error('telemetry down');
                }
            };
            const telemetryFailure = recordAuditMetric('AUDIT_RECORDED');
            record('telemetry failures isolated', telemetryFailure.success === true && /telemetry failed safely/i.test(telemetryFailure.warning), telemetryFailure);

            global.WorkflowTelemetryService = undefined;
            for (let i = 0; i < MAX_METRIC_EVENTS + 5; i += 1) {
                recordNotificationMetric(`NOTIFICATION_${i}`);
            }
            const snapshot = getMetricsSnapshot();
            record('metric eviction works', snapshot.recentEvents.length === MAX_METRIC_EVENTS, { recentEvents: snapshot.recentEvents.length });
            record('immutable snapshots enforced', Object.isFrozen(snapshot) && Object.isFrozen(snapshot.workflows) && Object.isFrozen(snapshot.recentEvents), {
                snapshotFrozen: Object.isFrozen(snapshot),
                workflowsFrozen: Object.isFrozen(snapshot.workflows),
                eventsFrozen: Object.isFrozen(snapshot.recentEvents)
            });
            record('degraded states aggregate', !!snapshot.degraded.WORKFLOW_DEGRADED && snapshot.degraded.WORKFLOW_DEGRADED.count >= 1, snapshot.degraded.WORKFLOW_DEGRADED);
            record('exported APIs are frozen', Object.isFrozen(OrchestrationMetricsService), { frozen: Object.isFrozen(OrchestrationMetricsService) });
        } catch (err) {
            record('self-test has no uncaught failure', false, err && err.message ? err.message : safeString(err, 'unknown self-test error'));
        } finally {
            global.WorkflowTelemetryService = previousTelemetry;
        }

        const report = Object.freeze({
            passed: tests.every(test => test.ok),
            tests: Object.freeze(tests)
        });

        try {
            global.__ARTHHRMS_ORCHESTRATION_METRICS_SELF_TEST__ = report;
        } catch (e) {}

        if (report.passed) safeInfo(`${PREFIX} Development self-test passed.`, report);
        else safeWarn(`${PREFIX} Development self-test failed.`, report);
    }

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
