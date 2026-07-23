/**
 * launchReadinessService.js
 * ARTHHRMS — Platform Launch Readiness Gate
 *
 * PURPOSE:
 * Validates whether the platform is operationally safe for
 * DEVELOPMENT, PILOT, or PRODUCTION deployment states.
 *
 * This service prevents unsafe rollout conditions before
 * real-company onboarding or production activation.
 *
 * STABILITY:
 * Public APIs must remain synchronous and backward-compatible.
 * This file must never introduce async-only runtime behavior.
 *
 * DEPENDS ON:
 * - window.FeatureFlagValidator (optional)
 * - window.PlatformGovernanceService (optional)
 * - window.IdempotencyService (optional)
 *
 * @version 1.0.0
 */
(function (global) {
    'use strict';

    const PREFIX = '[LaunchReadinessService]';
    const READY = 'READY';
    const WARNING = 'WARNING';
    const BLOCKED = 'BLOCKED';

    function safeWarn(message, details) {
        try {
            if (global.console && typeof global.console.warn === 'function') {
                if (details !== undefined) global.console.warn(message, details);
                else global.console.warn(message);
            }
        } catch (e) {}
    }

    function safeInfo(message, details) {
        try {
            if (global.console && typeof global.console.info === 'function') {
                if (details !== undefined) global.console.info(message, details);
                else global.console.info(message);
            }
        } catch (e) {}
    }

    function deepFreeze(value) {
        if (!value || (typeof value !== 'object' && typeof value !== 'function') || Object.isFrozen(value)) {
            return value;
        }
        Object.keys(value).forEach(key => deepFreeze(value[key]));
        return Object.freeze(value);
    }

    function safeString(value, fallback) {
        try {
            if (typeof value === 'symbol') return value.toString();
            return String(value);
        } catch (e) {
            return fallback;
        }
    }

    function safeCloneObject(input) {
        const output = {};
        if (!input || typeof input !== 'object' || Array.isArray(input)) return output;
        try {
            Object.keys(input).forEach(key => {
                try {
                    output[key] = input[key];
                } catch (e) {}
            });
        } catch (e) {}
        return output;
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

    function normalizeEnvironment(environment) {
        const normalized = safeString(environment || 'DEVELOPMENT', 'DEVELOPMENT')
            .trim()
            .replace(/[\s-]+/g, '_')
            .toUpperCase();
        if (normalized === 'DEV') return 'DEVELOPMENT';
        if (normalized === 'PROD') return 'PRODUCTION';
        if (['DEVELOPMENT', 'PILOT', 'PRODUCTION'].includes(normalized)) return normalized;
        return '';
    }

    function featureFlagValidator(options) {
        if (options && options.forceMissingDependencies) return null;
        return global.FeatureFlagValidator || null;
    }

    function platformGovernanceService(options) {
        if (options && options.forceMissingDependencies) return null;
        return global.PlatformGovernanceService || global.platformGovernanceService || null;
    }

    function idempotencyService(options) {
        if (options && options.forceMissingDependencies) return null;
        return global.IdempotencyService || null;
    }

    if (!featureFlagValidator()) {
        safeWarn(`${PREFIX} Optional dependency window.FeatureFlagValidator is unavailable. Local readiness rules remain active.`);
    }

    if (!platformGovernanceService()) {
        safeWarn(`${PREFIX} Optional dependency window.PlatformGovernanceService is unavailable. Governance context must be supplied explicitly when needed.`);
    }

    if (!idempotencyService()) {
        safeWarn(`${PREFIX} Optional dependency window.IdempotencyService is unavailable. Duplicate-operation readiness checks are not enforced by this gate.`);
    }

    const FLAG_KEYS = deepFreeze([
        'USE_SUPABASE_AUTH',
        'USE_SUPABASE_PASSWORD_RECOVERY',
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
        'REQUIRE_EMAIL_VERIFIED'
    ]);

    const CONTEXT_KEYS = deepFreeze([
        'payrollVerified',
        'monitoringEnabled',
        'importsValidated',
        'rlsValidated',
        'inviteFlowValidated',
        'storageVerified',
        'expenseUploadsVerified',
        'governanceReviewed',
        'expensesEnabled'
    ]);

    function runtimeFlagsFromConfig() {
        try {
            const config = global.supabaseClientService?.readConfig?.();
            return safeCloneObject(config?.flags || {});
        } catch (e) {
            return {};
        }
    }

    function normalizeFlags(flags) {
        const supplied = flags && typeof flags === 'object' && !Array.isArray(flags)
            ? safeCloneObject(flags)
            : runtimeFlagsFromConfig();
        return FLAG_KEYS.reduce((acc, key) => {
            acc[key] = normalizeBoolean(supplied[key], false);
            return acc;
        }, {});
    }

    function normalizeContext(context) {
        const supplied = context && typeof context === 'object' && !Array.isArray(context)
            ? safeCloneObject(context)
            : {};
        return CONTEXT_KEYS.reduce((acc, key) => {
            acc[key] = supplied[key] === true;
            return acc;
        }, {});
    }

    function blocker(blockerCode, severity, message, recommendation, metadata) {
        return {
            blockerCode,
            severity,
            message,
            recommendation,
            metadata: metadata || {}
        };
    }

    function warning(warningCode, severity, message, recommendation, metadata) {
        return {
            warningCode,
            severity,
            message,
            recommendation,
            metadata: metadata || {}
        };
    }

    function pass(checkCode, message, metadata) {
        return {
            checkCode,
            message,
            metadata: metadata || {}
        };
    }

    function mergeFeatureFlagValidation(flags, blockers, warnings, passedChecks, options) {
        const validator = featureFlagValidator(options);
        if (!validator || typeof validator.validateFlagCombination !== 'function') {
            passedChecks.push(pass(
                'FEATURE_FLAG_LOCAL_RULES_ACTIVE',
                'Feature flag validator optional dependency is absent; launch gate local rules were applied.'
            ));
            return;
        }

        let result = null;
        try {
            result = validator.validateFlagCombination({ ...flags });
        } catch (e) {
            blockers.push(blocker(
                'FEATURE_FLAG_VALIDATOR_RUNTIME_ERROR',
                'CRITICAL',
                `${PREFIX} Feature flag validation failed safely.`,
                'Fix FeatureFlagValidator runtime behavior before rollout.',
                { error: e && e.message ? e.message : safeString(e, 'unknown error') }
            ));
            return;
        }

        if (result && result.success === false && result.fatal === true) {
            blockers.push(blocker(
                result.errorCode || 'FEATURE_FLAG_FATAL_ERROR',
                'CRITICAL',
                result.message || `${PREFIX} Feature flag validator reported a fatal deployment risk.`,
                'Resolve the fatal feature flag combination before enabling this environment.',
                { affectedFlags: result.affectedFlags || [] }
            ));
            return;
        }

        (result?.warnings || []).forEach(item => {
            warnings.push(warning(
                item.warningCode || 'FEATURE_FLAG_WARNING',
                item.severity || 'WARNING',
                item.message || `${PREFIX} Feature flag validator reported an operational warning.`,
                item.recommendation || 'Review feature flag safety before rollout.',
                { affectedFlags: item.affectedFlags || [], source: 'FeatureFlagValidator' }
            ));
        });

        passedChecks.push(pass('FEATURE_FLAGS_VALIDATED', 'Feature flag combination validation completed.'));
    }

    function validateProduction(flags, context, blockers, warnings, passedChecks) {
        if (flags.ALLOW_LOCAL_AUTH_FALLBACK) {
            blockers.push(blocker(
                'PRODUCTION_LOCAL_AUTH_FALLBACK',
                'CRITICAL',
                'Production cannot launch while local authentication fallback is enabled.',
                'Set ALLOW_LOCAL_AUTH_FALLBACK=false before production activation.'
            ));
        }

        if (!flags.USE_SUPABASE_AUTH) {
            blockers.push(blocker(
                'PRODUCTION_SUPABASE_AUTH_REQUIRED',
                'CRITICAL',
                'Production requires Supabase authentication to be enabled.',
                'Enable USE_SUPABASE_AUTH before production activation.'
            ));
        }

        if (!flags.REQUIRE_EMAIL_VERIFIED) {
            blockers.push(blocker(
                'PRODUCTION_EMAIL_VERIFICATION_REQUIRED',
                'CRITICAL',
                'Production requires verified email accounts.',
                'Set REQUIRE_EMAIL_VERIFIED=true before production activation.'
            ));
        }

        if (flags.USE_SUPABASE_PAYROLL && context.payrollVerified !== true) {
            blockers.push(blocker(
                'PRODUCTION_PAYROLL_NOT_VERIFIED',
                'CRITICAL',
                'Supabase payroll is enabled but payroll verification is incomplete.',
                'Complete payroll calculation and duplicate-generation verification before production.'
            ));
        }

        if (!flags.USE_SUPABASE_STORAGE && (context.expensesEnabled === true || flags.USE_SUPABASE_EXPENSES)) {
            blockers.push(blocker(
                'PRODUCTION_EXPENSE_STORAGE_NOT_READY',
                'CRITICAL',
                'Expense workflows require Supabase Storage before production launch.',
                'Enable and verify USE_SUPABASE_STORAGE before launching expense uploads.'
            ));
        }

        if (context.monitoringEnabled !== true) {
            blockers.push(blocker(
                'PRODUCTION_MONITORING_NOT_ENABLED',
                'CRITICAL',
                'Production requires operational monitoring to be enabled.',
                'Validate monitoring health checks before production activation.'
            ));
        }

        if (context.importsValidated !== true) {
            blockers.push(blocker(
                'PRODUCTION_IMPORTS_NOT_VALIDATED',
                'CRITICAL',
                'Production requires import validation to be completed.',
                'Validate staging, preview, commit, and rollback flows before production.'
            ));
        }

        if (context.rlsValidated !== true) {
            blockers.push(blocker(
                'PRODUCTION_RLS_NOT_VALIDATED',
                'CRITICAL',
                'Production requires RLS visibility checks to pass.',
                'Complete employee, manager, HR, admin, and owner RLS validation.'
            ));
        }

        if (context.inviteFlowValidated !== true) {
            blockers.push(blocker(
                'PRODUCTION_INVITE_FLOW_NOT_VALIDATED',
                'CRITICAL',
                'Production requires invite onboarding validation to pass.',
                'Validate invite delivery, activation, role linking, and email verification.'
            ));
        }

        if (!blockers.some(item => item.blockerCode.startsWith('PRODUCTION_'))) {
            passedChecks.push(pass('PRODUCTION_CRITICAL_RULES_PASSED', 'Production critical readiness rules passed.'));
        }
        if (context.governanceReviewed === true) {
            passedChecks.push(pass('GOVERNANCE_REVIEWED', 'Platform governance review has been marked complete.'));
        } else {
            warnings.push(warning(
                'PRODUCTION_GOVERNANCE_REVIEW_RECOMMENDED',
                'WARNING',
                'Governance review has not been explicitly marked complete.',
                'Review platform feature access and environment flags before final production launch.'
            ));
        }
    }

    function validatePilot(flags, context, blockers, warnings, passedChecks) {
        if (flags.ALLOW_LOCAL_AUTH_FALLBACK) {
            warnings.push(warning(
                'PILOT_LOCAL_AUTH_FALLBACK',
                'WARNING',
                'Pilot mode is allowing local authentication fallback.',
                'Limit fallback to controlled pilot testing and disable it before production.'
            ));
        }

        if (context.storageVerified !== true) {
            warnings.push(warning(
                'PILOT_STORAGE_NOT_VERIFIED',
                'WARNING',
                'Storage verification is incomplete for pilot rollout.',
                'Verify storage buckets and upload permissions before large pilot usage.'
            ));
        }

        if (context.monitoringEnabled !== true) {
            warnings.push(warning(
                'PILOT_MONITORING_NOT_ENABLED',
                'WARNING',
                'Monitoring is not marked enabled for pilot rollout.',
                'Enable monitoring before expanding pilot users.'
            ));
        }

        if (context.expenseUploadsVerified !== true) {
            warnings.push(warning(
                'PILOT_EXPENSE_UPLOADS_NOT_VERIFIED',
                'WARNING',
                'Expense upload verification is incomplete.',
                'Verify receipt upload and storage behavior before using expense workflows in pilot.'
            ));
        }

        if (context.governanceReviewed !== true) {
            warnings.push(warning(
                'PILOT_GOVERNANCE_NOT_REVIEWED',
                'WARNING',
                'Platform governance has not been reviewed for pilot rollout.',
                'Review feature visibility and access controls before pilot activation.'
            ));
        }

        if (!warnings.length && !blockers.length) {
            passedChecks.push(pass('PILOT_WARNING_RULES_PASSED', 'Pilot readiness warning rules passed without issues.'));
        }
    }

    function validateDevelopment(flags, context, blockers, warnings, passedChecks) {
        if (flags.PRODUCTION_MODE || flags.PILOT_MODE) {
            warnings.push(warning(
                'DEVELOPMENT_ENVIRONMENT_FLAG_MIX',
                'WARNING',
                'Development readiness received pilot or production mode flags.',
                'Keep DEVELOPMENT_MODE isolated from pilot and production mode flags during local testing.'
            ));
        }
        passedChecks.push(pass('DEVELOPMENT_READINESS_BASELINE', 'Development deployment baseline is available.'));
        if (context.monitoringEnabled === true) {
            passedChecks.push(pass('DEVELOPMENT_MONITORING_AVAILABLE', 'Monitoring is available in development context.'));
        }
    }

    function addCoreAreaPasses(environment, flags, context, blockers, warnings, passedChecks) {
        const hasBlocker = code => blockers.some(item => item.blockerCode === code);
        if (!hasBlocker('PRODUCTION_SUPABASE_AUTH_REQUIRED') && !hasBlocker('PRODUCTION_LOCAL_AUTH_FALLBACK') && !hasBlocker('PRODUCTION_EMAIL_VERIFICATION_REQUIRED')) {
            passedChecks.push(pass('AUTH_SAFETY_CHECKED', 'Authentication safety rules were evaluated.', { environment }));
        }
        if (environment !== 'PRODUCTION' || context.inviteFlowValidated === true) {
            passedChecks.push(pass('INVITE_READINESS_CHECKED', 'Invite readiness rules were evaluated.', { inviteFlowValidated: context.inviteFlowValidated }));
        }
        if (!flags.USE_SUPABASE_PAYROLL || context.payrollVerified === true) {
            passedChecks.push(pass('PAYROLL_READINESS_CHECKED', 'Payroll readiness rules were evaluated.', { payrollEnabled: flags.USE_SUPABASE_PAYROLL }));
        }
        if (flags.USE_SUPABASE_STORAGE || !context.expensesEnabled) {
            passedChecks.push(pass('STORAGE_READINESS_CHECKED', 'Storage readiness rules were evaluated.', { storageEnabled: flags.USE_SUPABASE_STORAGE }));
        }
        if (environment !== 'PRODUCTION' || context.importsValidated === true) {
            passedChecks.push(pass('IMPORT_READINESS_CHECKED', 'Import readiness rules were evaluated.', { importsValidated: context.importsValidated }));
        }
        if (environment !== 'PRODUCTION' || context.rlsValidated === true) {
            passedChecks.push(pass('RLS_READINESS_CHECKED', 'RLS readiness rules were evaluated.', { rlsValidated: context.rlsValidated }));
        }
        passedChecks.push(pass('ENVIRONMENT_CONSISTENCY_CHECKED', 'Environment consistency rules were evaluated.', { environment }));
        passedChecks.push(pass('FALLBACK_RISK_CHECKED', 'Fallback risk rules were evaluated.', { localAuthFallback: flags.ALLOW_LOCAL_AUTH_FALLBACK }));
    }

    function readinessFrom(blockers, warnings) {
        if (blockers.length) return BLOCKED;
        if (warnings.length) return WARNING;
        return READY;
    }

    function summaryFor(environment, readiness, blockers, warnings) {
        if (readiness === BLOCKED) {
            const count = blockers.length;
            return `Platform is blocked for ${environment} due to ${count} critical blocker${count === 1 ? '' : 's'}.`;
        }
        if (readiness === WARNING) {
            const count = warnings.length;
            if (environment === 'PILOT') {
                return `Platform is pilot-ready with ${count} operational warning${count === 1 ? '' : 's'}.`;
            }
            return `Platform is ready for ${environment} deployment with ${count} operational warning${count === 1 ? '' : 's'}.`;
        }
        return `Platform is ready for ${environment} deployment.`;
    }

    function evaluateInternal(environment, flags, context, options) {
        const timestamp = new Date().toISOString();
        const normalizedEnvironment = normalizeEnvironment(environment);
        const normalizedFlags = normalizeFlags(flags);
        const normalizedContext = normalizeContext(context);
        const blockers = [];
        const warnings = [];
        const passedChecks = [];

        if (!normalizedEnvironment) {
            blockers.push(blocker(
                'INVALID_READINESS_ENVIRONMENT',
                'CRITICAL',
                'Launch readiness target must be DEVELOPMENT, PILOT, or PRODUCTION.',
                'Call evaluateLaunchReadiness with a supported environment target.',
                { received: safeString(environment, 'unknown') }
            ));
        }

        mergeFeatureFlagValidation(normalizedFlags, blockers, warnings, passedChecks, options || {});

        if (platformGovernanceService(options)) {
            passedChecks.push(pass('GOVERNANCE_SERVICE_AVAILABLE', 'Platform governance service is available.'));
        } else {
            passedChecks.push(pass('GOVERNANCE_SERVICE_OPTIONAL_ABSENT', 'Platform governance service optional dependency is absent; supplied context was used.'));
        }

        if (idempotencyService(options)) {
            passedChecks.push(pass('IDEMPOTENCY_SERVICE_AVAILABLE', 'Idempotency service is available for duplicate-operation protection.'));
        } else {
            passedChecks.push(pass('IDEMPOTENCY_SERVICE_OPTIONAL_ABSENT', 'Idempotency service optional dependency is absent; launch gate continued safely.'));
        }

        if (normalizedEnvironment === 'PRODUCTION') {
            validateProduction(normalizedFlags, normalizedContext, blockers, warnings, passedChecks);
        } else if (normalizedEnvironment === 'PILOT') {
            validatePilot(normalizedFlags, normalizedContext, blockers, warnings, passedChecks);
        } else if (normalizedEnvironment === 'DEVELOPMENT') {
            validateDevelopment(normalizedFlags, normalizedContext, blockers, warnings, passedChecks);
        }

        addCoreAreaPasses(normalizedEnvironment || 'UNKNOWN', normalizedFlags, normalizedContext, blockers, warnings, passedChecks);

        const readiness = readinessFrom(blockers, warnings);
        return {
            success: true,
            environment: normalizedEnvironment || 'UNKNOWN',
            readiness,
            blockers,
            warnings,
            passedChecks,
            timestamp,
            summary: summaryFor(normalizedEnvironment || 'UNKNOWN', readiness, blockers, warnings)
        };
    }

    function runtimeFailure(environment, err) {
        const env = normalizeEnvironment(environment) || 'UNKNOWN';
        const blockers = [blocker(
            'LAUNCH_READINESS_RUNTIME_ERROR',
            'CRITICAL',
            'Launch readiness evaluation failed safely.',
            'Review launchReadinessService runtime behavior before rollout.',
            { error: err && err.message ? err.message : safeString(err, 'unknown error') }
        )];
        return {
            success: false,
            environment: env,
            readiness: BLOCKED,
            blockers,
            warnings: [],
            passedChecks: [],
            timestamp: new Date().toISOString(),
            summary: summaryFor(env, BLOCKED, blockers, [])
        };
    }

    function evaluateLaunchReadiness(environment, flags, context) {
        try {
            return evaluateInternal(environment, flags, context, {});
        } catch (err) {
            return runtimeFailure(environment, err);
        }
    }

    function isProductionReady(flags, context) {
        try {
            return evaluateInternal('PRODUCTION', flags, context, {});
        } catch (err) {
            return runtimeFailure('PRODUCTION', err);
        }
    }

    function isPilotReady(flags, context) {
        try {
            return evaluateInternal('PILOT', flags, context, {});
        } catch (err) {
            return runtimeFailure('PILOT', err);
        }
    }

    function isDevelopmentReady(flags, context) {
        try {
            return evaluateInternal('DEVELOPMENT', flags, context, {});
        } catch (err) {
            return runtimeFailure('DEVELOPMENT', err);
        }
    }

    const LaunchReadinessService = Object.freeze({
        evaluateLaunchReadiness,
        isProductionReady,
        isPilotReady,
        isDevelopmentReady
    });

    global.LaunchReadinessService = LaunchReadinessService;

    function runSelfTest() {
        const tests = [];
        const record = (name, ok, details) => tests.push({ name, ok: !!ok, details: details || null });

        try {
            const productionBlocked = evaluateInternal(
                'PRODUCTION',
                {
                    PRODUCTION_MODE: true,
                    USE_SUPABASE_AUTH: false,
                    REQUIRE_EMAIL_VERIFIED: false,
                    ALLOW_LOCAL_AUTH_FALLBACK: true
                },
                {},
                { forceMissingDependencies: true }
            );
            record(
                'production blockers detected',
                productionBlocked.readiness === BLOCKED &&
                    productionBlocked.blockers.some(item => item.blockerCode === 'PRODUCTION_LOCAL_AUTH_FALLBACK') &&
                    productionBlocked.blockers.some(item => item.blockerCode === 'PRODUCTION_SUPABASE_AUTH_REQUIRED'),
                productionBlocked
            );

            const pilotWarning = evaluateInternal(
                'PILOT',
                { PILOT_MODE: true, ALLOW_LOCAL_AUTH_FALLBACK: true },
                {},
                { forceMissingDependencies: true }
            );
            record(
                'pilot warnings generated',
                pilotWarning.readiness === WARNING &&
                    pilotWarning.warnings.some(item => item.warningCode === 'PILOT_LOCAL_AUTH_FALLBACK'),
                pilotWarning
            );

            const readyState = evaluateInternal(
                'DEVELOPMENT',
                { DEVELOPMENT_MODE: true },
                { monitoringEnabled: true },
                { forceMissingDependencies: true }
            );
            record('ready state works', readyState.readiness === READY, readyState);

            const malformedContext = evaluateInternal(
                'PRODUCTION',
                {
                    PRODUCTION_MODE: true,
                    USE_SUPABASE_AUTH: true,
                    REQUIRE_EMAIL_VERIFIED: true
                },
                'not-context',
                { forceMissingDependencies: true }
            );
            record(
                'malformed context handled safely',
                malformedContext.readiness === BLOCKED &&
                    malformedContext.blockers.some(item => item.blockerCode === 'PRODUCTION_MONITORING_NOT_ENABLED'),
                malformedContext
            );

            const dependencyAbsence = evaluateInternal(
                'DEVELOPMENT',
                { DEVELOPMENT_MODE: true },
                {},
                { forceMissingDependencies: true }
            );
            record(
                'missing dependencies handled safely',
                dependencyAbsence.success === true &&
                    dependencyAbsence.passedChecks.some(item => item.checkCode === 'FEATURE_FLAG_LOCAL_RULES_ACTIVE') &&
                    dependencyAbsence.passedChecks.some(item => item.checkCode === 'IDEMPOTENCY_SERVICE_OPTIONAL_ABSENT'),
                dependencyAbsence
            );

            const originalFlags = { PRODUCTION_MODE: true, USE_SUPABASE_AUTH: false };
            const originalContext = { monitoringEnabled: false };
            const beforeFlags = JSON.stringify(originalFlags);
            const beforeContext = JSON.stringify(originalContext);
            evaluateLaunchReadiness('PRODUCTION', originalFlags, originalContext);
            record(
                'inputs are never mutated',
                JSON.stringify(originalFlags) === beforeFlags && JSON.stringify(originalContext) === beforeContext,
                { originalFlags, originalContext }
            );
        } catch (err) {
            record('self-test has no uncaught failure', false, err && err.message ? err.message : safeString(err, 'unknown error'));
        }

        const report = Object.freeze({
            passed: tests.every(test => test.ok),
            tests: deepFreeze(tests)
        });

        try {
            global.__ARTHHRMS_LAUNCH_READINESS_SELF_TEST__ = report;
        } catch (e) {}

        if (report.passed) safeInfo(`${PREFIX} Development self-test passed.`, report);
        else safeWarn(`${PREFIX} Development self-test failed.`, report);
    }

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
