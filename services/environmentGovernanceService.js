/**
 * environmentGovernanceService.js
 * ARTHHRMS — Environment Governance + Deployment Hardening
 *
 * PURPOSE:
 * Provides centralized deployment governance enforcement
 * for environment safety and Supabase deployment hardening.
 *
 * This service validates:
 * - environment consistency
 * - deployment safety
 * - Supabase configuration safety
 * - feature flag safety
 * - production activation readiness
 *
 * This service does NOT:
 * - expose secrets
 * - bypass auth
 * - mutate production policies
 * - auto-enable unsafe flags
 *
 * ARCHITECTURE RULE:
 * Deployment governance must remain isolated from business logic.
 *
 * STABILITY:
 * Public APIs must remain synchronous and backward-compatible.
 *
 * DEPENDS ON:
 * - window.FeatureFlagValidator (optional)
 * - window.LaunchReadinessService (optional)
 * - window.RLSValidationService (optional)
 * - window.WorkflowTelemetryService (optional)
 *
 * @version 1.0.0
 */
(function attachEnvironmentGovernanceService(global) {
    'use strict';

    var PREFIX = '[EnvironmentGovernanceService]';
    var DEFAULT_SOURCE = 'environmentGovernanceService';

    var ENVIRONMENTS = Object.freeze({
        DEVELOPMENT: 'DEVELOPMENT',
        STAGING: 'STAGING',
        PILOT: 'PILOT',
        PRODUCTION: 'PRODUCTION'
    });

    var SEVERITIES = Object.freeze({
        INFO: 'INFO',
        WARNING: 'WARNING',
        HIGH: 'HIGH',
        CRITICAL: 'CRITICAL'
    });

    var FLAG_KEYS = Object.freeze([
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
        'REQUIRE_EMAIL_VERIFIED',
        'ALLOW_ANONYMOUS_AUTH',
        'ENABLE_ANONYMOUS_AUTH',
        'ANONYMOUS_AUTH_ENABLED',
        'SUPABASE_ANON_AUTH_ENABLED'
    ]);

    function safeWarn(message, metadata) {
        try {
            if (global.console && typeof global.console.warn === 'function') {
                if (metadata !== undefined) {
                    global.console.warn(PREFIX + ' ' + message, sanitizeForOutput(metadata));
                } else {
                    global.console.warn(PREFIX + ' ' + message);
                }
            }
        } catch (error) {}
    }

    function safeString(value, fallback) {
        try {
            if (typeof value === 'symbol') return value.toString();
            return String(value);
        } catch (error) {
            return fallback || '';
        }
    }

    function nowIso() {
        try {
            return new Date().toISOString();
        } catch (error) {
            return String(Date.now());
        }
    }

    function normalizeBoolean(value, fallback) {
        if (value === true || value === false) return value;
        if (value === undefined || value === null || value === '') return !!fallback;
        if (typeof value === 'number') return value !== 0;
        var normalized = safeString(value, '').trim().toLowerCase();
        if (['true', '1', 'yes', 'y', 'on', 'enabled'].indexOf(normalized) !== -1) return true;
        if (['false', '0', 'no', 'n', 'off', 'disabled'].indexOf(normalized) !== -1) return false;
        return !!fallback;
    }

    function shallowClone(input) {
        var output = {};
        if (!input || typeof input !== 'object' || Array.isArray(input)) return output;
        try {
            Object.keys(input).forEach(function copyKey(key) {
                output[key] = input[key];
            });
        } catch (error) {}
        return output;
    }

    function freezePlainObject(input) {
        var output = shallowClone(input);
        Object.keys(output).forEach(function freezeNested(key) {
            if (Array.isArray(output[key])) {
                output[key] = Object.freeze(output[key].slice());
            } else if (output[key] && typeof output[key] === 'object') {
                output[key] = Object.freeze(shallowClone(output[key]));
            }
        });
        return Object.freeze(output);
    }

    function freezeList(list) {
        if (!Array.isArray(list)) return Object.freeze([]);
        return Object.freeze(list.map(function freezeItem(item) {
            if (item && typeof item === 'object') return freezePlainObject(item);
            return item;
        }));
    }

    function sanitizeForOutput(metadata) {
        var source = shallowClone(metadata);
        var sanitized = {};
        Object.keys(source).forEach(function sanitizeKey(key) {
            var lower = String(key).toLowerCase();
            if (
                lower.indexOf('key') !== -1 ||
                lower.indexOf('secret') !== -1 ||
                lower.indexOf('token') !== -1 ||
                lower.indexOf('password') !== -1
            ) {
                sanitized[key + 'Present'] = Boolean(source[key]);
                return;
            }
            if (source[key] === null || typeof source[key] === 'string' || typeof source[key] === 'number' || typeof source[key] === 'boolean') {
                sanitized[key] = source[key];
            } else if (Array.isArray(source[key])) {
                sanitized[key] = source[key].slice(0, 20);
            } else if (source[key] && typeof source[key] === 'object') {
                sanitized[key] = sanitizeForOutput(source[key]);
            }
        });
        return sanitized;
    }

    function safeSeverity(severity, fallback) {
        var normalized = safeString(severity || fallback || SEVERITIES.WARNING, SEVERITIES.WARNING)
            .trim()
            .toUpperCase();
        if (normalized === SEVERITIES.INFO) return SEVERITIES.INFO;
        if (normalized === SEVERITIES.WARNING) return SEVERITIES.WARNING;
        if (normalized === SEVERITIES.HIGH) return SEVERITIES.HIGH;
        if (normalized === SEVERITIES.CRITICAL) return SEVERITIES.CRITICAL;
        return fallback || SEVERITIES.WARNING;
    }

    function normalizeEnvironment(environment) {
        var normalized = safeString(environment || ENVIRONMENTS.DEVELOPMENT, ENVIRONMENTS.DEVELOPMENT)
            .trim()
            .replace(/[\s-]+/g, '_')
            .toUpperCase();
        if (normalized === 'DEV') return ENVIRONMENTS.DEVELOPMENT;
        if (normalized === 'STAGE') return ENVIRONMENTS.STAGING;
        if (normalized === 'STAGING_MODE') return ENVIRONMENTS.STAGING;
        if (normalized === 'PROD') return ENVIRONMENTS.PRODUCTION;
        if (ENVIRONMENTS[normalized]) return ENVIRONMENTS[normalized];
        return '';
    }

    function runtimeConfig() {
        try {
            if (global.supabaseClientService && typeof global.supabaseClientService.readConfig === 'function') {
                return shallowClone(global.supabaseClientService.readConfig() || {});
            }
        } catch (error) {}

        return shallowClone(global.ARTHHRMS_CONFIG || {});
    }

    function runtimeOrigin() {
        try {
            if (global.location && global.location.origin) {
                return safeString(global.location.origin, '');
            }
        } catch (error) {}
        return '';
    }

    function normalizeFlags(flags, config) {
        var supplied = flags && typeof flags === 'object' && !Array.isArray(flags)
            ? shallowClone(flags)
            : shallowClone((config && config.flags) || {});
        var normalized = {};
        FLAG_KEYS.forEach(function normalizeFlag(key) {
            normalized[key] = normalizeBoolean(supplied[key], false);
        });
        return normalized;
    }

    function resolveInput(environmentOrOptions, flags, context) {
        var options = {};
        if (environmentOrOptions && typeof environmentOrOptions === 'object' && !Array.isArray(environmentOrOptions)) {
            options = shallowClone(environmentOrOptions);
        } else {
            options.environment = environmentOrOptions;
            options.flags = flags;
            options.context = context;
        }

        var config = shallowClone(options.config || runtimeConfig());
        var normalizedFlags = normalizeFlags(options.flags, config);
        var ctx = shallowClone(options.context || {});
        var explicitEnvironment = options.environment || options.mode || ctx.environment || ctx.mode;
        var inferredEnvironment = explicitEnvironment;

        if (!inferredEnvironment) {
            if (normalizedFlags.PRODUCTION_MODE) inferredEnvironment = ENVIRONMENTS.PRODUCTION;
            else if (normalizedFlags.PILOT_MODE) inferredEnvironment = ENVIRONMENTS.PILOT;
            else if (normalizedFlags.DEVELOPMENT_MODE) inferredEnvironment = ENVIRONMENTS.DEVELOPMENT;
        }

        return {
            environment: normalizeEnvironment(inferredEnvironment),
            rawEnvironment: explicitEnvironment,
            flags: normalizedFlags,
            config: config,
            context: ctx,
            origin: safeString(options.origin || ctx.origin || runtimeOrigin(), ''),
            rlsContext: options.rlsContext || ctx.rlsContext || ctx.securityContext || null,
            rlsValidationResult: options.rlsValidationResult || ctx.rlsValidationResult || ctx.rlsReport || ctx.securityValidationReport || null,
            launchContext: options.launchContext || ctx.launchContext || ctx.readinessContext || ctx
        };
    }

    function safeFailure(code, severity, message, metadata) {
        return Object.freeze({
            failureCode: safeString(code || 'ENVIRONMENT_GOVERNANCE_FAILURE', 'ENVIRONMENT_GOVERNANCE_FAILURE'),
            severity: safeSeverity(severity, SEVERITIES.HIGH),
            message: safeString(message || 'Environment governance validation failure.', 'Environment governance validation failure.'),
            metadata: freezePlainObject(sanitizeForOutput(metadata || {}))
        });
    }

    function safeWarning(code, severity, message, recommendation, metadata) {
        return Object.freeze({
            warningCode: safeString(code || 'ENVIRONMENT_GOVERNANCE_WARNING', 'ENVIRONMENT_GOVERNANCE_WARNING'),
            severity: safeSeverity(severity, SEVERITIES.WARNING),
            message: safeString(message || 'Environment governance warning.', 'Environment governance warning.'),
            recommendation: safeString(recommendation || 'Review deployment governance before activation.', 'Review deployment governance before activation.'),
            metadata: freezePlainObject(sanitizeForOutput(metadata || {}))
        });
    }

    function safeRecommendation(code, message, metadata) {
        return Object.freeze({
            recommendationCode: safeString(code || 'ENVIRONMENT_GOVERNANCE_RECOMMENDATION', 'ENVIRONMENT_GOVERNANCE_RECOMMENDATION'),
            message: safeString(message || 'Review deployment governance before activation.', 'Review deployment governance before activation.'),
            metadata: freezePlainObject(sanitizeForOutput(metadata || {}))
        });
    }

    function normalizeGovernanceResult(environment, passed, warnings, failures, recommendations, metadata, successOverride) {
        var safeWarnings = Array.isArray(warnings) ? warnings.slice() : [];
        var safeFailures = Array.isArray(failures) ? failures.slice() : [];
        var safeRecommendations = Array.isArray(recommendations) ? recommendations.slice() : [];
        return freezeGovernanceOutput({
            success: successOverride === false ? false : true,
            environment: environment || 'UNKNOWN',
            passed: Boolean(passed) && safeFailures.length === 0,
            warnings: safeWarnings,
            failures: safeFailures,
            recommendations: safeRecommendations,
            timestamp: nowIso(),
            metadata: sanitizeForOutput(metadata || {})
        });
    }

    function freezeGovernanceOutput(output) {
        var normalized = shallowClone(output);
        normalized.warnings = freezeList(normalized.warnings);
        normalized.failures = freezeList(normalized.failures);
        normalized.recommendations = freezeList(normalized.recommendations);
        if (normalized.metadata && typeof normalized.metadata === 'object') {
            normalized.metadata = freezePlainObject(normalized.metadata);
        }
        if (Array.isArray(normalized.sections)) {
            normalized.sections = Object.freeze(normalized.sections.slice());
        }
        return Object.freeze(normalized);
    }

    function isLocalhostOrigin(origin) {
        var normalized = safeString(origin, '').trim().toLowerCase();
        return normalized.indexOf('localhost') !== -1 ||
            normalized.indexOf('127.0.0.1') !== -1 ||
            normalized.indexOf('::1') !== -1 ||
            normalized.indexOf('file://') === 0;
    }

    function parseUrl(url) {
        var raw = safeString(url || '', '').trim();
        if (!raw) return { valid: false, hostname: '', protocol: '', reason: 'missing' };
        try {
            var parsed = new URL(raw);
            return {
                valid: parsed.protocol === 'https:' || parsed.protocol === 'http:',
                hostname: parsed.hostname || '',
                protocol: parsed.protocol || '',
                reason: parsed.protocol === 'https:' || parsed.protocol === 'http:' ? '' : 'unsupported_protocol'
            };
        } catch (error) {
            return { valid: false, hostname: '', protocol: '', reason: 'malformed' };
        }
    }

    function hostnameSuggestsEnvironment(hostname) {
        var normalized = safeString(hostname, '').toLowerCase();
        if (!normalized) return '';
        if (normalized.indexOf('localhost') !== -1 || normalized.indexOf('127.0.0.1') !== -1) return ENVIRONMENTS.DEVELOPMENT;
        if (normalized.indexOf('staging') !== -1 || normalized.indexOf('stage') !== -1) return ENVIRONMENTS.STAGING;
        if (normalized.indexOf('pilot') !== -1 || normalized.indexOf('sandbox') !== -1 || normalized.indexOf('test') !== -1) return ENVIRONMENTS.PILOT;
        if (normalized.indexOf('prod') !== -1 || normalized.indexOf('production') !== -1) return ENVIRONMENTS.PRODUCTION;
        return '';
    }

    function emitTelemetry(eventType, result) {
        try {
            if (!global.WorkflowTelemetryService || typeof global.WorkflowTelemetryService.emitTelemetry !== 'function') {
                return false;
            }
            global.WorkflowTelemetryService.emitTelemetry('DEPLOYMENT', eventType, {
                source: DEFAULT_SOURCE,
                severity: result && result.passed ? SEVERITIES.INFO : SEVERITIES.WARNING,
                status: result && result.passed ? 'PASSED' : 'NEEDS_REVIEW',
                metadata: {
                    environment: result && result.environment,
                    failureCount: result && result.failures ? result.failures.length : 0,
                    warningCount: result && result.warnings ? result.warnings.length : 0
                }
            });
            return true;
        } catch (error) {
            safeWarn('Telemetry forwarding failed during environment governance validation.', {
                eventType: eventType,
                error: error && error.message
            });
            return false;
        }
    }

    function addSupabaseSafetyChecks(resolved, warnings, failures, recommendations) {
        var environment = resolved.environment;
        var flags = resolved.flags;
        var config = resolved.config || {};
        var supabaseUrl = safeString(config.SUPABASE_URL || config.supabaseUrl || config.url || '', '');
        var anonKeyPresent = Boolean(config.SUPABASE_ANON_KEY || config.supabaseAnonKey || config.anonKey);
        var parsed = parseUrl(supabaseUrl);
        var hostnameEnvironment = hostnameSuggestsEnvironment(parsed.hostname);
        var supabaseRequested = flags.USE_SUPABASE_AUTH ||
            flags.USE_SUPABASE_EMPLOYEES ||
            flags.USE_SUPABASE_ATTENDANCE ||
            flags.USE_SUPABASE_LEAVE ||
            flags.USE_SUPABASE_EXPENSES ||
            flags.USE_SUPABASE_PAYROLL ||
            flags.USE_SUPABASE_IMPORTS ||
            flags.USE_SUPABASE_STORAGE ||
            flags.USE_SUPABASE_INVITES ||
            environment === ENVIRONMENTS.PRODUCTION ||
            environment === ENVIRONMENTS.PILOT ||
            environment === ENVIRONMENTS.STAGING;

        if (!parsed.valid) {
            var severity = environment === ENVIRONMENTS.PRODUCTION ? SEVERITIES.HIGH : SEVERITIES.WARNING;
            warnings.push(safeWarning(
                'SUPABASE_URL_INVALID_OR_MISSING',
                severity,
                'Supabase URL is missing or malformed for the selected environment.',
                'Configure a valid Supabase project URL before enabling live modules.',
                { environment: environment, reason: parsed.reason, supabaseRequested: supabaseRequested }
            ));
            if (environment === ENVIRONMENTS.PRODUCTION && supabaseRequested) {
                failures.push(safeFailure(
                    'PRODUCTION_SUPABASE_URL_MISSING',
                    SEVERITIES.HIGH,
                    'Production deployment requires a valid Supabase URL before activation.',
                    { environment: environment }
                ));
            }
        }

        if (parsed.valid && parsed.protocol !== 'https:' && environment === ENVIRONMENTS.PRODUCTION) {
            failures.push(safeFailure(
                'PRODUCTION_SUPABASE_URL_NOT_HTTPS',
                SEVERITIES.CRITICAL,
                'Production Supabase URL must use HTTPS.',
                { environment: environment, protocol: parsed.protocol }
            ));
        }

        if (supabaseRequested && !anonKeyPresent) {
            var missingKeySeverity = environment === ENVIRONMENTS.PRODUCTION ? SEVERITIES.HIGH : SEVERITIES.WARNING;
            warnings.push(safeWarning(
                'SUPABASE_PUBLIC_KEY_MISSING',
                missingKeySeverity,
                'Supabase public browser key is missing for a Supabase-enabled deployment.',
                'Provide the public browser key through governed runtime config; never expose private keys.',
                { environment: environment, publicKeyPresent: false }
            ));
            if (environment === ENVIRONMENTS.PRODUCTION) {
                failures.push(safeFailure(
                    'PRODUCTION_SUPABASE_PUBLIC_KEY_MISSING',
                    SEVERITIES.HIGH,
                    'Production deployment requires Supabase public browser configuration before activation.',
                    { environment: environment, publicKeyPresent: false }
                ));
            }
        }

        if (environment === ENVIRONMENTS.PRODUCTION && isLocalhostOrigin(resolved.origin)) {
            failures.push(safeFailure(
                'PRODUCTION_LOCALHOST_ORIGIN',
                SEVERITIES.CRITICAL,
                'Production deployment is running from a localhost or file origin.',
                { environment: environment, origin: resolved.origin }
            ));
            recommendations.push(safeRecommendation(
                'DEPLOY_PRODUCTION_ON_HOSTED_ORIGIN',
                'Use a governed hosted origin for production activation.',
                { environment: environment }
            ));
        }

        if (parsed.valid && hostnameEnvironment) {
            if (environment === ENVIRONMENTS.PRODUCTION && hostnameEnvironment !== ENVIRONMENTS.PRODUCTION) {
                failures.push(safeFailure(
                    'SUPABASE_URL_ENVIRONMENT_MISMATCH',
                    SEVERITIES.HIGH,
                    'Production environment appears to reference a non-production Supabase project URL.',
                    { environment: environment, detectedUrlEnvironment: hostnameEnvironment }
                ));
            }

            if ((environment === ENVIRONMENTS.STAGING || environment === ENVIRONMENTS.PILOT) && hostnameEnvironment === ENVIRONMENTS.PRODUCTION) {
                failures.push(safeFailure(
                    'SUPABASE_URL_ENVIRONMENT_MISMATCH',
                    SEVERITIES.HIGH,
                    environment + ' environment appears to reference a production Supabase project URL.',
                    { environment: environment, detectedUrlEnvironment: hostnameEnvironment }
                ));
            }
        }

        if (parsed.valid && parsed.hostname && parsed.hostname.indexOf('supabase.co') === -1) {
            warnings.push(safeWarning(
                'SUPABASE_CUSTOM_DOMAIN_REVIEW',
                SEVERITIES.INFO,
                'Supabase URL does not use the default supabase.co hostname.',
                'Confirm custom Supabase domains are mapped to the intended environment.',
                { environment: environment, customDomain: true }
            ));
        }
    }

    function addEnvironmentFlagChecks(resolved, warnings, failures, recommendations) {
        var environment = resolved.environment;
        var flags = resolved.flags;

        if (!environment) {
            failures.push(safeFailure(
                'UNKNOWN_ENVIRONMENT_MODE',
                SEVERITIES.HIGH,
                'Environment mode is not recognized.',
                { received: resolved.rawEnvironment || '' }
            ));
            recommendations.push(safeRecommendation(
                'USE_SUPPORTED_ENVIRONMENT',
                'Use DEVELOPMENT, STAGING, PILOT, or PRODUCTION as the deployment target.'
            ));
            return;
        }

        if (environment === ENVIRONMENTS.PRODUCTION && flags.ALLOW_LOCAL_AUTH_FALLBACK) {
            failures.push(safeFailure(
                'PRODUCTION_LOCAL_AUTH_FALLBACK',
                SEVERITIES.CRITICAL,
                'Production cannot run with local authentication fallback enabled.',
                { affectedFlags: ['PRODUCTION_MODE', 'ALLOW_LOCAL_AUTH_FALLBACK'] }
            ));
        }

        if (environment === ENVIRONMENTS.PRODUCTION && !flags.USE_SUPABASE_AUTH) {
            failures.push(safeFailure(
                'PRODUCTION_SUPABASE_AUTH_REQUIRED',
                SEVERITIES.CRITICAL,
                'Production requires Supabase Auth to be enabled.',
                { affectedFlags: ['PRODUCTION_MODE', 'USE_SUPABASE_AUTH'] }
            ));
        }

        if (environment === ENVIRONMENTS.PRODUCTION && flags.DEMO_MODE) {
            failures.push(safeFailure(
                'PRODUCTION_DEMO_MODE',
                SEVERITIES.CRITICAL,
                'Production cannot run with demo mode enabled.',
                { affectedFlags: ['PRODUCTION_MODE', 'DEMO_MODE'] }
            ));
        }

        if (environment === ENVIRONMENTS.PRODUCTION && flags.DEVELOPMENT_MODE) {
            failures.push(safeFailure(
                'PRODUCTION_DEVELOPMENT_MODE',
                SEVERITIES.CRITICAL,
                'Production cannot run with development mode enabled.',
                { affectedFlags: ['PRODUCTION_MODE', 'DEVELOPMENT_MODE'] }
            ));
        }

        if (environment === ENVIRONMENTS.PRODUCTION && flags.REQUIRE_EMAIL_VERIFIED !== true) {
            failures.push(safeFailure(
                'PRODUCTION_EMAIL_VERIFICATION_REQUIRED',
                SEVERITIES.HIGH,
                'Production requires verified email enforcement.',
                { affectedFlags: ['REQUIRE_EMAIL_VERIFIED'] }
            ));
        }

        if (
            flags.ALLOW_ANONYMOUS_AUTH ||
            flags.ENABLE_ANONYMOUS_AUTH ||
            flags.ANONYMOUS_AUTH_ENABLED ||
            flags.SUPABASE_ANON_AUTH_ENABLED
        ) {
            failures.push(safeFailure(
                'ANONYMOUS_AUTH_ENABLED_UNEXPECTEDLY',
                environment === ENVIRONMENTS.PRODUCTION ? SEVERITIES.HIGH : SEVERITIES.HIGH,
                'Anonymous auth is enabled unexpectedly for a governed deployment state.',
                { environment: environment }
            ));
        }

        if (environment === ENVIRONMENTS.STAGING && flags.PRODUCTION_MODE) {
            failures.push(safeFailure(
                'STAGING_PRODUCTION_FLAG_CONFLICT',
                SEVERITIES.HIGH,
                'Staging environment cannot run with PRODUCTION_MODE enabled.',
                { affectedFlags: ['PRODUCTION_MODE'] }
            ));
        }

        if (environment === ENVIRONMENTS.PILOT && flags.DEVELOPMENT_MODE) {
            warnings.push(safeWarning(
                'PILOT_DEVELOPMENT_FLAG_PRESENT',
                SEVERITIES.WARNING,
                'Pilot environment has DEVELOPMENT_MODE enabled.',
                'Remove development flags before inviting real pilot users.',
                { affectedFlags: ['PILOT_MODE', 'DEVELOPMENT_MODE'] }
            ));
        }
    }

    function mergeFeatureFlagValidation(resolved, warnings, failures, recommendations) {
        var validator = global.FeatureFlagValidator;
        if (!validator || typeof validator.validateFlagCombination !== 'function') {
            warnings.push(safeWarning(
                'FEATURE_FLAG_VALIDATOR_UNAVAILABLE',
                SEVERITIES.WARNING,
                'FeatureFlagValidator is unavailable; local governance rules were applied.',
                'Load FeatureFlagValidator before EnvironmentGovernanceService for full feature flag checks.'
            ));
            return;
        }

        try {
            var result = validator.validateFlagCombination(shallowClone(resolved.flags));
            if (result && result.success === false) {
                failures.push(safeFailure(
                    result.errorCode || 'FEATURE_FLAG_VALIDATION_FAILED',
                    result.fatal ? SEVERITIES.HIGH : SEVERITIES.HIGH,
                    result.message || 'Feature flag validator reported an unsafe deployment combination.',
                    { affectedFlags: result.affectedFlags || [], source: 'FeatureFlagValidator' }
                ));
                recommendations.push(safeRecommendation(
                    'RESOLVE_FEATURE_FLAG_RISK',
                    'Resolve unsafe feature flag combinations before deployment activation.',
                    { source: 'FeatureFlagValidator' }
                ));
            }

            (result && result.warnings ? result.warnings : []).forEach(function mergeWarning(item) {
                warnings.push(safeWarning(
                    item.warningCode || 'FEATURE_FLAG_WARNING',
                    safeSeverity(item.severity, SEVERITIES.WARNING),
                    item.message || 'Feature flag validator reported a warning.',
                    item.recommendation || 'Review feature flag configuration before rollout.',
                    { affectedFlags: item.affectedFlags || [], source: 'FeatureFlagValidator' }
                ));
            });
        } catch (error) {
            failures.push(safeFailure(
                'FEATURE_FLAG_VALIDATOR_RUNTIME_ERROR',
                SEVERITIES.HIGH,
                'Feature flag validation failed safely during environment governance.',
                { error: error && error.message, source: 'FeatureFlagValidator' }
            ));
        }
    }

    function hasRlsEvidence(resolved) {
        var context = resolved.context || {};
        return context.rlsValidated === true ||
            Boolean(resolved.rlsValidationResult) ||
            Boolean(resolved.rlsContext) ||
            Array.isArray(context.tenantIsolationTests) ||
            Array.isArray(context.policyCoverage) ||
            Boolean(context.roleAccessTests);
    }

    function isCrossTenantFailure(failure) {
        var text = [
            failure && failure.failureCode,
            failure && failure.message,
            failure && failure.metadata && failure.metadata.validationType
        ].join(' ').toUpperCase();
        return text.indexOf('CROSS_TENANT') !== -1 || text.indexOf('TENANT LEAK') !== -1 || text.indexOf('VISIBILITY LEAK') !== -1;
    }

    function mergeRlsValidation(resolved, warnings, failures, recommendations) {
        var environment = resolved.environment;
        var rlsResult = resolved.rlsValidationResult;

        if (!rlsResult && resolved.rlsContext && global.RLSValidationService && typeof global.RLSValidationService.generateSecurityValidationReport === 'function') {
            try {
                rlsResult = global.RLSValidationService.generateSecurityValidationReport(resolved.rlsContext);
            } catch (error) {
                failures.push(safeFailure(
                    'RLS_VALIDATION_RUNTIME_ERROR',
                    SEVERITIES.HIGH,
                    'RLS validation integration failed safely during deployment governance.',
                    { error: error && error.message }
                ));
            }
        }

        if (!rlsResult && !hasRlsEvidence(resolved)) {
            failures.push(safeFailure(
                'RLS_VALIDATION_MISSING',
                SEVERITIES.HIGH,
                'RLS validation evidence is missing for deployment governance.',
                { environment: environment }
            ));
            recommendations.push(safeRecommendation(
                'RUN_RLS_STAGING_VALIDATION',
                'Run RLS staging validation and attach the validation report before pilot or production activation.',
                { environment: environment }
            ));
            return;
        }

        if (!rlsResult && resolved.context && resolved.context.rlsValidated === true) {
            return;
        }

        if (!rlsResult) return;

        (rlsResult.warnings || []).forEach(function mergeRlsWarning(item) {
            warnings.push(safeWarning(
                item.warningCode || item.code || 'RLS_VALIDATION_WARNING',
                safeSeverity(item.severity, SEVERITIES.WARNING),
                item.message || 'RLS validation returned a warning.',
                'Review RLS validation warnings before deployment activation.',
                { source: 'RLSValidationService' }
            ));
        });

        (rlsResult.failures || []).forEach(function mergeRlsFailure(item) {
            failures.push(safeFailure(
                item.failureCode || 'RLS_VALIDATION_FAILURE',
                isCrossTenantFailure(item) ? SEVERITIES.CRITICAL : safeSeverity(item.severity, SEVERITIES.HIGH),
                item.message || 'RLS validation returned a deployment blocker.',
                { source: 'RLSValidationService' }
            ));
        });

        if (rlsResult.passed !== true) {
            recommendations.push(safeRecommendation(
                'RESOLVE_RLS_VALIDATION_FAILURES',
                'Resolve RLS validation failures before production deployment activation.',
                { source: 'RLSValidationService' }
            ));
        }
    }

    function launchEnvironment(environment) {
        if (environment === ENVIRONMENTS.STAGING) return ENVIRONMENTS.PILOT;
        return environment;
    }

    function mergeLaunchReadiness(resolved, warnings, failures, recommendations) {
        var readiness = global.LaunchReadinessService;
        if (!readiness || typeof readiness.evaluateLaunchReadiness !== 'function') {
            warnings.push(safeWarning(
                'LAUNCH_READINESS_UNAVAILABLE',
                SEVERITIES.WARNING,
                'LaunchReadinessService is unavailable; environment governance local rules were applied.',
                'Load LaunchReadinessService before final deployment readiness checks.'
            ));
            return;
        }

        try {
            var context = shallowClone(resolved.launchContext || {});
            context.rlsValidated = context.rlsValidated === true || (resolved.rlsValidationResult && resolved.rlsValidationResult.passed === true);
            var result = readiness.evaluateLaunchReadiness(launchEnvironment(resolved.environment), shallowClone(resolved.flags), context);

            (result.blockers || []).forEach(function mergeBlocker(blocker) {
                failures.push(safeFailure(
                    blocker.blockerCode || 'LAUNCH_READINESS_BLOCKER',
                    safeSeverity(blocker.severity, SEVERITIES.HIGH),
                    blocker.message || 'Launch readiness reported a deployment blocker.',
                    { source: 'LaunchReadinessService' }
                ));
            });

            (result.warnings || []).forEach(function mergeReadinessWarning(item) {
                warnings.push(safeWarning(
                    item.warningCode || 'LAUNCH_READINESS_WARNING',
                    safeSeverity(item.severity, SEVERITIES.WARNING),
                    item.message || 'Launch readiness reported a deployment warning.',
                    item.recommendation || 'Review launch readiness warning before activation.',
                    { source: 'LaunchReadinessService' }
                ));
            });
        } catch (error) {
            failures.push(safeFailure(
                'LAUNCH_READINESS_RUNTIME_ERROR',
                SEVERITIES.HIGH,
                'Launch readiness integration failed safely during deployment governance.',
                { error: error && error.message }
            ));
        }
    }

    function addInviteFlowCheck(resolved, warnings) {
        var context = resolved.context || {};
        if (resolved.environment === ENVIRONMENTS.PRODUCTION && context.inviteFlowValidated !== true) {
            warnings.push(safeWarning(
                'INVITE_FLOW_VALIDATION_MISSING',
                SEVERITIES.WARNING,
                'Invite-flow validation has not been marked complete.',
                'Validate invite delivery, callback activation, and role linking before production activation.',
                { environment: resolved.environment }
            ));
        }
    }

    function validateEnvironment(environmentOrOptions, flags, context) {
        try {
            var resolved = resolveInput(environmentOrOptions, flags, context);
            var warnings = [];
            var failures = [];
            var recommendations = [
                safeRecommendation(
                    'REVIEW_ENVIRONMENT_GOVERNANCE',
                    'Review environment, Supabase, feature flag, RLS, and launch readiness evidence before activation.',
                    { environment: resolved.environment || 'UNKNOWN' }
                )
            ];

            addEnvironmentFlagChecks(resolved, warnings, failures, recommendations);
            addSupabaseSafetyChecks(resolved, warnings, failures, recommendations);
            mergeFeatureFlagValidation(resolved, warnings, failures, recommendations);
            mergeRlsValidation(resolved, warnings, failures, recommendations);
            addInviteFlowCheck(resolved, warnings);

            var result = normalizeGovernanceResult(
                resolved.environment || 'UNKNOWN',
                failures.length === 0,
                warnings,
                failures,
                recommendations,
                {
                    origin: resolved.origin,
                    supabaseConfigured: Boolean(resolved.config && resolved.config.SUPABASE_URL) && Boolean(resolved.config && resolved.config.SUPABASE_ANON_KEY),
                    flagCount: FLAG_KEYS.length
                }
            );
            emitTelemetry('ENVIRONMENT_GOVERNANCE_VALIDATED', result);
            return result;
        } catch (error) {
            var failed = normalizeGovernanceResult(
                'UNKNOWN',
                false,
                [safeWarning('ENVIRONMENT_VALIDATION_RECOVERED', SEVERITIES.WARNING, 'Environment validation recovered from an internal error.', 'Review supplied governance context and retry.', { error: error && error.message })],
                [safeFailure('ENVIRONMENT_VALIDATION_RUNTIME_ERROR', SEVERITIES.HIGH, 'Environment validation could not complete safely.')],
                [safeRecommendation('RETRY_ENVIRONMENT_VALIDATION', 'Review deployment governance inputs and retry validation.')],
                {},
                false
            );
            emitTelemetry('ENVIRONMENT_GOVERNANCE_VALIDATION_ERROR', failed);
            return failed;
        }
    }

    function validateDeploymentSafety(environmentOrOptions, flags, context) {
        try {
            var resolved = resolveInput(environmentOrOptions, flags, context);
            var warnings = [];
            var failures = [];
            var recommendations = [
                safeRecommendation(
                    'VERIFY_DEPLOYMENT_SAFETY',
                    'Confirm deployment safety checks before enabling pilot or production activation.',
                    { environment: resolved.environment || 'UNKNOWN' }
                )
            ];

            addEnvironmentFlagChecks(resolved, warnings, failures, recommendations);
            mergeFeatureFlagValidation(resolved, warnings, failures, recommendations);
            mergeRlsValidation(resolved, warnings, failures, recommendations);
            mergeLaunchReadiness(resolved, warnings, failures, recommendations);
            addInviteFlowCheck(resolved, warnings);

            var result = normalizeGovernanceResult(
                resolved.environment || 'UNKNOWN',
                failures.length === 0,
                warnings,
                failures,
                recommendations,
                { deploymentSafetyChecked: true }
            );
            emitTelemetry('DEPLOYMENT_SAFETY_VALIDATED', result);
            return result;
        } catch (error) {
            var failed = normalizeGovernanceResult(
                'UNKNOWN',
                false,
                [safeWarning('DEPLOYMENT_SAFETY_RECOVERED', SEVERITIES.WARNING, 'Deployment safety validation recovered from an internal error.', 'Review supplied governance context and retry.', { error: error && error.message })],
                [safeFailure('DEPLOYMENT_SAFETY_RUNTIME_ERROR', SEVERITIES.HIGH, 'Deployment safety validation could not complete safely.')],
                [safeRecommendation('RETRY_DEPLOYMENT_SAFETY_VALIDATION', 'Review deployment governance inputs and retry deployment safety validation.')],
                {},
                false
            );
            emitTelemetry('DEPLOYMENT_SAFETY_VALIDATION_ERROR', failed);
            return failed;
        }
    }

    function generateDeploymentGovernanceReport(environmentOrOptions, flags, context) {
        try {
            var resolved = resolveInput(environmentOrOptions, flags, context);
            var environmentResult = validateEnvironment({
                environment: resolved.environment,
                flags: resolved.flags,
                context: resolved.context,
                config: resolved.config,
                origin: resolved.origin,
                rlsContext: resolved.rlsContext,
                rlsValidationResult: resolved.rlsValidationResult,
                launchContext: resolved.launchContext
            });
            var deploymentResult = validateDeploymentSafety({
                environment: resolved.environment,
                flags: resolved.flags,
                context: resolved.context,
                config: resolved.config,
                origin: resolved.origin,
                rlsContext: resolved.rlsContext,
                rlsValidationResult: resolved.rlsValidationResult,
                launchContext: resolved.launchContext
            });
            var warnings = [].concat(environmentResult.warnings || [], deploymentResult.warnings || []);
            var failures = [].concat(environmentResult.failures || [], deploymentResult.failures || []);
            var recommendations = [].concat(environmentResult.recommendations || [], deploymentResult.recommendations || []);
            var report = normalizeGovernanceResult(
                resolved.environment || 'UNKNOWN',
                failures.length === 0,
                warnings,
                failures,
                recommendations,
                {
                    environmentValidationPassed: environmentResult.passed === true,
                    deploymentSafetyPassed: deploymentResult.passed === true
                }
            );
            var output = shallowClone(report);
            output.sections = Object.freeze([environmentResult, deploymentResult]);
            var frozen = freezeGovernanceOutput(output);
            emitTelemetry('DEPLOYMENT_GOVERNANCE_REPORT_GENERATED', frozen);
            return frozen;
        } catch (error) {
            var failed = normalizeGovernanceResult(
                'UNKNOWN',
                false,
                [safeWarning('DEPLOYMENT_GOVERNANCE_REPORT_RECOVERED', SEVERITIES.WARNING, 'Deployment governance report recovered from an internal error.', 'Review supplied governance context and retry.', { error: error && error.message })],
                [safeFailure('DEPLOYMENT_GOVERNANCE_REPORT_RUNTIME_ERROR', SEVERITIES.HIGH, 'Deployment governance report could not complete safely.')],
                [safeRecommendation('RETRY_DEPLOYMENT_GOVERNANCE_REPORT', 'Review deployment governance inputs and retry report generation.')],
                {},
                false
            );
            emitTelemetry('DEPLOYMENT_GOVERNANCE_REPORT_ERROR', failed);
            return failed;
        }
    }

    if (!global.FeatureFlagValidator) {
        safeWarn('Optional FeatureFlagValidator dependency not detected. Local governance checks remain active.');
    }

    if (!global.LaunchReadinessService) {
        safeWarn('Optional LaunchReadinessService dependency not detected. Deployment safety will use local governance checks.');
    }

    if (!global.RLSValidationService) {
        safeWarn('Optional RLSValidationService dependency not detected. Supply RLS validation evidence explicitly.');
    }

    if (!global.WorkflowTelemetryService) {
        safeWarn('Optional WorkflowTelemetryService dependency not detected. Governance telemetry is disabled.');
    }

    var EnvironmentGovernanceService = Object.freeze({
        validateEnvironment: validateEnvironment,
        validateDeploymentSafety: validateDeploymentSafety,
        generateDeploymentGovernanceReport: generateDeploymentGovernanceReport
    });

    global.EnvironmentGovernanceService = EnvironmentGovernanceService;

    if (global.__ARTHHRMS_DEV__) {
        (function runSelfTest() {
            var originalTelemetry = global.WorkflowTelemetryService;
            var originalRls = global.RLSValidationService;
            var results = [];

            function record(name, passed) {
                results.push(Object.freeze({ name: name, passed: Boolean(passed) }));
            }

            var safeContext = {
                rlsValidated: true,
                inviteFlowValidated: true,
                monitoringEnabled: true,
                importsValidated: true,
                payrollVerified: true,
                storageVerified: true,
                expenseUploadsVerified: true,
                governanceReviewed: true
            };
            var safeConfig = {
                SUPABASE_URL: 'https://prod-company.supabase.co',
                SUPABASE_ANON_KEY: 'public-browser-key'
            };
            var productionFlags = {
                PRODUCTION_MODE: true,
                USE_SUPABASE_AUTH: true,
                REQUIRE_EMAIL_VERIFIED: true,
                USE_SUPABASE_EMPLOYEES: true,
                USE_SUPABASE_INVITES: true,
                USE_SUPABASE_STORAGE: true
            };

            var localhostResult = validateEnvironment({
                environment: 'PRODUCTION',
                flags: productionFlags,
                config: safeConfig,
                context: safeContext,
                origin: 'http://localhost:5173'
            });
            record(
                'localhost production blocked',
                localhostResult.passed === false &&
                    localhostResult.failures.some(function hasLocalhostFailure(item) {
                        return item.failureCode === 'PRODUCTION_LOCALHOST_ORIGIN' && item.severity === SEVERITIES.CRITICAL;
                    })
            );

            var unsafeFlagsResult = validateEnvironment({
                environment: 'PRODUCTION',
                flags: Object.assign({}, productionFlags, { ALLOW_LOCAL_AUTH_FALLBACK: true }),
                config: safeConfig,
                context: safeContext,
                origin: 'https://app.company.com'
            });
            record(
                'unsafe production flags blocked',
                unsafeFlagsResult.failures.some(function hasFallbackFailure(item) {
                    return item.failureCode === 'PRODUCTION_LOCAL_AUTH_FALLBACK' && item.severity === SEVERITIES.CRITICAL;
                })
            );

            var malformedResult = validateEnvironment({
                environment: 'mystery',
                flags: 'not-flags',
                config: { SUPABASE_URL: 'bad-url' },
                context: null
            });
            record('malformed configs handled safely', malformedResult.success === true && malformedResult.passed === false);

            global.WorkflowTelemetryService = {
                emitTelemetry: function emitTelemetryFailure() {
                    throw new Error('self-test telemetry failure');
                }
            };
            var telemetryResult = validateEnvironment({
                environment: 'DEVELOPMENT',
                flags: { DEVELOPMENT_MODE: true },
                context: { rlsValidated: true },
                config: {},
                origin: 'http://localhost:8080'
            });
            record('telemetry failures isolated', telemetryResult.success === true);
            global.WorkflowTelemetryService = originalTelemetry;

            global.RLSValidationService = {
                generateSecurityValidationReport: function generateFailureReport() {
                    return {
                        passed: false,
                        warnings: [],
                        failures: [
                            {
                                failureCode: 'CROSS_TENANT_VISIBILITY_LEAK',
                                severity: 'HIGH',
                                message: 'Cross tenant leak detected.'
                            }
                        ],
                        recommendations: []
                    };
                }
            };
            var rlsResult = validateDeploymentSafety({
                environment: 'PRODUCTION',
                flags: productionFlags,
                config: safeConfig,
                context: safeContext,
                rlsContext: { tenantIsolationTests: [] },
                origin: 'https://app.company.com'
            });
            record(
                'RLS failures escalate correctly',
                rlsResult.failures.some(function hasCriticalRlsFailure(item) {
                    return item.failureCode === 'CROSS_TENANT_VISIBILITY_LEAK' && item.severity === SEVERITIES.CRITICAL;
                })
            );
            global.RLSValidationService = originalRls;

            record('immutable outputs enforced', Object.isFrozen(rlsResult) && Object.isFrozen(rlsResult.failures));

            try {
                global.__ARTHHRMS_ENVIRONMENT_GOVERNANCE_SELF_TEST__ = Object.freeze(results.slice());
            } catch (error) {
                safeWarn('Environment governance self-test result storage failed.', { error: error && error.message });
            }
        })();
    }
})(typeof window !== 'undefined' ? window : globalThis);
