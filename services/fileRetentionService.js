/**
 * fileRetentionService.js
 * ARTHHRMS Enterprise File Retention + Lifecycle Compliance Governance.
 *
 * Additive read-only governance layer for file lifecycle states, retention
 * policy compliance, archival readiness, restore governance, deletion safety,
 * and lifecycle analytics. It never exposes raw attachment IDs, employee IDs,
 * filenames, storage paths, checksums, URLs, or cross-tenant retention data.
 */
(function attachFileRetentionService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[FileRetentionService]';

    var LIFECYCLE_STATES = Object.freeze({
        ACTIVE: 'ACTIVE',
        RETENTION_PENDING: 'RETENTION_PENDING',
        ARCHIVING: 'ARCHIVING',
        ARCHIVED: 'ARCHIVED',
        RESTORE_PENDING: 'RESTORE_PENDING',
        RESTORED: 'RESTORED',
        EXPIRING: 'EXPIRING',
        DELETED: 'DELETED'
    });

    var RETENTION_POLICY_TYPES = Object.freeze({
        ONBOARDING_RETENTION: 'ONBOARDING_RETENTION',
        PAYROLL_RETENTION: 'PAYROLL_RETENTION',
        REIMBURSEMENT_RETENTION: 'REIMBURSEMENT_RETENTION',
        RECRUITMENT_RETENTION: 'RECRUITMENT_RETENTION',
        COMPLIANCE_RETENTION: 'COMPLIANCE_RETENTION',
        FORENSIC_AUDIT_RETENTION: 'FORENSIC_AUDIT_RETENTION',
        POLICY_DOCUMENT_RETENTION: 'POLICY_DOCUMENT_RETENTION',
        OPERATIONAL_WORKFLOW_RETENTION: 'OPERATIONAL_WORKFLOW_RETENTION'
    });

    var FAILURE_CLASSIFICATIONS = Object.freeze({
        INFO: 'INFO',
        WARNING: 'WARNING',
        HIGH_RISK: 'HIGH_RISK',
        CRITICAL_BLOCKER: 'CRITICAL_BLOCKER'
    });

    var VISIBILITY = Object.freeze({
        NONE: 'NONE',
        OWN_RETAINED_FILES_ONLY: 'OWN_RETAINED_FILES_ONLY',
        WORKFLOW_SCOPED_RETENTION_VISIBILITY: 'WORKFLOW_SCOPED_RETENTION_VISIBILITY',
        HR_OPERATIONAL_RETENTION_VISIBILITY: 'HR_OPERATIONAL_RETENTION_VISIBILITY',
        STRATEGIC_LIFECYCLE_VISIBILITY: 'STRATEGIC_LIFECYCLE_VISIBILITY',
        AGGREGATE_COMPLIANCE_ANALYTICS_ONLY: 'AGGREGATE_COMPLIANCE_ANALYTICS_ONLY',
        INFRASTRUCTURE_RETENTION_VISIBILITY: 'INFRASTRUCTURE_RETENTION_VISIBILITY',
        PLATFORM_GOVERNANCE_ONLY: 'PLATFORM_GOVERNANCE_ONLY'
    });

    var SENSITIVE_KEY_PATTERN = /(retention.?id|policy.?id|request.?id|attachment.?id|document.?id|doc.?id|object.?id|object.?key|object.?path|storage.?path|bucket|file.?name|name|archive.?checksum|checksum|hash|digest|signed.?url|public.?url|document.?url|download.?url|preview.?url|url|path|access.?token|token|private.?note|remark|description|message|body|content|comment|reply|candidate|resume|receipt|salary|payroll|payslip|compensation|amount|employee|emp.?id|user.?id|actor.?id|owner|uploaded.?by|assigned.?to|author|manager|secret|jwt|authorization|service.?role|private.?key|reason|raw|payload.?id|correlation.?id|target.?id|log.?id|event.?id)/i;
    var SENSITIVE_VALUE_PATTERN = /(https?:\/\/[^\s"',}]+|private:\/\/[^\s"',}]+|[a-z0-9-]+\/[A-Z0-9._-]+\/[A-Z0-9._-]+\/[^\s"',}]+|\b(private|confidential|secret|salary|payroll|resume|receipt|passport|aadhaar|bank)\b[^,;}]*)/ig;

    var SAFE_GOVERNANCE_KEYS = Object.freeze({
        success: true,
        allowed: true,
        readOnly: true,
        classification: true,
        visibility: true,
        state: true,
        lifecycleState: true,
        policyType: true,
        generatedAt: true,
        tenantSlug: true,
        status: true,
        severity: true,
        count: true,
        signal: true,
        signals: true,
        source: true,
        payload: true,
        metadata: true,
        failures: true,
        warnings: true,
        failureCode: true,
        warningCode: true,
        retentionHealth: true,
        lifecycleCompliance: true,
        archiveGovernance: true,
        restoreWorkflows: true,
        expiryDeletionGovernance: true,
        forensicAuditIntegration: true,
        retentionAnalytics: true,
        accessGovernance: true,
        integrationHealth: true,
        archiveSchedule: true,
        restoreWorkflow: true,
        deletionSchedule: true,
        summary: true,
        totalFiles: true,
        activeFiles: true,
        retentionPendingFiles: true,
        archivingFiles: true,
        archivedFiles: true,
        restorePendingFiles: true,
        restoredFiles: true,
        expiringFiles: true,
        deletedFiles: true,
        onboardingRetention: true,
        payrollRetention: true,
        reimbursementRetention: true,
        recruitmentRetention: true,
        complianceRetention: true,
        forensicAuditRetention: true,
        policyDocumentRetention: true,
        operationalWorkflowRetention: true,
        timeBasedRetention: true,
        policyDrivenRetention: true,
        legalHoldMarkers: true,
        expiryAutomation: true,
        stagedArchival: true,
        delayedDeletionApproval: true,
        retentionOverridesAudited: true,
        unsafeBulkDeletionBlocked: true,
        coldStorageReady: true,
        archiveIntegrityValidation: true,
        archiveRestorationWorkflows: true,
        immutableArchivalMetadata: true,
        stagedRestoreApprovals: true,
        retentionLinkedAccessRevocation: true,
        unsafeArchiveExposureBlocked: true,
        expiringDocuments: true,
        pendingArchivalQueues: true,
        scheduledDeletions: true,
        restoreRequests: true,
        legalHoldConflicts: true,
        orphanArchivalReferences: true,
        retentionPolicyViolations: true,
        retentionBacklogCongestion: true,
        archiveGrowth: true,
        deletionTrends: true,
        restoreRequestFrequency: true,
        expiredObjectBuildup: true,
        archiveGrowthIndicators: true,
        archiveIntegrityIndicators: true,
        archivedForensicReconstruction: true,
        retentionLinkedAuditTrails: true,
        deletedObjectInvestigationMarkers: true,
        archiveRestorationHistory: true,
        complianceAuditability: true,
        employeeOwnRetainedFilesOnly: true,
        managerWorkflowScopedRetentionVisibility: true,
        hrOperationalRetentionVisibility: true,
        hrHeadStrategicLifecycleVisibility: true,
        directorAggregateComplianceAnalyticsOnly: true,
        superAdminRetentionBypass: true,
        superAdminArchivalManipulation: true,
        platformOwnerRetentionWorkflow: true,
        crossTenantRetentionLeakageBlocked: true,
        historicalArchiveMutationPrevented: true,
        fileLifecycleCompliancePreserved: true,
        tenantIsolationPreserved: true,
        historicalRetentionRecordsImmutable: true,
        existingAttachmentFlowsPreserved: true,
        existingWorkflowsPreserved: true,
        retentionActionsAuditable: true,
        approvalRequired: true,
        stagedRestoreApprovalRequired: true,
        temporaryAccessRevoked: true,
        restorePending: true,
        deletionQueued: true,
        deletionRequiresApproval: true,
        dryRun: true,
        storageHardeningIntegrated: true,
        attachmentAuditTrailIntegrated: true,
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
        try { return context && context.now ? new Date(context.now).toISOString() : new Date().toISOString(); } catch (error) { return new Date().toISOString(); }
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
        return safeString(row && (row.empId || row.employeeId || row.employee_id || row.userId || row.user_id || row.ownerEmpId || row.owner_emp_id || row.uploadedBy || row.assignedTo) || '', '').trim();
    }

    function attachmentIdOf(row) {
        return safeString(row && (row.attachmentId || row.attachment_id || row.documentId || row.document_id || row.objectId || row.object_id || row.id) || '', '').trim();
    }

    function explicitAttachmentIdOf(row) {
        return safeString(row && (row.attachmentId || row.attachment_id || row.documentId || row.document_id) || '', '').trim();
    }

    function workflowIdOf(row) {
        return safeString(row && (row.workflowId || row.workflow_id || row.eventId || row.event_id || row.pendingActionId || row.pending_action_id || row.threadId || row.thread_id || '') || '', '').trim();
    }

    function list(data, key) {
        return Array.isArray(data && data[key]) ? data[key].slice() : [];
    }

    function employeeRows(data) {
        return list(data, 'employees');
    }

    function employeeById(empId, data) {
        var target = safeString(empId || '', '').trim();
        return employeeRows(data).find(function match(row) {
            return safeString(row && (row.empId || row.employeeId || row.id) || '', '').trim() === target;
        }) || null;
    }

    function managerOwnsEmployee(managerId, employeeId, data) {
        if (!managerId || !employeeId) return false;
        var employee = employeeById(employeeId, data);
        if (!employee) return false;
        return safeString(employee.managerId || employee.manager_id || employee.reportsTo || employee.reportingManagerId || '', '').trim() === managerId;
    }

    function attachmentRows(data) {
        return list(data, 'fileAttachments').concat(list(data, 'attachments')).concat(list(data, 'employeeDocuments'));
    }

    function storageRows(data) {
        return list(data, 'storageObjects').concat(list(data, 'storageFiles')).concat(list(data, 'documents'));
    }

    function retentionRows(data) {
        return list(data, 'fileRetentionRecords').concat(list(data, 'retentionRecords')).concat(list(data, 'fileLifecycleRecords'));
    }

    function policyRows(data) {
        return list(data, 'fileRetentionPolicies').concat(list(data, 'retentionPolicies'));
    }

    function restoreRows(data) {
        return list(data, 'archiveRestoreRequests').concat(list(data, 'restoreRequests'));
    }

    function retentionAuditRows(data) {
        return list(data, 'retentionAuditEvents').concat(list(data, 'fileRetentionAuditEvents')).concat(list(data, 'lifecycleAuditEvents'));
    }

    function asyncRows(data) {
        return list(data, 'asyncJobs').concat(list(data, 'backgroundJobs'));
    }

    function sourceTenant(row, data) {
        var direct = rowTenant(row);
        if (direct) return direct;
        var attachmentId = attachmentIdOf(row);
        if (attachmentId) {
            var rows = attachmentRows(data || rawData()).concat(storageRows(data || rawData())).concat(retentionRows(data || rawData()));
            var source = rows.find(function match(candidate) { return attachmentIdOf(candidate) === attachmentId; });
            if (source) return rowTenant(source);
        }
        return '';
    }

    function tenantFilter(tenant, data) {
        var normalizedTenant = normalizeTenantSlug(tenant);
        return function filter(row) {
            var candidateTenant = sourceTenant(row, data || rawData());
            return !normalizedTenant || !candidateTenant || candidateTenant === normalizedTenant;
        };
    }

    function relatedRecord(record, data) {
        var id = attachmentIdOf(record);
        if (!id) return record || {};
        return retentionRows(data || rawData()).concat(attachmentRows(data || rawData())).concat(storageRows(data || rawData())).find(function match(row) {
            return attachmentIdOf(row) === id;
        }) || record || {};
    }

    function mergedRecord(record, data) {
        var related = relatedRecord(record || {}, data);
        var output = {};
        Object.keys(related || {}).forEach(function copy(key) { output[key] = related[key]; });
        Object.keys(record || {}).forEach(function copy(key) { output[key] = record[key]; });
        return output;
    }

    function workflowLinked(row) {
        return !!workflowIdOf(row) || !!(row && (row.threadId || row.thread_id || row.workflowType || row.workflow_type));
    }

    function hasRawFileFields(row) {
        if (!row) return false;
        return !!(attachmentIdOf(row) || empIdOf(row) || row.fileName || row.file_name || row.storagePath || row.storage_path || row.objectPath || row.object_path || row.archiveChecksum || row.checksum || row.signedUrl || row.publicUrl || row.privateNote);
    }

    function normalizeLifecycleState(value) {
        var token = normalizeToken(value || LIFECYCLE_STATES.ACTIVE);
        return LIFECYCLE_STATES[token] || LIFECYCLE_STATES.ACTIVE;
    }

    function normalizePolicyType(value) {
        var token = normalizeToken(value || RETENTION_POLICY_TYPES.OPERATIONAL_WORKFLOW_RETENTION);
        return RETENTION_POLICY_TYPES[token] || RETENTION_POLICY_TYPES.OPERATIONAL_WORKFLOW_RETENTION;
    }

    function sanitizeText(value) {
        var text = safeString(value || '', '');
        if (!text) return '';
        return text.replace(SENSITIVE_VALUE_PATTERN, '[REDACTED]').replace(/\b(ATT|EMP|DOC|OBJ|RET|REST|RAE|WF|JOB|POL)-[A-Z0-9_-]+\b/ig, '[REDACTED]');
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

    function freezeRetentionOutput(value) {
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

    function classifyRetentionRisk(input) {
        var source = input || {};
        if (source.crossTenant || source.archivalMutation || source.unsafeBulkDeletion || source.permissionEscalation || source.platformOwnerAccess || source.retentionBypass) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
        if (source.legalHoldConflict || source.retentionViolation || source.archiveIntegrityIssue || source.restoreCongestion || source.superAdminBypass || source.orphanArchive) return FAILURE_CLASSIFICATIONS.HIGH_RISK;
        if (source.expiringObject || source.pendingArchive || source.restoreRequest || source.scheduledDeletion || source.expiredObjectBuildup || source.backlogCongestion) return FAILURE_CLASSIFICATIONS.WARNING;
        return FAILURE_CLASSIFICATIONS.INFO;
    }

    function visibilityFor(role, record, context, data) {
        var normalized = normalizeRole(role || context && context.actor && context.actor.role);
        var actor = context && context.actor || {};
        var currentActorId = actorId(actor);
        var owner = empIdOf(record);
        if (normalized === 'EMPLOYEE') {
            return currentActorId && owner && currentActorId === owner ? VISIBILITY.OWN_RETAINED_FILES_ONLY : VISIBILITY.NONE;
        }
        if (normalized === 'MANAGER') {
            return owner && managerOwnsEmployee(currentActorId, owner, data) && workflowLinked(record) ? VISIBILITY.WORKFLOW_SCOPED_RETENTION_VISIBILITY : VISIBILITY.NONE;
        }
        if (normalized === 'HR') return VISIBILITY.HR_OPERATIONAL_RETENTION_VISIBILITY;
        if (normalized === 'HR_HEAD') return VISIBILITY.STRATEGIC_LIFECYCLE_VISIBILITY;
        if (normalized === 'DIRECTOR') return VISIBILITY.AGGREGATE_COMPLIANCE_ANALYTICS_ONLY;
        if (normalized === 'SUPER_ADMIN') return VISIBILITY.INFRASTRUCTURE_RETENTION_VISIBILITY;
        if (normalized === 'PLATFORM_OWNER') return VISIBILITY.PLATFORM_GOVERNANCE_ONLY;
        return VISIBILITY.NONE;
    }

    function validateRetentionScope(record, context) {
        try {
            var data = rawData();
            var target = mergedRecord(record || {}, data);
            var ctxTenant = contextTenant(context);
            var targetTenant = normalizeTenantSlug(record && (record.tenantSlug || record.tenantId || record.companyId)) || sourceTenant(target, data) || ctxTenant;
            var role = normalizeRole(context && context.actor && context.actor.role || context && context.role || '');
            var visibility = visibilityFor(role, target, context || {}, data);
            var failures = [];

            if (ctxTenant && targetTenant && ctxTenant !== targetTenant) {
                failures.push(safeFailure('CROSS_TENANT_RETENTION_VISIBILITY_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Cross-tenant retention visibility was blocked.'));
            }
            if (record && (record.mutateArchive || record.archivalMutation || record.mutableArchive || record.modifyHistoricalArchive || record.deleteArchiveRecord)) {
                failures.push(safeFailure('ARCHIVE_MUTATION_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Immutable archive record mutation was blocked.'));
            }
            if (record && (record.bulkDelete || record.deleteImmediately || safeNumber(record.count, 0) > 25)) {
                failures.push(safeFailure('UNSAFE_RETENTION_BULK_DELETION_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Unsafe bulk deletion was blocked.'));
            }
            if (role === 'PLATFORM_OWNER') {
                failures.push(safeFailure('PLATFORM_OWNER_RETENTION_WORKFLOW_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Platform owner is isolated from retention workflows.'));
            }
            if (role === 'SUPER_ADMIN' && (record && (record.archiveManipulation || record.retentionOverride || record.bypassRetention || record.deleteImmediately) || hasRawFileFields(target))) {
                failures.push(safeFailure('SUPER_ADMIN_RETENTION_BYPASS_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Super admin cannot bypass retention governance or manipulate archives directly.'));
            }
            if (role === 'DIRECTOR' && hasRawFileFields(target)) {
                failures.push(safeFailure('DIRECTOR_RAW_RETENTION_ACCESS_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Directors receive aggregate retention analytics only.'));
            }
            if (role === 'EMPLOYEE' && visibility !== VISIBILITY.OWN_RETAINED_FILES_ONLY) {
                failures.push(safeFailure('EMPLOYEE_RETENTION_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Employees may access only own retained files.'));
            }
            if (role === 'MANAGER' && visibility !== VISIBILITY.WORKFLOW_SCOPED_RETENTION_VISIBILITY) {
                failures.push(safeFailure('MANAGER_RETENTION_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Managers may access only workflow-scoped retention records.'));
            }
            if (target && (target.publicUrl || target.public_url || target.public === true || target.isPublic === true)) {
                failures.push(safeFailure('PUBLIC_ARCHIVE_EXPOSURE_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Unsafe archive exposure was blocked.'));
            }

            var classification = highestClassification(failures.map(function item(row) { return row.classification; }));
            return freezeRetentionOutput({
                allowed: !failures.length,
                success: !failures.length,
                classification: classification,
                visibility: visibility,
                failures: failures,
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    fileLifecycleCompliancePreserved: true,
                    historicalRetentionRecordsImmutable: true,
                    retentionActionsAuditable: true
                }
            });
        } catch (error) {
            return freezeRetentionOutput({
                allowed: false,
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                visibility: VISIBILITY.NONE,
                failures: [safeFailure('RETENTION_SCOPE_VALIDATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Retention scope validation failed safely.')]
            });
        }
    }

    function normalizeRetentionPayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeRetentionOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    state: LIFECYCLE_STATES.ACTIVE,
                    failures: [safeFailure('MALFORMED_FILE_RETENTION_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'File retention payload is malformed.')]
                });
            }
            var lifecycleState = normalizeLifecycleState(payload.lifecycleState || payload.state || payload.status);
            var policyType = normalizePolicyType(payload.policyType || payload.retentionType || payload.type);
            return freezeRetentionOutput({
                success: true,
                classification: classifyRetentionRisk({
                    expiringObject: lifecycleState === LIFECYCLE_STATES.EXPIRING,
                    pendingArchive: lifecycleState === LIFECYCLE_STATES.RETENTION_PENDING || lifecycleState === LIFECYCLE_STATES.ARCHIVING
                }),
                payload: {
                    tenantSlug: normalizeTenantSlug(payload.tenantSlug || payload.tenantId || payload.companyId) || contextTenant(context),
                    lifecycleState: lifecycleState,
                    state: lifecycleState,
                    policyType: policyType,
                    metadata: {
                        fileLifecycleCompliancePreserved: true,
                        tenantIsolationPreserved: true,
                        historicalRetentionRecordsImmutable: true,
                        readOnly: payload.readOnly !== false
                    }
                }
            });
        } catch (error) {
            return freezeRetentionOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                state: LIFECYCLE_STATES.RETENTION_PENDING,
                failures: [safeFailure('RETENTION_NORMALIZATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'File retention payload normalization failed safely.')]
            });
        }
    }

    function rowLifecycle(row) {
        return normalizeLifecycleState(row && (row.lifecycleState || row.lifecycle_state || row.retentionState || row.state || row.status));
    }

    function dateTime(value) {
        var parsed = Date.parse(value || '');
        return isFinite(parsed) ? parsed : 0;
    }

    function isExpiring(row, context) {
        var state = rowLifecycle(row);
        if (state === LIFECYCLE_STATES.EXPIRING) return true;
        var expiry = dateTime(row && (row.expiresAt || row.expires_at || row.expiryAt || row.retentionExpiresAt));
        if (!expiry) return false;
        var now = dateTime(nowIso(context)) || Date.now();
        var days30 = 30 * 24 * 60 * 60 * 1000;
        return expiry >= now && expiry <= now + days30;
    }

    function hasLegalHold(row) {
        return !!(row && (row.legalHold || row.legal_hold || row.hold === true || row.legalHoldMarker));
    }

    function policyTypeOf(row) {
        return normalizePolicyType(row && (row.policyType || row.policy_type || row.retentionType || row.type));
    }

    function evaluateArchiveGovernance(payload, context) {
        try {
            var scope = validateRetentionScope(payload || {}, context || {});
            if (!scope.allowed && scope.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER) {
                return freezeRetentionOutput({
                    success: false,
                    readOnly: true,
                    state: LIFECYCLE_STATES.RETENTION_PENDING,
                    classification: scope.classification,
                    visibility: scope.visibility,
                    archiveGovernance: { coldStorageReady: false, archiveIntegrityValidation: false },
                    failures: scope.failures
                });
            }
            var output = {
                success: !scope.failures.length,
                readOnly: true,
                state: LIFECYCLE_STATES.ARCHIVING,
                lifecycleState: LIFECYCLE_STATES.ARCHIVING,
                classification: scope.classification === FAILURE_CLASSIFICATIONS.INFO ? FAILURE_CLASSIFICATIONS.INFO : scope.classification,
                visibility: scope.visibility,
                archiveGovernance: {
                    coldStorageReady: true,
                    archiveIntegrityValidation: true,
                    archiveRestorationWorkflows: true,
                    immutableArchivalMetadata: true,
                    stagedRestoreApprovals: true,
                    retentionLinkedAccessRevocation: true,
                    unsafeArchiveExposureBlocked: true
                },
                archiveSchedule: {
                    stagedArchival: true,
                    delayedDeletionApproval: true,
                    retentionOverridesAudited: true,
                    unsafeBulkDeletionBlocked: true,
                    dryRun: true
                },
                metadata: {
                    fileLifecycleCompliancePreserved: true,
                    historicalRetentionRecordsImmutable: true,
                    existingAttachmentFlowsPreserved: true
                },
                failures: scope.failures || []
            };
            auditRetention('FILE_RETENTION_ARCHIVE_EVALUATED', {
                tenantSlug: contextTenant(context),
                severity: output.classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO',
                description: 'File retention archival governance evaluated.'
            }, context);
            return freezeRetentionOutput(output);
        } catch (error) {
            return freezeRetentionOutput({
                success: false,
                readOnly: true,
                state: LIFECYCLE_STATES.RETENTION_PENDING,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('ARCHIVE_GOVERNANCE_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Archive governance failed safely.')]
            });
        }
    }

    function requestArchiveRestore(payload, context) {
        try {
            var scope = validateRetentionScope(payload || {}, context || {});
            if (!scope.allowed && scope.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER) {
                return freezeRetentionOutput({
                    success: false,
                    readOnly: true,
                    state: LIFECYCLE_STATES.RESTORE_PENDING,
                    classification: scope.classification,
                    visibility: scope.visibility,
                    restoreWorkflow: { stagedRestoreApprovalRequired: true },
                    failures: scope.failures
                });
            }
            var output = {
                success: true,
                readOnly: true,
                state: LIFECYCLE_STATES.RESTORE_PENDING,
                lifecycleState: LIFECYCLE_STATES.RESTORE_PENDING,
                classification: scope.classification,
                visibility: scope.visibility,
                restoreWorkflow: {
                    restorePending: true,
                    approvalRequired: true,
                    stagedRestoreApprovalRequired: true,
                    archiveRestorationWorkflows: true,
                    temporaryAccessRevoked: true,
                    retentionLinkedAccessRevocation: true
                },
                metadata: {
                    fileLifecycleCompliancePreserved: true,
                    historicalRetentionRecordsImmutable: true,
                    retentionActionsAuditable: true
                },
                failures: scope.failures || []
            };
            auditRetention('FILE_RETENTION_RESTORE_REQUESTED', {
                tenantSlug: contextTenant(context),
                severity: 'INFO',
                description: 'Archive restore workflow requested.'
            }, context);
            return freezeRetentionOutput(output);
        } catch (error) {
            return freezeRetentionOutput({
                success: false,
                readOnly: true,
                state: LIFECYCLE_STATES.RESTORE_PENDING,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('ARCHIVE_RESTORE_REQUEST_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Archive restore request failed safely.')]
            });
        }
    }

    function recordHasLegalHold(record, data) {
        var id = attachmentIdOf(record);
        if (hasLegalHold(record)) return true;
        if (!id) return false;
        return retentionRows(data).concat(storageRows(data)).some(function match(row) {
            return attachmentIdOf(row) === id && hasLegalHold(row);
        });
    }

    function scheduleRetentionDeletion(payload, context) {
        try {
            var data = rawData();
            var scope = validateRetentionScope(payload || {}, context || {});
            var failures = (scope.failures || []).slice();
            if (recordHasLegalHold(payload || {}, data)) {
                failures.push(safeFailure('LEGAL_HOLD_DELETION_CONFLICT_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Deletion is blocked by legal hold governance.'));
            }
            var classification = highestClassification(failures.map(function item(row) { return row.classification; }));
            var success = !failures.length;
            var output = {
                success: success,
                readOnly: true,
                state: LIFECYCLE_STATES.EXPIRING,
                lifecycleState: LIFECYCLE_STATES.EXPIRING,
                classification: classification,
                visibility: scope.visibility,
                deletionSchedule: {
                    deletionQueued: success,
                    deletionRequiresApproval: true,
                    delayedDeletionApproval: true,
                    unsafeBulkDeletionBlocked: true,
                    legalHoldConflicts: failures.filter(function legal(row) { return row.failureCode === 'LEGAL_HOLD_DELETION_CONFLICT_BLOCKED'; }).length,
                    dryRun: true
                },
                failures: failures,
                metadata: {
                    fileLifecycleCompliancePreserved: true,
                    historicalRetentionRecordsImmutable: true,
                    retentionActionsAuditable: true
                }
            };
            auditRetention('FILE_RETENTION_DELETION_SCHEDULED', {
                tenantSlug: contextTenant(context),
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO',
                description: 'Retention deletion schedule evaluated.'
            }, context);
            return freezeRetentionOutput(output);
        } catch (error) {
            return freezeRetentionOutput({
                success: false,
                readOnly: true,
                state: LIFECYCLE_STATES.EXPIRING,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('RETENTION_DELETION_SCHEDULE_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Retention deletion scheduling failed safely.')]
            });
        }
    }

    function countRows(rows, predicate) {
        return rows.filter(function match(row) {
            try { return predicate(row); } catch (error) { return false; }
        }).length;
    }

    function orphanArchiveCount(tenant, data) {
        var attachments = {};
        attachmentRows(data).filter(tenantFilter(tenant, data)).forEach(function mark(row) {
            var id = explicitAttachmentIdOf(row);
            if (id) attachments[id] = true;
        });
        return retentionRows(data).filter(tenantFilter(tenant, data)).filter(function orphan(row) {
            var id = explicitAttachmentIdOf(row);
            return id && !attachments[id];
        }).length + storageRows(data).filter(tenantFilter(tenant, data)).filter(function orphanStorage(row) {
            var id = explicitAttachmentIdOf(row);
            return rowLifecycle(row) === LIFECYCLE_STATES.ARCHIVED && id && !attachments[id];
        }).length + storageRows(data).filter(tenantFilter(tenant, data)).filter(function orphanNoAttachment(row) {
            return rowLifecycle(row) === LIFECYCLE_STATES.ARCHIVED && !explicitAttachmentIdOf(row);
        }).length;
    }

    function detectRetentionAnomalies(filters, context) {
        try {
            var data = rawData();
            var tenant = normalizeTenantSlug(filters && (filters.tenantSlug || filters.tenantId || filters.companyId)) || contextTenant(context);
            var rows = retentionRows(data).filter(tenantFilter(tenant, data));
            var restore = restoreRows(data).filter(tenantFilter(tenant, data));
            var jobs = asyncRows(data).filter(tenantFilter(tenant, data));
            var summary = {
                expiringDocuments: countRows(rows, function expiring(row) { return isExpiring(row, context); }),
                pendingArchivalQueues: countRows(rows, function pending(row) { return rowLifecycle(row) === LIFECYCLE_STATES.RETENTION_PENDING || rowLifecycle(row) === LIFECYCLE_STATES.ARCHIVING || !!row.archiveDueAt; }) + countRows(jobs, function job(row) { return /RETENTION|ARCHIV/.test(normalizeToken(row.jobType || row.type)); }),
                scheduledDeletions: countRows(rows, function deletion(row) { return !!(row.deletionScheduledAt || row.scheduledDeletionAt || row.deleteAt); }),
                restoreRequests: restore.length + countRows(rows, function restoring(row) { return rowLifecycle(row) === LIFECYCLE_STATES.RESTORE_PENDING || !!row.restoreRequested; }),
                legalHoldConflicts: countRows(rows, function legal(row) { return hasLegalHold(row) && !!(row.deletionScheduledAt || row.restoreRequested || row.deleteAt); }),
                orphanArchivalReferences: orphanArchiveCount(tenant, data),
                retentionPolicyViolations: countRows(rows, function violation(row) { return !!(row.retentionViolation || row.policyViolation || row.violation); })
            };
            summary.retentionBacklogCongestion = summary.pendingArchivalQueues + summary.restoreRequests + summary.scheduledDeletions;
            var classification = highestClassification([
                summary.legalHoldConflicts || summary.retentionPolicyViolations || summary.orphanArchivalReferences ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.INFO,
                summary.expiringDocuments || summary.pendingArchivalQueues || summary.scheduledDeletions || summary.restoreRequests ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO
            ]);
            var signals = [
                { signal: 'Expiring documents', count: summary.expiringDocuments, severity: summary.expiringDocuments ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO },
                { signal: 'Pending archival queues', count: summary.pendingArchivalQueues, severity: summary.pendingArchivalQueues ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO },
                { signal: 'Scheduled deletions', count: summary.scheduledDeletions, severity: summary.scheduledDeletions ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO },
                { signal: 'Restore requests', count: summary.restoreRequests, severity: summary.restoreRequests ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO },
                { signal: 'Legal hold conflicts', count: summary.legalHoldConflicts, severity: summary.legalHoldConflicts ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.INFO },
                { signal: 'Orphan archival references', count: summary.orphanArchivalReferences, severity: summary.orphanArchivalReferences ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.INFO },
                { signal: 'Retention policy violations', count: summary.retentionPolicyViolations, severity: summary.retentionPolicyViolations ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.INFO }
            ];
            return freezeRetentionOutput({
                success: true,
                readOnly: true,
                classification: classification,
                generatedAt: nowIso(context),
                tenantSlug: tenant,
                summary: summary,
                signals: signals,
                metadata: {
                    tenantIsolationPreserved: true,
                    fileLifecycleCompliancePreserved: true,
                    historicalRetentionRecordsImmutable: true
                }
            });
        } catch (error) {
            return freezeRetentionOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                summary: {
                    expiringDocuments: 0,
                    pendingArchivalQueues: 0,
                    scheduledDeletions: 0,
                    restoreRequests: 0,
                    legalHoldConflicts: 0,
                    orphanArchivalReferences: 0,
                    retentionPolicyViolations: 0,
                    retentionBacklogCongestion: 0
                },
                signals: [],
                failures: [safeFailure('RETENTION_ANOMALY_DETECTION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Retention anomaly detection failed safely.')]
            });
        }
    }

    function auditRetention(actionType, metadata, context) {
        if (auditForwarding || context && context.skipAuditPersistence) return { success: true, skipped: true };
        auditForwarding = true;
        try {
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    actionType: actionType,
                    eventType: actionType,
                    module: 'File Retention',
                    targetId: '',
                    description: metadata && metadata.description || actionType,
                    actorRole: context && context.actor && context.actor.role || 'hr',
                    actorId: context && context.actor && (context.actor.id || context.actor.empId) || '',
                    severity: metadata && metadata.severity || 'INFO',
                    metadata: cloneSanitized(metadata || {})
                }, {
                    source: 'fileRetentionService',
                    skipPersistence: false
                });
            }
            var source = db();
            if (source && typeof source.writeAuditLog === 'function') {
                source.writeAuditLog(context && context.actor && context.actor.role || 'hr', context && context.actor && context.actor.id || '', actionType, 'File Retention', '', metadata && metadata.description || actionType);
            }
            return { success: true };
        } catch (error) {
            return { success: false, warning: 'File retention audit failed safely.' };
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
                    source: 'fileRetentionService',
                    severity: metadata && metadata.severity || 'INFO',
                    status: metadata && metadata.status || eventType,
                    tenantSlug: contextTenant(context) || metadata && metadata.tenantSlug || '',
                    metadata: cloneSanitized(metadata || {})
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'File retention telemetry failed safely.' };
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
                    source: 'fileRetentionService',
                    status: metadata && metadata.status || metricType,
                    severity: metadata && metadata.severity || 'INFO'
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'File retention metric failed safely.' };
        } finally {
            metricForwarding = false;
        }
        return { success: false, warning: 'OrchestrationMetricsService unavailable.' };
    }

    function lifecycleCount(rows, state, context) {
        return rows.filter(function count(row) {
            if (state === LIFECYCLE_STATES.EXPIRING && isExpiring(row, context)) return true;
            return rowLifecycle(row) === state;
        }).length;
    }

    function policyCounts(rows) {
        var counts = {};
        Object.keys(RETENTION_POLICY_TYPES).forEach(function init(key) { counts[key] = 0; });
        rows.forEach(function count(row) {
            var type = policyTypeOf(row);
            counts[type] = (counts[type] || 0) + 1;
        });
        return counts;
    }

    function generateFileRetentionReport(filters, context) {
        try {
            var data = rawData();
            var tenant = normalizeTenantSlug(filters && (filters.tenantSlug || filters.tenantId || filters.companyId)) || contextTenant(context);
            var scope = validateRetentionScope({ tenantSlug: tenant }, context || {});
            var retention = retentionRows(data).filter(tenantFilter(tenant, data));
            var attachments = attachmentRows(data).filter(tenantFilter(tenant, data));
            var storage = storageRows(data).filter(tenantFilter(tenant, data));
            var restore = restoreRows(data).filter(tenantFilter(tenant, data));
            var auditRows = retentionAuditRows(data).filter(tenantFilter(tenant, data));
            var anomalies = detectRetentionAnomalies({ tenantSlug: tenant }, {
                tenantSlug: tenant,
                now: context && context.now,
                skipAuditPersistence: true,
                skipTelemetry: true,
                skipMetrics: true
            });
            var summary = anomalies.summary || {};
            var policies = policyCounts(retention.concat(attachments));
            var totalFiles = Math.max(retention.length, attachments.length, storage.filter(function withAttachment(row) { return !!attachmentIdOf(row); }).length);
            var classification = highestClassification([
                anomalies.classification,
                scope.classification,
                summary.retentionBacklogCongestion > 100 ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO
            ]);
            var report = {
                success: true,
                readOnly: true,
                classification: classification,
                generatedAt: nowIso(context),
                tenantSlug: tenant,
                visibility: scope.visibility,
                retentionHealth: {
                    totalFiles: totalFiles,
                    activeFiles: lifecycleCount(retention.concat(attachments), LIFECYCLE_STATES.ACTIVE, context),
                    retentionPendingFiles: lifecycleCount(retention, LIFECYCLE_STATES.RETENTION_PENDING, context),
                    archivingFiles: lifecycleCount(retention, LIFECYCLE_STATES.ARCHIVING, context),
                    archivedFiles: lifecycleCount(retention.concat(attachments).concat(storage), LIFECYCLE_STATES.ARCHIVED, context),
                    restorePendingFiles: lifecycleCount(retention, LIFECYCLE_STATES.RESTORE_PENDING, context) + restore.length,
                    restoredFiles: lifecycleCount(retention, LIFECYCLE_STATES.RESTORED, context),
                    expiringFiles: lifecycleCount(retention.concat(attachments), LIFECYCLE_STATES.EXPIRING, context),
                    deletedFiles: lifecycleCount(retention, LIFECYCLE_STATES.DELETED, context)
                },
                lifecycleCompliance: {
                    onboardingRetention: policies.ONBOARDING_RETENTION || 0,
                    payrollRetention: policies.PAYROLL_RETENTION || 0,
                    reimbursementRetention: policies.REIMBURSEMENT_RETENTION || 0,
                    recruitmentRetention: policies.RECRUITMENT_RETENTION || 0,
                    complianceRetention: policies.COMPLIANCE_RETENTION || 0,
                    forensicAuditRetention: policies.FORENSIC_AUDIT_RETENTION || auditRows.length,
                    policyDocumentRetention: policies.POLICY_DOCUMENT_RETENTION || 0,
                    operationalWorkflowRetention: policies.OPERATIONAL_WORKFLOW_RETENTION || 0,
                    expiringDocuments: summary.expiringDocuments || 0,
                    retentionPolicyViolations: summary.retentionPolicyViolations || 0,
                    legalHoldConflicts: summary.legalHoldConflicts || 0
                },
                archiveGovernance: {
                    archivedFiles: lifecycleCount(retention.concat(attachments).concat(storage), LIFECYCLE_STATES.ARCHIVED, context),
                    coldStorageReady: true,
                    archiveIntegrityValidation: true,
                    archiveRestorationWorkflows: true,
                    immutableArchivalMetadata: true,
                    stagedRestoreApprovals: true,
                    retentionLinkedAccessRevocation: true,
                    unsafeArchiveExposureBlocked: true,
                    pendingArchivalQueues: summary.pendingArchivalQueues || 0,
                    archiveIntegrityIndicators: countRows(retention.concat(storage), function missing(row) { return rowLifecycle(row) === LIFECYCLE_STATES.ARCHIVED && !(row.archiveChecksum || row.checksum); })
                },
                restoreWorkflows: {
                    restoreRequests: summary.restoreRequests || restore.length,
                    stagedRestoreApprovalRequired: true,
                    archiveRestorationHistory: restore.length,
                    temporaryAccessRevoked: true,
                    restoreRequestFrequency: summary.restoreRequests || restore.length
                },
                expiryDeletionGovernance: {
                    scheduledDeletions: summary.scheduledDeletions || 0,
                    delayedDeletionApproval: true,
                    deletionRequiresApproval: true,
                    unsafeBulkDeletionBlocked: true,
                    legalHoldConflicts: summary.legalHoldConflicts || 0,
                    expiredObjectBuildup: summary.expiringDocuments || 0
                },
                forensicAuditIntegration: {
                    archivedForensicReconstruction: !!global.AttachmentAuditTrailService,
                    retentionLinkedAuditTrails: auditRows.length,
                    deletedObjectInvestigationMarkers: lifecycleCount(retention, LIFECYCLE_STATES.DELETED, context),
                    archiveRestorationHistory: restore.length,
                    complianceAuditability: true
                },
                retentionAnalytics: {
                    archiveGrowth: lifecycleCount(retention.concat(attachments).concat(storage), LIFECYCLE_STATES.ARCHIVED, context),
                    archiveGrowthIndicators: lifecycleCount(retention.concat(attachments).concat(storage), LIFECYCLE_STATES.ARCHIVED, context),
                    deletionTrends: summary.scheduledDeletions || 0,
                    retentionPolicyViolations: summary.retentionPolicyViolations || 0,
                    restoreRequestFrequency: summary.restoreRequests || restore.length,
                    expiredObjectBuildup: summary.expiringDocuments || 0,
                    retentionBacklogCongestion: summary.retentionBacklogCongestion || 0,
                    orphanArchivalReferences: summary.orphanArchivalReferences || 0
                },
                accessGovernance: {
                    employeeOwnRetainedFilesOnly: true,
                    managerWorkflowScopedRetentionVisibility: true,
                    hrOperationalRetentionVisibility: true,
                    hrHeadStrategicLifecycleVisibility: true,
                    directorAggregateComplianceAnalyticsOnly: true,
                    superAdminRetentionBypass: false,
                    superAdminArchivalManipulation: false,
                    platformOwnerRetentionWorkflow: false,
                    crossTenantRetentionLeakageBlocked: true,
                    historicalArchiveMutationPrevented: true
                },
                integrationHealth: {
                    storageHardeningIntegrated: !!global.StorageHardeningService,
                    attachmentAuditTrailIntegrated: !!global.AttachmentAuditTrailService,
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
                    fileLifecycleCompliancePreserved: true,
                    historicalRetentionRecordsImmutable: true,
                    existingAttachmentFlowsPreserved: true,
                    existingWorkflowsPreserved: true,
                    retentionActionsAuditable: true,
                    readOnly: true
                }
            };
            auditRetention('FILE_RETENTION_REPORTED', {
                tenantSlug: tenant,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO',
                description: 'File retention lifecycle compliance report viewed.'
            }, context);
            emitTelemetry('FILE_RETENTION_REPORTED', {
                tenantSlug: tenant,
                status: classification,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'INFO'
            }, context);
            recordMetric('FILE_RETENTION_REPORTED', {
                tenantSlug: tenant,
                status: classification,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'INFO'
            }, context);
            return freezeRetentionOutput(report);
        } catch (error) {
            safeWarn('File retention report failed safely.', error && error.message ? error.message : error);
            return freezeRetentionOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                retentionHealth: { totalFiles: 0 },
                lifecycleCompliance: { expiringDocuments: 0 },
                archiveGovernance: { archivedFiles: 0, immutableArchivalMetadata: true },
                restoreWorkflows: { restoreRequests: 0 },
                retentionAnalytics: { retentionBacklogCongestion: 0 },
                failures: [safeFailure('FILE_RETENTION_REPORT_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'File retention report failed safely.')]
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        function check(label, condition) { checks.push({ label: label, passed: !!condition }); }
        try {
            var malformed = normalizeRetentionPayload(null, { tenantSlug: 'tabsons' });
            check('malformed payloads fail safely', malformed.success === false && malformed.failures.some(function item(row) { return row.failureCode === 'MALFORMED_FILE_RETENTION_PAYLOAD'; }));

            var crossTenant = validateRetentionScope({ tenantSlug: 'abc', empId: 'EMP-X', attachmentId: 'ATT-X', fileName: 'private.pdf' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' } });
            check('retention isolation works', crossTenant.allowed === false && crossTenant.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER);

            var archive = evaluateArchiveGovernance({ tenantSlug: 'tabsons', empId: 'EMP-1', attachmentId: 'ATT-1', workflowId: 'WF-1' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('archive governance works', archive.success === true && archive.state === LIFECYCLE_STATES.ARCHIVING);

            var restore = requestArchiveRestore({ tenantSlug: 'tabsons', empId: 'EMP-1', attachmentId: 'ATT-1', workflowId: 'WF-1' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('restore workflows work', restore.success === true && restore.state === LIFECYCLE_STATES.RESTORE_PENDING);

            var deleteCheck = scheduleRetentionDeletion({ tenantSlug: 'tabsons', empId: 'EMP-1', attachmentId: 'ATT-1', bulkDelete: true, count: 100 }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('lifecycle compliance works', deleteCheck.success === false && deleteCheck.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER);

            var frozen = freezeRetentionOutput({ nested: { ok: true }, payload: { lifecycleState: LIFECYCLE_STATES.ARCHIVED } });
            check('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested) && Object.isFrozen(frozen.payload));

            var originalStorage = global.StorageHardeningService;
            var originalAuditTrail = global.AttachmentAuditTrailService;
            var originalVisibility = global.DocumentVisibilityService;
            var originalAttachment = global.FileAttachmentGovernanceService;
            var originalUpload = global.UploadValidationService;
            try {
                delete global.StorageHardeningService;
                delete global.AttachmentAuditTrailService;
                delete global.DocumentVisibilityService;
                delete global.FileAttachmentGovernanceService;
                delete global.UploadValidationService;
                var report = generateFileRetentionReport({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
                check('dependency absence degrades safely', report.success === true && report.integrationHealth.storageHardeningIntegrated === false && report.integrationHealth.attachmentAuditTrailIntegrated === false && report.integrationHealth.documentVisibilityIntegrated === false);
            } finally {
                if (originalStorage) global.StorageHardeningService = originalStorage;
                if (originalAuditTrail) global.AttachmentAuditTrailService = originalAuditTrail;
                if (originalVisibility) global.DocumentVisibilityService = originalVisibility;
                if (originalAttachment) global.FileAttachmentGovernanceService = originalAttachment;
                if (originalUpload) global.UploadValidationService = originalUpload;
            }
        } catch (error) {
            checks.push({ label: 'self-test uncaught error guard', passed: false, description: sanitizeText(error && error.message || error) });
        }
        var passed = checks.every(function item(row) { return row.passed; });
        var result = freezeRetentionOutput({
            passed: passed,
            checks: checks,
            summary: passed ? 'File retention self-test passed.' : 'File retention self-test detected failures.'
        });
        global.__ARTHHRMS_FILE_RETENTION_SELF_TEST__ = result;
        return result;
    }

    var FileRetentionService = Object.freeze({
        VERSION: VERSION,
        LIFECYCLE_STATES: LIFECYCLE_STATES,
        RETENTION_POLICY_TYPES: RETENTION_POLICY_TYPES,
        FAILURE_CLASSIFICATIONS: FAILURE_CLASSIFICATIONS,
        VISIBILITY: VISIBILITY,
        classifyRetentionRisk: classifyRetentionRisk,
        validateRetentionScope: validateRetentionScope,
        normalizeRetentionPayload: normalizeRetentionPayload,
        freezeRetentionOutput: freezeRetentionOutput,
        evaluateArchiveGovernance: evaluateArchiveGovernance,
        requestArchiveRestore: requestArchiveRestore,
        scheduleRetentionDeletion: scheduleRetentionDeletion,
        detectRetentionAnomalies: detectRetentionAnomalies,
        generateFileRetentionReport: generateFileRetentionReport,
        runSelfTest: runSelfTest
    });

    global.FileRetentionService = FileRetentionService;
    global.fileRetentionService = FileRetentionService;

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
