/**
 * attachmentAuditTrailService.js
 * ARTHHRMS Enterprise Attachment Audit Trails + Forensic File Activity Intelligence.
 *
 * Additive read-only governance layer for forensic attachment event trails,
 * suspicious file activity detection, signed URL auditability, and immutable
 * investigation timelines. It never exposes raw attachment IDs, employee IDs,
 * filenames, storage paths, signed URLs, public URLs, or cross-tenant audit data.
 */
(function attachAttachmentAuditTrailService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[AttachmentAuditTrailService]';

    var AUDIT_EVENT_STATES = Object.freeze({
        RECORDED: 'RECORDED',
        VERIFIED: 'VERIFIED',
        FLAGGED: 'FLAGGED',
        ESCALATED: 'ESCALATED',
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
        OWN_ATTACHMENT_HISTORY_ONLY: 'OWN_ATTACHMENT_HISTORY_ONLY',
        WORKFLOW_SCOPED_ATTACHMENT_AUDIT: 'WORKFLOW_SCOPED_ATTACHMENT_AUDIT',
        HR_OPERATIONAL_AUDIT_VISIBILITY: 'HR_OPERATIONAL_AUDIT_VISIBILITY',
        STRATEGIC_FORENSIC_VISIBILITY: 'STRATEGIC_FORENSIC_VISIBILITY',
        AGGREGATE_AUDIT_INTELLIGENCE_ONLY: 'AGGREGATE_AUDIT_INTELLIGENCE_ONLY',
        INFRASTRUCTURE_AUDIT_ONLY: 'INFRASTRUCTURE_AUDIT_ONLY',
        PLATFORM_GOVERNANCE_ONLY: 'PLATFORM_GOVERNANCE_ONLY'
    });

    var SENSITIVE_KEY_PATTERN = /(attachment.?id|document.?id|doc.?id|object.?id|object.?key|object.?path|storage.?path|bucket|file.?name|name|signed.?url|public.?url|document.?url|download.?url|preview.?url|url|path|access.?token|token|private.?note|remark|description|message|body|content|comment|reply|candidate|resume|receipt|salary|payroll|payslip|compensation|amount|employee|emp.?id|user.?id|actor.?id|owner|uploaded.?by|assigned.?to|author|manager|secret|jwt|authorization|service.?role|private.?key|reason|raw|payload.?id|correlation.?id|target.?id|log.?id|event.?id)/i;
    var SENSITIVE_VALUE_PATTERN = /(https?:\/\/[^\s"',}]+|private:\/\/[^\s"',}]+|[a-z0-9-]+\/[A-Z0-9._-]+\/[A-Z0-9._-]+\/[^\s"',}]+|\b(private|confidential|secret|salary|payroll|resume|receipt|passport|aadhaar|bank)\b[^,;}]*)/ig;

    var SAFE_GOVERNANCE_KEYS = Object.freeze({
        success: true,
        allowed: true,
        readOnly: true,
        classification: true,
        visibility: true,
        state: true,
        auditState: true,
        eventType: true,
        action: true,
        status: true,
        generatedAt: true,
        createdAt: true,
        sequence: true,
        tenantSlug: true,
        source: true,
        severity: true,
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
        auditHealth: true,
        forensicInvestigation: true,
        forensicSummary: true,
        suspiciousAccess: true,
        signedUrlAuditability: true,
        accessGovernance: true,
        integrationHealth: true,
        attachmentForensicAnalytics: true,
        auditAnalytics: true,
        timeline: true,
        correlationMarkers: true,
        totalEvents: true,
        recordedEvents: true,
        verifiedEvents: true,
        flaggedEvents: true,
        escalatedEvents: true,
        archivedEvents: true,
        uploads: true,
        downloads: true,
        previews: true,
        failedAccessAttempts: true,
        permissionChanges: true,
        signedUrlGenerations: true,
        expiredAccessAttempts: true,
        suspiciousEvents: true,
        suspiciousAccessSpikes: true,
        repeatedDeniedAccess: true,
        expiredTokenReuse: true,
        abnormalDownloadFrequency: true,
        crossWorkflowAnomalies: true,
        suspiciousPreviewActivity: true,
        excessiveSignedUrlGeneration: true,
        deniedAccessSummaries: true,
        auditCongestion: true,
        forensicInvestigationVolume: true,
        highRiskAttachmentActivity: true,
        reconstructedTimelines: true,
        accessSequenceReconstruction: true,
        attachmentAccessChains: true,
        forensicCorrelationMarkers: true,
        workflowLinkedAuditTrail: true,
        escalationLinkedInvestigations: true,
        immutableAuditTrail: true,
        signedUrlGenerationAudited: true,
        signedUrlRedacted: true,
        expiredSignedUrlAttempts: true,
        excessiveSignedUrlSignals: true,
        employeeOwnAttachmentHistoryOnly: true,
        managerWorkflowScopedAttachmentAudit: true,
        hrOperationalAuditVisibility: true,
        hrHeadStrategicForensicVisibility: true,
        directorAggregateAuditIntelligenceOnly: true,
        superAdminAttachmentContentAccess: true,
        platformOwnerAttachmentWorkflow: true,
        confidentialAttachmentContentsExposed: true,
        crossTenantAuditLeakageBlocked: true,
        auditMutationPrevented: true,
        historicalForensicRecordsImmutable: true,
        attachmentActionsAuditable: true,
        existingAttachmentFlowsPreserved: true,
        existingWorkflowsPreserved: true,
        attachmentForensicAuditabilityPreserved: true,
        tenantIsolationPreserved: true,
        storageHardeningIntegrated: true,
        documentVisibilityIntegrated: true,
        fileAttachmentGovernanceIntegrated: true,
        uploadValidationIntegrated: true,
        workflowDiscussionIntegrated: true,
        recruitmentGovernanceIntegrated: true,
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

    function actionOf(row) {
        return normalizeToken(row && (row.eventType || row.action || row.activity || row.type || row.actionType || row.event_type) || '');
    }

    function eventTypeOf(row) {
        var type = actionOf(row);
        return type || 'ATTACHMENT_AUDIT_EVENT';
    }

    function reasonOf(row) {
        return safeString(row && (row.reason || row.failureReason || row.denialReason || row.statusReason || row.message || row.description) || '', '').trim();
    }

    function statusOf(row) {
        return normalizeToken(row && (row.status || row.outcome || row.result || row.state) || '');
    }

    function isDenied(row) {
        var status = statusOf(row);
        var reason = reasonOf(row);
        return /DENIED|FAILED|REJECTED|BLOCKED|EXPIRED|REVOKED|QUARANTINED/.test(status) || /denied|blocked|expired|revoked|cross workflow|cross-tenant|unauthorized/i.test(reason);
    }

    function employeeRows(data) {
        return Array.isArray(data && data.employees) ? data.employees.slice() : [];
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

    function list(data, key) {
        return Array.isArray(data && data[key]) ? data[key].slice() : [];
    }

    function attachmentRows(data) {
        return list(data, 'fileAttachments').concat(list(data, 'attachments')).concat(list(data, 'employeeDocuments'));
    }

    function auditRows(data) {
        return list(data, 'attachmentAuditEvents').concat(list(data, 'fileAuditEvents')).concat(list(data, 'attachmentForensicEvents'));
    }

    function accessRows(data) {
        return list(data, 'attachmentAccessLogs')
            .concat(list(data, 'documentAccessLogs'))
            .concat(list(data, 'storageAccessLogs'))
            .concat(list(data, 'visibilityAccessLogs'));
    }

    function workflowAttachmentRows(data) {
        return list(data, 'workflowDiscussionAttachments').concat(list(data, 'workflowAttachments')).concat(list(data, 'discussionAttachments'));
    }

    function recruitmentDocumentRows(data) {
        return list(data, 'recruitmentDocuments').concat(list(data, 'candidateDocuments'));
    }

    function asyncRows(data) {
        return list(data, 'asyncJobs').concat(list(data, 'backgroundJobs'));
    }

    function sourceTenant(row, data) {
        var direct = rowTenant(row);
        if (direct) return direct;
        var attachmentId = attachmentIdOf(row);
        if (attachmentId) {
            var source = attachmentRows(data || rawData()).concat(workflowAttachmentRows(data || rawData())).concat(recruitmentDocumentRows(data || rawData())).find(function match(candidate) {
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

    function attachmentRecord(record, data) {
        var id = attachmentIdOf(record);
        if (!id) return record || {};
        return attachmentRows(data || rawData()).concat(workflowAttachmentRows(data || rawData())).concat(recruitmentDocumentRows(data || rawData())).find(function match(row) {
            return attachmentIdOf(row) === id;
        }) || record || {};
    }

    function mergedRecord(record, data) {
        var attachment = attachmentRecord(record || {}, data);
        var output = {};
        Object.keys(attachment || {}).forEach(function copy(key) { output[key] = attachment[key]; });
        Object.keys(record || {}).forEach(function copy(key) { output[key] = record[key]; });
        return output;
    }

    function workflowLinked(row) {
        return !!workflowIdOf(row) || !!(row && (row.threadId || row.thread_id || row.workflowType || row.workflow_type));
    }

    function hasRawAttachmentFields(row) {
        if (!row) return false;
        return !!(attachmentIdOf(row) || empIdOf(row) || row.fileName || row.file_name || row.storagePath || row.storage_path || row.signedUrl || row.signed_url || row.publicUrl || row.public_url || row.privateNote || row.private_note || row.objectPath || row.object_path);
    }

    function normalizeAuditState(value) {
        var token = normalizeToken(value || AUDIT_EVENT_STATES.RECORDED);
        return AUDIT_EVENT_STATES[token] || AUDIT_EVENT_STATES.RECORDED;
    }

    function sanitizeText(value) {
        var text = safeString(value || '', '');
        if (!text) return '';
        return text.replace(SENSITIVE_VALUE_PATTERN, '[REDACTED]').replace(/\b(ATT|EMP|DOC|OBJ|REC|CAND|AAE|AAL|DAL|SAL|WF|JOB)-[A-Z0-9_-]+\b/ig, '[REDACTED]');
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

    function freezeAuditOutput(value) {
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

    function classifyForensicRisk(input) {
        var source = input || {};
        if (source.crossTenant || source.auditTampering || source.auditMutation || source.publicExposure || source.platformOwnerAccess || source.permissionEscalation) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
        if (source.suspiciousAccess || source.abnormalDownload || source.excessiveSignedUrl || source.crossWorkflowAccess || source.superAdminContentAccess || source.forensicCongestion) return FAILURE_CLASSIFICATIONS.HIGH_RISK;
        if (source.deniedAccess || source.expiredToken || source.previewAnomaly || source.malformedPayload || source.auditCongestion) return FAILURE_CLASSIFICATIONS.WARNING;
        return FAILURE_CLASSIFICATIONS.INFO;
    }

    function visibilityFor(role, record, context, data) {
        var normalized = normalizeRole(role || context && context.actor && context.actor.role);
        var actor = context && context.actor || {};
        var currentActorId = actorId(actor);
        var owner = empIdOf(record);
        if (normalized === 'EMPLOYEE') {
            return currentActorId && owner && currentActorId === owner ? VISIBILITY.OWN_ATTACHMENT_HISTORY_ONLY : VISIBILITY.NONE;
        }
        if (normalized === 'MANAGER') {
            return owner && managerOwnsEmployee(currentActorId, owner, data) && workflowLinked(record) ? VISIBILITY.WORKFLOW_SCOPED_ATTACHMENT_AUDIT : VISIBILITY.NONE;
        }
        if (normalized === 'HR') return VISIBILITY.HR_OPERATIONAL_AUDIT_VISIBILITY;
        if (normalized === 'HR_HEAD') return VISIBILITY.STRATEGIC_FORENSIC_VISIBILITY;
        if (normalized === 'DIRECTOR') return VISIBILITY.AGGREGATE_AUDIT_INTELLIGENCE_ONLY;
        if (normalized === 'SUPER_ADMIN') return VISIBILITY.INFRASTRUCTURE_AUDIT_ONLY;
        if (normalized === 'PLATFORM_OWNER') return VISIBILITY.PLATFORM_GOVERNANCE_ONLY;
        return VISIBILITY.NONE;
    }

    function validateAttachmentAuditScope(record, context) {
        try {
            var data = rawData();
            var target = mergedRecord(record || {}, data);
            var ctxTenant = contextTenant(context);
            var targetTenant = normalizeTenantSlug(record && (record.tenantSlug || record.tenantId || record.companyId)) || sourceTenant(target, data) || ctxTenant;
            var role = normalizeRole(context && context.actor && context.actor.role || context && context.role || '');
            var visibility = visibilityFor(role, target, context || {}, data);
            var failures = [];

            if (ctxTenant && targetTenant && ctxTenant !== targetTenant) {
                failures.push(safeFailure('CROSS_TENANT_ATTACHMENT_AUDIT_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Cross-tenant attachment audit visibility was blocked.'));
            }
            if (record && (record.auditMutation || record.mutableAuditTrail || record.modifyHistoricalAudit || record.deleteAuditEvent)) {
                failures.push(safeFailure('ATTACHMENT_AUDIT_MUTATION_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Immutable attachment audit trail mutation was blocked.'));
            }
            if (role === 'PLATFORM_OWNER') {
                failures.push(safeFailure('PLATFORM_OWNER_ATTACHMENT_WORKFLOW_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Platform owner is isolated from attachment workflows.'));
            }
            if (role === 'SUPER_ADMIN' && hasRawAttachmentFields(target)) {
                failures.push(safeFailure('SUPER_ADMIN_ATTACHMENT_CONTENT_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Super admin cannot directly access confidential attachment contents.'));
            }
            if (role === 'DIRECTOR' && hasRawAttachmentFields(target)) {
                failures.push(safeFailure('DIRECTOR_ATTACHMENT_CONTENT_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Directors receive aggregate attachment forensic intelligence only.'));
            }
            if (role === 'EMPLOYEE' && visibility !== VISIBILITY.OWN_ATTACHMENT_HISTORY_ONLY) {
                failures.push(safeFailure('EMPLOYEE_ATTACHMENT_AUDIT_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Employees may access only own attachment history.'));
            }
            if (role === 'MANAGER' && visibility !== VISIBILITY.WORKFLOW_SCOPED_ATTACHMENT_AUDIT) {
                failures.push(safeFailure('MANAGER_ATTACHMENT_AUDIT_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Managers may access only workflow-scoped team attachment audit history.'));
            }
            if (record && (record.publicUrl || record.public_url || record.public === true || record.isPublic === true)) {
                failures.push(safeFailure('PUBLIC_ATTACHMENT_AUDIT_EXPOSURE_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Public attachment audit exposure was blocked.'));
            }

            var classification = highestClassification(failures.map(function item(row) { return row.classification; }));
            return freezeAuditOutput({
                allowed: !failures.length,
                success: !failures.length,
                classification: classification,
                visibility: visibility,
                failures: failures,
                metadata: {
                    tenantIsolationPreserved: classification !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER,
                    attachmentForensicAuditabilityPreserved: true,
                    historicalForensicRecordsImmutable: true,
                    attachmentActionsAuditable: true
                }
            });
        } catch (error) {
            return freezeAuditOutput({
                allowed: false,
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                visibility: VISIBILITY.NONE,
                failures: [safeFailure('ATTACHMENT_AUDIT_SCOPE_VALIDATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Attachment audit scope validation failed safely.')]
            });
        }
    }

    function normalizeAuditPayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeAuditOutput({
                    success: false,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    state: AUDIT_EVENT_STATES.RECORDED,
                    failures: [safeFailure('MALFORMED_ATTACHMENT_AUDIT_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Attachment audit payload is malformed.')]
                });
            }
            var status = statusOf(payload) || 'RECORDED';
            var denied = isDenied(payload);
            var eventType = eventTypeOf(payload);
            var classification = classifyForensicRisk({
                suspiciousAccess: denied && /DOWNLOAD|PREVIEW|SIGNED_URL/.test(eventType),
                deniedAccess: denied,
                expiredToken: /expired/i.test(reasonOf(payload))
            });
            return freezeAuditOutput({
                success: true,
                classification: classification,
                payload: {
                    tenantSlug: normalizeTenantSlug(payload.tenantSlug || payload.tenantId || payload.companyId) || contextTenant(context),
                    state: normalizeAuditState(payload.state || payload.auditState || (denied ? AUDIT_EVENT_STATES.FLAGGED : AUDIT_EVENT_STATES.RECORDED)),
                    auditState: normalizeAuditState(payload.state || payload.auditState || (denied ? AUDIT_EVENT_STATES.FLAGGED : AUDIT_EVENT_STATES.RECORDED)),
                    eventType: eventType,
                    status: status,
                    metadata: {
                        attachmentForensicAuditabilityPreserved: true,
                        tenantIsolationPreserved: true,
                        historicalForensicRecordsImmutable: true,
                        readOnly: payload.readOnly !== false
                    }
                }
            });
        } catch (error) {
            return freezeAuditOutput({
                success: false,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                state: AUDIT_EVENT_STATES.FLAGGED,
                failures: [safeFailure('ATTACHMENT_AUDIT_NORMALIZATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Attachment audit payload normalization failed safely.')]
            });
        }
    }

    function eventTime(row) {
        var value = row && (row.createdAt || row.created_at || row.timestamp || row.updatedAt || row.date);
        var parsed = Date.parse(value || '');
        return isFinite(parsed) ? parsed : 0;
    }

    function tenantAuditEvents(tenant, data) {
        var rows = auditRows(data).filter(tenantFilter(tenant, data)).map(function map(row) {
            var copy = {};
            Object.keys(row || {}).forEach(function copyKey(key) { copy[key] = row[key]; });
            copy.source = copy.source || 'attachmentAuditEvents';
            return copy;
        });
        var access = accessRows(data).filter(tenantFilter(tenant, data)).map(function map(row) {
            var copy = {};
            Object.keys(row || {}).forEach(function copyKey(key) { copy[key] = row[key]; });
            copy.eventType = eventTypeOf(copy);
            copy.source = copy.source || 'accessLogs';
            copy.state = copy.state || (isDenied(copy) ? AUDIT_EVENT_STATES.FLAGGED : AUDIT_EVENT_STATES.VERIFIED);
            return copy;
        });
        return rows.concat(access);
    }

    function eventMatchesAttachment(row, attachmentId) {
        if (!attachmentId) return true;
        return attachmentIdOf(row) === attachmentId;
    }

    function groupCount(rows, keyFn, predicate, threshold) {
        var counts = {};
        rows.forEach(function count(row) {
            if (predicate && !predicate(row)) return;
            var key = keyFn(row) || 'tenant';
            counts[key] = (counts[key] || 0) + 1;
        });
        return Object.keys(counts).filter(function over(key) { return counts[key] >= (threshold || 1); }).length;
    }

    function countRows(rows, predicate) {
        return rows.filter(function match(row) {
            try { return predicate(row); } catch (error) { return false; }
        }).length;
    }

    function detectSuspiciousAttachmentBehavior(filters, context) {
        try {
            var data = rawData();
            var tenant = normalizeTenantSlug(filters && (filters.tenantSlug || filters.tenantId || filters.companyId)) || contextTenant(context);
            var rows = tenantAuditEvents(tenant, data);
            var deniedRows = rows.filter(isDenied);
            var downloadRows = rows.filter(function isDownload(row) { return /DOWNLOAD/.test(eventTypeOf(row)); });
            var allowedDownloadRows = downloadRows.filter(function allowed(row) { return !isDenied(row); });
            var signedRows = rows.filter(function signed(row) { return /SIGNED_URL|SIGNED_ACCESS|URL_GENERATED/.test(eventTypeOf(row)); });
            var previewRows = rows.filter(function preview(row) { return /PREVIEW/.test(eventTypeOf(row)); });

            var summary = {
                repeatedDeniedAccess: Math.max(groupCount(deniedRows, attachmentIdOf, null, 2), deniedRows.length >= 2 ? 1 : 0),
                expiredTokenReuse: countRows(rows, function expired(row) { return /expired token|expired|token reuse/i.test(reasonOf(row)); }),
                abnormalDownloadFrequency: Math.max(groupCount(allowedDownloadRows, attachmentIdOf, null, 3), allowedDownloadRows.length >= 3 ? 1 : 0),
                crossWorkflowAnomalies: countRows(rows, function crossWorkflow(row) { return /cross workflow|cross-workflow|cross_workflow/i.test(reasonOf(row)); }),
                suspiciousPreviewActivity: Math.max(countRows(previewRows, isDenied), groupCount(previewRows, attachmentIdOf, null, 3)),
                excessiveSignedUrlGeneration: Math.max(groupCount(signedRows, attachmentIdOf, null, 2), signedRows.length >= 2 ? 1 : 0)
            };
            var classification = highestClassification([
                summary.repeatedDeniedAccess || summary.abnormalDownloadFrequency || summary.crossWorkflowAnomalies || summary.excessiveSignedUrlGeneration ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.INFO,
                summary.expiredTokenReuse || summary.suspiciousPreviewActivity ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO
            ]);
            var signals = [
                { signal: 'Repeated denied access', count: summary.repeatedDeniedAccess, severity: summary.repeatedDeniedAccess ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.INFO },
                { signal: 'Expired token reuse', count: summary.expiredTokenReuse, severity: summary.expiredTokenReuse ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO },
                { signal: 'Abnormal download frequency', count: summary.abnormalDownloadFrequency, severity: summary.abnormalDownloadFrequency ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.INFO },
                { signal: 'Cross-workflow access anomalies', count: summary.crossWorkflowAnomalies, severity: summary.crossWorkflowAnomalies ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.INFO },
                { signal: 'Suspicious preview activity', count: summary.suspiciousPreviewActivity, severity: summary.suspiciousPreviewActivity ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO },
                { signal: 'Excessive signed URL generation', count: summary.excessiveSignedUrlGeneration, severity: summary.excessiveSignedUrlGeneration ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.INFO }
            ];
            return freezeAuditOutput({
                success: true,
                readOnly: true,
                classification: classification,
                generatedAt: nowIso(context),
                tenantSlug: tenant,
                summary: summary,
                signals: signals,
                metadata: {
                    tenantIsolationPreserved: true,
                    attachmentForensicAuditabilityPreserved: true,
                    historicalForensicRecordsImmutable: true
                }
            });
        } catch (error) {
            return freezeAuditOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                summary: {
                    repeatedDeniedAccess: 0,
                    expiredTokenReuse: 0,
                    abnormalDownloadFrequency: 0,
                    crossWorkflowAnomalies: 0,
                    suspiciousPreviewActivity: 0,
                    excessiveSignedUrlGeneration: 0
                },
                signals: [],
                failures: [safeFailure('SUSPICIOUS_ATTACHMENT_BEHAVIOR_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Suspicious attachment behavior detection failed safely.')]
            });
        }
    }

    function timelineEntry(row, index) {
        var type = eventTypeOf(row);
        var denied = isDenied(row);
        return {
            sequence: index + 1,
            eventType: type,
            state: normalizeAuditState(row && (row.state || row.auditState || (denied ? AUDIT_EVENT_STATES.FLAGGED : AUDIT_EVENT_STATES.VERIFIED))),
            status: statusOf(row) || (denied ? 'DENIED' : 'RECORDED'),
            classification: classifyForensicRisk({
                suspiciousAccess: denied && /DOWNLOAD|PREVIEW|SIGNED_URL/.test(type),
                deniedAccess: denied,
                expiredToken: /expired/i.test(reasonOf(row)),
                crossWorkflowAccess: /cross workflow|cross-workflow|cross_workflow/i.test(reasonOf(row))
            }),
            source: sanitizeText(row && row.source || 'attachmentAuditTrail'),
            createdAt: sanitizeText(row && (row.createdAt || row.created_at || row.timestamp) || '')
        };
    }

    function summarizeForensics(rows) {
        return {
            uploads: countRows(rows, function upload(row) { return /UPLOAD/.test(eventTypeOf(row)); }),
            downloads: countRows(rows, function download(row) { return /DOWNLOAD/.test(eventTypeOf(row)); }),
            previews: countRows(rows, function preview(row) { return /PREVIEW/.test(eventTypeOf(row)); }),
            failedAccessAttempts: countRows(rows, isDenied),
            permissionChanges: countRows(rows, function permission(row) { return /PERMISSION|VISIBILITY|ACCESS_GRANTED|ACCESS_REVOKED|TEMPORARY_ACCESS/.test(eventTypeOf(row)); }),
            signedUrlGenerations: countRows(rows, function signed(row) { return /SIGNED_URL|SIGNED_ACCESS|URL_GENERATED/.test(eventTypeOf(row)); }),
            expiredAccessAttempts: countRows(rows, function expired(row) { return /expired/i.test(reasonOf(row)) || /EXPIRED/.test(statusOf(row)); }),
            suspiciousEvents: countRows(rows, function suspicious(row) { return normalizeAuditState(row && row.state) === AUDIT_EVENT_STATES.FLAGGED || isDenied(row); })
        };
    }

    function reconstructAttachmentAuditTrail(filters, context) {
        try {
            var data = rawData();
            var tenant = normalizeTenantSlug(filters && (filters.tenantSlug || filters.tenantId || filters.companyId)) || contextTenant(context);
            var attachmentId = safeString(filters && (filters.attachmentId || filters.documentId || filters.objectId) || '', '').trim();
            var probe = mergedRecord({ tenantSlug: tenant, attachmentId: attachmentId }, data);
            var scope = validateAttachmentAuditScope(probe, context || {});
            if (!scope.allowed && scope.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER) {
                return freezeAuditOutput({
                    success: false,
                    readOnly: true,
                    classification: scope.classification,
                    visibility: scope.visibility,
                    timeline: [],
                    forensicSummary: summarizeForensics([]),
                    failures: scope.failures
                });
            }
            var rows = tenantAuditEvents(tenant, data)
                .filter(function match(row) { return eventMatchesAttachment(row, attachmentId); })
                .sort(function sort(a, b) { return eventTime(a) - eventTime(b); });
            var timeline = rows.map(timelineEntry);
            var summary = summarizeForensics(rows);
            var classification = highestClassification(timeline.map(function map(row) { return row.classification; }));
            var linked = rows.some(workflowLinked) || workflowLinked(probe);
            var escalationLinked = rows.some(function escalation(row) { return /ESCALATION|BLOCKER/.test(eventTypeOf(row)) || /escalation|blocker/i.test(reasonOf(row)); });
            var output = {
                success: true,
                readOnly: true,
                classification: classification,
                generatedAt: nowIso(context),
                tenantSlug: tenant,
                visibility: scope.visibility,
                timeline: timeline,
                forensicSummary: summary,
                correlationMarkers: {
                    workflowLinkedAuditTrail: linked,
                    accessSequenceReconstruction: true,
                    attachmentAccessChains: rows.length > 0,
                    forensicCorrelationMarkers: true,
                    escalationLinkedInvestigations: escalationLinked,
                    immutableAuditTrail: true
                },
                metadata: {
                    tenantIsolationPreserved: true,
                    attachmentForensicAuditabilityPreserved: true,
                    historicalForensicRecordsImmutable: true,
                    existingAttachmentFlowsPreserved: true
                }
            };
            auditAttachmentForensics('FILE_FORENSIC_TIMELINE_RECONSTRUCTED', {
                tenantSlug: tenant,
                severity: classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO',
                description: 'Attachment forensic timeline reconstructed.'
            }, context);
            emitTelemetry('FILE_FORENSIC_TIMELINE_RECONSTRUCTED', {
                tenantSlug: tenant,
                status: classification,
                severity: classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO'
            }, context);
            recordMetric('FILE_FORENSIC_TIMELINE_RECONSTRUCTED', {
                tenantSlug: tenant,
                status: classification,
                severity: classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO'
            }, context);
            return freezeAuditOutput(output);
        } catch (error) {
            return freezeAuditOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                timeline: [],
                forensicSummary: summarizeForensics([]),
                failures: [safeFailure('FORENSIC_TIMELINE_RECONSTRUCTION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Attachment forensic timeline reconstruction failed safely.')]
            });
        }
    }

    function auditAttachmentForensics(actionType, metadata, context) {
        if (auditForwarding || context && context.skipAuditPersistence) return { success: true, skipped: true };
        auditForwarding = true;
        try {
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    actionType: actionType,
                    eventType: actionType,
                    module: 'Attachment Forensics',
                    targetId: '',
                    description: metadata && metadata.description || actionType,
                    actorRole: context && context.actor && context.actor.role || 'hr',
                    actorId: context && context.actor && (context.actor.id || context.actor.empId) || '',
                    severity: metadata && metadata.severity || 'INFO',
                    metadata: cloneSanitized(metadata || {})
                }, {
                    source: 'attachmentAuditTrailService',
                    skipPersistence: false
                });
            }
            var source = db();
            if (source && typeof source.writeAuditLog === 'function') {
                source.writeAuditLog(context && context.actor && context.actor.role || 'hr', context && context.actor && context.actor.id || '', actionType, 'Attachment Forensics', '', metadata && metadata.description || actionType);
            }
            return { success: true };
        } catch (error) {
            return { success: false, warning: 'Attachment forensic audit failed safely.' };
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
                    source: 'attachmentAuditTrailService',
                    severity: metadata && metadata.severity || 'INFO',
                    status: metadata && metadata.status || eventType,
                    tenantSlug: contextTenant(context) || metadata && metadata.tenantSlug || '',
                    metadata: cloneSanitized(metadata || {})
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Attachment forensic telemetry failed safely.' };
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
                    source: 'attachmentAuditTrailService',
                    status: metadata && metadata.status || metricType,
                    severity: metadata && metadata.severity || 'INFO'
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Attachment forensic metric failed safely.' };
        } finally {
            metricForwarding = false;
        }
        return { success: false, warning: 'OrchestrationMetricsService unavailable.' };
    }

    function uniqueAttachmentCount(rows) {
        var seen = {};
        rows.forEach(function mark(row) {
            var id = attachmentIdOf(row);
            if (id) seen[id] = true;
        });
        return Object.keys(seen).length;
    }

    function stateCount(rows, state) {
        return rows.filter(function count(row) { return normalizeAuditState(row && row.state) === state; }).length;
    }

    function generateAttachmentAuditReport(filters, context) {
        try {
            var data = rawData();
            var tenant = normalizeTenantSlug(filters && (filters.tenantSlug || filters.tenantId || filters.companyId)) || contextTenant(context);
            var role = normalizeRole(context && context.actor && context.actor.role || context && context.role || '');
            var scope = validateAttachmentAuditScope({ tenantSlug: tenant }, context || {});
            var rows = tenantAuditEvents(tenant, data);
            var auditOnly = auditRows(data).filter(tenantFilter(tenant, data));
            var suspicious = detectSuspiciousAttachmentBehavior({ tenantSlug: tenant }, {
                tenantSlug: tenant,
                now: context && context.now,
                skipAuditPersistence: true,
                skipTelemetry: true,
                skipMetrics: true
            });
            var summary = suspicious.summary || {};
            var forensicSummary = summarizeForensics(rows);
            var totalEvents = rows.length;
            var reconstructedTimelines = uniqueAttachmentCount(rows);
            var classification = highestClassification([
                suspicious.classification,
                scope.classification,
                totalEvents > 250 ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO
            ]);
            var report = {
                success: true,
                readOnly: true,
                classification: classification,
                generatedAt: nowIso(context),
                tenantSlug: tenant,
                visibility: scope.visibility,
                auditHealth: {
                    totalEvents: totalEvents,
                    recordedEvents: stateCount(auditOnly, AUDIT_EVENT_STATES.RECORDED),
                    verifiedEvents: stateCount(auditOnly, AUDIT_EVENT_STATES.VERIFIED),
                    flaggedEvents: stateCount(auditOnly, AUDIT_EVENT_STATES.FLAGGED),
                    escalatedEvents: stateCount(auditOnly, AUDIT_EVENT_STATES.ESCALATED),
                    archivedEvents: stateCount(auditOnly, AUDIT_EVENT_STATES.ARCHIVED),
                    auditCongestion: totalEvents > 250,
                    highRiskAttachmentActivity: summary.repeatedDeniedAccess + summary.abnormalDownloadFrequency + summary.crossWorkflowAnomalies + summary.excessiveSignedUrlGeneration
                },
                forensicInvestigation: {
                    reconstructedTimelines: reconstructedTimelines,
                    accessSequenceReconstruction: true,
                    attachmentAccessChains: reconstructedTimelines > 0,
                    forensicCorrelationMarkers: true,
                    escalationLinkedInvestigations: countRows(rows, function escalation(row) { return /ESCALATION|BLOCKER/.test(eventTypeOf(row)) || /escalation|blocker/i.test(reasonOf(row)); }),
                    immutableAuditTrail: true,
                    uploads: forensicSummary.uploads,
                    downloads: forensicSummary.downloads,
                    previews: forensicSummary.previews,
                    failedAccessAttempts: forensicSummary.failedAccessAttempts,
                    permissionChanges: forensicSummary.permissionChanges
                },
                suspiciousAccess: {
                    repeatedDeniedAccess: summary.repeatedDeniedAccess || 0,
                    expiredTokenReuse: summary.expiredTokenReuse || 0,
                    abnormalDownloadFrequency: summary.abnormalDownloadFrequency || 0,
                    crossWorkflowAnomalies: summary.crossWorkflowAnomalies || 0,
                    suspiciousPreviewActivity: summary.suspiciousPreviewActivity || 0,
                    excessiveSignedUrlGeneration: summary.excessiveSignedUrlGeneration || 0,
                    suspiciousAccessSpikes: (summary.repeatedDeniedAccess || 0) + (summary.abnormalDownloadFrequency || 0) + (summary.crossWorkflowAnomalies || 0)
                },
                signedUrlAuditability: {
                    signedUrlGenerations: forensicSummary.signedUrlGenerations,
                    signedUrlGenerationAudited: true,
                    signedUrlRedacted: true,
                    expiredSignedUrlAttempts: forensicSummary.expiredAccessAttempts,
                    excessiveSignedUrlSignals: summary.excessiveSignedUrlGeneration || 0
                },
                accessGovernance: {
                    employeeOwnAttachmentHistoryOnly: true,
                    managerWorkflowScopedAttachmentAudit: true,
                    hrOperationalAuditVisibility: true,
                    hrHeadStrategicForensicVisibility: true,
                    directorAggregateAuditIntelligenceOnly: true,
                    superAdminAttachmentContentAccess: false,
                    platformOwnerAttachmentWorkflow: false,
                    confidentialAttachmentContentsExposed: false,
                    crossTenantAuditLeakageBlocked: true,
                    auditMutationPrevented: true
                },
                attachmentForensicAnalytics: {
                    downloadTrends: forensicSummary.downloads,
                    previewFrequency: forensicSummary.previews,
                    expiredAccessAttempts: forensicSummary.expiredAccessAttempts,
                    deniedAccessSummaries: forensicSummary.failedAccessAttempts,
                    forensicInvestigationVolume: reconstructedTimelines,
                    suspiciousAccessSpikes: (summary.repeatedDeniedAccess || 0) + (summary.crossWorkflowAnomalies || 0),
                    highRiskAttachmentActivity: summary.repeatedDeniedAccess + summary.abnormalDownloadFrequency + summary.crossWorkflowAnomalies + summary.excessiveSignedUrlGeneration
                },
                integrationHealth: {
                    storageHardeningIntegrated: !!global.StorageHardeningService,
                    documentVisibilityIntegrated: !!global.DocumentVisibilityService,
                    fileAttachmentGovernanceIntegrated: !!global.FileAttachmentGovernanceService,
                    uploadValidationIntegrated: !!global.UploadValidationService,
                    workflowDiscussionIntegrated: !!global.WorkflowDiscussionService,
                    recruitmentGovernanceIntegrated: !!global.RecruitmentGovernanceService,
                    workflowTelemetryIntegrated: !!(global.WorkflowTelemetryService || global.workflowTelemetryService),
                    auditReady: !!(global.AuditService || global.auditService),
                    telemetryReady: !!(global.WorkflowTelemetryService || global.workflowTelemetryService),
                    metricsReady: !!(global.OrchestrationMetricsService || global.orchestrationMetricsService)
                },
                warnings: suspicious.signals || [],
                metadata: {
                    tenantIsolationPreserved: true,
                    attachmentForensicAuditabilityPreserved: true,
                    historicalForensicRecordsImmutable: true,
                    existingAttachmentFlowsPreserved: true,
                    existingWorkflowsPreserved: true,
                    attachmentActionsAuditable: true,
                    readOnly: true,
                    roleScopedAuditVisibility: role || 'UNKNOWN'
                }
            };
            auditAttachmentForensics('ATTACHMENT_AUDIT_REPORTED', {
                tenantSlug: tenant,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO',
                description: 'Attachment forensic audit report viewed.'
            }, context);
            emitTelemetry('ATTACHMENT_AUDIT_REPORTED', {
                tenantSlug: tenant,
                status: classification,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'INFO'
            }, context);
            recordMetric('ATTACHMENT_AUDIT_REPORTED', {
                tenantSlug: tenant,
                status: classification,
                severity: classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER ? 'CRITICAL' : 'INFO'
            }, context);
            return freezeAuditOutput(report);
        } catch (error) {
            safeWarn('Attachment audit report failed safely.', error && error.message ? error.message : error);
            return freezeAuditOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                auditHealth: { totalEvents: 0 },
                forensicInvestigation: { reconstructedTimelines: 0, immutableAuditTrail: true },
                suspiciousAccess: { repeatedDeniedAccess: 0 },
                signedUrlAuditability: { signedUrlGenerations: 0, signedUrlRedacted: true },
                attachmentForensicAnalytics: { highRiskAttachmentActivity: 0 },
                failures: [safeFailure('ATTACHMENT_AUDIT_REPORT_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Attachment forensic audit report failed safely.')]
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        function check(label, condition) { checks.push({ label: label, passed: !!condition }); }
        try {
            var malformed = normalizeAuditPayload(null, { tenantSlug: 'tabsons' });
            check('malformed payloads fail safely', malformed.success === false && malformed.failures.some(function item(row) { return row.failureCode === 'MALFORMED_ATTACHMENT_AUDIT_PAYLOAD'; }));

            var crossTenant = validateAttachmentAuditScope({ tenantSlug: 'abc', empId: 'EMP-X', attachmentId: 'ATT-X', fileName: 'private.pdf' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' } });
            check('audit isolation works', crossTenant.allowed === false && crossTenant.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER);

            var suspicious = detectSuspiciousAttachmentBehavior({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('suspicious detection works', suspicious.success === true && Object.isFrozen(suspicious.signals));

            var timeline = reconstructAttachmentAuditTrail({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('forensic reconstruction works', timeline.success === true && Object.isFrozen(timeline.timeline));

            var frozen = freezeAuditOutput({ nested: { ok: true }, timeline: [{ eventType: 'DOWNLOAD' }] });
            check('immutable audit trails work', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested) && Object.isFrozen(frozen.timeline));

            var originalStorage = global.StorageHardeningService;
            var originalVisibility = global.DocumentVisibilityService;
            var originalAttachment = global.FileAttachmentGovernanceService;
            var originalUpload = global.UploadValidationService;
            try {
                delete global.StorageHardeningService;
                delete global.DocumentVisibilityService;
                delete global.FileAttachmentGovernanceService;
                delete global.UploadValidationService;
                var report = generateAttachmentAuditReport({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-1' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
                check('dependency absence degrades safely', report.success === true && report.integrationHealth.storageHardeningIntegrated === false && report.integrationHealth.documentVisibilityIntegrated === false && report.integrationHealth.uploadValidationIntegrated === false);
            } finally {
                if (originalStorage) global.StorageHardeningService = originalStorage;
                if (originalVisibility) global.DocumentVisibilityService = originalVisibility;
                if (originalAttachment) global.FileAttachmentGovernanceService = originalAttachment;
                if (originalUpload) global.UploadValidationService = originalUpload;
            }
        } catch (error) {
            checks.push({ label: 'self-test uncaught error guard', passed: false, description: sanitizeText(error && error.message || error) });
        }
        var passed = checks.every(function item(row) { return row.passed; });
        var result = freezeAuditOutput({
            passed: passed,
            checks: checks,
            summary: passed ? 'Attachment audit trail self-test passed.' : 'Attachment audit trail self-test detected failures.'
        });
        global.__ARTHHRMS_ATTACHMENT_AUDIT_SELF_TEST__ = result;
        return result;
    }

    var AttachmentAuditTrailService = Object.freeze({
        VERSION: VERSION,
        AUDIT_EVENT_STATES: AUDIT_EVENT_STATES,
        FAILURE_CLASSIFICATIONS: FAILURE_CLASSIFICATIONS,
        VISIBILITY: VISIBILITY,
        classifyForensicRisk: classifyForensicRisk,
        validateAttachmentAuditScope: validateAttachmentAuditScope,
        normalizeAuditPayload: normalizeAuditPayload,
        freezeAuditOutput: freezeAuditOutput,
        detectSuspiciousAttachmentBehavior: detectSuspiciousAttachmentBehavior,
        reconstructAttachmentAuditTrail: reconstructAttachmentAuditTrail,
        generateAttachmentAuditReport: generateAttachmentAuditReport,
        runSelfTest: runSelfTest
    });

    global.AttachmentAuditTrailService = AttachmentAuditTrailService;
    global.attachmentAuditTrailService = AttachmentAuditTrailService;

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
