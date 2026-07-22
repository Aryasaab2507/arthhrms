/**
 * stagingValidationService.js
 * ARTHHRMS — Supabase Staging Validation Execution Layer
 *
 * PURPOSE:
 * Provides centralized real staging validation execution for Supabase
 * deployment readiness, tenant isolation, role visibility, auth safety,
 * environment consistency, and production promotion governance.
 *
 * This service validates staging readiness ONLY.
 * It does NOT bypass RLS.
 * It does NOT expose service-role secrets.
 * It does NOT mutate production data.
 *
 * ARCHITECTURE RULE:
 * Staging validation must remain isolated from live tenant operations.
 *
 * STABILITY:
 * Public APIs must remain synchronous and backward-compatible.
 *
 * DEPENDS ON:
 * - window.RLSValidationService (optional)
 * - window.EnvironmentGovernanceService (optional)
 * - window.FeatureFlagValidator (optional)
 * - window.LaunchReadinessService (optional)
 * - window.WorkflowTelemetryService (optional)
 * - window.AuditService (optional)
 *
 * @version 1.0.0
 */
(function attachStagingValidationService(global) {
    'use strict';

    var PREFIX = '[StagingValidationService]';
    var DEFAULT_SOURCE = 'stagingValidationService';
    var MAX_FAILURES = 200;
    var telemetryForwarding = false;
    var auditForwarding = false;

    var ENVIRONMENTS = Object.freeze({
        DEVELOPMENT: 'DEVELOPMENT',
        STAGING: 'STAGING',
        PILOT: 'PILOT',
        PRODUCTION: 'PRODUCTION'
    });

    var READINESS = Object.freeze({
        READY: 'READY',
        WARNING: 'WARNING',
        BLOCKED: 'BLOCKED'
    });

    var SEVERITIES = Object.freeze({
        INFO: 'INFO',
        WARNING: 'WARNING',
        HIGH: 'HIGH',
        CRITICAL_BLOCKER: 'CRITICAL_BLOCKER'
    });

    var ROLE_VISIBILITY_ROLES = Object.freeze([
        'EMPLOYEE',
        'MANAGER',
        'HR',
        'HR_HEAD',
        'DIRECTOR',
        'SUPER_ADMIN',
        'PLATFORM_OWNER'
    ]);

    var SECRET_KEY_PATTERN = /(service[_-]?role[_-]?(key|secret)|serviceRole(Key|Secret)|private[_-]?key|secret|password|token|jwt)/i;

    function safeWarn(message, details) {
        try {
            if (global.console && typeof global.console.warn === 'function') {
                if (details !== undefined) global.console.warn(PREFIX + ' ' + message, details);
                else global.console.warn(PREFIX + ' ' + message);
            }
        } catch (error) {}
    }

    function nowIso() {
        try {
            return new Date().toISOString();
        } catch (error) {
            return String(Date.now());
        }
    }

    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function safeString(value, fallback) {
        try {
            if (value === null || value === undefined) return fallback || '';
            return String(value);
        } catch (error) {
            return fallback || '';
        }
    }

    function safeBoolean(value) {
        if (value === true || value === false) return value;
        if (typeof value === 'string') {
            var normalized = value.trim().toLowerCase();
            if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
            if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
        }
        return Boolean(value);
    }

    function cloneValue(value, depth) {
        var currentDepth = depth || 0;
        if (value === null || value === undefined) return value;
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
        if (currentDepth > 6) return safeString(value, '');
        if (Array.isArray(value)) {
            return value.slice(0, 100).map(function cloneArrayItem(item) {
                return cloneValue(item, currentDepth + 1);
            });
        }
        if (isPlainObject(value)) {
            var cloned = {};
            Object.keys(value).forEach(function cloneKey(key) {
                if (SECRET_KEY_PATTERN.test(key)) {
                    cloned[key] = '[REDACTED]';
                    return;
                }
                cloned[key] = cloneValue(value[key], currentDepth + 1);
            });
            return cloned;
        }
        return safeString(value, '');
    }

    function safeMetadata(metadata) {
        if (!isPlainObject(metadata)) return {};
        return cloneValue(metadata, 0);
    }

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.keys(value).forEach(function freezeKey(key) {
            deepFreeze(value[key]);
        });
        return Object.freeze(value);
    }

    function freezeList(list) {
        if (!Array.isArray(list)) return Object.freeze([]);
        return Object.freeze(list.slice(0, MAX_FAILURES).map(function freezeItem(item) {
            if (isPlainObject(item)) return deepFreeze(cloneValue(item, 0));
            return item;
        }));
    }

    function freezeValidationOutput(output) {
        var normalized = isPlainObject(output) ? cloneValue(output, 0) : {};
        normalized.warnings = freezeList(normalized.warnings);
        normalized.failures = freezeList(normalized.failures);
        normalized.recommendations = freezeList(normalized.recommendations);
        if (Array.isArray(normalized.sections)) normalized.sections = freezeList(normalized.sections);
        if (Array.isArray(normalized.tests)) normalized.tests = freezeList(normalized.tests);
        if (isPlainObject(normalized.summary)) normalized.summary = deepFreeze(cloneValue(normalized.summary, 0));
        if (isPlainObject(normalized.metadata)) normalized.metadata = deepFreeze(safeMetadata(normalized.metadata));
        return deepFreeze(normalized);
    }

    function normalizeEnvironment(environment) {
        var normalized = safeString(environment, '').trim().toUpperCase().replace(/[-\s]+/g, '_');
        if (normalized === 'DEV') return ENVIRONMENTS.DEVELOPMENT;
        if (normalized === 'PROD') return ENVIRONMENTS.PRODUCTION;
        if (normalized === ENVIRONMENTS.DEVELOPMENT) return ENVIRONMENTS.DEVELOPMENT;
        if (normalized === ENVIRONMENTS.STAGING) return ENVIRONMENTS.STAGING;
        if (normalized === ENVIRONMENTS.PILOT) return ENVIRONMENTS.PILOT;
        if (normalized === ENVIRONMENTS.PRODUCTION) return ENVIRONMENTS.PRODUCTION;
        return '';
    }

    function normalizeRole(role) {
        var normalized = safeString(role, '').trim().toUpperCase().replace(/[-\s]+/g, '_');
        if (normalized === 'SUPERADMIN') normalized = 'SUPER_ADMIN';
        if (normalized === 'HRHEAD') normalized = 'HR_HEAD';
        if (normalized === 'PLATFORMOWNER') normalized = 'PLATFORM_OWNER';
        return normalized;
    }

    function safeSeverity(severity, fallback) {
        var normalized = safeString(severity, fallback || SEVERITIES.HIGH).trim().toUpperCase();
        if (normalized === 'CRITICAL' || normalized === 'BLOCKER' || normalized === SEVERITIES.CRITICAL_BLOCKER) {
            return SEVERITIES.CRITICAL_BLOCKER;
        }
        if (normalized === SEVERITIES.HIGH || normalized === 'ERROR') return SEVERITIES.HIGH;
        if (normalized === SEVERITIES.WARNING || normalized === 'WARN') return SEVERITIES.WARNING;
        if (normalized === SEVERITIES.INFO) return SEVERITIES.INFO;
        return fallback || SEVERITIES.HIGH;
    }

    function normalizeValidationFailure(input, defaultCode, defaultSeverity, defaultMessage) {
        var failure = isPlainObject(input) ? input : {};
        var code = safeString(
            failure.failureCode || failure.blockerCode || failure.code || failure.warningCode || defaultCode || 'STAGING_VALIDATION_FAILURE',
            'STAGING_VALIDATION_FAILURE'
        ).trim();
        return Object.freeze({
            failureCode: code || 'STAGING_VALIDATION_FAILURE',
            severity: safeSeverity(failure.severity, defaultSeverity || SEVERITIES.HIGH),
            message: safeString(failure.message || defaultMessage || 'Staging validation failure.', 'Staging validation failure.'),
            metadata: deepFreeze(safeMetadata(failure.metadata || failure.details || {}))
        });
    }

    function safeFailure(code, severity, message, metadata) {
        return normalizeValidationFailure({
            failureCode: code,
            severity: severity,
            message: message,
            metadata: metadata || {}
        });
    }

    function safeWarning(code, severity, message, recommendation, metadata) {
        return Object.freeze({
            warningCode: safeString(code, 'STAGING_VALIDATION_WARNING'),
            severity: safeSeverity(severity, SEVERITIES.WARNING),
            message: safeString(message, 'Staging validation warning.'),
            recommendation: safeString(recommendation, 'Review staging validation evidence before deployment activation.'),
            metadata: deepFreeze(safeMetadata(metadata || {}))
        });
    }

    function safeRecommendation(code, message, metadata) {
        return Object.freeze({
            recommendationCode: safeString(code, 'STAGING_VALIDATION_RECOMMENDATION'),
            message: safeString(message, 'Review staging validation evidence before deployment activation.'),
            metadata: deepFreeze(safeMetadata(metadata || {}))
        });
    }

    function getArray(value) {
        if (Array.isArray(value)) return value.slice();
        return [];
    }

    function mergeFailures(target, source) {
        getArray(source).forEach(function addFailure(item) {
            target.push(normalizeValidationFailure(item));
        });
    }

    function mergeWarnings(target, source) {
        getArray(source).forEach(function addWarning(item) {
            if (isPlainObject(item)) {
                target.push(safeWarning(
                    item.warningCode || item.code || item.failureCode || 'STAGING_VALIDATION_WARNING',
                    item.severity,
                    item.message,
                    item.recommendation || item.recommendedAction || '',
                    item.metadata || {}
                ));
            }
        });
    }

    function mergeRecommendations(target, source) {
        getArray(source).forEach(function addRecommendation(item) {
            if (isPlainObject(item)) {
                target.push(safeRecommendation(
                    item.recommendationCode || item.code || 'STAGING_VALIDATION_RECOMMENDATION',
                    item.message || item.recommendation || '',
                    item.metadata || {}
                ));
            }
        });
    }

    function readinessFrom(failures, warnings) {
        if (getArray(failures).length > 0) return READINESS.BLOCKED;
        if (getArray(warnings).filter(function meaningfulWarning(item) {
            return safeSeverity(item && item.severity, SEVERITIES.WARNING) !== SEVERITIES.INFO;
        }).length > 0) return READINESS.WARNING;
        return READINESS.READY;
    }

    function classifyDeploymentRisk(failures, warnings) {
        var safeFailures = getArray(failures);
        var safeWarnings = getArray(warnings);
        if (safeFailures.some(function hasCritical(item) {
            return safeSeverity(item && item.severity, SEVERITIES.HIGH) === SEVERITIES.CRITICAL_BLOCKER;
        })) {
            return SEVERITIES.CRITICAL_BLOCKER;
        }
        if (safeFailures.length) return SEVERITIES.HIGH;
        if (safeWarnings.some(function hasWarning(item) {
            return safeSeverity(item && item.severity, SEVERITIES.INFO) === SEVERITIES.WARNING;
        })) {
            return SEVERITIES.WARNING;
        }
        return SEVERITIES.INFO;
    }

    function normalizeResult(validationType, passed, warnings, failures, recommendations, metadata) {
        var safeFailures = getArray(failures);
        var safeWarnings = getArray(warnings);
        var readiness = readinessFrom(safeFailures, safeWarnings);
        return freezeValidationOutput({
            success: true,
            validationType: safeString(validationType, 'STAGING_VALIDATION'),
            passed: Boolean(passed) && safeFailures.length === 0,
            readiness: readiness,
            riskLevel: classifyDeploymentRisk(safeFailures, safeWarnings),
            warnings: safeWarnings,
            failures: safeFailures,
            recommendations: getArray(recommendations),
            timestamp: nowIso(),
            metadata: safeMetadata(metadata || {})
        });
    }

    function getOptions(input, context) {
        var options = isPlainObject(input) ? cloneValue(input, 0) : {};
        if (isPlainObject(context)) {
            options.context = Object.assign({}, safeMetadata(options.context || {}), safeMetadata(context));
        }
        return options;
    }

    function getFlags(options) {
        var flags = isPlainObject(options.flags) ? cloneValue(options.flags, 0) : {};
        if (!Object.keys(flags).length && global.DB && typeof global.DB.getPlatformGovernance === 'function') {
            try {
                var governance = global.DB.getPlatformGovernance();
                var features = governance && governance.features ? governance.features : {};
                Object.keys(features).forEach(function mapFeatureFlag(key) {
                    flags[key] = features[key] && features[key].enabled === true;
                });
            } catch (error) {}
        }
        return flags;
    }

    function getOrigin(options) {
        return safeString(
            options.origin ||
                (options.context && options.context.origin) ||
                (global.location && global.location.origin) ||
                '',
            ''
        );
    }

    function getEnvironment(options) {
        return normalizeEnvironment(
            options.environment ||
                options.mode ||
                (options.context && (options.context.environment || options.context.mode)) ||
                (options.flags && options.flags.PRODUCTION_MODE ? ENVIRONMENTS.PRODUCTION : '') ||
                (options.flags && options.flags.PILOT_MODE ? ENVIRONMENTS.PILOT : '') ||
                ENVIRONMENTS.STAGING
        ) || ENVIRONMENTS.STAGING;
    }

    function sanitizeConfig(config) {
        var input = isPlainObject(config) ? config : {};
        var url = safeString(input.SUPABASE_URL || input.supabaseUrl || input.url || '', '');
        return {
            SUPABASE_URL: url,
            publicKeyPresent: Boolean(input.SUPABASE_ANON_KEY || input.supabaseAnonKey || input.anonKey || input.SUPABASE_PUBLISHABLE_KEY),
            SUPABASE_ANON_KEY: input.SUPABASE_ANON_KEY || input.supabaseAnonKey || input.anonKey || input.SUPABASE_PUBLISHABLE_KEY ? '[PUBLIC_KEY_PRESENT]' : ''
        };
    }

    function isLocalhost(origin) {
        var normalized = safeString(origin, '').toLowerCase();
        return normalized.indexOf('localhost') !== -1 ||
            normalized.indexOf('127.0.0.1') !== -1 ||
            normalized.indexOf('file:') === 0 ||
            normalized.indexOf('::1') !== -1;
    }

    function isProductionUrlMismatch(environment, config) {
        var url = safeString(config && config.SUPABASE_URL, '').toLowerCase();
        if (!url) return false;
        if (environment === ENVIRONMENTS.PRODUCTION) {
            return url.indexOf('localhost') !== -1 || url.indexOf('staging') !== -1 || url.indexOf('dev') !== -1 || url.indexOf('pilot') !== -1;
        }
        if (environment === ENVIRONMENTS.STAGING || environment === ENVIRONMENTS.PILOT) {
            return url.indexOf('prod') !== -1 || url.indexOf('production') !== -1;
        }
        return false;
    }

    function emitTelemetry(eventType, result) {
        if (telemetryForwarding) return false;
        if (!global.WorkflowTelemetryService || typeof global.WorkflowTelemetryService.emitTelemetry !== 'function') return false;
        try {
            telemetryForwarding = true;
            global.WorkflowTelemetryService.emitTelemetry('DEPLOYMENT', eventType, {
                source: DEFAULT_SOURCE,
                severity: result && result.passed ? 'INFO' : 'WARNING',
                status: result && result.passed ? 'PASSED' : 'BLOCKED',
                metadata: {
                    validationType: result && result.validationType,
                    readiness: result && result.readiness,
                    failureCount: result && result.failures ? result.failures.length : 0,
                    warningCount: result && result.warnings ? result.warnings.length : 0
                }
            });
            return true;
        } catch (error) {
            safeWarn('Telemetry forwarding failed safely.', { eventType: eventType, error: error && error.message });
            return false;
        } finally {
            telemetryForwarding = false;
        }
    }

    function auditValidation(eventType, result, options) {
        if (auditForwarding) return false;
        if (!global.AuditService || typeof global.AuditService.recordAudit !== 'function') return false;
        var environment = result && (result.environment || (result.metadata && result.metadata.environment));
        var context = isPlainObject(options && options.context) ? options.context : {};
        var skipProductionPersistence = environment === ENVIRONMENTS.PRODUCTION && context.allowProductionAuditPersistence !== true;
        try {
            auditForwarding = true;
            global.AuditService.recordAudit({
                eventType: eventType,
                actionType: eventType,
                actorRole: (context.actor && context.actor.role) || context.actorRole || 'platform_owner',
                actorId: (context.actor && context.actor.id) || context.actorId || '',
                module: 'Deployment Governance',
                source: DEFAULT_SOURCE,
                severity: result && result.passed ? 'INFO' : 'WARNING',
                message: safeString(result && result.summary, eventType),
                metadata: {
                    environment: environment || 'UNKNOWN',
                    readiness: result && result.readiness,
                    failureCount: result && result.failures ? result.failures.length : 0,
                    warningCount: result && result.warnings ? result.warnings.length : 0
                }
            }, {
                source: DEFAULT_SOURCE,
                skipPersistence: skipProductionPersistence || context.skipAuditPersistence === true
            });
            return true;
        } catch (error) {
            safeWarn('Audit forwarding failed safely.', { eventType: eventType, error: error && error.message });
            return false;
        } finally {
            auditForwarding = false;
        }
    }

    function recordMetric(eventType, result) {
        var metrics = global.OrchestrationMetricsService;
        if (!metrics || typeof metrics.recordWorkflowMetric !== 'function') return false;
        try {
            metrics.recordWorkflowMetric(eventType, {
                source: DEFAULT_SOURCE,
                validationType: result && result.validationType,
                readiness: result && result.readiness,
                status: result && result.passed ? 'PASSED' : 'BLOCKED',
                failureCount: result && result.failures ? result.failures.length : 0,
                warningCount: result && result.warnings ? result.warnings.length : 0
            });
            return true;
        } catch (error) {
            safeWarn('Metrics aggregation failed safely.', { eventType: eventType, error: error && error.message });
            return false;
        }
    }

    function invokeEnvironmentGovernance(options, warnings, failures, recommendations) {
        var service = global.EnvironmentGovernanceService;
        if (!service || typeof service.generateDeploymentGovernanceReport !== 'function') {
            warnings.push(safeWarning(
                'ENVIRONMENT_GOVERNANCE_UNAVAILABLE',
                SEVERITIES.WARNING,
                'EnvironmentGovernanceService is unavailable; local staging rules were applied.',
                'Load EnvironmentGovernanceService before staging validation for full deployment governance checks.'
            ));
            return;
        }

        try {
            var validator = typeof service.validateEnvironment === 'function'
                ? service.validateEnvironment
                : service.generateDeploymentGovernanceReport;
            var result = validator({
                environment: options.environment,
                flags: options.flags,
                context: options.context,
                config: options.config,
                origin: options.origin,
                rlsContext: options.rlsEvidence,
                rlsValidationResult: options.rlsValidationResult,
                launchContext: options.launchContext
            });
            mergeWarnings(warnings, result && result.warnings);
            mergeFailures(failures, result && result.failures);
            mergeRecommendations(recommendations, result && result.recommendations);
        } catch (error) {
            failures.push(safeFailure(
                'ENVIRONMENT_GOVERNANCE_RUNTIME_ERROR',
                SEVERITIES.HIGH,
                'Environment governance integration failed safely during staging validation.',
                { error: error && error.message }
            ));
        }
    }

    function invokeFeatureFlagValidator(options, warnings, failures, recommendations) {
        var validator = global.FeatureFlagValidator;
        if (!validator || typeof validator.validateFlagCombination !== 'function') return;
        try {
            var result = validator.validateFlagCombination(cloneValue(options.flags || {}, 0));
            if (result && result.success === false) {
                failures.push(safeFailure(
                    result.errorCode || 'FEATURE_FLAG_VALIDATION_FAILED',
                    result.fatal ? SEVERITIES.CRITICAL_BLOCKER : SEVERITIES.HIGH,
                    result.message || 'Feature flag validator reported unsafe rollout state.',
                    { affectedFlags: result.affectedFlags || [], source: 'FeatureFlagValidator' }
                ));
                recommendations.push(safeRecommendation(
                    'RESOLVE_FEATURE_FLAG_VALIDATION',
                    'Resolve unsafe feature flags before staging promotion.',
                    { source: 'FeatureFlagValidator' }
                ));
            }
            mergeWarnings(warnings, result && result.warnings);
        } catch (error) {
            failures.push(safeFailure(
                'FEATURE_FLAG_VALIDATOR_RUNTIME_ERROR',
                SEVERITIES.HIGH,
                'Feature flag validation failed safely during staging readiness.',
                { error: error && error.message }
            ));
        }
    }

    function validateEnvironmentSafety(input, context) {
        try {
            var options = getOptions(input, context);
            options.environment = getEnvironment(options);
            options.flags = getFlags(options);
            options.origin = getOrigin(options);
            options.config = sanitizeConfig(options.config || {});
            options.context = safeMetadata(options.context || {});

            var warnings = [];
            var failures = [];
            var recommendations = [
                safeRecommendation('VERIFY_STAGING_ENVIRONMENT', 'Verify Supabase URL, public browser key, auth flags, and environment mode before deployment activation.')
            ];

            if (options.environment === ENVIRONMENTS.PRODUCTION && isLocalhost(options.origin)) {
                failures.push(safeFailure(
                    'PRODUCTION_LOCALHOST_ORIGIN',
                    SEVERITIES.CRITICAL_BLOCKER,
                    'Production validation cannot pass from a localhost or file origin.',
                    { environment: options.environment, origin: options.origin }
                ));
            }

            if (options.environment === ENVIRONMENTS.PRODUCTION && safeBoolean(options.flags.ALLOW_LOCAL_AUTH_FALLBACK)) {
                failures.push(safeFailure(
                    'PRODUCTION_LOCAL_AUTH_FALLBACK',
                    SEVERITIES.CRITICAL_BLOCKER,
                    'Production cannot run with local authentication fallback enabled.',
                    { affectedFlags: ['PRODUCTION_MODE', 'ALLOW_LOCAL_AUTH_FALLBACK'] }
                ));
            }

            if (options.environment === ENVIRONMENTS.PRODUCTION && options.flags.USE_SUPABASE_AUTH !== true) {
                failures.push(safeFailure(
                    'PRODUCTION_SUPABASE_AUTH_REQUIRED',
                    SEVERITIES.CRITICAL_BLOCKER,
                    'Production requires Supabase Auth before activation.',
                    { affectedFlags: ['PRODUCTION_MODE', 'USE_SUPABASE_AUTH'] }
                ));
            }

            if (safeBoolean(options.flags.ALLOW_ANONYMOUS_AUTH) || safeBoolean(options.flags.ENABLE_ANONYMOUS_AUTH) || safeBoolean(options.flags.ANONYMOUS_AUTH_ENABLED)) {
                failures.push(safeFailure(
                    'ANONYMOUS_AUTH_ENABLED_UNEXPECTEDLY',
                    options.environment === ENVIRONMENTS.PRODUCTION ? SEVERITIES.CRITICAL_BLOCKER : SEVERITIES.HIGH,
                    'Anonymous auth is enabled unexpectedly for a governed deployment state.',
                    { environment: options.environment }
                ));
            }

            if (!options.config.SUPABASE_URL && (options.environment === ENVIRONMENTS.STAGING || options.environment === ENVIRONMENTS.PILOT || options.environment === ENVIRONMENTS.PRODUCTION)) {
                failures.push(safeFailure(
                    'SUPABASE_URL_MISSING',
                    options.environment === ENVIRONMENTS.PRODUCTION ? SEVERITIES.CRITICAL_BLOCKER : SEVERITIES.HIGH,
                    'Supabase URL evidence is required for real staging validation.',
                    { environment: options.environment }
                ));
            }

            if (options.config.SUPABASE_URL && isProductionUrlMismatch(options.environment, options.config)) {
                failures.push(safeFailure(
                    'SUPABASE_URL_ENVIRONMENT_MISMATCH',
                    options.environment === ENVIRONMENTS.PRODUCTION ? SEVERITIES.CRITICAL_BLOCKER : SEVERITIES.HIGH,
                    'Supabase URL appears to reference the wrong environment.',
                    { environment: options.environment }
                ));
            }

            if (!options.config.publicKeyPresent && (options.environment === ENVIRONMENTS.STAGING || options.environment === ENVIRONMENTS.PILOT || options.environment === ENVIRONMENTS.PRODUCTION)) {
                failures.push(safeFailure(
                    'SUPABASE_PUBLIC_KEY_MISSING',
                    options.environment === ENVIRONMENTS.PRODUCTION ? SEVERITIES.CRITICAL_BLOCKER : SEVERITIES.HIGH,
                    'Supabase public browser key evidence is required for real staging validation.',
                    { environment: options.environment, publicKeyPresent: false }
                ));
            }

            invokeEnvironmentGovernance(options, warnings, failures, recommendations);
            invokeFeatureFlagValidator(options, warnings, failures, recommendations);

            var result = normalizeResult(
                'ENVIRONMENT_VALIDATION',
                failures.length === 0,
                warnings,
                failures,
                recommendations,
                {
                    environment: options.environment,
                    origin: options.origin,
                    supabaseUrlProvided: Boolean(options.config.SUPABASE_URL),
                    supabasePublicKeyProvided: Boolean(options.config.publicKeyPresent)
                }
            );
            emitTelemetry('STAGING_VALIDATION_ENVIRONMENT_VALIDATED', result);
            return result;
        } catch (error) {
            var failed = normalizeResult(
                'ENVIRONMENT_VALIDATION',
                false,
                [safeWarning('ENVIRONMENT_VALIDATION_RECOVERED', SEVERITIES.WARNING, 'Environment validation recovered from an internal error.', 'Review supplied environment evidence and retry.', { error: error && error.message })],
                [safeFailure('ENVIRONMENT_VALIDATION_RUNTIME_ERROR', SEVERITIES.HIGH, 'Environment validation could not complete safely.')],
                [safeRecommendation('RETRY_ENVIRONMENT_VALIDATION', 'Review staging environment inputs and retry validation.')]
            );
            emitTelemetry('STAGING_VALIDATION_ENVIRONMENT_ERROR', failed);
            return failed;
        }
    }

    function testPassed(test) {
        if (!isPlainObject(test)) return false;
        if (test.passed === true || test.success === true || test.ok === true) return true;
        if (test.failed === true || test.failure === true || test.passed === false || test.success === false || test.ok === false) return false;
        if (test.crossTenantLeak || test.crossTenantAccess || test.crossTenantVisible || test.unauthorizedAccess) return false;
        return true;
    }

    function hasCrossTenantLeak(test) {
        return !!(test && (
            test.crossTenantLeak === true ||
            test.crossTenantAccess === true ||
            test.crossTenantVisible === true ||
            test.crossTenantRowsVisible === true ||
            test.crossTenantInvite === true ||
            test.crossTenantOnboarding === true ||
            test.crossTenantActivation === true ||
            Number(test.unexpectedCrossTenantRows || test.crossTenantRowCount || 0) > 0
        ));
    }

    function testLabel(test, fallback) {
        return safeString(test && (test.name || test.testName || test.label || test.table), fallback || 'staging validation test');
    }

    function validateTenantIsolation(input, context) {
        try {
            var evidence = getOptions(input, context);
            var tests = getArray(evidence.tenantIsolationTests)
                .concat(getArray(evidence.onboardingIsolationTests))
                .concat(getArray(evidence.inviteIsolationTests));
            var warnings = [];
            var failures = [];
            var recommendations = [
                safeRecommendation('RUN_TENANT_ISOLATION_PROBES', 'Run employee, manager, HR, payroll, onboarding, invite, audit, and pending-action isolation probes in staging.')
            ];

            if (!tests.length) {
                failures.push(safeFailure(
                    'TENANT_ISOLATION_EVIDENCE_MISSING',
                    SEVERITIES.HIGH,
                    'Tenant isolation evidence is required before staging promotion.',
                    { validationType: 'TENANT_ISOLATION' }
                ));
            }

            tests.forEach(function inspectTenantTest(test, index) {
                if (!isPlainObject(test)) {
                    failures.push(safeFailure('MALFORMED_TENANT_ISOLATION_TEST', SEVERITIES.HIGH, 'Malformed tenant isolation evidence was supplied.', { index: index }));
                    return;
                }
                var label = testLabel(test, 'tenant-isolation-test-' + index);
                if (hasCrossTenantLeak(test)) {
                    failures.push(safeFailure(
                        'CROSS_TENANT_VISIBILITY_LEAK',
                        SEVERITIES.CRITICAL_BLOCKER,
                        'Cross-tenant visibility was detected in ' + label + '.',
                        { table: test.table, role: test.role, validationType: 'TENANT_ISOLATION' }
                    ));
                    return;
                }
                if (!testPassed(test)) {
                    failures.push(safeFailure(
                        test.failureCode || 'TENANT_ISOLATION_TEST_FAILED',
                        safeSeverity(test.severity, SEVERITIES.HIGH),
                        'Tenant isolation validation failed for ' + label + '.',
                        { table: test.table, role: test.role, validationType: 'TENANT_ISOLATION' }
                    ));
                }
            });

            if (global.RLSValidationService && typeof global.RLSValidationService.validateTenantIsolation === 'function') {
                try {
                    var rlsResult = global.RLSValidationService.validateTenantIsolation(evidence);
                    mergeWarnings(warnings, rlsResult && rlsResult.warnings);
                    mergeFailures(failures, rlsResult && rlsResult.failures);
                    mergeRecommendations(recommendations, rlsResult && rlsResult.recommendations);
                } catch (error) {
                    failures.push(safeFailure('RLS_TENANT_VALIDATION_RUNTIME_ERROR', SEVERITIES.HIGH, 'RLS tenant validation integration failed safely.', { error: error && error.message }));
                }
            }

            var result = normalizeResult(
                'TENANT_ISOLATION',
                failures.length === 0,
                warnings,
                failures,
                recommendations,
                { testCount: tests.length }
            );
            emitTelemetry('STAGING_VALIDATION_TENANT_ISOLATION_VALIDATED', result);
            return result;
        } catch (error) {
            var failed = normalizeResult(
                'TENANT_ISOLATION',
                false,
                [safeWarning('TENANT_ISOLATION_RECOVERED', SEVERITIES.WARNING, 'Tenant isolation validation recovered from an internal error.', 'Review supplied isolation evidence and retry.', { error: error && error.message })],
                [safeFailure('TENANT_ISOLATION_RUNTIME_ERROR', SEVERITIES.HIGH, 'Tenant isolation validation could not complete safely.')],
                [safeRecommendation('RETRY_TENANT_ISOLATION_VALIDATION', 'Review tenant isolation evidence and retry validation.')]
            );
            emitTelemetry('STAGING_VALIDATION_TENANT_ISOLATION_ERROR', failed);
            return failed;
        }
    }

    function validateRoleVisibility(input, context) {
        try {
            var evidence = getOptions(input, context);
            var tests = getArray(evidence.roleVisibilityTests);
            var warnings = [];
            var failures = [];
            var recommendations = [
                safeRecommendation('RUN_ROLE_VISIBILITY_PROBES', 'Run role visibility probes for employee, manager, HR, HR head, director, super admin, and platform owner isolation.')
            ];
            var seenRoles = {};

            if (!tests.length) {
                failures.push(safeFailure(
                    'ROLE_VISIBILITY_EVIDENCE_MISSING',
                    SEVERITIES.HIGH,
                    'Role visibility evidence is required before staging promotion.',
                    { validationType: 'ROLE_VISIBILITY' }
                ));
            }

            tests.forEach(function inspectRoleTest(test, index) {
                if (!isPlainObject(test)) {
                    failures.push(safeFailure('MALFORMED_ROLE_VISIBILITY_TEST', SEVERITIES.HIGH, 'Malformed role visibility evidence was supplied.', { index: index }));
                    return;
                }
                var role = normalizeRole(test.role || test.actorRole || test.viewerRole);
                var label = testLabel(test, role || 'role-visibility-test-' + index);
                if (role) seenRoles[role] = true;

                if (hasCrossTenantLeak(test)) {
                    failures.push(safeFailure(
                        'ROLE_CROSS_TENANT_VISIBILITY_LEAK',
                        SEVERITIES.CRITICAL_BLOCKER,
                        role + ' validation detected cross-tenant visibility in ' + label + '.',
                        { role: role, table: test.table }
                    ));
                }

                if (role === 'SUPER_ADMIN' && (test.salaryVisible === true || test.payrollVisible === true || test.payrollAmountVisible === true || test.compensationVisible === true || test.leaveBalanceVisible === true)) {
                    failures.push(safeFailure(
                        'SUPER_ADMIN_HR_DATA_VISIBLE',
                        SEVERITIES.CRITICAL_BLOCKER,
                        'SUPER_ADMIN visibility exposed HR-sensitive salary, payroll, compensation, or leave-balance data.',
                        { role: role, validationType: 'ROLE_VISIBILITY' }
                    ));
                }

                if (role === 'PLATFORM_OWNER' && (test.tenantHierarchyVisible === true || test.visibleInTenantHierarchy === true || test.appearsInTenantUI === true || test.employeeSelectorVisible === true)) {
                    failures.push(safeFailure(
                        'PLATFORM_OWNER_TENANT_HIERARCHY_VISIBLE',
                        SEVERITIES.CRITICAL_BLOCKER,
                        'PLATFORM_OWNER appeared in tenant-facing hierarchy, role UI, or employee selectors.',
                        { role: role, validationType: 'ROLE_VISIBILITY' }
                    ));
                }

                if (!testPassed(test)) {
                    failures.push(safeFailure(
                        test.failureCode || 'ROLE_VISIBILITY_TEST_FAILED',
                        safeSeverity(test.severity, SEVERITIES.HIGH),
                        'Role visibility validation failed for ' + label + '.',
                        { role: role, validationType: 'ROLE_VISIBILITY' }
                    ));
                }
            });

            ROLE_VISIBILITY_ROLES.forEach(function requireRole(role) {
                if (!seenRoles[role]) {
                    warnings.push(safeWarning(
                        'ROLE_VISIBILITY_PROBE_MISSING',
                        SEVERITIES.WARNING,
                        role + ' role visibility probe was not supplied.',
                        'Supply staging evidence for every tenant and platform governance role.',
                        { role: role }
                    ));
                }
            });

            var result = normalizeResult(
                'ROLE_VISIBILITY',
                failures.length === 0,
                warnings,
                failures,
                recommendations,
                { testCount: tests.length, roleCount: Object.keys(seenRoles).length }
            );
            emitTelemetry('STAGING_VALIDATION_ROLE_VISIBILITY_VALIDATED', result);
            return result;
        } catch (error) {
            var failed = normalizeResult(
                'ROLE_VISIBILITY',
                false,
                [safeWarning('ROLE_VISIBILITY_RECOVERED', SEVERITIES.WARNING, 'Role visibility validation recovered from an internal error.', 'Review supplied role evidence and retry.', { error: error && error.message })],
                [safeFailure('ROLE_VISIBILITY_RUNTIME_ERROR', SEVERITIES.HIGH, 'Role visibility validation could not complete safely.')],
                [safeRecommendation('RETRY_ROLE_VISIBILITY_VALIDATION', 'Review role visibility evidence and retry validation.')]
            );
            emitTelemetry('STAGING_VALIDATION_ROLE_VISIBILITY_ERROR', failed);
            return failed;
        }
    }

    function validateAuthSafety(input, context) {
        try {
            var evidence = getOptions(input, context);
            var tests = getArray(evidence.authValidationTests)
                .concat(getArray(evidence.inviteActivationTests))
                .concat(getArray(evidence.onboardingValidationTests));
            var warnings = [];
            var failures = [];
            var recommendations = [
                safeRecommendation('RUN_AUTH_INVITE_ACTIVATION_PROBES', 'Validate invites, expired invite rejection, duplicate onboarding, role safety, and tenant-safe activation in staging.')
            ];

            if (!tests.length) {
                failures.push(safeFailure(
                    'AUTH_VALIDATION_EVIDENCE_MISSING',
                    SEVERITIES.HIGH,
                    'Auth and invite validation evidence is required before staging promotion.',
                    { validationType: 'AUTH_VALIDATION' }
                ));
            }

            tests.forEach(function inspectAuthTest(test, index) {
                if (!isPlainObject(test)) {
                    failures.push(safeFailure('MALFORMED_AUTH_VALIDATION_TEST', SEVERITIES.HIGH, 'Malformed auth validation evidence was supplied.', { index: index }));
                    return;
                }
                var label = testLabel(test, 'auth-validation-test-' + index);
                if (hasCrossTenantLeak(test)) {
                    failures.push(safeFailure(
                        'CROSS_TENANT_ACTIVATION',
                        SEVERITIES.CRITICAL_BLOCKER,
                        'Cross-tenant activation or onboarding was accepted in ' + label + '.',
                        { validationType: 'AUTH_VALIDATION' }
                    ));
                    return;
                }
                if (test.invalidRoleAccepted === true || normalizeRole(test.role) === 'PLATFORM_OWNER') {
                    failures.push(safeFailure(
                        'INVALID_ROLE_ACCEPTED',
                        SEVERITIES.CRITICAL_BLOCKER,
                        'Invalid onboarding role assignment was accepted in ' + label + '.',
                        { role: test.role || '', validationType: 'AUTH_VALIDATION' }
                    ));
                }
                if (test.expiredInviteAccepted === true) {
                    failures.push(safeFailure('EXPIRED_INVITE_ACCEPTED', SEVERITIES.HIGH, 'Expired invite activation was accepted in ' + label + '.', { validationType: 'AUTH_VALIDATION' }));
                }
                if (test.duplicateInviteAccepted === true || test.duplicateOnboardingAccepted === true) {
                    failures.push(safeFailure('DUPLICATE_ONBOARDING_ACCEPTED', SEVERITIES.HIGH, 'Duplicate invite or onboarding payload was accepted in ' + label + '.', { validationType: 'AUTH_VALIDATION' }));
                }
                if (test.malformedPayloadAccepted === true || test.unsafeActivationAccepted === true) {
                    failures.push(safeFailure('MALFORMED_AUTH_PAYLOAD_ACCEPTED', SEVERITIES.HIGH, 'Malformed auth activation payload was accepted in ' + label + '.', { validationType: 'AUTH_VALIDATION' }));
                }
                if (!testPassed(test)) {
                    failures.push(safeFailure(
                        test.failureCode || 'AUTH_VALIDATION_TEST_FAILED',
                        safeSeverity(test.severity, SEVERITIES.HIGH),
                        'Auth validation failed for ' + label + '.',
                        { validationType: 'AUTH_VALIDATION' }
                    ));
                }
            });

            var result = normalizeResult(
                'AUTH_VALIDATION',
                failures.length === 0,
                warnings,
                failures,
                recommendations,
                { testCount: tests.length }
            );
            emitTelemetry('STAGING_VALIDATION_AUTH_VALIDATED', result);
            return result;
        } catch (error) {
            var failed = normalizeResult(
                'AUTH_VALIDATION',
                false,
                [safeWarning('AUTH_VALIDATION_RECOVERED', SEVERITIES.WARNING, 'Auth validation recovered from an internal error.', 'Review supplied auth evidence and retry.', { error: error && error.message })],
                [safeFailure('AUTH_VALIDATION_RUNTIME_ERROR', SEVERITIES.HIGH, 'Auth validation could not complete safely.')],
                [safeRecommendation('RETRY_AUTH_VALIDATION', 'Review auth and invite validation evidence and retry validation.')]
            );
            emitTelemetry('STAGING_VALIDATION_AUTH_ERROR', failed);
            return failed;
        }
    }

    function validateRlsExecution(input, context) {
        try {
            var evidence = getOptions(input, context);
            var warnings = [];
            var failures = [];
            var recommendations = [
                safeRecommendation('RUN_RLS_STAGING_SQL', 'Run sql/staging_validation_tests.sql and feed the resulting policy and role evidence into staging validation.')
            ];

            if (!global.RLSValidationService || typeof global.RLSValidationService.generateSecurityValidationReport !== 'function') {
                failures.push(safeFailure(
                    'RLS_VALIDATION_SERVICE_UNAVAILABLE',
                    SEVERITIES.HIGH,
                    'RLSValidationService is unavailable; real staging validation cannot confirm policy coverage.',
                    { validationType: 'RLS_EXECUTION' }
                ));
            } else {
                try {
                    var rlsReport = global.RLSValidationService.generateSecurityValidationReport(evidence);
                    mergeWarnings(warnings, rlsReport && rlsReport.warnings);
                    mergeFailures(failures, rlsReport && rlsReport.failures);
                    mergeRecommendations(recommendations, rlsReport && rlsReport.recommendations);
                } catch (error) {
                    failures.push(safeFailure('RLS_VALIDATION_RUNTIME_ERROR', SEVERITIES.HIGH, 'RLS validation execution failed safely.', { error: error && error.message }));
                }
            }

            var result = normalizeResult(
                'RLS_EXECUTION',
                failures.length === 0,
                warnings,
                failures,
                recommendations,
                { evidenceProvided: Object.keys(evidence).length > 0 }
            );
            emitTelemetry('STAGING_VALIDATION_RLS_EXECUTION_VALIDATED', result);
            return result;
        } catch (error) {
            var failed = normalizeResult(
                'RLS_EXECUTION',
                false,
                [safeWarning('RLS_EXECUTION_RECOVERED', SEVERITIES.WARNING, 'RLS execution validation recovered from an internal error.', 'Review supplied RLS evidence and retry.', { error: error && error.message })],
                [safeFailure('RLS_EXECUTION_RUNTIME_ERROR', SEVERITIES.HIGH, 'RLS execution validation could not complete safely.')],
                [safeRecommendation('RETRY_RLS_EXECUTION_VALIDATION', 'Review RLS staging evidence and retry validation.')]
            );
            emitTelemetry('STAGING_VALIDATION_RLS_EXECUTION_ERROR', failed);
            return failed;
        }
    }

    function validateDeploymentReadiness(input, context) {
        try {
            var options = getOptions(input, context);
            var environment = getEnvironment(options);
            var flags = getFlags(options);
            var config = sanitizeConfig(options.config || {});
            var origin = getOrigin(options);
            var validationContext = safeMetadata(options.context || {});

            var mergedOptions = {
                environment: environment,
                flags: flags,
                config: config,
                origin: origin,
                context: validationContext,
                rlsEvidence: options.rlsEvidence || options,
                rlsValidationResult: options.rlsValidationResult,
                launchContext: options.launchContext || validationContext
            };

            var environmentResult = validateEnvironmentSafety(mergedOptions);
            var rlsResult = validateRlsExecution(options.rlsEvidence || options);
            var tenantResult = validateTenantIsolation(options.tenantEvidence || options.rlsEvidence || options);
            var roleResult = validateRoleVisibility(options.roleEvidence || options.rlsEvidence || options);
            var authResult = validateAuthSafety(options.authEvidence || options);

            var warnings = []
                .concat(environmentResult.warnings || [])
                .concat(rlsResult.warnings || [])
                .concat(tenantResult.warnings || [])
                .concat(roleResult.warnings || [])
                .concat(authResult.warnings || []);
            var failures = []
                .concat(environmentResult.failures || [])
                .concat(rlsResult.failures || [])
                .concat(tenantResult.failures || [])
                .concat(roleResult.failures || [])
                .concat(authResult.failures || []);
            var recommendations = []
                .concat(environmentResult.recommendations || [])
                .concat(rlsResult.recommendations || [])
                .concat(tenantResult.recommendations || [])
                .concat(roleResult.recommendations || [])
                .concat(authResult.recommendations || []);

            if (global.LaunchReadinessService && typeof global.LaunchReadinessService.evaluateLaunchReadiness === 'function' && environment !== ENVIRONMENTS.STAGING) {
                try {
                    var launchEnvironment = environment === ENVIRONMENTS.DEVELOPMENT ? ENVIRONMENTS.DEVELOPMENT : environment;
                    var launchResult = global.LaunchReadinessService.evaluateLaunchReadiness(launchEnvironment, flags, Object.assign({}, validationContext, {
                        rlsValidated: rlsResult.passed === true && tenantResult.passed === true && roleResult.passed === true,
                        inviteFlowValidated: authResult.passed === true
                    }));
                    mergeFailures(failures, launchResult && launchResult.blockers);
                    mergeWarnings(warnings, launchResult && launchResult.warnings);
                } catch (error) {
                    failures.push(safeFailure('LAUNCH_READINESS_RUNTIME_ERROR', SEVERITIES.HIGH, 'Launch readiness integration failed safely during staging validation.', { error: error && error.message }));
                }
            }

            var readiness = readinessFrom(failures, warnings);
            var summary = readiness === READINESS.BLOCKED
                ? 'Deployment readiness is blocked by ' + failures.length + ' staging validation blocker' + (failures.length === 1 ? '' : 's') + '.'
                : readiness === READINESS.WARNING
                    ? 'Deployment readiness has ' + warnings.length + ' staging validation warning' + (warnings.length === 1 ? '' : 's') + '.'
                    : 'Deployment readiness validation passed for ' + environment + '.';

            var result = freezeValidationOutput({
                success: true,
                validationType: 'DEPLOYMENT_READINESS',
                environment: environment,
                passed: failures.length === 0,
                readiness: readiness,
                riskLevel: classifyDeploymentRisk(failures, warnings),
                warnings: warnings,
                failures: failures,
                recommendations: recommendations,
                timestamp: nowIso(),
                summary: summary,
                sections: [environmentResult, rlsResult, tenantResult, roleResult, authResult],
                metadata: {
                    productionDataMutated: false,
                    serviceRoleExposed: false,
                    rlsBypassed: false,
                    tenantIsolationPreserved: !failures.some(function hasTenantFailure(item) {
                        return /CROSS_TENANT/i.test(item && item.failureCode);
                    })
                }
            });
            emitTelemetry('STAGING_VALIDATION_DEPLOYMENT_READINESS_VALIDATED', result);
            recordMetric('STAGING_VALIDATION_DEPLOYMENT_READINESS', result);
            auditValidation('STAGING_VALIDATION_DEPLOYMENT_READINESS', result, { context: validationContext });
            return result;
        } catch (error) {
            var failed = freezeValidationOutput({
                success: true,
                validationType: 'DEPLOYMENT_READINESS',
                environment: 'UNKNOWN',
                passed: false,
                readiness: READINESS.BLOCKED,
                riskLevel: SEVERITIES.HIGH,
                warnings: [safeWarning('DEPLOYMENT_READINESS_RECOVERED', SEVERITIES.WARNING, 'Deployment readiness recovered from an internal error.', 'Review supplied staging evidence and retry.', { error: error && error.message })],
                failures: [safeFailure('DEPLOYMENT_READINESS_RUNTIME_ERROR', SEVERITIES.HIGH, 'Deployment readiness validation could not complete safely.')],
                recommendations: [safeRecommendation('RETRY_DEPLOYMENT_READINESS', 'Review staging validation input and retry readiness validation.')],
                timestamp: nowIso(),
                summary: 'Deployment readiness is blocked because staging validation recovered from a runtime error.',
                metadata: {
                    productionDataMutated: false,
                    serviceRoleExposed: false,
                    rlsBypassed: false
                }
            });
            emitTelemetry('STAGING_VALIDATION_DEPLOYMENT_READINESS_ERROR', failed);
            return failed;
        }
    }

    function generateStagingValidationReport(input, context) {
        try {
            var options = getOptions(input, context);
            var readiness = validateDeploymentReadiness(options);
            var report = freezeValidationOutput({
                success: true,
                validationType: 'STAGING_VALIDATION_REPORT',
                environment: readiness.environment || getEnvironment(options),
                passed: readiness.passed === true,
                readiness: readiness.readiness,
                riskLevel: readiness.riskLevel,
                warnings: readiness.warnings || [],
                failures: readiness.failures || [],
                recommendations: readiness.recommendations || [],
                timestamp: nowIso(),
                summary: readiness.summary || '',
                sections: readiness.sections || [],
                metadata: Object.assign({}, safeMetadata(readiness.metadata || {}), {
                    deploymentReadinessChecked: true,
                    productionDataMutated: false,
                    serviceRoleExposed: false,
                    rlsBypassed: false
                })
            });
            emitTelemetry('STAGING_VALIDATION_REPORT_GENERATED', report);
            recordMetric('STAGING_VALIDATION_REPORT_GENERATED', report);
            auditValidation('STAGING_VALIDATION_REPORT_GENERATED', report, { context: options.context || {} });
            return report;
        } catch (error) {
            var failed = freezeValidationOutput({
                success: true,
                validationType: 'STAGING_VALIDATION_REPORT',
                environment: 'UNKNOWN',
                passed: false,
                readiness: READINESS.BLOCKED,
                riskLevel: SEVERITIES.HIGH,
                warnings: [safeWarning('STAGING_VALIDATION_REPORT_RECOVERED', SEVERITIES.WARNING, 'Staging validation report recovered from an internal error.', 'Review supplied evidence and retry.', { error: error && error.message })],
                failures: [safeFailure('STAGING_VALIDATION_REPORT_RUNTIME_ERROR', SEVERITIES.HIGH, 'Staging validation report could not complete safely.')],
                recommendations: [safeRecommendation('RETRY_STAGING_VALIDATION_REPORT', 'Review staging validation input and retry report generation.')],
                timestamp: nowIso(),
                summary: 'Staging validation report is blocked because validation recovered from a runtime error.',
                metadata: {
                    productionDataMutated: false,
                    serviceRoleExposed: false,
                    rlsBypassed: false
                }
            });
            emitTelemetry('STAGING_VALIDATION_REPORT_ERROR', failed);
            return failed;
        }
    }

    var StagingValidationService = Object.freeze({
        ENVIRONMENTS: ENVIRONMENTS,
        READINESS: READINESS,
        SEVERITIES: SEVERITIES,
        validateEnvironmentSafety: validateEnvironmentSafety,
        validateTenantIsolation: validateTenantIsolation,
        validateRoleVisibility: validateRoleVisibility,
        validateAuthSafety: validateAuthSafety,
        validateRlsExecution: validateRlsExecution,
        validateDeploymentReadiness: validateDeploymentReadiness,
        generateStagingValidationReport: generateStagingValidationReport,
        classifyDeploymentRisk: classifyDeploymentRisk,
        normalizeValidationFailure: normalizeValidationFailure,
        freezeValidationOutput: freezeValidationOutput
    });

    if (!global.RLSValidationService) {
        safeWarn('Optional RLSValidationService dependency not detected. Supply staging RLS evidence explicitly.');
    }
    if (!global.EnvironmentGovernanceService) {
        safeWarn('Optional EnvironmentGovernanceService dependency not detected. Local environment checks remain active.');
    }
    if (!global.WorkflowTelemetryService) {
        safeWarn('Optional WorkflowTelemetryService dependency not detected. Validation telemetry is disabled.');
    }

    global.StagingValidationService = StagingValidationService;
    global.stagingValidationService = StagingValidationService;

    if (global.__ARTHHRMS_DEV__) {
        (function runSelfTest() {
            var checks = [];
            function record(name, passed, details) {
                checks.push(Object.freeze({ name: name, passed: !!passed, details: details || null }));
            }
            var originalTelemetry = global.WorkflowTelemetryService;

            try {
                var crossTenant = validateTenantIsolation({
                    tenantIsolationTests: [{ name: 'self-test leak', crossTenantLeak: true, passed: false }]
                });
                record('cross-tenant failures blocked', crossTenant.failures.some(function hasCritical(item) {
                    return item.severity === SEVERITIES.CRITICAL_BLOCKER;
                }), crossTenant);

                var unsafeEnvironment = validateEnvironmentSafety({
                    environment: 'PRODUCTION',
                    origin: 'http://localhost:3000',
                    flags: { PRODUCTION_MODE: true, USE_SUPABASE_AUTH: false, ALLOW_LOCAL_AUTH_FALLBACK: true }
                });
                record('unsafe environments blocked', unsafeEnvironment.readiness === READINESS.BLOCKED, unsafeEnvironment);

                var role = validateRoleVisibility({
                    roleVisibilityTests: [{ role: 'SUPER_ADMIN', salaryVisible: true, passed: false }]
                });
                record('role visibility validation works', role.failures.some(function hasRoleFailure(item) {
                    return item.failureCode === 'SUPER_ADMIN_HR_DATA_VISIBLE';
                }), role);

                var frozen = generateStagingValidationReport('bad-input');
                record('immutable outputs enforced', Object.isFrozen(frozen) && Object.isFrozen(frozen.failures), frozen);

                global.WorkflowTelemetryService = {
                    emitTelemetry: function emitTelemetryFailure() {
                        return global.__ARTHHRMS_MISSING_TELEMETRY_CALL__();
                    }
                };
                var telemetryFailure = validateAuthSafety({
                    authValidationTests: [{ invalidRoleAccepted: true, role: 'PLATFORM_OWNER', passed: false }]
                });
                record('telemetry failures isolated', telemetryFailure.success === true && telemetryFailure.passed === false, telemetryFailure);
            } catch (error) {
                record('self-test has no uncaught failure', false, error && error.message ? error.message : safeString(error, 'unknown self-test error'));
            } finally {
                global.WorkflowTelemetryService = originalTelemetry;
            }

            try {
                global.__ARTHHRMS_STAGING_VALIDATION_SELF_TEST__ = Object.freeze({
                    passed: checks.every(function allPassed(item) { return item.passed; }),
                    tests: Object.freeze(checks.slice())
                });
            } catch (error) {
                safeWarn('Self-test result storage failed safely.', { error: error && error.message });
            }
        })();
    }
})(typeof window !== 'undefined' ? window : globalThis);
