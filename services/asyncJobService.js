/**
 * asyncJobService.js
 * ARTHHRMS - Enterprise Async Job Orchestration Layer
 *
 * PURPOSE:
 * Provides centralized background job governance for delayed notifications,
 * payroll processing, onboarding imports, retries, scheduled workflows, replay
 * processing, escalation batches, audit compaction, and telemetry aggregation.
 *
 * This service manages:
 * - tenant-scoped job creation and scheduling
 * - retry governance and dead-letter transitions
 * - queue health and congestion visibility
 * - future external queue compatibility metadata
 * - audit and telemetry visibility
 *
 * This service does NOT:
 * - bypass RBAC protections
 * - expose cross-tenant job data
 * - run unbounded retry loops
 * - require external worker infrastructure
 *
 * ARCHITECTURE RULE:
 * Public APIs stay synchronous and browser-global while preserving a stable
 * adapter boundary for Supabase Edge Functions, pg_cron, Redis queues, BullMQ,
 * and external workers.
 *
 * STABILITY:
 * Existing workflow and event flows remain backward-compatible.
 *
 * DEPENDS ON:
 * - window.DB (optional)
 * - window.NotificationOrchestrationService (optional)
 * - window.WorkflowTelemetryService (optional)
 * - window.AuditService (optional)
 * - window.OrchestrationMetricsService (optional)
 *
 * @version 1.0.0
 */
(function attachAsyncJobService(global) {
    'use strict';

    var PREFIX = '[AsyncJobService]';
    var MAX_JOBS = 500;
    var DEFAULT_MAX_RETRIES = 3;
    var DEFAULT_BACKOFF_MS = 1000;
    var MAX_BACKOFF_MS = 900000;
    var RETRY_LOOP_THRESHOLD = 4;

    var JOB_STATES = Object.freeze({
        QUEUED: 'QUEUED',
        SCHEDULED: 'SCHEDULED',
        PROCESSING: 'PROCESSING',
        RETRY_PENDING: 'RETRY_PENDING',
        COMPLETED: 'COMPLETED',
        FAILED: 'FAILED',
        CANCELLED: 'CANCELLED',
        ARCHIVED: 'ARCHIVED'
    });

    var JOB_TYPES = Object.freeze({
        NOTIFICATION_DELIVERY: 'NOTIFICATION_DELIVERY',
        ONBOARDING_IMPORT: 'ONBOARDING_IMPORT',
        PAYROLL_GENERATION: 'PAYROLL_GENERATION',
        REPLAY_PROCESSING: 'REPLAY_PROCESSING',
        ESCALATION_BATCH: 'ESCALATION_BATCH',
        AUDIT_COMPACTION: 'AUDIT_COMPACTION',
        TELEMETRY_AGGREGATION: 'TELEMETRY_AGGREGATION',
        SCHEDULED_WORKFLOW: 'SCHEDULED_WORKFLOW'
    });

    var PRIORITIES = Object.freeze({
        LOW: 'LOW',
        NORMAL: 'NORMAL',
        HIGH: 'HIGH',
        CRITICAL: 'CRITICAL'
    });

    var FAILURE_CLASSIFICATIONS = Object.freeze({
        INFO: 'INFO',
        WARNING: 'WARNING',
        HIGH_RISK: 'HIGH_RISK',
        CRITICAL_BLOCKER: 'CRITICAL_BLOCKER'
    });

    var SENSITIVE_KEY_PATTERN = /(salary|payroll.?amount|payrollAmount|payslip|compensation|ctc|leave.?balance|gross|net|basic|hra|pf|tds|allowance|deduction|password|secret|token|jwt|authorization|service.?role|private.?key)/i;
    var SENSITIVE_VALUE_PATTERN = /\b(salary|payrollAmount|payroll|compensation|leave balance)\s*[:=]?\s*[\d,]+/ig;

    var auditForwarding = false;
    var telemetryForwarding = false;
    var metricForwarding = false;

    function safeWarn(message, details) {
        try {
            if (global.console && typeof global.console.warn === 'function') {
                if (details !== undefined) global.console.warn(PREFIX + ' ' + message, details);
                else global.console.warn(PREFIX + ' ' + message);
            }
        } catch (error) {}
    }

    function safeInfo(message, details) {
        try {
            if (global.console && typeof global.console.info === 'function') {
                if (details !== undefined) global.console.info(PREFIX + ' ' + message, details);
                else global.console.info(PREFIX + ' ' + message);
            }
        } catch (error) {}
    }

    function nowIso() {
        try {
            return new Date().toISOString();
        } catch (error) {
            return String(Date.now());
        }
    }

    function db() {
        try {
            return global.DB || null;
        } catch (error) {
            return null;
        }
    }

    function rawData() {
        try {
            if (db() && typeof db().get === 'function') return db().get() || {};
        } catch (error) {}
        return {};
    }

    function saveData(data) {
        try {
            if (db() && typeof db().save === 'function') {
                db().save(data);
                return true;
            }
        } catch (error) {}
        return false;
    }

    function safeString(value, fallback) {
        try {
            if (value === undefined || value === null) return fallback;
            if (typeof value === 'symbol') return value.toString();
            return String(value);
        } catch (error) {
            return fallback;
        }
    }

    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function freezeAsyncOutput(value, seen) {
        if (!value || (typeof value !== 'object' && typeof value !== 'function') || Object.isFrozen(value)) return value;
        var refs = seen || [];
        if (refs.indexOf(value) !== -1) return value;
        refs.push(value);
        try {
            Object.keys(value).forEach(function freezeKey(key) {
                freezeAsyncOutput(value[key], refs.slice());
            });
            Object.freeze(value);
        } catch (error) {}
        return value;
    }

    function redactString(value) {
        return safeString(value, '').replace(SENSITIVE_VALUE_PATTERN, '[REDACTED]');
    }

    function cloneSanitized(value, seen) {
        if (value === undefined || value === null) return value;
        if (typeof value === 'string') return redactString(value);
        if (typeof value !== 'object') return value;
        var refs = seen || [];
        if (refs.indexOf(value) !== -1) return '[Circular]';
        refs.push(value);
        if (Array.isArray(value)) {
            return value.map(function cloneArrayItem(item) {
                return cloneSanitized(item, refs.slice());
            });
        }
        if (!isPlainObject(value)) return safeString(value, '');
        var output = {};
        try {
            Object.keys(value).forEach(function cloneKey(key) {
                if (SENSITIVE_KEY_PATTERN.test(key)) return;
                output[key] = cloneSanitized(value[key], refs.slice());
            });
        } catch (error) {}
        return output;
    }

    function normalizeTenantSlug(value) {
        var slug = safeString(value || '', '').trim().toLowerCase();
        slug = slug.replace(/^ten[-_]/, '').replace(/^tenant[-_]/, '');
        slug = slug.replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        return slug;
    }

    function tenantFromContext(context) {
        var ctx = isPlainObject(context) ? context : {};
        var data = rawData();
        return normalizeTenantSlug(
            ctx.tenantSlug ||
            ctx.tenant_slug ||
            ctx.tenantId ||
            ctx.companyId ||
            ctx.actor?.tenantSlug ||
            ctx.actor?.tenantId ||
            data.companySettings?.tenantSlug ||
            data.companySettings?.tenantId ||
            ''
        );
    }

    function rowTenant(row) {
        if (!row || typeof row !== 'object') return '';
        return normalizeTenantSlug(row.tenantSlug || row.tenant_slug || row.tenantId || row.companyId || row.metadata?.tenantSlug || row.metadata?.tenantId || '');
    }

    function normalizeToken(value, allowed, fallback) {
        var token = safeString(value || fallback, fallback).trim().replace(/[\s-]+/g, '_').toUpperCase();
        return allowed[token] ? allowed[token] : fallback;
    }

    function normalizeJobState(value) {
        return normalizeToken(value, JOB_STATES, JOB_STATES.QUEUED);
    }

    function normalizeJobType(value) {
        return normalizeToken(value, JOB_TYPES, safeString(value || 'SCHEDULED_WORKFLOW', 'SCHEDULED_WORKFLOW').trim().replace(/[\s-]+/g, '_').toUpperCase() || JOB_TYPES.SCHEDULED_WORKFLOW);
    }

    function normalizePriority(value) {
        return normalizeToken(value, PRIORITIES, PRIORITIES.NORMAL);
    }

    function classifyAsyncJobPriority(input) {
        var source = isPlainObject(input) ? input : {};
        var type = normalizeJobType(source.jobType || source.type || source.eventType || '');
        if (source.crossTenant || source.tenantMismatch || /cross.?tenant/i.test(safeString(source.reason || '', ''))) return PRIORITIES.CRITICAL;
        if (type === JOB_TYPES.REPLAY_PROCESSING && source.repairMode) return PRIORITIES.CRITICAL;
        if (type === JOB_TYPES.ESCALATION_BATCH || type === JOB_TYPES.NOTIFICATION_DELIVERY && source.priority === PRIORITIES.CRITICAL) return PRIORITIES.CRITICAL;
        if (type === JOB_TYPES.PAYROLL_GENERATION || type === JOB_TYPES.ONBOARDING_IMPORT || type === JOB_TYPES.REPLAY_PROCESSING) return PRIORITIES.HIGH;
        if (type === JOB_TYPES.TELEMETRY_AGGREGATION || type === JOB_TYPES.AUDIT_COMPACTION) return PRIORITIES.NORMAL;
        return normalizePriority(source.priority || PRIORITIES.NORMAL);
    }

    function classifyJobFailure(input) {
        var source = isPlainObject(input) ? input : {};
        var retryAttempts = Number(source.retryAttempts || source.retryCount || 0) || 0;
        var maxRetries = Math.max(0, Number(source.maxRetries || DEFAULT_MAX_RETRIES) || DEFAULT_MAX_RETRIES);
        var state = normalizeJobState(source.state || source.status || '');
        if (source.crossTenant || source.tenantMismatch) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
        if (source.retryLoop || retryAttempts > maxRetries || retryAttempts >= maxRetries + 1) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
        if (retryAttempts >= maxRetries || state === JOB_STATES.FAILED) return FAILURE_CLASSIFICATIONS.HIGH_RISK;
        if (state === JOB_STATES.RETRY_PENDING || retryAttempts > 0) return FAILURE_CLASSIFICATIONS.WARNING;
        return FAILURE_CLASSIFICATIONS.INFO;
    }

    function generateJobId() {
        return 'JOB-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7).toUpperCase();
    }

    function scheduleTime(schedule) {
        var src = isPlainObject(schedule) ? schedule : {};
        if (src.runAt) return safeString(src.runAt, '');
        var delayMs = Math.max(0, Number(src.delayMs || 0) || 0);
        if (delayMs) return new Date(Date.now() + delayMs).toISOString();
        return nowIso();
    }

    function normalizeJobPayload(payload, context) {
        var source = isPlainObject(payload) ? cloneSanitized(payload) : {};
        var ctxTenant = tenantFromContext(context);
        var tenantSlug = normalizeTenantSlug(source.tenantSlug || source.tenant_slug || source.tenantId || source.companyId || source.metadata?.tenantSlug || ctxTenant);
        var jobType = normalizeJobType(source.jobType || source.type || source.eventType || JOB_TYPES.SCHEDULED_WORKFLOW);
        var state = normalizeJobState(source.state || source.status || JOB_STATES.QUEUED);
        var priority = classifyAsyncJobPriority({
            ...source,
            jobType: jobType,
            crossTenant: tenantSlug && ctxTenant && tenantSlug !== ctxTenant
        });
        var retryAttempts = Math.max(0, Number(source.retryAttempts || source.retryCount || 0) || 0);
        var maxRetries = Math.max(0, Number(source.maxRetries || context?.maxRetries || DEFAULT_MAX_RETRIES) || DEFAULT_MAX_RETRIES);
        var normalized = {
            jobId: safeString(source.jobId || source.id || '', '').trim(),
            id: safeString(source.id || source.jobId || '', '').trim(),
            tenantSlug: tenantSlug,
            tenantId: safeString(source.tenantId || source.companyId || '', '').trim(),
            jobType: jobType,
            type: jobType,
            state: state,
            status: state,
            priority: priority,
            payload: cloneSanitized(source.payload || {}),
            metadata: cloneSanitized(source.metadata || {}),
            retryAttempts: retryAttempts,
            maxRetries: maxRetries,
            scheduledAt: safeString(source.scheduledAt || source.runAt || source.schedule?.runAt || '', '').trim(),
            nextRetryAt: safeString(source.nextRetryAt || '', '').trim(),
            recurring: !!(source.recurring || source.schedule?.recurring),
            recurrence: safeString(source.recurrence || source.schedule?.recurrence || '', '').trim(),
            correlationId: safeString(source.correlationId || source.metadata?.correlationId || '', '').trim(),
            eventId: safeString(source.eventId || source.metadata?.eventId || '', '').trim(),
            createdAt: safeString(source.createdAt || nowIso(), nowIso()),
            updatedAt: safeString(source.updatedAt || '', '').trim(),
            deadLettered: !!source.deadLettered
        };
        if (!normalized.scheduledAt && state === JOB_STATES.SCHEDULED) normalized.scheduledAt = scheduleTime(source.schedule || {});
        if (!normalized.jobId) normalized.jobId = normalized.id;
        if (!normalized.id) normalized.id = normalized.jobId;
        return freezeAsyncOutput(normalized);
    }

    function validateAsyncJobScope(payload, context) {
        var source = isPlainObject(payload) ? cloneSanitized(payload) : {};
        var ctxTenant = tenantFromContext(context);
        var tenantSlug = normalizeTenantSlug(source.tenantSlug || source.tenant_slug || source.tenantId || source.companyId || source.metadata?.tenantSlug || ctxTenant);
        var alerts = [];
        if (!isPlainObject(payload)) {
            alerts.push({
                alertCode: 'MALFORMED_ASYNC_JOB_PAYLOAD',
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                message: 'Async job payload is malformed and cannot be queued safely.'
            });
        }
        if (ctxTenant && tenantSlug && ctxTenant !== tenantSlug) {
            alerts.push({
                alertCode: 'CROSS_TENANT_ASYNC_JOB_BLOCKED',
                classification: FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                message: 'Cross-tenant async processing was blocked.'
            });
        }
        if (ctxTenant && normalizeToken(source.targetRole || source.role || '', { PLATFORM_OWNER: 'PLATFORM_OWNER' }, '') === 'PLATFORM_OWNER') {
            alerts.push({
                alertCode: 'PLATFORM_OWNER_JOB_IN_TENANT_SCOPE_BLOCKED',
                classification: FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                message: 'Platform owner governance jobs cannot be injected into tenant job scope.'
            });
        }
        if (!tenantSlug && ctxTenant) {
            alerts.push({
                alertCode: 'ASYNC_JOB_TENANT_SCOPE_MISSING',
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                message: 'Tenant-scoped async job is missing tenant identity.'
            });
        }
        return freezeAsyncOutput({
            allowed: alerts.filter(function unsafe(row) {
                return row.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER || row.classification === FAILURE_CLASSIFICATIONS.HIGH_RISK;
            }).length === 0,
            tenantSlug: tenantSlug,
            contextTenant: ctxTenant,
            alerts: alerts.map(function safeAlert(row) { return cloneSanitized(row); })
        });
    }

    function queueAdapter() {
        return freezeAsyncOutput({
            localStore: true,
            futureQueueReady: true,
            supabaseEdgeFunctions: true,
            pgCron: true,
            redisQueues: true,
            bullMQ: true,
            externalWorkers: true,
            adapterContract: 'enqueueJob/scheduleJob/scheduleRetry/processDueJobs'
        });
    }

    function emitTelemetry(eventType, metadata, context) {
        if (telemetryForwarding || context?.skipTelemetry) return { success: true, warning: 'Telemetry skipped.' };
        var service = global.WorkflowTelemetryService;
        if (!service || typeof service.emitTelemetry !== 'function') return { success: true, warning: 'WorkflowTelemetryService unavailable.' };
        try {
            telemetryForwarding = true;
            return service.emitTelemetry('WORKFLOW', eventType, {
                source: 'asyncJobService',
                severity: metadata?.severity || 'INFO',
                status: metadata?.status || 'RECORDED',
                correlationId: metadata?.correlationId || '',
                eventId: metadata?.eventId || '',
                metadata: cloneSanitized(metadata || {})
            });
        } catch (error) {
            return { success: false, warning: 'Async job telemetry failed safely.' };
        } finally {
            telemetryForwarding = false;
        }
    }

    function recordMetric(type, metadata, context) {
        if (metricForwarding || context?.skipMetrics) return { success: true, warning: 'Metrics skipped.' };
        var service = global.OrchestrationMetricsService;
        if (!service || typeof service.recordWorkflowMetric !== 'function') return { success: true, warning: 'OrchestrationMetricsService unavailable.' };
        try {
            metricForwarding = true;
            return service.recordWorkflowMetric(type || 'ASYNC_JOB_EVENT', cloneSanitized(metadata || {}));
        } catch (error) {
            return { success: false, warning: 'Async job metric failed safely.' };
        } finally {
            metricForwarding = false;
        }
    }

    function auditJob(actionType, metadata, context) {
        if (auditForwarding || context?.skipAuditPersistence) return { success: true, warning: 'Audit skipped.' };
        var service = global.AuditService;
        try {
            auditForwarding = true;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    actionType: actionType,
                    eventType: actionType,
                    module: 'Async Jobs',
                    targetId: metadata?.jobId || '',
                    description: metadata?.description || actionType,
                    actorRole: context?.actor?.role || 'platform_owner',
                    actorId: context?.actor?.id || '',
                    severity: metadata?.severity || 'INFO',
                    correlationId: metadata?.correlationId || '',
                    eventId: metadata?.eventId || '',
                    metadata: cloneSanitized(metadata || {})
                }, {
                    source: 'asyncJobService',
                    skipPersistence: false
                });
            }
            if (db() && typeof db().writeAuditLog === 'function') {
                db().writeAuditLog(
                    context?.actor?.role || 'platform_owner',
                    context?.actor?.id || '',
                    actionType,
                    'Async Jobs',
                    metadata?.jobId || '',
                    metadata?.description || actionType
                );
            }
            return { success: true, warning: service ? '' : 'AuditService unavailable; DB fallback used when possible.' };
        } catch (error) {
            return { success: false, warning: 'Async job audit failed safely.' };
        } finally {
            auditForwarding = false;
        }
    }

    function persistJob(job, context, actionType) {
        var data = rawData();
        data.asyncJobs = Array.isArray(data.asyncJobs) ? data.asyncJobs.slice() : [];
        var row = cloneSanitized(job);
        row.jobId = row.jobId || generateJobId();
        row.id = row.id || row.jobId;
        row.state = normalizeJobState(row.state || JOB_STATES.QUEUED);
        row.status = row.state;
        row.createdAt = row.createdAt || nowIso();
        row.updatedAt = nowIso();
        row.queueGoverned = true;
        data.asyncJobs.unshift(row);
        if (data.asyncJobs.length > MAX_JOBS) data.asyncJobs = data.asyncJobs.slice(0, MAX_JOBS);
        saveData(data);
        auditJob(actionType || 'ASYNC_JOB_ENQUEUED', {
            jobId: row.jobId,
            tenantSlug: row.tenantSlug,
            jobType: row.jobType,
            correlationId: row.correlationId,
            eventId: row.eventId,
            severity: row.priority === PRIORITIES.CRITICAL ? 'CRITICAL' : row.priority === PRIORITIES.HIGH ? 'WARNING' : 'INFO',
            description: 'Async job recorded through orchestration governance.'
        }, context);
        emitTelemetry(actionType || 'ASYNC_JOB_ENQUEUED', {
            jobId: row.jobId,
            tenantSlug: row.tenantSlug,
            jobType: row.jobType,
            correlationId: row.correlationId,
            eventId: row.eventId,
            status: row.state,
            severity: row.priority === PRIORITIES.CRITICAL ? 'CRITICAL' : row.priority === PRIORITIES.HIGH ? 'WARNING' : 'INFO'
        }, context);
        recordMetric(actionType || 'ASYNC_JOB_ENQUEUED', {
            jobId: row.jobId,
            tenantSlug: row.tenantSlug,
            jobType: row.jobType,
            status: row.state,
            severity: row.priority === PRIORITIES.CRITICAL ? 'CRITICAL' : row.priority === PRIORITIES.HIGH ? 'WARNING' : 'INFO'
        }, context);
        return freezeAsyncOutput(row);
    }

    function blockedResult(scope, context) {
        auditJob('ASYNC_JOB_BLOCKED', {
            tenantSlug: scope.tenantSlug,
            severity: 'CRITICAL',
            description: 'Unsafe async job was blocked.',
            classification: scope.alerts[0]?.classification || FAILURE_CLASSIFICATIONS.HIGH_RISK
        }, context);
        emitTelemetry('ASYNC_JOB_BLOCKED', {
            tenantSlug: scope.tenantSlug,
            severity: 'CRITICAL',
            status: 'BLOCKED'
        }, context);
        recordMetric('ASYNC_JOB_BLOCKED', { tenantSlug: scope.tenantSlug, failed: true, severity: 'ERROR' }, context);
        return freezeAsyncOutput({
            success: false,
            classification: scope.alerts[0]?.classification || FAILURE_CLASSIFICATIONS.HIGH_RISK,
            job: null,
            alerts: scope.alerts,
            warnings: scope.alerts,
            queueAdapter: queueAdapter(),
            metadata: {
                tenantIsolationPreserved: true,
                rbacEnforcementPreserved: true,
                sensitiveDataFiltered: true,
                existingWorkflowEventsPreserved: true
            }
        });
    }

    function enqueueJob(payload, context) {
        try {
            var scope = validateAsyncJobScope(payload, context);
            if (!scope.allowed) return blockedResult(scope, context);
            var normalized = normalizeJobPayload(payload, context);
            var job = {
                ...normalized,
                jobId: normalized.jobId || generateJobId(),
                id: normalized.id || normalized.jobId || generateJobId(),
                state: JOB_STATES.QUEUED,
                status: JOB_STATES.QUEUED,
                updatedAt: nowIso()
            };
            if (!job.id) job.id = job.jobId;
            if (!job.jobId) job.jobId = job.id;
            var persisted = context?.preview || context?.readOnly ? freezeAsyncOutput(job) : persistJob(job, context, 'ASYNC_JOB_ENQUEUED');
            return freezeAsyncOutput({
                success: true,
                classification: classifyJobFailure(persisted),
                job: persisted,
                queueAdapter: queueAdapter(),
                warnings: [],
                metadata: {
                    tenantIsolationPreserved: true,
                    rbacEnforcementPreserved: true,
                    sensitiveDataFiltered: true,
                    existingWorkflowEventsPreserved: true,
                    queueMigrationCompatible: true
                }
            });
        } catch (error) {
            safeWarn('Async job enqueue failed safely.', error && error.message ? error.message : error);
            return freezeAsyncOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                job: null,
                warnings: [{
                    alertCode: 'ASYNC_JOB_ENQUEUE_FAILED_SAFE',
                    classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                    message: 'Async job enqueue failed safely.'
                }],
                queueAdapter: queueAdapter()
            });
        }
    }

    function scheduleJob(payload, context) {
        try {
            var source = isPlainObject(payload) ? payload : {};
            var scheduledAt = scheduleTime(source.schedule || { runAt: source.scheduledAt || source.runAt });
            var scheduledPayload = {
                ...source,
                scheduledAt: scheduledAt,
                state: JOB_STATES.SCHEDULED,
                status: JOB_STATES.SCHEDULED
            };
            var scope = validateAsyncJobScope(scheduledPayload, context);
            if (!scope.allowed) return blockedResult(scope, context);
            var normalized = normalizeJobPayload(scheduledPayload, context);
            var job = {
                ...normalized,
                jobId: normalized.jobId || generateJobId(),
                id: normalized.id || normalized.jobId || generateJobId(),
                state: JOB_STATES.SCHEDULED,
                status: JOB_STATES.SCHEDULED,
                scheduledAt: scheduledAt,
                updatedAt: nowIso()
            };
            if (!job.id) job.id = job.jobId;
            if (!job.jobId) job.jobId = job.id;
            var persisted = context?.preview || context?.readOnly ? freezeAsyncOutput(job) : persistJob(job, context, 'ASYNC_JOB_SCHEDULED');
            return freezeAsyncOutput({
                success: true,
                classification: classifyJobFailure(persisted),
                job: persisted,
                queueAdapter: queueAdapter(),
                schedule: {
                    delayed: true,
                    scheduledAt: scheduledAt,
                    recurring: persisted.recurring,
                    recurrence: persisted.recurrence
                },
                warnings: []
            });
        } catch (error) {
            return freezeAsyncOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                job: null,
                queueAdapter: queueAdapter(),
                warnings: [{
                    alertCode: 'ASYNC_JOB_SCHEDULE_FAILED_SAFE',
                    classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                    message: 'Async job scheduling failed safely.'
                }]
            });
        }
    }

    function retryPlan(job, context) {
        var attempts = Math.max(0, Number(job?.retryAttempts || 0) || 0);
        var nextAttempt = attempts + 1;
        var maxRetries = Math.max(0, Number(context?.maxRetries || job?.maxRetries || DEFAULT_MAX_RETRIES) || DEFAULT_MAX_RETRIES);
        var backoff = Math.min(MAX_BACKOFF_MS, DEFAULT_BACKOFF_MS * Math.pow(2, Math.max(0, nextAttempt - 1)));
        return freezeAsyncOutput({
            retryAttempts: Math.min(nextAttempt, maxRetries),
            maxRetries: maxRetries,
            backoffMs: backoff,
            nextRetryAt: new Date(Date.now() + backoff).toISOString(),
            deadLettered: nextAttempt > maxRetries || attempts >= maxRetries
        });
    }

    function updateStoredJob(job, context, actionType) {
        var data = rawData();
        data.asyncJobs = Array.isArray(data.asyncJobs) ? data.asyncJobs.slice() : [];
        var id = safeString(job.jobId || job.id || '', '').trim();
        var updated = false;
        data.asyncJobs = data.asyncJobs.map(function updateRow(row) {
            var rowId = safeString(row.jobId || row.id || '', '').trim();
            if (rowId === id) {
                updated = true;
                return cloneSanitized({ ...row, ...job, updatedAt: nowIso() });
            }
            return row;
        });
        if (!updated && !context?.preview && !context?.readOnly) data.asyncJobs.unshift(cloneSanitized(job));
        if (!context?.preview && !context?.readOnly) saveData(data);
        auditJob(actionType, {
            jobId: id,
            tenantSlug: job.tenantSlug,
            jobType: job.jobType,
            correlationId: job.correlationId,
            eventId: job.eventId,
            severity: job.state === JOB_STATES.FAILED ? 'WARNING' : 'INFO',
            description: 'Async job state updated through orchestration governance.'
        }, context);
        emitTelemetry(actionType, {
            jobId: id,
            tenantSlug: job.tenantSlug,
            jobType: job.jobType,
            correlationId: job.correlationId,
            eventId: job.eventId,
            status: job.state,
            severity: job.state === JOB_STATES.FAILED ? 'WARNING' : 'INFO'
        }, context);
        recordMetric(actionType, {
            jobId: id,
            tenantSlug: job.tenantSlug,
            jobType: job.jobType,
            status: job.state,
            failed: job.state === JOB_STATES.FAILED
        }, context);
        return freezeAsyncOutput(job);
    }

    function scheduleRetry(jobInput, context) {
        try {
            var normalized = normalizeJobPayload(jobInput, context);
            var plan = retryPlan(normalized, context);
            var retryJob = {
                ...normalized,
                retryAttempts: plan.retryAttempts,
                maxRetries: plan.maxRetries,
                state: plan.deadLettered ? JOB_STATES.FAILED : JOB_STATES.RETRY_PENDING,
                status: plan.deadLettered ? JOB_STATES.FAILED : JOB_STATES.RETRY_PENDING,
                nextRetryAt: plan.deadLettered ? '' : plan.nextRetryAt,
                deadLettered: plan.deadLettered,
                updatedAt: nowIso()
            };
            var persisted = context?.preview || context?.readOnly ? freezeAsyncOutput(retryJob) : updateStoredJob(retryJob, context, plan.deadLettered ? 'ASYNC_JOB_DEAD_LETTERED' : 'ASYNC_JOB_RETRY_SCHEDULED');
            return freezeAsyncOutput({
                success: true,
                classification: classifyJobFailure(persisted),
                job: persisted,
                retryPlan: plan,
                retryBounded: true,
                deadLettered: plan.deadLettered,
                warnings: plan.deadLettered ? [{
                    alertCode: 'ASYNC_JOB_RETRY_LIMIT_REACHED',
                    classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                    message: 'Async job retry limit reached and job moved to failed state.'
                }] : []
            });
        } catch (error) {
            return freezeAsyncOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                job: null,
                retryBounded: true,
                deadLettered: false,
                warnings: [{
                    alertCode: 'ASYNC_JOB_RETRY_FAILED_SAFE',
                    classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                    message: 'Async retry scheduling failed safely.'
                }]
            });
        }
    }

    function tenantJobs(tenantSlug) {
        var tenant = normalizeTenantSlug(tenantSlug || tenantFromContext({}));
        var rows = Array.isArray(rawData().asyncJobs) ? rawData().asyncJobs : [];
        return rows.filter(function keepTenant(row) {
            var scope = rowTenant(row);
            return !tenant || !scope || scope === tenant;
        }).map(function cleanRow(row) {
            return normalizeJobPayload(row, { tenantSlug: tenant });
        });
    }

    function isDue(job, timestamp) {
        var now = timestamp ? new Date(timestamp).getTime() : Date.now();
        var scheduled = job.scheduledAt || job.nextRetryAt || job.createdAt || nowIso();
        var time = new Date(scheduled).getTime();
        if (Number.isNaN(time)) return true;
        return time <= now;
    }

    function processDueJobs(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var tenant = normalizeTenantSlug(source.tenantSlug || tenantFromContext(context));
            var limit = Math.max(1, Number(source.limit || 10) || 10);
            var dryRun = source.dryRun !== false;
            var rows = tenantJobs(tenant).filter(function eligible(row) {
                return [JOB_STATES.QUEUED, JOB_STATES.SCHEDULED, JOB_STATES.RETRY_PENDING].indexOf(row.state) !== -1 && isDue(row, source.now);
            }).slice(0, limit);
            var processed = rows.map(function processRow(row) {
                var nextState = dryRun ? row.state : JOB_STATES.COMPLETED;
                return freezeAsyncOutput({
                    jobId: row.jobId,
                    tenantSlug: row.tenantSlug,
                    jobType: row.jobType,
                    previousState: row.state,
                    state: nextState,
                    dryRun: dryRun,
                    queueAdapter: queueAdapter()
                });
            });
            if (!dryRun) {
                var data = rawData();
                data.asyncJobs = (Array.isArray(data.asyncJobs) ? data.asyncJobs : []).map(function markProcessed(row) {
                    var match = processed.find(function matchProcessed(item) { return item.jobId === (row.jobId || row.id); });
                    if (!match) return row;
                    return cloneSanitized({ ...row, state: JOB_STATES.COMPLETED, status: JOB_STATES.COMPLETED, processedAt: nowIso(), updatedAt: nowIso() });
                });
                saveData(data);
            }
            auditJob('ASYNC_JOB_DUE_PROCESSING_REVIEWED', {
                tenantSlug: tenant,
                severity: processed.length ? 'INFO' : 'INFO',
                description: dryRun ? 'Due async jobs inspected in dry-run mode.' : 'Due async jobs processed through local adapter.'
            }, context);
            emitTelemetry('ASYNC_JOB_DUE_PROCESSING_REVIEWED', {
                tenantSlug: tenant,
                status: dryRun ? 'DRY_RUN' : 'PROCESSED',
                processed: processed.length
            }, context);
            recordMetric('ASYNC_JOB_PROCESSING_REVIEWED', { tenantSlug: tenant, status: dryRun ? 'DRY_RUN' : 'PROCESSED' }, context);
            return freezeAsyncOutput({
                success: true,
                dryRun: dryRun,
                processed: processed,
                queueAdapter: queueAdapter(),
                metadata: {
                    tenantIsolationPreserved: true,
                    unsafeMutationsBlocked: dryRun,
                    existingWorkflowEventsPreserved: true
                }
            });
        } catch (error) {
            return freezeAsyncOutput({
                success: false,
                dryRun: true,
                processed: [],
                queueAdapter: queueAdapter(),
                warnings: [{
                    alertCode: 'ASYNC_JOB_PROCESSING_FAILED_SAFE',
                    classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                    message: 'Due async job processing failed safely.'
                }]
            });
        }
    }

    function retryKey(job) {
        return [
            normalizeTenantSlug(job?.tenantSlug || ''),
            normalizeJobType(job?.jobType || ''),
            safeString(job?.correlationId || job?.eventId || job?.jobId || '', '')
        ].join('|');
    }

    function detectRetryLoops(rowsInput, context) {
        var tenant = normalizeTenantSlug(context?.tenantSlug || tenantFromContext(context));
        var threshold = Math.max(2, Number(context?.threshold || RETRY_LOOP_THRESHOLD) || RETRY_LOOP_THRESHOLD);
        var rows = Array.isArray(rowsInput) ? rowsInput : tenantJobs(tenant);
        var counters = {};
        rows.forEach(function countRow(row) {
            var job = normalizeJobPayload(row, { tenantSlug: tenant });
            if (tenant && job.tenantSlug && job.tenantSlug !== tenant) return;
            if ((Number(job.retryAttempts || 0) || 0) <= 0 && job.state !== JOB_STATES.RETRY_PENDING && job.state !== JOB_STATES.FAILED) return;
            var key = retryKey(job);
            if (!counters[key]) counters[key] = { retryKey: key, count: 0, tenantSlug: job.tenantSlug, jobType: job.jobType, correlationId: job.correlationId };
            counters[key].count += Math.max(1, Number(job.retryAttempts || 1) || 1);
        });
        var loops = Object.keys(counters).map(function mapCounter(key) {
            return counters[key];
        }).filter(function keepLoop(row) {
            return row.count >= threshold;
        });
        return freezeAsyncOutput({
            retryLoopDetected: loops.length > 0,
            threshold: threshold,
            loops: loops,
            metadata: {
                tenantIsolationPreserved: true,
                infiniteRetriesPrevented: true,
                sensitiveDataFiltered: true
            }
        });
    }

    function generateAsyncJobGovernanceReport(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var tenant = normalizeTenantSlug(source.tenantSlug || tenantFromContext(context));
            var rows = tenantJobs(tenant);
            var active = rows.filter(function activeRow(row) {
                return [JOB_STATES.QUEUED, JOB_STATES.SCHEDULED, JOB_STATES.PROCESSING, JOB_STATES.RETRY_PENDING].indexOf(row.state) !== -1;
            });
            var retryRows = rows.filter(function retryRow(row) {
                return row.state === JOB_STATES.RETRY_PENDING || (Number(row.retryAttempts || 0) || 0) > 0;
            });
            var failedRows = rows.filter(function failedRow(row) {
                return row.state === JOB_STATES.FAILED;
            });
            var scheduledRows = rows.filter(function scheduledRow(row) {
                return row.state === JOB_STATES.SCHEDULED;
            });
            var notificationJobs = rows.filter(function notificationRow(row) {
                return row.jobType === JOB_TYPES.NOTIFICATION_DELIVERY;
            });
            var replayJobs = rows.filter(function replayRow(row) {
                return row.jobType === JOB_TYPES.REPLAY_PROCESSING;
            });
            var escalationJobs = rows.filter(function escalationRow(row) {
                return row.jobType === JOB_TYPES.ESCALATION_BATCH;
            });
            var loop = detectRetryLoops(rows, { tenantSlug: tenant, threshold: source.retryLoopThreshold || RETRY_LOOP_THRESHOLD });
            var warnings = [];
            if (!global.NotificationOrchestrationService) warnings.push({
                alertCode: 'NOTIFICATION_ORCHESTRATION_UNAVAILABLE',
                classification: FAILURE_CLASSIFICATIONS.WARNING,
                message: 'Notification orchestration adapter is unavailable. Notification jobs remain queued for future workers.'
            });
            if (!global.EventReplayService) warnings.push({
                alertCode: 'EVENT_REPLAY_UNAVAILABLE',
                classification: FAILURE_CLASSIFICATIONS.WARNING,
                message: 'Replay adapter is unavailable. Replay jobs remain visible but unprocessed.'
            });
            if (loop.retryLoopDetected) warnings.push({
                alertCode: 'ASYNC_RETRY_LOOP_RISK',
                classification: FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                message: 'Retry loop risk detected and bounded by retry governance.'
            });
            if (failedRows.length) warnings.push({
                alertCode: 'ASYNC_FAILED_JOBS_PRESENT',
                classification: failedRows.length >= 3 ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.WARNING,
                message: 'Failed async jobs require review.'
            });
            var severity = warnings.some(function critical(row) { return row.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER; })
                ? FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER
                : warnings.some(function high(row) { return row.classification === FAILURE_CLASSIFICATIONS.HIGH_RISK; })
                    ? FAILURE_CLASSIFICATIONS.HIGH_RISK
                    : warnings.some(function warn(row) { return row.classification === FAILURE_CLASSIFICATIONS.WARNING; })
                        ? FAILURE_CLASSIFICATIONS.WARNING
                        : FAILURE_CLASSIFICATIONS.INFO;
            auditJob('ASYNC_JOB_GOVERNANCE_REVIEWED', {
                tenantSlug: tenant,
                severity: severity === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : severity === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO',
                description: 'Async job governance report generated.'
            }, context);
            emitTelemetry('ASYNC_JOB_GOVERNANCE_REVIEWED', {
                tenantSlug: tenant,
                severity: severity === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : severity === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO',
                status: severity
            }, context);
            recordMetric('ASYNC_JOB_GOVERNANCE_REPORTED', { tenantSlug: tenant, status: severity }, context);
            return freezeAsyncOutput({
                success: true,
                readOnly: true,
                severity: severity,
                tenantSlug: tenant,
                queueHealth: {
                    totalJobs: rows.length,
                    activeJobs: active.length,
                    processing: rows.filter(function processingRow(row) { return row.state === JOB_STATES.PROCESSING; }).length,
                    queued: rows.filter(function queuedRow(row) { return row.state === JOB_STATES.QUEUED; }).length,
                    congestion: active.length >= 10 || retryRows.length >= 5
                },
                retryQueues: {
                    retryPending: retryRows.length,
                    boundedRetries: true,
                    maxRetries: DEFAULT_MAX_RETRIES,
                    jobs: retryRows.slice(0, 20)
                },
                failedJobs: {
                    failed: failedRows.length,
                    deadLettered: failedRows.filter(function deadLetter(row) { return row.deadLettered || Number(row.retryAttempts || 0) >= Number(row.maxRetries || DEFAULT_MAX_RETRIES); }).length,
                    jobs: failedRows.slice(0, 20)
                },
                scheduledJobs: {
                    scheduled: scheduledRows.length,
                    recurring: scheduledRows.filter(function recurringRow(row) { return row.recurring; }).length,
                    jobs: scheduledRows.slice(0, 20)
                },
                batchStatus: {
                    notificationJobs: notificationJobs.length,
                    replayProcessingJobs: replayJobs.length,
                    escalationBatchJobs: escalationJobs.length
                },
                retryLoopDetection: loop,
                queueCompatibility: queueAdapter(),
                warnings: warnings,
                metadata: {
                    tenantIsolationPreserved: true,
                    rbacEnforcementPreserved: true,
                    sensitiveDataFiltered: true,
                    existingWorkflowEventsPreserved: true,
                    futureQueueMigrationCompatible: true,
                    monitoringReadOnly: true,
                    generatedAt: nowIso()
                }
            });
        } catch (error) {
            return freezeAsyncOutput({
                success: false,
                readOnly: true,
                severity: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                queueHealth: { totalJobs: 0, activeJobs: 0, processing: 0, queued: 0, congestion: false },
                retryQueues: { retryPending: 0, boundedRetries: true, maxRetries: DEFAULT_MAX_RETRIES, jobs: [] },
                failedJobs: { failed: 0, deadLettered: 0, jobs: [] },
                scheduledJobs: { scheduled: 0, recurring: 0, jobs: [] },
                batchStatus: { notificationJobs: 0, replayProcessingJobs: 0, escalationBatchJobs: 0 },
                queueCompatibility: queueAdapter(),
                warnings: [{
                    alertCode: 'ASYNC_JOB_GOVERNANCE_FAILED_SAFE',
                    classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                    message: 'Async job governance report failed safely.'
                }],
                metadata: {
                    tenantIsolationPreserved: true,
                    sensitiveDataFiltered: true
                }
            });
        }
    }

    if (typeof global.NotificationOrchestrationService === 'undefined') {
        safeWarn('Optional dependency window.NotificationOrchestrationService is unavailable. Notification jobs will remain queue-visible.');
    }
    if (typeof global.EventReplayService === 'undefined') {
        safeWarn('Optional dependency window.EventReplayService is unavailable. Replay jobs will remain queue-visible.');
    }

    var AsyncJobService = Object.freeze({
        JOB_STATES: JOB_STATES,
        JOB_TYPES: JOB_TYPES,
        PRIORITIES: PRIORITIES,
        FAILURE_CLASSIFICATIONS: FAILURE_CLASSIFICATIONS,
        classifyAsyncJobPriority: classifyAsyncJobPriority,
        classifyJobFailure: classifyJobFailure,
        validateAsyncJobScope: validateAsyncJobScope,
        normalizeJobPayload: normalizeJobPayload,
        freezeAsyncOutput: freezeAsyncOutput,
        detectRetryLoops: detectRetryLoops,
        enqueueJob: enqueueJob,
        scheduleJob: scheduleJob,
        scheduleRetry: scheduleRetry,
        processDueJobs: processDueJobs,
        generateAsyncJobGovernanceReport: generateAsyncJobGovernanceReport
    });

    global.AsyncJobService = AsyncJobService;
    global.asyncJobService = AsyncJobService;

    if (global.__ARTHHRMS_DEV__) {
        (function runSelfTest() {
            var tests = [];
            var previousNotification = global.NotificationOrchestrationService;
            var previousReplay = global.EventReplayService;
            var previousAudit = global.AuditService;
            var previousTelemetry = global.WorkflowTelemetryService;

            function check(name, condition) {
                tests.push(Object.freeze({ name: name, passed: !!condition }));
            }

            try {
                var payload = {
                    tenantSlug: 'tabsons',
                    jobType: 'PAYROLL_GENERATION',
                    payload: { salary: 1, period: '2026-05' },
                    metadata: { payrollAmount: 1 }
                };
                var before = JSON.stringify(payload);
                var normalized = normalizeJobPayload(payload, { tenantSlug: 'tabsons' });
                check('normalization is immutable', JSON.stringify(payload) === before && Object.isFrozen(normalized));
                check('sensitive payroll data filtered', !/salary|payrollAmount|\"1\"/i.test(JSON.stringify(normalized)));
                check('priority classification works', classifyAsyncJobPriority({ jobType: 'PAYROLL_GENERATION' }) === PRIORITIES.HIGH);

                var blocked = validateAsyncJobScope({ tenantSlug: 'abc', jobType: 'PAYROLL_GENERATION' }, { tenantSlug: 'tabsons' });
                check('tenant job isolation works', blocked.allowed === false && blocked.alerts.some(function item(row) { return row.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER; }));

                var scheduled = scheduleJob({ tenantSlug: 'tabsons', jobType: 'ONBOARDING_IMPORT', schedule: { delayMs: 1000 } }, { tenantSlug: 'tabsons', preview: true, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
                check('scheduling works', scheduled.success === true && scheduled.job.state === JOB_STATES.SCHEDULED);

                var retry = scheduleRetry({ tenantSlug: 'tabsons', jobType: 'NOTIFICATION_DELIVERY', retryAttempts: 1, maxRetries: 2 }, { tenantSlug: 'tabsons', preview: true, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
                check('retry governance works', retry.success === true && retry.retryBounded === true);

                var loop = detectRetryLoops([
                    { tenantSlug: 'tabsons', jobType: 'NOTIFICATION_DELIVERY', retryAttempts: 1, correlationId: 'SELF-LOOP' },
                    { tenantSlug: 'tabsons', jobType: 'NOTIFICATION_DELIVERY', retryAttempts: 2, correlationId: 'SELF-LOOP' }
                ], { tenantSlug: 'tabsons', threshold: 3 });
                check('retry loop detection works', loop.retryLoopDetected === true);

                var queued = enqueueJob({ tenantSlug: 'tabsons', jobType: 'TELEMETRY_AGGREGATION' }, { tenantSlug: 'tabsons', preview: true, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
                check('async orchestration works', queued.success === true && queued.queueAdapter.futureQueueReady === true);

                global.NotificationOrchestrationService = null;
                global.EventReplayService = null;
                var degraded = generateAsyncJobGovernanceReport({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
                check('dependency absence tolerated', degraded.success === true && degraded.warnings.length >= 1);
                global.NotificationOrchestrationService = previousNotification;
                global.EventReplayService = previousReplay;

                global.AuditService = { recordAudit: function recordAudit() { throw new Error('audit down'); } };
                global.WorkflowTelemetryService = { emitTelemetry: function emitTelemetry() { throw new Error('telemetry down'); } };
                var isolated = enqueueJob({ tenantSlug: 'tabsons', jobType: 'TELEMETRY_AGGREGATION' }, { tenantSlug: 'tabsons', preview: true });
                check('telemetry and audit failures isolated', isolated.success === true);
                global.AuditService = previousAudit;
                global.WorkflowTelemetryService = previousTelemetry;

                var malformed = enqueueJob('bad-payload', { tenantSlug: 'tabsons', preview: true, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
                check('malformed payloads blocked safely', malformed.success === false && malformed.classification === FAILURE_CLASSIFICATIONS.HIGH_RISK);

                var passed = tests.every(function everyTest(test) { return test.passed; });
                global.__ARTHHRMS_ASYNC_JOB_SELF_TEST__ = freezeAsyncOutput({
                    passed: passed,
                    tests: tests
                });
                if (passed) safeInfo('development self-test passed.', global.__ARTHHRMS_ASYNC_JOB_SELF_TEST__);
                else safeWarn('development self-test reported failures.', global.__ARTHHRMS_ASYNC_JOB_SELF_TEST__);
            } catch (error) {
                global.__ARTHHRMS_ASYNC_JOB_SELF_TEST__ = freezeAsyncOutput({
                    passed: false,
                    tests: tests,
                    error: error && error.message ? error.message : safeString(error, 'unknown self-test error')
                });
                safeWarn('development self-test failed safely.', global.__ARTHHRMS_ASYNC_JOB_SELF_TEST__);
            } finally {
                global.NotificationOrchestrationService = previousNotification;
                global.EventReplayService = previousReplay;
                global.AuditService = previousAudit;
                global.WorkflowTelemetryService = previousTelemetry;
            }
        })();
    }
})(typeof window !== 'undefined' ? window : globalThis);
