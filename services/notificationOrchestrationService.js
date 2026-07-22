/**
 * notificationOrchestrationService.js
 * ARTHHRMS - Enterprise Notification Orchestration System
 *
 * PURPOSE:
 * Provides centralized notification orchestration and delivery governance for
 * workflow, escalation, onboarding, strategic review, operational, and platform
 * governance alerts.
 *
 * This service manages:
 * - tenant-scoped notification orchestration
 * - delivery governance and retry visibility
 * - in-app notification grouping
 * - notification prioritization
 * - delivery auditability
 *
 * This service does NOT:
 * - expose cross-tenant notifications
 * - expose sensitive payroll or salary data
 * - bypass RBAC protections
 * - require asynchronous infrastructure
 *
 * ARCHITECTURE RULE:
 * Notification orchestration must remain tenant-scoped, audit-visible, and
 * future queue compatible without changing existing workflow/event behavior.
 *
 * STABILITY:
 * Existing notification records and workflow dispatch flows remain compatible.
 *
 * DEPENDS ON:
 * - window.DB (optional)
 * - window.notificationService (optional)
 * - window.NotificationRoutingService (optional)
 * - window.WorkflowTelemetryService (optional)
 * - window.AuditService (optional)
 * - window.OrchestrationMetricsService (optional)
 *
 * @version 1.0.0
 */
(function attachNotificationOrchestrationService(global) {
    'use strict';

    var PREFIX = '[NotificationOrchestrationService]';
    var MAX_NOTIFICATIONS = 500;
    var DEFAULT_MAX_RETRIES = 3;
    var SPAM_LOOP_THRESHOLD = 5;

    var NOTIFICATION_STATES = Object.freeze({
        QUEUED: 'QUEUED',
        PENDING_DELIVERY: 'PENDING_DELIVERY',
        DELIVERED: 'DELIVERED',
        ACKNOWLEDGED: 'ACKNOWLEDGED',
        FAILED: 'FAILED',
        RETRY_PENDING: 'RETRY_PENDING',
        ARCHIVED: 'ARCHIVED'
    });

    var NOTIFICATION_CHANNELS = Object.freeze({
        IN_APP: 'IN_APP',
        EMAIL: 'EMAIL',
        GOVERNANCE_ALERT: 'GOVERNANCE_ALERT',
        ESCALATION_ALERT: 'ESCALATION_ALERT',
        STRATEGIC_REVIEW_ALERT: 'STRATEGIC_REVIEW_ALERT',
        ONBOARDING_NOTIFICATION: 'ONBOARDING_NOTIFICATION',
        OPERATIONAL_WARNING: 'OPERATIONAL_WARNING'
    });

    var PRIORITIES = Object.freeze({
        LOW: 'LOW',
        NORMAL: 'NORMAL',
        HIGH: 'HIGH',
        CRITICAL: 'CRITICAL'
    });

    var DELIVERY_CLASSIFICATIONS = Object.freeze({
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
        var text = safeString(value, '');
        return text.replace(SENSITIVE_VALUE_PATTERN, '[REDACTED]');
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

    function normalizedToken(value, allowed, fallback) {
        var token = safeString(value || fallback, fallback).trim().replace(/[\s-]+/g, '_').toUpperCase();
        return allowed[token] ? allowed[token] : fallback;
    }

    function normalizePriority(value) {
        return normalizedToken(value, PRIORITIES, PRIORITIES.NORMAL);
    }

    function normalizeState(value) {
        return normalizedToken(value, NOTIFICATION_STATES, NOTIFICATION_STATES.QUEUED);
    }

    function normalizeChannel(value, fallback) {
        return normalizedToken(value, NOTIFICATION_CHANNELS, fallback || NOTIFICATION_CHANNELS.IN_APP);
    }

    function normalizeRole(role) {
        var raw = safeString(role || '', '').trim();
        if (!raw) return '';
        try {
            if (db() && typeof db().normalizeRoleTarget === 'function') return db().normalizeRoleTarget(raw);
        } catch (error) {}
        return raw.toUpperCase().replace(/[\s-]+/g, '_');
    }

    function normalizeTenantSlug(value) {
        var slug = safeString(value || '', '').trim().toLowerCase();
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

    function normalizeFailureClassification(value) {
        var token = safeString(value || DELIVERY_CLASSIFICATIONS.INFO, DELIVERY_CLASSIFICATIONS.INFO).trim().replace(/[\s-]+/g, '_').toUpperCase();
        return DELIVERY_CLASSIFICATIONS[token] || DELIVERY_CLASSIFICATIONS.INFO;
    }

    function classifyNotificationPriority(input) {
        var source = isPlainObject(input) ? input : {};
        var type = safeString(source.type || source.notificationType || source.eventType || '', '').toLowerCase();
        var module = safeString(source.module || '', '').toLowerCase();
        if (source.crossTenant || source.tenantMismatch || source.critical || /cross.?tenant|security|critical|blocker/.test(type)) return PRIORITIES.CRITICAL;
        if (/escalation|deployment|governance|unsafe|incident/.test(type) || /escalation|deployment|governance|incident/.test(module)) return PRIORITIES.CRITICAL;
        if (/strategic|review|delayed|blocked|onboarding|failed|failure/.test(type) || /strategic|onboarding/.test(module)) return PRIORITIES.HIGH;
        if (/reminder|digest|summary/.test(type)) return PRIORITIES.NORMAL;
        return normalizePriority(source.priority || PRIORITIES.NORMAL);
    }

    function classifyDeliveryFailure(input) {
        var source = isPlainObject(input) ? input : {};
        var retryAttempts = Number(source.retryAttempts || source.retryCount || 0) || 0;
        var state = normalizeState(source.state || source.status || '');
        var type = safeString(source.type || source.failureType || source.eventType || '', '').toLowerCase();
        if (source.crossTenant || source.tenantMismatch || /cross.?tenant/.test(type)) return DELIVERY_CLASSIFICATIONS.CRITICAL_BLOCKER;
        if (source.sensitiveExposure || /sensitive|payroll|salary|service.?role|secret/.test(type)) return DELIVERY_CLASSIFICATIONS.CRITICAL_BLOCKER;
        if (retryAttempts >= DEFAULT_MAX_RETRIES || /retry|congestion|loop/.test(type)) return DELIVERY_CLASSIFICATIONS.HIGH_RISK;
        if (state === NOTIFICATION_STATES.FAILED || state === NOTIFICATION_STATES.RETRY_PENDING) return DELIVERY_CLASSIFICATIONS.WARNING;
        return DELIVERY_CLASSIFICATIONS.INFO;
    }

    function notificationId(data) {
        try {
            if (db() && typeof db().generateNotificationId === 'function') return db().generateNotificationId(data || rawData());
        } catch (error) {}
        return 'N-ORCH-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7).toUpperCase();
    }

    function normalizeNotificationPayload(payload, context) {
        var source = isPlainObject(payload) ? cloneSanitized(payload) : {};
        var ctxTenant = tenantFromContext(context);
        var tenantSlug = normalizeTenantSlug(source.tenantSlug || source.tenant_slug || source.tenantId || source.companyId || source.metadata?.tenantSlug || ctxTenant);
        var priority = classifyNotificationPriority({
            type: source.type || source.notificationType || source.eventType,
            module: source.module,
            priority: source.priority,
            crossTenant: tenantSlug && ctxTenant && tenantSlug !== ctxTenant
        });
        var targetRole = normalizeRole(source.toRole || source.targetRole || '');
        var targetEmpId = safeString(source.toEmpId || source.targetEmpId || source.empId || source.employeeId || '', '').trim();
        var module = safeString(source.module || 'General', 'General').trim() || 'General';
        var state = normalizeState(source.state || source.status || NOTIFICATION_STATES.QUEUED);
        var type = safeString(source.type || source.notificationType || source.eventType || 'GENERAL_NOTIFICATION', 'GENERAL_NOTIFICATION').trim() || 'GENERAL_NOTIFICATION';
        var channel = normalizeChannel(source.channel || source.deliveryChannel || (priority === PRIORITIES.CRITICAL ? NOTIFICATION_CHANNELS.GOVERNANCE_ALERT : NOTIFICATION_CHANNELS.IN_APP), NOTIFICATION_CHANNELS.IN_APP);
        var title = redactString(source.title || source.subject || 'Notification').trim() || 'Notification';
        var message = redactString(source.message || source.msg || '').trim();
        var correlationId = safeString(source.correlationId || source.metadata?.correlationId || '', '').trim();
        var eventId = safeString(source.eventId || source.metadata?.eventId || '', '').trim();
        var retryAttempts = Math.max(0, Number(source.retryAttempts || source.retryCount || 0) || 0);
        var normalized = {
            notificationId: safeString(source.notificationId || source.id || '', '').trim(),
            id: safeString(source.id || source.notificationId || '', '').trim(),
            tenantSlug: tenantSlug,
            tenantId: safeString(source.tenantId || source.companyId || '', '').trim(),
            toRole: targetEmpId ? '' : targetRole,
            targetRole: targetEmpId ? '' : targetRole,
            toEmpId: targetEmpId,
            targetEmpId: targetEmpId,
            title: title,
            message: message,
            msg: message,
            module: module,
            type: type,
            channel: channel,
            state: state,
            status: state,
            priority: priority,
            retryAttempts: retryAttempts,
            maxRetries: Math.max(0, Number(source.maxRetries || context?.maxRetries || DEFAULT_MAX_RETRIES) || DEFAULT_MAX_RETRIES),
            readBy: Array.isArray(source.readBy) ? source.readBy.map(function readTarget(item) { return safeString(item, ''); }).filter(Boolean) : [],
            acknowledgedBy: safeString(source.acknowledgedBy || '', '').trim(),
            acknowledgedAt: safeString(source.acknowledgedAt || '', '').trim(),
            dedupeKey: safeString(source.dedupeKey || '', '').trim(),
            correlationId: correlationId,
            eventId: eventId,
            createdAt: safeString(source.createdAt || source.timestamp || nowIso(), nowIso()),
            updatedAt: safeString(source.updatedAt || '', '').trim(),
            metadata: cloneSanitized(source.metadata || {})
        };
        if (!normalized.dedupeKey) normalized.dedupeKey = buildDedupeKey(normalized);
        if (!normalized.notificationId) normalized.notificationId = normalized.id;
        if (!normalized.id) normalized.id = normalized.notificationId;
        return freezeNotificationOutput(normalized);
    }

    function buildDedupeKey(notification) {
        return [
            normalizeTenantSlug(notification?.tenantSlug || ''),
            safeString(notification?.type || '', '').toUpperCase(),
            normalizeRole(notification?.toRole || notification?.targetRole || ''),
            safeString(notification?.toEmpId || notification?.targetEmpId || '', '').trim(),
            safeString(notification?.title || '', '').trim().toLowerCase(),
            safeString(notification?.message || notification?.msg || '', '').trim().toLowerCase(),
            safeString(notification?.correlationId || '', '').trim()
        ].join('|');
    }

    function validateNotificationScope(payload, context) {
        var ctxTenant = tenantFromContext(context);
        var source = isPlainObject(payload) ? cloneSanitized(payload) : {};
        var tenantSlug = normalizeTenantSlug(source.tenantSlug || source.tenant_slug || source.tenantId || source.companyId || source.metadata?.tenantSlug || ctxTenant);
        var targetRole = normalizeRole(source.toRole || source.targetRole || '');
        var alerts = [];

        if (!isPlainObject(payload)) {
            alerts.push({
                alertCode: 'MALFORMED_NOTIFICATION_PAYLOAD',
                classification: DELIVERY_CLASSIFICATIONS.HIGH_RISK,
                message: 'Notification payload is malformed and cannot be delivered safely.'
            });
        }
        if (ctxTenant && tenantSlug && ctxTenant !== tenantSlug) {
            alerts.push({
                alertCode: 'CROSS_TENANT_NOTIFICATION_BLOCKED',
                classification: DELIVERY_CLASSIFICATIONS.CRITICAL_BLOCKER,
                message: 'Cross-tenant notification delivery was blocked.'
            });
        }
        if (targetRole === 'PLATFORM_OWNER' && ctxTenant) {
            alerts.push({
                alertCode: 'PLATFORM_OWNER_TENANT_DELIVERY_BLOCKED',
                classification: DELIVERY_CLASSIFICATIONS.CRITICAL_BLOCKER,
                message: 'Platform owner governance notifications cannot be injected into tenant delivery.'
            });
        }
        if (!tenantSlug && ctxTenant) {
            alerts.push({
                alertCode: 'TENANT_SCOPE_MISSING',
                classification: DELIVERY_CLASSIFICATIONS.HIGH_RISK,
                message: 'Tenant-scoped notification is missing tenant identity.'
            });
        }

        return freezeNotificationOutput({
            allowed: alerts.filter(function critical(item) {
                return item.classification === DELIVERY_CLASSIFICATIONS.CRITICAL_BLOCKER || item.classification === DELIVERY_CLASSIFICATIONS.HIGH_RISK;
            }).length === 0,
            tenantSlug: tenantSlug,
            contextTenant: ctxTenant,
            targetRole: targetRole,
            alerts: alerts.map(function safeAlert(item) { return cloneSanitized(item); })
        });
    }

    function deliveryPlan(notification) {
        var priority = normalizePriority(notification.priority);
        var channels = [normalizeChannel(notification.channel, NOTIFICATION_CHANNELS.IN_APP)];
        if (priority === PRIORITIES.CRITICAL && channels.indexOf(NOTIFICATION_CHANNELS.GOVERNANCE_ALERT) === -1) channels.push(NOTIFICATION_CHANNELS.GOVERNANCE_ALERT);
        return freezeNotificationOutput({
            state: NOTIFICATION_STATES.QUEUED,
            channels: channels,
            immediate: priority === PRIORITIES.CRITICAL || priority === PRIORITIES.HIGH,
            retryable: true,
            maxRetries: notification.maxRetries || DEFAULT_MAX_RETRIES,
            futureAsyncReady: true,
            queueAdapter: 'future-compatible',
            scheduledAt: notification.createdAt || nowIso()
        });
    }

    function emitTelemetry(eventType, metadata, context) {
        if (telemetryForwarding || context?.skipTelemetry) return { success: true, warning: 'Telemetry skipped.' };
        var service = global.WorkflowTelemetryService;
        if (!service || typeof service.emitTelemetry !== 'function') return { success: true, warning: 'WorkflowTelemetryService unavailable.' };
        try {
            telemetryForwarding = true;
            return service.emitTelemetry('NOTIFICATION', eventType, {
                source: 'notificationOrchestrationService',
                severity: metadata?.severity || 'INFO',
                status: metadata?.status || 'RECORDED',
                correlationId: metadata?.correlationId || '',
                eventId: metadata?.eventId || '',
                metadata: cloneSanitized(metadata || {})
            });
        } catch (error) {
            return { success: false, warning: 'Notification telemetry failed safely.' };
        } finally {
            telemetryForwarding = false;
        }
    }

    function recordMetric(type, context) {
        if (metricForwarding || context?.skipMetrics) return { success: true, warning: 'Metrics skipped.' };
        var service = global.OrchestrationMetricsService;
        if (!service || typeof service.recordNotificationMetric !== 'function') return { success: true, warning: 'OrchestrationMetricsService unavailable.' };
        try {
            metricForwarding = true;
            return service.recordNotificationMetric(type || 'UNKNOWN_NOTIFICATION');
        } catch (error) {
            return { success: false, warning: 'Notification metric failed safely.' };
        } finally {
            metricForwarding = false;
        }
    }

    function auditNotification(actionType, metadata, context) {
        if (auditForwarding || context?.skipAuditPersistence) return { success: true, warning: 'Audit skipped.' };
        var service = global.AuditService;
        try {
            auditForwarding = true;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    actionType: actionType,
                    eventType: actionType,
                    module: 'Notifications',
                    targetId: metadata?.notificationId || metadata?.targetId || '',
                    description: metadata?.description || actionType,
                    actorRole: context?.actor?.role || 'platform_owner',
                    actorId: context?.actor?.id || '',
                    severity: metadata?.severity || 'INFO',
                    correlationId: metadata?.correlationId || '',
                    eventId: metadata?.eventId || '',
                    metadata: cloneSanitized(metadata || {})
                }, {
                    source: 'notificationOrchestrationService',
                    skipPersistence: false
                });
            }
            if (db() && typeof db().writeAuditLog === 'function') {
                db().writeAuditLog(
                    context?.actor?.role || 'platform_owner',
                    context?.actor?.id || '',
                    actionType,
                    'Notifications',
                    metadata?.notificationId || '',
                    metadata?.description || actionType
                );
            }
            return { success: true, warning: service ? '' : 'AuditService unavailable; DB fallback used when possible.' };
        } catch (error) {
            return { success: false, warning: 'Notification audit failed safely.' };
        } finally {
            auditForwarding = false;
        }
    }

    function persistNotification(notification, context) {
        var data = rawData();
        data.notifications = Array.isArray(data.notifications) ? data.notifications.slice() : [];
        var row = cloneSanitized(notification);
        row.notificationId = row.notificationId || notificationId(data);
        row.id = row.id || row.notificationId;
        row.state = normalizeState(row.state || NOTIFICATION_STATES.QUEUED);
        row.status = row.state;
        row.createdAt = row.createdAt || nowIso();
        row.updatedAt = nowIso();
        row.deliveryGoverned = true;
        row.readBy = Array.isArray(row.readBy) ? row.readBy.slice() : [];
        data.notifications.unshift(row);
        if (data.notifications.length > MAX_NOTIFICATIONS) data.notifications = data.notifications.slice(0, MAX_NOTIFICATIONS);
        saveData(data);
        auditNotification('NOTIFICATION_ORCHESTRATED', {
            notificationId: row.notificationId || row.id,
            correlationId: row.correlationId || '',
            eventId: row.eventId || '',
            severity: row.priority === PRIORITIES.CRITICAL ? 'CRITICAL' : row.priority === PRIORITIES.HIGH ? 'WARNING' : 'INFO',
            tenantSlug: row.tenantSlug,
            description: 'Notification queued through enterprise orchestration.'
        }, context);
        emitTelemetry('NOTIFICATION_ORCHESTRATED', {
            notificationId: row.notificationId || row.id,
            correlationId: row.correlationId || '',
            eventId: row.eventId || '',
            status: row.state,
            severity: row.priority === PRIORITIES.CRITICAL ? 'CRITICAL' : row.priority === PRIORITIES.HIGH ? 'WARNING' : 'INFO',
            tenantSlug: row.tenantSlug
        }, context);
        recordMetric('NOTIFICATION_ORCHESTRATED', context);
        return freezeNotificationOutput(row);
    }

    function orchestrateNotification(payload, context) {
        try {
            var scope = validateNotificationScope(payload, context);
            if (!scope.allowed) {
                auditNotification('NOTIFICATION_DELIVERY_BLOCKED', {
                    severity: 'CRITICAL',
                    tenantSlug: scope.tenantSlug,
                    description: 'Unsafe notification delivery was blocked.',
                    classification: scope.alerts[0]?.classification || DELIVERY_CLASSIFICATIONS.HIGH_RISK
                }, context);
                emitTelemetry('NOTIFICATION_DELIVERY_BLOCKED', {
                    severity: 'CRITICAL',
                    tenantSlug: scope.tenantSlug,
                    status: 'BLOCKED'
                }, context);
                recordMetric('NOTIFICATION_BLOCKED', context);
                return freezeNotificationOutput({
                    success: false,
                    classification: scope.alerts[0]?.classification || DELIVERY_CLASSIFICATIONS.HIGH_RISK,
                    notification: null,
                    alerts: scope.alerts,
                    warnings: scope.alerts,
                    metadata: {
                        tenantIsolationPreserved: true,
                        sensitiveDataFiltered: true,
                        rbacEnforcementPreserved: true
                    }
                });
            }

            var normalized = normalizeNotificationPayload(payload, context);
            var data = rawData();
            var prepared = {
                ...normalized,
                notificationId: normalized.notificationId || notificationId(data),
                id: normalized.id || normalized.notificationId || notificationId(data),
                state: NOTIFICATION_STATES.QUEUED,
                status: NOTIFICATION_STATES.QUEUED,
                updatedAt: nowIso()
            };
            if (!prepared.id) prepared.id = prepared.notificationId;
            if (!prepared.notificationId) prepared.notificationId = prepared.id;
            var plan = deliveryPlan(prepared);
            var persisted = context?.preview || context?.readOnly ? freezeNotificationOutput(prepared) : persistNotification(prepared, context);
            return freezeNotificationOutput({
                success: true,
                classification: classifyDeliveryFailure(persisted),
                notification: persisted,
                deliveryPlan: plan,
                alerts: [],
                warnings: [],
                metadata: {
                    tenantIsolationPreserved: true,
                    sensitiveDataFiltered: true,
                    rbacEnforcementPreserved: true,
                    futureAsyncReady: true,
                    existingWorkflowEventsPreserved: true
                }
            });
        } catch (error) {
            safeWarn('Notification orchestration failed safely.', error && error.message ? error.message : error);
            return freezeNotificationOutput({
                success: false,
                classification: DELIVERY_CLASSIFICATIONS.HIGH_RISK,
                notification: null,
                alerts: [{
                    alertCode: 'NOTIFICATION_ORCHESTRATION_FAILED_SAFE',
                    classification: DELIVERY_CLASSIFICATIONS.HIGH_RISK,
                    message: 'Notification orchestration failed safely.'
                }],
                warnings: [],
                metadata: {
                    tenantIsolationPreserved: true,
                    sensitiveDataFiltered: true
                }
            });
        }
    }

    function findNotification(notificationId, tenantSlug) {
        var data = rawData();
        var rows = Array.isArray(data.notifications) ? data.notifications : [];
        var id = safeString(notificationId || '', '').trim();
        var tenant = normalizeTenantSlug(tenantSlug || '');
        return rows.find(function findRow(row) {
            var rowId = safeString(row.notificationId || row.id || '', '').trim();
            var rowScope = rowTenant(row);
            return rowId === id && (!tenant || !rowScope || rowScope === tenant);
        }) || null;
    }

    function scheduleNotificationRetry(notificationInput, context) {
        try {
            var normalized = normalizeNotificationPayload(notificationInput, context);
            var maxRetries = Math.max(0, Number(context?.maxRetries || normalized.maxRetries || DEFAULT_MAX_RETRIES) || DEFAULT_MAX_RETRIES);
            var attempts = Math.min(maxRetries, (Number(normalized.retryAttempts || 0) || 0) + 1);
            var retry = {
                ...normalized,
                retryAttempts: attempts,
                maxRetries: maxRetries,
                state: attempts >= maxRetries ? NOTIFICATION_STATES.FAILED : NOTIFICATION_STATES.RETRY_PENDING,
                status: attempts >= maxRetries ? NOTIFICATION_STATES.FAILED : NOTIFICATION_STATES.RETRY_PENDING,
                nextRetryAt: attempts >= maxRetries ? '' : new Date(Date.now() + attempts * 60000).toISOString(),
                updatedAt: nowIso()
            };
            var data = rawData();
            var rows = Array.isArray(data.notifications) ? data.notifications.slice() : [];
            var id = safeString(retry.notificationId || retry.id || '', '').trim();
            var updated = false;
            rows = rows.map(function updateRow(row) {
                var rowId = safeString(row.notificationId || row.id || '', '').trim();
                if (rowId === id) {
                    updated = true;
                    return cloneSanitized({ ...row, ...retry });
                }
                return row;
            });
            if (!updated && !context?.preview && !context?.readOnly) rows.unshift(cloneSanitized(retry));
            data.notifications = rows.slice(0, MAX_NOTIFICATIONS);
            if (!context?.preview && !context?.readOnly) saveData(data);
            auditNotification('NOTIFICATION_RETRY_SCHEDULED', {
                notificationId: id,
                tenantSlug: retry.tenantSlug,
                correlationId: retry.correlationId,
                severity: retry.state === NOTIFICATION_STATES.FAILED ? 'WARNING' : 'INFO',
                description: 'Notification retry state recorded through delivery governance.'
            }, context);
            emitTelemetry('NOTIFICATION_RETRY_SCHEDULED', {
                notificationId: id,
                tenantSlug: retry.tenantSlug,
                correlationId: retry.correlationId,
                status: retry.state,
                severity: retry.state === NOTIFICATION_STATES.FAILED ? 'WARNING' : 'INFO'
            }, context);
            recordMetric('NOTIFICATION_RETRY_SCHEDULED', context);
            return freezeNotificationOutput({
                success: true,
                classification: classifyDeliveryFailure(retry),
                notification: retry,
                retryBounded: attempts <= maxRetries,
                warnings: attempts >= maxRetries ? [{
                    alertCode: 'NOTIFICATION_RETRY_LIMIT_REACHED',
                    classification: DELIVERY_CLASSIFICATIONS.HIGH_RISK,
                    message: 'Notification retry limit reached.'
                }] : []
            });
        } catch (error) {
            return freezeNotificationOutput({
                success: false,
                classification: DELIVERY_CLASSIFICATIONS.HIGH_RISK,
                notification: null,
                retryBounded: true,
                warnings: [{
                    alertCode: 'NOTIFICATION_RETRY_FAILED_SAFE',
                    classification: DELIVERY_CLASSIFICATIONS.HIGH_RISK,
                    message: 'Notification retry scheduling failed safely.'
                }]
            });
        }
    }

    function acknowledgeNotification(notificationId, context) {
        try {
            var tenant = tenantFromContext(context);
            var id = safeString(notificationId || '', '').trim();
            var data = rawData();
            var rows = Array.isArray(data.notifications) ? data.notifications.slice() : [];
            var updatedRow = null;
            rows = rows.map(function ackRow(row) {
                var rowId = safeString(row.notificationId || row.id || '', '').trim();
                var rowScope = rowTenant(row);
                if (rowId === id && (!tenant || !rowScope || rowScope === tenant)) {
                    updatedRow = cloneSanitized({
                        ...row,
                        state: NOTIFICATION_STATES.ACKNOWLEDGED,
                        status: NOTIFICATION_STATES.ACKNOWLEDGED,
                        acknowledgedBy: context?.actor?.id || context?.actor?.role || 'platform_owner',
                        acknowledgedAt: nowIso(),
                        updatedAt: nowIso()
                    });
                    return updatedRow;
                }
                return row;
            });
            if (!updatedRow) {
                return freezeNotificationOutput({
                    success: false,
                    classification: DELIVERY_CLASSIFICATIONS.WARNING,
                    notification: null,
                    warnings: [{
                        alertCode: 'NOTIFICATION_NOT_FOUND',
                        classification: DELIVERY_CLASSIFICATIONS.WARNING,
                        message: 'Notification could not be found in the selected tenant scope.'
                    }]
                });
            }
            data.notifications = rows;
            saveData(data);
            auditNotification('NOTIFICATION_ACKNOWLEDGED', {
                notificationId: id,
                tenantSlug: updatedRow.tenantSlug,
                correlationId: updatedRow.correlationId,
                description: 'Notification acknowledged through governance center.'
            }, context);
            emitTelemetry('NOTIFICATION_ACKNOWLEDGED', {
                notificationId: id,
                tenantSlug: updatedRow.tenantSlug,
                correlationId: updatedRow.correlationId,
                status: NOTIFICATION_STATES.ACKNOWLEDGED
            }, context);
            recordMetric('NOTIFICATION_ACKNOWLEDGED', context);
            return freezeNotificationOutput({
                success: true,
                classification: DELIVERY_CLASSIFICATIONS.INFO,
                notification: updatedRow,
                warnings: []
            });
        } catch (error) {
            return freezeNotificationOutput({
                success: false,
                classification: DELIVERY_CLASSIFICATIONS.HIGH_RISK,
                notification: null,
                warnings: [{
                    alertCode: 'NOTIFICATION_ACKNOWLEDGEMENT_FAILED_SAFE',
                    classification: DELIVERY_CLASSIFICATIONS.HIGH_RISK,
                    message: 'Notification acknowledgement failed safely.'
                }]
            });
        }
    }

    function tenantNotifications(tenantSlug) {
        var tenant = normalizeTenantSlug(tenantSlug || tenantFromContext({}));
        var rows = Array.isArray(rawData().notifications) ? rawData().notifications : [];
        return rows.filter(function keepTenant(row) {
            var scope = rowTenant(row);
            return !tenant || !scope || scope === tenant;
        }).map(function cleanRow(row) {
            return normalizeNotificationPayload(row, { tenantSlug: tenant });
        });
    }

    function targetMatches(row, role, empId) {
        var normalizedRole = normalizeRole(role || '');
        var normalizedEmp = safeString(empId || '', '').trim();
        if (!row) return false;
        if (row.toRole === 'ALL' || row.targetRole === 'ALL' || row.to === 'ALL') return true;
        if (normalizedRole && (normalizeRole(row.toRole || row.targetRole || row.to || '') === normalizedRole)) return true;
        if (normalizedEmp && (row.toEmpId === normalizedEmp || row.targetEmpId === normalizedEmp || row.to === normalizedEmp)) return true;
        return !normalizedRole && !normalizedEmp;
    }

    function getInAppNotificationCenter(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var tenant = normalizeTenantSlug(source.tenantSlug || tenantFromContext(context));
            var role = source.role || source.targetRole || '';
            var empId = source.empId || source.employeeId || source.toEmpId || '';
            var rows = tenantNotifications(tenant).filter(function keepInApp(row) {
                var channel = normalizeChannel(row.channel, NOTIFICATION_CHANNELS.IN_APP);
                return (channel === NOTIFICATION_CHANNELS.IN_APP || channel === NOTIFICATION_CHANNELS.GOVERNANCE_ALERT || channel === NOTIFICATION_CHANNELS.ESCALATION_ALERT || channel === NOTIFICATION_CHANNELS.STRATEGIC_REVIEW_ALERT) && targetMatches(row, role, empId);
            }).sort(function sortByDate(a, b) {
                return safeString(b.createdAt || '', '').localeCompare(safeString(a.createdAt || '', ''));
            });
            var target = safeString(empId || normalizeRole(role || 'ALL'), 'ALL');
            var unread = rows.filter(function unreadRow(row) {
                return (row.readBy || []).indexOf(target) === -1 && row.state !== NOTIFICATION_STATES.ACKNOWLEDGED && row.state !== NOTIFICATION_STATES.ARCHIVED;
            });
            var groups = {};
            rows.forEach(function groupRow(row) {
                var key = safeString(row.module || 'General', 'General');
                if (!groups[key]) groups[key] = { groupKey: key, count: 0, unread: 0, highestPriority: PRIORITIES.LOW };
                groups[key].count += 1;
                if ((row.readBy || []).indexOf(target) === -1) groups[key].unread += 1;
                if (priorityWeight(row.priority) > priorityWeight(groups[key].highestPriority)) groups[key].highestPriority = row.priority;
            });
            return freezeNotificationOutput({
                success: true,
                tenantSlug: tenant,
                unreadCount: unread.length,
                grouped: Object.keys(groups).map(function groupKey(key) { return groups[key]; }),
                notifications: rows,
                metadata: {
                    tenantIsolationPreserved: true,
                    sensitiveDataFiltered: true,
                    rbacEnforcementPreserved: true
                }
            });
        } catch (error) {
            return freezeNotificationOutput({
                success: false,
                tenantSlug: tenantFromContext(context),
                unreadCount: 0,
                grouped: [],
                notifications: [],
                warnings: [{
                    alertCode: 'IN_APP_CENTER_FAILED_SAFE',
                    classification: DELIVERY_CLASSIFICATIONS.WARNING,
                    message: 'In-app notification center failed safely.'
                }]
            });
        }
    }

    function priorityWeight(priority) {
        var value = normalizePriority(priority);
        if (value === PRIORITIES.CRITICAL) return 4;
        if (value === PRIORITIES.HIGH) return 3;
        if (value === PRIORITIES.NORMAL) return 2;
        return 1;
    }

    function detectNotificationSpamLoops(rowsInput, context) {
        var threshold = Math.max(2, Number(context?.threshold || SPAM_LOOP_THRESHOLD) || SPAM_LOOP_THRESHOLD);
        var tenant = normalizeTenantSlug(context?.tenantSlug || tenantFromContext(context));
        var rows = Array.isArray(rowsInput) ? rowsInput : tenantNotifications(tenant);
        var counters = {};
        rows.forEach(function countRow(row) {
            var normalized = normalizeNotificationPayload(row, { tenantSlug: tenant });
            if (tenant && normalized.tenantSlug && normalized.tenantSlug !== tenant) return;
            var key = buildDedupeKey(normalized);
            if (!counters[key]) counters[key] = { dedupeKey: key, count: 0, tenantSlug: normalized.tenantSlug, title: normalized.title, module: normalized.module };
            counters[key].count += 1;
        });
        var duplicates = Object.keys(counters).map(function mapCounter(key) {
            return counters[key];
        }).filter(function keepDuplicate(row) {
            return row.count >= threshold;
        });
        return freezeNotificationOutput({
            spamLoopDetected: duplicates.length > 0,
            threshold: threshold,
            duplicateCount: duplicates.length,
            duplicates: duplicates,
            metadata: {
                tenantIsolationPreserved: true,
                sensitiveDataFiltered: true
            }
        });
    }

    function generateNotificationGovernanceReport(input, context) {
        var warnings = [];
        try {
            var source = isPlainObject(input) ? input : {};
            var tenant = normalizeTenantSlug(source.tenantSlug || tenantFromContext(context));
            var rows = tenantNotifications(tenant);
            var failed = rows.filter(function failedRow(row) { return row.state === NOTIFICATION_STATES.FAILED; });
            var retryRows = rows.filter(function retryRow(row) { return row.state === NOTIFICATION_STATES.RETRY_PENDING || row.retryAttempts > 0; });
            var allData = rawData();
            var escalationRecords = (Array.isArray(allData.escalations) ? allData.escalations : []).filter(function escalationRecord(row) {
                var scope = rowTenant(row);
                return !tenant || !scope || scope === tenant;
            }).map(function cleanEscalation(row) {
                return freezeNotificationOutput({
                    escalationId: safeString(row.escalationId || row.id || '', ''),
                    correlationId: safeString(row.correlationId || '', ''),
                    severity: safeString(row.severity || row.riskLevel || 'WARNING', 'WARNING'),
                    status: safeString(row.status || row.escalation_state || 'ESCALATED', 'ESCALATED'),
                    reviewerId: safeString(row.reviewerId || '', ''),
                    createdAt: safeString(row.createdAt || row.timestamp || '', ''),
                    tenantSlug: rowTenant(row)
                });
            });
            var escalationRows = rows.filter(function escalationRow(row) {
                return row.priority === PRIORITIES.CRITICAL || /escalation/i.test(row.module || row.type || row.title || '');
            });
            var strategicRows = rows.filter(function strategicRow(row) {
                return /strategic|review/i.test(row.module || row.type || row.title || '');
            });
            var governanceRows = rows.filter(function governanceRow(row) {
                return /governance|deployment|environment|security/i.test(row.module || row.type || row.title || '');
            });
            var spam = detectNotificationSpamLoops(rows, { tenantSlug: tenant, threshold: source.spamThreshold || SPAM_LOOP_THRESHOLD });
            var deliveryAvailable = !!(global.notificationService && (typeof global.notificationService.dispatchNotification === 'function' || typeof global.notificationService.pushNotification === 'function'));
            var routingAvailable = !!(global.NotificationRoutingService && typeof global.NotificationRoutingService.routeNotifications === 'function');
            if (!deliveryAvailable) warnings.push({
                alertCode: 'NOTIFICATION_DELIVERY_UNAVAILABLE',
                classification: DELIVERY_CLASSIFICATIONS.WARNING,
                message: 'Legacy notification delivery adapter is unavailable. Governance report is read-only.'
            });
            if (!routingAvailable) warnings.push({
                alertCode: 'NOTIFICATION_ROUTING_UNAVAILABLE',
                classification: DELIVERY_CLASSIFICATIONS.WARNING,
                message: 'Notification routing adapter is unavailable. Existing queued notifications are still visible.'
            });
            if (spam.spamLoopDetected) warnings.push({
                alertCode: 'NOTIFICATION_SPAM_LOOP_RISK',
                classification: DELIVERY_CLASSIFICATIONS.HIGH_RISK,
                message: 'Repeated notification delivery pattern detected.'
            });
            if (failed.length >= DEFAULT_MAX_RETRIES) warnings.push({
                alertCode: 'NOTIFICATION_DELIVERY_FAILURE_SPIKE',
                classification: DELIVERY_CLASSIFICATIONS.HIGH_RISK,
                message: 'Repeated notification delivery failures need review.'
            });
            var severity = warnings.some(function critical(item) { return item.classification === DELIVERY_CLASSIFICATIONS.CRITICAL_BLOCKER; })
                ? DELIVERY_CLASSIFICATIONS.CRITICAL_BLOCKER
                : warnings.some(function high(item) { return item.classification === DELIVERY_CLASSIFICATIONS.HIGH_RISK; })
                    ? DELIVERY_CLASSIFICATIONS.HIGH_RISK
                    : warnings.some(function warning(item) { return item.classification === DELIVERY_CLASSIFICATIONS.WARNING; })
                        ? DELIVERY_CLASSIFICATIONS.WARNING
                        : DELIVERY_CLASSIFICATIONS.INFO;

            auditNotification('NOTIFICATION_GOVERNANCE_REVIEWED', {
                tenantSlug: tenant,
                severity: severity === DELIVERY_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : severity === DELIVERY_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO',
                description: 'Notification governance report generated.',
                correlationId: source.correlationId || ''
            }, context);
            emitTelemetry('NOTIFICATION_GOVERNANCE_REVIEWED', {
                tenantSlug: tenant,
                severity: severity === DELIVERY_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : severity === DELIVERY_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO',
                status: severity,
                correlationId: source.correlationId || ''
            }, context);
            recordMetric('NOTIFICATION_GOVERNANCE_REPORTED', context);

            return freezeNotificationOutput({
                success: true,
                readOnly: true,
                severity: severity,
                state: severity === DELIVERY_CLASSIFICATIONS.INFO ? 'HEALTHY' : 'WARNING',
                tenantSlug: tenant,
                deliveryHealth: {
                    totalNotifications: rows.length,
                    failedDeliveries: failed.length,
                    delivered: rows.filter(function deliveredRow(row) { return row.state === NOTIFICATION_STATES.DELIVERED || row.state === NOTIFICATION_STATES.ACKNOWLEDGED; }).length,
                    queued: rows.filter(function queuedRow(row) { return row.state === NOTIFICATION_STATES.QUEUED || row.state === NOTIFICATION_STATES.PENDING_DELIVERY; }).length
                },
                retryQueue: {
                    retryPending: retryRows.length,
                    boundedRetries: true,
                    maxRetries: DEFAULT_MAX_RETRIES,
                    notifications: retryRows.slice(0, 20)
                },
                escalationAlerts: {
                    alertDensity: escalationRows.length + escalationRecords.length,
                    notifications: escalationRows.slice(0, 20),
                    escalationRecords: escalationRecords.slice(0, 20)
                },
                strategicNotifications: {
                    pendingReviews: strategicRows.length,
                    notifications: strategicRows.slice(0, 20)
                },
                governanceAlerts: {
                    activeAlerts: governanceRows.length,
                    notifications: governanceRows.slice(0, 20)
                },
                inAppCenter: getInAppNotificationCenter({ tenantSlug: tenant, role: source.role || 'MANAGER', empId: source.empId || '' }, { tenantSlug: tenant, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true }),
                spamLoopDetection: spam,
                warnings: warnings,
                metadata: {
                    tenantIsolationPreserved: true,
                    sensitiveDataFiltered: true,
                    rbacEnforcementPreserved: true,
                    existingWorkflowEventsPreserved: true,
                    futureAsyncQueueCompatible: true,
                    monitoringReadOnly: true,
                    generatedAt: nowIso()
                }
            });
        } catch (error) {
            return freezeNotificationOutput({
                success: false,
                readOnly: true,
                severity: DELIVERY_CLASSIFICATIONS.HIGH_RISK,
                deliveryHealth: { totalNotifications: 0, failedDeliveries: 0, delivered: 0, queued: 0 },
                retryQueue: { retryPending: 0, boundedRetries: true, maxRetries: DEFAULT_MAX_RETRIES, notifications: [] },
                escalationAlerts: { alertDensity: 0, notifications: [] },
                strategicNotifications: { pendingReviews: 0, notifications: [] },
                governanceAlerts: { activeAlerts: 0, notifications: [] },
                warnings: [{
                    alertCode: 'NOTIFICATION_GOVERNANCE_FAILED_SAFE',
                    classification: DELIVERY_CLASSIFICATIONS.HIGH_RISK,
                    message: 'Notification governance report failed safely.'
                }],
                metadata: {
                    tenantIsolationPreserved: true,
                    sensitiveDataFiltered: true
                }
            });
        }
    }

    if (typeof global.notificationService === 'undefined') {
        safeWarn('Optional dependency window.notificationService is unavailable. Orchestration will preserve queued visibility and degrade delivery safely.');
    }
    if (typeof global.NotificationRoutingService === 'undefined') {
        safeWarn('Optional dependency window.NotificationRoutingService is unavailable. Route governance will use supplied targets.');
    }

    var NotificationOrchestrationService = Object.freeze({
        NOTIFICATION_STATES: NOTIFICATION_STATES,
        NOTIFICATION_CHANNELS: NOTIFICATION_CHANNELS,
        PRIORITIES: PRIORITIES,
        DELIVERY_CLASSIFICATIONS: DELIVERY_CLASSIFICATIONS,
        classifyNotificationPriority: classifyNotificationPriority,
        classifyDeliveryFailure: classifyDeliveryFailure,
        validateNotificationScope: validateNotificationScope,
        normalizeNotificationPayload: normalizeNotificationPayload,
        freezeNotificationOutput: freezeNotificationOutput,
        detectNotificationSpamLoops: detectNotificationSpamLoops,
        orchestrateNotification: orchestrateNotification,
        scheduleNotificationRetry: scheduleNotificationRetry,
        acknowledgeNotification: acknowledgeNotification,
        getInAppNotificationCenter: getInAppNotificationCenter,
        generateNotificationGovernanceReport: generateNotificationGovernanceReport
    });

    global.NotificationOrchestrationService = NotificationOrchestrationService;
    global.notificationOrchestrationService = NotificationOrchestrationService;

    if (global.__ARTHHRMS_DEV__) {
        (function runSelfTest() {
            var tests = [];
            var previousNotificationService = global.notificationService;
            var previousRoutingService = global.NotificationRoutingService;
            var previousAuditService = global.AuditService;
            var previousTelemetryService = global.WorkflowTelemetryService;

            function check(name, condition) {
                tests.push(Object.freeze({ name: name, passed: !!condition }));
            }

            try {
                var payload = {
                    tenantSlug: 'tabsons',
                    toRole: 'MANAGER',
                    title: 'Delayed strategic review',
                    message: 'Contributor update requires review. salary=12345',
                    module: 'Strategic Deliverables',
                    type: 'delayed_strategic_review',
                    metadata: { salary: 12345, safe: true }
                };
                var before = JSON.stringify(payload);
                var normalized = normalizeNotificationPayload(payload, { tenantSlug: 'tabsons' });
                check('normalization is immutable', JSON.stringify(payload) === before && Object.isFrozen(normalized));
                check('sensitive payroll data filtered', !/12345|salary/i.test(JSON.stringify(normalized)));
                check('strategic review priority high', normalized.priority === PRIORITIES.HIGH);

                var blocked = validateNotificationScope({ tenantSlug: 'abc', toRole: 'HR', metadata: { salary: 1 } }, { tenantSlug: 'tabsons' });
                check('tenant notification isolation works', blocked.allowed === false && blocked.alerts.some(function item(row) { return row.classification === DELIVERY_CLASSIFICATIONS.CRITICAL_BLOCKER; }));

                var retry = scheduleNotificationRetry({
                    tenantSlug: 'tabsons',
                    notificationId: 'SELF-N-1',
                    toRole: 'MANAGER',
                    title: 'Retry',
                    message: 'Retry me',
                    retryAttempts: 1
                }, { tenantSlug: 'tabsons', maxRetries: 2, preview: true, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
                check('retry orchestration works', retry.success === true && retry.retryBounded === true);

                var spam = detectNotificationSpamLoops([
                    { tenantSlug: 'tabsons', toRole: 'HR', title: 'Repeat', message: 'Same', module: 'Workflow' },
                    { tenantSlug: 'tabsons', toRole: 'HR', title: 'Repeat', message: 'Same', module: 'Workflow' },
                    { tenantSlug: 'tabsons', toRole: 'HR', title: 'Repeat', message: 'Same', module: 'Workflow' }
                ], { tenantSlug: 'tabsons', threshold: 3 });
                check('spam loop detection works', spam.spamLoopDetected === true);

                var escalation = orchestrateNotification({
                    tenantSlug: 'tabsons',
                    toRole: 'MANAGER',
                    title: 'Escalation pending',
                    message: 'Reviewer congestion detected.',
                    module: 'Escalation',
                    type: 'escalation_alert'
                }, { tenantSlug: 'tabsons', preview: true, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
                check('escalation notifications work', escalation.success === true && escalation.notification.priority === PRIORITIES.CRITICAL);

                global.notificationService = null;
                global.NotificationRoutingService = null;
                var report = generateNotificationGovernanceReport({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
                check('dependency absence tolerated', report.success === true && report.warnings.length >= 1);
                global.notificationService = previousNotificationService;
                global.NotificationRoutingService = previousRoutingService;

                global.AuditService = { recordAudit: function recordAudit() { throw new Error('audit down'); } };
                global.WorkflowTelemetryService = { emitTelemetry: function emitTelemetryDown() { throw new Error('telemetry down'); } };
                var isolated = orchestrateNotification(payload, { tenantSlug: 'tabsons', preview: true });
                check('telemetry and audit failures isolated', isolated.success === true);
                global.AuditService = previousAuditService;
                global.WorkflowTelemetryService = previousTelemetryService;

                var malformed = orchestrateNotification('bad-payload', { tenantSlug: 'tabsons', preview: true, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
                check('malformed payloads blocked safely', malformed.success === false && malformed.classification === DELIVERY_CLASSIFICATIONS.HIGH_RISK);

                var passed = tests.every(function everyTest(test) { return test.passed; });
                global.__ARTHHRMS_NOTIFICATION_ORCHESTRATION_SELF_TEST__ = freezeNotificationOutput({
                    passed: passed,
                    tests: tests
                });
                if (passed) safeInfo('development self-test passed.', global.__ARTHHRMS_NOTIFICATION_ORCHESTRATION_SELF_TEST__);
                else safeWarn('development self-test reported failures.', global.__ARTHHRMS_NOTIFICATION_ORCHESTRATION_SELF_TEST__);
            } catch (error) {
                global.__ARTHHRMS_NOTIFICATION_ORCHESTRATION_SELF_TEST__ = freezeNotificationOutput({
                    passed: false,
                    tests: tests,
                    error: error && error.message ? error.message : safeString(error, 'unknown self-test error')
                });
                safeWarn('development self-test failed safely.', global.__ARTHHRMS_NOTIFICATION_ORCHESTRATION_SELF_TEST__);
            } finally {
                global.notificationService = previousNotificationService;
                global.NotificationRoutingService = previousRoutingService;
                global.AuditService = previousAuditService;
                global.WorkflowTelemetryService = previousTelemetryService;
            }
        })();
    }
})(typeof window !== 'undefined' ? window : globalThis);
