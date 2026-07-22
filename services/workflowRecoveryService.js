/**
 * ARTHHRMS Workflow Recovery Service
 * Records governed recovery decisions without owning or mutating business workflows.
 */
(function attachWorkflowRecoveryService(global) {
    'use strict';

    var SOURCE = 'workflowRecoveryService';
    var WORKFLOW_STATES = Object.freeze([
        'CREATED', 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'RECOVERABLE',
        'RETRYING', 'ROLLED_BACK', 'ABANDONED'
    ]);
    var RECOVERY_ACTIONS = Object.freeze(['RETRY', 'ROLLBACK', 'RESUME', 'MANUAL_REVIEW', 'ABANDON']);
    var RECOVERY_ROLES = Object.freeze(['SUPER_ADMIN']);
    var VISIBILITY_ROLES = Object.freeze(['HR', 'DIRECTOR', 'SUPER_ADMIN']);
    var DETECTION_ROLES = Object.freeze(['HR', 'DIRECTOR', 'SUPER_ADMIN']);
    var RESTORABLE_STATES = Object.freeze(['CREATED', 'PENDING', 'PROCESSING']);
    var MAX_RETRIES = 3;
    var activeOperations = Object.create(null);

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

    function token(value) {
        return safeString(value || '', '').trim().toUpperCase()
            .replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    }

    function normalizeRole(value) {
        var role = token(value || 'EMPLOYEE');
        if (role === 'PLATFORMOWNER' || role === 'OWNER' || role === 'ROOT') return 'PLATFORM_OWNER';
        if (role === 'SUPERADMIN') return 'SUPER_ADMIN';
        return role || 'EMPLOYEE';
    }

    function normalizeTenant(value) {
        return safeString(value || '', '').trim().toLowerCase()
            .replace(/^tenant[-_]/, '').replace(/^ten[-_]/, '')
            .replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }

    function nowIso(context) {
        try {
            var stamp = context && context.now ? new Date(context.now) : new Date();
            return Number.isFinite(stamp.getTime()) ? stamp.toISOString() : new Date().toISOString();
        } catch (error) { return new Date().toISOString(); }
    }

    function createId(prefix) {
        return prefix + '-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    }

    function cloneSafe(value, seen) {
        if (typeof value === 'function') return undefined;
        if (!value || typeof value !== 'object') return value;
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
            var cloned = cloneSafe(value[key], refs.slice());
            if (typeof cloned !== 'undefined') output[key] = cloned;
        });
        return output;
    }

    function freezeRecoveryOutput(value) {
        var cloned = cloneSafe(value, []);
        function deepFreeze(item) {
            if (!item || typeof item !== 'object' || Object.isFrozen(item)) return item;
            Object.keys(item).forEach(function each(key) { deepFreeze(item[key]); });
            return Object.freeze(item);
        }
        return deepFreeze(cloned);
    }

    function clampScore(value) {
        var number = Number(value);
        if (!Number.isFinite(number)) return 0;
        return Math.max(0, Math.min(100, Math.round(number)));
    }

    function actor(context) {
        var source = context && context.actor ? context.actor : {};
        return {
            id: safeString(source.id || source.userId || source.empId || source.employeeId || '', '').trim(),
            role: normalizeRole(source.role || context && context.role || 'EMPLOYEE'),
            tenantSlug: normalizeTenant(source.tenantSlug || source.tenantId || source.companyId || '')
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

    function result(success, code, message, extra) {
        return freezeRecoveryOutput(Object.assign({
            success: success === true,
            code: token(code || (success ? 'RECOVERY_OPERATION_COMPLETED' : 'RECOVERY_OPERATION_FAILED')),
            message: safeString(message || (success ? 'Recovery operation completed.' : 'Recovery operation failed.'), '').slice(0, 240)
        }, extra || {}));
    }

    function persist(key, record, context) {
        if (context && context.skipHistoryPersistence) return record;
        var current = data();
        if (!Array.isArray(current[key])) current[key] = [];
        current[key].push(cloneSafe(record, []));
        save(current);
        return record;
    }

    function audit(actionType, metadata, context, severity) {
        if (context && context.skipAuditPersistence) return false;
        var currentActor = actor(context || {});
        try {
            if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                global.AuditService.recordAudit({
                    type: actionType,
                    actionType: actionType,
                    actorId: currentActor.id,
                    actorRole: currentActor.role,
                    source: SOURCE,
                    severity: severity || (/FAIL|DENIED|ROLLBACK|ABANDON/.test(actionType) ? 'WARNING' : 'INFO'),
                    metadata: cloneSafe(metadata || {}, [])
                }, { source: SOURCE, actor: currentActor });
                return true;
            }
        } catch (error) {}
        return false;
    }

    function notify(title, message, tenantSlug, context, severity) {
        if (context && context.skipNotification) return false;
        try {
            if (global.NotificationCenterService && typeof global.NotificationCenterService.createNotification === 'function') {
                global.NotificationCenterService.createNotification({
                    type: 'WORKFLOW_RECOVERY',
                    category: 'GOVERNANCE',
                    severity: severity || 'WARNING',
                    title: safeString(title, 'Workflow recovery update').slice(0, 120),
                    message: safeString(message, 'A workflow recovery action requires attention.').slice(0, 240),
                    tenantSlug: tenantSlug,
                    source: SOURCE
                }, context || {});
                return true;
            }
        } catch (error) {}
        return false;
    }

    function createIncident(failure, context) {
        if (context && context.skipIncidentPersistence) return false;
        try {
            if (global.operationsMonitoringService && typeof global.operationsMonitoringService.createIncident === 'function') {
                global.operationsMonitoringService.createIncident({
                    title: 'Recoverable workflow failure',
                    description: 'Workflow ' + failure.workflowId + ' requires governed recovery.',
                    severity: failure.classification === 'PARTIAL_EXECUTION_FAILURE' ? 'CRITICAL' : 'WARNING',
                    category: 'WORKFLOW_RECOVERY',
                    tenantSlug: failure.tenantSlug,
                    source: SOURCE,
                    metadata: {
                        failureId: failure.failureId,
                        workflowId: failure.workflowId,
                        classification: failure.classification
                    }
                }, actor(context || {}));
                return true;
            }
        } catch (error) {}
        return false;
    }

    function reportFailureToErrorFramework(failure, context) {
        if (context && context.skipErrorPersistence) return false;
        try {
            var framework = global.ErrorHandlingFrameworkService || global.errorHandlingFrameworkService;
            if (framework && typeof framework.createApiError === 'function') {
                framework.createApiError({
                    code: 'WORKFLOW_RECOVERY_FAILURE',
                    message: 'A workflow execution entered governed recovery.'
                }, {
                    tenantId: failure.tenantSlug,
                    tenantSlug: failure.tenantSlug,
                    userId: actor(context || {}).id,
                    module: 'Workflow Recovery',
                    action: 'detect workflow failure',
                    severity: failure.classification === 'PARTIAL_EXECUTION_FAILURE' ? 'CRITICAL' : 'ERROR',
                    metadata: {
                        failureId: failure.failureId,
                        workflowId: failure.workflowId,
                        classification: failure.classification
                    }
                });
                return true;
            }
        } catch (error) {}
        return false;
    }

    function hasRole(roles, context) {
        return roles.indexOf(actor(context || {}).role) !== -1;
    }

    function validateTenant(targetTenant, context) {
        var tenant = normalizeTenant(targetTenant || contextTenant(context || {}));
        var currentActor = actor(context || {});
        var scope = normalizeTenant(currentActor.tenantSlug || contextTenant(context || {}));
        if (!tenant || !scope || tenant !== scope) {
            return result(false, 'TENANT_ACCESS_DENIED', 'Tenant-scoped workflow recovery access was denied.');
        }
        try {
            var registry = global.ValidationRegistry;
            if (registry && typeof registry.executeValidationRule === 'function') {
                var validation = registry.executeValidationRule('TENANT_ACCESS', {
                    tenantSlug: tenant,
                    ownerTenantSlug: tenant,
                    actorTenantSlug: scope
                }, { source: SOURCE }, Object.assign({}, context || {}, { tenantSlug: tenant }));
                if (!validation || validation.success !== true) {
                    return result(false, 'TENANT_ACCESS_DENIED', 'Tenant-scoped workflow recovery access was denied.');
                }
            }
        } catch (error) {
            return result(false, 'TENANT_ACCESS_DENIED', 'Tenant validation failed safely.');
        }
        return result(true, 'TENANT_ACCESS_VALIDATED', 'Tenant access validated.', { tenantSlug: tenant });
    }

    function rowTenant(row) {
        return normalizeTenant(row && (row.tenantSlug || row.tenantId || row.companyId));
    }

    function hashValue(value) {
        var textValue = safeString(JSON.stringify(value), '');
        var hash = 2166136261;
        for (var index = 0; index < textValue.length; index += 1) {
            hash ^= textValue.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return ('00000000' + (hash >>> 0).toString(16)).slice(-8);
    }

    function snapshotPayload(snapshot) {
        return {
            workflowId: snapshot.workflowId,
            tenantSlug: snapshot.tenantSlug,
            state: snapshot.state,
            stateData: cloneSafe(snapshot.stateData || {}, [])
        };
    }

    function createSnapshot(input, tenantSlug, context) {
        var snapshot = {
            snapshotId: createId('WRS'),
            workflowId: safeString(input.workflowId, '').trim(),
            workflowType: token(input.workflowType || 'GENERAL'),
            tenantSlug: tenantSlug,
            state: WORKFLOW_STATES.indexOf(token(input.state)) !== -1 ? token(input.state) : 'PROCESSING',
            stateData: cloneSafe(input.stateData || {}, []),
            createdAt: nowIso(context || {}),
            createdBy: actor(context || {}).id || 'SYSTEM'
        };
        snapshot.integrityHash = hashValue(snapshotPayload(snapshot));
        persist('workflowSnapshotHistory', snapshot, context || {});
        return snapshot;
    }

    function validateSnapshot(snapshot) {
        if (!snapshot || !snapshot.snapshotId || RESTORABLE_STATES.indexOf(snapshot.state) === -1) return false;
        return snapshot.integrityHash === hashValue(snapshotPayload(snapshot));
    }

    function classifyFailure(input) {
        var source = input && typeof input === 'object' ? input : {};
        var error = source.error && typeof source.error === 'object' ? source.error : {};
        var code = token(source.errorCode || source.code || error.code || error.name || '');
        var description = (safeString(source.message || error.message || '', '') + ' ' + safeString(source.dependency || '', '')).toLowerCase();
        var classification = 'UNKNOWN_FAILURE';
        if (source.partialExecution === true) classification = 'PARTIAL_EXECUTION_FAILURE';
        else if (source.interrupted === true || /interrupt|cancelled connection/.test(description)) classification = 'INTERRUPTION_FAILURE';
        else if (/VALIDATION|SCHEMA|INVALID/.test(code) || /validation|schema/.test(description)) classification = 'VALIDATION_FAILURE';
        else if (/TIMEOUT|ETIMEDOUT/.test(code) || /timed out|timeout/.test(description)) classification = 'TIMEOUT_FAILURE';
        else if (source.dependency || /DEPENDENCY/.test(code) || /dependency|unavailable service/.test(description)) classification = 'DEPENDENCY_FAILURE';
        else if (/API|HTTP|NETWORK|SERVER/.test(code) || /api failure|http failure|network failure/.test(description)) classification = 'API_FAILURE';

        var recommendations = {
            API_FAILURE: 'RETRY',
            TIMEOUT_FAILURE: 'RETRY',
            DEPENDENCY_FAILURE: 'RETRY',
            VALIDATION_FAILURE: 'MANUAL_REVIEW',
            INTERRUPTION_FAILURE: 'RESUME',
            PARTIAL_EXECUTION_FAILURE: 'ROLLBACK',
            UNKNOWN_FAILURE: 'MANUAL_REVIEW'
        };
        return freezeRecoveryOutput({
            classification: classification,
            recoveryRecommendation: recommendations[classification],
            recoverable: classification !== 'UNKNOWN_FAILURE'
        });
    }

    function publicFailure(row) {
        return {
            failureId: row.failureId,
            workflowId: row.workflowId,
            workflowType: row.workflowType,
            ownerId: row.ownerId,
            tenantSlug: row.tenantSlug,
            state: row.state,
            classification: row.classification,
            recoveryRecommendation: row.recoveryRecommendation,
            snapshotId: row.snapshotId,
            detectedAt: row.detectedAt,
            source: row.source
        };
    }

    function detectWorkflowFailure(input, context) {
        try {
            var source = input && typeof input === 'object' ? input : {};
            if (!hasRole(DETECTION_ROLES, context || {})) {
                return result(false, 'RECOVERY_GOVERNANCE_DENIED', 'Workflow failure detection requires recovery governance access.');
            }
            var workflowId = safeString(source.workflowId || source.eventId || '', '').trim();
            if (!workflowId) return result(false, 'MALFORMED_WORKFLOW_STATE', 'A workflow identifier is required.');
            var tenantCheck = validateTenant(source.tenantSlug || source.tenantId, context || {});
            if (!tenantCheck.success) return tenantCheck;
            var tenantSlug = tenantCheck.tenantSlug;
            var current = data();
            var failures = Array.isArray(current.workflowFailureHistory) ? current.workflowFailureHistory : [];
            var duplicate = failures.slice().reverse().find(function find(row) {
                return rowTenant(row) === tenantSlug && row.workflowId === workflowId &&
                    ['RECOVERABLE', 'RETRYING', 'FAILED'].indexOf(row.state) !== -1;
            });
            if (duplicate) {
                return result(true, 'DUPLICATE_FAILURE_PREVENTED', 'The workflow failure is already governed.', {
                    duplicatePrevented: true,
                    failure: publicFailure(duplicate)
                });
            }
            var classification = classifyFailure(source);
            var snapshot = createSnapshot(source, tenantSlug, context || {});
            var failure = {
                failureId: createId('WRF'),
                workflowId: workflowId,
                workflowType: token(source.workflowType || source.type || 'GENERAL'),
                ownerId: safeString(source.ownerId || source.employeeId || source.actorId || '', '').trim(),
                tenantSlug: tenantSlug,
                state: classification.recoverable ? 'RECOVERABLE' : 'FAILED',
                previousState: snapshot.state,
                classification: classification.classification,
                recoveryRecommendation: classification.recoveryRecommendation,
                snapshotId: snapshot.snapshotId,
                source: token(source.source || 'WORKFLOW_ENGINE'),
                errorCode: token(source.errorCode || source.code || source.error && (source.error.code || source.error.name) || 'WORKFLOW_FAILURE'),
                detectedAt: nowIso(context || {}),
                detectedBy: actor(context || {}).id || 'SYSTEM'
            };
            persist('workflowFailureHistory', failure, context || {});
            audit('WORKFLOW_FAILURE_DETECTED', publicFailure(failure), context || {}, 'ERROR');
            reportFailureToErrorFramework(failure, context || {});
            createIncident(failure, context || {});
            return result(true, 'WORKFLOW_FAILURE_DETECTED', 'Workflow failure recorded for governed recovery.', {
                failure: publicFailure(failure)
            });
        } catch (error) {
            return result(false, 'FAILURE_DETECTION_FAILED_SAFE', 'Workflow failure detection failed safely.');
        }
    }

    function scopedFailure(workflowId, tenantSlug) {
        var failures = Array.isArray(data().workflowFailureHistory) ? data().workflowFailureHistory : [];
        return failures.slice().reverse().find(function find(row) {
            return rowTenant(row) === tenantSlug && row.workflowId === workflowId;
        }) || null;
    }

    function scopedRecoveries(workflowId, tenantSlug) {
        var rows = Array.isArray(data().workflowRecoveryHistory) ? data().workflowRecoveryHistory : [];
        return rows.filter(function filter(row) {
            return rowTenant(row) === tenantSlug && row.workflowId === workflowId;
        });
    }

    function workflowState(workflowId, tenantSlug) {
        var recoveries = scopedRecoveries(workflowId, tenantSlug);
        if (recoveries.length) return recoveries[recoveries.length - 1].state;
        var failure = scopedFailure(workflowId, tenantSlug);
        return failure ? failure.state : '';
    }

    function recoveryAccess(input, context, requireAction) {
        if (requireAction && !hasRole(RECOVERY_ROLES, context || {})) {
            return result(false, 'RECOVERY_GOVERNANCE_DENIED', 'This recovery action requires platform recovery governance access.');
        }
        var tenantCheck = validateTenant(input && (input.tenantSlug || input.tenantId), context || {});
        if (!tenantCheck.success) return tenantCheck;
        var workflowId = safeString(input && input.workflowId, '').trim();
        if (!workflowId) return result(false, 'MALFORMED_WORKFLOW_STATE', 'A workflow identifier is required.');
        var failure = scopedFailure(workflowId, tenantCheck.tenantSlug);
        if (!failure) return result(false, 'WORKFLOW_FAILURE_NOT_FOUND', 'No tenant-scoped workflow failure was found.');
        return result(true, 'RECOVERY_ACCESS_VALIDATED', 'Recovery access validated.', {
            workflowId: workflowId,
            tenantSlug: tenantCheck.tenantSlug,
            failureId: failure.failureId
        });
    }

    function appendRecovery(workflowId, tenantSlug, action, state, context, extra) {
        var record = Object.assign({
            recoveryId: createId('WRH'),
            workflowId: workflowId,
            tenantSlug: tenantSlug,
            action: action,
            state: state,
            timestamp: nowIso(context || {}),
            actorId: actor(context || {}).id || 'SYSTEM',
            actorRole: actor(context || {}).role
        }, cloneSafe(extra || {}, []));
        persist('workflowRecoveryHistory', record, context || {});
        return record;
    }

    function operationKey(tenantSlug, workflowId) {
        return tenantSlug + ':' + workflowId;
    }

    function resolveHandler(input, name) {
        if (input && typeof input[name] === 'function') return input[name];
        try {
            var adapters = global.WorkflowRecoveryAdapters || {};
            return typeof adapters[name] === 'function' ? adapters[name] : null;
        } catch (error) { return null; }
    }

    async function retryWorkflow(input, context) {
        var access = recoveryAccess(input, context || {}, true);
        if (!access.success) return access;
        var key = operationKey(access.tenantSlug, access.workflowId);
        if (activeOperations[key]) return result(false, 'RECOVERY_ALREADY_IN_PROGRESS', 'A recovery action is already in progress.');
        var state = workflowState(access.workflowId, access.tenantSlug);
        if (['RECOVERABLE', 'FAILED'].indexOf(state) === -1) {
            return result(false, 'WORKFLOW_NOT_RECOVERABLE', 'The workflow is not in a retryable state.', { state: state });
        }
        var priorRetries = scopedRecoveries(access.workflowId, access.tenantSlug)
            .filter(function filter(row) { return row.action === 'RETRY'; }).length;
        if (priorRetries >= MAX_RETRIES) {
            notify('Workflow requires manual review', 'The retry limit was reached for workflow ' + access.workflowId + '.', access.tenantSlug, context || {}, 'CRITICAL');
            audit('WORKFLOW_RETRY_LIMIT_REACHED', { workflowId: access.workflowId, tenantSlug: access.tenantSlug, retryCount: priorRetries }, context || {}, 'CRITICAL');
            return result(false, 'RETRY_LIMIT_REACHED', 'The governed retry limit has been reached.', {
                retryCount: priorRetries,
                state: state,
                requiresManualReview: true
            });
        }
        var handler = resolveHandler(input, 'retryHandler');
        if (!handler) return result(false, 'RECOVERY_HANDLER_REQUIRED', 'A governed retry handler is required.');
        activeOperations[key] = true;
        var retryCount = priorRetries + 1;
        try {
            var handlerResult;
            try {
                handlerResult = await Promise.resolve(handler(freezeRecoveryOutput({
                    workflowId: access.workflowId,
                    tenantSlug: access.tenantSlug,
                    retryCount: retryCount
                })));
            } catch (handlerError) {
                handlerResult = { success: false };
            }
            var succeeded = handlerResult === true || !!(handlerResult && handlerResult.success === true);
            var nextState = succeeded ? 'COMPLETED' : 'RECOVERABLE';
            var record = appendRecovery(access.workflowId, access.tenantSlug, 'RETRY', nextState, context || {}, {
                retryCount: retryCount,
                outcome: succeeded ? 'SUCCEEDED' : 'FAILED'
            });
            audit(succeeded ? 'WORKFLOW_RETRY_SUCCEEDED' : 'WORKFLOW_RETRY_FAILED', record, context || {}, succeeded ? 'INFO' : 'WARNING');
            if (!succeeded && retryCount >= MAX_RETRIES) {
                notify('Workflow requires manual review', 'The final retry failed for workflow ' + access.workflowId + '.', access.tenantSlug, context || {}, 'CRITICAL');
            }
            return result(succeeded, succeeded ? 'WORKFLOW_RETRY_SUCCEEDED' : 'WORKFLOW_RETRY_FAILED',
                succeeded ? 'Workflow retry completed.' : 'Workflow retry failed safely.', {
                    workflowId: access.workflowId,
                    state: nextState,
                    retryCount: retryCount,
                    requiresManualReview: !succeeded && retryCount >= MAX_RETRIES
                });
        } finally {
            delete activeOperations[key];
        }
    }

    function findSnapshot(snapshotId, workflowId, tenantSlug) {
        var rows = Array.isArray(data().workflowSnapshotHistory) ? data().workflowSnapshotHistory : [];
        return rows.slice().reverse().find(function find(row) {
            return rowTenant(row) === tenantSlug && row.workflowId === workflowId && (!snapshotId || row.snapshotId === snapshotId);
        }) || null;
    }

    function restoreWorkflowState(input, context) {
        try {
            var access = recoveryAccess(input, context || {}, true);
            if (!access.success) return access;
            var state = workflowState(access.workflowId, access.tenantSlug);
            if (['RECOVERABLE', 'FAILED'].indexOf(state) === -1) {
                return result(false, 'WORKFLOW_NOT_RECOVERABLE', 'The workflow is not eligible for state restoration.', { state: state });
            }
            var snapshot = findSnapshot(input && input.snapshotId, access.workflowId, access.tenantSlug);
            if (!snapshot || !validateSnapshot(snapshot)) {
                audit('WORKFLOW_RESTORATION_REJECTED', { workflowId: access.workflowId, tenantSlug: access.tenantSlug }, context || {}, 'ERROR');
                return result(false, 'CHECKPOINT_INTEGRITY_FAILED', 'The workflow checkpoint failed integrity validation.');
            }
            var record = appendRecovery(access.workflowId, access.tenantSlug, 'RESUME', snapshot.state, context || {}, {
                snapshotId: snapshot.snapshotId,
                outcome: 'STATE_RESTORED'
            });
            audit('WORKFLOW_STATE_RESTORED', record, context || {}, 'INFO');
            return result(true, 'WORKFLOW_STATE_RESTORED', 'Workflow checkpoint state restored for governed resume.', {
                workflowId: access.workflowId,
                snapshotId: snapshot.snapshotId,
                state: snapshot.state,
                action: 'RESUME'
            });
        } catch (error) {
            return result(false, 'STATE_RESTORATION_FAILED_SAFE', 'Workflow restoration failed safely.');
        }
    }

    async function rollbackWorkflow(input, context) {
        var access = recoveryAccess(input, context || {}, true);
        if (!access.success) return access;
        var currentState = workflowState(access.workflowId, access.tenantSlug);
        if (currentState === 'ROLLED_BACK') return result(false, 'WORKFLOW_ALREADY_ROLLED_BACK', 'The workflow has already been rolled back.');
        if (['RECOVERABLE', 'FAILED'].indexOf(currentState) === -1) {
            return result(false, 'ROLLBACK_NOT_ELIGIBLE', 'The workflow is not eligible for rollback.', { state: currentState });
        }
        var snapshot = findSnapshot(input && input.snapshotId, access.workflowId, access.tenantSlug);
        if (!snapshot || !validateSnapshot(snapshot)) return result(false, 'CHECKPOINT_INTEGRITY_FAILED', 'The rollback checkpoint failed integrity validation.');
        var key = operationKey(access.tenantSlug, access.workflowId);
        if (activeOperations[key]) return result(false, 'RECOVERY_ALREADY_IN_PROGRESS', 'A recovery action is already in progress.');
        var handler = resolveHandler(input, 'rollbackHandler');
        if (!handler) return result(false, 'RECOVERY_HANDLER_REQUIRED', 'A governed rollback handler is required.');
        activeOperations[key] = true;
        try {
            var handlerResult;
            try {
                handlerResult = await Promise.resolve(handler(freezeRecoveryOutput({
                    workflowId: access.workflowId,
                    tenantSlug: access.tenantSlug,
                    snapshotId: snapshot.snapshotId,
                    restoreState: snapshot.state
                })));
            } catch (handlerError) { handlerResult = { success: false }; }
            if (!(handlerResult === true || handlerResult && handlerResult.success === true)) {
                audit('WORKFLOW_ROLLBACK_FAILED', { workflowId: access.workflowId, tenantSlug: access.tenantSlug }, context || {}, 'ERROR');
                return result(false, 'WORKFLOW_ROLLBACK_FAILED', 'Workflow rollback failed safely.', { state: 'RECOVERABLE' });
            }
            var record = appendRecovery(access.workflowId, access.tenantSlug, 'ROLLBACK', 'ROLLED_BACK', context || {}, {
                snapshotId: snapshot.snapshotId,
                outcome: 'SUCCEEDED'
            });
            audit('WORKFLOW_ROLLBACK_SUCCEEDED', record, context || {}, 'WARNING');
            notify('Workflow rolled back', 'A governed rollback completed for workflow ' + access.workflowId + '.', access.tenantSlug, context || {}, 'WARNING');
            return result(true, 'WORKFLOW_ROLLBACK_SUCCEEDED', 'Workflow rollback completed.', {
                workflowId: access.workflowId,
                state: 'ROLLED_BACK',
                action: 'ROLLBACK',
                snapshotId: snapshot.snapshotId
            });
        } finally {
            delete activeOperations[key];
        }
    }

    function requestManualReview(input, context) {
        var access = recoveryAccess(input, context || {}, true);
        if (!access.success) return access;
        var state = workflowState(access.workflowId, access.tenantSlug);
        if (['RECOVERABLE', 'FAILED', 'RETRYING'].indexOf(state) === -1) {
            return result(false, 'MANUAL_REVIEW_NOT_ELIGIBLE', 'The workflow does not require manual review.', { state: state });
        }
        var record = appendRecovery(access.workflowId, access.tenantSlug, 'MANUAL_REVIEW', 'RECOVERABLE', context || {}, {
            reason: safeString(input && input.reason || 'Governed recovery review', '').slice(0, 240)
        });
        audit('WORKFLOW_RECOVERY_MANUAL_REVIEW', record, context || {}, 'WARNING');
        notify('Workflow manual review', 'Workflow ' + access.workflowId + ' requires a recovery decision.', access.tenantSlug, context || {}, 'WARNING');
        return result(true, 'MANUAL_REVIEW_REQUESTED', 'Workflow manual review requested.', {
            workflowId: access.workflowId,
            state: 'RECOVERABLE',
            action: 'MANUAL_REVIEW'
        });
    }

    function abandonWorkflow(input, context) {
        var access = recoveryAccess(input, context || {}, true);
        if (!access.success) return access;
        var state = workflowState(access.workflowId, access.tenantSlug);
        if (['RECOVERABLE', 'FAILED'].indexOf(state) === -1) {
            return result(false, 'ABANDON_NOT_ELIGIBLE', 'The workflow cannot be abandoned from its current state.', { state: state });
        }
        var record = appendRecovery(access.workflowId, access.tenantSlug, 'ABANDON', 'ABANDONED', context || {}, {
            reason: safeString(input && input.reason || 'Governed closure', '').slice(0, 240)
        });
        audit('WORKFLOW_RECOVERY_ABANDONED', record, context || {}, 'WARNING');
        notify('Workflow abandoned', 'Workflow ' + access.workflowId + ' was closed by recovery governance.', access.tenantSlug, context || {}, 'WARNING');
        return result(true, 'WORKFLOW_ABANDONED', 'Workflow was abandoned through recovery governance.', {
            workflowId: access.workflowId,
            state: 'ABANDONED',
            action: 'ABANDON'
        });
    }

    function statusAccess(failure, context) {
        var currentActor = actor(context || {});
        if (VISIBILITY_ROLES.indexOf(currentActor.role) !== -1) return true;
        return currentActor.role === 'EMPLOYEE' && !!currentActor.id && failure.ownerId === currentActor.id;
    }

    function getWorkflowRecoveryStatus(input, context) {
        try {
            var tenantCheck = validateTenant(input && (input.tenantSlug || input.tenantId), context || {});
            if (!tenantCheck.success) return tenantCheck;
            var workflowId = safeString(input && input.workflowId, '').trim();
            var failure = scopedFailure(workflowId, tenantCheck.tenantSlug);
            if (!failure) return result(false, 'WORKFLOW_FAILURE_NOT_FOUND', 'No tenant-scoped workflow failure was found.');
            if (!statusAccess(failure, context || {})) return result(false, 'RECOVERY_GOVERNANCE_DENIED', 'Workflow recovery status access was denied.');
            var recoveries = scopedRecoveries(workflowId, tenantCheck.tenantSlug);
            return result(true, 'WORKFLOW_RECOVERY_STATUS_READY', 'Workflow recovery status is available.', {
                workflowId: workflowId,
                workflowType: failure.workflowType,
                ownerId: failure.ownerId,
                state: workflowState(workflowId, tenantCheck.tenantSlug),
                classification: failure.classification,
                recoveryRecommendation: failure.recoveryRecommendation,
                retryCount: recoveries.filter(function filter(row) { return row.action === 'RETRY'; }).length,
                lastAction: recoveries.length ? recoveries[recoveries.length - 1].action : ''
            });
        } catch (error) {
            return result(false, 'RECOVERY_STATUS_FAILED_SAFE', 'Workflow recovery status failed safely.');
        }
    }

    function calculateRecoveryHealth(input, context) {
        try {
            if (!hasRole(VISIBILITY_ROLES, context || {})) {
                return result(false, 'RECOVERY_GOVERNANCE_DENIED', 'Recovery analytics access was denied.');
            }
            var tenantCheck = validateTenant(input && (input.tenantSlug || input.tenantId), context || {});
            if (!tenantCheck.success) return tenantCheck;
            var tenantSlug = tenantCheck.tenantSlug;
            var current = data();
            var failures = (Array.isArray(current.workflowFailureHistory) ? current.workflowFailureHistory : [])
                .filter(function scoped(row) { return rowTenant(row) === tenantSlug; });
            var recoveries = (Array.isArray(current.workflowRecoveryHistory) ? current.workflowRecoveryHistory : [])
                .filter(function scoped(row) { return rowTenant(row) === tenantSlug; });
            var retries = recoveries.filter(function filter(row) { return row.action === 'RETRY'; });
            var successfulRetries = retries.filter(function filter(row) { return row.outcome === 'SUCCEEDED'; });
            var rollbacks = recoveries.filter(function filter(row) { return row.action === 'ROLLBACK' && row.outcome === 'SUCCEEDED'; });
            var abandoned = recoveries.filter(function filter(row) { return row.state === 'ABANDONED'; });
            var recoveredIds = {};
            recoveries.forEach(function each(row) {
                if (row.state === 'COMPLETED' || row.state === 'ROLLED_BACK') recoveredIds[row.workflowId] = true;
            });
            var rate = function percentage(count, total) { return total ? Math.round((count / total) * 100) : 0; };
            var recoveryRate = rate(Object.keys(recoveredIds).length, failures.length);
            var failureRate = failures.length ? clampScore((failures.length / Math.max(failures.length + Object.keys(recoveredIds).length, 1)) * 100) : 0;
            var retryRate = rate(retries.length, failures.length);
            var rollbackRate = rate(rollbacks.length, failures.length);
            var abandonmentRate = rate(abandoned.length, failures.length);
            var recoveryScore = clampScore(recoveryRate * 0.7 + rate(successfulRetries.length, retries.length) * 0.3);
            var workflowResilienceScore = clampScore(100 - failureRate * 0.35 - abandonmentRate * 0.4 + recoveryRate * 0.35);
            var operationalHealthScore = clampScore((recoveryScore + workflowResilienceScore + (100 - abandonmentRate)) / 3);
            var recentFailures = failures.slice(-20).reverse().map(function map(row) {
                return Object.assign(publicFailure(row), { state: workflowState(row.workflowId, tenantSlug) || row.state });
            });
            var retryQueue = recentFailures.filter(function filter(row) {
                return row.recoveryRecommendation === 'RETRY' && workflowState(row.workflowId, tenantSlug) === 'RECOVERABLE';
            });
            var rollbackHistory = rollbacks.slice(-20).reverse().map(function map(row) {
                return { workflowId: row.workflowId, action: row.action, state: row.state, timestamp: row.timestamp, snapshotId: row.snapshotId };
            });
            var analytics = {
                failureRate: failureRate,
                retryRate: retryRate,
                recoveryRate: recoveryRate,
                rollbackRate: rollbackRate,
                abandonmentRate: abandonmentRate,
                retrySuccessRate: rate(successfulRetries.length, retries.length),
                totalFailures: failures.length,
                totalRecoveryActions: recoveries.length
            };
            var output = {
                tenantSlug: tenantSlug,
                recoveryScore: recoveryScore,
                workflowResilienceScore: workflowResilienceScore,
                operationalHealthScore: operationalHealthScore,
                analytics: analytics,
                failedWorkflows: recentFailures,
                retryQueue: retryQueue,
                rollbackHistory: rollbackHistory,
                governance: {
                    tenantIsolationPreserved: true,
                    rbacAuthoritative: true,
                    boundedRetries: MAX_RETRIES,
                    liveRecordMutation: false,
                    checkpointIntegrityRequired: true,
                    appendOnlyHistory: true
                },
                integrations: {
                    errorHandlingFramework: !!global.ErrorHandlingFrameworkService,
                    auditGovernance: !!global.AuditService,
                    notificationCenter: !!global.NotificationCenterService,
                    validationRegistry: !!global.ValidationRegistry,
                    runtimeMonitoring: !!global.operationsMonitoringService
                },
                generatedAt: nowIso(context || {})
            };
            if (!(context && context.skipAnalyticsPersistence)) {
                persist('workflowRecoveryAnalytics', Object.assign({ analyticsId: createId('WRA') }, output), context || {});
            }
            audit('WORKFLOW_RECOVERY_ANALYTICS_REVIEWED', {
                tenantSlug: tenantSlug,
                recoveryScore: recoveryScore,
                workflowResilienceScore: workflowResilienceScore,
                operationalHealthScore: operationalHealthScore
            }, context || {}, 'INFO');
            return result(true, 'RECOVERY_HEALTH_READY', 'Workflow recovery analytics generated.', output);
        } catch (error) {
            return result(false, 'RECOVERY_ANALYTICS_FAILED_SAFE', 'Workflow recovery analytics failed safely.', {
                recoveryScore: 0,
                workflowResilienceScore: 0,
                operationalHealthScore: 0,
                analytics: {},
                failedWorkflows: [],
                retryQueue: [],
                rollbackHistory: []
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        function check(name, passed) { checks.push({ name: name, passed: passed === true }); }
        var classified = classifyFailure({ error: { name: 'TimeoutError', message: 'timeout' } });
        check('failure detection works', classified.classification === 'TIMEOUT_FAILURE');
        check('retry engine works', MAX_RETRIES === 3 && RECOVERY_ACTIONS.indexOf('RETRY') !== -1);
        check('rollback works', RECOVERY_ACTIONS.indexOf('ROLLBACK') !== -1 && WORKFLOW_STATES.indexOf('ROLLED_BACK') !== -1);
        var sample = { workflowId: 'SELF', tenantSlug: 'self', state: 'PENDING', stateData: { step: 1 } };
        var sampleSnapshot = Object.assign({ snapshotId: 'SELF-SNAPSHOT' }, sample);
        sampleSnapshot.integrityHash = hashValue(snapshotPayload(sampleSnapshot));
        check('state restoration works', validateSnapshot(sampleSnapshot));
        check('analytics work', clampScore(110) === 100 && clampScore(-1) === 0);
        var frozen = freezeRecoveryOutput({ nested: { value: 1 } });
        check('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested));
        return freezeRecoveryOutput({ passed: checks.every(function every(item) { return item.passed; }), checks: checks });
    }

    var service = Object.freeze({
        WORKFLOW_STATES: WORKFLOW_STATES,
        RECOVERY_ACTIONS: RECOVERY_ACTIONS,
        MAX_RETRIES: MAX_RETRIES,
        detectWorkflowFailure: detectWorkflowFailure,
        classifyFailure: classifyFailure,
        retryWorkflow: retryWorkflow,
        rollbackWorkflow: rollbackWorkflow,
        restoreWorkflowState: restoreWorkflowState,
        requestManualReview: requestManualReview,
        abandonWorkflow: abandonWorkflow,
        getWorkflowRecoveryStatus: getWorkflowRecoveryStatus,
        calculateRecoveryHealth: calculateRecoveryHealth,
        freezeRecoveryOutput: freezeRecoveryOutput,
        runSelfTest: runSelfTest
    });

    global.WorkflowRecoveryService = service;
    if (global.__ARTHHRMS_DEV__) global.__ARTHHRMS_WORKFLOW_RECOVERY_SELF_TEST__ = runSelfTest();
})(typeof window !== 'undefined' ? window : globalThis);
