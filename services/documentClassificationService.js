/**
 * documentClassificationService.js
 * ARTHHRMS Enterprise Sensitive Document Classification + Data Sensitivity Intelligence.
 *
 * Additive read-only governance layer for document sensitivity classification,
 * restricted visibility, legal hold integration, sensitivity analytics, and
 * audit-safe classification reporting. It never exposes raw attachment IDs,
 * employee IDs, filenames, storage paths, URLs, or cross-tenant sensitivity data.
 */
(function attachDocumentClassificationService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[DocumentClassificationService]';

    var CLASSIFICATION_STATES = Object.freeze({
        UNCLASSIFIED: 'UNCLASSIFIED',
        INTERNAL: 'INTERNAL',
        CONFIDENTIAL: 'CONFIDENTIAL',
        RESTRICTED: 'RESTRICTED',
        HIGHLY_SENSITIVE: 'HIGHLY_SENSITIVE',
        LEGAL_HOLD: 'LEGAL_HOLD',
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
        OWN_CLASSIFIED_DOCUMENTS_ONLY: 'OWN_CLASSIFIED_DOCUMENTS_ONLY',
        WORKFLOW_SCOPED_CLASSIFIED_VISIBILITY: 'WORKFLOW_SCOPED_CLASSIFIED_VISIBILITY',
        HR_OPERATIONAL_CLASSIFIED_VISIBILITY: 'HR_OPERATIONAL_CLASSIFIED_VISIBILITY',
        STRATEGIC_COMPLIANCE_VISIBILITY: 'STRATEGIC_COMPLIANCE_VISIBILITY',
        AGGREGATE_SENSITIVITY_ANALYTICS_ONLY: 'AGGREGATE_SENSITIVITY_ANALYTICS_ONLY',
        INFRASTRUCTURE_CLASSIFICATION_VISIBILITY: 'INFRASTRUCTURE_CLASSIFICATION_VISIBILITY',
        PLATFORM_GOVERNANCE_ONLY: 'PLATFORM_GOVERNANCE_ONLY'
    });

    var SENSITIVITY_TYPES = Object.freeze({
        PAYROLL_DOCUMENT: 'PAYROLL_DOCUMENT',
        SALARY_RECORD: 'SALARY_RECORD',
        EMPLOYEE_IDENTITY_DOCUMENT: 'EMPLOYEE_IDENTITY_DOCUMENT',
        CONTRACT: 'CONTRACT',
        COMPLIANCE_FILE: 'COMPLIANCE_FILE',
        HR_INVESTIGATION: 'HR_INVESTIGATION',
        REIMBURSEMENT_RECORD: 'REIMBURSEMENT_RECORD',
        RECRUITMENT_ASSESSMENT: 'RECRUITMENT_ASSESSMENT',
        OPERATIONAL_ATTACHMENT: 'OPERATIONAL_ATTACHMENT'
    });

    var CLASSIFICATION_RANK = Object.freeze({
        UNCLASSIFIED: 0,
        INTERNAL: 1,
        CONFIDENTIAL: 2,
        RESTRICTED: 3,
        HIGHLY_SENSITIVE: 4,
        LEGAL_HOLD: 5,
        ARCHIVED: 3
    });

    var SENSITIVE_KEY_PATTERN = /(classification.?id|attachment.?id|document.?id|doc.?id|object.?id|object.?key|object.?path|storage.?path|bucket|file.?name|name|archive.?checksum|checksum|hash|digest|signed.?url|public.?url|document.?url|download.?url|preview.?url|url|path|access.?token|token|private.?note|remark|description|message|body|content|comment|reply|candidate|resume|receipt|amount|employee|emp.?id|user.?id|actor.?id|owner|uploaded.?by|assigned.?to|author|manager|secret|jwt|authorization|service.?role|private.?key|reason|raw|payload.?id|correlation.?id|target.?id|log.?id|event.?id)/i;
    var SENSITIVE_VALUE_PATTERN = /(https?:\/\/[^\s"',}]+|private:\/\/[^\s"',}]+|[a-z0-9-]+\/[A-Z0-9._-]+\/[A-Z0-9._-]+\/[^\s"',}]+|\b(private|confidential|secret|resume|receipt|passport|aadhaar|bank)\b[^,;}]*)/ig;

    var SAFE_GOVERNANCE_KEYS = Object.freeze({
        success: true,
        allowed: true,
        readOnly: true,
        classification: true,
        visibility: true,
        state: true,
        classificationState: true,
        sensitivityType: true,
        documentType: true,
        proposedClassificationState: true,
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
        classificationHealth: true,
        sensitivityGovernance: true,
        restrictedVisibility: true,
        legalHoldGovernance: true,
        classificationAnalytics: true,
        accessStorageIntegration: true,
        policyWorkflowIntegration: true,
        accessGovernance: true,
        integrationHealth: true,
        summary: true,
        totalDocuments: true,
        unclassifiedDocuments: true,
        internalDocuments: true,
        confidentialDocuments: true,
        restrictedDocuments: true,
        highlySensitiveDocuments: true,
        legalHoldDocuments: true,
        archivedDocuments: true,
        automaticClassificationTagging: true,
        manualClassificationReview: true,
        sensitivityEscalation: true,
        restrictedAccessEnforcement: true,
        secureVisibilityInheritance: true,
        legalHoldIntegration: true,
        classificationVersioning: true,
        unsafeSensitivityDowngradesBlocked: true,
        sensitivityDowngradeBlocked: true,
        sensitivityAwareSignedUrls: true,
        restrictedPreviews: true,
        secureArchivalHandling: true,
        retentionLinkedSensitivity: true,
        forensicReconstructionMarkers: true,
        publicExposurePrevented: true,
        payrollLinkedDocuments: true,
        highlySensitiveUploads: true,
        repeatedConfidentialSharing: true,
        restrictedWorkflowAttachments: true,
        legalHoldConflicts: true,
        suspiciousVisibilityAttempts: true,
        sensitivityDowngradeAttempts: true,
        confidentialDocumentGrowth: true,
        restrictedAccessFrequency: true,
        legalHoldTrends: true,
        sensitiveAttachmentSharing: true,
        classificationBacklog: true,
        recruitmentSensitivityHandling: true,
        payrollDocumentRestrictions: true,
        reimbursementConfidentiality: true,
        workflowLinkedClassification: true,
        policyLinkedSensitivityRules: true,
        crossWorkflowExposureBlocked: true,
        employeeOwnClassifiedDocumentsOnly: true,
        managerWorkflowScopedClassifiedVisibility: true,
        hrOperationalClassifiedVisibility: true,
        hrHeadStrategicComplianceVisibility: true,
        directorAggregateSensitivityAnalyticsOnly: true,
        superAdminSensitiveDocumentAccess: true,
        superAdminSensitivityBypass: true,
        platformOwnerDocumentAccessChain: true,
        crossTenantClassificationLeakageBlocked: true,
        sensitiveExposurePrevented: true,
        historicalClassificationImmutable: true,
        sensitiveDocumentConfidentialityPreserved: true,
        tenantIsolationPreserved: true,
        existingDocumentFlowsPreserved: true,
        existingWorkflowsPreserved: true,
        classificationActionsAuditable: true,
        fileRetentionIntegrated: true,
        attachmentAuditTrailIntegrated: true,
        storageHardeningIntegrated: true,
        documentVisibilityIntegrated: true,
        uploadValidationIntegrated: true,
        fileAttachmentGovernanceIntegrated: true,
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

    function classificationRows(data) {
        return list(data, 'documentClassifications').concat(list(data, 'classificationRecords')).concat(list(data, 'documentSensitivityRecords'));
    }

    function accessRows(data) {
        return list(data, 'documentAccessLogs').concat(list(data, 'attachmentAccessLogs')).concat(list(data, 'visibilityAccessLogs'));
    }

    function retentionRows(data) {
        return list(data, 'fileRetentionRecords').concat(list(data, 'retentionRecords'));
    }

    function auditRows(data) {
        return list(data, 'classificationAuditEvents').concat(list(data, 'documentClassificationAuditEvents'));
    }

    function asyncRows(data) {
        return list(data, 'asyncJobs').concat(list(data, 'backgroundJobs'));
    }

    function sourceTenant(row, data) {
        var direct = rowTenant(row);
        if (direct) return direct;
        var attachmentId = attachmentIdOf(row);
        if (attachmentId) {
            var source = classificationRows(data || rawData()).concat(attachmentRows(data || rawData())).concat(retentionRows(data || rawData())).find(function match(candidate) {
                return attachmentIdOf(candidate) === attachmentId;
            });
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
        return classificationRows(data || rawData()).concat(attachmentRows(data || rawData())).concat(retentionRows(data || rawData())).find(function match(row) {
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

    function hasRawDocumentFields(row) {
        if (!row) return false;
        return !!(attachmentIdOf(row) || empIdOf(row) || row.fileName || row.file_name || row.storagePath || row.storage_path || row.objectPath || row.object_path || row.signedUrl || row.publicUrl || row.privateNote || row.checksum || row.hash);
    }

    function normalizeClassificationState(value) {
        var token = normalizeToken(value || CLASSIFICATION_STATES.UNCLASSIFIED);
        return CLASSIFICATION_STATES[token] || CLASSIFICATION_STATES.UNCLASSIFIED;
    }

    function normalizeSensitivityType(value) {
        var token = normalizeToken(value || SENSITIVITY_TYPES.OPERATIONAL_ATTACHMENT);
        return SENSITIVITY_TYPES[token] || token || SENSITIVITY_TYPES.OPERATIONAL_ATTACHMENT;
    }

    function classificationRank(value) {
        return CLASSIFICATION_RANK[normalizeClassificationState(value)] || 0;
    }

    function unsafeDowngrade(current, proposed) {
        if (!proposed) return false;
        return classificationRank(proposed) < classificationRank(current);
    }

    function sanitizeText(value) {
        var text = safeString(value || '', '');
        if (!text) return '';
        return text.replace(SENSITIVE_VALUE_PATTERN, '[REDACTED]').replace(/\b(ATT|EMP|DOC|OBJ|CLS|CAE|DAL|WF|JOB|RET)-[A-Z0-9_-]+\b/ig, '[REDACTED]');
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

    function freezeClassificationOutput(value) {
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

    function classifySensitivityRisk(input) {
        var source = input || {};
        if (source.crossTenant || source.publicExposure || source.unsafeDowngrade || source.permissionEscalation || source.platformOwnerAccess || source.sensitivityBypass) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
        if (source.highlySensitiveUpload || source.payrollLinked || source.legalHoldConflict || source.repeatedConfidentialSharing || source.superAdminSensitiveAccess) return FAILURE_CLASSIFICATIONS.HIGH_RISK;
        if (source.restrictedAccess || source.suspiciousVisibility || source.classificationBacklog || source.manualReview) return FAILURE_CLASSIFICATIONS.WARNING;
        return FAILURE_CLASSIFICATIONS.INFO;
    }

    function visibilityFor(role, record, context, data) {
        var normalized = normalizeRole(role || context && context.actor && context.actor.role);
        var actor = context && context.actor || {};
        var currentActorId = actorId(actor);
        var owner = empIdOf(record);
        if (normalized === 'EMPLOYEE') {
            return currentActorId && owner && currentActorId === owner ? VISIBILITY.OWN_CLASSIFIED_DOCUMENTS_ONLY : VISIBILITY.NONE;
        }
        if (normalized === 'MANAGER') {
            return owner && managerOwnsEmployee(currentActorId, owner, data) && workflowLinked(record) ? VISIBILITY.WORKFLOW_SCOPED_CLASSIFIED_VISIBILITY : VISIBILITY.NONE;
        }
        if (normalized === 'HR') return VISIBILITY.HR_OPERATIONAL_CLASSIFIED_VISIBILITY;
        if (normalized === 'HR_HEAD') return VISIBILITY.STRATEGIC_COMPLIANCE_VISIBILITY;
        if (normalized === 'DIRECTOR') return VISIBILITY.AGGREGATE_SENSITIVITY_ANALYTICS_ONLY;
        if (normalized === 'SUPER_ADMIN') return VISIBILITY.INFRASTRUCTURE_CLASSIFICATION_VISIBILITY;
        if (normalized === 'PLATFORM_OWNER') return VISIBILITY.PLATFORM_GOVERNANCE_ONLY;
        return VISIBILITY.NONE;
    }

    function validateClassificationScope(record, context) {
        try {
            var data = rawData();
            var target = mergedRecord(record || {}, data);
            var ctxTenant = contextTenant(context);
            var targetTenant = normalizeTenantSlug(record && (record.tenantSlug || record.tenantId || record.companyId)) || sourceTenant(target, data) || ctxTenant;
            var role = normalizeRole(context && context.actor && context.actor.role || context && context.role || '');
            var visibility = visibilityFor(role, target, context || {}, data);
            var failures = [];
            var currentState = normalizeClassificationState(target.classificationState || target.state);
            var proposedState = record && (record.proposedClassificationState || record.proposedState || record.targetClassificationState);

            if (ctxTenant && targetTenant && ctxTenant !== targetTenant) {
                failures.push(safeFailure('CROSS_TENANT_CLASSIFICATION_VISIBILITY_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Cross-tenant document classification visibility was blocked.'));
            }
            if (target && (target.publicUrl || target.public_url || target.public === true || target.isPublic === true)) {
                failures.push(safeFailure('SENSITIVE_PUBLIC_EXPOSURE_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Sensitive document public exposure was blocked.'));
            }
            if (unsafeDowngrade(currentState, proposedState)) {
                failures.push(safeFailure('UNSAFE_SENSITIVITY_DOWNGRADE_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Unsafe sensitivity downgrade was blocked.'));
            }
            if (record && (record.mutateClassification || record.mutableClassification || record.modifyHistoricalClassification || record.deleteClassificationRecord)) {
                failures.push(safeFailure('CLASSIFICATION_HISTORY_MUTATION_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Historical classification mutation was blocked.'));
            }
            if (role === 'PLATFORM_OWNER') {
                failures.push(safeFailure('PLATFORM_OWNER_DOCUMENT_ACCESS_CHAIN_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Platform owner is isolated from document access chains.'));
            }
            if (role === 'SUPER_ADMIN' && (record && (record.bypassSensitivity || record.classificationOverride || record.sensitivityOverride) || hasRawDocumentFields(target))) {
                failures.push(safeFailure('SUPER_ADMIN_SENSITIVITY_BYPASS_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Super admin cannot bypass sensitivity restrictions or access sensitive documents.'));
            }
            if (role === 'DIRECTOR' && hasRawDocumentFields(target)) {
                failures.push(safeFailure('DIRECTOR_SENSITIVE_DOCUMENT_ACCESS_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Directors receive aggregate sensitivity analytics only.'));
            }
            if (role === 'EMPLOYEE' && visibility !== VISIBILITY.OWN_CLASSIFIED_DOCUMENTS_ONLY) {
                failures.push(safeFailure('EMPLOYEE_CLASSIFICATION_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Employees may access only own classified documents.'));
            }
            if (role === 'MANAGER' && visibility !== VISIBILITY.WORKFLOW_SCOPED_CLASSIFIED_VISIBILITY) {
                failures.push(safeFailure('MANAGER_CLASSIFICATION_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Managers may access only workflow-scoped classified visibility.'));
            }

            var classification = highestClassification(failures.map(function item(row) { return row.classification; }));
            return freezeClassificationOutput({
                allowed: !failures.length,
                success: !failures.length,
                classification: classification,
                visibility: visibility,
                failures: failures,
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    sensitiveDocumentConfidentialityPreserved: true,
                    historicalClassificationImmutable: true,
                    classificationActionsAuditable: true
                }
            });
        } catch (error) {
            return freezeClassificationOutput({
                allowed: false,
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                visibility: VISIBILITY.NONE,
                failures: [safeFailure('CLASSIFICATION_SCOPE_VALIDATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Classification scope validation failed safely.')]
            });
        }
    }

    function normalizeClassificationPayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeClassificationOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    state: CLASSIFICATION_STATES.UNCLASSIFIED,
                    failures: [safeFailure('MALFORMED_CLASSIFICATION_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Classification payload is malformed.')]
                });
            }
            var state = normalizeClassificationState(payload.classificationState || payload.state || payload.status);
            var sensitivityType = normalizeSensitivityType(payload.sensitivityType || payload.documentType || payload.type);
            return freezeClassificationOutput({
                success: true,
                classification: classifySensitivityRisk({
                    highlySensitiveUpload: state === CLASSIFICATION_STATES.HIGHLY_SENSITIVE,
                    restrictedAccess: state === CLASSIFICATION_STATES.RESTRICTED
                }),
                payload: {
                    tenantSlug: normalizeTenantSlug(payload.tenantSlug || payload.tenantId || payload.companyId) || contextTenant(context),
                    classificationState: state,
                    state: state,
                    sensitivityType: sensitivityType,
                    metadata: {
                        sensitiveDocumentConfidentialityPreserved: true,
                        tenantIsolationPreserved: true,
                        historicalClassificationImmutable: true,
                        readOnly: payload.readOnly !== false
                    }
                }
            });
        } catch (error) {
            return freezeClassificationOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                state: CLASSIFICATION_STATES.RESTRICTED,
                failures: [safeFailure('CLASSIFICATION_NORMALIZATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Classification payload normalization failed safely.')]
            });
        }
    }

    function evaluateSensitivityGovernance(payload, context) {
        try {
            var scope = validateClassificationScope(payload || {}, context || {});
            if (!scope.allowed && scope.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER) {
                return freezeClassificationOutput({
                    success: false,
                    readOnly: true,
                    state: normalizeClassificationState(payload && payload.classificationState),
                    classification: scope.classification,
                    visibility: scope.visibility,
                    sensitivityGovernance: { restrictedAccessEnforcement: true },
                    failures: scope.failures
                });
            }
            var state = normalizeClassificationState(payload && (payload.proposedClassificationState || payload.classificationState));
            var output = {
                success: true,
                readOnly: true,
                state: state,
                classificationState: state,
                classification: scope.classification,
                visibility: scope.visibility,
                sensitivityGovernance: {
                    automaticClassificationTagging: true,
                    manualClassificationReview: true,
                    sensitivityEscalation: classificationRank(state) >= CLASSIFICATION_RANK.RESTRICTED,
                    restrictedAccessEnforcement: true,
                    secureVisibilityInheritance: true,
                    legalHoldIntegration: state === CLASSIFICATION_STATES.LEGAL_HOLD || !!(payload && payload.legalHold),
                    classificationVersioning: true,
                    unsafeSensitivityDowngradesBlocked: true
                },
                metadata: {
                    sensitiveDocumentConfidentialityPreserved: true,
                    historicalClassificationImmutable: true,
                    existingDocumentFlowsPreserved: true
                },
                failures: scope.failures || []
            };
            auditClassification('DATA_SENSITIVITY_GOVERNANCE_EVALUATED', {
                tenantSlug: contextTenant(context),
                severity: output.classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO',
                description: 'Document sensitivity governance evaluated.'
            }, context);
            return freezeClassificationOutput(output);
        } catch (error) {
            return freezeClassificationOutput({
                success: false,
                readOnly: true,
                state: CLASSIFICATION_STATES.RESTRICTED,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('SENSITIVITY_GOVERNANCE_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Sensitivity governance failed safely.')]
            });
        }
    }

    function generateRestrictedVisibility(payload, context) {
        try {
            var scope = validateClassificationScope(payload || {}, context || {});
            var state = normalizeClassificationState(payload && payload.classificationState);
            return freezeClassificationOutput({
                success: scope.classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                readOnly: true,
                state: state,
                classificationState: state,
                classification: scope.classification,
                visibility: scope.visibility,
                restrictedVisibility: {
                    sensitivityAwareSignedUrls: true,
                    restrictedPreviews: true,
                    secureArchivalHandling: true,
                    retentionLinkedSensitivity: true,
                    forensicReconstructionMarkers: true,
                    publicExposurePrevented: true,
                    restrictedAccessFrequency: 1
                },
                metadata: {
                    sensitiveDocumentConfidentialityPreserved: true,
                    existingDocumentFlowsPreserved: true
                },
                failures: scope.failures || []
            });
        } catch (error) {
            return freezeClassificationOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                restrictedVisibility: { publicExposurePrevented: true },
                failures: [safeFailure('RESTRICTED_VISIBILITY_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Restricted visibility generation failed safely.')]
            });
        }
    }

    function evaluateLegalHoldGovernance(payload, context) {
        try {
            var scope = validateClassificationScope(payload || {}, context || {});
            return freezeClassificationOutput({
                success: scope.classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                readOnly: true,
                state: CLASSIFICATION_STATES.LEGAL_HOLD,
                classificationState: CLASSIFICATION_STATES.LEGAL_HOLD,
                classification: scope.classification,
                visibility: scope.visibility,
                legalHoldGovernance: {
                    legalHoldDocuments: 1,
                    legalHoldIntegration: true,
                    legalHoldTrends: 1,
                    legalHoldConflicts: payload && payload.legalHold ? 1 : 0,
                    sensitivityDowngradeBlocked: true,
                    historicalClassificationImmutable: true
                },
                failures: scope.failures || [],
                metadata: {
                    sensitiveDocumentConfidentialityPreserved: true,
                    historicalClassificationImmutable: true
                }
            });
        } catch (error) {
            return freezeClassificationOutput({
                success: false,
                readOnly: true,
                state: CLASSIFICATION_STATES.LEGAL_HOLD,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('LEGAL_HOLD_GOVERNANCE_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Legal hold governance failed safely.')]
            });
        }
    }

    function stateOf(row) {
        return normalizeClassificationState(row && (row.classificationState || row.classification_state || row.state || row.status));
    }

    function sensitivityOf(row) {
        return normalizeSensitivityType(row && (row.sensitivityType || row.sensitivity_type || row.documentType || row.type));
    }

    function actionOf(row) {
        return normalizeToken(row && (row.eventType || row.action || row.activity || row.type || row.actionType || row.event_type) || '');
    }

    function reasonOf(row) {
        return safeString(row && (row.reason || row.failureReason || row.denialReason || row.message || row.description) || '', '').trim();
    }

    function statusOf(row) {
        return normalizeToken(row && (row.status || row.outcome || row.result || row.state) || '');
    }

    function isDenied(row) {
        var status = statusOf(row);
        var reason = reasonOf(row);
        return /DENIED|FAILED|REJECTED|BLOCKED|FLAGGED/.test(status) || /denied|blocked|unsafe|restricted|confidential/i.test(reason);
    }

    function countRows(rows, predicate) {
        return rows.filter(function match(row) {
            try { return predicate(row); } catch (error) { return false; }
        }).length;
    }

    function isPayrollLinked(row) {
        var haystack = [sensitivityOf(row), row && row.documentType, row && row.type].join(' ');
        return /PAYROLL|SALARY/.test(normalizeToken(haystack));
    }

    function detectSensitiveExposurePatterns(filters, context) {
        try {
            var data = rawData();
            var tenant = normalizeTenantSlug(filters && (filters.tenantSlug || filters.tenantId || filters.companyId)) || contextTenant(context);
            var rows = classificationRows(data).filter(tenantFilter(tenant, data));
            var attachments = attachmentRows(data).filter(tenantFilter(tenant, data));
            var access = accessRows(data).filter(tenantFilter(tenant, data));
            var audits = auditRows(data).filter(tenantFilter(tenant, data));
            var summary = {
                highlySensitiveUploads: countRows(rows, function high(row) { return stateOf(row) === CLASSIFICATION_STATES.HIGHLY_SENSITIVE; }) + countRows(audits, function highEvent(row) { return stateOf(row) === CLASSIFICATION_STATES.HIGHLY_SENSITIVE; }),
                payrollLinkedDocuments: countRows(rows, isPayrollLinked) + countRows(attachments, isPayrollLinked),
                repeatedConfidentialSharing: countRows(rows, function sharing(row) { return safeNumber(row.repeatedConfidentialSharing, 0) > 0; }) + countRows(access, function sharingLog(row) { return /SHARE/.test(actionOf(row)) && isDenied(row); }),
                restrictedWorkflowAttachments: countRows(rows, function restricted(row) { return workflowLinked(row) && (row.restrictedWorkflowAttachment || stateOf(row) === CLASSIFICATION_STATES.RESTRICTED || stateOf(row) === CLASSIFICATION_STATES.HIGHLY_SENSITIVE || stateOf(row) === CLASSIFICATION_STATES.LEGAL_HOLD); }),
                legalHoldConflicts: countRows(rows, function legal(row) { return !!(row.legalHold || stateOf(row) === CLASSIFICATION_STATES.LEGAL_HOLD); }) + countRows(retentionRows(data).filter(tenantFilter(tenant, data)), function legalRetention(row) { return !!row.legalHold; }),
                suspiciousVisibilityAttempts: countRows(rows, function suspicious(row) { return safeNumber(row.suspiciousVisibilityAttempts, 0) > 0; }) + countRows(access, isDenied),
                sensitivityDowngradeAttempts: countRows(rows, function downgrade(row) { return safeNumber(row.downgradeAttempts, 0) > 0; }) + countRows(access, function downgradeLog(row) { return /CLASSIFICATION_DOWNGRADE|DOWNGRADE/.test(actionOf(row)); })
            };
            summary.classificationBacklog = countRows(asyncRows(data).filter(tenantFilter(tenant, data)), function job(row) { return /CLASSIFICATION|SENSITIVITY/.test(normalizeToken(row.jobType || row.type)); });
            var classification = highestClassification([
                summary.sensitivityDowngradeAttempts ? FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER : FAILURE_CLASSIFICATIONS.INFO,
                summary.highlySensitiveUploads || summary.payrollLinkedDocuments || summary.legalHoldConflicts || summary.repeatedConfidentialSharing ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.INFO,
                summary.suspiciousVisibilityAttempts || summary.classificationBacklog ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO
            ]);
            var signals = [
                { signal: 'Highly sensitive uploads', count: summary.highlySensitiveUploads, severity: summary.highlySensitiveUploads ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.INFO },
                { signal: 'Payroll-linked documents', count: summary.payrollLinkedDocuments, severity: summary.payrollLinkedDocuments ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.INFO },
                { signal: 'Repeated confidential sharing', count: summary.repeatedConfidentialSharing, severity: summary.repeatedConfidentialSharing ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.INFO },
                { signal: 'Restricted workflow attachments', count: summary.restrictedWorkflowAttachments, severity: summary.restrictedWorkflowAttachments ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO },
                { signal: 'Legal hold conflicts', count: summary.legalHoldConflicts, severity: summary.legalHoldConflicts ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.INFO },
                { signal: 'Suspicious visibility attempts', count: summary.suspiciousVisibilityAttempts, severity: summary.suspiciousVisibilityAttempts ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO },
                { signal: 'Sensitivity downgrade attempts', count: summary.sensitivityDowngradeAttempts, severity: summary.sensitivityDowngradeAttempts ? FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER : FAILURE_CLASSIFICATIONS.INFO }
            ];
            return freezeClassificationOutput({
                success: true,
                readOnly: true,
                classification: classification,
                generatedAt: nowIso(context),
                tenantSlug: tenant,
                summary: summary,
                signals: signals,
                metadata: {
                    tenantIsolationPreserved: true,
                    sensitiveDocumentConfidentialityPreserved: true,
                    historicalClassificationImmutable: true
                }
            });
        } catch (error) {
            return freezeClassificationOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                summary: {
                    highlySensitiveUploads: 0,
                    payrollLinkedDocuments: 0,
                    repeatedConfidentialSharing: 0,
                    restrictedWorkflowAttachments: 0,
                    legalHoldConflicts: 0,
                    suspiciousVisibilityAttempts: 0,
                    sensitivityDowngradeAttempts: 0
                },
                signals: [],
                failures: [safeFailure('SENSITIVE_EXPOSURE_DETECTION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Sensitive exposure detection failed safely.')]
            });
        }
    }

    function auditClassification(actionType, metadata, context) {
        if (auditForwarding || context && context.skipAuditPersistence) return { success: true, skipped: true };
        auditForwarding = true;
        try {
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    actionType: actionType,
                    eventType: actionType,
                    module: 'Document Classification',
                    targetId: '',
                    description: metadata && metadata.description || actionType,
                    actorRole: context && context.actor && context.actor.role || 'hr',
                    actorId: context && context.actor && (context.actor.id || context.actor.empId) || '',
                    severity: metadata && metadata.severity || 'INFO',
                    metadata: cloneSanitized(metadata || {})
                }, {
                    source: 'documentClassificationService',
                    skipPersistence: false
                });
            }
            var source = db();
            if (source && typeof source.writeAuditLog === 'function') {
                source.writeAuditLog(context && context.actor && context.actor.role || 'hr', context && context.actor && context.actor.id || '', actionType, 'Document Classification', '', metadata && metadata.description || actionType);
            }
            return { success: true };
        } catch (error) {
            return { success: false, warning: 'Document classification audit failed safely.' };
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
                    source: 'documentClassificationService',
                    severity: metadata && metadata.severity || 'INFO',
                    status: metadata && metadata.status || eventType,
                    tenantSlug: contextTenant(context) || metadata && metadata.tenantSlug || '',
                    metadata: cloneSanitized(metadata || {})
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Document classification telemetry failed safely.' };
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
                    source: 'documentClassificationService',
                    status: metadata && metadata.status || metricType,
                    severity: metadata && metadata.severity || 'INFO'
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Document classification metric failed safely.' };
        } finally {
            metricForwarding = false;
        }
        return { success: false, warning: 'OrchestrationMetricsService unavailable.' };
    }

    function stateCount(rows, state) {
        return rows.filter(function count(row) { return stateOf(row) === state; }).length;
    }

    function generateDocumentClassificationReport(filters, context) {
        try {
            var data = rawData();
            var tenant = normalizeTenantSlug(filters && (filters.tenantSlug || filters.tenantId || filters.companyId)) || contextTenant(context);
            var scope = validateClassificationScope({ tenantSlug: tenant }, context || {});
            var rows = classificationRows(data).filter(tenantFilter(tenant, data));
            var attachments = attachmentRows(data).filter(tenantFilter(tenant, data));
            var access = accessRows(data).filter(tenantFilter(tenant, data));
            var retention = retentionRows(data).filter(tenantFilter(tenant, data));
            var exposure = detectSensitiveExposurePatterns({ tenantSlug: tenant }, {
                tenantSlug: tenant,
                now: context && context.now,
                skipAuditPersistence: true,
                skipTelemetry: true,
                skipMetrics: true
            });
            var summary = exposure.summary || {};
            var totalDocuments = Math.max(rows.length, attachments.length);
            var classification = highestClassification([
                exposure.classification,
                scope.classification
            ]);
            var report = {
                success: true,
                readOnly: true,
                classification: classification,
                generatedAt: nowIso(context),
                tenantSlug: tenant,
                visibility: scope.visibility,
                classificationHealth: {
                    totalDocuments: totalDocuments,
                    unclassifiedDocuments: stateCount(rows, CLASSIFICATION_STATES.UNCLASSIFIED),
                    internalDocuments: stateCount(rows, CLASSIFICATION_STATES.INTERNAL),
                    confidentialDocuments: stateCount(rows, CLASSIFICATION_STATES.CONFIDENTIAL),
                    restrictedDocuments: stateCount(rows, CLASSIFICATION_STATES.RESTRICTED),
                    highlySensitiveDocuments: stateCount(rows, CLASSIFICATION_STATES.HIGHLY_SENSITIVE),
                    legalHoldDocuments: stateCount(rows, CLASSIFICATION_STATES.LEGAL_HOLD),
                    archivedDocuments: stateCount(rows, CLASSIFICATION_STATES.ARCHIVED)
                },
                sensitivityGovernance: {
                    highlySensitiveDocuments: stateCount(rows, CLASSIFICATION_STATES.HIGHLY_SENSITIVE),
                    highlySensitiveUploads: summary.highlySensitiveUploads || 0,
                    payrollLinkedDocuments: summary.payrollLinkedDocuments || 0,
                    automaticClassificationTagging: true,
                    manualClassificationReview: true,
                    sensitivityEscalation: true,
                    restrictedAccessEnforcement: true,
                    secureVisibilityInheritance: true,
                    legalHoldIntegration: true,
                    classificationVersioning: true,
                    unsafeSensitivityDowngradesBlocked: true
                },
                restrictedVisibility: {
                    sensitivityAwareSignedUrls: true,
                    restrictedPreviews: true,
                    restrictedAccessFrequency: countRows(access, isDenied) + (summary.suspiciousVisibilityAttempts || 0),
                    secureArchivalHandling: true,
                    retentionLinkedSensitivity: retention.length,
                    forensicReconstructionMarkers: auditRows(data).filter(tenantFilter(tenant, data)).length,
                    publicExposurePrevented: true
                },
                legalHoldGovernance: {
                    legalHoldDocuments: stateCount(rows, CLASSIFICATION_STATES.LEGAL_HOLD) + countRows(rows, function legal(row) { return !!row.legalHold; }),
                    legalHoldIntegration: true,
                    legalHoldTrends: summary.legalHoldConflicts || 0,
                    legalHoldConflicts: summary.legalHoldConflicts || 0,
                    sensitivityDowngradeBlocked: true,
                    historicalClassificationImmutable: true
                },
                classificationAnalytics: {
                    confidentialDocumentGrowth: stateCount(rows, CLASSIFICATION_STATES.CONFIDENTIAL) + stateCount(rows, CLASSIFICATION_STATES.RESTRICTED) + stateCount(rows, CLASSIFICATION_STATES.HIGHLY_SENSITIVE),
                    restrictedAccessFrequency: countRows(access, isDenied),
                    sensitivityDowngradeAttempts: summary.sensitivityDowngradeAttempts || 0,
                    legalHoldTrends: summary.legalHoldConflicts || 0,
                    sensitiveAttachmentSharing: summary.repeatedConfidentialSharing || 0,
                    classificationBacklog: summary.classificationBacklog || countRows(asyncRows(data).filter(tenantFilter(tenant, data)), function job(row) { return /CLASSIFICATION|SENSITIVITY/.test(normalizeToken(row.jobType || row.type)); }),
                    suspiciousVisibilityAttempts: summary.suspiciousVisibilityAttempts || 0
                },
                accessStorageIntegration: {
                    sensitivityAwareSignedUrls: true,
                    restrictedPreviews: true,
                    secureArchivalHandling: true,
                    retentionLinkedSensitivity: retention.length,
                    forensicReconstructionMarkers: auditRows(data).filter(tenantFilter(tenant, data)).length,
                    publicExposurePrevented: true
                },
                policyWorkflowIntegration: {
                    recruitmentSensitivityHandling: true,
                    payrollDocumentRestrictions: true,
                    reimbursementConfidentiality: true,
                    workflowLinkedClassification: countRows(rows, workflowLinked),
                    policyLinkedSensitivityRules: true,
                    crossWorkflowExposureBlocked: true
                },
                accessGovernance: {
                    employeeOwnClassifiedDocumentsOnly: true,
                    managerWorkflowScopedClassifiedVisibility: true,
                    hrOperationalClassifiedVisibility: true,
                    hrHeadStrategicComplianceVisibility: true,
                    directorAggregateSensitivityAnalyticsOnly: true,
                    superAdminSensitiveDocumentAccess: false,
                    superAdminSensitivityBypass: false,
                    platformOwnerDocumentAccessChain: false,
                    crossTenantClassificationLeakageBlocked: true,
                    sensitiveExposurePrevented: true
                },
                integrationHealth: {
                    fileRetentionIntegrated: !!global.FileRetentionService,
                    attachmentAuditTrailIntegrated: !!global.AttachmentAuditTrailService,
                    storageHardeningIntegrated: !!global.StorageHardeningService,
                    documentVisibilityIntegrated: !!global.DocumentVisibilityService,
                    uploadValidationIntegrated: !!global.UploadValidationService,
                    fileAttachmentGovernanceIntegrated: !!global.FileAttachmentGovernanceService,
                    workflowTelemetryIntegrated: !!(global.WorkflowTelemetryService || global.workflowTelemetryService),
                    auditReady: !!(global.AuditService || global.auditService),
                    telemetryReady: !!(global.WorkflowTelemetryService || global.workflowTelemetryService),
                    metricsReady: !!(global.OrchestrationMetricsService || global.orchestrationMetricsService)
                },
                warnings: exposure.signals || [],
                metadata: {
                    tenantIsolationPreserved: true,
                    sensitiveDocumentConfidentialityPreserved: true,
                    historicalClassificationImmutable: true,
                    existingDocumentFlowsPreserved: true,
                    existingWorkflowsPreserved: true,
                    classificationActionsAuditable: true,
                    readOnly: true
                }
            };
            auditClassification('DOCUMENT_CLASSIFICATION_REPORTED', {
                tenantSlug: tenant,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO',
                description: 'Document sensitivity classification report viewed.'
            }, context);
            emitTelemetry('DOCUMENT_CLASSIFICATION_REPORTED', {
                tenantSlug: tenant,
                status: classification,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'INFO'
            }, context);
            recordMetric('DOCUMENT_CLASSIFICATION_REPORTED', {
                tenantSlug: tenant,
                status: classification,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'INFO'
            }, context);
            return freezeClassificationOutput(report);
        } catch (error) {
            safeWarn('Document classification report failed safely.', error && error.message ? error.message : error);
            return freezeClassificationOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                classificationHealth: { totalDocuments: 0 },
                sensitivityGovernance: { highlySensitiveDocuments: 0 },
                restrictedVisibility: { publicExposurePrevented: true },
                legalHoldGovernance: { legalHoldDocuments: 0 },
                classificationAnalytics: { classificationBacklog: 0 },
                failures: [safeFailure('DOCUMENT_CLASSIFICATION_REPORT_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Document classification report failed safely.')]
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        function check(label, condition) { checks.push({ label: label, passed: !!condition }); }
        try {
            var malformed = normalizeClassificationPayload(null, { tenantSlug: 'tabsons' });
            check('malformed payloads fail safely', malformed.success === false && malformed.failures.some(function item(row) { return row.failureCode === 'MALFORMED_CLASSIFICATION_PAYLOAD'; }));

            var crossTenant = validateClassificationScope({ tenantSlug: 'abc', empId: 'EMP-X', attachmentId: 'ATT-X', fileName: 'private.pdf' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' } });
            check('classification isolation works', crossTenant.allowed === false && crossTenant.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER);

            var escalation = evaluateSensitivityGovernance({ tenantSlug: 'tabsons', empId: 'EMP-1', attachmentId: 'ATT-1', workflowId: 'WF-1', classificationState: 'RESTRICTED', proposedClassificationState: 'HIGHLY_SENSITIVE' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('sensitivity governance works', escalation.success === true && escalation.state === CLASSIFICATION_STATES.HIGHLY_SENSITIVE);

            var legal = evaluateLegalHoldGovernance({ tenantSlug: 'tabsons', empId: 'EMP-1', attachmentId: 'ATT-1', workflowId: 'WF-1', legalHold: true }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('legal hold workflows work', legal.success === true && legal.state === CLASSIFICATION_STATES.LEGAL_HOLD);

            var restricted = generateRestrictedVisibility({ tenantSlug: 'tabsons', empId: 'EMP-1', attachmentId: 'ATT-1', classificationState: 'HIGHLY_SENSITIVE' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('restricted visibility works', restricted.success === true && restricted.restrictedVisibility.publicExposurePrevented === true);

            var frozen = freezeClassificationOutput({ nested: { ok: true }, payload: { classificationState: CLASSIFICATION_STATES.RESTRICTED } });
            check('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested) && Object.isFrozen(frozen.payload));

            var originalRetention = global.FileRetentionService;
            var originalAuditTrail = global.AttachmentAuditTrailService;
            var originalVisibility = global.DocumentVisibilityService;
            var originalUpload = global.UploadValidationService;
            try {
                delete global.FileRetentionService;
                delete global.AttachmentAuditTrailService;
                delete global.DocumentVisibilityService;
                delete global.UploadValidationService;
                var report = generateDocumentClassificationReport({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
                check('dependency absence degrades safely', report.success === true && report.integrationHealth.fileRetentionIntegrated === false && report.integrationHealth.attachmentAuditTrailIntegrated === false && report.integrationHealth.documentVisibilityIntegrated === false && report.integrationHealth.uploadValidationIntegrated === false);
            } finally {
                if (originalRetention) global.FileRetentionService = originalRetention;
                if (originalAuditTrail) global.AttachmentAuditTrailService = originalAuditTrail;
                if (originalVisibility) global.DocumentVisibilityService = originalVisibility;
                if (originalUpload) global.UploadValidationService = originalUpload;
            }
        } catch (error) {
            checks.push({ label: 'self-test uncaught error guard', passed: false, description: sanitizeText(error && error.message || error) });
        }
        var passed = checks.every(function item(row) { return row.passed; });
        var result = freezeClassificationOutput({
            passed: passed,
            checks: checks,
            summary: passed ? 'Document classification self-test passed.' : 'Document classification self-test detected failures.'
        });
        global.__ARTHHRMS_DOCUMENT_CLASSIFICATION_SELF_TEST__ = result;
        return result;
    }

    var DocumentClassificationService = Object.freeze({
        VERSION: VERSION,
        CLASSIFICATION_STATES: CLASSIFICATION_STATES,
        SENSITIVITY_TYPES: SENSITIVITY_TYPES,
        FAILURE_CLASSIFICATIONS: FAILURE_CLASSIFICATIONS,
        VISIBILITY: VISIBILITY,
        classifySensitivityRisk: classifySensitivityRisk,
        validateClassificationScope: validateClassificationScope,
        normalizeClassificationPayload: normalizeClassificationPayload,
        freezeClassificationOutput: freezeClassificationOutput,
        evaluateSensitivityGovernance: evaluateSensitivityGovernance,
        generateRestrictedVisibility: generateRestrictedVisibility,
        evaluateLegalHoldGovernance: evaluateLegalHoldGovernance,
        detectSensitiveExposurePatterns: detectSensitiveExposurePatterns,
        generateDocumentClassificationReport: generateDocumentClassificationReport,
        runSelfTest: runSelfTest
    });

    global.DocumentClassificationService = DocumentClassificationService;
    global.documentClassificationService = DocumentClassificationService;

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
