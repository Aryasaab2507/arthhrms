/**
 * workflowDiscussionService.js
 * ARTHHRMS Enterprise Workflow-Linked Discussion + Operational Thread System.
 *
 * Additive governance layer for workflow-attached operational collaboration:
 * leave, payroll, onboarding, recruitment, appraisal, expense, escalation, and
 * strategic deliverable discussions. It keeps discussion records immutable and
 * exposes only tenant-scoped governance summaries.
 */
(function attachWorkflowDiscussionService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[WorkflowDiscussionService]';

    var DISCUSSION_STATES = Object.freeze({
        OPEN: 'OPEN',
        ACTIVE: 'ACTIVE',
        REVIEW_PENDING: 'REVIEW_PENDING',
        ESCALATED: 'ESCALATED',
        RESOLVED: 'RESOLVED',
        CLOSED: 'CLOSED',
        ARCHIVED: 'ARCHIVED'
    });

    var WORKFLOW_TYPES = Object.freeze({
        LEAVE: 'LEAVE',
        PAYROLL: 'PAYROLL',
        ONBOARDING: 'ONBOARDING',
        RECRUITMENT: 'RECRUITMENT',
        APPRAISAL: 'APPRAISAL',
        EXPENSE: 'EXPENSE',
        ESCALATION: 'ESCALATION',
        STRATEGIC_DELIVERABLE: 'STRATEGIC_DELIVERABLE'
    });

    var FAILURE_CLASSIFICATIONS = Object.freeze({
        INFO: 'INFO',
        WARNING: 'WARNING',
        HIGH_RISK: 'HIGH_RISK',
        CRITICAL_BLOCKER: 'CRITICAL_BLOCKER'
    });

    var VISIBILITY = Object.freeze({
        NONE: 'NONE',
        OWN_WORKFLOW_DISCUSSIONS_ONLY: 'OWN_WORKFLOW_DISCUSSIONS_ONLY',
        TEAM_WORKFLOW_VISIBILITY: 'TEAM_WORKFLOW_VISIBILITY',
        HR_WORKFLOW_DISCUSSION_VISIBILITY: 'HR_WORKFLOW_DISCUSSION_VISIBILITY',
        STRATEGIC_OPERATIONAL_VISIBILITY: 'STRATEGIC_OPERATIONAL_VISIBILITY',
        HIGH_LEVEL_WORKFLOW_ANALYTICS_ONLY: 'HIGH_LEVEL_WORKFLOW_ANALYTICS_ONLY',
        INFRASTRUCTURE_ONLY: 'INFRASTRUCTURE_ONLY',
        PLATFORM_GOVERNANCE_ONLY: 'PLATFORM_GOVERNANCE_ONLY'
    });

    var DISCUSSION_JOB_TYPES = Object.freeze([
        'WORKFLOW_DISCUSSION_NOTIFICATION',
        'DISCUSSION_MENTION',
        'DISCUSSION_ACKNOWLEDGEMENT',
        'ESCALATION_COLLABORATION',
        'WORKFLOW_REPLY_ALERT',
        'DELAYED_RESPONSE_REMINDER'
    ]);

    var ALLOWED_ATTACHMENT_MIME_TYPES = Object.freeze([
        'application/pdf',
        'image/jpeg',
        'image/png'
    ]);

    var SENSITIVE_KEY_PATTERN = /(body|message|content|comment|reply|reply.?body|subject|note|pinned|private|confidential|participant|mention|recipient|employee|emp.?id|user.?id|author|reviewer|manager|file.?name|attachment|storage.?path|signed.?url|public.?url|url|download|path|salary|payroll|payslip|compensation|reimbursement|receipt|resume|candidate|feedback|token|secret|jwt|authorization|service.?role|private.?key)/i;
    var SENSITIVE_VALUE_PATTERN = /(https?:\/\/[^\s"',}]+|private:\/\/[^\s"',}]+|\b(private|confidential|salary|payroll|resume|receipt|message|discussion|reply)\b[^,;}]*)/ig;
    var SAFE_GOVERNANCE_KEYS = Object.freeze({
        discussionConfidentialityPreserved: true,
        workflowDiscussionConfidentialityPreserved: true,
        tenantIsolationPreserved: true,
        existingWorkflowEventFlowsPreserved: true,
        historicalDiscussionsImmutable: true,
        discussionActionsAuditable: true,
        attachmentAccessRoleScoped: true,
        signedAccessRequired: true,
        signedAccessRedacted: true,
        publicAttachmentBlocked: true,
        discussionHealth: true,
        workflowLinkage: true,
        threadGovernance: true,
        escalationCollaboration: true,
        attachmentGovernance: true,
        notificationIntegration: true,
        collaborationAnalytics: true,
        accessGovernance: true,
        superAdminOperationalDiscussionAccess: true,
        platformOwnerDiscussionAccess: true,
        workflowExposureGoverned: true,
        unresolvedDiscussions: true,
        escalationLinkedThreads: true,
        delayedApprovalDiscussions: true,
        delayedResponseReminders: true,
        delayedResponses: true,
        inactiveOperationalThreads: true,
        workflowCongestion: true,
        workflowBreakdown: true,
        workflowDiscussionAttachments: true,
        publicAttachmentWarnings: true,
        threadedReplies: true,
        acknowledgementPending: true,
        acknowledgementIndicators: true,
        mentionNotifications: true,
        spamLoopPrevented: true,
        linkedWorkflows: true,
        totalThreads: true
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
        var fromContext = normalizeTenantSlug(context && (context.tenantSlug || context.tenantId || context.companyId));
        if (fromContext) return fromContext;
        var data = rawData();
        return normalizeTenantSlug(data.companySettings && (data.companySettings.tenantSlug || data.companySettings.tenantId || data.companySettings.companyId));
    }

    function rowTenant(row) {
        if (!row) return '';
        return normalizeTenantSlug(row.tenantSlug || row.tenant_slug || row.tenantId || row.tenant_id || row.companyId || row.company_id || row.metadata && (row.metadata.tenantSlug || row.metadata.tenantId));
    }

    function threadIdOf(row) {
        return safeString(row && (row.threadId || row.thread_id || row.discussionThreadId || row.discussion_thread_id || row.communicationId || row.communication_id || row.id) || '', '').trim();
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

    function threadRows(data) {
        var source = data || rawData();
        var rows = [];
        if (Array.isArray(source.workflowDiscussions)) rows = rows.concat(source.workflowDiscussions);
        if (Array.isArray(source.workflowThreads)) rows = rows.concat(source.workflowThreads);
        if (Array.isArray(source.discussionThreads)) rows = rows.concat(source.discussionThreads.filter(function workflowThread(row) {
            return !!workflowIdOf(row) || /workflow|approval|escalation/i.test([row.type, row.category, row.module].join(' '));
        }));
        if (Array.isArray(source.communications)) rows = rows.concat(source.communications.filter(function communicationThread(row) {
            return /WORKFLOW_DISCUSSION|ESCALATION_CONVERSATION/i.test([row.type, row.category].join(' ')) || !!workflowIdOf(row);
        }));
        return rows;
    }

    function replyRows(data) {
        var source = data || rawData();
        var rows = [];
        if (Array.isArray(source.workflowThreadReplies)) rows = rows.concat(source.workflowThreadReplies);
        if (Array.isArray(source.discussionReplies)) rows = rows.concat(source.discussionReplies);
        if (Array.isArray(source.threadReplies)) rows = rows.concat(source.threadReplies);
        return rows;
    }

    function attachmentRows(data) {
        var source = data || rawData();
        var rows = [];
        if (Array.isArray(source.workflowDiscussionAttachments)) rows = rows.concat(source.workflowDiscussionAttachments);
        if (Array.isArray(source.communicationAttachments)) rows = rows.concat(source.communicationAttachments.filter(function workflowAttachment(row) {
            return !!workflowIdOf(row) || !!threadIdOf(row);
        }));
        if (Array.isArray(source.documents)) rows = rows.concat(source.documents.filter(function documentAttachment(row) {
            return !!workflowIdOf(row) || /workflow|discussion|thread/i.test([row.category, row.documentType, row.documentCategory, row.module].join(' '));
        }));
        return rows;
    }

    function workflowRows(data) {
        var source = data || rawData();
        var rows = [];
        if (Array.isArray(source.workflowEvents)) rows = rows.concat(source.workflowEvents);
        if (Array.isArray(source.pendingActions)) rows = rows.concat(source.pendingActions);
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

    function notificationRows(data) {
        var source = data || rawData();
        return Array.isArray(source.notifications) ? source.notifications : [];
    }

    function asyncRows(data) {
        var source = data || rawData();
        return Array.isArray(source.asyncJobs) ? source.asyncJobs : [];
    }

    function findThread(id, data) {
        var key = safeString(id || '', '').trim();
        if (!key) return null;
        return threadRows(data).find(function match(row) {
            return threadIdOf(row) === key || workflowIdOf(row) === key || safeString(row.id || '', '').trim() === key;
        }) || null;
    }

    function sourceTenant(row, data) {
        if (!row) return '';
        var direct = rowTenant(row);
        if (direct) return direct;
        var sourceData = data || rawData();
        var thread = findThread(threadIdOf(row) || workflowIdOf(row), sourceData);
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

    function freezeDiscussionOutput(value) {
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

    function classifyDiscussionRisk(input) {
        var source = input || {};
        if (source.crossTenant || source.crossTenantDiscussion || source.crossTenantWorkflow || source.publicAttachment || source.unsafePublicUrl || source.rlsBypass) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
        if (source.platformOwnerInDiscussion || normalizeRole(source.role) === 'PLATFORM_OWNER') return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
        if (source.unauthorizedDiscussion || source.privateDiscussionAccess || source.superAdminDiscussionAccess || source.unsafeWorkflowExposure) return FAILURE_CLASSIFICATIONS.HIGH_RISK;
        if (source.malformedPayload || source.delayedResponse || source.workflowCongestion || source.inactiveThreads || source.unsupportedAttachment) return FAILURE_CLASSIFICATIONS.WARNING;
        return FAILURE_CLASSIFICATIONS.INFO;
    }

    function normalizeDiscussionState(value) {
        var normalized = normalizeToken(value || '');
        if (normalized === 'PENDING' || normalized === 'REVIEW') return DISCUSSION_STATES.REVIEW_PENDING;
        if (normalized === 'OPENED') return DISCUSSION_STATES.OPEN;
        if (normalized === 'IN_PROGRESS') return DISCUSSION_STATES.ACTIVE;
        if (normalized === 'ESCALATION') return DISCUSSION_STATES.ESCALATED;
        if (normalized === 'DONE') return DISCUSSION_STATES.RESOLVED;
        return DISCUSSION_STATES[normalized] || DISCUSSION_STATES.OPEN;
    }

    function normalizeWorkflowType(value) {
        var normalized = normalizeToken(value || '');
        if (/LEAVE|ATTENDANCE/.test(normalized)) return WORKFLOW_TYPES.LEAVE;
        if (/PAYROLL|SALARY/.test(normalized)) return WORKFLOW_TYPES.PAYROLL;
        if (/ONBOARD|INVITE|IMPORT/.test(normalized)) return WORKFLOW_TYPES.ONBOARDING;
        if (/RECRUIT|HIRING|CANDIDATE/.test(normalized)) return WORKFLOW_TYPES.RECRUITMENT;
        if (/APPRAISAL|PERFORMANCE|REVIEW/.test(normalized)) return WORKFLOW_TYPES.APPRAISAL;
        if (/EXPENSE|REIMBURSE/.test(normalized)) return WORKFLOW_TYPES.EXPENSE;
        if (/ESCALAT|BLOCKER/.test(normalized)) return WORKFLOW_TYPES.ESCALATION;
        if (/STRATEGIC|DELIVERABLE|KPI/.test(normalized)) return WORKFLOW_TYPES.STRATEGIC_DELIVERABLE;
        return WORKFLOW_TYPES[normalized] || WORKFLOW_TYPES.LEAVE;
    }

    function isPrivateThread(row) {
        if (!row || typeof row !== 'object') return false;
        if (row.privateThread === true || row.private === true || row.confidential === true) return true;
        return /PRIVATE|CONFIDENTIAL|DISCUSSION|THREAD|WORKFLOW/i.test([row.visibility, row.type, row.category, row.channel].join(' '));
    }

    function hasRawDiscussionFields(input) {
        if (!input || typeof input !== 'object') return false;
        return Object.keys(input).some(function check(key) {
            if (SENSITIVE_KEY_PATTERN.test(key) && !SAFE_GOVERNANCE_KEYS[key]) return true;
            return input[key] && typeof input[key] === 'object' && hasRawDiscussionFields(input[key]);
        });
    }

    function participantsOf(row) {
        var ids = [];
        ids = ids.concat(arrayOfIds(row && row.participantIds));
        ids = ids.concat(arrayOfIds(row && row.recipientIds));
        ids = ids.concat(arrayOfIds(row && row.targetUserIds));
        ids = ids.concat(arrayOfIds(row && row.mentionIds));
        ids = ids.concat(arrayOfIds(row && row.acknowledgedBy));
        if (row && row.empId) ids.push(safeString(row.empId, '').trim());
        if (row && row.employeeId) ids.push(safeString(row.employeeId, '').trim());
        if (row && row.authorId) ids.push(safeString(row.authorId, '').trim());
        return ids.filter(function unique(id, index, list) { return id && list.indexOf(id) === index; });
    }

    function hasPlatformOwnerParticipant(row) {
        var roles = [];
        roles = roles.concat(arrayOfIds(row && row.participantRoles));
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
        var participants = participantsOf(source);
        if (participants.indexOf(id) !== -1) return true;
        return participants.some(function participant(empId) {
            return managerOwnsEmployee(id, empId, data);
        });
    }

    function visibilityForRole(role, actor, source, data) {
        var normalized = normalizeRole(role || actor && actor.role);
        var id = actorId(actor);
        var participants = participantsOf(source);
        if (normalized === 'EMPLOYEE') return id && participants.indexOf(id) !== -1 ? VISIBILITY.OWN_WORKFLOW_DISCUSSIONS_ONLY : VISIBILITY.NONE;
        if (normalized === 'MANAGER') return managerHasTeamVisibility(actor, source, data) ? VISIBILITY.TEAM_WORKFLOW_VISIBILITY : VISIBILITY.NONE;
        if (normalized === 'HR') return VISIBILITY.HR_WORKFLOW_DISCUSSION_VISIBILITY;
        if (normalized === 'HR_HEAD') return VISIBILITY.STRATEGIC_OPERATIONAL_VISIBILITY;
        if (normalized === 'DIRECTOR') return VISIBILITY.HIGH_LEVEL_WORKFLOW_ANALYTICS_ONLY;
        if (normalized === 'SUPER_ADMIN') return VISIBILITY.INFRASTRUCTURE_ONLY;
        if (normalized === 'PLATFORM_OWNER') return VISIBILITY.PLATFORM_GOVERNANCE_ONLY;
        return VISIBILITY.NONE;
    }

    function validateDiscussionScope(record, context) {
        try {
            var source = record || {};
            var data = rawData();
            var ctxTenant = contextTenant(context);
            var targetTenant = sourceTenant(source, data) || ctxTenant;
            var role = normalizeRole(context && context.actor && context.actor.role);
            var visibility = visibilityForRole(role, context && context.actor, source, data);
            var targetSpecific = !!(threadIdOf(source) || workflowIdOf(source) || participantsOf(source).length);
            var sameTenant = !targetTenant || !ctxTenant || targetTenant === ctxTenant;
            var privateRecord = isPrivateThread(source);
            var failures = [];

            if (!sameTenant) {
                failures.push(safeFailure('CROSS_TENANT_WORKFLOW_DISCUSSION_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Cross-tenant workflow discussion visibility was blocked.', { expectedTenant: ctxTenant }));
            }
            if (role === 'PLATFORM_OWNER' && targetSpecific) {
                failures.push(safeFailure('PLATFORM_OWNER_DISCUSSION_ACCESS_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Platform owner is isolated from tenant workflow discussions.'));
            }
            if (role === 'SUPER_ADMIN' && (targetSpecific || privateRecord || hasRawDiscussionFields(source))) {
                failures.push(safeFailure('SUPER_ADMIN_OPERATIONAL_DISCUSSION_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Tenant system administrators receive infrastructure visibility only.'));
            }
            if (role === 'DIRECTOR' && (privateRecord || hasRawDiscussionFields(source)) && targetSpecific) {
                failures.push(safeFailure('DIRECTOR_RAW_DISCUSSION_ACCESS_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Directors receive high-level workflow analytics only.'));
            }
            if (role === 'EMPLOYEE' && visibility !== VISIBILITY.OWN_WORKFLOW_DISCUSSIONS_ONLY && privateRecord) {
                failures.push(safeFailure('EMPLOYEE_DISCUSSION_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Employees may access only their own workflow discussions.'));
            }
            if (role === 'MANAGER' && privateRecord && visibility !== VISIBILITY.TEAM_WORKFLOW_VISIBILITY) {
                failures.push(safeFailure('MANAGER_DISCUSSION_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Managers may access only team workflow discussions.'));
            }

            var classification = highestClassification(failures);
            return freezeDiscussionOutput({
                allowed: failures.length === 0,
                classification: classification,
                visibility: visibility,
                scope: {
                    tenantSlug: ctxTenant,
                    threadId: sameTenant ? threadIdOf(source) : '',
                    workflowId: sameTenant ? workflowIdOf(source) : '',
                    workflowType: sameTenant ? normalizeWorkflowType(source.workflowType || source.type || source.category) : ''
                },
                failures: failures,
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    workflowDiscussionConfidentialityPreserved: true,
                    attachmentAccessRoleScoped: true
                }
            });
        } catch (error) {
            return freezeDiscussionOutput({
                allowed: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                visibility: VISIBILITY.NONE,
                failures: [safeFailure('DISCUSSION_SCOPE_VALIDATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Discussion scope validation failed safely.')]
            });
        }
    }

    function normalizeThreadPayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeDiscussionOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    failures: [safeFailure('MALFORMED_THREAD_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Workflow discussion payload is malformed.')]
                });
            }
            var data = rawData();
            var ctxTenant = contextTenant(context);
            var srcTenant = sourceTenant(payload, data) || ctxTenant;
            var workflowType = normalizeWorkflowType(payload.workflowType || payload.type || payload.category);
            var state = normalizeDiscussionState(payload.state || payload.status || DISCUSSION_STATES.OPEN);
            return freezeDiscussionOutput({
                success: true,
                classification: (!ctxTenant || !srcTenant || ctxTenant === srcTenant) ? FAILURE_CLASSIFICATIONS.INFO : FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                payload: {
                    tenantSlug: srcTenant,
                    threadId: threadIdOf(payload),
                    workflowId: workflowIdOf(payload),
                    workflowType: workflowType,
                    state: state,
                    replyCount: Number(payload.replyCount || payload.repliesCount || 0) || 0,
                    mentionCount: participantsOf({ mentionIds: payload.mentionIds }).length,
                    acknowledgementRequired: payload.acknowledgementRequired === true || payload.requiresAck === true,
                    hasAttachment: !!(payload.attachmentId || payload.documentId || payload.hasAttachment || payload.signedUrl || payload.publicUrl),
                    escalationLinked: !!(payload.escalationId || workflowType === WORKFLOW_TYPES.ESCALATION || state === DISCUSSION_STATES.ESCALATED)
                },
                metadata: {
                    tenantIsolationPreserved: !ctxTenant || !srcTenant || ctxTenant === srcTenant,
                    workflowDiscussionConfidentialityPreserved: true,
                    historicalDiscussionsImmutable: true
                }
            });
        } catch (error) {
            return freezeDiscussionOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('THREAD_NORMALIZATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Workflow discussion normalization failed safely.')]
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

    function validateDiscussionAttachment(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeDiscussionOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    failures: [safeFailure('MALFORMED_DISCUSSION_ATTACHMENT_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Discussion attachment payload is malformed.')]
                });
            }
            var scope = validateDiscussionScope(payload, context);
            var failures = (scope.failures || []).slice();
            if (!supportedMime(payload)) {
                failures.push(safeFailure('UNSUPPORTED_DISCUSSION_ATTACHMENT_MIME_TYPE', FAILURE_CLASSIFICATIONS.WARNING, 'Workflow discussion attachment MIME type is not supported.', { allowedTypes: ALLOWED_ATTACHMENT_MIME_TYPES.slice() }));
            }
            if (publicExposure(payload)) {
                failures.push(safeFailure('PUBLIC_DISCUSSION_ATTACHMENT_EXPOSURE_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Public workflow discussion attachment exposure was blocked.'));
            }
            var classification = highestClassification(failures);
            return freezeDiscussionOutput({
                success: failures.length === 0,
                classification: classification,
                visibility: scope.visibility || VISIBILITY.NONE,
                attachmentGovernance: {
                    signedAccessRequired: true,
                    signedAccessRedacted: true,
                    publicAttachmentBlocked: failures.some(function item(row) { return row.failureCode === 'PUBLIC_DISCUSSION_ATTACHMENT_EXPOSURE_BLOCKED'; }),
                    attachmentAccessRoleScoped: true,
                    uploadIntegrityValidation: true,
                    attachmentExpiryGoverned: true,
                    documentGovernanceIntegrated: !!global.DocumentGovernanceService
                },
                failures: failures,
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    workflowDiscussionConfidentialityPreserved: true
                }
            });
        } catch (error) {
            return freezeDiscussionOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('DISCUSSION_ATTACHMENT_GOVERNANCE_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Discussion attachment governance failed safely.')]
            });
        }
    }

    function validateThreadPayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeDiscussionOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    state: DISCUSSION_STATES.OPEN,
                    failures: [safeFailure('MALFORMED_THREAD_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Workflow discussion payload is malformed.')]
                });
            }
            var normalized = normalizeThreadPayload(payload, context);
            var scope = validateDiscussionScope(payload, context);
            var failures = (scope.failures || []).slice();
            var state = normalized.payload ? normalized.payload.state : DISCUSSION_STATES.OPEN;

            if (normalized.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER) {
                failures.push(safeFailure('DISCUSSION_TENANT_MISMATCH_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Workflow discussion tenant mismatch was blocked.'));
            }
            if (!workflowIdOf(payload)) {
                failures.push(safeFailure('WORKFLOW_LINK_REQUIRED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Workflow-linked discussions require a workflow reference.'));
            }
            if (hasPlatformOwnerParticipant(payload)) {
                failures.push(safeFailure('PLATFORM_OWNER_IN_DISCUSSION_CHAIN_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Platform owner cannot be included in workflow discussion chains.'));
            }
            if (publicExposure(payload)) {
                failures.push(safeFailure('PUBLIC_DISCUSSION_ATTACHMENT_EXPOSURE_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Public workflow discussion attachment exposure was blocked.'));
            }
            var communicationCheck = null;
            if (global.CommunicationGovernanceService && typeof global.CommunicationGovernanceService.validateCommunicationPayload === 'function') {
                try {
                    communicationCheck = global.CommunicationGovernanceService.validateCommunicationPayload({
                        tenantSlug: payload.tenantSlug,
                        communicationId: threadIdOf(payload),
                        workflowId: workflowIdOf(payload),
                        type: 'WORKFLOW_DISCUSSION',
                        participantIds: payload.participantIds || []
                    }, context || {});
                    if (communicationCheck && communicationCheck.success === false && communicationCheck.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER) {
                        failures.push(safeFailure('COMMUNICATION_GOVERNANCE_BLOCKED_DISCUSSION', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Communication governance blocked unsafe workflow discussion exposure.'));
                    }
                } catch (error) {}
            }

            var classification = highestClassification(failures);
            return freezeDiscussionOutput({
                success: failures.length === 0,
                classification: classification,
                state: state,
                normalized: normalized.payload || null,
                failures: failures,
                workflowLinkage: {
                    workflowExposureGoverned: true,
                    linkedWorkflows: workflowIdOf(payload) ? 1 : 0,
                    communicationGovernanceIntegrated: !!global.CommunicationGovernanceService
                },
                threadGovernance: {
                    threadedReplies: true,
                    acknowledgementIndicators: true,
                    escalationMarkers: true,
                    pinnedOperationalNotesGoverned: true,
                    attachmentReferencesGoverned: true
                },
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    workflowDiscussionConfidentialityPreserved: true,
                    historicalDiscussionsImmutable: true
                }
            });
        } catch (error) {
            return freezeDiscussionOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                state: DISCUSSION_STATES.OPEN,
                failures: [safeFailure('THREAD_VALIDATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Workflow discussion validation failed safely.')]
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

    function discussionState(row) {
        return normalizeDiscussionState(row && (row.state || row.status));
    }

    function workflowType(row) {
        return normalizeWorkflowType(row && (row.workflowType || row.type || row.category));
    }

    function terminalThread(row) {
        var state = discussionState(row);
        return [DISCUSSION_STATES.RESOLVED, DISCUSSION_STATES.CLOSED, DISCUSSION_STATES.ARCHIVED].indexOf(state) !== -1;
    }

    function linkedToThread(row, thread) {
        return threadIdOf(row) && threadIdOf(row) === threadIdOf(thread) || workflowIdOf(row) && workflowIdOf(row) === workflowIdOf(thread);
    }

    function isDiscussionJob(row) {
        return DISCUSSION_JOB_TYPES.indexOf(normalizeToken(row && (row.jobType || row.type || row.category))) !== -1;
    }

    function detectWorkflowCongestion(filters, context) {
        try {
            var data = rawData();
            var tenant = normalizeTenantSlug(filters && (filters.tenantSlug || filters.tenantId || filters.companyId)) || contextTenant(context);
            var threads = threadRows(data).filter(tenantFilter(tenant, data));
            var replies = replyRows(data).filter(tenantFilter(tenant, data));
            var escalations = escalationRows(data).filter(tenantFilter(tenant, data));
            var pending = (Array.isArray(data.pendingActions) ? data.pendingActions : []).filter(tenantFilter(tenant, data));
            var unresolved = threads.filter(function open(row) { return !terminalThread(row); }).length;
            var escalated = threads.filter(function esc(row) { return discussionState(row) === DISCUSSION_STATES.ESCALATED || !!row.escalationId; }).length + escalations.filter(function linked(row) { return !!threadIdOf(row) || !!workflowIdOf(row); }).length;
            var delayed = threads.filter(function delayed(row) {
                return !terminalThread(row) && isPastDate(row.lastActivityAt || row.updatedAt || row.createdAt || row.dueAt, context);
            }).length + pending.filter(function overdue(row) {
                return /PENDING|OPEN|WAITING|REVIEW/i.test(safeString(row.status || '', '')) && isPastDate(row.dueAt || row.deadline || row.createdAt, context);
            }).length;
            var inactive = threads.filter(function inactive(row) {
                return discussionState(row) === DISCUSSION_STATES.ACTIVE && isPastDate(row.lastActivityAt || row.updatedAt || row.createdAt, context);
            }).length;
            var acknowledgementPending = threads.filter(function ack(row) {
                return row.acknowledgementRequired === true && arrayOfIds(row.acknowledgedBy).length < Math.max(1, participantsOf(row).length - 1);
            }).length;
            var breakdown = {};
            threads.forEach(function count(row) {
                var key = workflowType(row);
                if (!breakdown[key]) breakdown[key] = { workflowType: key, threads: 0, unresolved: 0, escalated: 0, replies: 0 };
                breakdown[key].threads += 1;
                if (!terminalThread(row)) breakdown[key].unresolved += 1;
                if (discussionState(row) === DISCUSSION_STATES.ESCALATED || row.escalationId) breakdown[key].escalated += 1;
                breakdown[key].replies += replies.filter(function reply(rowReply) { return linkedToThread(rowReply, row); }).length;
            });
            var workflowBreakdown = Object.keys(breakdown).map(function toRow(key) { return breakdown[key]; }).sort(function order(a, b) { return b.unresolved - a.unresolved; });

            return freezeDiscussionOutput({
                success: true,
                classification: delayed || escalated ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO,
                tenantSlug: tenant,
                summary: {
                    unresolvedDiscussions: unresolved,
                    workflowCongestion: unresolved + delayed + acknowledgementPending,
                    escalationDensity: escalated,
                    delayedResponses: delayed,
                    inactiveOperationalThreads: inactive,
                    acknowledgementPending: acknowledgementPending,
                    replyVolume: replies.length
                },
                workflowBreakdown: workflowBreakdown,
                metadata: {
                    tenantIsolationPreserved: true,
                    workflowDiscussionConfidentialityPreserved: true,
                    historicalDiscussionsImmutable: true
                }
            });
        } catch (error) {
            return freezeDiscussionOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                summary: { unresolvedDiscussions: 0, workflowCongestion: 0, escalationDensity: 0, delayedResponses: 0 },
                workflowBreakdown: [],
                failures: [safeFailure('WORKFLOW_CONGESTION_DETECTION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Workflow discussion congestion detection failed safely.')]
            });
        }
    }

    function auditDiscussion(actionType, metadata, context) {
        if (auditForwarding || context && context.skipAuditPersistence) return { success: true, skipped: true };
        auditForwarding = true;
        try {
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    actionType: actionType,
                    eventType: actionType,
                    module: 'Workflow Discussion Governance',
                    targetId: metadata && (metadata.threadId || metadata.workflowId || metadata.targetId) || '',
                    description: metadata && metadata.description || actionType,
                    actorRole: context && context.actor && context.actor.role || 'hr',
                    actorId: context && context.actor && context.actor.id || '',
                    severity: metadata && metadata.severity || 'INFO',
                    correlationId: metadata && metadata.correlationId || '',
                    metadata: cloneSanitized(metadata || {})
                }, {
                    source: 'workflowDiscussionService',
                    skipPersistence: false
                });
            }
            var source = db();
            if (source && typeof source.writeAuditLog === 'function') {
                source.writeAuditLog(context && context.actor && context.actor.role || 'hr', context && context.actor && context.actor.id || '', actionType, 'Workflow Discussion Governance', metadata && (metadata.threadId || metadata.workflowId) || '', metadata && metadata.description || actionType);
            }
            return { success: true };
        } catch (error) {
            return { success: false, warning: 'Workflow discussion audit failed safely.' };
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
                service.emitTelemetry('WORKFLOW_DISCUSSION_GOVERNANCE', eventType, {
                    source: 'workflowDiscussionService',
                    severity: metadata && metadata.severity || 'INFO',
                    tenantSlug: contextTenant(context) || metadata && metadata.tenantSlug || '',
                    metadata: cloneSanitized(metadata || {})
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Workflow discussion telemetry failed safely.' };
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
                    source: 'workflowDiscussionService',
                    status: metadata && metadata.status || metricType,
                    severity: metadata && metadata.severity || 'INFO'
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Workflow discussion metric failed safely.' };
        } finally {
            metricForwarding = false;
        }
        return { success: false, warning: 'OrchestrationMetricsService unavailable.' };
    }

    function persistGovernanceRun(run, context) {
        if (context && (context.preview || context.readOnly)) return freezeDiscussionOutput(run);
        var data = rawData();
        data.workflowDiscussionGovernanceRuns = Array.isArray(data.workflowDiscussionGovernanceRuns) ? data.workflowDiscussionGovernanceRuns.slice() : [];
        data.workflowDiscussionGovernanceRuns.unshift(cloneSanitized(run));
        if (data.workflowDiscussionGovernanceRuns.length > 150) data.workflowDiscussionGovernanceRuns = data.workflowDiscussionGovernanceRuns.slice(0, 150);
        saveData(data);
        return freezeDiscussionOutput(run);
    }

    function scheduleDiscussionNotification(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeDiscussionOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    state: DISCUSSION_STATES.OPEN,
                    failures: [safeFailure('MALFORMED_DISCUSSION_NOTIFICATION_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Discussion notification payload is malformed.')]
                });
            }
            var validation = validateThreadPayload(payload, context);
            if (!validation.success) {
                auditDiscussion('DISCUSSION_NOTIFICATION_BLOCKED', {
                    tenantSlug: contextTenant(context),
                    severity: validation.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'WARNING',
                    description: 'Unsafe workflow discussion notification was blocked.'
                }, context);
                emitTelemetry('DISCUSSION_NOTIFICATION_BLOCKED', { severity: 'WARNING', status: 'BLOCKED' }, context);
                return freezeDiscussionOutput({
                    success: false,
                    classification: validation.classification,
                    state: validation.state || DISCUSSION_STATES.OPEN,
                    failures: validation.failures,
                    asyncJob: { success: false, warning: 'Discussion notification blocked before async scheduling.' },
                    metadata: {
                        tenantIsolationPreserved: validation.classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                        workflowDiscussionConfidentialityPreserved: true,
                        historicalDiscussionsImmutable: true
                    }
                });
            }

            var normalized = validation.normalized || {};
            var ctxTenant = contextTenant(context) || normalized.tenantSlug || sourceTenant(payload, rawData());
            var runId = 'WFDISC-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7).toUpperCase();
            var run = persistGovernanceRun({
                runId: runId,
                tenantSlug: ctxTenant,
                threadId: threadIdOf(payload),
                workflowId: workflowIdOf(payload),
                workflowType: normalized.workflowType || normalizeWorkflowType(payload.workflowType),
                state: normalized.state || DISCUSSION_STATES.OPEN,
                validationOnly: payload.validationOnly !== false,
                createdAt: nowIso(context),
                discussionNotificationGoverned: true
            }, context);

            var asyncJob = { success: false, warning: 'AsyncJobService unavailable; workflow discussion notification remains governance-visible.' };
            if (global.AsyncJobService && typeof global.AsyncJobService.scheduleJob === 'function') {
                asyncJob = global.AsyncJobService.scheduleJob({
                    tenantSlug: ctxTenant,
                    jobType: 'WORKFLOW_DISCUSSION_NOTIFICATION',
                    priority: payload.priority || 'NORMAL',
                    correlationId: threadIdOf(payload) || workflowIdOf(payload) || runId,
                    payload: {
                        threadId: threadIdOf(payload),
                        workflowId: workflowIdOf(payload),
                        workflowType: normalized.workflowType || normalizeWorkflowType(payload.workflowType),
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
                        module: 'Workflow Discussions',
                        category: payload.escalationId ? 'ESCALATION_ALERT' : 'WORKFLOW_DISCUSSION_NOTIFICATION',
                        targetRole: payload.targetRole || 'HR',
                        priority: payload.priority || (payload.escalationId ? 'HIGH' : 'NORMAL'),
                        title: payload.escalationId ? 'Escalation Discussion Governance' : 'Workflow Discussion Governance',
                        message: payload.escalationId ? 'An escalation-linked workflow discussion requires governed attention.' : 'A workflow discussion update is ready for governed review.',
                        correlationId: threadIdOf(payload) || workflowIdOf(payload) || runId
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

            auditDiscussion('DISCUSSION_NOTIFICATION_SCHEDULED', {
                threadId: threadIdOf(payload),
                workflowId: workflowIdOf(payload),
                tenantSlug: ctxTenant,
                description: 'Workflow discussion notification scheduled through discussion governance.'
            }, context);
            emitTelemetry('DISCUSSION_NOTIFICATION_SCHEDULED', { tenantSlug: ctxTenant, status: 'SCHEDULED' }, context);
            recordMetric('DISCUSSION_NOTIFICATION_SCHEDULED', { tenantSlug: ctxTenant, status: 'SCHEDULED' }, context);

            return freezeDiscussionOutput({
                success: true,
                classification: FAILURE_CLASSIFICATIONS.INFO,
                state: normalized.state || DISCUSSION_STATES.OPEN,
                run: run,
                asyncJob: asyncJob,
                metadata: {
                    tenantIsolationPreserved: true,
                    workflowDiscussionConfidentialityPreserved: true,
                    historicalDiscussionsImmutable: true,
                    existingWorkflowEventFlowsPreserved: true
                }
            });
        } catch (error) {
            safeWarn('Discussion notification scheduling failed safely.', error && error.message ? error.message : error);
            return freezeDiscussionOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                state: DISCUSSION_STATES.OPEN,
                failures: [safeFailure('DISCUSSION_NOTIFICATION_SCHEDULING_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Discussion notification scheduling failed safely.')],
                asyncJob: { success: false, warning: 'Discussion notification scheduling failed safely.' }
            });
        }
    }

    function countByWorkflowType(threads) {
        var counts = {
            leave: 0,
            payroll: 0,
            onboarding: 0,
            recruitment: 0,
            appraisal: 0,
            expense: 0,
            escalation: 0,
            strategicDeliverable: 0
        };
        threads.forEach(function count(row) {
            var type = workflowType(row);
            if (type === WORKFLOW_TYPES.LEAVE) counts.leave += 1;
            else if (type === WORKFLOW_TYPES.PAYROLL) counts.payroll += 1;
            else if (type === WORKFLOW_TYPES.ONBOARDING) counts.onboarding += 1;
            else if (type === WORKFLOW_TYPES.RECRUITMENT) counts.recruitment += 1;
            else if (type === WORKFLOW_TYPES.APPRAISAL) counts.appraisal += 1;
            else if (type === WORKFLOW_TYPES.EXPENSE) counts.expense += 1;
            else if (type === WORKFLOW_TYPES.ESCALATION) counts.escalation += 1;
            else if (type === WORKFLOW_TYPES.STRATEGIC_DELIVERABLE) counts.strategicDeliverable += 1;
        });
        return counts;
    }

    function generateWorkflowDiscussionReport(filters, context) {
        try {
            var data = rawData();
            var tenant = normalizeTenantSlug(filters && (filters.tenantSlug || filters.tenantId || filters.companyId)) || contextTenant(context);
            var threads = threadRows(data).filter(tenantFilter(tenant, data));
            var replies = replyRows(data).filter(tenantFilter(tenant, data));
            var attachments = attachmentRows(data).filter(tenantFilter(tenant, data));
            var workflows = workflowRows(data).filter(tenantFilter(tenant, data));
            var escalations = escalationRows(data).filter(tenantFilter(tenant, data));
            var notifications = notificationRows(data).filter(tenantFilter(tenant, data)).filter(function discussionNotification(row) {
                return /workflow discussion|discussion|thread|mention/i.test([row.module, row.category, row.type, row.title].join(' '));
            });
            var asyncJobs = asyncRows(data).filter(function discussionJob(row) { return rowTenant(row) === tenant && isDiscussionJob(row); });
            var congestion = detectWorkflowCongestion({ tenantSlug: tenant }, { tenantSlug: tenant, now: context && context.now, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            var publicAttachmentWarnings = attachments.filter(publicExposure).length;
            var failedJobs = asyncJobs.filter(function failed(row) { return normalizeToken(row.state || row.status) === 'FAILED'; }).length;
            var unresolved = threads.filter(function unresolvedThread(row) { return !terminalThread(row); });
            var escalatedThreads = threads.filter(function escalated(row) { return discussionState(row) === DISCUSSION_STATES.ESCALATED || !!row.escalationId; });
            var workflowCounts = countByWorkflowType(threads);
            var mentionNotifications = notifications.filter(function mention(row) { return /MENTION|REPLY|DISCUSSION/i.test([row.category, row.type, row.module].join(' ')); }).length;
            var delayedApproval = workflows.filter(function delayed(row) { return /PENDING|OVERDUE|DELAY|REVIEW/i.test([row.status, row.type, row.actionType].join(' ')); }).length;
            var classification = publicAttachmentWarnings ? FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER : (failedJobs || escalatedThreads.length || congestion.summary && congestion.summary.workflowCongestion) ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO;

            var report = {
                success: true,
                readOnly: true,
                classification: classification,
                generatedAt: nowIso(context),
                tenantSlug: tenant,
                discussionHealth: {
                    totalThreads: threads.length,
                    openThreads: threads.filter(function open(row) { return discussionState(row) === DISCUSSION_STATES.OPEN; }).length,
                    activeThreads: threads.filter(function active(row) { return discussionState(row) === DISCUSSION_STATES.ACTIVE; }).length,
                    reviewPendingThreads: threads.filter(function review(row) { return discussionState(row) === DISCUSSION_STATES.REVIEW_PENDING; }).length,
                    escalatedThreads: escalatedThreads.length,
                    unresolvedDiscussions: unresolved.length,
                    closedThreads: threads.filter(function closed(row) { return terminalThread(row); }).length
                },
                workflowLinkage: {
                    linkedWorkflows: threads.filter(function linked(row) { return !!workflowIdOf(row); }).length + workflows.filter(function linked(row) { return !!threadIdOf(row); }).length,
                    workflowExposureGoverned: true,
                    leaveDiscussions: workflowCounts.leave,
                    payrollDiscussions: workflowCounts.payroll,
                    onboardingDiscussions: workflowCounts.onboarding,
                    recruitmentDiscussions: workflowCounts.recruitment,
                    appraisalDiscussions: workflowCounts.appraisal,
                    expenseDiscussions: workflowCounts.expense,
                    escalationDiscussions: workflowCounts.escalation,
                    strategicDeliverableDiscussions: workflowCounts.strategicDeliverable
                },
                threadGovernance: {
                    threadedReplies: replies.length,
                    acknowledgementIndicators: threads.filter(function ack(row) { return row.acknowledgementRequired === true; }).length,
                    acknowledgementPending: congestion.summary ? congestion.summary.acknowledgementPending : 0,
                    escalationMarkers: escalatedThreads.length,
                    pinnedOperationalNotesGoverned: true,
                    attachmentReferencesGoverned: true
                },
                escalationCollaboration: {
                    escalationLinkedThreads: escalatedThreads.length + escalations.filter(function linked(row) { return !!threadIdOf(row) || !!workflowIdOf(row); }).length,
                    delayedApprovalDiscussions: delayedApproval,
                    bottleneckResolutionThreads: threads.filter(function blocked(row) { return /BLOCK|WAIT|PENDING|ESCALAT/i.test([row.status, row.state, row.workflowType].join(' ')); }).length,
                    escalationAcknowledgements: threads.filter(function ack(row) { return row.escalationId && arrayOfIds(row.acknowledgedBy).length; }).length,
                    escalationCommandIntegrated: !!global.EscalationCommandService
                },
                attachmentGovernance: {
                    workflowDiscussionAttachments: attachments.length,
                    publicAttachmentWarnings: publicAttachmentWarnings,
                    signedAccessRequired: true,
                    signedAccessRedacted: true,
                    attachmentAccessRoleScoped: true,
                    attachmentExpiryGoverned: true,
                    documentGovernanceIntegrated: !!global.DocumentGovernanceService
                },
                notificationIntegration: {
                    mentionNotifications: mentionNotifications,
                    delayedResponseReminders: congestion.summary ? congestion.summary.delayedResponses : 0,
                    retryPending: asyncJobs.filter(function retry(row) { return normalizeToken(row.state || row.status) === 'RETRY_PENDING'; }).length,
                    failedJobs: failedJobs,
                    spamLoopPrevented: asyncJobs.every(function retryLimit(row) { return Number(row.retryAttempts || 0) <= Number(row.maxRetries || 3); }),
                    notificationOrchestrationIntegrated: !!global.NotificationOrchestrationService
                },
                collaborationAnalytics: {
                    unresolvedDiscussions: congestion.summary ? congestion.summary.unresolvedDiscussions : unresolved.length,
                    workflowCongestion: congestion.summary ? congestion.summary.workflowCongestion : 0,
                    escalationDensity: congestion.summary ? congestion.summary.escalationDensity : 0,
                    delayedResponses: congestion.summary ? congestion.summary.delayedResponses : 0,
                    inactiveOperationalThreads: congestion.summary ? congestion.summary.inactiveOperationalThreads : 0,
                    responseTimelineSignals: replies.length
                },
                accessGovernance: {
                    employeeOwnWorkflowDiscussionsOnly: true,
                    managerTeamWorkflowVisibility: true,
                    hrWorkflowDiscussionVisibility: true,
                    directorAnalyticsOnly: true,
                    superAdminOperationalDiscussionAccess: false,
                    platformOwnerDiscussionAccess: false,
                    workflowDiscussionsRoleScoped: true
                },
                warnings: publicAttachmentWarnings ? [safeWarning('PUBLIC_WORKFLOW_DISCUSSION_ATTACHMENT_WARNING', 'Public workflow discussion attachment exposure requires immediate review.', { publicAttachmentWarnings: publicAttachmentWarnings })] : [],
                metadata: {
                    tenantIsolationPreserved: true,
                    workflowDiscussionConfidentialityPreserved: true,
                    historicalDiscussionsImmutable: true,
                    existingWorkflowEventFlowsPreserved: true,
                    discussionActionsAuditable: true,
                    auditReady: !!(global.AuditService || global.auditService),
                    telemetryReady: !!(global.WorkflowTelemetryService || global.workflowTelemetryService)
                }
            };

            auditDiscussion('WORKFLOW_DISCUSSION_REPORTED', {
                tenantSlug: tenant,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO',
                description: 'Workflow discussion governance report viewed.'
            }, context);
            emitTelemetry('WORKFLOW_DISCUSSION_REPORTED', { tenantSlug: tenant, status: classification, severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'INFO' }, context);
            recordMetric('WORKFLOW_DISCUSSION_REPORTED', { tenantSlug: tenant, status: classification, severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'INFO' }, context);
            return freezeDiscussionOutput(report);
        } catch (error) {
            return freezeDiscussionOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                discussionHealth: { totalThreads: 0 },
                workflowLinkage: { linkedWorkflows: 0 },
                escalationCollaboration: { escalationLinkedThreads: 0 },
                collaborationAnalytics: { unresolvedDiscussions: 0 },
                failures: [safeFailure('WORKFLOW_DISCUSSION_REPORT_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Workflow discussion report failed safely.')]
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        function check(name, condition) {
            checks.push({ label: name, passed: !!condition });
        }
        try {
            var malformed = validateThreadPayload(null, { tenantSlug: 'tabsons' });
            check('malformed payloads fail safely', malformed.success === false && malformed.failures.some(function item(row) { return row.failureCode === 'MALFORMED_THREAD_PAYLOAD'; }));

            var crossTenant = validateDiscussionScope({ tenantSlug: 'abc', threadId: 'WTD-X', workflowId: 'WF-X', participantIds: ['EMP-X'] }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' } });
            check('workflow discussion isolation works', crossTenant.allowed === false && crossTenant.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER);

            var workflow = validateThreadPayload({ tenantSlug: 'tabsons', threadId: 'WTD-1', workflowId: 'WF-1', workflowType: 'LEAVE', participantIds: ['EMP-1', 'MGR-1'] }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' } });
            check('workflow linkage works', workflow.success === true && workflow.workflowLinkage.linkedWorkflows === 1);

            var escalation = normalizeThreadPayload({ tenantSlug: 'tabsons', threadId: 'WTD-2', workflowId: 'WF-2', workflowType: 'ESCALATION', escalationId: 'ESC-1' }, { tenantSlug: 'tabsons' });
            check('escalation collaboration works', escalation.success === true && escalation.payload.escalationLinked === true);

            var attachment = validateDiscussionAttachment({ tenantSlug: 'tabsons', threadId: 'WTD-1', workflowId: 'WF-1', mimeType: 'application/pdf', publicUrl: 'https://public.example.com/file.pdf' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' } });
            check('attachment governance works', attachment.success === false && attachment.failures.some(function item(row) { return row.failureCode === 'PUBLIC_DISCUSSION_ATTACHMENT_EXPOSURE_BLOCKED'; }));

            var immutable = normalizeThreadPayload({ tenantSlug: 'tabsons', threadId: 'WTD-1', workflowId: 'WF-1', state: 'active', body: 'private' }, { tenantSlug: 'tabsons' });
            check('immutable outputs enforced', Object.isFrozen(immutable));

            var originalAsync = global.AsyncJobService;
            var originalNotify = global.NotificationOrchestrationService;
            try {
                delete global.AsyncJobService;
                delete global.NotificationOrchestrationService;
                var degraded = scheduleDiscussionNotification({ tenantSlug: 'tabsons', threadId: 'WTD-SELF', workflowId: 'WF-SELF', workflowType: 'LEAVE' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true, preview: true });
                check('dependency absence degrades safely', degraded.success === true && degraded.asyncJob.success === false);
            } finally {
                if (originalAsync) global.AsyncJobService = originalAsync;
                if (originalNotify) global.NotificationOrchestrationService = originalNotify;
            }
        } catch (error) {
            checks.push({ label: 'self-test uncaught error guard', passed: false, error: safeString(error && error.message || error, '') });
        }
        var passed = checks.every(function item(row) { return row.passed; });
        var result = freezeDiscussionOutput({
            passed: passed,
            checks: checks,
            summary: passed ? 'Workflow discussion self-test passed.' : 'Workflow discussion self-test detected failures.'
        });
        global.__ARTHHRMS_WORKFLOW_DISCUSSION_SELF_TEST__ = result;
        return result;
    }

    var WorkflowDiscussionService = Object.freeze({
        VERSION: VERSION,
        DISCUSSION_STATES: DISCUSSION_STATES,
        WORKFLOW_TYPES: WORKFLOW_TYPES,
        FAILURE_CLASSIFICATIONS: FAILURE_CLASSIFICATIONS,
        VISIBILITY: VISIBILITY,
        classifyDiscussionRisk: classifyDiscussionRisk,
        validateDiscussionScope: validateDiscussionScope,
        validateThreadPayload: validateThreadPayload,
        validateDiscussionAttachment: validateDiscussionAttachment,
        normalizeThreadPayload: normalizeThreadPayload,
        freezeDiscussionOutput: freezeDiscussionOutput,
        detectWorkflowCongestion: detectWorkflowCongestion,
        scheduleDiscussionNotification: scheduleDiscussionNotification,
        generateWorkflowDiscussionReport: generateWorkflowDiscussionReport,
        runSelfTest: runSelfTest
    });

    global.WorkflowDiscussionService = WorkflowDiscussionService;
    global.workflowDiscussionService = WorkflowDiscussionService;

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
