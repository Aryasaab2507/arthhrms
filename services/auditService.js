/**
 * auditService.js
 * ARTHHRMS — Operational Audit Intelligence Layer
 *
 * PURPOSE:
 * Provides centralized workflow audit recording independent
 * from workflow orchestration internals.
 *
 * This service records:
 * - workflow audit history
 * - operational actions
 * - approval decisions
 * - workflow transitions
 * - orchestration execution visibility
 *
 * This service does NOT:
 * - own orchestration
 * - own telemetry systems
 * - own monitoring systems
 *
 * ARCHITECTURE RULE:
 * Audit recording must remain isolated from orchestration.
 *
 * STABILITY:
 * Existing audit behavior must remain compatible.
 *
 * DEPENDS ON:
 * - window.WorkflowTelemetryService (optional)
 * - window.WorkflowTraceStore (optional)
 *
 * @version 1.0.0
 */
(function (global) {
    'use strict';

    const PREFIX = '[AuditService]';
    const SEVERITIES = Object.freeze(['INFO', 'WARNING', 'ERROR', 'CRITICAL']);
    let telemetryForwarding = false;
    let traceForwarding = false;

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

    function db() {
        try {
            return global.DB || null;
        } catch (e) {
            return null;
        }
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

    function safeSeverity(severity) {
        const value = safeString(severity || 'INFO', 'INFO')
            .trim()
            .replace(/[\s-]+/g, '_')
            .toUpperCase();
        return SEVERITIES.indexOf(value) !== -1 ? value : 'INFO';
    }

    function normalizeSource(source) {
        const value = safeString(source || 'workflowEngine', 'workflowEngine').trim();
        return value || 'workflowEngine';
    }

    function normalizeActionType(event, metadata) {
        const actionType = event.actionType || metadata.actionType || event.action || event.type || event.eventType || 'workflow event';
        return safeString(actionType, 'workflow event').trim() || 'workflow event';
    }

    function normalizeActorRole(event, metadata) {
        return safeString(event.actorRole || event.role || metadata.actorRole || metadata.role || 'system', 'system').trim() || 'system';
    }

    function normalizeActorId(event, metadata) {
        return safeString(event.actorId || metadata.actorId || event.userId || metadata.userId || '', '').trim();
    }

    function normalizeEmployeeId(event, metadata) {
        return safeString(
            event.employeeId || event.empId || event.targetEmpId || metadata.employeeId || metadata.empId || metadata.targetEmpId || '',
            ''
        ).trim();
    }

    function normalizeModule(event, metadata) {
        return safeString(event.module || metadata.module || 'Workflow', 'Workflow').trim() || 'Workflow';
    }

    function normalizeTargetId(event, metadata) {
        return safeString(event.targetId || event.recordId || metadata.targetId || metadata.recordId || '', '').trim();
    }

    function normalizeDescription(event, metadata, actionType) {
        return safeString(event.description || event.message || event.title || metadata.description || metadata.message || actionType, actionType).trim() || actionType;
    }

    function generateAuditId() {
        return `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    }

    function normalizeAudit(eventInput, contextInput) {
        const event = isPlainObject(eventInput) ? cloneValue(eventInput, []) : {};
        const context = isPlainObject(contextInput) ? cloneValue(contextInput, []) : {};
        const metadata = safeMetadata(event.metadata);
        const contextMetadata = safeMetadata(context.metadata);
        const actionType = normalizeActionType(event, metadata);
        const module = normalizeModule(event, metadata);
        const targetId = normalizeTargetId(event, metadata);
        const actorId = normalizeActorId(event, metadata);
        const employeeId = normalizeEmployeeId(event, metadata);
        const eventId = safeString(event.eventId || metadata.eventId || context.eventId || contextMetadata.eventId || '', '').trim();
        const correlationId = safeString(event.correlationId || metadata.correlationId || context.correlationId || contextMetadata.correlationId || eventId, '').trim();
        const source = normalizeSource(event.source || metadata.source || context.source || contextMetadata.source);
        const severity = safeSeverity(event.severity || metadata.severity || context.severity || contextMetadata.severity);
        const description = normalizeDescription(event, metadata, actionType);
        const auditId = safeString(event.auditId || metadata.auditId || context.auditId || contextMetadata.auditId || generateAuditId(), '').trim() || generateAuditId();

        return {
            auditId,
            eventId,
            correlationId,
            eventType: safeString(event.type || event.eventType || metadata.eventType || actionType, actionType).trim() || actionType,
            actorId,
            employeeId,
            source,
            severity,
            timestamp: safeString(event.timestamp || event.createdAt || context.timestamp || new Date().toISOString(), new Date().toISOString()),
            metadata: deepFreeze({
                ...contextMetadata,
                ...metadata,
                eventId,
                correlationId,
                source,
                severity,
                actorRole: normalizeActorRole(event, metadata),
                actionType,
                module,
                targetId,
                description
            })
        };
    }

    function decorateAuditRow(row, audit) {
        if (!row || !isPlainObject(row)) return row;
        try {
            row.auditId = row.auditId || row.id || row.logId || audit.auditId;
            row.eventId = row.eventId || audit.eventId;
            row.correlationId = row.correlationId || audit.correlationId;
            row.eventType = row.eventType || audit.eventType;
            row.source = row.source || audit.source;
            row.severity = row.severity || audit.severity;
            row.employeeId = row.employeeId || audit.employeeId;
            row.metadata = safeMetadata(audit.metadata);
        } catch (e) {}
        return row;
    }

    function persistAudit(audit, context) {
        const database = db();
        if (context && context.skipPersistence) {
            return {
                recorded: false,
                warning: 'Audit persistence skipped by execution context.',
                row: null
            };
        }

        if (!database || typeof database.writeAuditLog !== 'function') {
            return {
                recorded: false,
                warning: 'DB.writeAuditLog is unavailable. Audit normalized without persistence.',
                row: null
            };
        }

        try {
            const metadata = safeMetadata(audit.metadata);
            const row = database.writeAuditLog(
                metadata.actorRole || 'system',
                audit.actorId || '',
                metadata.actionType || audit.eventType || 'workflow event',
                metadata.module || 'Workflow',
                metadata.targetId || '',
                metadata.description || metadata.actionType || audit.eventType || 'workflow event'
            );
            decorateAuditRow(row, audit);
            return {
                recorded: !!row,
                warning: row ? '' : 'DB.writeAuditLog returned no audit row.',
                row
            };
        } catch (err) {
            return {
                recorded: false,
                warning: `Audit persistence failed safely: ${err && err.message ? err.message : safeString(err, 'unknown audit persistence error')}`,
                row: null
            };
        }
    }

    function recordAuditTrace(audit) {
        if (traceForwarding) return { recorded: false, warning: 'Trace recording skipped to avoid recursion.' };
        const traceStore = global.WorkflowTraceStore;
        if (!traceStore || typeof traceStore.recordTrace !== 'function') return { recorded: false, warning: '' };

        try {
            traceForwarding = true;
            const result = traceStore.recordTrace({
                correlationId: audit.correlationId,
                eventId: audit.eventId,
                eventType: 'AUDIT_RECORDED',
                source: 'auditService',
                handler: 'auditService',
                status: 'RECORDED',
                severity: audit.severity,
                metadata: {
                    auditId: audit.auditId,
                    module: audit.metadata.module || '',
                    actionType: audit.metadata.actionType || ''
                }
            });
            return {
                recorded: !!(result && result.success !== false),
                warning: result && result.warning ? result.warning : ''
            };
        } catch (err) {
            return {
                recorded: false,
                warning: `Audit trace recording failed safely: ${err && err.message ? err.message : safeString(err, 'unknown trace error')}`
            };
        } finally {
            traceForwarding = false;
        }
    }

    function emitAuditTelemetry(audit, recorded) {
        if (telemetryForwarding) return { emitted: false, warning: 'Telemetry skipped to avoid recursion.' };
        const telemetry = global.WorkflowTelemetryService;
        if (!telemetry || typeof telemetry.emitWorkflowTelemetry !== 'function') return { emitted: false, warning: '' };

        try {
            telemetryForwarding = true;
            const result = telemetry.emitWorkflowTelemetry('AUDIT_RECORDED', {
                source: 'auditService',
                severity: audit.severity,
                status: recorded ? 'RECORDED' : 'NORMALIZED',
                eventId: audit.eventId,
                correlationId: audit.correlationId,
                metadata: {
                    auditId: audit.auditId,
                    module: audit.metadata.module || '',
                    actionType: audit.metadata.actionType || ''
                }
            });
            return {
                emitted: !!(result && result.success !== false),
                warning: result && result.warning ? result.warning : ''
            };
        } catch (err) {
            return {
                emitted: false,
                warning: `Audit telemetry failed safely: ${err && err.message ? err.message : safeString(err, 'unknown telemetry error')}`
            };
        } finally {
            telemetryForwarding = false;
        }
    }

    function mergeWarnings() {
        const warnings = [];
        for (let i = 0; i < arguments.length; i += 1) {
            const warning = arguments[i];
            if (warning) warnings.push(warning);
        }
        return warnings.join(' ');
    }

    function recordAudit(event, context) {
        try {
            const audit = normalizeAudit(event, context);
            const persistResult = persistAudit(audit, context || {});
            const traceResult = recordAuditTrace(audit);
            const telemetryResult = emitAuditTelemetry(audit, persistResult.recorded);
            const row = persistResult.row || null;
            const returnedAudit = row || deepFreeze({
                ...audit,
                metadata: safeMetadata(audit.metadata)
            });

            return {
                success: true,
                auditId: row?.id || row?.logId || row?.auditId || audit.auditId,
                recorded: !!persistResult.recorded,
                warning: mergeWarnings(persistResult.warning, traceResult.warning, telemetryResult.warning),
                audit: returnedAudit
            };
        } catch (err) {
            return {
                success: false,
                auditId: '',
                recorded: false,
                warning: `Audit recording failed safely: ${err && err.message ? err.message : safeString(err, 'unknown audit error')}`,
                audit: null
            };
        }
    }

    if (typeof global.WorkflowTelemetryService === 'undefined') {
        safeWarn(`${PREFIX} Optional dependency window.WorkflowTelemetryService is unavailable. Audit telemetry will degrade safely.`);
    }

    if (typeof global.WorkflowTraceStore === 'undefined') {
        safeWarn(`${PREFIX} Optional dependency window.WorkflowTraceStore is unavailable. Audit trace continuity will degrade safely.`);
    }

    const AuditService = Object.freeze({
        recordAudit,
        normalizeAudit,
        generateAuditId,
        safeSeverity,
        safeMetadata
    });

    global.AuditService = AuditService;

    function runSelfTest() {
        const tests = [];
        const record = (name, ok, details) => tests.push(Object.freeze({ name, ok: !!ok, details: details || null }));
        const previousDB = global.DB;
        const previousTelemetry = global.WorkflowTelemetryService;
        const previousTraceStore = global.WorkflowTraceStore;

        try {
            const store = { auditLogs: [] };
            global.DB = {
                writeAuditLog(actorRole, actorId, actionType, module, targetId, description) {
                    const row = {
                        id: `AL${String(store.auditLogs.length + 1).padStart(4, '0')}`,
                        date: new Date().toISOString(),
                        actorRole,
                        actorId,
                        actionType,
                        module,
                        targetId,
                        description
                    };
                    store.auditLogs.unshift(row);
                    return row;
                }
            };
            global.WorkflowTelemetryService = undefined;
            global.WorkflowTraceStore = undefined;

            const original = {
                eventId: 'WF-AUDIT-SELF',
                correlationId: 'CORR-AUDIT-SELF',
                type: 'LEAVE_APPROVED',
                actorRole: 'manager',
                actorId: 'EMP001',
                module: 'Leave',
                targetId: 'LV001',
                message: 'Leave approved.',
                metadata: { stable: true }
            };
            const before = JSON.stringify(original);
            const recorded = recordAudit(original, {});
            record(
                'audit records correctly',
                recorded.success === true &&
                    recorded.recorded === true &&
                    recorded.audit.id === 'AL0001' &&
                    recorded.audit.metadata.eventId === 'WF-AUDIT-SELF',
                recorded
            );
            record('workflow events are never mutated', JSON.stringify(original) === before, original);

            const malformed = recordAudit(Symbol('bad-audit'), { skipPersistence: true });
            record(
                'malformed events handled safely',
                malformed.success === true &&
                    malformed.recorded === false &&
                    malformed.audit &&
                    malformed.audit.eventType === 'workflow event',
                malformed
            );

            global.WorkflowTelemetryService = {
                emitWorkflowTelemetry() {
                    throw new Error('telemetry down');
                }
            };
            const telemetryFailure = recordAudit({ eventId: 'WF-TEL-FAIL', type: 'GENERIC_NOTIFICATION' }, { skipPersistence: true });
            record(
                'telemetry failures isolated',
                telemetryFailure.success === true && /telemetry failed safely/i.test(telemetryFailure.warning),
                telemetryFailure
            );

            global.WorkflowTraceStore = {
                recordTrace() {
                    throw new Error('trace down');
                }
            };
            const traceFailure = recordAudit({ eventId: 'WF-TRACE-FAIL', type: 'GENERIC_NOTIFICATION' }, { skipPersistence: true });
            record(
                'trace failures isolated',
                traceFailure.success === true && /trace recording failed safely/i.test(traceFailure.warning),
                traceFailure
            );

            global.DB = undefined;
            global.WorkflowTelemetryService = undefined;
            global.WorkflowTraceStore = undefined;
            const missingDeps = recordAudit({ eventId: 'WF-MISSING-DEPS', type: 'GENERIC_NOTIFICATION' }, {});
            record(
                'dependency absence is safe',
                missingDeps.success === true &&
                    missingDeps.recorded === false &&
                    /writeAuditLog is unavailable/i.test(missingDeps.warning),
                missingDeps
            );

            record('exported APIs are frozen', Object.isFrozen(AuditService), { frozen: Object.isFrozen(AuditService) });
        } catch (err) {
            record('self-test has no uncaught failure', false, err && err.message ? err.message : safeString(err, 'unknown self-test error'));
        } finally {
            global.DB = previousDB;
            global.WorkflowTelemetryService = previousTelemetry;
            global.WorkflowTraceStore = previousTraceStore;
        }

        const report = Object.freeze({
            passed: tests.every(test => test.ok),
            tests: Object.freeze(tests)
        });

        try {
            global.__ARTHHRMS_AUDIT_SERVICE_SELF_TEST__ = report;
        } catch (e) {}

        if (report.passed) safeInfo(`${PREFIX} Development self-test passed.`, report);
        else safeWarn(`${PREFIX} Development self-test failed.`, report);
    }

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
