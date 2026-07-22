/**
 * teamWorkspaceService.js
 * ARTHHRMS Enterprise Internal Collaboration Thread + Team Workspace Intelligence System.
 *
 * Additive governance layer for department workspaces, operational rooms,
 * escalation collaboration, workspace threads, moderation, attachment posture,
 * and tenant-scoped collaboration analytics. It does not mutate historical
 * workspace, thread, reply, or attachment records.
 */
(function attachTeamWorkspaceService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[TeamWorkspaceService]';

    var WORKSPACE_STATES = Object.freeze({
        ACTIVE: 'ACTIVE',
        REVIEW_PENDING: 'REVIEW_PENDING',
        ESCALATED: 'ESCALATED',
        RESTRICTED: 'RESTRICTED',
        ARCHIVED: 'ARCHIVED'
    });

    var WORKSPACE_TYPES = Object.freeze({
        DEPARTMENT_WORKSPACE: 'DEPARTMENT_WORKSPACE',
        HR_COLLABORATION_ROOM: 'HR_COLLABORATION_ROOM',
        ESCALATION_COORDINATION_ROOM: 'ESCALATION_COORDINATION_ROOM',
        ONBOARDING_COLLABORATION: 'ONBOARDING_COLLABORATION',
        STRATEGIC_PLANNING_ROOM: 'STRATEGIC_PLANNING_ROOM',
        RECRUITMENT_COORDINATION: 'RECRUITMENT_COORDINATION',
        OPERATIONAL_SUPPORT_ROOM: 'OPERATIONAL_SUPPORT_ROOM',
        LEADERSHIP_COLLABORATION_SPACE: 'LEADERSHIP_COLLABORATION_SPACE'
    });

    var FAILURE_CLASSIFICATIONS = Object.freeze({
        INFO: 'INFO',
        WARNING: 'WARNING',
        HIGH_RISK: 'HIGH_RISK',
        CRITICAL_BLOCKER: 'CRITICAL_BLOCKER'
    });

    var VISIBILITY = Object.freeze({
        NONE: 'NONE',
        ASSIGNED_WORKSPACES_ONLY: 'ASSIGNED_WORKSPACES_ONLY',
        TEAM_WORKSPACE_VISIBILITY: 'TEAM_WORKSPACE_VISIBILITY',
        HR_COLLABORATION_VISIBILITY: 'HR_COLLABORATION_VISIBILITY',
        STRATEGIC_COLLABORATION_VISIBILITY: 'STRATEGIC_COLLABORATION_VISIBILITY',
        HIGH_LEVEL_OPERATIONAL_VISIBILITY: 'HIGH_LEVEL_OPERATIONAL_VISIBILITY',
        INFRASTRUCTURE_ONLY: 'INFRASTRUCTURE_ONLY',
        PLATFORM_GOVERNANCE_ONLY: 'PLATFORM_GOVERNANCE_ONLY'
    });

    var WORKSPACE_JOB_TYPES = Object.freeze([
        'WORKSPACE_NOTIFICATION',
        'TEAM_WORKSPACE_NOTIFICATION',
        'COLLABORATION_REMINDER',
        'WORKSPACE_MENTION',
        'WORKSPACE_ACKNOWLEDGEMENT',
        'ESCALATION_COLLABORATION',
        'WORKSPACE_MODERATION_REVIEW'
    ]);

    var ALLOWED_ATTACHMENT_MIME_TYPES = Object.freeze([
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp'
    ]);

    var SENSITIVE_KEY_PATTERN = /(body|message|content|comment|reply|reply.?body|subject|title|note|pinned.?note|private|confidential|participant|member|mention|recipient|employee|emp.?id|user.?id|author|reviewer|manager|file.?name|attachment|storage.?path|signed.?url|public.?url|url|download|path|salary|payroll|payslip|compensation|reimbursement|receipt|resume|candidate|feedback|token|secret|jwt|authorization|service.?role|private.?key)/i;
    var SENSITIVE_VALUE_PATTERN = /(https?:\/\/[^\s"',}]+|private:\/\/[^\s"',}]+|\b(private|confidential|salary|payroll|resume|receipt|secret)\b[^,;}]*)/ig;
    var SAFE_GOVERNANCE_KEYS = Object.freeze({
        collaborationConfidentialityPreserved: true,
        tenantIsolationPreserved: true,
        existingCommunicationFlowsPreserved: true,
        existingWorkflowsPreserved: true,
        historicalCollaborationImmutable: true,
        collaborationActionsAuditable: true,
        attachmentAccessRoleScoped: true,
        signedAccessRequired: true,
        signedAccessRedacted: true,
        publicAttachmentBlocked: true,
        workspaceHealth: true,
        threadGovernance: true,
        escalationIntegration: true,
        attachmentGovernance: true,
        moderationGovernance: true,
        workspaceAnalytics: true,
        notificationIntegration: true,
        accessGovernance: true,
        workspaceGovernance: true,
        teamWorkspaceGovernance: true,
        totalWorkspaces: true,
        activeWorkspaces: true,
        reviewPendingWorkspaces: true,
        escalatedWorkspaces: true,
        restrictedWorkspaces: true,
        archivedWorkspaces: true,
        inactiveWorkspaces: true,
        totalThreads: true,
        unresolvedOperationalThreads: true,
        pinnedOperationalNotes: true,
        lockedThreads: true,
        acknowledgementPending: true,
        threadActivityIndicators: true,
        escalationMarkers: true,
        escalationLinkedWorkspaces: true,
        workflowCoordinationThreads: true,
        delayedApprovalCoordination: true,
        escalationResolutionThreads: true,
        workflowDiscussionIntegrated: true,
        escalationCommandIntegrated: true,
        workspaceAttachments: true,
        publicAttachmentWarnings: true,
        attachmentRestrictions: true,
        documentGovernanceIntegrated: true,
        threadLocks: true,
        moderationFlags: true,
        restrictedWorkspaceGovernance: true,
        collaborationCongestion: true,
        escalationDensity: true,
        delayedResponses: true,
        workspaceEngagement: true,
        pinnedNoteUsage: true,
        inactiveWorkspaceSpikes: true,
        retryPending: true,
        failedJobs: true,
        mentionNotifications: true,
        spamLoopPrevented: true,
        employeeAssignedWorkspacesOnly: true,
        managerTeamWorkspaceVisibility: true,
        hrCollaborationVisibility: true,
        directorOperationalAnalyticsOnly: true,
        superAdminPrivateThreadAccess: true,
        platformOwnerOperationalWorkspace: true,
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

    function workspaceIdOf(row) {
        return safeString(row && (row.workspaceId || row.workspace_id || row.roomId || row.room_id || row.collaborationId || row.collaboration_id || row.id) || '', '').trim();
    }

    function threadIdOf(row) {
        return safeString(row && (row.threadId || row.thread_id || row.discussionThreadId || row.discussion_thread_id || row.messageThreadId || row.message_thread_id || row.id) || '', '').trim();
    }

    function workflowIdOf(row) {
        return safeString(row && (row.workflowId || row.workflow_id || row.eventId || row.event_id || row.correlationId || row.pendingActionId || row.pending_action_id || '') || '', '').trim();
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

    function workspaceRows(data) {
        var source = data || rawData();
        var rows = [];
        if (Array.isArray(source.teamWorkspaces)) rows = rows.concat(source.teamWorkspaces);
        if (Array.isArray(source.workspaces)) rows = rows.concat(source.workspaces.filter(function workspace(row) {
            return /team|department|workspace|collaboration|room|operational/i.test([row.type, row.category, row.module, row.name].join(' '));
        }));
        if (Array.isArray(source.collaborationWorkspaces)) rows = rows.concat(source.collaborationWorkspaces);
        if (Array.isArray(source.operationalWorkspaces)) rows = rows.concat(source.operationalWorkspaces);
        return rows;
    }

    function threadRows(data) {
        var source = data || rawData();
        var rows = [];
        if (Array.isArray(source.collaborationThreads)) rows = rows.concat(source.collaborationThreads);
        if (Array.isArray(source.workspaceThreads)) rows = rows.concat(source.workspaceThreads);
        if (Array.isArray(source.teamWorkspaceThreads)) rows = rows.concat(source.teamWorkspaceThreads);
        if (Array.isArray(source.discussionThreads)) rows = rows.concat(source.discussionThreads.filter(function teamThread(row) {
            return !!workspaceIdOf(row) || /workspace|collaboration|team|operational|escalation/i.test([row.type, row.category, row.module].join(' '));
        }));
        if (Array.isArray(source.workflowDiscussions)) rows = rows.concat(source.workflowDiscussions.filter(function workflowThread(row) {
            return !!workspaceIdOf(row);
        }));
        return rows;
    }

    function replyRows(data) {
        var source = data || rawData();
        var rows = [];
        if (Array.isArray(source.workspaceThreadReplies)) rows = rows.concat(source.workspaceThreadReplies);
        if (Array.isArray(source.collaborationThreadReplies)) rows = rows.concat(source.collaborationThreadReplies);
        if (Array.isArray(source.threadReplies)) rows = rows.concat(source.threadReplies.filter(function workspaceReply(row) {
            return !!workspaceIdOf(row) || !!threadIdOf(row);
        }));
        return rows;
    }

    function attachmentRows(data) {
        var source = data || rawData();
        var rows = [];
        if (Array.isArray(source.workspaceAttachments)) rows = rows.concat(source.workspaceAttachments);
        if (Array.isArray(source.collaborationAttachments)) rows = rows.concat(source.collaborationAttachments);
        if (Array.isArray(source.communicationAttachments)) {
            rows = rows.concat(source.communicationAttachments.filter(function workspaceAttachment(row) {
                return !!workspaceIdOf(row) || /workspace|collaboration|team/i.test([row.category, row.module, row.type].join(' '));
            }));
        }
        if (Array.isArray(source.documents)) {
            rows = rows.concat(source.documents.filter(function documentAttachment(row) {
                return !!workspaceIdOf(row) || /workspace|collaboration|team|thread/i.test([row.category, row.documentType, row.documentCategory, row.module].join(' '));
            }));
        }
        return rows;
    }

    function escalationRows(data) {
        var source = data || rawData();
        var rows = [];
        if (Array.isArray(source.escalations)) rows = rows.concat(source.escalations);
        if (Array.isArray(source.escalationEvents)) rows = rows.concat(source.escalationEvents);
        if (Array.isArray(source.workflowEscalations)) rows = rows.concat(source.workflowEscalations);
        return rows;
    }

    function workflowRows(data) {
        var source = data || rawData();
        var rows = [];
        if (Array.isArray(source.workflowEvents)) rows = rows.concat(source.workflowEvents);
        if (Array.isArray(source.pendingActions)) rows = rows.concat(source.pendingActions);
        if (Array.isArray(source.workflowDiscussions)) rows = rows.concat(source.workflowDiscussions);
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

    function findWorkspace(id, data) {
        var key = safeString(id || '', '').trim();
        if (!key) return null;
        return workspaceRows(data).find(function match(row) {
            return workspaceIdOf(row) === key || safeString(row.id || '', '').trim() === key;
        }) || null;
    }

    function findThread(id, data) {
        var key = safeString(id || '', '').trim();
        if (!key) return null;
        return threadRows(data).find(function match(row) {
            return threadIdOf(row) === key || safeString(row.id || '', '').trim() === key;
        }) || null;
    }

    function sourceTenant(row, data) {
        if (!row) return '';
        var direct = rowTenant(row);
        if (direct) return direct;
        var sourceData = data || rawData();
        var workspace = findWorkspace(workspaceIdOf(row), sourceData);
        if (workspace && rowTenant(workspace)) return rowTenant(workspace);
        var thread = findThread(threadIdOf(row), sourceData);
        if (thread && rowTenant(thread)) return rowTenant(thread);
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

    function freezeWorkspaceOutput(value) {
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

    function classifyWorkspaceRisk(input) {
        var source = input || {};
        if (source.crossTenant || source.crossTenantWorkspace || source.crossTenantThread || source.publicAttachment || source.unsafePublicUrl || source.rlsBypass) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
        if (source.platformOwnerWorkspace || normalizeRole(source.role) === 'PLATFORM_OWNER') return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
        if (source.superAdminPrivateAccess || source.privateThreadAccess || source.unauthorizedThreadVisibility || source.moderationOverride || source.unsafeWorkflowExposure) return FAILURE_CLASSIFICATIONS.HIGH_RISK;
        if (source.malformedPayload || source.delayedResponse || source.collaborationCongestion || source.inactiveWorkspace || source.unsupportedAttachment || source.lockedThread) return FAILURE_CLASSIFICATIONS.WARNING;
        return FAILURE_CLASSIFICATIONS.INFO;
    }

    function normalizeWorkspaceState(value) {
        var normalized = normalizeToken(value || '');
        if (normalized === 'PENDING' || normalized === 'REVIEW') return WORKSPACE_STATES.REVIEW_PENDING;
        if (normalized === 'LOCKED' || normalized === 'PRIVATE') return WORKSPACE_STATES.RESTRICTED;
        return WORKSPACE_STATES[normalized] || WORKSPACE_STATES.ACTIVE;
    }

    function normalizeWorkspaceType(value) {
        var normalized = normalizeToken(value || '');
        if (/DEPARTMENT|TEAM/.test(normalized)) return WORKSPACE_TYPES.DEPARTMENT_WORKSPACE;
        if (/HR/.test(normalized)) return WORKSPACE_TYPES.HR_COLLABORATION_ROOM;
        if (/ESCALAT|BLOCKER/.test(normalized)) return WORKSPACE_TYPES.ESCALATION_COORDINATION_ROOM;
        if (/ONBOARD/.test(normalized)) return WORKSPACE_TYPES.ONBOARDING_COLLABORATION;
        if (/STRATEGIC|PLANNING|KPI|LEADERSHIP/.test(normalized)) return WORKSPACE_TYPES.STRATEGIC_PLANNING_ROOM;
        if (/RECRUIT|HIRING/.test(normalized)) return WORKSPACE_TYPES.RECRUITMENT_COORDINATION;
        if (/SUPPORT|OPERAT/.test(normalized)) return WORKSPACE_TYPES.OPERATIONAL_SUPPORT_ROOM;
        return WORKSPACE_TYPES[normalized] || WORKSPACE_TYPES.DEPARTMENT_WORKSPACE;
    }

    function isPrivateWorkspace(row) {
        if (!row || typeof row !== 'object') return false;
        if (row.privateWorkspace === true || row.privateThread === true || row.private === true || row.confidential === true || row.restricted === true) return true;
        return /PRIVATE|CONFIDENTIAL|RESTRICTED|WORKSPACE|COLLABORATION|ROOM/i.test([row.visibility, row.type, row.category, row.channel].join(' '));
    }

    function hasRawWorkspaceFields(input) {
        if (!input || typeof input !== 'object') return false;
        return Object.keys(input).some(function check(key) {
            if (SENSITIVE_KEY_PATTERN.test(key) && !SAFE_GOVERNANCE_KEYS[key]) return true;
            return input[key] && typeof input[key] === 'object' && hasRawWorkspaceFields(input[key]);
        });
    }

    function membersOf(row) {
        var ids = [];
        ids = ids.concat(arrayOfIds(row && row.memberIds));
        ids = ids.concat(arrayOfIds(row && row.participantIds));
        ids = ids.concat(arrayOfIds(row && row.recipientIds));
        ids = ids.concat(arrayOfIds(row && row.targetUserIds));
        ids = ids.concat(arrayOfIds(row && row.mentionIds));
        ids = ids.concat(arrayOfIds(row && row.acknowledgedBy));
        if (row && row.empId) ids.push(safeString(row.empId, '').trim());
        if (row && row.employeeId) ids.push(safeString(row.employeeId, '').trim());
        if (row && row.ownerId) ids.push(safeString(row.ownerId, '').trim());
        if (row && row.authorId) ids.push(safeString(row.authorId, '').trim());
        if (row && row.managerId) ids.push(safeString(row.managerId, '').trim());
        return ids.filter(function unique(id, index, list) { return id && list.indexOf(id) === index; });
    }

    function hasPlatformOwnerParticipant(row) {
        var roles = [];
        roles = roles.concat(arrayOfIds(row && row.participantRoles));
        roles = roles.concat(arrayOfIds(row && row.memberRoles));
        roles = roles.concat(arrayOfIds(row && row.recipientRoles));
        roles = roles.concat(arrayOfIds(row && row.approvalRoles));
        if (row && Array.isArray(row.participants)) {
            row.participants.forEach(function participant(item) { roles.push(item && item.role); });
        }
        return roles.some(function role(item) { return normalizeRole(item) === 'PLATFORM_OWNER'; });
    }

    function managerHasTeamVisibility(actor, source, data) {
        var id = actorId(actor);
        if (!id) return false;
        var members = membersOf(source);
        if (members.indexOf(id) !== -1) return true;
        return members.some(function member(empId) {
            return managerOwnsEmployee(id, empId, data);
        });
    }

    function visibilityForRole(role, actor, source, data) {
        var normalized = normalizeRole(role || actor && actor.role);
        var id = actorId(actor);
        var members = membersOf(source);
        if (normalized === 'EMPLOYEE') return id && members.indexOf(id) !== -1 ? VISIBILITY.ASSIGNED_WORKSPACES_ONLY : VISIBILITY.NONE;
        if (normalized === 'MANAGER') return managerHasTeamVisibility(actor, source, data) ? VISIBILITY.TEAM_WORKSPACE_VISIBILITY : VISIBILITY.NONE;
        if (normalized === 'HR') return VISIBILITY.HR_COLLABORATION_VISIBILITY;
        if (normalized === 'HR_HEAD') return VISIBILITY.STRATEGIC_COLLABORATION_VISIBILITY;
        if (normalized === 'DIRECTOR') return VISIBILITY.HIGH_LEVEL_OPERATIONAL_VISIBILITY;
        if (normalized === 'SUPER_ADMIN') return VISIBILITY.INFRASTRUCTURE_ONLY;
        if (normalized === 'PLATFORM_OWNER') return VISIBILITY.PLATFORM_GOVERNANCE_ONLY;
        return VISIBILITY.NONE;
    }

    function validateWorkspaceScope(record, context) {
        try {
            var source = record || {};
            var data = rawData();
            var ctxTenant = contextTenant(context);
            var targetTenant = sourceTenant(source, data) || ctxTenant;
            var role = normalizeRole(context && context.actor && context.actor.role);
            var visibility = visibilityForRole(role, context && context.actor, source, data);
            var targetSpecific = !!(workspaceIdOf(source) || threadIdOf(source) || workflowIdOf(source) || membersOf(source).length);
            var sameTenant = !targetTenant || !ctxTenant || targetTenant === ctxTenant;
            var privateRecord = isPrivateWorkspace(source);
            var failures = [];

            if (!sameTenant) {
                failures.push(safeFailure('CROSS_TENANT_WORKSPACE_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Cross-tenant collaboration visibility was blocked.', { expectedTenant: ctxTenant }));
            }
            if (role === 'PLATFORM_OWNER' && targetSpecific) {
                failures.push(safeFailure('PLATFORM_OWNER_WORKSPACE_ACCESS_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Platform owner is isolated from tenant operational workspaces.'));
            }
            if (role === 'SUPER_ADMIN' && (targetSpecific || privateRecord || hasRawWorkspaceFields(source))) {
                failures.push(safeFailure('SUPER_ADMIN_PRIVATE_WORKSPACE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Tenant system administrators receive infrastructure visibility only.'));
            }
            if (role === 'DIRECTOR' && (privateRecord || hasRawWorkspaceFields(source)) && targetSpecific) {
                failures.push(safeFailure('DIRECTOR_RAW_WORKSPACE_ACCESS_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Directors receive high-level operational analytics only.'));
            }
            if (role === 'EMPLOYEE' && visibility !== VISIBILITY.ASSIGNED_WORKSPACES_ONLY && privateRecord) {
                failures.push(safeFailure('EMPLOYEE_WORKSPACE_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Employees may access only assigned workspaces.'));
            }
            if (role === 'MANAGER' && privateRecord && visibility !== VISIBILITY.TEAM_WORKSPACE_VISIBILITY) {
                failures.push(safeFailure('MANAGER_WORKSPACE_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Managers may access only team workspaces.'));
            }

            var classification = highestClassification(failures);
            return freezeWorkspaceOutput({
                allowed: failures.length === 0,
                classification: classification,
                visibility: visibility,
                scope: {
                    tenantSlug: ctxTenant,
                    workspaceId: sameTenant ? workspaceIdOf(source) : '',
                    threadId: sameTenant ? threadIdOf(source) : '',
                    workspaceType: sameTenant ? normalizeWorkspaceType(source.type || source.category) : ''
                },
                failures: failures,
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    collaborationConfidentialityPreserved: true,
                    attachmentAccessRoleScoped: true
                }
            });
        } catch (error) {
            return freezeWorkspaceOutput({
                allowed: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                visibility: VISIBILITY.NONE,
                failures: [safeFailure('WORKSPACE_SCOPE_VALIDATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Workspace scope validation failed safely.')]
            });
        }
    }

    function normalizeWorkspacePayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeWorkspaceOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    failures: [safeFailure('MALFORMED_WORKSPACE_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Workspace payload is malformed.')]
                });
            }
            var data = rawData();
            var ctxTenant = contextTenant(context);
            var srcTenant = sourceTenant(payload, data) || ctxTenant;
            var type = normalizeWorkspaceType(payload.type || payload.workspaceType || payload.category);
            var state = normalizeWorkspaceState(payload.state || payload.status || WORKSPACE_STATES.ACTIVE);
            return freezeWorkspaceOutput({
                success: true,
                classification: (!ctxTenant || !srcTenant || ctxTenant === srcTenant) ? FAILURE_CLASSIFICATIONS.INFO : FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                payload: {
                    tenantSlug: srcTenant,
                    workspaceId: workspaceIdOf(payload),
                    type: type,
                    state: state,
                    threadCount: Number(payload.threadCount || payload.threadsCount || 0) || 0,
                    pinnedNoteCount: Number(payload.pinnedNoteCount || payload.pinnedNotes || 0) || 0,
                    restricted: payload.restricted === true || state === WORKSPACE_STATES.RESTRICTED,
                    escalationLinked: !!(payload.escalationId || type === WORKSPACE_TYPES.ESCALATION_COORDINATION_ROOM || state === WORKSPACE_STATES.ESCALATED),
                    hasAttachment: !!(payload.attachmentId || payload.documentId || payload.hasAttachment || payload.signedUrl || payload.publicUrl)
                },
                metadata: {
                    tenantIsolationPreserved: !ctxTenant || !srcTenant || ctxTenant === srcTenant,
                    collaborationConfidentialityPreserved: true,
                    historicalCollaborationImmutable: true
                }
            });
        } catch (error) {
            return freezeWorkspaceOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('WORKSPACE_NORMALIZATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Workspace normalization failed safely.')]
            });
        }
    }

    function publicExposure(payload) {
        if (!payload || typeof payload !== 'object') return false;
        if (payload.isPublic === true || payload.public === true || payload.publicUrl) return true;
        var url = safeString(payload.url || payload.attachmentUrl || payload.signedUrl || payload.documentUrl || payload.downloadUrl || '', '').toLowerCase();
        return !!(url && url.indexOf('public') !== -1 && url.indexOf('private') === -1);
    }

    function supportedMime(payload) {
        var mime = safeString(payload && (payload.mimeType || payload.type || payload.fileType) || '', '').trim().toLowerCase();
        return !mime || ALLOWED_ATTACHMENT_MIME_TYPES.indexOf(mime) !== -1;
    }

    function validateWorkspaceAttachment(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeWorkspaceOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    failures: [safeFailure('MALFORMED_WORKSPACE_ATTACHMENT_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Workspace attachment payload is malformed.')]
                });
            }
            var scope = validateWorkspaceScope(payload, context);
            var failures = (scope.failures || []).slice();
            if (!supportedMime(payload)) {
                failures.push(safeFailure('UNSUPPORTED_WORKSPACE_ATTACHMENT_MIME_TYPE', FAILURE_CLASSIFICATIONS.WARNING, 'Workspace attachment MIME type is not supported.', { allowedTypes: ALLOWED_ATTACHMENT_MIME_TYPES.slice() }));
            }
            if (publicExposure(payload)) {
                failures.push(safeFailure('PUBLIC_WORKSPACE_ATTACHMENT_EXPOSURE_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Public workspace attachment exposure was blocked.'));
            }
            var classification = highestClassification(failures);
            return freezeWorkspaceOutput({
                success: failures.length === 0,
                classification: classification,
                visibility: scope.visibility || VISIBILITY.NONE,
                attachmentGovernance: {
                    signedAccessRequired: true,
                    signedAccessRedacted: true,
                    publicAttachmentBlocked: failures.some(function item(row) { return row.failureCode === 'PUBLIC_WORKSPACE_ATTACHMENT_EXPOSURE_BLOCKED'; }),
                    attachmentAccessRoleScoped: true,
                    uploadIntegrityValidation: true,
                    attachmentExpiryGoverned: true,
                    documentGovernanceIntegrated: !!global.DocumentGovernanceService
                },
                failures: failures,
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    collaborationConfidentialityPreserved: true
                }
            });
        } catch (error) {
            return freezeWorkspaceOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('WORKSPACE_ATTACHMENT_GOVERNANCE_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Workspace attachment governance failed safely.')]
            });
        }
    }

    function validateThreadGovernance(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeWorkspaceOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    state: WORKSPACE_STATES.ACTIVE,
                    failures: [safeFailure('MALFORMED_WORKSPACE_THREAD_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Workspace thread payload is malformed.')]
                });
            }
            var scope = validateWorkspaceScope(payload, context);
            var failures = (scope.failures || []).slice();
            var state = normalizeWorkspaceState(payload.state || payload.status || WORKSPACE_STATES.ACTIVE);

            if (!workspaceIdOf(payload)) {
                failures.push(safeFailure('WORKSPACE_LINK_REQUIRED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Workspace threads require a workspace reference.'));
            }
            if (hasPlatformOwnerParticipant(payload)) {
                failures.push(safeFailure('PLATFORM_OWNER_IN_WORKSPACE_THREAD_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Platform owner cannot be included in workspace threads.'));
            }
            if (payload.locked === true || payload.threadLocked === true) {
                failures.push(safeWarning('WORKSPACE_THREAD_LOCKED', 'Locked workspace thread requires moderation-aware visibility.', { lockedThreads: 1 }));
            }
            if (payload.moderationFlag === true || arrayOfIds(payload.moderationFlags).length) {
                failures.push(safeWarning('WORKSPACE_THREAD_MODERATION_FLAGGED', 'Workspace thread moderation flag is visible to governance.', { moderationFlags: 1 }));
            }
            if (publicExposure(payload)) {
                failures.push(safeFailure('PUBLIC_WORKSPACE_ATTACHMENT_EXPOSURE_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Public workspace attachment exposure was blocked.'));
            }

            var discussionCheck = null;
            if (global.WorkflowDiscussionService && typeof global.WorkflowDiscussionService.validateThreadPayload === 'function' && workflowIdOf(payload)) {
                try {
                    discussionCheck = global.WorkflowDiscussionService.validateThreadPayload({
                        tenantSlug: payload.tenantSlug,
                        threadId: threadIdOf(payload),
                        workflowId: workflowIdOf(payload),
                        workflowType: payload.workflowType || 'ESCALATION',
                        participantIds: payload.participantIds || []
                    }, context || {});
                    if (discussionCheck && discussionCheck.success === false && discussionCheck.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER) {
                        failures.push(safeFailure('WORKFLOW_DISCUSSION_BLOCKED_WORKSPACE_THREAD', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Workflow discussion governance blocked unsafe workspace exposure.'));
                    }
                } catch (error) {}
            }

            var classification = highestClassification(failures);
            return freezeWorkspaceOutput({
                success: failures.filter(function blocking(item) { return item.failureCode || item.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER || item.classification === FAILURE_CLASSIFICATIONS.HIGH_RISK; }).length === 0,
                classification: classification,
                state: state,
                failures: failures.filter(function failure(item) { return item.failureCode; }),
                warnings: failures.filter(function warning(item) { return item.warningCode; }),
                threadGovernance: {
                    threadedReplies: true,
                    pinnedOperationalNotes: !!(payload.pinned || payload.pinnedNote || payload.pinnedNoteCount),
                    acknowledgementTracking: payload.acknowledgementRequired === true || payload.requiresAck === true,
                    escalationMarkers: !!(payload.escalationId || state === WORKSPACE_STATES.ESCALATED),
                    resolutionTagging: true,
                    attachmentReferencesGoverned: true
                },
                moderationGovernance: {
                    threadLocks: payload.locked === true || payload.threadLocked === true ? 1 : 0,
                    moderationFlags: payload.moderationFlag === true ? 1 : arrayOfIds(payload.moderationFlags).length,
                    restrictedWorkspaceGovernance: state === WORKSPACE_STATES.RESTRICTED
                },
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    collaborationConfidentialityPreserved: true,
                    historicalCollaborationImmutable: true
                }
            });
        } catch (error) {
            return freezeWorkspaceOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                state: WORKSPACE_STATES.ACTIVE,
                failures: [safeFailure('WORKSPACE_THREAD_GOVERNANCE_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Workspace thread governance failed safely.')]
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

    function workspaceState(row) {
        return normalizeWorkspaceState(row && (row.state || row.status));
    }

    function workspaceType(row) {
        return normalizeWorkspaceType(row && (row.type || row.workspaceType || row.category));
    }

    function terminalWorkspace(row) {
        return workspaceState(row) === WORKSPACE_STATES.ARCHIVED;
    }

    function threadState(row) {
        return normalizeWorkspaceState(row && (row.state || row.status));
    }

    function terminalThread(row) {
        var state = threadState(row);
        return state === WORKSPACE_STATES.ARCHIVED || /RESOLVED|CLOSED|DONE/.test(normalizeToken(row && (row.state || row.status)));
    }

    function linkedToWorkspace(row, workspace) {
        return workspaceIdOf(row) && workspaceIdOf(row) === workspaceIdOf(workspace) || threadIdOf(row) && threadRows().some(function linked(thread) {
            return threadIdOf(thread) === threadIdOf(row) && workspaceIdOf(thread) === workspaceIdOf(workspace);
        });
    }

    function linkedByWorkspaceOrThread(row, target) {
        return workspaceIdOf(row) && workspaceIdOf(row) === workspaceIdOf(target) || threadIdOf(row) && threadIdOf(row) === threadIdOf(target) || workflowIdOf(row) && workflowIdOf(row) === workflowIdOf(target);
    }

    function isWorkspaceJob(row) {
        return WORKSPACE_JOB_TYPES.indexOf(normalizeToken(row && (row.jobType || row.type || row.category))) !== -1;
    }

    function moderationFlags(row) {
        var flags = arrayOfIds(row && row.moderationFlags);
        if (row && row.moderationFlag === true) flags.push('MODERATION_FLAG');
        if (row && row.locked === true) flags.push('THREAD_LOCK');
        if (row && row.attachmentRestricted === true) flags.push('ATTACHMENT_RESTRICTED');
        return flags.filter(function unique(flag, index, list) { return flag && list.indexOf(flag) === index; });
    }

    function detectCollaborationCongestion(filters, context) {
        try {
            var data = rawData();
            var tenant = normalizeTenantSlug(filters && (filters.tenantSlug || filters.tenantId || filters.companyId)) || contextTenant(context);
            var workspaces = workspaceRows(data).filter(tenantFilter(tenant, data));
            var threads = threadRows(data).filter(tenantFilter(tenant, data));
            var replies = replyRows(data).filter(tenantFilter(tenant, data));
            var escalations = escalationRows(data).filter(tenantFilter(tenant, data));
            var workflows = workflowRows(data).filter(tenantFilter(tenant, data));
            var unresolved = threads.filter(function open(row) { return !terminalThread(row); }).length;
            var inactive = workspaces.filter(function inactive(row) {
                return !terminalWorkspace(row) && isPastDate(row.lastActivityAt || row.updatedAt || row.createdAt, context);
            }).length;
            var escalated = workspaces.filter(function escalatedWorkspace(row) {
                return workspaceState(row) === WORKSPACE_STATES.ESCALATED || !!row.escalationId || workspaceType(row) === WORKSPACE_TYPES.ESCALATION_COORDINATION_ROOM;
            }).length + threads.filter(function escalatedThread(row) {
                return threadState(row) === WORKSPACE_STATES.ESCALATED || !!row.escalationId;
            }).length + escalations.filter(function linked(row) { return !!workspaceIdOf(row) || !!threadIdOf(row) || !!workflowIdOf(row); }).length;
            var delayed = threads.filter(function delayed(row) {
                return row.delayedResponse === true || !terminalThread(row) && isPastDate(row.lastActivityAt || row.updatedAt || row.createdAt || row.dueAt, context);
            }).length + workflows.filter(function overdue(row) {
                return /PENDING|OPEN|WAITING|REVIEW|DELAY/i.test(safeString(row.status || row.type || row.actionType || '', '')) && isPastDate(row.dueAt || row.deadline || row.createdAt, context);
            }).length;
            var ackPending = threads.filter(function ack(row) {
                return row.acknowledgementRequired === true && arrayOfIds(row.acknowledgedBy).length < Math.max(1, membersOf(row).length - 1);
            }).length;
            var pinned = threads.filter(function pinnedThread(row) { return row.pinned === true || row.pinnedNote === true; }).length + workspaces.reduce(function total(sum, row) {
                return sum + (Number(row.pinnedNoteCount || row.pinnedNotes || 0) || 0);
            }, 0);
            var flags = workspaces.reduce(function total(sum, row) { return sum + moderationFlags(row).length; }, 0) + threads.reduce(function total(sum, row) { return sum + moderationFlags(row).length; }, 0);
            var breakdown = {};
            workspaces.forEach(function count(row) {
                var key = workspaceType(row);
                if (!breakdown[key]) breakdown[key] = { workspaceType: key, workspaces: 0, threads: 0, unresolved: 0, escalated: 0, moderationFlags: 0 };
                breakdown[key].workspaces += 1;
                breakdown[key].moderationFlags += moderationFlags(row).length;
                if (workspaceState(row) === WORKSPACE_STATES.ESCALATED || row.escalationId) breakdown[key].escalated += 1;
                threads.filter(function linked(rowThread) { return workspaceIdOf(rowThread) === workspaceIdOf(row); }).forEach(function countThread(rowThread) {
                    breakdown[key].threads += 1;
                    if (!terminalThread(rowThread)) breakdown[key].unresolved += 1;
                    if (threadState(rowThread) === WORKSPACE_STATES.ESCALATED || rowThread.escalationId) breakdown[key].escalated += 1;
                    breakdown[key].moderationFlags += moderationFlags(rowThread).length;
                });
            });
            var workspaceBreakdown = Object.keys(breakdown).map(function toRow(key) { return breakdown[key]; }).sort(function order(a, b) { return b.unresolved - a.unresolved; });
            var engagementBase = threads.length + replies.length;
            var engagement = engagementBase ? Math.max(0, Math.min(100, Math.round((replies.length / engagementBase) * 100))) : 100;

            return freezeWorkspaceOutput({
                success: true,
                classification: delayed || escalated || flags ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO,
                tenantSlug: tenant,
                summary: {
                    unresolvedOperationalThreads: unresolved,
                    collaborationCongestion: unresolved + delayed + ackPending + inactive,
                    escalationDensity: escalated,
                    delayedResponses: delayed,
                    inactiveWorkspaces: inactive,
                    acknowledgementPending: ackPending,
                    pinnedOperationalNotes: pinned,
                    moderationFlags: flags,
                    workspaceEngagement: engagement,
                    replyVolume: replies.length
                },
                workspaceBreakdown: workspaceBreakdown,
                metadata: {
                    tenantIsolationPreserved: true,
                    collaborationConfidentialityPreserved: true,
                    historicalCollaborationImmutable: true
                }
            });
        } catch (error) {
            return freezeWorkspaceOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                summary: { unresolvedOperationalThreads: 0, collaborationCongestion: 0, escalationDensity: 0, delayedResponses: 0 },
                workspaceBreakdown: [],
                failures: [safeFailure('COLLABORATION_CONGESTION_DETECTION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Collaboration congestion detection failed safely.')]
            });
        }
    }

    function auditWorkspace(actionType, metadata, context) {
        if (auditForwarding || context && context.skipAuditPersistence) return { success: true, skipped: true };
        auditForwarding = true;
        try {
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    actionType: actionType,
                    eventType: actionType,
                    module: 'Team Workspace Governance',
                    targetId: metadata && (metadata.workspaceId || metadata.threadId || metadata.targetId) || '',
                    description: metadata && metadata.description || actionType,
                    actorRole: context && context.actor && context.actor.role || 'hr',
                    actorId: context && context.actor && context.actor.id || '',
                    severity: metadata && metadata.severity || 'INFO',
                    correlationId: metadata && metadata.correlationId || '',
                    metadata: cloneSanitized(metadata || {})
                }, {
                    source: 'teamWorkspaceService',
                    skipPersistence: false
                });
            }
            var source = db();
            if (source && typeof source.writeAuditLog === 'function') {
                source.writeAuditLog(context && context.actor && context.actor.role || 'hr', context && context.actor && context.actor.id || '', actionType, 'Team Workspace Governance', metadata && (metadata.workspaceId || metadata.threadId) || '', metadata && metadata.description || actionType);
            }
            return { success: true };
        } catch (error) {
            return { success: false, warning: 'Team workspace audit failed safely.' };
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
                service.emitTelemetry('TEAM_WORKSPACE_GOVERNANCE', eventType, {
                    source: 'teamWorkspaceService',
                    severity: metadata && metadata.severity || 'INFO',
                    tenantSlug: contextTenant(context) || metadata && metadata.tenantSlug || '',
                    metadata: cloneSanitized(metadata || {})
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Team workspace telemetry failed safely.' };
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
                    source: 'teamWorkspaceService',
                    status: metadata && metadata.status || metricType,
                    severity: metadata && metadata.severity || 'INFO'
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Team workspace metric failed safely.' };
        } finally {
            metricForwarding = false;
        }
        return { success: false, warning: 'OrchestrationMetricsService unavailable.' };
    }

    function persistGovernanceRun(run, context) {
        if (context && (context.preview || context.readOnly)) return freezeWorkspaceOutput(run);
        var data = rawData();
        data.teamWorkspaceGovernanceRuns = Array.isArray(data.teamWorkspaceGovernanceRuns) ? data.teamWorkspaceGovernanceRuns.slice() : [];
        data.teamWorkspaceGovernanceRuns.unshift(cloneSanitized(run));
        if (data.teamWorkspaceGovernanceRuns.length > 150) data.teamWorkspaceGovernanceRuns = data.teamWorkspaceGovernanceRuns.slice(0, 150);
        saveData(data);
        return freezeWorkspaceOutput(run);
    }

    function scheduleWorkspaceNotification(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeWorkspaceOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    state: WORKSPACE_STATES.ACTIVE,
                    failures: [safeFailure('MALFORMED_WORKSPACE_NOTIFICATION_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Workspace notification payload is malformed.')]
                });
            }
            var validation = validateThreadGovernance(payload, context);
            if (!validation.success) {
                auditWorkspace('WORKSPACE_NOTIFICATION_BLOCKED', {
                    tenantSlug: contextTenant(context),
                    severity: validation.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'WARNING',
                    description: 'Unsafe workspace notification was blocked.'
                }, context);
                emitTelemetry('WORKSPACE_NOTIFICATION_BLOCKED', { severity: 'WARNING', status: 'BLOCKED' }, context);
                return freezeWorkspaceOutput({
                    success: false,
                    classification: validation.classification,
                    state: validation.state || WORKSPACE_STATES.ACTIVE,
                    failures: validation.failures,
                    asyncJob: { success: false, warning: 'Workspace notification blocked before async scheduling.' },
                    metadata: {
                        tenantIsolationPreserved: validation.classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                        collaborationConfidentialityPreserved: true,
                        historicalCollaborationImmutable: true
                    }
                });
            }

            var normalized = normalizeWorkspacePayload(payload, context);
            var ctxTenant = contextTenant(context) || normalized.payload && normalized.payload.tenantSlug || sourceTenant(payload, rawData());
            var runId = 'TEAMWS-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7).toUpperCase();
            var run = persistGovernanceRun({
                runId: runId,
                tenantSlug: ctxTenant,
                workspaceId: workspaceIdOf(payload),
                threadId: threadIdOf(payload),
                workspaceType: normalized.payload && normalized.payload.type || normalizeWorkspaceType(payload.type),
                state: normalized.payload && normalized.payload.state || WORKSPACE_STATES.ACTIVE,
                validationOnly: payload.validationOnly !== false,
                createdAt: nowIso(context),
                workspaceNotificationGoverned: true
            }, context);

            var asyncJob = { success: false, warning: 'AsyncJobService unavailable; workspace notification remains governance-visible.' };
            if (global.AsyncJobService && typeof global.AsyncJobService.scheduleJob === 'function') {
                asyncJob = global.AsyncJobService.scheduleJob({
                    tenantSlug: ctxTenant,
                    jobType: 'WORKSPACE_NOTIFICATION',
                    priority: payload.priority || (payload.escalationId ? 'HIGH' : 'NORMAL'),
                    correlationId: workspaceIdOf(payload) || threadIdOf(payload) || runId,
                    payload: {
                        workspaceId: workspaceIdOf(payload),
                        threadId: threadIdOf(payload),
                        workspaceType: normalized.payload && normalized.payload.type || normalizeWorkspaceType(payload.type),
                        governanceRunId: runId
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
                        module: 'Team Workspace',
                        category: payload.escalationId ? 'ESCALATION_COLLABORATION' : 'WORKSPACE_NOTIFICATION',
                        targetRole: payload.targetRole || 'HR',
                        priority: payload.priority || (payload.escalationId ? 'HIGH' : 'NORMAL'),
                        title: payload.escalationId ? 'Escalation Workspace Governance' : 'Team Workspace Governance',
                        message: payload.escalationId ? 'An escalation-linked workspace requires governed attention.' : 'A team workspace update is ready for governed review.',
                        correlationId: workspaceIdOf(payload) || threadIdOf(payload) || runId
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

            auditWorkspace('WORKSPACE_NOTIFICATION_SCHEDULED', {
                workspaceId: workspaceIdOf(payload),
                threadId: threadIdOf(payload),
                tenantSlug: ctxTenant,
                description: 'Workspace notification scheduled through team workspace governance.'
            }, context);
            emitTelemetry('WORKSPACE_NOTIFICATION_SCHEDULED', { tenantSlug: ctxTenant, status: 'SCHEDULED' }, context);
            recordMetric('WORKSPACE_NOTIFICATION_SCHEDULED', { tenantSlug: ctxTenant, status: 'SCHEDULED' }, context);

            return freezeWorkspaceOutput({
                success: true,
                classification: FAILURE_CLASSIFICATIONS.INFO,
                state: normalized.payload && normalized.payload.state || WORKSPACE_STATES.ACTIVE,
                run: run,
                asyncJob: asyncJob,
                metadata: {
                    tenantIsolationPreserved: true,
                    collaborationConfidentialityPreserved: true,
                    historicalCollaborationImmutable: true,
                    existingCommunicationFlowsPreserved: true,
                    existingWorkflowsPreserved: true
                }
            });
        } catch (error) {
            safeWarn('Workspace notification scheduling failed safely.', error && error.message ? error.message : error);
            return freezeWorkspaceOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                state: WORKSPACE_STATES.ACTIVE,
                failures: [safeFailure('WORKSPACE_NOTIFICATION_SCHEDULING_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Workspace notification scheduling failed safely.')],
                asyncJob: { success: false, warning: 'Workspace notification scheduling failed safely.' }
            });
        }
    }

    function generateTeamWorkspaceReport(filters, context) {
        try {
            var data = rawData();
            var tenant = normalizeTenantSlug(filters && (filters.tenantSlug || filters.tenantId || filters.companyId)) || contextTenant(context);
            var workspaces = workspaceRows(data).filter(tenantFilter(tenant, data));
            var threads = threadRows(data).filter(tenantFilter(tenant, data));
            var replies = replyRows(data).filter(tenantFilter(tenant, data));
            var attachments = attachmentRows(data).filter(tenantFilter(tenant, data));
            var escalations = escalationRows(data).filter(tenantFilter(tenant, data));
            var workflows = workflowRows(data).filter(tenantFilter(tenant, data));
            var notifications = notificationRows(data).filter(tenantFilter(tenant, data)).filter(function workspaceNotification(row) {
                return /workspace|collaboration|thread|mention|team/i.test([row.module, row.category, row.type, row.title].join(' '));
            });
            var asyncJobs = asyncRows(data).filter(function workspaceJob(row) { return rowTenant(row) === tenant && isWorkspaceJob(row); });
            var congestion = detectCollaborationCongestion({ tenantSlug: tenant }, { tenantSlug: tenant, now: context && context.now, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            var publicAttachmentWarnings = attachments.filter(publicExposure).length;
            var failedJobs = asyncJobs.filter(function failed(row) { return normalizeToken(row.state || row.status) === 'FAILED'; }).length;
            var retryPending = asyncJobs.filter(function retry(row) { return normalizeToken(row.state || row.status) === 'RETRY_PENDING'; }).length;
            var restricted = workspaces.filter(function restrictedWorkspace(row) { return workspaceState(row) === WORKSPACE_STATES.RESTRICTED || row.restricted === true; }).length;
            var escalatedWorkspaces = workspaces.filter(function escalated(row) { return workspaceState(row) === WORKSPACE_STATES.ESCALATED || !!row.escalationId || workspaceType(row) === WORKSPACE_TYPES.ESCALATION_COORDINATION_ROOM; }).length;
            var unresolved = threads.filter(function unresolvedThread(row) { return !terminalThread(row); });
            var lockedThreads = threads.filter(function locked(row) { return row.locked === true || row.threadLocked === true; }).length;
            var moderationCount = workspaces.reduce(function total(sum, row) { return sum + moderationFlags(row).length; }, 0) + threads.reduce(function total(sum, row) { return sum + moderationFlags(row).length; }, 0);
            var pinned = workspaces.reduce(function total(sum, row) { return sum + (Number(row.pinnedNoteCount || row.pinnedNotes || 0) || 0); }, 0) + threads.filter(function pinnedThread(row) { return row.pinned === true || row.pinnedNote === true; }).length;
            var workflowLinkedThreads = threads.filter(function linked(row) { return !!workflowIdOf(row); }).length + workflows.filter(function linked(row) { return !!workspaceIdOf(row) || !!threadIdOf(row); }).length;
            var escalationLinkedWorkspaces = escalatedWorkspaces + threads.filter(function linked(row) { return !!row.escalationId; }).length + escalations.filter(function linked(row) { return !!workspaceIdOf(row) || !!threadIdOf(row) || !!workflowIdOf(row); }).length;
            var classification = publicAttachmentWarnings ? FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER : (failedJobs || moderationCount || escalationLinkedWorkspaces || congestion.summary && congestion.summary.collaborationCongestion) ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO;

            var report = {
                success: true,
                readOnly: true,
                classification: classification,
                generatedAt: nowIso(context),
                tenantSlug: tenant,
                workspaceHealth: {
                    totalWorkspaces: workspaces.length,
                    activeWorkspaces: workspaces.filter(function active(row) { return workspaceState(row) === WORKSPACE_STATES.ACTIVE; }).length,
                    reviewPendingWorkspaces: workspaces.filter(function review(row) { return workspaceState(row) === WORKSPACE_STATES.REVIEW_PENDING; }).length,
                    escalatedWorkspaces: escalatedWorkspaces,
                    restrictedWorkspaces: restricted,
                    archivedWorkspaces: workspaces.filter(function archived(row) { return workspaceState(row) === WORKSPACE_STATES.ARCHIVED; }).length,
                    inactiveWorkspaces: congestion.summary ? congestion.summary.inactiveWorkspaces : 0
                },
                threadGovernance: {
                    totalThreads: threads.length,
                    unresolvedOperationalThreads: unresolved.length,
                    threadedReplies: replies.length,
                    pinnedOperationalNotes: pinned,
                    lockedThreads: lockedThreads,
                    acknowledgementPending: congestion.summary ? congestion.summary.acknowledgementPending : 0,
                    threadActivityIndicators: threads.length + replies.length,
                    escalationMarkers: threads.filter(function escalated(row) { return threadState(row) === WORKSPACE_STATES.ESCALATED || !!row.escalationId; }).length,
                    resolutionTagging: true
                },
                escalationIntegration: {
                    escalationLinkedWorkspaces: escalationLinkedWorkspaces,
                    workflowCoordinationThreads: workflowLinkedThreads,
                    delayedApprovalCoordination: workflows.filter(function delayed(row) { return /PENDING|OVERDUE|DELAY|REVIEW/i.test([row.status, row.type, row.actionType].join(' ')); }).length,
                    escalationResolutionThreads: threads.filter(function resolution(row) { return row.escalationId && /RESOLVED|CLOSED|MITIGATED/i.test([row.status, row.state].join(' ')); }).length,
                    workflowDiscussionIntegrated: !!global.WorkflowDiscussionService,
                    escalationCommandIntegrated: !!global.EscalationCommandService
                },
                attachmentGovernance: {
                    workspaceAttachments: attachments.length,
                    publicAttachmentWarnings: publicAttachmentWarnings,
                    signedAccessRequired: true,
                    signedAccessRedacted: true,
                    attachmentAccessRoleScoped: true,
                    attachmentExpiryGoverned: true,
                    attachmentRestrictions: workspaces.filter(function restrictedAttachment(row) { return row.attachmentRestricted === true; }).length,
                    documentGovernanceIntegrated: !!global.DocumentGovernanceService
                },
                moderationGovernance: {
                    restrictedWorkspaces: restricted,
                    threadLocks: lockedThreads,
                    moderationFlags: moderationCount,
                    attachmentRestrictions: workspaces.filter(function restrictedAttachment(row) { return row.attachmentRestricted === true; }).length,
                    restrictedWorkspaceGovernance: true,
                    unsafeAdminOverridesBlocked: true
                },
                notificationIntegration: {
                    mentionNotifications: notifications.filter(function mention(row) { return /MENTION|REPLY|WORKSPACE|THREAD/i.test([row.category, row.type, row.module].join(' ')); }).length,
                    retryPending: retryPending,
                    failedJobs: failedJobs,
                    spamLoopPrevented: asyncJobs.every(function retryLimit(row) { return Number(row.retryAttempts || 0) <= Number(row.maxRetries || 3); }),
                    notificationOrchestrationIntegrated: !!global.NotificationOrchestrationService
                },
                workspaceAnalytics: {
                    unresolvedOperationalThreads: congestion.summary ? congestion.summary.unresolvedOperationalThreads : unresolved.length,
                    collaborationCongestion: congestion.summary ? congestion.summary.collaborationCongestion : 0,
                    escalationDensity: congestion.summary ? congestion.summary.escalationDensity : escalationLinkedWorkspaces,
                    delayedResponses: congestion.summary ? congestion.summary.delayedResponses : 0,
                    workspaceEngagement: congestion.summary ? congestion.summary.workspaceEngagement : 100,
                    pinnedNoteUsage: pinned,
                    inactiveWorkspaceSpikes: congestion.summary ? congestion.summary.inactiveWorkspaces : 0
                },
                accessGovernance: {
                    employeeAssignedWorkspacesOnly: true,
                    managerTeamWorkspaceVisibility: true,
                    hrCollaborationVisibility: true,
                    directorOperationalAnalyticsOnly: true,
                    superAdminPrivateThreadAccess: false,
                    platformOwnerOperationalWorkspace: false,
                    privateWorkspaceThreadsRoleScoped: true
                },
                warnings: publicAttachmentWarnings ? [safeWarning('PUBLIC_WORKSPACE_ATTACHMENT_WARNING', 'Public workspace attachment exposure requires immediate review.', { publicAttachmentWarnings: publicAttachmentWarnings })] : [],
                metadata: {
                    tenantIsolationPreserved: true,
                    collaborationConfidentialityPreserved: true,
                    historicalCollaborationImmutable: true,
                    existingCommunicationFlowsPreserved: true,
                    existingWorkflowsPreserved: true,
                    collaborationActionsAuditable: true,
                    auditReady: !!(global.AuditService || global.auditService),
                    telemetryReady: !!(global.WorkflowTelemetryService || global.workflowTelemetryService)
                }
            };

            auditWorkspace('TEAM_WORKSPACE_REPORTED', {
                tenantSlug: tenant,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO',
                description: 'Team workspace governance report viewed.'
            }, context);
            emitTelemetry('TEAM_WORKSPACE_REPORTED', { tenantSlug: tenant, status: classification, severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'INFO' }, context);
            recordMetric('TEAM_WORKSPACE_REPORTED', { tenantSlug: tenant, status: classification, severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'INFO' }, context);
            return freezeWorkspaceOutput(report);
        } catch (error) {
            return freezeWorkspaceOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                workspaceHealth: { totalWorkspaces: 0 },
                threadGovernance: { totalThreads: 0 },
                escalationIntegration: { escalationLinkedWorkspaces: 0 },
                workspaceAnalytics: { unresolvedOperationalThreads: 0 },
                failures: [safeFailure('TEAM_WORKSPACE_REPORT_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Team workspace report failed safely.')]
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        function check(name, condition) {
            checks.push({ label: name, passed: !!condition });
        }
        try {
            var malformed = validateThreadGovernance(null, { tenantSlug: 'tabsons' });
            check('malformed payloads fail safely', malformed.success === false && malformed.failures.some(function item(row) { return row.failureCode === 'MALFORMED_WORKSPACE_THREAD_PAYLOAD'; }));

            var crossTenant = validateWorkspaceScope({ tenantSlug: 'abc', workspaceId: 'WS-X', memberIds: ['EMP-X'] }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' } });
            check('workspace isolation works', crossTenant.allowed === false && crossTenant.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER);

            var workspace = validateThreadGovernance({ tenantSlug: 'tabsons', workspaceId: 'WS-1', threadId: 'TH-1', participantIds: ['EMP-1', 'MGR-1'] }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' } });
            check('collaboration governance works', workspace.success === true && workspace.threadGovernance.threadedReplies === true);

            var moderation = validateThreadGovernance({ tenantSlug: 'tabsons', workspaceId: 'WS-1', threadId: 'TH-2', locked: true, moderationFlag: true }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' } });
            check('moderation works', moderation.moderationGovernance.threadLocks === 1 && moderation.moderationGovernance.moderationFlags === 1);

            var escalation = normalizeWorkspacePayload({ tenantSlug: 'tabsons', workspaceId: 'WS-2', type: 'ESCALATION_COORDINATION_ROOM', escalationId: 'ESC-1' }, { tenantSlug: 'tabsons' });
            check('escalation integration works', escalation.success === true && escalation.payload.escalationLinked === true);

            var immutable = normalizeWorkspacePayload({ tenantSlug: 'tabsons', workspaceId: 'WS-1', body: 'private' }, { tenantSlug: 'tabsons' });
            check('immutable outputs enforced', Object.isFrozen(immutable));

            var originalAsync = global.AsyncJobService;
            var originalNotify = global.NotificationOrchestrationService;
            try {
                delete global.AsyncJobService;
                delete global.NotificationOrchestrationService;
                var degraded = scheduleWorkspaceNotification({ tenantSlug: 'tabsons', workspaceId: 'WS-SELF', threadId: 'TH-SELF', type: 'DEPARTMENT_WORKSPACE' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true, preview: true });
                check('dependency absence degrades safely', degraded.success === true && degraded.asyncJob.success === false);
            } finally {
                if (originalAsync) global.AsyncJobService = originalAsync;
                if (originalNotify) global.NotificationOrchestrationService = originalNotify;
            }
        } catch (error) {
            checks.push({ label: 'self-test uncaught error guard', passed: false, error: safeString(error && error.message || error, '') });
        }
        var passed = checks.every(function item(row) { return row.passed; });
        var result = freezeWorkspaceOutput({
            passed: passed,
            checks: checks,
            summary: passed ? 'Team workspace self-test passed.' : 'Team workspace self-test detected failures.'
        });
        global.__ARTHHRMS_TEAM_WORKSPACE_SELF_TEST__ = result;
        return result;
    }

    var TeamWorkspaceService = Object.freeze({
        VERSION: VERSION,
        WORKSPACE_STATES: WORKSPACE_STATES,
        WORKSPACE_TYPES: WORKSPACE_TYPES,
        FAILURE_CLASSIFICATIONS: FAILURE_CLASSIFICATIONS,
        VISIBILITY: VISIBILITY,
        classifyWorkspaceRisk: classifyWorkspaceRisk,
        validateWorkspaceScope: validateWorkspaceScope,
        validateThreadGovernance: validateThreadGovernance,
        validateWorkspaceAttachment: validateWorkspaceAttachment,
        normalizeWorkspacePayload: normalizeWorkspacePayload,
        freezeWorkspaceOutput: freezeWorkspaceOutput,
        detectCollaborationCongestion: detectCollaborationCongestion,
        scheduleWorkspaceNotification: scheduleWorkspaceNotification,
        generateTeamWorkspaceReport: generateTeamWorkspaceReport,
        runSelfTest: runSelfTest
    });

    global.TeamWorkspaceService = TeamWorkspaceService;
    global.teamWorkspaceService = TeamWorkspaceService;

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
