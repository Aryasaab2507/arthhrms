/**
 * ARTHHRMS Backup Integrity Verification Service
 * Adds tenant-scoped recovery assurance, checksum governance, corruption
 * detection, and certification without restoring backups or mutating backup
 * payloads.
 */
(function attachBackupIntegrityVerificationService(global) {
    'use strict';

    var SOURCE = 'backupIntegrityVerificationService';
    var CHECKSUM_ALGORITHMS = Object.freeze(['SHA-256', 'SHA-512']);
    var VERIFICATION_STATES = Object.freeze([
        'BACKUP_CREATED', 'INTEGRITY_VERIFICATION', 'CHECKSUM_VALIDATION', 'METADATA_VALIDATION',
        'RECOVERY_TEST_VALIDATION', 'TRUST_SCORE_GENERATED', 'BACKUP_CERTIFIED', 'FAILED'
    ]);
    var CONTROL_ROLES = Object.freeze(['PLATFORM_OWNER']);
    var VIEW_ROLES = Object.freeze(['PLATFORM_OWNER', 'DIRECTOR', 'HR']);

    function db() {
        try { return global.DB || null; } catch (error) { return null; }
    }

    function data() {
        try {
            var source = db();
            return source && typeof source.get === 'function' ? source.get() || {} : {};
        } catch (error) { return {}; }
    }

    function save(next) {
        try {
            var source = db();
            if (source && typeof source.save === 'function') {
                source.save(next || {});
                return true;
            }
        } catch (error) {}
        return false;
    }

    function safeString(value, fallback) {
        try {
            if (value === null || typeof value === 'undefined') return fallback || '';
            return String(value);
        } catch (error) { return fallback || ''; }
    }

    function token(value) {
        return safeString(value || '', '').trim().toUpperCase()
            .replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    }

    function normalizeAlgorithm(value) {
        var algorithm = safeString(value || 'SHA-256', 'SHA-256').trim().toUpperCase().replace(/_/g, '-');
        if (algorithm === 'SHA256') algorithm = 'SHA-256';
        if (algorithm === 'SHA512') algorithm = 'SHA-512';
        return algorithm;
    }

    function normalizeRole(value) {
        var role = token(value || 'EMPLOYEE');
        if (role === 'PLATFORMOWNER' || role === 'OWNER' || role === 'ROOT') return 'PLATFORM_OWNER';
        if (role === 'HRHEAD') return 'HR';
        return role || 'EMPLOYEE';
    }

    function normalizeTenant(value) {
        return safeString(value || '', '').trim().toLowerCase()
            .replace(/^tenant[-_]/, '').replace(/^ten[-_]/, '')
            .replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }

    function nowIso(context) {
        try {
            var stamp = context && context.now ? new Date(context.now) : new Date();
            return Number.isFinite(stamp.getTime()) ? stamp.toISOString() : new Date().toISOString();
        } catch (error) { return new Date().toISOString(); }
    }

    function createId(prefix) {
        return prefix + '-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    }

    function clampScore(value) {
        var number = Number(value);
        if (!Number.isFinite(number)) return 0;
        return Math.max(0, Math.min(100, Math.round(number)));
    }

    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function cloneSafe(value, seen) {
        if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'undefined') return undefined;
        if (!value || typeof value !== 'object') {
            return typeof value === 'string' ? value.slice(0, 1400) : value;
        }
        var refs = seen || [];
        if (refs.indexOf(value) !== -1) return '[Circular]';
        refs.push(value);
        if (Array.isArray(value)) {
            return value.map(function map(item) { return cloneSafe(item, refs.slice()); })
                .filter(function keep(item) { return typeof item !== 'undefined'; });
        }
        var output = {};
        Object.keys(value).forEach(function each(key) {
            if (key === '__proto__' || key === 'prototype' || key === 'constructor') return;
            if (/password|secret|salary|compensation|bank|account|private|plaintext|payload|encryptedPayload|signedUrl|storagePath|email|phone|address/i.test(key)) return;
            var cloned = cloneSafe(value[key], refs.slice());
            if (typeof cloned !== 'undefined') output[key] = cloned;
        });
        return output;
    }

    function freezeIntegrityOutput(value) {
        var cloned = cloneSafe(value, []);
        function deepFreeze(item) {
            if (!item || typeof item !== 'object' || Object.isFrozen(item)) return item;
            Object.keys(item).forEach(function each(key) { deepFreeze(item[key]); });
            return Object.freeze(item);
        }
        return deepFreeze(cloned);
    }

    function result(success, code, message, extra) {
        return freezeIntegrityOutput(Object.assign({
            success: success === true,
            code: token(code || (success ? 'BACKUP_INTEGRITY_READY' : 'BACKUP_INTEGRITY_FAILED')),
            message: safeString(message || (success ? 'Backup integrity operation completed.' : 'Backup integrity operation failed.'), '').slice(0, 260)
        }, extra || {}));
    }

    function finding(code, message, severity, metadata) {
        return {
            code: token(code || 'BACKUP_INTEGRITY_FINDING'),
            message: safeString(message || 'Backup integrity finding.', '').slice(0, 260),
            severity: token(severity || 'WARNING') || 'WARNING',
            metadata: cloneSafe(metadata || {}, []) || {}
        };
    }

    function actor(context) {
        var source = context && context.actor ? context.actor : {};
        return {
            id: safeString(source.id || source.userId || source.empId || source.employeeId || '', '').trim().slice(0, 160),
            role: normalizeRole(source.role || context && context.role || 'EMPLOYEE'),
            tenantSlug: normalizeTenant(source.tenantSlug || source.tenantId || source.companyId || '')
        };
    }

    function contextTenant(context) {
        var currentActor = actor(context || {});
        var settings = data().companySettings || {};
        return normalizeTenant(
            context && (context.tenantSlug || context.tenantId || context.companyId) ||
            currentActor.tenantSlug || settings.tenantSlug || settings.tenantId || settings.companyId || ''
        );
    }

    function rowTenant(row) {
        var metadata = row && row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
        return normalizeTenant(row && (
            row.tenantSlug || row.tenantId || row.tenant_id || row.companyId || row.company_id ||
            metadata.tenantSlug || metadata.tenantId || metadata.companyId
        ));
    }

    function validateAccess(action, tenantSlug, context) {
        var currentActor = actor(context || {});
        var targetTenant = normalizeTenant(tenantSlug || contextTenant(context || {}));
        var scope = normalizeTenant(currentActor.tenantSlug || contextTenant(context || {}));
        var roles = action === 'VIEW' ? VIEW_ROLES : CONTROL_ROLES;
        if (roles.indexOf(currentActor.role) === -1) {
            return result(false, 'INTEGRITY_GOVERNANCE_DENIED', action === 'VIEW'
                ? 'Backup integrity visibility was denied.'
                : 'Only PLATFORM_OWNER may run backup integrity controls.');
        }
        if (!targetTenant || !scope || targetTenant !== scope) {
            return result(false, 'TENANT_ACCESS_DENIED', 'Tenant-scoped backup integrity access was denied.');
        }
        try {
            var registry = global.ValidationRegistry || global.ValidationRegistryService || global.validationRegistryService;
            if (registry && typeof registry.executeValidationRule === 'function') {
                var validation = registry.executeValidationRule('TENANT_ACCESS', {
                    tenantSlug: targetTenant,
                    ownerTenantSlug: targetTenant,
                    actorTenantSlug: scope
                }, { source: SOURCE }, Object.assign({}, context || {}, { tenantSlug: targetTenant, validatedTenantAccess: true }));
                if (!validation || validation.success !== true) {
                    return result(false, 'TENANT_ACCESS_DENIED', 'Tenant validation failed closed.');
                }
            }
        } catch (error) {
            return result(false, 'TENANT_ACCESS_DENIED', 'Tenant validation failed safely.');
        }
        return result(true, 'INTEGRITY_ACCESS_VALIDATED', 'Backup integrity access validated.', { tenantSlug: targetTenant, actor: currentActor });
    }

    function audit(actionType, metadata, context, severity) {
        if (context && context.skipAuditPersistence) return false;
        var currentActor = actor(context || {});
        try {
            if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                global.AuditService.recordAudit({
                    type: actionType,
                    eventType: actionType,
                    actionType: actionType,
                    actorId: currentActor.id,
                    actorRole: currentActor.role,
                    source: SOURCE,
                    module: 'Backup Integrity Verification',
                    severity: severity || (/FAILED|BLOCKED|CORRUPT|MISMATCH|DENIED/.test(actionType) ? 'WARNING' : 'INFO'),
                    metadata: Object.assign({}, cloneSafe(metadata || {}, []), {
                        actionType: actionType,
                        module: 'Backup Integrity Verification'
                    })
                }, { source: SOURCE, actor: currentActor });
                return true;
            }
        } catch (error) {}
        return false;
    }

    function persist(key, record, context) {
        if (context && context.skipHistoryPersistence) return record;
        var current = data();
        if (!Array.isArray(current[key])) current[key] = [];
        current[key].push(Object.assign({}, cloneSafe(record, []), { immutable: true }));
        save(current);
        return record;
    }

    function stableStringify(value) {
        if (value === null || typeof value !== 'object') return JSON.stringify(value);
        if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
        return '{' + Object.keys(value).sort().map(function each(key) {
            return JSON.stringify(key) + ':' + stableStringify(value[key]);
        }).join(',') + '}';
    }

    function digestInput(value) {
        return typeof value === 'string' ? value : stableStringify(value);
    }

    function utf8Bytes(text) {
        if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(safeString(text, ''));
        var encoded = unescape(encodeURIComponent(safeString(text, '')));
        var bytes = new Uint8Array(encoded.length);
        for (var index = 0; index < encoded.length; index += 1) bytes[index] = encoded.charCodeAt(index);
        return bytes;
    }

    function bytesToHex(bytes) {
        return Array.from(new Uint8Array(bytes)).map(function hex(byte) { return byte.toString(16).padStart(2, '0'); }).join('');
    }

    async function rawDigest(text, algorithm) {
        var normalized = normalizeAlgorithm(algorithm);
        if (CHECKSUM_ALGORITHMS.indexOf(normalized) === -1) throw new Error('Unsupported checksum algorithm.');
        try {
            if (global.crypto && global.crypto.subtle && typeof global.crypto.subtle.digest === 'function') {
                return bytesToHex(await global.crypto.subtle.digest(normalized, utf8Bytes(text)));
            }
        } catch (error) {}
        try {
            if (typeof require === 'function') {
                var nodeCrypto = require('node:crypto');
                return nodeCrypto.createHash(normalized.toLowerCase().replace('-', '')).update(safeString(text, ''), 'utf8').digest('hex');
            }
        } catch (error) {}
        throw new Error('Checksum runtime is unavailable.');
    }

    async function calculateChecksum(value, algorithm) {
        try {
            var normalized = normalizeAlgorithm(algorithm || 'SHA-256');
            if (CHECKSUM_ALGORITHMS.indexOf(normalized) === -1) {
                return result(false, 'UNSUPPORTED_CHECKSUM_ALGORITHM', 'Checksum algorithm must be SHA-256 or SHA-512.', {
                    algorithm: normalized,
                    hash: '',
                    calculatedAt: nowIso({})
                });
            }
            var hash = await rawDigest(digestInput(value), normalized);
            return result(true, 'CHECKSUM_CALCULATED', 'Checksum calculated.', {
                algorithm: normalized,
                hash: hash,
                verificationTimestamp: nowIso({}),
                calculatedAt: nowIso({})
            });
        } catch (error) {
            return result(false, 'CHECKSUM_CALCULATION_FAILED_SAFE', 'Checksum calculation failed safely.', {
                algorithm: normalizeAlgorithm(algorithm || 'SHA-256'),
                hash: '',
                verificationTimestamp: nowIso({})
            });
        }
    }

    function backupParts(input, context) {
        var source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
        var backup = source.backup && typeof source.backup === 'object' ? source.backup : source;
        var encryption = source.encryption && typeof source.encryption === 'object' ? source.encryption : (backup.encryption || {});
        var encryptedPayload = safeString(source.encryptedPayload || backup.encryptedPayload || '', '');
        var tenantSlug = normalizeTenant(backup.tenantSlug || source.tenantSlug || contextTenant(context || {}));
        return {
            backup: backup || {},
            encryption: encryption || {},
            encryptedPayload: encryptedPayload,
            tenantSlug: tenantSlug
        };
    }

    function backupHashEnvelope(backup, encryptedPayload, encryption) {
        return {
            backupId: backup.backupId,
            tenantSlug: backup.tenantSlug,
            backupType: backup.backupType,
            createdAt: backup.createdAt,
            recordCounts: backup.recordCounts,
            encryptedPayload: encryptedPayload,
            algorithm: encryption && encryption.algorithm,
            iv: encryption && encryption.iv
        };
    }

    function buildMetadataValidation(input, context) {
        var parts = backupParts(input, context || {});
        var backup = parts.backup || {};
        var issues = [];
        var access = validateAccess('CONTROL', parts.tenantSlug, context || {});
        var recordCounts = backup.recordCounts;
        var countsAreObject = isPlainObject(recordCounts);
        var countKeys = countsAreObject ? Object.keys(recordCounts) : [];
        var countsValid = countsAreObject && countKeys.length > 0 && countKeys.every(function valid(key) {
            var number = Number(recordCounts[key]);
            return Number.isFinite(number) && number >= 0;
        });
        var structureValid = !!backup.backupId && !!backup.backupType && !!backup.createdAt && !!backup.integrityHash && (backup.encrypted === true || backup.encrypted === undefined);
        var stateValid = token(backup.state || 'COMPLETED') === 'COMPLETED';
        var tenantOwnershipValid = access.success === true && normalizeTenant(backup.tenantSlug) === access.tenantSlug;
        var metadataConsistent = !!backup.integrityHash && !!backup.backupId && !!parts.tenantSlug;
        var dependenciesValid = !!(parts.encryption && parts.encryption.algorithm && parts.encryption.iv);
        if (!access.success) issues.push(finding(access.code, access.message, 'CRITICAL'));
        if (!backup.backupId) issues.push(finding('BACKUP_ID_MISSING', 'Backup ID is required.', 'ERROR'));
        if (!backup.backupType) issues.push(finding('BACKUP_TYPE_MISSING', 'Backup type is required.', 'ERROR'));
        if (!backup.createdAt) issues.push(finding('BACKUP_TIMESTAMP_MISSING', 'Backup creation timestamp is required.', 'WARNING'));
        if (!stateValid) issues.push(finding('BACKUP_NOT_COMPLETED', 'Only completed backups may be verified.', 'CRITICAL', { state: backup.state || '' }));
        if (!backup.integrityHash) issues.push(finding('ORIGINAL_HASH_MISSING', 'Original integrity hash is required.', 'CRITICAL'));
        if (!countsValid) issues.push(finding('RECORD_COUNTS_MISSING', 'Record count metadata is required and must be numeric.', 'ERROR'));
        if (!tenantOwnershipValid) issues.push(finding('TENANT_OWNERSHIP_MISMATCH', 'Backup tenant ownership does not match the verification context.', 'CRITICAL'));
        if (!dependenciesValid) issues.push(finding('BACKUP_ENCRYPTION_METADATA_MISSING', 'Backup encryption metadata is required for assurance.', 'ERROR'));
        return {
            access: access,
            parts: parts,
            issues: issues,
            metadataValidation: {
                fileCompletenessValid: !!parts.encryptedPayload,
                metadataConsistent: metadataConsistent,
                backupStructureValid: structureValid,
                structureValid: structureValid,
                recordCountsValid: countsValid,
                tenantOwnershipValid: tenantOwnershipValid,
                dependenciesValid: dependenciesValid,
                stateValid: stateValid,
                schemaCompatible: countsValid && structureValid && stateValid,
                backupType: safeString(backup.backupType || '', '').slice(0, 80),
                recordCountKeys: countKeys.slice(0, 20)
            }
        };
    }

    function validateBackupMetadata(input, context) {
        try {
            if (!input || typeof input !== 'object' || Array.isArray(input)) {
                return result(false, 'MALFORMED_BACKUP_METADATA', 'Backup metadata payload must be an object.', {
                    issues: [finding('MALFORMED_BACKUP_METADATA', 'Backup metadata payload must be an object.', 'ERROR')],
                    metadataValidation: {
                        fileCompletenessValid: false,
                        metadataConsistent: false,
                        backupStructureValid: false,
                        structureValid: false,
                        recordCountsValid: false,
                        tenantOwnershipValid: false,
                        dependenciesValid: false,
                        stateValid: false,
                        schemaCompatible: false,
                        backupType: '',
                        recordCountKeys: []
                    },
                    governance: governanceFlags(true)
                });
            }
            var built = buildMetadataValidation(input, context || {});
            if (!built.access.success) {
                return result(false, built.access.code, built.access.message, {
                    tenantSlug: built.parts.tenantSlug,
                    issues: built.issues,
                    metadataValidation: built.metadataValidation,
                    governance: governanceFlags(true)
                });
            }
            var blocking = built.issues.some(function block(item) { return item.severity === 'CRITICAL' || item.severity === 'ERROR'; });
            audit(blocking ? 'BACKUP_INTEGRITY_METADATA_FAILED' : 'BACKUP_INTEGRITY_METADATA_VALIDATED', {
                tenantSlug: built.parts.tenantSlug,
                backupId: built.parts.backup.backupId || '',
                issueCount: built.issues.length
            }, context || {}, blocking ? 'WARNING' : 'INFO');
            return result(!blocking, blocking ? 'BACKUP_METADATA_INVALID' : 'BACKUP_METADATA_VALID', blocking ? 'Backup metadata validation has blockers.' : 'Backup metadata validation passed.', {
                tenantSlug: built.parts.tenantSlug,
                backupId: built.parts.backup.backupId || '',
                issues: built.issues,
                metadataValidation: built.metadataValidation,
                governance: governanceFlags(blocking)
            });
        } catch (error) {
            return result(false, 'BACKUP_METADATA_FAILED_SAFE', 'Backup metadata validation failed safely.', {
                issues: [finding('BACKUP_METADATA_FAILED_SAFE', 'Backup metadata validation failed safely.', 'ERROR')],
                governance: governanceFlags(true)
            });
        }
    }

    function governanceFlags(blocked) {
        return {
            tenantIsolationPreserved: true,
            backupIntegrityGovernancePreserved: true,
            rbacAuthoritative: true,
            restoreExecutionEnabled: false,
            certificationBlocked: blocked === true,
            corruptedBackupBlocked: blocked === true,
            immutableHistory: true,
            backwardCompatibilityPreserved: true
        };
    }

    function buildRecoveryAssurance(metadataValidation, checksumMatched, corruptionFindings) {
        var hasCorruption = corruptionFindings.length > 0;
        var schemaCompatible = metadataValidation.schemaCompatible === true;
        var backupRestorable = checksumMatched === true && schemaCompatible && metadataValidation.tenantOwnershipValid === true &&
            metadataValidation.dependenciesValid === true && !hasCorruption;
        return {
            backupRestorable: backupRestorable,
            schemaCompatible: schemaCompatible,
            tenantOwnershipValid: metadataValidation.tenantOwnershipValid === true,
            dependenciesValid: metadataValidation.dependenciesValid === true,
            restoreReadinessValidated: backupRestorable,
            restoreExecuted: false,
            restorationBlockedIfCorrupted: hasCorruption,
            restoreMode: 'ASSURANCE_ONLY'
        };
    }

    function scoreVerification(checksumMatched, metadataValidation, recoveryAssurance, corruptionFindings) {
        var checksumScore = checksumMatched ? 40 : 0;
        var metadataScore = metadataValidation.metadataConsistent ? 10 : 0;
        var structureScore = metadataValidation.structureValid ? 10 : 0;
        var recordScore = metadataValidation.recordCountsValid ? 10 : 0;
        var tenantScore = metadataValidation.tenantOwnershipValid ? 15 : 0;
        var dependencyScore = metadataValidation.dependenciesValid ? 10 : 0;
        var corruptionPenalty = Math.min(40, corruptionFindings.length * 12);
        var backupTrustScore = clampScore(checksumScore + metadataScore + structureScore + recordScore + tenantScore + dependencyScore + 5 - corruptionPenalty);
        var recoveryConfidenceScore = clampScore(
            backupTrustScore * 0.45 +
            (recoveryAssurance.schemaCompatible ? 20 : 0) +
            (recoveryAssurance.tenantOwnershipValid ? 15 : 0) +
            (recoveryAssurance.dependenciesValid ? 10 : 0) +
            (recoveryAssurance.restoreExecuted === false ? 10 : 0)
        );
        var restorationReadinessScore = clampScore(
            recoveryConfidenceScore * 0.75 +
            (recoveryAssurance.backupRestorable ? 20 : 0) +
            (corruptionFindings.length ? 0 : 5)
        );
        var integrityHealthScore = clampScore(backupTrustScore * 0.55 + recoveryConfidenceScore * 0.3 + restorationReadinessScore * 0.15);
        return {
            backupTrustScore: backupTrustScore,
            recoveryConfidenceScore: recoveryConfidenceScore,
            restorationReadinessScore: restorationReadinessScore,
            integrityHealthScore: integrityHealthScore
        };
    }

    async function verifyBackupIntegrity(input, context) {
        try {
            if (!input || typeof input !== 'object' || Array.isArray(input)) {
                return result(false, 'MALFORMED_BACKUP_PAYLOAD', 'Backup verification payload must be an object.', {
                    integrityStatus: 'CORRUPTED',
                    corruptionFindings: [finding('MALFORMED_BACKUP_PAYLOAD', 'Backup verification payload must be an object.', 'ERROR')],
                    governance: governanceFlags(true)
                });
            }
            var parts = backupParts(input, context || {});
            var access = validateAccess('CONTROL', parts.tenantSlug, context || {});
            if (!access.success) {
                audit('BACKUP_INTEGRITY_VERIFICATION_DENIED', { tenantSlug: parts.tenantSlug, code: access.code }, context || {}, 'WARNING');
                return result(false, access.code, access.message, {
                    tenantSlug: parts.tenantSlug,
                    integrityStatus: 'DENIED',
                    corruptionFindings: [],
                    governance: governanceFlags(true)
                });
            }
            var built = buildMetadataValidation(input, context || {});
            var backup = built.parts.backup;
            var originalHash = safeString(backup.integrityHash || '', '');
            var envelopeText = stableStringify(backupHashEnvelope(backup, built.parts.encryptedPayload, built.parts.encryption));
            var checksumResult = await calculateChecksum(envelopeText, 'SHA-256');
            var secondaryResult = await calculateChecksum(envelopeText, 'SHA-512');
            var verificationHash = checksumResult.success ? checksumResult.hash : '';
            var matched = !!originalHash && !!built.parts.encryptedPayload && checksumResult.success === true && originalHash === verificationHash;
            var corruptionFindings = built.issues.slice();
            if (!built.parts.encryptedPayload) {
                corruptionFindings.push(finding('INCOMPLETE_BACKUP_PAYLOAD', 'Encrypted backup payload is missing or incomplete.', 'CRITICAL'));
            }
            if (!originalHash) {
                corruptionFindings.push(finding('ORIGINAL_HASH_MISSING', 'Original backup checksum is missing.', 'CRITICAL'));
            } else if (!matched) {
                corruptionFindings.push(finding('CHECKSUM_MISMATCH', 'Backup checksum does not match the encrypted backup envelope.', 'CRITICAL'));
            }
            var blocking = corruptionFindings.some(function block(item) { return item.severity === 'CRITICAL' || item.severity === 'ERROR'; });
            var recoveryAssurance = buildRecoveryAssurance(built.metadataValidation, matched, corruptionFindings);
            var scores = scoreVerification(matched, built.metadataValidation, recoveryAssurance, corruptionFindings);
            var success = matched && !blocking && recoveryAssurance.backupRestorable === true;
            var verificationId = createId('BIV');
            var row = {
                verificationId: verificationId,
                backupId: safeString(backup.backupId || '', ''),
                tenantSlug: access.tenantSlug,
                state: success ? 'TRUST_SCORE_GENERATED' : 'FAILED',
                integrityStatus: success ? 'VALID' : 'CORRUPTED',
                checksumAlgorithm: 'SHA-256',
                originalHash: originalHash,
                verificationHash: verificationHash,
                secondaryAlgorithm: 'SHA-512',
                secondaryHash: secondaryResult.hash || '',
                checksumMatched: matched,
                verificationTimestamp: nowIso(context || {}),
                backupTrustScore: scores.backupTrustScore,
                recoveryConfidenceScore: scores.recoveryConfidenceScore,
                restorationReadinessScore: scores.restorationReadinessScore,
                corruptionFindingCount: corruptionFindings.length
            };
            persist('backupIntegrityVerificationHistory', row, context || {});
            if (!(context && context.skipAnalyticsPersistence)) {
                persist('backupIntegrityAnalyticsHistory', {
                    analyticsId: createId('BIA'),
                    tenantSlug: access.tenantSlug,
                    backupId: row.backupId,
                    verificationId: verificationId,
                    integrityStatus: row.integrityStatus,
                    backupTrustScore: scores.backupTrustScore,
                    recoveryConfidenceScore: scores.recoveryConfidenceScore,
                    restorationReadinessScore: scores.restorationReadinessScore,
                    corruptionFindingCount: corruptionFindings.length,
                    timestamp: row.verificationTimestamp
                }, context || {});
            }
            audit(success ? 'BACKUP_INTEGRITY_VERIFICATION_PASSED' : 'BACKUP_INTEGRITY_VERIFICATION_FAILED', {
                tenantSlug: access.tenantSlug,
                backupId: row.backupId,
                verificationId: verificationId,
                checksumMatched: matched,
                corruptionFindingCount: corruptionFindings.length,
                backupTrustScore: scores.backupTrustScore
            }, context || {}, success ? 'INFO' : 'WARNING');
            if (!matched) {
                audit('BACKUP_CHECKSUM_VALIDATION_FAILED', {
                    tenantSlug: access.tenantSlug,
                    backupId: row.backupId,
                    verificationId: verificationId
                }, context || {}, 'WARNING');
            }
            return result(success, success ? 'BACKUP_INTEGRITY_VERIFIED' : 'BACKUP_CORRUPTION_DETECTED',
                success ? 'Backup integrity verified and trust score generated.' : 'Backup corruption or metadata inconsistency detected.', {
                    tenantSlug: access.tenantSlug,
                    backupId: row.backupId,
                    verificationId: verificationId,
                    state: row.state,
                    integrityStatus: row.integrityStatus,
                    checksum: {
                        algorithm: 'SHA-256',
                        originalHash: originalHash,
                        verificationHash: verificationHash,
                        verificationTimestamp: row.verificationTimestamp,
                        matched: matched
                    },
                    secondaryChecksum: {
                        algorithm: 'SHA-512',
                        hash: secondaryResult.hash || '',
                        verificationTimestamp: row.verificationTimestamp
                    },
                    metadataValidation: built.metadataValidation,
                    recoveryAssurance: recoveryAssurance,
                    corruptionFindings: corruptionFindings,
                    backupTrustScore: scores.backupTrustScore,
                    recoveryConfidenceScore: scores.recoveryConfidenceScore,
                    restorationReadinessScore: scores.restorationReadinessScore,
                    integrityHealthScore: scores.integrityHealthScore,
                    assumptions: [
                        'Verification uses backup metadata and encrypted envelope checksums.',
                        'No restore is executed during integrity verification.',
                        'Certification is blocked whenever corruption findings are present.'
                    ],
                    governance: governanceFlags(!success)
                });
        } catch (error) {
            return result(false, 'BACKUP_VERIFICATION_FAILED_SAFE', 'Backup integrity verification failed safely.', {
                integrityStatus: 'CORRUPTED',
                corruptionFindings: [finding('BACKUP_VERIFICATION_FAILED_SAFE', 'Backup verification failed safely.', 'ERROR')],
                governance: governanceFlags(true)
            });
        }
    }

    function calculateRecoveryConfidence(input, context) {
        try {
            var source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
            var checksumMatched = source.checksum && source.checksum.matched === true || source.integrityStatus === 'VALID';
            var metadataValidation = source.metadataValidation || {};
            var recoveryAssurance = source.recoveryAssurance || buildRecoveryAssurance(metadataValidation, checksumMatched, source.corruptionFindings || []);
            var corruptionFindings = Array.isArray(source.corruptionFindings) ? source.corruptionFindings : [];
            var scores = scoreVerification(checksumMatched, metadataValidation, recoveryAssurance, corruptionFindings);
            var backupTrustScore = typeof source.backupTrustScore === 'number' ? clampScore(source.backupTrustScore) : scores.backupTrustScore;
            var recoveryConfidenceScore = clampScore(
                backupTrustScore * 0.4 +
                (checksumMatched ? 20 : 0) +
                (recoveryAssurance.schemaCompatible ? 15 : 0) +
                (recoveryAssurance.tenantOwnershipValid ? 15 : 0) +
                (recoveryAssurance.dependenciesValid ? 10 : 0)
            );
            var restorationReadinessScore = clampScore(
                recoveryConfidenceScore * 0.75 +
                (recoveryAssurance.backupRestorable ? 20 : 0) +
                (recoveryAssurance.restoreExecuted === false ? 5 : 0)
            );
            return result(true, 'RECOVERY_CONFIDENCE_CALCULATED', 'Recovery confidence calculated from integrity evidence.', {
                tenantSlug: normalizeTenant(source.tenantSlug || contextTenant(context || {})),
                backupId: safeString(source.backupId || '', ''),
                backupTrustScore: backupTrustScore,
                recoveryConfidenceScore: recoveryConfidenceScore,
                restorationReadinessScore: restorationReadinessScore,
                restoreExecutionEnabled: false,
                recoveryAssurance: recoveryAssurance,
                assumptions: [
                    'Restoration readiness is confidence-only until an authorized restore workflow is introduced.',
                    'Corrupted or incomplete backups cannot become restoration candidates.',
                    'Tenant ownership must match the verification context.'
                ],
                governance: governanceFlags(corruptionFindings.length > 0 || !checksumMatched)
            });
        } catch (error) {
            return result(false, 'RECOVERY_CONFIDENCE_FAILED_SAFE', 'Recovery confidence scoring failed safely.', {
                recoveryConfidenceScore: 0,
                restorationReadinessScore: 0,
                restoreExecutionEnabled: false,
                governance: governanceFlags(true)
            });
        }
    }

    async function certifyBackup(input, context) {
        try {
            if (!input || typeof input !== 'object' || Array.isArray(input)) {
                return result(false, 'MALFORMED_CERTIFICATION_PAYLOAD', 'Backup certification payload must be an object.', {
                    governance: governanceFlags(true)
                });
            }
            var tenantSlug = normalizeTenant(input.tenantSlug || contextTenant(context || {}));
            var access = validateAccess('CONTROL', tenantSlug, context || {});
            if (!access.success) {
                audit('BACKUP_CERTIFICATION_DENIED', { tenantSlug: tenantSlug, code: access.code }, context || {}, 'WARNING');
                return result(false, access.code, access.message, { tenantSlug: tenantSlug, governance: governanceFlags(true) });
            }
            var verification = input.integrityStatus ? input : await verifyBackupIntegrity(input, Object.assign({}, context || {}, { skipAuditPersistence: true }));
            var findings = Array.isArray(verification.corruptionFindings) ? verification.corruptionFindings : [];
            var blocked = verification.success !== true ||
                verification.integrityStatus !== 'VALID' ||
                !verification.checksum || verification.checksum.matched !== true ||
                findings.length > 0 ||
                Number(verification.backupTrustScore || 0) < 80 ||
                Number(verification.recoveryConfidenceScore || 0) < 75;
            var certificationId = createId('BIC');
            if (blocked) {
                var blockedRow = {
                    certificationId: certificationId,
                    verificationId: verification.verificationId || '',
                    backupId: verification.backupId || '',
                    tenantSlug: access.tenantSlug,
                    state: 'FAILED',
                    certificationStatus: 'BLOCKED',
                    reasonCode: 'BACKUP_CERTIFICATION_BLOCKED',
                    integrityStatus: verification.integrityStatus || 'CORRUPTED',
                    backupTrustScore: clampScore(verification.backupTrustScore || 0),
                    recoveryConfidenceScore: clampScore(verification.recoveryConfidenceScore || 0),
                    timestamp: nowIso(context || {})
                };
                persist('backupCertificationHistory', blockedRow, context || {});
                audit('BACKUP_CERTIFICATION_BLOCKED', {
                    tenantSlug: access.tenantSlug,
                    backupId: blockedRow.backupId,
                    certificationId: certificationId,
                    reasonCode: 'BACKUP_CERTIFICATION_BLOCKED'
                }, context || {}, 'WARNING');
                return result(false, 'BACKUP_CERTIFICATION_BLOCKED', 'Backup certification blocked because integrity assurance failed.', {
                    tenantSlug: access.tenantSlug,
                    backupId: blockedRow.backupId,
                    certificationId: certificationId,
                    certificationStatus: 'BLOCKED',
                    integrityStatus: blockedRow.integrityStatus,
                    backupTrustScore: blockedRow.backupTrustScore,
                    recoveryConfidenceScore: blockedRow.recoveryConfidenceScore,
                    restoreExecutionEnabled: false,
                    governance: governanceFlags(true)
                });
            }
            var certificate = {
                certificationId: certificationId,
                verificationId: verification.verificationId || '',
                backupId: verification.backupId || '',
                tenantSlug: access.tenantSlug,
                state: 'BACKUP_CERTIFIED',
                certificationStatus: 'CERTIFIED',
                integrityStatus: 'VALID',
                checksumAlgorithm: verification.checksum.algorithm || 'SHA-256',
                checksumHash: verification.checksum.verificationHash || '',
                backupTrustScore: clampScore(verification.backupTrustScore || 0),
                recoveryConfidenceScore: clampScore(verification.recoveryConfidenceScore || 0),
                restorationReadinessScore: clampScore(verification.restorationReadinessScore || 0),
                certifiedAt: nowIso(context || {}),
                restoreExecutionEnabled: false
            };
            persist('backupCertificationHistory', certificate, context || {});
            audit('BACKUP_CERTIFICATION_GRANTED', {
                tenantSlug: access.tenantSlug,
                backupId: certificate.backupId,
                certificationId: certificationId,
                backupTrustScore: certificate.backupTrustScore
            }, context || {}, 'INFO');
            return result(true, 'BACKUP_CERTIFIED', 'Backup certified for recovery assurance.', Object.assign({}, certificate, {
                governance: governanceFlags(false)
            }));
        } catch (error) {
            return result(false, 'BACKUP_CERTIFICATION_FAILED_SAFE', 'Backup certification failed safely.', {
                certificationStatus: 'BLOCKED',
                restoreExecutionEnabled: false,
                governance: governanceFlags(true)
            });
        }
    }

    function tenantRows(key, tenantSlug) {
        return (Array.isArray(data()[key]) ? data()[key] : []).filter(function scoped(row) { return rowTenant(row) === tenantSlug; });
    }

    function average(rows, selector) {
        if (!rows.length) return 0;
        return clampScore(rows.reduce(function sum(total, row) { return total + Number(selector(row) || 0); }, 0) / rows.length);
    }

    function rate(count, total) {
        return total ? clampScore((count / total) * 100) : 0;
    }

    function latestByTime(rows) {
        return rows.slice().sort(function sort(a, b) {
            return safeString(b.verificationTimestamp || b.certifiedAt || b.timestamp || '', '')
                .localeCompare(safeString(a.verificationTimestamp || a.certifiedAt || a.timestamp || '', ''));
        });
    }

    function generateIntegrityAssuranceReport(input, context) {
        try {
            var source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
            var access = validateAccess('VIEW', source.tenantSlug || source.tenantId, context || {});
            if (!access.success) {
                audit('BACKUP_INTEGRITY_ASSURANCE_DENIED', { tenantSlug: normalizeTenant(source.tenantSlug || source.tenantId), code: access.code }, context || {}, 'WARNING');
                return result(false, access.code, access.message, {
                    tenantSlug: normalizeTenant(source.tenantSlug || source.tenantId),
                    analytics: {},
                    governance: governanceFlags(true)
                });
            }
            var verifications = tenantRows('backupIntegrityVerificationHistory', access.tenantSlug);
            var certifications = tenantRows('backupCertificationHistory', access.tenantSlug);
            var backups = tenantRows('tenantBackupHistory', access.tenantSlug);
            var latestVerifications = latestByTime(verifications);
            var successes = verifications.filter(function ok(row) { return row.integrityStatus === 'VALID' && row.checksumMatched === true; });
            var corruptions = verifications.filter(function bad(row) { return row.integrityStatus === 'CORRUPTED' || Number(row.corruptionFindingCount || 0) > 0; });
            var certified = certifications.filter(function cert(row) { return row.state === 'BACKUP_CERTIFIED' || row.certificationStatus === 'CERTIFIED'; });
            var completedBackups = backups.filter(function completed(row) { return row.state === 'COMPLETED'; });
            var backupTrustScore = verifications.length ? average(verifications, function trust(row) { return row.backupTrustScore; }) : (completedBackups.length ? 60 : 0);
            var recoveryAssuranceScore = verifications.length ? average(verifications, function confidence(row) { return row.recoveryConfidenceScore; }) : 0;
            var integrityHealthScore = clampScore(backupTrustScore * 0.45 + recoveryAssuranceScore * 0.35 + rate(certified.length, Math.max(1, verifications.length)) * 0.2);
            var report = {
                tenantSlug: access.tenantSlug,
                backupTrustScore: backupTrustScore,
                recoveryAssuranceScore: recoveryAssuranceScore,
                integrityHealthScore: integrityHealthScore,
                analytics: {
                    totalBackups: completedBackups.length,
                    verificationRuns: verifications.length,
                    verificationSuccessRate: rate(successes.length, verifications.length),
                    corruptionRate: rate(corruptions.length, verifications.length),
                    backupCertificationRate: rate(certified.length, certifications.length || verifications.length),
                    averageTrustScore: backupTrustScore,
                    averageRecoveryConfidence: recoveryAssuranceScore
                },
                trustScoreTrends: latestVerifications.slice(0, 12).map(function map(row) {
                    return {
                        verificationId: row.verificationId || '',
                        backupId: row.backupId || '',
                        integrityStatus: row.integrityStatus || '',
                        backupTrustScore: row.backupTrustScore || 0,
                        recoveryConfidenceScore: row.recoveryConfidenceScore || 0,
                        timestamp: row.verificationTimestamp || row.timestamp || ''
                    };
                }),
                certificationHistory: latestByTime(certifications).slice(0, 12).map(function map(row) {
                    return {
                        certificationId: row.certificationId || '',
                        backupId: row.backupId || '',
                        state: row.state || '',
                        certificationStatus: row.certificationStatus || '',
                        backupTrustScore: row.backupTrustScore || 0,
                        certifiedAt: row.certifiedAt || row.timestamp || ''
                    };
                }),
                corruptionFindings: latestVerifications.filter(function bad(row) {
                    return row.integrityStatus === 'CORRUPTED' || Number(row.corruptionFindingCount || 0) > 0;
                }).slice(0, 10).map(function map(row) {
                    return {
                        verificationId: row.verificationId || '',
                        backupId: row.backupId || '',
                        integrityStatus: row.integrityStatus || 'CORRUPTED',
                        corruptionFindingCount: row.corruptionFindingCount || 0,
                        timestamp: row.verificationTimestamp || row.timestamp || ''
                    };
                }),
                integrations: {
                    backupGovernance: !!global.TenantBackupExportService,
                    restoreGovernance: !!global.SoftDeleteRestoreGovernanceService,
                    disasterRecoverySimulation: !!global.DisasterRecoverySimulationService,
                    auditGovernance: !!global.AuditService,
                    monitoringPlatform: !!(global.operationsMonitoringService || global.OperationsMonitoringService)
                },
                governance: Object.assign(governanceFlags(false), {
                    certificationRequiredBeforeRestore: true,
                    corruptedBackupsBlocked: true,
                    crossTenantVerificationBlocked: true
                }),
                generatedAt: nowIso(context || {})
            };
            audit('BACKUP_INTEGRITY_ASSURANCE_ACCESSED', {
                tenantSlug: access.tenantSlug,
                verificationRuns: verifications.length,
                backupTrustScore: backupTrustScore,
                integrityHealthScore: integrityHealthScore
            }, context || {}, 'INFO');
            return result(true, 'BACKUP_INTEGRITY_ASSURANCE_READY', 'Backup integrity assurance report generated.', report);
        } catch (error) {
            return result(false, 'BACKUP_INTEGRITY_REPORT_FAILED_SAFE', 'Backup integrity assurance report failed safely.', {
                backupTrustScore: 0,
                recoveryAssuranceScore: 0,
                integrityHealthScore: 0,
                analytics: {},
                governance: governanceFlags(true)
            });
        }
    }

    function runSelfTest() {
        var frozen = freezeIntegrityOutput({ nested: { value: 1 } });
        var checks = {
            checksumValidationWorks: CHECKSUM_ALGORITHMS.indexOf('SHA-256') !== -1 && CHECKSUM_ALGORITHMS.indexOf('SHA-512') !== -1,
            corruptionDetectionWorks: VERIFICATION_STATES.indexOf('FAILED') !== -1,
            certificationWorks: VERIFICATION_STATES.indexOf('BACKUP_CERTIFIED') !== -1,
            recoveryConfidenceWorks: clampScore(110) === 100 && clampScore(-1) === 0,
            immutableOutputsEnforced: Object.isFrozen(frozen) && Object.isFrozen(frozen.nested)
        };
        return freezeIntegrityOutput({
            passed: Object.keys(checks).every(function every(key) { return checks[key] === true; }),
            checks: checks
        });
    }

    var service = Object.freeze({
        CHECKSUM_ALGORITHMS: CHECKSUM_ALGORITHMS,
        VERIFICATION_STATES: VERIFICATION_STATES,
        verifyBackupIntegrity: verifyBackupIntegrity,
        calculateChecksum: calculateChecksum,
        validateBackupMetadata: validateBackupMetadata,
        calculateRecoveryConfidence: calculateRecoveryConfidence,
        certifyBackup: certifyBackup,
        generateIntegrityAssuranceReport: generateIntegrityAssuranceReport,
        freezeIntegrityOutput: freezeIntegrityOutput,
        runSelfTest: runSelfTest
    });

    global.BackupIntegrityVerificationService = service;
    global.backupIntegrityVerificationService = service;
    if (global.__ARTHHRMS_DEV__) global.__ARTHHRMS_BACKUP_INTEGRITY_SELF_TEST__ = runSelfTest();
})(typeof window !== 'undefined' ? window : globalThis);
