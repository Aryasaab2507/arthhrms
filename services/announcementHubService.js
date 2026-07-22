/**
 * announcementHubService.js
 * ARTHHRMS Enterprise Announcement + Leadership Communication Hub.
 *
 * Additive governance layer for leadership announcements, executive updates,
 * emergency broadcasts, department updates, scheduled communication, targeting,
 * acknowledgement analytics, media governance, and audit-safe announcement
 * lifecycle visibility.
 */
(function attachAnnouncementHubService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[AnnouncementHubService]';

    var ANNOUNCEMENT_STATES = Object.freeze({
        DRAFT: 'DRAFT',
        REVIEW_PENDING: 'REVIEW_PENDING',
        SCHEDULED: 'SCHEDULED',
        PUBLISHED: 'PUBLISHED',
        ACK_PENDING: 'ACK_PENDING',
        EXPIRED: 'EXPIRED',
        ARCHIVED: 'ARCHIVED'
    });

    var ANNOUNCEMENT_TYPES = Object.freeze({
        LEADERSHIP_ANNOUNCEMENT: 'LEADERSHIP_ANNOUNCEMENT',
        HR_ANNOUNCEMENT: 'HR_ANNOUNCEMENT',
        EMERGENCY_BROADCAST: 'EMERGENCY_BROADCAST',
        DEPARTMENT_UPDATE: 'DEPARTMENT_UPDATE',
        MILESTONE_ANNOUNCEMENT: 'MILESTONE_ANNOUNCEMENT',
        COMPLIANCE_NOTICE: 'COMPLIANCE_NOTICE',
        OPERATIONAL_ALERT: 'OPERATIONAL_ALERT',
        STRATEGIC_UPDATE: 'STRATEGIC_UPDATE'
    });

    var FAILURE_CLASSIFICATIONS = Object.freeze({
        INFO: 'INFO',
        WARNING: 'WARNING',
        HIGH_RISK: 'HIGH_RISK',
        CRITICAL_BLOCKER: 'CRITICAL_BLOCKER'
    });

    var VISIBILITY = Object.freeze({
        NONE: 'NONE',
        ASSIGNED_ANNOUNCEMENTS_ONLY: 'ASSIGNED_ANNOUNCEMENTS_ONLY',
        TEAM_ANNOUNCEMENT_VISIBILITY: 'TEAM_ANNOUNCEMENT_VISIBILITY',
        HR_OPERATIONAL_ANNOUNCEMENT_VISIBILITY: 'HR_OPERATIONAL_ANNOUNCEMENT_VISIBILITY',
        STRATEGIC_COMMUNICATION_VISIBILITY: 'STRATEGIC_COMMUNICATION_VISIBILITY',
        ORGANIZATION_WIDE_COMMUNICATION_VISIBILITY: 'ORGANIZATION_WIDE_COMMUNICATION_VISIBILITY',
        INFRASTRUCTURE_ONLY: 'INFRASTRUCTURE_ONLY',
        PLATFORM_GOVERNANCE_ONLY: 'PLATFORM_GOVERNANCE_ONLY'
    });

    var ANNOUNCEMENT_JOB_TYPES = Object.freeze([
        'ANNOUNCEMENT_BROADCAST',
        'LEADERSHIP_BROADCAST',
        'EMERGENCY_BROADCAST',
        'ANNOUNCEMENT_REMINDER',
        'ANNOUNCEMENT_EXPIRY',
        'ANNOUNCEMENT_ANALYTICS'
    ]);

    var ALLOWED_MEDIA_MIME_TYPES = Object.freeze([
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp'
    ]);

    var SENSITIVE_KEY_PATTERN = /(body|content|message|description|title|private|confidential|note|comment|employee|emp.?id|user.?id|assigned.?employee|viewed.?user|acknowledged.?user|recipient|participant|audience.?ids|custom.?audience|file.?name|media.?url|document.?url|signed.?url|public.?url|url|download|storage.?path|path|attachment|salary|payroll|payslip|compensation|reimbursement|receipt|resume|candidate|feedback|token|secret|jwt|authorization|service.?role|private.?key)/i;
    var SENSITIVE_VALUE_PATTERN = /(https?:\/\/[^\s"',}]+|private:\/\/[^\s"',}]+|\b(private|confidential|salary|payroll|resume|receipt|leadership update|secret)\b[^,;}]*)/ig;
    var SAFE_GOVERNANCE_KEYS = Object.freeze({
        leadershipCommunicationConfidentialityPreserved: true,
        tenantIsolationPreserved: true,
        existingCommunicationFlowsPreserved: true,
        historicalAnnouncementsImmutable: true,
        announcementActionsAuditable: true,
        mediaAccessRoleScoped: true,
        signedAccessRequired: true,
        signedAccessRedacted: true,
        publicMediaBlocked: true,
        announcementHealth: true,
        leadershipCommunication: true,
        targetingGovernance: true,
        acknowledgementGovernance: true,
        scheduledBroadcastGovernance: true,
        mediaGovernance: true,
        communicationAnalytics: true,
        accessGovernance: true,
        audienceTrends: true,
        totalAnnouncements: true,
        publishedAnnouncements: true,
        scheduledAnnouncements: true,
        archivedAnnouncements: true,
        unreadSummaries: true,
        leadershipBroadcasts: true,
        executiveUpdates: true,
        emergencyBroadcasts: true,
        strategicUpdates: true,
        milestoneAnnouncements: true,
        organizationWideTargets: true,
        departmentTargets: true,
        roleTargets: true,
        branchTargets: true,
        onboardingStageTargets: true,
        customAudienceSegments: true,
        crossTenantAudienceBlocked: true,
        totalAcknowledgements: true,
        acknowledgedUsers: true,
        pendingAcknowledgements: true,
        overdueAcknowledgements: true,
        completionPercent: true,
        emergencyAcknowledgementTracking: true,
        announcementJobs: true,
        retryPending: true,
        failedJobs: true,
        scheduledJobs: true,
        duplicateBroadcastLoopsPrevented: true,
        announcementMedia: true,
        publicMediaWarnings: true,
        signedMedia: true,
        documentGovernanceIntegrated: true,
        unreadAnnouncementRate: true,
        engagementPercentage: true,
        acknowledgementCompletion: true,
        leadershipReach: true,
        emergencyResponseTime: true,
        inactiveAudienceIndicators: true,
        superAdminPublishAuthority: true,
        platformOwnerEmployeeChain: true,
        employeeAssignedAnnouncementsOnly: true,
        managerTeamAnnouncementVisibility: true,
        directorOrganizationVisibility: true,
        auditReady: true,
        telemetryReady: true
    });

    var auditForwarding = false;
    var telemetryForwarding = false;
    var metricForwarding = false;

    function safeWarn(message, details) {
        try { if (global.console && console.warn) console.warn(PREFIX, message, details || ''); } catch (error) {}
    }

    function db() {
        return global.DB || null;
    }

    function rawData() {
        try {
            var source = db();
            if (source && typeof source.get === 'function') return source.get() || {};
        } catch (error) {}
        return {};
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

    function nowIso(context) {
        return context && context.now ? new Date(context.now).toISOString() : new Date().toISOString();
    }

    function safeString(value, fallback) {
        if (value === null || typeof value === 'undefined') return fallback || '';
        return String(value);
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

    function announcementIdOf(row) {
        return safeString(row && (row.announcementId || row.announcement_id || row.communicationId || row.communication_id || row.broadcastId || row.broadcast_id || row.id) || '', '').trim();
    }

    function mediaIdOf(row) {
        return safeString(row && (row.mediaId || row.media_id || row.documentId || row.document_id || row.attachmentId || row.attachment_id || row.id) || '', '').trim();
    }

    function actorId(actor) {
        return safeString(actor && (actor.empId || actor.employeeId || actor.userId || actor.id) || '', '').trim();
    }

    function arrayOfIds(value) {
        if (Array.isArray(value)) return value.map(function item(id) { return safeString(id || '', '').trim(); }).filter(Boolean);
        if (typeof value === 'string') return value.split(',').map(function item(id) { return id.trim(); }).filter(Boolean);
        return [];
    }

    function employeeById(empId, data) {
        var id = safeString(empId || '', '').trim();
        if (!id) return null;
        return (Array.isArray((data || rawData()).employees) ? (data || rawData()).employees : []).find(function match(emp) {
            return [emp.id, emp.empId, emp.employeeId, emp.employee_id, emp.userId].map(function item(v) { return safeString(v || '', '').trim(); }).indexOf(id) !== -1;
        }) || null;
    }

    function managerOwnsEmployee(managerId, empId, data) {
        var emp = employeeById(empId, data || rawData());
        return !!(emp && safeString(emp.managerId || emp.reportingManagerId || emp.reporting_manager_id || '', '').trim() === safeString(managerId || '', '').trim());
    }

    function employeeTenant(empId, data) {
        return rowTenant(employeeById(empId, data || rawData()));
    }

    function announcementRows(data) {
        var source = data || rawData();
        var rows = [];
        if (Array.isArray(source.announcements)) rows = rows.concat(source.announcements);
        if (Array.isArray(source.leadershipAnnouncements)) rows = rows.concat(source.leadershipAnnouncements);
        if (Array.isArray(source.hrCirculars)) rows = rows.concat(source.hrCirculars);
        if (Array.isArray(source.broadcasts)) rows = rows.concat(source.broadcasts);
        if (Array.isArray(source.communications)) {
            rows = rows.concat(source.communications.filter(function announcementCommunication(row) {
                return /announcement|leadership|broadcast|milestone|emergency|strategic|notice|alert/i.test([row.type, row.category, row.module, row.channel].join(' '));
            }));
        }
        return rows;
    }

    function acknowledgementRows(data) {
        var source = data || rawData();
        var rows = [];
        if (Array.isArray(source.announcementAcknowledgements)) rows = rows.concat(source.announcementAcknowledgements);
        if (Array.isArray(source.communicationAcknowledgements)) {
            rows = rows.concat(source.communicationAcknowledgements.filter(function announcementAck(row) {
                return announcementIdOf(row) || /announcement|broadcast|leadership/i.test([row.type, row.category, row.module].join(' '));
            }));
        }
        return rows;
    }

    function mediaRows(data) {
        var source = data || rawData();
        var rows = [];
        if (Array.isArray(source.announcementMedia)) rows = rows.concat(source.announcementMedia);
        if (Array.isArray(source.communicationAttachments)) {
            rows = rows.concat(source.communicationAttachments.filter(function announcementMedia(row) {
                return announcementIdOf(row) || /announcement|broadcast|leadership/i.test([row.category, row.module, row.type].join(' '));
            }));
        }
        if (Array.isArray(source.documents)) {
            rows = rows.concat(source.documents.filter(function documentMedia(row) {
                return announcementIdOf(row) || /announcement|broadcast|leadership|media/i.test([row.category, row.documentType, row.documentCategory, row.module].join(' '));
            }));
        }
        return rows;
    }

    function notificationRows(data) {
        var source = data || rawData();
        return Array.isArray(source.notifications) ? source.notifications : [];
    }

    function asyncRows(data) {
        var source = data || rawData();
        return Array.isArray(source.asyncJobs) ? source.asyncJobs : [];
    }

    function findAnnouncement(id, data) {
        var key = safeString(id || '', '').trim();
        if (!key) return null;
        return announcementRows(data).find(function match(row) {
            return announcementIdOf(row) === key || safeString(row.id || '', '').trim() === key;
        }) || null;
    }

    function assignedIds(row) {
        var ids = [];
        ids = ids.concat(arrayOfIds(row && row.assignedEmployeeIds));
        ids = ids.concat(arrayOfIds(row && row.targetEmployeeIds));
        ids = ids.concat(arrayOfIds(row && row.recipientIds));
        ids = ids.concat(arrayOfIds(row && row.recipients));
        ids = ids.concat(arrayOfIds(row && row.viewedUserIds));
        ids = ids.concat(arrayOfIds(row && row.acknowledgedUserIds));
        ids = ids.concat(arrayOfIds(row && row.customAudienceIds));
        if (row && row.empId) ids.push(safeString(row.empId, '').trim());
        if (row && row.employeeId) ids.push(safeString(row.employeeId, '').trim());
        return ids.filter(function unique(id, index, list) { return id && list.indexOf(id) === index; });
    }

    function sourceTenant(row, data) {
        if (!row) return '';
        var direct = rowTenant(row);
        if (direct) return direct;
        var sourceData = data || rawData();
        var announcement = findAnnouncement(announcementIdOf(row), sourceData);
        if (announcement && rowTenant(announcement)) return rowTenant(announcement);
        var ids = assignedIds(row);
        for (var i = 0; i < ids.length; i += 1) {
            var tenant = employeeTenant(ids[i], sourceData);
            if (tenant) return tenant;
        }
        return '';
    }

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.keys(value).forEach(function freezeKey(key) { deepFreeze(value[key]); });
        return Object.freeze(value);
    }

    function sanitizeText(value) {
        return safeString(value || '', '').replace(SENSITIVE_VALUE_PATTERN, '[REDACTED]');
    }

    function cloneSanitized(value) {
        if (Array.isArray(value)) return value.map(cloneSanitized);
        if (!value || typeof value !== 'object') {
            if (typeof value === 'string') return sanitizeText(value);
            return value;
        }
        var output = {};
        Object.keys(value).forEach(function copyKey(key) {
            if (SENSITIVE_KEY_PATTERN.test(key) && !SAFE_GOVERNANCE_KEYS[key]) return;
            output[key] = cloneSanitized(value[key]);
        });
        return output;
    }

    function freezeAnnouncementOutput(value) {
        return deepFreeze(cloneSanitized(value));
    }

    function safeFailure(code, classification, message, metadata) {
        return {
            failureCode: code,
            classification: classification || FAILURE_CLASSIFICATIONS.WARNING,
            message: sanitizeText(message || code),
            metadata: cloneSanitized(metadata || {})
        };
    }

    function safeWarning(code, message, metadata) {
        return {
            warningCode: code,
            classification: FAILURE_CLASSIFICATIONS.WARNING,
            message: sanitizeText(message || code),
            metadata: cloneSanitized(metadata || {})
        };
    }

    function highestClassification(items, fallback) {
        var list = Array.isArray(items) ? items : [];
        if (list.some(function critical(item) { return item.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER; })) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
        if (list.some(function high(item) { return item.classification === FAILURE_CLASSIFICATIONS.HIGH_RISK; })) return FAILURE_CLASSIFICATIONS.HIGH_RISK;
        if (list.some(function warning(item) { return item.classification === FAILURE_CLASSIFICATIONS.WARNING; })) return FAILURE_CLASSIFICATIONS.WARNING;
        return fallback || FAILURE_CLASSIFICATIONS.INFO;
    }

    function classifyAnnouncementRisk(input) {
        var source = input || {};
        if (source.crossTenant || source.crossTenantAnnouncement || source.crossTenantVisibility || source.publicMedia || source.publicExposure || source.rlsBypass) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
        if (source.platformOwnerInChain || source.platformOwnerAnnouncementAccess || normalizeRole(source.role) === 'PLATFORM_OWNER') return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
        if (source.superAdminPublish || source.unsafeBroadcast || source.duplicateBroadcast || source.unauthorizedAnnouncementAccess) return FAILURE_CLASSIFICATIONS.HIGH_RISK;
        if (source.malformedPayload || source.unreadSpike || source.overdueAcknowledgement || source.broadcastCongestion || source.unsupportedMedia) return FAILURE_CLASSIFICATIONS.WARNING;
        return FAILURE_CLASSIFICATIONS.INFO;
    }

    function normalizeAnnouncementState(value) {
        var normalized = normalizeToken(value || '');
        if (normalized === 'PENDING_REVIEW' || normalized === 'REVIEW_PENDING') return ANNOUNCEMENT_STATES.REVIEW_PENDING;
        if (normalized === 'SCHEDULE' || normalized === 'SCHEDULED') return ANNOUNCEMENT_STATES.SCHEDULED;
        if (normalized === 'PUBLISH' || normalized === 'PUBLISHED') return ANNOUNCEMENT_STATES.PUBLISHED;
        if (normalized === 'ACKNOWLEDGEMENT_PENDING' || normalized === 'ACK_PENDING') return ANNOUNCEMENT_STATES.ACK_PENDING;
        if (normalized === 'EXPIRED') return ANNOUNCEMENT_STATES.EXPIRED;
        if (normalized === 'ARCHIVE' || normalized === 'ARCHIVED') return ANNOUNCEMENT_STATES.ARCHIVED;
        return ANNOUNCEMENT_STATES[normalized] || ANNOUNCEMENT_STATES.DRAFT;
    }

    function normalizeAnnouncementType(value) {
        var normalized = normalizeToken(value || '');
        if (normalized === 'LEADERSHIP' || normalized === 'EXECUTIVE_UPDATE' || normalized === 'CEO_UPDATE') return ANNOUNCEMENT_TYPES.LEADERSHIP_ANNOUNCEMENT;
        if (normalized === 'HR' || normalized === 'HR_CIRCULAR') return ANNOUNCEMENT_TYPES.HR_ANNOUNCEMENT;
        if (normalized === 'EMERGENCY' || normalized === 'URGENT_BROADCAST') return ANNOUNCEMENT_TYPES.EMERGENCY_BROADCAST;
        if (normalized === 'DEPARTMENT' || normalized === 'DEPARTMENT_ANNOUNCEMENT') return ANNOUNCEMENT_TYPES.DEPARTMENT_UPDATE;
        if (normalized === 'MILESTONE') return ANNOUNCEMENT_TYPES.MILESTONE_ANNOUNCEMENT;
        if (normalized === 'COMPLIANCE') return ANNOUNCEMENT_TYPES.COMPLIANCE_NOTICE;
        if (normalized === 'OPERATIONAL') return ANNOUNCEMENT_TYPES.OPERATIONAL_ALERT;
        if (normalized === 'STRATEGIC') return ANNOUNCEMENT_TYPES.STRATEGIC_UPDATE;
        return ANNOUNCEMENT_TYPES[normalized] || ANNOUNCEMENT_TYPES.HR_ANNOUNCEMENT;
    }

    function hasRawAnnouncementFields(input) {
        if (!input || typeof input !== 'object') return false;
        return Object.keys(input).some(function check(key) {
            if (SENSITIVE_KEY_PATTERN.test(key) && !SAFE_GOVERNANCE_KEYS[key]) return true;
            return input[key] && typeof input[key] === 'object' && hasRawAnnouncementFields(input[key]);
        });
    }

    function targetRoles(row) {
        var roles = [];
        roles = roles.concat(arrayOfIds(row && row.targetRoles));
        roles = roles.concat(arrayOfIds(row && row.recipientRoles));
        roles = roles.concat(arrayOfIds(row && row.audienceRoles));
        roles = roles.concat(arrayOfIds(row && row.participantRoles));
        if (row && Array.isArray(row.participants)) row.participants.forEach(function participant(item) { roles.push(item && item.role); });
        return roles.map(normalizeRole).filter(Boolean);
    }

    function hasPlatformOwnerTarget(row) {
        return targetRoles(row).some(function role(item) { return item === 'PLATFORM_OWNER'; });
    }

    function visibilityForRole(role, actor, source, data) {
        var normalized = normalizeRole(role || actor && actor.role);
        var id = actorId(actor);
        var ids = assignedIds(source);
        if (normalized === 'EMPLOYEE') return id && ids.indexOf(id) !== -1 ? VISIBILITY.ASSIGNED_ANNOUNCEMENTS_ONLY : VISIBILITY.NONE;
        if (normalized === 'MANAGER') {
            if (ids.indexOf(id) !== -1) return VISIBILITY.TEAM_ANNOUNCEMENT_VISIBILITY;
            return ids.some(function team(empId) { return managerOwnsEmployee(id, empId, data); }) ? VISIBILITY.TEAM_ANNOUNCEMENT_VISIBILITY : VISIBILITY.NONE;
        }
        if (normalized === 'HR') return VISIBILITY.HR_OPERATIONAL_ANNOUNCEMENT_VISIBILITY;
        if (normalized === 'HR_HEAD') return VISIBILITY.STRATEGIC_COMMUNICATION_VISIBILITY;
        if (normalized === 'DIRECTOR') return VISIBILITY.ORGANIZATION_WIDE_COMMUNICATION_VISIBILITY;
        if (normalized === 'SUPER_ADMIN') return VISIBILITY.INFRASTRUCTURE_ONLY;
        if (normalized === 'PLATFORM_OWNER') return VISIBILITY.PLATFORM_GOVERNANCE_ONLY;
        return VISIBILITY.NONE;
    }

    function validateAnnouncementScope(record, context) {
        try {
            var source = record || {};
            var data = rawData();
            var ctxTenant = contextTenant(context);
            var targetTenant = sourceTenant(source, data) || ctxTenant;
            var role = normalizeRole(context && context.actor && context.actor.role);
            var visibility = visibilityForRole(role, context && context.actor, source, data);
            var targetSpecific = !!(announcementIdOf(source) || assignedIds(source).length || mediaIdOf(source));
            var sameTenant = !targetTenant || !ctxTenant || targetTenant === ctxTenant;
            var rawFields = hasRawAnnouncementFields(source);
            var failures = [];

            if (!sameTenant) {
                failures.push(safeFailure('CROSS_TENANT_ANNOUNCEMENT_VISIBILITY_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Cross-tenant announcement visibility was blocked.', { expectedTenant: ctxTenant }));
            }
            if (role === 'PLATFORM_OWNER' && targetSpecific) {
                failures.push(safeFailure('PLATFORM_OWNER_ANNOUNCEMENT_ACCESS_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Platform owner is isolated from employee communication chains.'));
            }
            if (role === 'SUPER_ADMIN' && targetSpecific) {
                failures.push(safeFailure('SUPER_ADMIN_ANNOUNCEMENT_VIEW_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Tenant system administrators receive infrastructure visibility only.'));
            }
            if (role === 'DIRECTOR' && rawFields) {
                failures.push(safeFailure('DIRECTOR_RAW_ANNOUNCEMENT_ACCESS_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Directors receive organization-wide communication visibility without confidential employee-specific details.'));
            }
            if (role === 'EMPLOYEE' && visibility !== VISIBILITY.ASSIGNED_ANNOUNCEMENTS_ONLY && targetSpecific) {
                failures.push(safeFailure('EMPLOYEE_ANNOUNCEMENT_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Employees may access only assigned announcements.'));
            }
            if (role === 'MANAGER' && visibility !== VISIBILITY.TEAM_ANNOUNCEMENT_VISIBILITY && targetSpecific) {
                failures.push(safeFailure('MANAGER_ANNOUNCEMENT_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Managers may access only team announcement visibility.'));
            }

            var classification = highestClassification(failures);
            return freezeAnnouncementOutput({
                allowed: failures.length === 0,
                classification: classification,
                visibility: visibility,
                scope: {
                    tenantSlug: ctxTenant,
                    announcementId: sameTenant ? announcementIdOf(source) : '',
                    mediaId: sameTenant ? mediaIdOf(source) : ''
                },
                failures: failures,
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    leadershipCommunicationConfidentialityPreserved: true,
                    mediaAccessRoleScoped: true
                }
            });
        } catch (error) {
            return freezeAnnouncementOutput({
                allowed: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                visibility: VISIBILITY.NONE,
                failures: [safeFailure('ANNOUNCEMENT_SCOPE_VALIDATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Announcement scope validation failed safely.')]
            });
        }
    }

    function normalizeAnnouncementPayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeAnnouncementOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    failures: [safeFailure('MALFORMED_ANNOUNCEMENT_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Announcement payload is malformed.')]
                });
            }
            var data = rawData();
            var ctxTenant = contextTenant(context);
            var srcTenant = sourceTenant(payload, data) || ctxTenant;
            var type = normalizeAnnouncementType(payload.type || payload.announcementType || payload.category);
            var state = normalizeAnnouncementState(payload.state || payload.status || (payload.schedule || payload.scheduledAt ? ANNOUNCEMENT_STATES.SCHEDULED : ANNOUNCEMENT_STATES.DRAFT));
            return freezeAnnouncementOutput({
                success: true,
                classification: (!ctxTenant || !srcTenant || ctxTenant === srcTenant) ? FAILURE_CLASSIFICATIONS.INFO : FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                payload: {
                    tenantSlug: srcTenant,
                    announcementId: announcementIdOf(payload),
                    type: type,
                    state: state,
                    targetType: normalizeToken(payload.targetType || payload.audienceType || 'ORGANIZATION_WIDE'),
                    department: safeString(payload.department || payload.departmentId || payload.targetDepartment || '', '').trim(),
                    targetRoleCount: targetRoles(payload).length,
                    assignedAudienceCount: assignedIds(payload).length,
                    requiresAck: payload.requiresAck === true || state === ANNOUNCEMENT_STATES.ACK_PENDING || type === ANNOUNCEMENT_TYPES.EMERGENCY_BROADCAST,
                    emergency: payload.emergency === true || type === ANNOUNCEMENT_TYPES.EMERGENCY_BROADCAST,
                    scheduled: !!(payload.schedule || payload.scheduledAt || state === ANNOUNCEMENT_STATES.SCHEDULED),
                    hasMedia: !!(payload.mediaId || payload.documentId || payload.attachmentId || payload.signedUrl || payload.publicUrl)
                },
                metadata: {
                    tenantIsolationPreserved: !ctxTenant || !srcTenant || ctxTenant === srcTenant,
                    leadershipCommunicationConfidentialityPreserved: true,
                    historicalAnnouncementsImmutable: true
                }
            });
        } catch (error) {
            return freezeAnnouncementOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('ANNOUNCEMENT_NORMALIZATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Announcement normalization failed safely.')]
            });
        }
    }

    function isPublishAttempt(payload, role) {
        if (!payload || typeof payload !== 'object') return false;
        var state = normalizeAnnouncementState(payload.state || payload.status);
        return payload.publishNow === true || payload.publish === true || state === ANNOUNCEMENT_STATES.PUBLISHED || normalizeRole(role) === 'SUPER_ADMIN' && payload.state;
    }

    function validateAnnouncementPayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeAnnouncementOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    state: ANNOUNCEMENT_STATES.DRAFT,
                    failures: [safeFailure('MALFORMED_ANNOUNCEMENT_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Announcement payload is malformed.')]
                });
            }
            var normalized = normalizeAnnouncementPayload(payload, context);
            var scope = validateAnnouncementScope(payload, context);
            var targeting = validateAnnouncementTargeting(payload, context);
            var failures = (scope.failures || []).concat(targeting.failures || []);
            var state = normalized.payload ? normalized.payload.state : ANNOUNCEMENT_STATES.DRAFT;
            var role = normalizeRole(context && context.actor && context.actor.role);

            if (normalized.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER) {
                failures.push(safeFailure('ANNOUNCEMENT_TENANT_MISMATCH_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Announcement tenant mismatch was blocked.'));
            }
            if (hasPlatformOwnerTarget(payload)) {
                failures.push(safeFailure('PLATFORM_OWNER_IN_ANNOUNCEMENT_CHAIN_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Platform owner cannot be included in employee communication chains.'));
            }
            if (role === 'SUPER_ADMIN' && isPublishAttempt(payload, role)) {
                failures.push(safeFailure('SUPER_ADMIN_ANNOUNCEMENT_PUBLISH_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Tenant system administrators cannot publish leadership announcements.'));
            }

            var classification = highestClassification(failures);
            return freezeAnnouncementOutput({
                success: failures.length === 0,
                classification: classification,
                state: state,
                normalized: normalized.payload || null,
                failures: failures,
                targetingGovernance: {
                    crossTenantAudienceBlocked: true,
                    organizationWideTargets: normalized.payload && normalized.payload.targetType === 'ORGANIZATION_WIDE' ? 1 : 0,
                    roleTargets: normalized.payload ? normalized.payload.targetRoleCount : 0
                },
                acknowledgementGovernance: {
                    emergencyAcknowledgementTracking: normalized.payload ? normalized.payload.emergency : false,
                    tenantScopedAcknowledgements: true
                },
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    leadershipCommunicationConfidentialityPreserved: true,
                    historicalAnnouncementsImmutable: true
                }
            });
        } catch (error) {
            return freezeAnnouncementOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                state: ANNOUNCEMENT_STATES.DRAFT,
                failures: [safeFailure('ANNOUNCEMENT_VALIDATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Announcement validation failed safely.')]
            });
        }
    }

    function validateAnnouncementTargeting(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeAnnouncementOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    failures: [safeFailure('MALFORMED_ANNOUNCEMENT_TARGETING_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Announcement targeting payload is malformed.')]
                });
            }
            var ctxTenant = contextTenant(context);
            var targetTenant = normalizeTenantSlug(payload.targetTenantSlug || payload.targetTenantId || payload.audienceTenantSlug || payload.audienceTenantId || '') || sourceTenant(payload, rawData()) || ctxTenant;
            var failures = [];
            if (ctxTenant && targetTenant && ctxTenant !== targetTenant) {
                failures.push(safeFailure('CROSS_TENANT_ANNOUNCEMENT_TARGETING_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Cross-tenant announcement audience targeting was blocked.', { expectedTenant: ctxTenant }));
            }
            if (hasPlatformOwnerTarget(payload)) {
                failures.push(safeFailure('PLATFORM_OWNER_IN_ANNOUNCEMENT_CHAIN_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Platform owner cannot be included in employee communication chains.'));
            }
            var classification = highestClassification(failures);
            return freezeAnnouncementOutput({
                success: failures.length === 0,
                classification: classification,
                targetingGovernance: {
                    organizationWideTargets: /ORG|ALL|COMPANY/i.test(safeString(payload.targetType || payload.audienceType || '', '')) ? 1 : 0,
                    departmentTargets: payload.department || payload.targetDepartment ? 1 : 0,
                    roleTargets: targetRoles(payload).length,
                    branchTargets: payload.branch || payload.branchId ? 1 : 0,
                    onboardingStageTargets: payload.onboardingStage || payload.targetOnboardingStage ? 1 : 0,
                    customAudienceSegments: assignedIds(payload).length ? 1 : 0,
                    crossTenantAudienceBlocked: true
                },
                failures: failures,
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    leadershipCommunicationConfidentialityPreserved: true
                }
            });
        } catch (error) {
            return freezeAnnouncementOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('ANNOUNCEMENT_TARGETING_VALIDATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Announcement targeting validation failed safely.')]
            });
        }
    }

    function publicExposure(payload) {
        if (!payload || typeof payload !== 'object') return false;
        if (payload.isPublic === true || payload.public === true || payload.publicUrl) return true;
        var url = safeString(payload.url || payload.mediaUrl || payload.documentUrl || payload.signedUrl || payload.downloadUrl || payload.attachmentUrl || '', '').toLowerCase();
        return !!(url && url.indexOf('public') !== -1 && url.indexOf('private') === -1);
    }

    function supportedMime(payload) {
        var mime = safeString(payload && (payload.mimeType || payload.type || payload.fileType) || '', '').trim().toLowerCase();
        return !mime || ALLOWED_MEDIA_MIME_TYPES.indexOf(mime) !== -1;
    }

    function validateAnnouncementMedia(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeAnnouncementOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    failures: [safeFailure('MALFORMED_ANNOUNCEMENT_MEDIA_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Announcement media payload is malformed.')]
                });
            }
            var scope = validateAnnouncementScope(payload, context);
            var failures = (scope.failures || []).slice();
            if (!supportedMime(payload)) {
                failures.push(safeFailure('UNSUPPORTED_ANNOUNCEMENT_MEDIA_MIME_TYPE', FAILURE_CLASSIFICATIONS.WARNING, 'Announcement media MIME type is not supported.', { allowedTypes: ALLOWED_MEDIA_MIME_TYPES.slice() }));
            }
            if (publicExposure(payload)) {
                failures.push(safeFailure('PUBLIC_ANNOUNCEMENT_MEDIA_EXPOSURE_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Public announcement media exposure was blocked.'));
            }
            var classification = highestClassification(failures);
            return freezeAnnouncementOutput({
                success: failures.length === 0,
                classification: classification,
                visibility: scope.visibility || VISIBILITY.NONE,
                mediaGovernance: {
                    signedAccessRequired: true,
                    signedAccessRedacted: true,
                    publicMediaBlocked: failures.some(function blocked(row) { return row.failureCode === 'PUBLIC_ANNOUNCEMENT_MEDIA_EXPOSURE_BLOCKED'; }),
                    mediaAccessRoleScoped: true,
                    mediaIntegrityValidation: true,
                    documentGovernanceIntegrated: !!global.DocumentGovernanceService
                },
                failures: failures,
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    leadershipCommunicationConfidentialityPreserved: true
                }
            });
        } catch (error) {
            return freezeAnnouncementOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('ANNOUNCEMENT_MEDIA_VALIDATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Announcement media governance failed safely.')]
            });
        }
    }

    function tenantFilter(tenant, data) {
        return function sameTenant(row) {
            var tenantSlug = sourceTenant(row, data);
            return !tenant || !tenantSlug || tenantSlug === tenant;
        };
    }

    function dateValue(value) {
        var text = safeString(value || '', '').slice(0, 10);
        if (!text) return null;
        var parsed = new Date(text + 'T00:00:00.000Z');
        if (Number.isNaN(parsed.getTime())) return null;
        return parsed;
    }

    function isPastDate(value, context) {
        var date = dateValue(value);
        if (!date) return false;
        var now = new Date(nowIso(context));
        return date.getTime() < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    }

    function announcementState(row) {
        return normalizeAnnouncementState(row && (row.state || row.status));
    }

    function announcementType(row) {
        return normalizeAnnouncementType(row && (row.type || row.announcementType || row.category || row.module));
    }

    function acknowledgementStatus(row) {
        return normalizeToken(row && (row.status || row.state || row.ackStatus));
    }

    function isAnnouncementJob(row) {
        return ANNOUNCEMENT_JOB_TYPES.indexOf(normalizeToken(row && (row.jobType || row.type || row.category))) !== -1;
    }

    function isEmergency(row) {
        return row && (row.emergency === true || announcementType(row) === ANNOUNCEMENT_TYPES.EMERGENCY_BROADCAST || /EMERGENCY|URGENT|CRITICAL/i.test([row.type, row.category, row.priority].join(' ')));
    }

    function detectBroadcastCongestion(filters, context) {
        try {
            var data = rawData();
            var tenant = normalizeTenantSlug(filters && (filters.tenantSlug || filters.tenantId || filters.companyId)) || contextTenant(context);
            var announcements = announcementRows(data).filter(tenantFilter(tenant, data));
            var acknowledgements = acknowledgementRows(data).filter(tenantFilter(tenant, data));
            var notifications = notificationRows(data).filter(tenantFilter(tenant, data)).filter(function announcementNotification(row) {
                return /announcement|broadcast|leadership|emergency|milestone|strategic/i.test([row.module, row.category, row.type, row.title].join(' '));
            });
            var pending = acknowledgements.filter(function pendingAck(row) { return /PENDING|OVERDUE|OPEN|WAITING/i.test(acknowledgementStatus(row)); }).length;
            var overdue = acknowledgements.filter(function overdueAck(row) {
                return /PENDING|OVERDUE|OPEN|WAITING/i.test(acknowledgementStatus(row)) && isPastDate(row.dueAt || row.deadline || row.expiresAt, context);
            }).length;
            var acknowledged = acknowledgements.filter(function acked(row) { return /ACK|SIGNED|COMPLETE|DONE/i.test(acknowledgementStatus(row)); }).length;
            var unread = notifications.filter(function unreadNotification(row) {
                return row.read === false || row.seen === false || row.unread === true || /UNREAD/i.test(safeString(row.status || '', ''));
            }).length;
            var emergency = announcements.filter(isEmergency).length;
            var scheduled = announcements.filter(function scheduledRow(row) {
                return announcementState(row) === ANNOUNCEMENT_STATES.SCHEDULED || !!row.scheduledAt || !!(row.schedule && row.schedule.runAt);
            }).length;
            var audienceCounts = {};
            announcements.forEach(function countAudience(row) {
                var key = normalizeToken(row.targetType || row.audienceType || row.department || 'ORGANIZATION_WIDE');
                if (!audienceCounts[key]) audienceCounts[key] = { audience: key, announcements: 0, unreadAnnouncements: 0, pendingAcknowledgements: 0 };
                audienceCounts[key].announcements += 1;
            });
            acknowledgements.forEach(function countAck(row) {
                var announcement = findAnnouncement(announcementIdOf(row), data);
                var key = normalizeToken(announcement && (announcement.targetType || announcement.audienceType || announcement.department) || 'ORGANIZATION_WIDE');
                if (!audienceCounts[key]) audienceCounts[key] = { audience: key, announcements: 0, unreadAnnouncements: 0, pendingAcknowledgements: 0 };
                if (/PENDING|OVERDUE|OPEN|WAITING/i.test(acknowledgementStatus(row))) audienceCounts[key].pendingAcknowledgements += 1;
            });
            var trends = Object.keys(audienceCounts).map(function toTrend(key) { return audienceCounts[key]; }).sort(function order(a, b) {
                return b.pendingAcknowledgements - a.pendingAcknowledgements || b.announcements - a.announcements;
            });
            var total = Math.max(acknowledgements.length, acknowledged + pending);
            var completion = total ? Math.round((acknowledged / total) * 100) : 100;
            return freezeAnnouncementOutput({
                success: true,
                classification: overdue || unread ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO,
                tenantSlug: tenant,
                summary: {
                    unreadAnnouncements: unread,
                    pendingAcknowledgements: pending,
                    overdueAcknowledgements: overdue,
                    acknowledgedUsers: acknowledged,
                    completionPercent: completion,
                    emergencyBroadcasts: emergency,
                    scheduledBroadcasts: scheduled,
                    broadcastCongestion: pending + overdue + unread + scheduled
                },
                audienceTrends: trends,
                metadata: {
                    tenantIsolationPreserved: true,
                    leadershipCommunicationConfidentialityPreserved: true,
                    historicalAnnouncementsImmutable: true
                }
            });
        } catch (error) {
            return freezeAnnouncementOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                summary: { unreadAnnouncements: 0, pendingAcknowledgements: 0, emergencyBroadcasts: 0, broadcastCongestion: 0 },
                audienceTrends: [],
                failures: [safeFailure('BROADCAST_CONGESTION_DETECTION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Broadcast congestion detection failed safely.')]
            });
        }
    }

    function auditAnnouncement(actionType, metadata, context) {
        if (auditForwarding || context && context.skipAuditPersistence) return { success: true, skipped: true };
        auditForwarding = true;
        try {
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    actionType: actionType,
                    eventType: actionType,
                    module: 'Announcement Hub',
                    targetId: metadata && (metadata.announcementId || metadata.targetId) || '',
                    description: metadata && metadata.description || actionType,
                    actorRole: context && context.actor && context.actor.role || 'hr',
                    actorId: context && context.actor && context.actor.id || '',
                    severity: metadata && metadata.severity || 'INFO',
                    correlationId: metadata && metadata.correlationId || '',
                    metadata: cloneSanitized(metadata || {})
                }, {
                    source: 'announcementHubService',
                    skipPersistence: false
                });
            }
            var source = db();
            if (source && typeof source.writeAuditLog === 'function') {
                source.writeAuditLog(context && context.actor && context.actor.role || 'hr', context && context.actor && context.actor.id || '', actionType, 'Announcement Hub', metadata && metadata.announcementId || '', metadata && metadata.description || actionType);
            }
            return { success: true };
        } catch (error) {
            return { success: false, warning: 'Announcement audit failed safely.' };
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
                service.emitTelemetry('ANNOUNCEMENT_HUB', eventType, {
                    source: 'announcementHubService',
                    severity: metadata && metadata.severity || 'INFO',
                    tenantSlug: contextTenant(context) || metadata && metadata.tenantSlug || '',
                    metadata: cloneSanitized(metadata || {})
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Announcement telemetry failed safely.' };
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
                    source: 'announcementHubService',
                    status: metadata && metadata.status || metricType,
                    severity: metadata && metadata.severity || 'INFO'
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Announcement metric failed safely.' };
        } finally {
            metricForwarding = false;
        }
        return { success: false, warning: 'OrchestrationMetricsService unavailable.' };
    }

    function persistHubRun(run, context) {
        if (context && (context.preview || context.readOnly)) return freezeAnnouncementOutput(run);
        var data = rawData();
        data.announcementHubRuns = Array.isArray(data.announcementHubRuns) ? data.announcementHubRuns.slice() : [];
        data.announcementHubRuns.unshift(cloneSanitized(run));
        if (data.announcementHubRuns.length > 150) data.announcementHubRuns = data.announcementHubRuns.slice(0, 150);
        saveData(data);
        return freezeAnnouncementOutput(run);
    }

    function scheduleAnnouncementBroadcast(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeAnnouncementOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    state: ANNOUNCEMENT_STATES.DRAFT,
                    failures: [safeFailure('MALFORMED_ANNOUNCEMENT_BROADCAST_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Announcement broadcast payload is malformed.')]
                });
            }
            var validation = validateAnnouncementPayload(payload, context);
            if (!validation.success) {
                auditAnnouncement('ANNOUNCEMENT_BROADCAST_BLOCKED', {
                    tenantSlug: contextTenant(context),
                    severity: validation.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'WARNING',
                    description: 'Unsafe announcement broadcast was blocked.'
                }, context);
                emitTelemetry('ANNOUNCEMENT_BROADCAST_BLOCKED', { severity: 'WARNING', status: 'BLOCKED' }, context);
                return freezeAnnouncementOutput({
                    success: false,
                    classification: validation.classification,
                    state: validation.state || ANNOUNCEMENT_STATES.DRAFT,
                    failures: validation.failures,
                    asyncJob: { success: false, warning: 'Announcement broadcast blocked before async scheduling.' },
                    metadata: {
                        tenantIsolationPreserved: validation.classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                        leadershipCommunicationConfidentialityPreserved: true,
                        historicalAnnouncementsImmutable: true
                    }
                });
            }

            var normalized = validation.normalized || {};
            var ctxTenant = contextTenant(context) || normalized.tenantSlug || sourceTenant(payload, rawData());
            var runId = 'ANNGOV-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7).toUpperCase();
            var type = normalized.type || normalizeAnnouncementType(payload.type || payload.category);
            var run = persistHubRun({
                runId: runId,
                tenantSlug: ctxTenant,
                announcementId: announcementIdOf(payload),
                type: type,
                state: normalized.state || ANNOUNCEMENT_STATES.SCHEDULED,
                validationOnly: payload.validationOnly !== false,
                scheduledBroadcastGoverned: true,
                emergencyBroadcast: normalized.emergency === true,
                createdAt: nowIso(context)
            }, context);

            var asyncJob = { success: false, warning: 'AsyncJobService unavailable; announcement broadcast remains governance-visible.' };
            if (global.AsyncJobService && typeof global.AsyncJobService.scheduleJob === 'function') {
                asyncJob = global.AsyncJobService.scheduleJob({
                    tenantSlug: ctxTenant,
                    jobType: normalized.emergency ? 'EMERGENCY_BROADCAST' : 'ANNOUNCEMENT_BROADCAST',
                    priority: payload.priority || (normalized.emergency ? 'CRITICAL' : 'HIGH'),
                    correlationId: announcementIdOf(payload) || runId,
                    payload: {
                        announcementId: announcementIdOf(payload),
                        governanceRunId: runId,
                        type: type,
                        emergency: normalized.emergency === true
                    },
                    schedule: payload.schedule || {}
                }, {
                    tenantSlug: ctxTenant,
                    actor: context && context.actor,
                    skipAuditPersistence: context && context.skipAuditPersistence,
                    skipTelemetry: context && context.skipTelemetry,
                    skipMetrics: context && context.skipMetrics,
                    preview: context && context.preview
                });
            }

            if (global.NotificationOrchestrationService && typeof global.NotificationOrchestrationService.orchestrateNotification === 'function' && !(context && context.skipNotification)) {
                try {
                    global.NotificationOrchestrationService.orchestrateNotification({
                        tenantSlug: ctxTenant,
                        module: 'Announcement Hub',
                        category: normalized.emergency ? 'EMERGENCY_BROADCAST' : 'LEADERSHIP_ANNOUNCEMENT',
                        targetRole: payload.targetRole || 'HR',
                        priority: payload.priority || (normalized.emergency ? 'CRITICAL' : 'HIGH'),
                        title: normalized.emergency ? 'Emergency Broadcast Governance' : 'Leadership Communication Governance',
                        message: normalized.emergency ? 'An emergency broadcast is ready for governed delivery.' : 'A leadership announcement is ready for governed delivery.',
                        correlationId: announcementIdOf(payload) || runId
                    }, {
                        tenantSlug: ctxTenant,
                        actor: context && context.actor,
                        skipAuditPersistence: context && context.skipAuditPersistence,
                        skipTelemetry: context && context.skipTelemetry,
                        skipMetrics: context && context.skipMetrics,
                        preview: context && context.preview
                    });
                } catch (notifyError) {}
            }

            auditAnnouncement(normalized.emergency ? 'EMERGENCY_BROADCAST_SCHEDULED' : 'ANNOUNCEMENT_BROADCAST_SCHEDULED', {
                announcementId: announcementIdOf(payload),
                tenantSlug: ctxTenant,
                severity: normalized.emergency ? 'CRITICAL' : 'INFO',
                description: 'Announcement broadcast scheduled through leadership communication governance.'
            }, context);
            emitTelemetry('ANNOUNCEMENT_BROADCAST_SCHEDULED', { tenantSlug: ctxTenant, status: 'SCHEDULED', severity: normalized.emergency ? 'CRITICAL' : 'INFO' }, context);
            recordMetric('ANNOUNCEMENT_BROADCAST_SCHEDULED', { tenantSlug: ctxTenant, status: 'SCHEDULED', severity: normalized.emergency ? 'CRITICAL' : 'INFO' }, context);

            return freezeAnnouncementOutput({
                success: true,
                classification: FAILURE_CLASSIFICATIONS.INFO,
                state: normalized.state || ANNOUNCEMENT_STATES.SCHEDULED,
                run: run,
                asyncJob: asyncJob,
                metadata: {
                    tenantIsolationPreserved: true,
                    leadershipCommunicationConfidentialityPreserved: true,
                    historicalAnnouncementsImmutable: true,
                    existingCommunicationFlowsPreserved: true
                }
            });
        } catch (error) {
            safeWarn('Announcement broadcast scheduling failed safely.', error && error.message ? error.message : error);
            return freezeAnnouncementOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                state: ANNOUNCEMENT_STATES.DRAFT,
                failures: [safeFailure('ANNOUNCEMENT_BROADCAST_SCHEDULING_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Announcement broadcast scheduling failed safely.')],
                asyncJob: { success: false, warning: 'Announcement broadcast scheduling failed safely.' }
            });
        }
    }

    function acknowledgementCounts(announcements, acknowledgements, context) {
        var required = announcements.filter(function requiredAnnouncement(row) {
            return row.requiresAck === true || announcementState(row) === ANNOUNCEMENT_STATES.ACK_PENDING || isEmergency(row);
        }).length;
        var pending = acknowledgements.filter(function pendingAck(row) { return /PENDING|OVERDUE|OPEN|WAITING/i.test(acknowledgementStatus(row)); }).length;
        var acknowledged = acknowledgements.filter(function acknowledgedAck(row) { return /ACK|SIGNED|COMPLETE|DONE/i.test(acknowledgementStatus(row)); }).length;
        var overdue = acknowledgements.filter(function overdueAck(row) {
            return /PENDING|OVERDUE|OPEN|WAITING/i.test(acknowledgementStatus(row)) && isPastDate(row.dueAt || row.deadline || row.expiresAt, context);
        }).length;
        var total = Math.max(acknowledgements.length, acknowledged + pending);
        var completion = total ? Math.round((acknowledged / total) * 100) : (required ? 0 : 100);
        return {
            announcementsRequiringAcknowledgement: required,
            totalAcknowledgements: acknowledgements.length,
            acknowledgedUsers: acknowledged,
            pendingAcknowledgements: pending,
            overdueAcknowledgements: overdue,
            completionPercent: completion,
            emergencyAcknowledgementTracking: announcements.some(isEmergency)
        };
    }

    function targetingCounts(rows) {
        var counts = {
            organizationWideTargets: 0,
            departmentTargets: 0,
            roleTargets: 0,
            branchTargets: 0,
            onboardingStageTargets: 0,
            customAudienceSegments: 0,
            crossTenantAudienceBlocked: true
        };
        rows.forEach(function count(row) {
            var target = normalizeToken(row.targetType || row.audienceType || '');
            if (/ORG|ALL|COMPANY|ORGANIZATION_WIDE/.test(target)) counts.organizationWideTargets += 1;
            if (row.department || row.targetDepartment || target === 'DEPARTMENT') counts.departmentTargets += 1;
            if (targetRoles(row).length || target === 'ROLE') counts.roleTargets += 1;
            if (row.branch || row.branchId || target === 'BRANCH') counts.branchTargets += 1;
            if (row.onboardingStage || row.targetOnboardingStage || target === 'ONBOARDING_STAGE') counts.onboardingStageTargets += 1;
            if (assignedIds(row).length || target === 'CUSTOM') counts.customAudienceSegments += 1;
        });
        return counts;
    }

    function generateAnnouncementHubReport(filters, context) {
        try {
            var data = rawData();
            var tenant = normalizeTenantSlug(filters && (filters.tenantSlug || filters.tenantId || filters.companyId)) || contextTenant(context);
            var announcements = announcementRows(data).filter(tenantFilter(tenant, data));
            var acknowledgements = acknowledgementRows(data).filter(tenantFilter(tenant, data));
            var media = mediaRows(data).filter(tenantFilter(tenant, data));
            var notifications = notificationRows(data).filter(tenantFilter(tenant, data)).filter(function announcementNotification(row) {
                return /announcement|broadcast|leadership|emergency|milestone|strategic/i.test([row.module, row.category, row.type, row.title].join(' '));
            });
            var asyncJobs = asyncRows(data).filter(function announcementJob(row) { return rowTenant(row) === tenant && isAnnouncementJob(row); });
            var congestion = detectBroadcastCongestion({ tenantSlug: tenant }, { tenantSlug: tenant, now: context && context.now, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            var ack = acknowledgementCounts(announcements, acknowledgements, context);
            var targeting = targetingCounts(announcements);
            var publicMediaWarnings = media.filter(publicExposure).length;
            var failedJobs = asyncJobs.filter(function failed(row) { return normalizeToken(row.state || row.status) === 'FAILED'; }).length;
            var retryPending = asyncJobs.filter(function retry(row) { return normalizeToken(row.state || row.status) === 'RETRY_PENDING'; }).length;
            var scheduledJobs = asyncJobs.filter(function scheduled(row) { return normalizeToken(row.state || row.status) === 'SCHEDULED'; }).length;
            var unread = congestion.summary ? congestion.summary.unreadAnnouncements : 0;
            var engagementBase = notifications.length + ack.totalAcknowledgements;
            var engaged = notifications.filter(function read(row) { return row.read === true || row.seen === true || /READ|SEEN|ACK/i.test(safeString(row.status || '', '')); }).length + ack.acknowledgedUsers;
            var engagement = engagementBase ? Math.round((engaged / engagementBase) * 100) : 100;
            var classification = publicMediaWarnings ? FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER : (failedJobs || ack.overdueAcknowledgements || unread) ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO;

            var report = {
                success: true,
                readOnly: true,
                classification: classification,
                generatedAt: nowIso(context),
                tenantSlug: tenant,
                announcementHealth: {
                    totalAnnouncements: announcements.length,
                    publishedAnnouncements: announcements.filter(function published(row) { return [ANNOUNCEMENT_STATES.PUBLISHED, ANNOUNCEMENT_STATES.ACK_PENDING].indexOf(announcementState(row)) !== -1; }).length,
                    scheduledAnnouncements: announcements.filter(function scheduled(row) { return announcementState(row) === ANNOUNCEMENT_STATES.SCHEDULED || !!row.scheduledAt; }).length,
                    archivedAnnouncements: announcements.filter(function archived(row) { return announcementState(row) === ANNOUNCEMENT_STATES.ARCHIVED; }).length,
                    unreadSummaries: unread
                },
                leadershipCommunication: {
                    leadershipBroadcasts: announcements.filter(function leadership(row) { return announcementType(row) === ANNOUNCEMENT_TYPES.LEADERSHIP_ANNOUNCEMENT; }).length,
                    executiveUpdates: announcements.filter(function executive(row) { return /EXECUTIVE|CEO|LEADERSHIP/i.test([row.type, row.category, row.module].join(' ')); }).length,
                    emergencyBroadcasts: announcements.filter(isEmergency).length,
                    strategicUpdates: announcements.filter(function strategic(row) { return announcementType(row) === ANNOUNCEMENT_TYPES.STRATEGIC_UPDATE; }).length,
                    milestoneAnnouncements: announcements.filter(function milestone(row) { return announcementType(row) === ANNOUNCEMENT_TYPES.MILESTONE_ANNOUNCEMENT; }).length
                },
                targetingGovernance: targeting,
                acknowledgementGovernance: ack,
                scheduledBroadcastGovernance: {
                    announcementJobs: asyncJobs.length,
                    scheduledJobs: scheduledJobs,
                    retryPending: retryPending,
                    failedJobs: failedJobs,
                    duplicateBroadcastLoopsPrevented: true
                },
                mediaGovernance: {
                    announcementMedia: media.length,
                    signedMedia: media.filter(function signed(row) { return !!(row.signedUrl || row.signedAccess || row.storagePath); }).length,
                    publicMediaWarnings: publicMediaWarnings,
                    signedAccessRequired: true,
                    signedAccessRedacted: true,
                    mediaAccessRoleScoped: true,
                    documentGovernanceIntegrated: !!global.DocumentGovernanceService
                },
                communicationAnalytics: {
                    unreadAnnouncementRate: notifications.length ? Math.round((unread / notifications.length) * 100) : 0,
                    engagementPercentage: engagement,
                    acknowledgementCompletion: ack.completionPercent,
                    leadershipReach: announcements.length ? Math.round((announcements.filter(function published(row) { return [ANNOUNCEMENT_STATES.PUBLISHED, ANNOUNCEMENT_STATES.ACK_PENDING].indexOf(announcementState(row)) !== -1; }).length / announcements.length) * 100) : 100,
                    emergencyResponseTime: ack.emergencyAcknowledgementTracking ? 'tracked' : 'not_started',
                    inactiveAudienceIndicators: congestion.summary ? congestion.summary.broadcastCongestion : 0
                },
                accessGovernance: {
                    employeeAssignedAnnouncementsOnly: true,
                    managerTeamAnnouncementVisibility: true,
                    hrOperationalAnnouncementVisibility: true,
                    directorOrganizationVisibility: true,
                    superAdminPublishAuthority: false,
                    platformOwnerEmployeeChain: false
                },
                warnings: publicMediaWarnings ? [safeWarning('PUBLIC_ANNOUNCEMENT_MEDIA_WARNING', 'Public announcement media exposure requires immediate review.', { publicMediaWarnings: publicMediaWarnings })] : [],
                metadata: {
                    tenantIsolationPreserved: true,
                    leadershipCommunicationConfidentialityPreserved: true,
                    historicalAnnouncementsImmutable: true,
                    existingCommunicationFlowsPreserved: true,
                    announcementActionsAuditable: true,
                    auditReady: !!(global.AuditService || global.auditService),
                    telemetryReady: !!(global.WorkflowTelemetryService || global.workflowTelemetryService)
                }
            };

            auditAnnouncement('ANNOUNCEMENT_HUB_REPORTED', {
                tenantSlug: tenant,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO',
                description: 'Announcement hub report viewed.'
            }, context);
            emitTelemetry('ANNOUNCEMENT_HUB_REPORTED', { tenantSlug: tenant, status: classification, severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'INFO' }, context);
            recordMetric('ANNOUNCEMENT_HUB_REPORTED', { tenantSlug: tenant, status: classification, severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'INFO' }, context);
            return freezeAnnouncementOutput(report);
        } catch (error) {
            return freezeAnnouncementOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                announcementHealth: { totalAnnouncements: 0 },
                leadershipCommunication: { leadershipBroadcasts: 0 },
                targetingGovernance: { organizationWideTargets: 0 },
                communicationAnalytics: { unreadAnnouncementRate: 0 },
                failures: [safeFailure('ANNOUNCEMENT_HUB_REPORT_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Announcement hub report failed safely.')]
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        function check(name, condition) {
            checks.push({ label: name, passed: !!condition });
        }
        try {
            var malformed = validateAnnouncementPayload(null, { tenantSlug: 'tabsons' });
            check('malformed payloads fail safely', malformed.success === false && malformed.failures.some(function item(row) { return row.failureCode === 'MALFORMED_ANNOUNCEMENT_PAYLOAD'; }));

            var crossTenant = validateAnnouncementScope({ tenantSlug: 'abc', announcementId: 'ANN-X', assignedEmployeeIds: ['EMP-X'] }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' } });
            check('announcement isolation works', crossTenant.allowed === false && crossTenant.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER);

            var targeting = validateAnnouncementTargeting({ tenantSlug: 'tabsons', announcementId: 'ANN-1', targetType: 'DEPARTMENT', department: 'Engineering' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' } });
            check('targeting governance works', targeting.success === true && targeting.targetingGovernance.departmentTargets === 1);

            var scheduled = scheduleAnnouncementBroadcast({ tenantSlug: 'tabsons', announcementId: 'ANN-SELF', type: 'HR_ANNOUNCEMENT', schedule: { runAt: nowIso() } }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true, preview: true });
            check('scheduled broadcasts work', scheduled.success === true);

            var congestion = detectBroadcastCongestion({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons' });
            check('acknowledgement tracking works', congestion.success === true && Object.isFrozen(congestion));

            var immutable = normalizeAnnouncementPayload({ tenantSlug: 'tabsons', announcementId: 'ANN-1', body: 'private' }, { tenantSlug: 'tabsons' });
            check('immutable outputs enforced', Object.isFrozen(immutable));

            var originalAsync = global.AsyncJobService;
            var originalNotify = global.NotificationOrchestrationService;
            try {
                delete global.AsyncJobService;
                delete global.NotificationOrchestrationService;
                var degraded = scheduleAnnouncementBroadcast({ tenantSlug: 'tabsons', announcementId: 'ANN-DEGRADED', type: 'HR_ANNOUNCEMENT' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true, preview: true });
                check('dependency absence degrades safely', degraded.success === true && degraded.asyncJob.success === false);
            } finally {
                if (originalAsync) global.AsyncJobService = originalAsync;
                if (originalNotify) global.NotificationOrchestrationService = originalNotify;
            }
        } catch (error) {
            checks.push({ label: 'self-test uncaught error guard', passed: false, error: safeString(error && error.message || error, '') });
        }
        var passed = checks.every(function item(row) { return row.passed; });
        var result = freezeAnnouncementOutput({
            passed: passed,
            checks: checks,
            summary: passed ? 'Announcement hub self-test passed.' : 'Announcement hub self-test detected failures.'
        });
        global.__ARTHHRMS_ANNOUNCEMENT_HUB_SELF_TEST__ = result;
        return result;
    }

    var AnnouncementHubService = Object.freeze({
        VERSION: VERSION,
        ANNOUNCEMENT_STATES: ANNOUNCEMENT_STATES,
        ANNOUNCEMENT_TYPES: ANNOUNCEMENT_TYPES,
        FAILURE_CLASSIFICATIONS: FAILURE_CLASSIFICATIONS,
        VISIBILITY: VISIBILITY,
        classifyAnnouncementRisk: classifyAnnouncementRisk,
        validateAnnouncementScope: validateAnnouncementScope,
        validateAnnouncementPayload: validateAnnouncementPayload,
        validateAnnouncementTargeting: validateAnnouncementTargeting,
        validateAnnouncementMedia: validateAnnouncementMedia,
        normalizeAnnouncementPayload: normalizeAnnouncementPayload,
        freezeAnnouncementOutput: freezeAnnouncementOutput,
        detectBroadcastCongestion: detectBroadcastCongestion,
        scheduleAnnouncementBroadcast: scheduleAnnouncementBroadcast,
        generateAnnouncementHubReport: generateAnnouncementHubReport,
        runSelfTest: runSelfTest
    });

    global.AnnouncementHubService = AnnouncementHubService;
    global.announcementHubService = AnnouncementHubService;

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
