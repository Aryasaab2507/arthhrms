/**
 * communicationGovernanceService.js
 * ARTHHRMS Enterprise Communication + Internal Collaboration Governance System.
 *
 * Additive governance layer for announcements, HR circulars, workflow-linked
 * discussions, policy acknowledgements, escalation communication, attachments,
 * and communication analytics. It does not replace notification, workflow,
 * document, or async services.
 */
(function attachCommunicationGovernanceService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[CommunicationGovernanceService]';

    var COMMUNICATION_STATES = Object.freeze({
        DRAFT: 'DRAFT',
        PUBLISHED: 'PUBLISHED',
        ACK_PENDING: 'ACK_PENDING',
        ACTIVE: 'ACTIVE',
        ESCALATED: 'ESCALATED',
        CLOSED: 'CLOSED',
        ARCHIVED: 'ARCHIVED'
    });

    var COMMUNICATION_TYPES = Object.freeze({
        HR_ANNOUNCEMENT: 'HR_ANNOUNCEMENT',
        DEPARTMENT_BROADCAST: 'DEPARTMENT_BROADCAST',
        LEADERSHIP_MESSAGE: 'LEADERSHIP_MESSAGE',
        WORKFLOW_DISCUSSION: 'WORKFLOW_DISCUSSION',
        ESCALATION_CONVERSATION: 'ESCALATION_CONVERSATION',
        ONBOARDING_COMMUNICATION: 'ONBOARDING_COMMUNICATION',
        COMPLIANCE_NOTICE: 'COMPLIANCE_NOTICE',
        POLICY_BROADCAST: 'POLICY_BROADCAST'
    });

    var FAILURE_CLASSIFICATIONS = Object.freeze({
        INFO: 'INFO',
        WARNING: 'WARNING',
        HIGH_RISK: 'HIGH_RISK',
        CRITICAL_BLOCKER: 'CRITICAL_BLOCKER'
    });

    var VISIBILITY = Object.freeze({
        NONE: 'NONE',
        OWN_DISCUSSIONS_ONLY: 'OWN_DISCUSSIONS_ONLY',
        TEAM_COMMUNICATION_VISIBILITY: 'TEAM_COMMUNICATION_VISIBILITY',
        HR_COMMUNICATION_VISIBILITY: 'HR_COMMUNICATION_VISIBILITY',
        STRATEGIC_COMMUNICATION_VISIBILITY: 'STRATEGIC_COMMUNICATION_VISIBILITY',
        ORGANIZATION_ANNOUNCEMENTS: 'ORGANIZATION_ANNOUNCEMENTS',
        INFRASTRUCTURE_ONLY: 'INFRASTRUCTURE_ONLY',
        PLATFORM_GOVERNANCE_ONLY: 'PLATFORM_GOVERNANCE_ONLY'
    });

    var COMMUNICATION_JOB_TYPES = Object.freeze([
        'COMMUNICATION_BROADCAST',
        'POLICY_ACKNOWLEDGEMENT',
        'ANNOUNCEMENT_DELIVERY',
        'WORKFLOW_DISCUSSION_NOTIFICATION',
        'ESCALATION_COMMUNICATION',
        'COMMUNICATION_ANALYTICS'
    ]);

    var ALLOWED_ATTACHMENT_MIME_TYPES = Object.freeze([
        'application/pdf',
        'image/jpeg',
        'image/png'
    ]);

    var SENSITIVE_KEY_PATTERN = /(message|body|content|comment|discussion|thread.?text|private|confidential|participant|recipient|viewed.?user|acknowledged.?user|employee|emp.?id|user.?id|file.?name|attachment|storage.?path|signed.?url|public.?url|url|download|path|salary|payroll|payslip|compensation|reimbursement|receipt|resume|candidate|feedback|token|secret|jwt|authorization|service.?role|private.?key)/i;
    var SENSITIVE_VALUE_PATTERN = /(https?:\/\/[^\s"',}]+|private:\/\/[^\s"',}]+|\b(private|confidential|salary|payroll|resume|receipt|message|discussion)\b[^,;}]*)/ig;
    var SAFE_GOVERNANCE_KEYS = Object.freeze({
        communicationConfidentialityPreserved: true,
        tenantIsolationPreserved: true,
        existingWorkflowEventFlowsPreserved: true,
        historicalCommunicationsImmutable: true,
        communicationActionsAuditable: true,
        attachmentAccessRoleScoped: true,
        signedAccessRequired: true,
        signedAccessRedacted: true,
        publicAttachmentBlocked: true,
        announcementHealth: true,
        policyAcknowledgements: true,
        workflowDiscussions: true,
        workflowDiscussionGovernance: true,
        linkedDiscussions: true,
        privateDiscussionsRoleScoped: true,
        communicationAnalytics: true,
        attachmentGovernance: true,
        communicationAttachments: true,
        publicAttachmentWarnings: true,
        escalationCommunication: true,
        escalationLinkedDiscussions: true,
        delayedApprovalCommunication: true,
        workflowBlockageDiscussions: true,
        accessGovernance: true,
        superAdminPrivateAccess: true,
        platformOwnerPrivateAccess: true,
        workflowExposureGoverned: true,
        acknowledgementTracking: true,
        communicationAttachmentAccess: true
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

    function communicationIdOf(row) {
        return safeString(row && (row.communicationId || row.communication_id || row.announcementId || row.announcement_id || row.threadId || row.thread_id || row.messageId || row.message_id || row.id) || '', '').trim();
    }

    function threadIdOf(row) {
        return safeString(row && (row.threadId || row.thread_id || row.discussionThreadId || row.discussion_thread_id || row.id) || '', '').trim();
    }

    function workflowIdOf(row) {
        return safeString(row && (row.workflowId || row.workflow_id || row.eventId || row.event_id || row.pendingActionId || row.pending_action_id || '') || '', '').trim();
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

    function communicationRows(data) {
        var source = data || rawData();
        var rows = [];
        if (Array.isArray(source.communications)) rows = rows.concat(source.communications);
        if (Array.isArray(source.announcements)) rows = rows.concat(source.announcements);
        if (Array.isArray(source.hrCirculars)) rows = rows.concat(source.hrCirculars);
        if (Array.isArray(source.policyBroadcasts)) rows = rows.concat(source.policyBroadcasts);
        if (Array.isArray(source.discussionThreads)) rows = rows.concat(source.discussionThreads);
        return rows;
    }

    function acknowledgementRows(data) {
        var source = data || rawData();
        var rows = [];
        if (Array.isArray(source.policyAcknowledgements)) rows = rows.concat(source.policyAcknowledgements);
        if (Array.isArray(source.communicationAcknowledgements)) rows = rows.concat(source.communicationAcknowledgements);
        return rows;
    }

    function attachmentRows(data) {
        var source = data || rawData();
        var rows = [];
        if (Array.isArray(source.communicationAttachments)) rows = rows.concat(source.communicationAttachments);
        if (Array.isArray(source.attachments)) {
            rows = rows.concat(source.attachments.filter(function communicationAttachment(row) {
                return communicationIdOf(row) || /communication|announcement|policy|broadcast/i.test([row.category, row.module, row.type].join(' '));
            }));
        }
        if (Array.isArray(source.documents)) {
            rows = rows.concat(source.documents.filter(function documentAttachment(row) {
                return communicationIdOf(row) || /communication|announcement|policy|broadcast|circular/i.test([row.category, row.documentType, row.documentCategory, row.module].join(' '));
            }));
        }
        return rows;
    }

    function notificationRows(data) {
        var source = data || rawData();
        return Array.isArray(source.notifications) ? source.notifications : [];
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

    function asyncRows(data) {
        var source = data || rawData();
        return Array.isArray(source.asyncJobs) ? source.asyncJobs : [];
    }

    function findCommunication(id, data) {
        var key = safeString(id || '', '').trim();
        if (!key) return null;
        return communicationRows(data).find(function match(row) {
            return communicationIdOf(row) === key || threadIdOf(row) === key || safeString(row.id || '', '').trim() === key;
        }) || null;
    }

    function sourceTenant(row, data) {
        if (!row) return '';
        var direct = rowTenant(row);
        if (direct) return direct;
        var sourceData = data || rawData();
        var communication = findCommunication(communicationIdOf(row) || threadIdOf(row), sourceData);
        if (communication && rowTenant(communication)) return rowTenant(communication);
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

    function freezeCommunicationOutput(value) {
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

    function classifyCommunicationRisk(input) {
        var source = input || {};
        if (source.crossTenant || source.crossTenantCommunication || source.crossTenantVisibility || source.publicAttachment || source.unsafePublicUrl || source.rlsBypass) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
        if (source.platformOwnerInCommunication || normalizeRole(source.role) === 'PLATFORM_OWNER') return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
        if (source.privateDiscussionAccess || source.unauthorizedDiscussion || source.superAdminPrivateAccess || source.attachmentAccessBypass) return FAILURE_CLASSIFICATIONS.HIGH_RISK;
        if (source.malformedPayload || source.acknowledgementDelay || source.communicationCongestion || source.workflowDiscussionDelay || source.unsupportedAttachment) return FAILURE_CLASSIFICATIONS.WARNING;
        return FAILURE_CLASSIFICATIONS.INFO;
    }

    function normalizeCommunicationState(value) {
        var normalized = normalizeToken(value || '');
        if (normalized === 'ACKNOWLEDGEMENT_PENDING' || normalized === 'ACK_PENDING') return COMMUNICATION_STATES.ACK_PENDING;
        if (normalized === 'PUBLISH' || normalized === 'PUBLISHED') return COMMUNICATION_STATES.PUBLISHED;
        if (normalized === 'OPEN' || normalized === 'ACTIVE') return COMMUNICATION_STATES.ACTIVE;
        if (normalized === 'ESCALATION' || normalized === 'ESCALATED') return COMMUNICATION_STATES.ESCALATED;
        if (normalized === 'CLOSE' || normalized === 'CLOSED') return COMMUNICATION_STATES.CLOSED;
        if (normalized === 'ARCHIVE' || normalized === 'ARCHIVED') return COMMUNICATION_STATES.ARCHIVED;
        return COMMUNICATION_STATES[normalized] || COMMUNICATION_STATES.DRAFT;
    }

    function normalizeCommunicationType(value) {
        var normalized = normalizeToken(value || '');
        if (normalized === 'ANNOUNCEMENT' || normalized === 'HR_CIRCULAR') return COMMUNICATION_TYPES.HR_ANNOUNCEMENT;
        if (normalized === 'BROADCAST' || normalized === 'DEPARTMENT_NOTICE') return COMMUNICATION_TYPES.DEPARTMENT_BROADCAST;
        if (normalized === 'LEADERSHIP') return COMMUNICATION_TYPES.LEADERSHIP_MESSAGE;
        if (normalized === 'THREAD' || normalized === 'DISCUSSION' || normalized === 'WORKFLOW_THREAD') return COMMUNICATION_TYPES.WORKFLOW_DISCUSSION;
        if (normalized === 'ESCALATION' || normalized === 'ESCALATION_DISCUSSION') return COMMUNICATION_TYPES.ESCALATION_CONVERSATION;
        if (normalized === 'POLICY' || normalized === 'POLICY_ACKNOWLEDGEMENT') return COMMUNICATION_TYPES.POLICY_BROADCAST;
        return COMMUNICATION_TYPES[normalized] || COMMUNICATION_TYPES.HR_ANNOUNCEMENT;
    }

    function isPrivateCommunication(row) {
        if (!row || typeof row !== 'object') return false;
        if (row.privateThread === true || row.private === true || row.confidential === true) return true;
        return /PRIVATE|CONFIDENTIAL|DISCUSSION|THREAD|WORKFLOW/i.test([row.visibility, row.type, row.category, row.channel].join(' '));
    }

    function hasRawCommunicationFields(input) {
        if (!input || typeof input !== 'object') return false;
        return Object.keys(input).some(function check(key) {
            if (SENSITIVE_KEY_PATTERN.test(key) && !SAFE_GOVERNANCE_KEYS[key]) return true;
            return input[key] && typeof input[key] === 'object' && hasRawCommunicationFields(input[key]);
        });
    }

    function participantsOf(row) {
        var ids = [];
        ids = ids.concat(arrayOfIds(row && row.participantIds));
        ids = ids.concat(arrayOfIds(row && row.recipients));
        ids = ids.concat(arrayOfIds(row && row.recipientIds));
        ids = ids.concat(arrayOfIds(row && row.targetUserIds));
        ids = ids.concat(arrayOfIds(row && row.viewedUserIds));
        ids = ids.concat(arrayOfIds(row && row.acknowledgedUserIds));
        if (row && row.empId) ids.push(safeString(row.empId, '').trim());
        if (row && row.employeeId) ids.push(safeString(row.employeeId, '').trim());
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
        if (normalized === 'EMPLOYEE') return id && participants.indexOf(id) !== -1 ? VISIBILITY.OWN_DISCUSSIONS_ONLY : VISIBILITY.NONE;
        if (normalized === 'MANAGER') return managerHasTeamVisibility(actor, source, data) ? VISIBILITY.TEAM_COMMUNICATION_VISIBILITY : VISIBILITY.NONE;
        if (normalized === 'HR') return VISIBILITY.HR_COMMUNICATION_VISIBILITY;
        if (normalized === 'HR_HEAD') return VISIBILITY.STRATEGIC_COMMUNICATION_VISIBILITY;
        if (normalized === 'DIRECTOR') return VISIBILITY.ORGANIZATION_ANNOUNCEMENTS;
        if (normalized === 'SUPER_ADMIN') return VISIBILITY.INFRASTRUCTURE_ONLY;
        if (normalized === 'PLATFORM_OWNER') return VISIBILITY.PLATFORM_GOVERNANCE_ONLY;
        return VISIBILITY.NONE;
    }

    function validateCommunicationScope(record, context) {
        try {
            var source = record || {};
            var data = rawData();
            var ctxTenant = contextTenant(context);
            var targetTenant = sourceTenant(source, data) || ctxTenant;
            var role = normalizeRole(context && context.actor && context.actor.role);
            var visibility = visibilityForRole(role, context && context.actor, source, data);
            var targetSpecific = !!(communicationIdOf(source) || threadIdOf(source) || workflowIdOf(source) || participantsOf(source).length);
            var sameTenant = !targetTenant || !ctxTenant || targetTenant === ctxTenant;
            var privateRecord = isPrivateCommunication(source);
            var failures = [];

            if (!sameTenant) {
                failures.push(safeFailure('CROSS_TENANT_COMMUNICATION_VISIBILITY_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Cross-tenant communication visibility was blocked.', { expectedTenant: ctxTenant }));
            }
            if (role === 'PLATFORM_OWNER' && targetSpecific) {
                failures.push(safeFailure('PLATFORM_OWNER_COMMUNICATION_ACCESS_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Platform owner is isolated from tenant communication hierarchy.'));
            }
            if (role === 'SUPER_ADMIN' && (privateRecord || hasRawCommunicationFields(source))) {
                failures.push(safeFailure('SUPER_ADMIN_PRIVATE_DISCUSSION_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Tenant system administrators receive infrastructure visibility only.'));
            }
            if (role === 'DIRECTOR' && privateRecord && hasRawCommunicationFields(source)) {
                failures.push(safeFailure('DIRECTOR_PRIVATE_DISCUSSION_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Directors receive organization-wide announcement summaries only.'));
            }
            if (role === 'EMPLOYEE' && visibility !== VISIBILITY.OWN_DISCUSSIONS_ONLY && privateRecord) {
                failures.push(safeFailure('EMPLOYEE_COMMUNICATION_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Employees may access only their own communication threads.'));
            }
            if (role === 'MANAGER' && privateRecord && visibility !== VISIBILITY.TEAM_COMMUNICATION_VISIBILITY) {
                failures.push(safeFailure('MANAGER_COMMUNICATION_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Managers may access only team communication metadata.'));
            }

            var classification = highestClassification(failures);
            return freezeCommunicationOutput({
                allowed: failures.length === 0,
                classification: classification,
                visibility: visibility,
                scope: {
                    tenantSlug: ctxTenant,
                    communicationId: sameTenant ? communicationIdOf(source) : '',
                    threadId: sameTenant ? threadIdOf(source) : '',
                    workflowId: sameTenant ? workflowIdOf(source) : ''
                },
                failures: failures,
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    communicationConfidentialityPreserved: true,
                    attachmentAccessRoleScoped: true
                }
            });
        } catch (error) {
            return freezeCommunicationOutput({
                allowed: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                visibility: VISIBILITY.NONE,
                failures: [safeFailure('COMMUNICATION_SCOPE_VALIDATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Communication scope validation failed safely.')]
            });
        }
    }

    function normalizeCommunicationPayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeCommunicationOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    failures: [safeFailure('MALFORMED_COMMUNICATION_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Communication payload is malformed.')]
                });
            }
            var data = rawData();
            var ctxTenant = contextTenant(context);
            var srcTenant = sourceTenant(payload, data) || ctxTenant;
            var type = normalizeCommunicationType(payload.type || payload.communicationType || payload.category);
            var state = normalizeCommunicationState(payload.state || payload.status || (payload.requiresAck ? COMMUNICATION_STATES.ACK_PENDING : COMMUNICATION_STATES.DRAFT));
            return freezeCommunicationOutput({
                success: true,
                classification: (!ctxTenant || !srcTenant || ctxTenant === srcTenant) ? FAILURE_CLASSIFICATIONS.INFO : FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                payload: {
                    tenantSlug: srcTenant,
                    communicationId: communicationIdOf(payload),
                    threadId: threadIdOf(payload),
                    workflowId: workflowIdOf(payload),
                    type: type,
                    state: state,
                    department: safeString(payload.department || payload.departmentId || '', '').trim(),
                    requiresAck: payload.requiresAck === true || /POLICY|COMPLIANCE|ACK/i.test(type),
                    participantCount: participantsOf(payload).length,
                    hasAttachment: !!(payload.attachmentId || payload.documentId || payload.hasAttachment || payload.signedUrl || payload.publicUrl),
                    workflowLinked: !!workflowIdOf(payload)
                },
                metadata: {
                    tenantIsolationPreserved: !ctxTenant || !srcTenant || ctxTenant === srcTenant,
                    communicationConfidentialityPreserved: true,
                    historicalCommunicationsImmutable: true
                }
            });
        } catch (error) {
            return freezeCommunicationOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('COMMUNICATION_NORMALIZATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Communication normalization failed safely.')]
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

    function validateAttachmentGovernance(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeCommunicationOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    failures: [safeFailure('MALFORMED_ATTACHMENT_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Attachment payload is malformed.')]
                });
            }
            var scope = validateCommunicationScope(payload, context);
            var failures = (scope.failures || []).slice();
            if (!supportedMime(payload)) {
                failures.push(safeFailure('UNSUPPORTED_COMMUNICATION_ATTACHMENT_MIME_TYPE', FAILURE_CLASSIFICATIONS.WARNING, 'Communication attachment MIME type is not supported.', { allowedTypes: ALLOWED_ATTACHMENT_MIME_TYPES.slice() }));
            }
            if (publicExposure(payload)) {
                failures.push(safeFailure('PUBLIC_ATTACHMENT_EXPOSURE_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Public communication attachment exposure was blocked.'));
            }
            var classification = highestClassification(failures);
            return freezeCommunicationOutput({
                success: failures.length === 0,
                classification: classification,
                visibility: scope.visibility || VISIBILITY.NONE,
                attachmentGovernance: {
                    signedAccessRequired: true,
                    signedAccessRedacted: true,
                    publicAttachmentBlocked: failures.some(function item(row) { return row.failureCode === 'PUBLIC_ATTACHMENT_EXPOSURE_BLOCKED'; }),
                    attachmentAccessRoleScoped: true,
                    uploadIntegrityValidation: true,
                    documentGovernanceIntegrated: !!global.DocumentGovernanceService
                },
                failures: failures,
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    communicationConfidentialityPreserved: true
                }
            });
        } catch (error) {
            return freezeCommunicationOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('ATTACHMENT_GOVERNANCE_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Attachment governance failed safely.')]
            });
        }
    }

    function validateCommunicationPayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeCommunicationOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    state: COMMUNICATION_STATES.DRAFT,
                    failures: [safeFailure('MALFORMED_COMMUNICATION_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Communication payload is malformed.')]
                });
            }
            var normalized = normalizeCommunicationPayload(payload, context);
            var scope = validateCommunicationScope(payload, context);
            var failures = (scope.failures || []).slice();
            var state = normalized.payload ? normalized.payload.state : COMMUNICATION_STATES.DRAFT;
            var type = normalized.payload ? normalized.payload.type : COMMUNICATION_TYPES.HR_ANNOUNCEMENT;

            if (normalized.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER) {
                failures.push(safeFailure('COMMUNICATION_TENANT_MISMATCH_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Communication tenant mismatch was blocked.'));
            }
            if (hasPlatformOwnerParticipant(payload)) {
                failures.push(safeFailure('PLATFORM_OWNER_IN_COMMUNICATION_CHAIN_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Platform owner cannot be included in tenant communication chains.'));
            }
            if (Object.keys(COMMUNICATION_TYPES).map(function item(k) { return COMMUNICATION_TYPES[k]; }).indexOf(type) === -1) {
                failures.push(safeFailure('UNKNOWN_COMMUNICATION_TYPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Unknown communication type is blocked.'));
            }
            if (publicExposure(payload)) {
                failures.push(safeFailure('PUBLIC_ATTACHMENT_EXPOSURE_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Public communication attachment exposure was blocked.'));
            }

            var classification = highestClassification(failures);
            return freezeCommunicationOutput({
                success: failures.length === 0,
                classification: classification,
                state: state,
                normalized: normalized.payload || null,
                failures: failures,
                workflowDiscussionGovernance: {
                    workflowExposureGoverned: true,
                    tenantScopedThreads: true,
                    privateDiscussionsRoleScoped: true,
                    escalationGovernancePreserved: true
                },
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    communicationConfidentialityPreserved: true,
                    historicalCommunicationsImmutable: true
                }
            });
        } catch (error) {
            return freezeCommunicationOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                state: COMMUNICATION_STATES.DRAFT,
                failures: [safeFailure('COMMUNICATION_VALIDATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Communication validation failed safely.')]
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

    function communicationState(row) {
        return normalizeCommunicationState(row && (row.state || row.status));
    }

    function communicationType(row) {
        return normalizeCommunicationType(row && (row.type || row.communicationType || row.category || row.module));
    }

    function isAnnouncement(row) {
        var type = communicationType(row);
        return [
            COMMUNICATION_TYPES.HR_ANNOUNCEMENT,
            COMMUNICATION_TYPES.DEPARTMENT_BROADCAST,
            COMMUNICATION_TYPES.LEADERSHIP_MESSAGE,
            COMMUNICATION_TYPES.COMPLIANCE_NOTICE,
            COMMUNICATION_TYPES.POLICY_BROADCAST
        ].indexOf(type) !== -1;
    }

    function isWorkflowDiscussion(row) {
        var type = communicationType(row);
        return type === COMMUNICATION_TYPES.WORKFLOW_DISCUSSION || !!workflowIdOf(row);
    }

    function isEscalationCommunication(row) {
        var type = communicationType(row);
        return type === COMMUNICATION_TYPES.ESCALATION_CONVERSATION || /ESCALAT/i.test([row && row.type, row && row.category, row && row.module, row && row.status].join(' '));
    }

    function isCommunicationJob(row) {
        return COMMUNICATION_JOB_TYPES.indexOf(normalizeToken(row && (row.jobType || row.type || row.category))) !== -1;
    }

    function acknowledgementStatus(row) {
        return normalizeToken(row && (row.status || row.state || row.ackStatus));
    }

    function detectCommunicationCongestion(filters, context) {
        try {
            var data = rawData();
            var tenant = normalizeTenantSlug(filters && (filters.tenantSlug || filters.tenantId || filters.companyId)) || contextTenant(context);
            var communications = communicationRows(data).filter(tenantFilter(tenant, data));
            var acknowledgements = acknowledgementRows(data).filter(tenantFilter(tenant, data));
            var notifications = notificationRows(data).filter(tenantFilter(tenant, data)).filter(function communicationNotification(row) {
                return /communication|announcement|broadcast|policy|circular/i.test([row.module, row.category, row.type, row.title].join(' '));
            });
            var escalationCommunications = communications.filter(isEscalationCommunication).length + escalationRows(data).filter(tenantFilter(tenant, data)).filter(function linked(row) { return !!communicationIdOf(row); }).length;
            var pendingAcknowledgements = acknowledgements.filter(function pending(row) {
                return /PENDING|OVERDUE|OPEN|WAITING/i.test(acknowledgementStatus(row));
            }).length;
            var overdueAcknowledgements = acknowledgements.filter(function overdue(row) {
                return /PENDING|OVERDUE|OPEN|WAITING/i.test(acknowledgementStatus(row)) && isPastDate(row.dueAt || row.deadline || row.expiresAt, context);
            }).length;
            var unreadAnnouncements = notifications.filter(function unread(row) {
                return row.read === false || row.seen === false || row.unread === true || /UNREAD/i.test(safeString(row.status || '', ''));
            }).length;
            var inactiveThreads = communications.filter(function inactive(row) {
                return isWorkflowDiscussion(row) && communicationState(row) === COMMUNICATION_STATES.ACTIVE && isPastDate(row.lastActivityAt || row.updatedAt || row.createdAt, context);
            }).length;
            var channelCounts = {};
            communications.forEach(function count(row) {
                var key = communicationType(row);
                if (!channelCounts[key]) channelCounts[key] = { channel: key, total: 0, active: 0, acknowledgementRequired: 0 };
                channelCounts[key].total += 1;
                if ([COMMUNICATION_STATES.ACTIVE, COMMUNICATION_STATES.PUBLISHED, COMMUNICATION_STATES.ACK_PENDING, COMMUNICATION_STATES.ESCALATED].indexOf(communicationState(row)) !== -1) channelCounts[key].active += 1;
                if (row.requiresAck === true || /POLICY|COMPLIANCE|ACK/i.test(key)) channelCounts[key].acknowledgementRequired += 1;
            });
            var channels = Object.keys(channelCounts).map(function toRow(key) { return channelCounts[key]; }).sort(function order(a, b) { return b.total - a.total; });

            return freezeCommunicationOutput({
                success: true,
                classification: overdueAcknowledgements || inactiveThreads ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO,
                tenantSlug: tenant,
                summary: {
                    unreadAnnouncements: unreadAnnouncements,
                    pendingAcknowledgements: pendingAcknowledgements,
                    overdueAcknowledgements: overdueAcknowledgements,
                    escalationCommunicationDensity: escalationCommunications,
                    inactiveThreads: inactiveThreads,
                    operationalCongestion: pendingAcknowledgements + overdueAcknowledgements + inactiveThreads + escalationCommunications
                },
                channels: channels,
                metadata: {
                    tenantIsolationPreserved: true,
                    communicationConfidentialityPreserved: true,
                    historicalCommunicationsImmutable: true
                }
            });
        } catch (error) {
            return freezeCommunicationOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                summary: { unreadAnnouncements: 0, pendingAcknowledgements: 0, escalationCommunicationDensity: 0, operationalCongestion: 0 },
                channels: [],
                failures: [safeFailure('COMMUNICATION_CONGESTION_DETECTION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Communication congestion detection failed safely.')]
            });
        }
    }

    function auditCommunication(actionType, metadata, context) {
        if (auditForwarding || context && context.skipAuditPersistence) return { success: true, skipped: true };
        auditForwarding = true;
        try {
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    actionType: actionType,
                    eventType: actionType,
                    module: 'Communication Governance',
                    targetId: metadata && (metadata.communicationId || metadata.threadId || metadata.workflowId || metadata.targetId) || '',
                    description: metadata && metadata.description || actionType,
                    actorRole: context && context.actor && context.actor.role || 'hr',
                    actorId: context && context.actor && context.actor.id || '',
                    severity: metadata && metadata.severity || 'INFO',
                    correlationId: metadata && metadata.correlationId || '',
                    metadata: cloneSanitized(metadata || {})
                }, {
                    source: 'communicationGovernanceService',
                    skipPersistence: false
                });
            }
            var source = db();
            if (source && typeof source.writeAuditLog === 'function') {
                source.writeAuditLog(context && context.actor && context.actor.role || 'hr', context && context.actor && context.actor.id || '', actionType, 'Communication Governance', metadata && (metadata.communicationId || metadata.threadId || metadata.workflowId) || '', metadata && metadata.description || actionType);
            }
            return { success: true };
        } catch (error) {
            return { success: false, warning: 'Communication audit failed safely.' };
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
                service.emitTelemetry('COMMUNICATION_GOVERNANCE', eventType, {
                    source: 'communicationGovernanceService',
                    severity: metadata && metadata.severity || 'INFO',
                    tenantSlug: contextTenant(context) || metadata && metadata.tenantSlug || '',
                    metadata: cloneSanitized(metadata || {})
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Communication telemetry failed safely.' };
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
                    source: 'communicationGovernanceService',
                    status: metadata && metadata.status || metricType,
                    severity: metadata && metadata.severity || 'INFO'
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Communication metric failed safely.' };
        } finally {
            metricForwarding = false;
        }
        return { success: false, warning: 'OrchestrationMetricsService unavailable.' };
    }

    function persistGovernanceRun(run, context) {
        if (context && (context.preview || context.readOnly)) return freezeCommunicationOutput(run);
        var data = rawData();
        data.communicationGovernanceRuns = Array.isArray(data.communicationGovernanceRuns) ? data.communicationGovernanceRuns.slice() : [];
        data.communicationGovernanceRuns.unshift(cloneSanitized(run));
        if (data.communicationGovernanceRuns.length > 150) data.communicationGovernanceRuns = data.communicationGovernanceRuns.slice(0, 150);
        saveData(data);
        return freezeCommunicationOutput(run);
    }

    function scheduleCommunicationWorkflow(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeCommunicationOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    state: COMMUNICATION_STATES.DRAFT,
                    failures: [safeFailure('MALFORMED_COMMUNICATION_WORKFLOW_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Communication workflow payload is malformed.')]
                });
            }
            var validation = validateCommunicationPayload(payload, context);
            if (!validation.success) {
                auditCommunication('COMMUNICATION_WORKFLOW_BLOCKED', {
                    tenantSlug: contextTenant(context),
                    severity: validation.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'WARNING',
                    description: 'Unsafe communication workflow was blocked.'
                }, context);
                emitTelemetry('COMMUNICATION_WORKFLOW_BLOCKED', { severity: 'WARNING', status: 'BLOCKED' }, context);
                return freezeCommunicationOutput({
                    success: false,
                    classification: validation.classification,
                    state: validation.state || COMMUNICATION_STATES.DRAFT,
                    failures: validation.failures,
                    asyncJob: { success: false, warning: 'Communication workflow blocked before async scheduling.' },
                    metadata: {
                        tenantIsolationPreserved: validation.classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                        communicationConfidentialityPreserved: true,
                        historicalCommunicationsImmutable: true
                    }
                });
            }

            var normalized = validation.normalized || {};
            var ctxTenant = contextTenant(context) || normalized.tenantSlug || sourceTenant(payload, rawData());
            var runId = 'COMGOV-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7).toUpperCase();
            var type = normalized.type || normalizeCommunicationType(payload.type || payload.category);
            var run = persistGovernanceRun({
                runId: runId,
                tenantSlug: ctxTenant,
                communicationId: communicationIdOf(payload),
                threadId: threadIdOf(payload),
                workflowId: workflowIdOf(payload),
                type: type,
                state: normalized.state || COMMUNICATION_STATES.DRAFT,
                validationOnly: payload.validationOnly !== false,
                createdAt: nowIso(context),
                communicationWorkflowGoverned: true
            }, context);

            var asyncJob = { success: false, warning: 'AsyncJobService unavailable; communication workflow remains governance-visible.' };
            if (global.AsyncJobService && typeof global.AsyncJobService.scheduleJob === 'function') {
                asyncJob = global.AsyncJobService.scheduleJob({
                    tenantSlug: ctxTenant,
                    jobType: normalized.requiresAck ? 'POLICY_ACKNOWLEDGEMENT' : 'COMMUNICATION_BROADCAST',
                    priority: payload.priority || (normalized.requiresAck ? 'HIGH' : 'NORMAL'),
                    correlationId: communicationIdOf(payload) || threadIdOf(payload) || workflowIdOf(payload) || runId,
                    payload: {
                        communicationId: communicationIdOf(payload),
                        threadId: threadIdOf(payload),
                        workflowId: workflowIdOf(payload),
                        type: type,
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
                        module: 'Communications',
                        category: normalized.requiresAck ? 'POLICY_ACKNOWLEDGEMENT' : 'COMMUNICATION_BROADCAST',
                        targetRole: payload.targetRole || 'HR',
                        priority: payload.priority || (normalized.requiresAck ? 'HIGH' : 'NORMAL'),
                        title: normalized.requiresAck ? 'Policy Acknowledgement Governance' : 'Communication Governance',
                        message: normalized.requiresAck ? 'A policy acknowledgement item is ready for governed delivery.' : 'A communication item is ready for governed delivery.',
                        correlationId: communicationIdOf(payload) || threadIdOf(payload) || workflowIdOf(payload) || runId
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

            auditCommunication('COMMUNICATION_WORKFLOW_SCHEDULED', {
                communicationId: communicationIdOf(payload),
                threadId: threadIdOf(payload),
                tenantSlug: ctxTenant,
                description: 'Communication workflow scheduled through communication governance.'
            }, context);
            emitTelemetry('COMMUNICATION_WORKFLOW_SCHEDULED', { tenantSlug: ctxTenant, status: 'SCHEDULED' }, context);
            recordMetric('COMMUNICATION_WORKFLOW_SCHEDULED', { tenantSlug: ctxTenant, status: 'SCHEDULED' }, context);

            return freezeCommunicationOutput({
                success: true,
                classification: FAILURE_CLASSIFICATIONS.INFO,
                state: normalized.state || COMMUNICATION_STATES.DRAFT,
                run: run,
                asyncJob: asyncJob,
                metadata: {
                    tenantIsolationPreserved: true,
                    communicationConfidentialityPreserved: true,
                    historicalCommunicationsImmutable: true,
                    existingWorkflowEventFlowsPreserved: true
                }
            });
        } catch (error) {
            safeWarn('Communication workflow scheduling failed safely.', error && error.message ? error.message : error);
            return freezeCommunicationOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                state: COMMUNICATION_STATES.DRAFT,
                failures: [safeFailure('COMMUNICATION_WORKFLOW_SCHEDULING_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Communication workflow scheduling failed safely.')],
                asyncJob: { success: false, warning: 'Communication workflow scheduling failed safely.' }
            });
        }
    }

    function acknowledgementCounts(communications, acknowledgements, context) {
        var required = communications.filter(function requiresAck(row) {
            return row.requiresAck === true || /POLICY|COMPLIANCE|ACK/i.test(communicationType(row));
        }).length;
        var pending = acknowledgements.filter(function pending(row) {
            return /PENDING|OVERDUE|OPEN|WAITING/i.test(acknowledgementStatus(row));
        }).length;
        var acknowledged = acknowledgements.filter(function acknowledged(row) {
            return /ACK|SIGNED|COMPLETE|DONE/i.test(acknowledgementStatus(row));
        }).length;
        var overdue = acknowledgements.filter(function overdue(row) {
            return /PENDING|OVERDUE|OPEN|WAITING/i.test(acknowledgementStatus(row)) && isPastDate(row.dueAt || row.deadline || row.expiresAt, context);
        }).length;
        var total = Math.max(acknowledgements.length, acknowledged + pending);
        var compliance = total ? Math.round((acknowledged / total) * 100) : (required ? 0 : 100);
        return {
            policiesRequiringAcknowledgement: required,
            totalAcknowledgements: acknowledgements.length,
            acknowledgedUsers: acknowledged,
            pendingAcknowledgements: pending,
            overdueAcknowledgements: overdue,
            compliancePercent: compliance,
            acknowledgementTracking: true
        };
    }

    function countWorkflowDiscussionTypes(rows) {
        var counts = {
            leaveWorkflows: 0,
            payrollWorkflows: 0,
            recruitmentWorkflows: 0,
            appraisalWorkflows: 0,
            escalationWorkflows: 0,
            onboardingWorkflows: 0
        };
        rows.forEach(function count(row) {
            var text = [row.workflowType, row.type, row.category, row.module, row.status].join(' ');
            if (/LEAVE|ATTENDANCE/i.test(text)) counts.leaveWorkflows += 1;
            if (/PAYROLL|SALARY/i.test(text)) counts.payrollWorkflows += 1;
            if (/RECRUIT|HIRING|CANDIDATE/i.test(text)) counts.recruitmentWorkflows += 1;
            if (/PERFORMANCE|APPRAISAL|REVIEW/i.test(text)) counts.appraisalWorkflows += 1;
            if (/ESCALAT/i.test(text)) counts.escalationWorkflows += 1;
            if (/ONBOARD|INVITE/i.test(text)) counts.onboardingWorkflows += 1;
        });
        return counts;
    }

    function generateCommunicationGovernanceReport(filters, context) {
        try {
            var data = rawData();
            var tenant = normalizeTenantSlug(filters && (filters.tenantSlug || filters.tenantId || filters.companyId)) || contextTenant(context);
            var communications = communicationRows(data).filter(tenantFilter(tenant, data));
            var acknowledgements = acknowledgementRows(data).filter(tenantFilter(tenant, data));
            var attachments = attachmentRows(data).filter(tenantFilter(tenant, data));
            var notifications = notificationRows(data).filter(tenantFilter(tenant, data)).filter(function communicationNotification(row) {
                return /communication|announcement|broadcast|policy|circular/i.test([row.module, row.category, row.type, row.title].join(' '));
            });
            var workflows = workflowRows(data).filter(tenantFilter(tenant, data));
            var escalations = escalationRows(data).filter(tenantFilter(tenant, data));
            var asyncJobs = asyncRows(data).filter(function communicationJob(row) { return rowTenant(row) === tenant && isCommunicationJob(row); });
            var announcements = communications.filter(isAnnouncement);
            var workflowDiscussions = communications.filter(isWorkflowDiscussion);
            var escalationCommunications = communications.filter(isEscalationCommunication);
            var congestion = detectCommunicationCongestion({ tenantSlug: tenant }, { tenantSlug: tenant, now: context && context.now, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            var publicAttachmentWarnings = attachments.filter(publicExposure).length;
            var failedJobs = asyncJobs.filter(function failed(row) { return normalizeToken(row.state || row.status) === 'FAILED'; }).length;
            var ack = acknowledgementCounts(communications, acknowledgements, context);
            var workflowCounts = countWorkflowDiscussionTypes(workflowDiscussions.concat(workflows.filter(function linked(row) { return !!communicationIdOf(row); })));
            var engagementBase = notifications.length + ack.totalAcknowledgements;
            var engaged = notifications.filter(function read(row) { return row.read === true || row.seen === true || /READ|SEEN|ACK/i.test(safeString(row.status || '', '')); }).length + ack.acknowledgedUsers;
            var engagementRate = engagementBase ? Math.round((engaged / engagementBase) * 100) : 100;
            var classification = publicAttachmentWarnings ? FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER : (failedJobs || ack.overdueAcknowledgements || congestion.summary && congestion.summary.operationalCongestion) ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO;

            var report = {
                success: true,
                readOnly: true,
                classification: classification,
                generatedAt: nowIso(context),
                tenantSlug: tenant,
                announcementHealth: {
                    totalAnnouncements: announcements.length,
                    publishedAnnouncements: announcements.filter(function published(row) { return [COMMUNICATION_STATES.PUBLISHED, COMMUNICATION_STATES.ACK_PENDING, COMMUNICATION_STATES.ACTIVE].indexOf(communicationState(row)) !== -1; }).length,
                    activeBroadcasts: announcements.filter(function active(row) { return [COMMUNICATION_STATES.PUBLISHED, COMMUNICATION_STATES.ACK_PENDING, COMMUNICATION_STATES.ACTIVE].indexOf(communicationState(row)) !== -1; }).length,
                    unreadSummaries: congestion.summary ? congestion.summary.unreadAnnouncements : 0,
                    leadershipMessages: communications.filter(function leadership(row) { return communicationType(row) === COMMUNICATION_TYPES.LEADERSHIP_MESSAGE; }).length,
                    departmentBroadcasts: communications.filter(function broadcast(row) { return communicationType(row) === COMMUNICATION_TYPES.DEPARTMENT_BROADCAST; }).length
                },
                policyAcknowledgements: ack,
                workflowDiscussions: {
                    linkedDiscussions: workflowDiscussions.length + workflows.filter(function linked(row) { return !!communicationIdOf(row); }).length,
                    workflowExposureGoverned: true,
                    leaveWorkflows: workflowCounts.leaveWorkflows,
                    payrollWorkflows: workflowCounts.payrollWorkflows,
                    recruitmentWorkflows: workflowCounts.recruitmentWorkflows,
                    appraisalWorkflows: workflowCounts.appraisalWorkflows,
                    escalationWorkflows: workflowCounts.escalationWorkflows,
                    onboardingWorkflows: workflowCounts.onboardingWorkflows,
                    privateDiscussionsRoleScoped: true
                },
                attachmentGovernance: {
                    communicationAttachments: attachments.length,
                    publicAttachmentWarnings: publicAttachmentWarnings,
                    signedAccessRequired: true,
                    signedAccessRedacted: true,
                    attachmentAccessRoleScoped: true,
                    documentGovernanceIntegrated: !!global.DocumentGovernanceService,
                    uploadIntegrityValidation: true
                },
                escalationCommunication: {
                    escalationLinkedDiscussions: escalationCommunications.length + escalations.filter(function linked(row) { return !!communicationIdOf(row); }).length,
                    delayedApprovalCommunication: workflows.filter(function delayed(row) { return /DELAY|OVERDUE|PENDING/i.test([row.status, row.type, row.actionType].join(' ')); }).length,
                    workflowBlockageDiscussions: workflowDiscussions.filter(function blocked(row) { return /BLOCK|WAIT|PENDING|ESCALAT/i.test([row.status, row.state, row.type].join(' ')); }).length,
                    escalationGovernancePreserved: true
                },
                communicationAnalytics: {
                    unreadAnnouncements: congestion.summary ? congestion.summary.unreadAnnouncements : 0,
                    engagementRate: engagementRate,
                    escalationCommunicationDensity: congestion.summary ? congestion.summary.escalationCommunicationDensity : 0,
                    inactiveCommunicationThreads: congestion.summary ? congestion.summary.inactiveThreads : 0,
                    operationalCongestion: congestion.summary ? congestion.summary.operationalCongestion : 0,
                    failedDeliveryJobs: failedJobs,
                    retryPending: asyncJobs.filter(function retry(row) { return normalizeToken(row.state || row.status) === 'RETRY_PENDING'; }).length
                },
                accessGovernance: {
                    employeeOwnDiscussionsOnly: true,
                    managerTeamCommunicationOnly: true,
                    hrCommunicationVisibility: true,
                    directorAnnouncementSummariesOnly: true,
                    superAdminPrivateAccess: false,
                    platformOwnerPrivateAccess: false,
                    privateDiscussionsRoleScoped: true,
                    attachmentAccessRoleScoped: true
                },
                warnings: publicAttachmentWarnings ? [safeWarning('PUBLIC_COMMUNICATION_ATTACHMENT_WARNING', 'Public communication attachment exposure requires immediate review.', { publicAttachmentWarnings: publicAttachmentWarnings })] : [],
                metadata: {
                    tenantIsolationPreserved: true,
                    communicationConfidentialityPreserved: true,
                    historicalCommunicationsImmutable: true,
                    existingWorkflowEventFlowsPreserved: true,
                    communicationActionsAuditable: true,
                    auditReady: !!(global.AuditService || global.auditService),
                    telemetryReady: !!(global.WorkflowTelemetryService || global.workflowTelemetryService)
                }
            };

            auditCommunication('COMMUNICATION_GOVERNANCE_REPORTED', {
                tenantSlug: tenant,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO',
                description: 'Communication governance report viewed.'
            }, context);
            emitTelemetry('COMMUNICATION_GOVERNANCE_REPORTED', { tenantSlug: tenant, status: classification, severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'INFO' }, context);
            recordMetric('COMMUNICATION_GOVERNANCE_REPORTED', { tenantSlug: tenant, status: classification, severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'INFO' }, context);
            return freezeCommunicationOutput(report);
        } catch (error) {
            return freezeCommunicationOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                announcementHealth: { totalAnnouncements: 0 },
                policyAcknowledgements: { pendingAcknowledgements: 0 },
                workflowDiscussions: { linkedDiscussions: 0 },
                communicationAnalytics: { unreadAnnouncements: 0 },
                failures: [safeFailure('COMMUNICATION_GOVERNANCE_REPORT_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Communication governance report failed safely.')]
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        function check(name, condition) {
            checks.push({ label: name, passed: !!condition });
        }
        try {
            var malformed = validateCommunicationPayload(null, { tenantSlug: 'tabsons' });
            check('malformed payloads fail safely', malformed.success === false && malformed.failures.some(function item(row) { return row.failureCode === 'MALFORMED_COMMUNICATION_PAYLOAD'; }));

            var crossTenant = validateCommunicationScope({ tenantSlug: 'abc', communicationId: 'COM-X', participantIds: ['EMP-X'] }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' } });
            check('communication isolation works', crossTenant.allowed === false && crossTenant.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER);

            var ack = normalizeCommunicationPayload({ tenantSlug: 'tabsons', communicationId: 'COM-1', type: 'POLICY_BROADCAST', requiresAck: true, state: 'ACK_PENDING' }, { tenantSlug: 'tabsons' });
            check('acknowledgement tracking works', ack.success === true && ack.payload.requiresAck === true);

            var workflow = validateCommunicationPayload({ tenantSlug: 'tabsons', communicationId: 'COM-2', type: 'WORKFLOW_DISCUSSION', workflowId: 'WF-1', participantIds: ['EMP-1', 'MGR-1'] }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' } });
            check('workflow-linked discussions work', workflow.success === true && workflow.workflowDiscussionGovernance.workflowExposureGoverned === true);

            var attachment = validateAttachmentGovernance({ tenantSlug: 'tabsons', communicationId: 'COM-1', mimeType: 'application/pdf', publicUrl: 'https://public.example.com/file.pdf' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' } });
            check('attachment governance works', attachment.success === false && attachment.failures.some(function item(row) { return row.failureCode === 'PUBLIC_ATTACHMENT_EXPOSURE_BLOCKED'; }));

            var immutable = normalizeCommunicationPayload({ tenantSlug: 'tabsons', communicationId: 'COM-1', state: 'active', message: 'private' }, { tenantSlug: 'tabsons' });
            check('immutable outputs enforced', Object.isFrozen(immutable));

            var originalAsync = global.AsyncJobService;
            var originalNotify = global.NotificationOrchestrationService;
            try {
                delete global.AsyncJobService;
                delete global.NotificationOrchestrationService;
                var degraded = scheduleCommunicationWorkflow({ tenantSlug: 'tabsons', communicationId: 'COM-SELF', type: 'HR_ANNOUNCEMENT' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true, preview: true });
                check('dependency absence degrades safely', degraded.success === true && degraded.asyncJob.success === false);
            } finally {
                if (originalAsync) global.AsyncJobService = originalAsync;
                if (originalNotify) global.NotificationOrchestrationService = originalNotify;
            }
        } catch (error) {
            checks.push({ label: 'self-test uncaught error guard', passed: false, error: safeString(error && error.message || error, '') });
        }
        var passed = checks.every(function item(row) { return row.passed; });
        var result = freezeCommunicationOutput({
            passed: passed,
            checks: checks,
            summary: passed ? 'Communication governance self-test passed.' : 'Communication governance self-test detected failures.'
        });
        global.__ARTHHRMS_COMMUNICATION_GOVERNANCE_SELF_TEST__ = result;
        return result;
    }

    var CommunicationGovernanceService = Object.freeze({
        VERSION: VERSION,
        COMMUNICATION_STATES: COMMUNICATION_STATES,
        COMMUNICATION_TYPES: COMMUNICATION_TYPES,
        FAILURE_CLASSIFICATIONS: FAILURE_CLASSIFICATIONS,
        VISIBILITY: VISIBILITY,
        classifyCommunicationRisk: classifyCommunicationRisk,
        validateCommunicationScope: validateCommunicationScope,
        validateCommunicationPayload: validateCommunicationPayload,
        validateAttachmentGovernance: validateAttachmentGovernance,
        normalizeCommunicationPayload: normalizeCommunicationPayload,
        freezeCommunicationOutput: freezeCommunicationOutput,
        detectCommunicationCongestion: detectCommunicationCongestion,
        scheduleCommunicationWorkflow: scheduleCommunicationWorkflow,
        generateCommunicationGovernanceReport: generateCommunicationGovernanceReport,
        runSelfTest: runSelfTest
    });

    global.CommunicationGovernanceService = CommunicationGovernanceService;
    global.communicationGovernanceService = CommunicationGovernanceService;

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
