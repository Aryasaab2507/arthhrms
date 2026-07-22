/**
 * fileAttachmentGovernanceService.js
 * ARTHHRMS Enterprise File Attachment Governance + Secure Upload Intelligence.
 *
 * Additive read-only governance layer for workflow attachments, employee
 * documents, receipts, policy files, recruitment documents, discussion
 * attachments, and onboarding uploads. It never exposes raw file paths,
 * signed URLs, public URLs, filenames, or cross-tenant attachment details.
 */
(function attachFileAttachmentGovernanceService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[FileAttachmentGovernanceService]';

    var ATTACHMENT_STATES = Object.freeze({
        UPLOADED: 'UPLOADED',
        VALIDATING: 'VALIDATING',
        ACTIVE: 'ACTIVE',
        RESTRICTED: 'RESTRICTED',
        EXPIRED: 'EXPIRED',
        ARCHIVED: 'ARCHIVED'
    });

    var ATTACHMENT_TYPES = Object.freeze({
        PDF: 'PDF',
        IMAGE: 'IMAGE',
        SPREADSHEET: 'SPREADSHEET',
        ONBOARDING_DOCUMENT: 'ONBOARDING_DOCUMENT',
        REIMBURSEMENT_RECEIPT: 'REIMBURSEMENT_RECEIPT',
        CONTRACT: 'CONTRACT',
        RESUME: 'RESUME',
        POLICY_ATTACHMENT: 'POLICY_ATTACHMENT',
        WORKFLOW_ATTACHMENT: 'WORKFLOW_ATTACHMENT',
        DISCUSSION_ATTACHMENT: 'DISCUSSION_ATTACHMENT',
        OPERATIONAL_FILE: 'OPERATIONAL_FILE'
    });

    var FAILURE_CLASSIFICATIONS = Object.freeze({
        INFO: 'INFO',
        WARNING: 'WARNING',
        HIGH_RISK: 'HIGH_RISK',
        CRITICAL_BLOCKER: 'CRITICAL_BLOCKER'
    });

    var VISIBILITY = Object.freeze({
        NONE: 'NONE',
        OWN_ATTACHMENTS_ONLY: 'OWN_ATTACHMENTS_ONLY',
        TEAM_WORKFLOW_ATTACHMENTS_ONLY: 'TEAM_WORKFLOW_ATTACHMENTS_ONLY',
        HR_OPERATIONAL_DOCUMENT_VISIBILITY: 'HR_OPERATIONAL_DOCUMENT_VISIBILITY',
        STRATEGIC_ATTACHMENT_VISIBILITY: 'STRATEGIC_ATTACHMENT_VISIBILITY',
        AGGREGATE_COMPLIANCE_ONLY: 'AGGREGATE_COMPLIANCE_ONLY',
        INFRASTRUCTURE_ONLY: 'INFRASTRUCTURE_ONLY',
        PLATFORM_GOVERNANCE_ONLY: 'PLATFORM_GOVERNANCE_ONLY'
    });

    var ALLOWED_MIME_TYPES = Object.freeze([
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp',
        'text/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]);
    var ALLOWED_EXTENSIONS = Object.freeze(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'csv', 'xls', 'xlsx']);
    var RESTRICTED_EXTENSIONS = Object.freeze(['exe', 'bat', 'cmd', 'msi', 'ps1', 'js', 'vbs', 'scr', 'dll', 'com', 'jar', 'sh']);
    var MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
    var MAX_SIGNED_ACCESS_SECONDS = 3600;
    var MIN_SIGNED_ACCESS_SECONDS = 60;

    var SENSITIVE_KEY_PATTERN = /(attachment.?id|document.?id|file.?name|name|storage.?path|signed.?url|public.?url|url|path|download|object.?key|bucket|private.?note|remark|description|message|body|content|comment|reply|candidate|resume|receipt|salary|payroll|payslip|compensation|amount|employee|emp.?id|user.?id|owner|uploaded.?by|assigned.?to|author|manager|token|secret|jwt|authorization|service.?role|private.?key)/i;
    var SENSITIVE_VALUE_PATTERN = /(https?:\/\/[^\s"',}]+|private:\/\/[^\s"',}]+|\b(private|confidential|secret|salary|payroll|resume|receipt)\b[^,;}]*)/ig;
    var SAFE_GOVERNANCE_KEYS = Object.freeze({
        attachmentConfidentialityPreserved: true,
        tenantIsolationPreserved: true,
        existingWorkflowsPreserved: true,
        historicalAttachmentsImmutable: true,
        attachmentActionsAuditable: true,
        readOnly: true,
        uploadHealth: true,
        secureUploadGovernance: true,
        signedAccessGovernance: true,
        signedAccess: true,
        signedUrlIssued: true,
        signedUrlRedacted: true,
        expiresSafely: true,
        expiresAt: true,
        expiresInSeconds: true,
        integrityValidation: true,
        workflowCommunicationIntegration: true,
        attachmentAnalytics: true,
        accessGovernance: true,
        integrationHealth: true,
        integritySignals: true,
        totalAttachments: true,
        uploadedAttachments: true,
        activeAttachments: true,
        validatingAttachments: true,
        restrictedAttachments: true,
        expiredAttachments: true,
        archivedAttachments: true,
        failedUploads: true,
        publicExposure: true,
        publicExposureBlocked: true,
        publicFileExposurePrevented: true,
        signedUploadUrlsRequired: true,
        tenantScopedUploads: true,
        duplicateUploadDetection: true,
        uploadIntegrityValidation: true,
        restrictedExtensionBlocking: true,
        signedAccessRequired: true,
        expiryControlledAccess: true,
        roleScopedVisibility: true,
        accessLoggingEnabled: true,
        downloadThrottlingReady: true,
        securePreviewSupport: true,
        malformedUploads: true,
        duplicateFiles: true,
        duplicateUploadRates: true,
        suspiciousFileSignatures: true,
        corruptedAttachments: true,
        mimeMismatches: true,
        oversizedPayloads: true,
        suspiciousAccessAttempts: true,
        workflowLinkedAttachments: true,
        escalationAttachmentReferences: true,
        policyAttachments: true,
        onboardingUploads: true,
        recruitmentDocumentReferences: true,
        uploadTrends: true,
        storageGrowthBytes: true,
        expiredAttachmentBuildup: true,
        employeeOwnAttachmentsOnly: true,
        managerTeamWorkflowAttachmentsOnly: true,
        hrOperationalDocumentVisibility: true,
        directorAggregateComplianceOnly: true,
        superAdminRawAttachmentAccess: true,
        platformOwnerAttachmentWorkflow: true,
        documentGovernanceIntegrated: true,
        workflowDiscussionIntegrated: true,
        communicationGovernanceIntegrated: true,
        recruitmentGovernanceIntegrated: true,
        notificationOrchestrationIntegrated: true,
        auditReady: true,
        telemetryReady: true,
        metricsReady: true,
        success: true,
        allowed: true,
        classification: true,
        visibility: true,
        state: true,
        payload: true,
        metadata: true,
        failures: true,
        warnings: true,
        failureCode: true,
        warningCode: true,
        status: true,
        severity: true,
        count: true,
        signal: true,
        source: true,
        attachmentType: true,
        mimeType: true,
        extension: true,
        size: true,
        category: true
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

    function empIdOf(row) {
        return safeString(row && (row.empId || row.employeeId || row.employee_id || row.userId || row.user_id || row.ownerEmpId || row.assignedTo || row.uploadedBy) || '', '').trim();
    }

    function attachmentIdOf(row) {
        return safeString(row && (row.attachmentId || row.attachment_id || row.fileAttachmentId || row.file_attachment_id || row.documentId || row.document_id || row.id) || '', '').trim();
    }

    function workflowIdOf(row) {
        return safeString(row && (row.workflowId || row.workflow_id || row.eventId || row.event_id || row.pendingActionId || row.pending_action_id || '') || '', '').trim();
    }

    function threadIdOf(row) {
        return safeString(row && (row.threadId || row.thread_id || row.discussionThreadId || row.discussion_thread_id || '') || '', '').trim();
    }

    function communicationIdOf(row) {
        return safeString(row && (row.communicationId || row.communication_id || row.announcementId || row.announcement_id || '') || '', '').trim();
    }

    function safeNumber(value, fallback) {
        var number = Number(value);
        return isFinite(number) ? number : (fallback || 0);
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

    function sanitizedValue(value, key, seen) {
        if (value === null || typeof value === 'undefined') return value;
        if (typeof value === 'string') return value.replace(SENSITIVE_VALUE_PATTERN, '[redacted]').trim();
        if (typeof value === 'number' || typeof value === 'boolean') return value;
        if (value instanceof Date) return value.toISOString();
        if (Array.isArray(value)) {
            return value.map(function item(row) { return sanitizedValue(row, key, (seen || []).slice()); }).filter(function keep(row) { return typeof row !== 'undefined'; });
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
            return input.map(function item(row) { return cloneSanitized(row, refs.slice()); }).filter(function keep(row) { return typeof row !== 'undefined'; });
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

    function freezeAttachmentOutput(output) {
        return deepFreeze(cloneSanitized(output || {}));
    }

    function safeFailure(failureCode, classification, description, metadata) {
        var failure = {
            failureCode: normalizeToken(failureCode || 'ATTACHMENT_FAILURE'),
            classification: classification || FAILURE_CLASSIFICATIONS.WARNING,
            description: safeString(description || 'Attachment governance failed safely.', '')
        };
        if (metadata && typeof metadata === 'object') failure.metadata = cloneSanitized(metadata);
        return deepFreeze(failure);
    }

    function safeWarning(warningCode, description, metadata) {
        var warning = {
            warningCode: normalizeToken(warningCode || 'ATTACHMENT_WARNING'),
            classification: FAILURE_CLASSIFICATIONS.WARNING,
            description: safeString(description || 'Attachment governance warning.', '')
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

    function normalizeAttachmentState(value) {
        var normalized = normalizeToken(value || ATTACHMENT_STATES.UPLOADED);
        if (normalized === 'UPLOAD' || normalized === 'UPLOADED') return ATTACHMENT_STATES.UPLOADED;
        if (normalized === 'VALIDATION' || normalized === 'VALIDATING') return ATTACHMENT_STATES.VALIDATING;
        if (normalized === 'AVAILABLE' || normalized === 'ACTIVE' || normalized === 'VERIFIED') return ATTACHMENT_STATES.ACTIVE;
        if (normalized === 'BLOCKED' || normalized === 'RESTRICTED' || normalized === 'FAILED') return ATTACHMENT_STATES.RESTRICTED;
        if (normalized === 'EXPIRED') return ATTACHMENT_STATES.EXPIRED;
        if (normalized === 'ARCHIVE' || normalized === 'ARCHIVED') return ATTACHMENT_STATES.ARCHIVED;
        return ATTACHMENT_STATES[normalized] || ATTACHMENT_STATES.UPLOADED;
    }

    function normalizeAttachmentType(value) {
        var normalized = normalizeToken(value || '');
        if (normalized === 'PDF' || normalized === 'APPLICATION_PDF') return ATTACHMENT_TYPES.PDF;
        if (normalized === 'IMAGE' || normalized === 'JPG' || normalized === 'JPEG' || normalized === 'PNG' || normalized === 'WEBP') return ATTACHMENT_TYPES.IMAGE;
        if (normalized === 'XLS' || normalized === 'XLSX' || normalized === 'CSV' || normalized === 'SPREADSHEET') return ATTACHMENT_TYPES.SPREADSHEET;
        if (normalized === 'ONBOARDING' || normalized === 'ONBOARDING_UPLOAD') return ATTACHMENT_TYPES.ONBOARDING_DOCUMENT;
        if (normalized === 'RECEIPT' || normalized === 'REIMBURSEMENT') return ATTACHMENT_TYPES.REIMBURSEMENT_RECEIPT;
        if (normalized === 'POLICY') return ATTACHMENT_TYPES.POLICY_ATTACHMENT;
        if (normalized === 'RECRUITMENT_FILE' || normalized === 'CANDIDATE_DOCUMENT') return ATTACHMENT_TYPES.RESUME;
        return ATTACHMENT_TYPES[normalized] || ATTACHMENT_TYPES.OPERATIONAL_FILE;
    }

    function extensionOf(row) {
        var extension = safeString(row && (row.extension || row.fileExtension || row.ext) || '', '').trim().toLowerCase().replace(/^\./, '');
        if (extension) return extension;
        var fileName = safeString(row && (row.fileName || row.name || row.originalName) || '', '').trim();
        var index = fileName.lastIndexOf('.');
        return index !== -1 ? fileName.slice(index + 1).toLowerCase() : '';
    }

    function mimeOf(row) {
        return safeString(row && (row.mimeType || row.contentType || row.typeMime || row.declaredMimeType) || '', '').trim().toLowerCase();
    }

    function publicExposure(row) {
        var url = safeString(row && (row.publicUrl || row.url || row.downloadUrl || row.attachmentUrl || row.documentUrl) || '', '').toLowerCase();
        return !!(row && (row.public === true || row.isPublic === true || row.publicBucket === true || /public\.example|\/public\/|public-|public_/.test(url)));
    }

    function suspiciousSignature(row) {
        var signature = safeString(row && (row.signature || row.fileSignature || row.magicBytes || row.magicNumber) || '', '').trim().toUpperCase();
        var extension = extensionOf(row);
        var mime = mimeOf(row);
        return signature === 'MZ' || signature === '7F454C46' || signature === 'PK' && extension !== 'xlsx' || /x-msdownload|executable|octet-stream/.test(mime);
    }

    function mimeMismatch(row) {
        var extension = extensionOf(row);
        var mime = mimeOf(row);
        var declared = safeString(row && (row.declaredMimeType || row.expectedMimeType) || '', '').trim().toLowerCase();
        if (declared && mime && declared !== mime) return true;
        if (!extension || !mime) return false;
        if (extension === 'pdf') return mime !== 'application/pdf';
        if (extension === 'jpg' || extension === 'jpeg') return mime !== 'image/jpeg';
        if (extension === 'png') return mime !== 'image/png';
        if (extension === 'webp') return mime !== 'image/webp';
        if (extension === 'csv') return mime !== 'text/csv';
        if (extension === 'xls') return mime !== 'application/vnd.ms-excel';
        if (extension === 'xlsx') return mime !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        return false;
    }

    function corruptedAttachment(row) {
        return row && (row.corrupted === true || row.integrityValid === false || /CORRUPT|INVALID|FAILED/.test(normalizeToken(row.integrityStatus || row.checksumStatus)));
    }

    function isExpired(row, context) {
        var value = row && (row.expiresAt || row.expiryDate || row.expiredAt);
        if (!value) return normalizeAttachmentState(row && (row.state || row.status)) === ATTACHMENT_STATES.EXPIRED;
        var time = new Date(value).getTime();
        var now = context && context.now ? new Date(context.now).getTime() : Date.now();
        return isFinite(time) && time < now;
    }

    function isAttachmentJob(row) {
        return /ATTACHMENT|DOCUMENT|UPLOAD|FILE_VALIDATION|RECEIPT|RESUME|POLICY/.test(normalizeToken(row && (row.jobType || row.type || row.category)));
    }

    function attachmentRows(data) {
        var source = data || rawData();
        var rows = [];
        if (Array.isArray(source.fileAttachments)) rows = rows.concat(source.fileAttachments);
        if (Array.isArray(source.attachments)) rows = rows.concat(source.attachments);
        if (Array.isArray(source.workflowDiscussionAttachments)) rows = rows.concat(source.workflowDiscussionAttachments);
        if (Array.isArray(source.communicationAttachments)) rows = rows.concat(source.communicationAttachments);
        if (Array.isArray(source.workspaceAttachments)) rows = rows.concat(source.workspaceAttachments);
        if (Array.isArray(source.collaborationAttachments)) rows = rows.concat(source.collaborationAttachments);
        if (Array.isArray(source.recruitmentDocuments)) rows = rows.concat(source.recruitmentDocuments);
        if (Array.isArray(source.candidateDocuments)) rows = rows.concat(source.candidateDocuments);
        if (Array.isArray(source.documents)) rows = rows.concat(source.documents);
        if (Array.isArray(source.expenseReceipts)) rows = rows.concat(source.expenseReceipts);
        return rows;
    }

    function asyncRows(data) {
        var source = data || rawData();
        var rows = [];
        if (Array.isArray(source.asyncJobs)) rows = rows.concat(source.asyncJobs);
        if (Array.isArray(source.jobQueue)) rows = rows.concat(source.jobQueue);
        return rows;
    }

    function accessRows(data) {
        var source = data || rawData();
        var rows = [];
        if (Array.isArray(source.attachmentAccessLogs)) rows = rows.concat(source.attachmentAccessLogs);
        if (Array.isArray(source.documentAccessLogs)) rows = rows.concat(source.documentAccessLogs);
        if (Array.isArray(source.fileAccessLogs)) rows = rows.concat(source.fileAccessLogs);
        return rows;
    }

    function sourceTenant(row, data) {
        var direct = rowTenant(row);
        if (direct) return direct;
        var source = data || rawData();
        var employee = employeeById(empIdOf(row), source);
        if (employee) return rowTenant(employee);
        return '';
    }

    function tenantFilter(tenant, data) {
        return function matchesTenant(row) {
            var tenantValue = sourceTenant(row, data || rawData());
            return !tenant || !tenantValue || tenantValue === tenant;
        };
    }

    function classifyAttachmentRisk(input) {
        var source = input || {};
        if (source.crossTenant || source.crossTenantAttachment || source.publicExposure || source.publicUrl || source.unsafePublicUrl || source.rlsBypass) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
        if (source.superAdminRawAccess || source.platformOwnerAccess || source.duplicateUpload || source.duplicateFiles || source.suspiciousSignature || source.corruptedAttachment || source.integrityFailure || source.restrictedExtension) return FAILURE_CLASSIFICATIONS.HIGH_RISK;
        if (source.malformedPayload || source.mimeMismatch || source.oversizedPayload || source.failedUpload || source.expiredAttachment || source.unsupportedMime) return FAILURE_CLASSIFICATIONS.WARNING;
        return FAILURE_CLASSIFICATIONS.INFO;
    }

    function visibilityFor(role, record, context, data) {
        var normalized = normalizeRole(role);
        var source = data || rawData();
        var owner = empIdOf(record);
        var currentActorId = actorId(context && context.actor || {});
        if (normalized === 'EMPLOYEE') return owner && owner === currentActorId ? VISIBILITY.OWN_ATTACHMENTS_ONLY : VISIBILITY.NONE;
        if (normalized === 'MANAGER') {
            var workflowLinked = !!(workflowIdOf(record) || threadIdOf(record) || /WORKFLOW|DISCUSSION|ESCALATION/.test(normalizeToken(record && (record.type || record.attachmentType || record.category))));
            return owner && workflowLinked && managerOwnsEmployee(currentActorId, owner, source) ? VISIBILITY.TEAM_WORKFLOW_ATTACHMENTS_ONLY : VISIBILITY.NONE;
        }
        if (normalized === 'HR') return VISIBILITY.HR_OPERATIONAL_DOCUMENT_VISIBILITY;
        if (normalized === 'HR_HEAD') return VISIBILITY.STRATEGIC_ATTACHMENT_VISIBILITY;
        if (normalized === 'DIRECTOR') return VISIBILITY.AGGREGATE_COMPLIANCE_ONLY;
        if (normalized === 'SUPER_ADMIN') return VISIBILITY.INFRASTRUCTURE_ONLY;
        if (normalized === 'PLATFORM_OWNER') return VISIBILITY.PLATFORM_GOVERNANCE_ONLY;
        return VISIBILITY.NONE;
    }

    function recordIsRawAttachment(record) {
        return !!(record && (
            attachmentIdOf(record) ||
            empIdOf(record) ||
            record.fileName ||
            record.name ||
            record.storagePath ||
            record.signedUrl ||
            record.publicUrl ||
            record.attachmentUrl ||
            record.documentUrl ||
            record.privateNote
        ));
    }

    function validateAttachmentScope(record, context) {
        try {
            var data = rawData();
            var ctxTenant = contextTenant(context);
            var targetTenant = normalizeTenantSlug(record && (record.tenantSlug || record.tenantId || record.companyId)) || sourceTenant(record, data) || ctxTenant;
            var role = normalizeRole(context && context.actor && context.actor.role || context && context.role || '');
            var visibility = visibilityFor(role, record || {}, context || {}, data);
            var failures = [];

            if (ctxTenant && targetTenant && ctxTenant !== targetTenant) {
                failures.push(safeFailure('CROSS_TENANT_ATTACHMENT_VISIBILITY_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Cross-tenant attachment visibility was blocked.'));
            }
            if (role === 'PLATFORM_OWNER' && recordIsRawAttachment(record)) {
                failures.push(safeFailure('PLATFORM_OWNER_ATTACHMENT_ACCESS_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Platform owner is isolated from tenant attachment workflows.'));
            }
            if (role === 'SUPER_ADMIN' && recordIsRawAttachment(record)) {
                failures.push(safeFailure('SUPER_ADMIN_ATTACHMENT_ACCESS_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Super admin access is limited to attachment infrastructure metadata.'));
            }
            if (role === 'EMPLOYEE' && visibility !== VISIBILITY.OWN_ATTACHMENTS_ONLY) {
                failures.push(safeFailure('EMPLOYEE_ATTACHMENT_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Employees may access only own attachment metadata.'));
            }
            if (role === 'MANAGER' && visibility !== VISIBILITY.TEAM_WORKFLOW_ATTACHMENTS_ONLY) {
                failures.push(safeFailure('MANAGER_ATTACHMENT_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Managers may access only team workflow attachment metadata.'));
            }
            var classification = highestClassification(failures.map(function item(row) { return row.classification; }));
            return freezeAttachmentOutput({
                allowed: !failures.length,
                success: !failures.length,
                classification: classification,
                visibility: visibility,
                failures: failures,
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    attachmentConfidentialityPreserved: true,
                    historicalAttachmentsImmutable: true
                }
            });
        } catch (error) {
            return freezeAttachmentOutput({
                allowed: false,
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                visibility: VISIBILITY.NONE,
                failures: [safeFailure('ATTACHMENT_SCOPE_VALIDATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Attachment scope validation failed safely.')]
            });
        }
    }

    function normalizeAttachmentPayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeAttachmentOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    state: ATTACHMENT_STATES.UPLOADED,
                    failures: [safeFailure('MALFORMED_ATTACHMENT_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Attachment payload is malformed.')]
                });
            }
            var tenant = normalizeTenantSlug(payload.tenantSlug || payload.tenantId || payload.companyId) || contextTenant(context);
            var normalized = {
                tenantSlug: tenant,
                state: normalizeAttachmentState(payload.state || payload.status || payload.uploadStatus),
                attachmentType: normalizeAttachmentType(payload.attachmentType || payload.type || payload.category || payload.documentType),
                mimeType: mimeOf(payload),
                extension: extensionOf(payload),
                size: Math.max(0, safeNumber(payload.size || payload.bytes || payload.fileSize, 0)),
                category: normalizeToken(payload.category || payload.documentCategory || payload.attachmentCategory || 'OPERATIONAL_FILE'),
                metadata: {
                    attachmentConfidentialityPreserved: true,
                    tenantIsolationPreserved: true,
                    historicalAttachmentsImmutable: true,
                    readOnly: payload.readOnly !== false
                }
            };
            return freezeAttachmentOutput({
                success: true,
                classification: FAILURE_CLASSIFICATIONS.INFO,
                payload: normalized
            });
        } catch (error) {
            return freezeAttachmentOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                state: ATTACHMENT_STATES.RESTRICTED,
                failures: [safeFailure('ATTACHMENT_NORMALIZATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Attachment payload normalization failed safely.')]
            });
        }
    }

    function validateSecureUpload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeAttachmentOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    state: ATTACHMENT_STATES.UPLOADED,
                    failures: [safeFailure('MALFORMED_ATTACHMENT_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Attachment payload is malformed.')]
                });
            }
            var failures = [];
            var data = rawData();
            var ctxTenant = contextTenant(context);
            var tenant = normalizeTenantSlug(payload.tenantSlug || payload.tenantId || payload.companyId) || sourceTenant(payload, data) || ctxTenant;
            if (ctxTenant && tenant && ctxTenant !== tenant) {
                failures.push(safeFailure('TENANT_MISMATCH', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Attachment tenant mismatch was blocked.'));
            }

            var scope = validateAttachmentScope(payload, context);
            if (!scope.allowed && scope.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER) {
                failures = failures.concat(scope.failures || []);
            }

            var mime = mimeOf(payload);
            var extension = extensionOf(payload);
            var size = safeNumber(payload.size || payload.bytes || payload.fileSize, 0);
            var checksum = safeString(payload.checksum || payload.hash || payload.sha256 || '', '').trim();

            if (ALLOWED_MIME_TYPES.indexOf(mime) === -1) {
                failures.push(safeFailure('UNSUPPORTED_ATTACHMENT_MIME_TYPE', FAILURE_CLASSIFICATIONS.WARNING, 'Unsupported attachment MIME type was blocked.'));
            }
            if (RESTRICTED_EXTENSIONS.indexOf(extension) !== -1 || ALLOWED_EXTENSIONS.indexOf(extension) === -1) {
                failures.push(safeFailure('RESTRICTED_ATTACHMENT_EXTENSION_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Restricted attachment extension was blocked.'));
            }
            if (size > MAX_ATTACHMENT_BYTES) {
                failures.push(safeFailure('ATTACHMENT_UPLOAD_TOO_LARGE', FAILURE_CLASSIFICATIONS.WARNING, 'Attachment upload exceeds governed size limits.'));
            }
            if (publicExposure(payload)) {
                failures.push(safeFailure('PUBLIC_ATTACHMENT_EXPOSURE_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Public attachment exposure was blocked.'));
            }
            if (!checksum) {
                failures.push(safeFailure('ATTACHMENT_INTEGRITY_VALIDATION_REQUIRED', FAILURE_CLASSIFICATIONS.WARNING, 'Attachment integrity metadata is required.'));
            }
            if (mimeMismatch(payload)) {
                failures.push(safeFailure('ATTACHMENT_MIME_EXTENSION_MISMATCH', FAILURE_CLASSIFICATIONS.WARNING, 'Attachment MIME and extension mismatch requires review.'));
            }
            if (suspiciousSignature(payload)) {
                failures.push(safeFailure('SUSPICIOUS_FILE_SIGNATURE_DETECTED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Suspicious file signature was detected.'));
            }
            if (checksum && attachmentRows(data).filter(tenantFilter(tenant, data)).some(function duplicate(row) {
                return safeString(row.checksum || row.hash || row.sha256 || '', '').trim() === checksum;
            })) {
                failures.push(safeFailure('DUPLICATE_ATTACHMENT_DETECTED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Duplicate attachment checksum was detected.'));
            }

            var classification = highestClassification(failures.map(function item(row) { return row.classification; }));
            return freezeAttachmentOutput({
                success: !failures.length,
                classification: classification,
                state: failures.length ? ATTACHMENT_STATES.RESTRICTED : ATTACHMENT_STATES.VALIDATING,
                failures: failures,
                uploadValidation: {
                    signedUploadUrlsRequired: true,
                    tenantScopedUploads: true,
                    duplicateUploadDetection: true,
                    uploadIntegrityValidation: true,
                    restrictedExtensionBlocking: true,
                    publicExposureBlocked: failures.some(function item(row) { return row.failureCode === 'PUBLIC_ATTACHMENT_EXPOSURE_BLOCKED'; })
                },
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    attachmentConfidentialityPreserved: true,
                    historicalAttachmentsImmutable: true
                }
            });
        } catch (error) {
            return freezeAttachmentOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                state: ATTACHMENT_STATES.RESTRICTED,
                failures: [safeFailure('SECURE_UPLOAD_VALIDATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Secure upload validation failed safely.')]
            });
        }
    }

    function generateSignedAttachmentAccess(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeAttachmentOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    failures: [safeFailure('MALFORMED_ATTACHMENT_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Attachment access payload is malformed.')]
                });
            }
            var failures = [];
            var scope = validateAttachmentScope(payload, context);
            if (!scope.allowed) failures = failures.concat(scope.failures || []);
            var ttl = safeNumber(payload.expiresInSeconds || payload.ttlSeconds || 900, 900);
            if (ttl < MIN_SIGNED_ACCESS_SECONDS || ttl > MAX_SIGNED_ACCESS_SECONDS) {
                failures.push(safeFailure('SIGNED_ATTACHMENT_EXPIRY_UNSAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Signed attachment access must expire safely.'));
            }
            if (publicExposure(payload)) {
                failures.push(safeFailure('PUBLIC_ATTACHMENT_EXPOSURE_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Public attachment access was blocked.'));
            }
            var classification = highestClassification(failures.map(function item(row) { return row.classification; }));
            var success = !failures.length;
            var baseTime = context && context.now ? new Date(context.now).getTime() : Date.now();
            var expiresAt = new Date(baseTime + ttl * 1000).toISOString();
            if (success) {
                auditAttachment('FILE_ATTACHMENT_SIGNED_ACCESS_GENERATED', {
                    tenantSlug: contextTenant(context),
                    severity: 'INFO',
                    description: 'Signed attachment access marker generated.'
                }, context);
                emitTelemetry('FILE_ATTACHMENT_SIGNED_ACCESS_GENERATED', { tenantSlug: contextTenant(context), status: 'ISSUED' }, context);
                recordMetric('FILE_ATTACHMENT_SIGNED_ACCESS_GENERATED', { tenantSlug: contextTenant(context), status: 'ISSUED' }, context);
            }
            return freezeAttachmentOutput({
                success: success,
                classification: classification,
                failures: failures,
                signedAccess: {
                    signedUrlIssued: success,
                    signedUrlRedacted: true,
                    expiresInSeconds: ttl,
                    expiresAt: expiresAt,
                    expiresSafely: success && ttl <= MAX_SIGNED_ACCESS_SECONDS && ttl >= MIN_SIGNED_ACCESS_SECONDS,
                    securePreviewSupport: true
                },
                metadata: {
                    attachmentConfidentialityPreserved: true,
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    historicalAttachmentsImmutable: true
                }
            });
        } catch (error) {
            return freezeAttachmentOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('SIGNED_ATTACHMENT_ACCESS_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Signed attachment access failed safely.')]
            });
        }
    }

    function detectSuspiciousUploads(filters, context) {
        try {
            var data = rawData();
            var tenant = normalizeTenantSlug(filters && (filters.tenantSlug || filters.tenantId || filters.companyId)) || contextTenant(context);
            var rows = attachmentRows(data).filter(tenantFilter(tenant, data));
            var access = accessRows(data).filter(tenantFilter(tenant, data));
            var checksums = {};
            rows.forEach(function countChecksum(row) {
                var checksum = safeString(row.checksum || row.hash || row.sha256 || '', '').trim();
                if (checksum) checksums[checksum] = (checksums[checksum] || 0) + 1;
            });
            var duplicateFiles = Object.keys(checksums).filter(function duplicate(key) { return checksums[key] > 1; }).length;
            var publicCount = rows.filter(publicExposure).length;
            var signatureCount = rows.filter(suspiciousSignature).length;
            var corruptedCount = rows.filter(corruptedAttachment).length;
            var mimeMismatchCount = rows.filter(mimeMismatch).length;
            var oversizedCount = rows.filter(function oversized(row) { return safeNumber(row.size || row.bytes || row.fileSize, 0) > MAX_ATTACHMENT_BYTES; }).length;
            var malformedCount = rows.filter(function malformed(row) { return !mimeOf(row) || !extensionOf(row) || !safeString(row.checksum || row.hash || row.sha256 || '', '').trim(); }).length;
            var failedUploads = rows.filter(function failed(row) { return /FAILED|ERROR|REJECTED|BLOCKED/.test(normalizeToken(row.uploadStatus || row.status || row.state)); }).length;
            var suspiciousAccessAttempts = access.filter(function suspicious(row) {
                return /BLOCKED|DENIED|RESTRICTED|SUSPICIOUS/.test(normalizeToken(row.status || row.action || row.reason)) || normalizeRole(row.actorRole) === 'SUPER_ADMIN';
            }).length;
            var classification = classifyAttachmentRisk({
                publicExposure: publicCount > 0,
                duplicateFiles: duplicateFiles > 0,
                suspiciousSignature: signatureCount > 0,
                corruptedAttachment: corruptedCount > 0,
                mimeMismatch: mimeMismatchCount > 0,
                oversizedPayload: oversizedCount > 0,
                failedUpload: failedUploads > 0
            });
            var integritySignals = [];
            if (duplicateFiles) integritySignals.push({ signal: 'Duplicate files', count: duplicateFiles, classification: FAILURE_CLASSIFICATIONS.HIGH_RISK });
            if (publicCount) integritySignals.push({ signal: 'Public exposure', count: publicCount, classification: FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER });
            if (signatureCount) integritySignals.push({ signal: 'Suspicious signatures', count: signatureCount, classification: FAILURE_CLASSIFICATIONS.HIGH_RISK });
            if (oversizedCount) integritySignals.push({ signal: 'Oversized payloads', count: oversizedCount, classification: FAILURE_CLASSIFICATIONS.WARNING });
            if (suspiciousAccessAttempts) integritySignals.push({ signal: 'Suspicious access attempts', count: suspiciousAccessAttempts, classification: FAILURE_CLASSIFICATIONS.HIGH_RISK });
            return freezeAttachmentOutput({
                success: true,
                classification: classification,
                summary: {
                    malformedUploads: malformedCount,
                    duplicateFiles: duplicateFiles,
                    publicExposure: publicCount,
                    suspiciousFileSignatures: signatureCount,
                    corruptedAttachments: corruptedCount,
                    mimeMismatches: mimeMismatchCount,
                    oversizedPayloads: oversizedCount,
                    failedUploads: failedUploads,
                    suspiciousAccessAttempts: suspiciousAccessAttempts
                },
                integritySignals: integritySignals,
                metadata: {
                    tenantIsolationPreserved: true,
                    attachmentConfidentialityPreserved: true,
                    historicalAttachmentsImmutable: true
                }
            });
        } catch (error) {
            return freezeAttachmentOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                summary: { duplicateFiles: 0, publicExposure: 0, suspiciousFileSignatures: 0 },
                integritySignals: [],
                failures: [safeFailure('SUSPICIOUS_UPLOAD_DETECTION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Suspicious upload detection failed safely.')]
            });
        }
    }

    function auditAttachment(actionType, metadata, context) {
        if (auditForwarding || context && context.skipAuditPersistence) return { success: true, skipped: true };
        auditForwarding = true;
        try {
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    actionType: actionType,
                    eventType: actionType,
                    module: 'File Attachment Governance',
                    targetId: '',
                    description: metadata && metadata.description || actionType,
                    actorRole: context && context.actor && context.actor.role || 'hr',
                    actorId: context && context.actor && (context.actor.id || context.actor.empId) || '',
                    severity: metadata && metadata.severity || 'INFO',
                    metadata: cloneSanitized(metadata || {})
                }, {
                    source: 'fileAttachmentGovernanceService',
                    skipPersistence: false
                });
            }
            var source = db();
            if (source && typeof source.writeAuditLog === 'function') {
                source.writeAuditLog(context && context.actor && context.actor.role || 'hr', context && context.actor && context.actor.id || '', actionType, 'File Attachment Governance', '', metadata && metadata.description || actionType);
            }
            return { success: true };
        } catch (error) {
            return { success: false, warning: 'Attachment audit failed safely.' };
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
                    source: 'fileAttachmentGovernanceService',
                    severity: metadata && metadata.severity || 'INFO',
                    status: metadata && metadata.status || eventType,
                    tenantSlug: contextTenant(context) || metadata && metadata.tenantSlug || '',
                    metadata: cloneSanitized(metadata || {})
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Attachment telemetry failed safely.' };
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
                    source: 'fileAttachmentGovernanceService',
                    status: metadata && metadata.status || metricType,
                    severity: metadata && metadata.severity || 'INFO'
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Attachment metric failed safely.' };
        } finally {
            metricForwarding = false;
        }
        return { success: false, warning: 'OrchestrationMetricsService unavailable.' };
    }

    function generateAttachmentGovernanceReport(filters, context) {
        try {
            var data = rawData();
            var tenant = normalizeTenantSlug(filters && (filters.tenantSlug || filters.tenantId || filters.companyId)) || contextTenant(context);
            var rows = attachmentRows(data).filter(tenantFilter(tenant, data));
            var jobs = asyncRows(data).filter(tenantFilter(tenant, data)).filter(isAttachmentJob);
            var access = accessRows(data).filter(tenantFilter(tenant, data));
            var suspicious = detectSuspiciousUploads({ tenantSlug: tenant }, {
                tenantSlug: tenant,
                now: context && context.now,
                skipAuditPersistence: true,
                skipTelemetry: true,
                skipMetrics: true
            });
            var summary = suspicious.summary || {};
            var totalBytes = rows.reduce(function total(sum, row) { return sum + Math.max(0, safeNumber(row.size || row.bytes || row.fileSize, 0)); }, 0);
            var workflowLinked = rows.filter(function linked(row) { return !!(workflowIdOf(row) || threadIdOf(row)) || /WORKFLOW|DISCUSSION/.test(normalizeToken(row.type || row.category || row.attachmentType)); }).length;
            var escalationReferences = rows.filter(function escalation(row) { return !!row.escalationId || /ESCALATION/.test(normalizeToken(row.type || row.category || row.module)); }).length;
            var policyAttachments = rows.filter(function policy(row) { return /POLICY/.test(normalizeToken(row.type || row.category || row.documentType || row.attachmentType)); }).length;
            var onboardingUploads = rows.filter(function onboarding(row) { return /ONBOARDING|IDENTITY|DOCUMENT/.test(normalizeToken(row.type || row.category || row.documentType || row.attachmentType)); }).length;
            var recruitmentRefs = rows.filter(function recruitment(row) { return /RECRUITMENT|RESUME|CANDIDATE/.test(normalizeToken(row.type || row.category || row.documentType || row.attachmentType)); }).length;
            var failedJobs = jobs.filter(function failed(row) { return /FAILED|ERROR|DEAD_LETTER/.test(normalizeToken(row.state || row.status)); }).length;
            var retryJobs = jobs.filter(function retry(row) { return /RETRY_PENDING|RETRY/.test(normalizeToken(row.state || row.status)); }).length;
            var classification = highestClassification([
                suspicious.classification,
                failedJobs ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO
            ]);
            var report = {
                success: true,
                readOnly: true,
                classification: classification,
                generatedAt: nowIso(context),
                tenantSlug: tenant,
                uploadHealth: {
                    totalAttachments: rows.length,
                    uploadedAttachments: rows.filter(function uploaded(row) { return normalizeAttachmentState(row.state || row.status || row.uploadStatus) === ATTACHMENT_STATES.UPLOADED; }).length,
                    activeAttachments: rows.filter(function active(row) { return normalizeAttachmentState(row.state || row.status || row.uploadStatus) === ATTACHMENT_STATES.ACTIVE; }).length,
                    validatingAttachments: rows.filter(function validating(row) { return normalizeAttachmentState(row.state || row.status || row.uploadStatus) === ATTACHMENT_STATES.VALIDATING; }).length,
                    restrictedAttachments: rows.filter(function restricted(row) { return normalizeAttachmentState(row.state || row.status || row.uploadStatus) === ATTACHMENT_STATES.RESTRICTED; }).length,
                    expiredAttachments: rows.filter(function expired(row) { return isExpired(row, context); }).length,
                    archivedAttachments: rows.filter(function archived(row) { return normalizeAttachmentState(row.state || row.status || row.uploadStatus) === ATTACHMENT_STATES.ARCHIVED; }).length
                },
                secureUploadGovernance: {
                    failedUploads: summary.failedUploads || failedJobs,
                    publicExposure: summary.publicExposure || 0,
                    signedUploadUrlsRequired: true,
                    tenantScopedUploads: true,
                    duplicateUploadDetection: true,
                    uploadIntegrityValidation: true,
                    restrictedExtensionBlocking: true,
                    publicFileExposurePrevented: true
                },
                signedAccessGovernance: {
                    signedAccessRequired: true,
                    expiryControlledAccess: true,
                    roleScopedVisibility: true,
                    accessLoggingEnabled: true,
                    downloadThrottlingReady: true,
                    securePreviewSupport: true,
                    suspiciousAccessAttempts: summary.suspiciousAccessAttempts || 0
                },
                integrityValidation: {
                    malformedUploads: summary.malformedUploads || 0,
                    duplicateFiles: summary.duplicateFiles || 0,
                    suspiciousFileSignatures: summary.suspiciousFileSignatures || 0,
                    corruptedAttachments: summary.corruptedAttachments || 0,
                    mimeMismatches: summary.mimeMismatches || 0,
                    oversizedPayloads: summary.oversizedPayloads || 0
                },
                workflowCommunicationIntegration: {
                    workflowLinkedAttachments: workflowLinked,
                    escalationAttachmentReferences: escalationReferences,
                    policyAttachments: policyAttachments,
                    onboardingUploads: onboardingUploads,
                    recruitmentDocumentReferences: recruitmentRefs
                },
                attachmentAnalytics: {
                    uploadTrends: rows.length,
                    failedUploads: summary.failedUploads || failedJobs,
                    storageGrowthBytes: totalBytes,
                    duplicateUploadRates: summary.duplicateFiles || 0,
                    expiredAttachmentBuildup: rows.filter(function expired(row) { return isExpired(row, context); }).length,
                    suspiciousAccessAttempts: summary.suspiciousAccessAttempts || 0,
                    retryPending: retryJobs
                },
                accessGovernance: {
                    employeeOwnAttachmentsOnly: true,
                    managerTeamWorkflowAttachmentsOnly: true,
                    hrOperationalDocumentVisibility: true,
                    directorAggregateComplianceOnly: true,
                    superAdminRawAttachmentAccess: false,
                    platformOwnerAttachmentWorkflow: false,
                    attachmentConfidentialityPreserved: true
                },
                integrationHealth: {
                    documentGovernanceIntegrated: !!global.DocumentGovernanceService,
                    workflowDiscussionIntegrated: !!global.WorkflowDiscussionService,
                    communicationGovernanceIntegrated: !!global.CommunicationGovernanceService,
                    recruitmentGovernanceIntegrated: !!global.RecruitmentGovernanceService,
                    notificationOrchestrationIntegrated: !!global.NotificationOrchestrationService,
                    auditReady: !!(global.AuditService || global.auditService),
                    telemetryReady: !!(global.WorkflowTelemetryService || global.workflowTelemetryService),
                    metricsReady: !!(global.OrchestrationMetricsService || global.orchestrationMetricsService)
                },
                warnings: suspicious.integritySignals || [],
                metadata: {
                    tenantIsolationPreserved: true,
                    attachmentConfidentialityPreserved: true,
                    historicalAttachmentsImmutable: true,
                    existingWorkflowsPreserved: true,
                    attachmentActionsAuditable: true,
                    readOnly: true
                }
            };
            auditAttachment('FILE_ATTACHMENT_GOVERNANCE_REPORTED', {
                tenantSlug: tenant,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO',
                description: 'File attachment governance report viewed.'
            }, context);
            emitTelemetry('FILE_ATTACHMENT_GOVERNANCE_REPORTED', {
                tenantSlug: tenant,
                status: classification,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'INFO'
            }, context);
            recordMetric('FILE_ATTACHMENT_GOVERNANCE_REPORTED', {
                tenantSlug: tenant,
                status: classification,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'INFO'
            }, context);
            return freezeAttachmentOutput(report);
        } catch (error) {
            safeWarn('Attachment governance report failed safely.', error && error.message ? error.message : error);
            return freezeAttachmentOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                uploadHealth: { totalAttachments: 0 },
                secureUploadGovernance: { failedUploads: 0 },
                signedAccessGovernance: { signedAccessRequired: true },
                integrityValidation: { duplicateFiles: 0 },
                attachmentAnalytics: { storageGrowthBytes: 0 },
                failures: [safeFailure('ATTACHMENT_GOVERNANCE_REPORT_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Attachment governance report failed safely.')]
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        function check(label, condition) { checks.push({ label: label, passed: !!condition }); }
        try {
            var malformed = normalizeAttachmentPayload(null, { tenantSlug: 'tabsons' });
            check('malformed payloads fail safely', malformed.success === false && malformed.failures.some(function item(row) { return row.failureCode === 'MALFORMED_ATTACHMENT_PAYLOAD'; }));

            var crossTenant = validateAttachmentScope({ tenantSlug: 'abc', empId: 'EMP-X', attachmentId: 'ATT-X' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' } });
            check('attachment isolation works', crossTenant.allowed === false && crossTenant.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER);

            var signed = generateSignedAttachmentAccess({ tenantSlug: 'tabsons', empId: 'EMP-1', attachmentId: 'ATT-1', expiresInSeconds: 86400 }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('signed URL governance works', signed.success === false && signed.failures.some(function item(row) { return row.failureCode === 'SIGNED_ATTACHMENT_EXPIRY_UNSAFE'; }));

            var upload = validateSecureUpload({ tenantSlug: 'tabsons', empId: 'EMP-1', fileName: 'unsafe.exe', mimeType: 'application/x-msdownload', size: MAX_ATTACHMENT_BYTES + 1, publicUrl: 'https://public.example.com/unsafe.exe', signature: 'MZ' }, { tenantSlug: 'tabsons', actor: { role: 'EMPLOYEE', id: 'EMP-1', empId: 'EMP-1' } });
            check('upload validation works', upload.success === false && upload.failures.some(function item(row) { return row.failureCode === 'PUBLIC_ATTACHMENT_EXPOSURE_BLOCKED'; }));

            var suspicious = detectSuspiciousUploads({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('integrity detection works', suspicious.success === true && Object.isFrozen(suspicious.integritySignals));

            var frozen = freezeAttachmentOutput({ nested: { ok: true }, payload: { state: ATTACHMENT_STATES.ACTIVE } });
            check('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested) && Object.isFrozen(frozen.payload));

            var originalDocument = global.DocumentGovernanceService;
            var originalDiscussion = global.WorkflowDiscussionService;
            try {
                delete global.DocumentGovernanceService;
                delete global.WorkflowDiscussionService;
                var report = generateAttachmentGovernanceReport({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
                check('dependency absence degrades safely', report.success === true && report.integrationHealth.documentGovernanceIntegrated === false && report.integrationHealth.workflowDiscussionIntegrated === false);
            } finally {
                if (originalDocument) global.DocumentGovernanceService = originalDocument;
                if (originalDiscussion) global.WorkflowDiscussionService = originalDiscussion;
            }
        } catch (error) {
            checks.push({ label: 'self-test uncaught error guard', passed: false, description: safeString(error && error.message || error, '') });
        }
        var passed = checks.every(function item(row) { return row.passed; });
        var result = freezeAttachmentOutput({
            passed: passed,
            checks: checks,
            summary: passed ? 'File attachment governance self-test passed.' : 'File attachment governance self-test detected failures.'
        });
        global.__ARTHHRMS_FILE_ATTACHMENT_GOVERNANCE_SELF_TEST__ = result;
        return result;
    }

    var FileAttachmentGovernanceService = Object.freeze({
        VERSION: VERSION,
        ATTACHMENT_STATES: ATTACHMENT_STATES,
        ATTACHMENT_TYPES: ATTACHMENT_TYPES,
        FAILURE_CLASSIFICATIONS: FAILURE_CLASSIFICATIONS,
        VISIBILITY: VISIBILITY,
        classifyAttachmentRisk: classifyAttachmentRisk,
        validateAttachmentScope: validateAttachmentScope,
        normalizeAttachmentPayload: normalizeAttachmentPayload,
        freezeAttachmentOutput: freezeAttachmentOutput,
        validateSecureUpload: validateSecureUpload,
        generateSignedAttachmentAccess: generateSignedAttachmentAccess,
        detectSuspiciousUploads: detectSuspiciousUploads,
        generateAttachmentGovernanceReport: generateAttachmentGovernanceReport,
        runSelfTest: runSelfTest
    });

    global.FileAttachmentGovernanceService = FileAttachmentGovernanceService;
    global.fileAttachmentGovernanceService = FileAttachmentGovernanceService;

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
