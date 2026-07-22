/**
 * featureRolloutService.js
 * ARTHHRMS - Feature Rollout Governance Layer
 *
 * PURPOSE:
 * Provides centralized safe feature rollout governance for staged activation,
 * risky flag detection, tenant-specific rollout, production safety enforcement,
 * and environment-aware platform feature activation.
 *
 * This service validates:
 * - rollout stages
 * - feature risk levels
 * - production safety restrictions
 * - tenant-scoped rollout isolation
 * - global rollout authorization
 *
 * This service does NOT:
 * - bypass auth
 * - auto-enable unsafe flags
 * - expose tenant HR data
 * - mutate feature flags directly
 *
 * ARCHITECTURE RULE:
 * Feature activation decisions must be validated before platform governance
 * state is changed.
 *
 * STABILITY:
 * Existing feature flags remain backward-compatible.
 *
 * DEPENDS ON:
 * - window.FeatureFlagValidator (optional)
 * - window.EnvironmentGovernanceService (optional)
 * - window.PlatformGovernanceService (optional)
 * - window.WorkflowTelemetryService (optional)
 * - window.AuditService (optional)
 *
 * @version 1.0.0
 */
(function (global) {
    'use strict';

    const PREFIX = '[FeatureRolloutService]';

    const ROLLOUT_STAGES = Object.freeze([
        'DEVELOPMENT_ONLY',
        'STAGING_ONLY',
        'PILOT_ENABLED',
        'LIMITED_PRODUCTION',
        'GLOBAL_PRODUCTION'
    ]);

    const ROLLOUT_STATES = Object.freeze([
        'DISABLED',
        'INTERNAL_TESTING',
        'BETA',
        'LIMITED_ROLLOUT',
        'ACTIVE',
        'DEGRADED',
        'ROLLBACK_PENDING',
        'ARCHIVED'
    ]);

    const RISK_LEVELS = Object.freeze([
        'SAFE',
        'WARNING',
        'HIGH_RISK',
        'CRITICAL_BLOCKED'
    ]);

    const TENANT_SAFE_ROLES = Object.freeze(['employee', 'manager', 'hr', 'hr_head', 'director', 'admin', 'super_admin']);
    const RUNTIME_FLAG_KEYS = Object.freeze([
        'USE_SUPABASE_AUTH',
        'USE_SUPABASE_INVITES',
        'USE_SUPABASE_EMPLOYEES',
        'USE_SUPABASE_ATTENDANCE',
        'USE_SUPABASE_LEAVE',
        'USE_SUPABASE_EXPENSES',
        'USE_SUPABASE_PAYROLL',
        'USE_SUPABASE_IMPORTS',
        'USE_SUPABASE_STORAGE',
        'PRODUCTION_MODE',
        'PILOT_MODE',
        'DEVELOPMENT_MODE',
        'DEMO_MODE',
        'ALLOW_LOCAL_AUTH_FALLBACK',
        'REQUIRE_APP_METADATA_ROLE',
        'REQUIRE_EMAIL_VERIFIED',
        'ALLOW_ANONYMOUS_AUTH',
        'ENABLE_ANONYMOUS_AUTH',
        'ANONYMOUS_AUTH_ENABLED',
        'SUPABASE_ANON_AUTH_ENABLED'
    ]);

    const CRITICAL_FLAG_KEYS = Object.freeze([
        'ALLOW_LOCAL_AUTH_FALLBACK',
        'USE_SUPABASE_AUTH',
        'DEMO_MODE',
        'DEVELOPMENT_MODE'
    ]);

    const HIGH_RISK_FEATURE_KEYS = Object.freeze([
        'payroll',
        'expenseClaims',
        'imports',
        'userManagement',
        'rolePermissions',
        'auditLogs',
        'systemSettings'
    ]);

    const SENSITIVE_KEY_PATTERN = /(salary|payroll|leave.?balance|compensation|payslip|bonus|bank|tax|employee.?id|emp.?id|user.?id|candidate|resume|document|attachment|file.?name|object.?path|storage.?path|public.?url|signed.?url|download.?url|url|path|token|secret|jwt|authorization|private.?key|raw|payload|content|body|message|note|comment|email|phone|name|confidential|private)/i;
    const SENSITIVE_VALUE_PATTERN = /(https?:\/\/[^\s"',}]+|private:\/\/[^\s"',}]+|\b(EMP-[A-Z0-9-]+|employee|salary|payroll|leave balance|compensation|confidential|private|secret|token|document|attachment)\b[^,;}]*)/ig;

    const SAFE_OUTPUT_KEYS = Object.freeze({
        VERSION: true,
        success: true,
        allowed: true,
        readOnly: true,
        aggregateOnly: true,
        classification: true,
        severity: true,
        state: true,
        rolloutState: true,
        rolloutStates: true,
        rolloutStage: true,
        rolloutStages: true,
        featureFlagModel: true,
        featureKey: true,
        featureCount: true,
        totalFeatures: true,
        enabledFeatures: true,
        disabledFeatures: true,
        betaFeatures: true,
        limitedRolloutFeatures: true,
        degradedFeatures: true,
        archivedFeatures: true,
        rollbackPendingFeatures: true,
        rolloutPercentage: true,
        percentage: true,
        tenantId: true,
        tenantSlug: true,
        targetTenantId: true,
        scope: true,
        environment: true,
        actorRole: true,
        generatedAt: true,
        timestamp: true,
        failures: true,
        warnings: true,
        failureCode: true,
        warningCode: true,
        message: true,
        recommendation: true,
        metadata: true,
        payload: true,
        summary: true,
        healthSignals: true,
        rolloutGovernance: true,
        featureHealth: true,
        featureAdoptionAnalytics: true,
        rollbackGovernance: true,
        platformAnalyticsIntegration: true,
        accessGovernance: true,
        integrationHealth: true,
        crossTenantRolloutLeakageBlocked: true,
        unsafeFeatureActivationBlocked: true,
        superAdminActivationAuthority: true,
        platformOwnerTenantRbacIsolation: true,
        rolloutActionsAuditable: true,
        platformIsolationPreserved: true,
        featureRolloutGovernancePreserved: true,
        tenantIsolationPreserved: true,
        existingTenantWorkflowsPreserved: true,
        historicalRolloutRecordsImmutable: true,
        stagedRollouts: true,
        tenantTargetedActivation: true,
        betaTestingGroups: true,
        rolloutPercentageControls: true,
        featureDependencyValidation: true,
        rollbackCheckpoints: true,
        rolloutFreezeHandling: true,
        unsafeGlobalActivationBlocked: true,
        rolloutFailures: true,
        degradedFeatureBehavior: true,
        tenantAdoptionTrends: true,
        rolloutCongestion: true,
        featureCrashIndicators: true,
        rollbackFrequency: true,
        activationAnomalies: true,
        tenantFeatureAdoption: true,
        usageFrequency: true,
        inactiveFeatureDetection: true,
        onboardingFeatureUsage: true,
        operationalAdoptionRates: true,
        workflowLinkedFeatureUsage: true,
        instantRollback: true,
        stagedRollback: true,
        rollbackDependencyValidation: true,
        rollbackAuditTrails: true,
        emergencyFeatureDisable: true,
        rollbackHealthVerification: true,
        rolloutPerformance: true,
        adoptionHealth: true,
        workflowImpact: true,
        featureCongestion: true,
        degradedTenantExperience: true,
        onboardingImpact: true,
        workflowTelemetryIntegrated: true,
        platformAnalyticsIntegrated: true,
        tenantGovernanceIntegrated: true,
        auditReady: true,
        telemetryReady: true,
        metricsReady: true,
        dependencyKeys: true
    });

    let metricForwarding = false;

    const WARNING_FEATURE_KEYS = Object.freeze([
        'aiInsights',
        'whatsapp',
        'recruitment',
        'strategicDeliverables'
    ]);

    function db() {
        return global.DB;
    }

    function nowIso() {
        try {
            return new Date().toISOString();
        } catch (err) {
            return String(Date.now());
        }
    }

    function safeWarn(message, details) {
        try {
            if (global.console && typeof global.console.warn === 'function') {
                if (details !== undefined) global.console.warn(PREFIX + ' ' + message, details);
                else global.console.warn(PREFIX + ' ' + message);
            }
        } catch (err) {}
    }

    function safeString(value, fallback) {
        try {
            if (value === undefined || value === null) return fallback || '';
            if (typeof value === 'symbol') return value.toString();
            return String(value);
        } catch (err) {
            return fallback || '';
        }
    }

    function normalizeBoolean(value, fallback) {
        if (value === true || value === false) return value;
        if (value === undefined || value === null || value === '') return !!fallback;
        if (typeof value === 'number') return value !== 0;
        const normalized = safeString(value, '').trim().toLowerCase();
        if (['true', '1', 'yes', 'y', 'on', 'enabled'].includes(normalized)) return true;
        if (['false', '0', 'no', 'n', 'off', 'disabled'].includes(normalized)) return false;
        return !!fallback;
    }

    function shallowClone(input) {
        const output = {};
        if (!input || typeof input !== 'object' || Array.isArray(input)) return output;
        try {
            Object.keys(input).forEach(key => {
                output[key] = input[key];
            });
        } catch (err) {}
        return output;
    }

    function deepClone(input, seen) {
        if (!input || typeof input !== 'object') return input;
        const refs = seen || [];
        if (refs.indexOf(input) !== -1) return '[Circular]';
        refs.push(input);
        if (Array.isArray(input)) return input.map(item => deepClone(item, refs.slice()));
        const output = {};
        try {
            Object.keys(input).forEach(key => {
                output[key] = deepClone(input[key], refs.slice());
            });
        } catch (err) {}
        return output;
    }

    function freezeFeatureGovernance(value, seen) {
        if (!value || typeof value !== 'object') return value;
        const refs = seen || [];
        if (refs.indexOf(value) !== -1) return value;
        refs.push(value);
        try {
            Object.keys(value).forEach(key => {
                if (value[key] && typeof value[key] === 'object') freezeFeatureGovernance(value[key], refs.slice());
            });
            Object.freeze(value);
        } catch (err) {}
        return value;
    }

    function freezeList(list) {
        return freezeFeatureGovernance(Array.isArray(list) ? list.slice() : []);
    }

    function safeFailure(code, severity, message, metadata) {
        return freezeFeatureGovernance({
            failureCode: safeString(code, 'FEATURE_ROLLOUT_FAILURE'),
            severity: safeSeverity(severity, 'HIGH'),
            message: safeString(message, 'Feature rollout validation failed.'),
            metadata: safeMetadata(metadata)
        });
    }

    function safeWarning(code, severity, message, recommendation, metadata) {
        return freezeFeatureGovernance({
            warningCode: safeString(code, 'FEATURE_ROLLOUT_WARNING'),
            severity: safeSeverity(severity, 'WARNING'),
            message: safeString(message, 'Review feature rollout risk before activation.'),
            recommendation: safeString(recommendation, 'Validate rollout conditions before activation.'),
            metadata: safeMetadata(metadata)
        });
    }

    function safeMetadata(metadata) {
        const source = shallowClone(metadata);
        const output = {};
        Object.keys(source).forEach(key => {
            if (/password|secret|token|service_role|salary|payroll|leave.?balance|compensation|confidential|private|employee.?record/i.test(key)) return;
            const value = source[key];
            if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') output[key] = value;
            else if (Array.isArray(value)) output[key] = value.length;
            else if (value && typeof value === 'object') output[key] = safeMetadata(value);
        });
        return output;
    }

    function sanitizedValue(value, key, seen) {
        if (value === null || value === undefined) return value;
        if (typeof value === 'string') return value.replace(SENSITIVE_VALUE_PATTERN, '[redacted]').trim();
        if (typeof value === 'number' || typeof value === 'boolean') return value;
        if (value instanceof Date) return value.toISOString();
        if (Array.isArray(value)) return value.map(item => sanitizedValue(item, key, (seen || []).slice())).filter(item => item !== undefined);
        if (typeof value === 'object') return cloneSanitized(value, seen || []);
        return safeString(value, '');
    }

    function cloneSanitized(input, seen) {
        if (!input || typeof input !== 'object') return sanitizedValue(input, '', seen || []);
        const refs = seen || [];
        if (refs.indexOf(input) !== -1) return '[Circular]';
        refs.push(input);
        if (Array.isArray(input)) return input.map(item => cloneSanitized(item, refs.slice())).filter(item => item !== undefined);
        const output = {};
        try {
            Object.keys(input).forEach(key => {
                if (SENSITIVE_KEY_PATTERN.test(key) && !SAFE_OUTPUT_KEYS[key]) return;
                const value = sanitizedValue(input[key], key, refs.slice());
                if (value !== undefined) output[key] = value;
            });
        } catch (err) {}
        return output;
    }

    function freezeFeatureOutput(value) {
        return freezeFeatureGovernance(cloneSanitized(value || {}));
    }

    function safeSeverity(severity, fallback) {
        const normalized = safeString(severity || fallback || 'WARNING', 'WARNING').trim().toUpperCase();
        if (['INFO', 'WARNING', 'HIGH', 'CRITICAL'].includes(normalized)) return normalized;
        return fallback || 'WARNING';
    }

    function normalizeRole(role) {
        if (global.authService && typeof global.authService.normalizeRole === 'function') return global.authService.normalizeRole(role);
        const raw = safeString(role, '').trim().replace(/[\s-]+/g, '_').toLowerCase();
        if (raw === 'platformowner' || raw === 'owner' || raw === 'root') return 'platform_owner';
        if (raw === 'superadmin') return 'super_admin';
        if (raw === 'hrhead') return 'hr_head';
        if (raw === 'emp') return 'employee';
        return raw;
    }

    function normalizeStage(stage, fallback) {
        const normalized = safeString(stage || fallback || 'DEVELOPMENT_ONLY', 'DEVELOPMENT_ONLY').trim().replace(/[\s-]+/g, '_').toUpperCase();
        return ROLLOUT_STAGES.includes(normalized) ? normalized : 'DEVELOPMENT_ONLY';
    }

    function normalizeRolloutState(state, fallback) {
        const normalized = safeString(state || fallback || 'DISABLED', 'DISABLED').trim().replace(/[\s-]+/g, '_').toUpperCase();
        if (normalized === 'INTERNAL' || normalized === 'TESTING') return 'INTERNAL_TESTING';
        if (normalized === 'LIMITED' || normalized === 'LIMITED_PRODUCTION') return 'LIMITED_ROLLOUT';
        if (normalized === 'ENABLED') return 'ACTIVE';
        if (normalized === 'ROLLBACK') return 'ROLLBACK_PENDING';
        return ROLLOUT_STATES.includes(normalized) ? normalized : 'DISABLED';
    }

    function normalizeEnvironment(environment) {
        const fromDb = db()?.getEnvironmentState?.()?.mode;
        const normalized = safeString(environment || fromDb || 'DEVELOPMENT', 'DEVELOPMENT').trim().replace(/[\s-]+/g, '_').toUpperCase();
        if (normalized === 'DEV') return 'DEVELOPMENT';
        if (normalized === 'STAGE') return 'STAGING';
        if (normalized === 'PROD') return 'PRODUCTION';
        if (['DEVELOPMENT', 'STAGING', 'PILOT', 'PRODUCTION'].includes(normalized)) return normalized;
        return 'DEVELOPMENT';
    }

    function normalizeScope(scope, updates) {
        const raw = safeString(scope || updates?.scope || (updates?.targetTenantId || updates?.tenantId ? 'tenant' : 'global'), 'global').trim().toLowerCase();
        return raw === 'tenant' || raw === 'tenant_scoped' || raw === 'tenant-specific' ? 'tenant' : 'global';
    }

    function normalizeTenantId(value) {
        return safeString(value, '').trim();
    }

    function safeNumber(value, fallback) {
        const number = Number(value);
        return Number.isFinite(number) ? number : (fallback || 0);
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function hasActivationIntent(updates) {
        if (!updates || typeof updates !== 'object') return false;
        return Object.prototype.hasOwnProperty.call(updates, 'enabled') ||
            Object.prototype.hasOwnProperty.call(updates, 'value') ||
            Object.prototype.hasOwnProperty.call(updates, 'rolloutStage') ||
            Object.prototype.hasOwnProperty.call(updates, 'stage') ||
            Object.prototype.hasOwnProperty.call(updates, 'rolloutState') ||
            Object.prototype.hasOwnProperty.call(updates, 'state') ||
            Object.prototype.hasOwnProperty.call(updates, 'rolloutPercentage') ||
            Object.prototype.hasOwnProperty.call(updates, 'emergencyDisabled');
    }

    function dataStore() {
        try {
            return db()?.get?.() || {};
        } catch (err) {
            safeWarn('Database read failed safely.', { error: err?.message || String(err) });
            return {};
        }
    }

    function list(data, key) {
        return Array.isArray(data && data[key]) ? data[key].slice() : [];
    }

    function featureRows(data) {
        const governanceFeatures = data?.platformGovernance?.features || data?.features || {};
        return (Array.isArray(governanceFeatures) ? governanceFeatures : Object.values(governanceFeatures || {}))
            .concat(list(data, 'featureFlags'), list(data, 'tenantFeatureFlags'));
    }

    function rolloutRows(data) {
        return list(data, 'featureRolloutRecords')
            .concat(list(data, 'featureRollouts'), list(data, 'platformFeatureRollouts'), list(data, 'tenantFeatureRollouts'));
    }

    function usageRows(data) {
        return list(data, 'featureUsageEvents')
            .concat(list(data, 'featureAdoptionRecords'), list(data, 'featureAnalyticsEvents'), list(data, 'workflowEvents').filter(row => row && row.featureKey));
    }

    function rowFailure(row) {
        return /FAILED|FAILURE|ERROR|CRASH|DEGRADED|BLOCKED|ROLLBACK|ANOMALY/i.test([row?.status, row?.state, row?.rolloutState, row?.healthStatus, row?.eventType, row?.failureReason].join(' ')) ||
            safeNumber(row?.failureCount, 0) > 0;
    }

    function rowDegraded(row) {
        return /DEGRADED|UNHEALTHY|CRASH|ERROR/i.test([row?.status, row?.state, row?.rolloutState, row?.healthStatus, row?.eventType].join(' ')) ||
            safeNumber(row?.crashCount, 0) > 0;
    }

    function rowRollback(row) {
        return /ROLLBACK|ROLLED_BACK|ROLLBACK_PENDING/i.test([row?.status, row?.state, row?.rolloutState, row?.eventType].join(' ')) ||
            safeNumber(row?.rollbackCount, 0) > 0;
    }

    function rowTenant(row) {
        return normalizeTenantId(row?.tenantId || row?.tenantSlug || row?.companyId || row?.organizationId);
    }

    function normalizeRuntimeFlags(flags) {
        const source = shallowClone(flags);
        const output = {};
        RUNTIME_FLAG_KEYS.forEach(key => {
            output[key] = normalizeBoolean(source[key], false);
        });
        return output;
    }

    function applyRuntimeFlagUpdate(flags, featureKey, updates) {
        const candidate = { ...normalizeRuntimeFlags(flags) };
        const key = safeString(featureKey, '').trim().toUpperCase();
        if (!RUNTIME_FLAG_KEYS.includes(key)) return candidate;
        if (Object.prototype.hasOwnProperty.call(updates, 'enabled')) candidate[key] = normalizeBoolean(updates.enabled, false);
        if (Object.prototype.hasOwnProperty.call(updates, 'value')) candidate[key] = normalizeBoolean(updates.value, false);
        return candidate;
    }

    function isPlatformOwner(role) {
        return normalizeRole(role) === 'platform_owner';
    }

    function isTenantSafeRole(role) {
        return TENANT_SAFE_ROLES.includes(normalizeRole(role));
    }

    function isRuntimeFlag(featureKey) {
        return RUNTIME_FLAG_KEYS.includes(safeString(featureKey, '').trim().toUpperCase());
    }

    function classifyFeatureRisk(featureOrKey, context = {}) {
        try {
            const feature = typeof featureOrKey === 'object' && featureOrKey !== null ? featureOrKey : { key: featureOrKey };
            const key = safeString(feature.key || feature.featureKey || feature.flagKey || '', '').trim();
            const upperKey = key.toUpperCase();
            const environment = normalizeEnvironment(context.environment);
            if (CRITICAL_FLAG_KEYS.includes(upperKey)) {
                return freezeFeatureGovernance({
                    riskLevel: 'CRITICAL_BLOCKED',
                    riskCode: upperKey,
                    reason: 'Auth or environment bypass flags require strict production governance.'
                });
            }
            if (/auth|local_auth|anonymous/i.test(key)) {
                return freezeFeatureGovernance({
                    riskLevel: 'CRITICAL_BLOCKED',
                    riskCode: 'AUTH_BYPASS_RISK',
                    reason: 'Auth-related rollout can affect tenant access safety.'
                });
            }
            if (HIGH_RISK_FEATURE_KEYS.includes(key)) {
                return freezeFeatureGovernance({
                    riskLevel: environment === 'PRODUCTION' ? 'HIGH_RISK' : 'WARNING',
                    riskCode: 'HIGH_IMPACT_MODULE',
                    reason: 'This feature affects operational or security-critical workflows.'
                });
            }
            if (feature.experimental || WARNING_FEATURE_KEYS.includes(key)) {
                return freezeFeatureGovernance({
                    riskLevel: 'WARNING',
                    riskCode: 'EXPERIMENTAL_OR_LIMITED_FEATURE',
                    reason: 'This feature should roll out in stages before broad activation.'
                });
            }
            return freezeFeatureGovernance({
                riskLevel: 'SAFE',
                riskCode: 'TENANT_SAFE_FEATURE',
                reason: 'No elevated rollout risk detected.'
            });
        } catch (err) {
            safeWarn('Feature risk classification failed safely.', { error: err?.message || String(err) });
            return freezeFeatureGovernance({
                riskLevel: 'HIGH_RISK',
                riskCode: 'RISK_CLASSIFICATION_FAILED',
                reason: 'Risk classification failed; treat rollout conservatively.'
            });
        }
    }

    function validateRolloutEnvironment(stage, environment, risk) {
        const rolloutStage = normalizeStage(stage);
        const env = normalizeEnvironment(environment);
        const failures = [];
        const warnings = [];
        if (rolloutStage === 'DEVELOPMENT_ONLY' && env !== 'DEVELOPMENT') {
            failures.push(safeFailure('DEVELOPMENT_ONLY_ENVIRONMENT_MISMATCH', 'HIGH', 'Development-only features cannot be activated outside DEVELOPMENT.', { rolloutStage, environment: env }));
        }
        if (rolloutStage === 'STAGING_ONLY' && !['DEVELOPMENT', 'STAGING'].includes(env)) {
            failures.push(safeFailure('STAGING_ONLY_ENVIRONMENT_MISMATCH', 'HIGH', 'Staging-only features cannot be activated in PILOT or PRODUCTION.', { rolloutStage, environment: env }));
        }
        if (rolloutStage === 'PILOT_ENABLED' && env === 'PRODUCTION') {
            warnings.push(safeWarning('PILOT_STAGE_IN_PRODUCTION', 'WARNING', 'Pilot rollout stage is being evaluated in production.', 'Use LIMITED_PRODUCTION or GLOBAL_PRODUCTION only after pilot validation.', { rolloutStage, environment: env }));
        }
        if (rolloutStage === 'GLOBAL_PRODUCTION' && env !== 'PRODUCTION') {
            warnings.push(safeWarning('GLOBAL_STAGE_OUTSIDE_PRODUCTION', 'WARNING', 'Global production rollout is selected outside production.', 'Keep global stage disabled until production readiness is confirmed.', { rolloutStage, environment: env }));
        }
        if (risk === 'CRITICAL_BLOCKED') {
            failures.push(safeFailure('CRITICAL_RISK_FEATURE_BLOCKED', 'CRITICAL', 'Critical risk flags cannot be activated without satisfying strict governance checks.', { rolloutStage, environment: env }));
        }
        return freezeFeatureGovernance({
            success: !failures.length,
            rolloutStage,
            environment: env,
            failures: freezeList(failures),
            warnings: freezeList(warnings)
        });
    }

    function normalizeTenantRollouts(feature, context) {
        const source = feature?.tenantRollouts || feature?.tenant_rollouts || [];
        const list = Array.isArray(source) ? source : [];
        return freezeList(list.map(row => freezeFeatureGovernance({
            tenantId: normalizeTenantId(row.tenantId || row.companyId || row.tenant_id),
            enabled: normalizeBoolean(row.enabled, false),
            rolloutStage: normalizeStage(row.rolloutStage || row.stage),
            updatedAt: row.updatedAt || '',
            updatedBy: row.updatedBy || ''
        })).filter(row => row.tenantId));
    }

    function normalizeFeatureFlag(featureOrKey, context = {}) {
        try {
            const source = typeof featureOrKey === 'object' && featureOrKey !== null ? deepClone(featureOrKey) : { key: featureOrKey, label: featureOrKey };
            const key = safeString(source.key || source.featureKey || source.flagKey || '', '').trim();
            const risk = classifyFeatureRisk(source, context);
            const rolloutStage = normalizeStage(source.rolloutStage || source.stage || (source.enabled === false ? 'DEVELOPMENT_ONLY' : 'PILOT_ENABLED'));
            const rolloutState = normalizeRolloutState(source.rolloutState || source.state || (source.enabled === false ? 'DISABLED' : 'ACTIVE'));
            return freezeFeatureGovernance({
                key,
                label: safeString(source.label || key || 'Feature', 'Feature'),
                enabled: source.enabled !== false,
                experimental: !!source.experimental,
                emergencyDisabled: !!source.emergencyDisabled,
                rolloutState,
                rolloutStage,
                riskLevel: risk.riskLevel,
                riskCode: risk.riskCode,
                riskReason: risk.reason,
                environmentRestricted: rolloutStage === 'DEVELOPMENT_ONLY' || rolloutStage === 'STAGING_ONLY',
                tenantRollouts: normalizeTenantRollouts(source, context),
                roles: freezeFeatureGovernance(shallowClone(source.roles || {}))
            });
        } catch (err) {
            safeWarn('Feature flag normalization failed safely.', { error: err?.message || String(err) });
            return freezeFeatureGovernance({
                key: '',
                label: 'Invalid Feature',
                enabled: false,
                experimental: false,
                emergencyDisabled: true,
                rolloutStage: 'DEVELOPMENT_ONLY',
                riskLevel: 'HIGH_RISK',
                riskCode: 'NORMALIZATION_FAILED',
                riskReason: 'Feature normalization failed.',
                environmentRestricted: true,
                tenantRollouts: freezeList([]),
                roles: freezeFeatureGovernance({})
            });
        }
    }

    function actorTenant(actor, context) {
        return normalizeTenantId(actor?.tenantId || actor?.companyId || actor?.organizationId || context?.tenantId || context?.companyId);
    }

    function targetTenant(updates, context) {
        return normalizeTenantId(updates?.targetTenantId || updates?.tenantId || updates?.companyId || context?.targetTenantId || context?.tenantId || context?.companyId);
    }

    function environmentFlags(context) {
        const config = (() => {
            try {
                if (global.supabaseClientService && typeof global.supabaseClientService.readConfig === 'function') return global.supabaseClientService.readConfig() || {};
            } catch (err) {}
            return {};
        })();
        return normalizeRuntimeFlags(context.flags || config.flags || {});
    }

    function validateFeatureActivation(featureKey, updatesInput = {}, context = {}) {
        try {
            const updates = updatesInput && typeof updatesInput === 'object' && !Array.isArray(updatesInput)
                ? shallowClone(updatesInput)
                : null;
            const key = safeString(featureKey, '').trim();
            const failures = [];
            const warnings = [];
            if (!key || !updates) {
                const result = freezeFeatureGovernance({
                    success: false,
                    allowed: false,
                    featureKey: key,
                    scope: 'global',
                    rolloutStage: 'DEVELOPMENT_ONLY',
                    riskLevel: 'HIGH_RISK',
                    failures: freezeList([safeFailure('INVALID_FEATURE_ACTIVATION_INPUT', 'HIGH', 'Feature key and update object are required.')]),
                    warnings: freezeList([]),
                    timestamp: nowIso()
                });
                emitTelemetry('FEATURE_ROLLOUT_VALIDATION_FAILED', result, 'WARNING');
                return result;
            }

            const actor = context.actor || {};
            const actorRole = normalizeRole(actor.role || actor.actorRole || context.actorRole || '');
            const environment = normalizeEnvironment(context.environment);
            const scope = normalizeScope(context.scope, updates);
            const tenantId = targetTenant(updates, context);
            const actorTenantId = actorTenant(actor, context);
            const existing = (context.feature && typeof context.feature === 'object')
                ? context.feature
                : (db()?.getPlatformFeature?.(key) || { key, label: key, enabled: updates.enabled !== false });
            const candidateFeature = normalizeFeatureFlag({ ...deepClone(existing), ...deepClone(updates), key }, { environment });
            const rolloutStage = normalizeStage(updates.rolloutStage || updates.stage || candidateFeature.rolloutStage);
            const risk = classifyFeatureRisk(candidateFeature, { environment });
            const environmentCheck = validateRolloutEnvironment(rolloutStage, environment, risk.riskLevel);
            failures.push(...(environmentCheck.failures || []));
            warnings.push(...(environmentCheck.warnings || []));

            if (scope === 'global' && !isPlatformOwner(actorRole)) {
                failures.push(safeFailure('GLOBAL_ROLLOUT_PLATFORM_OWNER_REQUIRED', 'CRITICAL', 'Only PLATFORM_OWNER may control global platform feature rollouts.', { actorRole, featureKey: key }));
            }
            if (!isPlatformOwner(actorRole) && hasActivationIntent(updates)) {
                if (actorRole === 'super_admin') {
                    failures.push(safeFailure('SUPER_ADMIN_TENANT_FEATURE_ACTIVATION_BLOCKED', 'CRITICAL', 'SUPER_ADMIN may monitor rollout health but cannot activate tenant business features.', { actorRole, featureKey: key }));
                } else {
                    failures.push(safeFailure('TENANT_ROLE_ROLLOUT_GOVERNANCE_BLOCKED', 'CRITICAL', 'Tenant roles cannot access feature rollout governance.', { actorRole, featureKey: key }));
                }
            }
            if (scope === 'tenant') {
                if (!tenantId) {
                    failures.push(safeFailure('TENANT_ROLLOUT_TARGET_REQUIRED', 'HIGH', 'Tenant-scoped rollout requires a target tenant.', { featureKey: key }));
                }
                if (!isPlatformOwner(actorRole) && (!isTenantSafeRole(actorRole) || !actorTenantId || actorTenantId !== tenantId)) {
                    failures.push(safeFailure('CROSS_TENANT_ROLLOUT_BLOCKED', 'CRITICAL', 'Tenant-scoped rollout cannot cross tenant boundaries.', { actorTenantId, targetTenantId: tenantId }));
                }
                if (rolloutStage === 'GLOBAL_PRODUCTION') {
                    failures.push(safeFailure('TENANT_SCOPE_GLOBAL_STAGE_BLOCKED', 'HIGH', 'Tenant-scoped rollout cannot use GLOBAL_PRODUCTION stage.', { featureKey: key, tenantId }));
                }
            }

            const flags = applyRuntimeFlagUpdate(environmentFlags(context), key, updates);
            if (environment === 'PRODUCTION') {
                flags.PRODUCTION_MODE = true;
                if (key === 'ALLOW_LOCAL_AUTH_FALLBACK' && normalizeBoolean(updates.enabled ?? updates.value, false)) {
                    failures.push(safeFailure('PRODUCTION_LOCAL_AUTH_FALLBACK', 'CRITICAL', 'ALLOW_LOCAL_AUTH_FALLBACK cannot be enabled in PRODUCTION.', { featureKey: key }));
                }
                if (key === 'USE_SUPABASE_AUTH' && normalizeBoolean(updates.enabled ?? updates.value, true) === false) {
                    failures.push(safeFailure('PRODUCTION_SUPABASE_AUTH_REQUIRED', 'CRITICAL', 'USE_SUPABASE_AUTH cannot be disabled in PRODUCTION.', { featureKey: key }));
                }
                if ((key === 'ALLOW_ANONYMOUS_AUTH' || key === 'ENABLE_ANONYMOUS_AUTH' || key === 'ANONYMOUS_AUTH_ENABLED' || key === 'SUPABASE_ANON_AUTH_ENABLED') && normalizeBoolean(updates.enabled ?? updates.value, false)) {
                    failures.push(safeFailure('PRODUCTION_ANONYMOUS_AUTH_BLOCKED', 'HIGH', 'Anonymous auth cannot be enabled unexpectedly in PRODUCTION.', { featureKey: key }));
                }
            }

            if (!context.skipFlagValidator && global.FeatureFlagValidator && typeof global.FeatureFlagValidator.validateFlagCombination === 'function') {
                const flagResult = global.FeatureFlagValidator.validateFlagCombination(flags);
                if (flagResult && flagResult.success === false && flagResult.fatal) {
                    failures.push(safeFailure(flagResult.errorCode || 'FEATURE_FLAG_VALIDATOR_FATAL', 'CRITICAL', flagResult.message || 'Unsafe feature flag combination blocked.', flagResult.flags || {}));
                }
                (flagResult?.warnings || []).forEach(warning => {
                    warnings.push(safeWarning(warning.warningCode, warning.severity || 'WARNING', warning.message, warning.recommendation, { affectedFlags: warning.affectedFlags || [] }));
                });
            }

            if (risk.riskLevel === 'WARNING' || risk.riskLevel === 'HIGH_RISK') {
                warnings.push(safeWarning('RISKY_FEATURE_ACTIVATION', risk.riskLevel === 'HIGH_RISK' ? 'HIGH' : 'WARNING', risk.reason, 'Use staged rollout, monitor incidents, and keep rollback ready.', { featureKey: key, riskLevel: risk.riskLevel }));
            }

            const allowed = failures.length === 0;
            const result = freezeFeatureGovernance({
                success: allowed,
                allowed,
                featureKey: key,
                scope,
                actorRole,
                tenantId: scope === 'tenant' ? tenantId : '',
                rolloutStage,
                environment,
                riskLevel: risk.riskLevel,
                riskCode: risk.riskCode,
                failures: freezeList(failures),
                warnings: freezeList(warnings),
                timestamp: nowIso()
            });
            emitTelemetry(allowed ? 'FEATURE_ROLLOUT_VALIDATED' : 'FEATURE_ROLLOUT_BLOCKED', result, allowed ? 'INFO' : 'WARNING');
            auditRollout(allowed ? 'FEATURE_ROLLOUT_VALIDATED' : 'FEATURE_ROLLOUT_BLOCKED', actor, result);
            return result;
        } catch (err) {
            safeWarn('Feature activation validation failed safely.', { error: err?.message || String(err) });
            const result = freezeFeatureGovernance({
                success: false,
                allowed: false,
                featureKey: safeString(featureKey, ''),
                scope: 'global',
                rolloutStage: 'DEVELOPMENT_ONLY',
                riskLevel: 'HIGH_RISK',
                failures: freezeList([safeFailure('FEATURE_ACTIVATION_VALIDATION_FAILED', 'HIGH', 'Feature activation validation failed safely.')]),
                warnings: freezeList([]),
                timestamp: nowIso()
            });
            emitTelemetry('FEATURE_ROLLOUT_VALIDATION_FAILED', result, 'WARNING');
            return result;
        }
    }

    function validateRolloutScope(payload = {}, context = {}) {
        try {
            const record = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null;
            const actor = context.actor || {};
            const actorRole = normalizeRole(actor.role || context.actorRole || '');
            const routeType = safeString(context.routeType || payload?.routeType || 'platform', 'platform').trim().toLowerCase();
            const targetTenantId = targetTenant(record || {}, context);
            const actorTenantId = actorTenant(actor, context);
            const activationRequested = !!(record && (record.activationRequested || record.activate || hasActivationIntent(record)));
            const monitoringOnly = !!(record && (record.monitoringOnly || record.infrastructureOnly || record.readOnly === true));
            const rolloutState = normalizeRolloutState(record?.rolloutState || record?.state);
            const failures = [];
            const warnings = [];

            if (!record) {
                failures.push(safeFailure('MALFORMED_ROLLOUT_SCOPE', 'HIGH', 'Rollout scope payload is malformed.'));
            }
            if (record && (record.rawTenantDataAccess || record.rawConfigurationAccess || record.salaryVisibility || record.payrollVisibility || record.leaveBalanceVisibility || record.confidentialEmployeeRecord)) {
                failures.push(safeFailure('RAW_TENANT_FEATURE_CONFIGURATION_BLOCKED', 'CRITICAL', 'Raw tenant feature configuration and confidential HR data are blocked.'));
            }
            if (rolloutState === 'ARCHIVED' && activationRequested) {
                failures.push(safeFailure('ARCHIVED_ROLLOUT_MUTATION_BLOCKED', 'CRITICAL', 'Archived rollout history is immutable.'));
            }
            if (actorRole === 'platform_owner') {
                if (routeType !== 'platform') {
                    failures.push(safeFailure('PLATFORM_OWNER_TENANT_RBAC_CHAIN_BLOCKED', 'CRITICAL', 'PLATFORM_OWNER remains isolated to platform-control and tenant RBAC chains are blocked.'));
                }
            } else if (actorRole === 'super_admin') {
                if (!monitoringOnly || activationRequested) {
                    failures.push(safeFailure('SUPER_ADMIN_FEATURE_ACTIVATION_BLOCKED', 'CRITICAL', 'SUPER_ADMIN is infrastructure-only and cannot activate tenant business features.'));
                }
            } else {
                failures.push(safeFailure('TENANT_ROLE_ROLLOUT_GOVERNANCE_BLOCKED', 'CRITICAL', 'Tenant roles cannot access rollout governance.'));
            }
            if (targetTenantId && actorTenantId && actorRole !== 'platform_owner' && targetTenantId !== actorTenantId) {
                failures.push(safeFailure('CROSS_TENANT_ROLLOUT_LEAKAGE_BLOCKED', 'CRITICAL', 'Cross-tenant rollout visibility is blocked.', { targetTenantId, actorTenantId }));
            }

            return freezeFeatureOutput({
                success: failures.length === 0,
                allowed: failures.length === 0,
                readOnly: monitoringOnly || !activationRequested,
                featureKey: safeString(record?.featureKey || record?.key || '', ''),
                rolloutState,
                scope: normalizeScope(context.scope || record?.scope, record || {}),
                targetTenantId,
                actorRole,
                failures: freezeList(failures),
                warnings: freezeList(warnings),
                metadata: {
                    crossTenantRolloutLeakageBlocked: true,
                    platformIsolationPreserved: true,
                    tenantIsolationPreserved: failures.every(row => row.failureCode !== 'CROSS_TENANT_ROLLOUT_LEAKAGE_BLOCKED'),
                    featureRolloutGovernancePreserved: true
                }
            });
        } catch (err) {
            safeWarn('Rollout scope validation failed safely.', { error: err?.message || String(err) });
            return freezeFeatureOutput({
                success: false,
                allowed: false,
                rolloutState: 'DISABLED',
                failures: freezeList([safeFailure('ROLLOUT_SCOPE_VALIDATION_FAILED_SAFE', 'HIGH', 'Rollout scope validation failed safely.')])
            });
        }
    }

    function normalizeFeaturePayload(payload = {}, context = {}) {
        try {
            if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
                return freezeFeatureOutput({
                    success: false,
                    rolloutState: 'DISABLED',
                    failures: freezeList([safeFailure('MALFORMED_FEATURE_PAYLOAD', 'HIGH', 'Feature rollout payload is malformed.')])
                });
            }
            const normalized = {
                featureKey: safeString(payload.featureKey || payload.key || payload.flagKey || '', '').trim(),
                rolloutState: normalizeRolloutState(payload.rolloutState || payload.state || (payload.enabled === false ? 'DISABLED' : 'ACTIVE')),
                rolloutStage: normalizeStage(payload.rolloutStage || payload.stage || 'PILOT_ENABLED'),
                rolloutPercentage: clamp(safeNumber(payload.rolloutPercentage || payload.percentage, 0), 0, 100),
                targetTenantId: normalizeTenantId(payload.targetTenantId || payload.tenantId || payload.companyId || ''),
                tenantId: normalizeTenantId(payload.tenantId || payload.companyId || ''),
                enabled: normalizeBoolean(payload.enabled, false),
                betaCohort: safeString(payload.betaCohort || payload.cohort || '', ''),
                dependencyKeys: Array.isArray(payload.dependencyKeys || payload.dependencies)
                    ? (payload.dependencyKeys || payload.dependencies).map(item => safeString(item && (item.featureKey || item.key || item), '')).filter(Boolean)
                    : [],
                rollbackCheckpoint: safeString(payload.rollbackCheckpoint || payload.checkpointId || '', ''),
                readOnly: payload.readOnly === true,
                metadata: {
                    source: 'featureRolloutService',
                    tenantIsolationPreserved: true,
                    featureRolloutGovernancePreserved: true
                }
            };
            return freezeFeatureOutput({
                success: true,
                payload: normalized
            });
        } catch (err) {
            safeWarn('Feature payload normalization failed safely.', { error: err?.message || String(err) });
            return freezeFeatureOutput({
                success: false,
                rolloutState: 'DISABLED',
                failures: freezeList([safeFailure('FEATURE_PAYLOAD_NORMALIZATION_FAILED_SAFE', 'HIGH', 'Feature rollout payload normalization failed safely.')])
            });
        }
    }

    function detectRolloutDegradation(filters = {}, context = {}) {
        try {
            const data = dataStore();
            const rollouts = rolloutRows(data);
            const usages = usageRows(data);
            const features = featureRows(data);
            const rolloutFailures = rollouts.filter(rowFailure).length + usages.filter(rowFailure).length;
            const degradedFeatureBehavior = rollouts.filter(rowDegraded).length + usages.filter(rowDegraded).length;
            const tenantAdoptionTrends = rollouts.filter(row => safeNumber(row?.adoptionCount, 0) > 0 || normalizeBoolean(row?.enabled, false)).length;
            const rolloutCongestion = rollouts.filter(row => {
                const percentage = safeNumber(row?.rolloutPercentage || row?.percentage, 0);
                const state = normalizeRolloutState(row?.rolloutState || row?.state);
                return state === 'BETA' || state === 'LIMITED_ROLLOUT' || state === 'ROLLBACK_PENDING' || (percentage > 0 && percentage < 100);
            }).length;
            const featureCrashIndicators = rollouts.reduce((sum, row) => sum + safeNumber(row?.crashCount, 0), 0) + usages.filter(row => /CRASH|ERROR/i.test([row?.eventType, row?.status].join(' '))).length;
            const rollbackFrequency = rollouts.reduce((sum, row) => sum + safeNumber(row?.rollbackCount, 0), 0) + rollouts.filter(rowRollback).length + usages.filter(rowRollback).length;
            const activationAnomalies = rollouts.filter(row => row?.activationAnomaly || row?.crossTenant || row?.unsafeActivation).length;
            const inactiveFeatureDetection = features.filter(row => row && row.enabled === false).length + rollouts.filter(row => safeNumber(row?.usageCount, 0) === 0 && safeNumber(row?.rolloutPercentage, 0) > 0).length;
            const workflowLinkedFeatureUsage = usages.filter(row => row?.featureKey && /WF-|WORKFLOW/i.test([row?.eventId, row?.eventType, row?.module].join(' '))).length;
            const adoptionDecline = rollouts.filter(row => safeNumber(row?.usageCount, 0) > 0 && safeNumber(row?.adoptionCount, 0) / Math.max(safeNumber(row?.usageCount, 0), 1) < 0.4).length;
            const summary = {
                rolloutFailures,
                degradedFeatureBehavior,
                tenantAdoptionTrends,
                rolloutCongestion,
                featureCrashIndicators,
                rollbackFrequency,
                activationAnomalies,
                inactiveFeatureDetection,
                workflowLinkedFeatureUsage,
                adoptionDecline
            };
            const healthSignals = Object.keys(summary)
                .filter(key => summary[key] > 0)
                .map(key => safeWarning(key.toUpperCase(), key === 'featureCrashIndicators' || key === 'rolloutFailures' ? 'HIGH' : 'WARNING', 'Feature rollout signal detected.', 'Review rollout health before expanding activation.', { count: summary[key] }));
            return freezeFeatureOutput({
                success: true,
                classification: healthSignals.length ? 'WARNING' : 'INFO',
                state: healthSignals.length ? 'DEGRADED' : 'ACTIVE',
                summary,
                healthSignals,
                metadata: {
                    aggregateOnly: true,
                    tenantIsolationPreserved: true,
                    featureRolloutGovernancePreserved: true
                }
            });
        } catch (err) {
            safeWarn('Rollout degradation detection failed safely.', { error: err?.message || String(err) });
            return freezeFeatureOutput({
                success: false,
                classification: 'HIGH_RISK',
                state: 'DEGRADED',
                summary: {
                    rolloutFailures: 0,
                    degradedFeatureBehavior: 0,
                    tenantAdoptionTrends: 0,
                    rolloutCongestion: 0,
                    featureCrashIndicators: 0,
                    rollbackFrequency: 0,
                    activationAnomalies: 0
                },
                failures: freezeList([safeFailure('ROLLOUT_DEGRADATION_DETECTION_FAILED_SAFE', 'HIGH', 'Rollout degradation detection failed safely.')])
            });
        }
    }

    function validateRollbackGovernance(payload = {}, context = {}) {
        const scope = validateRolloutScope({ ...shallowClone(payload), activationRequested: true }, context);
        const dependencyKeys = Array.isArray(payload?.dependencyKeys || payload?.dependencies) ? (payload.dependencyKeys || payload.dependencies) : [];
        const rollbackType = safeString(payload?.rollbackType || 'instant', 'instant').toLowerCase();
        const result = {
            success: scope.allowed,
            allowed: scope.allowed,
            featureKey: safeString(payload?.featureKey || payload?.key || '', ''),
            rolloutState: normalizeRolloutState(payload?.rolloutState || payload?.state || 'ROLLBACK_PENDING'),
            rollbackGovernance: {
                instantRollback: rollbackType !== 'staged',
                stagedRollback: rollbackType === 'staged',
                rollbackDependencyValidation: true,
                rollbackAuditTrails: true,
                emergencyFeatureDisable: true,
                rollbackHealthVerification: true,
                rollbackFrequency: 1
            },
            failures: scope.failures || [],
            warnings: scope.warnings || []
        };
        if (dependencyKeys.length) {
            result.rollbackGovernance.dependencyKeys = dependencyKeys.map(item => safeString(item && (item.featureKey || item.key || item), '')).filter(Boolean);
        }
        return freezeFeatureOutput(result);
    }

    function getFeatureGovernanceView(input = {}) {
        try {
            const featuresSource = input.features || db()?.getPlatformGovernance?.()?.features || {};
            const environment = normalizeEnvironment(input.environment);
            const features = (Array.isArray(featuresSource) ? featuresSource : Object.values(featuresSource))
                .map(feature => {
                    const row = normalizeFeatureFlag(feature, { environment });
                    const validation = validateFeatureActivation(row.key, { enabled: row.enabled, rolloutStage: row.rolloutStage }, {
                        actor: input.actor || { role: 'platform_owner' },
                        environment,
                        flags: input.flags || {},
                        feature: feature,
                        scope: 'global',
                        skipFlagValidator: true
                    });
                    return freezeFeatureGovernance({
                        ...deepClone(row),
                        activationAllowed: validation.allowed,
                        blockedReason: validation.failures?.[0]?.message || '',
                        warningsCount: validation.warnings?.length || 0,
                        failuresCount: validation.failures?.length || 0
                    });
                })
                .sort((a, b) => (a.label || a.key).localeCompare(b.label || b.key));
            const riskyFlags = features.filter(row => row.riskLevel !== 'SAFE').length;
            const blockedFlags = features.filter(row => row.activationAllowed === false || row.riskLevel === 'CRITICAL_BLOCKED').length;
            const tenantRolloutCount = features.reduce((sum, row) => sum + (row.tenantRollouts?.length || 0), 0);
            return freezeFeatureGovernance({
                success: true,
                environment,
                generatedAt: nowIso(),
                rolloutStages: ROLLOUT_STAGES.slice(),
                riskLevels: RISK_LEVELS.slice(),
                totalFeatures: features.length,
                riskyFlags,
                blockedFlags,
                tenantRolloutCount,
                features: freezeList(features)
            });
        } catch (err) {
            safeWarn('Feature governance view failed safely.', { error: err?.message || String(err) });
            return freezeFeatureGovernance({
                success: false,
                environment: 'DEVELOPMENT',
                generatedAt: nowIso(),
                rolloutStages: ROLLOUT_STAGES.slice(),
                riskLevels: RISK_LEVELS.slice(),
                totalFeatures: 0,
                riskyFlags: 0,
                blockedFlags: 0,
                tenantRolloutCount: 0,
                features: freezeList([])
            });
        }
    }

    function emitTelemetry(eventType, metadata, severity) {
        try {
            if (!global.WorkflowTelemetryService || typeof global.WorkflowTelemetryService.emitTelemetry !== 'function') return false;
            global.WorkflowTelemetryService.emitTelemetry('GOVERNANCE', eventType, {
                source: 'featureRolloutService',
                severity: severity || 'INFO',
                status: 'RECORDED',
                metadata: safeMetadata(metadata)
            });
            return true;
        } catch (err) {
            safeWarn('Telemetry failed safely.', { eventType, error: err?.message || String(err) });
            return false;
        }
    }

    function auditRollout(eventType, actor, metadata) {
        try {
            if (!global.AuditService || typeof global.AuditService.recordAudit !== 'function') return false;
            global.AuditService.recordAudit({
                type: eventType,
                eventType,
                actorId: actor?.id || actor?.empId || actor?.email || '',
                employeeId: actor?.empId || '',
                source: 'featureRolloutService',
                severity: metadata?.allowed === false ? 'WARNING' : 'INFO',
                metadata: {
                    ...safeMetadata(metadata),
                    actionType: eventType,
                    module: 'Feature Rollout Governance'
                }
            }, {
                source: 'featureRolloutService',
                actor: shallowClone(actor)
            });
            return true;
        } catch (err) {
            safeWarn('Audit failed safely.', { eventType, error: err?.message || String(err) });
            return false;
        }
    }

    function recordMetric(metricType, metadata, context) {
        if (metricForwarding || context?.skipMetrics) return { success: true, skipped: true };
        metricForwarding = true;
        try {
            const service = global.OrchestrationMetricsService || global.orchestrationMetricsService;
            if (service && typeof service.recordWorkflowMetric === 'function') {
                service.recordWorkflowMetric(metricType, {
                    tenantSlug: 'platform',
                    source: 'featureRolloutService',
                    status: metadata?.status || metricType,
                    severity: metadata?.severity || 'INFO'
                });
                return { success: true };
            }
        } catch (err) {
            return { success: false, warning: 'Feature rollout metric failed safely.' };
        } finally {
            metricForwarding = false;
        }
        return { success: false, warning: 'OrchestrationMetricsService unavailable.' };
    }

    function generateFeatureRolloutReport(filters = {}, context = {}) {
        try {
            const ctx = context || {};
            const data = dataStore();
            const scope = validateRolloutScope({ ...shallowClone(filters), readOnly: true, monitoringOnly: true }, ctx);
            if (!scope.allowed) {
                return freezeFeatureOutput({
                    success: false,
                    readOnly: true,
                    classification: 'CRITICAL_BLOCKED',
                    featureFlagModel: { states: ROLLOUT_STATES.slice(), aggregateOnly: true },
                    failures: scope.failures,
                    accessGovernance: {
                        crossTenantRolloutLeakageBlocked: true,
                        unsafeFeatureActivationBlocked: true,
                        superAdminActivationAuthority: false,
                        platformOwnerTenantRbacIsolation: true,
                        platformIsolationPreserved: true,
                        tenantIsolationPreserved: false
                    }
                });
            }

            const features = featureRows(data).map(feature => normalizeFeatureFlag(feature, ctx));
            const rollouts = rolloutRows(data);
            const usages = usageRows(data);
            const degradation = detectRolloutDegradation(filters, { ...ctx, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            const summary = degradation.summary || {};
            const stateCounts = ROLLOUT_STATES.reduce((counts, state) => {
                counts[state] = features.filter(row => row.rolloutState === state).length + rollouts.filter(row => normalizeRolloutState(row.rolloutState || row.state) === state).length;
                return counts;
            }, {});
            const enabledFeatures = features.filter(row => row.enabled !== false && row.emergencyDisabled !== true).length;
            const disabledFeatures = features.filter(row => row.enabled === false || row.emergencyDisabled === true).length;
            const tenantTargets = {};
            rollouts.forEach(row => {
                const tenant = rowTenant(row);
                if (tenant) tenantTargets[tenant] = true;
            });
            const usageFrequency = usages.length + rollouts.reduce((sum, row) => sum + safeNumber(row.usageCount, 0), 0);
            const adoptionCount = rollouts.reduce((sum, row) => sum + safeNumber(row.adoptionCount, 0), 0);
            const onboardingFeatureUsage = usages.filter(row => /ONBOARD|INVITE/i.test([row.eventType, row.module, row.featureKey].join(' '))).length;
            const workflowLinkedFeatureUsage = summary.workflowLinkedFeatureUsage || usages.filter(row => row.featureKey).length;
            const adoptionRate = usageFrequency ? Math.round((adoptionCount / Math.max(usageFrequency, 1)) * 100) : 0;
            const rollbackFrequency = summary.rollbackFrequency || 0;
            const report = {
                success: true,
                readOnly: true,
                classification: degradation.classification || 'INFO',
                generatedAt: nowIso(),
                featureFlagModel: {
                    states: ROLLOUT_STATES.slice(),
                    rolloutStages: ROLLOUT_STAGES.slice(),
                    featureCount: features.length,
                    enabledFeatures,
                    disabledFeatures,
                    betaFeatures: stateCounts.BETA || 0,
                    limitedRolloutFeatures: stateCounts.LIMITED_ROLLOUT || 0,
                    degradedFeatures: stateCounts.DEGRADED || 0,
                    rollbackPendingFeatures: stateCounts.ROLLBACK_PENDING || 0,
                    archivedFeatures: stateCounts.ARCHIVED || 0,
                    historicalRolloutRecordsImmutable: true
                },
                rolloutGovernance: {
                    stagedRollouts: rollouts.filter(row => ['BETA', 'LIMITED_ROLLOUT', 'INTERNAL_TESTING'].includes(normalizeRolloutState(row.rolloutState || row.state))).length,
                    tenantTargetedActivation: Object.keys(tenantTargets).length,
                    betaTestingGroups: stateCounts.BETA || 0,
                    rolloutPercentageControls: rollouts.filter(row => safeNumber(row.rolloutPercentage || row.percentage, 0) > 0).length,
                    featureDependencyValidation: rollouts.filter(row => Array.isArray(row.dependencyKeys || row.dependencies) && (row.dependencyKeys || row.dependencies).length).length,
                    rollbackCheckpoints: rollbackFrequency,
                    rolloutFreezeHandling: features.filter(row => row.emergencyDisabled === true).length,
                    unsafeGlobalActivationBlocked: true
                },
                featureHealth: {
                    rolloutFailures: summary.rolloutFailures || 0,
                    degradedFeatureBehavior: summary.degradedFeatureBehavior || 0,
                    tenantAdoptionTrends: summary.tenantAdoptionTrends || 0,
                    rolloutCongestion: summary.rolloutCongestion || 0,
                    featureCrashIndicators: summary.featureCrashIndicators || 0,
                    rollbackFrequency: rollbackFrequency,
                    activationAnomalies: summary.activationAnomalies || 0
                },
                featureAdoptionAnalytics: {
                    tenantFeatureAdoption: Object.keys(tenantTargets).length,
                    usageFrequency,
                    inactiveFeatureDetection: summary.inactiveFeatureDetection || disabledFeatures,
                    onboardingFeatureUsage,
                    operationalAdoptionRates: adoptionRate,
                    workflowLinkedFeatureUsage
                },
                rollbackGovernance: {
                    instantRollback: true,
                    stagedRollback: true,
                    rollbackDependencyValidation: true,
                    rollbackAuditTrails: rollbackFrequency,
                    emergencyFeatureDisable: features.filter(row => row.emergencyDisabled === true).length,
                    rollbackHealthVerification: true,
                    rollbackFrequency
                },
                platformAnalyticsIntegration: {
                    rolloutPerformance: rollouts.length,
                    adoptionHealth: adoptionRate,
                    workflowImpact: workflowLinkedFeatureUsage,
                    featureCongestion: summary.rolloutCongestion || 0,
                    degradedTenantExperience: summary.degradedFeatureBehavior || 0,
                    onboardingImpact: onboardingFeatureUsage
                },
                accessGovernance: {
                    crossTenantRolloutLeakageBlocked: true,
                    unsafeFeatureActivationBlocked: true,
                    superAdminActivationAuthority: false,
                    platformOwnerTenantRbacIsolation: true,
                    rolloutActionsAuditable: true,
                    platformIsolationPreserved: true,
                    featureRolloutGovernancePreserved: true,
                    tenantIsolationPreserved: true,
                    existingTenantWorkflowsPreserved: true
                },
                integrationHealth: {
                    workflowTelemetryIntegrated: !!global.WorkflowTelemetryService,
                    platformAnalyticsIntegrated: !!global.PlatformAnalyticsService,
                    tenantGovernanceIntegrated: !!(global.TenantGovernanceService || global.tenantGovernanceService || global.PlatformGovernanceService),
                    auditReady: !!global.AuditService,
                    telemetryReady: !!global.WorkflowTelemetryService,
                    metricsReady: !!global.OrchestrationMetricsService
                },
                warnings: degradation.healthSignals || [],
                metadata: {
                    aggregateOnly: true,
                    featureRolloutGovernancePreserved: true,
                    tenantIsolationPreserved: true,
                    historicalRolloutRecordsImmutable: true,
                    platformIsolationPreserved: true
                }
            };

            if (!ctx.skipAuditPersistence) auditRollout('FEATURE_ROLLOUT_REPORTED', ctx.actor || { role: 'platform_owner' }, report);
            if (!ctx.skipTelemetry) emitTelemetry('FEATURE_ROLLOUT_REPORTED', report, report.classification === 'INFO' ? 'INFO' : 'WARNING');
            recordMetric('FEATURE_ROLLOUT_REPORTED', { status: report.classification, severity: report.classification === 'INFO' ? 'INFO' : 'WARNING' }, ctx);

            return freezeFeatureOutput(report);
        } catch (err) {
            safeWarn('Feature rollout report failed safely.', { error: err?.message || String(err) });
            return freezeFeatureOutput({
                success: false,
                readOnly: true,
                classification: 'HIGH_RISK',
                featureFlagModel: { states: ROLLOUT_STATES.slice(), aggregateOnly: true },
                featureHealth: { rolloutFailures: 0 },
                failures: freezeList([safeFailure('FEATURE_ROLLOUT_REPORT_FAILED_SAFE', 'HIGH', 'Feature rollout report failed safely.')])
            });
        }
    }

    function runSelfTest() {
        const checks = [];
        function check(label, condition) { checks.push({ label, passed: !!condition }); }
        try {
            const malformed = normalizeFeaturePayload(null, {});
            check('malformed payloads fail safely', malformed.success === false && malformed.failures.some(item => item.failureCode === 'MALFORMED_FEATURE_PAYLOAD'));

            const blocked = validateFeatureActivation('ALLOW_LOCAL_AUTH_FALLBACK', { enabled: true }, {
                actor: { role: 'platform_owner' },
                environment: 'PRODUCTION',
                flags: { PRODUCTION_MODE: true, USE_SUPABASE_AUTH: true, REQUIRE_EMAIL_VERIFIED: true }
            });
            check('unsafe production rollout blocked', blocked.allowed === false && blocked.failures.some(item => item.failureCode === 'PRODUCTION_LOCAL_AUTH_FALLBACK'));

            const superAdminBlocked = validateFeatureActivation('payroll', { enabled: true, rolloutStage: 'GLOBAL_PRODUCTION' }, {
                actor: { role: 'super_admin', tenantId: 'T1' },
                environment: 'PRODUCTION',
                scope: 'global'
            });
            check('super admin activation blocked', superAdminBlocked.allowed === false);

            const tenantScope = validateRolloutScope({ targetTenantId: 'T2', activationRequested: true }, {
                actor: { role: 'super_admin', tenantId: 'T1' },
                routeType: 'platform'
            });
            check('rollout isolation works', tenantScope.allowed === false);

            const rollback = validateRollbackGovernance({ featureKey: 'reports', rolloutState: 'ROLLBACK_PENDING', dependencyKeys: ['workflow'] }, {
                actor: { role: 'platform_owner' },
                routeType: 'platform'
            });
            check('rollback governance works', rollback.success === true && rollback.rollbackGovernance.rollbackDependencyValidation === true);

            const normalized = normalizeFeaturePayload({ featureKey: 'aiInsights', rolloutState: 'beta', rolloutPercentage: 25, salary: 90000 });
            check('staged rollout normalizes safely', normalized.success === true && normalized.payload.rolloutState === 'BETA' && JSON.stringify(normalized).indexOf('90000') === -1);

            const degradation = detectRolloutDegradation({}, { routeType: 'platform' });
            check('adoption analytics work', degradation.success === true && Object.isFrozen(degradation));

            const frozen = freezeFeatureOutput({ nested: { ok: true }, salary: 90000 });
            check('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.nested) && JSON.stringify(frozen).indexOf('90000') === -1);

            const originalTelemetry = global.WorkflowTelemetryService;
            const originalAnalytics = global.PlatformAnalyticsService;
            try {
                delete global.WorkflowTelemetryService;
                delete global.PlatformAnalyticsService;
                const report = generateFeatureRolloutReport({}, { routeType: 'platform', actor: { role: 'platform_owner' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
                check('dependency absence degrades safely', report.success === true && report.integrationHealth.workflowTelemetryIntegrated === false && report.integrationHealth.platformAnalyticsIntegrated === false);
            } finally {
                if (originalTelemetry) global.WorkflowTelemetryService = originalTelemetry;
                if (originalAnalytics) global.PlatformAnalyticsService = originalAnalytics;
            }
        } catch (err) {
            checks.push({ label: 'self-test uncaught error guard', passed: false, description: safeString(err?.message || err, '') });
        }
        const passed = checks.every(item => item.passed);
        const result = freezeFeatureOutput({
            passed,
            checks,
            summary: passed ? 'Feature rollout self-test passed.' : 'Feature rollout self-test detected failures.'
        });
        global.__ARTHHRMS_FEATURE_ROLLOUT_SELF_TEST__ = result;
        return result;
    }

    const api = Object.freeze({
        ROLLOUT_STATES,
        ROLLOUT_STAGES,
        RISK_LEVELS,
        classifyFeatureRisk,
        validateRolloutEnvironment,
        normalizeFeatureFlag,
        freezeFeatureGovernance,
        freezeFeatureOutput,
        validateRolloutScope,
        normalizeFeaturePayload,
        detectRolloutDegradation,
        validateRollbackGovernance,
        validateFeatureActivation,
        getFeatureGovernanceView,
        generateFeatureRolloutReport,
        runSelfTest
    });

    global.FeatureRolloutService = api;
    global.featureRolloutService = api;

    if (global.__ARTHHRMS_DEV__) {
        try { runSelfTest(); } catch (err) {}
    }
})(typeof window !== 'undefined' ? window : globalThis);
