/**
 * communicationAnalyticsService.js
 * ARTHHRMS Enterprise Communication Analytics + Engagement Intelligence System.
 *
 * Additive, read-only governance layer for communication health, engagement
 * scoring, workspace analytics, escalation communication intelligence, and
 * leadership reach. It never mutates communication history or exposes raw
 * private discussion content.
 */
(function attachCommunicationAnalyticsService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[CommunicationAnalyticsService]';

    var ANALYTICS_STATES = Object.freeze({
        COLLECTING: 'COLLECTING',
        PROCESSING: 'PROCESSING',
        AGGREGATED: 'AGGREGATED',
        DEGRADED: 'DEGRADED',
        ARCHIVED: 'ARCHIVED'
    });

    var FAILURE_CLASSIFICATIONS = Object.freeze({
        INFO: 'INFO',
        WARNING: 'WARNING',
        HIGH_RISK: 'HIGH_RISK',
        CRITICAL_BLOCKER: 'CRITICAL_BLOCKER'
    });

    var VISIBILITY = Object.freeze({
        NONE: 'NONE',
        OWN_ENGAGEMENT_ONLY: 'OWN_ENGAGEMENT_ONLY',
        TEAM_ENGAGEMENT_SUMMARIES: 'TEAM_ENGAGEMENT_SUMMARIES',
        HR_OPERATIONAL_COMMUNICATION_ANALYTICS: 'HR_OPERATIONAL_COMMUNICATION_ANALYTICS',
        STRATEGIC_COMMUNICATION_INTELLIGENCE: 'STRATEGIC_COMMUNICATION_INTELLIGENCE',
        ORGANIZATION_WIDE_COMMUNICATION_ANALYTICS: 'ORGANIZATION_WIDE_COMMUNICATION_ANALYTICS',
        INFRASTRUCTURE_METRICS_ONLY: 'INFRASTRUCTURE_METRICS_ONLY',
        PLATFORM_GOVERNANCE_ONLY: 'PLATFORM_GOVERNANCE_ONLY'
    });

    var SENSITIVE_KEY_PATTERN = /(message|body|content|comment|discussion|thread.?text|reply|reply.?body|subject|title|note|private|confidential|participant|member|mention|recipient|viewed.?user|acknowledged.?user|assigned.?employee|employee|emp.?id|user.?id|author|reviewer|manager|file.?name|attachment|storage.?path|signed.?url|public.?url|url|download|path|salary|payroll|payslip|compensation|reimbursement|receipt|resume|candidate|feedback|token|secret|jwt|authorization|service.?role|private.?key)/i;
    var SENSITIVE_VALUE_PATTERN = /(https?:\/\/[^\s"',}]+|private:\/\/[^\s"',}]+|\b(private|confidential|salary|payroll|resume|receipt|secret)\b[^,;}]*)/ig;

    var SAFE_GOVERNANCE_KEYS = Object.freeze({
        analyticsStates: true,
        analyticsState: true,
        communicationAnalyticsConfidentialityPreserved: true,
        communicationAnalyticsActionsAuditable: true,
        tenantIsolationPreserved: true,
        existingCommunicationFlowsPreserved: true,
        existingWorkflowsPreserved: true,
        historicalAnalyticsImmutable: true,
        historicalCommunicationsImmutable: true,
        readOnlyAnalytics: true,
        communicationHealth: true,
        engagementIntelligence: true,
        workspaceAnalytics: true,
        escalationCommunication: true,
        leadershipAnalytics: true,
        policyAcknowledgementAnalytics: true,
        unreadCommunicationTracking: true,
        accessGovernance: true,
        integrationHealth: true,
        healthSignals: true,
        signal: true,
        count: true,
        totalCommunications: true,
        totalAnnouncements: true,
        announcementViews: true,
        announcementAcknowledgements: true,
        unreadCommunications: true,
        unreadRate: true,
        unreadBuildupAlerts: true,
        acknowledgementLag: true,
        acknowledgementCompletion: true,
        completionPercent: true,
        pendingAcknowledgements: true,
        overdueAcknowledgements: true,
        collaborationParticipation: true,
        responseTimeTrend: true,
        responseTimeTrends: true,
        delayedResponses: true,
        delayedReplies: true,
        activeThreads: true,
        unresolvedOperationalThreads: true,
        collaborationBottlenecks: true,
        escalationHeavyWorkspaces: true,
        inactiveWorkspaces: true,
        inactiveWorkspaceDetection: true,
        workspaceActivity: true,
        workspaceActivityAnalytics: true,
        collaborationCongestion: true,
        communicationCongestion: true,
        communicationEffectivenessScore: true,
        engagementScore: true,
        engagementBand: true,
        engagementCompletion: true,
        leadershipReach: true,
        leadershipAnnouncementReach: true,
        audienceInteractionTrends: true,
        acknowledgementDelayTrend: true,
        departmentEngagementVariance: true,
        escalationCommunicationDensity: true,
        escalationCommunicationSpikes: true,
        operationalBottlenecks: true,
        delayedEscalationResponses: true,
        acknowledgementDelays: true,
        escalationCongestionPatterns: true,
        employeeOwnEngagementOnly: true,
        managerTeamEngagementSummaries: true,
        hrOperationalAnalytics: true,
        directorOrganizationAnalytics: true,
        superAdminEmployeeContentAccess: true,
        platformOwnerEngagementMetrics: true,
        privateAnalyticsRoleScoped: true,
        teamWorkspaceIntegrated: true,
        workflowDiscussionIntegrated: true,
        announcementHubIntegrated: true,
        communicationGovernanceIntegrated: true,
        escalationCommandIntegrated: true,
        notificationOrchestrationIntegrated: true,
        auditReady: true,
        telemetryReady: true,
        metricsReady: true,
        views: true,
        acknowledgements: true,
        unread: true,
        totalAudience: true,
        viewRate: true,
        acknowledgementRate: true,
        unreadPenalty: true,
        delayedPenalty: true,
        score: true,
        band: true,
        warnings: true,
        failures: true,
        failureCode: true,
        warningCode: true,
        description: true,
        classification: true,
        success: true,
        allowed: true,
        visibility: true,
        readOnly: true,
        generatedAt: true,
        tenantSlug: true,
        analyticsId: true,
        state: true,
        payload: true,
        metadata: true,
        source: true,
        status: true,
        severity: true,
        safelyRedacted: true,
        targetScope: true,
        dataVersion: true
    });

    var auditForwarding = false;
    var telemetryForwarding = false;
    var metricForwarding = false;

    function safeWarn(message, details) {
        try { if (global.console && console.warn) console.warn(PREFIX, message, details || ''); } catch (error) {}
    }

    function db() {
        try { return global.DB || null; } catch (error) { return null; }
    }

    function rawData() {
        try {
            var source = db();
            if (source && typeof source.get === 'function') return source.get() || {};
        } catch (error) {}
        return {};
    }

    function nowIso(context) {
        return context && context.now ? new Date(context.now).toISOString() : new Date().toISOString();
    }

    function safeString(value, fallback) {
        if (value === null || typeof value === 'undefined') return fallback || '';
        try { return String(value); } catch (error) { return fallback || ''; }
    }

    function normalizeToken(value) {
        return safeString(value || '', '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    }

    function normalizeRole(value) {
        var normalized = normalizeToken(value);
        if (normalized === 'SUPERADMIN') return 'SUPER_ADMIN';
        if (normalized === 'PLATFORMOWNER') return 'PLATFORM_OWNER';
        if (normalized === 'HRHEAD') return 'HR_HEAD';
        return normalized;
    }

    function normalizeTenantSlug(value) {
        return safeString(value || '', '').trim().toLowerCase().replace(/^ten[-_]/, '').replace(/^tenant[-_]/, '').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }

    function contextTenant(context) {
        var fromContext = normalizeTenantSlug(context && (context.tenantSlug || context.tenantId || context.companyId || context.actor && (context.actor.tenantSlug || context.actor.tenantId)));
        if (fromContext) return fromContext;
        var data = rawData();
        return normalizeTenantSlug(data.companySettings && (data.companySettings.tenantSlug || data.companySettings.tenantId || data.companySettings.companyId));
    }

    function rowTenant(row) {
        if (!row) return '';
        return normalizeTenantSlug(row.tenantSlug || row.tenant_slug || row.tenantId || row.tenant_id || row.companyId || row.company_id || row.metadata && (row.metadata.tenantSlug || row.metadata.tenantId));
    }

    function actorId(actor) {
        return safeString(actor && (actor.empId || actor.employeeId || actor.userId || actor.id) || '', '').trim();
    }

    function arrayOfIds(value) {
        if (Array.isArray(value)) return value.map(function item(id) { return safeString(id || '', '').trim(); }).filter(Boolean);
        if (typeof value === 'string') return value.split(',').map(function item(id) { return id.trim(); }).filter(Boolean);
        return [];
    }

    function employeeRows(data) {
        return Array.isArray((data || rawData()).employees) ? (data || rawData()).employees : [];
    }

    function employeeById(empId, data) {
        var id = safeString(empId || '', '').trim();
        if (!id) return null;
        return employeeRows(data || rawData()).find(function match(emp) {
            return [emp.id, emp.empId, emp.employeeId, emp.employee_id, emp.userId].map(function item(v) { return safeString(v || '', '').trim(); }).indexOf(id) !== -1;
        }) || null;
    }

    function managerOwnsEmployee(managerId, empId, data) {
        var emp = employeeById(empId, data || rawData());
        return !!(emp && safeString(emp.managerId || emp.reportingManagerId || emp.reporting_manager_id || '', '').trim() === safeString(managerId || '', '').trim());
    }

    function communicationIdOf(row) {
        return safeString(row && (row.communicationId || row.communication_id || row.messageId || row.message_id || row.id) || '', '').trim();
    }

    function announcementIdOf(row) {
        return safeString(row && (row.announcementId || row.announcement_id || row.broadcastId || row.broadcast_id || row.id) || '', '').trim();
    }

    function threadIdOf(row) {
        return safeString(row && (row.threadId || row.thread_id || row.discussionThreadId || row.discussion_thread_id || row.id) || '', '').trim();
    }

    function workspaceIdOf(row) {
        return safeString(row && (row.workspaceId || row.workspace_id || row.roomId || row.room_id || row.id) || '', '').trim();
    }

    function workflowIdOf(row) {
        return safeString(row && (row.workflowId || row.workflow_id || row.eventId || row.event_id || row.correlationId || row.pendingActionId || row.pending_action_id || '') || '', '').trim();
    }

    function deepFreeze(value, seen) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        var refs = seen || [];
        if (refs.indexOf(value) !== -1) return value;
        refs.push(value);
        try {
            Object.keys(value).forEach(function freezeKey(key) { deepFreeze(value[key], refs); });
            Object.freeze(value);
        } catch (error) {}
        return value;
    }

    function safeNumber(value, fallback) {
        var number = Number(value);
        return isFinite(number) ? number : (fallback || 0);
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function sanitizedValue(value, key, seen) {
        if (value === null || typeof value === 'undefined') return value;
        if (typeof value === 'string') return value.replace(SENSITIVE_VALUE_PATTERN, '[redacted]').trim();
        if (typeof value === 'number' || typeof value === 'boolean') return value;
        if (value instanceof Date) return value.toISOString();
        if (Array.isArray(value)) {
            return value.map(function item(row) { return sanitizedValue(row, key, (seen || []).slice()); }).filter(function keep(row) {
                return row !== undefined;
            });
        }
        if (typeof value === 'object') return cloneSanitized(value, seen || []);
        return safeString(value, '');
    }

    function cloneSanitized(input, seen) {
        if (!input || typeof input !== 'object') return sanitizedValue(input, '', seen || []);
        var refs = seen || [];
        if (refs.indexOf(input) !== -1) return '[Circular]';
        refs.push(input);
        if (Array.isArray(input)) {
            return input.map(function item(row) { return cloneSanitized(row, refs.slice()); }).filter(function keep(row) { return row !== undefined; });
        }
        var output = {};
        try {
            Object.keys(input).forEach(function eachKey(key) {
                if (SENSITIVE_KEY_PATTERN.test(key) && !SAFE_GOVERNANCE_KEYS[key]) return;
                var value = sanitizedValue(input[key], key, refs.slice());
                if (typeof value !== 'undefined') output[key] = value;
            });
        } catch (error) {}
        return output;
    }

    function freezeAnalyticsOutput(output) {
        return deepFreeze(cloneSanitized(output || {}));
    }

    function safeFailure(failureCode, classification, description, metadata) {
        var failure = {
            failureCode: normalizeToken(failureCode || 'ANALYTICS_FAILURE'),
            classification: classification || FAILURE_CLASSIFICATIONS.WARNING,
            description: safeString(description || 'Communication analytics failed safely.', '')
        };
        if (metadata && typeof metadata === 'object') failure.metadata = cloneSanitized(metadata);
        return deepFreeze(failure);
    }

    function safeWarning(warningCode, description, metadata) {
        var warning = {
            warningCode: normalizeToken(warningCode || 'ANALYTICS_WARNING'),
            classification: FAILURE_CLASSIFICATIONS.WARNING,
            description: safeString(description || 'Communication analytics warning.', '')
        };
        if (metadata && typeof metadata === 'object') warning.metadata = cloneSanitized(metadata);
        return deepFreeze(warning);
    }

    function highestClassification(values) {
        var order = {};
        order[FAILURE_CLASSIFICATIONS.INFO] = 0;
        order[FAILURE_CLASSIFICATIONS.WARNING] = 1;
        order[FAILURE_CLASSIFICATIONS.HIGH_RISK] = 2;
        order[FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER] = 3;
        return (values || []).reduce(function choose(current, value) {
            var normalized = FAILURE_CLASSIFICATIONS[normalizeToken(value)] || value || FAILURE_CLASSIFICATIONS.INFO;
            return (order[normalized] || 0) > (order[current] || 0) ? normalized : current;
        }, FAILURE_CLASSIFICATIONS.INFO);
    }

    function normalizeAnalyticsState(value) {
        var normalized = normalizeToken(value || ANALYTICS_STATES.COLLECTING);
        if (normalized === 'AGGREGATE' || normalized === 'AGGREGATED') return ANALYTICS_STATES.AGGREGATED;
        if (normalized === 'DEGRADE' || normalized === 'DEGRADED') return ANALYTICS_STATES.DEGRADED;
        if (normalized === 'PROCESS' || normalized === 'PROCESSING') return ANALYTICS_STATES.PROCESSING;
        if (normalized === 'ARCHIVE' || normalized === 'ARCHIVED') return ANALYTICS_STATES.ARCHIVED;
        return ANALYTICS_STATES[normalized] || ANALYTICS_STATES.COLLECTING;
    }

    function communicationRows(data) {
        var source = data || rawData();
        var rows = [];
        if (Array.isArray(source.communications)) rows = rows.concat(source.communications);
        if (Array.isArray(source.hrCirculars)) rows = rows.concat(source.hrCirculars);
        if (Array.isArray(source.policyBroadcasts)) rows = rows.concat(source.policyBroadcasts);
        if (Array.isArray(source.communicationBroadcasts)) rows = rows.concat(source.communicationBroadcasts);
        return rows;
    }

    function announcementRows(data) {
        var source = data || rawData();
        var rows = [];
        if (Array.isArray(source.announcements)) rows = rows.concat(source.announcements);
        if (Array.isArray(source.leadershipAnnouncements)) rows = rows.concat(source.leadershipAnnouncements);
        if (Array.isArray(source.broadcasts)) rows = rows.concat(source.broadcasts);
        return rows;
    }

    function acknowledgementRows(data) {
        var source = data || rawData();
        var rows = [];
        if (Array.isArray(source.policyAcknowledgements)) rows = rows.concat(source.policyAcknowledgements);
        if (Array.isArray(source.communicationAcknowledgements)) rows = rows.concat(source.communicationAcknowledgements);
        if (Array.isArray(source.announcementAcknowledgements)) rows = rows.concat(source.announcementAcknowledgements);
        if (Array.isArray(source.policyCompletions)) rows = rows.concat(source.policyCompletions);
        return rows;
    }

    function threadRows(data) {
        var source = data || rawData();
        var rows = [];
        if (Array.isArray(source.collaborationThreads)) rows = rows.concat(source.collaborationThreads);
        if (Array.isArray(source.workflowDiscussions)) rows = rows.concat(source.workflowDiscussions);
        if (Array.isArray(source.workflowDiscussionThreads)) rows = rows.concat(source.workflowDiscussionThreads);
        if (Array.isArray(source.discussionThreads)) rows = rows.concat(source.discussionThreads);
        if (Array.isArray(source.workspaceThreads)) rows = rows.concat(source.workspaceThreads);
        if (Array.isArray(source.teamWorkspaceThreads)) rows = rows.concat(source.teamWorkspaceThreads);
        return rows;
    }

    function replyRows(data) {
        var source = data || rawData();
        var rows = [];
        if (Array.isArray(source.threadReplies)) rows = rows.concat(source.threadReplies);
        if (Array.isArray(source.workflowThreadReplies)) rows = rows.concat(source.workflowThreadReplies);
        if (Array.isArray(source.workspaceThreadReplies)) rows = rows.concat(source.workspaceThreadReplies);
        if (Array.isArray(source.discussionReplies)) rows = rows.concat(source.discussionReplies);
        return rows;
    }

    function workspaceRows(data) {
        var source = data || rawData();
        var rows = [];
        if (Array.isArray(source.teamWorkspaces)) rows = rows.concat(source.teamWorkspaces);
        if (Array.isArray(source.collaborationWorkspaces)) rows = rows.concat(source.collaborationWorkspaces);
        if (Array.isArray(source.operationalWorkspaces)) rows = rows.concat(source.operationalWorkspaces);
        if (Array.isArray(source.workspaces)) rows = rows.concat(source.workspaces);
        return rows;
    }

    function escalationRows(data) {
        var source = data || rawData();
        var rows = [];
        if (Array.isArray(source.escalations)) rows = rows.concat(source.escalations);
        if (Array.isArray(source.workflowEscalations)) rows = rows.concat(source.workflowEscalations);
        if (Array.isArray(source.escalationEvents)) rows = rows.concat(source.escalationEvents);
        return rows;
    }

    function notificationRows(data) {
        var source = data || rawData();
        var rows = [];
        if (Array.isArray(source.notifications)) rows = rows.concat(source.notifications);
        if (Array.isArray(source.inAppNotifications)) rows = rows.concat(source.inAppNotifications);
        if (Array.isArray(source.communicationNotifications)) rows = rows.concat(source.communicationNotifications);
        return rows;
    }

    function asyncRows(data) {
        var source = data || rawData();
        var rows = [];
        if (Array.isArray(source.asyncJobs)) rows = rows.concat(source.asyncJobs);
        if (Array.isArray(source.jobQueue)) rows = rows.concat(source.jobQueue);
        return rows;
    }

    function sourceTenant(row, data) {
        var direct = rowTenant(row);
        if (direct) return direct;
        var source = data || rawData();
        var communicationId = communicationIdOf(row);
        if (communicationId) {
            var linkedCommunication = communicationRows(source).find(function find(rowItem) { return communicationIdOf(rowItem) === communicationId; });
            if (linkedCommunication) return rowTenant(linkedCommunication);
        }
        var announcementId = announcementIdOf(row);
        if (announcementId) {
            var linkedAnnouncement = announcementRows(source).find(function find(rowItem) { return announcementIdOf(rowItem) === announcementId; });
            if (linkedAnnouncement) return rowTenant(linkedAnnouncement);
        }
        var workspaceId = workspaceIdOf(row);
        if (workspaceId) {
            var linkedWorkspace = workspaceRows(source).find(function find(rowItem) { return workspaceIdOf(rowItem) === workspaceId; });
            if (linkedWorkspace) return rowTenant(linkedWorkspace);
        }
        var threadId = threadIdOf(row);
        if (threadId) {
            var linkedThread = threadRows(source).find(function find(rowItem) { return threadIdOf(rowItem) === threadId; });
            if (linkedThread) return rowTenant(linkedThread);
        }
        return '';
    }

    function tenantFilter(tenant, data) {
        return function matchesTenant(row) {
            var tenantValue = sourceTenant(row, data || rawData());
            return !tenant || !tenantValue || tenantValue === tenant;
        };
    }

    function isPastDate(value, context) {
        if (!value) return false;
        var time = new Date(value).getTime();
        if (!isFinite(time)) return false;
        var now = context && context.now ? new Date(context.now).getTime() : Date.now();
        return time < now;
    }

    function olderThanDays(value, days, context) {
        if (!value) return false;
        var time = new Date(value).getTime();
        if (!isFinite(time)) return false;
        var now = context && context.now ? new Date(context.now).getTime() : Date.now();
        return now - time > days * 24 * 60 * 60 * 1000;
    }

    function terminalState(row) {
        return /RESOLVED|CLOSED|ARCHIVED|COMPLETED|REJECTED|CANCELLED/i.test([row && row.state, row && row.status].join(' '));
    }

    function isAcknowledged(row) {
        return /ACKNOWLEDGED|COMPLETED|ACCEPTED|VIEWED/i.test([row && row.status, row && row.state].join(' ')) || !!(row && (row.acknowledgedAt || row.completedAt));
    }

    function isLeadershipAnnouncement(row) {
        return /LEADERSHIP|EXECUTIVE|STRATEGIC|CEO|DIRECTOR/i.test([row && row.type, row && row.category, row && row.module].join(' '));
    }

    function countIds(row, keys) {
        return (keys || []).reduce(function count(total, key) {
            return total + arrayOfIds(row && row[key]).length;
        }, 0);
    }

    function rowAudience(row) {
        var explicit = countIds(row, ['recipientIds', 'assignedEmployeeIds', 'targetEmployeeIds', 'audienceIds', 'memberIds']);
        if (explicit) return explicit;
        var audience = safeNumber(row && (row.audienceSize || row.totalAudience || row.targetCount), 0);
        return Math.max(0, audience);
    }

    function classifyCommunicationHealthRisk(input) {
        var payload = input || {};
        if (payload.crossTenant || payload.crossTenantAnalytics || payload.crossTenantVisibility) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
        if (payload.publicExposure || payload.unsafeEngagementExposure || payload.privateExposure || payload.privateAnalyticsExposure) return FAILURE_CLASSIFICATIONS.HIGH_RISK;
        if (payload.unreadSpike || payload.acknowledgementLag || payload.escalationOverload || payload.communicationCongestion || payload.inactiveWorkspaceBuildup) return FAILURE_CLASSIFICATIONS.WARNING;
        return FAILURE_CLASSIFICATIONS.INFO;
    }

    function visibilityFor(role, record, context, data) {
        var normalized = normalizeRole(role);
        var source = data || rawData();
        var subjects = arrayOfIds(record && (record.subjectEmpIds || record.employeeIds || record.targetEmployeeIds));
        var subjectSingle = safeString(record && (record.subjectEmpId || record.empId || record.employeeId || record.targetEmpId) || '', '').trim();
        if (subjectSingle) subjects.push(subjectSingle);
        var uniqueSubjects = subjects.filter(function unique(id, index, all) { return id && all.indexOf(id) === index; });
        var actor = context && context.actor || {};
        var currentActorId = actorId(actor);
        if (normalized === 'EMPLOYEE') {
            return uniqueSubjects.length <= 1 && (!uniqueSubjects.length || uniqueSubjects[0] === currentActorId) ? VISIBILITY.OWN_ENGAGEMENT_ONLY : VISIBILITY.NONE;
        }
        if (normalized === 'MANAGER') {
            var allOwned = uniqueSubjects.length ? uniqueSubjects.every(function owned(id) { return managerOwnsEmployee(currentActorId, id, source); }) : true;
            return allOwned ? VISIBILITY.TEAM_ENGAGEMENT_SUMMARIES : VISIBILITY.NONE;
        }
        if (normalized === 'HR') return VISIBILITY.HR_OPERATIONAL_COMMUNICATION_ANALYTICS;
        if (normalized === 'HR_HEAD') return VISIBILITY.STRATEGIC_COMMUNICATION_INTELLIGENCE;
        if (normalized === 'DIRECTOR') return VISIBILITY.ORGANIZATION_WIDE_COMMUNICATION_ANALYTICS;
        if (normalized === 'SUPER_ADMIN') return VISIBILITY.INFRASTRUCTURE_METRICS_ONLY;
        if (normalized === 'PLATFORM_OWNER') return VISIBILITY.PLATFORM_GOVERNANCE_ONLY;
        return VISIBILITY.NONE;
    }

    function recordIsTargetSpecific(record) {
        if (!record || typeof record !== 'object') return false;
        return !!(
            record.subjectEmpId ||
            record.empId ||
            record.employeeId ||
            arrayOfIds(record.subjectEmpIds).length ||
            arrayOfIds(record.employeeIds).length ||
            arrayOfIds(record.targetEmployeeIds).length ||
            record.communicationId ||
            record.announcementId ||
            record.threadId ||
            record.workspaceId ||
            record.privateAnalytics ||
            record.privateThread ||
            record.privateWorkspace
        );
    }

    function validateAnalyticsScope(record, context) {
        try {
            var data = rawData();
            var ctxTenant = contextTenant(context);
            var targetTenant = normalizeTenantSlug(record && (record.tenantSlug || record.tenantId || record.companyId)) || sourceTenant(record, data) || ctxTenant;
            var actor = context && context.actor || {};
            var role = normalizeRole(actor.role || context && context.role || '');
            var failures = [];
            var targetSpecific = recordIsTargetSpecific(record);
            var visibility = visibilityFor(role, record || {}, context || {}, data);

            if (ctxTenant && targetTenant && ctxTenant !== targetTenant) {
                failures.push(safeFailure('CROSS_TENANT_COMMUNICATION_ANALYTICS_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Cross-tenant communication analytics visibility was blocked.'));
            }
            if (role === 'PLATFORM_OWNER' && targetSpecific) {
                failures.push(safeFailure('PLATFORM_OWNER_ANALYTICS_ACCESS_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Platform owner is isolated from tenant engagement metrics.'));
            }
            if (role === 'SUPER_ADMIN' && targetSpecific) {
                failures.push(safeFailure('SUPER_ADMIN_EMPLOYEE_ANALYTICS_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Super admin access is limited to infrastructure analytics.'));
            }
            if (role === 'EMPLOYEE' && visibility !== VISIBILITY.OWN_ENGAGEMENT_ONLY) {
                failures.push(safeFailure('EMPLOYEE_ANALYTICS_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Employee analytics visibility is limited to own engagement.'));
            }
            if (role === 'MANAGER' && visibility !== VISIBILITY.TEAM_ENGAGEMENT_SUMMARIES) {
                failures.push(safeFailure('MANAGER_ANALYTICS_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Manager analytics visibility is limited to team summaries.'));
            }

            var classification = highestClassification(failures.map(function item(row) { return row.classification; }));
            return freezeAnalyticsOutput({
                allowed: !failures.length,
                success: !failures.length,
                classification: classification,
                visibility: visibility,
                failures: failures,
                metadata: {
                    tenantIsolationPreserved: !failures.some(function cross(row) { return row.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER; }),
                    communicationAnalyticsConfidentialityPreserved: true,
                    safelyRedacted: true
                }
            });
        } catch (error) {
            return freezeAnalyticsOutput({
                allowed: false,
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                visibility: VISIBILITY.NONE,
                failures: [safeFailure('ANALYTICS_SCOPE_VALIDATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Analytics scope validation failed safely.')]
            });
        }
    }

    function normalizeAnalyticsPayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeAnalyticsOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    state: ANALYTICS_STATES.COLLECTING,
                    failures: [safeFailure('MALFORMED_ANALYTICS_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Analytics payload is malformed.')]
                });
            }
            var tenant = normalizeTenantSlug(payload.tenantSlug || payload.tenantId || payload.companyId) || contextTenant(context);
            var normalized = {
                tenantSlug: tenant,
                analyticsId: safeString(payload.analyticsId || payload.snapshotId || payload.id || '', '').trim(),
                state: normalizeAnalyticsState(payload.state || payload.status || ANALYTICS_STATES.COLLECTING),
                readOnly: payload.readOnly !== false,
                targetScope: safeString(payload.targetScope || payload.scope || (recordIsTargetSpecific(payload) ? 'SCOPED' : 'AGGREGATE'), 'AGGREGATE').trim().toUpperCase() || 'AGGREGATE',
                dataVersion: safeString(payload.dataVersion || VERSION, VERSION),
                metadata: {
                    communicationAnalyticsConfidentialityPreserved: true,
                    tenantIsolationPreserved: true,
                    historicalAnalyticsImmutable: true,
                    readOnlyAnalytics: true
                }
            };
            return freezeAnalyticsOutput({
                success: true,
                classification: FAILURE_CLASSIFICATIONS.INFO,
                payload: normalized
            });
        } catch (error) {
            return freezeAnalyticsOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                state: ANALYTICS_STATES.DEGRADED,
                failures: [safeFailure('ANALYTICS_NORMALIZATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Analytics payload normalization failed safely.')]
            });
        }
    }

    function detectCommunicationDegradation(filters, context) {
        try {
            var data = rawData();
            var tenant = normalizeTenantSlug(filters && (filters.tenantSlug || filters.tenantId || filters.companyId)) || contextTenant(context);
            var communications = communicationRows(data).filter(tenantFilter(tenant, data));
            var announcements = announcementRows(data).filter(tenantFilter(tenant, data));
            var acknowledgements = acknowledgementRows(data).filter(tenantFilter(tenant, data));
            var notifications = notificationRows(data).filter(tenantFilter(tenant, data)).filter(function communicationNotification(row) {
                return /communicat|announcement|policy|workspace|thread|mention|escalation|leadership/i.test([row.module, row.category, row.type].join(' '));
            });
            var threads = threadRows(data).filter(tenantFilter(tenant, data));
            var replies = replyRows(data).filter(tenantFilter(tenant, data));
            var workspaces = workspaceRows(data).filter(tenantFilter(tenant, data));
            var escalations = escalationRows(data).filter(tenantFilter(tenant, data));
            var asyncJobs = asyncRows(data).filter(tenantFilter(tenant, data)).filter(function analyticsJob(row) {
                return /COMMUNICATION|ANNOUNCEMENT|POLICY|WORKSPACE|THREAD|ESCALATION/.test(normalizeToken(row.jobType || row.type || row.category));
            });

            var unreadFromNotifications = notifications.filter(function unread(row) {
                return row.read !== true && !/READ|SEEN|ACKNOWLEDGED|DELIVERED_READ/i.test([row.status, row.state].join(' '));
            }).length;
            var unreadFromAnnouncements = announcements.reduce(function total(sum, row) {
                var audience = rowAudience(row);
                var viewed = countIds(row, ['viewedUserIds', 'readUserIds', 'seenUserIds']);
                return sum + Math.max(0, audience - viewed);
            }, 0);
            var unreadFromCommunications = communications.reduce(function total(sum, row) {
                var audience = rowAudience(row);
                var viewed = countIds(row, ['viewedUserIds', 'readUserIds', 'seenUserIds']);
                return sum + Math.max(0, audience - viewed);
            }, 0);
            var unreadCommunications = unreadFromNotifications + unreadFromAnnouncements + unreadFromCommunications;

            var acknowledgementLag = acknowledgements.filter(function lag(row) {
                return !isAcknowledged(row) && (isPastDate(row.dueAt || row.deadline || row.expiresAt, context) || /PENDING|OVERDUE|ACK_PENDING/i.test([row.status, row.state].join(' ')));
            }).length + communications.concat(announcements).filter(function missingAck(row) {
                if (!row || row.requiresAck !== true) return false;
                var audience = rowAudience(row);
                if (!audience) return false;
                var acknowledged = countIds(row, ['acknowledgedUserIds', 'acceptedUserIds']);
                return acknowledged < audience;
            }).length;

            var delayedResponses = threads.filter(function delayed(row) {
                return row.delayedResponse === true || (!terminalState(row) && olderThanDays(row.lastActivityAt || row.updatedAt || row.createdAt, 2, context));
            }).length;

            var inactiveWorkspaces = workspaces.filter(function inactive(row) {
                return !terminalState(row) && olderThanDays(row.lastActivityAt || row.updatedAt || row.createdAt, 3, context);
            }).length;

            var escalationCommunicationDensity = communications.filter(function escalation(row) {
                return /ESCALATION/i.test([row.type, row.category, row.module, row.state, row.status].join(' ')) || !!row.escalationId;
            }).length + threads.filter(function escalation(row) {
                return /ESCALATION/i.test([row.type, row.category, row.module, row.state, row.status].join(' ')) || !!row.escalationId;
            }).length + escalations.filter(function linked(row) {
                return !!(communicationIdOf(row) || threadIdOf(row) || workspaceIdOf(row) || workflowIdOf(row));
            }).length;

            var failedJobs = asyncJobs.filter(function failed(row) { return /FAILED|ERROR|DEAD_LETTER/.test(normalizeToken(row.state || row.status)); }).length;
            var retryPending = asyncJobs.filter(function retry(row) { return /RETRY_PENDING|RETRY/.test(normalizeToken(row.state || row.status)); }).length;
            var collaborationParticipation = threads.length + replies.length;
            var communicationCongestion = unreadCommunications + acknowledgementLag + delayedResponses + inactiveWorkspaces + retryPending + failedJobs;
            var classification = classifyCommunicationHealthRisk({
                unreadSpike: unreadCommunications > 0,
                acknowledgementLag: acknowledgementLag > 0,
                escalationOverload: escalationCommunicationDensity > 5,
                communicationCongestion: communicationCongestion > 3,
                inactiveWorkspaceBuildup: inactiveWorkspaces > 0
            });
            var healthSignals = [];
            if (unreadCommunications) healthSignals.push({ signal: 'Unread buildup', count: unreadCommunications, classification: FAILURE_CLASSIFICATIONS.WARNING });
            if (acknowledgementLag) healthSignals.push({ signal: 'Acknowledgement lag', count: acknowledgementLag, classification: FAILURE_CLASSIFICATIONS.WARNING });
            if (delayedResponses) healthSignals.push({ signal: 'Delayed responses', count: delayedResponses, classification: FAILURE_CLASSIFICATIONS.WARNING });
            if (escalationCommunicationDensity) healthSignals.push({ signal: 'Escalation communication density', count: escalationCommunicationDensity, classification: escalationCommunicationDensity > 5 ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.WARNING });
            if (failedJobs) healthSignals.push({ signal: 'Analytics job failures', count: failedJobs, classification: FAILURE_CLASSIFICATIONS.WARNING });

            return freezeAnalyticsOutput({
                success: true,
                classification: classification,
                summary: {
                    totalCommunications: communications.length,
                    totalAnnouncements: announcements.length,
                    unreadCommunications: unreadCommunications,
                    acknowledgementLag: acknowledgementLag,
                    delayedResponses: delayedResponses,
                    inactiveWorkspaces: inactiveWorkspaces,
                    escalationCommunicationDensity: escalationCommunicationDensity,
                    collaborationParticipation: collaborationParticipation,
                    communicationCongestion: communicationCongestion,
                    retryPending: retryPending,
                    failedJobs: failedJobs
                },
                healthSignals: healthSignals,
                metadata: {
                    tenantIsolationPreserved: true,
                    communicationAnalyticsConfidentialityPreserved: true,
                    readOnlyAnalytics: true
                }
            });
        } catch (error) {
            return freezeAnalyticsOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                summary: { unreadCommunications: 0, acknowledgementLag: 0, escalationCommunicationDensity: 0 },
                healthSignals: [],
                failures: [safeFailure('COMMUNICATION_DEGRADATION_DETECTION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Communication degradation detection failed safely.')]
            });
        }
    }

    function calculateEngagementScore(input) {
        try {
            var payload = input || {};
            var audience = Math.max(1, safeNumber(payload.totalAudience || payload.audience || payload.recipients, 0));
            var views = Math.max(0, safeNumber(payload.views, 0));
            var acknowledgements = Math.max(0, safeNumber(payload.acknowledgements || payload.acks, 0));
            var unread = Math.max(0, safeNumber(payload.unread, 0));
            var delayedResponses = Math.max(0, safeNumber(payload.delayedResponses || payload.delayed, 0));
            var viewRate = clamp(views / audience, 0, 1);
            var acknowledgementRate = clamp(acknowledgements / audience, 0, 1);
            var unreadPenalty = clamp(unread / Math.max(audience, unread || 1), 0, 1) * 25;
            var delayedPenalty = clamp(delayedResponses / Math.max(audience, delayedResponses || 1), 0, 1) * 15;
            var score = clamp(Math.round((viewRate * 40) + (acknowledgementRate * 45) + 15 - unreadPenalty - delayedPenalty), 0, 100);
            var band = score >= 80 ? 'STRONG' : score >= 60 ? 'STABLE' : score >= 40 ? 'DEGRADED' : 'AT_RISK';
            return freezeAnalyticsOutput({
                success: true,
                score: score,
                band: band,
                classification: score < 40 ? FAILURE_CLASSIFICATIONS.HIGH_RISK : score < 60 ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO,
                components: {
                    views: views,
                    acknowledgements: acknowledgements,
                    unread: unread,
                    delayedResponses: delayedResponses,
                    totalAudience: audience,
                    viewRate: Math.round(viewRate * 100),
                    acknowledgementRate: Math.round(acknowledgementRate * 100),
                    unreadPenalty: Math.round(unreadPenalty),
                    delayedPenalty: Math.round(delayedPenalty)
                }
            });
        } catch (error) {
            return freezeAnalyticsOutput({
                success: false,
                score: 0,
                band: 'DEGRADED',
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('ENGAGEMENT_SCORE_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Engagement scoring failed safely.')]
            });
        }
    }

    function auditAnalytics(actionType, metadata, context) {
        if (auditForwarding || context && context.skipAuditPersistence) return { success: true, skipped: true };
        auditForwarding = true;
        try {
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    actionType: actionType,
                    eventType: actionType,
                    module: 'Communication Analytics',
                    targetId: metadata && metadata.targetId || '',
                    description: metadata && metadata.description || actionType,
                    actorRole: context && context.actor && context.actor.role || 'hr',
                    actorId: context && context.actor && (context.actor.id || context.actor.empId) || '',
                    severity: metadata && metadata.severity || 'INFO',
                    metadata: cloneSanitized(metadata || {})
                }, {
                    source: 'communicationAnalyticsService',
                    skipPersistence: false
                });
            }
            var source = db();
            if (source && typeof source.writeAuditLog === 'function') {
                source.writeAuditLog(context && context.actor && context.actor.role || 'hr', context && context.actor && context.actor.id || '', actionType, 'Communication Analytics', '', metadata && metadata.description || actionType);
            }
            return { success: true };
        } catch (error) {
            return { success: false, warning: 'Communication analytics audit failed safely.' };
        } finally {
            auditForwarding = false;
        }
    }

    function emitTelemetry(eventType, metadata, context) {
        if (telemetryForwarding || context && context.skipTelemetry) return { success: true, skipped: true };
        telemetryForwarding = true;
        try {
            var service = global.WorkflowTelemetryService || global.workflowTelemetryService;
            if (service && typeof service.emitTelemetry === 'function') {
                service.emitTelemetry('GOVERNANCE', eventType, {
                    source: 'communicationAnalyticsService',
                    severity: metadata && metadata.severity || 'INFO',
                    status: metadata && metadata.status || eventType,
                    tenantSlug: contextTenant(context) || metadata && metadata.tenantSlug || '',
                    metadata: cloneSanitized(metadata || {})
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Communication analytics telemetry failed safely.' };
        } finally {
            telemetryForwarding = false;
        }
        return { success: false, warning: 'WorkflowTelemetryService unavailable.' };
    }

    function recordMetric(metricType, metadata, context) {
        if (metricForwarding || context && context.skipMetrics) return { success: true, skipped: true };
        metricForwarding = true;
        try {
            var service = global.OrchestrationMetricsService || global.orchestrationMetricsService;
            if (service && typeof service.recordWorkflowMetric === 'function') {
                service.recordWorkflowMetric(metricType, {
                    tenantSlug: contextTenant(context) || metadata && metadata.tenantSlug || '',
                    source: 'communicationAnalyticsService',
                    status: metadata && metadata.status || metricType,
                    severity: metadata && metadata.severity || 'INFO'
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Communication analytics metric failed safely.' };
        } finally {
            metricForwarding = false;
        }
        return { success: false, warning: 'OrchestrationMetricsService unavailable.' };
    }

    function safeServiceReport(serviceName, methodName, filters, context) {
        try {
            var service = global[serviceName];
            if (!service || typeof service[methodName] !== 'function') return null;
            return service[methodName](filters || {}, Object.assign({}, context || {}, {
                skipAuditPersistence: true,
                skipTelemetry: true,
                skipMetrics: true
            }));
        } catch (error) {
            return null;
        }
    }

    function generateCommunicationAnalyticsReport(filters, context) {
        try {
            var data = rawData();
            var tenant = normalizeTenantSlug(filters && (filters.tenantSlug || filters.tenantId || filters.companyId)) || contextTenant(context);
            var scope = validateAnalyticsScope({ tenantSlug: tenant, readOnly: true }, context || {});
            if (!scope.allowed && scope.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER) {
                return freezeAnalyticsOutput({
                    success: false,
                    readOnly: true,
                    classification: scope.classification,
                    failures: scope.failures,
                    communicationHealth: { unreadCommunications: 0 },
                    metadata: {
                        tenantIsolationPreserved: false,
                        communicationAnalyticsConfidentialityPreserved: true,
                        historicalAnalyticsImmutable: true
                    }
                });
            }

            var communications = communicationRows(data).filter(tenantFilter(tenant, data));
            var announcements = announcementRows(data).filter(tenantFilter(tenant, data));
            var acknowledgements = acknowledgementRows(data).filter(tenantFilter(tenant, data));
            var threads = threadRows(data).filter(tenantFilter(tenant, data));
            var replies = replyRows(data).filter(tenantFilter(tenant, data));
            var workspaces = workspaceRows(data).filter(tenantFilter(tenant, data));
            var escalations = escalationRows(data).filter(tenantFilter(tenant, data));
            var notifications = notificationRows(data).filter(tenantFilter(tenant, data));
            var degradation = detectCommunicationDegradation({ tenantSlug: tenant }, {
                tenantSlug: tenant,
                now: context && context.now,
                skipAuditPersistence: true,
                skipTelemetry: true,
                skipMetrics: true
            });
            var summary = degradation.summary || {};

            var announcementViews = announcements.reduce(function total(sum, row) {
                return sum + countIds(row, ['viewedUserIds', 'readUserIds', 'seenUserIds']);
            }, 0) + communications.reduce(function total(sum, row) {
                return sum + countIds(row, ['viewedUserIds', 'readUserIds', 'seenUserIds']);
            }, 0) + notifications.filter(function read(row) { return row.read === true || /READ|SEEN/i.test([row.status, row.state].join(' ')); }).length;
            var announcementAcknowledgements = announcements.reduce(function total(sum, row) {
                return sum + countIds(row, ['acknowledgedUserIds', 'acceptedUserIds']);
            }, 0) + communications.reduce(function total(sum, row) {
                return sum + countIds(row, ['acknowledgedUserIds', 'acceptedUserIds']);
            }, 0);
            var acknowledgedRows = acknowledgements.filter(isAcknowledged).length;
            var totalAcknowledgements = announcementAcknowledgements + acknowledgedRows;
            var totalAudience = communications.concat(announcements).reduce(function total(sum, row) {
                return sum + rowAudience(row);
            }, 0);
            if (!totalAudience) {
                totalAudience = employeeRows(data).filter(function tenantEmployee(row) {
                    var employeeTenant = rowTenant(row);
                    return (!tenant || employeeTenant === tenant) && normalizeRole(row.role) !== 'PLATFORM_OWNER';
                }).length || 1;
            }
            var score = calculateEngagementScore({
                views: announcementViews,
                acknowledgements: totalAcknowledgements,
                unread: summary.unreadCommunications || 0,
                delayedResponses: summary.delayedResponses || 0,
                totalAudience: totalAudience
            });

            var workspaceReport = safeServiceReport('TeamWorkspaceService', 'generateTeamWorkspaceReport', { tenantSlug: tenant }, context);
            var discussionReport = safeServiceReport('WorkflowDiscussionService', 'generateWorkflowDiscussionReport', { tenantSlug: tenant }, context);
            var announcementReport = safeServiceReport('AnnouncementHubService', 'generateAnnouncementHubReport', { tenantSlug: tenant }, context);
            var escalationReport = safeServiceReport('EscalationCommandService', 'generateEscalationCommandReport', { tenantSlug: tenant }, context);
            var communicationReport = safeServiceReport('CommunicationGovernanceService', 'generateCommunicationGovernanceReport', { tenantSlug: tenant }, context);

            var unresolvedOperationalThreads = threads.filter(function unresolved(row) { return !terminalState(row); }).length;
            var delayedReplies = threads.filter(function delayed(row) {
                return row.delayedResponse === true || (!terminalState(row) && olderThanDays(row.lastActivityAt || row.updatedAt || row.createdAt, 2, context));
            }).length;
            var escalationHeavyWorkspaces = workspaces.filter(function escalation(row) {
                return !!row.escalationId || /ESCALATION/i.test([row.type, row.category, row.state, row.status].join(' '));
            }).length;
            var pendingAcks = acknowledgements.filter(function pending(row) { return !isAcknowledged(row); }).length;
            var overdueAcks = acknowledgements.filter(function overdue(row) {
                return !isAcknowledged(row) && (isPastDate(row.dueAt || row.deadline || row.expiresAt, context) || /OVERDUE/i.test([row.status, row.state].join(' ')));
            }).length;
            var leadershipAnnouncements = announcements.filter(isLeadershipAnnouncement);
            var leadershipAudience = leadershipAnnouncements.reduce(function total(sum, row) { return sum + rowAudience(row); }, 0);
            var leadershipViews = leadershipAnnouncements.reduce(function total(sum, row) { return sum + countIds(row, ['viewedUserIds', 'readUserIds', 'seenUserIds']); }, 0);
            var leadershipAcks = leadershipAnnouncements.reduce(function total(sum, row) { return sum + countIds(row, ['acknowledgedUserIds', 'acceptedUserIds']); }, 0);
            var leadershipReach = leadershipAudience ? Math.round((leadershipViews / leadershipAudience) * 100) : 0;
            var completionPercent = totalAudience ? Math.round((totalAcknowledgements / Math.max(totalAudience, 1)) * 100) : 0;

            var classifications = [
                degradation.classification,
                score.classification,
                workspaceReport && workspaceReport.classification,
                discussionReport && discussionReport.classification,
                announcementReport && announcementReport.classification,
                escalationReport && (escalationReport.classification || escalationReport.severity),
                communicationReport && communicationReport.classification
            ];
            var classification = highestClassification(classifications);

            var report = {
                success: true,
                readOnly: true,
                classification: classification,
                analyticsState: classification === FAILURE_CLASSIFICATIONS.INFO ? ANALYTICS_STATES.AGGREGATED : ANALYTICS_STATES.DEGRADED,
                generatedAt: nowIso(context),
                tenantSlug: tenant,
                communicationHealth: {
                    totalCommunications: communications.length,
                    totalAnnouncements: announcements.length,
                    unreadCommunications: summary.unreadCommunications || 0,
                    acknowledgementLag: summary.acknowledgementLag || 0,
                    delayedResponses: summary.delayedResponses || 0,
                    inactiveWorkspaces: summary.inactiveWorkspaces || 0,
                    communicationCongestion: summary.communicationCongestion || 0
                },
                engagementIntelligence: {
                    announcementViews: announcementViews,
                    acknowledgementCompletion: completionPercent,
                    collaborationParticipation: summary.collaborationParticipation || (threads.length + replies.length),
                    responseTimeTrends: summary.delayedResponses || 0,
                    engagementScore: score.score || 0,
                    engagementBand: score.band || 'DEGRADED'
                },
                workspaceAnalytics: {
                    activeThreads: threads.filter(function active(row) { return !terminalState(row); }).length,
                    unresolvedOperationalThreads: workspaceReport && workspaceReport.workspaceAnalytics ? Math.max(workspaceReport.workspaceAnalytics.unresolvedOperationalThreads || 0, unresolvedOperationalThreads) : unresolvedOperationalThreads,
                    collaborationBottlenecks: summary.communicationCongestion || 0,
                    delayedReplies: delayedReplies,
                    escalationHeavyWorkspaces: escalationHeavyWorkspaces,
                    inactiveWorkspaces: summary.inactiveWorkspaces || 0,
                    workspaceActivityAnalytics: threads.length + replies.length + workspaces.length
                },
                escalationCommunication: {
                    escalationCommunicationDensity: summary.escalationCommunicationDensity || 0,
                    escalationCommunicationSpikes: (summary.escalationCommunicationDensity || 0) > 3 ? summary.escalationCommunicationDensity : 0,
                    operationalBottlenecks: escalationReport && escalationReport.summary ? (escalationReport.summary.reviewerCongestion || escalationReport.summary.contributorBlockage || 0) : escalationHeavyWorkspaces,
                    delayedEscalationResponses: threads.filter(function delayed(row) { return !!row.escalationId && (row.delayedResponse === true || olderThanDays(row.lastActivityAt || row.createdAt, 2, context)); }).length,
                    acknowledgementDelays: summary.acknowledgementLag || 0,
                    escalationCongestionPatterns: escalations.length + escalationHeavyWorkspaces
                },
                leadershipAnalytics: {
                    leadershipAnnouncementReach: leadershipReach,
                    leadershipReach: leadershipReach,
                    engagementCompletion: leadershipAudience ? Math.round((leadershipAcks / leadershipAudience) * 100) : 0,
                    audienceInteractionTrends: leadershipViews + leadershipAcks,
                    acknowledgementLag: leadershipAudience ? Math.max(0, leadershipAudience - leadershipAcks) : 0,
                    departmentEngagementVariance: announcements.filter(function departmental(row) { return row.department && row.department !== 'ALL'; }).length,
                    communicationEffectivenessScore: score.score || 0
                },
                policyAcknowledgementAnalytics: {
                    completionPercent: completionPercent,
                    pendingAcknowledgements: pendingAcks,
                    overdueAcknowledgements: overdueAcks
                },
                unreadCommunicationTracking: {
                    unreadCommunications: summary.unreadCommunications || 0,
                    unreadBuildupAlerts: (summary.unreadCommunications || 0) ? 1 : 0,
                    unreadRate: totalAudience ? Math.round(((summary.unreadCommunications || 0) / Math.max(totalAudience, 1)) * 100) : 0
                },
                accessGovernance: {
                    employeeOwnEngagementOnly: true,
                    managerTeamEngagementSummaries: true,
                    hrOperationalAnalytics: true,
                    directorOrganizationAnalytics: true,
                    superAdminEmployeeContentAccess: false,
                    platformOwnerEngagementMetrics: false,
                    privateAnalyticsRoleScoped: true
                },
                integrationHealth: {
                    teamWorkspaceIntegrated: !!global.TeamWorkspaceService,
                    workflowDiscussionIntegrated: !!global.WorkflowDiscussionService,
                    announcementHubIntegrated: !!global.AnnouncementHubService,
                    communicationGovernanceIntegrated: !!global.CommunicationGovernanceService,
                    escalationCommandIntegrated: !!global.EscalationCommandService,
                    notificationOrchestrationIntegrated: !!global.NotificationOrchestrationService,
                    auditReady: !!(global.AuditService || global.auditService),
                    telemetryReady: !!(global.WorkflowTelemetryService || global.workflowTelemetryService),
                    metricsReady: !!(global.OrchestrationMetricsService || global.orchestrationMetricsService)
                },
                warnings: degradation.healthSignals || [],
                metadata: {
                    tenantIsolationPreserved: true,
                    communicationAnalyticsConfidentialityPreserved: true,
                    historicalAnalyticsImmutable: true,
                    historicalCommunicationsImmutable: true,
                    existingCommunicationFlowsPreserved: true,
                    existingWorkflowsPreserved: true,
                    communicationAnalyticsActionsAuditable: true,
                    readOnlyAnalytics: true
                }
            };

            auditAnalytics('COMMUNICATION_ANALYTICS_REPORTED', {
                tenantSlug: tenant,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO',
                description: 'Communication analytics engagement intelligence viewed.'
            }, context);
            emitTelemetry('COMMUNICATION_ANALYTICS_REPORTED', {
                tenantSlug: tenant,
                status: classification,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'INFO',
                engagementScore: score.score || 0
            }, context);
            recordMetric('COMMUNICATION_ANALYTICS_REPORTED', {
                tenantSlug: tenant,
                status: classification,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'INFO'
            }, context);

            return freezeAnalyticsOutput(report);
        } catch (error) {
            safeWarn('Communication analytics report failed safely.', error && error.message ? error.message : error);
            return freezeAnalyticsOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                analyticsState: ANALYTICS_STATES.DEGRADED,
                communicationHealth: { unreadCommunications: 0 },
                engagementIntelligence: { engagementScore: 0 },
                workspaceAnalytics: { unresolvedOperationalThreads: 0 },
                escalationCommunication: { escalationCommunicationDensity: 0 },
                leadershipAnalytics: { leadershipReach: 0 },
                failures: [safeFailure('COMMUNICATION_ANALYTICS_REPORT_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Communication analytics report failed safely.')]
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        function check(label, condition) { checks.push({ label: label, passed: !!condition }); }
        try {
            var malformed = normalizeAnalyticsPayload(null, { tenantSlug: 'tabsons' });
            check('malformed payloads fail safely', malformed.success === false && malformed.failures.some(function item(row) { return row.failureCode === 'MALFORMED_ANALYTICS_PAYLOAD'; }));

            var crossTenant = validateAnalyticsScope({ tenantSlug: 'abc', subjectEmpIds: ['EMP-X'], privateAnalytics: true }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' } });
            check('tenant analytics isolation works', crossTenant.allowed === false && crossTenant.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER);

            var score = calculateEngagementScore({ views: 3, acknowledgements: 2, unread: 1, delayedResponses: 1, totalAudience: 4 });
            check('engagement calculations work', score.success === true && score.score >= 0 && score.score <= 100);

            var degradation = detectCommunicationDegradation({ tenantSlug: contextTenant({ tenantSlug: 'tabsons' }) || 'tabsons' }, { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('communication congestion detection works', degradation.success === true && Object.isFrozen(degradation.healthSignals));

            var escalationRisk = classifyCommunicationHealthRisk({ unreadSpike: true, escalationOverload: true });
            check('escalation analytics classify safely', escalationRisk === FAILURE_CLASSIFICATIONS.WARNING);

            var frozen = freezeAnalyticsOutput({ nested: { ok: true }, payload: { state: ANALYTICS_STATES.AGGREGATED } });
            check('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested) && Object.isFrozen(frozen.payload));

            var originalWorkspace = global.TeamWorkspaceService;
            var originalDiscussion = global.WorkflowDiscussionService;
            try {
                delete global.TeamWorkspaceService;
                delete global.WorkflowDiscussionService;
                var degraded = generateCommunicationAnalyticsReport({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
                check('dependency absence degrades safely', degraded.success === true && degraded.integrationHealth.teamWorkspaceIntegrated === false && degraded.integrationHealth.workflowDiscussionIntegrated === false);
            } finally {
                if (originalWorkspace) global.TeamWorkspaceService = originalWorkspace;
                if (originalDiscussion) global.WorkflowDiscussionService = originalDiscussion;
            }
        } catch (error) {
            checks.push({ label: 'self-test uncaught error guard', passed: false, description: safeString(error && error.message || error, '') });
        }
        var passed = checks.every(function item(row) { return row.passed; });
        var result = freezeAnalyticsOutput({
            passed: passed,
            checks: checks,
            summary: passed ? 'Communication analytics self-test passed.' : 'Communication analytics self-test detected failures.'
        });
        global.__ARTHHRMS_COMMUNICATION_ANALYTICS_SELF_TEST__ = result;
        return result;
    }

    var CommunicationAnalyticsService = Object.freeze({
        VERSION: VERSION,
        ANALYTICS_STATES: ANALYTICS_STATES,
        FAILURE_CLASSIFICATIONS: FAILURE_CLASSIFICATIONS,
        VISIBILITY: VISIBILITY,
        classifyCommunicationHealthRisk: classifyCommunicationHealthRisk,
        validateAnalyticsScope: validateAnalyticsScope,
        normalizeAnalyticsPayload: normalizeAnalyticsPayload,
        freezeAnalyticsOutput: freezeAnalyticsOutput,
        detectCommunicationDegradation: detectCommunicationDegradation,
        calculateEngagementScore: calculateEngagementScore,
        generateCommunicationAnalyticsReport: generateCommunicationAnalyticsReport,
        runSelfTest: runSelfTest
    });

    global.CommunicationAnalyticsService = CommunicationAnalyticsService;
    global.communicationAnalyticsService = CommunicationAnalyticsService;

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
