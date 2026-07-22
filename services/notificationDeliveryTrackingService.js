/**
 * ARTHHRMS Notification Delivery Tracking Service
 * Observes communication lifecycle reliability without owning channel delivery.
 */
(function attachNotificationDeliveryTrackingService(global) {
    'use strict';

    var SOURCE = 'notificationDeliveryTrackingService';
    var NOTIFICATION_STATES = Object.freeze([
        'CREATED', 'QUEUED', 'PROCESSING', 'SENT', 'DELIVERED', 'OPENED', 'ACKNOWLEDGED',
        'FAILED', 'EXPIRED', 'CANCELLED', 'RETRYING'
    ]);
    var DELIVERY_CHANNELS = Object.freeze(['IN_APP', 'EMAIL', 'SMS', 'PUSH']);
    var PREPARED_CHANNELS = Object.freeze(['WHATSAPP', 'MICROSOFT_TEAMS', 'SLACK']);
    var TRACKING_ROLES = Object.freeze(['HR', 'DIRECTOR', 'SUPER_ADMIN']);
    var RETRY_ROLES = Object.freeze(['SUPER_ADMIN']);
    var VISIBILITY_ROLES = Object.freeze(['HR', 'DIRECTOR', 'SUPER_ADMIN']);
    var MAX_RETRIES = 3;
    var activeRetries = Object.create(null);

    var TRANSITIONS = Object.freeze({
        CREATED: Object.freeze(['QUEUED', 'CANCELLED', 'EXPIRED']),
        QUEUED: Object.freeze(['PROCESSING', 'CANCELLED', 'EXPIRED']),
        PROCESSING: Object.freeze(['SENT', 'FAILED', 'RETRYING', 'CANCELLED']),
        SENT: Object.freeze(['DELIVERED', 'OPENED', 'ACKNOWLEDGED', 'FAILED', 'EXPIRED']),
        DELIVERED: Object.freeze(['OPENED', 'ACKNOWLEDGED']),
        OPENED: Object.freeze(['ACKNOWLEDGED']),
        ACKNOWLEDGED: Object.freeze([]),
        FAILED: Object.freeze(['RETRYING', 'DELIVERED', 'CANCELLED', 'EXPIRED']),
        RETRYING: Object.freeze(['PROCESSING', 'SENT', 'FAILED', 'CANCELLED']),
        EXPIRED: Object.freeze([]),
        CANCELLED: Object.freeze([])
    });

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

    function normalizeChannel(value) {
        var channel = token(value || 'IN_APP');
        if (channel === 'INAPP') return 'IN_APP';
        if (channel === 'PUSH_NOTIFICATION' || channel === 'PUSH_NOTIFICATIONS') return 'PUSH';
        if (channel === 'TEAMS') return 'MICROSOFT_TEAMS';
        return channel || 'IN_APP';
    }

    function normalizeState(value) {
        var state = token(value || 'CREATED');
        if (state === 'VIEWED' || state === 'READ' || state === 'OPEN') return 'OPENED';
        if (state === 'BOUNCED') return 'FAILED';
        return NOTIFICATION_STATES.indexOf(state) !== -1 ? state : '';
    }

    function nowIso(context, explicitValue) {
        try {
            var stamp = explicitValue ? new Date(explicitValue) : context && context.now ? new Date(context.now) : new Date();
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

    function freezeNotificationOutput(value) {
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
        return freezeNotificationOutput(Object.assign({
            success: success === true,
            code: token(code || (success ? 'NOTIFICATION_DELIVERY_TRACKED' : 'NOTIFICATION_DELIVERY_FAILED')),
            message: safeString(message || (success ? 'Notification delivery tracked.' : 'Notification delivery operation failed.'), '').slice(0, 240)
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
                    module: 'Notification Reliability',
                    severity: severity || (/FAILED|DENIED|CANCELLED|LIMIT/.test(actionType) ? 'WARNING' : 'INFO'),
                    metadata: cloneSafe(metadata || {}, [])
                }, { source: SOURCE, actor: currentActor });
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
            return result(false, 'TENANT_ACCESS_DENIED', 'Tenant-scoped notification delivery access was denied.');
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
                    return result(false, 'TENANT_ACCESS_DENIED', 'Tenant-scoped notification delivery access was denied.');
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

    function validRecipient(input, channel) {
        var source = input && typeof input === 'object' ? input : {};
        var recipient = safeString(source.recipient || source.recipientAddress || source.email || source.phone || '', '').trim();
        var recipientId = safeString(source.recipientId || source.employeeId || source.targetEmpId || '', '').trim();
        var recipientRole = normalizeRole(source.recipientRole || source.targetRole || source.toRole || '');
        if (recipient) {
            if (channel === 'EMAIL' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) return false;
            if (channel === 'SMS' && !/^\+?[1-9]\d{7,14}$/.test(recipient.replace(/[\s()-]/g, ''))) return false;
            if (channel === 'PUSH' && recipient.length < 6) return false;
        }
        return !!(recipient || recipientId || recipientRole);
    }

    function publicDelivery(row) {
        return {
            trackingId: row.trackingId,
            notificationId: row.notificationId,
            tenantSlug: row.tenantSlug,
            channel: row.channel,
            state: row.state,
            previousState: row.previousState || '',
            recipientId: row.recipientId || '',
            recipientRole: row.recipientRole || '',
            source: row.source,
            correlationId: row.correlationId || '',
            retryCount: row.retryCount || 0,
            failureClassification: row.failureClassification || '',
            failureReason: row.failureReason || row.failureClassification || '',
            recoveryRecommendation: row.recoveryRecommendation || '',
            lateConfirmation: row.lateConfirmation === true,
            occurredAt: row.occurredAt,
            sendTimestamp: row.sendTimestamp || '',
            deliveryTimestamp: row.deliveryTimestamp || '',
            openTimestamp: row.openTimestamp || '',
            acknowledgementTimestamp: row.acknowledgementTimestamp || ''
        };
    }

    function classifyDeliveryFailure(input) {
        var source = input && typeof input === 'object' ? input : {};
        var error = source.error && typeof source.error === 'object' ? source.error : {};
        var code = token(source.errorCode || source.code || error.code || error.name || '');
        var description = (safeString(source.message || source.failureReason || error.message || '', '') + ' ' + safeString(source.channel || '', '')).toLowerCase();
        var classification = 'UNKNOWN_DELIVERY_FAILURE';
        if (/INVALID_RECIPIENT|INVALID_EMAIL|INVALID_PHONE|UNKNOWN_RECIPIENT/.test(code) || /invalid recipient|invalid email|invalid phone/.test(description)) classification = 'INVALID_RECIPIENT';
        else if (/OUTAGE|CHANNEL_UNAVAILABLE|PROVIDER_UNAVAILABLE/.test(code) || /outage|provider unavailable|channel unavailable/.test(description)) classification = 'CHANNEL_OUTAGE';
        else if (/TIMEOUT|ETIMEDOUT/.test(code) || /timeout|timed out/.test(description)) classification = 'DELIVERY_TIMEOUT';
        else if (/RATE_LIMIT|THROTTLED/.test(code) || /rate limit|throttl/.test(description)) classification = 'RATE_LIMITED';
        else if (/REJECT|BOUNCE|PROVIDER_ERROR/.test(code) || /rejected|bounced|provider error/.test(description)) classification = 'PROVIDER_REJECTION';
        var recommendations = {
            INVALID_RECIPIENT: 'MANUAL_REVIEW',
            CHANNEL_OUTAGE: 'RETRY',
            DELIVERY_TIMEOUT: 'RETRY',
            RATE_LIMITED: 'RETRY',
            PROVIDER_REJECTION: 'MANUAL_REVIEW',
            UNKNOWN_DELIVERY_FAILURE: 'MANUAL_REVIEW'
        };
        return freezeNotificationOutput({
            classification: classification,
            recoveryRecommendation: recommendations[classification],
            retryEligible: ['CHANNEL_OUTAGE', 'DELIVERY_TIMEOUT', 'RATE_LIMITED'].indexOf(classification) !== -1 || classification === 'UNKNOWN_DELIVERY_FAILURE'
        });
    }

    function historiesFor(notificationId, tenantSlug, channel) {
        var rows = Array.isArray(data().notificationDeliveryTrackingHistory) ? data().notificationDeliveryTrackingHistory : [];
        return rows.filter(function filter(row) {
            return rowTenant(row) === tenantSlug && row.notificationId === notificationId && (!channel || row.channel === channel);
        });
    }

    function retryRows(notificationId, tenantSlug, channel) {
        var rows = Array.isArray(data().notificationDeliveryRetryHistory) ? data().notificationDeliveryRetryHistory : [];
        return rows.filter(function filter(row) {
            return rowTenant(row) === tenantSlug && row.notificationId === notificationId && (!channel || row.channel === channel);
        });
    }

    function createTrackingRecord(input, tenantSlug, state, previousState, context, synthetic) {
        var source = input && typeof input === 'object' ? input : {};
        var channel = normalizeChannel(source.channel || 'IN_APP');
        var occurredAt = nowIso(context || {}, source.occurredAt || source.timestamp);
        var failure = state === 'FAILED' ? classifyDeliveryFailure(source) : null;
        var retries = retryRows(safeString(source.notificationId || source.id, ''), tenantSlug, channel);
        return {
            trackingId: createId('NDT'),
            notificationId: safeString(source.notificationId || source.id, '').trim(),
            tenantSlug: tenantSlug,
            channel: channel,
            state: state,
            previousState: previousState || '',
            recipientId: safeString(source.recipientId || source.employeeId || source.targetEmpId || '', '').trim(),
            recipientRole: normalizeRole(source.recipientRole || source.targetRole || source.toRole || ''),
            source: token(source.source || source.module || 'NOTIFICATION_CENTER'),
            correlationId: safeString(source.correlationId || '', '').trim(),
            providerEventId: safeString(source.providerEventId || source.deliveryEventId || '', '').trim(),
            retryCount: Number.isFinite(Number(source.retryCount))
                ? Math.max(0, Number(source.retryCount))
                : retries.filter(function filter(row) { return row.action === 'RETRY'; }).length,
            failureClassification: failure ? failure.classification : '',
            failureReason: failure ? failure.classification : '',
            recoveryRecommendation: failure ? failure.recoveryRecommendation : '',
            lateConfirmation: source.lateConfirmation === true,
            synthetic: synthetic === true,
            occurredAt: occurredAt,
            sendTimestamp: state === 'SENT' ? occurredAt : '',
            deliveryTimestamp: state === 'DELIVERED' ? occurredAt : '',
            openTimestamp: state === 'OPENED' ? occurredAt : '',
            acknowledgementTimestamp: state === 'ACKNOWLEDGED' ? occurredAt : '',
            immutable: true
        };
    }

    function appendTracking(record, context) {
        persist('notificationDeliveryTrackingHistory', record, context || {});
        if (record.state === 'OPENED' || record.state === 'ACKNOWLEDGED') {
            persist('notificationEngagementTrackingHistory', {
                engagementId: createId('NDE'),
                notificationId: record.notificationId,
                tenantSlug: record.tenantSlug,
                channel: record.channel,
                state: record.state,
                recipientId: record.recipientId,
                occurredAt: record.occurredAt,
                immutable: true
            }, context || {});
        }
        return record;
    }

    function trackNotificationDelivery(input, context) {
        try {
            var source = input && typeof input === 'object' ? input : {};
            if (!hasRole(TRACKING_ROLES, context || {})) {
                return result(false, 'NOTIFICATION_GOVERNANCE_DENIED', 'Notification delivery tracking requires governance access.');
            }
            var notificationId = safeString(source.notificationId || source.id || '', '').trim();
            if (!notificationId) return result(false, 'MALFORMED_NOTIFICATION_PAYLOAD', 'A notification identifier is required.');
            var tenantCheck = validateTenant(source.tenantSlug || source.tenantId, context || {});
            if (!tenantCheck.success) return tenantCheck;
            var tenantSlug = tenantCheck.tenantSlug;
            var channel = normalizeChannel(source.channel || 'IN_APP');
            if (DELIVERY_CHANNELS.indexOf(channel) === -1) {
                return result(false, PREPARED_CHANNELS.indexOf(channel) !== -1 ? 'CHANNEL_NOT_ACTIVE' : 'UNSUPPORTED_DELIVERY_CHANNEL', 'The delivery channel is not active.');
            }
            var state = normalizeState(source.state || source.status || 'CREATED');
            if (!state) return result(false, 'INVALID_NOTIFICATION_STATE', 'The notification delivery state is invalid.');
            if (!validRecipient(source, channel)) return result(false, 'INVALID_NOTIFICATION_RECIPIENT', 'The notification recipient is invalid.');
            var history = historiesFor(notificationId, tenantSlug, channel);
            var providerEventId = safeString(source.providerEventId || source.deliveryEventId || '', '').trim();
            var duplicate = history.slice().reverse().find(function find(row) {
                if (providerEventId) return row.providerEventId === providerEventId && row.state === state;
                return row.state === state && row.occurredAt === nowIso(context || {}, source.occurredAt || source.timestamp);
            });
            if (duplicate) {
                return result(true, 'DUPLICATE_DELIVERY_PREVENTED', 'Duplicate notification delivery event prevented.', {
                    duplicatePrevented: true,
                    delivery: publicDelivery(duplicate)
                });
            }
            if (!history.length && state !== 'CREATED') {
                var synthetic = createTrackingRecord(source, tenantSlug, 'CREATED', '', context || {}, true);
                appendTracking(synthetic, context || {});
                history = [synthetic];
            }
            var previous = history.length ? history[history.length - 1] : null;
            var previousState = previous ? previous.state : '';
            if (previousState && previousState !== state) {
                var allowed = TRANSITIONS[previousState] || [];
                var lateAllowed = previousState === 'FAILED' && state === 'DELIVERED' && source.lateConfirmation === true;
                var directInAppDelivery = channel === 'IN_APP' && previousState === 'CREATED' && state === 'DELIVERED';
                if ((allowed.indexOf(state) === -1 && !directInAppDelivery) || (previousState === 'FAILED' && state === 'DELIVERED' && !lateAllowed)) {
                    audit('NOTIFICATION_DELIVERY_TRANSITION_BLOCKED', { notificationId: notificationId, tenantSlug: tenantSlug, channel: channel, previousState: previousState, state: state }, context || {}, 'WARNING');
                    return result(false, 'INVALID_DELIVERY_TRANSITION', 'The notification delivery transition is not permitted.', {
                        notificationId: notificationId,
                        channel: channel,
                        previousState: previousState,
                        state: state
                    });
                }
            } else if (previousState === state) {
                return result(true, 'DUPLICATE_DELIVERY_PREVENTED', 'Duplicate notification delivery state prevented.', {
                    duplicatePrevented: true,
                    delivery: publicDelivery(previous)
                });
            }
            var record = createTrackingRecord(source, tenantSlug, state, previousState, context || {}, false);
            appendTracking(record, context || {});
            var action = state === 'ACKNOWLEDGED' ? 'NOTIFICATION_ACKNOWLEDGED' : 'NOTIFICATION_DELIVERY_' + state;
            audit(action, publicDelivery(record), context || {}, state === 'FAILED' ? 'ERROR' : state === 'CANCELLED' ? 'WARNING' : 'INFO');
            return result(true, action, 'Notification delivery lifecycle updated.', {
                duplicatePrevented: false,
                delivery: publicDelivery(record),
                governance: {
                    tenantIsolationPreserved: true,
                    notificationGovernancePreserved: true,
                    duplicateDeliveryPrevented: true,
                    autonomousDeliveryDisabled: true
                }
            });
        } catch (error) {
            return result(false, 'DELIVERY_TRACKING_FAILED_SAFE', 'Notification delivery tracking failed safely.');
        }
    }

    function visibilityAllowed(row, context) {
        var currentActor = actor(context || {});
        if (VISIBILITY_ROLES.indexOf(currentActor.role) !== -1) return true;
        return currentActor.role === 'EMPLOYEE' && !!currentActor.id && row.recipientId === currentActor.id;
    }

    function deliveryAccess(input, context, retryRequired) {
        if (retryRequired && !hasRole(RETRY_ROLES, context || {})) {
            return result(false, 'NOTIFICATION_GOVERNANCE_DENIED', 'Notification retry requires platform delivery governance access.');
        }
        var tenantCheck = validateTenant(input && (input.tenantSlug || input.tenantId), context || {});
        if (!tenantCheck.success) return tenantCheck;
        var notificationId = safeString(input && input.notificationId, '').trim();
        if (!notificationId) return result(false, 'MALFORMED_NOTIFICATION_PAYLOAD', 'A notification identifier is required.');
        var requestedChannel = safeString(input && input.channel || '', '').trim();
        var channel = requestedChannel ? normalizeChannel(requestedChannel) : '';
        var rows = historiesFor(notificationId, tenantCheck.tenantSlug, channel);
        if (!rows.length) return result(false, 'NOTIFICATION_DELIVERY_NOT_FOUND', 'No tenant-scoped notification delivery was found.');
        var latest = rows[rows.length - 1];
        if (!retryRequired && !visibilityAllowed(latest, context || {})) {
            return result(false, 'NOTIFICATION_GOVERNANCE_DENIED', 'Notification delivery visibility was denied.');
        }
        return result(true, 'NOTIFICATION_DELIVERY_ACCESS_VALIDATED', 'Notification delivery access validated.', {
            notificationId: notificationId,
            tenantSlug: tenantCheck.tenantSlug,
            channel: latest.channel,
            latest: publicDelivery(latest)
        });
    }

    function resolveRetryHandler(input, channel) {
        if (input && typeof input.retryHandler === 'function') return input.retryHandler;
        try {
            var adapters = global.NotificationDeliveryAdapters || {};
            var adapter = adapters[channel] || adapters.default || adapters;
            return typeof adapter.retry === 'function' ? adapter.retry : typeof adapters.retryHandler === 'function' ? adapters.retryHandler : null;
        } catch (error) { return null; }
    }

    function recoveryHandoff(notificationId, tenantSlug, channel, context) {
        try {
            var service = global.WorkflowRecoveryService;
            if (!service || typeof service.detectWorkflowFailure !== 'function') return false;
            service.detectWorkflowFailure({
                workflowId: 'NOTIFICATION-' + notificationId,
                workflowType: 'NOTIFICATION_DELIVERY',
                tenantSlug: tenantSlug,
                state: 'PROCESSING',
                source: 'NOTIFICATION_DELIVERY_TRACKING',
                dependency: channel,
                errorCode: 'NOTIFICATION_RETRY_LIMIT_REACHED',
                stateData: { notificationId: notificationId, channel: channel }
            }, Object.assign({}, context || {}, { tenantSlug: tenantSlug, skipNotification: true }));
            return true;
        } catch (error) { return false; }
    }

    async function retryNotification(input, context) {
        var access = deliveryAccess(input, context || {}, true);
        if (!access.success) return access;
        var key = access.tenantSlug + ':' + access.notificationId + ':' + access.channel;
        if (activeRetries[key]) return result(false, 'RETRY_ALREADY_IN_PROGRESS', 'A notification retry is already in progress.');
        var rows = historiesFor(access.notificationId, access.tenantSlug, access.channel);
        var latest = rows[rows.length - 1];
        if (latest.state !== 'FAILED') {
            return result(false, 'NOTIFICATION_NOT_RETRYABLE', 'The notification is not in a retryable state.', { state: latest.state });
        }
        var retries = retryRows(access.notificationId, access.tenantSlug, access.channel).filter(function filter(row) { return row.action === 'RETRY'; });
        if (retries.length >= MAX_RETRIES) {
            recoveryHandoff(access.notificationId, access.tenantSlug, access.channel, context || {});
            audit('NOTIFICATION_RETRY_LIMIT_REACHED', { notificationId: access.notificationId, tenantSlug: access.tenantSlug, channel: access.channel, retryCount: retries.length }, context || {}, 'CRITICAL');
            return result(false, 'RETRY_LIMIT_REACHED', 'The governed notification retry limit has been reached.', {
                retryCount: retries.length,
                state: latest.state,
                requiresManualReview: true
            });
        }
        var handler = resolveRetryHandler(input, access.channel);
        if (!handler) return result(false, 'DELIVERY_ADAPTER_REQUIRED', 'A governed notification delivery adapter is required.');
        activeRetries[key] = true;
        var retryCount = retries.length + 1;
        try {
            trackNotificationDelivery({
                notificationId: access.notificationId,
                tenantSlug: access.tenantSlug,
                channel: access.channel,
                state: 'RETRYING',
                recipientId: latest.recipientId,
                recipientRole: latest.recipientRole,
                source: SOURCE,
                retryCount: retryCount,
                providerEventId: 'RETRYING-' + retryCount + '-' + createId('EVT')
            }, Object.assign({}, context || {}));
            var handlerResult;
            try {
                handlerResult = await Promise.resolve(handler(freezeNotificationOutput({
                    notificationId: access.notificationId,
                    tenantSlug: access.tenantSlug,
                    channel: access.channel,
                    retryCount: retryCount,
                    idempotencyKey: access.notificationId + ':' + access.channel + ':retry:' + retryCount
                })));
            } catch (handlerError) { handlerResult = { success: false }; }
            var succeeded = handlerResult === true || !!(handlerResult && (handlerResult.success === true || handlerResult.ok === true));
            var nextState = succeeded ? 'SENT' : 'FAILED';
            var tracked = trackNotificationDelivery({
                notificationId: access.notificationId,
                tenantSlug: access.tenantSlug,
                channel: access.channel,
                state: nextState,
                recipientId: latest.recipientId,
                recipientRole: latest.recipientRole,
                source: SOURCE,
                retryCount: retryCount,
                providerEventId: 'RETRY-' + retryCount + '-' + createId('EVT'),
                errorCode: succeeded ? '' : handlerResult && handlerResult.errorCode || 'RETRY_FAILED'
            }, Object.assign({}, context || {}));
            var retryRecord = {
                retryId: createId('NDR'),
                notificationId: access.notificationId,
                tenantSlug: access.tenantSlug,
                channel: access.channel,
                action: 'RETRY',
                retryCount: retryCount,
                outcome: succeeded ? 'SENT' : 'FAILED',
                timestamp: nowIso(context || {}),
                actorId: actor(context || {}).id,
                immutable: true
            };
            persist('notificationDeliveryRetryHistory', retryRecord, context || {});
            audit(succeeded ? 'NOTIFICATION_RETRY_SENT' : 'NOTIFICATION_RETRY_FAILED', retryRecord, context || {}, succeeded ? 'INFO' : 'WARNING');
            if (!succeeded && retryCount >= MAX_RETRIES) recoveryHandoff(access.notificationId, access.tenantSlug, access.channel, context || {});
            return result(succeeded && tracked.success, succeeded ? 'NOTIFICATION_RETRY_SENT' : 'NOTIFICATION_RETRY_FAILED',
                succeeded ? 'Notification retry was accepted by the governed channel adapter.' : 'Notification retry failed safely.', {
                    notificationId: access.notificationId,
                    channel: access.channel,
                    state: nextState,
                    retryCount: retryCount,
                    requiresManualReview: !succeeded && retryCount >= MAX_RETRIES
                });
        } finally {
            delete activeRetries[key];
        }
    }

    function latestRows(rows) {
        var latest = Object.create(null);
        rows.forEach(function each(row) { latest[row.notificationId + ':' + row.channel] = row; });
        return Object.keys(latest).map(function map(key) { return latest[key]; });
    }

    function percentage(count, total) {
        return total ? Math.round((count / total) * 100) : 0;
    }

    function calculateLatency(rows) {
        var groups = Object.create(null);
        rows.forEach(function each(row) {
            var key = row.notificationId + ':' + row.channel;
            if (!groups[key]) groups[key] = {};
            if (row.state === 'CREATED' && !groups[key].createdAt) groups[key].createdAt = row.occurredAt;
            if (['DELIVERED', 'OPENED', 'ACKNOWLEDGED'].indexOf(row.state) !== -1 && !groups[key].deliveredAt) groups[key].deliveredAt = row.occurredAt;
        });
        var values = Object.keys(groups).map(function map(key) {
            var group = groups[key];
            if (!group.createdAt || !group.deliveredAt) return null;
            var value = new Date(group.deliveredAt).getTime() - new Date(group.createdAt).getTime();
            return Number.isFinite(value) && value >= 0 ? value : null;
        }).filter(function keep(value) { return value !== null; });
        return values.length ? Math.round(values.reduce(function sum(total, value) { return total + value; }, 0) / values.length) : 0;
    }

    function visibleRowsForReport(rows, context) {
        var currentActor = actor(context || {});
        if (VISIBILITY_ROLES.indexOf(currentActor.role) !== -1) return rows;
        if (currentActor.role === 'EMPLOYEE' && currentActor.id) {
            return rows.filter(function own(row) { return row.recipientId === currentActor.id; });
        }
        return [];
    }

    function calculateDeliveryReliability(input, context) {
        try {
            var currentActor = actor(context || {});
            if (VISIBILITY_ROLES.indexOf(currentActor.role) === -1 && currentActor.role !== 'EMPLOYEE') {
                return result(false, 'NOTIFICATION_GOVERNANCE_DENIED', 'Notification reliability analytics access was denied.');
            }
            var tenantCheck = validateTenant(input && (input.tenantSlug || input.tenantId), context || {});
            if (!tenantCheck.success) return tenantCheck;
            var tenantSlug = tenantCheck.tenantSlug;
            var current = data();
            var allRows = (Array.isArray(current.notificationDeliveryTrackingHistory) ? current.notificationDeliveryTrackingHistory : [])
                .filter(function scoped(row) { return rowTenant(row) === tenantSlug; });
            var rows = visibleRowsForReport(allRows, context || {});
            var latest = latestRows(rows);
            var deliveredIds = Object.create(null);
            var openedIds = Object.create(null);
            var acknowledgedIds = Object.create(null);
            var sentIds = Object.create(null);
            rows.forEach(function classify(row) {
                var key = row.notificationId + ':' + row.channel;
                if (row.state === 'SENT') sentIds[key] = true;
                if (['DELIVERED', 'OPENED', 'ACKNOWLEDGED'].indexOf(row.state) !== -1) deliveredIds[key] = true;
                if (['OPENED', 'ACKNOWLEDGED'].indexOf(row.state) !== -1) openedIds[key] = true;
                if (row.state === 'ACKNOWLEDGED') acknowledgedIds[key] = true;
            });
            var failures = latest.filter(function filter(row) { return row.state === 'FAILED'; });
            var retryHistory = (Array.isArray(current.notificationDeliveryRetryHistory) ? current.notificationDeliveryRetryHistory : [])
                .filter(function scoped(row) { return rowTenant(row) === tenantSlug; });
            if (currentActor.role === 'EMPLOYEE') {
                var visibleKeys = Object.create(null);
                rows.forEach(function each(row) { visibleKeys[row.notificationId + ':' + row.channel] = true; });
                retryHistory = retryHistory.filter(function visible(row) { return visibleKeys[row.notificationId + ':' + row.channel]; });
            }
            var retrySuccesses = retryHistory.filter(function filter(row) { return row.outcome === 'SENT'; }).length;
            var total = latest.length;
            var deliverySuccessRate = percentage(Object.keys(deliveredIds).length, Object.keys(sentIds).length || total);
            var openRate = percentage(Object.keys(openedIds).length, Object.keys(deliveredIds).length);
            var acknowledgementRate = percentage(Object.keys(acknowledgedIds).length, Object.keys(deliveredIds).length);
            var failureRate = percentage(failures.length, total);
            var retryRate = percentage(retryHistory.length, total);
            var retrySuccessRate = percentage(retrySuccesses, retryHistory.length);
            var averageDeliveryLatencyMs = calculateLatency(rows);
            var deliveryReliabilityScore = clampScore(deliverySuccessRate * 0.65 + (100 - failureRate) * 0.35);
            var engagementScore = clampScore(openRate * 0.55 + acknowledgementRate * 0.45);
            var latencyScore = averageDeliveryLatencyMs <= 60000 ? 100 : averageDeliveryLatencyMs <= 300000 ? 80 : averageDeliveryLatencyMs <= 900000 ? 60 : 40;
            var communicationHealthScore = clampScore(deliveryReliabilityScore * 0.55 + engagementScore * 0.25 + latencyScore * 0.2);
            var channelAnalytics = DELIVERY_CHANNELS.map(function channelMetric(channel) {
                var channelRows = rows.filter(function filter(row) { return row.channel === channel; });
                var channelLatest = latestRows(channelRows);
                var channelFailures = channelLatest.filter(function filter(row) { return row.state === 'FAILED'; }).length;
                var channelDelivered = Object.create(null);
                channelRows.forEach(function each(row) {
                    if (['DELIVERED', 'OPENED', 'ACKNOWLEDGED'].indexOf(row.state) !== -1) channelDelivered[row.notificationId] = true;
                });
                return {
                    channel: channel,
                    notifications: channelLatest.length,
                    delivered: Object.keys(channelDelivered).length,
                    failures: channelFailures,
                    reliabilityScore: clampScore(100 - percentage(channelFailures, channelLatest.length))
                };
            }).filter(function used(row) { return row.notifications > 0; });
            var analytics = {
                totalNotifications: total,
                deliverySuccessRate: deliverySuccessRate,
                openRate: openRate,
                acknowledgementRate: acknowledgementRate,
                failureRate: failureRate,
                retryRate: retryRate,
                retrySuccessRate: retrySuccessRate,
                averageDeliveryLatencyMs: averageDeliveryLatencyMs
            };
            var report = {
                tenantSlug: tenantSlug,
                communicationHealthScore: communicationHealthScore,
                deliveryReliabilityScore: deliveryReliabilityScore,
                engagementScore: engagementScore,
                analytics: analytics,
                channelAnalytics: channelAnalytics,
                deliveryHistory: rows.slice(-100).reverse().map(publicDelivery),
                failures: failures.slice(-50).reverse().map(publicDelivery),
                retryHistory: retryHistory.slice(-50).reverse().map(function map(row) {
                    return { retryId: row.retryId, notificationId: row.notificationId, channel: row.channel, action: row.action, retryCount: row.retryCount, outcome: row.outcome, timestamp: row.timestamp };
                }),
                governance: {
                    tenantIsolationPreserved: true,
                    rbacAuthoritative: true,
                    duplicateDeliveryPrevented: true,
                    maxRetryAttempts: MAX_RETRIES,
                    autonomousDeliveryDisabled: true,
                    appendOnlyHistory: true
                },
                integrations: {
                    notificationCenter: !!global.NotificationCenterService,
                    inviteDelivery: !!global.InviteMailDeliveryService,
                    workflowRecovery: !!global.WorkflowRecoveryService,
                    auditGovernance: !!global.AuditService,
                    analyticsPlatform: true
                },
                generatedAt: nowIso(context || {})
            };
            if (!(context && context.skipAnalyticsPersistence)) {
                persist('notificationDeliveryAnalyticsHistory', Object.assign({ analyticsId: createId('NDA') }, report), context || {});
            }
            audit('NOTIFICATION_DELIVERY_ANALYTICS_REVIEWED', {
                tenantSlug: tenantSlug,
                communicationHealthScore: communicationHealthScore,
                deliveryReliabilityScore: deliveryReliabilityScore,
                engagementScore: engagementScore
            }, context || {}, 'INFO');
            return result(true, 'NOTIFICATION_DELIVERY_METRICS_READY', 'Notification delivery reliability metrics generated.', report);
        } catch (error) {
            return result(false, 'NOTIFICATION_METRICS_FAILED_SAFE', 'Notification delivery metrics failed safely.', {
                communicationHealthScore: 0,
                deliveryReliabilityScore: 0,
                engagementScore: 0,
                analytics: {},
                channelAnalytics: [],
                deliveryHistory: [],
                failures: [],
                retryHistory: []
            });
        }
    }

    function generateNotificationMetrics(input, context) {
        return calculateDeliveryReliability(input || {}, context || {});
    }

    function getNotificationDeliveryStatus(input, context) {
        try {
            var access = deliveryAccess(input, context || {}, false);
            if (!access.success) return access;
            var rows = historiesFor(access.notificationId, access.tenantSlug, access.channel);
            var latest = rows[rows.length - 1];
            return result(true, 'NOTIFICATION_DELIVERY_STATUS_READY', 'Notification delivery status is available.', {
                notificationId: access.notificationId,
                channel: access.channel,
                state: latest.state,
                retryCount: retryRows(access.notificationId, access.tenantSlug, access.channel).filter(function filter(row) { return row.action === 'RETRY'; }).length,
                delivery: publicDelivery(latest),
                history: rows.map(publicDelivery)
            });
        } catch (error) {
            return result(false, 'NOTIFICATION_STATUS_FAILED_SAFE', 'Notification delivery status failed safely.');
        }
    }

    function runSelfTest() {
        var checks = [];
        function check(name, passed) { checks.push({ name: name, passed: passed === true }); }
        check('delivery tracking works', NOTIFICATION_STATES.indexOf('DELIVERED') !== -1 && DELIVERY_CHANNELS.indexOf('EMAIL') !== -1);
        check('retries work', MAX_RETRIES === 3 && TRANSITIONS.FAILED.indexOf('RETRYING') !== -1);
        check('failure classification works', classifyDeliveryFailure({ message: 'delivery timeout' }).classification === 'DELIVERY_TIMEOUT');
        check('analytics work', clampScore(120) === 100 && clampScore(-1) === 0);
        var frozen = freezeNotificationOutput({ nested: { value: 1 } });
        check('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested));
        return freezeNotificationOutput({ passed: checks.every(function every(item) { return item.passed; }), checks: checks });
    }

    var service = Object.freeze({
        NOTIFICATION_STATES: NOTIFICATION_STATES,
        DELIVERY_CHANNELS: DELIVERY_CHANNELS,
        PREPARED_CHANNELS: PREPARED_CHANNELS,
        MAX_RETRIES: MAX_RETRIES,
        trackNotificationDelivery: trackNotificationDelivery,
        classifyDeliveryFailure: classifyDeliveryFailure,
        retryNotification: retryNotification,
        calculateDeliveryReliability: calculateDeliveryReliability,
        generateNotificationMetrics: generateNotificationMetrics,
        getNotificationDeliveryStatus: getNotificationDeliveryStatus,
        freezeNotificationOutput: freezeNotificationOutput,
        runSelfTest: runSelfTest
    });

    global.NotificationDeliveryTrackingService = service;
    global.notificationDeliveryTrackingService = service;
    if (global.__ARTHHRMS_DEV__) global.__ARTHHRMS_NOTIFICATION_DELIVERY_SELF_TEST__ = runSelfTest();
})(typeof window !== 'undefined' ? window : globalThis);
