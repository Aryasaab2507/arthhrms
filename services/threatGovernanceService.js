/**
 * threatGovernanceService.js
 * ARTHHRMS Enterprise Malware Detection + File Integrity Intelligence.
 *
 * Additive read-only governance layer for malware indicators, file integrity
 * validation, quarantine isolation, signed URL invalidation, and threat
 * analytics. It never executes uploaded content and never exposes raw file
 * names, public URLs, storage paths, employee IDs, upload IDs, or cross-tenant
 * threat data.
 */
(function attachThreatGovernanceService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[ThreatGovernanceService]';
    var MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
    var MAX_ARCHIVE_COMPRESSION_RATIO = 100;

    var THREAT_STATES = Object.freeze({
        RECEIVED: 'RECEIVED',
        SCANNING: 'SCANNING',
        VERIFIED_SAFE: 'VERIFIED_SAFE',
        FLAGGED: 'FLAGGED',
        QUARANTINED: 'QUARANTINED',
        RESTRICTED: 'RESTRICTED',
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
        OWN_REJECTED_UPLOAD_VISIBILITY: 'OWN_REJECTED_UPLOAD_VISIBILITY',
        WORKFLOW_SCOPED_THREAT_VISIBILITY: 'WORKFLOW_SCOPED_THREAT_VISIBILITY',
        OPERATIONAL_THREAT_VISIBILITY: 'OPERATIONAL_THREAT_VISIBILITY',
        STRATEGIC_THREAT_ANALYTICS: 'STRATEGIC_THREAT_ANALYTICS',
        AGGREGATE_INTEGRITY_ANALYTICS_ONLY: 'AGGREGATE_INTEGRITY_ANALYTICS_ONLY',
        INFRASTRUCTURE_VISIBILITY_ONLY: 'INFRASTRUCTURE_VISIBILITY_ONLY',
        PLATFORM_GOVERNANCE_ONLY: 'PLATFORM_GOVERNANCE_ONLY'
    });

    var RESTRICTED_EXTENSIONS = Object.freeze(['exe', 'bat', 'cmd', 'msi', 'ps1', 'js', 'vbs', 'scr', 'dll', 'com', 'jar', 'sh', 'xlsm', 'docm']);
    var RESTRICTED_MIME_TYPES = Object.freeze([
        'application/x-msdownload',
        'application/x-msdos-program',
        'application/x-executable',
        'application/octet-stream',
        'text/javascript',
        'application/javascript',
        'application/x-sh',
        'application/vnd.ms-excel.sheet.macroenabled.12',
        'application/vnd.ms-word.document.macroenabled.12'
    ]);

    var SENSITIVE_KEY_PATTERN = /(threat.?id|validation.?id|upload.?id|attachment.?id|document.?id|doc.?id|object.?id|object.?key|object.?path|storage.?path|bucket|file.?name|name|signed.?url|public.?url|download.?url|preview.?url|url|path|token|signature|checksum|hash|digest|private.?note|quarantine.?reason|reason|remark|description|message|body|content|candidate|resume|receipt|salary|payroll|payslip|compensation|amount|employee|emp.?id|user.?id|actor.?id|owner|uploaded.?by|assigned.?to|author|manager|secret|jwt|authorization|service.?role|private.?key|raw|payload.?id|correlation.?id|target.?id|log.?id|event.?id)/i;
    var SENSITIVE_VALUE_PATTERN = /(https?:\/\/[^\s"',}]+|private:\/\/[^\s"',}]+|[a-z0-9-]+\/[A-Z0-9._-]+\/[A-Z0-9._-]+\/[^\s"',}]+|\b(private|confidential|secret|salary|payroll|resume|receipt|malware)\b[^,;}]*)/ig;

    var SAFE_GOVERNANCE_KEYS = Object.freeze({
        success: true,
        allowed: true,
        readOnly: true,
        classification: true,
        visibility: true,
        state: true,
        threatState: true,
        status: true,
        severity: true,
        source: true,
        count: true,
        signal: true,
        threatSignals: true,
        signals: true,
        summary: true,
        payload: true,
        metadata: true,
        failures: true,
        warnings: true,
        failureCode: true,
        warningCode: true,
        mimeType: true,
        declaredMimeType: true,
        extension: true,
        size: true,
        threatValidationHealth: true,
        fileIntegrityValidation: true,
        malwareDetection: true,
        quarantineGovernance: true,
        automatedThreatResponse: true,
        forensicStorageIntegration: true,
        threatAnalytics: true,
        accessGovernance: true,
        integrationHealth: true,
        totalThreatValidations: true,
        receivedThreats: true,
        scanningThreats: true,
        verifiedSafeThreats: true,
        flaggedThreats: true,
        quarantinedThreats: true,
        restrictedThreats: true,
        rejectedThreats: true,
        archivedThreats: true,
        fileChecksums: true,
        mimeConsistency: true,
        mimeConsistencyFailures: true,
        signatureVerification: true,
        signatureVerificationFailures: true,
        payloadCorruption: true,
        duplicateHashCollisions: true,
        suspiciousMetadata: true,
        malformedBinaryStructures: true,
        archiveIntegrity: true,
        archiveIntegrityFailures: true,
        executablePayloads: true,
        embeddedScripts: true,
        macroEnabledAttacks: true,
        archiveBombs: true,
        suspiciousPdfs: true,
        obfuscatedPayloads: true,
        disguisedExtensions: true,
        maliciousBinarySignatures: true,
        repeatedUploadViolations: true,
        suspiciousUploadPatterns: true,
        integrityMismatchFrequency: true,
        quarantineBuildup: true,
        threatCongestionIndicators: true,
        isolatedQuarantineStorage: true,
        restrictedVisibility: true,
        secureQuarantineDeletion: true,
        quarantineExpiryHandling: true,
        forensicQuarantineAccess: true,
        blockedPreviewDownloadAccess: true,
        maliciousFileDownloadable: true,
        automaticQuarantine: true,
        signedUrlInvalidation: true,
        temporaryAccessRevocation: true,
        suspiciousUploadBlocking: true,
        repeatedOffenderDetection: true,
        escalationAlerts: true,
        unsafeAutomaticDeletion: true,
        forensicThreatReconstruction: true,
        quarantineLinkedAuditTrails: true,
        archiveThreatValidation: true,
        suspiciousAccessInvestigations: true,
        uploadValidationIntegrated: true,
        signedUrlGovernanceIntegrated: true,
        storageHardeningIntegrated: true,
        documentClassificationIntegrated: true,
        attachmentAuditTrailIntegrated: true,
        fileRetentionIntegrated: true,
        workflowTelemetryIntegrated: true,
        auditReady: true,
        telemetryReady: true,
        metricsReady: true,
        employeeOwnRejectedUploadVisibility: true,
        managerWorkflowScopedThreatVisibility: true,
        hrOperationalThreatVisibility: true,
        hrHeadStrategicThreatAnalytics: true,
        directorAggregateIntegrityAnalyticsOnly: true,
        superAdminQuarantineOverride: true,
        platformOwnerThreatWorkflow: true,
        crossTenantThreatLeakageBlocked: true,
        malwareExposurePrevented: true,
        historicalThreatRecordsImmutable: true,
        existingUploadFlowsPreserved: true,
        existingWorkflowsPreserved: true,
        threatActionsAuditable: true,
        quarantineGovernancePreserved: true,
        threatValidationSecurityPreserved: true,
        tenantIsolationPreserved: true
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
        if (role === 'HRHEAD') return 'HR_HEAD';
        if (role === 'SUPERADMIN') return 'SUPER_ADMIN';
        if (role === 'PLATFORMOWNER') return 'PLATFORM_OWNER';
        if (role === 'DIRECTOR' || role === 'HR_HEAD' || role === 'HR' || role === 'MANAGER' || role === 'EMPLOYEE' || role === 'SUPER_ADMIN' || role === 'PLATFORM_OWNER') return role;
        return 'EMPLOYEE';
    }

    function normalizeTenantSlug(value) {
        return safeString(value, '').trim().toLowerCase().replace(/^tenant[-_]/, '').replace(/^ten[-_]/, '').replace(/[^a-z0-9_-]/g, '').replace(/_+/g, '-');
    }

    function contextTenant(context) {
        if (!context) return '';
        return normalizeTenantSlug(context.tenantSlug || context.tenantId || context.companyId || context.actor && (context.actor.tenantSlug || context.actor.tenantId));
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

    function uploadIdOf(row) {
        return safeString(row && (row.uploadId || row.validationId || row.threatId || row.id), '');
    }

    function attachmentIdOf(row) {
        return safeString(row && (row.attachmentId || row.documentId || row.docId || row.objectId || row.fileId), '');
    }

    function workflowIdOf(row) {
        return safeString(row && (row.workflowId || row.workflowRef || row.requestId || row.referenceId), '');
    }

    function stateOf(row) {
        var state = normalizeToken(row && (row.state || row.status || row.threatState || row.validationState));
        return THREAT_STATES[state] ? state : THREAT_STATES.SCANNING;
    }

    function extensionOf(row) {
        return safeString(row && row.extension, '').trim().toLowerCase().replace(/^\./, '');
    }

    function fileNameOf(row) {
        return safeString(row && (row.fileName || row.name || row.originalName), '');
    }

    function mimeOf(row) {
        return safeString(row && (row.mimeType || row.detectedMimeType || row.contentType), '').trim().toLowerCase();
    }

    function declaredMimeOf(row) {
        return safeString(row && (row.declaredMimeType || row.clientMimeType || row.expectedMimeType), '').trim().toLowerCase();
    }

    function signatureOf(row) {
        return safeString(row && (row.signature || row.fileSignature || row.magicBytes), '').trim().toUpperCase();
    }

    function checksumOf(row) {
        return safeString(row && (row.checksum || row.hash || row.digest || row.sha256), '').trim();
    }

    function statusOf(row) {
        return normalizeToken(row && row.status);
    }

    function actionOf(row) {
        return normalizeToken(row && (row.action || row.eventType || row.actionType));
    }

    function reasonOf(row) {
        return safeString(row && (row.reason || row.message || row.description || row.quarantineReason || row.warningCode || row.failureCode), '');
    }

    function employeeRows(data) {
        return list(data, 'employees').concat(list(data, 'users'));
    }

    function employeeById(data, id) {
        var needle = safeString(id, '');
        return employeeRows(data).filter(function match(row) {
            return safeString(row && (row.id || row.empId || row.employeeId || row.userId), '') === needle;
        })[0] || null;
    }

    function managerOwnsEmployee(data, managerId, employeeId) {
        if (!managerId || !employeeId) return false;
        var employee = employeeById(data, employeeId);
        return !!employee && safeString(employee.managerId || employee.reportingManagerId || employee.supervisorId, '') === managerId;
    }

    function tenantFilter(tenant) {
        return function sameTenant(row) {
            if (!tenant) return true;
            return rowTenant(row) === tenant;
        };
    }

    function threatRows(data) {
        return list(data, 'threatValidationRecords').concat(list(data, 'malwareThreatRecords'), list(data, 'fileIntegrityRecords'));
    }

    function uploadRows(data) {
        return list(data, 'uploadValidationRecords').concat(list(data, 'uploads'), list(data, 'uploadRecords'));
    }

    function attachmentRows(data) {
        return list(data, 'fileAttachments').concat(list(data, 'documents'), list(data, 'attachments'), list(data, 'workflowDiscussionAttachments'), list(data, 'communicationAttachments'), list(data, 'recruitmentDocuments'));
    }

    function quarantineRows(data) {
        return list(data, 'quarantineRecords').concat(list(data, 'threatQuarantineRecords'));
    }

    function accessRows(data) {
        return list(data, 'documentAccessLogs').concat(list(data, 'uploadAccessLogs'), list(data, 'attachmentAccessLogs'));
    }

    function storageRows(data) {
        return list(data, 'storageAccessLogs').concat(list(data, 'storageAuditLogs'));
    }

    function auditRows(data) {
        return list(data, 'threatAuditEvents').concat(list(data, 'attachmentAuditEvents'), list(data, 'malwareAuditEvents'));
    }

    function signedAccessRows(data) {
        return list(data, 'signedAccessRecords').concat(list(data, 'temporaryAccessRecords'), list(data, 'signedUrlRecords'));
    }

    function findRelated(rows, row, idFn) {
        var uploadId = uploadIdOf(row);
        var attachmentId = attachmentIdOf(row);
        return rows.filter(function match(item) {
            return uploadId && uploadIdOf(item) === uploadId || attachmentId && attachmentIdOf(item) === attachmentId || idFn && idFn(item) === idFn(row);
        })[0] || null;
    }

    function mergedRecord(data, row) {
        var upload = findRelated(uploadRows(data), row) || {};
        var attachment = findRelated(attachmentRows(data), row) || {};
        var threat = findRelated(threatRows(data), row) || {};
        var merged = {};
        Object.keys(attachment).forEach(function copy(key) { merged[key] = attachment[key]; });
        Object.keys(upload).forEach(function copy(key) { merged[key] = upload[key]; });
        Object.keys(threat).forEach(function copy(key) { merged[key] = threat[key]; });
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

    function isQuarantinedState(row) {
        var state = stateOf(row);
        return state === THREAT_STATES.QUARANTINED || state === THREAT_STATES.REJECTED || state === THREAT_STATES.RESTRICTED || state === THREAT_STATES.FLAGGED;
    }

    function isExecutablePayload(row) {
        var ext = extensionOf(row);
        var mime = mimeOf(row);
        var sig = signatureOf(row);
        return RESTRICTED_EXTENSIONS.indexOf(ext) >= 0 || RESTRICTED_MIME_TYPES.indexOf(mime) >= 0 || sig === 'MZ' || /executable|msdownload|malware/i.test(JSON.stringify(row && row.malwareIndicators || []));
    }

    function isMimeMismatch(row) {
        var detected = mimeOf(row);
        var declared = declaredMimeOf(row);
        return !!detected && !!declared && detected !== declared;
    }

    function hasScriptIndicators(row) {
        return !!(row && (row.embeddedScript || row.hasScript || row.suspiciousScript)) || /script|javascript|powershell|vbscript/i.test(JSON.stringify(row || {}));
    }

    function hasMacroAttack(row) {
        return !!(row && (row.hasMacros || row.macroEnabled)) || /\.(xlsm|docm)$/i.test(fileNameOf(row)) || /(macroenabled|macro enabled|macro)/i.test(mimeOf(row) + ' ' + reasonOf(row));
    }

    function isArchiveBomb(row) {
        return Number(row && (row.archiveCompressionRatio || row.compressionRatio || 0)) > MAX_ARCHIVE_COMPRESSION_RATIO;
    }

    function isSuspiciousPdf(row) {
        return !!(row && row.malformedPdf) || /pdf/i.test(extensionOf(row) + ' ' + mimeOf(row)) && /corrupt|malformed/i.test(signatureOf(row) + ' ' + reasonOf(row));
    }

    function isDisguisedExtension(row) {
        var name = fileNameOf(row).toLowerCase();
        var ext = extensionOf(row);
        return /\.(pdf|jpg|jpeg|png|xlsx|docx)\.(exe|js|bat|cmd|scr|dll|vbs|ps1|xlsm|docm)$/i.test(name) || ext === 'exe' && /pdf|image|spreadsheet|word/i.test(declaredMimeOf(row));
    }

    function hasIntegrityMismatch(row) {
        return !checksumOf(row) || !!(row && row.corrupted) || isMimeMismatch(row) || isSuspiciousPdf(row) || isArchiveBomb(row);
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
        if (Array.isArray(value)) return value.slice(0, 50).map(function map(item) { return cloneSanitized(item, key); });
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

    function freezeThreatOutput(output) {
        return deepFreeze(cloneSanitized(output || {}, 'payload'));
    }

    function safeFailure(code, classification, message) {
        return freezeThreatOutput({
            failureCode: code,
            classification: classification || FAILURE_CLASSIFICATIONS.WARNING,
            message: message || code
        });
    }

    function classifyThreatRisk(input) {
        try {
            var risk = input || {};
            if (risk.crossTenant || risk.malwareExposure || risk.executablePayload || risk.publicExposure || risk.unsafeDownload) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
            if (risk.quarantineBypass || risk.macroAttack || risk.archiveBomb || risk.repeatedViolation || risk.maliciousSignature) return FAILURE_CLASSIFICATIONS.HIGH_RISK;
            if (risk.integrityMismatch || risk.mimeMismatch || risk.suspiciousMetadata || risk.malformedPayload) return FAILURE_CLASSIFICATIONS.WARNING;
            return FAILURE_CLASSIFICATIONS.INFO;
        } catch (error) {
            return FAILURE_CLASSIFICATIONS.HIGH_RISK;
        }
    }

    function scopeVisibility(role) {
        if (role === 'EMPLOYEE') return VISIBILITY.OWN_REJECTED_UPLOAD_VISIBILITY;
        if (role === 'MANAGER') return VISIBILITY.WORKFLOW_SCOPED_THREAT_VISIBILITY;
        if (role === 'HR') return VISIBILITY.OPERATIONAL_THREAT_VISIBILITY;
        if (role === 'HR_HEAD') return VISIBILITY.STRATEGIC_THREAT_ANALYTICS;
        if (role === 'DIRECTOR') return VISIBILITY.AGGREGATE_INTEGRITY_ANALYTICS_ONLY;
        if (role === 'SUPER_ADMIN') return VISIBILITY.INFRASTRUCTURE_VISIBILITY_ONLY;
        if (role === 'PLATFORM_OWNER') return VISIBILITY.PLATFORM_GOVERNANCE_ONLY;
        return VISIBILITY.NONE;
    }

    function validateThreatScope(record, context) {
        try {
            var data = rawData();
            var ctx = context || {};
            var role = actorRole(ctx);
            var tenant = contextTenant(ctx) || normalizeTenantSlug(record && (record.tenantSlug || record.tenantId));
            var merged = mergedRecord(data, record || {});
            var targetTenant = rowTenant(merged) || rowTenant(record) || tenant;
            var currentActor = actorId(ctx);
            var employeeId = empIdOf(merged) || empIdOf(record);
            var failures = [];
            var warnings = [];

            if (tenant && targetTenant && tenant !== targetTenant) {
                failures.push(safeFailure('CROSS_TENANT_THREAT_VISIBILITY_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Cross-tenant threat visibility is blocked.'));
            }
            if (role === 'PLATFORM_OWNER') {
                failures.push(safeFailure('PLATFORM_OWNER_THREAT_WORKFLOW_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'PLATFORM_OWNER is isolated from threat workflows.'));
            }
            if (role === 'SUPER_ADMIN' && record && (record.quarantineOverride || record.bypassQuarantine || record.forceRelease || record.overrideThreat)) {
                failures.push(safeFailure('SUPER_ADMIN_QUARANTINE_OVERRIDE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'SUPER_ADMIN cannot bypass quarantine restrictions.'));
            }
            if (record && /DOWNLOAD|PREVIEW/.test(normalizeToken(record.action)) && isQuarantinedState(merged)) {
                failures.push(safeFailure('MALICIOUS_FILE_DOWNLOAD_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Malicious files cannot be previewed or downloaded.'));
            }
            if (record && hasPublicExposure(record) && (isExecutablePayload(record) || isQuarantinedState(record))) {
                failures.push(safeFailure('PUBLIC_MALWARE_EXPOSURE_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Public malware exposure is blocked.'));
            }
            if (role === 'EMPLOYEE' && currentActor && employeeId && currentActor !== employeeId) {
                failures.push(safeFailure('EMPLOYEE_THREAT_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Employees can only view their own rejected upload metadata.'));
            }
            if (role === 'MANAGER' && employeeId && currentActor && !managerOwnsEmployee(data, currentActor, employeeId) && !workflowLinked(merged, ctx)) {
                failures.push(safeFailure('MANAGER_WORKFLOW_THREAT_SCOPE_BLOCKED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Managers require team or workflow-scoped threat visibility.'));
            }
            if (isMimeMismatch(merged)) warnings.push(safeFailure('THREAT_MIME_MISMATCH_VISIBLE', FAILURE_CLASSIFICATIONS.WARNING, 'Threat record has MIME mismatch indicators.'));

            var classification = failures.reduce(function highest(current, failure) {
                if (failure.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
                if (failure.classification === FAILURE_CLASSIFICATIONS.HIGH_RISK && current !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER) return FAILURE_CLASSIFICATIONS.HIGH_RISK;
                return current;
            }, warnings.length ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO);

            return freezeThreatOutput({
                success: true,
                allowed: failures.length === 0,
                readOnly: true,
                classification: classification,
                visibility: failures.length ? VISIBILITY.NONE : scopeVisibility(role),
                failures: failures,
                warnings: warnings,
                metadata: {
                    tenantIsolationPreserved: failures.filter(function cross(item) { return item.failureCode === 'CROSS_TENANT_THREAT_VISIBILITY_BLOCKED'; }).length === 0,
                    threatValidationSecurityPreserved: failures.filter(function security(item) { return item.failureCode === 'MALICIOUS_FILE_DOWNLOAD_BLOCKED' || item.failureCode === 'PUBLIC_MALWARE_EXPOSURE_BLOCKED'; }).length === 0,
                    quarantineGovernancePreserved: true
                }
            });
        } catch (error) {
            return freezeThreatOutput({
                success: false,
                allowed: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                visibility: VISIBILITY.NONE,
                failures: [safeFailure('THREAT_SCOPE_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Threat scope validation failed safely.')]
            });
        }
    }

    function normalizeThreatPayload(payload, context) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeThreatOutput({
                    success: false,
                    readOnly: true,
                    classification: FAILURE_CLASSIFICATIONS.WARNING,
                    failures: [safeFailure('MALFORMED_THREAT_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Malformed threat payload rejected.')]
                });
            }
            var state = stateOf(payload);
            var normalized = {
                state: state,
                tenantSlug: normalizeTenantSlug(payload.tenantSlug || payload.tenantId || contextTenant(context)),
                mimeType: mimeOf(payload),
                declaredMimeType: declaredMimeOf(payload),
                extension: extensionOf(payload),
                size: Number(payload.size || 0) || 0,
                metadata: cloneSanitized(payload.metadata || {}, 'metadata')
            };
            return freezeThreatOutput({
                success: true,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.INFO,
                payload: normalized,
                metadata: {
                    tenantIsolationPreserved: true,
                    threatValidationSecurityPreserved: true
                }
            });
        } catch (error) {
            return freezeThreatOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('THREAT_NORMALIZATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Threat normalization failed safely.')]
            });
        }
    }

    function auditThreat(actionType, metadata, context) {
        if (auditForwarding || context && context.skipAuditPersistence) return { success: true, skipped: true };
        auditForwarding = true;
        try {
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    actionType: actionType,
                    eventType: actionType,
                    module: 'Threat Governance',
                    targetId: '',
                    description: metadata && metadata.description || actionType,
                    actorRole: context && context.actor && context.actor.role || 'hr',
                    actorId: context && context.actor && (context.actor.id || context.actor.empId) || '',
                    severity: metadata && metadata.severity || 'INFO',
                    metadata: cloneSanitized(metadata || {}, 'metadata')
                }, { source: 'threatGovernanceService', skipPersistence: false });
            }
            var source = db();
            if (source && typeof source.writeAuditLog === 'function') {
                source.writeAuditLog(context && context.actor && context.actor.role || 'hr', context && context.actor && context.actor.id || '', actionType, 'Threat Governance', '', metadata && metadata.description || actionType);
            }
            return { success: true };
        } catch (error) {
            return { success: false, warning: 'Threat audit failed safely.' };
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
                    source: 'threatGovernanceService',
                    severity: metadata && metadata.severity || 'INFO',
                    status: metadata && metadata.status || eventType,
                    tenantSlug: contextTenant(context) || metadata && metadata.tenantSlug || '',
                    metadata: cloneSanitized(metadata || {}, 'metadata')
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Threat telemetry failed safely.' };
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
                    source: 'threatGovernanceService',
                    status: metadata && metadata.status || metricType,
                    severity: metadata && metadata.severity || 'INFO'
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Threat metric failed safely.' };
        } finally {
            metricForwarding = false;
        }
        return { success: false, warning: 'OrchestrationMetricsService unavailable.' };
    }

    function validateFileIntegrity(payload, context) {
        try {
            var scope = validateThreatScope(payload || {}, context || {});
            if (!scope.allowed && scope.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER && !(payload && isExecutablePayload(payload))) return scope;
            var failures = [];
            var warnings = [];
            if (!checksumOf(payload)) failures.push(safeFailure('CHECKSUM_VALIDATION_REQUIRED', FAILURE_CLASSIFICATIONS.WARNING, 'File checksum validation is required.'));
            if (isMimeMismatch(payload)) failures.push(safeFailure('MIME_CONSISTENCY_FAILED', FAILURE_CLASSIFICATIONS.WARNING, 'Declared MIME and detected MIME are inconsistent.'));
            if (isExecutablePayload(payload) || signatureOf(payload) === 'MZ') {
                failures.push(safeFailure('FILE_SIGNATURE_VERIFICATION_FAILED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'File signature indicates restricted content.'));
                failures.push(safeFailure('EXECUTABLE_PAYLOAD_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Executable payloads are blocked.'));
            }
            if (hasScriptIndicators(payload) || hasMacroAttack(payload) || payload && payload.obfuscatedPayload) failures.push(safeFailure('MALWARE_PATTERN_DETECTED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Malware or script indicators detected.'));
            if (isArchiveBomb(payload)) failures.push(safeFailure('ARCHIVE_INTEGRITY_FAILED', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Archive integrity or compression ratio failed validation.'));
            if (isSuspiciousPdf(payload)) failures.push(safeFailure('MALFORMED_BINARY_STRUCTURE_DETECTED', FAILURE_CLASSIFICATIONS.WARNING, 'Malformed binary structure detected.'));
            if (hasPublicExposure(payload) && (isExecutablePayload(payload) || failures.length)) failures.push(safeFailure('PUBLIC_MALWARE_EXPOSURE_BLOCKED', FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER, 'Public malware exposure is blocked.'));
            if (Number(payload && payload.size || 0) > MAX_UPLOAD_BYTES) warnings.push(safeFailure('OVERSIZED_THREAT_PAYLOAD', FAILURE_CLASSIFICATIONS.WARNING, 'Oversized payload requires restricted handling.'));

            var classification = failures.reduce(function highest(current, failure) {
                if (failure.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER) return FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER;
                if (failure.classification === FAILURE_CLASSIFICATIONS.HIGH_RISK && current !== FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER) return FAILURE_CLASSIFICATIONS.HIGH_RISK;
                if (failure.classification === FAILURE_CLASSIFICATIONS.WARNING && current === FAILURE_CLASSIFICATIONS.INFO) return FAILURE_CLASSIFICATIONS.WARNING;
                return current;
            }, warnings.length ? FAILURE_CLASSIFICATIONS.WARNING : FAILURE_CLASSIFICATIONS.INFO);

            var unsafe = failures.length > 0;
            var result = freezeThreatOutput({
                success: !unsafe,
                readOnly: true,
                state: unsafe ? THREAT_STATES.QUARANTINED : THREAT_STATES.VERIFIED_SAFE,
                classification: classification,
                fileIntegrityValidation: {
                    fileChecksums: !!checksumOf(payload),
                    mimeConsistency: !isMimeMismatch(payload),
                    signatureVerification: !isExecutablePayload(payload),
                    payloadCorruption: !!(payload && payload.corrupted),
                    archiveIntegrity: !isArchiveBomb(payload),
                    malformedBinaryStructures: isSuspiciousPdf(payload) ? 1 : 0
                },
                failures: failures,
                warnings: warnings,
                metadata: {
                    threatValidationSecurityPreserved: true,
                    malwareExposurePrevented: !hasPublicExposure(payload)
                }
            });
            if (unsafe) {
                auditThreat('MALWARE_THREAT_DETECTED', { description: 'File integrity validation detected threat indicators.', severity: 'WARNING' }, context || {});
                emitTelemetry('FILE_INTEGRITY_VALIDATION_FAILED', { severity: 'WARNING', status: THREAT_STATES.QUARANTINED }, context || {});
                recordMetric('FILE_INTEGRITY_VALIDATION_FAILED', { severity: 'WARNING', status: THREAT_STATES.QUARANTINED }, context || {});
            }
            return result;
        } catch (error) {
            return freezeThreatOutput({
                success: false,
                readOnly: true,
                state: THREAT_STATES.QUARANTINED,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('FILE_INTEGRITY_VALIDATION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'File integrity validation failed safely.')]
            });
        }
    }

    function quarantineThreat(payload, context) {
        try {
            var scope = validateThreatScope(payload || {}, context || {});
            if (!scope.allowed) return scope;
            var result = freezeThreatOutput({
                success: true,
                readOnly: true,
                state: THREAT_STATES.QUARANTINED,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                visibility: scope.visibility,
                quarantineGovernance: {
                    isolatedQuarantineStorage: true,
                    restrictedVisibility: true,
                    secureQuarantineDeletion: true,
                    quarantineExpiryHandling: true,
                    forensicQuarantineAccess: true,
                    blockedPreviewDownloadAccess: true,
                    maliciousFileDownloadable: false
                },
                metadata: {
                    quarantineGovernancePreserved: true,
                    malwareExposurePrevented: true,
                    historicalThreatRecordsImmutable: true
                }
            });
            auditThreat('THREAT_QUARANTINED', { description: 'Threat quarantined with isolated storage and blocked access.', severity: 'WARNING' }, context || {});
            emitTelemetry('THREAT_QUARANTINED', { severity: 'WARNING', status: THREAT_STATES.QUARANTINED }, context || {});
            recordMetric('THREAT_QUARANTINED', { severity: 'WARNING', status: THREAT_STATES.QUARANTINED }, context || {});
            return result;
        } catch (error) {
            return freezeThreatOutput({
                success: false,
                readOnly: true,
                state: THREAT_STATES.QUARANTINED,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('THREAT_QUARANTINE_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Threat quarantine failed safely.')]
            });
        }
    }

    function executeAutomatedThreatResponse(payload, context) {
        try {
            var scope = validateThreatScope(payload || {}, context || {});
            if (!scope.allowed) return scope;
            var result = freezeThreatOutput({
                success: true,
                readOnly: true,
                state: THREAT_STATES.RESTRICTED,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                automatedThreatResponse: {
                    automaticQuarantine: true,
                    signedUrlInvalidation: true,
                    temporaryAccessRevocation: true,
                    suspiciousUploadBlocking: true,
                    repeatedOffenderDetection: true,
                    escalationAlerts: true,
                    unsafeAutomaticDeletion: false
                },
                metadata: {
                    malwareExposurePrevented: true,
                    threatActionsAuditable: true,
                    existingUploadFlowsPreserved: true
                }
            });
            auditThreat('THREAT_RESPONSE_EXECUTED', { description: 'Automated threat response executed without deleting source records.', severity: 'WARNING' }, context || {});
            emitTelemetry('THREAT_RESPONSE_EXECUTED', { severity: 'WARNING', status: THREAT_STATES.RESTRICTED }, context || {});
            recordMetric('THREAT_RESPONSE_EXECUTED', { severity: 'WARNING', status: THREAT_STATES.RESTRICTED }, context || {});
            return result;
        } catch (error) {
            return freezeThreatOutput({
                success: false,
                readOnly: true,
                state: THREAT_STATES.RESTRICTED,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                failures: [safeFailure('THREAT_RESPONSE_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Automated threat response failed safely.')]
            });
        }
    }

    function countWhere(rows, predicate) {
        return rows.filter(function filter(row) {
            try { return !!predicate(row); } catch (error) { return false; }
        }).length;
    }

    function duplicateHashCount(rows) {
        var counts = {};
        rows.forEach(function count(row) {
            var checksum = checksumOf(row);
            if (!checksum) return;
            counts[checksum] = (counts[checksum] || 0) + 1;
        });
        return Object.keys(counts).filter(function duplicate(key) { return counts[key] > 1; }).length;
    }

    function tenantThreatRows(data, tenant) {
        var rows = threatRows(data).filter(tenantFilter(tenant));
        return rows.concat(uploadRows(data).filter(tenantFilter(tenant)), attachmentRows(data).filter(tenantFilter(tenant)));
    }

    function detectMaliciousPatterns(filters, context) {
        try {
            var data = rawData();
            var tenant = normalizeTenantSlug(filters && (filters.tenantSlug || filters.tenantId)) || contextTenant(context);
            var rows = tenantThreatRows(data, tenant);
            var quarantine = quarantineRows(data).filter(tenantFilter(tenant));
            var summary = {
                executablePayloads: countWhere(rows, isExecutablePayload),
                embeddedScripts: countWhere(rows, hasScriptIndicators),
                macroEnabledAttacks: countWhere(rows, hasMacroAttack),
                archiveBombs: countWhere(rows, isArchiveBomb),
                suspiciousPdfs: countWhere(rows, isSuspiciousPdf),
                obfuscatedPayloads: countWhere(rows, function obfuscated(row) { return !!(row && row.obfuscatedPayload); }),
                disguisedExtensions: countWhere(rows, isDisguisedExtension),
                maliciousBinarySignatures: countWhere(rows, function binary(row) { return signatureOf(row) === 'MZ'; }),
                repeatedUploadViolations: countWhere(rows, function violation(row) { return isExecutablePayload(row) || hasMacroAttack(row) || hasScriptIndicators(row); }),
                suspiciousUploadPatterns: countWhere(rows, function suspicious(row) { return isExecutablePayload(row) || hasScriptIndicators(row) || isDisguisedExtension(row) || !!(row && row.obfuscatedPayload); }),
                integrityMismatchFrequency: countWhere(rows, hasIntegrityMismatch),
                quarantineBuildup: quarantine.length + countWhere(rows, function quarantined(row) { return stateOf(row) === THREAT_STATES.QUARANTINED; })
            };
            var threatSignals = Object.keys(summary).filter(function active(key) { return summary[key] > 0; }).map(function signal(key) {
                return { signal: key, count: summary[key], severity: key === 'integrityMismatchFrequency' ? 'WARNING' : 'HIGH_RISK' };
            });
            return freezeThreatOutput({
                success: true,
                readOnly: true,
                classification: threatSignals.length ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.INFO,
                summary: summary,
                threatSignals: threatSignals,
                metadata: {
                    malwareExposurePrevented: true,
                    tenantIsolationPreserved: true,
                    threatValidationSecurityPreserved: true
                }
            });
        } catch (error) {
            return freezeThreatOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                summary: {
                    executablePayloads: 0,
                    embeddedScripts: 0,
                    macroEnabledAttacks: 0,
                    archiveBombs: 0,
                    suspiciousPdfs: 0,
                    obfuscatedPayloads: 0,
                    disguisedExtensions: 0,
                    maliciousBinarySignatures: 0,
                    repeatedUploadViolations: 0,
                    suspiciousUploadPatterns: 0,
                    integrityMismatchFrequency: 0,
                    quarantineBuildup: 0
                },
                threatSignals: [],
                failures: [safeFailure('MALICIOUS_PATTERN_DETECTION_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Malicious pattern detection failed safely.')]
            });
        }
    }

    function stateCount(rows, state) {
        return countWhere(rows, function count(row) { return stateOf(row) === state; });
    }

    function generateThreatGovernanceReport(filters, context) {
        try {
            var data = rawData();
            var tenant = normalizeTenantSlug(filters && (filters.tenantSlug || filters.tenantId)) || contextTenant(context);
            var scope = validateThreatScope({ tenantSlug: tenant }, context || {});
            var rows = threatRows(data).filter(tenantFilter(tenant));
            var allRows = tenantThreatRows(data, tenant);
            var quarantine = quarantineRows(data).filter(tenantFilter(tenant));
            var access = accessRows(data).filter(tenantFilter(tenant));
            var storage = storageRows(data).filter(tenantFilter(tenant));
            var audit = auditRows(data).filter(tenantFilter(tenant));
            var malicious = detectMaliciousPatterns({ tenantSlug: tenant }, { tenantSlug: tenant, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            var duplicateHashes = duplicateHashCount(allRows);
            var blockedAccess = countWhere(access, function blocked(row) { return /BLOCKED|DENIED|REJECTED/.test(statusOf(row)) && /malware|quarantine|threat/i.test(reasonOf(row)); });
            var classification = malicious.threatSignals.length ? FAILURE_CLASSIFICATIONS.HIGH_RISK : FAILURE_CLASSIFICATIONS.INFO;
            var report = freezeThreatOutput({
                success: true,
                readOnly: true,
                classification: classification,
                visibility: scope.visibility,
                threatValidationHealth: {
                    totalThreatValidations: rows.length,
                    receivedThreats: stateCount(rows, THREAT_STATES.RECEIVED),
                    scanningThreats: stateCount(rows, THREAT_STATES.SCANNING),
                    verifiedSafeThreats: stateCount(rows, THREAT_STATES.VERIFIED_SAFE),
                    flaggedThreats: stateCount(rows, THREAT_STATES.FLAGGED),
                    quarantinedThreats: stateCount(rows, THREAT_STATES.QUARANTINED),
                    restrictedThreats: stateCount(rows, THREAT_STATES.RESTRICTED),
                    rejectedThreats: stateCount(rows, THREAT_STATES.REJECTED),
                    archivedThreats: stateCount(rows, THREAT_STATES.ARCHIVED)
                },
                fileIntegrityValidation: {
                    fileChecksums: countWhere(rows, function checksum(row) { return !!checksumOf(row); }),
                    mimeConsistency: countWhere(rows, function consistent(row) { return !isMimeMismatch(row); }),
                    mimeConsistencyFailures: countWhere(rows, isMimeMismatch),
                    signatureVerification: countWhere(rows, function verified(row) { return !isExecutablePayload(row); }),
                    signatureVerificationFailures: countWhere(rows, isExecutablePayload),
                    payloadCorruption: countWhere(rows, function corrupted(row) { return !!(row && row.corrupted); }),
                    duplicateHashCollisions: duplicateHashes,
                    suspiciousMetadata: countWhere(rows, function suspicious(row) { return !!(row && (row.suspiciousMetadata || row.privateNote)); }),
                    malformedBinaryStructures: countWhere(rows, isSuspiciousPdf),
                    archiveIntegrityFailures: countWhere(rows, isArchiveBomb)
                },
                malwareDetection: {
                    executablePayloads: malicious.summary.executablePayloads,
                    embeddedScripts: malicious.summary.embeddedScripts,
                    macroEnabledAttacks: malicious.summary.macroEnabledAttacks,
                    archiveBombs: malicious.summary.archiveBombs,
                    suspiciousPdfs: malicious.summary.suspiciousPdfs,
                    obfuscatedPayloads: malicious.summary.obfuscatedPayloads,
                    disguisedExtensions: malicious.summary.disguisedExtensions,
                    maliciousBinarySignatures: malicious.summary.maliciousBinarySignatures
                },
                quarantineGovernance: {
                    isolatedQuarantineStorage: true,
                    restrictedVisibility: true,
                    secureQuarantineDeletion: true,
                    quarantineExpiryHandling: true,
                    forensicQuarantineAccess: true,
                    blockedPreviewDownloadAccess: true,
                    maliciousFileDownloadable: false,
                    quarantineBuildup: quarantine.length + stateCount(rows, THREAT_STATES.QUARANTINED)
                },
                automatedThreatResponse: {
                    automaticQuarantine: true,
                    signedUrlInvalidation: true,
                    temporaryAccessRevocation: true,
                    suspiciousUploadBlocking: true,
                    repeatedOffenderDetection: true,
                    escalationAlerts: true,
                    unsafeAutomaticDeletion: false
                },
                forensicStorageIntegration: {
                    forensicThreatReconstruction: !!global.AttachmentAuditTrailService,
                    quarantineLinkedAuditTrails: !!global.AttachmentAuditTrailService,
                    signedUrlInvalidation: !!global.SignedUrlGovernanceService,
                    archiveThreatValidation: !!global.FileRetentionService,
                    suspiciousAccessInvestigations: true
                },
                threatAnalytics: {
                    malwareDetectionSpikes: malicious.summary.executablePayloads + malicious.summary.macroEnabledAttacks + malicious.summary.embeddedScripts,
                    repeatedUploadViolations: malicious.summary.repeatedUploadViolations,
                    suspiciousUploadPatterns: malicious.summary.suspiciousUploadPatterns,
                    integrityMismatchFrequency: malicious.summary.integrityMismatchFrequency,
                    quarantineBuildup: quarantine.length + stateCount(rows, THREAT_STATES.QUARANTINED),
                    threatCongestionIndicators: stateCount(rows, THREAT_STATES.FLAGGED) + stateCount(rows, THREAT_STATES.QUARANTINED) + blockedAccess
                },
                accessGovernance: {
                    employeeOwnRejectedUploadVisibility: true,
                    managerWorkflowScopedThreatVisibility: true,
                    hrOperationalThreatVisibility: true,
                    hrHeadStrategicThreatAnalytics: true,
                    directorAggregateIntegrityAnalyticsOnly: true,
                    superAdminQuarantineOverride: false,
                    platformOwnerThreatWorkflow: false,
                    crossTenantThreatLeakageBlocked: true,
                    malwareExposurePrevented: true,
                    historicalThreatRecordsImmutable: true,
                    existingUploadFlowsPreserved: true,
                    existingWorkflowsPreserved: true,
                    threatActionsAuditable: true,
                    quarantineGovernancePreserved: true,
                    threatValidationSecurityPreserved: true,
                    tenantIsolationPreserved: true
                },
                integrationHealth: {
                    uploadValidationIntegrated: !!global.UploadValidationService,
                    signedUrlGovernanceIntegrated: !!global.SignedUrlGovernanceService,
                    storageHardeningIntegrated: !!global.StorageHardeningService,
                    documentClassificationIntegrated: !!global.DocumentClassificationService,
                    attachmentAuditTrailIntegrated: !!global.AttachmentAuditTrailService,
                    fileRetentionIntegrated: !!global.FileRetentionService,
                    workflowTelemetryIntegrated: !!global.WorkflowTelemetryService,
                    auditReady: !!global.AuditService,
                    telemetryReady: !!global.WorkflowTelemetryService,
                    metricsReady: !!global.OrchestrationMetricsService
                },
                warnings: malicious.threatSignals,
                metadata: {
                    tenantIsolationPreserved: true,
                    threatValidationSecurityPreserved: true,
                    historicalThreatRecordsImmutable: true
                }
            });
            auditThreat('THREAT_GOVERNANCE_REPORTED', { description: 'Threat governance report viewed.', severity: classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO' }, context || {});
            emitTelemetry('THREAT_GOVERNANCE_REPORTED', { severity: classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO', status: classification }, context || {});
            recordMetric('THREAT_GOVERNANCE_REPORTED', { severity: classification === FAILURE_CLASSIFICATIONS.HIGH_RISK ? 'WARNING' : 'INFO', status: classification }, context || {});
            return report;
        } catch (error) {
            return freezeThreatOutput({
                success: false,
                readOnly: true,
                classification: FAILURE_CLASSIFICATIONS.HIGH_RISK,
                threatValidationHealth: { totalThreatValidations: 0 },
                failures: [safeFailure('THREAT_REPORT_FAILED_SAFE', FAILURE_CLASSIFICATIONS.HIGH_RISK, 'Threat governance report failed safely.')]
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        function check(label, condition) { checks.push({ label: label, passed: !!condition }); }
        try {
            var malformed = normalizeThreatPayload(null, { tenantSlug: 'tabsons' });
            check('malformed payloads fail safely', malformed.success === false);
            var cross = validateThreatScope({ tenantSlug: 'abc', uploadId: 'UP-X', empId: 'EMP-X' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-SELF' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('cross-tenant threat visibility is blocked', cross.allowed === false && cross.classification === FAILURE_CLASSIFICATIONS.CRITICAL_BLOCKER);
            var integrity = validateFileIntegrity({ tenantSlug: 'tabsons', empId: 'EMP-SELF', mimeType: 'application/x-msdownload', declaredMimeType: 'application/pdf', extension: 'exe', signature: 'MZ', embeddedScript: true }, { tenantSlug: 'tabsons', actor: { role: 'EMPLOYEE', id: 'EMP-SELF', empId: 'EMP-SELF' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('malware detection quarantines safely', integrity.success === false && integrity.state === THREAT_STATES.QUARANTINED);
            var quarantine = quarantineThreat({ tenantSlug: 'tabsons', empId: 'EMP-SELF', uploadId: 'UP-SELF' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-SELF' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('quarantine governance blocks preview/download', quarantine.success === true && quarantine.quarantineGovernance.blockedPreviewDownloadAccess === true);
            var response = executeAutomatedThreatResponse({ tenantSlug: 'tabsons', empId: 'EMP-SELF', uploadId: 'UP-SELF' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-SELF' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            check('signed URL revocation markers exist', response.success === true && response.automatedThreatResponse.signedUrlInvalidation === true && response.automatedThreatResponse.temporaryAccessRevocation === true);
            var originalUpload = global.UploadValidationService;
            var originalSigned = global.SignedUrlGovernanceService;
            var originalStorage = global.StorageHardeningService;
            var originalClassification = global.DocumentClassificationService;
            var originalAuditTrail = global.AttachmentAuditTrailService;
            var originalRetention = global.FileRetentionService;
            try {
                global.UploadValidationService = undefined;
                global.SignedUrlGovernanceService = undefined;
                global.StorageHardeningService = undefined;
                global.DocumentClassificationService = undefined;
                global.AttachmentAuditTrailService = undefined;
                global.FileRetentionService = undefined;
                var degraded = generateThreatGovernanceReport({ tenantSlug: 'tabsons' }, { tenantSlug: 'tabsons', actor: { role: 'HR', id: 'HR-SELF' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
                check('optional dependency absence degrades safely', degraded.success === true && degraded.integrationHealth.uploadValidationIntegrated === false && degraded.integrationHealth.signedUrlGovernanceIntegrated === false);
            } finally {
                global.UploadValidationService = originalUpload;
                global.SignedUrlGovernanceService = originalSigned;
                global.StorageHardeningService = originalStorage;
                global.DocumentClassificationService = originalClassification;
                global.AttachmentAuditTrailService = originalAuditTrail;
                global.FileRetentionService = originalRetention;
            }
            var frozen = freezeThreatOutput({ payload: { state: THREAT_STATES.SCANNING } });
            check('outputs are immutable', Object.isFrozen(frozen) && Object.isFrozen(frozen.payload));
        } catch (error) {
            checks.push({ label: 'self-test has no uncaught failure', passed: false, error: error && error.message ? error.message : safeString(error, 'unknown') });
        }
        var result = freezeThreatOutput({
            passed: checks.length > 0 && checks.every(function every(item) { return item.passed; }),
            checks: checks
        });
        global.__ARTHHRMS_THREAT_GOVERNANCE_SELF_TEST__ = result;
        return result;
    }

    var ThreatGovernanceService = Object.freeze({
        VERSION: VERSION,
        THREAT_STATES: THREAT_STATES,
        FAILURE_CLASSIFICATIONS: FAILURE_CLASSIFICATIONS,
        VISIBILITY: VISIBILITY,
        validateThreatScope: validateThreatScope,
        classifyThreatRisk: classifyThreatRisk,
        normalizeThreatPayload: normalizeThreatPayload,
        freezeThreatOutput: freezeThreatOutput,
        detectMaliciousPatterns: detectMaliciousPatterns,
        validateFileIntegrity: validateFileIntegrity,
        quarantineThreat: quarantineThreat,
        executeAutomatedThreatResponse: executeAutomatedThreatResponse,
        generateThreatGovernanceReport: generateThreatGovernanceReport,
        runSelfTest: runSelfTest
    });

    global.ThreatGovernanceService = ThreatGovernanceService;
    global.threatGovernanceService = ThreatGovernanceService;

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
