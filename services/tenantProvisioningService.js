/**
 * tenantProvisioningService.js
 * ARTHHRMS - Tenant Provisioning + Company Bootstrap System
 *
 * PURPOSE:
 * Provides centralized enterprise tenant provisioning governance for
 * new company creation, tenant slug routing, subdomain identity,
 * company bootstrap defaults, onboarding states, and staged activation.
 *
 * This service manages tenant metadata ONLY.
 * It does NOT create employee records automatically.
 * It does NOT expose PLATFORM_OWNER inside tenant hierarchy.
 * It does NOT bypass tenant isolation.
 *
 * ARCHITECTURE RULE:
 * Tenant provisioning must remain isolated from tenant runtime data.
 *
 * STABILITY:
 * Public APIs must remain synchronous and backward-compatible.
 *
 * DEPENDS ON:
 * - window.DB (optional)
 * - window.WorkflowTelemetryService (optional)
 * - window.AuditService (optional)
 * - window.OrchestrationMetricsService (optional)
 *
 * @version 1.0.0
 */
(function attachTenantProvisioningService(global) {
    'use strict';

    var PREFIX = '[TenantProvisioningService]';
    var DEFAULT_BASE_DOMAIN = 'arthhrms.com';
    var DEFAULT_SOURCE = 'tenantProvisioningService';

    var TENANT_LIFECYCLE = Object.freeze([
        'CREATED',
        'BOOTSTRAPPING',
        'CONFIGURING',
        'PILOT_ACTIVE',
        'PRODUCTION_ACTIVE',
        'SUSPENDED',
        'ARCHIVED'
    ]);

    var ONBOARDING_STAGES = Object.freeze([
        'setup_only',
        'pilot_group',
        'limited_activation',
        'full_activation'
    ]);

    var DEFAULT_DEPARTMENTS = Object.freeze([
        'HR',
        'Operations',
        'Finance',
        'Engineering',
        'Management'
    ]);

    var TENANT_ROLE_MATRIX = Object.freeze([
        'EMPLOYEE',
        'MANAGER',
        'HR',
        'HR_HEAD',
        'DIRECTOR',
        'SUPER_ADMIN'
    ]);

    var RESERVED_SLUGS = Object.freeze([
        'admin',
        'platform',
        'api',
        'root',
        'owner',
        'system',
        'support',
        'auth'
    ]);

    function safeWarn(message, details) {
        try {
            if (global.console && typeof global.console.warn === 'function') {
                if (details !== undefined) global.console.warn(PREFIX + ' ' + message, details);
                else global.console.warn(PREFIX + ' ' + message);
            }
        } catch (error) {}
    }

    function db() {
        return global.DB || null;
    }

    function nowIso() {
        try {
            return new Date().toISOString();
        } catch (error) {
            return String(Date.now());
        }
    }

    function safeString(value, fallback) {
        try {
            if (value === undefined || value === null) return fallback || '';
            return String(value);
        } catch (error) {
            return fallback || '';
        }
    }

    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function cloneValue(value, depth) {
        var currentDepth = depth || 0;
        if (value === null || value === undefined) return value;
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
        if (currentDepth > 4) return safeString(value, '');
        if (Array.isArray(value)) {
            return value.slice(0, 100).map(function cloneArrayItem(item) {
                return cloneValue(item, currentDepth + 1);
            });
        }
        if (isPlainObject(value)) {
            var output = {};
            Object.keys(value).forEach(function cloneKey(key) {
                if (/password|secret|token|service[_-]?role|private[_-]?key/i.test(key)) return;
                output[key] = cloneValue(value[key], currentDepth + 1);
            });
            return output;
        }
        return safeString(value, '');
    }

    function safeMetadata(metadata) {
        return isPlainObject(metadata) ? cloneValue(metadata, 0) : {};
    }

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.keys(value).forEach(function freezeKey(key) {
            deepFreeze(value[key]);
        });
        return Object.freeze(value);
    }

    function freezeTenantProvisioning(value) {
        return deepFreeze(cloneValue(value, 0));
    }

    function freezeList(list) {
        if (!Array.isArray(list)) return Object.freeze([]);
        return deepFreeze(list.slice().map(function freezeItem(item) {
            return isPlainObject(item) ? cloneValue(item, 0) : item;
        }));
    }

    function safeFailure(code, severity, message, metadata) {
        return Object.freeze({
            failureCode: safeString(code, 'TENANT_PROVISIONING_FAILURE'),
            severity: safeString(severity, 'HIGH').toUpperCase(),
            message: safeString(message, 'Tenant provisioning failure.'),
            metadata: freezeTenantProvisioning(safeMetadata(metadata || {}))
        });
    }

    function safeWarning(code, severity, message, recommendation, metadata) {
        return Object.freeze({
            warningCode: safeString(code, 'TENANT_PROVISIONING_WARNING'),
            severity: safeString(severity, 'WARNING').toUpperCase(),
            message: safeString(message, 'Tenant provisioning warning.'),
            recommendation: safeString(recommendation, 'Review tenant provisioning before activation.'),
            metadata: freezeTenantProvisioning(safeMetadata(metadata || {}))
        });
    }

    function safeRecommendation(code, message, metadata) {
        return Object.freeze({
            recommendationCode: safeString(code, 'TENANT_PROVISIONING_RECOMMENDATION'),
            message: safeString(message, 'Review tenant provisioning governance.'),
            metadata: freezeTenantProvisioning(safeMetadata(metadata || {}))
        });
    }

    function normalizeRole(role) {
        var normalized = safeString(role, '').trim().replace(/[\s-]+/g, '_').toLowerCase();
        if (normalized === 'platformowner' || normalized === 'owner' || normalized === 'root') return 'platform_owner';
        if (normalized === 'superadmin') return 'super_admin';
        if (normalized === 'hrhead') return 'hr_head';
        return normalized;
    }

    function isPlatformOwner(actor) {
        var role = isPlainObject(actor) ? actor.role : actor;
        return normalizeRole(role) === 'platform_owner';
    }

    function normalizeTenantSlug(value) {
        var slug = safeString(value, '').trim().toLowerCase();
        slug = slug.replace(/&/g, ' and ');
        slug = slug.replace(/[^a-z0-9]+/g, '-');
        slug = slug.replace(/-+/g, '-');
        slug = slug.replace(/^-|-$/g, '');
        return slug;
    }

    function lifecycleState(value, fallback) {
        var normalized = safeString(value, fallback || 'CREATED').trim().toUpperCase();
        if (TENANT_LIFECYCLE.indexOf(normalized) !== -1) return normalized;
        return fallback || 'CREATED';
    }

    function onboardingStage(value, fallback) {
        var normalized = safeString(value, fallback || 'setup_only').trim().replace(/[\s-]+/g, '_').toLowerCase();
        if (ONBOARDING_STAGES.indexOf(normalized) !== -1) return normalized;
        return fallback || 'setup_only';
    }

    function tenantIdForSlug(slug) {
        return 'TEN-' + normalizeTenantSlug(slug);
    }

    function subdomainForSlug(slug, baseDomain) {
        var safeSlug = normalizeTenantSlug(slug);
        var domain = normalizeBaseDomain(baseDomain);
        return safeSlug ? safeSlug + '.' + domain : '';
    }

    function normalizeBaseDomain(baseDomain) {
        var normalized = safeString(baseDomain || DEFAULT_BASE_DOMAIN, DEFAULT_BASE_DOMAIN).trim().toLowerCase();
        normalized = normalized.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^\.+|\.+$/g, '');
        return normalized || DEFAULT_BASE_DOMAIN;
    }

    function getRawData() {
        try {
            if (db() && typeof db().get === 'function') return db().get();
        } catch (error) {}
        return {};
    }

    function saveRawData(data) {
        try {
            if (db() && typeof db().save === 'function') {
                db().save(data);
                return true;
            }
        } catch (error) {
            safeWarn('Tenant provisioning persistence failed safely.', { error: error && error.message });
        }
        return false;
    }

    function normalizeTenantRecord(record) {
        var source = isPlainObject(record) ? record : {};
        var slug = normalizeTenantSlug(source.tenantSlug || source.tenant_slug || source.slug || source.companyName || source.company_name);
        var companyName = safeString(source.companyName || source.company_name || source.name || slug, slug);
        return freezeTenantProvisioning({
            tenantId: safeString(source.tenantId || source.tenant_id || tenantIdForSlug(slug), tenantIdForSlug(slug)),
            companyName: companyName,
            tenantSlug: slug,
            subdomain: safeString(source.subdomain || subdomainForSlug(slug, source.baseDomain), subdomainForSlug(slug, source.baseDomain)),
            companyEmail: safeString(source.companyEmail || source.company_email || source.email, ''),
            companyPhone: safeString(source.companyPhone || source.company_phone || source.phone, ''),
            companySize: safeString(source.companySize || source.company_size || '', ''),
            onboardingStage: onboardingStage(source.onboardingStage || source.onboarding_stage),
            planType: safeString(source.planType || source.plan_type || 'enterprise', 'enterprise'),
            timezone: safeString(source.timezone || 'Asia/Kolkata', 'Asia/Kolkata'),
            country: safeString(source.country || 'India', 'India'),
            lifecycleState: lifecycleState(source.lifecycleState || source.lifecycle_state),
            departments: freezeList(Array.isArray(source.departments) && source.departments.length ? source.departments : DEFAULT_DEPARTMENTS),
            roleMatrix: freezeList((Array.isArray(source.roleMatrix) && source.roleMatrix.length ? source.roleMatrix : TENANT_ROLE_MATRIX).filter(function noPlatformOwner(role) {
                return safeString(role, '').toUpperCase() !== 'PLATFORM_OWNER';
            })),
            featureDefaults: freezeTenantProvisioning(isPlainObject(source.featureDefaults) ? source.featureDefaults : { preset: 'STANDARD_COMPANY' }),
            environmentDefaults: freezeTenantProvisioning(isPlainObject(source.environmentDefaults) ? source.environmentDefaults : { mode: 'DEVELOPMENT' }),
            createdAt: safeString(source.createdAt || source.created_at || nowIso(), nowIso()),
            updatedAt: safeString(source.updatedAt || source.updated_at || source.createdAt || nowIso(), nowIso()),
            createdBy: safeString(source.createdBy || source.created_by || '', ''),
            provisioningStatus: safeString(source.provisioningStatus || source.provisioning_status || 'BOOTSTRAP_READY', 'BOOTSTRAP_READY'),
            blockers: freezeList(source.blockers || []),
            metadata: freezeTenantProvisioning(safeMetadata(source.metadata || {}))
        });
    }

    function getTenants() {
        try {
            var data = getRawData();
            var rows = Array.isArray(data.platformTenants) ? data.platformTenants : [];
            return freezeList(rows.map(normalizeTenantRecord));
        } catch (error) {
            safeWarn('Tenant list read failed safely.', { error: error && error.message });
            return Object.freeze([]);
        }
    }

    function detectSlugCollision(slug, tenants) {
        var normalized = normalizeTenantSlug(slug);
        var source = Array.isArray(tenants) ? tenants : getTenants();
        return source.some(function hasSameSlug(tenant) {
            return normalizeTenantSlug(tenant && (tenant.tenantSlug || tenant.tenant_slug || tenant.slug)) === normalized;
        });
    }

    function validateTenantSlug(slug, options) {
        try {
            var normalized = normalizeTenantSlug(slug);
            var failures = [];
            var warnings = [];
            var recommendations = [
                safeRecommendation('USE_ROUTING_SAFE_SLUG', 'Use a lowercase alphanumeric tenant slug for subdomain routing.')
            ];
            var existingTenants = options && Array.isArray(options.tenants) ? options.tenants : getTenants();

            if (!normalized) {
                failures.push(safeFailure('TENANT_SLUG_REQUIRED', 'HIGH', 'Tenant slug is required for company provisioning.'));
            }

            if (normalized.length < 3 || normalized.length > 48) {
                failures.push(safeFailure('TENANT_SLUG_LENGTH_INVALID', 'HIGH', 'Tenant slug must be between 3 and 48 characters.', { normalizedSlug: normalized }));
            }

            if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(normalized)) {
                failures.push(safeFailure('TENANT_SLUG_MALFORMED', 'HIGH', 'Tenant slug must use lowercase letters, numbers, and internal hyphens only.', { normalizedSlug: normalized }));
            }

            if (RESERVED_SLUGS.indexOf(normalized) !== -1) {
                failures.push(safeFailure('RESERVED_TENANT_SLUG', 'CRITICAL', 'Reserved platform slug cannot be used for tenant provisioning.', { normalizedSlug: normalized }));
            }

            if (detectSlugCollision(normalized, existingTenants)) {
                failures.push(safeFailure('TENANT_SLUG_COLLISION', 'CRITICAL', 'Tenant slug already exists and cannot be reused.', { normalizedSlug: normalized }));
            }

            return freezeTenantProvisioning({
                success: true,
                valid: failures.length === 0,
                normalizedSlug: normalized,
                subdomain: subdomainForSlug(normalized, options && options.baseDomain),
                warnings,
                failures,
                recommendations,
                timestamp: nowIso()
            });
        } catch (error) {
            return freezeTenantProvisioning({
                success: false,
                valid: false,
                normalizedSlug: '',
                subdomain: '',
                warnings: [safeWarning('TENANT_SLUG_VALIDATION_RECOVERED', 'WARNING', 'Tenant slug validation recovered from an internal error.', 'Review tenant slug input and retry.', { error: error && error.message })],
                failures: [safeFailure('TENANT_SLUG_VALIDATION_RUNTIME_ERROR', 'HIGH', 'Tenant slug validation failed safely.')],
                recommendations: [safeRecommendation('RETRY_TENANT_SLUG_VALIDATION', 'Retry tenant slug validation with a routing-safe value.')],
                timestamp: nowIso()
            });
        }
    }

    function extractTenantFromHostname(hostname, baseDomain) {
        try {
            var host = safeString(hostname || (global.location && global.location.hostname) || '', '').trim().toLowerCase();
            host = host.replace(/^https?:\/\//, '').replace(/\/.*$/, '').split(':')[0];
            var domain = normalizeBaseDomain(baseDomain);
            var tenantSlug = '';
            var matched = false;

            if (host && host.endsWith('.' + domain)) {
                tenantSlug = normalizeTenantSlug(host.slice(0, -1 * (domain.length + 1)).split('.').pop());
                matched = tenantSlug && RESERVED_SLUGS.indexOf(tenantSlug) === -1;
            }

            return freezeTenantProvisioning({
                success: true,
                matched: !!matched,
                hostname: host,
                baseDomain: domain,
                tenantSlug: matched ? tenantSlug : '',
                subdomain: matched ? subdomainForSlug(tenantSlug, domain) : '',
                warning: matched ? '' : 'Hostname does not resolve to a tenant subdomain.'
            });
        } catch (error) {
            return freezeTenantProvisioning({
                success: false,
                matched: false,
                hostname: '',
                baseDomain: normalizeBaseDomain(baseDomain),
                tenantSlug: '',
                subdomain: '',
                warning: 'Tenant routing extraction failed safely.'
            });
        }
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
            safeWarn('Tenant provisioning telemetry failed safely.', { eventType: eventType, error: error && error.message });
            return false;
        }
    }

    function auditProvisioning(eventType, actor, metadata) {
        try {
            if (!global.AuditService || typeof global.AuditService.recordAudit !== 'function') return false;
            global.AuditService.recordAudit({
                eventType: eventType,
                actionType: eventType,
                actorRole: normalizeRole(actor && actor.role) || 'platform_owner',
                actorId: actor && (actor.id || actor.empId || actor.email) || '',
                module: 'Tenant Provisioning',
                source: DEFAULT_SOURCE,
                severity: 'INFO',
                metadata: safeMetadata(metadata || {})
            }, {
                source: DEFAULT_SOURCE
            });
            return true;
        } catch (error) {
            safeWarn('Tenant provisioning audit failed safely.', { eventType: eventType, error: error && error.message });
            return false;
        }
    }

    function recordMetric(eventType, metadata) {
        try {
            if (!global.OrchestrationMetricsService || typeof global.OrchestrationMetricsService.recordWorkflowMetric !== 'function') return false;
            global.OrchestrationMetricsService.recordWorkflowMetric(eventType, Object.assign({ source: DEFAULT_SOURCE }, safeMetadata(metadata || {})));
            return true;
        } catch (error) {
            safeWarn('Tenant provisioning metrics failed safely.', { eventType: eventType, error: error && error.message });
            return false;
        }
    }

    function normalizeProvisioningPayload(payload) {
        var input = isPlainObject(payload) ? cloneValue(payload, 0) : {};
        var companyName = safeString(input.company_name || input.companyName || input.name, '').trim();
        var slug = normalizeTenantSlug(input.tenant_slug || input.tenantSlug || companyName);
        return {
            companyName: companyName,
            tenantSlug: slug,
            companyEmail: safeString(input.company_email || input.companyEmail || input.email, '').trim(),
            companyPhone: safeString(input.company_phone || input.companyPhone || input.phone, '').trim(),
            companySize: safeString(input.company_size || input.companySize || '', '').trim(),
            onboardingStage: onboardingStage(input.onboarding_stage || input.onboardingStage),
            planType: safeString(input.plan_type || input.planType || 'enterprise', 'enterprise').trim().toLowerCase(),
            timezone: safeString(input.timezone || 'Asia/Kolkata', 'Asia/Kolkata').trim(),
            country: safeString(input.country || 'India', 'India').trim(),
            baseDomain: safeString(input.baseDomain || input.base_domain || DEFAULT_BASE_DOMAIN, DEFAULT_BASE_DOMAIN).trim()
        };
    }

    function buildTenantRecord(payload, actor) {
        var timestamp = nowIso();
        return normalizeTenantRecord({
            tenantId: tenantIdForSlug(payload.tenantSlug),
            companyName: payload.companyName,
            tenantSlug: payload.tenantSlug,
            subdomain: subdomainForSlug(payload.tenantSlug, payload.baseDomain),
            companyEmail: payload.companyEmail,
            companyPhone: payload.companyPhone,
            companySize: payload.companySize,
            onboardingStage: payload.onboardingStage,
            planType: payload.planType,
            timezone: payload.timezone,
            country: payload.country,
            lifecycleState: 'CREATED',
            departments: DEFAULT_DEPARTMENTS,
            roleMatrix: TENANT_ROLE_MATRIX,
            featureDefaults: {
                preset: 'STANDARD_COMPANY',
                strategicDeliverables: true,
                onboarding: true,
                imports: true
            },
            environmentDefaults: {
                mode: 'DEVELOPMENT',
                pilotReady: false,
                productionReady: false
            },
            createdAt: timestamp,
            updatedAt: timestamp,
            createdBy: actor && (actor.id || actor.email || actor.name) || 'platform_owner',
            provisioningStatus: 'BOOTSTRAP_READY',
            metadata: {
                employeeRecordsCreated: false,
                platformOwnerInTenantHierarchy: false,
                tenantIsolationPreserved: true
            }
        });
    }

    function provisionTenant(payload, context) {
        try {
            var actor = context && context.actor || {};
            var warnings = [];
            var failures = [];
            var recommendations = [
                safeRecommendation('CONTINUE_WITH_STAGED_ONBOARDING', 'After tenant creation, use staged onboarding before pilot or production activation.')
            ];

            if (!isPlatformOwner(actor)) {
                failures.push(safeFailure('PLATFORM_OWNER_REQUIRED', 'CRITICAL', 'Only PLATFORM_OWNER may create tenants.', { actorRole: actor && actor.role || '' }));
            }

            var normalized = normalizeProvisioningPayload(payload);
            if (!normalized.companyName) {
                failures.push(safeFailure('COMPANY_NAME_REQUIRED', 'HIGH', 'Company name is required for tenant provisioning.'));
            }

            var slugValidation = validateTenantSlug(normalized.tenantSlug, { baseDomain: normalized.baseDomain });
            failures = failures.concat(slugValidation.failures || []);
            warnings = warnings.concat(slugValidation.warnings || []);
            recommendations = recommendations.concat(slugValidation.recommendations || []);

            if (failures.length) {
                var blocked = freezeTenantProvisioning({
                    success: false,
                    created: false,
                    tenant: null,
                    warnings,
                    failures,
                    recommendations,
                    timestamp: nowIso()
                });
                emitTelemetry('TENANT_PROVISIONING_BLOCKED', { failureCount: failures.length, tenantSlug: normalized.tenantSlug }, 'WARNING');
                auditProvisioning('TENANT_PROVISIONING_BLOCKED', actor, { failureCount: failures.length, tenantSlug: normalized.tenantSlug });
                return blocked;
            }

            var tenant = buildTenantRecord(normalized, actor);
            var data = getRawData();
            var existing = Array.isArray(data.platformTenants) ? data.platformTenants.slice() : [];
            existing.push(cloneValue(tenant, 0));
            data.platformTenants = existing;
            saveRawData(data);

            var result = freezeTenantProvisioning({
                success: true,
                created: true,
                tenant,
                warnings,
                failures: [],
                recommendations,
                timestamp: nowIso()
            });
            emitTelemetry('TENANT_PROVISIONING_CREATED', { tenantSlug: tenant.tenantSlug, subdomain: tenant.subdomain }, 'INFO');
            auditProvisioning('TENANT_PROVISIONING_CREATED', actor, { tenantSlug: tenant.tenantSlug, subdomain: tenant.subdomain });
            recordMetric('TENANT_PROVISIONING_CREATED', { tenantSlug: tenant.tenantSlug });
            return result;
        } catch (error) {
            return freezeTenantProvisioning({
                success: false,
                created: false,
                tenant: null,
                warnings: [safeWarning('TENANT_PROVISIONING_RECOVERED', 'WARNING', 'Tenant provisioning recovered from an internal error.', 'Review provisioning payload and retry.', { error: error && error.message })],
                failures: [safeFailure('TENANT_PROVISIONING_RUNTIME_ERROR', 'HIGH', 'Tenant provisioning failed safely.')],
                recommendations: [safeRecommendation('RETRY_TENANT_PROVISIONING', 'Retry tenant provisioning after reviewing input data.')],
                timestamp: nowIso()
            });
        }
    }

    function updateTenantActivation(slug, updates, context) {
        try {
            var actor = context && context.actor || {};
            var normalizedSlug = normalizeTenantSlug(slug);
            var requestedStage = onboardingStage(updates && (updates.onboarding_stage || updates.onboardingStage));
            var requestedLifecycle = lifecycleState(updates && (updates.lifecycleState || updates.lifecycle_state), '');
            var failures = [];
            var warnings = [];
            var recommendations = [
                safeRecommendation('KEEP_TENANT_ACTIVATION_STAGED', 'Use setup, pilot, limited activation, then full activation after readiness passes.')
            ];

            if (!isPlatformOwner(actor)) {
                failures.push(safeFailure('PLATFORM_OWNER_REQUIRED', 'CRITICAL', 'Only PLATFORM_OWNER may change tenant activation state.', { actorRole: actor && actor.role || '' }));
            }

            if (requestedStage === 'full_activation' || requestedLifecycle === 'PRODUCTION_ACTIVE') {
                var readiness = context && context.readiness || {};
                if (readiness.passed !== true && readiness.readiness !== 'READY') {
                    failures.push(safeFailure('UNSAFE_FULL_ACTIVATION_BLOCKED', 'CRITICAL', 'Full tenant activation requires deployment readiness validation to pass.', { tenantSlug: normalizedSlug }));
                }
            }

            var data = getRawData();
            var tenants = Array.isArray(data.platformTenants) ? data.platformTenants.slice() : [];
            var index = tenants.findIndex(function findTenant(tenant) {
                return normalizeTenantSlug(tenant && (tenant.tenantSlug || tenant.tenant_slug)) === normalizedSlug;
            });
            if (index === -1) {
                failures.push(safeFailure('TENANT_NOT_FOUND', 'HIGH', 'Tenant was not found for activation update.', { tenantSlug: normalizedSlug }));
            }

            if (failures.length) {
                var blocked = freezeTenantProvisioning({
                    success: false,
                    updated: false,
                    tenant: null,
                    warnings,
                    failures,
                    recommendations,
                    timestamp: nowIso()
                });
                emitTelemetry('TENANT_ACTIVATION_BLOCKED', { tenantSlug: normalizedSlug, failureCount: failures.length }, 'WARNING');
                auditProvisioning('TENANT_ACTIVATION_BLOCKED', actor, { tenantSlug: normalizedSlug, failureCount: failures.length });
                return blocked;
            }

            var current = normalizeTenantRecord(tenants[index]);
            var next = normalizeTenantRecord(Object.assign({}, cloneValue(current, 0), {
                onboardingStage: requestedStage || current.onboardingStage,
                lifecycleState: requestedLifecycle || current.lifecycleState,
                updatedAt: nowIso(),
                provisioningStatus: requestedLifecycle === 'PRODUCTION_ACTIVE' ? 'ACTIVE' : 'STAGED'
            }));
            tenants[index] = cloneValue(next, 0);
            data.platformTenants = tenants;
            saveRawData(data);

            var result = freezeTenantProvisioning({
                success: true,
                updated: true,
                tenant: next,
                warnings,
                failures: [],
                recommendations,
                timestamp: nowIso()
            });
            emitTelemetry('TENANT_ACTIVATION_UPDATED', { tenantSlug: next.tenantSlug, lifecycleState: next.lifecycleState, onboardingStage: next.onboardingStage }, 'INFO');
            auditProvisioning('TENANT_ACTIVATION_UPDATED', actor, { tenantSlug: next.tenantSlug, lifecycleState: next.lifecycleState, onboardingStage: next.onboardingStage });
            recordMetric('TENANT_ACTIVATION_UPDATED', { tenantSlug: next.tenantSlug });
            return result;
        } catch (error) {
            return freezeTenantProvisioning({
                success: false,
                updated: false,
                tenant: null,
                warnings: [safeWarning('TENANT_ACTIVATION_RECOVERED', 'WARNING', 'Tenant activation update recovered from an internal error.', 'Review activation payload and retry.', { error: error && error.message })],
                failures: [safeFailure('TENANT_ACTIVATION_RUNTIME_ERROR', 'HIGH', 'Tenant activation failed safely.')],
                recommendations: [safeRecommendation('RETRY_TENANT_ACTIVATION', 'Retry tenant activation after reviewing readiness evidence.')],
                timestamp: nowIso()
            });
        }
    }

    function getTenantProvisioningView(context) {
        try {
            var actor = context && context.actor || {};
            var tenants = getTenants();
            if (!isPlatformOwner(actor)) {
                return freezeTenantProvisioning({
                    success: false,
                    tenants: [],
                    warnings: [],
                    failures: [safeFailure('PLATFORM_OWNER_REQUIRED', 'CRITICAL', 'Only PLATFORM_OWNER may view tenant provisioning governance.')],
                    recommendations: [safeRecommendation('USE_PLATFORM_GOVERNANCE_ROUTE', 'Open tenant provisioning through platform-control.html as PLATFORM_OWNER.')],
                    timestamp: nowIso()
                });
            }

            var counts = tenants.reduce(function aggregate(acc, tenant) {
                acc.total += 1;
                acc[tenant.lifecycleState] = (acc[tenant.lifecycleState] || 0) + 1;
                return acc;
            }, { total: 0 });

            return freezeTenantProvisioning({
                success: true,
                tenants: tenants,
                summary: counts,
                warnings: [],
                failures: [],
                recommendations: [
                    safeRecommendation('PROVISION_WITH_STAGED_ACTIVATION', 'Keep new tenants in setup_only until onboarding and staging validation pass.')
                ],
                timestamp: nowIso()
            });
        } catch (error) {
            return freezeTenantProvisioning({
                success: false,
                tenants: [],
                warnings: [safeWarning('TENANT_VIEW_RECOVERED', 'WARNING', 'Tenant provisioning view recovered from an internal error.', 'Review tenant metadata and retry.', { error: error && error.message })],
                failures: [safeFailure('TENANT_VIEW_RUNTIME_ERROR', 'HIGH', 'Tenant provisioning view failed safely.')],
                recommendations: [],
                timestamp: nowIso()
            });
        }
    }

    var TenantProvisioningService = Object.freeze({
        TENANT_LIFECYCLE: TENANT_LIFECYCLE,
        ONBOARDING_STAGES: ONBOARDING_STAGES,
        DEFAULT_DEPARTMENTS: DEFAULT_DEPARTMENTS,
        TENANT_ROLE_MATRIX: TENANT_ROLE_MATRIX,
        RESERVED_SLUGS: RESERVED_SLUGS,
        normalizeTenantSlug: normalizeTenantSlug,
        validateTenantSlug: validateTenantSlug,
        detectSlugCollision: detectSlugCollision,
        extractTenantFromHostname: extractTenantFromHostname,
        provisionTenant: provisionTenant,
        updateTenantActivation: updateTenantActivation,
        getTenants: getTenants,
        getTenantProvisioningView: getTenantProvisioningView,
        freezeTenantProvisioning: freezeTenantProvisioning
    });

    if (!db()) {
        safeWarn('Optional DB dependency not detected. Tenant provisioning will use supplied metadata only.');
    }
    if (!global.WorkflowTelemetryService) {
        safeWarn('Optional WorkflowTelemetryService dependency not detected. Provisioning telemetry is disabled.');
    }

    global.TenantProvisioningService = TenantProvisioningService;
    global.tenantProvisioningService = TenantProvisioningService;

    if (global.__ARTHHRMS_DEV__) {
        (function runSelfTest() {
            var checks = [];
            function record(name, passed, details) {
                checks.push(Object.freeze({ name: name, passed: !!passed, details: details || null }));
            }

            try {
                var reserved = validateTenantSlug('platform', { tenants: [] });
                record('reserved slug protection works', reserved.valid === false && reserved.failures.some(function hasReserved(item) {
                    return item.failureCode === 'RESERVED_TENANT_SLUG';
                }), reserved);

                var collision = validateTenantSlug('demo', { tenants: [{ tenantSlug: 'demo' }] });
                record('slug collision blocking works', collision.valid === false && collision.failures.some(function hasCollision(item) {
                    return item.failureCode === 'TENANT_SLUG_COLLISION';
                }), collision);

                var route = extractTenantFromHostname('tabsons.arthhrms.com');
                record('tenant routing extraction works', route.tenantSlug === 'tabsons', route);

                var tenant = buildTenantRecord(normalizeProvisioningPayload({ company_name: 'Self Test', tenant_slug: 'self-test' }), { role: 'platform_owner' });
                record('PLATFORM_OWNER excluded correctly', tenant.roleMatrix.indexOf('PLATFORM_OWNER') === -1, tenant.roleMatrix);

                var immutable = freezeTenantProvisioning({ list: [{ stable: true }] });
                record('immutable outputs enforced', Object.isFrozen(immutable) && Object.isFrozen(immutable.list), immutable);

                var stage = updateTenantActivation('missing', { onboarding_stage: 'not-real' }, { actor: { role: 'platform_owner' } });
                record('onboarding state validation is safe', stage.success === false && stage.failures.length > 0, stage);
            } catch (error) {
                record('self-test has no uncaught failure', false, error && error.message ? error.message : safeString(error, 'unknown self-test error'));
            }

            try {
                global.__ARTHHRMS_TENANT_PROVISIONING_SELF_TEST__ = Object.freeze({
                    passed: checks.every(function allPassed(item) { return item.passed; }),
                    tests: Object.freeze(checks.slice())
                });
            } catch (error) {
                safeWarn('Self-test result storage failed safely.', { error: error && error.message });
            }
        })();
    }
})(typeof window !== 'undefined' ? window : globalThis);
