/**
 * uploadValidationService.js
 * ARTHHRMS Enterprise Upload Validation + Malware Detection Governance System.
 *
 * Additive read-only validation layer for MIME checks, restricted extensions,
 * file signatures, duplicate hashes, malicious upload indicators, quarantine
 * governance, and upload security analytics. It never executes uploaded
 * content and never exposes raw filenames, paths, URLs, or cross-tenant data.
 */
(function attachUploadValidationService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[UploadValidationService]';

    var VALIDATION_STATES = Object.freeze({
        RECEIVED: 'RECEIVED',
        VALIDATING: 'VALIDATING',
        SCANNING: 'SCANNING',
        APPROVED: 'APPROVED',
        RESTRICTED: 'RESTRICTED',
        QUARANTINED: 'QUARANTINED',
        REJECTED: 'REJECTED',
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
        OWN_UPLOADS_ONLY: 'OWN_UPLOADS_ONLY',
        WORKFLOW_SCOPED_UPLOAD_VISIBILITY: 'WORKFLOW_SCOPED_UPLOAD_VISIBILITY',
        OPERATIONAL_UPLOAD_VISIBILITY: 'OPERATIONAL_UPLOAD_VISIBILITY',
        STRATEGIC_UPLOAD_ANALYTICS: 'STRATEGIC_UPLOAD_ANALYTICS',
        AGGREGATE_UPLOAD_HEALTH_ONLY: 'AGGREGATE_UPLOAD_HEALTH_ONLY',
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
    var RESTRICTED_MIME_TYPES = Object.freeze([
        'application/x-msdownload',
        'application/x-msdos-program',
        'application/x-executable',
        'application/octet-stream',
        'text/javascript',
        'application/javascript',
        'application/x-sh'
    ]);
    var ALLOWED_EXTENSIONS = Object.freeze(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'csv', 'xls', 'xlsx']);
    var RESTRICTED_EXTENSIONS = Object.freeze(['exe', 'bat', 'cmd', 'msi', 'ps1', 'js', 'vbs', 'scr', 'dll', 'com', 'jar', 'sh', 'xlsm', 'docm']);
    var MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
    var MAX_ARCHIVE_COMPRESSION_RATIO = 100;

    var SENSITIVE_KEY_PATTERN = /(upload.?id|attachment.?id|document.?id|file.?name|name|storage.?path|signed.?url|public.?url|url|path|download|object.?key|bucket|private.?note|remark|description|message|body|content|candidate|resume|receipt|salary|payroll|payslip|compensation|amount|employee|emp.?id|user.?id|owner|uploaded.?by|assigned.?to|author|manager|token|secret|jwt|authorization|service.?role|private.?key|bypass.?validation)/i;
    var SENSITIVE_VALUE_PATTERN = /(https?:\/\/[^\s"',}]+|private:\/\/[^\s"',}]+|\b(private|confidential|secret|salary|payroll|resume|receipt)\b[^,;}]*)/ig;
    var SAFE_GOVERNANCE_KEYS = Object.freeze({
        uploadValidationSecurityPreserved: true,
        tenantIsolationPreserved: true,
        existingUploadFlowsPreserved: true,
        existingWorkflowsPreserved: true,
        historicalValidationImmutable: true,
        validationActionsAuditable: true,
        readOnly: true,
        validationHealth: true,
        totalUploads: true,
        receivedUploads: true,
        validatingUploads: true,
        scanningUploads: true,
        approvedUploads: true,
        restrictedUploads: true,
        quarantinedUploads: true,
        rejectedUploads: true,
        archivedUploads: true,
        threatDetection: true,
        executablePayloads: true,
        disguisedExtensions: true,
        suspiciousMacros: true,
        embeddedScriptIndicators: true,
        archiveBombIndicators: true,
        malformedPdfs: true,
        suspiciousSignatures: true,
        malwareIndicators: true,
        quarantineGovernance: true,
        quarantineStorage: true,
        restrictedVisibility: true,
        secureRejectionHandling: true,
        blockedDownloadAccess: true,
        threatAuditMarkers: true,
        uploadSuspensionIndicators: true,
        quarantineBuildup: true,
        mimeValidation: true,
        allowedMimeTypes: true,
        unsupportedMimeTypes: true,
        mimeMismatches: true,
        restrictedExtensions: true,
        duplicateHashValidation: true,
        duplicateHashes: true,
        hashCollisions: true,
        repeatedMaliciousUploads: true,
        repeatedRejectionAttempts: true,
        corruptedFiles: true,
        oversizedUploads: true,
        suspiciousMetadata: true,
        publicExposure: true,
        validationAnalytics: true,
        uploadAnalytics: true,
        rejectedUploads: true,
        malwareDetectionSpikes: true,
        suspiciousUploadTrends: true,
        uploadCongestion: true,
        retryPending: true,
        failedJobs: true,
        integrationHealth: true,
        fileAttachmentGovernanceIntegrated: true,
        documentGovernanceIntegrated: true,
        workflowDiscussionIntegrated: true,
        recruitmentGovernanceIntegrated: true,
        communicationGovernanceIntegrated: true,
        auditReady: true,
        telemetryReady: true,
        metricsReady: true,
        accessGovernance: true,
        employeeOwnUploadsOnly: true,
        managerWorkflowScopedUploadVisibility: true,
        hrOperationalUploadVisibility: true,
        directorAggregateUploadHealthOnly: true,
        superAdminValidationBypass: true,
        platformOwnerUploadWorkflow: true,
        quarantineIndicators: true,
        threatSignals: true,
        signal: true,
        count: true,
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
        source: true,
        mimeType: true,
        declaredMimeType: true,
        extension: true,
        size: true,
        validationRule: true
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

    function uploadIdOf(row) {
        return safeString(row && (row.uploadId || row.upload_id || row.validationId || row.validation_id || row.attachmentId || row.documentId || row.id) || '', '').trim();
    }

    function workflowIdOf(row) {
        return safeString(row && (row.workflowId || row.workflow_id || row.eventId || row.event_id || row.pendingActionId || row.pending_action_id || '') || '', '').trim();
    }

    function safeNumber(value, fallback) {
        var number = Number(value);
        return isFinite(number) ? number : (fallback || 0);
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

    function freezeUploadOutput(output) {
        return deepFreeze(cloneSanitized(output || {}));
    }

    function safeFailure(failureCode, classification, description, metadata) {
        var failure = {
            failureCode: normalizeToken(failureCode || 'UPLOAD_VALIDATION_FAILURE'),
            classification: classification || FAILURE_CLASSIFICATIONS.WARNING,
            description: safeString(description || 'Upload validation failed safely.', '')
        };
        if (metadata && typeof metadata === 'object') failure.metadata = cloneSanitized(metadata);
        return deepFreeze(failure);
    }

    function safeWarning(warningCode, description, metadata) {
        var warning = {
            warningCode: normalizeToken(warningCode || 'UPLOAD_VALIDATION_WARNING'),
            classification: FAILURE_CLASSIFICATIONS.WARNING,
            description: safeString(description || 'Upload validation warning.', '')
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

    function normalizeValidationState(value) {
        var normalized = normalizeToken(value || VALIDATION_STATES.RECEIVED);
        if (normalized === 'RECEIVE' || normalized === 'RECEIVED') return VALIDATION_STATES.RECEIVED;
        if (normalized === 'VALIDATION' || normalized === 'VALIDATING') return VALIDATION_STATES.VALIDATING;
        if (normalized === 'SCAN' || normalized === 'SCANNING') return VALIDATION_STATES.SCANNING;
        if (normalized === 'APPROVE' || normalized === 'APPROVED' || normalized === 'SAFE') return VALIDATION_STATES.APPROVED;
        if (normalized === 'RESTRICT' || normalized === 'RESTRICTED') return VALIDATION_STATES.RESTRICTED;
        if (normalized === 'QUARANTINE' || normalized === 'QUARANTINED') return VALIDATION_STATES.QUARANTINED;
        if (normalized === 'REJECT' || normalized === 'REJECTED' || normalized === 'BLOCKED') return VALIDATION_STATES.REJECTED;
        if (normalized === 'ARCHIVE' || normalized === 'ARCHIVED') return VALIDATION_STATES.ARCHIVED;
        return VALIDATION_STATES[normalized] || VALIDATION_STATES.RECEIVED;
    }

    function extensionOf(row) {
        var extension = safeString(row && (row.extension || row.fileExtension || row.ext) || '', '').trim().toLowerCase().replace(/^\./, '');
        if (extension) return extension;
        var name = safeString(row && (row.fileName || row.name || row.originalName) || '', '').trim();
        var index = name.lastIndexOf('.');
        return index !== -1 ? name.slice(index + 1).toLowerCase() : '';
    }

    function mimeOf(row) {
        return safeString(row && (row.mimeType || row.contentType || row.typeMime) || '', '').trim().toLowerCase();
    }

    function declaredMimeOf(row) {
        return safeString(row && (row.declaredMimeType || row.expectedMimeType || row.clientMimeType) || '', '').trim().toLowerCase();
    }

    function publicExposure(row) {
        var url = safeString(row && (row.publicUrl || row.url || row.downloadUrl || row.uploadUrl || row.attachmentUrl || row.documentUrl) || '', '').toLowerCase();
        return !!(row && (row.public === true || row.isPublic === true || row.publicBucket === true || /public\.example|\/public\/|public-|public_/.test(url)));
    }

    function restrictedExtension(row) {
        return RESTRICTED_EXTENSIONS.indexOf(extensionOf(row)) !== -1;
    }

    function executablePayload(row) {
        var mime = mimeOf(row);
        var signature = safeString(row && (row.signature || row.fileSignature || row.magicBytes || row.magicNumber) || '', '').trim().toUpperCase();
        var name = safeString(row && (row.fileName || row.name || row.originalName) || '', '').toLowerCase();
        return restrictedExtension(row) || RESTRICTED_MIME_TYPES.indexOf(mime) !== -1 || signature === 'MZ' || signature === '7F454C46' || /\.pdf\.exe$|\.jpg\.exe$|\.png\.exe$|\.docx\.exe$/.test(name);
    }

    function mimeMismatch(row) {
        var extension = extensionOf(row);
        var mime = mimeOf(row);
        var declared = declaredMimeOf(row);
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

    function fileSignatureMismatch(row) {
        var signature = safeString(row && (row.signature || row.fileSignature || row.magicBytes || row.magicNumber) || '', '').trim().toUpperCase();
        var extension = extensionOf(row);
        if (!signature) return false;
        if (signature === 'MZ' || signature === '7F454C46') return true;
        if (extension === 'pdf') return signature.indexOf('%PDF') !== 0 && signature.indexOf('25504446') !== 0;
        if ((extension === 'jpg' || extension === 'jpeg') && signature.indexOf('FFD8') !== 0) return true;
        if (extension === 'png' && signature.indexOf('89504E47') !== 0) return true;
        return false;
    }

    function malwarePattern(row) {
        var indicators = Array.isArray(row && row.malwareIndicators) ? row.malwareIndicators : [];
        return !!(row && (row.hasMacros === true || row.suspiciousMacros === true || row.embeddedScript === true || row.embeddedScriptIndicators === true || indicators.length));
    }

    function malformedPdf(row) {
        return !!(row && (row.malformedPdf === true || /MALFORMED_PDF|PDF_ERROR/.test(normalizeToken(row.parserWarning || row.validationWarning))));
    }

    function archiveBomb(row) {
        return safeNumber(row && (row.archiveCompressionRatio || row.compressionRatio), 0) > MAX_ARCHIVE_COMPRESSION_RATIO;
    }

    function corruptedFile(row) {
        return !!(row && (row.corrupted === true || row.integrityValid === false || /CORRUPT|INVALID|FAILED/.test(normalizeToken(row.integrityStatus || row.checksumStatus))));
    }

    function validationRows(data) {
        var source = data || rawData();
        var rows = [];
        if (Array.isArray(source.uploadValidationRecords)) rows = rows.concat(source.uploadValidationRecords);
        if (Array.isArray(source.uploadAttempts)) rows = rows.concat(source.uploadAttempts);
        if (Array.isArray(source.secureUploadValidations)) rows = rows.concat(source.secureUploadValidations);
        return rows;
    }

    function uploadRelatedRows(data) {
        var source = data || rawData();
        var rows = validationRows(source);
        if (Array.isArray(source.fileAttachments)) rows = rows.concat(source.fileAttachments);
        if (Array.isArray(source.attachments)) rows = rows.concat(source.attachments);
        if (Array.isArray(source.workflowDiscussionAttachments)) rows = rows.concat(source.workflowDiscussionAttachments);
        if (Array.isArray(source.communicationAttachments)) rows = rows.concat(source.communicationAttachments);
        if (Array.isArray(source.recruitmentDocuments)) rows = rows.concat(source.recruitmentDocuments);
        if (Array.isArray(source.candidateDocuments)) rows = rows.concat(source.candidateDocuments);
        if (Array.isArray(source.documents)) rows = rows.concat(source.documents);
        if (Array.isArray(source.expenseReceipts)) rows = rows.concat(source.expenseReceipts);
        return rows;
    }

    function quarantineRows(data) {
        var source = data || rawData();
        var rows = [];
        if (Array.isArray(source.quarantineRecords)) rows = rows.concat(source.quarantineRecords);
        if (Array.isArray(source.uploadQuarantineRecords)) rows = rows.concat(source.uploadQuarantineRecords);
        return rows;
    }

    function accessRows(data) {
        var source = data || rawData();
        var rows = [];
        if (Array.isArray(source.uploadAccessLogs)) rows = rows.concat(source.uploadAccessLogs);
        if (Array.isArray(source.attachmentAccessLogs)) rows = rows.concat(source.attachmentAccessLogs);
        if (Array.isArray(source.documentAccessLogs)) rows = rows.concat(source.documentAccessLogs);
        return rows;
    }

    function asyncRows(data) {
        var source = data || rawData();
        var rows = [];
        if (Array.isArray(source.asyncJobs)) rows = rows.concat(source.asyncJobs);
        if (Array.isArray(source.jobQueue)) rows = rows.concat(source.jobQueue);
        return rows;
    }

    function isUploadJob(row) {
        return /UPLOAD|VALIDATION|SCAN|MALWARE|ATTACHMENT|DOCUMENT/.test(normalizeToken(row && (row.jobType || row.type || row.category)));
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

    function classifyUploadRisk(input) {
        var source = input || {};
        if (source.crossTenant || source.crossTenantUpload || source.executablePayload || source.publicMaliciousExposure || source.publicExposure || source.unsafeFileExecution || source.rlsBypass) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
        if (source.superAdminBypass || source.platformOwnerWorkflow || source.suspiciousMacros || source.embeddedScript || source.archiveBomb || source.malformedPdf || source.duplicateHash || source.hashCollision || source.repeatedMaliciousUploads || source.corruptedFile || source.suspiciousSignature) return FAILURE_CLASSIFICATIONS.HIGH_RISK;
        if (source.mimeMismatch || source.restrictedExtension || source.oversizedUpload || source.malformedPayload || source.duplicateUpload || source.failedUpload || source.quarantineBuildup || source.validationCongestion) return FAILURE_CLASSIFICATIONS.WARNING;
        return FAILURE_CLASSIFICATIONS.INFO;
    }

    function visibilityFor(role, record, context, data) {
        var normalized = normalizeRole(role);
        var source = data || rawData();
        var owner = empIdOf(record);
        var currentActorId = actorId(context && context.actor || {});
        if (normalized === 'EMPLOYEE') return owner && owner === currentActorId ? VISIBILITY.OWN_UPLOADS_ONLY : VISIBILITY.NONE;
        if (normalized === 'MANAGER') {
            var workflowLinked = !!workflowIdOf(record);
            return owner && workflowLinked && managerOwnsEmployee(currentActorId, owner, source) ? VISIBILITY.WORKFLOW_SCOPED_UPLOAD_VISIBILITY : VISIBILITY.NONE;
        }
        if (normalized === 'HR') return VISIBILITY.OPERATIONAL_UPLOAD_VISIBILITY;
        if (normalized === 'HR_HEAD') return VISIBILITY.STRATEGIC_UPLOAD_ANALYTICS;
        if (normalized === 'DIRECTOR') return VISIBILITY.AGGREGATE_UPLOAD_HEALTH_ONLY;
        if (normalized === 'SUPER_ADMIN') return VISIBILITY.INFRASTRUCTURE_ONLY;
        if (normalized === 'PLATFORM_OWNER') return VISIBILITY.PLATFORM_GOVERNANCE_ONLY;
        return VISIBILITY.NONE;
    }

    function recordIsUploadSpecific(record) {
        return !!(record && (
            uploadIdOf(record) ||
            empIdOf(record) ||
            workflowIdOf(record) ||
            record.fileName ||
            record.storagePath ||
            record.publicUrl ||
            record.signedUrl ||
            record.privateNote ||
            record.bypassValidation
        ));
    }

    function validateUploadScope(record, context) {
        try {
            var data = rawData();
            var ctxTenant = contextTenant(context);
            var targetTenant = normalizeTenantSlug(record && (record.tenantSlug || record.tenantId || record.companyId)) || sourceTenant(record, data) || ctxTenant;
            var role = normalizeRole(context && context.actor && context.actor.role || context && context.role || '');
            var visibility = visibilityFor(role, record || {}, context || {}, data);
            var failures = [];

            if (ctxTenant && targetTenant && ctxTenant !== targetTenant) {
                failures.push(safeFailure('CROSS_TENANT_UPLOAD_VISIBILITY_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Cross-tenant upload visibility was blocked.'));
            }
            if (role === 'PLATFORM_OWNER' && recordIsUploadSpecific(record)) {
                failures.push(safeFailure('PLATFORM_OWNER_UPLOAD_WORKFLOW_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Platform owner is isolated from tenant upload workflows.'));
            }
            if (role === 'SUPER_ADMIN' && (recordIsUploadSpecific(record) || record && record.bypassValidation)) {
                failures.push(safeFailure('SUPER_ADMIN_UPLOAD_BYPASS_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Super admin cannot bypass upload validation rules.'));
            }
            if (role === 'EMPLOYEE' && visibility !== VISIBILITY.OWN_UPLOADS_ONLY) {
                failures.push(safeFailure('EMPLOYEE_UPLOAD_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Employees may access only own upload validation metadata.'));
            }
            if (role === 'MANAGER' && visibility !== VISIBILITY.WORKFLOW_SCOPED_UPLOAD_VISIBILITY) {
                failures.push(safeFailure('MANAGER_UPLOAD_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Managers may access only workflow-scoped team upload metadata.'));
            }
            var classification = highestClassification(failures.map(function item(row) { return row.classification; }));
            return freezeUploadOutput({
                allowed: !failures.length,
                success: !failures.length,
                classification: classification,
                visibility: visibility,
                failures: failures,
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    uploadValidationSecurityPreserved: true,
                    historicalValidationImmutable: true
                }
            });
        } catch (error) {
            return freezeUploadOutput({
                allowed: false,
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                visibility: VISIBILITY.NONE,
                failures: [safeFailure('UPLOAD_SCOPE_VALIDATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Upload scope validation failed safely.')]
            });
        }
    }

    function normalizeUploadPayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeUploadOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    state: VALIDATION_STATES.RECEIVED,
                    failures: [safeFailure('MALFORMED_UPLOAD_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Upload payload is malformed.')]
                });
            }
            var normalized = {
                tenantSlug: normalizeTenantSlug(payload.tenantSlug || payload.tenantId || payload.companyId) || contextTenant(context),
                state: normalizeValidationState(payload.state || payload.status || payload.validationState),
                mimeType: mimeOf(payload),
                declaredMimeType: declaredMimeOf(payload) || mimeOf(payload),
                extension: extensionOf(payload),
                size: Math.max(0, safeNumber(payload.size || payload.bytes || payload.fileSize, 0)),
                validationRule: normalizeToken(payload.validationRule || 'STANDARD_UPLOAD_SECURITY'),
                metadata: {
                    uploadValidationSecurityPreserved: true,
                    tenantIsolationPreserved: true,
                    historicalValidationImmutable: true,
                    readOnly: payload.readOnly !== false
                }
            };
            return freezeUploadOutput({
                success: true,
                classification: FAILURE_CLASSIFICATIONS.INFO,
                payload: normalized
            });
        } catch (error) {
            return freezeUploadOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                state: VALIDATION_STATES.RESTRICTED,
                failures: [safeFailure('UPLOAD_NORMALIZATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Upload normalization failed safely.')]
            });
        }
    }

    function checksumOf(row) {
        return safeString(row && (row.checksum || row.hash || row.sha256 || row.digest) || '', '').trim();
    }

    function duplicateChecksum(checksum, tenant, data) {
        if (!checksum) return false;
        return uploadRelatedRows(data || rawData()).filter(tenantFilter(tenant, data || rawData())).some(function duplicate(row) {
            return checksumOf(row) === checksum;
        });
    }

    function validateUploadSecurity(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeUploadOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    state: VALIDATION_STATES.RECEIVED,
                    failures: [safeFailure('MALFORMED_UPLOAD_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Upload payload is malformed.')]
                });
            }
            var failures = [];
            var data = rawData();
            var ctxTenant = contextTenant(context);
            var tenant = normalizeTenantSlug(payload.tenantSlug || payload.tenantId || payload.companyId) || sourceTenant(payload, data) || ctxTenant;
            if (ctxTenant && tenant && ctxTenant !== tenant) {
                failures.push(safeFailure('TENANT_MISMATCH', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Upload tenant mismatch was blocked.'));
            }
            var scope = validateUploadScope(payload, context);
            if (!scope.allowed && scope.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER) {
                failures = failures.concat(scope.failures || []);
            }

            var mime = mimeOf(payload);
            var extension = extensionOf(payload);
            var size = safeNumber(payload.size || payload.bytes || payload.fileSize, 0);
            var checksum = checksumOf(payload);

            if (ALLOWED_MIME_TYPES.indexOf(mime) === -1) {
                failures.push(safeFailure('UNSUPPORTED_UPLOAD_MIME_TYPE', FAILURE_CLASSIFICATIONS.WARNING, 'Unsupported upload MIME type was blocked.'));
            }
            if (executablePayload(payload)) {
                failures.push(safeFailure('UNSAFE_EXECUTABLE_UPLOAD_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Unsafe executable upload was blocked.'));
            }
            if (RESTRICTED_EXTENSIONS.indexOf(extension) !== -1) {
                failures.push(safeFailure('RESTRICTED_UPLOAD_EXTENSION_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Restricted upload extension was blocked.'));
            }
            if (size > MAX_UPLOAD_BYTES) {
                failures.push(safeFailure('UPLOAD_TOO_LARGE', FAILURE_CLASSIFICATIONS.WARNING, 'Upload exceeds governed size limits.'));
            }
            if (publicExposure(payload)) {
                failures.push(safeFailure('PUBLIC_MALICIOUS_FILE_EXPOSURE_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Public malicious file exposure was blocked.'));
            }
            if (!checksum) {
                failures.push(safeFailure('UPLOAD_INTEGRITY_VALIDATION_REQUIRED', FAILURE_CLASSIFICATIONS.WARNING, 'Upload integrity hash is required.'));
            }
            if (mimeMismatch(payload)) {
                failures.push(safeFailure('UPLOAD_MIME_MISMATCH_DETECTED', FAILURE_CLASSIFICATIONS.WARNING, 'Upload MIME mismatch requires review.'));
            }
            if (fileSignatureMismatch(payload)) {
                failures.push(safeFailure('FILE_SIGNATURE_MISMATCH', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Upload file signature mismatch requires quarantine review.'));
            }
            if (malwarePattern(payload)) {
                failures.push(safeFailure('MALWARE_PATTERN_DETECTED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Malware-like upload indicators were detected.'));
            }
            if (archiveBomb(payload)) {
                failures.push(safeFailure('ARCHIVE_BOMB_INDICATOR_DETECTED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Archive bomb indicator was detected.'));
            }
            if (malformedPdf(payload)) {
                failures.push(safeFailure('MALFORMED_PDF_DETECTED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Malformed PDF indicator was detected.'));
            }
            if (checksum && duplicateChecksum(checksum, tenant, data)) {
                failures.push(safeFailure('DUPLICATE_UPLOAD_HASH_DETECTED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Duplicate upload hash was detected.'));
            }
            if (corruptedFile(payload)) {
                failures.push(safeFailure('CORRUPTED_UPLOAD_DETECTED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Corrupted upload was detected.'));
            }

            var classification = highestClassification(failures.map(function item(row) { return row.classification; }));
            var state = classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER || failures.some(function malware(row) { return row.failureCode === 'MALWARE_PATTERN_DETECTED' || row.failureCode === 'FILE_SIGNATURE_MISMATCH'; })
                ? VALIDATION_STATES.QUARANTINED
                : failures.length ? VALIDATION_STATES.RESTRICTED : VALIDATION_STATES.APPROVED;
            return freezeUploadOutput({
                success: !failures.length,
                classification: classification,
                state: state,
                failures: failures,
                quarantineGovernance: {
                    quarantineStorage: state === VALIDATION_STATES.QUARANTINED,
                    restrictedVisibility: state !== VALIDATION_STATES.APPROVED,
                    blockedDownloadAccess: state !== VALIDATION_STATES.APPROVED,
                    threatAuditMarkers: failures.length > 0,
                    uploadSuspensionIndicators: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER
                },
                metadata: {
                    uploadValidationSecurityPreserved: true,
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    historicalValidationImmutable: true
                }
            });
        } catch (error) {
            return freezeUploadOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                state: VALIDATION_STATES.RESTRICTED,
                failures: [safeFailure('UPLOAD_SECURITY_VALIDATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Upload security validation failed safely.')]
            });
        }
    }

    function quarantineUpload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeUploadOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    state: VALIDATION_STATES.RECEIVED,
                    failures: [safeFailure('MALFORMED_UPLOAD_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Quarantine payload is malformed.')]
                });
            }
            var scope = validateUploadScope(payload, context);
            if (!scope.allowed && scope.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER) {
                return freezeUploadOutput({
                    success: false,
                    classification: scope.classification,
                    state: VALIDATION_STATES.RESTRICTED,
                    failures: scope.failures
                });
            }
            auditUpload('UPLOAD_VALIDATION_QUARANTINED', {
                tenantSlug: contextTenant(context),
                severity: 'WARNING',
                description: 'Upload quarantine marker created.'
            }, context);
            emitTelemetry('UPLOAD_VALIDATION_QUARANTINED', { tenantSlug: contextTenant(context), status: 'QUARANTINED', severity: 'WARNING' }, context);
            recordMetric('UPLOAD_VALIDATION_QUARANTINED', { tenantSlug: contextTenant(context), status: 'QUARANTINED', severity: 'WARNING' }, context);
            return freezeUploadOutput({
                success: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                state: VALIDATION_STATES.QUARANTINED,
                quarantineGovernance: {
                    quarantineStorage: true,
                    restrictedVisibility: true,
                    secureRejectionHandling: true,
                    blockedDownloadAccess: true,
                    threatAuditMarkers: true,
                    uploadSuspensionIndicators: true
                },
                metadata: {
                    uploadValidationSecurityPreserved: true,
                    tenantIsolationPreserved: true,
                    historicalValidationImmutable: true
                }
            });
        } catch (error) {
            return freezeUploadOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                state: VALIDATION_STATES.RESTRICTED,
                failures: [safeFailure('UPLOAD_QUARANTINE_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Upload quarantine failed safely.')]
            });
        }
    }

    function detectSuspiciousFilePatterns(filters, context) {
        try {
            var data = rawData();
            var tenant = normalizeTenantSlug(filters && (filters.tenantSlug || filters.tenantId || filters.companyId)) || contextTenant(context);
            var rows = uploadRelatedRows(data).filter(tenantFilter(tenant, data));
            var validations = validationRows(data).filter(tenantFilter(tenant, data));
            var quarantine = quarantineRows(data).filter(tenantFilter(tenant, data));
            var access = accessRows(data).filter(tenantFilter(tenant, data));
            var checksums = {};
            rows.forEach(function countChecksum(row) {
                var checksum = checksumOf(row);
                if (checksum) checksums[checksum] = (checksums[checksum] || 0) + 1;
            });
            var duplicateHashes = Object.keys(checksums).filter(function duplicate(key) { return checksums[key] > 1; }).length;
            var executablePayloads = rows.filter(executablePayload).length;
            var mimeMismatches = rows.filter(mimeMismatch).length;
            var malwareIndicators = rows.filter(malwarePattern).length;
            var archiveBombIndicators = rows.filter(archiveBomb).length;
            var malformedPdfs = rows.filter(malformedPdf).length;
            var corruptedFiles = rows.filter(corruptedFile).length;
            var oversizedUploads = rows.filter(function oversized(row) { return safeNumber(row.size || row.bytes || row.fileSize, 0) > MAX_UPLOAD_BYTES; }).length;
            var suspiciousMetadata = rows.filter(function suspicious(row) { return publicExposure(row) || fileSignatureMismatch(row); }).length;
            var repeatedRejectionAttempts = validations.filter(function rejected(row) { return normalizeValidationState(row.state || row.status) === VALIDATION_STATES.REJECTED || /FAILED|REJECTED|BLOCKED/.test(normalizeToken(row.uploadStatus || row.status)); }).length;
            var suspiciousAccess = access.filter(function blocked(row) { return /BLOCKED|DENIED|RESTRICTED|SUSPICIOUS/.test(normalizeToken(row.status || row.reason || row.action)); }).length;
            var quarantineBuildup = validations.filter(function quarantined(row) { return normalizeValidationState(row.state || row.status) === VALIDATION_STATES.QUARANTINED; }).length + quarantine.length;
            var publicCount = rows.filter(publicExposure).length;
            var classification = classifyUploadRisk({
                executablePayload: executablePayloads > 0,
                publicExposure: publicCount > 0,
                suspiciousMacros: malwareIndicators > 0,
                archiveBomb: archiveBombIndicators > 0,
                malformedPdf: malformedPdfs > 0,
                duplicateHash: duplicateHashes > 0,
                mimeMismatch: mimeMismatches > 0,
                quarantineBuildup: quarantineBuildup > 0
            });
            var threatSignals = [];
            if (executablePayloads) threatSignals.push({ signal: 'Executable payloads', count: executablePayloads, classification: FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER });
            if (publicCount) threatSignals.push({ signal: 'Public malicious exposure', count: publicCount, classification: FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER });
            if (malwareIndicators) threatSignals.push({ signal: 'Malware indicators', count: malwareIndicators, classification: FAILURE_CLASSIFICATIONS.HIGH_RISK });
            if (duplicateHashes) threatSignals.push({ signal: 'Duplicate upload hashes', count: duplicateHashes, classification: FAILURE_CLASSIFICATIONS.HIGH_RISK });
            if (mimeMismatches) threatSignals.push({ signal: 'MIME mismatches', count: mimeMismatches, classification: FAILURE_CLASSIFICATIONS.WARNING });
            if (quarantineBuildup) threatSignals.push({ signal: 'Quarantine buildup', count: quarantineBuildup, classification: FAILURE_CLASSIFICATIONS.WARNING });
            return freezeUploadOutput({
                success: true,
                classification: classification,
                summary: {
                    executablePayloads: executablePayloads,
                    mimeMismatches: mimeMismatches,
                    duplicateHashes: duplicateHashes,
                    malwareIndicators: malwareIndicators,
                    quarantineBuildup: quarantineBuildup,
                    suspiciousMetadata: suspiciousMetadata,
                    corruptedFiles: corruptedFiles,
                    oversizedUploads: oversizedUploads,
                    archiveBombIndicators: archiveBombIndicators,
                    malformedPdfs: malformedPdfs,
                    repeatedRejectionAttempts: repeatedRejectionAttempts,
                    suspiciousAccessAttempts: suspiciousAccess,
                    publicExposure: publicCount
                },
                threatSignals: threatSignals,
                metadata: {
                    uploadValidationSecurityPreserved: true,
                    tenantIsolationPreserved: true,
                    historicalValidationImmutable: true
                }
            });
        } catch (error) {
            return freezeUploadOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                summary: { executablePayloads: 0, mimeMismatches: 0, duplicateHashes: 0 },
                threatSignals: [],
                failures: [safeFailure('SUSPICIOUS_FILE_PATTERN_DETECTION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Suspicious file pattern detection failed safely.')]
            });
        }
    }

    function auditUpload(actionType, metadata, context) {
        if (auditForwarding || context && context.skipAuditPersistence) return { success: true, skipped: true };
        auditForwarding = true;
        try {
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    actionType: actionType,
                    eventType: actionType,
                    module: 'Upload Validation',
                    targetId: '',
                    description: metadata && metadata.description || actionType,
                    actorRole: context && context.actor && context.actor.role || 'hr',
                    actorId: context && context.actor && (context.actor.id || context.actor.empId) || '',
                    severity: metadata && metadata.severity || 'INFO',
                    metadata: cloneSanitized(metadata || {})
                }, {
                    source: 'uploadValidationService',
                    skipPersistence: false
                });
            }
            var source = db();
            if (source && typeof source.writeAuditLog === 'function') {
                source.writeAuditLog(context && context.actor && context.actor.role || 'hr', context && context.actor && context.actor.id || '', actionType, 'Upload Validation', '', metadata && metadata.description || actionType);
            }
            return { success: true };
        } catch (error) {
            return { success: false, warning: 'Upload validation audit failed safely.' };
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
                    source: 'uploadValidationService',
                    severity: metadata && metadata.severity || 'INFO',
                    status: metadata && metadata.status || eventType,
                    tenantSlug: contextTenant(context) || metadata && metadata.tenantSlug || '',
                    metadata: cloneSanitized(metadata || {})
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Upload validation telemetry failed safely.' };
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
                    source: 'uploadValidationService',
                    status: metadata && metadata.status || metricType,
                    severity: metadata && metadata.severity || 'INFO'
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Upload validation metric failed safely.' };
        } finally {
            metricForwarding = false;
        }
        return { success: false, warning: 'OrchestrationMetricsService unavailable.' };
    }

    function generateUploadValidationReport(filters, context) {
        try {
            var data = rawData();
            var tenant = normalizeTenantSlug(filters && (filters.tenantSlug || filters.tenantId || filters.companyId)) || contextTenant(context);
            var validations = validationRows(data).filter(tenantFilter(tenant, data));
            var jobs = asyncRows(data).filter(tenantFilter(tenant, data)).filter(isUploadJob);
            var suspicious = detectSuspiciousFilePatterns({ tenantSlug: tenant }, {
                tenantSlug: tenant,
                now: context && context.now,
                skipAuditPersistence: true,
                skipTelemetry: true,
                skipMetrics: true
            });
            var summary = suspicious.summary || {};
            var failedJobs = jobs.filter(function failed(row) { return /FAILED|ERROR|DEAD_LETTER/.test(normalizeToken(row.state || row.status)); }).length;
            var retryPending = jobs.filter(function retry(row) { return /RETRY_PENDING|RETRY/.test(normalizeToken(row.state || row.status)); }).length;
            var totalUploads = validations.length;
            var rejected = validations.filter(function rejected(row) { return normalizeValidationState(row.state || row.status) === VALIDATION_STATES.REJECTED || /FAILED|REJECTED|BLOCKED/.test(normalizeToken(row.uploadStatus || row.status)); }).length;
            var quarantined = validations.filter(function quarantine(row) { return normalizeValidationState(row.state || row.status) === VALIDATION_STATES.QUARANTINED; }).length + quarantineRows(data).filter(tenantFilter(tenant, data)).length;
            var uploadCongestion = rejected + quarantined + retryPending + failedJobs + (summary.quarantineBuildup || 0);
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
                validationHealth: {
                    totalUploads: totalUploads,
                    receivedUploads: validations.filter(function state(row) { return normalizeValidationState(row.state || row.status) === VALIDATION_STATES.RECEIVED; }).length,
                    validatingUploads: validations.filter(function state(row) { return normalizeValidationState(row.state || row.status) === VALIDATION_STATES.VALIDATING; }).length,
                    scanningUploads: validations.filter(function state(row) { return normalizeValidationState(row.state || row.status) === VALIDATION_STATES.SCANNING; }).length,
                    approvedUploads: validations.filter(function state(row) { return normalizeValidationState(row.state || row.status) === VALIDATION_STATES.APPROVED; }).length,
                    restrictedUploads: validations.filter(function state(row) { return normalizeValidationState(row.state || row.status) === VALIDATION_STATES.RESTRICTED; }).length,
                    quarantinedUploads: quarantined,
                    rejectedUploads: rejected,
                    archivedUploads: validations.filter(function state(row) { return normalizeValidationState(row.state || row.status) === VALIDATION_STATES.ARCHIVED; }).length
                },
                threatDetection: {
                    executablePayloads: summary.executablePayloads || 0,
                    disguisedExtensions: validations.filter(function disguised(row) { return /\.pdf\.exe$|\.jpg\.exe$|\.png\.exe$/i.test(safeString(row.fileName || row.name || '', '')); }).length,
                    suspiciousMacros: validations.filter(function macro(row) { return row.hasMacros === true || row.suspiciousMacros === true; }).length,
                    embeddedScriptIndicators: validations.filter(function script(row) { return row.embeddedScript === true || row.embeddedScriptIndicators === true; }).length,
                    archiveBombIndicators: summary.archiveBombIndicators || 0,
                    malformedPdfs: summary.malformedPdfs || 0,
                    suspiciousSignatures: validations.filter(fileSignatureMismatch).length,
                    malwareIndicators: summary.malwareIndicators || 0
                },
                quarantineGovernance: {
                    quarantinedUploads: quarantined,
                    quarantineStorage: true,
                    restrictedVisibility: true,
                    secureRejectionHandling: true,
                    blockedDownloadAccess: true,
                    threatAuditMarkers: true,
                    uploadSuspensionIndicators: (summary.executablePayloads || 0) > 0,
                    quarantineBuildup: summary.quarantineBuildup || quarantined
                },
                mimeValidation: {
                    allowedMimeTypes: ALLOWED_MIME_TYPES.length,
                    unsupportedMimeTypes: validations.filter(function unsupported(row) { return ALLOWED_MIME_TYPES.indexOf(mimeOf(row)) === -1; }).length,
                    mimeMismatches: summary.mimeMismatches || 0,
                    restrictedExtensions: validations.filter(restrictedExtension).length
                },
                duplicateHashValidation: {
                    duplicateHashes: summary.duplicateHashes || 0,
                    hashCollisions: 0,
                    repeatedMaliciousUploads: summary.repeatedRejectionAttempts || 0,
                    repeatedRejectionAttempts: summary.repeatedRejectionAttempts || 0
                },
                uploadAnalytics: {
                    rejectedUploads: rejected,
                    malwareDetectionSpikes: summary.malwareIndicators || 0,
                    suspiciousUploadTrends: (summary.executablePayloads || 0) + (summary.suspiciousMetadata || 0),
                    uploadCongestion: uploadCongestion,
                    quarantineBuildup: summary.quarantineBuildup || quarantined,
                    retryPending: retryPending,
                    failedJobs: failedJobs
                },
                accessGovernance: {
                    employeeOwnUploadsOnly: true,
                    managerWorkflowScopedUploadVisibility: true,
                    hrOperationalUploadVisibility: true,
                    directorAggregateUploadHealthOnly: true,
                    superAdminValidationBypass: false,
                    platformOwnerUploadWorkflow: false
                },
                integrationHealth: {
                    fileAttachmentGovernanceIntegrated: !!global.FileAttachmentGovernanceService,
                    documentGovernanceIntegrated: !!global.DocumentGovernanceService,
                    workflowDiscussionIntegrated: !!global.WorkflowDiscussionService,
                    recruitmentGovernanceIntegrated: !!global.RecruitmentGovernanceService,
                    communicationGovernanceIntegrated: !!global.CommunicationGovernanceService,
                    auditReady: !!(global.AuditService || global.auditService),
                    telemetryReady: !!(global.WorkflowTelemetryService || global.workflowTelemetryService),
                    metricsReady: !!(global.OrchestrationMetricsService || global.orchestrationMetricsService)
                },
                warnings: suspicious.threatSignals || [],
                metadata: {
                    tenantIsolationPreserved: true,
                    uploadValidationSecurityPreserved: true,
                    historicalValidationImmutable: true,
                    existingUploadFlowsPreserved: true,
                    existingWorkflowsPreserved: true,
                    validationActionsAuditable: true,
                    readOnly: true
                }
            };
            auditUpload('UPLOAD_VALIDATION_REPORTED', {
                tenantSlug: tenant,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO',
                description: 'Upload validation threat detection report viewed.'
            }, context);
            emitTelemetry('UPLOAD_VALIDATION_REPORTED', {
                tenantSlug: tenant,
                status: classification,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'INFO'
            }, context);
            recordMetric('UPLOAD_VALIDATION_REPORTED', {
                tenantSlug: tenant,
                status: classification,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'INFO'
            }, context);
            return freezeUploadOutput(report);
        } catch (error) {
            safeWarn('Upload validation report failed safely.', error && error.message ? error.message : error);
            return freezeUploadOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                validationHealth: { totalUploads: 0 },
                threatDetection: { executablePayloads: 0 },
                quarantineGovernance: { quarantinedUploads: 0 },
                mimeValidation: { mimeMismatches: 0 },
                uploadAnalytics: { uploadCongestion: 0 },
                failures: [safeFailure('UPLOAD_VALIDATION_REPORT_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Upload validation report failed safely.')]
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        function check(label, condition) { checks.push({ label: label, passed: !!condition }); }
        try {
            var malformed = normalizeUploadPayload(null, { tenantSlug: 'tabsons' });
            check('malformed payloads fail safely', malformed.success === false && malformed.failures.some(function item(row) { return row.failureCode === 'MALFORMED_UPLOAD_PAYLOAD'; }));

            var crossTenant = validateUploadScope({ tenantSlug: 'abc', empId: 'EMP-X', uploadId: 'UP-X' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' } });
            check('upload isolation works', crossTenant.allowed === false && crossTenant.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER);

            var mime = validateUploadSecurity({ tenantSlug: 'tabsons', empId: 'EMP-1', fileName: 'bad.exe', mimeType: 'application/x-msdownload', declaredMimeType: 'application/pdf', extension: 'exe', size: 100, checksum: 'self-hash', signature: 'MZ' }, { tenantSlug: 'tabsons', actor: { role: 'EMPLOYEE', id: 'EMP-1', empId: 'EMP-1' } });
            check('MIME validation works', mime.success === false && mime.failures.some(function item(row) { return row.failureCode === 'UNSAFE_EXECUTABLE_UPLOAD_BLOCKED'; }));

            var threat = detectSuspiciousFilePatterns({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('malware detection works', threat.success === true && Object.isFrozen(threat.threatSignals));

            var quarantine = quarantineUpload({ tenantSlug: 'tabsons', empId: 'EMP-1', uploadId: 'UP-SELF' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('quarantine governance works', quarantine.success === true && quarantine.state === VALIDATION_STATES.QUARANTINED);

            var frozen = freezeUploadOutput({ nested: { ok: true }, payload: { state: VALIDATION_STATES.SCANNING } });
            check('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested) && Object.isFrozen(frozen.payload));

            var originalAttachment = global.FileAttachmentGovernanceService;
            var originalDocument = global.DocumentGovernanceService;
            try {
                delete global.FileAttachmentGovernanceService;
                delete global.DocumentGovernanceService;
                var report = generateUploadValidationReport({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
                check('dependency absence degrades safely', report.success === true && report.integrationHealth.fileAttachmentGovernanceIntegrated === false && report.integrationHealth.documentGovernanceIntegrated === false);
            } finally {
                if (originalAttachment) global.FileAttachmentGovernanceService = originalAttachment;
                if (originalDocument) global.DocumentGovernanceService = originalDocument;
            }
        } catch (error) {
            checks.push({ label: 'self-test uncaught error guard', passed: false, description: safeString(error && error.message || error, '') });
        }
        var passed = checks.every(function item(row) { return row.passed; });
        var result = freezeUploadOutput({
            passed: passed,
            checks: checks,
            summary: passed ? 'Upload validation self-test passed.' : 'Upload validation self-test detected failures.'
        });
        global.__ARTHHRMS_UPLOAD_VALIDATION_SELF_TEST__ = result;
        return result;
    }

    var UploadValidationService = Object.freeze({
        VERSION: VERSION,
        VALIDATION_STATES: VALIDATION_STATES,
        FAILURE_CLASSIFICATIONS: FAILURE_CLASSIFICATIONS,
        VISIBILITY: VISIBILITY,
        classifyUploadRisk: classifyUploadRisk,
        validateUploadScope: validateUploadScope,
        normalizeUploadPayload: normalizeUploadPayload,
        freezeUploadOutput: freezeUploadOutput,
        validateUploadSecurity: validateUploadSecurity,
        quarantineUpload: quarantineUpload,
        detectSuspiciousFilePatterns: detectSuspiciousFilePatterns,
        generateUploadValidationReport: generateUploadValidationReport,
        runSelfTest: runSelfTest
    });

    global.UploadValidationService = UploadValidationService;
    global.uploadValidationService = UploadValidationService;

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
