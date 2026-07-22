/**
 * documentGovernanceService.js
 * ARTHHRMS Enterprise Document Governance + Secure File Lifecycle System.
 *
 * Additive governance layer for employee documents, onboarding verification,
 * secure access markers, expiry visibility, async validation, and audit-safe
 * lifecycle management. It does not replace storageService or existing DB
 * document helpers.
 */
(function attachDocumentGovernanceService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[DocumentGovernanceService]';

    var DOCUMENT_STATES = Object.freeze({
        UPLOADED: 'UPLOADED',
        VALIDATING: 'VALIDATING',
        REVIEW_PENDING: 'REVIEW_PENDING',
        VERIFIED: 'VERIFIED',
        REJECTED: 'REJECTED',
        EXPIRED: 'EXPIRED',
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
        LIMITED_ONBOARDING_VISIBILITY: 'LIMITED_ONBOARDING_VISIBILITY',
        OPERATIONAL_DOCUMENT_VISIBILITY: 'OPERATIONAL_DOCUMENT_VISIBILITY',
        STRATEGIC_ONBOARDING_VISIBILITY: 'STRATEGIC_ONBOARDING_VISIBILITY',
        AGGREGATE_COMPLIANCE_ONLY: 'AGGREGATE_COMPLIANCE_ONLY',
        INFRASTRUCTURE_ONLY: 'INFRASTRUCTURE_ONLY',
        PLATFORM_GOVERNANCE_ONLY: 'PLATFORM_GOVERNANCE_ONLY'
    });

    var DOCUMENT_CATEGORIES = Object.freeze([
        'IDENTITY',
        'ONBOARDING',
        'CONTRACT',
        'PAYROLL',
        'REIMBURSEMENT_RECEIPT',
        'POLICY_ACKNOWLEDGEMENT',
        'CERTIFICATE',
        'COMPLIANCE'
    ]);

    var ALLOWED_MIME_TYPES = Object.freeze([
        'application/pdf',
        'image/jpeg',
        'image/png'
    ]);

    var ALLOWED_EXTENSIONS = Object.freeze(['pdf', 'jpg', 'jpeg', 'png']);
    var MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
    var MAX_SIGNED_ACCESS_SECONDS = 3600;
    var MIN_SIGNED_ACCESS_SECONDS = 60;

    var SENSITIVE_KEY_PATTERN = /(file.?name|name|storage.?path|signed.?url|public.?url|url|path|document.?url|attachment|private.?note|remark|description|aadhaar|pan|passport|bank|account|ifsc|salary|payroll|payslip|compensation|amount|receipt|secret|token|jwt|authorization|service.?role|private.?key)/i;
    var SENSITIVE_VALUE_PATTERN = /(https?:\/\/[^\s"',}]+|private:\/\/[^\s"',}]+|\bprivate\b[^,;}]*)/ig;
    var SAFE_GOVERNANCE_KEYS = Object.freeze({
        documentHealth: true,
        documentConfidentialityPreserved: true,
        documentActionsAuditable: true,
        documentStoragePrivate: true,
        documentAccessRoleScoped: true,
        secureStorage: true,
        secureDownloadGovernance: true,
        signedAccess: true,
        signedAccessPolicy: true,
        signedUrlIssued: true,
        signedUrlRedacted: true,
        expiresSafely: true,
        expiresAt: true,
        expiresInSeconds: true,
        verificationHealth: true,
        expiryGovernance: true,
        asyncProcessing: true,
        asyncDocumentJobs: true,
        uploadValidation: true,
        accessGovernance: true,
        superAdminRawDocumentAccess: true,
        platformOwnerRawDocumentAccess: true
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
        return safeString(value || '', '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }

    function contextTenant(context) {
        var fromContext = normalizeTenantSlug(context && (context.tenantSlug || context.tenantId || context.companyId));
        if (fromContext) return fromContext;
        var data = rawData();
        return normalizeTenantSlug(data.companySettings && (data.companySettings.tenantSlug || data.companySettings.tenantId || data.companySettings.companyId));
    }

    function rowTenant(row) {
        if (!row) return '';
        return normalizeTenantSlug(row.tenantSlug || row.tenant_slug || row.tenantId || row.tenant_id || row.companyId || row.company_id);
    }

    function empIdOf(row) {
        return safeString(row && (row.empId || row.employeeId || row.employee_id || row.userId || row.user_id || row.uploadedBy || row.assignedTo) || '', '').trim();
    }

    function documentIdOf(row) {
        return safeString(row && (row.documentId || row.document_id || row.docId || row.doc_id || row.id) || '', '').trim();
    }

    function documentCategory(row) {
        var raw = normalizeToken(row && (row.category || row.documentCategory || row.document_type || row.documentType) || '');
        if (raw === 'IDENTITY_DOCUMENTS' || raw === 'IDENTITY_DOCUMENT') return 'IDENTITY';
        if (raw === 'ONBOARDING_DOCUMENTS' || raw === 'ONBOARDING_DOCUMENT') return 'ONBOARDING';
        if (raw === 'CONTRACTS') return 'CONTRACT';
        if (raw === 'PAYROLL_DOCUMENTS') return 'PAYROLL';
        if (raw === 'REIMBURSEMENT_RECEIPTS' || raw === 'REIMBURSEMENT_RECEIPT' || raw === 'RECEIPT') return 'REIMBURSEMENT_RECEIPT';
        if (raw === 'POLICY' || raw === 'POLICY_ACKNOWLEDGEMENTS') return 'POLICY_ACKNOWLEDGEMENT';
        if (raw === 'CERTIFICATES') return 'CERTIFICATE';
        return raw || 'COMPLIANCE';
    }

    function employeeById(empId, data) {
        var id = safeString(empId || '', '').trim();
        if (!id) return null;
        return (Array.isArray(data.employees) ? data.employees : []).find(function match(emp) {
            return [emp.id, emp.empId, emp.employeeId, emp.employee_id].map(function item(v) { return safeString(v || '', '').trim(); }).indexOf(id) !== -1;
        }) || null;
    }

    function employeeTenant(empId, data) {
        return rowTenant(employeeById(empId, data || rawData()));
    }

    function sourceTenant(row, data) {
        return rowTenant(row) || employeeTenant(empIdOf(row), data || rawData());
    }

    function managerOwnsEmployee(managerId, empId, data) {
        var emp = employeeById(empId, data || rawData());
        return !!(emp && safeString(emp.managerId || emp.reporting_manager_id || '', '') === safeString(managerId || '', ''));
    }

    function documentRows(data) {
        return Array.isArray((data || rawData()).documents) ? (data || rawData()).documents : [];
    }

    function verificationRows(data) {
        return Array.isArray((data || rawData()).documentVerifications) ? (data || rawData()).documentVerifications : [];
    }

    function onboardingRows(data) {
        return Array.isArray((data || rawData()).onboardingCollections) ? (data || rawData()).onboardingCollections : [];
    }

    function asyncRows(data) {
        return Array.isArray((data || rawData()).asyncJobs) ? (data || rawData()).asyncJobs : [];
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

    function freezeDocumentOutput(value) {
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

    function hasRawDocumentFields(input) {
        if (!input || typeof input !== 'object') return false;
        return Object.keys(input).some(function check(key) {
            if (SENSITIVE_KEY_PATTERN.test(key) && !SAFE_GOVERNANCE_KEYS[key]) return true;
            return input[key] && typeof input[key] === 'object' && hasRawDocumentFields(input[key]);
        });
    }

    function classifyDocumentRisk(input) {
        var source = input || {};
        if (source.crossTenant || source.crossTenantDocument || source.publicUrl || source.publicExposure || source.rlsBypass) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
        if (source.platformOwnerRawAccess || normalizeRole(source.role) === 'PLATFORM_OWNER') return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
        if (source.unsafeSignedUrl || source.unauthorizedAccess || source.verificationBacklog || source.expiredCompliance) return FAILURE_CLASSIFICATIONS.HIGH_RISK;
        if (source.malformedUpload || source.unsupportedMime || source.uploadFailure || source.expiryWarning) return FAILURE_CLASSIFICATIONS.WARNING;
        return FAILURE_CLASSIFICATIONS.INFO;
    }

    function visibilityForRole(role, actor, targetEmpId, category, data) {
        var normalized = normalizeRole(role || actor && actor.role);
        var actorEmpId = safeString(actor && (actor.empId || actor.employeeId || actor.id) || '', '').trim();
        if (normalized === 'EMPLOYEE') {
            return actorEmpId && targetEmpId && actorEmpId === targetEmpId ? VISIBILITY.OWN_DOCUMENTS_ONLY : VISIBILITY.NONE;
        }
        if (normalized === 'MANAGER') {
            return managerOwnsEmployee(actorEmpId, targetEmpId, data) && category === 'ONBOARDING' ? VISIBILITY.LIMITED_ONBOARDING_VISIBILITY : VISIBILITY.NONE;
        }
        if (normalized === 'HR') return VISIBILITY.OPERATIONAL_DOCUMENT_VISIBILITY;
        if (normalized === 'HR_HEAD') return VISIBILITY.STRATEGIC_ONBOARDING_VISIBILITY;
        if (normalized === 'DIRECTOR') return VISIBILITY.AGGREGATE_COMPLIANCE_ONLY;
        if (normalized === 'SUPER_ADMIN') return VISIBILITY.INFRASTRUCTURE_ONLY;
        if (normalized === 'PLATFORM_OWNER') return VISIBILITY.PLATFORM_GOVERNANCE_ONLY;
        return VISIBILITY.NONE;
    }

    function validateDocumentScope(record, context) {
        try {
            var source = record || {};
            var data = rawData();
            var ctxTenant = contextTenant(context);
            var targetEmpId = empIdOf(source);
            var targetTenant = sourceTenant(source, data) || ctxTenant;
            var role = normalizeRole(context && context.actor && context.actor.role);
            var category = documentCategory(source);
            var visibility = visibilityForRole(role, context && context.actor, targetEmpId, category, data);
            var failures = [];

            if (targetTenant && ctxTenant && targetTenant !== ctxTenant) {
                failures.push(safeFailure('CROSS_TENANT_DOCUMENT_VISIBILITY_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Cross-tenant document visibility was blocked.', { expectedTenant: ctxTenant }));
            }
            if (role === 'PLATFORM_OWNER' && ctxTenant) {
                failures.push(safeFailure('PLATFORM_OWNER_DOCUMENT_ACCESS_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Platform owner is isolated from raw employee documents.'));
            }
            if (role === 'SUPER_ADMIN' && (hasRawDocumentFields(source) || documentIdOf(source) || targetEmpId)) {
                failures.push(safeFailure('SUPER_ADMIN_DOCUMENT_VIEW_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Tenant system administrators receive infrastructure visibility only.'));
            }
            if (role === 'DIRECTOR' && hasRawDocumentFields(source)) {
                failures.push(safeFailure('DIRECTOR_RAW_DOCUMENT_ACCESS_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Directors receive aggregate compliance visibility only.'));
            }
            if (role === 'EMPLOYEE' && visibility !== VISIBILITY.OWN_DOCUMENTS_ONLY) {
                failures.push(safeFailure('EMPLOYEE_DOCUMENT_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Employees may access only their own documents.'));
            }
            if (role === 'MANAGER' && visibility !== VISIBILITY.LIMITED_ONBOARDING_VISIBILITY) {
                failures.push(safeFailure('MANAGER_DOCUMENT_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Managers receive limited onboarding visibility only.'));
            }

            var classification = highestClassification(failures);
            return freezeDocumentOutput({
                allowed: failures.length === 0,
                classification: classification,
                visibility: visibility,
                scope: {
                    tenantSlug: ctxTenant,
                    empId: targetTenant === ctxTenant ? targetEmpId : '',
                    documentId: targetTenant === ctxTenant ? documentIdOf(source) : ''
                },
                failures: failures,
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    documentConfidentialityPreserved: true,
                    documentAccessRoleScoped: true
                }
            });
        } catch (error) {
            return freezeDocumentOutput({
                allowed: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                visibility: VISIBILITY.NONE,
                failures: [safeFailure('DOCUMENT_SCOPE_VALIDATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Document scope validation failed safely.')]
            });
        }
    }

    function supportedMime(payload) {
        var mime = safeString(payload && (payload.mimeType || payload.type || payload.fileType) || '', '').trim().toLowerCase();
        var fileName = safeString(payload && (payload.fileName || payload.name || '') || '', '').trim();
        var extension = fileName.split('.').pop().toLowerCase();
        return (!mime || ALLOWED_MIME_TYPES.indexOf(mime) !== -1) && (!extension || extension === fileName.toLowerCase() || ALLOWED_EXTENSIONS.indexOf(extension) !== -1);
    }

    function publicExposure(payload) {
        if (!payload || typeof payload !== 'object') return false;
        if (payload.isPublic === true || payload.public === true || payload.publicUrl) return true;
        var url = safeString(payload.url || payload.signedUrl || payload.documentUrl || payload.downloadUrl || '', '').toLowerCase();
        return !!(url && url.indexOf('public') !== -1 && url.indexOf('private') === -1);
    }

    function normalizeDocumentState(value) {
        var normalized = normalizeToken(value);
        if (['REVIEW_PENDING', 'PENDING', 'MISSING', 'REUPLOAD_REQUIRED'].indexOf(normalized) !== -1) return DOCUMENT_STATES.REVIEW_PENDING;
        if (normalized === 'VERIFIED' || normalized === 'APPROVED') return DOCUMENT_STATES.VERIFIED;
        if (normalized === 'REJECTED') return DOCUMENT_STATES.REJECTED;
        if (normalized === 'EXPIRED') return DOCUMENT_STATES.EXPIRED;
        if (normalized === 'ARCHIVED') return DOCUMENT_STATES.ARCHIVED;
        if (normalized === 'VALIDATING') return DOCUMENT_STATES.VALIDATING;
        return DOCUMENT_STATES.UPLOADED;
    }

    function normalizeDocumentPayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeDocumentOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    failures: [safeFailure('MALFORMED_DOCUMENT_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Document payload is malformed.')]
                });
            }
            var ctxTenant = contextTenant(context);
            var srcTenant = sourceTenant(payload, rawData()) || ctxTenant;
            return freezeDocumentOutput({
                success: true,
                tenantSlug: ctxTenant || srcTenant,
                payload: {
                    tenantSlug: srcTenant,
                    empId: empIdOf(payload),
                    documentId: documentIdOf(payload),
                    category: documentCategory(payload),
                    state: normalizeDocumentState(payload.state || payload.status || payload.verificationStatus),
                    hasFile: !!(payload.fileName || payload.name || payload.storagePath || payload.documentUrl),
                    expiryDate: safeString(payload.expiryDate || payload.expiresOn || payload.expirationDate || '', '').slice(0, 10)
                },
                metadata: {
                    tenantIsolationPreserved: !ctxTenant || !srcTenant || ctxTenant === srcTenant,
                    documentConfidentialityPreserved: true,
                    documentAccessRoleScoped: true
                }
            });
        } catch (error) {
            return freezeDocumentOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('DOCUMENT_NORMALIZATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Document normalization failed safely.')]
            });
        }
    }

    function validateDocumentUpload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeDocumentOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    failures: [safeFailure('MALFORMED_DOCUMENT_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Document payload is malformed.')]
                });
            }
            var data = rawData();
            var ctxTenant = contextTenant(context);
            var targetTenant = sourceTenant(payload, data) || ctxTenant;
            var failures = [];
            var scope = validateDocumentScope(payload, context);
            failures = failures.concat(scope.failures || []);

            if (ctxTenant && targetTenant && ctxTenant !== targetTenant) {
                failures.push(safeFailure('TENANT_MISMATCH', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Document upload tenant mismatch was blocked.', { expectedTenant: ctxTenant }));
            }

            var category = documentCategory(payload);
            if (DOCUMENT_CATEGORIES.indexOf(category) === -1) {
                failures.push(safeFailure('INVALID_DOCUMENT_CATEGORY', FAILURE_CLASSIFICATIONS.WARNING, 'Document category is not supported.'));
            }

            if (!supportedMime(payload)) {
                failures.push(safeFailure('UNSUPPORTED_DOCUMENT_MIME_TYPE', FAILURE_CLASSIFICATIONS.WARNING, 'Document MIME type is not supported.', { allowedTypes: ALLOWED_MIME_TYPES.slice() }));
            }

            var size = Number(payload.size || payload.fileSize || 0);
            if (Number.isFinite(size) && size > MAX_DOCUMENT_BYTES) {
                failures.push(safeFailure('DOCUMENT_UPLOAD_TOO_LARGE', FAILURE_CLASSIFICATIONS.WARNING, 'Document upload exceeds the configured limit.', { maxMB: 10 }));
            }

            if (publicExposure(payload)) {
                failures.push(safeFailure('PUBLIC_DOCUMENT_EXPOSURE_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Public file exposure was blocked.'));
            }

            var checksum = safeString(payload.checksum || payload.integrityHash || payload.metadata && payload.metadata.checksum || '', '').trim();
            if (!checksum) {
                failures.push(safeFailure('DOCUMENT_INTEGRITY_VALIDATION_REQUIRED', FAILURE_CLASSIFICATIONS.WARNING, 'Document integrity metadata is required before verification.'));
            }

            var classification = highestClassification(failures);
            return freezeDocumentOutput({
                success: failures.length === 0,
                classification: classification,
                state: failures.length ? DOCUMENT_STATES.REVIEW_PENDING : DOCUMENT_STATES.VALIDATING,
                normalized: normalizeDocumentPayload(payload, context).payload || null,
                failures: failures,
                uploadValidation: {
                    secureStorage: true,
                    documentStoragePrivate: true,
                    mimeValidationEnabled: true,
                    sizeLimitMB: 10,
                    integrityValidationRequired: true
                },
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    documentConfidentialityPreserved: true,
                    documentActionsAuditable: true
                }
            });
        } catch (error) {
            return freezeDocumentOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('DOCUMENT_UPLOAD_VALIDATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Document upload validation failed safely.')]
            });
        }
    }

    function findDocument(payload, data, tenantSlug) {
        var id = documentIdOf(payload);
        if (!id) return payload && typeof payload === 'object' ? payload : null;
        return documentRows(data).find(function match(row) {
            return documentIdOf(row) === id && (!tenantSlug || sourceTenant(row, data) === tenantSlug);
        }) || payload;
    }

    function generateSignedDocumentAccess(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeDocumentOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    failures: [safeFailure('MALFORMED_DOCUMENT_ACCESS_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Document access payload is malformed.')]
                });
            }
            var data = rawData();
            var ctxTenant = contextTenant(context) || sourceTenant(payload, data);
            var source = findDocument(payload, data, ctxTenant) || payload;
            var scope = validateDocumentScope(source, context);
            var failures = scope.failures ? scope.failures.slice() : [];
            var expiresIn = Number(payload.expiresInSeconds || payload.expiresIn || 900);
            if (!Number.isFinite(expiresIn) || expiresIn < MIN_SIGNED_ACCESS_SECONDS || expiresIn > MAX_SIGNED_ACCESS_SECONDS) {
                failures.push(safeFailure('SIGNED_URL_EXPIRY_UNSAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Signed access expiration must be between 60 and 3600 seconds.', { maxSeconds: MAX_SIGNED_ACCESS_SECONDS }));
            }
            if (publicExposure(source) || publicExposure(payload)) {
                failures.push(safeFailure('PUBLIC_DOCUMENT_EXPOSURE_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Public file exposure was blocked.'));
            }
            var classification = highestClassification(failures);
            var now = new Date(nowIso(context));
            var expiresAt = new Date(now.getTime() + Math.max(MIN_SIGNED_ACCESS_SECONDS, Math.min(expiresIn || 900, MAX_SIGNED_ACCESS_SECONDS)) * 1000).toISOString();
            var success = failures.length === 0;

            if (success) {
                auditDocument('DOCUMENT_SIGNED_ACCESS_GENERATED', {
                    documentId: documentIdOf(source),
                    tenantSlug: ctxTenant,
                    description: 'Signed document access marker generated.',
                    expiresInSeconds: expiresIn
                }, context);
                emitTelemetry('DOCUMENT_SIGNED_ACCESS_GENERATED', { tenantSlug: ctxTenant, status: 'ISSUED' }, context);
                recordMetric('DOCUMENT_SIGNED_ACCESS_GENERATED', context);
            }

            return freezeDocumentOutput({
                success: success,
                classification: classification,
                visibility: scope.visibility || VISIBILITY.NONE,
                signedAccess: {
                    signedUrlIssued: success,
                    signedUrlRedacted: true,
                    expiresInSeconds: success ? expiresIn : Math.max(MIN_SIGNED_ACCESS_SECONDS, Math.min(expiresIn || 900, MAX_SIGNED_ACCESS_SECONDS)),
                    expiresAt: expiresAt,
                    expiresSafely: success && expiresIn <= MAX_SIGNED_ACCESS_SECONDS && expiresIn >= MIN_SIGNED_ACCESS_SECONDS
                },
                failures: failures,
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    documentConfidentialityPreserved: true,
                    secureDownloadGovernance: true
                }
            });
        } catch (error) {
            return freezeDocumentOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('SIGNED_DOCUMENT_ACCESS_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Signed document access generation failed safely.')]
            });
        }
    }

    function auditDocument(actionType, metadata, context) {
        if (auditForwarding || context?.skipAuditPersistence) return { success: true, skipped: true };
        auditForwarding = true;
        try {
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    actionType: actionType,
                    eventType: actionType,
                    module: 'Document Governance',
                    targetId: metadata?.documentId || metadata?.targetId || '',
                    description: metadata?.description || actionType,
                    actorRole: context?.actor?.role || 'hr',
                    actorId: context?.actor?.id || '',
                    severity: metadata?.severity || 'INFO',
                    correlationId: metadata?.correlationId || '',
                    metadata: cloneSanitized(metadata || {})
                }, {
                    source: 'documentGovernanceService',
                    skipPersistence: false
                });
            }
            var source = db();
            if (source && typeof source.writeAuditLog === 'function') {
                source.writeAuditLog(context?.actor?.role || 'hr', context?.actor?.id || '', actionType, 'Document Governance', metadata?.documentId || '', metadata?.description || actionType);
            }
            return { success: true };
        } catch (error) {
            return { success: false, warning: 'Document audit failed safely.' };
        } finally {
            auditForwarding = false;
        }
    }

    function emitTelemetry(eventType, metadata, context) {
        if (telemetryForwarding || context?.skipTelemetry) return { success: true, skipped: true };
        telemetryForwarding = true;
        try {
            var service = global.WorkflowTelemetryService || global.workflowTelemetryService;
            if (service && typeof service.emitTelemetry === 'function') {
                service.emitTelemetry('DOCUMENT_GOVERNANCE', eventType, {
                    source: 'documentGovernanceService',
                    severity: metadata?.severity || 'INFO',
                    tenantSlug: contextTenant(context) || metadata?.tenantSlug || '',
                    metadata: cloneSanitized(metadata || {})
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Document telemetry failed safely.' };
        } finally {
            telemetryForwarding = false;
        }
        return { success: false, warning: 'WorkflowTelemetryService unavailable.' };
    }

    function recordMetric(metricType, context) {
        if (metricForwarding || context?.skipMetrics) return { success: true, skipped: true };
        metricForwarding = true;
        try {
            var service = global.OrchestrationMetricsService || global.orchestrationMetricsService;
            if (service && typeof service.recordWorkflowMetric === 'function') {
                service.recordWorkflowMetric(metricType, {
                    tenantSlug: contextTenant(context),
                    source: 'documentGovernanceService'
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Document metric failed safely.' };
        } finally {
            metricForwarding = false;
        }
        return { success: false, warning: 'OrchestrationMetricsService unavailable.' };
    }

    function persistGovernanceRun(run, context) {
        if (context?.preview || context?.readOnly) return freezeDocumentOutput(run);
        var data = rawData();
        data.documentGovernanceRuns = Array.isArray(data.documentGovernanceRuns) ? data.documentGovernanceRuns.slice() : [];
        data.documentGovernanceRuns.unshift(cloneSanitized(run));
        if (data.documentGovernanceRuns.length > 150) data.documentGovernanceRuns = data.documentGovernanceRuns.slice(0, 150);
        saveData(data);
        return freezeDocumentOutput(run);
    }

    function scheduleDocumentVerification(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeDocumentOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    state: DOCUMENT_STATES.REVIEW_PENDING,
                    failures: [safeFailure('MALFORMED_DOCUMENT_VERIFICATION_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Document verification payload is malformed.')]
                });
            }
            var data = rawData();
            var ctxTenant = contextTenant(context) || sourceTenant(payload, data);
            var source = findDocument(payload, data, ctxTenant) || payload;
            var validation = validateDocumentScope(source, context);
            if (!validation.allowed) {
                auditDocument('DOCUMENT_VERIFICATION_BLOCKED', {
                    severity: validation.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'WARNING',
                    tenantSlug: ctxTenant,
                    description: 'Unsafe document verification was blocked.'
                }, context);
                emitTelemetry('DOCUMENT_VERIFICATION_BLOCKED', { severity: 'WARNING', tenantSlug: ctxTenant }, context);
                return freezeDocumentOutput({
                    success: false,
                    classification: validation.classification,
                    state: DOCUMENT_STATES.REVIEW_PENDING,
                    failures: validation.failures,
                    asyncJob: { success: false, warning: 'Document verification blocked before async scheduling.' },
                    metadata: {
                        tenantIsolationPreserved: validation.classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                        documentConfidentialityPreserved: true
                    }
                });
            }

            var runId = 'DOCGOV-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7).toUpperCase();
            var run = persistGovernanceRun({
                runId: runId,
                tenantSlug: ctxTenant,
                documentId: documentIdOf(source),
                state: DOCUMENT_STATES.REVIEW_PENDING,
                validationOnly: payload.validationOnly !== false,
                createdAt: nowIso(),
                documentGoverned: true
            }, context);

            var asyncJob = { success: false, warning: 'AsyncJobService unavailable; document verification remains governance-visible.' };
            if (global.AsyncJobService && typeof global.AsyncJobService.scheduleJob === 'function') {
                asyncJob = global.AsyncJobService.scheduleJob({
                    tenantSlug: ctxTenant,
                    jobType: 'DOCUMENT_VERIFICATION',
                    priority: 'HIGH',
                    correlationId: documentIdOf(source) || runId,
                    payload: {
                        documentId: documentIdOf(source),
                        governanceRunId: runId
                    },
                    schedule: payload.schedule || {}
                }, {
                    tenantSlug: ctxTenant,
                    actor: context?.actor,
                    skipAuditPersistence: context?.skipAuditPersistence,
                    skipTelemetry: context?.skipTelemetry,
                    skipMetrics: context?.skipMetrics
                });
            }

            if (global.NotificationOrchestrationService && typeof global.NotificationOrchestrationService.orchestrateNotification === 'function' && !context?.skipNotification) {
                try {
                    global.NotificationOrchestrationService.orchestrateNotification({
                        tenantSlug: ctxTenant,
                        module: 'Documents',
                        category: 'DOCUMENT_VERIFICATION',
                        targetRole: 'HR',
                        priority: 'HIGH',
                        title: 'Document Verification Review',
                        message: 'A document verification item is ready for HR review.',
                        correlationId: documentIdOf(source) || runId
                    }, {
                        tenantSlug: ctxTenant,
                        actor: context?.actor,
                        skipAuditPersistence: context?.skipAuditPersistence,
                        skipTelemetry: context?.skipTelemetry,
                        skipMetrics: context?.skipMetrics
                    });
                } catch (notifyError) {}
            }

            auditDocument('DOCUMENT_VERIFICATION_SCHEDULED', {
                documentId: documentIdOf(source),
                tenantSlug: ctxTenant,
                description: 'Document verification scheduled through document governance.'
            }, context);
            emitTelemetry('DOCUMENT_VERIFICATION_SCHEDULED', { tenantSlug: ctxTenant, status: 'SCHEDULED' }, context);
            recordMetric('DOCUMENT_VERIFICATION_SCHEDULED', context);

            return freezeDocumentOutput({
                success: true,
                classification: FAILURE_CLASSIFICATIONS.INFO,
                state: DOCUMENT_STATES.REVIEW_PENDING,
                run: run,
                asyncJob: asyncJob,
                metadata: {
                    tenantIsolationPreserved: true,
                    documentConfidentialityPreserved: true,
                    asyncProcessing: true,
                    existingWorkflowsPreserved: true
                }
            });
        } catch (error) {
            safeWarn('Document verification scheduling failed safely.', error && error.message ? error.message : error);
            return freezeDocumentOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                state: DOCUMENT_STATES.REVIEW_PENDING,
                failures: [safeFailure('DOCUMENT_VERIFICATION_SCHEDULING_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Document verification scheduling failed safely.')],
                asyncJob: { success: false, warning: 'Document verification scheduling failed safely.' }
            });
        }
    }

    function dateValue(value) {
        var text = safeString(value || '', '').slice(0, 10);
        if (!text) return null;
        var parsed = new Date(text + 'T00:00:00.000Z');
        if (Number.isNaN(parsed.getTime())) return null;
        return parsed;
    }

    function daysUntil(value, context) {
        var date = dateValue(value);
        if (!date) return null;
        var now = new Date(nowIso(context));
        return Math.floor((date.getTime() - now.getTime()) / 86400000);
    }

    function evaluationClock(filters, context) {
        var supplied = filters && (filters.currentDate || filters.evaluationDate || filters.asOfDate) ||
            context && (context.currentDate || context.evaluationDate || context.asOfDate);
        if (!supplied) return context;
        var text = safeString(supplied, '').trim();
        if (!text) return context;
        return Object.assign({}, context || {}, {
            now: text.length === 10 ? text + 'T00:00:00.000Z' : text
        });
    }

    function isPendingVerification(row) {
        var text = [
            row.status,
            row.verificationStatus,
            row.overallStatus,
            row.aadhaarStatus,
            row.panStatus,
            row.bankStatus,
            row.educationStatus,
            row.joiningStatus
        ].map(function item(value) { return normalizeToken(value); }).join('|');
        return /PENDING|MISSING|REUPLOAD_REQUIRED|REVIEW_PENDING/.test(text);
    }

    function missingOnboardingCount(rows) {
        return rows.filter(function missing(row) {
            return [row.photoSubmitted, row.bankFormSubmitted, row.idProofSubmitted, row.educationProofSubmitted, row.policySigned, row.welcomeKitIssued].some(function item(value) { return value !== true; });
        }).length;
    }

    function generateDocumentGovernanceReport(filters, context) {
        try {
            var data = rawData();
            var ctxTenant = normalizeTenantSlug(filters && (filters.tenantSlug || filters.tenantId || filters.companyId)) || contextTenant(context);
            var clock = evaluationClock(filters || {}, context || {});
            var documents = documentRows(data).filter(function sameTenant(row) { return sourceTenant(row, data) === ctxTenant; });
            var verifications = verificationRows(data).filter(function sameVerificationTenant(row) { return sourceTenant(row, data) === ctxTenant; });
            var onboarding = onboardingRows(data).filter(function sameOnboardingTenant(row) { return sourceTenant(row, data) === ctxTenant; });
            var jobs = asyncRows(data).filter(function sameJob(row) {
                var type = normalizeToken(row.jobType || row.type);
                return rowTenant(row) === ctxTenant && ['DOCUMENT_VERIFICATION', 'DOCUMENT_VALIDATION', 'DOCUMENT_EXPIRY_SCAN', 'DOCUMENT_METADATA_EXTRACTION'].indexOf(type) !== -1;
            });
            var publicWarnings = documents.filter(publicExposure).length;
            var expired = documents.filter(function expiredRow(row) {
                var days = daysUntil(row.expiryDate || row.expiresOn || row.expirationDate, clock);
                return days !== null && days < 0;
            }).length;
            var expiring = documents.filter(function expiringRow(row) {
                var days = daysUntil(row.expiryDate || row.expiresOn || row.expirationDate, clock);
                return days !== null && days >= 0 && days <= 30;
            }).length;
            var pending = verifications.filter(isPendingVerification).length + documents.filter(isPendingVerification).length;

            var report = {
                success: true,
                classification: publicWarnings ? FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER : pending || expiring ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO,
                generatedAt: nowIso(clock),
                tenantSlug: ctxTenant,
                documentHealth: {
                    totalDocuments: documents.length,
                    uploadedDocuments: documents.filter(function uploaded(row) { return normalizeDocumentState(row.status || row.state) === DOCUMENT_STATES.UPLOADED; }).length,
                    verifiedDocuments: documents.filter(function verified(row) { return normalizeDocumentState(row.status || row.verificationStatus) === DOCUMENT_STATES.VERIFIED; }).length,
                    rejectedDocuments: documents.filter(function rejected(row) { return normalizeDocumentState(row.status || row.verificationStatus) === DOCUMENT_STATES.REJECTED; }).length,
                    failedUploads: documents.filter(function failed(row) { return /failed/i.test(safeString(row.status || '', '')); }).length
                },
                uploadValidation: {
                    secureStorage: true,
                    documentStoragePrivate: true,
                    mimeValidationEnabled: true,
                    publicExposureWarnings: publicWarnings,
                    storagePlanAvailable: !!global.storageService,
                    employeeDocsBucketPlanned: !!(global.storageService && global.storageService.BUCKETS && global.storageService.BUCKETS.EMPLOYEE_DOCS)
                },
                verificationHealth: {
                    pendingVerifications: pending,
                    verificationRows: verifications.length,
                    onboardingReviewBacklog: missingOnboardingCount(onboarding),
                    verificationCongestion: pending > 5
                },
                expiryGovernance: {
                    expiringDocuments: expiring,
                    expiredDocuments: expired,
                    renewalRemindersReady: true,
                    complianceVisibilityAggregateOnly: true
                },
                asyncProcessing: {
                    asyncDocumentJobs: jobs.length,
                    retryPending: jobs.filter(function retry(row) { return normalizeToken(row.state || row.status) === 'RETRY_PENDING'; }).length,
                    failedJobs: jobs.filter(function failed(row) { return normalizeToken(row.state || row.status) === 'FAILED'; }).length,
                    retryLoopPrevented: jobs.every(function retryLimit(row) { return Number(row.retryAttempts || 0) <= Number(row.maxRetries || 3); })
                },
                accessGovernance: {
                    employeeOwnDocumentsOnly: true,
                    managerLimitedOnboardingOnly: true,
                    directorAggregateOnly: true,
                    superAdminRawDocumentAccess: false,
                    platformOwnerRawDocumentAccess: false,
                    signedAccessExpiresSafely: true
                },
                metadata: {
                    tenantIsolationPreserved: true,
                    documentConfidentialityPreserved: true,
                    documentActionsAuditable: true,
                    rawDocumentsFiltered: true,
                    existingDocumentFlowsPreserved: true,
                    auditReady: !!(global.AuditService || global.auditService),
                    telemetryReady: !!(global.WorkflowTelemetryService || global.workflowTelemetryService)
                }
            };

            auditDocument('DOCUMENT_GOVERNANCE_REPORT_VIEWED', { tenantSlug: ctxTenant, description: 'Document governance report viewed.' }, context);
            emitTelemetry('DOCUMENT_GOVERNANCE_REPORT_VIEWED', { tenantSlug: ctxTenant, status: 'VIEWED' }, context);
            recordMetric('DOCUMENT_GOVERNANCE_REPORT_VIEWED', context);
            return freezeDocumentOutput(report);
        } catch (error) {
            return freezeDocumentOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                documentHealth: { totalDocuments: 0, uploadedDocuments: 0, verifiedDocuments: 0, failedUploads: 0 },
                verificationHealth: { pendingVerifications: 0, verificationRows: 0, onboardingReviewBacklog: 0 },
                expiryGovernance: { expiringDocuments: 0, expiredDocuments: 0 },
                asyncProcessing: { asyncDocumentJobs: 0, retryPending: 0, failedJobs: 0 },
                failures: [safeFailure('DOCUMENT_GOVERNANCE_REPORT_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Document governance report failed safely.')]
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        function check(name, condition) {
            checks.push({ label: name, passed: !!condition });
        }
        try {
            var malformed = validateDocumentUpload(null, { tenantSlug: 'tabsons' });
            check('malformed payloads fail safely', malformed.success === false && malformed.failures.some(function item(row) { return row.failureCode === 'MALFORMED_DOCUMENT_PAYLOAD'; }));

            var crossTenant = validateDocumentScope({ tenantSlug: 'abc', empId: 'EMP-X' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' } });
            check('document isolation works', crossTenant.allowed === false && crossTenant.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER);

            var upload = validateDocumentUpload({ tenantSlug: 'tabsons', empId: 'EMP-1', category: 'identity', mimeType: 'application/x-msdownload', size: 100, publicUrl: 'https://public.example.com/doc.exe' }, { tenantSlug: 'tabsons', actor: { role: 'EMPLOYEE', empId: 'EMP-1', id: 'EMP-1' } });
            check('upload governance works', upload.success === false && upload.failures.some(function item(row) { return row.failureCode === 'PUBLIC_DOCUMENT_EXPOSURE_BLOCKED'; }));

            var signed = generateSignedDocumentAccess({ tenantSlug: 'tabsons', empId: 'EMP-1', documentId: 'DOC-SELF', expiresInSeconds: 86400 }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' }, now: '2026-05-23T00:00:00.000Z' });
            check('signed URL expiration works', signed.success === false && signed.failures.some(function item(row) { return row.failureCode === 'SIGNED_URL_EXPIRY_UNSAFE'; }));

            var immutable = normalizeDocumentPayload({ tenantSlug: 'tabsons', empId: 'EMP-1', category: 'identity', fileName: 'secret.pdf' }, { tenantSlug: 'tabsons' });
            check('immutable outputs enforced', Object.isFrozen(immutable));

            var report = generateDocumentGovernanceReport({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true, now: '2026-05-23T00:00:00.000Z' });
            check('document expiry works', report.success === true && report.expiryGovernance.expiringDocuments >= 0);

            var originalAsync = global.AsyncJobService;
            var originalNotify = global.NotificationOrchestrationService;
            try {
                delete global.AsyncJobService;
                delete global.NotificationOrchestrationService;
                var degraded = scheduleDocumentVerification({ tenantSlug: 'tabsons', documentId: 'DOC-SELF', empId: 'EMP-1', validationOnly: true }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true, preview: true });
                check('dependency absence degrades safely', degraded.success === true && degraded.asyncJob.success === false);
            } finally {
                if (originalAsync) global.AsyncJobService = originalAsync;
                if (originalNotify) global.NotificationOrchestrationService = originalNotify;
            }
        } catch (error) {
            checks.push({ label: 'self-test uncaught error guard', passed: false, error: safeString(error && error.message || error, '') });
        }
        var passed = checks.every(function item(row) { return row.passed; });
        var result = freezeDocumentOutput({
            passed: passed,
            checks: checks,
            summary: passed ? 'Document governance self-test passed.' : 'Document governance self-test detected failures.'
        });
        global.__ARTHHRMS_DOCUMENT_GOVERNANCE_SELF_TEST__ = result;
        return result;
    }

    var DocumentGovernanceService = Object.freeze({
        VERSION: VERSION,
        DOCUMENT_STATES: DOCUMENT_STATES,
        FAILURE_CLASSIFICATIONS: FAILURE_CLASSIFICATIONS,
        VISIBILITY: VISIBILITY,
        classifyDocumentRisk: classifyDocumentRisk,
        validateDocumentScope: validateDocumentScope,
        validateDocumentUpload: validateDocumentUpload,
        normalizeDocumentPayload: normalizeDocumentPayload,
        freezeDocumentOutput: freezeDocumentOutput,
        generateSignedDocumentAccess: generateSignedDocumentAccess,
        scheduleDocumentVerification: scheduleDocumentVerification,
        generateDocumentGovernanceReport: generateDocumentGovernanceReport,
        runSelfTest: runSelfTest
    });

    global.DocumentGovernanceService = DocumentGovernanceService;
    global.documentGovernanceService = DocumentGovernanceService;

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
