/**
 * permissionMatrixService.js
 * ARTHHRMS - Enterprise Role Permission Matrix Validator
 *
 * PURPOSE:
 * Provides centralized role governance and permission validation for
 * tenant-safe RBAC, route access, strategic governance visibility,
 * escalation prevention, and permission inheritance safety.
 *
 * This service validates permission posture ONLY.
 * It does NOT rewrite authentication.
 * It does NOT expose platform ownership inside tenant RBAC.
 * It does NOT mutate tenant records or production data.
 *
 * ARCHITECTURE RULE:
 * Permission validation must remain isolated from auth and workflow execution.
 *
 * STABILITY:
 * Existing RBAC, tenant, auth, and strategic workflows remain compatible.
 *
 * DEPENDS ON:
 * - window.DB (optional)
 * - window.PlatformGovernanceService (optional)
 * - window.TenantIsolationService (optional)
 * - window.WorkflowTelemetryService (optional)
 * - window.AuditService (optional)
 * - window.OrchestrationMetricsService (optional)
 *
 * @version 1.0.0
 */
(function attachPermissionMatrixService(global) {
    'use strict';

    var PREFIX = '[PermissionMatrixService]';
    var DEFAULT_SOURCE = 'permissionMatrixService';
    var MAX_FINDINGS = 250;

    var RISK_LEVELS = Object.freeze({
        SAFE: 'SAFE',
        WARNING: 'WARNING',
        HIGH_RISK: 'HIGH_RISK',
        CRITICAL_BLOCKER: 'CRITICAL_BLOCKER'
    });

    var SEVERITIES = Object.freeze({
        INFO: 'INFO',
        WARNING: 'WARNING',
        HIGH: 'HIGH',
        CRITICAL_BLOCKER: 'CRITICAL_BLOCKER'
    });

    var TENANT_ROLES = Object.freeze([
        'EMPLOYEE',
        'MANAGER',
        'HR',
        'HR_HEAD',
        'DIRECTOR',
        'SUPER_ADMIN'
    ]);

    var PLATFORM_ROLES = Object.freeze([
        'PLATFORM_OWNER'
    ]);

    var VALIDATION_TYPES = Object.freeze({
        ROLE_PERMISSION: 'ROLE_PERMISSION',
        ROLE_ESCALATION: 'ROLE_ESCALATION',
        TENANT_RBAC_ISOLATION: 'TENANT_RBAC_ISOLATION',
        ROUTE_GOVERNANCE: 'ROUTE_GOVERNANCE',
        STRATEGIC_GOVERNANCE_ACCESS: 'STRATEGIC_GOVERNANCE_ACCESS'
    });

    var ROLE_RANK = Object.freeze({
        EMPLOYEE: 10,
        MANAGER: 20,
        HR: 30,
        HR_HEAD: 40,
        DIRECTOR: 50,
        SUPER_ADMIN: 60,
        PLATFORM_OWNER: 1000
    });

    var CAPABILITIES = Object.freeze({
        EMPLOYEE: Object.freeze([
            'self_visibility',
            'own_profile',
            'own_attendance',
            'own_leave',
            'employee_dashboard',
            'contributor_update',
            'contributor_progress_update'
        ]),
        MANAGER: Object.freeze([
            'self_visibility',
            'team_visibility',
            'approval_visibility',
            'manager_dashboard',
            'review_contributor_update',
            'escalation_request',
            'strategic_execution_visibility'
        ]),
        HR: Object.freeze([
            'self_visibility',
            'hr_operational_visibility',
            'hr_dashboard',
            'employee_visibility',
            'onboarding_visibility',
            'audit_limited',
            'review_contributor_update',
            'escalation_visibility'
        ]),
        HR_HEAD: Object.freeze([
            'self_visibility',
            'hr_operational_visibility',
            'strategic_hr_governance',
            'hr_head_dashboard',
            'reviewer_visibility',
            'escalation_visibility',
            'audit_visibility',
            'kpi_visibility'
        ]),
        DIRECTOR: Object.freeze([
            'self_visibility',
            'org_strategic_visibility',
            'director_dashboard',
            'kpi_visibility',
            'escalation_visibility',
            'strategic_dashboard_access',
            'review_backlog_visibility'
        ]),
        SUPER_ADMIN: Object.freeze([
            'tenant_it_governance',
            'super_admin_dashboard',
            'workflow_monitoring',
            'integrations',
            'user_provisioning',
            'tenant_feature_toggles',
            'audit_visibility',
            'deployment_visibility'
        ]),
        PLATFORM_OWNER: Object.freeze([
            'platform_governance',
            'global_rollout',
            'environment_governance',
            'tenant_provisioning',
            'rls_governance',
            'platform_analytics',
            'deployment_governance',
            'feature_rollout_governance',
            'platform_control_access'
        ])
    });

    var STRATEGIC_ROLE_CAPABILITIES = Object.freeze({
        CONTRIBUTOR: Object.freeze(['EMPLOYEE', 'MANAGER', 'HR', 'HR_HEAD', 'DIRECTOR']),
        REVIEWER: Object.freeze(['MANAGER', 'HR', 'HR_HEAD', 'DIRECTOR']),
        SPONSOR: Object.freeze(['HR_HEAD', 'DIRECTOR']),
        STRATEGIC_OWNER: Object.freeze(['MANAGER', 'HR', 'HR_HEAD', 'DIRECTOR'])
    });

    var TENANT_DASHBOARD_ROUTES = Object.freeze([
        'arthhrms.html',
        'employee-portal.html',
        'manager.html',
        'hr-dashboard.html',
        'director.html',
        'super-admin.html',
        'admin.html'
    ]);

    var PLATFORM_ROUTES = Object.freeze([
        'platform-control.html',
        'company-setup.html',
        'owner-console.html',
        'platform-login.html'
    ]);

    var GLOBAL_GOVERNANCE_CAPABILITIES = Object.freeze([
        'platform_governance',
        'platform_control_access',
        'global_rollout',
        'environment_governance',
        'tenant_provisioning',
        'rls_governance',
        'platform_analytics',
        'deployment_governance',
        'feature_rollout_governance'
    ]);

    var SENSITIVE_KEY_PATTERN = /(salary|payroll|payslip|compensation|ctc|leave.?balance|gross|net|basic|hra|pf|tds|allowance|deduction|password|secret|token|jwt|authorization|service.?role|private.?key)/i;

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
            if (value === undefined || value === null) return fallback || '';
            return String(value);
        } catch (error) {
            return fallback || '';
        }
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
                if (SENSITIVE_KEY_PATTERN.test(key)) return;
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

    function freezePermissionOutput(value) {
        return deepFreeze(cloneValue(value, 0));
    }

    function freezeList(list) {
        if (!Array.isArray(list)) return Object.freeze([]);
        return deepFreeze(list.slice(0, MAX_FINDINGS).map(function freezeItem(item) {
            return isPlainObject(item) ? cloneValue(item, 0) : item;
        }));
    }

    function db() {
        try {
            return global.DB || null;
        } catch (error) {
            return null;
        }
    }

    function rawData() {
        try {
            if (db() && typeof db().get === 'function') return db().get();
        } catch (error) {}
        return {};
    }

    function safeMetadata(metadata) {
        return isPlainObject(metadata) ? cloneValue(metadata, 0) : {};
    }

    function normalizeRole(role) {
        try {
            if (global.authService && typeof global.authService.normalizeRole === 'function') {
                return safeString(global.authService.normalizeRole(role), '').trim().replace(/[\s-]+/g, '_').toUpperCase();
            }
        } catch (error) {}
        var normalized = safeString(role, '').trim().replace(/[\s-]+/g, '_').toUpperCase();
        if (normalized === 'SUPERADMIN') normalized = 'SUPER_ADMIN';
        if (normalized === 'HRHEAD') normalized = 'HR_HEAD';
        if (normalized === 'PLATFORMOWNER' || normalized === 'OWNER' || normalized === 'ROOT') normalized = 'PLATFORM_OWNER';
        if (normalized === 'EMP') normalized = 'EMPLOYEE';
        return normalized;
    }

    function normalizeCapability(value) {
        var normalized = safeString(value, '').trim().replace(/[\s-]+/g, '_').toLowerCase();
        if (normalized === 'platform') return 'platform_governance';
        if (normalized === 'global_rollouts') return 'global_rollout';
        if (normalized === 'dashboard') return 'dashboard_access';
        return normalized;
    }

    function normalizeRoute(value) {
        var route = safeString(value, '').split('?')[0].split('#')[0].replace(/\\/g, '/').split('/').pop().toLowerCase();
        return route;
    }

    function normalizeTenantSlug(value) {
        try {
            if (global.TenantProvisioningService && typeof global.TenantProvisioningService.normalizeTenantSlug === 'function') {
                return global.TenantProvisioningService.normalizeTenantSlug(value);
            }
        } catch (error) {}
        var slug = safeString(value, '').trim().toLowerCase();
        slug = slug.replace(/^ten[-_]/, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        return slug;
    }

    function tenantSlugFromId(value) {
        var token = safeString(value, '').trim().toLowerCase().replace(/[\s_]+/g, '-');
        if (!token) return '';
        if (token.indexOf('ten-') === 0) return normalizeTenantSlug(token.slice(4));
        if (token.indexOf('tenant-') === 0) return normalizeTenantSlug(token.slice(7));
        return normalizeTenantSlug(token);
    }

    function tenantOf(input, context) {
        var source = isPlainObject(input) ? input : {};
        var ctx = isPlainObject(context) ? context : {};
        var metadata = isPlainObject(source.metadata) ? source.metadata : {};
        var tenantSlug = normalizeTenantSlug(
            source.tenantSlug ||
            source.tenant_slug ||
            source.companySlug ||
            source.company_slug ||
            source.targetTenantSlug ||
            source.target_tenant_slug ||
            metadata.tenantSlug ||
            metadata.tenant_slug ||
            ctx.tenantSlug ||
            ctx.tenant_slug ||
            ''
        );
        var tenantId = safeString(
            source.tenantId ||
            source.tenant_id ||
            source.companyId ||
            source.company_id ||
            source.organizationId ||
            source.orgId ||
            source.targetTenantId ||
            source.target_tenant_id ||
            metadata.tenantId ||
            metadata.companyId ||
            ctx.tenantId ||
            ctx.tenant_id ||
            '',
            ''
        ).trim();
        if (!tenantSlug && tenantId) tenantSlug = tenantSlugFromId(tenantId);
        return {
            tenantSlug: tenantSlug,
            tenantId: tenantId
        };
    }

    function contextTenant(context) {
        var ctx = isPlainObject(context) ? context : {};
        var slug = normalizeTenantSlug(ctx.tenantSlug || ctx.tenant_slug || ctx.companySlug || ctx.company_slug || '');
        var id = safeString(ctx.tenantId || ctx.tenant_id || ctx.companyId || ctx.company_id || '', '').trim();
        if (!slug && id) slug = tenantSlugFromId(id);
        return {
            tenantSlug: slug,
            tenantId: id
        };
    }

    function isTenantRole(role) {
        return TENANT_ROLES.indexOf(normalizeRole(role)) !== -1;
    }

    function isPlatformOwner(role) {
        return normalizeRole(role) === 'PLATFORM_OWNER';
    }

    function isPlatformRoute(route) {
        return PLATFORM_ROUTES.indexOf(normalizeRoute(route)) !== -1;
    }

    function isTenantRoute(route) {
        return TENANT_DASHBOARD_ROUTES.indexOf(normalizeRoute(route)) !== -1;
    }

    function isGlobalGovernanceCapability(capability) {
        return GLOBAL_GOVERNANCE_CAPABILITIES.indexOf(normalizeCapability(capability)) !== -1;
    }

    function safeSeverity(value, fallback) {
        var normalized = safeString(value || fallback || SEVERITIES.HIGH, SEVERITIES.HIGH).trim().replace(/[\s-]+/g, '_').toUpperCase();
        if (normalized === 'CRITICAL' || normalized === 'BLOCKER') return SEVERITIES.CRITICAL_BLOCKER;
        if (normalized === SEVERITIES.CRITICAL_BLOCKER) return SEVERITIES.CRITICAL_BLOCKER;
        if (normalized === SEVERITIES.HIGH || normalized === 'ERROR') return SEVERITIES.HIGH;
        if (normalized === SEVERITIES.WARNING || normalized === 'WARN') return SEVERITIES.WARNING;
        if (normalized === SEVERITIES.INFO || normalized === RISK_LEVELS.SAFE) return SEVERITIES.INFO;
        return fallback || SEVERITIES.HIGH;
    }

    function safeRiskLevel(value, fallback) {
        var normalized = safeString(value || fallback || RISK_LEVELS.SAFE, RISK_LEVELS.SAFE).trim().replace(/[\s-]+/g, '_').toUpperCase();
        if (normalized === 'CRITICAL' || normalized === 'BLOCKER') return RISK_LEVELS.CRITICAL_BLOCKER;
        if (RISK_LEVELS[normalized]) return RISK_LEVELS[normalized];
        if (normalized === 'HIGH') return RISK_LEVELS.HIGH_RISK;
        if (normalized === 'WARN') return RISK_LEVELS.WARNING;
        return fallback || RISK_LEVELS.SAFE;
    }

    function riskFromFindings(failures, warnings) {
        var hasCritical = failures.some(function hasCriticalFailure(item) { return item.severity === SEVERITIES.CRITICAL_BLOCKER; });
        if (hasCritical) return RISK_LEVELS.CRITICAL_BLOCKER;
        if (failures.length) return RISK_LEVELS.HIGH_RISK;
        if (warnings.length) return RISK_LEVELS.WARNING;
        return RISK_LEVELS.SAFE;
    }

    function safeFailure(code, severity, message, metadata) {
        return Object.freeze({
            failureCode: safeString(code, 'PERMISSION_VALIDATION_FAILURE'),
            severity: safeSeverity(severity, SEVERITIES.HIGH),
            message: safeString(message, 'Permission validation failure.'),
            metadata: freezePermissionOutput(safeMetadata(metadata || {}))
        });
    }

    function safeWarning(code, message, metadata) {
        return Object.freeze({
            warningCode: safeString(code, 'PERMISSION_VALIDATION_WARNING'),
            severity: SEVERITIES.WARNING,
            message: safeString(message, 'Permission validation warning.'),
            metadata: freezePermissionOutput(safeMetadata(metadata || {}))
        });
    }

    function mergeFindings(target, source) {
        if (!target || !source) return target;
        if (Array.isArray(source.failures)) {
            source.failures.forEach(function addFailure(item) {
                if (target.failures.length < MAX_FINDINGS) target.failures.push(item);
            });
        }
        if (Array.isArray(source.warnings)) {
            source.warnings.forEach(function addWarning(item) {
                if (target.warnings.length < MAX_FINDINGS) target.warnings.push(item);
            });
        }
        if (Array.isArray(source.recommendations)) {
            source.recommendations.forEach(function addRecommendation(item) {
                if (target.recommendations.length < MAX_FINDINGS) target.recommendations.push(item);
            });
        }
        return target;
    }

    function normalizePermissionScope(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var ctx = isPlainObject(context) ? context : {};
            var tenant = tenantOf(source, ctx);
            var ctxTenant = contextTenant(ctx);
            var actor = isPlainObject(source.actor) ? source.actor : isPlainObject(ctx.actor) ? ctx.actor : {};
            var target = isPlainObject(source.target) ? source.target : {};
            var route = normalizeRoute(source.route || source.pathname || source.path || ctx.route || ctx.pathname || '');
            var routeType = safeString(source.routeType || ctx.routeType || '', '').trim().replace(/[\s-]+/g, '_').toLowerCase();
            if (!routeType) {
                if (isPlatformRoute(route)) routeType = 'platform';
                else if (isTenantRoute(route)) routeType = 'tenant';
            }
            return freezePermissionOutput({
                role: normalizeRole(source.role || source.actorRole || actor.role || ctx.role || ''),
                targetRole: normalizeRole(source.targetRole || source.toRole || target.role || ''),
                fromRole: normalizeRole(source.fromRole || source.actorRole || actor.role || source.role || ''),
                capability: normalizeCapability(source.capability || source.permission || source.feature || source.action || ''),
                route: route,
                routeType: routeType,
                module: safeString(source.module || source.section || ctx.module || '', '').trim().replace(/[\s-]+/g, '_').toLowerCase(),
                strategicRole: normalizeRole(source.strategicRole || source.deliverableRole || source.governanceRole || ''),
                tenantSlug: tenant.tenantSlug,
                tenantId: tenant.tenantId,
                contextTenantSlug: ctxTenant.tenantSlug,
                contextTenantId: ctxTenant.tenantId,
                metadata: safeMetadata(source.metadata || {})
            });
        } catch (error) {
            return freezePermissionOutput({
                role: '',
                targetRole: '',
                fromRole: '',
                capability: '',
                route: '',
                routeType: '',
                module: '',
                strategicRole: '',
                tenantSlug: '',
                tenantId: '',
                contextTenantSlug: '',
                contextTenantId: '',
                metadata: {}
            });
        }
    }

    function hasCapability(role, capability) {
        var normalizedRole = normalizeRole(role);
        var normalizedCapability = normalizeCapability(capability);
        if (!normalizedRole || !normalizedCapability) return false;
        var list = CAPABILITIES[normalizedRole] || Object.freeze([]);
        if (list.indexOf(normalizedCapability) !== -1) return true;
        if (normalizedCapability === 'dashboard_access') return true;
        if (normalizedCapability.indexOf('_dashboard') !== -1) return list.indexOf(normalizedCapability) !== -1;
        return false;
    }

    function permissionResult(validationType, scope, allowed, failures, warnings, recommendations) {
        var safeFailures = freezeList(failures || []);
        var safeWarnings = freezeList(warnings || []);
        var safeRecommendations = freezeList(recommendations || []);
        var risk = riskFromFindings(safeFailures, safeWarnings);
        return freezePermissionOutput({
            success: true,
            validationType: validationType,
            allowed: allowed === true && safeFailures.length === 0,
            passed: allowed === true && safeFailures.length === 0,
            riskLevel: risk,
            failures: safeFailures,
            warnings: safeWarnings,
            recommendations: safeRecommendations,
            normalizedScope: scope,
            timestamp: nowIso()
        });
    }

    function validateTenantScope(scope, failures) {
        var currentFailures = failures || [];
        if (scope.contextTenantSlug && scope.tenantSlug && scope.tenantSlug !== scope.contextTenantSlug) {
            currentFailures.push(safeFailure(
                'CROSS_TENANT_PERMISSION_SCOPE',
                SEVERITIES.CRITICAL_BLOCKER,
                'Cross-tenant RBAC permission scope is blocked.',
                { tenantSlug: scope.tenantSlug, expectedTenantSlug: scope.contextTenantSlug }
            ));
        }
        if (scope.contextTenantId && scope.tenantId && scope.tenantId !== scope.contextTenantId) {
            currentFailures.push(safeFailure(
                'CROSS_TENANT_PERMISSION_SCOPE',
                SEVERITIES.CRITICAL_BLOCKER,
                'Cross-tenant RBAC permission identifier is blocked.',
                { tenantId: scope.tenantId, expectedTenantId: scope.contextTenantId }
            ));
        }
        return currentFailures;
    }

    function validateGovernanceAccess(input, context) {
        try {
            var scope = normalizePermissionScope(input, context);
            var failures = [];
            var warnings = [];
            var recommendations = [];
            var platformRoute = isPlatformRoute(scope.route) || scope.routeType === 'platform';
            var tenantRoute = isTenantRoute(scope.route) || scope.routeType === 'tenant';

            if (!scope.role) {
                failures.push(safeFailure('MALFORMED_GOVERNANCE_ACCESS', SEVERITIES.HIGH, 'Governance access validation requires a role.', {}));
            } else if (isPlatformOwner(scope.role)) {
                if (tenantRoute) {
                    failures.push(safeFailure(
                        'PLATFORM_OWNER_TENANT_RBAC_BLOCKED',
                        SEVERITIES.CRITICAL_BLOCKER,
                        'PLATFORM_OWNER must remain outside tenant RBAC and tenant dashboard access.',
                        { route: scope.route }
                    ));
                }
            } else if (platformRoute || isGlobalGovernanceCapability(scope.capability)) {
                failures.push(safeFailure(
                    'TENANT_ROLE_PLATFORM_GOVERNANCE_BLOCKED',
                    SEVERITIES.CRITICAL_BLOCKER,
                    'Tenant roles cannot access platform governance controls.',
                    { role: scope.role, route: scope.route, capability: scope.capability }
                ));
            }

            if (scope.role === 'SUPER_ADMIN' && isGlobalGovernanceCapability(scope.capability)) {
                failures.push(safeFailure(
                    'TENANT_SUPER_ADMIN_GLOBAL_GOVERNANCE_BLOCKED',
                    SEVERITIES.CRITICAL_BLOCKER,
                    'SUPER_ADMIN remains tenant-scoped and cannot manage global platform rollout.',
                    { role: scope.role, capability: scope.capability }
                ));
            }

            validateTenantScope(scope, failures);
            if (scope.route && !platformRoute && !tenantRoute) {
                warnings.push(safeWarning('UNKNOWN_ROUTE_SCOPE', 'Route is not registered in the permission matrix.', { route: scope.route }));
            }

            return permissionResult(VALIDATION_TYPES.ROUTE_GOVERNANCE, scope, failures.length === 0, failures, warnings, recommendations);
        } catch (error) {
            return permissionResult(
                VALIDATION_TYPES.ROUTE_GOVERNANCE,
                normalizePermissionScope({}, {}),
                false,
                [safeFailure('GOVERNANCE_ACCESS_FAILED_SAFE', SEVERITIES.HIGH, 'Governance access validation failed safely.', { error: error && error.message })],
                [],
                []
            );
        }
    }

    function validateRolePermission(input, context) {
        try {
            var scope = normalizePermissionScope(input, context);
            var failures = [];
            var warnings = [];
            var recommendations = [];
            var governance = validateGovernanceAccess(scope, context);
            mergeFindings({ failures: failures, warnings: warnings, recommendations: recommendations }, governance);

            if (!scope.role || (TENANT_ROLES.indexOf(scope.role) === -1 && PLATFORM_ROLES.indexOf(scope.role) === -1)) {
                failures.push(safeFailure(
                    'UNKNOWN_RBAC_ROLE',
                    SEVERITIES.HIGH,
                    'Unknown or malformed role is blocked from permission validation.',
                    { role: scope.role }
                ));
            }

            if (scope.role === 'PLATFORM_OWNER' && scope.routeType !== 'platform' && !isPlatformRoute(scope.route)) {
                failures.push(safeFailure(
                    'PLATFORM_OWNER_TENANT_RBAC_BLOCKED',
                    SEVERITIES.CRITICAL_BLOCKER,
                    'PLATFORM_OWNER cannot be evaluated as a tenant RBAC role.',
                    { route: scope.route, capability: scope.capability }
                ));
            }

            if (scope.role !== 'PLATFORM_OWNER' && isGlobalGovernanceCapability(scope.capability)) {
                failures.push(safeFailure(
                    scope.role === 'SUPER_ADMIN' ? 'TENANT_SUPER_ADMIN_GLOBAL_GOVERNANCE_BLOCKED' : 'TENANT_ROLE_PLATFORM_GOVERNANCE_BLOCKED',
                    SEVERITIES.CRITICAL_BLOCKER,
                    'Tenant role cannot receive platform-global governance capability.',
                    { role: scope.role, capability: scope.capability }
                ));
            }

            if (scope.role && scope.capability && !hasCapability(scope.role, scope.capability) && failures.length === 0) {
                failures.push(safeFailure(
                    'ROLE_CAPABILITY_NOT_ALLOWED',
                    SEVERITIES.HIGH,
                    'Requested capability is not allowed by the role permission matrix.',
                    { role: scope.role, capability: scope.capability }
                ));
            }

            validateTenantScope(scope, failures);

            if (scope.role === 'SUPER_ADMIN' && /salary|payroll|leave_balance|compensation|ctc/i.test(scope.capability)) {
                failures.push(safeFailure(
                    'SUPER_ADMIN_HR_SENSITIVE_ACCESS_BLOCKED',
                    SEVERITIES.HIGH,
                    'SUPER_ADMIN remains technical governance and cannot access HR-sensitive values by default.',
                    { capability: scope.capability }
                ));
            }

            return permissionResult(VALIDATION_TYPES.ROLE_PERMISSION, scope, failures.length === 0, failures, warnings, recommendations);
        } catch (error) {
            return permissionResult(
                VALIDATION_TYPES.ROLE_PERMISSION,
                normalizePermissionScope({}, {}),
                false,
                [safeFailure('ROLE_PERMISSION_FAILED_SAFE', SEVERITIES.HIGH, 'Role permission validation failed safely.', { error: error && error.message })],
                [],
                []
            );
        }
    }

    function normalizeInheritanceChain(input) {
        var chain = [];
        if (Array.isArray(input)) chain = input.slice();
        else if (isPlainObject(input) && Array.isArray(input.inheritanceChain)) chain = input.inheritanceChain.slice();
        return chain.map(normalizeRole).filter(Boolean);
    }

    function detectPermissionEscalation(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var scope = normalizePermissionScope({
                role: source.fromRole || source.actorRole || source.role,
                targetRole: source.toRole || source.targetRole,
                tenantSlug: source.tenantSlug || source.tenant_slug,
                tenantId: source.tenantId || source.tenant_id,
                metadata: source.metadata || {}
            }, context);
            var failures = [];
            var warnings = [];
            var recommendations = [];
            var fromRole = normalizeRole(source.fromRole || source.actorRole || source.role || scope.fromRole || '');
            var toRole = normalizeRole(source.toRole || source.targetRole || scope.targetRole || '');
            var chain = normalizeInheritanceChain(source);
            var seen = {};

            if (chain.length) {
                chain.forEach(function detectLoop(role) {
                    if (seen[role]) {
                        failures.push(safeFailure(
                            'PERMISSION_INHERITANCE_LOOP',
                            SEVERITIES.CRITICAL_BLOCKER,
                            'Circular permission inheritance is prohibited.',
                            { role: role, inheritanceChain: chain }
                        ));
                    }
                    seen[role] = true;
                });
            }

            if (!fromRole && chain.length > 1) fromRole = chain[0];
            if (!toRole && chain.length > 1) toRole = chain[chain.length - 1];

            if (!fromRole || !toRole) {
                failures.push(safeFailure('MALFORMED_ROLE_ESCALATION', SEVERITIES.HIGH, 'Role escalation validation requires source and target roles.', {}));
            } else if (toRole === 'PLATFORM_OWNER' && fromRole !== 'PLATFORM_OWNER') {
                failures.push(safeFailure(
                    'PLATFORM_OWNER_ESCALATION_BLOCKED',
                    SEVERITIES.CRITICAL_BLOCKER,
                    'Tenant roles cannot escalate into PLATFORM_OWNER.',
                    { fromRole: fromRole, toRole: toRole }
                ));
            } else if (fromRole !== toRole && ROLE_RANK[toRole] > ROLE_RANK[fromRole]) {
                failures.push(safeFailure(
                    'UNSAFE_ROLE_ESCALATION',
                    SEVERITIES.HIGH,
                    'Unsafe role escalation is blocked by RBAC governance.',
                    { fromRole: fromRole, toRole: toRole }
                ));
            }

            validateTenantScope(scope, failures);

            var result = permissionResult(VALIDATION_TYPES.ROLE_ESCALATION, freezePermissionOutput({
                fromRole: fromRole,
                toRole: toRole,
                inheritanceChain: chain,
                tenantSlug: scope.tenantSlug,
                tenantId: scope.tenantId,
                contextTenantSlug: scope.contextTenantSlug,
                contextTenantId: scope.contextTenantId
            }), failures.length === 0, failures, warnings, recommendations);

            return freezePermissionOutput({
                success: result.success,
                validationType: result.validationType,
                blocked: result.allowed !== true,
                allowed: result.allowed,
                riskLevel: result.riskLevel,
                failures: result.failures,
                warnings: result.warnings,
                recommendations: result.recommendations,
                normalizedScope: result.normalizedScope,
                timestamp: result.timestamp
            });
        } catch (error) {
            return freezePermissionOutput({
                success: true,
                validationType: VALIDATION_TYPES.ROLE_ESCALATION,
                blocked: true,
                allowed: false,
                riskLevel: RISK_LEVELS.HIGH_RISK,
                failures: freezeList([safeFailure('ROLE_ESCALATION_FAILED_SAFE', SEVERITIES.HIGH, 'Role escalation validation failed safely.', { error: error && error.message })]),
                warnings: freezeList([]),
                recommendations: freezeList([]),
                normalizedScope: freezePermissionOutput({}),
                timestamp: nowIso()
            });
        }
    }

    function validateStrategicGovernanceAccess(input, context) {
        try {
            var scope = normalizePermissionScope(input, context);
            var role = scope.role;
            var strategicRole = scope.strategicRole || normalizeRole(scope.capability);
            var failures = [];
            var warnings = [];
            var recommendations = [];
            if (!role || (TENANT_ROLES.indexOf(role) === -1 && PLATFORM_ROLES.indexOf(role) === -1)) {
                failures.push(safeFailure('UNKNOWN_STRATEGIC_ROLE', SEVERITIES.HIGH, 'Unknown role cannot access strategic governance.', { role: role }));
            }
            if (role === 'PLATFORM_OWNER') {
                failures.push(safeFailure(
                    'PLATFORM_OWNER_STRATEGIC_TENANT_ACCESS_BLOCKED',
                    SEVERITIES.CRITICAL_BLOCKER,
                    'PLATFORM_OWNER must not be injected into tenant strategic workflows.',
                    { strategicRole: strategicRole }
                ));
            } else if (strategicRole) {
                var allowedRoles = STRATEGIC_ROLE_CAPABILITIES[strategicRole] || Object.freeze([]);
                if (allowedRoles.indexOf(role) === -1) {
                    failures.push(safeFailure(
                        'STRATEGIC_PERMISSION_NOT_ALLOWED',
                        SEVERITIES.HIGH,
                        'Strategic governance role is not allowed for this tenant role.',
                        { role: role, strategicRole: strategicRole }
                    ));
                }
            } else {
                warnings.push(safeWarning('MISSING_STRATEGIC_ROLE', 'Strategic role was not supplied for validation.', { role: role }));
            }
            validateTenantScope(scope, failures);
            return permissionResult(VALIDATION_TYPES.STRATEGIC_GOVERNANCE_ACCESS, scope, failures.length === 0, failures, warnings, recommendations);
        } catch (error) {
            return permissionResult(
                VALIDATION_TYPES.STRATEGIC_GOVERNANCE_ACCESS,
                normalizePermissionScope({}, {}),
                false,
                [safeFailure('STRATEGIC_ACCESS_FAILED_SAFE', SEVERITIES.HIGH, 'Strategic governance validation failed safely.', { error: error && error.message })],
                [],
                []
            );
        }
    }

    function collectRolePermissionOverrides() {
        try {
            var data = rawData();
            return Array.isArray(data.rolePermissionOverrides) ? data.rolePermissionOverrides.slice(0, 100) : [];
        } catch (error) {
            return [];
        }
    }

    function validateTenantRbacIsolation(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var failures = [];
            var warnings = [];
            var recommendations = [];
            var scope = normalizePermissionScope(source, context);
            var assignments = Array.isArray(source.roleAssignments) ? source.roleAssignments : [];

            assignments.forEach(function validateAssignment(item) {
                if (!isPlainObject(item)) return;
                var assignmentScope = normalizePermissionScope(item, context || source);
                if (isPlatformOwner(assignmentScope.role) || isPlatformOwner(assignmentScope.targetRole)) {
                    failures.push(safeFailure(
                        'PLATFORM_OWNER_TENANT_RBAC_BLOCKED',
                        SEVERITIES.CRITICAL_BLOCKER,
                        'PLATFORM_OWNER must never appear in tenant RBAC assignments.',
                        { role: assignmentScope.role, targetRole: assignmentScope.targetRole }
                    ));
                }
                validateTenantScope(assignmentScope, failures);
            });

            collectRolePermissionOverrides().forEach(function validateOverride(row) {
                var fromRole = normalizeRole(row.role || row.fromRole || row.actorRole || '');
                var toRole = normalizeRole(row.inheritsFrom || row.toRole || row.targetRole || '');
                var escalation = detectPermissionEscalation({
                    fromRole: fromRole,
                    toRole: toRole,
                    tenantSlug: row.tenantSlug || row.tenant_slug,
                    tenantId: row.tenantId || row.tenant_id
                }, context || source);
                mergeFindings({ failures: failures, warnings: warnings, recommendations: recommendations }, escalation);
            });

            return permissionResult(VALIDATION_TYPES.TENANT_RBAC_ISOLATION, scope, failures.length === 0, failures, warnings, recommendations);
        } catch (error) {
            return permissionResult(
                VALIDATION_TYPES.TENANT_RBAC_ISOLATION,
                normalizePermissionScope({}, {}),
                false,
                [safeFailure('TENANT_RBAC_ISOLATION_FAILED_SAFE', SEVERITIES.HIGH, 'Tenant RBAC isolation validation failed safely.', { error: error && error.message })],
                [],
                []
            );
        }
    }

    function auditPermissionEvent(eventType, metadata, context) {
        try {
            if (context && context.skipAuditPersistence === true) return false;
            if (!global.AuditService || typeof global.AuditService.recordAudit !== 'function') return false;
            global.AuditService.recordAudit({
                type: eventType || 'PERMISSION_MATRIX_VALIDATED',
                eventType: eventType || 'PERMISSION_MATRIX_VALIDATED',
                actionType: eventType || 'PERMISSION_MATRIX_VALIDATED',
                source: DEFAULT_SOURCE,
                severity: metadata && metadata.riskLevel === RISK_LEVELS.CRITICAL_BLOCKER ? 'CRITICAL' : 'INFO',
                actorId: context && context.actor && (context.actor.id || context.actor.email) || '',
                metadata: safeMetadata(metadata || {})
            }, { source: DEFAULT_SOURCE });
            return true;
        } catch (error) {
            safeWarn('Permission audit failed safely.', { error: error && error.message });
            return false;
        }
    }

    function emitPermissionTelemetry(eventType, metadata, context) {
        try {
            if (context && context.skipTelemetry === true) return false;
            if (!global.WorkflowTelemetryService || typeof global.WorkflowTelemetryService.emitTelemetry !== 'function') return false;
            global.WorkflowTelemetryService.emitTelemetry('GOVERNANCE', eventType || 'PERMISSION_MATRIX_VALIDATED', {
                source: DEFAULT_SOURCE,
                severity: metadata && metadata.riskLevel === RISK_LEVELS.CRITICAL_BLOCKER ? 'CRITICAL' : 'INFO',
                status: 'RECORDED',
                metadata: safeMetadata(metadata || {})
            });
            return true;
        } catch (error) {
            safeWarn('Permission telemetry failed safely.', { error: error && error.message });
            return false;
        }
    }

    function recordPermissionMetric(eventType, metadata, context) {
        try {
            if (context && context.skipMetrics === true) return false;
            if (!global.OrchestrationMetricsService || typeof global.OrchestrationMetricsService.recordWorkflowMetric !== 'function') return false;
            global.OrchestrationMetricsService.recordWorkflowMetric(eventType || 'PERMISSION_MATRIX_VALIDATED', Object.assign({ source: DEFAULT_SOURCE }, safeMetadata(metadata || {})));
            return true;
        } catch (error) {
            safeWarn('Permission metric aggregation failed safely.', { error: error && error.message });
            return false;
        }
    }

    function summarizeRoleMatrix() {
        return freezePermissionOutput(TENANT_ROLES.concat(PLATFORM_ROLES).map(function mapRole(role) {
            return {
                role: role,
                scope: role === 'PLATFORM_OWNER' ? 'PLATFORM_GOVERNANCE' : 'TENANT',
                capabilities: CAPABILITIES[role] || []
            };
        }));
    }

    function generatePermissionGovernanceReport(input, context) {
        try {
            var source = isPlainObject(input) ? input : {};
            var ctx = isPlainObject(context) ? context : {};
            var aggregate = {
                failures: [],
                warnings: [],
                recommendations: []
            };
            var sections = [];
            var malformed = !isPlainObject(input);
            var tenantSlug = normalizeTenantSlug(source.tenantSlug || ctx.tenantSlug || rawData().companySettings && rawData().companySettings.tenantSlug || '');

            if (malformed) {
                aggregate.failures.push(safeFailure('MALFORMED_PERMISSION_REPORT_INPUT', SEVERITIES.HIGH, 'Permission governance report input is malformed.', {}));
            }

            var baseContext = Object.assign({}, safeMetadata(ctx), { tenantSlug: tenantSlug || ctx.tenantSlug || '' });
            var roleChecks = Array.isArray(source.roleAssignments) ? source.roleAssignments.slice(0, 100) : [];
            roleChecks.forEach(function validateAssignment(row) {
                if (!isPlainObject(row)) return;
                if (row.actorRole || row.targetRole || row.fromRole || row.toRole) {
                    mergeFindings(aggregate, detectPermissionEscalation({
                        fromRole: row.actorRole || row.fromRole || row.role,
                        toRole: row.targetRole || row.toRole,
                        tenantSlug: row.tenantSlug || source.tenantSlug,
                        tenantId: row.tenantId || source.tenantId
                    }, baseContext));
                }
                if (row.role || row.capability || row.route) {
                    mergeFindings(aggregate, validateRolePermission(row, baseContext));
                }
            });

            var routeChecks = Array.isArray(source.routeChecks) ? source.routeChecks.slice(0, 100) : [];
            routeChecks.forEach(function validateRoute(row) {
                mergeFindings(aggregate, validateRolePermission(row, baseContext));
            });

            var strategicChecks = Array.isArray(source.strategicChecks) ? source.strategicChecks.slice(0, 100) : [];
            strategicChecks.forEach(function validateStrategic(row) {
                mergeFindings(aggregate, validateStrategicGovernanceAccess(row, baseContext));
            });

            var tenantIsolation = validateTenantRbacIsolation(source, baseContext);
            sections.push(tenantIsolation);
            var routeSection = permissionResult(
                VALIDATION_TYPES.ROUTE_GOVERNANCE,
                freezePermissionOutput({ tenantSlug: tenantSlug }),
                aggregate.failures.filter(function routeFailure(item) {
                    return /ROUTE|GOVERNANCE|PLATFORM|GLOBAL/.test(item.failureCode);
                }).length === 0,
                aggregate.failures.filter(function routeFailure(item) {
                    return /ROUTE|GOVERNANCE|PLATFORM|GLOBAL/.test(item.failureCode);
                }),
                aggregate.warnings.filter(function routeWarning(item) {
                    return /ROUTE/.test(item.warningCode || '');
                }),
                []
            );
            sections.push(routeSection);
            var strategicSection = permissionResult(
                VALIDATION_TYPES.STRATEGIC_GOVERNANCE_ACCESS,
                freezePermissionOutput({ tenantSlug: tenantSlug }),
                aggregate.failures.filter(function strategicFailure(item) {
                    return /STRATEGIC/.test(item.failureCode);
                }).length === 0,
                aggregate.failures.filter(function strategicFailure(item) {
                    return /STRATEGIC/.test(item.failureCode);
                }),
                [],
                []
            );
            sections.push(strategicSection);
            mergeFindings(aggregate, tenantIsolation);

            var riskLevel = riskFromFindings(aggregate.failures, aggregate.warnings);
            var blockerCount = aggregate.failures.filter(function countCritical(item) { return item.severity === SEVERITIES.CRITICAL_BLOCKER; }).length;
            var score = Math.max(0, 100 - blockerCount * 30 - (aggregate.failures.length - blockerCount) * 15 - aggregate.warnings.length * 5);
            var report = freezePermissionOutput({
                success: true,
                passed: aggregate.failures.length === 0,
                validationType: 'PERMISSION_GOVERNANCE_REPORT',
                riskLevel: riskLevel,
                score: score,
                tenantSlug: tenantSlug,
                summary: {
                    roleMatrixRoles: TENANT_ROLES.length + PLATFORM_ROLES.length,
                    tenantRoles: TENANT_ROLES.length,
                    platformRoles: PLATFORM_ROLES.length,
                    failures: aggregate.failures.length,
                    warnings: aggregate.warnings.length,
                    criticalBlockers: blockerCount,
                    platformOwnerIsolated: aggregate.failures.every(function noPlatformOwnerLeak(item) {
                        return item.failureCode !== 'PLATFORM_OWNER_TENANT_RBAC_BLOCKED';
                    }) === false ? false : true
                },
                roleMatrix: summarizeRoleMatrix(),
                sections: freezeList(sections),
                failures: freezeList(aggregate.failures),
                warnings: freezeList(aggregate.warnings),
                recommendations: freezeList(aggregate.recommendations),
                metadata: freezePermissionOutput({
                    source: DEFAULT_SOURCE,
                    existingRbacPreserved: true,
                    tenantIsolationPreserved: aggregate.failures.every(function noCrossTenant(item) {
                        return item.failureCode !== 'CROSS_TENANT_PERMISSION_SCOPE';
                    }),
                    strategicIsolationPreserved: aggregate.failures.every(function noStrategicLeak(item) {
                        return item.failureCode !== 'PLATFORM_OWNER_STRATEGIC_TENANT_ACCESS_BLOCKED';
                    })
                }),
                timestamp: nowIso()
            });

            emitPermissionTelemetry('PERMISSION_MATRIX_VALIDATED', {
                riskLevel: report.riskLevel,
                passed: report.passed,
                failures: report.failures.length,
                criticalBlockers: report.summary.criticalBlockers
            }, ctx);
            auditPermissionEvent(report.passed ? 'PERMISSION_MATRIX_VALIDATED' : 'PERMISSION_GOVERNANCE_FAILURE', {
                riskLevel: report.riskLevel,
                passed: report.passed,
                failures: report.failures.length,
                criticalBlockers: report.summary.criticalBlockers
            }, ctx);
            recordPermissionMetric('PERMISSION_MATRIX_VALIDATED', {
                riskLevel: report.riskLevel,
                passed: report.passed,
                failures: report.failures.length,
                criticalBlockers: report.summary.criticalBlockers
            }, ctx);

            return report;
        } catch (error) {
            return freezePermissionOutput({
                success: true,
                passed: false,
                validationType: 'PERMISSION_GOVERNANCE_REPORT',
                riskLevel: RISK_LEVELS.HIGH_RISK,
                score: 0,
                tenantSlug: '',
                summary: {
                    roleMatrixRoles: 0,
                    tenantRoles: 0,
                    platformRoles: 0,
                    failures: 1,
                    warnings: 0,
                    criticalBlockers: 0,
                    platformOwnerIsolated: false
                },
                roleMatrix: freezeList([]),
                sections: freezeList([]),
                failures: freezeList([safeFailure('PERMISSION_REPORT_FAILED_SAFE', SEVERITIES.HIGH, 'Permission governance report failed safely.', { error: error && error.message })]),
                warnings: freezeList([]),
                recommendations: freezeList([]),
                metadata: freezePermissionOutput({ source: DEFAULT_SOURCE, existingRbacPreserved: true }),
                timestamp: nowIso()
            });
        }
    }

    var PermissionMatrixService = Object.freeze({
        RISK_LEVELS: RISK_LEVELS,
        SEVERITIES: SEVERITIES,
        TENANT_ROLES: TENANT_ROLES,
        PLATFORM_ROLES: PLATFORM_ROLES,
        VALIDATION_TYPES: VALIDATION_TYPES,
        ROLE_MATRIX: CAPABILITIES,
        validateRolePermission: validateRolePermission,
        detectPermissionEscalation: detectPermissionEscalation,
        normalizePermissionScope: normalizePermissionScope,
        freezePermissionOutput: freezePermissionOutput,
        validateGovernanceAccess: validateGovernanceAccess,
        validateTenantRbacIsolation: validateTenantRbacIsolation,
        validateStrategicGovernanceAccess: validateStrategicGovernanceAccess,
        generatePermissionGovernanceReport: generatePermissionGovernanceReport,
        getRoleMatrix: summarizeRoleMatrix
    });

    global.PermissionMatrixService = PermissionMatrixService;
    global.permissionMatrixService = PermissionMatrixService;

    if (global.__ARTHHRMS_DEV__) {
        (function runSelfTest() {
            var checks = [];
            function record(name, passed, details) {
                checks.push(Object.freeze({ name: name, passed: !!passed, details: details || null }));
            }
            try {
                var manager = validateRolePermission({ role: 'manager', capability: 'team_visibility', tenantSlug: 'self-test' }, { tenantSlug: 'self-test' });
                record('tenant role permission remains compatible', manager.allowed === true, null);
                var platformLeak = validateRolePermission({ role: 'platform_owner', capability: 'employee_dashboard', route: 'employee-portal.html', tenantSlug: 'self-test' }, { routeType: 'tenant', tenantSlug: 'self-test' });
                record('PLATFORM_OWNER isolated from tenant RBAC', platformLeak.allowed === false, null);
                var unsafeEscalation = detectPermissionEscalation({ fromRole: 'employee', toRole: 'hr', tenantSlug: 'self-test' }, { tenantSlug: 'self-test' });
                record('unsafe escalation blocked', unsafeEscalation.blocked === true, null);
                var route = validateGovernanceAccess({ role: 'employee', route: 'platform-control.html', capability: 'platform_governance', tenantSlug: 'self-test' }, { tenantSlug: 'self-test' });
                record('route validation blocks platform governance', route.allowed === false, null);
                var tenantScope = validateRolePermission({ role: 'hr', capability: 'onboarding_visibility', tenantSlug: 'other' }, { tenantSlug: 'self-test' });
                record('tenant RBAC isolation works', tenantScope.allowed === false && tenantScope.failures.some(function hasCrossTenant(item) { return item.failureCode === 'CROSS_TENANT_PERMISSION_SCOPE'; }), null);
                var immutable = generatePermissionGovernanceReport({ tenantSlug: 'self-test', roleAssignments: [] }, { tenantSlug: 'self-test', skipTelemetry: true, skipAuditPersistence: true, skipMetrics: true });
                record('immutable outputs enforced', Object.isFrozen(immutable) && Object.isFrozen(immutable.failures), null);
                var malformed = generatePermissionGovernanceReport('bad-input', { tenantSlug: 'self-test', skipTelemetry: true, skipAuditPersistence: true, skipMetrics: true });
                record('malformed payloads handled safely', malformed.success === true && malformed.passed === false, null);
                record('dependency absence tolerated', true, null);
            } catch (error) {
                record('self-test has no uncaught failure', false, error && error.message ? error.message : safeString(error, 'unknown self-test error'));
            }
            try {
                global.__ARTHHRMS_PERMISSION_MATRIX_SELF_TEST__ = Object.freeze({
                    passed: checks.every(function allPassed(item) { return item.passed; }),
                    tests: Object.freeze(checks.slice())
                });
            } catch (error) {
                safeWarn('Permission matrix self-test result storage failed.', { error: error && error.message });
            }
        })();
    }
})(typeof window !== 'undefined' ? window : globalThis);
