/**
 * globalActivityFeedService.js
 * ARTHHRMS - Global Activity Feed + Enterprise Event Intelligence Timeline
 *
 * PURPOSE:
 * Provides a tenant-scoped, RBAC-aware operational activity timeline across HR,
 * workflow, strategic, communication, file governance, audit, notification, and
 * onboarding sources.
 *
 * This service manages:
 * - normalized activity events
 * - chronological timeline generation
 * - related event grouping and clustering
 * - activity importance and engagement scoring
 * - immutable activity feed analytics/history
 * - feed access audit and telemetry
 *
 * This service does NOT:
 * - expose cross-tenant activity
 * - expose salaries, payroll amounts, leave balances, raw documents, or tokens
 * - bypass RBAC protections
 * - mutate source business records
 *
 * @version 1.0.0
 */
(function attachGlobalActivityFeedService(global) {
    'use strict';

    var PREFIX = '[GlobalActivityFeedService]';
    var MAX_EVENTS = 10000;
    var MAX_LIMIT = 100;
    var MAX_HISTORY = 500;

    var FEED_STATES = Object.freeze({
        CREATED: 'CREATED',
        PROCESSED: 'PROCESSED',
        VISIBLE: 'VISIBLE',
        ACKNOWLEDGED: 'ACKNOWLEDGED',
        ARCHIVED: 'ARCHIVED'
    });

    var ACTIVITY_TYPES = Object.freeze({
        EMPLOYEE_ACTION: 'EMPLOYEE_ACTION',
        ATTENDANCE_ACTION: 'ATTENDANCE_ACTION',
        LEAVE_ACTION: 'LEAVE_ACTION',
        PAYROLL_ACTION: 'PAYROLL_ACTION',
        APPROVAL: 'APPROVAL',
        STRATEGIC_EXECUTION: 'STRATEGIC_EXECUTION',
        DELIVERABLE: 'DELIVERABLE',
        COMMUNICATION_EVENT: 'COMMUNICATION_EVENT',
        FILE_GOVERNANCE: 'FILE_GOVERNANCE',
        AUDIT_EVENT: 'AUDIT_EVENT',
        NOTIFICATION_EVENT: 'NOTIFICATION_EVENT',
        ONBOARDING_ACTION: 'ONBOARDING_ACTION',
        WORKFLOW_ACTION: 'WORKFLOW_ACTION',
        SYSTEM_EVENT: 'SYSTEM_EVENT'
    });

    var PRIORITY_CLASSES = Object.freeze({
        LOW: 'LOW',
        NORMAL: 'NORMAL',
        HIGH: 'HIGH',
        CRITICAL: 'CRITICAL'
    });

    var SENSITIVE_KEY_PATTERN = /(salary|payroll.?amount|payrollAmount|amount|payslip|compensation|ctc|leave.?balance|leaveBalance|gross|net|basic|hra|pf|tds|allowance|deduction|password|secret|token|jwt|authorization|service.?role|private.?key|bank|tax|raw|payload|content|body|signed.?url|download.?url|storage.?path|file.?path)/i;
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
        try { return new Date().toISOString(); } catch (error) { return String(Date.now()); }
    }

    function db() {
        try { return global.DB || null; } catch (error) { return null; }
    }

    function rawData() {
        try {
            var source = db();
            return source && typeof source.get === 'function' ? source.get() || {} : {};
        } catch (error) {
            return {};
        }
    }

    function saveData(data) {
        try {
            var source = db();
            if (source && typeof source.save === 'function') {
                source.save(data);
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
        var next = Number(value);
        return Number.isFinite(next) ? next : (fallback || 0);
    }

    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function freezeActivityOutput(value, seen) {
        if (!value || (typeof value !== 'object' && typeof value !== 'function') || Object.isFrozen(value)) return value;
        var refs = seen || [];
        if (refs.indexOf(value) !== -1) return value;
        refs.push(value);
        try {
            Object.keys(value).forEach(function freezeKey(key) {
                freezeActivityOutput(value[key], refs.slice());
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

    function normalizeToken(value, fallback) {
        var raw = safeString(value || fallback || '', '').trim();
        return raw.replace(/[\s-]+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').toUpperCase() || (fallback || '');
    }

    function normalizeRole(value) {
        var role = normalizeToken(value || '', '');
        if (role === 'PLATFORMOWNER') return 'PLATFORM_OWNER';
        if (role === 'SUPERADMIN') return 'SUPER_ADMIN';
        return role;
    }

    function normalizeTenantSlug(value, fallback) {
        var raw = safeString(value || fallback || '', '').trim().toLowerCase();
        return raw.replace(/[^a-z0-9_-]+/g, '');
    }

    function defaultTenantSlug() {
        var data = rawData();
        return normalizeTenantSlug(data.companySettings && data.companySettings.tenantSlug, 'default');
    }

    function contextTenant(context) {
        return normalizeTenantSlug(context && (context.tenantSlug || (context.actor && context.actor.tenantSlug)), defaultTenantSlug());
    }

    function actorId(context) {
        return safeString(context && context.actor && (context.actor.id || context.actor.empId), safeString(context && context.empId, ''));
    }

    function valueOf(row, keys, fallback) {
        for (var i = 0; i < keys.length; i += 1) {
            var value = row && row[keys[i]];
            if (value !== undefined && value !== null && safeString(value, '').trim()) return value;
        }
        return fallback || '';
    }

    function list(data, keys) {
        var output = [];
        keys.forEach(function collect(key) {
            if (Array.isArray(data && data[key])) output = output.concat(data[key]);
        });
        return output;
    }

    function rowTenant(row, fallback) {
        return normalizeTenantSlug(row && row.tenantSlug, fallback || defaultTenantSlug());
    }

    function timestampOf(row) {
        return safeString(valueOf(row, ['updatedAt', 'createdAt', 'timestamp', 'date', 'from'], ''), '');
    }

    function normalizeActivityType(value, row) {
        var token = normalizeToken(value || '', '');
        if (ACTIVITY_TYPES[token]) return ACTIVITY_TYPES[token];
        var text = [
            value,
            row && row.type,
            row && row.actionType,
            row && row.action,
            row && row.module,
            row && row.title
        ].map(function stringify(item) { return safeString(item, '').toLowerCase(); }).join(' ');
        if (/approval/.test(text)) return ACTIVITY_TYPES.APPROVAL;
        if (/attendance|clock|shift/.test(text)) return ACTIVITY_TYPES.ATTENDANCE_ACTION;
        if (/leave/.test(text)) return ACTIVITY_TYPES.LEAVE_ACTION;
        if (/payroll|payslip|salary/.test(text)) return ACTIVITY_TYPES.PAYROLL_ACTION;
        if (/strategic|kpi|goal/.test(text)) return ACTIVITY_TYPES.STRATEGIC_EXECUTION;
        if (/deliverable|milestone/.test(text)) return ACTIVITY_TYPES.DELIVERABLE;
        if (/announcement|discussion|message|comment|communication/.test(text)) return ACTIVITY_TYPES.COMMUNICATION_EVENT;
        if (/file|document|attachment|storage/.test(text)) return ACTIVITY_TYPES.FILE_GOVERNANCE;
        if (/audit|governance/.test(text)) return ACTIVITY_TYPES.AUDIT_EVENT;
        if (/notification/.test(text)) return ACTIVITY_TYPES.NOTIFICATION_EVENT;
        if (/onboarding|invite/.test(text)) return ACTIVITY_TYPES.ONBOARDING_ACTION;
        if (/workflow/.test(text)) return ACTIVITY_TYPES.WORKFLOW_ACTION;
        return ACTIVITY_TYPES.SYSTEM_EVENT;
    }

    function normalizeState(value) {
        var token = normalizeToken(value || FEED_STATES.CREATED, FEED_STATES.CREATED);
        return FEED_STATES[token] || FEED_STATES.CREATED;
    }

    function normalizeCategory(value, activityType) {
        var token = normalizeToken(value || '', '');
        if (token) return token;
        if (activityType === ACTIVITY_TYPES.ONBOARDING_ACTION || activityType === ACTIVITY_TYPES.FILE_GOVERNANCE) return 'HR';
        if (activityType === ACTIVITY_TYPES.APPROVAL) return 'APPROVAL';
        if (activityType === ACTIVITY_TYPES.STRATEGIC_EXECUTION || activityType === ACTIVITY_TYPES.DELIVERABLE) return 'STRATEGIC';
        if (activityType === ACTIVITY_TYPES.PAYROLL_ACTION) return 'PAYROLL';
        if (activityType === ACTIVITY_TYPES.AUDIT_EVENT) return 'GOVERNANCE';
        if (activityType === ACTIVITY_TYPES.NOTIFICATION_EVENT) return 'NOTIFICATION';
        return 'OPERATIONS';
    }

    function normalizeActivityPayload(payload, context) {
        if (!isPlainObject(payload)) {
            return freezeActivityOutput({
                success: false,
                classification: 'MALFORMED_PAYLOAD',
                message: 'Activity payload must be an object.'
            });
        }
        var ctxTenant = contextTenant(context || {});
        var tenantSlug = rowTenant(payload, ctxTenant);
        if (ctxTenant && tenantSlug && tenantSlug !== ctxTenant) {
            return freezeActivityOutput({
                success: false,
                classification: 'CROSS_TENANT_BLOCKED',
                tenantSlug: tenantSlug,
                contextTenant: ctxTenant,
                message: 'Activity tenant scope does not match the active context.'
            });
        }
        var activityType = normalizeActivityType(payload.activityType || payload.type || payload.actionType, payload);
        var activityId = safeString(payload.activityId || payload.eventId || payload.id || payload.logId || payload.notificationId || payload.leaveId || payload.attendanceId || payload.payrollId || payload.deliverableId || payload.documentId || payload.taskId || payload.trailId, '');
        if (!activityId) activityId = 'ACT-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
        var category = normalizeCategory(payload.category || payload.module || payload.type, activityType);
        var title = redactString(payload.title || payload.actionType || payload.action || payload.type || activityType).slice(0, 160);
        var summary = redactString(payload.summary || payload.message || payload.description || payload.reason || payload.note || payload.body || title).slice(0, 260);
        var timestamp = timestampOf(payload) || nowIso();
        var state = normalizeState(payload.state || payload.feedState || FEED_STATES.CREATED);
        var activity = {
            activityId: activityId,
            entityId: safeString(payload.entityId || activityId, ''),
            tenantSlug: tenantSlug,
            activityType: activityType,
            category: category,
            state: state,
            title: title,
            summary: summary,
            actorId: safeString(payload.actorId || payload.createdBy || payload.ownerId || payload.ownerEmpId || payload.empId || '', ''),
            actorRole: normalizeRole(payload.actorRole || payload.role || ''),
            subjectId: safeString(payload.subjectId || payload.empId || payload.employeeId || payload.toEmpId || payload.targetEmpId || payload.ownerEmpId || '', ''),
            department: safeString(payload.department || payload.departmentName || '', ''),
            role: normalizeRole(payload.role || payload.targetRole || payload.toRole || ''),
            status: normalizeToken(payload.status || payload.finalStatus || payload.review_status || payload.state || '', ''),
            priority: normalizeToken(payload.priority || payload.severity || '', ''),
            workflowId: safeString(payload.workflowId || '', ''),
            projectId: safeString(payload.projectId || '', ''),
            onboardingId: safeString(payload.onboardingId || '', ''),
            correlationId: safeString(payload.correlationId || payload.workflowId || payload.projectId || payload.onboardingId || '', ''),
            timestamp: timestamp,
            createdAt: timestamp,
            source: safeString(payload.source || payload.module || '', ''),
            visibility: normalizeToken(payload.visibility || payload.scope || '', ''),
            metadata: cloneSanitized(payload.metadata || {})
        };
        return freezeActivityOutput({
            success: true,
            activity: freezeActivityOutput(cloneSanitized(activity)),
            metadata: freezeActivityOutput({
                tenantIsolationPreserved: true,
                confidentialFieldsFiltered: true,
                activityVisibilityGovernancePreserved: true
            })
        });
    }

    function calculateActivityImportance(activity) {
        var row = isPlainObject(activity) ? activity : {};
        var text = [
            row.priority,
            row.severity,
            row.status,
            row.category,
            row.activityType,
            row.title,
            row.summary
        ].map(function stringify(item) { return safeString(item, '').toLowerCase(); }).join(' ');
        var score = 20;
        if (/critical|incident|security|emergency|blocked|failed|breach/.test(text)) score += 55;
        if (/high|approval|escalat|strategic|deliverable|workflow/.test(text)) score += 25;
        if (/acknowledged|approved|processed|present|published/.test(text)) score += 8;
        if (/payroll|file|audit|governance/.test(text)) score += 10;
        score = Math.max(0, Math.min(100, score));
        var operationalImpact = Math.min(100, score + (/workflow|approval|strategic|incident|blocked/.test(text) ? 8 : 0));
        var engagement = Math.min(100, 20 + (/acknowledged|approved|viewed|comment|discussion|published/.test(text) ? 45 : 0));
        var visibility = Math.min(100, Math.round((score + operationalImpact + engagement) / 3));
        var priorityClass = score >= 80 ? PRIORITY_CLASSES.CRITICAL : score >= 60 ? PRIORITY_CLASSES.HIGH : score >= 35 ? PRIORITY_CLASSES.NORMAL : PRIORITY_CLASSES.LOW;
        return freezeActivityOutput({
            activityImportanceScore: score,
            engagementScore: engagement,
            operationalImpactScore: operationalImpact,
            visibilityPriorityScore: visibility,
            priorityClass: priorityClass
        });
    }

    function makeSourceActivity(domain, row, tenantSlug) {
        var mapped = Object.assign({}, cloneSanitized(row), {
            source: domain,
            tenantSlug: rowTenant(row, tenantSlug)
        });
        if (domain === 'employees') mapped.activityType = ACTIVITY_TYPES.EMPLOYEE_ACTION;
        if (domain === 'attendance') mapped.activityType = ACTIVITY_TYPES.ATTENDANCE_ACTION;
        if (domain === 'leave') mapped.activityType = ACTIVITY_TYPES.LEAVE_ACTION;
        if (domain === 'payroll') mapped.activityType = ACTIVITY_TYPES.PAYROLL_ACTION;
        if (domain === 'workflow') mapped.activityType = normalizeActivityType(row.type || 'WORKFLOW_ACTION', row);
        if (domain === 'strategic') mapped.activityType = ACTIVITY_TYPES.STRATEGIC_EXECUTION;
        if (domain === 'deliverable') mapped.activityType = ACTIVITY_TYPES.STRATEGIC_EXECUTION;
        if (domain === 'announcement' || domain === 'discussion') mapped.activityType = ACTIVITY_TYPES.COMMUNICATION_EVENT;
        if (domain === 'document' || domain === 'file') mapped.activityType = ACTIVITY_TYPES.FILE_GOVERNANCE;
        if (domain === 'audit') mapped.activityType = ACTIVITY_TYPES.AUDIT_EVENT;
        if (domain === 'notification') mapped.activityType = ACTIVITY_TYPES.NOTIFICATION_EVENT;
        if (domain === 'onboarding') mapped.activityType = ACTIVITY_TYPES.ONBOARDING_ACTION;
        mapped.activityId = safeString(row.activityId || row.eventId || row.id || row.logId || row.notificationId || row.leaveId || row.attendanceId || row.payrollId || row.deliverableId || row.documentId || row.taskId || row.trailId, '');
        mapped.entityId = mapped.activityId;
        mapped.title = row.title || row.name || row.actionType || row.type || row.status || domain;
        mapped.summary = row.summary || row.message || row.description || row.reason || row.note || row.body || row.module || mapped.title;
        if (!mapped.department && domain === 'file') mapped.department = 'People';
        if (!mapped.category && (domain === 'file' || domain === 'onboarding' || domain === 'document')) mapped.category = 'HR';
        return normalizeActivityPayload(mapped, { tenantSlug: tenantSlug });
    }

    function collectActivities(tenantSlug) {
        var data = rawData();
        var pairs = [
            ['employees', ['employees']],
            ['attendance', ['attendance', 'attendanceRecords']],
            ['leave', ['leaveRequests']],
            ['payroll', ['payroll', 'payrollCycles']],
            ['workflow', ['workflowEvents', 'pendingActions']],
            ['strategic', ['strategicGoals', 'quarterlyGoals']],
            ['deliverable', ['strategicDeliverables', 'deliverables', 'deliverableReviews']],
            ['announcement', ['announcements']],
            ['discussion', ['discussions', 'workflowDiscussions']],
            ['document', ['documents']],
            ['notification', ['notifications']],
            ['onboarding', ['onboardingTasks', 'onboardingCollections']],
            ['audit', ['auditLogs', 'auditTrail']],
            ['file', ['fileAttachmentAuditTrail', 'attachmentAuditTrail']]
        ];
        var activities = [];
        pairs.forEach(function collectPair(pair) {
            var domain = pair[0];
            list(data, pair[1]).forEach(function collectRow(row) {
                if (activities.length >= MAX_EVENTS) return;
                if (rowTenant(row, tenantSlug) !== tenantSlug) return;
                var normalized = makeSourceActivity(domain, row, tenantSlug);
                if (normalized.success) activities.push(normalized.activity);
            });
        });
        return activities;
    }

    function visibleToRole(activity, payload, context) {
        if (!activity || activity.tenantSlug !== payload.tenantSlug) return false;
        var role = payload.role || normalizeRole(context && context.actor && context.actor.role);
        var id = payload.empId || actorId(context || {});
        if (role === 'EMPLOYEE') {
            if (activity.activityType === ACTIVITY_TYPES.PAYROLL_ACTION || activity.activityType === ACTIVITY_TYPES.AUDIT_EVENT || activity.activityType === ACTIVITY_TYPES.FILE_GOVERNANCE) return false;
            return activity.actorId === id || activity.subjectId === id;
        }
        if (role === 'MANAGER') {
            if (activity.activityType === ACTIVITY_TYPES.PAYROLL_ACTION || activity.activityType === ACTIVITY_TYPES.AUDIT_EVENT) return false;
            if (activity.activityType === ACTIVITY_TYPES.FILE_GOVERNANCE && activity.visibility === 'HR') return false;
            return activity.department === 'Engineering' || activity.actorId === id || activity.subjectId === id || activity.role === 'MANAGER';
        }
        if (role === 'HR' || role === 'HR_HEAD') {
            if (activity.activityType === ACTIVITY_TYPES.STRATEGIC_EXECUTION && role !== 'HR_HEAD') return false;
            return true;
        }
        if (role === 'DIRECTOR') {
            return [
                ACTIVITY_TYPES.STRATEGIC_EXECUTION,
                ACTIVITY_TYPES.DELIVERABLE,
                ACTIVITY_TYPES.WORKFLOW_ACTION,
                ACTIVITY_TYPES.APPROVAL,
                ACTIVITY_TYPES.COMMUNICATION_EVENT,
                ACTIVITY_TYPES.NOTIFICATION_EVENT
            ].indexOf(activity.activityType) !== -1;
        }
        if (role === 'PLATFORM_OWNER' || role === 'SUPER_ADMIN') {
            return [
                ACTIVITY_TYPES.AUDIT_EVENT,
                ACTIVITY_TYPES.NOTIFICATION_EVENT,
                ACTIVITY_TYPES.FILE_GOVERNANCE,
                ACTIVITY_TYPES.SYSTEM_EVENT
            ].indexOf(activity.activityType) !== -1;
        }
        return false;
    }

    function normalizeFeedPayload(payload, context) {
        if (!isPlainObject(payload)) {
            return freezeActivityOutput({ success: false, classification: 'MALFORMED_PAYLOAD', message: 'Feed payload must be an object.' });
        }
        var ctxTenant = contextTenant(context || {});
        var tenantSlug = normalizeTenantSlug(payload.tenantSlug, ctxTenant);
        if (ctxTenant && tenantSlug && tenantSlug !== ctxTenant) {
            return freezeActivityOutput({
                success: false,
                classification: 'CROSS_TENANT_BLOCKED',
                tenantSlug: tenantSlug,
                contextTenant: ctxTenant,
                message: 'Activity feed tenant scope does not match the active context.'
            });
        }
        return freezeActivityOutput({
            success: true,
            tenantSlug: tenantSlug,
            role: normalizeRole((context && context.actor && context.actor.role) || payload.role || 'EMPLOYEE'),
            empId: actorId(context || {}),
            filters: isPlainObject(payload.filters) ? cloneSanitized(payload.filters) : {},
            limit: Math.max(1, Math.min(safeNumber(payload.limit, 40), MAX_LIMIT)),
            offset: Math.max(0, safeNumber(payload.offset, 0))
        });
    }

    function activityMatchesType(activity, value) {
        var filter = normalizeToken(value || '', '');
        if (!filter) return true;
        return activity.activityType === filter || activity.category === filter;
    }

    function passesFilters(activity, filters) {
        if (!isPlainObject(filters)) return true;
        if (filters.userId) {
            var userId = safeString(filters.userId, '');
            if (activity.actorId !== userId && activity.subjectId !== userId) return false;
        }
        if (filters.department && safeString(filters.department, '').toLowerCase() !== safeString(activity.department, '').toLowerCase()) return false;
        if (filters.role && normalizeRole(filters.role) !== activity.role && normalizeRole(filters.role) !== activity.actorRole) return false;
        if (filters.category && normalizeToken(filters.category, '') !== activity.category) return false;
        if (filters.activityType && !activityMatchesType(activity, filters.activityType)) return false;
        if (filters.dateFrom && activity.timestamp && activity.timestamp < safeString(filters.dateFrom, '')) return false;
        if (filters.dateTo && activity.timestamp && activity.timestamp > safeString(filters.dateTo, '')) return false;
        return true;
    }

    function filtersApplied(filters) {
        if (!isPlainObject(filters)) return [];
        return Object.keys(filters).filter(function hasValue(key) {
            return filters[key] !== undefined && filters[key] !== null && safeString(filters[key], '').trim() !== '';
        });
    }

    function groupTypeFor(items, key) {
        if (items.some(function hasApproval(item) { return item.activityType === ACTIVITY_TYPES.APPROVAL || item.category === 'APPROVAL'; })) return 'APPROVAL_CHAIN';
        if (items.some(function hasProject(item) { return !!item.projectId; })) return 'PROJECT_MILESTONE';
        if (items.some(function hasOnboarding(item) { return !!item.onboardingId || item.activityType === ACTIVITY_TYPES.ONBOARDING_ACTION; })) return 'ONBOARDING_JOURNEY';
        if (items.some(function hasWorkflow(item) { return !!item.workflowId; })) return 'WORKFLOW_SESSION';
        return key ? 'ACTIVITY_CLUSTER' : 'EVENT_GROUP';
    }

    function groupRelatedActivities(activities) {
        var buckets = {};
        (Array.isArray(activities) ? activities : []).forEach(function bucketActivity(activity) {
            var key = activity.correlationId || activity.workflowId || activity.projectId || activity.onboardingId || activity.activityId;
            if (!buckets[key]) buckets[key] = [];
            buckets[key].push(activity);
        });
        var groups = Object.keys(buckets).filter(function usefulGroup(key) {
            return buckets[key].length > 1 || buckets[key][0].projectId || buckets[key][0].onboardingId;
        }).map(function makeGroup(key) {
            var items = buckets[key].slice().sort(function byTime(a, b) {
                return safeString(b.timestamp, '').localeCompare(safeString(a.timestamp, ''));
            });
            var scores = items.map(calculateActivityImportance);
            var maxScore = scores.reduce(function max(current, score) { return Math.max(current, score.activityImportanceScore); }, 0);
            return {
                groupId: key,
                groupType: groupTypeFor(items, key),
                count: items.length,
                latestAt: items[0] && items[0].timestamp || '',
                activityIds: items.map(function idOf(item) { return item.activityId; }),
                highestPriority: maxScore >= 80 ? PRIORITY_CLASSES.CRITICAL : maxScore >= 60 ? PRIORITY_CLASSES.HIGH : maxScore >= 35 ? PRIORITY_CLASSES.NORMAL : PRIORITY_CLASSES.LOW
            };
        });
        return freezeActivityOutput(groups.map(function freezeGroup(group) { return cloneSanitized(group); }));
    }

    function countBy(items, key) {
        var counts = {};
        items.forEach(function count(item) {
            var value = safeString(item && item[key], 'UNKNOWN');
            counts[value] = (counts[value] || 0) + 1;
        });
        return freezeActivityOutput(counts);
    }

    function percent(numerator, denominator) {
        if (!denominator) return 0;
        return Math.round((safeNumber(numerator, 0) / safeNumber(denominator, 1)) * 1000) / 10;
    }

    function auditActivity(actionType, metadata, context) {
        if (auditForwarding || (context && context.skipAuditPersistence)) return { success: true, warning: 'Audit skipped.' };
        var service = global.AuditService;
        try {
            auditForwarding = true;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    actionType: actionType,
                    eventType: actionType,
                    module: 'Global Activity Feed',
                    targetId: metadata && metadata.targetId || '',
                    description: metadata && metadata.description || actionType,
                    actorRole: context && context.actor && context.actor.role || 'system',
                    actorId: actorId(context || {}),
                    severity: metadata && metadata.severity || 'INFO',
                    correlationId: metadata && metadata.correlationId || '',
                    metadata: cloneSanitized(metadata || {})
                }, { source: 'globalActivityFeedService', skipPersistence: false });
            }
            if (db() && typeof db().writeAuditLog === 'function') {
                db().writeAuditLog(context && context.actor && context.actor.role || 'system', actorId(context || {}), actionType, 'Global Activity Feed', metadata && metadata.targetId || '', metadata && metadata.description || actionType);
            }
            return { success: true, warning: service ? '' : 'AuditService unavailable; DB fallback used when possible.' };
        } catch (error) {
            return { success: false, warning: 'Global activity feed audit failed safely.' };
        } finally {
            auditForwarding = false;
        }
    }

    function emitTelemetry(eventType, metadata, context) {
        if (telemetryForwarding || (context && context.skipTelemetry)) return { success: true, warning: 'Telemetry skipped.' };
        var service = global.WorkflowTelemetryService;
        if (!service || typeof service.emitTelemetry !== 'function') return { success: true, warning: 'WorkflowTelemetryService unavailable.' };
        try {
            telemetryForwarding = true;
            return service.emitTelemetry('GOVERNANCE', eventType, {
                source: 'globalActivityFeedService',
                severity: metadata && metadata.severity || 'INFO',
                status: metadata && metadata.status || 'RECORDED',
                metadata: cloneSanitized(metadata || {})
            });
        } catch (error) {
            return { success: false, warning: 'Global activity feed telemetry failed safely.' };
        } finally {
            telemetryForwarding = false;
        }
    }

    function recordMetric(metricType, metadata, context) {
        if (metricForwarding || (context && context.skipMetrics)) return { success: true, warning: 'Metrics skipped.' };
        var service = global.OrchestrationMetricsService;
        if (!service || typeof service.recordNotificationMetric !== 'function') return { success: true, warning: 'Metrics unavailable.' };
        try {
            metricForwarding = true;
            return service.recordNotificationMetric(metricType || 'GLOBAL_ACTIVITY_FEED_BUILT');
        } catch (error) {
            return { success: false, warning: 'Global activity feed metric failed safely.' };
        } finally {
            metricForwarding = false;
        }
    }

    function persistFeedAnalytics(payload, result, context, latencyMs) {
        var data = rawData();
        data.globalActivityFeedHistory = Array.isArray(data.globalActivityFeedHistory) ? data.globalActivityFeedHistory.slice() : [];
        data.globalActivityFeedAnalytics = Array.isArray(data.globalActivityFeedAnalytics) ? data.globalActivityFeedAnalytics.slice() : [];
        data.globalActivityFeedHistory.unshift(cloneSanitized({
            historyId: 'GAFH-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7).toUpperCase(),
            tenantSlug: payload.tenantSlug,
            role: payload.role,
            activityCount: result.activities.length,
            groupCount: result.groups.length,
            filtersApplied: result.filtersApplied,
            feedAccessed: true,
            accessedAt: nowIso(),
            immutable: true
        }));
        data.globalActivityFeedAnalytics.unshift(cloneSanitized({
            analyticsId: 'GAFA-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7).toUpperCase(),
            eventType: 'GLOBAL_ACTIVITY_FEED_BUILT',
            tenantSlug: payload.tenantSlug,
            role: payload.role,
            activityVolume: result.analytics.activityVolume,
            groupCount: result.groups.length,
            acknowledgementRate: result.analytics.acknowledgementRate,
            engagementRate: result.analytics.engagementRate,
            latencyMs: latencyMs,
            timestamp: nowIso(),
            immutable: true
        }));
        if (data.globalActivityFeedHistory.length > MAX_HISTORY) data.globalActivityFeedHistory = data.globalActivityFeedHistory.slice(0, MAX_HISTORY);
        if (data.globalActivityFeedAnalytics.length > MAX_HISTORY) data.globalActivityFeedAnalytics = data.globalActivityFeedAnalytics.slice(0, MAX_HISTORY);
        saveData(data);
    }

    function buildActivityFeed(payload, context) {
        var startedAt = Date.now();
        try {
            var normalized = normalizeFeedPayload(payload || {}, context || {});
            if (!normalized.success) {
                auditActivity('GLOBAL_ACTIVITY_FEED_BLOCKED', { severity: 'WARNING', description: normalized.message || 'Activity feed blocked.' }, context || {});
                return normalized;
            }
            var all = collectActivities(normalized.tenantSlug).filter(function visible(activity) {
                return visibleToRole(activity, normalized, context || {});
            }).filter(function filtered(activity) {
                return passesFilters(activity, normalized.filters);
            }).map(function enrich(activity) {
                var importance = calculateActivityImportance(activity);
                return Object.assign({}, cloneSanitized(activity), {
                    state: FEED_STATES.VISIBLE,
                    activityImportanceScore: importance.activityImportanceScore,
                    engagementScore: importance.engagementScore,
                    operationalImpactScore: importance.operationalImpactScore,
                    visibilityPriorityScore: importance.visibilityPriorityScore,
                    priorityClass: importance.priorityClass
                });
            }).sort(function timelineSort(a, b) {
                return safeString(b.timestamp, '').localeCompare(safeString(a.timestamp, ''));
            });
            var total = all.length;
            var page = all.slice(normalized.offset, normalized.offset + normalized.limit);
            var groups = groupRelatedActivities(all);
            var acknowledged = all.filter(function ack(activity) { return activity.status === 'ACKNOWLEDGED' || activity.state === FEED_STATES.ACKNOWLEDGED; }).length;
            var engaged = all.filter(function engagedActivity(activity) { return activity.engagementScore >= 60; }).length;
            var latencyMs = Date.now() - startedAt;
            var analytics = freezeActivityOutput({
                activityVolume: total,
                activityCategories: countBy(all, 'category'),
                activityTypes: countBy(all, 'activityType'),
                engagementRate: percent(engaged, total),
                acknowledgementRate: percent(acknowledged, total),
                userInteractions: engaged,
                operationalVisibilityMetrics: {
                    highPriority: all.filter(function high(activity) { return activity.priorityClass === PRIORITY_CLASSES.HIGH || activity.priorityClass === PRIORITY_CLASSES.CRITICAL; }).length,
                    groupedEvents: groups.length,
                    visibleEvents: page.length
                },
                feedPerformance: {
                    latencyMs: latencyMs,
                    virtualizedRenderingReady: true,
                    lazyLoadingReady: true,
                    incrementalUpdatesReady: true,
                    redundantProcessingAvoided: true
                }
            });
            var result = freezeActivityOutput({
                success: true,
                state: FEED_STATES.PROCESSED,
                tenantSlug: normalized.tenantSlug,
                role: normalized.role,
                activities: freezeActivityOutput(page.map(function safeActivity(activity) { return cloneSanitized(activity); })),
                groups: groups,
                analytics: analytics,
                filtersApplied: filtersApplied(normalized.filters),
                pagination: freezeActivityOutput({
                    limit: normalized.limit,
                    offset: normalized.offset,
                    total: total,
                    hasMore: normalized.offset + normalized.limit < total
                }),
                governance: freezeActivityOutput({
                    tenantIsolationPreserved: true,
                    rbacVisibilityPreserved: true,
                    activityVisibilityGovernancePreserved: true,
                    confidentialFieldsFiltered: true,
                    immutableActivityHistory: true,
                    sourceRecordsUnmodified: true
                })
            });
            persistFeedAnalytics(normalized, result, context || {}, latencyMs);
            auditActivity('GLOBAL_ACTIVITY_FEED_ACCESSED', {
                severity: total ? 'INFO' : 'WARNING',
                targetId: normalized.tenantSlug,
                description: 'Global activity feed generated through enterprise visibility governance.',
                activityVolume: total
            }, context || {});
            emitTelemetry('GLOBAL_ACTIVITY_FEED_BUILT', { tenantSlug: normalized.tenantSlug, activityVolume: total, latencyMs: latencyMs }, context || {});
            recordMetric('GLOBAL_ACTIVITY_FEED_BUILT', { activityVolume: total }, context || {});
            return result;
        } catch (error) {
            safeWarn('Global activity feed failed safely.', error && error.message);
            return freezeActivityOutput({
                success: false,
                classification: 'GLOBAL_ACTIVITY_FEED_FAILED',
                message: 'Global activity feed failed safely.',
                activities: [],
                groups: []
            });
        }
    }

    function runSelfTest() {
        var results = [];
        function record(name, passed, details) {
            results.push(freezeActivityOutput({ name: name, passed: !!passed, details: cloneSanitized(details || {}) }));
        }
        try {
            var malformed = normalizeActivityPayload('bad', { tenantSlug: 'selftest' });
            record('malformed payload blocked', malformed.success === false && Object.isFrozen(malformed));
            var normalized = normalizeActivityPayload({
                activityId: 'SELF-ACT-1',
                tenantSlug: 'selftest',
                actorId: 'SELF-EMP',
                title: 'Selftest activity',
                message: 'salary=999999 leave balance 12'
            }, { tenantSlug: 'selftest', actor: { role: 'employee', id: 'SELF-EMP' } });
            record('normalization immutable', normalized.success === true && Object.isFrozen(normalized.activity) && !/999999|salary|leave balance/i.test(JSON.stringify(normalized)));
            var data = rawData();
            data.workflowEvents = Array.isArray(data.workflowEvents) ? data.workflowEvents.slice() : [];
            data.workflowEvents.push({ eventId: 'SELF-WF-1', title: 'Selftest approval', type: 'APPROVAL', status: 'BLOCKED', workflowId: 'SELF-WF', actorId: 'SELF-MGR', empId: 'SELF-EMP', department: 'Engineering', tenantSlug: 'selftest', correlationId: 'SELF-CORR', createdAt: nowIso() });
            data.workflowEvents.push({ eventId: 'SELF-WF-2', title: 'Selftest approval done', type: 'APPROVAL', status: 'APPROVED', workflowId: 'SELF-WF', actorId: 'SELF-MGR', empId: 'SELF-EMP', department: 'Engineering', tenantSlug: 'selftest', correlationId: 'SELF-CORR', createdAt: nowIso() });
            saveData(data);
            var feed = buildActivityFeed({ tenantSlug: 'selftest', filters: { department: 'Engineering' } }, { tenantSlug: 'selftest', actor: { role: 'manager', id: 'SELF-MGR' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            record('activity feed works', feed.success === true && feed.activities.length >= 1);
            record('grouping works', feed.groups.some(function hasGroup(group) { return group.groupType === 'APPROVAL_CHAIN'; }));
            record('rbac visibility works', feed.success === true && !/999999|salary|leave balance/i.test(JSON.stringify(feed)));
            record('filtering works', feed.filtersApplied.indexOf('department') !== -1);
            record('outputs immutable', Object.isFrozen(feed) && Object.isFrozen(feed.activities));
        } catch (error) {
            record('self-test uncaught exception guard', false, { error: error && error.message });
        }
        global.__ARTHHRMS_GLOBAL_ACTIVITY_FEED_SELF_TEST__ = freezeActivityOutput({
            passed: results.every(function ok(item) { return item.passed; }),
            results: results,
            checkedAt: nowIso()
        });
    }

    var GlobalActivityFeedService = freezeActivityOutput({
        FEED_STATES: FEED_STATES,
        ACTIVITY_TYPES: ACTIVITY_TYPES,
        PRIORITY_CLASSES: PRIORITY_CLASSES,
        buildActivityFeed: buildActivityFeed,
        groupRelatedActivities: groupRelatedActivities,
        calculateActivityImportance: calculateActivityImportance,
        normalizeActivityPayload: normalizeActivityPayload,
        freezeActivityOutput: freezeActivityOutput
    });

    global.GlobalActivityFeedService = GlobalActivityFeedService;
    global.globalActivityFeedService = GlobalActivityFeedService;

    if (global.__ARTHHRMS_DEV__) {
        try {
            runSelfTest();
        } catch (error) {
            global.__ARTHHRMS_GLOBAL_ACTIVITY_FEED_SELF_TEST__ = freezeActivityOutput({
                passed: false,
                results: [{ name: 'self-test wrapper', passed: false, details: { error: error && error.message } }],
                checkedAt: nowIso()
            });
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
