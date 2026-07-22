/**
 * escalationPolicyService.js
 * ARTHHRMS — Escalation Policy Intelligence Layer
 *
 * PURPOSE:
 * Provides centralized escalation evaluation and operational
 * risk escalation policies independent from workflow orchestration.
 *
 * This service evaluates:
 * - overdue workflow escalation
 * - SLA breach escalation
 * - operational risk escalation
 * - critical workflow failures
 * - escalation priority classification
 *
 * This service does NOT:
 * - own orchestration
 * - dispatch notifications
 * - own telemetry systems
 *
 * ARCHITECTURE RULE:
 * Escalation policy evaluation must remain isolated from orchestration.
 *
 * STABILITY:
 * Existing escalation behavior must remain compatible.
 *
 * DEPENDS ON:
 * - window.WorkflowTelemetryService (optional)
 *
 * @version 1.0.0
 */
(function (global) {
    'use strict';

    const PREFIX = '[EscalationPolicyService]';
    const SEVERITIES = Object.freeze({
        INFO: 'INFO',
        WARNING: 'WARNING',
        HIGH: 'HIGH',
        CRITICAL: 'CRITICAL'
    });
    const ESCALATION_TYPES = Object.freeze({
        SLA_BREACH: 'SLA_BREACH',
        OVERDUE_APPROVAL: 'OVERDUE_APPROVAL',
        WORKFLOW_FAILURE: 'WORKFLOW_FAILURE',
        CRITICAL_OPERATION: 'CRITICAL_OPERATION',
        SECURITY_RISK: 'SECURITY_RISK',
        PAYROLL_RISK: 'PAYROLL_RISK',
        IMPORT_RISK: 'IMPORT_RISK'
    });
    const PRIORITIES = Object.freeze({
        LOW: 'LOW',
        MEDIUM: 'MEDIUM',
        HIGH: 'HIGH',
        CRITICAL: 'CRITICAL'
    });
    const CLOSED_DELIVERABLE_STATUSES = Object.freeze(['Achieved', 'Failed', 'Exceeded', 'Closed']);
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

    function safeSeverity(severity) {
        const value = safeString(severity || SEVERITIES.INFO, SEVERITIES.INFO).trim().toUpperCase();
        if (SEVERITIES[value]) return SEVERITIES[value];
        if (value === 'ERROR') return SEVERITIES.HIGH;
        if (value === 'MEDIUM') return SEVERITIES.WARNING;
        if (value === 'LOW') return SEVERITIES.INFO;
        return SEVERITIES.INFO;
    }

    function safePriority(priority) {
        const value = safeString(priority || PRIORITIES.MEDIUM, PRIORITIES.MEDIUM).trim().toUpperCase();
        return PRIORITIES[value] || PRIORITIES.MEDIUM;
    }

    function telemetryService() {
        return global.WorkflowTelemetryService || null;
    }

    if (typeof global.WorkflowTelemetryService === 'undefined') {
        safeWarn(`${PREFIX} Optional dependency window.WorkflowTelemetryService is unavailable. Escalation evaluation will continue without telemetry.`);
    }

    function emitEscalationTelemetry(eventType, payload = {}) {
        if (telemetryForwarding) return { success: false, warning: 'Escalation telemetry skipped to avoid recursion.' };
        const service = telemetryService();
        if (!service || typeof service.emitWorkflowTelemetry !== 'function') return { success: true, warning: '' };
        try {
            telemetryForwarding = true;
            return service.emitWorkflowTelemetry(eventType, {
                source: 'escalationPolicyService',
                severity: payload.severity || SEVERITIES.INFO,
                status: payload.status || 'EVALUATED',
                eventId: payload.eventId || '',
                correlationId: payload.correlationId || '',
                metadata: cloneObject(payload.metadata)
            });
        } catch (err) {
            return {
                success: false,
                warning: `Escalation telemetry failed safely: ${err && err.message ? err.message : safeString(err, 'unknown telemetry failure')}`
            };
        } finally {
            telemetryForwarding = false;
        }
    }

    function normalizeEvent(event = {}) {
        const source = isPlainObject(event) ? cloneObject(event) : {};
        source.metadata = cloneObject(source.metadata);
        source.type = safeString(source.type || source.eventType || '', '').trim();
        source.status = safeString(source.status || '', '').trim();
        source.priority = safePriority(source.priority);
        source.severity = safeSeverity(source.severity || (source.priority === PRIORITIES.CRITICAL ? SEVERITIES.CRITICAL : SEVERITIES.INFO));
        source.module = safeString(source.module || 'Workflow', 'Workflow').trim() || 'Workflow';
        return source;
    }

    function normalizeContext(context = {}) {
        const source = isPlainObject(context) ? cloneObject(context) : {};
        source.metadata = cloneObject(source.metadata);
        return source;
    }

    function normalizeEscalation(input = {}) {
        const source = isPlainObject(input) ? cloneObject(input) : {};
        const escalationType = source.escalationType || ESCALATION_TYPES.CRITICAL_OPERATION;
        const recommendedRoles = Array.isArray(source.recommendedRoles)
            ? source.recommendedRoles.map(role => safeString(role || '', '').trim().toUpperCase()).filter(Boolean)
            : [];
        return Object.freeze({
            escalated: !!source.escalated,
            severity: safeSeverity(source.severity),
            escalationType: ESCALATION_TYPES[escalationType] || escalationType,
            recommendedRoles: Object.freeze(recommendedRoles),
            reason: safeString(source.reason || '', '').trim(),
            metadata: Object.freeze(cloneObject(source.metadata))
        });
    }

    function classifyEscalationPriority(event = {}, context = {}) {
        const normalized = normalizeEvent(event);
        const ctx = normalizeContext(context);
        const text = `${normalized.status} ${normalized.type} ${normalized.module} ${normalized.title || ''} ${normalized.reason || ''}`;
        const priority = safePriority(normalized.priority);
        const severity = safeSeverity(normalized.severity);

        if (/security|auth|rls|unauthorized|unverified/i.test(text) || ctx.productionAuthRisk === true || ctx.unverifiedProductionAuth === true) {
            return { escalationType: ESCALATION_TYPES.SECURITY_RISK, severity: SEVERITIES.CRITICAL };
        }
        if (/payroll/i.test(text) && /failed|blocked|error|critical/i.test(text)) {
            return { escalationType: ESCALATION_TYPES.PAYROLL_RISK, severity: SEVERITIES.CRITICAL };
        }
        if (/import/i.test(text) && /failed|validation|blocked|rollback|corrupt/i.test(text)) {
            return { escalationType: ESCALATION_TYPES.IMPORT_RISK, severity: priority === PRIORITIES.CRITICAL ? SEVERITIES.CRITICAL : SEVERITIES.HIGH };
        }
        if (/failed|blocked|error/i.test(text) || severity === SEVERITIES.CRITICAL) {
            return { escalationType: ESCALATION_TYPES.WORKFLOW_FAILURE, severity: severity === SEVERITIES.CRITICAL ? SEVERITIES.CRITICAL : SEVERITIES.HIGH };
        }
        if (/overdue/i.test(text) || normalized.type === 'DELIVERABLE_OVERDUE') {
            return { escalationType: ESCALATION_TYPES.SLA_BREACH, severity: SEVERITIES.CRITICAL };
        }
        if (priority === PRIORITIES.CRITICAL) {
            return { escalationType: ESCALATION_TYPES.CRITICAL_OPERATION, severity: SEVERITIES.CRITICAL };
        }
        if (priority === PRIORITIES.HIGH || severity === SEVERITIES.HIGH) {
            return { escalationType: ESCALATION_TYPES.OVERDUE_APPROVAL, severity: SEVERITIES.HIGH };
        }
        return { escalationType: ESCALATION_TYPES.CRITICAL_OPERATION, severity: SEVERITIES.INFO };
    }

    function shouldEscalate(event = {}, context = {}) {
        const normalized = normalizeEvent(event);
        const classification = classifyEscalationPriority(normalized, context);
        const text = `${normalized.status} ${normalized.type}`;
        return /failed|blocked/i.test(text) ||
            normalized.priority === PRIORITIES.CRITICAL ||
            normalized.severity === SEVERITIES.CRITICAL ||
            classification.severity === SEVERITIES.CRITICAL ||
            classification.escalationType === ESCALATION_TYPES.SECURITY_RISK ||
            classification.escalationType === ESCALATION_TYPES.PAYROLL_RISK ||
            classification.escalationType === ESCALATION_TYPES.IMPORT_RISK ||
            normalized.type === 'DELIVERABLE_OVERDUE';
    }

    function recommendedRolesFor(classification, event) {
        const roles = [];
        if (classification.escalationType === ESCALATION_TYPES.SECURITY_RISK) roles.push('SUPER_ADMIN', 'HR');
        else if (classification.escalationType === ESCALATION_TYPES.PAYROLL_RISK) roles.push('HR', 'SUPER_ADMIN');
        else if (classification.escalationType === ESCALATION_TYPES.IMPORT_RISK) roles.push('HR', 'ADMIN');
        else if (event.type === 'DELIVERABLE_OVERDUE' || classification.escalationType === ESCALATION_TYPES.SLA_BREACH) roles.push('HR', 'SUPER_ADMIN');
        else if (classification.severity === SEVERITIES.CRITICAL) roles.push('HR', 'SUPER_ADMIN');
        else if (classification.severity === SEVERITIES.HIGH) roles.push('HR');
        return Object.freeze(Array.from(new Set(roles)));
    }

    function evaluateEscalation(event = {}, context = {}) {
        try {
            const normalizedEvent = normalizeEvent(event);
            const ctx = normalizeContext(context);
            const classification = classifyEscalationPriority(normalizedEvent, ctx);
            const escalated = !!(!normalizedEvent.suppressEscalation && shouldEscalate(normalizedEvent, ctx));
            const reason = escalated
                ? (normalizedEvent.title || `${normalizedEvent.type || 'Workflow event'} requires operational review`)
                : 'Escalation policy evaluated without escalation.';
            const result = normalizeEscalation({
                escalated,
                severity: escalated ? classification.severity : SEVERITIES.INFO,
                escalationType: classification.escalationType,
                recommendedRoles: escalated ? recommendedRolesFor(classification, normalizedEvent) : [],
                reason,
                metadata: {
                    eventId: normalizedEvent.eventId || '',
                    correlationId: normalizedEvent.correlationId || '',
                    module: normalizedEvent.module || 'Workflow',
                    targetId: normalizedEvent.targetId || '',
                    priority: normalizedEvent.priority,
                    status: normalizedEvent.status || '',
                    source: normalizedEvent.source || '',
                    ageDays: ctx.ageDays || normalizedEvent.ageDays || 0
                }
            });

            emitEscalationTelemetry(escalated ? 'ESCALATION_POLICY_TRIGGERED' : 'ESCALATION_POLICY_EVALUATED', {
                severity: result.severity === SEVERITIES.INFO ? SEVERITIES.INFO : result.severity,
                status: escalated ? 'ESCALATED' : 'SUPPRESSED',
                eventId: normalizedEvent.eventId || '',
                correlationId: normalizedEvent.correlationId || '',
                metadata: {
                    escalationType: result.escalationType,
                    recommendedRoles: result.recommendedRoles,
                    reason: result.reason
                }
            });

            return result;
        } catch (err) {
            safeWarn(`${PREFIX} Escalation evaluation failed safely.`, err && err.message ? err.message : err);
            emitEscalationTelemetry('ESCALATION_POLICY_FAILED_SAFE', {
                severity: SEVERITIES.WARNING,
                status: 'FAILED_SAFE',
                metadata: { error: err && err.message ? err.message : safeString(err, 'unknown escalation failure') }
            });
            return normalizeEscalation({
                escalated: false,
                severity: SEVERITIES.INFO,
                escalationType: ESCALATION_TYPES.CRITICAL_OPERATION,
                recommendedRoles: [],
                reason: 'Escalation evaluation failed safely.',
                metadata: {}
            });
        }
    }

    function isOpenStatus(status) {
        return !['Resolved', 'Closed', 'Approved', 'Rejected', 'Paid', 'Finalized', 'Completed'].includes(safeString(status || '', '').trim());
    }

    function getEscalationCandidates() {
        const data = getData();
        const candidates = [];
        (data.strategicDeliverables || []).forEach(d => {
            if (d.deadlineDate && d.deadlineDate < today() && CLOSED_DELIVERABLE_STATUSES.indexOf(d.finalClosureStatus || d.currentStatus) === -1) {
                candidates.push({
                    type: 'DELIVERABLE_OVERDUE',
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
                    type: 'LEAVE_APPLIED',
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
                    type: 'GENERIC_NOTIFICATION',
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

    const EscalationPolicyService = Object.freeze({
        ESCALATION_TYPES,
        SEVERITIES,
        evaluateEscalation,
        classifyEscalationPriority,
        normalizeEscalation,
        safeSeverity,
        ageDays,
        shouldEscalate,
        getEscalationCandidates
    });

    global.EscalationPolicyService = EscalationPolicyService;

    if (global.__ARTHHRMS_DEV__) {
        (function runSelfTest() {
            const tests = [];
            const previousTelemetry = global.WorkflowTelemetryService;
            const previousDb = global.DB;

            function check(name, condition) {
                tests.push({ name, passed: !!condition });
            }

            try {
                global.WorkflowTelemetryService = undefined;
                global.DB = {
                    get() {
                        return {
                            strategicDeliverables: [
                                { id: 'D1', deliverableId: 'D1', empId: 'EMP1', deadlineDate: '2026-05-01', currentStatus: 'Open' }
                            ],
                            leaveRequests: [
                                { id: 'L1', leaveId: 'L1', empId: 'EMP1', status: 'Pending', appliedOn: '2026-05-10' }
                            ],
                            helpdeskTickets: [
                                { id: 'H1', empId: 'EMP1', status: 'Open', createdOn: '2026-05-10' }
                            ]
                        };
                    },
                    today() { return '2026-05-19'; }
                };

                const overdue = evaluateEscalation({
                    type: 'DELIVERABLE_OVERDUE',
                    priority: 'CRITICAL',
                    module: 'Strategic Deliverables',
                    title: 'Overdue deliverable',
                    eventId: 'WF-ESC-1',
                    correlationId: 'CORR-ESC-1'
                });
                check('overdue escalation works', overdue.escalated && overdue.severity === SEVERITIES.CRITICAL && overdue.recommendedRoles.indexOf('SUPER_ADMIN') !== -1);

                const payroll = evaluateEscalation({
                    type: 'PAYROLL_GENERATED',
                    status: 'failed',
                    module: 'Payroll',
                    priority: 'HIGH'
                });
                check('payroll failures escalate correctly', payroll.escalated && payroll.escalationType === ESCALATION_TYPES.PAYROLL_RISK && payroll.severity === SEVERITIES.CRITICAL);

                const security = evaluateEscalation({ type: 'AUTH_CONFIGURATION', status: 'unverified production auth' });
                check('security risk classification works', security.escalated && security.escalationType === ESCALATION_TYPES.SECURITY_RISK);

                const malformed = evaluateEscalation(Symbol('bad-event'));
                check('malformed events handled safely', malformed && malformed.escalated === false);

                const event = { type: 'IMPORT_VALIDATION_FAILED', status: 'failed', metadata: { stable: true } };
                const before = JSON.stringify(event);
                evaluateEscalation(event);
                check('workflow event input is never mutated', JSON.stringify(event) === before);

                const candidates = getEscalationCandidates();
                check('SLA escalation candidate aggregation preserved', candidates.length === 3 && candidates[0].type === 'DELIVERABLE_OVERDUE');

                global.WorkflowTelemetryService = {
                    emitWorkflowTelemetry() {
                        throw new Error('telemetry down');
                    }
                };
                const telemetryIsolated = evaluateEscalation({ type: 'IMPORT_VALIDATION_FAILED', status: 'failed', module: 'Import Center' });
                check('telemetry failures isolated', telemetryIsolated.escalated && telemetryIsolated.escalationType === ESCALATION_TYPES.IMPORT_RISK);

                check('export is frozen', Object.isFrozen(EscalationPolicyService) && Object.isFrozen(ESCALATION_TYPES) && Object.isFrozen(SEVERITIES));

                const passed = tests.every(test => test.passed);
                global.__ARTHHRMS_ESCALATION_POLICY_SELF_TEST__ = Object.freeze({
                    passed,
                    tests: Object.freeze(tests.map(test => Object.freeze({ ...test })))
                });
                if (passed) safeInfo(`${PREFIX} development self-test passed.`, global.__ARTHHRMS_ESCALATION_POLICY_SELF_TEST__);
                else safeWarn(`${PREFIX} development self-test reported failures.`, global.__ARTHHRMS_ESCALATION_POLICY_SELF_TEST__);
            } catch (err) {
                global.__ARTHHRMS_ESCALATION_POLICY_SELF_TEST__ = Object.freeze({
                    passed: false,
                    tests: Object.freeze(tests.map(test => Object.freeze({ ...test }))),
                    error: err && err.message ? err.message : safeString(err, 'unknown self-test error')
                });
                safeWarn(`${PREFIX} development self-test failed safely.`, global.__ARTHHRMS_ESCALATION_POLICY_SELF_TEST__);
            } finally {
                global.WorkflowTelemetryService = previousTelemetry;
                global.DB = previousDb;
            }
        })();
    }
})(typeof window !== 'undefined' ? window : globalThis);
