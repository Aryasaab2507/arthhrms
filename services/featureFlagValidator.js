/**
 * featureFlagValidator.js
 * ARTHHRMS — Feature Flag Safety Validation Layer
 *
 * PURPOSE:
 * Prevents dangerous combinations of feature flags and environment modes.
 * Provides centralized deployment governance validation before enabling
 * pilot or production behaviors.
 *
 * This validator exists to stop unsafe runtime states before they activate.
 *
 * STABILITY:
 * Public APIs must remain synchronous and backward-compatible.
 * This file must never introduce async-only behavior.
 *
 * DEPENDS ON:
 * - window.DB (optional)
 * - window.PlatformGovernanceService (optional)
 *
 * @version 1.0.0
 */
(function (global) {
    'use strict';

    const PREFIX = '[FeatureFlagValidator]';

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

    if (typeof global.DB === 'undefined') {
        safeWarn(`${PREFIX} Optional dependency window.DB is unavailable. Validation will use supplied flag input only.`);
    }

    if (
        typeof global.PlatformGovernanceService === 'undefined' &&
        typeof global.platformGovernanceService === 'undefined'
    ) {
        safeWarn(`${PREFIX} Optional dependency window.PlatformGovernanceService is unavailable. Governance context is not required for validation.`);
    }

    const SUPPORTED_FLAGS = deepFreeze([
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

    const EMPTY_FLAGS = deepFreeze(SUPPORTED_FLAGS.reduce((acc, key) => {
        acc[key] = false;
        return acc;
    }, {}));

    const ENVIRONMENT_PRESETS = deepFreeze({
        DEVELOPMENT: {
            ...EMPTY_FLAGS,
            DEVELOPMENT_MODE: true,
            DEMO_MODE: true,
            ALLOW_LOCAL_AUTH_FALLBACK: true,
            REQUIRE_APP_METADATA_ROLE: false,
            REQUIRE_EMAIL_VERIFIED: false
        },
        PILOT: {
            ...EMPTY_FLAGS,
            USE_SUPABASE_AUTH: true,
            USE_SUPABASE_PASSWORD_RECOVERY: true,
            USE_SUPABASE_INVITES: true,
            USE_SUPABASE_EMPLOYEES: true,
            USE_SUPABASE_ATTENDANCE: true,
            USE_SUPABASE_LEAVE: true,
            USE_SUPABASE_IMPORTS: true,
            PILOT_MODE: true,
            ALLOW_LOCAL_AUTH_FALLBACK: true,
            REQUIRE_APP_METADATA_ROLE: true,
            REQUIRE_EMAIL_VERIFIED: true
        },
        PRODUCTION: {
            ...EMPTY_FLAGS,
            USE_SUPABASE_AUTH: true,
            USE_SUPABASE_PASSWORD_RECOVERY: true,
            USE_SUPABASE_INVITES: true,
            USE_SUPABASE_EMPLOYEES: true,
            PRODUCTION_MODE: true,
            REQUIRE_APP_METADATA_ROLE: true,
            REQUIRE_EMAIL_VERIFIED: true
        }
    });

    function FeatureFlagValidationError(rule, flags) {
        this.name = 'FeatureFlagValidationError';
        this.errorCode = rule.errorCode;
        this.message = rule.message;
        this.flags = { ...flags };
        this.affectedFlags = rule.affectedFlags.slice();
    }
    FeatureFlagValidationError.prototype = Object.create(Error.prototype);
    FeatureFlagValidationError.prototype.constructor = FeatureFlagValidationError;

    const FORBIDDEN_COMBINATIONS = deepFreeze([
        {
            errorCode: 'PRODUCTION_LOCAL_AUTH_FALLBACK',
            affectedFlags: ['PRODUCTION_MODE', 'ALLOW_LOCAL_AUTH_FALLBACK'],
            message: `${PREFIX} PRODUCTION_MODE cannot run with ALLOW_LOCAL_AUTH_FALLBACK. Operational risk: production auth bypass risk.`,
            isMatch: flags => flags.PRODUCTION_MODE && flags.ALLOW_LOCAL_AUTH_FALLBACK
        },
        {
            errorCode: 'PRODUCTION_DEMO_MODE',
            affectedFlags: ['PRODUCTION_MODE', 'DEMO_MODE'],
            message: `${PREFIX} PRODUCTION_MODE cannot run with DEMO_MODE. Operational risk: demo runtime must never coexist with production.`,
            isMatch: flags => flags.PRODUCTION_MODE && flags.DEMO_MODE
        },
        {
            errorCode: 'PRODUCTION_UNVERIFIED_SUPABASE_AUTH',
            affectedFlags: ['USE_SUPABASE_AUTH', 'REQUIRE_EMAIL_VERIFIED', 'PRODUCTION_MODE'],
            message: `${PREFIX} Supabase Auth in production requires REQUIRE_EMAIL_VERIFIED. Operational risk: unverified accounts in production.`,
            isMatch: flags => flags.USE_SUPABASE_AUTH && !flags.REQUIRE_EMAIL_VERIFIED && flags.PRODUCTION_MODE
        },
        {
            errorCode: 'PAYROLL_WITHOUT_EMPLOYEE_SOURCE',
            affectedFlags: ['USE_SUPABASE_PAYROLL', 'USE_SUPABASE_EMPLOYEES'],
            message: `${PREFIX} USE_SUPABASE_PAYROLL requires USE_SUPABASE_EMPLOYEES. Operational risk: payroll cannot operate without employee source-of-truth.`,
            isMatch: flags => flags.USE_SUPABASE_PAYROLL && !flags.USE_SUPABASE_EMPLOYEES
        },
        {
            errorCode: 'EXPENSES_WITHOUT_STORAGE',
            affectedFlags: ['USE_SUPABASE_EXPENSES', 'USE_SUPABASE_STORAGE'],
            message: `${PREFIX} USE_SUPABASE_EXPENSES requires USE_SUPABASE_STORAGE. Operational risk: expense attachments depend on storage.`,
            isMatch: flags => flags.USE_SUPABASE_EXPENSES && !flags.USE_SUPABASE_STORAGE
        },
        {
            errorCode: 'PRODUCTION_DEVELOPMENT_CONFLICT',
            affectedFlags: ['PRODUCTION_MODE', 'DEVELOPMENT_MODE'],
            message: `${PREFIX} PRODUCTION_MODE cannot run with DEVELOPMENT_MODE. Operational risk: environment conflict.`,
            isMatch: flags => flags.PRODUCTION_MODE && flags.DEVELOPMENT_MODE
        }
    ]);

    const RISKY_COMBINATIONS = deepFreeze([
        {
            warningCode: 'PILOT_LOCAL_AUTH_FALLBACK',
            severity: 'WARNING',
            affectedFlags: ['PILOT_MODE', 'ALLOW_LOCAL_AUTH_FALLBACK'],
            message: 'Pilot mode is allowing local authentication fallback.',
            recommendation: 'Use this only during short pilot validation windows, then disable fallback before production.',
            isMatch: flags => flags.PILOT_MODE && flags.ALLOW_LOCAL_AUTH_FALLBACK
        },
        {
            warningCode: 'IMPORTS_WITHOUT_EMPLOYEE_SOURCE',
            severity: 'WARNING',
            affectedFlags: ['USE_SUPABASE_IMPORTS', 'USE_SUPABASE_EMPLOYEES'],
            message: 'Supabase imports are enabled while employee source-of-truth remains local.',
            recommendation: 'Enable Supabase employee master before committing real import batches.',
            isMatch: flags => flags.USE_SUPABASE_IMPORTS && !flags.USE_SUPABASE_EMPLOYEES
        },
        {
            warningCode: 'AUTH_WITHOUT_INVITES',
            severity: 'WARNING',
            affectedFlags: ['USE_SUPABASE_AUTH', 'USE_SUPABASE_INVITES'],
            message: 'Supabase Auth is enabled without invite-based onboarding.',
            recommendation: 'Enable Supabase invites before adding real users.',
            isMatch: flags => flags.USE_SUPABASE_AUTH && !flags.USE_SUPABASE_INVITES
        },
        {
            warningCode: 'STORAGE_WITHOUT_EXPENSES',
            severity: 'INFO',
            affectedFlags: ['USE_SUPABASE_STORAGE', 'USE_SUPABASE_EXPENSES'],
            message: 'Supabase Storage is enabled while expense claims are not live.',
            recommendation: 'Confirm storage is being used for employee documents, payroll exports, or another governed module.',
            isMatch: flags => flags.USE_SUPABASE_STORAGE && !flags.USE_SUPABASE_EXPENSES
        },
        {
            warningCode: 'DEMO_WITH_SUPABASE_AUTH',
            severity: 'CRITICAL',
            affectedFlags: ['DEMO_MODE', 'USE_SUPABASE_AUTH'],
            message: 'Demo mode is active while Supabase Auth is enabled.',
            recommendation: 'Keep this limited to development test accounts and disable demo mode before pilot or production.',
            isMatch: flags => flags.DEMO_MODE && flags.USE_SUPABASE_AUTH
        }
    ]);

    function normalizeBoolean(value, fallback) {
        if (value === true || value === false) return value;
        if (value === undefined || value === null || value === '') return !!fallback;
        if (typeof value === 'number') return value !== 0;
        const normalized = String(value).trim().toLowerCase();
        if (['true', '1', 'yes', 'y', 'on', 'enabled'].includes(normalized)) return true;
        if (['false', '0', 'no', 'n', 'off', 'disabled'].includes(normalized)) return false;
        return !!fallback;
    }

    function safeString(value, fallback) {
        try {
            if (typeof value === 'symbol') return value.toString();
            return String(value);
        } catch (e) {
            return fallback;
        }
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

    function normalizeFlags(input) {
        const source = { ...(input || {}) };
        return SUPPORTED_FLAGS.reduce((acc, key) => {
            acc[key] = normalizeBoolean(source[key], false);
            return acc;
        }, {});
    }

    function invalidInputResult(flags) {
        return {
            success: false,
            fatal: false,
            errorCode: 'INVALID_FLAGS_INPUT',
            message: `${PREFIX} flags must be a plain object or undefined.`,
            flags: flags === undefined ? {} : { receivedType: Array.isArray(flags) ? 'array' : typeof flags },
            warnings: []
        };
    }

    function buildWarning(rule) {
        return {
            warningCode: rule.warningCode,
            severity: rule.severity,
            message: `${PREFIX} ${rule.message}`,
            recommendation: rule.recommendation,
            affectedFlags: rule.affectedFlags.slice()
        };
    }

    function assertNoForbidden(flags) {
        const matched = FORBIDDEN_COMBINATIONS.find(rule => {
            try {
                return rule.isMatch(flags);
            } catch (e) {
                return false;
            }
        });
        if (matched) {
            throw new FeatureFlagValidationError(matched, flags);
        }
    }

    function collectWarnings(flags) {
        return RISKY_COMBINATIONS.reduce((warnings, rule) => {
            let matched = false;
            try {
                matched = rule.isMatch(flags);
            } catch (e) {
                matched = false;
            }
            if (matched) warnings.push(buildWarning(rule));
            return warnings;
        }, []);
    }

    function validateFlagCombination(flags) {
        try {
            if (
                flags !== undefined &&
                flags !== null &&
                (typeof flags !== 'object' || Array.isArray(flags))
            ) {
                return invalidInputResult(flags);
            }

            const normalized = normalizeFlags(flags);
            assertNoForbidden(normalized);
            const warnings = collectWarnings(normalized);
            warnings.forEach(warning => safeWarn(`${PREFIX} ${warning.warningCode}: ${warning.message}`, warning));

            return {
                success: true,
                warnings,
                flags: normalized
            };
        } catch (err) {
            if (err && err.name === 'FeatureFlagValidationError') {
                return {
                    success: false,
                    fatal: true,
                    errorCode: err.errorCode,
                    message: err.message,
                    flags: err.flags || {},
                    affectedFlags: err.affectedFlags || [],
                    warnings: []
                };
            }

            return {
                success: false,
                fatal: false,
                errorCode: 'VALIDATION_RUNTIME_ERROR',
                message: `${PREFIX} Validation failed safely: ${err && err.message ? err.message : String(err)}`,
                flags: {},
                warnings: []
            };
        }
    }

    function getRecommendedFlags(environment) {
        try {
            const normalized = normalizeEnvironment(environment);
            if (!normalized || !ENVIRONMENT_PRESETS[normalized]) {
                safeWarn(`${PREFIX} Unknown environment "${safeString(environment, 'unknown')}". Returning DEVELOPMENT preset.`);
                return deepFreeze({ ...ENVIRONMENT_PRESETS.DEVELOPMENT });
            }
            return deepFreeze({ ...ENVIRONMENT_PRESETS[normalized] });
        } catch (err) {
            safeWarn(`${PREFIX} Preset generation failed safely. Returning empty development-safe flags.`, err && err.message ? err.message : String(err));
            return deepFreeze({ ...ENVIRONMENT_PRESETS.DEVELOPMENT });
        }
    }

    function modeSafety(flags, environment) {
        const validation = validateFlagCombination(flags);
        if (!validation.success) {
            return {
                ...validation,
                environment,
                safe: false
            };
        }

        const normalized = validation.flags || normalizeFlags(flags);
        const checks = {
            PRODUCTION: normalized.PRODUCTION_MODE && !normalized.PILOT_MODE && !normalized.DEVELOPMENT_MODE && !normalized.DEMO_MODE,
            PILOT: normalized.PILOT_MODE && !normalized.PRODUCTION_MODE && !normalized.DEVELOPMENT_MODE,
            DEVELOPMENT: normalized.DEVELOPMENT_MODE && !normalized.PRODUCTION_MODE && !normalized.PILOT_MODE
        };

        if (!checks[environment]) {
            return {
                success: false,
                fatal: false,
                safe: false,
                errorCode: `${environment}_MODE_NOT_SAFE`,
                message: `${PREFIX} ${environment} safety check failed because environment mode flags are inconsistent.`,
                environment,
                flags: normalized,
                warnings: validation.warnings || []
            };
        }

        return {
            ...validation,
            environment,
            safe: true
        };
    }

    function isProductionSafe(flags) {
        try {
            return modeSafety(flags, 'PRODUCTION');
        } catch (err) {
            return {
                success: false,
                fatal: false,
                safe: false,
                environment: 'PRODUCTION',
                errorCode: 'PRODUCTION_SAFETY_RUNTIME_ERROR',
                message: `${PREFIX} Production safety check failed safely: ${err && err.message ? err.message : String(err)}`,
                flags: {},
                warnings: []
            };
        }
    }

    function isPilotSafe(flags) {
        try {
            return modeSafety(flags, 'PILOT');
        } catch (err) {
            return {
                success: false,
                fatal: false,
                safe: false,
                environment: 'PILOT',
                errorCode: 'PILOT_SAFETY_RUNTIME_ERROR',
                message: `${PREFIX} Pilot safety check failed safely: ${err && err.message ? err.message : String(err)}`,
                flags: {},
                warnings: []
            };
        }
    }

    function isDevelopmentSafe(flags) {
        try {
            return modeSafety(flags, 'DEVELOPMENT');
        } catch (err) {
            return {
                success: false,
                fatal: false,
                safe: false,
                environment: 'DEVELOPMENT',
                errorCode: 'DEVELOPMENT_SAFETY_RUNTIME_ERROR',
                message: `${PREFIX} Development safety check failed safely: ${err && err.message ? err.message : String(err)}`,
                flags: {},
                warnings: []
            };
        }
    }

    const FeatureFlagValidator = Object.freeze({
        validateFlagCombination,
        getRecommendedFlags,
        isProductionSafe,
        isPilotSafe,
        isDevelopmentSafe
    });

    global.FeatureFlagValidator = FeatureFlagValidator;

    function runSelfTest() {
        const tests = [];
        const record = (name, ok, details) => tests.push({ name, ok: !!ok, details: details || null });

        try {
            const forbidden = validateFlagCombination({
                PRODUCTION_MODE: true,
                ALLOW_LOCAL_AUTH_FALLBACK: true
            });
            record('forbidden combinations blocked', forbidden.success === false && forbidden.fatal === true && forbidden.errorCode === 'PRODUCTION_LOCAL_AUTH_FALLBACK', forbidden);

            const risky = validateFlagCombination({
                PILOT_MODE: true,
                ALLOW_LOCAL_AUTH_FALLBACK: true
            });
            record('risky combinations warn', risky.success === true && risky.warnings.length === 1 && risky.warnings[0].warningCode === 'PILOT_LOCAL_AUTH_FALLBACK', risky);

            const productionPreset = getRecommendedFlags('PRODUCTION');
            const productionSafe = isProductionSafe(productionPreset);
            record('production-safe validation works', productionSafe.success === true && productionSafe.safe === true && productionPreset.REQUIRE_EMAIL_VERIFIED === true, productionSafe);

            const malformed = validateFlagCombination('PRODUCTION_MODE=true');
            record('malformed flags handled safely', malformed.success === false && malformed.errorCode === 'INVALID_FLAGS_INPUT', malformed);

            const original = {
                PRODUCTION_MODE: true,
                DEMO_MODE: true
            };
            const before = JSON.stringify(original);
            const demoBlocked = validateFlagCombination(original);
            record('dangerous demo production combination blocked', demoBlocked.success === false && demoBlocked.errorCode === 'PRODUCTION_DEMO_MODE', demoBlocked);
            record('original flag object not mutated', JSON.stringify(original) === before, original);
        } catch (err) {
            record('self-test has no uncaught failure', false, err && err.message ? err.message : String(err));
        }

        const report = Object.freeze({
            passed: tests.every(test => test.ok),
            tests: deepFreeze(tests)
        });

        try {
            global.__ARTHHRMS_FEATURE_FLAG_VALIDATOR_SELF_TEST__ = report;
        } catch (e) {}

        if (report.passed) safeInfo(`${PREFIX} Development self-test passed.`, report);
        else safeWarn(`${PREFIX} Development self-test failed.`, report);
    }

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
