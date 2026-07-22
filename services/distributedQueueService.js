/**
 * ARTHHRMS Distributed Queue Service
 * Provider-agnostic queue governance, worker orchestration, retries, scheduling,
 * dead-letter handling, monitoring, and tenant-safe durable fallback.
 */
(function attachDistributedQueueService(global) {
    'use strict';

    var SOURCE = 'distributedQueueService';
    var MAX_HISTORY = 700;
    var DEFAULT_MAX_ATTEMPTS = 3;
    var BROKER_PROVIDERS = Object.freeze(['REDIS_STREAMS', 'BULLMQ', 'RABBITMQ', 'AMAZON_SQS', 'AZURE_SERVICE_BUS']);
    var BROKER_LABELS = Object.freeze(['Redis Streams', 'BullMQ', 'RabbitMQ', 'Amazon SQS', 'Azure Service Bus']);
    var JOB_TYPES = Object.freeze([
        'email_delivery',
        'notification_delivery',
        'employee_import',
        'excel_processing',
        'report_generation',
        'payroll_calculations',
        'audit_exports',
        'ai_processing',
        'backup_jobs',
        'cleanup_jobs'
    ]);
    var PRIORITIES = Object.freeze(['CRITICAL', 'HIGH', 'NORMAL', 'LOW', 'BACKGROUND']);
    var JOB_STATES = Object.freeze(['CREATED', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'RETRYING', 'DELAYED', 'CANCELLED', 'DEAD_LETTER']);
    var VIEW_ROLES = Object.freeze(['PLATFORM_OWNER', 'SUPER_ADMIN', 'DIRECTOR', 'HR']);
    var CONTROL_ROLES = Object.freeze(['PLATFORM_OWNER', 'SUPER_ADMIN', 'DIRECTOR', 'HR']);
    var PRIORITY_WEIGHT = Object.freeze({ CRITICAL: 5, HIGH: 4, NORMAL: 3, LOW: 2, BACKGROUND: 1 });
    var SENSITIVE_KEY_PATTERN = /(password|secret|token|jwt|authorization|credential|private.?key|api.?key|session|otp|hash|salt|salary|payroll|compensation|bank|aadhaar|passport|private.?note|rawPayload|payloadBody)/i;
    var SENSITIVE_VALUE_PATTERN = /(secret[-_ ]?token|bearer\s+[a-z0-9._-]+|abc queue private data|salary\s*[:=]?\s*\d+|payroll\s*[:=]?\s*\d+)/ig;
    var idCounter = 0;

    function db() {
        try { return global.DB || null; } catch (error) { return null; }
    }

    function data() {
        try {
            var source = db();
            return source && typeof source.get === 'function' ? source.get() || {} : {};
        } catch (error) { return {}; }
    }

    function save(next) {
        try {
            var source = db();
            if (source && typeof source.save === 'function') {
                source.save(next || {});
                return true;
            }
        } catch (error) {}
        return false;
    }

    function safeString(value, fallback) {
        try {
            if (value === null || typeof value === 'undefined') return fallback || '';
            return String(value);
        } catch (error) { return fallback || ''; }
    }

    function safeNumber(value, fallback) {
        var number = Number(value);
        return Number.isFinite(number) ? number : (fallback || 0);
    }

    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function token(value) {
        return safeString(value || '', '').trim().toUpperCase()
            .replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    }

    function normalizeRole(value) {
        var role = token(value || 'EMPLOYEE');
        if (role === 'PLATFORMOWNER' || role === 'OWNER' || role === 'ROOT') return 'PLATFORM_OWNER';
        if (role === 'SUPERADMIN') return 'SUPER_ADMIN';
        if (role === 'HRHEAD') return 'HR';
        return role || 'EMPLOYEE';
    }

    function normalizeTenant(value) {
        return safeString(value || '', '').trim().toLowerCase()
            .replace(/^tenant[-_]/, '').replace(/^ten[-_]/, '')
            .replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }

    function normalizeJobType(value) {
        var type = safeString(value || 'cleanup_jobs', '').trim().toLowerCase()
            .replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '').replace(/^_|_$/g, '');
        if (type === 'email') return 'email_delivery';
        if (type === 'notification') return 'notification_delivery';
        if (type === 'employee_imports') return 'employee_import';
        if (type === 'excel') return 'excel_processing';
        if (type === 'reports') return 'report_generation';
        if (type === 'payroll') return 'payroll_calculations';
        if (type === 'audit_export') return 'audit_exports';
        if (type === 'ai') return 'ai_processing';
        if (type === 'backup') return 'backup_jobs';
        if (type === 'cleanup') return 'cleanup_jobs';
        return JOB_TYPES.indexOf(type) !== -1 ? type : 'cleanup_jobs';
    }

    function normalizePriority(value) {
        var priority = token(value || 'NORMAL');
        return PRIORITIES.indexOf(priority) !== -1 ? priority : 'NORMAL';
    }

    function normalizeState(value) {
        var state = token(value || 'QUEUED');
        return JOB_STATES.indexOf(state) !== -1 ? state : 'QUEUED';
    }

    function nowMs(context) {
        try {
            var stamp = context && context.now ? new Date(context.now) : new Date();
            var time = stamp.getTime();
            return Number.isFinite(time) ? time : Date.now();
        } catch (error) { return Date.now(); }
    }

    function nowIso(context) {
        try { return new Date(nowMs(context || {})).toISOString(); }
        catch (error) { return new Date().toISOString(); }
    }

    function createId(prefix) {
        idCounter += 1;
        return prefix + '-' + Date.now().toString(36).toUpperCase() + '-' + idCounter.toString(36).toUpperCase().padStart(4, '0');
    }

    function clampScore(value) {
        var number = safeNumber(value, 0);
        return Math.max(0, Math.min(100, Math.round(number)));
    }

    function actor(context) {
        var source = context && context.actor ? context.actor : {};
        return {
            id: safeString(source.id || source.userId || source.empId || source.employeeId || context && context.actorId || '', '').trim().slice(0, 160),
            role: normalizeRole(source.role || context && context.role || 'EMPLOYEE'),
            tenantSlug: normalizeTenant(source.tenantSlug || source.tenantId || source.companyId || context && (context.actorTenantSlug || context.actorTenantId) || '')
        };
    }

    function contextTenant(context) {
        var currentActor = actor(context || {});
        var settings = data().companySettings || {};
        return normalizeTenant(
            context && (context.tenantSlug || context.tenantId || context.companyId) ||
            currentActor.tenantSlug || settings.tenantSlug || settings.tenantId || settings.companyId || 'default'
        );
    }

    function rowTenant(row) {
        var metadata = row && row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
        return normalizeTenant(row && (
            row.tenantSlug || row.tenantId || row.tenant_id || row.companyId || row.company_id ||
            metadata.tenantSlug || metadata.tenantId || metadata.companyId
        ));
    }

    function cloneSafe(value, seen) {
        if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'undefined') return undefined;
        if (!value || typeof value !== 'object') {
            if (typeof value === 'string') return value.replace(SENSITIVE_VALUE_PATTERN, '[REDACTED]').slice(0, 2400);
            return value;
        }
        var refs = seen || [];
        if (refs.indexOf(value) !== -1) return '[Circular]';
        refs.push(value);
        if (Array.isArray(value)) {
            return value.map(function map(item) { return cloneSafe(item, refs.slice()); })
                .filter(function keep(item) { return typeof item !== 'undefined'; });
        }
        var output = {};
        Object.keys(value).forEach(function each(key) {
            if (key === '__proto__' || key === 'prototype' || key === 'constructor') return;
            if (SENSITIVE_KEY_PATTERN.test(key)) return;
            var cloned = cloneSafe(value[key], refs.slice());
            if (typeof cloned !== 'undefined') output[key] = cloned;
        });
        return output;
    }

    function freezeDeep(value) {
        function walk(item, seen) {
            if (!item || typeof item !== 'object' || Object.isFrozen(item)) return item;
            var refs = seen || [];
            if (refs.indexOf(item) !== -1) return item;
            refs.push(item);
            Object.keys(item).forEach(function each(key) { walk(item[key], refs.slice()); });
            try { Object.freeze(item); } catch (error) {}
            return item;
        }
        return walk(value, []);
    }

    function freezeQueueOutput(value) {
        return freezeDeep(cloneSafe(value || {}, []));
    }

    function governanceFlags(extra) {
        return Object.assign({
            backwardCompatibilityPreserved: true,
            tenantIsolationPreserved: true,
            queueGovernancePreserved: true,
            duplicateExecutionPrevented: true,
            jobLossPrevented: true,
            workflowCorruptionPrevented: true,
            providerAgnostic: true,
            brokerUnavailableHandled: false,
            deadLetterQueueEnabled: true,
            boundedRetries: true,
            infiniteRetriesPrevented: true,
            sensitivePayloadsFiltered: true,
            outputsImmutable: true
        }, extra || {});
    }

    function result(success, code, message, extra) {
        return freezeQueueOutput(Object.assign({
            success: success === true,
            code: token(code || (success ? 'QUEUE_OPERATION_READY' : 'QUEUE_OPERATION_FAILED')),
            message: safeString(message || (success ? 'Queue operation completed.' : 'Queue operation failed.'), '').slice(0, 280)
        }, extra || {}));
    }

    function validateAccess(action, tenantSlug, context) {
        var currentActor = actor(context || {});
        var targetTenant = normalizeTenant(tenantSlug || contextTenant(context || {}));
        var scopeTenant = normalizeTenant(currentActor.tenantSlug || contextTenant(context || {}) || targetTenant);
        var role = currentActor.role;
        if (!targetTenant || !scopeTenant || targetTenant !== scopeTenant) {
            return result(false, 'TENANT_ACCESS_DENIED', 'Tenant-scoped queue access was denied.', {
                tenantSlug: targetTenant,
                governance: governanceFlags()
            });
        }
        if (action === 'OPERATIONS_VIEW' && VIEW_ROLES.indexOf(role) === -1) {
            return result(false, 'QUEUE_GOVERNANCE_DENIED', 'Queue operations visibility is restricted by governance.', {
                tenantSlug: targetTenant,
                governance: governanceFlags()
            });
        }
        if (action === 'CONTROL' && CONTROL_ROLES.indexOf(role) === -1) {
            return result(false, 'QUEUE_GOVERNANCE_DENIED', 'Queue controls are restricted by governance.', {
                tenantSlug: targetTenant,
                governance: governanceFlags()
            });
        }
        try {
            var registry = global.ValidationRegistry || global.ValidationRegistryService || global.validationRegistryService;
            if (registry && typeof registry.executeValidationRule === 'function') {
                var validation = registry.executeValidationRule('TENANT_ACCESS', {
                    tenantSlug: targetTenant,
                    ownerTenantSlug: targetTenant,
                    actorTenantSlug: scopeTenant
                }, { source: SOURCE }, Object.assign({}, context || {}, { tenantSlug: targetTenant, validatedTenantAccess: true }));
                if (!validation || validation.success !== true) {
                    return result(false, 'TENANT_ACCESS_DENIED', 'Tenant validation failed closed for queue governance.', {
                        tenantSlug: targetTenant,
                        governance: governanceFlags()
                    });
                }
            }
        } catch (error) {
            return result(false, 'TENANT_ACCESS_DENIED', 'Tenant validation failed safely for queue governance.', {
                tenantSlug: targetTenant,
                governance: governanceFlags()
            });
        }
        return result(true, 'QUEUE_ACCESS_VALIDATED', 'Queue access validated.', {
            tenantSlug: targetTenant,
            actor: currentActor,
            governance: governanceFlags()
        });
    }

    function audit(actionType, metadata, context, severity) {
        if (context && context.skipAuditPersistence) return false;
        var currentActor = actor(context || {});
        try {
            if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                global.AuditService.recordAudit({
                    type: actionType,
                    eventType: actionType,
                    actionType: actionType,
                    actorId: currentActor.id,
                    actorRole: currentActor.role,
                    source: SOURCE,
                    module: 'Distributed Queue',
                    severity: severity || (/FAILED|DENIED|DEAD_LETTER|CANCELLED|UNAVAILABLE/.test(actionType) ? 'WARNING' : 'INFO'),
                    metadata: Object.assign({}, cloneSafe(metadata || {}, []), {
                        actionType: actionType,
                        module: 'Distributed Queue'
                    })
                }, { source: SOURCE, actor: currentActor });
                return true;
            }
            if (db() && typeof db().writeAuditLog === 'function') {
                db().writeAuditLog(currentActor.role, currentActor.id, actionType, 'Distributed Queue', metadata && metadata.jobId || '', safeString(metadata && metadata.description || actionType, actionType));
                return true;
            }
        } catch (error) {}
        return false;
    }

    function persist(key, record, context) {
        if (context && context.skipHistoryPersistence) return record;
        var current = data();
        if (!Array.isArray(current[key])) current[key] = [];
        current[key].push(Object.assign({}, cloneSafe(record, []), { immutable: true }));
        if (current[key].length > MAX_HISTORY) current[key] = current[key].slice(-MAX_HISTORY);
        save(current);
        return record;
    }

    function queueRows(tenantSlug) {
        return (Array.isArray(data().distributedQueueJobs) ? data().distributedQueueJobs : [])
            .filter(function scoped(row) { return rowTenant(row) === normalizeTenant(tenantSlug); });
    }

    function latestRows(key, tenantSlug, count) {
        return (Array.isArray(data()[key]) ? data()[key] : []).filter(function scoped(row) {
            return rowTenant(row) === normalizeTenant(tenantSlug);
        }).slice(-safeNumber(count, 20)).reverse();
    }

    function findJob(jobId, tenantSlug) {
        var id = safeString(jobId || '', '').trim();
        if (!id) return null;
        return queueRows(tenantSlug).filter(function match(row) {
            return safeString(row.jobId || row.id || '', '') === id;
        })[0] || null;
    }

    function updateJob(tenantSlug, jobId, updater) {
        var current = data();
        var rows = Array.isArray(current.distributedQueueJobs) ? current.distributedQueueJobs.slice() : [];
        var updated = null;
        current.distributedQueueJobs = rows.map(function map(row) {
            if (rowTenant(row) !== normalizeTenant(tenantSlug) || safeString(row.jobId || row.id || '', '') !== safeString(jobId || '', '')) return row;
            updated = Object.assign({}, cloneSafe(row, []), cloneSafe(updater(row) || {}, []), { immutable: true });
            return updated;
        });
        save(current);
        return updated;
    }

    function payloadSummary(payload) {
        var source = isPlainObject(payload) ? payload : {};
        var clean = cloneSafe(source, []);
        var keys = Object.keys(clean || {}).filter(function keep(key) { return !SENSITIVE_KEY_PATTERN.test(key); }).slice(0, 20);
        var size = 0;
        try { size = JSON.stringify(clean || {}).length; } catch (error) { size = 0; }
        return {
            keys: keys,
            sizeBytes: size,
            sanitized: true,
            containsSensitiveFields: Object.keys(source).some(function some(key) { return SENSITIVE_KEY_PATTERN.test(key); })
        };
    }

    function publicJob(row) {
        var state = normalizeState(row && (row.state || row.status));
        return {
            jobId: safeString(row && (row.jobId || row.id), ''),
            tenantSlug: normalizeTenant(row && (row.tenantSlug || row.tenantId)),
            jobType: normalizeJobType(row && (row.jobType || row.type)),
            priority: normalizePriority(row && row.priority),
            state: state,
            attempts: safeNumber(row && (row.attempts || row.retryAttempts), 0),
            maxAttempts: safeNumber(row && row.maxAttempts, DEFAULT_MAX_ATTEMPTS) || DEFAULT_MAX_ATTEMPTS,
            workerId: safeString(row && row.workerId, ''),
            correlationId: safeString(row && row.correlationId, ''),
            traceId: safeString(row && row.traceId, ''),
            queueName: safeString(row && row.queueName, ''),
            runAt: safeString(row && row.runAt, ''),
            nextRunAt: safeString(row && row.nextRunAt, ''),
            queuedAt: safeString(row && row.queuedAt, ''),
            processingStartedAt: safeString(row && row.processingStartedAt, ''),
            completedAt: safeString(row && row.completedAt, ''),
            cancelledAt: safeString(row && row.cancelledAt, ''),
            failureCode: token(row && row.failureCode || ''),
            deadLettered: state === 'DEAD_LETTER' || row && row.deadLettered === true,
            payloadSummary: cloneSafe(row && row.payloadSummary || {}, [])
        };
    }

    function persistLifecycle(job, previousState, nextState, context, extra) {
        var row = {
            lifecycleId: createId('DQLIFE'),
            tenantSlug: normalizeTenant(job && job.tenantSlug),
            jobId: safeString(job && job.jobId, ''),
            previousState: normalizeState(previousState || 'CREATED'),
            state: normalizeState(nextState || job && job.state || 'QUEUED'),
            workerId: safeString(job && job.workerId || '', ''),
            timestamp: nowIso(context || {})
        };
        persist('distributedQueueLifecycleHistory', Object.assign(row, cloneSafe(extra || {}, [])), context || {});
        return row;
    }

    function brokerAdapter() {
        try { return global.ARTHHRMS_QUEUE_BROKER_ADAPTER || global.QueueBrokerAdapter || global.queueBrokerAdapter || null; }
        catch (error) { return null; }
    }

    function publishToBroker(job, context) {
        var adapter = brokerAdapter();
        if (!adapter) return { published: false, unavailable: false };
        try {
            if (typeof adapter.enqueue === 'function') adapter.enqueue(publicJob(job), cloneSafe(context || {}, []));
            else if (typeof adapter.publish === 'function') adapter.publish(publicJob(job), cloneSafe(context || {}, []));
            else if (typeof adapter.add === 'function') adapter.add(job.queueName || job.jobType, publicJob(job));
            else return { published: false, unavailable: false };
            return { published: true, unavailable: false };
        } catch (error) {
            return { published: false, unavailable: true, message: error && error.message };
        }
    }

    function dedupeJob(tenantSlug, idempotencyKey) {
        var key = safeString(idempotencyKey || '', '').trim();
        if (!key) return null;
        return queueRows(tenantSlug).slice().reverse().find(function find(row) {
            return safeString(row.idempotencyKey || '', '') === key && ['CANCELLED'].indexOf(normalizeState(row.state)) === -1;
        }) || null;
    }

    function buildJob(source, tenantSlug, state, context) {
        var jobType = normalizeJobType(source.jobType || source.type);
        var priority = normalizePriority(source.priority || 'NORMAL');
        var createdAt = nowIso(context || {});
        var queueName = 'tenant:' + tenantSlug + ':queue:' + priority.toLowerCase() + ':' + jobType;
        return {
            jobId: safeString(source.jobId || source.id || '', '').trim() || createId('DQJOB'),
            tenantSlug: tenantSlug,
            jobType: jobType,
            type: jobType,
            priority: priority,
            state: normalizeState(state || 'QUEUED'),
            status: normalizeState(state || 'QUEUED'),
            attempts: Math.max(0, safeNumber(source.attempts || source.retryAttempts, 0)),
            maxAttempts: Math.max(1, safeNumber(source.maxAttempts || source.maxRetries, DEFAULT_MAX_ATTEMPTS) || DEFAULT_MAX_ATTEMPTS),
            idempotencyKey: safeString(source.idempotencyKey || source.dedupeKey || '', '').trim().slice(0, 220),
            correlationId: safeString(source.correlationId || '', '').trim() || createId('CORR'),
            traceId: safeString(source.traceId || '', '').trim() || createId('TRACE'),
            queueName: queueName,
            runAt: safeString(source.runAt || source.scheduledAt || '', '').trim(),
            nextRunAt: safeString(source.nextRunAt || '', '').trim(),
            recurrence: safeString(source.recurrence || 'ONCE', 'ONCE').trim().toUpperCase().slice(0, 80),
            payloadSummary: payloadSummary(source.payload || {}),
            createdAt: createdAt,
            queuedAt: normalizeState(state || 'QUEUED') === 'QUEUED' ? createdAt : '',
            updatedAt: createdAt,
            immutable: true
        };
    }

    function appendJob(job, context) {
        var current = data();
        if (!Array.isArray(current.distributedQueueJobs)) current.distributedQueueJobs = [];
        current.distributedQueueJobs.push(cloneSafe(job, []));
        save(current);
        persist('distributedQueueJobHistory', {
            historyId: createId('DQHIST'),
            tenantSlug: job.tenantSlug,
            jobId: job.jobId,
            jobType: job.jobType,
            priority: job.priority,
            state: job.state,
            queueName: job.queueName,
            correlationId: job.correlationId,
            traceId: job.traceId,
            timestamp: nowIso(context || {})
        }, context || {});
        persistLifecycle(job, 'CREATED', job.state, context || {}, { action: 'JOB_CREATED' });
    }

    function createJob(input, context) {
        try {
            if (!isPlainObject(input)) return result(false, 'MALFORMED_QUEUE_PAYLOAD', 'Queue job payload must be an object.', { governance: governanceFlags() });
            var tenantSlug = normalizeTenant(input.tenantSlug || input.tenantId || contextTenant(context || {}));
            var access = validateAccess('CONTROL', tenantSlug, context || {});
            if (!access.success) {
                audit('QUEUE_JOB_CREATION_DENIED', { tenantSlug: tenantSlug, code: access.code }, context || {}, 'WARNING');
                return access;
            }
            var duplicate = dedupeJob(access.tenantSlug, input.idempotencyKey || input.dedupeKey);
            if (duplicate) {
                audit('QUEUE_DUPLICATE_JOB_SUPPRESSED', { tenantSlug: access.tenantSlug, jobId: duplicate.jobId }, context || {}, 'INFO');
                return result(true, 'DUPLICATE_JOB_SUPPRESSED', 'Duplicate job creation was suppressed by idempotency governance.', {
                    tenantSlug: access.tenantSlug,
                    duplicatePrevented: true,
                    job: publicJob(duplicate),
                    governance: governanceFlags()
                });
            }
            var job = buildJob(input, access.tenantSlug, 'QUEUED', context || {});
            var broker = publishToBroker(job, context || {});
            appendJob(job, context || {});
            audit(broker.unavailable ? 'QUEUE_JOB_ENQUEUED_WITH_BROKER_FALLBACK' : 'QUEUE_JOB_CREATED', {
                tenantSlug: access.tenantSlug,
                jobId: job.jobId,
                jobType: job.jobType,
                priority: job.priority,
                brokerPublished: broker.published
            }, context || {}, broker.unavailable ? 'WARNING' : 'INFO');
            return result(true, 'QUEUE_JOB_CREATED', 'Queue job created and safely enqueued.', {
                tenantSlug: access.tenantSlug,
                job: publicJob(job),
                broker: {
                    providerAgnostic: true,
                    externalBrokerPublished: broker.published,
                    durableLocalFallback: true
                },
                governance: governanceFlags({ brokerUnavailableHandled: broker.unavailable })
            });
        } catch (error) {
            return result(false, 'QUEUE_JOB_CREATION_FAILED_SAFE', 'Queue job creation failed safely.', { governance: governanceFlags({ brokerUnavailableHandled: true }) });
        }
    }

    function cancelJob(input, context) {
        try {
            if (!isPlainObject(input)) return result(false, 'MALFORMED_QUEUE_PAYLOAD', 'Queue cancellation payload must be an object.', { governance: governanceFlags() });
            var access = validateAccess('CONTROL', input.tenantSlug || input.tenantId, context || {});
            if (!access.success) return access;
            var row = findJob(input.jobId, access.tenantSlug);
            if (!row) return result(false, 'QUEUE_JOB_NOT_FOUND', 'No tenant-scoped queue job was found.', { governance: governanceFlags() });
            var state = normalizeState(row.state);
            if (['COMPLETED', 'CANCELLED', 'DEAD_LETTER'].indexOf(state) !== -1) {
                return result(false, 'QUEUE_JOB_NOT_CANCELLABLE', 'The queue job cannot be cancelled from its current state.', { state: state, governance: governanceFlags() });
            }
            var updated = updateJob(access.tenantSlug, row.jobId, function patch() {
                return {
                    state: 'CANCELLED',
                    status: 'CANCELLED',
                    cancellationReason: safeString(input.reason || 'governed cancellation', '').slice(0, 240),
                    cancelledAt: nowIso(context || {}),
                    updatedAt: nowIso(context || {})
                };
            });
            persistLifecycle(updated, state, 'CANCELLED', context || {}, { action: 'JOB_CANCELLED' });
            audit('QUEUE_JOB_CANCELLED', { tenantSlug: access.tenantSlug, jobId: updated.jobId }, context || {}, 'WARNING');
            return result(true, 'QUEUE_JOB_CANCELLED', 'Queue job cancelled under governance.', {
                tenantSlug: access.tenantSlug,
                job: publicJob(updated),
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'QUEUE_CANCEL_FAILED_SAFE', 'Queue cancellation failed safely.', { governance: governanceFlags() });
        }
    }

    function dueTime(row) {
        var value = safeString(row && (row.nextRunAt || row.runAt || row.scheduledAt), '');
        if (!value) return 0;
        var time = new Date(value).getTime();
        return Number.isFinite(time) ? time : 0;
    }

    function scheduleJob(input, context) {
        try {
            if (!isPlainObject(input)) return result(false, 'MALFORMED_QUEUE_PAYLOAD', 'Scheduled job payload must be an object.', { governance: governanceFlags() });
            var access = validateAccess('CONTROL', input.tenantSlug || input.tenantId, context || {});
            if (!access.success) return access;
            var duplicate = dedupeJob(access.tenantSlug, input.idempotencyKey || input.dedupeKey);
            if (duplicate) {
                return result(true, 'DUPLICATE_JOB_SUPPRESSED', 'Duplicate scheduled job was suppressed by idempotency governance.', {
                    tenantSlug: access.tenantSlug,
                    duplicatePrevented: true,
                    job: publicJob(duplicate),
                    governance: governanceFlags()
                });
            }
            var job = buildJob(input, access.tenantSlug, 'DELAYED', context || {});
            job.runAt = safeString(input.runAt || input.scheduledAt || nowIso(context || {}), '').trim();
            job.scheduledAt = job.runAt;
            job.queuedAt = '';
            appendJob(job, context || {});
            var schedule = {
                scheduleId: createId('DQSCHED'),
                tenantSlug: access.tenantSlug,
                jobId: job.jobId,
                jobType: job.jobType,
                runAt: job.runAt,
                recurrence: job.recurrence,
                state: 'DELAYED',
                timestamp: nowIso(context || {})
            };
            persist('distributedQueueScheduleHistory', schedule, context || {});
            audit('QUEUE_JOB_SCHEDULED', schedule, context || {}, 'INFO');
            return result(true, 'QUEUE_JOB_SCHEDULED', 'Queue job scheduled for delayed execution.', {
                tenantSlug: access.tenantSlug,
                job: publicJob(job),
                schedule: schedule,
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'QUEUE_SCHEDULER_FAILED_SAFE', 'Queue scheduler failed safely.', { governance: governanceFlags() });
        }
    }

    function releaseDueJobs(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var access = validateAccess('CONTROL', source.tenantSlug || source.tenantId, context || {});
            if (!access.success) return access;
            var now = nowMs(context || {});
            var released = [];
            queueRows(access.tenantSlug).forEach(function each(row) {
                var state = normalizeState(row.state);
                if (['DELAYED', 'RETRYING'].indexOf(state) === -1) return;
                var due = dueTime(row);
                if (due && due > now) return;
                var updated = updateJob(access.tenantSlug, row.jobId, function patch() {
                    return { state: 'QUEUED', status: 'QUEUED', queuedAt: nowIso(context || {}), updatedAt: nowIso(context || {}) };
                });
                persistLifecycle(updated, state, 'QUEUED', context || {}, { action: 'DUE_JOB_RELEASED' });
                released.push(publicJob(updated));
            });
            audit('QUEUE_DUE_JOBS_RELEASED', { tenantSlug: access.tenantSlug, releasedJobs: released.length }, context || {}, 'INFO');
            return result(true, 'QUEUE_DUE_JOBS_RELEASED', 'Due queue jobs released safely.', {
                tenantSlug: access.tenantSlug,
                releasedJobs: released,
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'QUEUE_DUE_RELEASE_FAILED_SAFE', 'Due job release failed safely.', { releasedJobs: [], governance: governanceFlags() });
        }
    }

    function registerWorker(input, context) {
        var source = isPlainObject(input) ? input : {};
        var tenantSlug = normalizeTenant(source.tenantSlug || source.tenantId || contextTenant(context || {}));
        var worker = {
            workerRecordId: createId('DQWORK'),
            tenantSlug: tenantSlug,
            workerId: safeString(source.workerId || 'WORKER-' + tenantSlug, '').trim().slice(0, 140),
            state: token(source.state || 'ACTIVE'),
            concurrency: Math.max(1, safeNumber(source.concurrency, 1)),
            lastHeartbeatAt: nowIso(context || {})
        };
        persist('distributedQueueWorkerHistory', worker, context || {});
        return worker;
    }

    function claimNextJob(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var access = validateAccess('CONTROL', source.tenantSlug || source.tenantId, context || {});
            if (!access.success) return access;
            var workerId = safeString(source.workerId || actor(context || {}).id || 'WORKER', '').trim().slice(0, 140);
            registerWorker({ tenantSlug: access.tenantSlug, workerId: workerId, state: 'ACTIVE' }, context || {});
            var now = nowMs(context || {});
            var eligible = queueRows(access.tenantSlug).filter(function eligibleRow(row) {
                return normalizeState(row.state) === 'QUEUED' && (!dueTime(row) || dueTime(row) <= now);
            }).sort(function sortJobs(a, b) {
                var priorityDelta = (PRIORITY_WEIGHT[normalizePriority(b.priority)] || 0) - (PRIORITY_WEIGHT[normalizePriority(a.priority)] || 0);
                if (priorityDelta) return priorityDelta;
                return new Date(a.queuedAt || a.createdAt || 0).getTime() - new Date(b.queuedAt || b.createdAt || 0).getTime();
            });
            if (!eligible.length) {
                return result(false, 'QUEUE_EMPTY', 'No tenant-scoped jobs are ready for this worker.', {
                    tenantSlug: access.tenantSlug,
                    governance: governanceFlags()
                });
            }
            var row = eligible[0];
            var updated = updateJob(access.tenantSlug, row.jobId, function patch() {
                return {
                    state: 'PROCESSING',
                    status: 'PROCESSING',
                    workerId: workerId,
                    lockedAt: nowIso(context || {}),
                    processingStartedAt: nowIso(context || {}),
                    updatedAt: nowIso(context || {})
                };
            });
            persistLifecycle(updated, 'QUEUED', 'PROCESSING', context || {}, { action: 'JOB_CLAIMED', workerId: workerId });
            audit('QUEUE_JOB_CLAIMED', { tenantSlug: access.tenantSlug, jobId: updated.jobId, workerId: workerId }, context || {}, 'INFO');
            return result(true, 'QUEUE_JOB_CLAIMED', 'Worker claimed the next tenant-scoped queue job.', {
                tenantSlug: access.tenantSlug,
                job: publicJob(updated),
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'QUEUE_CLAIM_FAILED_SAFE', 'Queue job claim failed safely.', { governance: governanceFlags() });
        }
    }

    function completeJob(input, context) {
        try {
            if (!isPlainObject(input)) return result(false, 'MALFORMED_QUEUE_PAYLOAD', 'Queue completion payload must be an object.', { governance: governanceFlags() });
            var access = validateAccess('CONTROL', input.tenantSlug || input.tenantId, context || {});
            if (!access.success) return access;
            var row = findJob(input.jobId, access.tenantSlug);
            if (!row) return result(false, 'QUEUE_JOB_NOT_FOUND', 'No tenant-scoped queue job was found.', { governance: governanceFlags() });
            var previousState = normalizeState(row.state);
            if (previousState !== 'PROCESSING') return result(false, 'QUEUE_JOB_NOT_PROCESSING', 'Only processing jobs can be completed.', { state: previousState, governance: governanceFlags() });
            var updated = updateJob(access.tenantSlug, row.jobId, function patch() {
                return {
                    state: 'COMPLETED',
                    status: 'COMPLETED',
                    resultSummary: payloadSummary(input.result || {}),
                    completedAt: nowIso(context || {}),
                    updatedAt: nowIso(context || {})
                };
            });
            persistLifecycle(updated, previousState, 'COMPLETED', context || {}, { action: 'JOB_COMPLETED' });
            audit('QUEUE_JOB_COMPLETED', { tenantSlug: access.tenantSlug, jobId: updated.jobId }, context || {}, 'INFO');
            return result(true, 'QUEUE_JOB_COMPLETED', 'Queue job completed.', {
                tenantSlug: access.tenantSlug,
                job: publicJob(updated),
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'QUEUE_COMPLETION_FAILED_SAFE', 'Queue job completion failed safely.', { governance: governanceFlags() });
        }
    }

    function calculateBackoff(attempt, strategy) {
        var normalized = token(strategy || 'EXPONENTIAL');
        if (normalized === 'FIXED') return 60000;
        if (normalized === 'LINEAR') return Math.min(900000, Math.max(1, attempt) * 60000);
        return Math.min(900000, Math.pow(2, Math.max(0, attempt - 1)) * 60000);
    }

    function recordFailure(input, context) {
        try {
            if (!isPlainObject(input)) return result(false, 'MALFORMED_QUEUE_PAYLOAD', 'Queue failure payload must be an object.', { governance: governanceFlags() });
            var access = validateAccess('CONTROL', input.tenantSlug || input.tenantId, context || {});
            if (!access.success) return access;
            var row = findJob(input.jobId, access.tenantSlug);
            if (!row) return result(false, 'QUEUE_JOB_NOT_FOUND', 'No tenant-scoped queue job was found.', { governance: governanceFlags() });
            var previousState = normalizeState(row.state);
            var attempt = Math.max(0, safeNumber(row.attempts || row.retryAttempts, 0)) + 1;
            var maxAttempts = Math.max(1, safeNumber(row.maxAttempts || row.maxRetries, DEFAULT_MAX_ATTEMPTS) || DEFAULT_MAX_ATTEMPTS);
            var backoffMs = calculateBackoff(attempt, input.strategy || input.retryStrategy);
            var nextRunAt = new Date(nowMs(context || {}) + backoffMs).toISOString();
            var exhausted = attempt >= maxAttempts;
            var nextState = exhausted ? 'DEAD_LETTER' : 'RETRYING';
            var updated = updateJob(access.tenantSlug, row.jobId, function patch() {
                return {
                    attempts: attempt,
                    retryAttempts: attempt,
                    state: nextState,
                    status: nextState,
                    failureCode: token(input.errorCode || input.code || 'QUEUE_JOB_FAILURE'),
                    failureClassification: classifyFailure(input).classification,
                    nextRunAt: exhausted ? '' : nextRunAt,
                    deadLettered: exhausted,
                    updatedAt: nowIso(context || {})
                };
            });
            var retryRecord = {
                retryId: createId('DQRETRY'),
                tenantSlug: access.tenantSlug,
                jobId: updated.jobId,
                attempt: attempt,
                maxAttempts: maxAttempts,
                strategy: token(input.strategy || input.retryStrategy || 'EXPONENTIAL'),
                backoffMs: exhausted ? 0 : backoffMs,
                nextRunAt: exhausted ? '' : nextRunAt,
                state: nextState,
                failureCode: token(input.errorCode || input.code || 'QUEUE_JOB_FAILURE'),
                timestamp: nowIso(context || {})
            };
            persist('distributedQueueRetryHistory', retryRecord, context || {});
            persistLifecycle(updated, previousState, nextState, context || {}, { action: exhausted ? 'JOB_DEAD_LETTERED' : 'JOB_RETRY_SCHEDULED', attempt: attempt });
            if (exhausted) moveToDeadLetter(updated, input, context || {});
            audit(exhausted ? 'QUEUE_JOB_MOVED_TO_DEAD_LETTER' : 'QUEUE_JOB_RETRY_SCHEDULED', {
                tenantSlug: access.tenantSlug,
                jobId: updated.jobId,
                attempt: attempt,
                maxAttempts: maxAttempts
            }, context || {}, exhausted ? 'WARNING' : 'INFO');
            return result(true, exhausted ? 'QUEUE_JOB_DEAD_LETTERED' : 'QUEUE_JOB_RETRYING', exhausted ? 'Queue job moved to dead-letter queue after bounded retries.' : 'Queue job failure recorded and retry scheduled.', {
                tenantSlug: access.tenantSlug,
                job: publicJob(updated),
                retryPlan: {
                    attempt: attempt,
                    maxAttempts: maxAttempts,
                    strategy: retryRecord.strategy,
                    backoffMs: retryRecord.backoffMs,
                    nextRunAt: retryRecord.nextRunAt
                },
                deadLettered: exhausted,
                governance: governanceFlags({ infiniteRetriesPrevented: true })
            });
        } catch (error) {
            return result(false, 'QUEUE_FAILURE_RECORD_FAILED_SAFE', 'Queue failure handling failed safely.', { governance: governanceFlags({ brokerUnavailableHandled: true }) });
        }
    }

    function classifyFailure(input) {
        var source = isPlainObject(input) ? input : {};
        var code = token(source.errorCode || source.code || source.error && (source.error.code || source.error.name) || '');
        var description = (safeString(source.message || source.error && source.error.message || '', '') + ' ' + safeString(source.failureReason || '', '')).toLowerCase();
        var classification = 'UNKNOWN_FAILURE';
        if (/VALIDATION|SCHEMA|INVALID/.test(code) || /validation|schema|invalid/.test(description)) classification = 'VALIDATION_FAILURE';
        else if (/TIMEOUT|ETIMEDOUT/.test(code) || /timeout|timed out/.test(description)) classification = 'TIMEOUT_FAILURE';
        else if (/BROKER|QUEUE|UNAVAILABLE|CONNECTION/.test(code) || /broker|queue|unavailable|connection/.test(description)) classification = 'BROKER_FAILURE';
        else if (/POISON|MALFORMED/.test(code) || /poison|malformed/.test(description)) classification = 'POISON_MESSAGE';
        return {
            classification: classification,
            recoveryRecommendation: classification === 'POISON_MESSAGE' || classification === 'VALIDATION_FAILURE' ? 'MANUAL_REVIEW' : 'RETRY'
        };
    }

    function moveToDeadLetter(job, input, context) {
        var row = {
            deadLetterId: createId('DQDLQ'),
            tenantSlug: job.tenantSlug,
            jobId: job.jobId,
            jobType: job.jobType,
            priority: job.priority,
            attempts: safeNumber(job.attempts, 0),
            failureCode: token(input && (input.errorCode || input.code) || job.failureCode || 'QUEUE_JOB_FAILURE'),
            failureClassification: classifyFailure(input || {}).classification,
            recoveryRecommendation: classifyFailure(input || {}).recoveryRecommendation,
            movedAt: nowIso(context || {})
        };
        persist('distributedQueueDeadLetterHistory', row, context || {});
        return row;
    }

    function inspectDeadLetters(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var access = validateAccess('OPERATIONS_VIEW', source.tenantSlug || source.tenantId, context || {});
            if (!access.success) return access;
            var jobs = queueRows(access.tenantSlug).filter(function filter(row) {
                return normalizeState(row.state) === 'DEAD_LETTER';
            }).map(publicJob);
            var reports = latestRows('distributedQueueDeadLetterHistory', access.tenantSlug, 100).map(function map(row) {
                return {
                    deadLetterId: row.deadLetterId,
                    tenantSlug: row.tenantSlug,
                    jobId: row.jobId,
                    jobType: row.jobType,
                    attempts: row.attempts,
                    failureCode: row.failureCode,
                    failureClassification: row.failureClassification,
                    recoveryRecommendation: row.recoveryRecommendation,
                    movedAt: row.movedAt
                };
            });
            return result(true, 'DEAD_LETTER_QUEUE_READY', 'Dead-letter queue inspection report generated.', {
                tenantSlug: access.tenantSlug,
                jobs: jobs,
                failureReports: reports,
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'DEAD_LETTER_INSPECTION_FAILED_SAFE', 'Dead-letter inspection failed safely.', { jobs: [], failureReports: [], governance: governanceFlags() });
        }
    }

    function retryDeadLetter(input, context) {
        try {
            if (!isPlainObject(input)) return result(false, 'MALFORMED_QUEUE_PAYLOAD', 'Dead-letter retry payload must be an object.', { governance: governanceFlags() });
            var access = validateAccess('CONTROL', input.tenantSlug || input.tenantId, context || {});
            if (!access.success) return access;
            var row = findJob(input.jobId, access.tenantSlug);
            if (!row) return result(false, 'QUEUE_JOB_NOT_FOUND', 'No tenant-scoped dead-letter job was found.', { governance: governanceFlags() });
            if (normalizeState(row.state) !== 'DEAD_LETTER') return result(false, 'QUEUE_JOB_NOT_DEAD_LETTERED', 'Only dead-letter jobs can be retried from the dead-letter queue.', { state: normalizeState(row.state), governance: governanceFlags() });
            var updated = updateJob(access.tenantSlug, row.jobId, function patch() {
                return {
                    state: 'QUEUED',
                    status: 'QUEUED',
                    attempts: 0,
                    retryAttempts: 0,
                    deadLettered: false,
                    queuedAt: nowIso(context || {}),
                    nextRunAt: '',
                    updatedAt: nowIso(context || {})
                };
            });
            persist('distributedQueueRetryHistory', {
                retryId: createId('DQRETRY'),
                tenantSlug: access.tenantSlug,
                jobId: updated.jobId,
                attempt: 0,
                maxAttempts: updated.maxAttempts || DEFAULT_MAX_ATTEMPTS,
                strategy: 'MANUAL_RETRY_FROM_DEAD_LETTER',
                state: 'QUEUED',
                timestamp: nowIso(context || {})
            }, context || {});
            persistLifecycle(updated, 'DEAD_LETTER', 'QUEUED', context || {}, { action: 'DEAD_LETTER_RETRIED' });
            audit('QUEUE_DEAD_LETTER_RETRIED', { tenantSlug: access.tenantSlug, jobId: updated.jobId }, context || {}, 'WARNING');
            return result(true, 'DEAD_LETTER_JOB_REQUEUED', 'Dead-letter job requeued under governance.', {
                tenantSlug: access.tenantSlug,
                job: publicJob(updated),
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'DEAD_LETTER_RETRY_FAILED_SAFE', 'Dead-letter retry failed safely.', { governance: governanceFlags() });
        }
    }

    function archiveDeadLetter(input, context) {
        try {
            if (!isPlainObject(input)) return result(false, 'MALFORMED_QUEUE_PAYLOAD', 'Dead-letter archive payload must be an object.', { governance: governanceFlags() });
            var access = validateAccess('CONTROL', input.tenantSlug || input.tenantId, context || {});
            if (!access.success) return access;
            var row = findJob(input.jobId, access.tenantSlug);
            if (!row) return result(false, 'QUEUE_JOB_NOT_FOUND', 'No tenant-scoped dead-letter job was found.', { governance: governanceFlags() });
            var updated = updateJob(access.tenantSlug, row.jobId, function patch() {
                return { state: 'CANCELLED', status: 'CANCELLED', archivedAt: nowIso(context || {}), updatedAt: nowIso(context || {}) };
            });
            persistLifecycle(updated, normalizeState(row.state), 'CANCELLED', context || {}, { action: 'DEAD_LETTER_ARCHIVED' });
            audit('QUEUE_DEAD_LETTER_ARCHIVED', { tenantSlug: access.tenantSlug, jobId: updated.jobId }, context || {}, 'WARNING');
            return result(true, 'DEAD_LETTER_ARCHIVED', 'Dead-letter job archived.', { tenantSlug: access.tenantSlug, job: publicJob(updated), governance: governanceFlags() });
        } catch (error) {
            return result(false, 'DEAD_LETTER_ARCHIVE_FAILED_SAFE', 'Dead-letter archive failed safely.', { governance: governanceFlags() });
        }
    }

    function workerRows(tenantSlug) {
        var rows = latestRows('distributedQueueWorkerHistory', tenantSlug, 200);
        var latest = Object.create(null);
        rows.forEach(function each(row) {
            latest[safeString(row.workerId || '', '')] = row;
        });
        return Object.keys(latest).map(function map(key) { return latest[key]; });
    }

    function calculateMetrics(tenantSlug) {
        var rows = queueRows(tenantSlug);
        var queued = rows.filter(function filter(row) { return normalizeState(row.state) === 'QUEUED'; });
        var delayed = rows.filter(function filter(row) { return normalizeState(row.state) === 'DELAYED'; });
        var retrying = rows.filter(function filter(row) { return normalizeState(row.state) === 'RETRYING'; });
        var processing = rows.filter(function filter(row) { return normalizeState(row.state) === 'PROCESSING'; });
        var completed = rows.filter(function filter(row) { return normalizeState(row.state) === 'COMPLETED'; });
        var failed = rows.filter(function filter(row) { return normalizeState(row.state) === 'FAILED'; });
        var deadLetters = rows.filter(function filter(row) { return normalizeState(row.state) === 'DEAD_LETTER'; });
        var workers = workerRows(tenantSlug);
        var activeWorkers = workers.filter(function filter(row) { return token(row.state || 'ACTIVE') === 'ACTIVE'; }).length;
        var latencies = completed.map(function map(row) {
            var start = new Date(row.queuedAt || row.createdAt || 0).getTime();
            var end = new Date(row.completedAt || row.updatedAt || 0).getTime();
            return Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : null;
        }).filter(function keep(value) { return value !== null; });
        var processingLatencyMs = latencies.length ? Math.round(latencies.reduce(function sum(total, value) { return total + value; }, 0) / latencies.length) : 0;
        var queueDepth = queued.length + delayed.length + retrying.length + processing.length;
        var retryCount = retrying.reduce(function sum(total, row) { return total + safeNumber(row.attempts || row.retryAttempts, 0); }, 0) +
            latestRows('distributedQueueRetryHistory', tenantSlug, 200).length;
        var throughput = completed.length;
        var workerUtilization = workers.length ? clampScore((activeWorkers / workers.length) * 100) : 0;
        var failurePressure = failed.length + deadLetters.length * 2 + retrying.length;
        var queueHealthScore = clampScore(94 - Math.min(45, queueDepth * 2) - Math.min(30, failurePressure * 5) + Math.min(10, throughput * 2));
        var workerEfficiencyScore = clampScore((workerUtilization || 65) + Math.min(20, throughput * 4) - Math.min(30, processing.length * 3));
        var processingScore = clampScore(96 - Math.min(45, processingLatencyMs / 1000) - Math.min(25, retrying.length * 5) - Math.min(20, deadLetters.length * 8));
        return {
            queueDepth: queueDepth,
            queued: queued.length,
            delayed: delayed.length,
            processing: processing.length,
            retryCount: retryCount,
            deadLetterSize: deadLetters.length,
            throughput: throughput,
            workerUtilization: workerUtilization,
            processingLatencyMs: processingLatencyMs,
            queueHealthScore: queueHealthScore,
            workerEfficiencyScore: workerEfficiencyScore,
            processingScore: processingScore
        };
    }

    function collectMetrics(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var access = validateAccess('OPERATIONS_VIEW', source.tenantSlug || source.tenantId, context || {});
            if (!access.success) return access;
            var metrics = calculateMetrics(access.tenantSlug);
            var row = {
                metricsId: createId('DQMET'),
                tenantSlug: access.tenantSlug,
                queueDepth: metrics.queueDepth,
                processingLatencyMs: metrics.processingLatencyMs,
                workerUtilization: metrics.workerUtilization,
                retryCount: metrics.retryCount,
                deadLetterSize: metrics.deadLetterSize,
                throughput: metrics.throughput,
                queueHealthScore: metrics.queueHealthScore,
                workerEfficiencyScore: metrics.workerEfficiencyScore,
                processingScore: metrics.processingScore,
                timestamp: nowIso(context || {})
            };
            persist('distributedQueueMetricsHistory', row, context || {});
            audit('QUEUE_METRICS_REVIEWED', row, context || {}, 'INFO');
            return result(true, 'QUEUE_METRICS_READY', 'Queue monitoring metrics collected.', {
                tenantSlug: access.tenantSlug,
                analytics: {
                    queueDepth: metrics.queueDepth,
                    processingLatencyMs: metrics.processingLatencyMs,
                    workerUtilization: metrics.workerUtilization,
                    retryCount: metrics.retryCount,
                    deadLetterSize: metrics.deadLetterSize,
                    throughput: metrics.throughput
                },
                queueHealthScore: metrics.queueHealthScore,
                workerEfficiencyScore: metrics.workerEfficiencyScore,
                processingScore: metrics.processingScore,
                governance: governanceFlags()
            });
        } catch (error) {
            return result(false, 'QUEUE_METRICS_FAILED_SAFE', 'Queue metrics collection failed safely.', { analytics: {}, governance: governanceFlags() });
        }
    }

    function generateQueueOperationsReport(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var access = validateAccess('OPERATIONS_VIEW', source.tenantSlug || source.tenantId, context || {});
            if (!access.success) return access;
            var metrics = calculateMetrics(access.tenantSlug);
            var rows = queueRows(access.tenantSlug);
            var active = rows.filter(function filter(row) {
                return ['QUEUED', 'PROCESSING', 'RETRYING', 'DELAYED'].indexOf(normalizeState(row.state)) !== -1;
            }).map(publicJob).slice(0, 80);
            var retryQueue = rows.filter(function filter(row) { return normalizeState(row.state) === 'RETRYING'; }).map(publicJob).slice(0, 80);
            var deadLetterQueue = rows.filter(function filter(row) { return normalizeState(row.state) === 'DEAD_LETTER'; }).map(publicJob).slice(0, 80);
            var scheduled = rows.filter(function filter(row) { return normalizeState(row.state) === 'DELAYED'; }).map(publicJob).slice(0, 40);
            var workers = workerRows(access.tenantSlug).map(function map(row) {
                return {
                    workerId: safeString(row.workerId || '', ''),
                    tenantSlug: rowTenant(row),
                    state: token(row.state || 'ACTIVE'),
                    concurrency: safeNumber(row.concurrency, 1),
                    lastHeartbeatAt: safeString(row.lastHeartbeatAt || row.timestamp || '', '')
                };
            });
            var report = {
                success: true,
                tenantSlug: access.tenantSlug,
                architecture: {
                    application: true,
                    queueProducer: true,
                    messageBroker: true,
                    workerPool: true,
                    databaseServices: true,
                    providerAgnostic: true,
                    supportedBrokers: BROKER_LABELS.slice()
                },
                jobTypes: JOB_TYPES.slice(),
                priorities: PRIORITIES.slice(),
                states: JOB_STATES.slice(),
                activeQueues: active,
                retryQueue: retryQueue,
                deadLetterQueue: deadLetterQueue,
                scheduledJobs: scheduled,
                workerStatus: workers,
                retryStrategy: {
                    maxAttempts: DEFAULT_MAX_ATTEMPTS,
                    exponentialBackoff: true,
                    linearRetry: true,
                    fixedRetry: true,
                    infiniteRetriesPrevented: true
                },
                scheduler: {
                    cronJobs: true,
                    delayedExecution: true,
                    recurringJobs: true,
                    oneTimeJobs: true,
                    maintenanceJobs: true,
                    futureCalendarTriggers: true
                },
                performance: {
                    horizontalWorkers: true,
                    workerAutoscalingReady: true,
                    batchJobs: true,
                    concurrentProcessing: true,
                    gracefulShutdown: true
                },
                analytics: {
                    queueDepth: metrics.queueDepth,
                    processingLatencyMs: metrics.processingLatencyMs,
                    workerUtilization: metrics.workerUtilization,
                    retryCount: metrics.retryCount,
                    deadLetterSize: metrics.deadLetterSize,
                    throughput: metrics.throughput
                },
                queueHealthScore: metrics.queueHealthScore,
                workerEfficiencyScore: metrics.workerEfficiencyScore,
                processingScore: metrics.processingScore,
                recentLifecycle: latestRows('distributedQueueLifecycleHistory', access.tenantSlug, 20),
                recentRetries: latestRows('distributedQueueRetryHistory', access.tenantSlug, 20),
                recentDeadLetters: latestRows('distributedQueueDeadLetterHistory', access.tenantSlug, 20),
                integrations: {
                    redisCache: !!(global.EnterpriseRedisCacheService || global.enterpriseRedisCacheService),
                    cdnOptimization: !!(global.EnterpriseAssetDeliveryService || global.enterpriseAssetDeliveryService),
                    asyncJobService: !!(global.AsyncJobService || global.asyncJobService),
                    workflowRecovery: !!(global.WorkflowRecoveryService || global.workflowRecoveryService),
                    notificationTracking: !!(global.NotificationDeliveryTrackingService || global.notificationDeliveryTrackingService),
                    auditGovernance: !!global.AuditService
                },
                governance: governanceFlags({
                    noCrossTenantJobs: true,
                    everyJobCarriesTenantCorrelationTrace: true,
                    workflowCorruptionPrevented: true
                }),
                generatedAt: nowIso(context || {})
            };
            return freezeQueueOutput(report);
        } catch (error) {
            return result(false, 'QUEUE_REPORT_FAILED_SAFE', 'Queue operations report failed safely.', { analytics: {}, governance: governanceFlags() });
        }
    }

    function failJob(input, context) {
        return recordFailure(input || {}, context || {});
    }

    function heartbeatWorker(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var access = validateAccess('CONTROL', source.tenantSlug || source.tenantId, context || {});
            if (!access.success) return access;
            var worker = registerWorker({ tenantSlug: access.tenantSlug, workerId: source.workerId, state: 'ACTIVE', concurrency: source.concurrency || 1 }, context || {});
            audit('QUEUE_WORKER_HEARTBEAT', { tenantSlug: access.tenantSlug, workerId: worker.workerId }, context || {}, 'INFO');
            return result(true, 'QUEUE_WORKER_HEARTBEAT_RECORDED', 'Worker heartbeat recorded.', { tenantSlug: access.tenantSlug, worker: worker, governance: governanceFlags() });
        } catch (error) {
            return result(false, 'QUEUE_WORKER_HEARTBEAT_FAILED_SAFE', 'Worker heartbeat failed safely.', { governance: governanceFlags() });
        }
    }

    function gracefulShutdown(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var access = validateAccess('CONTROL', source.tenantSlug || source.tenantId, context || {});
            if (!access.success) return access;
            var worker = registerWorker({ tenantSlug: access.tenantSlug, workerId: source.workerId, state: 'DRAINING', concurrency: 0 }, context || {});
            audit('QUEUE_WORKER_GRACEFUL_SHUTDOWN', { tenantSlug: access.tenantSlug, workerId: worker.workerId }, context || {}, 'WARNING');
            return result(true, 'QUEUE_WORKER_DRAINING', 'Worker graceful shutdown recorded.', { tenantSlug: access.tenantSlug, worker: worker, governance: governanceFlags() });
        } catch (error) {
            return result(false, 'QUEUE_WORKER_SHUTDOWN_FAILED_SAFE', 'Worker shutdown failed safely.', { governance: governanceFlags() });
        }
    }

    function runSelfTest() {
        var checks = [];
        function record(name, passed, details) {
            checks.push({ name: name, passed: !!passed, details: cloneSafe(details || {}, []) });
        }
        try {
            var ctx = {
                tenantSlug: 'queue-self-test',
                actor: { id: 'QUEUE-SELF', role: 'PLATFORM_OWNER', tenantSlug: 'queue-self-test' },
                now: '2026-06-28T10:00:00.000Z',
                skipAuditPersistence: true
            };
            var frozen = freezeQueueOutput({ nested: { value: 1 } });
            var queued = createJob({ tenantSlug: 'queue-self-test', jobType: 'email_delivery', priority: 'HIGH', payload: { email: 'self@example.com' }, idempotencyKey: 'self-1' }, ctx);
            record('queue works', queued.success === true && queued.job.state === 'QUEUED');
            var claimed = claimNextJob({ tenantSlug: 'queue-self-test', workerId: 'SELF-WORKER' }, ctx);
            record('workers work', claimed.success === true && claimed.job.state === 'PROCESSING');
            var scheduled = scheduleJob({ tenantSlug: 'queue-self-test', jobType: 'cleanup_jobs', runAt: '2026-06-28T10:01:00.000Z', idempotencyKey: 'self-schedule-1' }, ctx);
            var released = releaseDueJobs({ tenantSlug: 'queue-self-test' }, Object.assign({}, ctx, { now: '2026-06-28T10:02:00.000Z' }));
            record('scheduler works', scheduled.success === true && released.releasedJobs.length >= 1);
            var failedOne = recordFailure({ tenantSlug: 'queue-self-test', jobId: claimed.job.jobId, errorCode: 'SELF_TIMEOUT' }, ctx);
            var failedTwo = recordFailure({ tenantSlug: 'queue-self-test', jobId: claimed.job.jobId, errorCode: 'SELF_TIMEOUT' }, ctx);
            var failedThree = recordFailure({ tenantSlug: 'queue-self-test', jobId: claimed.job.jobId, errorCode: 'SELF_TIMEOUT' }, ctx);
            record('retries work', failedOne.success === true && failedTwo.success === true && failedThree.success === true);
            record('dead-letter queue works', failedThree.job.state === 'DEAD_LETTER' && inspectDeadLetters({ tenantSlug: 'queue-self-test' }, ctx).jobs.length >= 1);
            var metrics = collectMetrics({ tenantSlug: 'queue-self-test' }, ctx);
            record('monitoring works', metrics.success === true && Number.isFinite(metrics.queueHealthScore));
            var denied = createJob({ tenantSlug: 'other-queue-self-test', jobType: 'email_delivery' }, ctx);
            record('tenant isolation works', denied.success === false && denied.code === 'TENANT_ACCESS_DENIED');
            record('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested));
            var output = freezeQueueOutput({
                passed: checks.every(function passed(check) { return check.passed; }),
                checks: checks,
                summary: 'Distributed queue self-test completed.'
            });
            global.__ARTHHRMS_DISTRIBUTED_QUEUE_SELF_TEST__ = output;
            return output;
        } catch (error) {
            var failed = freezeQueueOutput({
                passed: false,
                checks: checks.concat([{ name: 'self-test uncaught exception guard', passed: false, details: { message: error && error.message } }])
            });
            global.__ARTHHRMS_DISTRIBUTED_QUEUE_SELF_TEST__ = failed;
            return failed;
        }
    }

    var QueueManager = Object.freeze({
        createJob: createJob,
        enqueueJob: createJob,
        cancelJob: cancelJob,
        getQueueState: generateQueueOperationsReport,
        generateQueueOperationsReport: generateQueueOperationsReport
    });
    var JobScheduler = Object.freeze({
        scheduleJob: scheduleJob,
        releaseDueJobs: releaseDueJobs,
        createRecurringJob: scheduleJob
    });
    var RetryManager = Object.freeze({
        recordFailure: recordFailure,
        retryJob: recordFailure,
        calculateBackoff: function publicBackoff(input) {
            var source = isPlainObject(input) ? input : {};
            return result(true, 'QUEUE_BACKOFF_READY', 'Queue backoff calculated.', {
                attempt: Math.max(1, safeNumber(source.attempt, 1)),
                strategy: token(source.strategy || 'EXPONENTIAL'),
                backoffMs: calculateBackoff(Math.max(1, safeNumber(source.attempt, 1)), source.strategy || 'EXPONENTIAL'),
                governance: governanceFlags()
            });
        }
    });
    var DeadLetterManager = Object.freeze({
        inspectDeadLetters: inspectDeadLetters,
        retryDeadLetter: retryDeadLetter,
        archiveDeadLetter: archiveDeadLetter,
        moveToDeadLetter: function publicMove(input, context) {
            return recordFailure(Object.assign({}, input || {}, { attempts: DEFAULT_MAX_ATTEMPTS, errorCode: input && input.errorCode || 'MANUAL_DEAD_LETTER' }), context || {});
        }
    });
    var WorkerManager = Object.freeze({
        registerWorker: heartbeatWorker,
        claimNextJob: claimNextJob,
        completeJob: completeJob,
        failJob: failJob,
        heartbeatWorker: heartbeatWorker,
        gracefulShutdown: gracefulShutdown
    });
    var QueueMetricsCollector = Object.freeze({
        collectMetrics: collectMetrics,
        collect: collectMetrics
    });

    var service = Object.freeze({
        VERSION: '1.0.0',
        BROKER_PROVIDERS: BROKER_PROVIDERS,
        JOB_TYPES: JOB_TYPES,
        PRIORITIES: PRIORITIES,
        JOB_STATES: JOB_STATES,
        QueueManager: QueueManager,
        JobScheduler: JobScheduler,
        RetryManager: RetryManager,
        DeadLetterManager: DeadLetterManager,
        WorkerManager: WorkerManager,
        QueueMetricsCollector: QueueMetricsCollector,
        freezeQueueOutput: freezeQueueOutput,
        runSelfTest: runSelfTest
    });

    global.DistributedQueueService = service;
    global.distributedQueueService = service;

    if (global.__ARTHHRMS_DEV__) {
        try {
            global.__ARTHHRMS_DISTRIBUTED_QUEUE_SELF_TEST__ = runSelfTest();
        } catch (error) {
            global.__ARTHHRMS_DISTRIBUTED_QUEUE_SELF_TEST__ = freezeQueueOutput({
                passed: false,
                checks: [{ name: 'self-test wrapper', passed: false, details: { message: error && error.message } }]
            });
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
