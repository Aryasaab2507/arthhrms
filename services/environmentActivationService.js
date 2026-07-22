/**
 * environmentActivationService.js
 * ARTHHRMS - Environment Activation Safeguards
 *
 * PURPOSE:
 * Provides centralized production activation governance and safe
 * promotion controls for environment readiness, deployment blockers,
 * staging validation, feature flag safety, and rollout promotion paths.
 *
 * This service validates activation safety ONLY by default.
 * It does NOT mutate production data in validation-only mode.
 * It does NOT bypass staging validation.
 * It does NOT expose tenant data.
 *
 * ARCHITECTURE RULE:
 * Environment activation safeguards must remain isolated from tenant
 * business logic and dashboard runtime behavior.
 *
 * STABILITY:
 * Public APIs remain synchronous and backward-compatible.
 *
 * DEPENDS ON:
 * - window.StagingValidationService (optional)
 * - window.EnvironmentGovernanceService (optional)
 * - window.FeatureFlagValidator (optional)
 * - window.WorkflowTelemetryService (optional)
 * - window.AuditService (optional)
 * - window.OrchestrationMetricsService (optional)
 *
 * @version 1.0.0
 */
(function attachEnvironmentActivationService(global) {
    'use strict';

    var PREFIX = '[EnvironmentActivationService]';
    var DEFAULT_SOURCE = 'environmentActivationService';

    var ENVIRONMENT_STATES = Object.freeze([
        'DEVELOPMENT',
        'STAGING',
        'PILOT',
        'LIMITED_PRODUCTION',
        'FULL_PRODUCTION',
        'SUSPENDED'
    ]);

    var PROMOTION_PATHS = Object.freeze({
        development_to_staging: Object.freeze({ from: 'DEVELOPMENT', to: 'STAGING' }),
        staging_to_pilot: Object.freeze({ from: 'STAGING', to: 'PILOT' }),
        staging_to_full_production: Object.freeze({ from: 'STAGING', to: 'FULL_PRODUCTION' }),
        pilot_to_limited_production: Object.freeze({ from: 'PILOT', to: 'LIMITED_PRODUCTION' }),
        limited_to_full_production: Object.freeze({ from: 'LIMITED_PRODUCTION', to: 'FULL_PRODUCTION' })
    });

    var PROMOTION_STATES = Object.freeze([
        'STAGING',
        'VALIDATING',
        'APPROVAL_PENDING',
        'PROMOTION_READY',
        'PROMOTING',
        'DEGRADED',
        'PROMOTED',
        'ARCHIVED'
    ]);

    var PARITY_CHECKS = Object.freeze([
        Object.freeze({ key: 'configuration', label: 'Configuration parity' }),
        Object.freeze({ key: 'feature', label: 'Feature parity' }),
        Object.freeze({ key: 'schema', label: 'Schema parity' }),
        Object.freeze({ key: 'migration', label: 'Migration parity' }),
        Object.freeze({ key: 'permission', label: 'Permission parity' }),
        Object.freeze({ key: 'dependency', label: 'Service dependency parity' })
    ]);

    var RISK_LEVELS = Object.freeze([
        'SAFE',
        'WARNING',
        'HIGH_RISK',
        'CRITICAL_BLOCKER'
    ]);

    var SECRET_KEY_PATTERN = /(service[_-]?role|private[_-]?key|secret|password|token|jwt)/i;
    var PROMOTION_CONFIDENTIAL_KEY_PATTERN = /(salary|leave[_-]?balance|payroll|confidential|employee[_-]?record|raw[_-]?document|document[_-]?content|private[_-]?file|file[_-]?content|attachment[_-]?body)/i;

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
        if (typeof value === 'number') return value !== 0;
        if (typeof value === 'string') {
            var normalized = value.trim().toLowerCase();
            if (['true', '1', 'yes', 'y', 'on', 'enabled'].indexOf(normalized) !== -1) return true;
            if (['false', '0', 'no', 'n', 'off', 'disabled'].indexOf(normalized) !== -1) return false;
        }
        return Boolean(value);
    }

    function cloneValue(value, depth) {
        var currentDepth = depth || 0;
        if (value === null || value === undefined) return value;
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
        if (currentDepth > 5) return safeString(value, '');
        if (Array.isArray(value)) {
            return value.slice(0, 150).map(function cloneArrayItem(item) {
                return cloneValue(item, currentDepth + 1);
            });
        }
        if (isPlainObject(value)) {
            var output = {};
            Object.keys(value).forEach(function cloneKey(key) {
                if (SECRET_KEY_PATTERN.test(key)) {
                    output[key + 'Present'] = !!value[key];
                    return;
                }
                output[key] = cloneValue(value[key], currentDepth + 1);
            });
            return output;
        }
        return safeString(value, '');
    }

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.keys(value).forEach(function freezeKey(key) {
            deepFreeze(value[key]);
        });
        return Object.freeze(value);
    }

    function freezeActivationOutput(value) {
        return deepFreeze(cloneValue(value || {}, 0));
    }

    function freezeList(list) {
        if (!Array.isArray(list)) return Object.freeze([]);
        return deepFreeze(list.slice().map(function freezeItem(item) {
            return isPlainObject(item) ? cloneValue(item, 0) : item;
        }));
    }

    function safeMetadata(metadata) {
        return isPlainObject(metadata) ? cloneValue(metadata, 0) : {};
    }

    function sanitizePromotionMetadata(metadata, depth) {
        var currentDepth = depth || 0;
        if (!metadata || currentDepth > 5) return {};
        if (Array.isArray(metadata)) {
            return metadata.slice(0, 50).map(function sanitizeItem(item) {
                if (isPlainObject(item)) return sanitizePromotionMetadata(item, currentDepth + 1);
                if (Array.isArray(item)) return sanitizePromotionMetadata({ values: item }, currentDepth + 1).values || [];
                return item === null || typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean' ? item : safeString(item, '');
            });
        }
        if (!isPlainObject(metadata)) return {};
        var output = {};
        Object.keys(metadata).forEach(function sanitizeKey(key) {
            if (PROMOTION_CONFIDENTIAL_KEY_PATTERN.test(key)) {
                return;
            }
            if (SECRET_KEY_PATTERN.test(key)) {
                output[key + 'Present'] = !!metadata[key];
                return;
            }
            var value = metadata[key];
            if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                output[key] = value;
            } else if (Array.isArray(value)) {
                output[key] = sanitizePromotionMetadata(value, currentDepth + 1);
            } else if (isPlainObject(value)) {
                output[key] = sanitizePromotionMetadata(value, currentDepth + 1);
            } else if (value !== undefined) {
                output[key] = safeString(value, '');
            }
        });
        return output;
    }

    function freezePromotionOutput(value) {
        return deepFreeze(cloneValue(value || {}, 0));
    }

    function normalizePromotionState(value, fallback) {
        var normalized = safeString(value || fallback || 'STAGING', fallback || 'STAGING').trim().toUpperCase().replace(/[-\s]+/g, '_');
        if (normalized === 'READY') return 'PROMOTION_READY';
        if (normalized === 'PENDING_APPROVAL') return 'APPROVAL_PENDING';
        if (PROMOTION_STATES.indexOf(normalized) !== -1) return normalized;
        return fallback || 'STAGING';
    }

    function normalizeApprovalStatus(value) {
        var normalized = safeString(value || 'PENDING', 'PENDING').trim().toUpperCase().replace(/[-\s]+/g, '_');
        if (normalized === 'APPROVE') return 'APPROVED';
        if (normalized === 'REJECT') return 'REJECTED';
        if (['PENDING', 'APPROVED', 'REJECTED', 'NOT_REQUIRED', 'MISSING'].indexOf(normalized) !== -1) return normalized;
        return 'PENDING';
    }

    function approvalApproved(input) {
        if (normalizeApprovalStatus(input && input.approvalStatus) === 'APPROVED') return true;
        var approvals = Array.isArray(input && input.approvals) ? input.approvals : [];
        return approvals.some(function hasApprovedApproval(row) {
            return normalizeApprovalStatus(row && (row.status || row.approvalStatus)) === 'APPROVED' &&
                safeString(row && (row.approverRole || row.role || row.actorRole), '').toUpperCase().replace(/[-\s]+/g, '_') === 'PLATFORM_OWNER';
        });
    }

    function hasExplicit(value) {
        return value !== undefined && value !== null && value !== '';
    }

    function boolFromAny(source, keys, fallback) {
        var input = isPlainObject(source) ? source : {};
        for (var index = 0; index < keys.length; index += 1) {
            if (hasExplicit(input[keys[index]])) return safeBoolean(input[keys[index]]);
        }
        return !!fallback;
    }

    function stableSerialize(value) {
        try {
            if (value === undefined) return 'missing';
            if (value === null) return 'null';
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return safeString(value, '');
            if (Array.isArray(value)) return '[' + value.map(stableSerialize).join(',') + ']';
            if (isPlainObject(value)) {
                return '{' + Object.keys(value).sort().map(function hashKey(key) {
                    if (SECRET_KEY_PATTERN.test(key) || PROMOTION_CONFIDENTIAL_KEY_PATTERN.test(key)) return key + ':present';
                    return key + ':' + stableSerialize(value[key]);
                }).join(',') + '}';
            }
            return safeString(value, '');
        } catch (error) {
            return 'unavailable';
        }
    }

    function stableFingerprint(value) {
        var serialized = stableSerialize(value);
        var hash = 0;
        for (var index = 0; index < serialized.length; index += 1) {
            hash = ((hash << 5) - hash) + serialized.charCodeAt(index);
            hash |= 0;
        }
        return 'fp-' + Math.abs(hash).toString(16);
    }

    function pickEnvironmentParityValue(environment, key) {
        var source = isPlainObject(environment) ? environment : {};
        if (key === 'configuration') return source.configuration || source.config || source.runtimeConfig || null;
        if (key === 'feature') return source.featureFlags || source.flags || source.features || null;
        if (key === 'schema') return source.schemaVersion || source.schema || source.schemaHash || null;
        if (key === 'migration') return source.migrationVersion || source.migration || source.migrationHash || null;
        if (key === 'permission') return source.permissions || source.permissionHash || source.rbac || source.rolePermissions || null;
        if (key === 'dependency') return source.serviceDependencies || source.dependencies || source.services || null;
        return null;
    }

    function explicitParityFlag(input, key) {
        var source = isPlainObject(input) ? input : {};
        var direct = key + 'Parity';
        var consistent = key + 'Consistent';
        var verified = key + 'Verified';
        if (hasExplicit(source[direct])) return safeBoolean(source[direct]);
        if (hasExplicit(source[consistent])) return safeBoolean(source[consistent]);
        if (hasExplicit(source[verified])) return safeBoolean(source[verified]);
        if (key === 'permission' && hasExplicit(source.permissionParity)) return safeBoolean(source.permissionParity);
        if (key === 'dependency' && hasExplicit(source.serviceDependencyParity)) return safeBoolean(source.serviceDependencyParity);
        return null;
    }

    function safeFailure(code, severity, message, metadata) {
        return Object.freeze({
            failureCode: safeString(code, 'ENVIRONMENT_ACTIVATION_FAILURE'),
            severity: normalizeRiskLevel(severity || 'HIGH_RISK'),
            message: safeString(message, 'Environment activation failure.'),
            metadata: freezeActivationOutput(safeMetadata(metadata || {}))
        });
    }

    function safeWarning(code, severity, message, recommendation, metadata) {
        return Object.freeze({
            warningCode: safeString(code, 'ENVIRONMENT_ACTIVATION_WARNING'),
            severity: normalizeRiskLevel(severity || 'WARNING'),
            message: safeString(message, 'Environment activation warning.'),
            recommendation: safeString(recommendation, 'Review environment activation readiness.'),
            metadata: freezeActivationOutput(safeMetadata(metadata || {}))
        });
    }

    function safeRecommendation(code, message, metadata) {
        return Object.freeze({
            recommendationCode: safeString(code, 'ENVIRONMENT_ACTIVATION_RECOMMENDATION'),
            message: safeString(message, 'Review environment activation governance.'),
            metadata: freezeActivationOutput(safeMetadata(metadata || {}))
        });
    }

    function normalizeRiskLevel(value) {
        var normalized = safeString(value, 'WARNING').trim().toUpperCase().replace(/[-\s]+/g, '_');
        if (normalized === 'CRITICAL' || normalized === 'BLOCKED' || normalized === 'BLOCKER') return 'CRITICAL_BLOCKER';
        if (normalized === 'HIGH' || normalized === 'ERROR') return 'HIGH_RISK';
        if (RISK_LEVELS.indexOf(normalized) !== -1) return normalized;
        return 'WARNING';
    }

    function normalizeEnvironmentState(environment) {
        var normalized = safeString(environment || 'DEVELOPMENT', 'DEVELOPMENT').trim().toUpperCase().replace(/[-\s]+/g, '_');
        if (normalized === 'DEV') return 'DEVELOPMENT';
        if (normalized === 'STAGE') return 'STAGING';
        if (normalized === 'PROD' || normalized === 'PRODUCTION' || normalized === 'FULL_PROD') return 'FULL_PRODUCTION';
        if (normalized === 'LIMITED_PROD') return 'LIMITED_PRODUCTION';
        if (ENVIRONMENT_STATES.indexOf(normalized) !== -1) return normalized;
        return '';
    }

    function normalizePromotionPath(path) {
        return safeString(path, '').trim().toLowerCase().replace(/[-\s]+/g, '_');
    }

    function resolveOptions(options) {
        var malformedInput = options !== undefined && !isPlainObject(options);
        var source = isPlainObject(options) ? cloneValue(options, 0) : {};
        var current = normalizeEnvironmentState(source.currentEnvironment || source.fromEnvironment || source.current || source.from);
        var target = normalizeEnvironmentState(source.targetEnvironment || source.toEnvironment || source.target || source.to);
        var path = normalizePromotionPath(source.promotionPath || source.path);
        var flags = isPlainObject(source.flags) ? cloneValue(source.flags, 0) : {};
        var config = isPlainObject(source.config) ? cloneValue(source.config, 0) : {};
        var report = isPlainObject(source.stagingValidationReport || source.stagingReport || source.validationReport)
            ? cloneValue(source.stagingValidationReport || source.stagingReport || source.validationReport, 0)
            : null;
        return {
            currentEnvironment: current,
            targetEnvironment: target,
            promotionPath: path,
            flags: flags,
            config: config,
            origin: safeString(source.origin || (global.location && global.location.origin) || '', ''),
            stagingValidationReport: report,
            validationOnly: source.validationOnly !== false,
            malformedInput: malformedInput,
            metadata: safeMetadata(source.metadata || {})
        };
    }

    function isProductionTarget(environment) {
        return environment === 'FULL_PRODUCTION' || environment === 'LIMITED_PRODUCTION';
    }

    function isFullProductionTarget(environment) {
        return environment === 'FULL_PRODUCTION';
    }

    function validatePromotionPath(currentEnvironment, targetEnvironment, promotionPath) {
        try {
            var current = normalizeEnvironmentState(currentEnvironment);
            var target = normalizeEnvironmentState(targetEnvironment);
            var requestedPath = normalizePromotionPath(promotionPath);
            var failures = [];
            var warnings = [];
            var expectedPath = '';

            Object.keys(PROMOTION_PATHS).forEach(function findExpected(key) {
                var path = PROMOTION_PATHS[key];
                if (path.from === current && path.to === target) expectedPath = key;
            });

            if (!current || !target) {
                failures.push(safeFailure('ENVIRONMENT_STATE_INVALID', 'HIGH_RISK', 'Promotion requires valid current and target environments.', { currentEnvironment: currentEnvironment, targetEnvironment: targetEnvironment }));
            } else if (current === target) {
                warnings.push(safeWarning('PROMOTION_TARGET_UNCHANGED', 'WARNING', 'Target environment matches current environment.', 'Choose a different target for promotion.', { current: current, target: target }));
            } else if (!expectedPath) {
                failures.push(safeFailure('DIRECT_PROMOTION_BLOCKED', 'CRITICAL_BLOCKER', 'Unsafe direct environment promotion is blocked.', { currentEnvironment: current, targetEnvironment: target }));
            }

            if (requestedPath && expectedPath && requestedPath !== expectedPath) {
                failures.push(safeFailure('PROMOTION_PATH_MISMATCH', 'HIGH_RISK', 'Promotion path does not match current and target environments.', { requestedPath: requestedPath, expectedPath: expectedPath }));
            }

            return freezeActivationOutput({
                success: true,
                valid: failures.length === 0,
                currentEnvironment: current,
                targetEnvironment: target,
                promotionPath: requestedPath || expectedPath,
                expectedPath: expectedPath,
                warnings: warnings,
                failures: failures,
                timestamp: nowIso()
            });
        } catch (error) {
            return freezeActivationOutput({
                success: false,
                valid: false,
                currentEnvironment: '',
                targetEnvironment: '',
                promotionPath: '',
                expectedPath: '',
                warnings: [safeWarning('PROMOTION_PATH_RECOVERED', 'WARNING', 'Promotion path validation recovered from an internal error.', 'Review promotion inputs and retry.', { error: error && error.message })],
                failures: [safeFailure('PROMOTION_PATH_VALIDATION_FAILED', 'HIGH_RISK', 'Promotion path validation failed safely.')],
                timestamp: nowIso()
            });
        }
    }

    function reportFailures(report) {
        return Array.isArray(report && report.failures) ? report.failures.slice() : [];
    }

    function reportWarnings(report) {
        return Array.isArray(report && report.warnings) ? report.warnings.slice() : [];
    }

    function reportReady(report) {
        if (!report) return false;
        var readiness = safeString(report.readiness || report.status, '').trim().toUpperCase();
        return readiness === 'READY' || report.passed === true || report.ready === true;
    }

    function failureCodeOf(failure) {
        return safeString(failure && (failure.failureCode || failure.code || failure.warningCode || failure.blockerCode), '').toUpperCase();
    }

    function failureSeverityOf(failure) {
        return normalizeRiskLevel(failure && failure.severity);
    }

    function detectCrossTenantFailure(report) {
        return reportFailures(report).some(function hasCrossTenant(failure) {
            var code = failureCodeOf(failure);
            var message = safeString(failure && failure.message, '').toUpperCase();
            return code.indexOf('CROSS_TENANT') !== -1 || code.indexOf('TENANT_LEAK') !== -1 || message.indexOf('CROSS-TENANT') !== -1 || message.indexOf('TENANT LEAK') !== -1;
        });
    }

    function isLocalhost(value) {
        var text = safeString(value, '').toLowerCase();
        return text.indexOf('localhost') !== -1 || text.indexOf('127.0.0.1') !== -1 || text.indexOf('0.0.0.0') !== -1;
    }

    function supabaseUrl(config) {
        return safeString(config && (config.SUPABASE_URL || config.supabaseUrl || config.url), '').trim().toLowerCase();
    }

    function publicKeyPresent(config) {
        return !!(config && (config.SUPABASE_ANON_KEY || config.SUPABASE_PUBLISHABLE_KEY || config.supabaseAnonKey || config.anonKey));
    }

    function detectEnvironmentMismatch(target, config) {
        var url = supabaseUrl(config);
        if (!url) return false;
        if (isFullProductionTarget(target)) {
            return url.indexOf('staging') !== -1 || url.indexOf('stage') !== -1 || url.indexOf('dev') !== -1 || url.indexOf('pilot') !== -1 || isLocalhost(url);
        }
        if (target === 'STAGING' || target === 'PILOT') {
            return url.indexOf('prod') !== -1 || url.indexOf('production') !== -1;
        }
        return false;
    }

    function mergeFeatureValidatorFailures(flags, failures, warnings) {
        try {
            var validator = global.FeatureFlagValidator;
            if (!validator || typeof validator.validateFlagCombination !== 'function') return;
            var result = validator.validateFlagCombination(flags || {});
            if (result && result.success === false) {
                failures.push(safeFailure('FEATURE_FLAG_VALIDATION_BLOCKED', result.fatal ? 'CRITICAL_BLOCKER' : 'HIGH_RISK', result.message || 'Feature flag validation failed.', { errorCode: result.errorCode || '' }));
            }
            (result && result.warnings || []).forEach(function eachWarning(warning) {
                warnings.push(safeWarning(warning.warningCode || 'FEATURE_FLAG_WARNING', warning.severity || 'WARNING', warning.message || 'Feature flag warning.', warning.recommendation || 'Review feature flag posture.', warning));
            });
        } catch (error) {
            warnings.push(safeWarning('FEATURE_FLAG_VALIDATION_RECOVERED', 'WARNING', 'Feature flag validation recovered from an internal error.', 'Review feature flag safety manually.', { error: error && error.message }));
        }
    }

    function collectReadiness(options) {
        var resolved = resolveOptions(options);
        var path = validatePromotionPath(resolved.currentEnvironment, resolved.targetEnvironment, resolved.promotionPath);
        var failures = (path.failures || []).slice();
        var warnings = (path.warnings || []).slice();
        var report = resolved.stagingValidationReport;
        var flags = resolved.flags || {};
        var config = resolved.config || {};

        if (resolved.malformedInput) {
            failures.push(safeFailure('MALFORMED_ACTIVATION_PAYLOAD', 'HIGH_RISK', 'Activation readiness payload is malformed.', {}));
        }

        if (isProductionTarget(resolved.targetEnvironment)) {
            if (!reportReady(report)) {
                failures.push(safeFailure('FAILED_STAGING_VALIDATION_BLOCKED', 'CRITICAL_BLOCKER', 'Production promotion requires successful staging validation.', { targetEnvironment: resolved.targetEnvironment, readiness: report && report.readiness || 'MISSING' }));
            }
            if (report && report.metadata && report.metadata.productionDataMutated) {
                failures.push(safeFailure('PRODUCTION_DATA_MUTATION_BLOCKED', 'CRITICAL_BLOCKER', 'Production data mutation during validation blocks activation.', { targetEnvironment: resolved.targetEnvironment }));
            }
            if (report && report.metadata && report.metadata.rlsBypassed) {
                failures.push(safeFailure('RLS_BYPASS_BLOCKED', 'CRITICAL_BLOCKER', 'RLS bypass evidence blocks activation.', { targetEnvironment: resolved.targetEnvironment }));
            }
            if (report && report.metadata && report.metadata.serviceRoleExposed) {
                failures.push(safeFailure('SERVICE_ROLE_EXPOSURE_BLOCKED', 'CRITICAL_BLOCKER', 'Service-role exposure blocks activation.', { targetEnvironment: resolved.targetEnvironment }));
            }
            if (detectCrossTenantFailure(report)) {
                failures.push(safeFailure('CROSS_TENANT_VISIBILITY_BLOCKED', 'CRITICAL_BLOCKER', 'Cross-tenant validation failure blocks activation.', { targetEnvironment: resolved.targetEnvironment }));
            }
        }

        reportFailures(report).forEach(function mergeReportFailure(failure) {
            if (failureSeverityOf(failure) === 'CRITICAL_BLOCKER' && failureCodeOf(failure).indexOf('CROSS_TENANT') === -1) {
                failures.push(safeFailure(failureCodeOf(failure) || 'STAGING_VALIDATION_CRITICAL_BLOCKER', 'CRITICAL_BLOCKER', failure.message || 'Critical staging validation failure.', failure.metadata || {}));
            }
        });

        reportWarnings(report).forEach(function mergeReportWarning(warning) {
            warnings.push(safeWarning(warning.warningCode || warning.failureCode || 'STAGING_VALIDATION_WARNING', warning.severity || 'WARNING', warning.message || 'Staging validation warning.', warning.recommendation || 'Review staging validation warning.', warning.metadata || {}));
        });

        if (isFullProductionTarget(resolved.targetEnvironment)) {
            if (safeBoolean(flags.ALLOW_LOCAL_AUTH_FALLBACK)) {
                failures.push(safeFailure('LOCAL_AUTH_FALLBACK_PRODUCTION_BLOCKED', 'CRITICAL_BLOCKER', 'Local auth fallback is blocked in full production.', { targetEnvironment: resolved.targetEnvironment }));
            }
            if (flags.USE_SUPABASE_AUTH !== true) {
                failures.push(safeFailure('SUPABASE_AUTH_REQUIRED_FOR_PRODUCTION', 'CRITICAL_BLOCKER', 'Supabase Auth must be enabled before full production activation.', { targetEnvironment: resolved.targetEnvironment }));
            }
            if (safeBoolean(flags.ALLOW_ANONYMOUS_AUTH) || safeBoolean(flags.ENABLE_ANONYMOUS_AUTH) || safeBoolean(flags.ANONYMOUS_AUTH_ENABLED) || safeBoolean(flags.SUPABASE_ANON_AUTH_ENABLED)) {
                failures.push(safeFailure('ANONYMOUS_AUTH_HIGH_RISK', 'HIGH_RISK', 'Anonymous auth is high-risk and blocks full production activation.', { targetEnvironment: resolved.targetEnvironment }));
            }
            if (isLocalhost(resolved.origin)) {
                failures.push(safeFailure('LOCALHOST_FULL_PRODUCTION_BLOCKED', 'CRITICAL_BLOCKER', 'Localhost origin cannot activate full production.', { origin: resolved.origin }));
            }
            if (!supabaseUrl(config)) {
                failures.push(safeFailure('SUPABASE_URL_REQUIRED', 'CRITICAL_BLOCKER', 'Supabase URL evidence is required before full production activation.'));
            }
            if (!publicKeyPresent(config)) {
                failures.push(safeFailure('SUPABASE_PUBLIC_KEY_REQUIRED', 'CRITICAL_BLOCKER', 'Supabase public browser key evidence is required before full production activation.'));
            }
        }

        if (detectEnvironmentMismatch(resolved.targetEnvironment, config)) {
            failures.push(safeFailure('SUPABASE_ENVIRONMENT_MISMATCH', isFullProductionTarget(resolved.targetEnvironment) ? 'CRITICAL_BLOCKER' : 'HIGH_RISK', 'Supabase URL appears to target the wrong environment.', { targetEnvironment: resolved.targetEnvironment }));
        }

        mergeFeatureValidatorFailures(flags, failures, warnings);

        return {
            resolved: resolved,
            path: path,
            failures: failures,
            warnings: warnings
        };
    }

    function classifyActivationRisk(failures, warnings) {
        var safeFailures = Array.isArray(failures) ? failures : [];
        var safeWarnings = Array.isArray(warnings) ? warnings : [];
        if (safeFailures.some(function critical(item) { return normalizeRiskLevel(item && item.severity) === 'CRITICAL_BLOCKER'; })) return 'CRITICAL_BLOCKER';
        if (safeFailures.length) return 'HIGH_RISK';
        if (safeWarnings.length) return 'WARNING';
        return 'SAFE';
    }

    function emitTelemetry(eventType, metadata, severity) {
        try {
            if (!global.WorkflowTelemetryService || typeof global.WorkflowTelemetryService.emitTelemetry !== 'function') return false;
            global.WorkflowTelemetryService.emitTelemetry('GOVERNANCE', eventType, {
                source: DEFAULT_SOURCE,
                severity: severity || 'INFO',
                status: 'RECORDED',
                metadata: safeMetadata(metadata || {})
            });
            return true;
        } catch (error) {
            safeWarn('Activation telemetry failed safely.', { eventType: eventType, error: error && error.message });
            return false;
        }
    }

    function auditActivation(eventType, actor, metadata) {
        try {
            if (!global.AuditService || typeof global.AuditService.recordAudit !== 'function') return false;
            global.AuditService.recordAudit({
                eventType: eventType,
                actionType: eventType,
                actorRole: actor && (actor.role || actor.actorRole) || 'platform_owner',
                actorId: actor && (actor.id || actor.actorId || actor.email) || '',
                module: 'Environment Activation',
                source: DEFAULT_SOURCE,
                severity: 'INFO',
                metadata: safeMetadata(metadata || {})
            }, {
                source: DEFAULT_SOURCE
            });
            return true;
        } catch (error) {
            safeWarn('Activation audit failed safely.', { eventType: eventType, error: error && error.message });
            return false;
        }
    }

    function recordMetric(eventType, metadata) {
        try {
            if (!global.OrchestrationMetricsService || typeof global.OrchestrationMetricsService.recordWorkflowMetric !== 'function') return false;
            global.OrchestrationMetricsService.recordWorkflowMetric(eventType, Object.assign({ source: DEFAULT_SOURCE }, safeMetadata(metadata || {})));
            return true;
        } catch (error) {
            safeWarn('Activation metrics failed safely.', { eventType: eventType, error: error && error.message });
            return false;
        }
    }

    function validateEnvironmentReadiness(options, context) {
        try {
            var collected = collectReadiness(options || {});
            var failures = freezeList(collected.failures);
            var warnings = freezeList(collected.warnings);
            var risk = classifyActivationRisk(failures, warnings);
            var ready = failures.length === 0;
            var result = freezeActivationOutput({
                success: true,
                ready: ready,
                readiness: ready ? (warnings.length ? 'WARNING' : 'READY') : 'BLOCKED',
                riskLevel: risk,
                currentEnvironment: collected.resolved.currentEnvironment,
                targetEnvironment: collected.resolved.targetEnvironment,
                promotionPath: collected.path.promotionPath,
                validationOnly: collected.resolved.validationOnly,
                failures: failures,
                warnings: warnings,
                recommendations: [
                    safeRecommendation('FOLLOW_STAGED_PROMOTION', 'Promote through development, staging, pilot, limited production, then full production.'),
                    safeRecommendation('RUN_STAGING_VALIDATION', 'Run staging validation before any production promotion.')
                ],
                timestamp: nowIso()
            });
            emitTelemetry('ENVIRONMENT_ACTIVATION_VALIDATED', { targetEnvironment: result.targetEnvironment, readiness: result.readiness, riskLevel: result.riskLevel }, ready ? 'INFO' : 'WARNING');
            auditActivation('ENVIRONMENT_ACTIVATION_VALIDATED', context && context.actor || {}, { targetEnvironment: result.targetEnvironment, readiness: result.readiness, riskLevel: result.riskLevel });
            recordMetric('ENVIRONMENT_ACTIVATION_VALIDATED', { targetEnvironment: result.targetEnvironment, readiness: result.readiness });
            return result;
        } catch (error) {
            return freezeActivationOutput({
                success: false,
                ready: false,
                readiness: 'BLOCKED',
                riskLevel: 'CRITICAL_BLOCKER',
                currentEnvironment: '',
                targetEnvironment: '',
                promotionPath: '',
                validationOnly: true,
                failures: [safeFailure('ENVIRONMENT_READINESS_VALIDATION_FAILED', 'HIGH_RISK', 'Environment readiness validation failed safely.')],
                warnings: [safeWarning('ENVIRONMENT_READINESS_RECOVERED', 'WARNING', 'Environment readiness recovered from an internal error.', 'Review activation inputs and retry.', { error: error && error.message })],
                recommendations: [safeRecommendation('RETRY_ENVIRONMENT_READINESS', 'Retry environment readiness validation with complete staging evidence.')],
                timestamp: nowIso()
            });
        }
    }

    function deploymentModeForEnvironment(environment) {
        if (environment === 'DEVELOPMENT') return 'DEVELOPMENT';
        if (environment === 'STAGING') return 'STAGING';
        if (environment === 'PILOT') return 'PILOT';
        if (environment === 'LIMITED_PRODUCTION' || environment === 'FULL_PRODUCTION') return 'PRODUCTION';
        if (environment === 'SUSPENDED') return 'SUSPENDED';
        return environment;
    }

    function requestEnvironmentPromotion(options, context) {
        try {
            var readiness = validateEnvironmentReadiness(options || {}, context || {});
            var validationOnly = resolveOptions(options || {}).validationOnly;
            if (!readiness.ready) {
                var blocked = freezeActivationOutput({
                    success: false,
                    activated: false,
                    validationOnly: validationOnly,
                    readiness: readiness,
                    failures: readiness.failures,
                    warnings: readiness.warnings,
                    timestamp: nowIso()
                });
                emitTelemetry('ENVIRONMENT_ACTIVATION_BLOCKED', { targetEnvironment: readiness.targetEnvironment, riskLevel: readiness.riskLevel }, 'WARNING');
                auditActivation('ENVIRONMENT_ACTIVATION_BLOCKED', context && context.actor || {}, { targetEnvironment: readiness.targetEnvironment, riskLevel: readiness.riskLevel });
                return blocked;
            }

            if (validationOnly) {
                return freezeActivationOutput({
                    success: true,
                    activated: false,
                    validationOnly: true,
                    readiness: readiness,
                    failures: [],
                    warnings: readiness.warnings,
                    timestamp: nowIso()
                });
            }

            var activated = false;
            var activationWarning = '';
            try {
                var deployment = global.deploymentSafetyService || global.deploymentSafetyLocalService;
                if (deployment && typeof deployment.setEnvironmentMode === 'function') {
                    var response = deployment.setEnvironmentMode(deploymentModeForEnvironment(readiness.targetEnvironment), 'Environment Activation Safeguards promotion');
                    activated = !!(response && (response.ok || response.success !== false));
                    activationWarning = response && (response.reason || response.error || '') || '';
                } else {
                    activationWarning = 'Deployment safety service unavailable; no activation mutation was performed.';
                }
            } catch (error) {
                activationWarning = 'Deployment activation failed safely.';
            }

            var result = freezeActivationOutput({
                success: activated,
                activated: activated,
                validationOnly: false,
                readiness: readiness,
                failures: activated ? [] : [safeFailure('ENVIRONMENT_ACTIVATION_MUTATION_FAILED', 'HIGH_RISK', activationWarning || 'Environment activation mutation failed safely.')],
                warnings: activated ? readiness.warnings : readiness.warnings.concat([safeWarning('ACTIVATION_MUTATION_NOT_APPLIED', 'WARNING', activationWarning || 'No activation mutation was applied.', 'Review deployment safety service before retrying.')]),
                timestamp: nowIso()
            });
            emitTelemetry(activated ? 'ENVIRONMENT_ACTIVATION_PROMOTED' : 'ENVIRONMENT_ACTIVATION_MUTATION_FAILED', { targetEnvironment: readiness.targetEnvironment }, activated ? 'INFO' : 'WARNING');
            auditActivation(activated ? 'ENVIRONMENT_ACTIVATION_PROMOTED' : 'ENVIRONMENT_ACTIVATION_MUTATION_FAILED', context && context.actor || {}, { targetEnvironment: readiness.targetEnvironment });
            recordMetric(activated ? 'ENVIRONMENT_ACTIVATION_PROMOTED' : 'ENVIRONMENT_ACTIVATION_MUTATION_FAILED', { targetEnvironment: readiness.targetEnvironment });
            return result;
        } catch (error) {
            return freezeActivationOutput({
                success: false,
                activated: false,
                validationOnly: true,
                readiness: null,
                failures: [safeFailure('ENVIRONMENT_PROMOTION_REQUEST_FAILED', 'HIGH_RISK', 'Environment promotion request failed safely.')],
                warnings: [safeWarning('ENVIRONMENT_PROMOTION_RECOVERED', 'WARNING', 'Environment promotion request recovered from an internal error.', 'Review promotion payload and retry.', { error: error && error.message })],
                timestamp: nowIso()
            });
        }
    }

    function normalizePromotionPayload(payload, context) {
        try {
            if (!isPlainObject(payload)) {
                return freezePromotionOutput({
                    success: false,
                    payload: null,
                    failures: [safeFailure('MALFORMED_PROMOTION_PAYLOAD', 'HIGH_RISK', 'Promotion payload must be a plain object.')],
                    warnings: [],
                    timestamp: nowIso()
                });
            }
            var source = payload || {};
            var ctx = isPlainObject(context) ? context : {};
            var actorRole = safeString(source.requestedByRole || source.actorRole || ctx.actor && (ctx.actor.role || ctx.actor.actorRole) || '', '').toUpperCase().replace(/[-\s]+/g, '_');
            var normalized = {
                promotionId: safeString(source.promotionId || source.id || source.releaseId || 'PROMO-' + Date.now(), ''),
                releaseId: safeString(source.releaseId || source.safeReleaseId || '', ''),
                correlationId: safeString(source.correlationId || '', ''),
                fromEnvironment: normalizeEnvironmentState(source.fromEnvironment || source.currentEnvironment || source.from || 'STAGING'),
                targetEnvironment: normalizeEnvironmentState(source.targetEnvironment || source.toEnvironment || source.target || source.to || 'FULL_PRODUCTION'),
                promotionState: normalizePromotionState(source.promotionState || source.state || source.status, 'STAGING'),
                promotionStateRaw: safeString(source.state || source.status || source.promotionState || '', ''),
                approvalStatus: normalizeApprovalStatus(source.approvalStatus || source.approvalState || source.approval),
                requestedByRole: actorRole || 'PLATFORM_OWNER',
                requestedAt: safeString(source.requestedAt || source.createdAt || nowIso(), nowIso()),
                readinessCertified: boolFromAny(source, ['readinessCertified', 'productionReadinessCertified', 'certificationApproved', 'deploymentCertification', 'certified'], false),
                rolloutStabilized: boolFromAny(source, ['rolloutStabilized', 'stableRollout', 'stabilizationVerified', 'stableRelease'], false),
                deploymentValidated: boolFromAny(source, ['deploymentValidated', 'deploymentValidationPassed', 'deploymentValidation', 'validatedDeployment'], false),
                migrationVerified: boolFromAny(source, ['migrationVerified', 'migrationValidated', 'migrationVerification', 'migrationParity'], false),
                rbacValidated: boolFromAny(source, ['rbacValidated', 'rbacValidation', 'permissionParity', 'permissionVerified'], false),
                auditValidated: boolFromAny(source, ['auditValidated', 'auditValidation', 'auditReady'], false),
                healthValidated: boolFromAny(source, ['healthValidated', 'healthValidation', 'healthyEnvironment', 'platformHealthReady'], false),
                rollbackReady: boolFromAny(source, ['rollbackReady', 'rollbackReadiness', 'rollbackPrepared', 'rollbackReadinessAvailable'], false),
                criticalIncidentExists: boolFromAny(source, ['criticalIncidentExists', 'criticalIncident', 'criticalIncidentActive'], false),
                healthDegraded: boolFromAny(source, ['healthDegraded', 'healthStateCritical', 'criticalHealth', 'degradedHealth'], false),
                activeEmergencyOverride: boolFromAny(source, ['activeEmergencyOverride', 'emergencyOverrideActive', 'emergencyOverride'], false),
                deploymentValidationFailed: boolFromAny(source, ['deploymentValidationFailed', 'deploymentBlocked', 'failedDeploymentValidation'], false),
                environmentMismatch: boolFromAny(source, ['environmentMismatch', 'environmentDrift'], false),
                executePromotion: boolFromAny(source, ['executePromotion', 'promote', 'activationRequested', 'promotionRequested'], false),
                approvalRequested: boolFromAny(source, ['approvalRequested', 'approvalRequired'], false),
                metadata: sanitizePromotionMetadata(source.metadata || {})
            };
            return freezePromotionOutput({
                success: true,
                payload: normalized,
                failures: [],
                warnings: [],
                timestamp: nowIso()
            });
        } catch (error) {
            return freezePromotionOutput({
                success: false,
                payload: null,
                failures: [safeFailure('PROMOTION_PAYLOAD_NORMALIZATION_FAILED', 'HIGH_RISK', 'Promotion payload normalization failed safely.')],
                warnings: [safeWarning('PROMOTION_PAYLOAD_NORMALIZATION_RECOVERED', 'WARNING', 'Promotion payload normalization recovered from an internal error.', 'Review promotion payload and retry.', { error: error && error.message })],
                timestamp: nowIso()
            });
        }
    }

    function verifyEnvironmentParity(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var staging = isPlainObject(source.staging) ? source.staging : isPlainObject(source.sourceEnvironment) ? source.sourceEnvironment : {};
            var production = isPlainObject(source.production) ? source.production : isPlainObject(source.targetEnvironmentSnapshot) ? source.targetEnvironmentSnapshot : isPlainObject(source.targetEnvironmentState) ? source.targetEnvironmentState : {};
            var malformed = !isPlainObject(input);
            var results = PARITY_CHECKS.map(function buildCheck(check) {
                var explicit = explicitParityFlag(source, check.key);
                var sourceValue = pickEnvironmentParityValue(staging, check.key);
                var targetValue = pickEnvironmentParityValue(production, check.key);
                var hasComparable = sourceValue !== null && targetValue !== null;
                var passed = explicit === null ? hasComparable && stableFingerprint(sourceValue) === stableFingerprint(targetValue) : explicit === true;
                return {
                    checkId: check.key.toUpperCase() + '_PARITY',
                    category: check.key,
                    label: check.label,
                    passed: passed,
                    severity: passed ? 'INFO' : 'HIGH_RISK',
                    sourceFingerprint: hasComparable ? stableFingerprint(sourceValue).slice(0, 80) : 'missing',
                    targetFingerprint: hasComparable ? stableFingerprint(targetValue).slice(0, 80) : 'missing',
                    recommendation: passed ? 'Parity validated.' : 'Resolve ' + check.label.toLowerCase() + ' before promotion.'
                };
            });
            var passedCount = results.filter(function countPassed(row) { return row.passed === true; }).length;
            var score = PARITY_CHECKS.length ? Math.round((passedCount / PARITY_CHECKS.length) * 100) : 0;
            var mismatches = results.filter(function mismatch(row) { return row.passed !== true; });
            return freezePromotionOutput({
                success: true,
                environmentConsistent: mismatches.length === 0 && !malformed,
                environmentConsistencyScore: malformed ? 0 : score,
                consistencyScore: malformed ? 0 : score,
                promotionConfidenceContribution: malformed ? 0 : Math.round((score / 100) * 20),
                environmentValidationResults: results,
                mismatches: mismatches,
                failures: mismatches.map(function parityFailure(row) {
                    return safeFailure(row.checkId + '_MISMATCH', 'HIGH_RISK', row.label + ' mismatch blocks production promotion.', { category: row.category });
                }),
                warnings: malformed ? [safeWarning('MALFORMED_PARITY_PAYLOAD', 'WARNING', 'Environment parity payload is malformed.', 'Supply staging and production parity evidence before promotion.')] : [],
                timestamp: nowIso(context)
            });
        } catch (error) {
            return freezePromotionOutput({
                success: false,
                environmentConsistent: false,
                environmentConsistencyScore: 0,
                consistencyScore: 0,
                promotionConfidenceContribution: 0,
                environmentValidationResults: [],
                mismatches: [],
                failures: [safeFailure('ENVIRONMENT_PARITY_FAILED_SAFE', 'HIGH_RISK', 'Environment parity validation failed safely.')],
                warnings: [safeWarning('ENVIRONMENT_PARITY_RECOVERED', 'WARNING', 'Environment parity validation recovered from an internal error.', 'Review parity evidence and retry.', { error: error && error.message })],
                timestamp: nowIso()
            });
        }
    }

    function parityFromInput(input, context) {
        if (input && input.environmentParity && input.environmentParity.environmentValidationResults) return input.environmentParity;
        if (input && input.environmentParity) return verifyEnvironmentParity(input.environmentParity, context);
        return verifyEnvironmentParity(input || {}, context);
    }

    function collectPromotionBlockerFlags(input, parity) {
        var source = isPlainObject(input) ? input : {};
        return {
            certificationMissing: boolFromAny(source, ['certificationMissing'], false) || !boolFromAny(source, ['readinessCertified', 'productionReadinessCertified', 'certificationApproved', 'deploymentCertification', 'certified'], false),
            criticalIncidentExists: boolFromAny(source, ['criticalIncidentExists', 'criticalIncident', 'criticalIncidentActive'], false),
            healthDegraded: boolFromAny(source, ['healthDegraded', 'healthStateCritical', 'criticalHealth', 'degradedHealth'], false) || boolFromAny(source, ['healthValidated', 'healthValidation', 'healthyEnvironment', 'platformHealthReady'], false) === false,
            activeEmergencyOverride: boolFromAny(source, ['activeEmergencyOverride', 'emergencyOverrideActive', 'emergencyOverride'], false),
            deploymentValidationFailed: boolFromAny(source, ['deploymentValidationFailed', 'deploymentBlocked', 'failedDeploymentValidation'], false) || boolFromAny(source, ['deploymentValidated', 'deploymentValidationPassed', 'deploymentValidation', 'validatedDeployment'], false) === false,
            environmentMismatch: boolFromAny(source, ['environmentMismatch', 'environmentDrift'], false) || !(parity && parity.environmentConsistent === true),
            rollbackUnavailable: boolFromAny(source, ['rollbackUnavailable', 'rollbackReadinessUnavailable'], false) || boolFromAny(source, ['rollbackReady', 'rollbackReadiness', 'rollbackPrepared', 'rollbackReadinessAvailable'], false) === false
        };
    }

    function calculatePromotionConfidence(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var parity = parityFromInput(source, context);
            var flags = collectPromotionBlockerFlags(source, parity);
            var factors = [
                { key: 'readinessCertified', label: 'Readiness certification', weight: 15, passed: !flags.certificationMissing },
                { key: 'rolloutStabilized', label: 'Rollout stabilization', weight: 10, passed: boolFromAny(source, ['rolloutStabilized', 'stableRollout', 'stabilizationVerified', 'stableRelease'], false) },
                { key: 'deploymentValidated', label: 'Deployment validation', weight: 15, passed: !flags.deploymentValidationFailed },
                { key: 'migrationVerified', label: 'Migration verification', weight: 10, passed: boolFromAny(source, ['migrationVerified', 'migrationValidated', 'migrationVerification', 'migrationParity'], false) },
                { key: 'rbacValidated', label: 'RBAC validation', weight: 10, passed: boolFromAny(source, ['rbacValidated', 'rbacValidation', 'permissionParity', 'permissionVerified'], false) },
                { key: 'auditValidated', label: 'Audit validation', weight: 10, passed: boolFromAny(source, ['auditValidated', 'auditValidation', 'auditReady'], false) },
                { key: 'healthValidated', label: 'Health validation', weight: 10, passed: !flags.healthDegraded },
                { key: 'rollbackReady', label: 'Rollback readiness', weight: 10, passed: !flags.rollbackUnavailable },
                { key: 'environmentParity', label: 'Environment parity', weight: 10, passed: parity && parity.environmentConsistent === true }
            ];
            var score = factors.reduce(function total(acc, row) {
                return acc + (row.passed ? row.weight : 0);
            }, 0);
            if (parity && parity.environmentConsistent !== true) score = Math.min(score, Math.max(0, Math.round((parity.environmentConsistencyScore || 0) * 0.6)));
            if (flags.criticalIncidentExists || flags.activeEmergencyOverride) score = Math.min(score, 35);
            var blockers = Object.keys(flags).filter(function flagKey(key) { return flags[key]; });
            var level = 'LOW';
            if (score >= 90 && blockers.length === 0) level = 'PRODUCTION_READY';
            else if (score >= 75 && blockers.length === 0) level = 'HIGH';
            else if (score >= 50) level = 'MODERATE';
            return freezePromotionOutput({
                success: true,
                promotionConfidenceScore: score,
                confidenceScore: score,
                confidenceLevel: level,
                promotionRiskScore: Math.max(0, 100 - score),
                promotionBlocked: blockers.length > 0,
                blockerFlags: flags,
                confidenceFactors: factors,
                environmentConsistencyScore: parity && parity.environmentConsistencyScore || 0,
                timestamp: nowIso()
            });
        } catch (error) {
            return freezePromotionOutput({
                success: false,
                promotionConfidenceScore: 0,
                confidenceScore: 0,
                confidenceLevel: 'LOW',
                promotionRiskScore: 100,
                promotionBlocked: true,
                blockerFlags: { confidenceCalculationFailed: true },
                confidenceFactors: [],
                failures: [safeFailure('PROMOTION_CONFIDENCE_FAILED_SAFE', 'HIGH_RISK', 'Promotion confidence scoring failed safely.')],
                timestamp: nowIso()
            });
        }
    }

    function promotionMutationRequested(input) {
        var source = isPlainObject(input) ? input : {};
        var state = normalizePromotionState(source.promotionState || source.state || source.status, '');
        return boolFromAny(source, ['approvalRequested', 'approvalRequired', 'executePromotion', 'promote', 'activationRequested', 'promotionRequested'], false) ||
            state === 'APPROVAL_PENDING' || state === 'PROMOTING' || state === 'PROMOTED';
    }

    function actorRole(context) {
        var ctx = isPlainObject(context) ? context : {};
        return safeString(ctx.actor && (ctx.actor.role || ctx.actor.actorRole) || ctx.role || ctx.actorRole || 'PLATFORM_OWNER', 'PLATFORM_OWNER').trim().toUpperCase().replace(/[-\s]+/g, '_');
    }

    function validatePromotionEligibility(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var ctx = isPlainObject(context) ? context : {};
            var normalized = normalizePromotionPayload(source, ctx);
            var payload = normalized.payload || {};
            var parity = parityFromInput(source, ctx);
            var confidence = calculatePromotionConfidence(Object.assign({}, source, { environmentParity: parity }), ctx);
            var flags = collectPromotionBlockerFlags(source, parity);
            var failures = normalized.failures ? normalized.failures.slice() : [];
            var warnings = normalized.warnings ? normalized.warnings.slice() : [];
            var role = actorRole(ctx);
            var routeType = safeString(ctx.routeType || '', '').toLowerCase();
            var mutationRequested = promotionMutationRequested(source);

            if (routeType === 'tenant' || ['EMPLOYEE', 'MANAGER', 'HR', 'HR_HEAD', 'DIRECTOR'].indexOf(role) !== -1) {
                failures.push(safeFailure('TENANT_ROLE_PROMOTION_GOVERNANCE_BLOCKED', 'CRITICAL_BLOCKER', 'Tenant roles cannot access environment promotion governance.', { role: role }));
            }
            if (role === 'SUPER_ADMIN' && mutationRequested) {
                failures.push(safeFailure('SUPER_ADMIN_PROMOTION_AUTHORITY_BLOCKED', 'CRITICAL_BLOCKER', 'SUPER_ADMIN cannot approve or execute staging to production promotion.', { role: role }));
            }
            if (!role || (role !== 'PLATFORM_OWNER' && role !== 'SUPER_ADMIN' && mutationRequested)) {
                failures.push(safeFailure('UNAUTHORIZED_PROMOTION_ACTOR_BLOCKED', 'CRITICAL_BLOCKER', 'Only isolated PLATFORM_OWNER governance can approve production promotion.', { role: role || 'UNKNOWN' }));
            }

            if (flags.certificationMissing) failures.push(safeFailure('CERTIFICATION_MISSING_BLOCKS_PROMOTION', 'CRITICAL_BLOCKER', 'Readiness certification is required before production promotion.'));
            if (flags.criticalIncidentExists) failures.push(safeFailure('CRITICAL_INCIDENT_BLOCKS_PROMOTION', 'CRITICAL_BLOCKER', 'Critical incidents block production promotion.'));
            if (flags.healthDegraded) failures.push(safeFailure('DEGRADED_HEALTH_BLOCKS_PROMOTION', 'CRITICAL_BLOCKER', 'Degraded environment health blocks production promotion.'));
            if (flags.activeEmergencyOverride) failures.push(safeFailure('ACTIVE_EMERGENCY_OVERRIDE_BLOCKS_PROMOTION', 'CRITICAL_BLOCKER', 'Active emergency override blocks production promotion.'));
            if (flags.deploymentValidationFailed) failures.push(safeFailure('DEPLOYMENT_VALIDATION_BLOCKS_PROMOTION', 'CRITICAL_BLOCKER', 'Failed deployment validation blocks production promotion.'));
            if (flags.environmentMismatch) failures.push(safeFailure('ENVIRONMENT_MISMATCH_BLOCKS_PROMOTION', 'CRITICAL_BLOCKER', 'Environment parity mismatch blocks production promotion.', { consistencyScore: parity && parity.environmentConsistencyScore || 0 }));
            if (flags.rollbackUnavailable) failures.push(safeFailure('ROLLBACK_READINESS_BLOCKS_PROMOTION', 'CRITICAL_BLOCKER', 'Rollback readiness is required before production promotion.'));

            if (mutationRequested && role === 'PLATFORM_OWNER' && !approvalApproved(source)) {
                failures.push(safeFailure('MISSING_APPROVAL_BLOCKS_PROMOTION', 'HIGH_RISK', 'Production promotion requires an approved PLATFORM_OWNER checkpoint.'));
            }

            var eligible = failures.length === 0;
            var state = eligible ? 'PROMOTION_READY' : flags.healthDegraded || flags.deploymentValidationFailed || flags.environmentMismatch ? 'DEGRADED' : 'APPROVAL_PENDING';
            return freezePromotionOutput({
                success: true,
                eligible: eligible,
                promotionState: state,
                approvalStatus: approvalApproved(source) ? 'APPROVED' : payload.approvalStatus || 'PENDING',
                fromEnvironment: payload.fromEnvironment || normalizeEnvironmentState(source.fromEnvironment || 'STAGING'),
                targetEnvironment: payload.targetEnvironment || normalizeEnvironmentState(source.targetEnvironment || 'FULL_PRODUCTION'),
                promotionConfidence: confidence,
                environmentValidation: parity,
                blockedPromotionReasons: failures,
                failures: failures,
                warnings: warnings,
                governanceChecks: {
                    directProductionBypassBlocked: true,
                    unauthorizedReleaseBlocked: failures.some(function unauthorized(item) {
                        return /UNAUTHORIZED|TENANT_ROLE|SUPER_ADMIN/.test(item.failureCode || '');
                    }),
                    approvalRequired: mutationRequested,
                    rollbackReady: !flags.rollbackUnavailable,
                    tenantIsolationPreserved: true
                },
                timestamp: nowIso()
            });
        } catch (error) {
            return freezePromotionOutput({
                success: false,
                eligible: false,
                promotionState: 'DEGRADED',
                approvalStatus: 'PENDING',
                promotionConfidence: { promotionConfidenceScore: 0, promotionBlocked: true },
                environmentValidation: { environmentConsistent: false, environmentConsistencyScore: 0 },
                blockedPromotionReasons: [safeFailure('PROMOTION_ELIGIBILITY_FAILED_SAFE', 'HIGH_RISK', 'Promotion eligibility validation failed safely.')],
                failures: [safeFailure('PROMOTION_ELIGIBILITY_FAILED_SAFE', 'HIGH_RISK', 'Promotion eligibility validation failed safely.')],
                warnings: [safeWarning('PROMOTION_ELIGIBILITY_RECOVERED', 'WARNING', 'Promotion eligibility recovered from an internal error.', 'Review promotion inputs and retry.', { error: error && error.message })],
                timestamp: nowIso()
            });
        }
    }

    function collectPromotionRows(input) {
        var rows = [];
        try {
            if (Array.isArray(input && input.promotions)) rows = rows.concat(input.promotions);
            if (isPlainObject(input) && (input.promotionId || input.promotionState || input.state || input.status)) rows.push(input);
            var store = global.DB && typeof global.DB.get === 'function' ? global.DB.get() : {};
            ['environmentPromotionRecords', 'promotionHistory', 'deploymentPromotionRecords', 'productionPromotionRecords'].forEach(function collectKey(key) {
                if (Array.isArray(store && store[key])) rows = rows.concat(store[key]);
            });
        } catch (error) {}
        return rows.slice(0, 80).map(function normalizeRow(row) {
            var normalized = normalizePromotionPayload(row || {});
            return normalized.payload || {
                promotionId: safeString(row && row.id || 'PROMO-UNKNOWN', 'PROMO-UNKNOWN'),
                promotionState: 'DEGRADED',
                approvalStatus: 'MISSING'
            };
        });
    }

    function summarizePromotionHistory(rows) {
        var total = rows.length;
        var promoted = rows.filter(function promotedRow(row) { return row.promotionState === 'PROMOTED' || row.promotionState === 'PROMOTION_READY'; }).length;
        var blocked = rows.filter(function blockedRow(row) { return row.promotionState === 'DEGRADED' || row.deploymentValidated === false || row.healthValidated === false || row.rollbackReady === false; }).length;
        var pending = rows.filter(function pendingRow(row) { return row.promotionState === 'APPROVAL_PENDING' || row.approvalStatus === 'PENDING'; }).length;
        return {
            totalPromotions: total,
            promotedPromotions: promoted,
            blockedPromotions: blocked,
            pendingApprovals: pending,
            promotionSuccessRate: total ? Math.round((promoted / total) * 100) : 0,
            blockedPromotionRate: total ? Math.round((blocked / total) * 100) : 0
        };
    }

    function generateEnvironmentPromotionReport(filters, context) {
        try {
            var input = isPlainObject(filters) ? filters : {};
            var ctx = isPlainObject(context) ? context : {};
            var parity = parityFromInput(input, ctx);
            var eligibility = validatePromotionEligibility(Object.assign({}, input, { environmentParity: parity }), ctx);
            var confidence = calculatePromotionConfidence(Object.assign({}, input, { environmentParity: parity }), ctx);
            var rows = collectPromotionRows(input);
            var historySummary = summarizePromotionHistory(rows);
            var blockedRows = rows.filter(function blockedHistory(row) {
                return row.promotionState === 'DEGRADED' || row.deploymentValidated === false || row.healthValidated === false || row.rollbackReady === false || row.approvalStatus === 'REJECTED';
            });
            var integrations = {
                safeReleaseIntegrated: !!(global.SafeReleaseGovernanceService || global.safeReleaseGovernanceService),
                productionReadinessIntegrated: !!(global.ProductionReadinessService || global.productionReadinessService),
                deploymentValidationIntegrated: !!(global.DeploymentValidationService || global.deploymentValidationService),
                platformHealthIntegrated: !!(global.PlatformHealthMonitoringService || global.platformHealthMonitoringService),
                globalIncidentIntegrated: !!(global.GlobalIncidentService || global.globalIncidentService),
                emergencyOverrideIntegrated: !!(global.EmergencyOverrideService || global.emergencyOverrideService)
            };
            var report = freezePromotionOutput({
                success: true,
                classification: eligibility.eligible ? 'INFO' : 'CRITICAL_BLOCKER',
                promotionGovernanceModel: {
                    state: eligibility.promotionState,
                    states: PROMOTION_STATES,
                    generatedAt: nowIso()
                },
                promotionStatus: eligibility.promotionState,
                approvalGovernance: {
                    approvalStatus: eligibility.approvalStatus,
                    approvalRequired: eligibility.governanceChecks && eligibility.governanceChecks.approvalRequired === true,
                    platformOwnerApprovalRequired: true,
                    superAdminApprovalAuthority: false
                },
                environmentValidation: {
                    environmentConsistent: parity.environmentConsistent === true,
                    environmentConsistencyScore: parity.environmentConsistencyScore || 0,
                    consistencyScore: parity.consistencyScore || 0,
                    validationResultCount: parity.environmentValidationResults ? parity.environmentValidationResults.length : 0
                },
                environmentValidationResults: parity.environmentValidationResults || [],
                promotionConfidence: confidence,
                promotionSafety: {
                    promotionBlocked: eligibility.eligible !== true,
                    directProductionBypassBlocked: true,
                    unsafeEnvironmentPromotionBlocked: eligibility.failures && eligibility.failures.length > 0,
                    unauthorizedReleaseBlocked: eligibility.governanceChecks && eligibility.governanceChecks.unauthorizedReleaseBlocked === true,
                    rollbackReadinessAvailable: eligibility.governanceChecks && eligibility.governanceChecks.rollbackReady === true,
                    environmentPromotionGovernancePreserved: true
                },
                promotionAnalytics: {
                    promotionSuccessRate: historySummary.promotionSuccessRate,
                    promotionFailures: historySummary.blockedPromotions,
                    environmentMismatches: parity.mismatches ? parity.mismatches.length : 0,
                    blockedPromotions: historySummary.blockedPromotions + (eligibility.eligible ? 0 : 1),
                    approvalTimelines: historySummary.pendingApprovals,
                    promotionConfidenceTrend: confidence.promotionConfidenceScore,
                    environmentStabilityTrend: parity.environmentConsistencyScore || 0
                },
                promotionHistory: rows,
                blockedPromotions: blockedRows,
                governanceIntegrations: integrations,
                failures: eligibility.failures || [],
                warnings: eligibility.warnings || [],
                accessGovernance: {
                    crossTenantPromotionLeakageBlocked: true,
                    directProductionBypassPrevented: true,
                    unauthorizedReleasesBlocked: true,
                    platformOwnerIsolatedFromTenantRbac: true,
                    superAdminPromotionAuthority: false,
                    tenantIsolationPreserved: true
                },
                sections: [parity, confidence, eligibility],
                timestamp: nowIso()
            });

            if (!ctx.skipTelemetry) emitTelemetry('ENVIRONMENT_PROMOTION_GOVERNANCE_REPORTED', { promotionState: report.promotionGovernanceModel.state, blocked: report.promotionSafety.promotionBlocked }, report.promotionSafety.promotionBlocked ? 'WARNING' : 'INFO');
            if (!ctx.skipAuditPersistence) auditActivation('ENVIRONMENT_PROMOTION_GOVERNANCE_REPORTED', ctx.actor || {}, { promotionState: report.promotionGovernanceModel.state, blocked: report.promotionSafety.promotionBlocked });
            if (!ctx.skipMetrics) recordMetric('ENVIRONMENT_PROMOTION_GOVERNANCE_REPORTED', { promotionState: report.promotionGovernanceModel.state, blocked: report.promotionSafety.promotionBlocked });
            return report;
        } catch (error) {
            return freezePromotionOutput({
                success: false,
                classification: 'CRITICAL_BLOCKER',
                promotionGovernanceModel: { state: 'DEGRADED', states: PROMOTION_STATES, generatedAt: nowIso() },
                environmentValidation: { environmentConsistent: false, environmentConsistencyScore: 0 },
                environmentValidationResults: [],
                promotionConfidence: { promotionConfidenceScore: 0, promotionBlocked: true },
                promotionSafety: { promotionBlocked: true, environmentPromotionGovernancePreserved: true },
                promotionHistory: [],
                blockedPromotions: [],
                failures: [safeFailure('ENVIRONMENT_PROMOTION_REPORT_FAILED_SAFE', 'HIGH_RISK', 'Environment promotion report failed safely.')],
                warnings: [safeWarning('ENVIRONMENT_PROMOTION_REPORT_RECOVERED', 'WARNING', 'Environment promotion report recovered from an internal error.', 'Review promotion inputs and retry.', { error: error && error.message })],
                timestamp: nowIso()
            });
        }
    }

    var EnvironmentActivationService = Object.freeze({
        ENVIRONMENT_STATES: ENVIRONMENT_STATES,
        PROMOTION_PATHS: PROMOTION_PATHS,
        PROMOTION_STATES: PROMOTION_STATES,
        RISK_LEVELS: RISK_LEVELS,
        normalizeEnvironmentState: normalizeEnvironmentState,
        validatePromotionPath: validatePromotionPath,
        classifyActivationRisk: classifyActivationRisk,
        validateEnvironmentReadiness: validateEnvironmentReadiness,
        requestEnvironmentPromotion: requestEnvironmentPromotion,
        normalizePromotionPayload: normalizePromotionPayload,
        verifyEnvironmentParity: verifyEnvironmentParity,
        calculatePromotionConfidence: calculatePromotionConfidence,
        validatePromotionEligibility: validatePromotionEligibility,
        generateEnvironmentPromotionReport: generateEnvironmentPromotionReport,
        freezeActivationOutput: freezeActivationOutput,
        freezePromotionOutput: freezePromotionOutput
    });

    if (!global.StagingValidationService) {
        safeWarn('Optional StagingValidationService dependency not detected. Supply staging report evidence explicitly.');
    }
    if (!global.FeatureFlagValidator) {
        safeWarn('Optional FeatureFlagValidator dependency not detected. Local activation flag checks remain active.');
    }

    global.EnvironmentActivationService = EnvironmentActivationService;
    global.environmentActivationService = EnvironmentActivationService;

    if (global.__ARTHHRMS_DEV__) {
        (function runSelfTest() {
            var checks = [];
            function record(name, passed, details) {
                checks.push(Object.freeze({ name: name, passed: !!passed, details: details || null }));
            }
            try {
                var unsafe = validateEnvironmentReadiness({
                    currentEnvironment: 'LIMITED_PRODUCTION',
                    targetEnvironment: 'FULL_PRODUCTION',
                    promotionPath: 'limited_to_full_production',
                    stagingValidationReport: { readiness: 'READY', failures: [], metadata: { productionDataMutated: false, rlsBypassed: false } },
                    flags: { USE_SUPABASE_AUTH: false, ALLOW_LOCAL_AUTH_FALLBACK: true },
                    config: { SUPABASE_URL: 'https://prod-project.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_prod' },
                    origin: 'https://platform.arthhrms.com'
                });
                record('unsafe production activation blocked', unsafe.ready === false && unsafe.failures.some(function localFallback(item) {
                    return item.failureCode === 'LOCAL_AUTH_FALLBACK_PRODUCTION_BLOCKED';
                }), unsafe);

                var path = validatePromotionPath('DEVELOPMENT', 'FULL_PRODUCTION');
                record('rollout validation works', path.valid === false && path.failures.some(function direct(item) {
                    return item.failureCode === 'DIRECT_PROMOTION_BLOCKED';
                }), path);

                var mismatch = validateEnvironmentReadiness({
                    currentEnvironment: 'LIMITED_PRODUCTION',
                    targetEnvironment: 'FULL_PRODUCTION',
                    promotionPath: 'limited_to_full_production',
                    stagingValidationReport: { readiness: 'READY', failures: [], metadata: { productionDataMutated: false, rlsBypassed: false } },
                    flags: { USE_SUPABASE_AUTH: true, ALLOW_LOCAL_AUTH_FALLBACK: false },
                    config: { SUPABASE_URL: 'https://staging-project.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_staging' },
                    origin: 'https://platform.arthhrms.com'
                });
                record('environment mismatch detection works', mismatch.failures.some(function mismatchFailure(item) {
                    return item.failureCode === 'SUPABASE_ENVIRONMENT_MISMATCH';
                }), mismatch);

                var immutable = freezeActivationOutput({ list: [{ stable: true }] });
                record('immutable outputs enforced', Object.isFrozen(immutable) && Object.isFrozen(immutable.list), immutable);

                var critical = classifyActivationRisk([safeFailure('X', 'CRITICAL_BLOCKER', 'critical')], []);
                record('critical blockers classified correctly', critical === 'CRITICAL_BLOCKER', critical);

                var malformed = validateEnvironmentReadiness('bad-payload');
                record('malformed payloads handled safely', malformed.ready === false && malformed.failures.length > 0, malformed);

                var parity = verifyEnvironmentParity({
                    staging: {
                        configuration: { runtime: 'supabase' },
                        featureFlags: { USE_SUPABASE_AUTH: true },
                        schemaVersion: 'v1',
                        migrationVersion: 'm1',
                        permissions: { hr: 'tenant-scoped' },
                        serviceDependencies: { database: 'ready' }
                    },
                    production: {
                        configuration: { runtime: 'supabase' },
                        featureFlags: { USE_SUPABASE_AUTH: true },
                        schemaVersion: 'v1',
                        migrationVersion: 'm1',
                        permissions: { hr: 'tenant-scoped' },
                        serviceDependencies: { database: 'ready' }
                    }
                });
                record('environment parity works', parity.environmentConsistent === true && parity.environmentConsistencyScore === 100, parity);

                var promotionBlocked = validatePromotionEligibility({
                    promotionId: 'PROMO-SELF-TEST',
                    fromEnvironment: 'STAGING',
                    targetEnvironment: 'FULL_PRODUCTION',
                    criticalIncidentExists: true,
                    deploymentValidated: false,
                    rollbackReady: false,
                    environmentParity: parity
                }, { actor: { role: 'PLATFORM_OWNER' } });
                record('promotion blocking works', promotionBlocked.eligible === false && promotionBlocked.failures.some(function blocker(item) {
                    return item.failureCode === 'CRITICAL_INCIDENT_BLOCKS_PROMOTION';
                }), promotionBlocked);

                var confidence = calculatePromotionConfidence({
                    readinessCertified: true,
                    deploymentValidated: true,
                    rolloutStabilized: true,
                    migrationVerified: true,
                    rbacValidated: true,
                    auditValidated: true,
                    healthValidated: true,
                    rollbackReady: true,
                    environmentParity: parity
                });
                record('confidence scoring works', confidence.promotionConfidenceScore >= 90 && confidence.promotionBlocked === false, confidence);

                var promotionImmutable = freezePromotionOutput({ rows: [{ immutable: true }] });
                record('promotion immutable outputs enforced', Object.isFrozen(promotionImmutable) && Object.isFrozen(promotionImmutable.rows), promotionImmutable);

                var dependencyAbsence = generateEnvironmentPromotionReport({
                    promotionId: 'PROMO-DEPS',
                    fromEnvironment: 'STAGING',
                    targetEnvironment: 'FULL_PRODUCTION',
                    readinessCertified: true,
                    deploymentValidated: true,
                    rolloutStabilized: true,
                    migrationVerified: true,
                    rbacValidated: true,
                    auditValidated: true,
                    healthValidated: true,
                    rollbackReady: true,
                    environmentParity: parity
                }, { actor: { role: 'PLATFORM_OWNER' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
                record('dependency absence handled safely', dependencyAbsence.success === true && dependencyAbsence.governanceIntegrations.productionReadinessIntegrated === false, dependencyAbsence);
            } catch (error) {
                record('self-test has no uncaught failure', false, error && error.message ? error.message : safeString(error, 'unknown self-test error'));
            }
            try {
                var frozenChecks = Object.freeze(checks.slice());
                var passed = checks.every(function allPassed(item) { return item.passed; });
                global.__ARTHHRMS_ENVIRONMENT_ACTIVATION_SELF_TEST__ = Object.freeze({
                    passed: passed,
                    tests: frozenChecks
                });
                global.__ARTHHRMS_ENVIRONMENT_PROMOTION_SELF_TEST__ = Object.freeze({
                    passed: passed,
                    tests: frozenChecks.filter(function promotionTest(item) {
                        return /promotion|parity|confidence|dependency/.test(safeString(item.name, '').toLowerCase());
                    })
                });
            } catch (error) {
                safeWarn('Self-test result storage failed safely.', { error: error && error.message });
            }
        })();
    }
})(typeof window !== 'undefined' ? window : globalThis);
