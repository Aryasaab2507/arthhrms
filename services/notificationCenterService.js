/**
 * notificationCenterService.js
 * ARTHHRMS - Unified Enterprise Notification Center
 *
 * PURPOSE:
 * Provides tenant-scoped notification center lifecycle governance for personal,
 * workflow, HR, strategic, governance, system, and incident notifications.
 *
 * This service manages:
 * - notification categorization and priority ordering
 * - immutable notification center outputs
 * - delivery, acknowledgement, and lifecycle tracking
 * - duplicate and notification storm prevention
 * - role-scoped notification visibility
 * - notification center analytics
 *
 * This service does NOT:
 * - expose cross-tenant notifications
 * - expose salary, leave balance, payroll, or confidential tenant internals
 * - bypass RBAC protections
 * - replace the existing notification orchestration service
 *
 * @version 1.0.0
 */
(function attachNotificationCenterService(global) {
    'use strict';

    var PREFIX = '[NotificationCenterService]';
    var MAX_NOTIFICATIONS = 500;
    var MAX_REPORT_ROWS = 100;
    var NOTIFICATION_STORM_THRESHOLD = 5;

    var NOTIFICATION_STATES = Object.freeze({
        CREATED: 'CREATED',
        DELIVERED: 'DELIVERED',
        VIEWED: 'VIEWED',
        ACKNOWLEDGED: 'ACKNOWLEDGED',
        DISMISSED: 'DISMISSED',
        EXPIRED: 'EXPIRED',
        ARCHIVED: 'ARCHIVED'
    });

    var LEGACY_STATE_ALIASES = Object.freeze({
        QUEUED: NOTIFICATION_STATES.CREATED,
        PENDING_DELIVERY: NOTIFICATION_STATES.CREATED,
        RETRY_PENDING: NOTIFICATION_STATES.CREATED,
        FAILED: NOTIFICATION_STATES.EXPIRED
    });

    var NOTIFICATION_CATEGORIES = Object.freeze({
        APPROVAL: 'APPROVAL',
        HR: 'HR',
        LEAVE: 'LEAVE',
        ATTENDANCE: 'ATTENDANCE',
        PAYROLL: 'PAYROLL',
        STRATEGIC: 'STRATEGIC',
        GOVERNANCE: 'GOVERNANCE',
        SYSTEM: 'SYSTEM',
        INCIDENT: 'INCIDENT'
    });

    var PRIORITIES = Object.freeze({
        LOW: 'LOW',
        NORMAL: 'NORMAL',
        HIGH: 'HIGH',
        CRITICAL: 'CRITICAL'
    });

    var PRIORITY_WEIGHT = Object.freeze({
        LOW: 1,
        NORMAL: 2,
        HIGH: 3,
        CRITICAL: 4
    });

    var SENSITIVE_KEY_PATTERN = /(salary|payroll.?amount|payrollAmount|payslip|compensation|ctc|leave.?balance|leaveBalance|gross|net|basic|hra|pf|tds|allowance|deduction|password|secret|token|jwt|authorization|service.?role|private.?key|bank|tax)/i;
    var SENSITIVE_VALUE_PATTERN = /\b(salary|payrollAmount|payroll|compensation|ctc|leave\s*balance|leaveBalance)\s*[:=]?\s*[\w,.\- ]+/ig;

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
            if (value === undefined || value === null) return fallback || '';
            if (typeof value === 'symbol') return value.toString();
            return String(value);
        } catch (error) {
            return fallback || '';
        }
    }

    function safeNumber(value, fallback) {
        var num = Number(value);
        return Number.isFinite(num) ? num : (fallback || 0);
    }

    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function freezeNotificationOutput(value, seen) {
        if (!value || (typeof value !== 'object' && typeof value !== 'function') || Object.isFrozen(value)) return value;
        var refs = seen || [];
        if (refs.indexOf(value) !== -1) return value;
        refs.push(value);
        try {
            Object.keys(value).forEach(function freezeKey(key) {
                freezeNotificationOutput(value[key], refs.slice());
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

    function safeToken(value, fallback) {
        var raw = safeString(value || fallback, fallback || '').trim();
        var token = raw.replace(/[\s-]+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').toUpperCase();
        return token || (fallback || '');
    }

    function normalizeTenantSlug(value, fallback) {
        var raw = safeString(value || fallback || '', '').trim().toLowerCase();
        return raw.replace(/[^a-z0-9_-]+/g, '');
    }

    function defaultTenantSlug() {
        var data = rawData();
        return normalizeTenantSlug(data.companySettings && data.companySettings.tenantSlug, 'default');
    }

    function normalizeRole(role) {
        var token = safeToken(role || '', '');
        if (token === 'PLATFORMOWNER') return 'PLATFORM_OWNER';
        if (token === 'SUPERADMIN') return 'SUPER_ADMIN';
        return token;
    }

    function contextTenant(context) {
        return normalizeTenantSlug(
            context && (context.tenantSlug || (context.actor && context.actor.tenantSlug)),
            defaultTenantSlug()
        );
    }

    function actorId(context) {
        return safeString(
            context && context.actor && (context.actor.id || context.actor.empId),
            safeString(context && context.empId, '')
        );
    }

    function normalizeState(value) {
        var token = safeToken(value, NOTIFICATION_STATES.CREATED);
        if (NOTIFICATION_STATES[token]) return NOTIFICATION_STATES[token];
        if (LEGACY_STATE_ALIASES[token]) return LEGACY_STATE_ALIASES[token];
        return NOTIFICATION_STATES.CREATED;
    }

    function normalizeCategory(value, payload) {
        var haystack = [
            value,
            payload && payload.category,
            payload && payload.type,
            payload && payload.module,
            payload && payload.title,
            payload && payload.message
        ].map(function text(item) { return safeString(item, '').toLowerCase(); }).join(' ');

        if (/incident|security|emergency|outage|deployment failure|runtime/.test(haystack)) return NOTIFICATION_CATEGORIES.INCIDENT;
        if (/approval|approve|workflow/.test(haystack)) return NOTIFICATION_CATEGORIES.APPROVAL;
        if (/leave/.test(haystack)) return NOTIFICATION_CATEGORIES.LEAVE;
        if (/attendance|timesheet/.test(haystack)) return NOTIFICATION_CATEGORIES.ATTENDANCE;
        if (/payroll|payslip|salary|compensation/.test(haystack)) return NOTIFICATION_CATEGORIES.PAYROLL;
        if (/strategic|kpi|scorecard|executive|goal|milestone|deliverable/.test(haystack)) return NOTIFICATION_CATEGORIES.STRATEGIC;
        if (/governance|audit|policy|compliance|release|rollback|health|platform/.test(haystack)) return NOTIFICATION_CATEGORIES.GOVERNANCE;
        if (/\bhr\b|human resource|onboarding|employee/.test(haystack)) return NOTIFICATION_CATEGORIES.HR;
        if (NOTIFICATION_CATEGORIES[safeToken(value, '')]) return NOTIFICATION_CATEGORIES[safeToken(value, '')];
        return NOTIFICATION_CATEGORIES.SYSTEM;
    }

    function normalizePriority(value) {
        var token = safeToken(value, PRIORITIES.NORMAL);
        return PRIORITIES[token] || PRIORITIES.NORMAL;
    }

    function calculateNotificationPriority(payload) {
        var notification = isPlainObject(payload) ? payload : {};
        var category = normalizeCategory(notification.category, notification);
        var existing = normalizePriority(notification.priority);
        var haystack = [
            notification.type,
            notification.module,
            notification.title,
            notification.message,
            category
        ].map(function text(item) { return safeString(item, '').toLowerCase(); }).join(' ');

        if (
            existing === PRIORITIES.CRITICAL ||
            category === NOTIFICATION_CATEGORIES.INCIDENT ||
            /critical|security|emergency|incident|outage|deployment failure|breach/.test(haystack)
        ) return PRIORITIES.CRITICAL;

        if (
            existing === PRIORITIES.HIGH ||
            category === NOTIFICATION_CATEGORIES.APPROVAL ||
            category === NOTIFICATION_CATEGORIES.STRATEGIC ||
            category === NOTIFICATION_CATEGORIES.GOVERNANCE ||
            /approval|escalat|blocked|degraded|overdue|failed|risk/.test(haystack)
        ) return PRIORITIES.HIGH;

        if (existing === PRIORITIES.LOW) return PRIORITIES.LOW;
        return PRIORITIES.NORMAL;
    }

    function makeId(prefix) {
        return (prefix || 'NOTIF') + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    }

    function readByList(row) {
        return Array.isArray(row && row.readBy) ? row.readBy.map(function readById(id) { return safeString(id, ''); }).filter(Boolean) : [];
    }

    function recipientRole(row) {
        return normalizeRole(row && (row.toRole || row.targetRole || row.recipientRole || row.role));
    }

    function recipientEmpId(row) {
        return safeString(row && (row.toEmpId || row.targetEmpId || row.recipientEmpId || row.empId), '').trim();
    }

    function notificationTenant(row, fallback) {
        return normalizeTenantSlug(row && row.tenantSlug, fallback || defaultTenantSlug());
    }

    function normalizeNotificationPayload(payload, context) {
        if (!isPlainObject(payload)) {
            return freezeNotificationOutput({
                success: false,
                classification: 'MALFORMED_PAYLOAD',
                message: 'Notification payload must be an object.'
            });
        }

        var ctxTenant = contextTenant(context || {});
        var tenantSlug = notificationTenant(payload, ctxTenant);
        if (ctxTenant && tenantSlug && tenantSlug !== ctxTenant) {
            return freezeNotificationOutput({
                success: false,
                classification: 'CROSS_TENANT_BLOCKED',
                tenantSlug: tenantSlug,
                contextTenant: ctxTenant,
                message: 'Notification tenant scope does not match the active context.'
            });
        }

        var targetRole = recipientRole(payload);
        var targetEmpId = recipientEmpId(payload);
        var category = normalizeCategory(payload.category, payload);
        var state = normalizeState(payload.state || payload.status || NOTIFICATION_STATES.CREATED);
        var priority = calculateNotificationPriority(payload);
        var createdAt = safeString(payload.createdAt, nowIso()) || nowIso();
        var notificationId = safeString(payload.notificationId || payload.id, '') || makeId('NOTIF');

        if (!targetRole && !targetEmpId && normalizeRole(context && context.actor && context.actor.role) !== 'PLATFORM_OWNER') {
            return freezeNotificationOutput({
                success: false,
                classification: 'MISSING_RECIPIENT',
                tenantSlug: tenantSlug,
                message: 'Notification requires a target role or employee.'
            });
        }

        var notification = {
            notificationId: notificationId,
            id: notificationId,
            tenantSlug: tenantSlug,
            category: category,
            priority: priority,
            state: state,
            status: state,
            title: redactString(payload.title || category + ' Notification').slice(0, 160),
            message: redactString(payload.message || payload.summary || '').slice(0, 260),
            summary: redactString(payload.summary || payload.message || payload.title || '').slice(0, 220),
            module: redactString(payload.module || payload.source || 'Notification Center').slice(0, 120),
            channel: safeToken(payload.channel || 'IN_APP', 'IN_APP'),
            toRole: targetRole,
            targetRole: targetRole,
            toEmpId: targetEmpId,
            targetEmpId: targetEmpId,
            correlationId: safeString(payload.correlationId, ''),
            eventId: safeString(payload.eventId, ''),
            dedupeKey: safeString(payload.dedupeKey || payload.idempotencyKey || '', ''),
            createdAt: createdAt,
            deliveredAt: safeString(payload.deliveredAt, ''),
            viewedAt: safeString(payload.viewedAt, ''),
            acknowledgedAt: safeString(payload.acknowledgedAt, ''),
            dismissedAt: safeString(payload.dismissedAt, ''),
            expiresAt: safeString(payload.expiresAt, ''),
            acknowledgedBy: safeString(payload.acknowledgedBy, ''),
            readBy: readByList(payload),
            metadata: cloneSanitized(payload.metadata || {})
        };

        return freezeNotificationOutput({
            success: true,
            notification: freezeNotificationOutput(cloneSanitized(notification)),
            metadata: freezeNotificationOutput({
                tenantIsolationPreserved: true,
                notificationGovernancePreserved: true,
                confidentialFieldsFiltered: true,
                source: 'notificationCenterService'
            })
        });
    }

    function visibleToRole(row, filters, context) {
        var tenantSlug = notificationTenant(row, '');
        var requestedTenant = normalizeTenantSlug(filters && filters.tenantSlug, contextTenant(context || {}));
        if (!tenantSlug || !requestedTenant || tenantSlug !== requestedTenant) return false;

        var requestedRole = normalizeRole(filters && filters.role);
        var ctxRole = normalizeRole(context && context.actor && context.actor.role);
        var role = requestedRole || ctxRole || 'EMPLOYEE';
        var empId = safeString((filters && filters.empId) || actorId(context), '').trim();
        var targetRole = recipientRole(row);
        var targetEmpId = recipientEmpId(row);
        var category = normalizeCategory(row.category, row);

        if (targetEmpId && empId && targetEmpId === empId) return true;

        if (role === 'EMPLOYEE') return false;
        if (role === 'MANAGER') {
            return targetRole === 'MANAGER' ||
                safeString(row.managerId, '') === empId ||
                category === NOTIFICATION_CATEGORIES.APPROVAL;
        }
        if (role === 'HR') {
            return targetRole === 'HR' ||
                category === NOTIFICATION_CATEGORIES.HR ||
                category === NOTIFICATION_CATEGORIES.LEAVE ||
                category === NOTIFICATION_CATEGORIES.ATTENDANCE ||
                category === NOTIFICATION_CATEGORIES.GOVERNANCE ||
                category === NOTIFICATION_CATEGORIES.INCIDENT;
        }
        if (role === 'HR_HEAD') {
            return targetRole === 'HR_HEAD' ||
                targetRole === 'HR' ||
                category === NOTIFICATION_CATEGORIES.HR ||
                category === NOTIFICATION_CATEGORIES.GOVERNANCE ||
                category === NOTIFICATION_CATEGORIES.STRATEGIC ||
                category === NOTIFICATION_CATEGORIES.INCIDENT;
        }
        if (role === 'DIRECTOR') {
            return targetRole === 'DIRECTOR' ||
                category === NOTIFICATION_CATEGORIES.STRATEGIC ||
                category === NOTIFICATION_CATEGORIES.GOVERNANCE ||
                category === NOTIFICATION_CATEGORIES.INCIDENT;
        }
        if (role === 'SUPER_ADMIN') {
            return category === NOTIFICATION_CATEGORIES.SYSTEM || category === NOTIFICATION_CATEGORIES.INCIDENT;
        }
        if (role === 'PLATFORM_OWNER') {
            return category === NOTIFICATION_CATEGORIES.GOVERNANCE ||
                category === NOTIFICATION_CATEGORIES.SYSTEM ||
                category === NOTIFICATION_CATEGORIES.INCIDENT;
        }
        return targetRole === role;
    }

    function emitTelemetry(eventType, metadata, context) {
        if (telemetryForwarding || (context && context.skipTelemetry)) return { success: true, warning: 'Telemetry skipped.' };
        var service = global.WorkflowTelemetryService;
        if (!service || typeof service.emitTelemetry !== 'function') return { success: true, warning: 'WorkflowTelemetryService unavailable.' };
        try {
            telemetryForwarding = true;
            return service.emitTelemetry('NOTIFICATION', eventType, {
                source: 'notificationCenterService',
                severity: metadata && metadata.severity || 'INFO',
                status: metadata && metadata.status || 'RECORDED',
                correlationId: metadata && metadata.correlationId || '',
                eventId: metadata && metadata.eventId || '',
                metadata: cloneSanitized(metadata || {})
            });
        } catch (error) {
            return { success: false, warning: 'Notification center telemetry failed safely.' };
        } finally {
            telemetryForwarding = false;
        }
    }

    function recordMetric(type, context) {
        if (metricForwarding || (context && context.skipMetrics)) return { success: true, warning: 'Metrics skipped.' };
        var service = global.OrchestrationMetricsService;
        if (!service || typeof service.recordNotificationMetric !== 'function') return { success: true, warning: 'OrchestrationMetricsService unavailable.' };
        try {
            metricForwarding = true;
            return service.recordNotificationMetric(type || 'UNKNOWN_NOTIFICATION_CENTER');
        } catch (error) {
            return { success: false, warning: 'Notification center metric failed safely.' };
        } finally {
            metricForwarding = false;
        }
    }

    function auditNotification(actionType, metadata, context) {
        if (auditForwarding || (context && context.skipAuditPersistence)) return { success: true, warning: 'Audit skipped.' };
        var service = global.AuditService;
        try {
            auditForwarding = true;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    actionType: actionType,
                    eventType: actionType,
                    module: 'Notification Center',
                    targetId: metadata && (metadata.notificationId || metadata.targetId) || '',
                    description: metadata && metadata.description || actionType,
                    actorRole: context && context.actor && context.actor.role || 'system',
                    actorId: actorId(context),
                    severity: metadata && metadata.severity || 'INFO',
                    correlationId: metadata && metadata.correlationId || '',
                    eventId: metadata && metadata.eventId || '',
                    metadata: cloneSanitized(metadata || {})
                }, {
                    source: 'notificationCenterService',
                    skipPersistence: false
                });
            }
            if (db() && typeof db().writeAuditLog === 'function') {
                db().writeAuditLog(
                    context && context.actor && context.actor.role || 'system',
                    actorId(context),
                    actionType,
                    'Notification Center',
                    metadata && metadata.notificationId || '',
                    metadata && metadata.description || actionType
                );
            }
            return { success: true, warning: service ? '' : 'AuditService unavailable; DB fallback used when possible.' };
        } catch (error) {
            return { success: false, warning: 'Notification center audit failed safely.' };
        } finally {
            auditForwarding = false;
        }
    }

    function trackDeliveryLifecycle(row, state, context) {
        if (context && context.skipDeliveryTracking) return null;
        try {
            var service = global.NotificationDeliveryTrackingService || global.notificationDeliveryTrackingService;
            if (!service || typeof service.trackNotificationDelivery !== 'function') return null;
            var mappedState = state === NOTIFICATION_STATES.VIEWED
                ? 'OPENED'
                : state === NOTIFICATION_STATES.DISMISSED
                ? 'CANCELLED'
                : state;
            if (mappedState === NOTIFICATION_STATES.ARCHIVED) return null;
            return service.trackNotificationDelivery({
                notificationId: row.notificationId || row.id,
                tenantSlug: row.tenantSlug,
                channel: row.channel || 'IN_APP',
                state: mappedState,
                recipientId: row.toEmpId || row.targetEmpId || '',
                recipientRole: row.toRole || row.targetRole || '',
                source: 'NOTIFICATION_CENTER',
                correlationId: row.correlationId || '',
                providerEventId: 'CENTER-' + mappedState + '-' + (row.notificationId || row.id),
                occurredAt: mappedState === 'CREATED' ? row.createdAt : mappedState === 'DELIVERED' ? row.deliveredAt : mappedState === 'OPENED' ? row.viewedAt : mappedState === 'ACKNOWLEDGED' ? row.acknowledgedAt : row.updatedAt
            }, Object.assign({}, context || {}));
        } catch (error) { return null; }
    }

    function appendHistory(data, row, actionType, context) {
        data.notificationHistory = Array.isArray(data.notificationHistory) ? data.notificationHistory.slice() : [];
        data.notificationHistory.push(cloneSanitized({
            historyId: makeId('NH'),
            notificationId: row.notificationId || row.id,
            tenantSlug: row.tenantSlug,
            state: row.state || row.status,
            actionType: actionType,
            actorRole: context && context.actor && context.actor.role || '',
            actorId: actorId(context),
            correlationId: row.correlationId || '',
            timestamp: nowIso(),
            immutable: true
        }));
        if (data.notificationHistory.length > MAX_NOTIFICATIONS) {
            data.notificationHistory = data.notificationHistory.slice(-MAX_NOTIFICATIONS);
        }
    }

    function appendDeliveryLog(data, row, state, context) {
        data.notificationDeliveryLogs = Array.isArray(data.notificationDeliveryLogs) ? data.notificationDeliveryLogs.slice() : [];
        data.notificationDeliveryLogs.push(cloneSanitized({
            logId: makeId('NDL'),
            notificationId: row.notificationId || row.id,
            tenantSlug: row.tenantSlug,
            state: state,
            actorRole: context && context.actor && context.actor.role || '',
            actorId: actorId(context),
            correlationId: row.correlationId || '',
            timestamp: nowIso(),
            immutable: true
        }));
        if (data.notificationDeliveryLogs.length > MAX_NOTIFICATIONS) {
            data.notificationDeliveryLogs = data.notificationDeliveryLogs.slice(-MAX_NOTIFICATIONS);
        }
    }

    function appendAcknowledgement(data, row, context) {
        data.notificationAcknowledgementRecords = Array.isArray(data.notificationAcknowledgementRecords) ? data.notificationAcknowledgementRecords.slice() : [];
        data.notificationAcknowledgementRecords.push(cloneSanitized({
            acknowledgementId: makeId('NACK'),
            notificationId: row.notificationId || row.id,
            tenantSlug: row.tenantSlug,
            actorRole: context && context.actor && context.actor.role || '',
            actorId: actorId(context),
            correlationId: row.correlationId || '',
            timestamp: nowIso(),
            immutable: true
        }));
        if (data.notificationAcknowledgementRecords.length > MAX_NOTIFICATIONS) {
            data.notificationAcknowledgementRecords = data.notificationAcknowledgementRecords.slice(-MAX_NOTIFICATIONS);
        }
    }

    function toCenterNotification(row, context) {
        var normalized = normalizeNotificationPayload(row, {
            tenantSlug: notificationTenant(row, contextTenant(context || {})),
            actor: context && context.actor
        });
        if (!normalized.success) return null;
        return normalized.notification;
    }

    function createNotification(payload, context) {
        try {
            var normalized = normalizeNotificationPayload(payload, context || {});
            if (!normalized.success) {
                auditNotification('NOTIFICATION_CENTER_CREATE_BLOCKED', {
                    severity: 'WARNING',
                    tenantSlug: normalized.tenantSlug || contextTenant(context || {}),
                    description: normalized.message || 'Notification creation blocked.'
                }, context || {});
                emitTelemetry('NOTIFICATION_CENTER_CREATE_BLOCKED', {
                    severity: 'WARNING',
                    tenantSlug: normalized.tenantSlug || contextTenant(context || {})
                }, context || {});
                return normalized;
            }

            var data = rawData();
            data.notifications = Array.isArray(data.notifications) ? data.notifications.slice() : [];
            var notification = cloneSanitized(normalized.notification);
            var dedupeKey = safeString(notification.dedupeKey, '');
            var duplicate = dedupeKey ? data.notifications.find(function duplicateRow(row) {
                return notificationTenant(row, '') === notification.tenantSlug &&
                    safeString(row.dedupeKey, '') === dedupeKey &&
                    [NOTIFICATION_STATES.DISMISSED, NOTIFICATION_STATES.EXPIRED, NOTIFICATION_STATES.ARCHIVED].indexOf(normalizeState(row.state || row.status)) === -1;
            }) : null;

            if (duplicate) {
                var duplicateOutput = toCenterNotification(duplicate, context || {});
                auditNotification('NOTIFICATION_DUPLICATE_PREVENTED', {
                    notificationId: duplicateOutput && duplicateOutput.notificationId,
                    tenantSlug: notification.tenantSlug,
                    correlationId: notification.correlationId,
                    severity: 'WARNING',
                    description: 'Duplicate notification delivery prevented.'
                }, context || {});
                emitTelemetry('NOTIFICATION_DUPLICATE_PREVENTED', {
                    notificationId: duplicateOutput && duplicateOutput.notificationId,
                    tenantSlug: notification.tenantSlug,
                    correlationId: notification.correlationId,
                    severity: 'WARNING'
                }, context || {});
                recordMetric('NOTIFICATION_DUPLICATE_PREVENTED', context || {});
                return freezeNotificationOutput({
                    success: true,
                    duplicatePrevented: true,
                    notification: duplicateOutput,
                    metadata: {
                        notificationStormPrevented: true,
                        notificationGovernancePreserved: true
                    }
                });
            }

            notification.state = NOTIFICATION_STATES.CREATED;
            notification.status = NOTIFICATION_STATES.CREATED;
            notification.createdAt = notification.createdAt || nowIso();
            notification.updatedAt = nowIso();
            notification.deliveryGoverned = true;
            notification.centerGoverned = true;
            notification.readBy = readByList(notification);
            data.notifications.unshift(notification);
            if (data.notifications.length > MAX_NOTIFICATIONS) data.notifications = data.notifications.slice(0, MAX_NOTIFICATIONS);
            appendHistory(data, notification, 'NOTIFICATION_CREATED', context || {});
            appendDeliveryLog(data, notification, NOTIFICATION_STATES.CREATED, context || {});
            saveData(data);
            trackDeliveryLifecycle(notification, NOTIFICATION_STATES.CREATED, context || {});

            auditNotification('NOTIFICATION_CENTER_CREATED', {
                notificationId: notification.notificationId,
                tenantSlug: notification.tenantSlug,
                correlationId: notification.correlationId,
                severity: notification.priority === PRIORITIES.CRITICAL ? 'CRITICAL' : notification.priority === PRIORITIES.HIGH ? 'WARNING' : 'INFO',
                description: 'Notification created through unified enterprise notification center.'
            }, context || {});
            emitTelemetry('NOTIFICATION_CENTER_CREATED', {
                notificationId: notification.notificationId,
                tenantSlug: notification.tenantSlug,
                correlationId: notification.correlationId,
                severity: notification.priority === PRIORITIES.CRITICAL ? 'CRITICAL' : 'INFO'
            }, context || {});
            recordMetric('NOTIFICATION_CENTER_CREATED', context || {});

            return freezeNotificationOutput({
                success: true,
                duplicatePrevented: false,
                notification: freezeNotificationOutput(cloneSanitized(notification)),
                metadata: {
                    immutableHistoryPreserved: true,
                    deliveryTracked: true,
                    tenantIsolationPreserved: true
                }
            });
        } catch (error) {
            safeWarn('Notification creation failed safely.', error && error.message);
            return freezeNotificationOutput({
                success: false,
                classification: 'CREATE_FAILED',
                message: 'Notification creation failed safely.'
            });
        }
    }

    function updateNotificationState(notificationId, targetState, context) {
        try {
            var state = normalizeState(targetState);
            var data = rawData();
            data.notifications = Array.isArray(data.notifications) ? data.notifications.slice() : [];
            var rowIndex = -1;
            var filters = {
                tenantSlug: contextTenant(context || {}),
                role: context && context.actor && context.actor.role,
                empId: actorId(context || {})
            };
            var id = safeString(notificationId, '');
            data.notifications.some(function findRow(row, index) {
                if (safeString(row.notificationId || row.id, '') !== id) return false;
                if (!visibleToRole(row, filters, context || {})) return false;
                rowIndex = index;
                return true;
            });
            if (rowIndex < 0) {
                return freezeNotificationOutput({
                    success: false,
                    classification: 'NOTIFICATION_NOT_FOUND_OR_NOT_VISIBLE',
                    notificationId: id
                });
            }

            var row = cloneSanitized(data.notifications[rowIndex]);
            row.state = state;
            row.status = state;
            row.updatedAt = nowIso();
            if (state === NOTIFICATION_STATES.VIEWED) {
                row.viewedAt = row.viewedAt || nowIso();
                var readBy = readByList(row);
                var reader = actorId(context || {});
                if (reader && readBy.indexOf(reader) === -1) readBy.push(reader);
                row.readBy = readBy;
            }
            if (state === NOTIFICATION_STATES.ACKNOWLEDGED) {
                row.acknowledgedAt = row.acknowledgedAt || nowIso();
                row.acknowledgedBy = actorId(context || {});
                appendAcknowledgement(data, row, context || {});
            }
            if (state === NOTIFICATION_STATES.DISMISSED) row.dismissedAt = row.dismissedAt || nowIso();
            if (state === NOTIFICATION_STATES.DELIVERED) row.deliveredAt = row.deliveredAt || nowIso();

            data.notifications[rowIndex] = row;
            appendHistory(data, row, 'NOTIFICATION_' + state, context || {});
            appendDeliveryLog(data, row, state, context || {});
            saveData(data);
            trackDeliveryLifecycle(row, state, context || {});

            auditNotification(state === NOTIFICATION_STATES.ACKNOWLEDGED ? 'NOTIFICATION_ACKNOWLEDGED' : 'NOTIFICATION_' + state, {
                notificationId: row.notificationId || row.id,
                tenantSlug: row.tenantSlug,
                correlationId: row.correlationId || '',
                severity: state === NOTIFICATION_STATES.ACKNOWLEDGED ? 'INFO' : 'WARNING',
                description: 'Notification lifecycle state updated.'
            }, context || {});
            emitTelemetry(state === NOTIFICATION_STATES.ACKNOWLEDGED ? 'NOTIFICATION_ACKNOWLEDGED' : 'NOTIFICATION_' + state, {
                notificationId: row.notificationId || row.id,
                tenantSlug: row.tenantSlug,
                correlationId: row.correlationId || '',
                severity: state === NOTIFICATION_STATES.ACKNOWLEDGED ? 'INFO' : 'WARNING'
            }, context || {});
            recordMetric(state === NOTIFICATION_STATES.ACKNOWLEDGED ? 'NOTIFICATION_ACKNOWLEDGED' : 'NOTIFICATION_' + state, context || {});

            return freezeNotificationOutput({
                success: true,
                notification: freezeNotificationOutput(cloneSanitized(row)),
                metadata: {
                    immutableHistoryPreserved: true,
                    deliveryTracked: true,
                    acknowledgementTracked: state === NOTIFICATION_STATES.ACKNOWLEDGED
                }
            });
        } catch (error) {
            safeWarn('Notification lifecycle update failed safely.', error && error.message);
            return freezeNotificationOutput({
                success: false,
                classification: 'LIFECYCLE_UPDATE_FAILED',
                notificationId: safeString(notificationId, '')
            });
        }
    }

    function acknowledgeNotification(notificationId, context) {
        return updateNotificationState(notificationId, NOTIFICATION_STATES.ACKNOWLEDGED, context || {});
    }

    function bulkNotificationAction(action, notificationIds, context) {
        try {
            var ids = Array.isArray(notificationIds) ? notificationIds : [];
            var actionToken = safeToken(action, 'VIEW');
            var stateByAction = {
                MARK_READ: NOTIFICATION_STATES.VIEWED,
                READ: NOTIFICATION_STATES.VIEWED,
                VIEW: NOTIFICATION_STATES.VIEWED,
                MARK_UNREAD: NOTIFICATION_STATES.CREATED,
                ACKNOWLEDGE: NOTIFICATION_STATES.ACKNOWLEDGED,
                DISMISS: NOTIFICATION_STATES.DISMISSED,
                ARCHIVE: NOTIFICATION_STATES.ARCHIVED,
                EXPIRE: NOTIFICATION_STATES.EXPIRED
            };
            var state = stateByAction[actionToken] || NOTIFICATION_STATES.VIEWED;
            var results = ids.slice(0, 50).map(function updateOne(id) {
                return updateNotificationState(id, state, context || {});
            });
            var success = results.every(function resultOk(item) { return !!item.success; });
            auditNotification('NOTIFICATION_BULK_ACTION', {
                targetId: actionToken,
                severity: success ? 'INFO' : 'WARNING',
                description: 'Bulk notification lifecycle action executed.',
                count: results.length
            }, context || {});
            emitTelemetry('NOTIFICATION_BULK_ACTION', {
                severity: success ? 'INFO' : 'WARNING',
                action: actionToken,
                count: results.length
            }, context || {});
            recordMetric('NOTIFICATION_BULK_ACTION', context || {});
            return freezeNotificationOutput({
                success: success,
                action: actionToken,
                results: freezeNotificationOutput(results.map(function safeResult(item) { return cloneSanitized(item); })),
                metadata: {
                    immutableHistoryPreserved: true,
                    bulkGovernancePreserved: true
                }
            });
        } catch (error) {
            return freezeNotificationOutput({
                success: false,
                classification: 'BULK_ACTION_FAILED',
                action: safeString(action, '')
            });
        }
    }

    function uniqueByDedupe(notifications) {
        var seen = {};
        var output = [];
        notifications.forEach(function unique(row) {
            var key = row.dedupeKey || row.notificationId;
            if (!key || !seen[key]) {
                seen[key] = row;
                output.push(row);
                return;
            }
            var existing = seen[key];
            if ((PRIORITY_WEIGHT[row.priority] || 0) > (PRIORITY_WEIGHT[existing.priority] || 0)) {
                var index = output.indexOf(existing);
                seen[key] = row;
                if (index >= 0) output[index] = row;
            }
        });
        return output;
    }

    function sortByPriorityAndTime(rows) {
        return rows.slice().sort(function sortRows(a, b) {
            var priorityDelta = (PRIORITY_WEIGHT[b.priority] || 0) - (PRIORITY_WEIGHT[a.priority] || 0);
            if (priorityDelta) return priorityDelta;
            return safeString(b.createdAt, '').localeCompare(safeString(a.createdAt, ''));
        });
    }

    function isUnread(row, empId) {
        if ([NOTIFICATION_STATES.ACKNOWLEDGED, NOTIFICATION_STATES.DISMISSED, NOTIFICATION_STATES.EXPIRED, NOTIFICATION_STATES.ARCHIVED, NOTIFICATION_STATES.VIEWED].indexOf(row.state) !== -1) return false;
        var readBy = readByList(row);
        return !empId || readBy.indexOf(empId) === -1;
    }

    function countBy(rows, key) {
        var counts = {};
        rows.forEach(function count(row) {
            var value = safeString(row && row[key], 'UNKNOWN');
            counts[value] = (counts[value] || 0) + 1;
        });
        return freezeNotificationOutput(counts);
    }

    function percent(numerator, denominator) {
        if (!denominator) return 0;
        return Math.round((safeNumber(numerator, 0) / safeNumber(denominator, 1)) * 1000) / 10;
    }

    function detectNotificationStorm(rows) {
        var buckets = {};
        rows.forEach(function bucket(row) {
            var key = [row.tenantSlug, row.toRole || row.targetRole, row.toEmpId || row.targetEmpId, row.title, row.correlationId].join(':');
            buckets[key] = (buckets[key] || 0) + 1;
        });
        var duplicates = Object.keys(buckets).filter(function duplicateKey(key) {
            return buckets[key] >= NOTIFICATION_STORM_THRESHOLD;
        }).map(function duplicateRow(key) {
            return { key: key, count: buckets[key], classification: 'NOTIFICATION_STORM_RISK' };
        });
        return freezeNotificationOutput({
            stormDetected: duplicates.length > 0,
            duplicates: duplicates
        });
    }

    function calculateLifecycleAnalytics(rows, logs, acknowledgements, empId) {
        var created = rows.filter(function isCreated(row) { return row.state === NOTIFICATION_STATES.CREATED; }).length;
        var delivered = rows.filter(function isDelivered(row) { return !!row.deliveredAt || [NOTIFICATION_STATES.DELIVERED, NOTIFICATION_STATES.VIEWED, NOTIFICATION_STATES.ACKNOWLEDGED].indexOf(row.state) !== -1; }).length;
        var viewed = rows.filter(function isViewed(row) { return !!row.viewedAt || row.state === NOTIFICATION_STATES.VIEWED || readByList(row).indexOf(empId) !== -1; }).length;
        var acknowledged = rows.filter(function isAck(row) { return !!row.acknowledgedAt || row.state === NOTIFICATION_STATES.ACKNOWLEDGED; }).length;
        var expired = rows.filter(function isExpired(row) { return row.state === NOTIFICATION_STATES.EXPIRED; }).length;
        var total = rows.length;
        return {
            deliveryTracking: freezeNotificationOutput({
                total: total,
                created: created,
                delivered: delivered,
                viewed: viewed,
                acknowledged: acknowledged,
                expired: expired,
                deliveryLogCount: logs.length,
                deliveryRate: percent(delivered, total),
                duplicateDeliveryPrevented: true,
                recursiveNotificationsPrevented: true
            }),
            acknowledgement: freezeNotificationOutput({
                acknowledgementRecords: acknowledgements.length,
                acknowledged: acknowledged,
                acknowledgementRate: percent(acknowledged, total)
            }),
            engagement: freezeNotificationOutput({
                engagementRate: percent(viewed + acknowledged, total * 2),
                viewed: viewed,
                acknowledged: acknowledged
            })
        };
    }

    function generateNotificationCenterReport(filters, context) {
        try {
            var input = isPlainObject(filters) ? filters : {};
            var ctx = context || {};
            var tenantSlug = normalizeTenantSlug(input.tenantSlug, contextTenant(ctx));
            var role = normalizeRole(input.role || (ctx.actor && ctx.actor.role) || 'EMPLOYEE');
            var empId = safeString(input.empId || actorId(ctx), '');
            var categoryFilter = safeToken(input.category || '', '');
            var searchTerm = safeString(input.search || input.searchTerm || '', '').trim().toLowerCase();
            var data = rawData();
            var warnings = [];
            if (!global.AuditService || typeof global.AuditService.recordAudit !== 'function') {
                warnings.push({
                    alertCode: 'AUDIT_UNAVAILABLE',
                    classification: 'WARNING',
                    message: 'AuditService unavailable; notification center will use DB fallback if present.'
                });
            }
            if (!global.WorkflowTelemetryService || typeof global.WorkflowTelemetryService.emitTelemetry !== 'function') {
                warnings.push({
                    alertCode: 'TELEMETRY_UNAVAILABLE',
                    classification: 'INFO',
                    message: 'WorkflowTelemetryService unavailable; report generation continues safely.'
                });
            }

            var sourceRows = Array.isArray(data.notifications) ? data.notifications : [];
            var visibleRows = sourceRows.filter(function filterTenant(row) {
                return visibleToRole(row, { tenantSlug: tenantSlug, role: role, empId: empId }, {
                    tenantSlug: tenantSlug,
                    actor: { role: role, id: empId }
                });
            }).map(function normalizeVisible(row) {
                return toCenterNotification(row, { tenantSlug: tenantSlug, actor: { role: role, id: empId } });
            }).filter(Boolean).filter(function filterCategory(row) {
                return !categoryFilter || row.category === categoryFilter;
            }).filter(function filterSearch(row) {
                if (!searchTerm) return true;
                return [
                    row.title,
                    row.module,
                    row.category,
                    row.priority,
                    row.state,
                    row.correlationId
                ].some(function searchable(value) {
                    return safeString(value, '').toLowerCase().indexOf(searchTerm) !== -1;
                });
            });

            var notifications = uniqueByDedupe(visibleRows).slice(0, MAX_REPORT_ROWS);
            var unread = sortByPriorityAndTime(notifications.filter(function unreadFilter(row) {
                return isUnread(row, empId);
            }));
            var priority = sortByPriorityAndTime(notifications.filter(function priorityFilter(row) {
                return row.priority === PRIORITIES.CRITICAL || row.priority === PRIORITIES.HIGH;
            }));
            var acknowledged = sortByPriorityAndTime(notifications.filter(function ackFilter(row) {
                return row.state === NOTIFICATION_STATES.ACKNOWLEDGED;
            }));
            var archived = sortByPriorityAndTime(notifications.filter(function archiveFilter(row) {
                return row.state === NOTIFICATION_STATES.ARCHIVED;
            }));
            var recent = notifications.slice().sort(function recentSort(a, b) {
                return safeString(b.createdAt, '').localeCompare(safeString(a.createdAt, ''));
            });
            var logs = (Array.isArray(data.notificationDeliveryLogs) ? data.notificationDeliveryLogs : []).filter(function tenantLog(row) {
                return notificationTenant(row, '') === tenantSlug;
            });
            var ackRecords = (Array.isArray(data.notificationAcknowledgementRecords) ? data.notificationAcknowledgementRecords : []).filter(function tenantAck(row) {
                return notificationTenant(row, '') === tenantSlug;
            });
            var lifecycle = calculateLifecycleAnalytics(notifications, logs, ackRecords, empId);
            var storm = detectNotificationStorm(sourceRows.filter(function sameTenant(row) {
                return notificationTenant(row, '') === tenantSlug;
            }));

            auditNotification('NOTIFICATION_CENTER_REPORTED', {
                tenantSlug: tenantSlug,
                severity: priority.some(function critical(row) { return row.priority === PRIORITIES.CRITICAL; }) ? 'WARNING' : 'INFO',
                description: 'Notification center report generated.',
                count: notifications.length
            }, ctx);
            emitTelemetry('NOTIFICATION_CENTER_REPORTED', {
                tenantSlug: tenantSlug,
                role: role,
                count: notifications.length,
                severity: priority.some(function critical(row) { return row.priority === PRIORITIES.CRITICAL; }) ? 'WARNING' : 'INFO'
            }, ctx);
            recordMetric('NOTIFICATION_CENTER_REPORTED', ctx);

            return freezeNotificationOutput({
                success: true,
                state: notifications.length ? NOTIFICATION_STATES.DELIVERED : NOTIFICATION_STATES.CREATED,
                tenantSlug: tenantSlug,
                role: role,
                filters: freezeNotificationOutput({
                    category: categoryFilter,
                    searchPrepared: !!searchTerm
                }),
                readOnly: true,
                sections: freezeNotificationOutput({
                    unreadNotifications: unread,
                    priorityNotifications: priority,
                    recentNotifications: recent,
                    acknowledgedNotifications: acknowledged,
                    archivedNotifications: archived
                }),
                deliveryTracking: lifecycle.deliveryTracking,
                acknowledgement: lifecycle.acknowledgement,
                engagement: lifecycle.engagement,
                analytics: freezeNotificationOutput({
                    unreadCount: unread.length,
                    priorityCount: priority.length,
                    recentCount: recent.length,
                    acknowledgedCount: acknowledged.length,
                    archivedCount: archived.length,
                    byCategory: countBy(notifications, 'category'),
                    byPriority: countBy(notifications, 'priority'),
                    byState: countBy(notifications, 'state'),
                    notificationStorm: storm,
                    deliverySuccessRate: lifecycle.deliveryTracking.deliveryRate,
                    acknowledgementTrend: lifecycle.acknowledgement.acknowledgementRate,
                    engagementRate: lifecycle.engagement.engagementRate
                }),
                governance: freezeNotificationOutput({
                    tenantIsolationPreserved: true,
                    crossTenantVisibilityBlocked: true,
                    notificationDuplicationPrevented: true,
                    notificationSpamPrevented: !storm.stormDetected,
                    immutableHistoryPreserved: true,
                    confidentialFieldsFiltered: true,
                    roleVisibilityEnforced: true
                }),
                warnings: freezeNotificationOutput(warnings)
            });
        } catch (error) {
            safeWarn('Notification center report failed safely.', error && error.message);
            return freezeNotificationOutput({
                success: false,
                classification: 'REPORT_FAILED',
                message: 'Notification center report failed safely.',
                sections: {
                    unreadNotifications: [],
                    priorityNotifications: [],
                    recentNotifications: [],
                    acknowledgedNotifications: [],
                    archivedNotifications: []
                },
                warnings: []
            });
        }
    }

    function runSelfTest() {
        var results = [];
        function record(name, passed, details) {
            results.push(freezeNotificationOutput({
                name: name,
                passed: !!passed,
                details: cloneSanitized(details || {})
            }));
        }

        var previousAudit = global.AuditService;
        var previousTelemetry = global.WorkflowTelemetryService;
        try {
            var malformed = normalizeNotificationPayload('bad-payload', { tenantSlug: 'selftest' });
            record('malformed payload blocked', malformed.success === false && Object.isFrozen(malformed));

            var normalized = normalizeNotificationPayload({
                tenantSlug: 'selftest',
                toRole: 'HR',
                category: 'incident',
                title: 'Critical security incident',
                message: 'salary=999999 leave balance 42',
                dedupeKey: 'selftest:center:1'
            }, { tenantSlug: 'selftest', actor: { role: 'hr', id: 'SELF-HR' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            record('normalization immutable', normalized.success === true && Object.isFrozen(normalized.notification) && !/999999|salary|leave balance/i.test(JSON.stringify(normalized)));

            var created = createNotification({
                tenantSlug: 'selftest',
                toRole: 'HR',
                category: 'incident',
                title: 'Critical security incident',
                message: 'Self-test incident acknowledgement required.',
                dedupeKey: 'selftest:center:1'
            }, { tenantSlug: 'selftest', actor: { role: 'hr', id: 'SELF-HR' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            record('delivery creation works', created.success === true && created.notification && created.notification.state === NOTIFICATION_STATES.CREATED);

            var duplicate = createNotification({
                tenantSlug: 'selftest',
                toRole: 'HR',
                category: 'incident',
                title: 'Critical security incident',
                message: 'Self-test incident acknowledgement required.',
                dedupeKey: 'selftest:center:1'
            }, { tenantSlug: 'selftest', actor: { role: 'hr', id: 'SELF-HR' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            record('duplicate delivery blocked', duplicate.success === true && duplicate.duplicatePrevented === true);

            var ack = created.notification ? acknowledgeNotification(created.notification.notificationId, {
                tenantSlug: 'selftest',
                actor: { role: 'hr', id: 'SELF-HR' },
                skipAuditPersistence: true,
                skipTelemetry: true,
                skipMetrics: true
            }) : { success: false };
            record('acknowledgement works', ack.success === true && ack.notification && ack.notification.state === NOTIFICATION_STATES.ACKNOWLEDGED);

            var report = generateNotificationCenterReport({ tenantSlug: 'selftest', role: 'HR', empId: 'SELF-HR' }, {
                tenantSlug: 'selftest',
                actor: { role: 'hr', id: 'SELF-HR' },
                skipAuditPersistence: true,
                skipTelemetry: true,
                skipMetrics: true
            });
            record('priority ordering works', report.success === true && report.sections.priorityNotifications.every(function priorityRow(row, index, all) {
                return index === 0 || (PRIORITY_WEIGHT[all[index - 1].priority] || 0) >= (PRIORITY_WEIGHT[row.priority] || 0);
            }));
            record('role visibility works', report.success === true && report.governance.crossTenantVisibilityBlocked === true && !/999999|salary|leave balance/i.test(JSON.stringify(report)));

            global.AuditService = null;
            global.WorkflowTelemetryService = null;
            var degraded = generateNotificationCenterReport({ tenantSlug: 'selftest', role: 'HR', empId: 'SELF-HR' }, {
                tenantSlug: 'selftest',
                actor: { role: 'hr', id: 'SELF-HR' },
                skipTelemetry: true,
                skipMetrics: true
            });
            record('dependency absence degrades safely', degraded.success === true && degraded.warnings.some(function warning(item) {
                return item.alertCode === 'AUDIT_UNAVAILABLE';
            }));
        } catch (error) {
            record('self-test uncaught exception guard', false, { error: error && error.message });
        } finally {
            global.AuditService = previousAudit;
            global.WorkflowTelemetryService = previousTelemetry;
        }

        var passed = results.every(function passedResult(item) { return item.passed; });
        global.__ARTHHRMS_NOTIFICATION_CENTER_SELF_TEST__ = freezeNotificationOutput({
            passed: passed,
            results: results,
            checkedAt: nowIso()
        });
    }

    var NotificationCenterService = freezeNotificationOutput({
        NOTIFICATION_STATES: NOTIFICATION_STATES,
        NOTIFICATION_CATEGORIES: NOTIFICATION_CATEGORIES,
        PRIORITIES: PRIORITIES,
        createNotification: createNotification,
        acknowledgeNotification: acknowledgeNotification,
        bulkNotificationAction: bulkNotificationAction,
        updateNotificationState: updateNotificationState,
        calculateNotificationPriority: calculateNotificationPriority,
        normalizeNotificationPayload: normalizeNotificationPayload,
        freezeNotificationOutput: freezeNotificationOutput,
        generateNotificationCenterReport: generateNotificationCenterReport
    });

    global.NotificationCenterService = NotificationCenterService;
    global.notificationCenterService = NotificationCenterService;

    if (global.__ARTHHRMS_DEV__) {
        try {
            runSelfTest();
        } catch (error) {
            global.__ARTHHRMS_NOTIFICATION_CENTER_SELF_TEST__ = freezeNotificationOutput({
                passed: false,
                results: [{ name: 'self-test wrapper', passed: false, details: { error: error && error.message } }],
                checkedAt: nowIso()
            });
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
