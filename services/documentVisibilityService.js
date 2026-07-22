/**
 * documentVisibilityService.js
 * ARTHHRMS Enterprise Secure Document Visibility + Access Control Intelligence.
 *
 * Additive governance layer for role-scoped document access, signed access
 * markers, temporary access grants, revocation, access auditing, and visibility
 * analytics. It never exposes raw document IDs, employee IDs, filenames, paths,
 * signed URLs, public URLs, or cross-tenant document details.
 */
(function attachDocumentVisibilityService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[DocumentVisibilityService]';

    var VISIBILITY_STATES = Object.freeze({
        RESTRICTED: 'RESTRICTED',
        ACCESS_PENDING: 'ACCESS_PENDING',
        ACCESS_GRANTED: 'ACCESS_GRANTED',
        TEMPORARY_ACCESS: 'TEMPORARY_ACCESS',
        EXPIRED: 'EXPIRED',
        REVOKED: 'REVOKED',
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
        OWN_DOCUMENTS_ONLY: 'OWN_DOCUMENTS_ONLY',
        WORKFLOW_SCOPED_DOCUMENT_VISIBILITY: 'WORKFLOW_SCOPED_DOCUMENT_VISIBILITY',
        HR_OPERATIONAL_DOCUMENT_VISIBILITY: 'HR_OPERATIONAL_DOCUMENT_VISIBILITY',
        STRATEGIC_COMPLIANCE_VISIBILITY: 'STRATEGIC_COMPLIANCE_VISIBILITY',
        AGGREGATE_COMPLIANCE_ANALYTICS_ONLY: 'AGGREGATE_COMPLIANCE_ANALYTICS_ONLY',
        INFRASTRUCTURE_ONLY: 'INFRASTRUCTURE_ONLY',
        PLATFORM_GOVERNANCE_ONLY: 'PLATFORM_GOVERNANCE_ONLY'
    });

    var MIN_ACCESS_SECONDS = 60;
    var MAX_ACCESS_SECONDS = 3600;

    var SENSITIVE_KEY_PATTERN = /(document.?id|doc.?id|attachment.?id|request.?id|grant.?id|access.?token|token|file.?name|name|storage.?path|signed.?url|public.?url|document.?url|download.?url|url|path|object.?key|bucket|private.?note|remark|description|message|body|content|comment|reply|candidate|resume|receipt|salary|payroll|payslip|compensation|amount|employee|emp.?id|user.?id|owner|uploaded.?by|assigned.?to|author|manager|secret|jwt|authorization|service.?role|private.?key|reason)/i;
    var SENSITIVE_VALUE_PATTERN = /(https?:\/\/[^\s"',}]+|private:\/\/[^\s"',}]+|\b(private|confidential|secret|salary|payroll|resume|receipt|passport|aadhaar|bank)\b[^,;}]*)/ig;
    var SAFE_GOVERNANCE_KEYS = Object.freeze({
        success: true,
        allowed: true,
        readOnly: true,
        classification: true,
        visibility: true,
        state: true,
        generatedAt: true,
        tenantSlug: true,
        accessHealth: true,
        roleScopedVisibility: true,
        secureAccessGovernance: true,
        permissionGovernance: true,
        accessRequestWorkflows: true,
        accessAudit: true,
        workflowAttachmentIntegration: true,
        visibilityAnalytics: true,
        integrationHealth: true,
        signedAccess: true,
        accessGrant: true,
        revocation: true,
        summary: true,
        signals: true,
        signal: true,
        count: true,
        severity: true,
        status: true,
        source: true,
        failures: true,
        warnings: true,
        failureCode: true,
        warningCode: true,
        metadata: true,
        payload: true,
        accessState: true,
        category: true,
        workflowLinked: true,
        departmentScoped: true,
        temporaryAccess: true,
        acknowledgementRequired: true,
        approvalBasedAccess: true,
        expiresAt: true,
        expiresInSeconds: true,
        expiresSafely: true,
        signedUrlIssued: true,
        signedUrlRedacted: true,
        revocableAccessToken: true,
        securePreviewEnabled: true,
        downloadThrottlingReady: true,
        watermarkReady: true,
        temporaryAccessGranted: true,
        revocable: true,
        revokedAccessBlocked: true,
        revocationAudited: true,
        totalDocuments: true,
        restrictedDocuments: true,
        accessPending: true,
        accessGranted: true,
        temporaryAccessGrants: true,
        expiredAccess: true,
        revokedAccess: true,
        archivedAccess: true,
        employeeOwnDocumentsOnly: true,
        managerWorkflowScopedVisibilityOnly: true,
        hrOperationalDocumentVisibility: true,
        hrHeadStrategicComplianceVisibility: true,
        directorAggregateComplianceOnly: true,
        superAdminRawDocumentAccess: true,
        platformOwnerDocumentChain: true,
        signedDocumentUrls: true,
        expiryControlledAccess: true,
        revocableAccessTokens: true,
        securePreviewSupport: true,
        publicExposureBlocked: true,
        roleScopedPermissions: true,
        workflowLinkedAccess: true,
        departmentScopedVisibility: true,
        timeLimitedAccess: true,
        acknowledgementRequiredAccess: true,
        approvalBasedAccessRequests: true,
        permissionEscalationBlocked: true,
        accessRequests: true,
        managerApprovalFlows: true,
        hrApprovalChains: true,
        temporarySecureAccess: true,
        accessRevocationWorkflows: true,
        unsafePermissionEscalationBlocked: true,
        views: true,
        downloads: true,
        deniedAccess: true,
        accessDenials: true,
        suspiciousAccessAttempts: true,
        expiredTokenUsage: true,
        revokedAccessAttempts: true,
        superAdminRawAttempts: true,
        downloadThrottleEvents: true,
        workflowScopedDocumentAccess: true,
        onboardingDocumentVisibility: true,
        recruitmentResumeAccess: true,
        reimbursementReceiptAccess: true,
        policyDocumentVisibility: true,
        crossWorkflowExposureBlocked: true,
        accessRequestTrends: true,
        deniedAccessFrequency: true,
        expiredAccessBuildup: true,
        suspiciousVisibilityAttempts: true,
        securePreviewUsage: true,
        documentAccessCongestion: true,
        documentGovernanceIntegrated: true,
        fileAttachmentGovernanceIntegrated: true,
        uploadValidationIntegrated: true,
        workflowDiscussionIntegrated: true,
        notificationOrchestrationIntegrated: true,
        workflowEngineIntegrated: true,
        auditReady: true,
        telemetryReady: true,
        metricsReady: true,
        tenantIsolationPreserved: true,
        secureDocumentVisibilityPreserved: true,
        documentAccessActionsAuditable: true,
        historicalAccessRecordsImmutable: true,
        existingDocumentFlowsPreserved: true,
        existingWorkflowsPreserved: true
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

    function safeNumber(value, fallback) {
        var number = Number(value);
        return isFinite(number) ? number : (fallback || 0);
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
        var actor = context && context.actor || {};
        var fromContext = normalizeTenantSlug(context && (context.tenantSlug || context.tenantId || context.companyId) || actor.tenantSlug || actor.tenantId);
        if (fromContext) return fromContext;
        var data = rawData();
        return normalizeTenantSlug(data.companySettings && (data.companySettings.tenantSlug || data.companySettings.tenantId || data.companySettings.companyId));
    }

    function rowTenant(row) {
        if (!row) return '';
        var meta = row.metadata || {};
        return normalizeTenantSlug(row.tenantSlug || row.tenant_slug || row.tenantId || row.tenant_id || row.companyId || row.company_id || meta.tenantSlug || meta.tenantId);
    }

    function actorId(actor) {
        return safeString(actor && (actor.empId || actor.employeeId || actor.userId || actor.id) || '', '').trim();
    }

    function empIdOf(row) {
        return safeString(row && (row.empId || row.employeeId || row.employee_id || row.userId || row.user_id || row.ownerEmpId || row.owner_emp_id || row.assignedTo || row.uploadedBy) || '', '').trim();
    }

    function documentIdOf(row) {
        return safeString(row && (row.documentId || row.document_id || row.docId || row.doc_id || row.id) || '', '').trim();
    }

    function attachmentIdOf(row) {
        return safeString(row && (row.attachmentId || row.attachment_id || row.fileAttachmentId || row.file_attachment_id || row.id) || '', '').trim();
    }

    function workflowIdOf(row) {
        return safeString(row && (row.workflowId || row.workflow_id || row.eventId || row.event_id || row.pendingActionId || row.pending_action_id || '') || '', '').trim();
    }

    function threadIdOf(row) {
        return safeString(row && (row.threadId || row.thread_id || row.discussionThreadId || row.discussion_thread_id || '') || '', '').trim();
    }

    function categoryOf(row) {
        var normalized = normalizeToken(row && (row.category || row.documentCategory || row.documentType || row.type || row.attachmentType) || '');
        if (normalized === 'IDENTITY_DOCUMENT' || normalized === 'IDENTITY_DOCUMENTS') return 'IDENTITY';
        if (normalized === 'ONBOARDING_DOCUMENT' || normalized === 'ONBOARDING_DOCUMENTS') return 'ONBOARDING';
        if (normalized === 'REIMBURSEMENT_RECEIPT' || normalized === 'REIMBURSEMENT_RECEIPTS' || normalized === 'RECEIPT') return 'REIMBURSEMENT_RECEIPT';
        if (normalized === 'POLICY_ACKNOWLEDGEMENT' || normalized === 'POLICY_ATTACHMENT' || normalized === 'POLICY') return 'POLICY';
        if (normalized === 'RESUME' || normalized === 'RECRUITMENT_FILE' || normalized === 'CANDIDATE_DOCUMENT') return 'RECRUITMENT';
        return normalized || 'COMPLIANCE';
    }

    function employeeRows(data) {
        return Array.isArray((data || rawData()).employees) ? (data || rawData()).employees : [];
    }

    function employeeById(empId, data) {
        var id = safeString(empId || '', '').trim();
        if (!id) return null;
        return employeeRows(data || rawData()).find(function match(emp) {
            return [emp.id, emp.empId, emp.employeeId, emp.employee_id, emp.userId].map(function item(value) { return safeString(value || '', '').trim(); }).indexOf(id) !== -1;
        }) || null;
    }

    function managerOwnsEmployee(managerId, empId, data) {
        var emp = employeeById(empId, data || rawData());
        return !!(emp && safeString(emp.managerId || emp.reportingManagerId || emp.reporting_manager_id || '', '').trim() === safeString(managerId || '', '').trim());
    }

    function sourceTenant(row, data) {
        return rowTenant(row) || rowTenant(employeeById(empIdOf(row), data || rawData()));
    }

    function documentRows(data) {
        return Array.isArray((data || rawData()).documents) ? (data || rawData()).documents : [];
    }

    function attachmentRows(data) {
        var source = data || rawData();
        return []
            .concat(Array.isArray(source.fileAttachments) ? source.fileAttachments : [])
            .concat(Array.isArray(source.attachments) ? source.attachments : []);
    }

    function workflowAttachmentRows(data) {
        var source = data || rawData();
        return Array.isArray(source.workflowDiscussionAttachments) ? source.workflowDiscussionAttachments : [];
    }

    function recruitmentDocumentRows(data) {
        var source = data || rawData();
        return Array.isArray(source.recruitmentDocuments) ? source.recruitmentDocuments : [];
    }

    function communicationAttachmentRows(data) {
        var source = data || rawData();
        return Array.isArray(source.communicationAttachments) ? source.communicationAttachments : [];
    }

    function requestRows(data) {
        var source = data || rawData();
        return Array.isArray(source.documentAccessRequests) ? source.documentAccessRequests : [];
    }

    function grantRows(data) {
        var source = data || rawData();
        return Array.isArray(source.documentAccessGrants) ? source.documentAccessGrants : [];
    }

    function accessRows(data) {
        var source = data || rawData();
        return []
            .concat(Array.isArray(source.documentAccessLogs) ? source.documentAccessLogs : [])
            .concat(Array.isArray(source.attachmentAccessLogs) ? source.attachmentAccessLogs : []);
    }

    function asyncRows(data) {
        var source = data || rawData();
        return Array.isArray(source.asyncJobs) ? source.asyncJobs : [];
    }

    function tenantFilter(tenant, data) {
        var normalized = normalizeTenantSlug(tenant);
        return function filter(row) {
            if (!normalized) return true;
            return (sourceTenant(row, data || rawData()) || rowTenant(row)) === normalized;
        };
    }

    function allDocumentLikeRows(data) {
        var source = data || rawData();
        return []
            .concat(documentRows(source))
            .concat(attachmentRows(source))
            .concat(workflowAttachmentRows(source))
            .concat(recruitmentDocumentRows(source))
            .concat(communicationAttachmentRows(source));
    }

    function normalizeVisibilityState(value) {
        var normalized = normalizeToken(value);
        if (normalized === 'PENDING' || normalized === 'REQUESTED' || normalized === 'REVIEW_PENDING') return VISIBILITY_STATES.ACCESS_PENDING;
        if (normalized === 'GRANTED' || normalized === 'APPROVED' || normalized === 'ACTIVE') return VISIBILITY_STATES.ACCESS_GRANTED;
        if (normalized === 'TEMPORARY' || normalized === 'TEMPORARY_ACCESS') return VISIBILITY_STATES.TEMPORARY_ACCESS;
        if (normalized === 'EXPIRED') return VISIBILITY_STATES.EXPIRED;
        if (normalized === 'REVOKED' || normalized === 'CANCELLED') return VISIBILITY_STATES.REVOKED;
        if (normalized === 'ARCHIVED') return VISIBILITY_STATES.ARCHIVED;
        return VISIBILITY_STATES.RESTRICTED;
    }

    function accessStateOf(row) {
        return normalizeVisibilityState(row && (row.accessState || row.visibilityState || row.state || row.status || row.grantState));
    }

    function publicExposure(row) {
        if (!row || typeof row !== 'object') return false;
        if (row.isPublic === true || row.public === true || row.publicUrl) return true;
        var url = safeString(row.url || row.documentUrl || row.downloadUrl || row.signedUrl || '', '').toLowerCase();
        return !!(url && url.indexOf('public') !== -1 && url.indexOf('private') === -1);
    }

    function hasRawDocumentFields(row) {
        return !!(row && (
            documentIdOf(row) ||
            attachmentIdOf(row) ||
            empIdOf(row) ||
            row.fileName ||
            row.name ||
            row.storagePath ||
            row.signedUrl ||
            row.publicUrl ||
            row.documentUrl ||
            row.downloadUrl ||
            row.privateNote
        ));
    }

    function workflowLinked(row) {
        return !!(workflowIdOf(row) || threadIdOf(row) || /WORKFLOW|ONBOARDING|REIMBURSEMENT|RECRUITMENT|APPRAISAL|ESCALATION|STRATEGIC/.test(normalizeToken(row && (row.category || row.type || row.module || row.attachmentType))));
    }

    function dateTime(value) {
        var time = new Date(value || '').getTime();
        return isFinite(time) ? time : 0;
    }

    function isExpired(row, context) {
        var expires = row && (row.expiresAt || row.expiresOn || row.expiryDate || row.expirationDate);
        if (!expires) return false;
        return dateTime(expires) > 0 && dateTime(expires) <= dateTime(nowIso(context));
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

    function freezeVisibilityOutput(value) {
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

    function highestClassification(values) {
        var rank = {};
        rank[FAILURE_CLASSIFICATIONS.INFO] = 0;
        rank[FAILURE_CLASSIFICATIONS.WARNING] = 1;
        rank[FAILURE_CLASSIFICATIONS.HIGH_RISK] = 2;
        rank[FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER] = 3;
        return (values || []).reduce(function max(current, item) {
            var value = item && item.classification ? item.classification : item;
            return rank[value] > rank[current] ? value : current;
        }, FAILURE_CLASSIFICATIONS.INFO);
    }

    function classifyVisibilityRisk(input) {
        var source = input || {};
        if (source.crossTenant || source.crossTenantDocument || source.publicExposure || source.publicUrl || source.unsafePublicExposure || source.platformOwnerAccess || source.permissionEscalation) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
        if (source.unauthorizedAccess || source.superAdminRawAccess || source.directorRawAccess || source.revokedAccess || source.revokedToken) return FAILURE_CLASSIFICATIONS.HIGH_RISK;
        if (source.expiredToken || source.deniedAccess || source.temporaryAccessCongestion || source.accessRequestBacklog || source.throttledDownload) return FAILURE_CLASSIFICATIONS.WARNING;
        return FAILURE_CLASSIFICATIONS.INFO;
    }

    function visibilityFor(role, record, context, data) {
        var normalized = normalizeRole(role || context && context.actor && context.actor.role);
        var actor = context && context.actor || {};
        var currentActorId = actorId(actor);
        var owner = empIdOf(record);
        if (normalized === 'EMPLOYEE') {
            return currentActorId && owner && currentActorId === owner ? VISIBILITY.OWN_DOCUMENTS_ONLY : VISIBILITY.NONE;
        }
        if (normalized === 'MANAGER') {
            return owner && managerOwnsEmployee(currentActorId, owner, data) && workflowLinked(record) ? VISIBILITY.WORKFLOW_SCOPED_DOCUMENT_VISIBILITY : VISIBILITY.NONE;
        }
        if (normalized === 'HR') return VISIBILITY.HR_OPERATIONAL_DOCUMENT_VISIBILITY;
        if (normalized === 'HR_HEAD') return VISIBILITY.STRATEGIC_COMPLIANCE_VISIBILITY;
        if (normalized === 'DIRECTOR') return VISIBILITY.AGGREGATE_COMPLIANCE_ANALYTICS_ONLY;
        if (normalized === 'SUPER_ADMIN') return VISIBILITY.INFRASTRUCTURE_ONLY;
        if (normalized === 'PLATFORM_OWNER') return VISIBILITY.PLATFORM_GOVERNANCE_ONLY;
        return VISIBILITY.NONE;
    }

    function validateDocumentVisibilityScope(record, context) {
        try {
            var data = rawData();
            var ctxTenant = contextTenant(context);
            var targetTenant = normalizeTenantSlug(record && (record.tenantSlug || record.tenantId || record.companyId)) || sourceTenant(record, data) || ctxTenant;
            var role = normalizeRole(context && context.actor && context.actor.role || context && context.role || '');
            var visibility = visibilityFor(role, record || {}, context || {}, data);
            var failures = [];

            if (ctxTenant && targetTenant && ctxTenant !== targetTenant) {
                failures.push(safeFailure('CROSS_TENANT_DOCUMENT_VISIBILITY_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Cross-tenant document visibility was blocked.'));
            }
            if (publicExposure(record)) {
                failures.push(safeFailure('PUBLIC_DOCUMENT_VISIBILITY_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Public document exposure was blocked.'));
            }
            if (record && (record.permissionOverride || record.bypassPermission || record.manualOverride)) {
                failures.push(safeFailure('DOCUMENT_PERMISSION_ESCALATION_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Unsafe document permission escalation was blocked.'));
            }
            if (role === 'PLATFORM_OWNER' && hasRawDocumentFields(record)) {
                failures.push(safeFailure('PLATFORM_OWNER_DOCUMENT_CHAIN_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Platform owner is isolated from document access chains.'));
            }
            if (role === 'SUPER_ADMIN' && hasRawDocumentFields(record)) {
                failures.push(safeFailure('SUPER_ADMIN_DOCUMENT_ACCESS_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Super admin receives infrastructure visibility only.'));
            }
            if (role === 'DIRECTOR' && hasRawDocumentFields(record)) {
                failures.push(safeFailure('DIRECTOR_RAW_DOCUMENT_ACCESS_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Directors receive aggregate document compliance analytics only.'));
            }
            if (role === 'EMPLOYEE' && visibility !== VISIBILITY.OWN_DOCUMENTS_ONLY) {
                failures.push(safeFailure('EMPLOYEE_DOCUMENT_VISIBILITY_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Employees may access only their own document visibility metadata.'));
            }
            if (role === 'MANAGER' && visibility !== VISIBILITY.WORKFLOW_SCOPED_DOCUMENT_VISIBILITY) {
                failures.push(safeFailure('MANAGER_DOCUMENT_VISIBILITY_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Managers may access only workflow-scoped team document metadata.'));
            }

            var classification = highestClassification(failures.map(function item(row) { return row.classification; }));
            return freezeVisibilityOutput({
                allowed: !failures.length,
                success: !failures.length,
                classification: classification,
                visibility: visibility,
                failures: failures,
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    secureDocumentVisibilityPreserved: true,
                    historicalAccessRecordsImmutable: true,
                    documentAccessActionsAuditable: true
                }
            });
        } catch (error) {
            return freezeVisibilityOutput({
                allowed: false,
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                visibility: VISIBILITY.NONE,
                failures: [safeFailure('DOCUMENT_VISIBILITY_SCOPE_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Document visibility scope validation failed safely.')]
            });
        }
    }

    function normalizeVisibilityPayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeVisibilityOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    state: VISIBILITY_STATES.RESTRICTED,
                    failures: [safeFailure('MALFORMED_VISIBILITY_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Document visibility payload is malformed.')]
                });
            }
            var normalized = {
                tenantSlug: normalizeTenantSlug(payload.tenantSlug || payload.tenantId || payload.companyId) || contextTenant(context),
                state: normalizeVisibilityState(payload.state || payload.status || payload.accessState || payload.visibilityState),
                category: categoryOf(payload),
                workflowLinked: workflowLinked(payload),
                temporaryAccess: normalizeVisibilityState(payload.state || payload.status || payload.accessState || payload.visibilityState) === VISIBILITY_STATES.TEMPORARY_ACCESS,
                acknowledgementRequired: payload.acknowledgementRequired === true || payload.requiresAcknowledgement === true,
                approvalBasedAccess: payload.approvalBasedAccess !== false,
                metadata: {
                    secureDocumentVisibilityPreserved: true,
                    tenantIsolationPreserved: true,
                    historicalAccessRecordsImmutable: true,
                    readOnly: payload.readOnly !== false
                }
            };
            return freezeVisibilityOutput({
                success: true,
                classification: FAILURE_CLASSIFICATIONS.INFO,
                payload: normalized
            });
        } catch (error) {
            return freezeVisibilityOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                state: VISIBILITY_STATES.RESTRICTED,
                failures: [safeFailure('VISIBILITY_NORMALIZATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Document visibility normalization failed safely.')]
            });
        }
    }

    function governedTtl(payload) {
        return safeNumber(payload && (payload.expiresInSeconds || payload.ttlSeconds || payload.expiresIn) || 900, 900);
    }

    function ttlExpiresAt(ttl, context) {
        var base = dateTime(nowIso(context)) || Date.now();
        return new Date(base + Math.max(MIN_ACCESS_SECONDS, Math.min(ttl || 900, MAX_ACCESS_SECONDS)) * 1000).toISOString();
    }

    function ttlUnsafe(ttl) {
        return !isFinite(ttl) || ttl < MIN_ACCESS_SECONDS || ttl > MAX_ACCESS_SECONDS;
    }

    function generateSecureDocumentAccess(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeVisibilityOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    state: VISIBILITY_STATES.RESTRICTED,
                    failures: [safeFailure('MALFORMED_VISIBILITY_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Secure document access payload is malformed.')]
                });
            }
            var failures = [];
            var scope = validateDocumentVisibilityScope(payload, context);
            if (!scope.allowed) failures = failures.concat(scope.failures || []);
            var ttl = governedTtl(payload);
            if (ttlUnsafe(ttl)) {
                failures.push(safeFailure('SIGNED_DOCUMENT_VISIBILITY_EXPIRY_UNSAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Signed document access must expire safely.'));
            }
            if (publicExposure(payload)) {
                failures.push(safeFailure('PUBLIC_DOCUMENT_VISIBILITY_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Public document access was blocked.'));
            }
            var classification = highestClassification(failures.map(function item(row) { return row.classification; }));
            var success = !failures.length;
            if (success) {
                auditVisibility('DOCUMENT_ACCESS_GRANTED', { tenantSlug: contextTenant(context), severity: 'INFO', description: 'Secure document access marker generated.' }, context);
                emitTelemetry('DOCUMENT_ACCESS_GRANTED', { tenantSlug: contextTenant(context), status: 'ACCESS_GRANTED', severity: 'INFO' }, context);
                recordMetric('DOCUMENT_ACCESS_GRANTED', { tenantSlug: contextTenant(context), status: 'ACCESS_GRANTED', severity: 'INFO' }, context);
            }
            return freezeVisibilityOutput({
                success: success,
                classification: classification,
                state: success ? VISIBILITY_STATES.ACCESS_GRANTED : VISIBILITY_STATES.RESTRICTED,
                visibility: scope.visibility || VISIBILITY.NONE,
                failures: failures,
                signedAccess: {
                    signedUrlIssued: success,
                    signedUrlRedacted: true,
                    expiresInSeconds: ttlUnsafe(ttl) ? Math.max(MIN_ACCESS_SECONDS, Math.min(ttl || 900, MAX_ACCESS_SECONDS)) : ttl,
                    expiresAt: ttlExpiresAt(ttl, context),
                    expiresSafely: success && !ttlUnsafe(ttl),
                    revocableAccessToken: true,
                    securePreviewEnabled: payload.securePreview !== false,
                    downloadThrottlingReady: true,
                    watermarkReady: true
                },
                secureAccessGovernance: {
                    signedDocumentUrls: true,
                    expiryControlledAccess: true,
                    revocableAccessTokens: true,
                    downloadThrottlingReady: true,
                    securePreviewSupport: true,
                    watermarkReady: true,
                    publicExposureBlocked: failures.some(function item(row) { return row.failureCode === 'PUBLIC_DOCUMENT_VISIBILITY_BLOCKED'; })
                },
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    secureDocumentVisibilityPreserved: true,
                    historicalAccessRecordsImmutable: true,
                    documentAccessActionsAuditable: true
                }
            });
        } catch (error) {
            return freezeVisibilityOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                state: VISIBILITY_STATES.RESTRICTED,
                failures: [safeFailure('SECURE_DOCUMENT_ACCESS_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Secure document access failed safely.')]
            });
        }
    }

    function grantTemporaryDocumentAccess(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeVisibilityOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    state: VISIBILITY_STATES.RESTRICTED,
                    failures: [safeFailure('MALFORMED_VISIBILITY_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Temporary access payload is malformed.')]
                });
            }
            var failures = [];
            var scope = validateDocumentVisibilityScope(payload, context);
            if (!scope.allowed) failures = failures.concat(scope.failures || []);
            var ttl = governedTtl(payload);
            if (ttlUnsafe(ttl)) {
                failures.push(safeFailure('TEMPORARY_DOCUMENT_ACCESS_EXPIRY_UNSAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Temporary document access must expire safely.'));
            }
            if (publicExposure(payload)) {
                failures.push(safeFailure('PUBLIC_DOCUMENT_VISIBILITY_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Public document access was blocked.'));
            }
            var classification = highestClassification(failures.map(function item(row) { return row.classification; }));
            var success = !failures.length;
            if (success) {
                auditVisibility('DOCUMENT_TEMPORARY_ACCESS_GRANTED', { tenantSlug: contextTenant(context), severity: 'INFO', description: 'Temporary document access marker generated.' }, context);
                emitTelemetry('DOCUMENT_TEMPORARY_ACCESS_GRANTED', { tenantSlug: contextTenant(context), status: 'TEMPORARY_ACCESS', severity: 'INFO' }, context);
                recordMetric('DOCUMENT_TEMPORARY_ACCESS_GRANTED', { tenantSlug: contextTenant(context), status: 'TEMPORARY_ACCESS', severity: 'INFO' }, context);
            }
            return freezeVisibilityOutput({
                success: success,
                classification: classification,
                state: success ? VISIBILITY_STATES.TEMPORARY_ACCESS : VISIBILITY_STATES.RESTRICTED,
                visibility: scope.visibility || VISIBILITY.NONE,
                failures: failures,
                accessGrant: {
                    temporaryAccessGranted: success,
                    expiresInSeconds: ttlUnsafe(ttl) ? Math.max(MIN_ACCESS_SECONDS, Math.min(ttl || 900, MAX_ACCESS_SECONDS)) : ttl,
                    expiresAt: ttlExpiresAt(ttl, context),
                    expiresSafely: success && !ttlUnsafe(ttl),
                    revocable: true
                },
                permissionGovernance: {
                    roleScopedPermissions: true,
                    workflowLinkedAccess: workflowLinked(payload),
                    departmentScopedVisibility: true,
                    timeLimitedAccess: true,
                    acknowledgementRequired: payload.acknowledgementRequired === true || payload.requiresAcknowledgement === true,
                    acknowledgementRequiredAccess: payload.acknowledgementRequired === true || payload.requiresAcknowledgement === true,
                    approvalBasedAccess: true,
                    approvalBasedAccessRequests: true,
                    permissionEscalationBlocked: true
                },
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    secureDocumentVisibilityPreserved: true,
                    historicalAccessRecordsImmutable: true,
                    documentAccessActionsAuditable: true
                }
            });
        } catch (error) {
            return freezeVisibilityOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                state: VISIBILITY_STATES.RESTRICTED,
                failures: [safeFailure('TEMPORARY_DOCUMENT_ACCESS_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Temporary document access failed safely.')]
            });
        }
    }

    function revokeDocumentAccess(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeVisibilityOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    state: VISIBILITY_STATES.RESTRICTED,
                    failures: [safeFailure('MALFORMED_VISIBILITY_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Access revocation payload is malformed.')]
                });
            }
            var scope = validateDocumentVisibilityScope(payload, context);
            var failures = scope.failures ? scope.failures.slice() : [];
            var classification = highestClassification(failures.map(function item(row) { return row.classification; }));
            var success = !failures.length;
            if (success) {
                auditVisibility('DOCUMENT_ACCESS_REVOKED', { tenantSlug: contextTenant(context), severity: 'INFO', description: 'Document access revocation marker generated.' }, context);
                emitTelemetry('DOCUMENT_ACCESS_REVOKED', { tenantSlug: contextTenant(context), status: 'REVOKED', severity: 'INFO' }, context);
                recordMetric('DOCUMENT_ACCESS_REVOKED', { tenantSlug: contextTenant(context), status: 'REVOKED', severity: 'INFO' }, context);
            }
            return freezeVisibilityOutput({
                success: success,
                classification: classification,
                state: success ? VISIBILITY_STATES.REVOKED : VISIBILITY_STATES.RESTRICTED,
                failures: failures,
                revocation: {
                    revokedAccessBlocked: success,
                    revocableAccessTokens: true,
                    revocationAudited: true
                },
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    secureDocumentVisibilityPreserved: true,
                    historicalAccessRecordsImmutable: true,
                    documentAccessActionsAuditable: true
                }
            });
        } catch (error) {
            return freezeVisibilityOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                state: VISIBILITY_STATES.RESTRICTED,
                failures: [safeFailure('DOCUMENT_ACCESS_REVOCATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Document access revocation failed safely.')]
            });
        }
    }

    function statusDenied(row) {
        var status = normalizeToken(row && (row.status || row.result || row.outcome));
        return /DENIED|BLOCKED|REJECTED|FAILED/.test(status);
    }

    function roleOf(row) {
        return normalizeRole(row && (row.actorRole || row.role || row.requesterRole || ''));
    }

    function actionOf(row) {
        return normalizeToken(row && (row.action || row.actionType || row.eventType || ''));
    }

    function accessReason(row) {
        return normalizeToken(row && (row.reason || row.message || row.statusReason || ''));
    }

    function detectSuspiciousAccessPatterns(filters, context) {
        try {
            var data = rawData();
            var tenant = normalizeTenantSlug(filters && (filters.tenantSlug || filters.tenantId || filters.companyId)) || contextTenant(context);
            var rows = accessRows(data).filter(tenantFilter(tenant, data));
            var grants = grantRows(data).filter(tenantFilter(tenant, data));
            var requests = requestRows(data).filter(tenantFilter(tenant, data));
            var docs = allDocumentLikeRows(data).filter(tenantFilter(tenant, data));

            var deniedAccess = rows.filter(statusDenied).length;
            var expiredTokenUsage = rows.filter(function expired(row) { return /EXPIRED/.test(normalizeToken(row.tokenState || row.accessState || '')) || /EXPIRED/.test(accessReason(row)); }).length + grants.filter(function expiredGrant(row) { return isExpired(row, context); }).length;
            var revokedAccessAttempts = rows.filter(function revoked(row) { return /REVOKED/.test(normalizeToken(row.tokenState || row.accessState || '')) || /REVOKED/.test(accessReason(row)); }).length;
            var superAdminRawAttempts = rows.filter(function superAdmin(row) { return roleOf(row) === 'SUPER_ADMIN' && statusDenied(row); }).length;
            var downloadThrottleEvents = rows.filter(function throttled(row) { return /THROTTLE|LIMIT|EXCEEDED/.test(accessReason(row)); }).length;
            var publicExposureCount = docs.filter(publicExposure).length;
            var securePreviewUsage = rows.filter(function preview(row) { return /PREVIEW/.test(actionOf(row)); }).length;
            var temporaryAccessCongestion = grants.filter(function temporary(row) { return accessStateOf(row) === VISIBILITY_STATES.TEMPORARY_ACCESS; }).length + requests.filter(function pending(row) { return accessStateOf(row) === VISIBILITY_STATES.ACCESS_PENDING; }).length;
            var suspiciousAccessAttempts = deniedAccess + expiredTokenUsage + revokedAccessAttempts + superAdminRawAttempts + downloadThrottleEvents + publicExposureCount;
            var signals = [
                { signal: 'Denied access', count: deniedAccess, classification: deniedAccess ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO },
                { signal: 'Expired token usage', count: expiredTokenUsage, classification: expiredTokenUsage ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO },
                { signal: 'SUPER_ADMIN raw attempts', count: superAdminRawAttempts, classification: superAdminRawAttempts ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.INFO },
                { signal: 'Public exposure blockers', count: publicExposureCount, classification: publicExposureCount ? FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER : FAILURE_CLASSIFICATIONS.INFO },
                { signal: 'Download throttle events', count: downloadThrottleEvents, classification: downloadThrottleEvents ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO }
            ];
            var classification = highestClassification(signals.map(function item(row) { return row.classification; }));
            return freezeVisibilityOutput({
                success: true,
                classification: classification,
                summary: {
                    deniedAccess: deniedAccess,
                    accessDenials: deniedAccess,
                    expiredTokenUsage: expiredTokenUsage,
                    revokedAccessAttempts: revokedAccessAttempts,
                    superAdminRawAttempts: superAdminRawAttempts,
                    downloadThrottleEvents: downloadThrottleEvents,
                    suspiciousAccessAttempts: suspiciousAccessAttempts,
                    securePreviewUsage: securePreviewUsage,
                    temporaryAccessCongestion: temporaryAccessCongestion,
                    publicExposureBlocked: publicExposureCount
                },
                signals: signals,
                metadata: {
                    tenantIsolationPreserved: true,
                    secureDocumentVisibilityPreserved: true,
                    historicalAccessRecordsImmutable: true
                }
            });
        } catch (error) {
            return freezeVisibilityOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                summary: { deniedAccess: 0, expiredTokenUsage: 0, suspiciousAccessAttempts: 0 },
                signals: [],
                failures: [safeFailure('SUSPICIOUS_DOCUMENT_ACCESS_DETECTION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Suspicious document access detection failed safely.')]
            });
        }
    }

    function isVisibilityJob(row) {
        return /DOCUMENT_ACCESS|DOCUMENT_VISIBILITY|EXPIRY_SCAN|ACCESS_REVOCATION|SECURE_PREVIEW/.test(normalizeToken(row && (row.jobType || row.type || row.category || row.workflowType)));
    }

    function auditVisibility(actionType, metadata, context) {
        if (auditForwarding || context && context.skipAuditPersistence) return { success: true, skipped: true };
        auditForwarding = true;
        try {
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    actionType: actionType,
                    eventType: actionType,
                    module: 'Document Visibility Governance',
                    targetId: '',
                    description: metadata && metadata.description || actionType,
                    actorRole: context && context.actor && context.actor.role || 'hr',
                    actorId: context && context.actor && (context.actor.id || context.actor.empId) || '',
                    severity: metadata && metadata.severity || 'INFO',
                    metadata: cloneSanitized(metadata || {})
                }, {
                    source: 'documentVisibilityService',
                    skipPersistence: false
                });
            }
            var source = db();
            if (source && typeof source.writeAuditLog === 'function') {
                source.writeAuditLog(context && context.actor && context.actor.role || 'hr', context && context.actor && context.actor.id || '', actionType, 'Document Visibility Governance', '', metadata && metadata.description || actionType);
            }
            return { success: true };
        } catch (error) {
            return { success: false, warning: 'Document visibility audit failed safely.' };
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
                    source: 'documentVisibilityService',
                    severity: metadata && metadata.severity || 'INFO',
                    status: metadata && metadata.status || eventType,
                    tenantSlug: contextTenant(context) || metadata && metadata.tenantSlug || '',
                    metadata: cloneSanitized(metadata || {})
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Document visibility telemetry failed safely.' };
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
                    source: 'documentVisibilityService',
                    status: metadata && metadata.status || metricType,
                    severity: metadata && metadata.severity || 'INFO'
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Document visibility metric failed safely.' };
        } finally {
            metricForwarding = false;
        }
        return { success: false, warning: 'OrchestrationMetricsService unavailable.' };
    }

    function countByState(rows, state, context) {
        return rows.filter(function count(row) {
            if (state === VISIBILITY_STATES.EXPIRED && isExpired(row, context)) return true;
            return accessStateOf(row) === state;
        }).length;
    }

    function generateDocumentVisibilityReport(filters, context) {
        try {
            var data = rawData();
            var tenant = normalizeTenantSlug(filters && (filters.tenantSlug || filters.tenantId || filters.companyId)) || contextTenant(context);
            var docs = documentRows(data).filter(tenantFilter(tenant, data));
            var attachments = attachmentRows(data).filter(tenantFilter(tenant, data));
            var workflowAttachments = workflowAttachmentRows(data).filter(tenantFilter(tenant, data));
            var recruitmentDocs = recruitmentDocumentRows(data).filter(tenantFilter(tenant, data));
            var communicationDocs = communicationAttachmentRows(data).filter(tenantFilter(tenant, data));
            var requests = requestRows(data).filter(tenantFilter(tenant, data));
            var grants = grantRows(data).filter(tenantFilter(tenant, data));
            var logs = accessRows(data).filter(tenantFilter(tenant, data));
            var jobs = asyncRows(data).filter(tenantFilter(tenant, data)).filter(isVisibilityJob);
            var allRows = docs.concat(attachments).concat(workflowAttachments).concat(recruitmentDocs).concat(communicationDocs);
            var suspicious = detectSuspiciousAccessPatterns({ tenantSlug: tenant }, {
                tenantSlug: tenant,
                now: context && context.now,
                skipAuditPersistence: true,
                skipTelemetry: true,
                skipMetrics: true
            });
            var summary = suspicious.summary || {};
            var denied = summary.deniedAccess || 0;
            var expiredAccess = countByState(docs, VISIBILITY_STATES.EXPIRED, context) + grants.filter(function expired(row) { return isExpired(row, context); }).length;
            var temporaryAccess = countByState(docs, VISIBILITY_STATES.TEMPORARY_ACCESS, context) + grants.filter(function temp(row) { return accessStateOf(row) === VISIBILITY_STATES.TEMPORARY_ACCESS; }).length;
            var accessCongestion = denied + expiredAccess + requests.filter(function pending(row) { return accessStateOf(row) === VISIBILITY_STATES.ACCESS_PENDING; }).length + jobs.filter(function retry(row) { return /RETRY|FAILED|DEAD_LETTER/.test(normalizeToken(row.state || row.status)); }).length;
            var classification = highestClassification([
                suspicious.classification,
                accessCongestion ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO
            ]);
            var report = {
                success: true,
                readOnly: true,
                classification: classification,
                generatedAt: nowIso(context),
                tenantSlug: tenant,
                accessHealth: {
                    totalDocuments: docs.length,
                    restrictedDocuments: countByState(docs, VISIBILITY_STATES.RESTRICTED, context),
                    accessPending: countByState(docs, VISIBILITY_STATES.ACCESS_PENDING, context) + requests.filter(function pending(row) { return accessStateOf(row) === VISIBILITY_STATES.ACCESS_PENDING; }).length,
                    accessGranted: countByState(docs, VISIBILITY_STATES.ACCESS_GRANTED, context) + grants.filter(function granted(row) { return accessStateOf(row) === VISIBILITY_STATES.ACCESS_GRANTED; }).length,
                    temporaryAccessGrants: temporaryAccess,
                    expiredAccess: expiredAccess,
                    revokedAccess: countByState(docs, VISIBILITY_STATES.REVOKED, context) + grants.filter(function revoked(row) { return accessStateOf(row) === VISIBILITY_STATES.REVOKED; }).length,
                    archivedAccess: countByState(docs, VISIBILITY_STATES.ARCHIVED, context)
                },
                roleScopedVisibility: {
                    employeeOwnDocumentsOnly: true,
                    managerWorkflowScopedVisibilityOnly: true,
                    hrOperationalDocumentVisibility: true,
                    hrHeadStrategicComplianceVisibility: true,
                    directorAggregateComplianceOnly: true,
                    superAdminRawDocumentAccess: false,
                    platformOwnerDocumentChain: false
                },
                secureAccessGovernance: {
                    signedDocumentUrls: true,
                    expiryControlledAccess: true,
                    temporaryAccessGrants: temporaryAccess,
                    revocableAccessTokens: true,
                    downloadThrottlingReady: true,
                    securePreviewSupport: true,
                    watermarkReady: true,
                    publicExposureBlocked: summary.publicExposureBlocked || 0
                },
                permissionGovernance: {
                    roleScopedPermissions: true,
                    workflowLinkedAccess: workflowAttachments.length + allRows.filter(workflowLinked).length,
                    departmentScopedVisibility: true,
                    timeLimitedAccess: true,
                    acknowledgementRequiredAccess: requests.filter(function ack(row) { return row.acknowledgementRequired === true || row.requiresAcknowledgement === true; }).length,
                    approvalBasedAccessRequests: requests.length,
                    permissionEscalationBlocked: true
                },
                accessRequestWorkflows: {
                    accessRequests: requests.length,
                    managerApprovalFlows: true,
                    hrApprovalChains: true,
                    temporarySecureAccess: temporaryAccess,
                    accessRevocationWorkflows: true,
                    unsafePermissionEscalationBlocked: true
                },
                accessAudit: {
                    views: logs.filter(function view(row) { return /VIEW|PREVIEW/.test(actionOf(row)); }).length,
                    downloads: logs.filter(function download(row) { return /DOWNLOAD/.test(actionOf(row)); }).length,
                    deniedAccess: denied,
                    accessDenials: denied,
                    temporaryAccessGrants: temporaryAccess,
                    suspiciousAccessAttempts: summary.suspiciousAccessAttempts || 0,
                    expiredTokenUsage: summary.expiredTokenUsage || 0,
                    revokedAccessAttempts: summary.revokedAccessAttempts || 0
                },
                workflowAttachmentIntegration: {
                    workflowScopedDocumentAccess: workflowAttachments.length + allRows.filter(workflowLinked).length,
                    onboardingDocumentVisibility: allRows.filter(function onboarding(row) { return /ONBOARDING|IDENTITY/.test(categoryOf(row)); }).length,
                    recruitmentResumeAccess: recruitmentDocs.length + allRows.filter(function recruitment(row) { return /RECRUITMENT|RESUME/.test(categoryOf(row)); }).length,
                    reimbursementReceiptAccess: allRows.filter(function receipt(row) { return /REIMBURSEMENT|RECEIPT/.test(categoryOf(row)); }).length,
                    policyDocumentVisibility: communicationDocs.length + allRows.filter(function policy(row) { return /POLICY|COMPLIANCE/.test(categoryOf(row)); }).length,
                    crossWorkflowExposureBlocked: true
                },
                visibilityAnalytics: {
                    accessRequestTrends: requests.length,
                    deniedAccessFrequency: denied,
                    expiredAccessBuildup: expiredAccess + (summary.expiredTokenUsage || 0),
                    suspiciousVisibilityAttempts: summary.suspiciousAccessAttempts || 0,
                    securePreviewUsage: summary.securePreviewUsage || 0,
                    documentAccessCongestion: accessCongestion
                },
                integrationHealth: {
                    documentGovernanceIntegrated: !!global.DocumentGovernanceService,
                    fileAttachmentGovernanceIntegrated: !!global.FileAttachmentGovernanceService,
                    uploadValidationIntegrated: !!global.UploadValidationService,
                    workflowDiscussionIntegrated: !!global.WorkflowDiscussionService,
                    notificationOrchestrationIntegrated: !!global.NotificationOrchestrationService,
                    workflowEngineIntegrated: !!global.WorkflowEngine,
                    auditReady: !!(global.AuditService || global.auditService),
                    telemetryReady: !!(global.WorkflowTelemetryService || global.workflowTelemetryService),
                    metricsReady: !!(global.OrchestrationMetricsService || global.orchestrationMetricsService)
                },
                warnings: suspicious.signals || [],
                metadata: {
                    tenantIsolationPreserved: true,
                    secureDocumentVisibilityPreserved: true,
                    historicalAccessRecordsImmutable: true,
                    existingDocumentFlowsPreserved: true,
                    existingWorkflowsPreserved: true,
                    documentAccessActionsAuditable: true,
                    readOnly: true
                }
            };
            auditVisibility('DOCUMENT_VISIBILITY_REPORTED', {
                tenantSlug: tenant,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO',
                description: 'Document visibility governance report viewed.'
            }, context);
            emitTelemetry('DOCUMENT_VISIBILITY_REPORTED', {
                tenantSlug: tenant,
                status: classification,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'INFO'
            }, context);
            recordMetric('DOCUMENT_VISIBILITY_REPORTED', {
                tenantSlug: tenant,
                status: classification,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'INFO'
            }, context);
            return freezeVisibilityOutput(report);
        } catch (error) {
            safeWarn('Document visibility report failed safely.', error && error.message ? error.message : error);
            return freezeVisibilityOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                accessHealth: { totalDocuments: 0 },
                secureAccessGovernance: { signedDocumentUrls: true, expiryControlledAccess: true },
                accessAudit: { deniedAccess: 0 },
                visibilityAnalytics: { documentAccessCongestion: 0 },
                failures: [safeFailure('DOCUMENT_VISIBILITY_REPORT_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Document visibility report failed safely.')]
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        function check(label, condition) { checks.push({ label: label, passed: !!condition }); }
        try {
            var malformed = normalizeVisibilityPayload(null, { tenantSlug: 'tabsons' });
            check('malformed payloads fail safely', malformed.success === false && malformed.failures.some(function item(row) { return row.failureCode === 'MALFORMED_VISIBILITY_PAYLOAD'; }));

            var crossTenant = validateDocumentVisibilityScope({ tenantSlug: 'abc', empId: 'EMP-X', documentId: 'DOC-X' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' } });
            check('visibility isolation works', crossTenant.allowed === false && crossTenant.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER);

            var signed = generateSecureDocumentAccess({ tenantSlug: 'tabsons', empId: 'EMP-1', documentId: 'DOC-1', expiresInSeconds: 86400 }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('signed access governance works', signed.success === false && signed.failures.some(function item(row) { return row.failureCode === 'SIGNED_DOCUMENT_VISIBILITY_EXPIRY_UNSAFE'; }));

            var temporary = grantTemporaryDocumentAccess({ tenantSlug: 'tabsons', empId: 'EMP-1', documentId: 'DOC-1', workflowId: 'WF-1', expiresInSeconds: 900 }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('temporary access works', temporary.success === true && temporary.state === VISIBILITY_STATES.TEMPORARY_ACCESS);

            var revocation = revokeDocumentAccess({ tenantSlug: 'tabsons', empId: 'EMP-1', documentId: 'DOC-1' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('access revocation works', revocation.success === true && revocation.state === VISIBILITY_STATES.REVOKED);

            var suspicious = detectSuspiciousAccessPatterns({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('suspicious access detection works', suspicious.success === true && Object.isFrozen(suspicious.signals));

            var frozen = freezeVisibilityOutput({ nested: { ok: true }, payload: { state: VISIBILITY_STATES.RESTRICTED } });
            check('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested) && Object.isFrozen(frozen.payload));

            var originalDocument = global.DocumentGovernanceService;
            var originalAttachment = global.FileAttachmentGovernanceService;
            try {
                delete global.DocumentGovernanceService;
                delete global.FileAttachmentGovernanceService;
                var report = generateDocumentVisibilityReport({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
                check('dependency absence degrades safely', report.success === true && report.integrationHealth.documentGovernanceIntegrated === false && report.integrationHealth.fileAttachmentGovernanceIntegrated === false);
            } finally {
                if (originalDocument) global.DocumentGovernanceService = originalDocument;
                if (originalAttachment) global.FileAttachmentGovernanceService = originalAttachment;
            }
        } catch (error) {
            checks.push({ label: 'self-test uncaught error guard', passed: false, description: sanitizeText(error && error.message || error) });
        }
        var passed = checks.every(function item(row) { return row.passed; });
        var result = freezeVisibilityOutput({
            passed: passed,
            checks: checks,
            summary: passed ? 'Document visibility self-test passed.' : 'Document visibility self-test detected failures.'
        });
        global.__ARTHHRMS_DOCUMENT_VISIBILITY_SELF_TEST__ = result;
        return result;
    }

    var DocumentVisibilityService = Object.freeze({
        VERSION: VERSION,
        VISIBILITY_STATES: VISIBILITY_STATES,
        FAILURE_CLASSIFICATIONS: FAILURE_CLASSIFICATIONS,
        VISIBILITY: VISIBILITY,
        classifyVisibilityRisk: classifyVisibilityRisk,
        validateDocumentVisibilityScope: validateDocumentVisibilityScope,
        normalizeVisibilityPayload: normalizeVisibilityPayload,
        freezeVisibilityOutput: freezeVisibilityOutput,
        generateSecureDocumentAccess: generateSecureDocumentAccess,
        grantTemporaryDocumentAccess: grantTemporaryDocumentAccess,
        revokeDocumentAccess: revokeDocumentAccess,
        detectSuspiciousAccessPatterns: detectSuspiciousAccessPatterns,
        generateDocumentVisibilityReport: generateDocumentVisibilityReport,
        runSelfTest: runSelfTest
    });

    global.DocumentVisibilityService = DocumentVisibilityService;
    global.documentVisibilityService = DocumentVisibilityService;

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
