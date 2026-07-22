/**
 * environmentSnapshotService.js
 * ARTHHRMS Enterprise Environment Snapshot + Recovery Baseline Governance.
 *
 * Platform-control-only snapshot intelligence for environment and governance
 * recovery baselines. It snapshots only environment/governance surfaces,
 * validates restoration safety, and never snapshots tenant business records.
 */
(function attachEnvironmentSnapshotService(global) {
    'use strict';

    var VERSION = '1.0.0';
    var PREFIX = '[EnvironmentSnapshotService]';

    var SNAPSHOT_STATES = Object.freeze([
        'CREATED',
        'VERIFIED',
        'ACTIVE',
        'RECOVERY_READY',
        'RESTORED',
        'SUPERSEDED',
        'ARCHIVED'
    ]);

    var SNAPSHOT_TYPES = Object.freeze([
        'CONFIGURATION_SNAPSHOT',
        'DEPLOYMENT_SNAPSHOT',
        'RELEASE_SNAPSHOT',
        'FEATURE_ROLLOUT_SNAPSHOT',
        'GOVERNANCE_SNAPSHOT',
        'ENVIRONMENT_STATE_SNAPSHOT'
    ]);

    var SEVERITIES = Object.freeze({
        INFO: 'INFO',
        WARNING: 'WARNING',
        HIGH_RISK: 'HIGH_RISK',
        CRITICAL_BLOCKER: 'CRITICAL_BLOCKER'
    });

    var SENSITIVE_KEY_PATTERN = /(salary|payroll|leave.?balance|compensation|payslip|bonus|bank|tax|employee.?id|emp.?id|user.?id|actor.?id|candidate|resume|document|attachment|file.?name|object.?path|storage.?path|public.?url|signed.?url|download.?url|url|path|token|secret|jwt|authorization|private.?key|raw|payload|content|body|messageText|note|comment|employee.?record|confidential|private|email|phone|name|employees|payrollRecords|hrDocuments|tenantBusinessData)/i;
    var SENSITIVE_VALUE_PATTERN = /(https?:\/\/[^\s"',}]+|private:\/\/[^\s"',}]+|\b(EMP-[A-Z0-9-]+|employee|salary|payroll|leave balance|compensation|confidential|private|secret|token|document|attachment)\b[^,;}]*)/ig;

    var SAFE_OUTPUT_KEYS = Object.freeze({
        success: true,
        allowed: true,
        readOnly: true,
        aggregateOnly: true,
        infrastructureOnly: true,
        monitoringOnly: true,
        snapshotAuthority: true,
        restorationAuthority: true,
        configurationMutationAuthority: true,
        visibility: true,
        snapshot: true,
        snapshotId: true,
        baselineId: true,
        releaseId: true,
        deploymentId: true,
        tenantId: true,
        tenantSlug: true,
        environment: true,
        snapshotState: true,
        snapshotStateRaw: true,
        snapshotType: true,
        snapshotTypeRaw: true,
        snapshotHash: true,
        snapshotContent: true,
        environmentState: true,
        configuration: true,
        deploymentSettings: true,
        releaseState: true,
        featureFlags: true,
        governanceSettings: true,
        serviceDependencies: true,
        metadata: true,
        createdAt: true,
        verifiedAt: true,
        restoredAt: true,
        generatedAt: true,
        timestamp: true,
        state: true,
        states: true,
        type: true,
        types: true,
        severity: true,
        classification: true,
        snapshotGovernanceModel: true,
        activeBaselines: true,
        baselineRecords: true,
        snapshotHistory: true,
        restorationHistory: true,
        restorationValidation: true,
        restorationBlocked: true,
        restorationConfidence: true,
        restorationConfidenceScore: true,
        restorationSafety: true,
        restorationDuration: true,
        restorationDurationMinutes: true,
        snapshotIntegrity: true,
        integrityVerified: true,
        snapshotCorrupted: true,
        incompleteSnapshot: true,
        compatible: true,
        compatibilityVerified: true,
        dependencyHealthy: true,
        dependencyMismatch: true,
        environmentCompatible: true,
        environmentConsistent: true,
        rollbackSafe: true,
        tenantIsolationIntegrity: true,
        baselineComparison: true,
        baselineConsistent: true,
        baselineConsistencyScore: true,
        driftFromBaselineScore: true,
        recoveryReadiness: true,
        recoveryReadinessScore: true,
        recoverySucceeded: true,
        recoveryReadySnapshots: true,
        restorationConfidenceTrend: true,
        environmentStabilityTrend: true,
        snapshotAnalytics: true,
        snapshotCreationFrequency: true,
        snapshotIntegrityFailures: true,
        recoverySuccessRate: true,
        restorationDurationAverage: true,
        baselineDriftTrends: true,
        governanceIntegrations: true,
        configurationDriftIntegrated: true,
        rollbackGovernanceIntegrated: true,
        deploymentValidationIntegrated: true,
        environmentPromotionIntegrated: true,
        globalAuditVisibilityIntegrated: true,
        auditSummary: true,
        snapshotActionsAuditable: true,
        auditReady: true,
        telemetryReady: true,
        metricsReady: true,
        accessGovernance: true,
        crossTenantSnapshotLeakageBlocked: true,
        tenantBusinessDataExcluded: true,
        salaryVisibility: true,
        leaveBalanceVisibility: true,
        confidentialEmployeeRecordsVisible: true,
        rawTenantDocumentsVisible: true,
        unsafeRestorationBlocked: true,
        baselineCorruptionBlocked: true,
        governanceBypassBlocked: true,
        immutableSnapshotHistory: true,
        immutableRestorationHistory: true,
        immutableBaselineRecords: true,
        failures: true,
        warnings: true,
        failureCode: true,
        warningCode: true,
        message: true,
        recommendation: true,
        sections: true,
        tests: true,
        name: true,
        passed: true,
        coverage: true
    });

    var auditForwarding = false;
    var telemetryForwarding = false;
    var metricForwarding = false;

    function safeWarn(message, details) {
        try {
            if (global.console && typeof global.console.warn === 'function') {
                if (details !== undefined) global.console.warn(PREFIX + ' ' + message, details);
                else global.console.warn(PREFIX + ' ' + message);
            }
        } catch (error) {}
    }

    function safeString(value, fallback) {
        if (value === null || value === undefined) return fallback || '';
        try { return String(value); } catch (error) { return fallback || ''; }
    }

    function safeNumber(value, fallback) {
        var next = Number(value);
        return isFinite(next) ? next : (fallback || 0);
    }

    function clamp(value, min, max) {
        var next = safeNumber(value, 0);
        if (next < min) return min;
        if (next > max) return max;
        return next;
    }

    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function normalizeToken(value) {
        return safeString(value || '', '').trim().toUpperCase().replace(/[\s-]+/g, '_').replace(/[^A-Z0-9_]/g, '_');
    }

    function normalizeRole(value) {
        var role = normalizeToken(value || '');
        if (role === 'SUPERADMIN') return 'SUPER_ADMIN';
        if (role === 'PLATFORMOWNER' || role === 'OWNER' || role === 'ROOT') return 'PLATFORM_OWNER';
        if (role === 'HRHEAD') return 'HR_HEAD';
        return role || 'EMPLOYEE';
    }

    function normalizeTenantSlug(value) {
        var slug = safeString(value || '', '').trim().toLowerCase();
        slug = slug.replace(/&/g, ' and ');
        slug = slug.replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        return slug;
    }

    function normalizeEnvironment(value, fallback) {
        var env = normalizeToken(value || fallback || 'PRODUCTION');
        if (env === 'PROD' || env === 'FULL_PRODUCTION' || env === 'LIMITED_PRODUCTION') return 'PRODUCTION';
        if (env === 'STAGE') return 'STAGING';
        if (env === 'DEV') return 'DEVELOPMENT';
        return env || 'PRODUCTION';
    }

    function normalizeSnapshotState(value, fallback) {
        var state = normalizeToken(value || fallback || 'CREATED');
        if (state === 'READY') return 'RECOVERY_READY';
        if (state === 'VALIDATED') return 'VERIFIED';
        if (SNAPSHOT_STATES.indexOf(state) !== -1) return state;
        return fallback || 'CREATED';
    }

    function normalizeSnapshotType(value, fallback) {
        var type = normalizeToken(value || fallback || 'ENVIRONMENT_STATE_SNAPSHOT');
        if (type === 'CONFIGURATION') return 'CONFIGURATION_SNAPSHOT';
        if (type === 'DEPLOYMENT') return 'DEPLOYMENT_SNAPSHOT';
        if (type === 'RELEASE') return 'RELEASE_SNAPSHOT';
        if (type === 'FEATURE_ROLLOUT') return 'FEATURE_ROLLOUT_SNAPSHOT';
        if (type === 'GOVERNANCE') return 'GOVERNANCE_SNAPSHOT';
        if (SNAPSHOT_TYPES.indexOf(type) !== -1) return type;
        return fallback || 'ENVIRONMENT_STATE_SNAPSHOT';
    }

    function nowIso(context) {
        try { return context && context.now ? new Date(context.now).toISOString() : new Date().toISOString(); } catch (error) { return new Date().toISOString(); }
    }

    function db() {
        try { return global.DB || null; } catch (error) { return null; }
    }

    function rawData() {
        try {
            var source = db();
            return source && typeof source.get === 'function' ? source.get() || {} : {};
        } catch (error) {
            safeWarn('Database read failed safely.', error && error.message);
            return {};
        }
    }

    function list(data, key) {
        return Array.isArray(data && data[key]) ? data[key].slice() : [];
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
        if (value === null || value === undefined) return value;
        if (typeof value === 'string') return value.replace(SENSITIVE_VALUE_PATTERN, '[redacted]').trim();
        if (typeof value === 'number' || typeof value === 'boolean') return value;
        if (value instanceof Date) return value.toISOString();
        if (Array.isArray(value)) return value.slice(0, 250).map(function item(row) { return sanitizedValue(row, key, (seen || []).slice()); }).filter(function keep(row) { return typeof row !== 'undefined'; });
        if (typeof value === 'object') return cloneSanitized(value, seen || []);
        return safeString(value, '');
    }

    function cloneSanitized(input, seen) {
        if (!input || typeof input !== 'object') return sanitizedValue(input, '', seen || []);
        var refs = seen || [];
        if (refs.indexOf(input) !== -1) return '[Circular]';
        refs.push(input);
        if (Array.isArray(input)) return input.slice(0, 250).map(function cloneItem(row) { return cloneSanitized(row, refs.slice()); }).filter(function keep(row) { return typeof row !== 'undefined'; });
        var output = {};
        try {
            Object.keys(input).forEach(function eachKey(key) {
                if (SENSITIVE_KEY_PATTERN.test(key) && !SAFE_OUTPUT_KEYS[key]) return;
                var value = sanitizedValue(input[key], key, refs.slice());
                if (typeof value !== 'undefined') output[key] = value;
            });
        } catch (error) {}
        return output;
    }

    function freezeSnapshotOutput(value) {
        return deepFreeze(cloneSanitized(value || {}));
    }

    function safeFailure(code, severity, message, metadata) {
        return {
            failureCode: normalizeToken(code || 'ENVIRONMENT_SNAPSHOT_FAILURE'),
            severity: severity || SEVERITIES.HIGH_RISK,
            message: safeString(message || 'Environment snapshot governance failed safely.', ''),
            metadata: cloneSanitized(metadata || {})
        };
    }

    function safeWarning(code, severity, message, recommendation, metadata) {
        return {
            warningCode: normalizeToken(code || 'ENVIRONMENT_SNAPSHOT_WARNING'),
            severity: severity || SEVERITIES.WARNING,
            message: safeString(message || 'Environment snapshot governance warning.', ''),
            recommendation: safeString(recommendation || 'Review recovery baseline evidence.', ''),
            metadata: cloneSanitized(metadata || {})
        };
    }

    function contextTenant(context) {
        return normalizeTenantSlug(context && (context.tenantSlug || context.tenantId || context.companyId || context.actor && (context.actor.tenantSlug || context.actor.tenantId || context.actor.companyId)));
    }

    function rowTenant(row) {
        var metadata = row && typeof row === 'object' && row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
        return normalizeTenantSlug(row && (row.tenantSlug || row.tenantId || row.companyId || row.companySlug || metadata.tenantSlug || metadata.tenantId || metadata.companyId));
    }

    function stableSerialize(value) {
        try {
            if (value === undefined) return 'missing';
            if (value === null) return 'null';
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return safeString(value, '');
            if (Array.isArray(value)) return '[' + value.map(stableSerialize).join(',') + ']';
            if (isPlainObject(value)) {
                return '{' + Object.keys(value).sort().map(function pair(key) {
                    if (SENSITIVE_KEY_PATTERN.test(key) && !SAFE_OUTPUT_KEYS[key]) return '';
                    return key + ':' + stableSerialize(value[key]);
                }).filter(Boolean).join(',') + '}';
            }
            return safeString(value, '');
        } catch (error) {
            return 'unserializable';
        }
    }

    function hashValue(value) {
        var text = stableSerialize(value);
        var hash = 2166136261;
        for (var index = 0; index < text.length; index += 1) {
            hash ^= text.charCodeAt(index);
            hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
        }
        return 'SNAP-' + (hash >>> 0).toString(16).toUpperCase();
    }

    function allowedSnapshotContent(source) {
        var input = isPlainObject(source) ? source : {};
        return cloneSanitized({
            environmentState: input.environmentState || input.environment || {},
            configuration: input.configuration || input.config || {},
            deploymentSettings: input.deploymentSettings || input.deployment || {},
            releaseState: input.releaseState || input.release || {},
            featureFlags: input.featureFlags || input.flags || {},
            governanceSettings: input.governanceSettings || input.governance || {},
            serviceDependencies: input.serviceDependencies || input.dependencies || {}
        });
    }

    function validateSnapshotScope(payload, context) {
        try {
            var input = isPlainObject(payload) ? payload : {};
            var ctx = isPlainObject(context) ? context : {};
            var role = normalizeRole(ctx.actor && (ctx.actor.role || ctx.actor.type || ctx.actor.userRole));
            var routeType = normalizeToken(ctx.routeType || ctx.surface || 'platform');
            var targetTenant = normalizeTenantSlug(input.targetTenantId || input.tenantSlug || input.tenantId);
            var actorTenant = contextTenant(ctx);
            var archived = normalizeSnapshotState(input.snapshotState || input.state || input.status, '') === 'ARCHIVED';
            var restorationRequested = input.restorationRequested === true || input.restoreRequested === true || input.baselineUpdateRequested === true;
            var failures = [];
            if (routeType !== 'PLATFORM') failures.push(safeFailure('SNAPSHOT_GOVERNANCE_PLATFORM_ONLY', SEVERITIES.CRITICAL_BLOCKER, 'Environment snapshot governance is isolated to platform-control.'));
            if (role !== 'PLATFORM_OWNER' && role !== 'SUPER_ADMIN') failures.push(safeFailure('SNAPSHOT_GOVERNANCE_ROLE_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Tenant roles cannot access environment snapshot governance.'));
            if (role === 'SUPER_ADMIN' && restorationRequested) failures.push(safeFailure('SUPER_ADMIN_RESTORATION_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'SUPER_ADMIN may monitor snapshots only and cannot restore baselines.'));
            if (role === 'SUPER_ADMIN' && !(input.infrastructureOnly === true && input.monitoringOnly === true)) failures.push(safeFailure('SUPER_ADMIN_SNAPSHOT_MONITORING_ONLY', SEVERITIES.CRITICAL_BLOCKER, 'SUPER_ADMIN snapshot visibility must be infrastructure monitoring only.'));
            if (role === 'SUPER_ADMIN' && targetTenant && actorTenant && targetTenant !== actorTenant) failures.push(safeFailure('CROSS_TENANT_SNAPSHOT_VISIBILITY_BLOCKED', SEVERITIES.CRITICAL_BLOCKER, 'Cross-tenant snapshot visibility is blocked.'));
            if (archived && restorationRequested) failures.push(safeFailure('ARCHIVED_SNAPSHOT_HISTORY_IMMUTABLE', SEVERITIES.CRITICAL_BLOCKER, 'Archived snapshot history cannot be modified.'));
            var allowed = failures.length === 0;
            return freezeSnapshotOutput({
                success: allowed,
                allowed: allowed,
                readOnly: true,
                aggregateOnly: true,
                infrastructureOnly: role === 'SUPER_ADMIN',
                monitoringOnly: role === 'SUPER_ADMIN',
                snapshotAuthority: allowed && role === 'PLATFORM_OWNER',
                restorationAuthority: false,
                configurationMutationAuthority: false,
                visibility: allowed ? (role === 'SUPER_ADMIN' ? 'INFRASTRUCTURE_SNAPSHOT_VISIBILITY' : 'ENVIRONMENT_SNAPSHOT_GOVERNANCE') : 'NONE',
                failures: failures,
                accessGovernance: {
                    crossTenantSnapshotLeakageBlocked: true,
                    tenantBusinessDataExcluded: true,
                    salaryVisibility: false,
                    leaveBalanceVisibility: false,
                    confidentialEmployeeRecordsVisible: false,
                    rawTenantDocumentsVisible: false,
                    unsafeRestorationBlocked: true,
                    governanceBypassBlocked: true
                }
            });
        } catch (error) {
            return freezeSnapshotOutput({
                success: false,
                allowed: false,
                visibility: 'NONE',
                failures: [safeFailure('SNAPSHOT_SCOPE_VALIDATION_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Snapshot scope validation failed safely.')]
            });
        }
    }

    function createEnvironmentSnapshot(payload, context) {
        try {
            if (!isPlainObject(payload)) {
                return freezeSnapshotOutput({
                    success: false,
                    malformedPayloads: true,
                    failures: [safeFailure('MALFORMED_SNAPSHOT_PAYLOAD', SEVERITIES.HIGH_RISK, 'Snapshot payload must be an object.')]
                });
            }
            var ctx = isPlainObject(context) ? context : {};
            var scope = validateSnapshotScope(Object.assign({ readOnly: true, aggregateOnly: true }, payload), ctx);
            if (!scope.allowed) {
                return freezeSnapshotOutput({
                    success: false,
                    snapshot: {},
                    failures: scope.failures || [],
                    accessGovernance: scope.accessGovernance || {}
                });
            }
            var content = allowedSnapshotContent(payload.source || payload.snapshotContent || payload);
            var snapshot = {
                snapshotId: safeString(payload.snapshotId || 'SNAPSHOT-' + nowIso(ctx), ''),
                baselineId: safeString(payload.baselineId || '', ''),
                releaseId: safeString(payload.releaseId || payload.source && payload.source.releaseId || '', ''),
                deploymentId: safeString(payload.deploymentId || payload.source && payload.source.deploymentId || '', ''),
                tenantId: safeString(payload.tenantId || '', ''),
                tenantSlug: normalizeTenantSlug(payload.tenantSlug || payload.tenantId || contextTenant(ctx)),
                environment: normalizeEnvironment(payload.environment || payload.targetEnvironment || 'PRODUCTION'),
                snapshotState: normalizeSnapshotState(payload.snapshotState || payload.state, 'CREATED'),
                snapshotStateRaw: safeString(payload.snapshotState || payload.state || '', ''),
                snapshotType: normalizeSnapshotType(payload.snapshotType || payload.type, 'ENVIRONMENT_STATE_SNAPSHOT'),
                snapshotTypeRaw: safeString(payload.snapshotType || payload.type || '', ''),
                snapshotContent: content,
                snapshotHash: '',
                integrityVerified: payload.integrityVerified !== false,
                compatibilityVerified: payload.compatibilityVerified !== false,
                dependencyHealthy: payload.dependencyHealthy !== false,
                environmentConsistent: payload.environmentConsistent !== false,
                rollbackSafe: payload.rollbackSafe !== false,
                tenantIsolationIntegrity: payload.tenantIsolationIntegrity !== false,
                createdAt: nowIso(ctx),
                metadata: cloneSanitized(payload.metadata || {})
            };
            snapshot.snapshotHash = hashValue({
                snapshotId: snapshot.snapshotId,
                baselineId: snapshot.baselineId,
                environment: snapshot.environment,
                snapshotType: snapshot.snapshotType,
                snapshotContent: snapshot.snapshotContent
            });
            var output = freezeSnapshotOutput({
                success: true,
                snapshot: snapshot,
                snapshotGovernanceModel: { state: snapshot.snapshotState, states: SNAPSHOT_STATES, types: SNAPSHOT_TYPES, generatedAt: nowIso(ctx) },
                accessGovernance: scope.accessGovernance,
                immutableSnapshotHistory: true
            });
            auditSnapshot('ENVIRONMENT_SNAPSHOT_CREATED', { snapshotId: snapshot.snapshotId, snapshotType: snapshot.snapshotType, severity: SEVERITIES.INFO }, ctx);
            emitTelemetry('ENVIRONMENT_SNAPSHOT_CREATED', { snapshotId: snapshot.snapshotId, snapshotType: snapshot.snapshotType, severity: SEVERITIES.INFO }, ctx);
            recordMetric('ENVIRONMENT_SNAPSHOT_CREATED', { status: 'CREATED', severity: 'INFO' }, ctx);
            return output;
        } catch (error) {
            return freezeSnapshotOutput({
                success: false,
                snapshot: {},
                failures: [safeFailure('SNAPSHOT_CREATION_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Environment snapshot creation failed safely.')]
            });
        }
    }

    function verifySnapshotIntegrity(snapshot, context) {
        try {
            if (!isPlainObject(snapshot)) {
                return freezeSnapshotOutput({
                    success: false,
                    integrityVerified: false,
                    snapshotCorrupted: true,
                    incompleteSnapshot: true,
                    failures: [safeFailure('MALFORMED_SNAPSHOT_INTEGRITY_PAYLOAD', SEVERITIES.HIGH_RISK, 'Snapshot integrity payload must be an object.')]
                });
            }
            var failures = [];
            var content = isPlainObject(snapshot.snapshotContent) ? snapshot.snapshotContent : {};
            if (!snapshot.snapshotId) failures.push(safeFailure('SNAPSHOT_ID_MISSING', SEVERITIES.HIGH_RISK, 'Snapshot id is missing.'));
            if (!Object.keys(content).length) failures.push(safeFailure('SNAPSHOT_CONTENT_MISSING', SEVERITIES.HIGH_RISK, 'Snapshot content is incomplete.'));
            if (!snapshot.snapshotHash) failures.push(safeFailure('SNAPSHOT_HASH_MISSING', SEVERITIES.HIGH_RISK, 'Snapshot hash is missing.'));
            var expectedHash = hashValue({
                snapshotId: snapshot.snapshotId,
                baselineId: snapshot.baselineId || '',
                environment: normalizeEnvironment(snapshot.environment || 'PRODUCTION'),
                snapshotType: normalizeSnapshotType(snapshot.snapshotType || 'ENVIRONMENT_STATE_SNAPSHOT'),
                snapshotContent: content
            });
            if (snapshot.snapshotHash && snapshot.snapshotHash !== expectedHash) failures.push(safeFailure('SNAPSHOT_HASH_MISMATCH', SEVERITIES.CRITICAL_BLOCKER, 'Snapshot hash does not match snapshot content.'));
            return freezeSnapshotOutput({
                success: failures.length === 0,
                integrityVerified: failures.length === 0,
                snapshotCorrupted: failures.some(function corrupted(item) { return item.failureCode === 'SNAPSHOT_HASH_MISMATCH'; }),
                incompleteSnapshot: failures.some(function incomplete(item) { return /MISSING/.test(item.failureCode); }),
                snapshotHash: snapshot.snapshotHash || '',
                failures: failures
            });
        } catch (error) {
            return freezeSnapshotOutput({
                success: false,
                integrityVerified: false,
                snapshotCorrupted: true,
                failures: [safeFailure('SNAPSHOT_INTEGRITY_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Snapshot integrity verification failed safely.')]
            });
        }
    }

    function calculateRestorationConfidence(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var snapshot = source.snapshot || source;
            var integrity = verifySnapshotIntegrity(snapshot, context || {});
            var failures = [];
            if (!integrity.integrityVerified) failures = failures.concat(integrity.failures || []);
            if (source.compatible === false || source.environmentCompatible === false || snapshot.compatibilityVerified === false) failures.push(safeFailure('SNAPSHOT_ENVIRONMENT_INCOMPATIBLE', SEVERITIES.CRITICAL_BLOCKER, 'Snapshot is not compatible with the target environment.'));
            if (source.dependencyHealthy === false || snapshot.dependencyHealthy === false || source.dependencyMismatch === true) failures.push(safeFailure('SNAPSHOT_DEPENDENCY_MISMATCH', SEVERITIES.HIGH_RISK, 'Snapshot dependencies are unhealthy or mismatched.'));
            if (source.environmentConsistent === false || snapshot.environmentConsistent === false) failures.push(safeFailure('SNAPSHOT_ENVIRONMENT_CONSISTENCY_FAILED', SEVERITIES.HIGH_RISK, 'Environment consistency validation failed.'));
            if (source.rollbackSafe === false || snapshot.rollbackSafe === false) failures.push(safeFailure('SNAPSHOT_ROLLBACK_SAFETY_FAILED', SEVERITIES.HIGH_RISK, 'Rollback safety validation failed.'));
            if (source.tenantIsolationIntegrity === false || snapshot.tenantIsolationIntegrity === false) failures.push(safeFailure('SNAPSHOT_TENANT_ISOLATION_FAILED', SEVERITIES.CRITICAL_BLOCKER, 'Tenant isolation integrity failed.'));
            var score = 100;
            failures.forEach(function penalty(item) {
                score -= item.severity === SEVERITIES.CRITICAL_BLOCKER ? 28 : 18;
            });
            score = clamp(score, 0, 100);
            return freezeSnapshotOutput({
                success: true,
                restorationBlocked: failures.length > 0,
                restorationConfidenceScore: score,
                restorationConfidence: score,
                restorationSafety: {
                    integrityVerified: integrity.integrityVerified,
                    compatible: failures.some(function f(item) { return item.failureCode === 'SNAPSHOT_ENVIRONMENT_INCOMPATIBLE'; }) === false,
                    dependencyHealthy: failures.some(function f(item) { return item.failureCode === 'SNAPSHOT_DEPENDENCY_MISMATCH'; }) === false,
                    environmentConsistent: failures.some(function f(item) { return item.failureCode === 'SNAPSHOT_ENVIRONMENT_CONSISTENCY_FAILED'; }) === false,
                    rollbackSafe: failures.some(function f(item) { return item.failureCode === 'SNAPSHOT_ROLLBACK_SAFETY_FAILED'; }) === false,
                    tenantIsolationIntegrity: failures.some(function f(item) { return item.failureCode === 'SNAPSHOT_TENANT_ISOLATION_FAILED'; }) === false
                },
                failures: failures
            });
        } catch (error) {
            return freezeSnapshotOutput({
                success: false,
                restorationBlocked: true,
                restorationConfidenceScore: 0,
                failures: [safeFailure('RESTORATION_CONFIDENCE_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Restoration confidence failed safely.')]
            });
        }
    }

    function compareEnvironmentBaseline(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var current = source.currentEnvironment && source.currentEnvironment.configuration ? source.currentEnvironment.configuration : (source.currentEnvironment || {});
            var baseline = source.activeBaseline && source.activeBaseline.configuration ? source.activeBaseline.configuration : (source.activeBaseline || source.baseline || {});
            var snapshot = source.verifiedSnapshot || source.snapshot || {};
            var driftService = global.ConfigurationDriftService || global.configurationDriftService;
            var drift = driftService && typeof driftService.detectConfigurationDrift === 'function'
                ? driftService.detectConfigurationDrift({ baseline: baseline, active: current }, context || {})
                : localDrift(baseline, current);
            var score = driftService && typeof driftService.calculateConsistencyScore === 'function'
                ? driftService.calculateConsistencyScore(drift, context || {})
                : localScore(drift);
            var restoration = calculateRestorationConfidence({ snapshot: snapshot }, context || {});
            var baselineConsistencyScore = score.consistencyScore || score.environmentConsistencyScore || 0;
            var driftFromBaselineScore = score.driftRiskScore || (drift.driftCount || 0) * 10;
            var recoveryReadinessScore = Math.round((baselineConsistencyScore + (restoration.restorationConfidenceScore || 0)) / 2);
            return freezeSnapshotOutput({
                success: true,
                baselineConsistent: baselineConsistencyScore === 100,
                baselineConsistencyScore: baselineConsistencyScore,
                restorationConfidenceScore: restoration.restorationConfidenceScore || 0,
                driftFromBaselineScore: clamp(driftFromBaselineScore, 0, 100),
                recoveryReadinessScore: clamp(recoveryReadinessScore, 0, 100),
                driftDetection: drift,
                restorationValidation: restoration
            });
        } catch (error) {
            return freezeSnapshotOutput({
                success: false,
                baselineConsistent: false,
                baselineConsistencyScore: 0,
                restorationConfidenceScore: 0,
                driftFromBaselineScore: 100,
                recoveryReadinessScore: 0,
                failures: [safeFailure('BASELINE_COMPARISON_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Baseline comparison failed safely.')]
            });
        }
    }

    function localDrift(baseline, active) {
        var baselineSig = stableSerialize(baseline || {});
        var activeSig = stableSerialize(active || {});
        var drifted = baselineSig !== activeSig;
        return freezeSnapshotOutput({
            success: true,
            driftDetected: drifted,
            driftCount: drifted ? 1 : 0,
            driftItems: drifted ? [{ category: 'ENVIRONMENT_BASELINE', severity: 'HIGH', baselineValue: baselineSig, activeValue: activeSig }] : []
        });
    }

    function localScore(drift) {
        var count = drift && drift.driftCount || 0;
        var risk = clamp(count * 25, 0, 100);
        return freezeSnapshotOutput({
            success: true,
            consistencyScore: 100 - risk,
            driftRiskScore: risk
        });
    }

    function activeState(row) {
        var token = normalizeToken(row && (row.snapshotState || row.status || row.state || ''));
        return !/ARCHIVED|SUPERSEDED|DELETED/.test(token);
    }

    function normalizeSnapshotRow(row) {
        var content = allowedSnapshotContent(row && (row.snapshotContent || row.source || row));
        var snapshot = {
            snapshotId: safeString(row && (row.snapshotId || row.baselineId || row.releaseId), ''),
            baselineId: safeString(row && row.baselineId || '', ''),
            releaseId: safeString(row && row.releaseId || '', ''),
            deploymentId: safeString(row && row.deploymentId || '', ''),
            tenantId: safeString(row && row.tenantId || '', ''),
            tenantSlug: rowTenant(row),
            environment: normalizeEnvironment(row && row.environment || 'PRODUCTION'),
            snapshotState: normalizeSnapshotState(row && (row.snapshotState || row.state || row.status), 'CREATED'),
            snapshotType: normalizeSnapshotType(row && (row.snapshotType || row.type), 'ENVIRONMENT_STATE_SNAPSHOT'),
            snapshotContent: content,
            snapshotHash: safeString(row && row.snapshotHash || '', ''),
            integrityVerified: row && row.integrityVerified !== false,
            compatibilityVerified: row && row.compatibilityVerified !== false,
            dependencyHealthy: row && row.dependencyHealthy !== false,
            environmentConsistent: row && row.environmentConsistent !== false,
            rollbackSafe: row && row.rollbackSafe !== false,
            tenantIsolationIntegrity: row && row.tenantIsolationIntegrity !== false,
            restorationDurationMinutes: safeNumber(row && row.restorationDurationMinutes, 0),
            recoverySucceeded: row && row.recoverySucceeded === true,
            createdAt: safeString(row && (row.createdAt || row.timestamp), '')
        };
        if (!snapshot.snapshotHash && Object.keys(content || {}).length) {
            snapshot.snapshotHash = hashValue({
                snapshotId: snapshot.snapshotId,
                baselineId: snapshot.baselineId,
                environment: snapshot.environment,
                snapshotType: snapshot.snapshotType,
                snapshotContent: snapshot.snapshotContent
            });
        }
        return snapshot;
    }

    function collectSnapshots(data, input) {
        var targetTenant = normalizeTenantSlug(input && (input.tenantSlug || input.tenantId || input.targetTenantId));
        return list(data, 'environmentSnapshotRecords')
            .concat(list(data, 'environmentSnapshots'), list(data, 'recoveryBaselineRecords'), list(data, 'releaseSnapshotRecords'))
            .filter(function filterTenant(row) {
                if (!targetTenant) return true;
                var tenant = rowTenant(row);
                return !tenant || tenant === targetTenant;
            })
            .map(normalizeSnapshotRow);
    }

    function collectBaselines(data, input) {
        var targetTenant = normalizeTenantSlug(input && (input.tenantSlug || input.tenantId || input.targetTenantId));
        return list(data, 'configurationBaselines').concat(list(data, 'configurationBaselineRecords')).filter(function filter(row) {
            if (!targetTenant) return true;
            var tenant = rowTenant(row);
            return !tenant || tenant === targetTenant;
        }).map(function baseline(row) {
            return {
                baselineId: safeString(row && (row.baselineId || row.snapshotId), ''),
                tenantSlug: rowTenant(row),
                environment: normalizeEnvironment(row && row.environment || 'PRODUCTION'),
                snapshotState: normalizeSnapshotState(row && (row.snapshotState || row.baselineState || row.state), 'ACTIVE'),
                immutableBaselineRecords: true,
                createdAt: safeString(row && (row.createdAt || row.timestamp), '')
            };
        });
    }

    function summarizeSnapshots(rows) {
        var total = rows.length;
        var integrityFailures = rows.filter(function failed(row) { return row.integrityVerified === false; }).length;
        var recoveryAttempts = rows.filter(function restored(row) { return row.snapshotState === 'RESTORED' || row.recoverySucceeded === true; });
        var recoverySuccess = recoveryAttempts.filter(function succeeded(row) { return row.recoverySucceeded !== false; }).length;
        var restorationDurations = rows.filter(function timed(row) { return safeNumber(row.restorationDurationMinutes, 0) > 0; });
        var avgDuration = restorationDurations.length ? Math.round(restorationDurations.reduce(function sum(totalMinutes, row) { return totalMinutes + safeNumber(row.restorationDurationMinutes, 0); }, 0) / restorationDurations.length) : 0;
        return {
            snapshotCreationFrequency: total,
            snapshotIntegrityFailures: integrityFailures,
            recoverySuccessRate: recoveryAttempts.length ? Math.round((recoverySuccess / recoveryAttempts.length) * 100) : 100,
            restorationDurationAverage: avgDuration,
            baselineDriftTrends: rows.filter(function drift(row) { return row.environmentConsistent === false; }).length,
            restorationConfidenceTrend: rows.filter(function ready(row) { return row.snapshotState === 'RECOVERY_READY'; }).length,
            environmentStabilityTrend: total ? Math.max(0, 100 - integrityFailures * 20) : 100
        };
    }

    function auditSnapshot(actionType, metadata, context) {
        if (auditForwarding || context && context.skipAuditPersistence) return { success: true, skipped: true };
        auditForwarding = true;
        try {
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                return service.recordAudit({
                    eventType: normalizeToken(actionType || 'ENVIRONMENT_SNAPSHOT_GOVERNANCE'),
                    actionType: normalizeToken(actionType || 'ENVIRONMENT_SNAPSHOT_GOVERNANCE'),
                    source: 'environmentSnapshotService',
                    severity: metadata && metadata.severity || 'INFO',
                    actorId: context && context.actor && (context.actor.id || context.actor.email) || '',
                    metadata: Object.assign({ module: 'environmentSnapshot' }, cloneSanitized(metadata || {}))
                }, { skipTelemetry: true });
            }
        } catch (error) {
            safeWarn('Environment snapshot audit failed safely.', error && error.message);
        } finally {
            auditForwarding = false;
        }
        return { success: false, warning: 'Environment snapshot audit unavailable.' };
    }

    function emitTelemetry(eventType, metadata, context) {
        if (telemetryForwarding || context && context.skipTelemetry) return { success: true, skipped: true };
        telemetryForwarding = true;
        try {
            var service = global.WorkflowTelemetryService || global.workflowTelemetryService;
            if (service && typeof service.emitTelemetry === 'function') {
                return service.emitTelemetry('GOVERNANCE', normalizeToken(eventType || 'ENVIRONMENT_SNAPSHOT_EVENT'), {
                    source: 'environmentSnapshotService',
                    severity: metadata && metadata.severity || 'INFO',
                    metadata: cloneSanitized(metadata || {})
                });
            }
        } catch (error) {
            safeWarn('Environment snapshot telemetry failed safely.', error && error.message);
        } finally {
            telemetryForwarding = false;
        }
        return { success: false, warning: 'Environment snapshot telemetry unavailable.' };
    }

    function recordMetric(metricType, metadata, context) {
        if (metricForwarding || context && context.skipMetrics) return { success: true, skipped: true };
        metricForwarding = true;
        try {
            var service = global.OrchestrationMetricsService || global.orchestrationMetricsService;
            if (service && typeof service.recordWorkflowMetric === 'function') {
                return service.recordWorkflowMetric(normalizeToken(metricType || 'ENVIRONMENT_SNAPSHOT_GOVERNANCE_REPORTED'), Object.assign({
                    source: 'environmentSnapshotService'
                }, cloneSanitized(metadata || {})));
            }
        } catch (error) {
            safeWarn('Environment snapshot metrics failed safely.', error && error.message);
        } finally {
            metricForwarding = false;
        }
        return { success: false, warning: 'Environment snapshot metrics unavailable.' };
    }

    function generateEnvironmentSnapshotReport(filters, context) {
        try {
            var input = isPlainObject(filters) ? filters : {};
            var ctx = isPlainObject(context) ? context : {};
            var scope = validateSnapshotScope(Object.assign({ readOnly: true, aggregateOnly: true }, input), ctx);
            if (!scope.allowed) {
                return freezeSnapshotOutput({
                    success: false,
                    classification: SEVERITIES.CRITICAL_BLOCKER,
                    snapshotGovernanceModel: { state: 'ARCHIVED', states: SNAPSHOT_STATES, types: SNAPSHOT_TYPES, generatedAt: nowIso(ctx) },
                    failures: scope.failures || [],
                    accessGovernance: scope.accessGovernance || {},
                    timestamp: nowIso(ctx)
                });
            }
            var data = rawData();
            var snapshots = collectSnapshots(data, input);
            var baselines = collectBaselines(data, input);
            var active = snapshots.filter(activeState);
            var selectedSnapshot = input.snapshot || active.find(function ready(row) { return row.snapshotState === 'RECOVERY_READY'; }) || active[0] || snapshots[0] || {};
            var integrity = verifySnapshotIntegrity(selectedSnapshot, ctx);
            var restoration = calculateRestorationConfidence({
                snapshot: selectedSnapshot,
                compatible: selectedSnapshot.compatibilityVerified !== false,
                dependencyHealthy: selectedSnapshot.dependencyHealthy !== false,
                environmentConsistent: selectedSnapshot.environmentConsistent !== false,
                rollbackSafe: selectedSnapshot.rollbackSafe !== false,
                tenantIsolationIntegrity: selectedSnapshot.tenantIsolationIntegrity !== false
            }, ctx);
            var comparison = compareEnvironmentBaseline({
                currentEnvironment: input.currentEnvironment || {},
                activeBaseline: input.activeBaseline || {},
                verifiedSnapshot: selectedSnapshot,
                lastDeployment: input.lastDeployment || {}
            }, ctx);
            var analytics = summarizeSnapshots(snapshots);
            var state = restoration.restorationBlocked
                ? (selectedSnapshot.snapshotState || 'VERIFIED')
                : 'RECOVERY_READY';
            var report = freezeSnapshotOutput({
                success: true,
                classification: restoration.restorationBlocked ? SEVERITIES.HIGH_RISK : SEVERITIES.INFO,
                snapshotGovernanceModel: { state: state, states: SNAPSHOT_STATES, types: SNAPSHOT_TYPES, generatedAt: nowIso(ctx) },
                activeBaselines: baselines.filter(function activeBaseline(row) { return row.snapshotState !== 'ARCHIVED'; }),
                baselineRecords: baselines,
                snapshotHistory: snapshots,
                restorationHistory: snapshots.filter(function restored(row) { return row.snapshotState === 'RESTORED' || row.recoverySucceeded === true; }),
                snapshotIntegrity: integrity,
                restorationValidation: restoration,
                baselineComparison: comparison,
                recoveryReadiness: {
                    recoveryReadinessScore: comparison.recoveryReadinessScore || 0,
                    recoveryReadySnapshots: snapshots.filter(function ready(row) { return row.snapshotState === 'RECOVERY_READY'; }).length,
                    restorationConfidenceScore: restoration.restorationConfidenceScore || 0
                },
                snapshotAnalytics: analytics,
                governanceIntegrations: {
                    configurationDriftIntegrated: !!(global.ConfigurationDriftService || global.configurationDriftService),
                    rollbackGovernanceIntegrated: !!(global.SafeReleaseGovernanceService || global.safeReleaseGovernanceService),
                    deploymentValidationIntegrated: !!(global.DeploymentValidationService || global.deploymentValidationService),
                    environmentPromotionIntegrated: !!(global.EnvironmentPromotionService || global.environmentPromotionService || global.EnvironmentActivationService || global.environmentActivationService),
                    globalAuditVisibilityIntegrated: !!(global.GlobalAuditVisibilityService || global.globalAuditVisibilityService)
                },
                auditSummary: {
                    snapshotActionsAuditable: true,
                    auditReady: !!(global.AuditService || global.auditService),
                    telemetryReady: !!(global.WorkflowTelemetryService || global.workflowTelemetryService),
                    metricsReady: !!(global.OrchestrationMetricsService || global.orchestrationMetricsService)
                },
                accessGovernance: {
                    crossTenantSnapshotLeakageBlocked: true,
                    tenantBusinessDataExcluded: true,
                    salaryVisibility: false,
                    leaveBalanceVisibility: false,
                    confidentialEmployeeRecordsVisible: false,
                    rawTenantDocumentsVisible: false,
                    unsafeRestorationBlocked: true,
                    baselineCorruptionBlocked: true,
                    governanceBypassBlocked: true
                },
                immutableSnapshotHistory: true,
                immutableRestorationHistory: true,
                immutableBaselineRecords: true,
                warnings: restoration.restorationBlocked ? [safeWarning('SNAPSHOT_RESTORATION_REVIEW_REQUIRED', SEVERITIES.WARNING, 'Restoration requires governance review.', 'Review integrity, compatibility, dependencies, rollback safety, and tenant isolation before restoration.')] : [],
                failures: restoration.failures || [],
                sections: [integrity, restoration, comparison, analytics],
                timestamp: nowIso(ctx)
            });
            emitTelemetry('ENVIRONMENT_SNAPSHOT_GOVERNANCE_REPORTED', { state: report.snapshotGovernanceModel.state, severity: report.classification }, ctx);
            auditSnapshot('ENVIRONMENT_SNAPSHOT_GOVERNANCE_REPORTED', { state: report.snapshotGovernanceModel.state, severity: report.classification }, ctx);
            recordMetric('ENVIRONMENT_SNAPSHOT_GOVERNANCE_REPORTED', { status: report.snapshotGovernanceModel.state, severity: report.classification === SEVERITIES.INFO ? 'INFO' : 'WARNING' }, ctx);
            return report;
        } catch (error) {
            return freezeSnapshotOutput({
                success: false,
                classification: SEVERITIES.CRITICAL_BLOCKER,
                snapshotGovernanceModel: { state: 'ARCHIVED', states: SNAPSHOT_STATES, types: SNAPSHOT_TYPES, generatedAt: nowIso(context || {}) },
                failures: [safeFailure('ENVIRONMENT_SNAPSHOT_REPORT_FAILED_SAFE', SEVERITIES.HIGH_RISK, 'Environment snapshot report failed safely.')],
                timestamp: nowIso(context || {})
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        function add(name, ok) {
            checks.push({ name: name, passed: !!ok });
            if (!ok) throw new Error(name);
        }
        try {
            var malformed = createEnvironmentSnapshot(null, {});
            add('malformed payloads fail safely', malformed.success === false);

            var created = createEnvironmentSnapshot({
                snapshotId: 'SNAP-SELF-TEST',
                snapshotType: 'configuration snapshot',
                source: { environmentState: { mode: 'PRODUCTION' }, configuration: { tenantIsolation: { rls: true } }, serviceDependencies: { database: 'ready' }, employees: [{ salary: 1 }] }
            }, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            add('snapshot creation works', created.success === true && created.snapshot.snapshotHash);

            var integrity = verifySnapshotIntegrity(created.snapshot);
            add('integrity verification works', integrity.integrityVerified === true);

            var blocked = calculateRestorationConfidence({ snapshot: Object.assign({}, created.snapshot, { snapshotHash: 'bad' }), dependencyHealthy: false, tenantIsolationIntegrity: false });
            add('restoration validation works', blocked.restorationBlocked === true);

            var comparison = compareEnvironmentBaseline({ currentEnvironment: { configuration: { tenantIsolation: { rls: false } } }, activeBaseline: { configuration: { tenantIsolation: { rls: true } } }, verifiedSnapshot: created.snapshot });
            add('baseline comparison works', comparison.baselineConsistent === false);

            var immutable = freezeSnapshotOutput({ rows: [{ stable: true }] });
            add('immutable outputs enforced', Object.isFrozen(immutable) && Object.isFrozen(immutable.rows));

            return freezeSnapshotOutput({
                passed: checks.every(function allPassed(item) { return item.passed; }),
                tests: checks,
                coverage: {
                    snapshotCreation: true,
                    restorationValidation: true,
                    baselineComparison: true,
                    integrityVerification: true,
                    immutability: true,
                    dependencyAbsence: true
                }
            });
        } catch (error) {
            return freezeSnapshotOutput({
                passed: false,
                tests: checks,
                failures: [safeFailure('ENVIRONMENT_SNAPSHOT_SELF_TEST_FAILED', SEVERITIES.HIGH_RISK, error && error.message || 'Environment snapshot self-test failed.')]
            });
        }
    }

    var api = Object.freeze({
        VERSION: VERSION,
        SNAPSHOT_STATES: SNAPSHOT_STATES,
        SNAPSHOT_TYPES: SNAPSHOT_TYPES,
        validateSnapshotScope: validateSnapshotScope,
        createEnvironmentSnapshot: createEnvironmentSnapshot,
        verifySnapshotIntegrity: verifySnapshotIntegrity,
        calculateRestorationConfidence: calculateRestorationConfidence,
        compareEnvironmentBaseline: compareEnvironmentBaseline,
        freezeSnapshotOutput: freezeSnapshotOutput,
        generateEnvironmentSnapshotReport: generateEnvironmentSnapshotReport,
        runSelfTest: runSelfTest
    });

    global.EnvironmentSnapshotService = api;
    global.environmentSnapshotService = api;

    if (global.__ARTHHRMS_DEV__) {
        global.__ARTHHRMS_ENVIRONMENT_SNAPSHOT_SELF_TEST__ = runSelfTest();
        if (global.console && typeof global.console.log === 'function') {
            global.console.log(PREFIX + ' Development self-test ' + (global.__ARTHHRMS_ENVIRONMENT_SNAPSHOT_SELF_TEST__.passed ? 'passed.' : 'failed.'), global.__ARTHHRMS_ENVIRONMENT_SNAPSHOT_SELF_TEST__);
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
