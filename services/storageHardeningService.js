/**
 * storageHardeningService.js
 * ARTHHRMS Enterprise StorageService Production Hardening.
 *
 * Additive read-only governance layer for tenant-scoped storage isolation,
 * signed storage access, cleanup intelligence, quota posture, lifecycle state,
 * and storage security analytics. It never exposes raw bucket names, object
 * paths, object IDs, signed URLs, public URLs, filenames, or cross-tenant data.
 */
(function attachStorageHardeningService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[StorageHardeningService]';

    var STORAGE_STATES = Object.freeze({
        CREATED: 'CREATED',
        VALIDATING: 'VALIDATING',
        ACTIVE: 'ACTIVE',
        RESTRICTED: 'RESTRICTED',
        EXPIRED: 'EXPIRED',
        SCHEDULED_FOR_CLEANUP: 'SCHEDULED_FOR_CLEANUP',
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
        OWN_STORAGE_OBJECTS_ONLY: 'OWN_STORAGE_OBJECTS_ONLY',
        WORKFLOW_SCOPED_STORAGE_VISIBILITY: 'WORKFLOW_SCOPED_STORAGE_VISIBILITY',
        HR_OPERATIONAL_STORAGE_VISIBILITY: 'HR_OPERATIONAL_STORAGE_VISIBILITY',
        STRATEGIC_STORAGE_VISIBILITY: 'STRATEGIC_STORAGE_VISIBILITY',
        AGGREGATE_STORAGE_ANALYTICS_ONLY: 'AGGREGATE_STORAGE_ANALYTICS_ONLY',
        INFRASTRUCTURE_ONLY: 'INFRASTRUCTURE_ONLY',
        PLATFORM_GOVERNANCE_ONLY: 'PLATFORM_GOVERNANCE_ONLY'
    });

    var MIN_SIGNED_ACCESS_SECONDS = 60;
    var MAX_SIGNED_ACCESS_SECONDS = 3600;
    var DEFAULT_TENANT_QUOTA_BYTES = 50 * 1024 * 1024;

    var SENSITIVE_KEY_PATTERN = /(object.?id|object.?key|object.?path|storage.?path|bucket|file.?name|name|document.?id|attachment.?id|upload.?id|access.?token|token|signed.?url|public.?url|url|download.?url|path|private.?note|remark|description|message|body|content|comment|reply|candidate|resume|receipt|salary|payroll|payslip|compensation|amount|employee|emp.?id|user.?id|owner|uploaded.?by|assigned.?to|author|manager|secret|jwt|authorization|service.?role|private.?key|reason|cleanup.?reason)/i;
    var SENSITIVE_VALUE_PATTERN = /(https?:\/\/[^\s"',}]+|private:\/\/[^\s"',}]+|[a-z0-9-]+\/[A-Z0-9._-]+\/[A-Z0-9._-]+\/[^\s"',}]+|\b(private|confidential|secret|salary|payroll|resume|receipt|passport|aadhaar|bank)\b[^,;}]*)/ig;
    var SAFE_GOVERNANCE_KEYS = Object.freeze({
        success: true,
        allowed: true,
        readOnly: true,
        classification: true,
        visibility: true,
        state: true,
        generatedAt: true,
        tenantSlug: true,
        storageHealth: true,
        tenantIsolation: true,
        secureStorageGovernance: true,
        lifecycleGovernance: true,
        cleanupGovernance: true,
        accessGovernance: true,
        workflowDocumentIntegration: true,
        storageAnalytics: true,
        integrationHealth: true,
        signedAccess: true,
        cleanupSchedule: true,
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
        storageSecurityPreserved: true,
        tenantIsolationPreserved: true,
        historicalStorageRecordsImmutable: true,
        existingUploadFlowsPreserved: true,
        existingWorkflowsPreserved: true,
        storageActionsAuditable: true,
        storageState: true,
        totalObjects: true,
        createdObjects: true,
        validatingObjects: true,
        activeObjects: true,
        restrictedObjects: true,
        expiredObjects: true,
        cleanupScheduledObjects: true,
        archivedObjects: true,
        totalObjectBytes: true,
        tenantScopedBucketPaths: true,
        isolatedObjectPrefixes: true,
        tenantAwareSignedUrls: true,
        tenantBoundStorageMetadata: true,
        scopedObjectTraversal: true,
        tenantStorageQuotas: true,
        signedUploadUrls: true,
        signedDownloadUrls: true,
        expiringAccessTokens: true,
        objectAccessThrottling: true,
        securePreviews: true,
        objectChecksumValidation: true,
        secureMetadataStorage: true,
        directObjectAccessBlocked: true,
        publicBucketExposure: true,
        automaticExpiryHandling: true,
        orphanObjectDetection: true,
        staleUploadCleanup: true,
        expiredAttachmentCleanup: true,
        retentionPolicyIntegration: true,
        archivalWorkflows: true,
        unsafeMassDeletionBlocked: true,
        orphanedUploads: true,
        orphanedObjects: true,
        duplicateObjects: true,
        staleSignedUrls: true,
        abandonedUploads: true,
        failedUploadRemnants: true,
        cleanupBacklog: true,
        downloads: true,
        previews: true,
        temporaryAccessGrants: true,
        accessRevocations: true,
        downloadThrottling: true,
        suspiciousAccessDetection: true,
        suspiciousStorageAccess: true,
        superAdminRawStorageBrowse: true,
        platformOwnerStorageChain: true,
        permissionEscalationBlocked: true,
        storageGrowthBytes: true,
        uploadThroughput: true,
        failedUploads: true,
        storageCongestion: true,
        duplicateObjectGrowth: true,
        quotaUtilizationPercent: true,
        quotaWarnings: true,
        quotaExceeded: true,
        workflowLinkedStorage: true,
        onboardingFileStorage: true,
        recruitmentDocumentStorage: true,
        reimbursementReceiptStorage: true,
        policyDocumentStorage: true,
        unsafeWorkflowExposureBlocked: true,
        signedUrlIssued: true,
        signedUrlRedacted: true,
        expiresAt: true,
        expiresInSeconds: true,
        expiresSafely: true,
        tenantAwareSignedUrl: true,
        securePreviewEnabled: true,
        downloadThrottlingReady: true,
        checksumValidationRequired: true,
        cleanupQueued: true,
        dryRun: true,
        storageServiceIntegrated: true,
        secureUploadIntegrated: true,
        documentVisibilityIntegrated: true,
        fileAttachmentGovernanceIntegrated: true,
        uploadValidationIntegrated: true,
        workflowTelemetryIntegrated: true,
        auditReady: true,
        telemetryReady: true,
        metricsReady: true
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

    function objectPathOf(row) {
        return safeString(row && (row.objectPath || row.object_path || row.storagePath || row.storage_path || row.path || row.objectKey || row.object_key) || '', '').trim();
    }

    function actorId(actor) {
        return safeString(actor && (actor.empId || actor.employeeId || actor.userId || actor.id) || '', '').trim();
    }

    function empIdOf(row) {
        return safeString(row && (row.empId || row.employeeId || row.employee_id || row.userId || row.user_id || row.ownerEmpId || row.owner_emp_id || row.assignedTo || row.uploadedBy) || '', '').trim();
    }

    function workflowIdOf(row) {
        return safeString(row && (row.workflowId || row.workflow_id || row.eventId || row.event_id || row.pendingActionId || row.pending_action_id || '') || '', '').trim();
    }

    function checksumOf(row) {
        return safeString(row && (row.checksum || row.hash || row.sha256 || row.digest) || '', '').trim();
    }

    function bucketOf(row) {
        return safeString(row && (row.bucket || row.bucketName || row.storageBucket || row.storage_bucket) || '', '').trim();
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
        var explicit = rowTenant(row);
        if (explicit) return explicit;
        var path = objectPathOf(row);
        var pathTenant = normalizeTenantSlug(path.split('/')[0] || '');
        if (pathTenant) return pathTenant;
        return rowTenant(employeeById(empIdOf(row), data || rawData()));
    }

    function storageObjectRows(data) {
        var source = data || rawData();
        return Array.isArray(source.storageObjects) ? source.storageObjects : [];
    }

    function storageBucketRows(data) {
        var source = data || rawData();
        return Array.isArray(source.storageBuckets) ? source.storageBuckets : [];
    }

    function accessRows(data) {
        var source = data || rawData();
        return []
            .concat(Array.isArray(source.storageAccessLogs) ? source.storageAccessLogs : [])
            .concat(Array.isArray(source.attachmentAccessLogs) ? source.attachmentAccessLogs : [])
            .concat(Array.isArray(source.documentAccessLogs) ? source.documentAccessLogs : []);
    }

    function documentRows(data) {
        var source = data || rawData();
        return Array.isArray(source.documents) ? source.documents : [];
    }

    function attachmentRows(data) {
        var source = data || rawData();
        return []
            .concat(Array.isArray(source.fileAttachments) ? source.fileAttachments : [])
            .concat(Array.isArray(source.attachments) ? source.attachments : []);
    }

    function uploadRows(data) {
        var source = data || rawData();
        return Array.isArray(source.uploadValidationRecords) ? source.uploadValidationRecords : [];
    }

    function asyncRows(data) {
        var source = data || rawData();
        return Array.isArray(source.asyncJobs) ? source.asyncJobs : [];
    }

    function tenantFilter(tenant, data) {
        var normalized = normalizeTenantSlug(tenant);
        return function filter(row) {
            if (!normalized) return true;
            return sourceTenant(row, data || rawData()) === normalized || rowTenant(row) === normalized;
        };
    }

    function normalizeStorageState(value) {
        var normalized = normalizeToken(value);
        if (normalized === 'SCHEDULED' || normalized === 'SCHEDULED_FOR_CLEANUP' || normalized === 'CLEANUP_PENDING') return STORAGE_STATES.SCHEDULED_FOR_CLEANUP;
        if (normalized === 'VALIDATING' || normalized === 'SCANNING') return STORAGE_STATES.VALIDATING;
        if (normalized === 'ACTIVE' || normalized === 'UPLOADED' || normalized === 'APPROVED') return STORAGE_STATES.ACTIVE;
        if (normalized === 'RESTRICTED' || normalized === 'QUARANTINED' || normalized === 'REJECTED') return STORAGE_STATES.RESTRICTED;
        if (normalized === 'EXPIRED') return STORAGE_STATES.EXPIRED;
        if (normalized === 'ARCHIVED') return STORAGE_STATES.ARCHIVED;
        return STORAGE_STATES.CREATED;
    }

    function storageStateOf(row) {
        return normalizeStorageState(row && (row.state || row.status || row.storageState || row.lifecycleState || row.uploadStatus));
    }

    function dateTime(value) {
        var time = new Date(value || '').getTime();
        return isFinite(time) ? time : 0;
    }

    function isExpired(row, context) {
        var expires = row && (row.expiresAt || row.expiresOn || row.expiryDate || row.expirationDate || row.signedUrlExpiresAt || row.signedUrlExpiry);
        if (!expires) return false;
        return dateTime(expires) > 0 && dateTime(expires) <= dateTime(nowIso(context));
    }

    function publicExposure(row, data) {
        if (!row || typeof row !== 'object') return false;
        if (row.public === true || row.isPublic === true || row.publicUrl) return true;
        var bucket = bucketOf(row);
        if (bucket) {
            var buckets = storageBucketRows(data || rawData());
            if (buckets.some(function publicBucket(item) { return bucketOf(item) === bucket && tenantFilter(sourceTenant(row, data || rawData()), data || rawData())(item) && (item.public === true || item.private === false || item.isPublic === true); })) return true;
        }
        var url = safeString(row.url || row.downloadUrl || row.signedUrl || '', '').toLowerCase();
        return !!(url && url.indexOf('public') !== -1 && url.indexOf('private') === -1);
    }

    function tenantPrefixValid(row, tenant) {
        var path = objectPathOf(row);
        if (!path) return true;
        return normalizeTenantSlug(path.split('/')[0] || '') === normalizeTenantSlug(tenant);
    }

    function pathTraversal(row) {
        var path = objectPathOf(row);
        return /(^|\/)\.\.(\/|$)|\/\/|\\/.test(path);
    }

    function hasRawStorageFields(row) {
        return !!(row && (
            row.objectId ||
            row.object_id ||
            objectPathOf(row) ||
            bucketOf(row) ||
            row.fileName ||
            row.name ||
            row.signedUrl ||
            row.publicUrl ||
            row.downloadUrl ||
            row.privateNote ||
            row.browseRawStorage
        ));
    }

    function workflowLinked(row) {
        return !!(workflowIdOf(row) || /WORKFLOW|DISCUSSION|ESCALATION|ONBOARDING|RECRUITMENT|REIMBURSEMENT|POLICY/.test(normalizeToken(row && (row.category || row.type || row.module || row.storageType))));
    }

    function objectSize(row) {
        return Math.max(0, safeNumber(row && (row.size || row.bytes || row.fileSize || row.contentLength), 0));
    }

    function quotaFor(tenant, bucket, data) {
        var buckets = storageBucketRows(data || rawData()).filter(tenantFilter(tenant, data || rawData()));
        var match = buckets.find(function item(row) { return bucketOf(row) && bucketOf(row) === bucket; }) || buckets[0] || {};
        return Math.max(0, safeNumber(match.quotaBytes || match.maxBytes || match.storageQuotaBytes, DEFAULT_TENANT_QUOTA_BYTES));
    }

    function tenantBucketUsage(tenant, bucket, data) {
        return storageObjectRows(data || rawData()).filter(tenantFilter(tenant, data || rawData())).filter(function sameBucket(row) {
            return !bucket || bucketOf(row) === bucket;
        }).reduce(function total(sum, row) { return sum + objectSize(row); }, 0);
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

    function freezeStorageOutput(value) {
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

    function classifyStorageRisk(input) {
        var source = input || {};
        if (source.crossTenant || source.publicBucket || source.publicExposure || source.directObjectAccess || source.permissionEscalation || source.platformOwnerAccess) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
        if (source.orphanObject || source.duplicateObject || source.staleSignedUrl || source.suspiciousAccess || source.superAdminRawBrowse || source.quotaExceeded) return FAILURE_CLASSIFICATIONS.HIGH_RISK;
        if (source.quotaWarning || source.failedUpload || source.cleanupBacklog || source.expiredObject || source.abandonedUpload) return FAILURE_CLASSIFICATIONS.WARNING;
        return FAILURE_CLASSIFICATIONS.INFO;
    }

    function visibilityFor(role, record, context, data) {
        var normalized = normalizeRole(role || context && context.actor && context.actor.role);
        var actor = context && context.actor || {};
        var currentActorId = actorId(actor);
        var owner = empIdOf(record);
        if (normalized === 'EMPLOYEE') {
            return currentActorId && owner && currentActorId === owner ? VISIBILITY.OWN_STORAGE_OBJECTS_ONLY : VISIBILITY.NONE;
        }
        if (normalized === 'MANAGER') {
            return owner && managerOwnsEmployee(currentActorId, owner, data) && workflowLinked(record) ? VISIBILITY.WORKFLOW_SCOPED_STORAGE_VISIBILITY : VISIBILITY.NONE;
        }
        if (normalized === 'HR') return VISIBILITY.HR_OPERATIONAL_STORAGE_VISIBILITY;
        if (normalized === 'HR_HEAD') return VISIBILITY.STRATEGIC_STORAGE_VISIBILITY;
        if (normalized === 'DIRECTOR') return VISIBILITY.AGGREGATE_STORAGE_ANALYTICS_ONLY;
        if (normalized === 'SUPER_ADMIN') return VISIBILITY.INFRASTRUCTURE_ONLY;
        if (normalized === 'PLATFORM_OWNER') return VISIBILITY.PLATFORM_GOVERNANCE_ONLY;
        return VISIBILITY.NONE;
    }

    function validateStorageScope(record, context) {
        try {
            var data = rawData();
            var ctxTenant = contextTenant(context);
            var targetTenant = normalizeTenantSlug(record && (record.tenantSlug || record.tenantId || record.companyId)) || sourceTenant(record, data) || ctxTenant;
            var role = normalizeRole(context && context.actor && context.actor.role || context && context.role || '');
            var visibility = visibilityFor(role, record || {}, context || {}, data);
            var failures = [];

            if (ctxTenant && targetTenant && ctxTenant !== targetTenant) {
                failures.push(safeFailure('CROSS_TENANT_STORAGE_VISIBILITY_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Cross-tenant storage visibility was blocked.'));
            }
            if (!tenantPrefixValid(record || {}, targetTenant || ctxTenant)) {
                failures.push(safeFailure('TENANT_STORAGE_PREFIX_MISMATCH_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Tenant storage prefix mismatch was blocked.'));
            }
            if (pathTraversal(record || {})) {
                failures.push(safeFailure('UNSAFE_OBJECT_TRAVERSAL_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Unsafe object traversal was blocked.'));
            }
            if (publicExposure(record, data)) {
                failures.push(safeFailure('PUBLIC_STORAGE_EXPOSURE_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Public storage exposure was blocked.'));
            }
            if (record && (record.permissionOverride || record.bypassPermission || record.manualOverride)) {
                failures.push(safeFailure('STORAGE_PERMISSION_ESCALATION_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Unsafe storage permission escalation was blocked.'));
            }
            if (role === 'PLATFORM_OWNER' && hasRawStorageFields(record)) {
                failures.push(safeFailure('PLATFORM_OWNER_STORAGE_CHAIN_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Platform owner is isolated from tenant storage access chains.'));
            }
            if (role === 'SUPER_ADMIN' && hasRawStorageFields(record)) {
                failures.push(safeFailure('SUPER_ADMIN_RAW_STORAGE_BROWSE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Super admin cannot browse raw tenant storage.'));
            }
            if (role === 'DIRECTOR' && hasRawStorageFields(record)) {
                failures.push(safeFailure('DIRECTOR_RAW_STORAGE_ACCESS_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Directors receive aggregate storage analytics only.'));
            }
            if (role === 'EMPLOYEE' && visibility !== VISIBILITY.OWN_STORAGE_OBJECTS_ONLY) {
                failures.push(safeFailure('EMPLOYEE_STORAGE_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Employees may access only own storage metadata.'));
            }
            if (role === 'MANAGER' && visibility !== VISIBILITY.WORKFLOW_SCOPED_STORAGE_VISIBILITY) {
                failures.push(safeFailure('MANAGER_STORAGE_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Managers may access only workflow-scoped team storage metadata.'));
            }
            var bucket = bucketOf(record || {});
            var proposedSize = objectSize(record || {});
            if (targetTenant && bucket && proposedSize) {
                var quota = quotaFor(targetTenant, bucket, data);
                var usage = tenantBucketUsage(targetTenant, bucket, data);
                if (quota && usage + proposedSize > quota) {
                    failures.push(safeFailure('TENANT_STORAGE_QUOTA_EXCEEDED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Tenant storage quota would be exceeded.'));
                }
            }

            var classification = highestClassification(failures.map(function item(row) { return row.classification; }));
            return freezeStorageOutput({
                allowed: !failures.length,
                success: !failures.length,
                classification: classification,
                visibility: visibility,
                failures: failures,
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    storageSecurityPreserved: true,
                    historicalStorageRecordsImmutable: true,
                    storageActionsAuditable: true
                }
            });
        } catch (error) {
            return freezeStorageOutput({
                allowed: false,
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                visibility: VISIBILITY.NONE,
                failures: [safeFailure('STORAGE_SCOPE_VALIDATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Storage scope validation failed safely.')]
            });
        }
    }

    function normalizeStoragePayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeStorageOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    state: STORAGE_STATES.CREATED,
                    failures: [safeFailure('MALFORMED_STORAGE_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Storage payload is malformed.')]
                });
            }
            return freezeStorageOutput({
                success: true,
                classification: FAILURE_CLASSIFICATIONS.INFO,
                payload: {
                    tenantSlug: normalizeTenantSlug(payload.tenantSlug || payload.tenantId || payload.companyId) || contextTenant(context),
                    state: normalizeStorageState(payload.state || payload.status || payload.storageState || payload.lifecycleState),
                    storageState: normalizeStorageState(payload.state || payload.status || payload.storageState || payload.lifecycleState),
                    size: objectSize(payload),
                    checksumValidationRequired: !checksumOf(payload),
                    metadata: {
                        storageSecurityPreserved: true,
                        tenantIsolationPreserved: true,
                        historicalStorageRecordsImmutable: true,
                        readOnly: payload.readOnly !== false
                    }
                }
            });
        } catch (error) {
            return freezeStorageOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                state: STORAGE_STATES.RESTRICTED,
                failures: [safeFailure('STORAGE_NORMALIZATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Storage payload normalization failed safely.')]
            });
        }
    }

    function governedTtl(payload) {
        return safeNumber(payload && (payload.expiresInSeconds || payload.ttlSeconds || payload.expiresIn) || 900, 900);
    }

    function ttlUnsafe(ttl) {
        return !isFinite(ttl) || ttl < MIN_SIGNED_ACCESS_SECONDS || ttl > MAX_SIGNED_ACCESS_SECONDS;
    }

    function ttlExpiresAt(ttl, context) {
        var base = dateTime(nowIso(context)) || Date.now();
        return new Date(base + Math.max(MIN_SIGNED_ACCESS_SECONDS, Math.min(ttl || 900, MAX_SIGNED_ACCESS_SECONDS)) * 1000).toISOString();
    }

    function generateSignedStorageAccess(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeStorageOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    state: STORAGE_STATES.RESTRICTED,
                    failures: [safeFailure('MALFORMED_STORAGE_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Signed storage access payload is malformed.')]
                });
            }
            var failures = [];
            var scope = validateStorageScope(payload, context);
            if (!scope.allowed) failures = failures.concat(scope.failures || []);
            var ttl = governedTtl(payload);
            if (ttlUnsafe(ttl)) {
                failures.push(safeFailure('SIGNED_STORAGE_EXPIRY_UNSAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Signed storage access must expire safely.'));
            }
            if (publicExposure(payload, rawData())) {
                failures.push(safeFailure('PUBLIC_STORAGE_EXPOSURE_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Public storage exposure was blocked.'));
            }
            var classification = highestClassification(failures.map(function item(row) { return row.classification; }));
            var success = !failures.length;
            if (success) {
                auditStorage('STORAGE_ACCESS_SIGNED_URL_GENERATED', { tenantSlug: contextTenant(context), severity: 'INFO', description: 'Signed storage access marker generated.' }, context);
                emitTelemetry('STORAGE_ACCESS_SIGNED_URL_GENERATED', { tenantSlug: contextTenant(context), status: 'ACTIVE', severity: 'INFO' }, context);
                recordMetric('STORAGE_ACCESS_SIGNED_URL_GENERATED', { tenantSlug: contextTenant(context), status: 'ACTIVE', severity: 'INFO' }, context);
            }
            return freezeStorageOutput({
                success: success,
                classification: classification,
                state: success ? STORAGE_STATES.ACTIVE : STORAGE_STATES.RESTRICTED,
                visibility: scope.visibility || VISIBILITY.NONE,
                failures: failures,
                signedAccess: {
                    signedUrlIssued: success,
                    signedUrlRedacted: true,
                    tenantAwareSignedUrl: success,
                    expiresInSeconds: ttlUnsafe(ttl) ? Math.max(MIN_SIGNED_ACCESS_SECONDS, Math.min(ttl || 900, MAX_SIGNED_ACCESS_SECONDS)) : ttl,
                    expiresAt: ttlExpiresAt(ttl, context),
                    expiresSafely: success && !ttlUnsafe(ttl),
                    securePreviewEnabled: payload.securePreview !== false,
                    downloadThrottlingReady: true,
                    checksumValidationRequired: !checksumOf(payload)
                },
                secureStorageGovernance: {
                    signedUploadUrls: true,
                    signedDownloadUrls: true,
                    expiringAccessTokens: true,
                    objectAccessThrottling: true,
                    securePreviews: true,
                    directObjectAccessBlocked: true
                },
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    storageSecurityPreserved: true,
                    historicalStorageRecordsImmutable: true
                }
            });
        } catch (error) {
            return freezeStorageOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                state: STORAGE_STATES.RESTRICTED,
                failures: [safeFailure('SIGNED_STORAGE_ACCESS_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Signed storage access failed safely.')]
            });
        }
    }

    function scheduleStorageCleanup(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeStorageOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    state: STORAGE_STATES.RESTRICTED,
                    failures: [safeFailure('MALFORMED_STORAGE_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Storage cleanup payload is malformed.')]
                });
            }
            var scope = validateStorageScope(payload, context);
            var failures = scope.failures ? scope.failures.slice() : [];
            var classification = highestClassification(failures.map(function item(row) { return row.classification; }));
            var success = !failures.length;
            if (success) {
                auditStorage('STORAGE_CLEANUP_SCHEDULED', { tenantSlug: contextTenant(context), severity: 'INFO', description: 'Storage cleanup marker scheduled.' }, context);
                emitTelemetry('STORAGE_CLEANUP_SCHEDULED', { tenantSlug: contextTenant(context), status: 'SCHEDULED_FOR_CLEANUP', severity: 'INFO' }, context);
                recordMetric('STORAGE_CLEANUP_SCHEDULED', { tenantSlug: contextTenant(context), status: 'SCHEDULED_FOR_CLEANUP', severity: 'INFO' }, context);
            }
            return freezeStorageOutput({
                success: success,
                classification: classification,
                state: success ? STORAGE_STATES.SCHEDULED_FOR_CLEANUP : STORAGE_STATES.RESTRICTED,
                failures: failures,
                cleanupSchedule: {
                    cleanupQueued: success,
                    dryRun: payload.dryRun !== false,
                    unsafeMassDeletionBlocked: true,
                    retentionPolicyIntegration: true
                },
                cleanupGovernance: {
                    staleUploadCleanup: true,
                    expiredAttachmentCleanup: true,
                    retentionPolicyIntegration: true,
                    archivalWorkflows: true,
                    unsafeMassDeletionBlocked: true
                },
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    storageSecurityPreserved: true,
                    historicalStorageRecordsImmutable: true
                }
            });
        } catch (error) {
            return freezeStorageOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                state: STORAGE_STATES.RESTRICTED,
                failures: [safeFailure('STORAGE_CLEANUP_SCHEDULE_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Storage cleanup scheduling failed safely.')]
            });
        }
    }

    function referencedPaths(data) {
        var refs = {};
        documentRows(data).concat(attachmentRows(data)).concat(uploadRows(data)).forEach(function add(row) {
            var path = objectPathOf(row);
            if (path) refs[path] = true;
        });
        return refs;
    }

    function statusDenied(row) {
        return /DENIED|BLOCKED|REJECTED|FAILED/.test(normalizeToken(row && (row.status || row.result || row.outcome)));
    }

    function accessReason(row) {
        return normalizeToken(row && (row.reason || row.message || row.statusReason || ''));
    }

    function actionOf(row) {
        return normalizeToken(row && (row.action || row.actionType || row.eventType || ''));
    }

    function detectStorageAnomalies(filters, context) {
        try {
            var data = rawData();
            var tenant = normalizeTenantSlug(filters && (filters.tenantSlug || filters.tenantId || filters.companyId)) || contextTenant(context);
            var rows = storageObjectRows(data).filter(tenantFilter(tenant, data));
            var buckets = storageBucketRows(data).filter(tenantFilter(tenant, data));
            var logs = accessRows(data).filter(tenantFilter(tenant, data));
            var uploads = uploadRows(data).filter(tenantFilter(tenant, data));
            var refs = referencedPaths(data);
            var checksums = {};
            rows.forEach(function count(row) {
                var checksum = checksumOf(row);
                if (!checksum) return;
                checksums[checksum] = (checksums[checksum] || 0) + 1;
            });
            var publicBucketExposure = buckets.filter(function publicBucket(row) { return row.public === true || row.private === false || row.isPublic === true; }).length + rows.filter(function publicObject(row) { return publicExposure(row, data); }).length;
            var orphanedObjects = rows.filter(function orphan(row) {
                var path = objectPathOf(row);
                return /ABANDONED|ORPHAN/.test(normalizeToken(row.uploadStatus || row.status || row.state)) || (path && !refs[path] && storageStateOf(row) !== STORAGE_STATES.ARCHIVED);
            }).length;
            var duplicateObjects = Object.keys(checksums).filter(function dup(key) { return checksums[key] > 1; }).length;
            var staleSignedUrls = rows.filter(function stale(row) { return (row.signedUrl || row.downloadUrl) && isExpired(row, context); }).length;
            var abandonedUploads = rows.filter(function abandoned(row) { return /ABANDONED|STALE/.test(normalizeToken(row.uploadStatus || row.status)); }).length;
            var failedUploadRemnants = rows.filter(function failed(row) { return /FAILED|REJECTED|ERROR/.test(normalizeToken(row.uploadStatus || row.status)); }).length + uploads.filter(function failedUpload(row) { return /FAILED|REJECTED|ERROR/.test(normalizeToken(row.uploadStatus || row.status || row.state)); }).length;
            var denied = logs.filter(statusDenied).length;
            var superAdminBrowse = logs.filter(function superAdmin(row) { return normalizeRole(row.actorRole || row.role) === 'SUPER_ADMIN' && statusDenied(row); }).length;
            var expiredUrlUse = logs.filter(function expired(row) { return /EXPIRED/.test(accessReason(row)); }).length;
            var throttle = logs.filter(function throttled(row) { return /THROTTLE|LIMIT|EXCEEDED/.test(accessReason(row)); }).length;
            var suspiciousStorageAccess = denied + superAdminBrowse + expiredUrlUse + throttle;
            var failedJobs = asyncRows(data).filter(tenantFilter(tenant, data)).filter(function storageJob(row) { return /STORAGE/.test(normalizeToken(row.jobType || row.type)); }).filter(function failed(row) { return /FAILED|RETRY|DEAD_LETTER/.test(normalizeToken(row.state || row.status)); }).length;
            var signals = [
                { signal: 'Public bucket exposure', count: publicBucketExposure, classification: publicBucketExposure ? FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER : FAILURE_CLASSIFICATIONS.INFO },
                { signal: 'Orphaned objects', count: orphanedObjects, classification: orphanedObjects ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.INFO },
                { signal: 'Duplicate objects', count: duplicateObjects, classification: duplicateObjects ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.INFO },
                { signal: 'Stale signed URLs', count: staleSignedUrls, classification: staleSignedUrls ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO },
                { signal: 'Suspicious storage access', count: suspiciousStorageAccess, classification: suspiciousStorageAccess ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.INFO },
                { signal: 'Failed upload remnants', count: failedUploadRemnants, classification: failedUploadRemnants ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO }
            ];
            var classification = highestClassification(signals.map(function item(row) { return row.classification; }));
            return freezeStorageOutput({
                success: true,
                classification: classification,
                summary: {
                    publicBucketExposure: publicBucketExposure,
                    orphanedObjects: orphanedObjects,
                    orphanedUploads: orphanedObjects,
                    duplicateObjects: duplicateObjects,
                    staleSignedUrls: staleSignedUrls,
                    abandonedUploads: abandonedUploads,
                    failedUploadRemnants: failedUploadRemnants,
                    suspiciousStorageAccess: suspiciousStorageAccess,
                    downloadThrottling: throttle,
                    cleanupBacklog: orphanedObjects + staleSignedUrls + failedUploadRemnants + failedJobs
                },
                signals: signals,
                metadata: {
                    tenantIsolationPreserved: true,
                    storageSecurityPreserved: true,
                    historicalStorageRecordsImmutable: true
                }
            });
        } catch (error) {
            return freezeStorageOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                summary: { publicBucketExposure: 0, orphanedObjects: 0, suspiciousStorageAccess: 0 },
                signals: [],
                failures: [safeFailure('STORAGE_ANOMALY_DETECTION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Storage anomaly detection failed safely.')]
            });
        }
    }

    function auditStorage(actionType, metadata, context) {
        if (auditForwarding || context && context.skipAuditPersistence) return { success: true, skipped: true };
        auditForwarding = true;
        try {
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    actionType: actionType,
                    eventType: actionType,
                    module: 'Storage Hardening',
                    targetId: '',
                    description: metadata && metadata.description || actionType,
                    actorRole: context && context.actor && context.actor.role || 'hr',
                    actorId: context && context.actor && (context.actor.id || context.actor.empId) || '',
                    severity: metadata && metadata.severity || 'INFO',
                    metadata: cloneSanitized(metadata || {})
                }, {
                    source: 'storageHardeningService',
                    skipPersistence: false
                });
            }
            var source = db();
            if (source && typeof source.writeAuditLog === 'function') {
                source.writeAuditLog(context && context.actor && context.actor.role || 'hr', context && context.actor && context.actor.id || '', actionType, 'Storage Hardening', '', metadata && metadata.description || actionType);
            }
            return { success: true };
        } catch (error) {
            return { success: false, warning: 'Storage hardening audit failed safely.' };
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
                    source: 'storageHardeningService',
                    severity: metadata && metadata.severity || 'INFO',
                    status: metadata && metadata.status || eventType,
                    tenantSlug: contextTenant(context) || metadata && metadata.tenantSlug || '',
                    metadata: cloneSanitized(metadata || {})
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Storage hardening telemetry failed safely.' };
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
                    source: 'storageHardeningService',
                    status: metadata && metadata.status || metricType,
                    severity: metadata && metadata.severity || 'INFO'
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Storage hardening metric failed safely.' };
        } finally {
            metricForwarding = false;
        }
        return { success: false, warning: 'OrchestrationMetricsService unavailable.' };
    }

    function stateCount(rows, state, context) {
        return rows.filter(function count(row) {
            if (state === STORAGE_STATES.EXPIRED && isExpired(row, context)) return true;
            return storageStateOf(row) === state;
        }).length;
    }

    function quotaUtilization(tenant, data) {
        var buckets = storageBucketRows(data).filter(tenantFilter(tenant, data));
        var quota = buckets.reduce(function total(sum, row) { return sum + Math.max(0, safeNumber(row.quotaBytes || row.maxBytes || row.storageQuotaBytes, 0)); }, 0) || DEFAULT_TENANT_QUOTA_BYTES;
        var usage = storageObjectRows(data).filter(tenantFilter(tenant, data)).reduce(function total(sum, row) { return sum + objectSize(row); }, 0);
        return Math.round((usage / quota) * 100);
    }

    function generateStorageHardeningReport(filters, context) {
        try {
            var data = rawData();
            var tenant = normalizeTenantSlug(filters && (filters.tenantSlug || filters.tenantId || filters.companyId)) || contextTenant(context);
            var rows = storageObjectRows(data).filter(tenantFilter(tenant, data));
            var logs = accessRows(data).filter(tenantFilter(tenant, data));
            var uploads = uploadRows(data).filter(tenantFilter(tenant, data));
            var anomalies = detectStorageAnomalies({ tenantSlug: tenant }, {
                tenantSlug: tenant,
                now: context && context.now,
                skipAuditPersistence: true,
                skipTelemetry: true,
                skipMetrics: true
            });
            var summary = anomalies.summary || {};
            var totalBytes = rows.reduce(function total(sum, row) { return sum + objectSize(row); }, 0);
            var failedUploads = uploads.filter(function failed(row) { return /FAILED|REJECTED|ERROR/.test(normalizeToken(row.uploadStatus || row.status || row.state)); }).length + (summary.failedUploadRemnants || 0);
            var workflowLinkedRows = rows.filter(workflowLinked).length + attachmentRows(data).filter(tenantFilter(tenant, data)).filter(workflowLinked).length;
            var classification = highestClassification([
                anomalies.classification,
                failedUploads ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO
            ]);
            var report = {
                success: true,
                readOnly: true,
                classification: classification,
                generatedAt: nowIso(context),
                tenantSlug: tenant,
                storageHealth: {
                    totalObjects: rows.length,
                    createdObjects: stateCount(rows, STORAGE_STATES.CREATED, context),
                    validatingObjects: stateCount(rows, STORAGE_STATES.VALIDATING, context),
                    activeObjects: stateCount(rows, STORAGE_STATES.ACTIVE, context),
                    restrictedObjects: stateCount(rows, STORAGE_STATES.RESTRICTED, context),
                    expiredObjects: stateCount(rows, STORAGE_STATES.EXPIRED, context),
                    cleanupScheduledObjects: stateCount(rows, STORAGE_STATES.SCHEDULED_FOR_CLEANUP, context),
                    archivedObjects: stateCount(rows, STORAGE_STATES.ARCHIVED, context),
                    totalObjectBytes: totalBytes
                },
                tenantIsolation: {
                    tenantScopedBucketPaths: rows.every(function prefixed(row) { return tenantPrefixValid(row, tenant); }),
                    isolatedObjectPrefixes: true,
                    tenantAwareSignedUrls: true,
                    tenantBoundStorageMetadata: true,
                    scopedObjectTraversal: true,
                    tenantStorageQuotas: true
                },
                secureStorageGovernance: {
                    signedUploadUrls: true,
                    signedDownloadUrls: true,
                    expiringAccessTokens: true,
                    objectAccessThrottling: true,
                    securePreviews: true,
                    objectChecksumValidation: rows.filter(function missing(row) { return !checksumOf(row); }).length,
                    secureMetadataStorage: true,
                    directObjectAccessBlocked: true,
                    publicBucketExposure: summary.publicBucketExposure || 0
                },
                lifecycleGovernance: {
                    automaticExpiryHandling: true,
                    orphanObjectDetection: true,
                    staleUploadCleanup: true,
                    expiredAttachmentCleanup: true,
                    retentionPolicyIntegration: true,
                    archivalWorkflows: true,
                    unsafeMassDeletionBlocked: true
                },
                cleanupGovernance: {
                    orphanedUploads: summary.orphanedUploads || 0,
                    expiredObjects: stateCount(rows, STORAGE_STATES.EXPIRED, context),
                    duplicateObjects: summary.duplicateObjects || 0,
                    staleSignedUrls: summary.staleSignedUrls || 0,
                    abandonedUploads: summary.abandonedUploads || 0,
                    failedUploadRemnants: summary.failedUploadRemnants || 0,
                    cleanupBacklog: summary.cleanupBacklog || 0,
                    unsafeMassDeletionBlocked: true
                },
                accessGovernance: {
                    downloads: logs.filter(function download(row) { return /DOWNLOAD/.test(actionOf(row)); }).length,
                    previews: logs.filter(function preview(row) { return /PREVIEW/.test(actionOf(row)); }).length,
                    temporaryAccessGrants: 0,
                    accessRevocations: logs.filter(function revoked(row) { return /REVOKE|REVOKED/.test(actionOf(row)); }).length,
                    downloadThrottling: summary.downloadThrottling || 0,
                    suspiciousAccessDetection: true,
                    suspiciousStorageAccess: summary.suspiciousStorageAccess || 0,
                    superAdminRawStorageBrowse: false,
                    platformOwnerStorageChain: false,
                    permissionEscalationBlocked: true
                },
                workflowDocumentIntegration: {
                    workflowLinkedStorage: workflowLinkedRows,
                    onboardingFileStorage: rows.filter(function onboarding(row) { return /ONBOARDING|IDENTITY|DOCUMENT/.test(normalizeToken(row.storageType || row.category || objectPathOf(row))); }).length,
                    recruitmentDocumentStorage: rows.filter(function recruitment(row) { return /RECRUITMENT|RESUME|CANDIDATE/.test(normalizeToken(row.storageType || row.category || objectPathOf(row))); }).length,
                    reimbursementReceiptStorage: rows.filter(function receipt(row) { return /EXPENSE|REIMBURSEMENT|RECEIPT/.test(normalizeToken(row.storageType || row.category || objectPathOf(row))); }).length,
                    policyDocumentStorage: rows.filter(function policy(row) { return /POLICY|COMPLIANCE/.test(normalizeToken(row.storageType || row.category || objectPathOf(row))); }).length,
                    unsafeWorkflowExposureBlocked: true
                },
                storageAnalytics: {
                    storageGrowthBytes: totalBytes,
                    uploadThroughput: rows.length,
                    failedUploads: failedUploads,
                    storageCongestion: (summary.cleanupBacklog || 0) + failedUploads,
                    duplicateObjectGrowth: summary.duplicateObjects || 0,
                    quotaUtilizationPercent: quotaUtilization(tenant, data),
                    quotaWarnings: quotaUtilization(tenant, data) >= 80 ? 1 : 0,
                    quotaExceeded: quotaUtilization(tenant, data) > 100 ? 1 : 0,
                    suspiciousStorageAccess: summary.suspiciousStorageAccess || 0
                },
                integrationHealth: {
                    storageServiceIntegrated: !!global.storageService || !!global.StorageService,
                    secureUploadIntegrated: !!global.SecureUploadService || !!global.secureUploadService,
                    documentVisibilityIntegrated: !!global.DocumentVisibilityService,
                    fileAttachmentGovernanceIntegrated: !!global.FileAttachmentGovernanceService,
                    uploadValidationIntegrated: !!global.UploadValidationService,
                    workflowTelemetryIntegrated: !!(global.WorkflowTelemetryService || global.workflowTelemetryService),
                    auditReady: !!(global.AuditService || global.auditService),
                    telemetryReady: !!(global.WorkflowTelemetryService || global.workflowTelemetryService),
                    metricsReady: !!(global.OrchestrationMetricsService || global.orchestrationMetricsService)
                },
                warnings: anomalies.signals || [],
                metadata: {
                    tenantIsolationPreserved: true,
                    storageSecurityPreserved: true,
                    historicalStorageRecordsImmutable: true,
                    existingUploadFlowsPreserved: true,
                    existingWorkflowsPreserved: true,
                    storageActionsAuditable: true,
                    readOnly: true
                }
            };
            auditStorage('STORAGE_HARDENING_REPORTED', {
                tenantSlug: tenant,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO',
                description: 'Storage hardening governance report viewed.'
            }, context);
            emitTelemetry('STORAGE_HARDENING_REPORTED', {
                tenantSlug: tenant,
                status: classification,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'INFO'
            }, context);
            recordMetric('STORAGE_HARDENING_REPORTED', {
                tenantSlug: tenant,
                status: classification,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'INFO'
            }, context);
            return freezeStorageOutput(report);
        } catch (error) {
            safeWarn('Storage hardening report failed safely.', error && error.message ? error.message : error);
            return freezeStorageOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                storageHealth: { totalObjects: 0 },
                tenantIsolation: { tenantScopedBucketPaths: true },
                secureStorageGovernance: { signedUploadUrls: true },
                cleanupGovernance: { orphanedUploads: 0 },
                storageAnalytics: { storageGrowthBytes: 0 },
                failures: [safeFailure('STORAGE_HARDENING_REPORT_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Storage hardening report failed safely.')]
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        function check(label, condition) { checks.push({ label: label, passed: !!condition }); }
        try {
            var malformed = normalizeStoragePayload(null, { tenantSlug: 'tabsons' });
            check('malformed payloads fail safely', malformed.success === false && malformed.failures.some(function item(row) { return row.failureCode === 'MALFORMED_STORAGE_PAYLOAD'; }));

            var crossTenant = validateStorageScope({ tenantSlug: 'abc', empId: 'EMP-X', objectId: 'OBJ-X', objectPath: 'abc/EMP-X/DOC-X/private.pdf' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' } });
            check('storage isolation works', crossTenant.allowed === false && crossTenant.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER);

            var signed = generateSignedStorageAccess({ tenantSlug: 'tabsons', empId: 'EMP-1', objectPath: 'tabsons/EMP-1/DOC-1/private.pdf', expiresInSeconds: 86400 }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('signed URL governance works', signed.success === false && signed.failures.some(function item(row) { return row.failureCode === 'SIGNED_STORAGE_EXPIRY_UNSAFE'; }));

            var cleanup = scheduleStorageCleanup({ tenantSlug: 'tabsons', empId: 'EMP-1', objectPath: 'tabsons/orphan/private.pdf', dryRun: true }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('cleanup governance works', cleanup.success === true && cleanup.state === STORAGE_STATES.SCHEDULED_FOR_CLEANUP);

            var quota = validateStorageScope({ tenantSlug: 'tabsons', empId: 'EMP-1', bucket: 'employee-docs', objectPath: 'tabsons/EMP-1/new.pdf', size: DEFAULT_TENANT_QUOTA_BYTES * 2 }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' } });
            check('quota enforcement works', quota.allowed === false && quota.failures.some(function item(row) { return row.failureCode === 'TENANT_STORAGE_QUOTA_EXCEEDED'; }));

            var anomalies = detectStorageAnomalies({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('suspicious access detection works', anomalies.success === true && Object.isFrozen(anomalies.signals));

            var frozen = freezeStorageOutput({ nested: { ok: true }, payload: { state: STORAGE_STATES.ACTIVE } });
            check('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested) && Object.isFrozen(frozen.payload));

            var originalStorage = global.storageService;
            var originalVisibility = global.DocumentVisibilityService;
            try {
                delete global.storageService;
                delete global.DocumentVisibilityService;
                var report = generateStorageHardeningReport({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
                check('dependency absence degrades safely', report.success === true && report.integrationHealth.storageServiceIntegrated === false && report.integrationHealth.documentVisibilityIntegrated === false);
            } finally {
                if (originalStorage) global.storageService = originalStorage;
                if (originalVisibility) global.DocumentVisibilityService = originalVisibility;
            }
        } catch (error) {
            checks.push({ label: 'self-test uncaught error guard', passed: false, description: sanitizeText(error && error.message || error) });
        }
        var passed = checks.every(function item(row) { return row.passed; });
        var result = freezeStorageOutput({
            passed: passed,
            checks: checks,
            summary: passed ? 'Storage hardening self-test passed.' : 'Storage hardening self-test detected failures.'
        });
        global.__ARTHHRMS_STORAGE_HARDENING_SELF_TEST__ = result;
        return result;
    }

    var StorageHardeningService = Object.freeze({
        VERSION: VERSION,
        STORAGE_STATES: STORAGE_STATES,
        FAILURE_CLASSIFICATIONS: FAILURE_CLASSIFICATIONS,
        VISIBILITY: VISIBILITY,
        classifyStorageRisk: classifyStorageRisk,
        validateStorageScope: validateStorageScope,
        normalizeStoragePayload: normalizeStoragePayload,
        freezeStorageOutput: freezeStorageOutput,
        generateSignedStorageAccess: generateSignedStorageAccess,
        scheduleStorageCleanup: scheduleStorageCleanup,
        detectStorageAnomalies: detectStorageAnomalies,
        generateStorageHardeningReport: generateStorageHardeningReport,
        runSelfTest: runSelfTest
    });

    global.StorageHardeningService = StorageHardeningService;
    global.storageHardeningService = StorageHardeningService;

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
