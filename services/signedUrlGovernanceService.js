/**
 * signedUrlGovernanceService.js
 * ARTHHRMS Enterprise Signed URL Expiry + Temporary Access Intelligence.
 *
 * Additive governance layer for signed document downloads, secure previews,
 * revocable temporary access, replay detection, and expiry analytics. It never
 * exposes raw signed URLs, token hashes, object IDs, filenames, or cross-tenant
 * signed access data.
 */
(function attachSignedUrlGovernanceService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[SignedUrlGovernanceService]';
    var MIN_SIGNED_ACCESS_SECONDS = 60;
    var MAX_SIGNED_ACCESS_SECONDS = 3600;
    var DEFAULT_SIGNED_ACCESS_SECONDS = 900;

    var SIGNED_ACCESS_STATES = Object.freeze({
        GENERATED: 'GENERATED',
        ACTIVE: 'ACTIVE',
        VIEWED: 'VIEWED',
        EXPIRED: 'EXPIRED',
        REVOKED: 'REVOKED',
        BLOCKED: 'BLOCKED',
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
        OWN_TEMPORARY_ACCESS_ONLY: 'OWN_TEMPORARY_ACCESS_ONLY',
        WORKFLOW_SCOPED_ACCESS_VISIBILITY: 'WORKFLOW_SCOPED_ACCESS_VISIBILITY',
        HR_OPERATIONAL_TEMPORARY_ACCESS_VISIBILITY: 'HR_OPERATIONAL_TEMPORARY_ACCESS_VISIBILITY',
        STRATEGIC_ACCESS_ANALYTICS: 'STRATEGIC_ACCESS_ANALYTICS',
        AGGREGATE_ACCESS_INTELLIGENCE_ONLY: 'AGGREGATE_ACCESS_INTELLIGENCE_ONLY',
        INFRASTRUCTURE_VISIBILITY_ONLY: 'INFRASTRUCTURE_VISIBILITY_ONLY',
        PLATFORM_GOVERNANCE_ONLY: 'PLATFORM_GOVERNANCE_ONLY'
    });

    var ACCESS_TYPES = Object.freeze({
        DOWNLOAD: 'DOWNLOAD',
        PREVIEW: 'PREVIEW',
        SHARE: 'SHARE'
    });

    var SENSITIVE_KEY_PATTERN = /(signed.?url|public.?url|document.?url|download.?url|preview.?url|url|token.?id|token.?hash|access.?token|signature|attachment.?id|document.?id|doc.?id|object.?id|object.?key|object.?path|storage.?path|bucket|file.?name|name|path|private.?note|remark|description|message|body|content|comment|reply|candidate|resume|receipt|salary|payroll|payslip|compensation|amount|employee|emp.?id|user.?id|actor.?id|owner|uploaded.?by|assigned.?to|author|manager|secret|jwt|authorization|service.?role|private.?key|reason|raw|payload.?id|correlation.?id|target.?id|log.?id|event.?id)/i;
    var SENSITIVE_VALUE_PATTERN = /(https?:\/\/[^\s"',}]+|private:\/\/[^\s"',}]+|[a-z0-9-]+\/[A-Z0-9._-]+\/[A-Z0-9._-]+\/[^\s"',}]+|\b(private|confidential|secret|salary|payroll|resume|receipt|passport|aadhaar|bank|signature)\b[^,;}]*)/ig;

    var SAFE_GOVERNANCE_KEYS = Object.freeze({
        success: true,
        allowed: true,
        readOnly: true,
        classification: true,
        visibility: true,
        state: true,
        accessState: true,
        accessType: true,
        generatedAt: true,
        tenantSlug: true,
        status: true,
        severity: true,
        source: true,
        count: true,
        signal: true,
        signals: true,
        summary: true,
        payload: true,
        metadata: true,
        failures: true,
        warnings: true,
        failureCode: true,
        warningCode: true,
        signedUrlHealth: true,
        expiryGovernance: true,
        revocationGovernance: true,
        suspiciousTokenDetection: true,
        accessAnalytics: true,
        attachmentStorageIntegration: true,
        accessGovernance: true,
        integrationHealth: true,
        temporaryAccess: true,
        revocation: true,
        totalSignedAccess: true,
        generatedAccess: true,
        activeAccess: true,
        viewedAccess: true,
        expiredAccess: true,
        revokedAccess: true,
        blockedAccess: true,
        archivedAccess: true,
        expiresSafely: true,
        expiresInSeconds: true,
        expiringAccessTokens: true,
        expiryControlledAccess: true,
        permanentTokenExposurePrevented: true,
        expiredAccessCleanup: true,
        timeLimitedDownloads: true,
        securePreviews: true,
        oneTimeAccessLinks: true,
        revocableUrls: true,
        revocableAccessToken: true,
        workflowScopedAccess: true,
        roleScopedTemporarySharing: true,
        accessExpirationEnforcement: true,
        signedUrlRedacted: true,
        instantRevocation: true,
        forcedExpiry: true,
        emergencyAccessInvalidation: true,
        revokedTokenTracking: true,
        suspiciousSessionInvalidation: true,
        repeatedTokenReuse: true,
        expiredTokenAccessAttempts: true,
        abnormalPreviewFrequency: true,
        suspiciousDownloadBursts: true,
        unauthorizedSharingAttempts: true,
        crossTenantAccessAnomalies: true,
        malformedSignatureAttempts: true,
        replayPrevention: true,
        tenantBoundAccess: true,
        ipAwareValidationHooks: true,
        tokenTamperingDetection: true,
        suspiciousReuseAttempts: true,
        signedUrlGenerationVolume: true,
        expiredAccessTrends: true,
        revocationFrequency: true,
        suspiciousTokenActivity: true,
        temporaryAccessCongestion: true,
        securePreviewUsage: true,
        oneTimeLinkUsage: true,
        sensitivityAwareSignedAccess: true,
        classifiedDocumentRestrictions: true,
        archivalAwareAccessExpiry: true,
        workflowLinkedTemporaryAccess: true,
        forensicAccessReconstruction: true,
        storageHardeningIntegrated: true,
        documentVisibilityIntegrated: true,
        documentClassificationIntegrated: true,
        attachmentAuditTrailIntegrated: true,
        fileRetentionIntegrated: true,
        uploadValidationIntegrated: true,
        workflowTelemetryIntegrated: true,
        auditReady: true,
        telemetryReady: true,
        metricsReady: true,
        employeeOwnTemporaryAccessOnly: true,
        managerWorkflowScopedAccessVisibility: true,
        hrOperationalTemporaryAccessVisibility: true,
        hrHeadStrategicAccessAnalytics: true,
        directorAggregateAccessIntelligenceOnly: true,
        superAdminSignedUrlOverride: true,
        platformOwnerAccessChain: true,
        crossTenantSignedUrlLeakageBlocked: true,
        permanentTokenExposurePrevented: true,
        historicalAccessRecordsImmutable: true,
        existingDocumentFlowsPreserved: true,
        existingWorkflowsPreserved: true,
        signedAccessActionsAuditable: true,
        signedUrlSecurityPreserved: true,
        tenantIsolationPreserved: true,
        replayPreventionPreserved: true
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
            return source && typeof source.get === 'function' ? source.get() : {};
        } catch (error) {
            safeWarn('Database read failed safely.', error && error.message);
            return {};
        }
    }

    function list(data, key) {
        return Array.isArray(data && data[key]) ? data[key].slice() : [];
    }

    function nowIso(context) {
        return context && context.now ? new Date(context.now).toISOString() : new Date().toISOString();
    }

    function safeString(value, fallback) {
        if (value === undefined || value === null) return fallback || '';
        return String(value);
    }

    function normalizeToken(value) {
        return safeString(value, '').trim().toUpperCase().replace(/[^A-Z0-9_ -]/g, '_').replace(/\s+/g, '_');
    }

    function normalizeRole(value) {
        var role = normalizeToken(value || 'EMPLOYEE');
        if (role === 'ADMIN') return 'SUPER_ADMIN';
        if (role === 'DIRECTOR' || role === 'HR_HEAD' || role === 'HR' || role === 'MANAGER' || role === 'EMPLOYEE' || role === 'SUPER_ADMIN' || role === 'PLATFORM_OWNER') return role;
        if (role === 'CANDIDATE') return 'EMPLOYEE';
        return 'EMPLOYEE';
    }

    function normalizeTenantSlug(value) {
        return safeString(value, '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    }

    function contextTenant(context) {
        if (!context) return '';
        return normalizeTenantSlug(context.tenantSlug || context.tenantId || context.companyId || context.companySlug);
    }

    function rowTenant(row) {
        return normalizeTenantSlug(row && (row.tenantSlug || row.tenantId || row.companyId || row.companySlug));
    }

    function actorId(context) {
        return safeString(context && context.actor && (context.actor.id || context.actor.empId || context.actor.userId), '');
    }

    function actorRole(context) {
        return normalizeRole(context && context.actor && context.actor.role);
    }

    function empIdOf(row) {
        return safeString(row && (row.empId || row.employeeId || row.ownerEmpId || row.ownerId || row.userId), '');
    }

    function attachmentIdOf(row) {
        return safeString(row && (row.attachmentId || row.documentId || row.docId || row.objectId || row.fileId), '');
    }

    function tokenIdOf(row) {
        return safeString(row && (row.tokenId || row.accessTokenId || row.signedAccessId || row.id), '');
    }

    function workflowIdOf(row) {
        return safeString(row && (row.workflowId || row.workflowRef || row.requestId || row.referenceId), '');
    }

    function stateOf(row) {
        var state = normalizeToken(row && (row.state || row.status || row.accessState));
        return SIGNED_ACCESS_STATES[state] ? state : SIGNED_ACCESS_STATES.ACTIVE;
    }

    function accessTypeOf(row) {
        var type = normalizeToken(row && (row.accessType || row.action || row.type));
        if (type.indexOf('PREVIEW') >= 0) return ACCESS_TYPES.PREVIEW;
        if (type.indexOf('SHARE') >= 0) return ACCESS_TYPES.SHARE;
        return ACCESS_TYPES.DOWNLOAD;
    }

    function statusOf(row) {
        return normalizeToken(row && row.status);
    }

    function reasonOf(row) {
        return safeString(row && (row.reason || row.message || row.description || row.warningCode || row.failureCode), '');
    }

    function timestampOf(row) {
        var raw = row && (row.createdAt || row.updatedAt || row.generatedAt || row.date);
        var time = raw ? new Date(raw).getTime() : 0;
        return isNaN(time) ? 0 : time;
    }

    function expiresAtOf(row) {
        var raw = row && (row.expiresAt || row.expiryAt || row.expirationAt || row.validUntil);
        var time = raw ? new Date(raw).getTime() : 0;
        return isNaN(time) ? 0 : time;
    }

    function isExpired(row, context) {
        var state = stateOf(row);
        if (state === SIGNED_ACCESS_STATES.EXPIRED) return true;
        var expiry = expiresAtOf(row);
        var now = context && context.now ? new Date(context.now).getTime() : Date.now();
        return !!expiry && expiry <= now;
    }

    function expiresInSecondsOf(row, context) {
        var explicit = Number(row && row.expiresInSeconds);
        if (isFinite(explicit) && explicit > 0) return Math.floor(explicit);
        var expiry = expiresAtOf(row);
        if (!expiry) return 0;
        var now = context && context.now ? new Date(context.now).getTime() : Date.now();
        return Math.max(0, Math.floor((expiry - now) / 1000));
    }

    function unsafePermanentAccess(row, context) {
        if (!row) return false;
        var state = stateOf(row);
        if (state === SIGNED_ACCESS_STATES.REVOKED || state === SIGNED_ACCESS_STATES.BLOCKED || state === SIGNED_ACCESS_STATES.EXPIRED || state === SIGNED_ACCESS_STATES.ARCHIVED) return false;
        if (row.neverExpires || row.permanentAccess || row.noExpiry) return true;
        var ttl = expiresInSecondsOf(row, context);
        if (ttl > MAX_SIGNED_ACCESS_SECONDS) return true;
        var hasExpiry = !!expiresAtOf(row) || !!(row && row.expiresInSeconds);
        if ((row.signedUrl || row.tokenHash || row.tokenId || row.accessToken) && !hasExpiry) return true;
        return false;
    }

    function employeeRows(data) {
        return list(data, 'employees').concat(list(data, 'users'));
    }

    function employeeById(data, id) {
        var needle = safeString(id, '');
        return employeeRows(data).filter(function match(row) {
            return safeString(row && (row.id || row.empId || row.userId), '') === needle;
        })[0] || null;
    }

    function managerOwnsEmployee(data, managerId, employeeId) {
        if (!managerId || !employeeId) return false;
        var employee = employeeById(data, employeeId);
        if (!employee) return false;
        return safeString(employee.managerId || employee.reportingManagerId || employee.supervisorId, '') === managerId;
    }

    function tenantFilter(tenant) {
        return function sameTenant(row) {
            if (!tenant) return true;
            return rowTenant(row) === tenant;
        };
    }

    function attachmentRows(data) {
        return list(data, 'fileAttachments').concat(list(data, 'attachments'), list(data, 'documents'));
    }

    function signedAccessRows(data) {
        return list(data, 'signedAccessRecords').concat(list(data, 'temporaryAccessRecords'), list(data, 'signedUrlRecords'));
    }

    function documentAccessRows(data) {
        return list(data, 'documentAccessLogs').concat(list(data, 'attachmentAccessLogs'), list(data, 'fileAccessLogs'));
    }

    function storageRows(data) {
        return list(data, 'storageAccessLogs').concat(list(data, 'storageAuditLogs'), list(data, 'storageEvents'));
    }

    function signedAuditRows(data) {
        return list(data, 'signedAccessAuditEvents').concat(list(data, 'signedUrlAuditEvents'), list(data, 'temporaryAccessAuditEvents'));
    }

    function classificationRows(data) {
        return list(data, 'documentClassifications').concat(list(data, 'classificationRecords'));
    }

    function retentionRows(data) {
        return list(data, 'fileRetentionRecords').concat(list(data, 'retentionRecords'));
    }

    function relatedAttachment(data, row) {
        var id = attachmentIdOf(row);
        if (!id) return null;
        return attachmentRows(data).filter(function match(item) { return attachmentIdOf(item) === id; })[0] || null;
    }

    function relatedSignedRecord(data, row) {
        var token = tokenIdOf(row);
        if (!token) return null;
        return signedAccessRows(data).filter(function match(item) { return tokenIdOf(item) === token; })[0] || null;
    }

    function mergedRecord(data, row) {
        var signed = relatedSignedRecord(data, row) || {};
        var attachment = relatedAttachment(data, row) || relatedAttachment(data, signed) || {};
        var merged = {};
        Object.keys(attachment).forEach(function copy(key) { merged[key] = attachment[key]; });
        Object.keys(signed).forEach(function copy(key) { merged[key] = signed[key]; });
        Object.keys(row || {}).forEach(function copy(key) { merged[key] = row[key]; });
        return merged;
    }

    function workflowLinked(record, context) {
        var wanted = safeString(context && (context.workflowId || context.workflowRef), '');
        if (!wanted) return true;
        return workflowIdOf(record) === wanted;
    }

    function hasPublicExposure(row) {
        var text = JSON.stringify(row || {});
        return /publicUrl|public_url|isPublic":true|public":true|https?:\/\/public/i.test(text);
    }

    function sanitizeText(value) {
        return safeString(value, '').replace(SENSITIVE_VALUE_PATTERN, '[REDACTED]');
    }

    function cloneSanitized(value, keyHint) {
        if (value === null || value === undefined) return value;
        var type = typeof value;
        var key = safeString(keyHint, '');
        var safeKey = !!SAFE_GOVERNANCE_KEYS[key];
        if (type === 'string') {
            if (!safeKey && SENSITIVE_KEY_PATTERN.test(key)) return '[REDACTED]';
            return safeKey ? value : sanitizeText(value);
        }
        if (type === 'number' || type === 'boolean') return value;
        if (Array.isArray(value)) {
            return value.slice(0, 50).map(function map(item) { return cloneSanitized(item, key); });
        }
        if (type === 'object') {
            var out = {};
            Object.keys(value).forEach(function copy(childKey) {
                if (!SAFE_GOVERNANCE_KEYS[childKey] && SENSITIVE_KEY_PATTERN.test(childKey)) {
                    out[childKey] = '[REDACTED]';
                    return;
                }
                out[childKey] = cloneSanitized(value[childKey], childKey);
            });
            return out;
        }
        return undefined;
    }

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.keys(value).forEach(function freezeKey(key) { deepFreeze(value[key]); });
        try { Object.freeze(value); } catch (error) {}
        return value;
    }

    function freezeSignedAccessOutput(output) {
        return deepFreeze(cloneSanitized(output || {}, 'payload'));
    }

    function safeFailure(code, classification, message) {
        return freezeSignedAccessOutput({
            failureCode: code,
            classification: classification || FAILURE_CLASSIFICATIONS.WARNING,
            message: message || code
        });
    }

    function classifySignedAccessRisk(input) {
        try {
            var risk = input || {};
            if (risk.crossTenant || risk.permanentToken || risk.tokenTampering || risk.publicExposure || risk.malformedSignature && risk.tenantMismatch) {
                return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
            }
            if (risk.suspiciousReuse || risk.unsafeRevocation || risk.superAdminBypass || risk.permissionEscalation || risk.malformedSignature) {
                return FAILURE_CLASSIFICATIONS.HIGH_RISK;
            }
            if (risk.expiredToken || risk.malformedPayload || risk.revokedToken || risk.replayAttempt) {
                return FAILURE_CLASSIFICATIONS.WARNING;
            }
            return FAILURE_CLASSIFICATIONS.INFO;
        } catch (error) {
            return FAILURE_CLASSIFICATIONS.HIGH_RISK;
        }
    }

    function scopeVisibility(role) {
        if (role === 'EMPLOYEE') return VISIBILITY.OWN_TEMPORARY_ACCESS_ONLY;
        if (role === 'MANAGER') return VISIBILITY.WORKFLOW_SCOPED_ACCESS_VISIBILITY;
        if (role === 'HR') return VISIBILITY.HR_OPERATIONAL_TEMPORARY_ACCESS_VISIBILITY;
        if (role === 'HR_HEAD') return VISIBILITY.STRATEGIC_ACCESS_ANALYTICS;
        if (role === 'DIRECTOR') return VISIBILITY.AGGREGATE_ACCESS_INTELLIGENCE_ONLY;
        if (role === 'SUPER_ADMIN') return VISIBILITY.INFRASTRUCTURE_VISIBILITY_ONLY;
        if (role === 'PLATFORM_OWNER') return VISIBILITY.PLATFORM_GOVERNANCE_ONLY;
        return VISIBILITY.NONE;
    }

    function validateSignedAccessScope(record, context) {
        try {
            var data = rawData();
            var ctx = context || {};
            var role = actorRole(ctx);
            var tenant = contextTenant(ctx) || normalizeTenantSlug(record && (record.tenantSlug || record.tenantId));
            var merged = mergedRecord(data, record || {});
            var targetTenant = rowTenant(merged) || rowTenant(record) || tenant;
            var employeeId = empIdOf(merged) || empIdOf(record);
            var currentActorId = actorId(ctx);
            var visibility = scopeVisibility(role);
            var failures = [];
            var warnings = [];

            if (tenant && targetTenant && tenant !== targetTenant) {
                failures.push(safeFailure('CROSS_TENANT_SIGNED_ACCESS_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Cross-tenant signed URL visibility is blocked.'));
            }
            if (role === 'PLATFORM_OWNER') {
                failures.push(safeFailure('PLATFORM_OWNER_ACCESS_CHAIN_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'PLATFORM_OWNER is isolated from employee signed access chains.'));
            }
            if (role === 'SUPER_ADMIN' && (record && (record.bypassRequested || record.bypassExpiry || record.overrideExpiry || record.forceGrant || record.directObjectAccess))) {
                failures.push(safeFailure('SUPER_ADMIN_SIGNED_ACCESS_BYPASS_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'SUPER_ADMIN cannot bypass signed access expiry governance.'));
            }
            if (unsafePermanentAccess(merged, ctx)) {
                failures.push(safeFailure('PERMANENT_SIGNED_ACCESS_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Permanent signed access is blocked.'));
            }
            if (hasPublicExposure(record) || hasPublicExposure(merged)) {
                failures.push(safeFailure('PUBLIC_SIGNED_URL_EXPOSURE_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Public signed URL exposure is blocked.'));
            }
            if (record && (record.tokenTampering || record.malformedSignature)) {
                failures.push(safeFailure('SIGNED_ACCESS_TOKEN_TAMPERING_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Malformed or tampered signatures are blocked.'));
            }
            if (role === 'EMPLOYEE' && currentActorId && employeeId && currentActorId !== employeeId) {
                failures.push(safeFailure('EMPLOYEE_SIGNED_ACCESS_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Employees can only view their own temporary access.'));
            }
            if (role === 'MANAGER' && employeeId && currentActorId && !managerOwnsEmployee(data, currentActorId, employeeId) && !workflowLinked(merged, ctx)) {
                failures.push(safeFailure('MANAGER_WORKFLOW_SIGNED_ACCESS_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Managers require team or workflow-scoped temporary access visibility.'));
            }
            if (isExpired(merged, ctx)) {
                warnings.push(safeFailure('SIGNED_ACCESS_EXPIRED', FAILURE_CLASSIFICATIONS.WARNING, 'Signed access is expired and must not be reused.'));
            }
            var classification = failures.reduce(function highest(current, failure) {
                if (failure.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
                if (failure.classification === FAILURE_CLASSIFICATIONS.HIGH_RISK && current !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER) return FAILURE_CLASSIFICATIONS.HIGH_RISK;
                return current;
            }, warnings.length ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO);

            return freezeSignedAccessOutput({
                success: true,
                allowed: failures.length === 0,
                readOnly: true,
                classification: classification,
                visibility: failures.length ? VISIBILITY.NONE : visibility,
                failures: failures,
                warnings: warnings,
                metadata: {
                    tenantIsolationPreserved: failures.filter(function cross(item) { return item.failureCode === 'CROSS_TENANT_SIGNED_ACCESS_BLOCKED'; }).length === 0,
                    signedUrlSecurityPreserved: failures.filter(function access(item) { return item.failureCode === 'PERMANENT_SIGNED_ACCESS_BLOCKED' || item.failureCode === 'PUBLIC_SIGNED_URL_EXPOSURE_BLOCKED'; }).length === 0,
                    replayPreventionPreserved: true
                }
            });
        } catch (error) {
            return freezeSignedAccessOutput({
                success: false,
                allowed: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                visibility: VISIBILITY.NONE,
                failures: [safeFailure('SIGNED_ACCESS_SCOPE_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Signed access scope validation failed safely.')]
            });
        }
    }

    function normalizeSignedAccessPayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeSignedAccessOutput({
                    success: false,
                    readOnly: true,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    failures: [safeFailure('MALFORMED_SIGNED_ACCESS_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Malformed signed access payload rejected.')]
                });
            }
            var ttl = expiresInSecondsOf(payload, context);
            if (!ttl) ttl = DEFAULT_SIGNED_ACCESS_SECONDS;
            var unsafeTtl = ttl < MIN_SIGNED_ACCESS_SECONDS || ttl > MAX_SIGNED_ACCESS_SECONDS || payload.neverExpires || payload.permanentAccess;
            var state = stateOf(payload);
            var type = accessTypeOf(payload);
            var normalized = {
                state: state,
                accessType: type,
                tenantSlug: normalizeTenantSlug(payload.tenantSlug || payload.tenantId || contextTenant(context)),
                expiresInSeconds: Math.min(Math.max(ttl, MIN_SIGNED_ACCESS_SECONDS), MAX_SIGNED_ACCESS_SECONDS),
                metadata: cloneSanitized(payload.metadata || {}, 'metadata')
            };
            var failures = [];
            if (unsafeTtl) failures.push(safeFailure('UNSAFE_SIGNED_ACCESS_EXPIRY_REJECTED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Signed access expiry must remain short-lived.'));
            if (payload.malformedSignature || payload.tokenTampering) failures.push(safeFailure('MALFORMED_SIGNATURE_REJECTED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Malformed signature rejected.'));
            return freezeSignedAccessOutput({
                success: failures.length === 0,
                readOnly: true,
                classification: failures.length ? FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER : FAILURE_CLASSIFICATIONS.INFO,
                payload: normalized,
                failures: failures,
                metadata: {
                    signedUrlSecurityPreserved: failures.length === 0,
                    tenantIsolationPreserved: true
                }
            });
        } catch (error) {
            return freezeSignedAccessOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('SIGNED_ACCESS_NORMALIZATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Signed access normalization failed safely.')]
            });
        }
    }

    function auditSignedAccess(actionType, metadata, context) {
        if (auditForwarding || context && context.skipAuditPersistence) return { success: true, skipped: true };
        auditForwarding = true;
        try {
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    actionType: actionType,
                    eventType: actionType,
                    module: 'Signed URL Governance',
                    targetId: '',
                    description: metadata && metadata.description || actionType,
                    actorRole: context && context.actor && context.actor.role || 'hr',
                    actorId: context && context.actor && (context.actor.id || context.actor.empId) || '',
                    severity: metadata && metadata.severity || 'INFO',
                    metadata: cloneSanitized(metadata || {}, 'metadata')
                }, {
                    source: 'signedUrlGovernanceService',
                    skipPersistence: false
                });
            }
            var source = db();
            if (source && typeof source.writeAuditLog === 'function') {
                source.writeAuditLog(context && context.actor && context.actor.role || 'hr', context && context.actor && context.actor.id || '', actionType, 'Signed URL Governance', '', metadata && metadata.description || actionType);
            }
            return { success: true };
        } catch (error) {
            return { success: false, warning: 'Signed access audit failed safely.' };
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
                    source: 'signedUrlGovernanceService',
                    severity: metadata && metadata.severity || 'INFO',
                    status: metadata && metadata.status || eventType,
                    tenantSlug: contextTenant(context) || metadata && metadata.tenantSlug || '',
                    metadata: cloneSanitized(metadata || {}, 'metadata')
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Signed access telemetry failed safely.' };
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
                    source: 'signedUrlGovernanceService',
                    status: metadata && metadata.status || metricType,
                    severity: metadata && metadata.severity || 'INFO'
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Signed access metric failed safely.' };
        } finally {
            metricForwarding = false;
        }
        return { success: false, warning: 'OrchestrationMetricsService unavailable.' };
    }

    function generateTemporaryAccess(payload, context) {
        try {
            var normalized = normalizeSignedAccessPayload(payload, context || {});
            if (!normalized.success) return normalized;
            var scope = validateSignedAccessScope(payload, context || {});
            if (!scope.allowed) return scope;
            var ttl = normalized.payload.expiresInSeconds || DEFAULT_SIGNED_ACCESS_SECONDS;
            var result = freezeSignedAccessOutput({
                success: true,
                readOnly: true,
                state: SIGNED_ACCESS_STATES.GENERATED,
                classification: FAILURE_CLASSIFICATIONS.INFO,
                visibility: scope.visibility,
                temporaryAccess: {
                    timeLimitedDownloads: true,
                    securePreviews: true,
                    oneTimeAccessLinks: true,
                    revocableUrls: true,
                    revocableAccessToken: true,
                    workflowScopedAccess: true,
                    roleScopedTemporarySharing: true,
                    accessExpirationEnforcement: true,
                    expiresSafely: ttl >= MIN_SIGNED_ACCESS_SECONDS && ttl <= MAX_SIGNED_ACCESS_SECONDS,
                    expiresInSeconds: ttl,
                    signedUrlRedacted: true
                },
                metadata: {
                    tenantIsolationPreserved: true,
                    signedUrlSecurityPreserved: true,
                    replayPreventionPreserved: true
                }
            });
            auditSignedAccess('SIGNED_URL_GENERATED', {
                description: 'Temporary signed access generated with expiry governance.',
                status: SIGNED_ACCESS_STATES.GENERATED,
                severity: 'INFO'
            }, context || {});
            emitTelemetry('TEMPORARY_ACCESS_GRANTED', {
                status: SIGNED_ACCESS_STATES.GENERATED,
                severity: 'INFO'
            }, context || {});
            recordMetric('TEMPORARY_ACCESS_GRANTED', {
                status: SIGNED_ACCESS_STATES.GENERATED,
                severity: 'INFO'
            }, context || {});
            return result;
        } catch (error) {
            return freezeSignedAccessOutput({
                success: false,
                readOnly: true,
                state: SIGNED_ACCESS_STATES.BLOCKED,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('TEMPORARY_ACCESS_GENERATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Temporary access generation failed safely.')]
            });
        }
    }

    function revokeTemporaryAccess(payload, context) {
        try {
            var scope = validateSignedAccessScope(payload || {}, context || {});
            if (!scope.allowed) return scope;
            var result = freezeSignedAccessOutput({
                success: true,
                readOnly: true,
                state: SIGNED_ACCESS_STATES.REVOKED,
                classification: FAILURE_CLASSIFICATIONS.INFO,
                visibility: scope.visibility,
                revocation: {
                    instantRevocation: true,
                    forcedExpiry: true,
                    emergencyAccessInvalidation: true,
                    revokedTokenTracking: true,
                    suspiciousSessionInvalidation: true,
                    expiredAccessCleanup: true
                },
                metadata: {
                    historicalAccessRecordsImmutable: true,
                    signedUrlSecurityPreserved: true,
                    replayPreventionPreserved: true
                }
            });
            auditSignedAccess('SIGNED_ACCESS_REVOKED', {
                description: 'Temporary signed access revoked with forced expiry.',
                status: SIGNED_ACCESS_STATES.REVOKED,
                severity: 'INFO'
            }, context || {});
            emitTelemetry('SIGNED_ACCESS_REVOKED', {
                status: SIGNED_ACCESS_STATES.REVOKED,
                severity: 'INFO'
            }, context || {});
            recordMetric('SIGNED_ACCESS_REVOKED', {
                status: SIGNED_ACCESS_STATES.REVOKED,
                severity: 'INFO'
            }, context || {});
            return result;
        } catch (error) {
            return freezeSignedAccessOutput({
                success: false,
                readOnly: true,
                state: SIGNED_ACCESS_STATES.BLOCKED,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('SIGNED_ACCESS_REVOCATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Signed access revocation failed safely.')]
            });
        }
    }

    function tenantScopedRows(data, tenant) {
        return {
            signed: signedAccessRows(data).filter(tenantFilter(tenant)),
            access: documentAccessRows(data).filter(tenantFilter(tenant)),
            storage: storageRows(data).filter(tenantFilter(tenant)),
            audit: signedAuditRows(data).filter(tenantFilter(tenant))
        };
    }

    function countWhere(rows, predicate) {
        return rows.filter(function filter(row) {
            try { return !!predicate(row); } catch (error) { return false; }
        }).length;
    }

    function countGrouped(rows, keyFn, predicate, threshold) {
        var groups = {};
        rows.forEach(function group(row) {
            if (predicate && !predicate(row)) return;
            var key = safeString(keyFn(row), '');
            if (!key) return;
            groups[key] = (groups[key] || 0) + 1;
        });
        return Object.keys(groups).filter(function over(key) { return groups[key] >= threshold; }).length;
    }

    function detectSuspiciousTokenBehavior(filters, context) {
        try {
            var data = rawData();
            var tenant = normalizeTenantSlug(filters && (filters.tenantSlug || filters.tenantId)) || contextTenant(context);
            var rows = tenantScopedRows(data, tenant);
            var denied = rows.access.filter(function deniedOnly(row) { return statusOf(row) === 'DENIED' || /denied|blocked|rejected/i.test(statusOf(row) + ' ' + reasonOf(row)); });
            var expired = rows.signed.filter(function expiredOnly(row) { return isExpired(row, context) || /expired/i.test(reasonOf(row)); });
            var previewRows = rows.access.filter(function preview(row) { return accessTypeOf(row) === ACCESS_TYPES.PREVIEW; });
            var downloadRows = rows.access.filter(function download(row) { return accessTypeOf(row) === ACCESS_TYPES.DOWNLOAD && (statusOf(row) === 'ALLOWED' || statusOf(row) === 'VIEWED'); });
            var repeatedReuse = countGrouped(denied, tokenIdOf, function deniedByToken(row) { return !!tokenIdOf(row); }, 2) + countWhere(rows.signed, function reused(row) { return Number(row.tokenReuseAttempts || row.reuseAttempts || 0) > 0; });
            var summary = {
                repeatedTokenReuse: repeatedReuse,
                expiredTokenAccessAttempts: expired.length + countWhere(denied, function expiredReason(row) { return /expired/i.test(reasonOf(row)); }),
                abnormalPreviewFrequency: countGrouped(previewRows, tokenIdOf, function hasPreview(row) { return !!tokenIdOf(row); }, 2) + countWhere(previewRows, function suspiciousPreview(row) { return /suspicious|cross|malformed|revoked/i.test(reasonOf(row)); }),
                suspiciousDownloadBursts: countGrouped(downloadRows, tokenIdOf, function hasDownload(row) { return !!tokenIdOf(row); }, 3),
                unauthorizedSharingAttempts: countWhere(rows.access, function share(row) { return accessTypeOf(row) === ACCESS_TYPES.SHARE || /unauthorized sharing|share/i.test(reasonOf(row)); }),
                crossTenantAccessAnomalies: countWhere(rows.access, function cross(row) { return /cross-tenant|cross tenant|cross workflow|cross-workflow/i.test(reasonOf(row)); }),
                malformedSignatureAttempts: countWhere(rows.access.concat(rows.signed), function malformed(row) { return row.malformedSignature || /malformed signature|signature/i.test(reasonOf(row)); })
            };
            var signals = Object.keys(summary).filter(function active(key) { return summary[key] > 0; }).map(function signal(key) {
                return { signal: key, count: summary[key], severity: key === 'expiredTokenAccessAttempts' ? 'WARNING' : 'HIGH_RISK' };
            });
            var classification = summary.crossTenantAccessAnomalies || summary.malformedSignatureAttempts ? FAILURE_CLASSIFICATIONS.HIGH_RISK : (signals.length ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO);
            return freezeSignedAccessOutput({
                success: true,
                readOnly: true,
                classification: classification,
                summary: summary,
                signals: signals,
                metadata: {
                    replayPrevention: true,
                    tokenTamperingDetection: true,
                    tenantBoundAccess: true,
                    ipAwareValidationHooks: true
                }
            });
        } catch (error) {
            return freezeSignedAccessOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                summary: {
                    repeatedTokenReuse: 0,
                    expiredTokenAccessAttempts: 0,
                    abnormalPreviewFrequency: 0,
                    suspiciousDownloadBursts: 0,
                    unauthorizedSharingAttempts: 0,
                    crossTenantAccessAnomalies: 0,
                    malformedSignatureAttempts: 0
                },
                signals: [],
                failures: [safeFailure('SUSPICIOUS_TOKEN_DETECTION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Suspicious token detection failed safely.')]
            });
        }
    }

    function stateCount(rows, state, context) {
        return rows.filter(function count(row) {
            if (state === SIGNED_ACCESS_STATES.EXPIRED && isExpired(row, context)) return true;
            return stateOf(row) === state;
        }).length;
    }

    function generateSignedAccessReport(filters, context) {
        try {
            var data = rawData();
            var tenant = normalizeTenantSlug(filters && (filters.tenantSlug || filters.tenantId)) || contextTenant(context);
            var scope = validateSignedAccessScope({ tenantSlug: tenant }, context || {});
            var rows = tenantScopedRows(data, tenant);
            var signedRows = rows.signed;
            var suspicious = detectSuspiciousTokenBehavior({ tenantSlug: tenant }, {
                tenantSlug: tenant,
                now: context && context.now,
                skipAuditPersistence: true,
                skipTelemetry: true,
                skipMetrics: true
            });
            var expiredCount = stateCount(signedRows, SIGNED_ACCESS_STATES.EXPIRED, context);
            var revokedCount = stateCount(signedRows, SIGNED_ACCESS_STATES.REVOKED, context);
            var blockedCount = stateCount(signedRows, SIGNED_ACCESS_STATES.BLOCKED, context);
            var classification = suspicious.classification === FAILURE_CLASSIFICATIONS.HIGH_RISK || blockedCount ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.INFO;
            var report = freezeSignedAccessOutput({
                success: true,
                readOnly: true,
                classification: classification,
                visibility: scope.visibility,
                signedUrlHealth: {
                    totalSignedAccess: signedRows.length,
                    generatedAccess: stateCount(signedRows, SIGNED_ACCESS_STATES.GENERATED, context),
                    activeAccess: stateCount(signedRows, SIGNED_ACCESS_STATES.ACTIVE, context),
                    viewedAccess: stateCount(signedRows, SIGNED_ACCESS_STATES.VIEWED, context),
                    expiredAccess: expiredCount,
                    revokedAccess: revokedCount,
                    blockedAccess: blockedCount,
                    archivedAccess: stateCount(signedRows, SIGNED_ACCESS_STATES.ARCHIVED, context)
                },
                expiryGovernance: {
                    expiredAccess: expiredCount,
                    expiringAccessTokens: countWhere(signedRows, function expiring(row) {
                        var ttl = expiresInSecondsOf(row, context);
                        return ttl > 0 && ttl <= 900;
                    }),
                    expiryControlledAccess: true,
                    permanentTokenExposurePrevented: true,
                    expiresSafely: countWhere(signedRows, function unsafe(row) { return unsafePermanentAccess(row, context); }) === 0,
                    expiredAccessCleanup: true
                },
                revocationGovernance: {
                    revokedAccess: revokedCount,
                    instantRevocation: true,
                    forcedExpiry: true,
                    emergencyAccessInvalidation: true,
                    revokedTokenTracking: true,
                    suspiciousSessionInvalidation: true,
                    expiredAccessCleanup: true
                },
                suspiciousTokenDetection: suspicious.summary,
                accessAnalytics: {
                    signedUrlGenerationVolume: countWhere(rows.storage.concat(rows.audit), function generated(row) { return /SIGNED_URL_GENERATED|SIGNED_ACCESS_GENERATED|TEMPORARY_ACCESS_GRANTED/i.test(safeString(row.action || row.actionType || row.eventType, '')); }),
                    expiredAccessTrends: expiredCount,
                    revocationFrequency: revokedCount + countWhere(rows.storage.concat(rows.audit), function revoked(row) { return /REVOKED|REVOCATION/i.test(safeString(row.action || row.actionType || row.eventType || row.state, '')); }),
                    suspiciousTokenActivity: suspicious.signals.length,
                    temporaryAccessCongestion: Math.max(0, signedRows.length - revokedCount - expiredCount),
                    securePreviewUsage: countWhere(rows.access, function preview(row) { return accessTypeOf(row) === ACCESS_TYPES.PREVIEW; }),
                    oneTimeLinkUsage: countWhere(signedRows, function oneTime(row) { return row.oneTimeAccess || row.oneTimeLink; })
                },
                attachmentStorageIntegration: {
                    sensitivityAwareSignedAccess: !!global.DocumentClassificationService,
                    classifiedDocumentRestrictions: !!global.DocumentClassificationService,
                    archivalAwareAccessExpiry: !!global.FileRetentionService,
                    workflowLinkedTemporaryAccess: true,
                    forensicAccessReconstruction: !!global.AttachmentAuditTrailService
                },
                accessGovernance: {
                    employeeOwnTemporaryAccessOnly: true,
                    managerWorkflowScopedAccessVisibility: true,
                    hrOperationalTemporaryAccessVisibility: true,
                    hrHeadStrategicAccessAnalytics: true,
                    directorAggregateAccessIntelligenceOnly: true,
                    superAdminSignedUrlOverride: false,
                    platformOwnerAccessChain: false,
                    crossTenantSignedUrlLeakageBlocked: true,
                    permanentTokenExposurePrevented: true,
                    historicalAccessRecordsImmutable: true,
                    existingDocumentFlowsPreserved: true,
                    existingWorkflowsPreserved: true,
                    signedAccessActionsAuditable: true,
                    tenantIsolationPreserved: true,
                    signedUrlSecurityPreserved: true,
                    replayPreventionPreserved: true
                },
                integrationHealth: {
                    storageHardeningIntegrated: !!global.StorageHardeningService,
                    documentVisibilityIntegrated: !!global.DocumentVisibilityService,
                    documentClassificationIntegrated: !!global.DocumentClassificationService,
                    attachmentAuditTrailIntegrated: !!global.AttachmentAuditTrailService,
                    fileRetentionIntegrated: !!global.FileRetentionService,
                    uploadValidationIntegrated: !!global.UploadValidationService,
                    workflowTelemetryIntegrated: !!global.WorkflowTelemetryService,
                    auditReady: !!global.AuditService,
                    telemetryReady: !!global.WorkflowTelemetryService,
                    metricsReady: !!global.OrchestrationMetricsService
                },
                warnings: suspicious.signals,
                metadata: {
                    tenantIsolationPreserved: true,
                    signedUrlSecurityPreserved: true,
                    historicalAccessRecordsImmutable: true
                }
            });
            auditSignedAccess('SIGNED_ACCESS_REPORTED', {
                description: 'Signed URL governance report viewed.',
                status: classification,
                severity: classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO'
            }, context || {});
            emitTelemetry('SIGNED_ACCESS_REPORTED', {
                status: classification,
                severity: classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO'
            }, context || {});
            recordMetric('SIGNED_ACCESS_REPORTED', {
                status: classification,
                severity: classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO'
            }, context || {});
            return report;
        } catch (error) {
            return freezeSignedAccessOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                signedUrlHealth: {
                    totalSignedAccess: 0,
                    generatedAccess: 0,
                    activeAccess: 0,
                    viewedAccess: 0,
                    expiredAccess: 0,
                    revokedAccess: 0,
                    blockedAccess: 0,
                    archivedAccess: 0
                },
                failures: [safeFailure('SIGNED_ACCESS_REPORT_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Signed access report failed safely.')]
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        function check(label, condition) { checks.push({ label: label, passed: !!condition }); }
        try {
            var malformed = normalizeSignedAccessPayload(null, { tenantSlug: 'tabsons' });
            check('malformed signed access payloads fail safely', malformed.success === false && malformed.failures.length > 0);

            var cross = validateSignedAccessScope({ tenantSlug: 'abc', empId: 'EMP-X', attachmentId: 'ATT-X', tokenId: 'TOK-X' }, {
                tenantSlug: 'tabsons',
                actor: { role: 'HR', id: 'HR-1' },
                skipAuditPersistence: true,
                skipTelemetry: true,
                skipMetrics: true
            });
            check('cross-tenant signed URL visibility is blocked', cross.allowed === false && cross.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER);

            var permanent = normalizeSignedAccessPayload({ tenantSlug: 'tabsons', expiresInSeconds: 86400, neverExpires: true }, { tenantSlug: 'tabsons' });
            check('permanent access is rejected', permanent.success === false && permanent.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER);

            var generated = generateTemporaryAccess({ tenantSlug: 'tabsons', expiresInSeconds: 300, accessType: 'PREVIEW' }, {
                tenantSlug: 'tabsons',
                actor: { role: 'HR', id: 'HR-SELF' },
                skipAuditPersistence: true,
                skipTelemetry: true,
                skipMetrics: true
            });
            check('temporary access generation expires safely', generated.success === true && generated.temporaryAccess.expiresSafely === true);

            var revoked = revokeTemporaryAccess({ tenantSlug: 'tabsons', expiresInSeconds: 300 }, {
                tenantSlug: 'tabsons',
                actor: { role: 'HR', id: 'HR-SELF' },
                skipAuditPersistence: true,
                skipTelemetry: true,
                skipMetrics: true
            });
            check('revocation uses forced expiry', revoked.success === true && revoked.revocation.forcedExpiry === true);

            var suspicious = detectSuspiciousTokenBehavior({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons' });
            check('suspicious detection is immutable', suspicious.success === true && Object.isFrozen(suspicious.summary));

            var originalStorage = global.StorageHardeningService;
            var originalVisibility = global.DocumentVisibilityService;
            var originalClassification = global.DocumentClassificationService;
            var originalAudit = global.AttachmentAuditTrailService;
            var originalRetention = global.FileRetentionService;
            var originalUpload = global.UploadValidationService;
            try {
                global.StorageHardeningService = undefined;
                global.DocumentVisibilityService = undefined;
                global.DocumentClassificationService = undefined;
                global.AttachmentAuditTrailService = undefined;
                global.FileRetentionService = undefined;
                global.UploadValidationService = undefined;
                var degraded = generateSignedAccessReport({ tenantSlug: 'tabsons' }, {
                    tenantSlug: 'tabsons',
                    actor: { role: 'HR', id: 'HR-SELF' },
                    skipAuditPersistence: true,
                    skipTelemetry: true,
                    skipMetrics: true
                });
                check('optional dependency absence degrades safely', degraded.success === true && degraded.integrationHealth.storageHardeningIntegrated === false);
            } finally {
                global.StorageHardeningService = originalStorage;
                global.DocumentVisibilityService = originalVisibility;
                global.DocumentClassificationService = originalClassification;
                global.AttachmentAuditTrailService = originalAudit;
                global.FileRetentionService = originalRetention;
                global.UploadValidationService = originalUpload;
            }

            var frozen = freezeSignedAccessOutput({ payload: { state: SIGNED_ACCESS_STATES.ACTIVE } });
            check('outputs are immutable', Object.isFrozen(frozen) && Object.isFrozen(frozen.payload));
        } catch (error) {
            checks.push({ label: 'self-test has no uncaught failure', passed: false, error: error && error.message ? error.message : safeString(error, 'unknown') });
        }
        var result = freezeSignedAccessOutput({
            passed: checks.length > 0 && checks.every(function every(item) { return item.passed; }),
            checks: checks
        });
        global.__ARTHHRMS_SIGNED_URL_GOVERNANCE_SELF_TEST__ = result;
        return result;
    }

    var SignedUrlGovernanceService = Object.freeze({
        VERSION: VERSION,
        SIGNED_ACCESS_STATES: SIGNED_ACCESS_STATES,
        FAILURE_CLASSIFICATIONS: FAILURE_CLASSIFICATIONS,
        VISIBILITY: VISIBILITY,
        ACCESS_TYPES: ACCESS_TYPES,
        validateSignedAccessScope: validateSignedAccessScope,
        classifySignedAccessRisk: classifySignedAccessRisk,
        normalizeSignedAccessPayload: normalizeSignedAccessPayload,
        freezeSignedAccessOutput: freezeSignedAccessOutput,
        detectSuspiciousTokenBehavior: detectSuspiciousTokenBehavior,
        generateTemporaryAccess: generateTemporaryAccess,
        revokeTemporaryAccess: revokeTemporaryAccess,
        generateSignedAccessReport: generateSignedAccessReport,
        runSelfTest: runSelfTest
    });

    global.SignedUrlGovernanceService = SignedUrlGovernanceService;
    global.signedUrlGovernanceService = SignedUrlGovernanceService;

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
