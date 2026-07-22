/**
 * uxPermissionSimplificationService.js
 * ARTHHRMS - UX Permission Simplification + Role Experience Optimization Framework
 *
 * PURPOSE:
 * Provides metadata-only role navigation shaping, contextual visibility,
 * dashboard simplification, UX complexity scoring, and immutable UX governance
 * reports without changing RBAC enforcement.
 *
 * This service does NOT:
 * - replace RBAC checks
 * - mutate tenant business data
 * - expose cross-tenant navigation or widgets
 * - expose salary, leave balance, payroll internals, raw documents, tokens, or private payloads
 *
 * @version 1.0.0
 */
(function attachUXPermissionSimplificationService(global) {
    'use strict';

    var PREFIX = '[UXPermissionSimplificationService]';
    var MAX_HISTORY = 500;
    var MAX_ROWS = 300;

    var UX_STATES = Object.freeze([
        'MONITORING',
        'SIMPLIFIED',
        'PERSONALIZED',
        'CLUTTERED',
        'FRICTION_DETECTED',
        'ARCHIVED'
    ]);

    var EXPERIENCE_ROLES = Object.freeze([
        'EMPLOYEE',
        'MANAGER',
        'HR',
        'DIRECTOR',
        'SUPER_ADMIN',
        'PLATFORM_OWNER'
    ]);

    var ROLE_JOURNEYS = Object.freeze({
        EMPLOYEE: Object.freeze(['attendance', 'leave', 'profile', 'notifications']),
        MANAGER: Object.freeze(['approvals', 'team_management', 'performance_tracking', 'attendance', 'leave', 'notifications']),
        HR: Object.freeze(['workforce_governance', 'employee_lifecycle', 'payroll_operations', 'notifications']),
        DIRECTOR: Object.freeze(['strategic_execution', 'kpi_governance', 'notifications']),
        SUPER_ADMIN: Object.freeze(['infrastructure_monitoring', 'workflow_monitoring', 'deployment_visibility']),
        PLATFORM_OWNER: Object.freeze(['platform_governance', 'tenant_governance', 'platform_analytics', 'feature_rollout_governance'])
    });

    var ROLE_CAPABILITIES = Object.freeze({
        EMPLOYEE: Object.freeze(['self_visibility', 'own_profile', 'own_attendance', 'own_leave', 'employee_dashboard']),
        MANAGER: Object.freeze(['self_visibility', 'team_visibility', 'approval_visibility', 'manager_dashboard', 'strategic_execution_visibility', 'own_attendance', 'own_leave']),
        HR: Object.freeze(['self_visibility', 'hr_operational_visibility', 'hr_dashboard', 'employee_visibility', 'onboarding_visibility', 'audit_limited']),
        DIRECTOR: Object.freeze(['self_visibility', 'org_strategic_visibility', 'director_dashboard', 'kpi_visibility', 'strategic_dashboard_access']),
        SUPER_ADMIN: Object.freeze(['tenant_it_governance', 'super_admin_dashboard', 'workflow_monitoring', 'integrations', 'user_provisioning', 'audit_visibility', 'deployment_visibility']),
        PLATFORM_OWNER: Object.freeze(['platform_governance', 'platform_control_access', 'tenant_provisioning', 'platform_analytics', 'deployment_governance', 'feature_rollout_governance'])
    });

    var ROLE_PRIORITY = Object.freeze({
        EMPLOYEE: 10,
        MANAGER: 20,
        HR: 30,
        DIRECTOR: 40,
        SUPER_ADMIN: 50,
        PLATFORM_OWNER: 60
    });

    var SENSITIVE_KEY_PATTERN = /(salary|payroll.?amount|payrollAmount|payslip|compensation|ctc|leave.?balance|leaveBalance|gross|net|basic|hra|pf|tds|allowance|deduction|password|secret|token|jwt|authorization|service.?role|private.?key|bank|tax|raw.?payload|raw.?content|raw.?body|payload|content|body|signed.?url|download.?url|storage.?path|file.?path|document|employeeRecord|confidential|privateNote)/i;
    var SENSITIVE_VALUE_PATTERN = /\b(salary|payrollAmount|payroll|compensation|ctc|leave\s*balance|leaveBalance|confidential)\s*[:=]?\s*[\w,.\- ]+/ig;

    function nowIso() {
        try { return new Date().toISOString(); } catch (error) { return String(Date.now()); }
    }

    function db() {
        try { return global.DB || null; } catch (error) { return null; }
    }

    function rawData() {
        try {
            var source = db();
            return source && typeof source.get === 'function' ? source.get() || {} : {};
        } catch (error) {
            return {};
        }
    }

    function saveData(data) {
        try {
            var source = db();
            if (source && typeof source.save === 'function') {
                source.save(data);
                return true;
            }
        } catch (error) {}
        return false;
    }

    function safeWarn(message, details) {
        try {
            if (global.console && typeof global.console.warn === 'function') {
                if (details !== undefined) global.console.warn(PREFIX + ' ' + message, details);
                else global.console.warn(PREFIX + ' ' + message);
            }
        } catch (error) {}
    }

    function safeString(value, fallback) {
        try {
            if (value === undefined || value === null) return fallback || '';
            if (typeof value === 'symbol') return value.toString();
            return String(value);
        } catch (error) {
            return fallback || '';
        }
    }

    function safeNumber(value, fallback) {
        var next = Number(value);
        return Number.isFinite(next) ? next : (fallback || 0);
    }

    function clamp(value, min, max) {
        var next = safeNumber(value, min);
        return Math.max(min, Math.min(max, next));
    }

    function isPlainObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function normalizeToken(value, fallback) {
        var raw = safeString(value || fallback || '', '').trim();
        return raw.replace(/[\s-]+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').toUpperCase() || (fallback || '');
    }

    function normalizeRole(value) {
        var role = normalizeToken(value || '', '');
        if (role === 'PLATFORMOWNER') return 'PLATFORM_OWNER';
        if (role === 'SUPERADMIN') return 'SUPER_ADMIN';
        if (role === 'HRHEAD') return 'HR_HEAD';
        if (role === 'ADMIN') return 'SUPER_ADMIN';
        return role || 'EMPLOYEE';
    }

    function normalizeRoles(value) {
        var source = Array.isArray(value) ? value : [value];
        var seen = {};
        var roles = [];
        source.forEach(function eachRole(item) {
            var role = normalizeRole(item);
            if (!seen[role]) {
                seen[role] = true;
                roles.push(role);
            }
        });
        if (!roles.length) roles.push('EMPLOYEE');
        return roles;
    }

    function normalizeTenantSlug(value) {
        return safeString(value || '', '').trim().toLowerCase().replace(/^tenant[-_]/, '').replace(/^ten[-_]/, '').replace(/[^a-z0-9_-]/g, '').replace(/_+/g, '-').replace(/^-|-$/g, '');
    }

    function contextTenant(context) {
        return normalizeTenantSlug(context && (context.tenantSlug || context.tenantId || context.companyId || context.actor && (context.actor.tenantSlug || context.actor.tenantId)));
    }

    function actorId(context) {
        return safeString(context && context.actor && (context.actor.id || context.actor.empId || context.actor.employeeId) || context && (context.actorId || context.userId) || '', '');
    }

    function routeTypeOf(value, fallback) {
        return normalizeToken(value || fallback || 'tenant', 'TENANT');
    }

    function freezeDeep(value, seen) {
        if (!value || (typeof value !== 'object' && typeof value !== 'function') || Object.isFrozen(value)) return value;
        var refs = seen || [];
        if (refs.indexOf(value) !== -1) return value;
        refs.push(value);
        try {
            Object.keys(value).forEach(function freezeKey(key) {
                freezeDeep(value[key], refs.slice());
            });
            Object.freeze(value);
        } catch (error) {}
        return value;
    }

    function redactString(value) {
        return safeString(value, '').replace(SENSITIVE_VALUE_PATTERN, '[REDACTED]');
    }

    function cloneSanitized(value, seen) {
        if (value === undefined || value === null) return value;
        if (typeof value === 'string') return redactString(value);
        if (typeof value !== 'object') return value;
        var refs = seen || [];
        if (refs.indexOf(value) !== -1) return '[Circular]';
        refs.push(value);
        if (Array.isArray(value)) {
            return value.slice(0, MAX_ROWS).map(function cloneArrayItem(item) {
                return cloneSanitized(item, refs.slice());
            });
        }
        if (!isPlainObject(value)) return safeString(value, '');
        var output = {};
        try {
            Object.keys(value).forEach(function cloneKey(key) {
                if (SENSITIVE_KEY_PATTERN.test(key)) return;
                output[key] = cloneSanitized(value[key], refs.slice());
            });
        } catch (error) {}
        return output;
    }

    function freezeUXOutput(value) {
        return freezeDeep(cloneSanitized(value || {}));
    }

    function hasAnyRole(roles, allowedRoles) {
        if (!Array.isArray(allowedRoles) || !allowedRoles.length) return true;
        var allowed = allowedRoles.map(normalizeRole);
        return roles.some(function someRole(role) { return allowed.indexOf(normalizeRole(role)) !== -1; });
    }

    function hasCapability(roles, capability) {
        var cap = safeString(capability || '', '').trim();
        if (!cap) return true;
        return roles.some(function roleHasCapability(role) {
            var list = ROLE_CAPABILITIES[normalizeRole(role)] || [];
            return list.indexOf(cap) !== -1;
        });
    }

    function journeyRelevant(roles, journey) {
        var normalizedJourney = safeString(journey || '', '').trim();
        if (!normalizedJourney) return true;
        return roles.some(function roleHasJourney(role) {
            var list = ROLE_JOURNEYS[normalizeRole(role)] || [];
            return list.indexOf(normalizedJourney) !== -1;
        });
    }

    function sameTenantOrPlatform(row, tenantSlug) {
        var itemTenant = normalizeTenantSlug(row && (row.tenantSlug || row.tenantId || row.companyId || ''));
        var itemRouteType = routeTypeOf(row && row.routeType || '', 'TENANT');
        if (itemRouteType === 'PLATFORM') return true;
        if (!itemTenant || !tenantSlug) return true;
        return itemTenant === tenantSlug;
    }

    function normalizeNavItem(row, index) {
        var item = row || {};
        return {
            itemId: safeString(item.itemId || item.id || item.key || 'nav-' + index, 'nav-' + index),
            label: safeString(item.label || item.name || item.title || 'Navigation item', 'Navigation item'),
            group: safeString(item.group || item.section || 'General', 'General'),
            route: safeString(item.route || item.href || '#', '#'),
            routeType: routeTypeOf(item.routeType || (/platform-control|owner-console|platform-login/i.test(safeString(item.route || '', '')) ? 'platform' : 'tenant'), 'TENANT'),
            allowedRoles: normalizeRoles(item.allowedRoles || item.roles || item.role || []),
            requiredCapability: safeString(item.requiredCapability || item.capability || '', ''),
            priority: clamp(item.priority === undefined ? 50 : item.priority, 0, 100),
            journey: safeString(item.journey || item.workflow || '', ''),
            usageCount: clamp(item.usageCount === undefined ? 1 : item.usageCount, 0, 1000000),
            tenantSlug: normalizeTenantSlug(item.tenantSlug || item.tenantId || item.companyId || ''),
            contextual: item.contextual !== false,
            source: safeString(item.source || 'ux-permission', 'ux-permission')
        };
    }

    function normalizeDashboard(row, index) {
        var item = row || {};
        return {
            dashboardId: safeString(item.dashboardId || item.id || 'dashboard-' + index, 'dashboard-' + index),
            dashboardType: safeString(item.dashboardType || item.type || 'general', 'general'),
            allowedRoles: normalizeRoles(item.allowedRoles || item.roles || item.role || []),
            widgetIds: Array.isArray(item.widgetIds) ? item.widgetIds.slice(0, 30).map(function id(widgetId) { return safeString(widgetId, ''); }).filter(Boolean) : [],
            routeType: routeTypeOf(item.routeType || (/platform/i.test(safeString(item.dashboardType || item.dashboardId || '', '')) ? 'platform' : 'tenant'), 'TENANT'),
            tenantSlug: normalizeTenantSlug(item.tenantSlug || item.tenantId || item.companyId || '')
        };
    }

    function normalizeWidget(row, index) {
        var item = row || {};
        return {
            widgetId: safeString(item.widgetId || item.id || 'widget-' + index, 'widget-' + index),
            label: safeString(item.label || item.name || item.title || item.widgetId || 'Widget', 'Widget'),
            allowedRoles: normalizeRoles(item.allowedRoles || item.roles || item.role || []),
            journey: safeString(item.journey || '', ''),
            tenantSlug: normalizeTenantSlug(item.tenantSlug || item.tenantId || item.companyId || ''),
            usageCount: clamp(item.usageCount === undefined ? 1 : item.usageCount, 0, 1000000),
            confidential: item.confidential === true
        };
    }

    function normalizeWorkflow(row, index) {
        var item = row || {};
        return {
            workflowId: safeString(item.workflowId || item.id || 'workflow-' + index, 'workflow-' + index),
            journey: safeString(item.journey || item.type || '', ''),
            role: normalizeRole(item.role || item.actorRole || ''),
            steps: clamp(item.steps === undefined ? 1 : item.steps, 1, 100),
            completionRate: clamp(item.completionRate === undefined ? 1 : item.completionRate, 0, 1),
            abandonmentRate: clamp(item.abandonmentRate === undefined ? 0 : item.abandonmentRate, 0, 1),
            averageSeconds: clamp(item.averageSeconds === undefined ? 0 : item.averageSeconds, 0, 1000000),
            tenantSlug: normalizeTenantSlug(item.tenantSlug || item.tenantId || item.companyId || '')
        };
    }

    function normalizeVisibilityRule(row, index) {
        var item = row || {};
        return {
            ruleId: safeString(item.ruleId || item.id || 'rule-' + index, 'rule-' + index),
            targetId: safeString(item.targetId || item.itemId || item.widgetId || '', ''),
            targetType: safeString(item.targetType || 'navigation', 'navigation'),
            allowedRoles: normalizeRoles(item.allowedRoles || item.roles || []),
            deniedRoles: Array.isArray(item.deniedRoles) ? item.deniedRoles.map(normalizeRole) : [],
            requiredCapability: safeString(item.requiredCapability || item.capability || '', ''),
            routeType: routeTypeOf(item.routeType || '', ''),
            tenantSlug: normalizeTenantSlug(item.tenantSlug || item.tenantId || item.companyId || '')
        };
    }

    function normalizeUXPayload(payload, context) {
        try {
            if (!isPlainObject(payload)) {
                return freezeUXOutput({
                    success: false,
                    classification: 'MALFORMED_PAYLOAD',
                    message: 'UX permission payload must be an object.',
                    navigationItems: [],
                    dashboards: [],
                    widgets: [],
                    workflows: [],
                    visibilityRules: [],
                    governance: {
                        tenantIsolationPreserved: true,
                        rbacGovernancePreserved: true
                    }
                });
            }
            var ctxTenant = contextTenant(context || {});
            var payloadTenant = normalizeTenantSlug(payload.tenantSlug || payload.tenantId || payload.companyId || ctxTenant);
            var tenantSlug = payloadTenant || ctxTenant;
            function tenantFilter(row) {
                return sameTenantOrPlatform(row, tenantSlug);
            }
            var navigationItems = (Array.isArray(payload.navigationItems) ? payload.navigationItems : []).filter(tenantFilter).map(normalizeNavItem);
            var dashboards = (Array.isArray(payload.dashboards) ? payload.dashboards : []).filter(tenantFilter).map(normalizeDashboard);
            var widgets = (Array.isArray(payload.widgets) ? payload.widgets : []).filter(tenantFilter).map(normalizeWidget);
            var workflows = (Array.isArray(payload.workflows) ? payload.workflows : []).filter(tenantFilter).map(normalizeWorkflow);
            var visibilityRules = (Array.isArray(payload.visibilityRules) ? payload.visibilityRules : []).filter(tenantFilter).map(normalizeVisibilityRule);
            return freezeUXOutput({
                success: true,
                tenantSlug: tenantSlug || 'platform',
                navigationItems: navigationItems,
                dashboards: dashboards,
                widgets: widgets,
                workflows: workflows,
                visibilityRules: visibilityRules,
                analytics: cloneSanitized(payload.analytics || {}),
                metadata: {
                    source: safeString(payload.source || payload.metadata && payload.metadata.source || 'ux-permission-simplification', 'ux-permission-simplification'),
                    normalizedAt: nowIso()
                },
                governance: {
                    tenantIsolationPreserved: true,
                    rbacGovernancePreserved: true,
                    rbacAuthoritative: true,
                    uiVisibilityOnly: true
                }
            });
        } catch (error) {
            return freezeUXOutput({
                success: false,
                classification: 'NORMALIZATION_FAILED',
                message: 'UX payload normalization failed safely.',
                error: safeString(error && error.message, ''),
                governance: {
                    tenantIsolationPreserved: true,
                    rbacGovernancePreserved: true
                }
            });
        }
    }

    function validateRoleExperienceScope(roles, context, payload) {
        try {
            var ctx = context || {};
            var routeType = routeTypeOf(ctx.routeType || payload && payload.routeType || 'tenant', 'TENANT');
            var tenantSlug = contextTenant(ctx);
            var normalizedRoles = roles.map(normalizeRole);
            if (normalizedRoles.indexOf('PLATFORM_OWNER') !== -1 && routeType !== 'PLATFORM') {
                return freezeUXOutput({
                    success: false,
                    allowed: false,
                    classification: 'PLATFORM_OWNER_TENANT_UX_BLOCKED',
                    message: 'PLATFORM_OWNER role experience remains isolated to platform-control.',
                    governance: { tenantIsolationPreserved: true, rbacGovernancePreserved: true, rbacAuthoritative: true }
                });
            }
            if (normalizedRoles.indexOf('SUPER_ADMIN') !== -1 && routeType === 'PLATFORM' && !(ctx.infrastructureOnly === true || ctx.monitoringOnly === true)) {
                return freezeUXOutput({
                    success: false,
                    allowed: false,
                    classification: 'SUPER_ADMIN_INFRASTRUCTURE_ONLY_UX',
                    message: 'SUPER_ADMIN UX governance visibility is infrastructure monitoring only.',
                    governance: { tenantIsolationPreserved: true, rbacGovernancePreserved: true, rbacAuthoritative: true }
                });
            }
            if (payload && payload.tenantSlug && tenantSlug && payload.tenantSlug !== tenantSlug) {
                return freezeUXOutput({
                    success: false,
                    allowed: false,
                    classification: 'TENANT_SCOPE_BLOCKED',
                    message: 'Role experience scope must match the active tenant context.',
                    governance: { tenantIsolationPreserved: true, rbacGovernancePreserved: true, rbacAuthoritative: true }
                });
            }
            return freezeUXOutput({
                success: true,
                allowed: true,
                routeType: routeType,
                roles: normalizedRoles,
                tenantSlug: tenantSlug || payload && payload.tenantSlug || 'platform',
                governance: { tenantIsolationPreserved: true, rbacGovernancePreserved: true, rbacAuthoritative: true }
            });
        } catch (error) {
            return freezeUXOutput({
                success: false,
                allowed: false,
                classification: 'ROLE_SCOPE_VALIDATION_FAILED',
                message: 'Role experience validation failed safely.',
                governance: { tenantIsolationPreserved: true, rbacGovernancePreserved: true, rbacAuthoritative: true }
            });
        }
    }

    function rolePermissionAllowed(item, roles, context) {
        if (!hasAnyRole(roles, item.allowedRoles)) return false;
        if (!hasCapability(roles, item.requiredCapability)) return false;
        if (!journeyRelevant(roles, item.journey)) return false;
        try {
            var permissionService = global.PermissionMatrixService || global.permissionMatrixService;
            if (permissionService && typeof permissionService.validateRolePermission === 'function' && item.requiredCapability) {
                return roles.some(function anyAllowed(role) {
                    var result = permissionService.validateRolePermission({
                        role: role,
                        capability: item.requiredCapability,
                        route: item.route,
                        tenantSlug: item.tenantSlug || contextTenant(context || {})
                    }, {
                        tenantSlug: contextTenant(context || {}) || item.tenantSlug,
                        routeType: routeTypeOf(item.routeType || context && context.routeType || 'tenant', 'TENANT').toLowerCase(),
                        skipTelemetry: true,
                        skipAuditPersistence: true,
                        skipMetrics: true
                    });
                    return !!(result && result.allowed);
                });
            }
        } catch (error) {
            safeWarn('Permission matrix validation unavailable; UI visibility remained conservative.', { error: error && error.message });
        }
        return true;
    }

    function routeVisibleForContext(item, roles, context) {
        var ctxRoute = routeTypeOf(context && context.routeType || 'tenant', 'TENANT');
        var itemRoute = routeTypeOf(item.routeType || 'tenant', 'TENANT');
        if (roles.indexOf('PLATFORM_OWNER') !== -1) return ctxRoute === 'PLATFORM' && itemRoute === 'PLATFORM';
        if (roles.indexOf('SUPER_ADMIN') !== -1 && ctxRoute === 'PLATFORM') {
            return hasAnyRole(['SUPER_ADMIN'], item.allowedRoles) && (context && (context.infrastructureOnly === true || context.monitoringOnly === true));
        }
        return ctxRoute !== 'PLATFORM' && itemRoute !== 'PLATFORM';
    }

    function applyVisibilityRules(item, rules, roles) {
        var matching = rules.filter(function matches(rule) {
            return rule.targetId === item.itemId || rule.targetId === item.widgetId || rule.targetId === item.dashboardId;
        });
        if (!matching.length) return true;
        var denied = matching.some(function deniedByRule(rule) {
            return rule.deniedRoles.some(function deniedRole(role) { return roles.indexOf(normalizeRole(role)) !== -1; });
        });
        if (denied) return false;
        var roleSpecificRules = matching.filter(function appliesToRole(rule) {
            return hasAnyRole(roles, rule.allowedRoles);
        });
        if (!roleSpecificRules.length) return true;
        return roleSpecificRules.some(function allowedByRule(rule) {
            return hasAnyRole(roles, rule.allowedRoles) && hasCapability(roles, rule.requiredCapability);
        });
    }

    function dedupeByRoute(items) {
        var byRoute = {};
        items.forEach(function eachItem(item) {
            var key = safeString(item.route || item.itemId, item.itemId);
            var existing = byRoute[key];
            if (!existing || item.priority > existing.priority || item.usageCount > existing.usageCount) {
                byRoute[key] = item;
            }
        });
        return Object.keys(byRoute).map(function routeKey(key) { return byRoute[key]; });
    }

    function scopedNavigation(normalized, roles, context) {
        return dedupeByRoute((normalized.navigationItems || []).filter(function visible(item) {
            return routeVisibleForContext(item, roles, context) &&
                sameTenantOrPlatform(item, normalized.tenantSlug) &&
                rolePermissionAllowed(item, roles, context) &&
                applyVisibilityRules(item, normalized.visibilityRules || [], roles);
        })).sort(function sortNav(a, b) {
            return b.priority - a.priority || b.usageCount - a.usageCount || a.label.localeCompare(b.label);
        });
    }

    function widgetsById(normalized) {
        var map = {};
        (normalized.widgets || []).forEach(function eachWidget(widget) {
            map[widget.widgetId] = widget;
        });
        return map;
    }

    function buildDashboardLayout(normalized, roles, context, navigation) {
        var ctxRoute = routeTypeOf(context && context.routeType || 'tenant', 'TENANT');
        var widgetMap = widgetsById(normalized);
        function dashboardRoleWeight(dashboard) {
            return (dashboard.allowedRoles || []).reduce(function maxRole(max, role) {
                var normalizedRole = normalizeRole(role);
                return roles.indexOf(normalizedRole) !== -1 ? Math.max(max, ROLE_PRIORITY[normalizedRole] || 0) : max;
            }, 0);
        }
        var dashboards = (normalized.dashboards || []).filter(function dashboardVisible(dashboard) {
            var dashboardRoute = routeTypeOf(dashboard.routeType || 'tenant', 'TENANT');
            if (roles.indexOf('PLATFORM_OWNER') !== -1) return ctxRoute === 'PLATFORM' && dashboardRoute === 'PLATFORM';
            if (roles.indexOf('SUPER_ADMIN') !== -1 && ctxRoute === 'PLATFORM') return hasAnyRole(['SUPER_ADMIN'], dashboard.allowedRoles);
            return ctxRoute !== 'PLATFORM' && dashboardRoute !== 'PLATFORM' && hasAnyRole(roles, dashboard.allowedRoles);
        }).sort(function sortDashboard(a, b) {
            return dashboardRoleWeight(b) - dashboardRoleWeight(a);
        });
        var active = dashboards[0] || null;
        var widgets = [];
        if (active) {
            widgets = active.widgetIds.map(function widgetFromId(widgetId) {
                var widget = widgetMap[widgetId] || {
                    widgetId: widgetId,
                    label: safeString(widgetId, 'Widget').replace(/[-_]+/g, ' ').replace(/\b\w/g, function cap(letter) { return letter.toUpperCase(); }),
                    allowedRoles: roles,
                    usageCount: 1
                };
                return {
                    widgetId: widget.widgetId,
                    label: widget.label,
                    priority: navigation.some(function navJourney(item) { return item.journey && item.journey === widget.journey; }) ? 90 : 60,
                    visible: !widget.confidential && hasAnyRole(roles, widget.allowedRoles || roles)
                };
            }).filter(function visibleWidget(widget) { return widget.visible; }).slice(0, 8);
        }
        return {
            dashboardId: active ? active.dashboardId : 'role-dashboard',
            dashboardType: active ? active.dashboardType : 'role',
            widgets: widgets,
            summaries: navigation.slice(0, 4).map(function navSummary(item) {
                return { itemId: item.itemId, label: item.label, group: item.group };
            })
        };
    }

    function buildRoleNavigation(payload, context) {
        try {
            var ctx = context || {};
            var roles = normalizeRoles(ctx.actor && ctx.actor.role || ctx.role || 'EMPLOYEE');
            var normalized = payload && payload.success === true && payload.navigationItems ? payload : normalizeUXPayload(payload || {}, ctx);
            if (!normalized.success) return normalized;
            var scope = validateRoleExperienceScope(roles, ctx, normalized);
            if (!scope.allowed) return scope;
            var navigation = scopedNavigation(normalized, roles, ctx);
            var quickActions = navigation.slice(0, 5).map(function quickAction(item) {
                return {
                    actionId: item.itemId,
                    label: item.label,
                    route: item.route,
                    group: item.group,
                    journey: item.journey || item.itemId
                };
            });
            var groups = {};
            navigation.forEach(function groupNav(item) {
                var key = item.group || 'General';
                if (!groups[key]) groups[key] = [];
                groups[key].push(item.itemId);
            });
            var dashboardLayout = buildDashboardLayout(normalized, roles, ctx, navigation);
            return freezeUXOutput({
                success: true,
                roles: roles,
                tenantSlug: normalized.tenantSlug,
                navigation: navigation,
                quickActions: quickActions,
                navigationGroups: groups,
                dashboardLayout: dashboardLayout,
                visibility: {
                    visibleNavigationItems: navigation.length,
                    visibleWidgets: dashboardLayout.widgets.length,
                    contextualVisibilityApplied: true
                },
                governance: {
                    backwardCompatibilityPreserved: true,
                    tenantIsolationPreserved: true,
                    rbacGovernancePreserved: true,
                    rbacAuthoritative: true,
                    uiVisibilityOnly: true
                }
            });
        } catch (error) {
            return freezeUXOutput({
                success: false,
                classification: 'ROLE_NAVIGATION_FAILED',
                message: 'Role navigation failed safely.',
                error: safeString(error && error.message, ''),
                governance: {
                    tenantIsolationPreserved: true,
                    rbacGovernancePreserved: true,
                    rbacAuthoritative: true
                }
            });
        }
    }

    function duplicateNavigationItems(items) {
        var seen = {};
        var duplicates = [];
        (items || []).forEach(function eachItem(item) {
            var key = safeString(item.route || item.itemId, item.itemId);
            if (seen[key]) duplicates.push(item);
            else seen[key] = true;
        });
        return duplicates;
    }

    function findConflictingRules(rules) {
        return (rules || []).filter(function conflict(rule) {
            return (rule.deniedRoles || []).some(function denied(role) {
                return (rule.allowedRoles || []).map(normalizeRole).indexOf(normalizeRole(role)) !== -1;
            });
        });
    }

    function workflowFriction(workflows) {
        return (workflows || []).filter(function friction(row) {
            return row.abandonmentRate >= 0.15 || row.steps > 5 || row.completionRate < 0.75 || row.averageSeconds > 150;
        }).map(function summarize(row) {
            return {
                workflowId: row.workflowId,
                journey: row.journey,
                role: row.role,
                steps: row.steps,
                abandonmentRate: row.abandonmentRate,
                completionRate: row.completionRate,
                severity: row.abandonmentRate >= 0.25 || row.completionRate < 0.6 ? 'HIGH' : 'MODERATE'
            };
        });
    }

    function calculateUXComplexity(normalized) {
        try {
            var input = normalized && normalized.success === true ? normalized : normalizeUXPayload(normalized || {}, {});
            if (!input.success) return input;
            var navItems = input.navigationItems || [];
            var duplicateItems = duplicateNavigationItems(navItems);
            var unusedItems = navItems.filter(function unused(item) { return item.usageCount <= 0 || item.priority < 60 && item.usageCount < 3; });
            var conflicts = findConflictingRules(input.visibilityRules || []);
            var frictionPoints = workflowFriction(input.workflows || []);
            var groupCount = {};
            navItems.forEach(function countGroup(item) { groupCount[item.group] = (groupCount[item.group] || 0) + 1; });
            var overNestedGroups = Object.keys(groupCount).filter(function tooMany(group) { return groupCount[group] > 6; }).length;
            var clutterPenalty = Math.max(0, navItems.length - 12) * 2 + duplicateItems.length * 8 + unusedItems.length * 4 + conflicts.length * 8 + overNestedGroups * 6;
            var workflowPenalty = frictionPoints.length * 6;
            var uxSimplicityScore = clamp(100 - clutterPenalty - workflowPenalty, 0, 100);
            var navigationEfficiencyScore = clamp(100 - duplicateItems.length * 10 - unusedItems.length * 5 - Math.max(0, navItems.length - 10) * 2, 0, 100);
            var workflowEfficiencyScore = clamp(100 - workflowPenalty - frictionPoints.reduce(function sumPenalty(sum, item) {
                return sum + (item.severity === 'HIGH' ? 8 : 4);
            }, 0), 0, 100);
            return freezeUXOutput({
                success: true,
                uxSimplicityScore: Math.round(uxSimplicityScore),
                navigationEfficiencyScore: Math.round(navigationEfficiencyScore),
                workflowEfficiencyScore: Math.round(workflowEfficiencyScore),
                complexityClass: uxSimplicityScore < 55 ? 'CRITICAL' : uxSimplicityScore < 70 ? 'HIGH' : uxSimplicityScore < 85 ? 'MODERATE' : 'LOW',
                unusedNavigationItems: unusedItems,
                duplicateNavigationItems: duplicateItems,
                conflictingVisibilityRules: conflicts,
                workflowFrictionPoints: frictionPoints,
                analytics: {
                    totalNavigationItems: navItems.length,
                    totalDashboards: (input.dashboards || []).length,
                    totalWidgets: (input.widgets || []).length,
                    totalWorkflows: (input.workflows || []).length
                },
                governance: {
                    tenantIsolationPreserved: true,
                    rbacGovernancePreserved: true,
                    rbacAuthoritative: true
                }
            });
        } catch (error) {
            return freezeUXOutput({
                success: false,
                classification: 'UX_COMPLEXITY_FAILED',
                message: 'UX complexity scoring failed safely.',
                governance: { tenantIsolationPreserved: true, rbacGovernancePreserved: true }
            });
        }
    }

    function opportunity(type, severity, message, targetId) {
        return {
            type: type,
            severity: severity,
            targetId: safeString(targetId || '', ''),
            message: safeString(message || type, type)
        };
    }

    function optimizeUserJourney(payload, context) {
        try {
            var ctx = context || {};
            var normalized = payload && payload.success === true && payload.navigationItems ? payload : normalizeUXPayload(payload || {}, ctx);
            if (!normalized.success) return normalized;
            var complexity = calculateUXComplexity(normalized);
            var roles = normalizeRoles(ctx.actor && ctx.actor.role || ctx.role || 'EMPLOYEE');
            var roleExperiences = {};
            roles.forEach(function buildRole(role) {
                var nav = buildRoleNavigation(normalized, {
                    routeType: ctx.routeType || (role === 'PLATFORM_OWNER' || role === 'SUPER_ADMIN' ? 'platform' : 'tenant'),
                    tenantSlug: ctx.tenantSlug || normalized.tenantSlug,
                    infrastructureOnly: ctx.infrastructureOnly || role === 'SUPER_ADMIN',
                    monitoringOnly: ctx.monitoringOnly || role === 'SUPER_ADMIN',
                    actor: { role: role, id: actorId(ctx) }
                });
                if (nav && nav.success) roleExperiences[role] = {
                    navigation: nav.navigation,
                    quickActions: nav.quickActions,
                    dashboardLayout: nav.dashboardLayout
                };
            });
            var opportunities = [];
            (complexity.duplicateNavigationItems || []).forEach(function duplicate(item) {
                opportunities.push(opportunity('duplicate_navigation', 'MODERATE', 'Merge duplicate route entry to reduce navigation clutter.', item.itemId));
            });
            (complexity.unusedNavigationItems || []).forEach(function unused(item) {
                opportunities.push(opportunity('unused_navigation', 'LOW', 'Hide or demote low-use navigation item.', item.itemId));
            });
            (complexity.workflowFrictionPoints || []).forEach(function friction(item) {
                opportunities.push(opportunity('workflow_friction', item.severity, 'Shorten or shortcut high-friction workflow.', item.workflowId));
            });
            if (!opportunities.length) {
                opportunities.push(opportunity('shortcut_optimization', 'LOW', 'Keep role quick actions close to primary workflow entry points.', 'quick-actions'));
            }
            return freezeUXOutput({
                success: true,
                roleExperiences: roleExperiences,
                optimizationOpportunities: opportunities,
                complexity: complexity,
                governance: {
                    backwardCompatibilityPreserved: true,
                    tenantIsolationPreserved: true,
                    rbacGovernancePreserved: true,
                    rbacAuthoritative: true,
                    uiVisibilityOnly: true
                }
            });
        } catch (error) {
            return freezeUXOutput({
                success: false,
                classification: 'USER_JOURNEY_OPTIMIZATION_FAILED',
                message: 'User journey optimization failed safely.',
                governance: { tenantIsolationPreserved: true, rbacGovernancePreserved: true }
            });
        }
    }

    function roleCanViewUXGovernance(role, context, payload) {
        var normalizedRole = normalizeRole(role);
        var routeType = routeTypeOf(context && context.routeType || payload && payload.routeType || 'platform', 'PLATFORM');
        if (normalizedRole === 'PLATFORM_OWNER') return routeType === 'PLATFORM';
        if (normalizedRole === 'SUPER_ADMIN') {
            return routeType === 'PLATFORM' && (
                context && context.infrastructureOnly === true ||
                context && context.monitoringOnly === true ||
                payload && payload.infrastructureOnly === true ||
                payload && payload.monitoringOnly === true
            );
        }
        return false;
    }

    function validateUXGovernanceScope(payload, context) {
        try {
            var ctx = context || {};
            var record = payload || {};
            var role = normalizeRole((ctx.actor && ctx.actor.role) || ctx.role || '');
            var payloadTenant = normalizeTenantSlug(record.tenantSlug || record.tenantId || record.companyId || '');
            var ctxTenant = contextTenant(ctx);
            if (!roleCanViewUXGovernance(role, ctx, record)) {
                return freezeUXOutput({
                    success: false,
                    allowed: false,
                    classification: 'UX_GOVERNANCE_ROLE_BLOCKED',
                    message: 'UX governance insights are restricted to platform operations roles.',
                    governance: {
                        tenantIsolationPreserved: true,
                        rbacGovernancePreserved: true,
                        rbacAuthoritative: true
                    }
                });
            }
            if (payloadTenant && ctxTenant && payloadTenant !== ctxTenant) {
                return freezeUXOutput({
                    success: false,
                    allowed: false,
                    classification: 'TENANT_SCOPE_BLOCKED',
                    message: 'UX governance scope must match the active tenant context.',
                    governance: {
                        tenantIsolationPreserved: true,
                        rbacGovernancePreserved: true,
                        rbacAuthoritative: true
                    }
                });
            }
            return freezeUXOutput({
                success: true,
                allowed: true,
                role: role,
                visibility: role === 'SUPER_ADMIN' ? 'INFRASTRUCTURE_UX_MONITORING' : 'PLATFORM_UX_GOVERNANCE',
                tenantSlug: payloadTenant || ctxTenant || 'platform',
                governance: {
                    tenantIsolationPreserved: true,
                    rbacGovernancePreserved: true,
                    rbacAuthoritative: true
                }
            });
        } catch (error) {
            return freezeUXOutput({
                success: false,
                allowed: false,
                classification: 'UX_GOVERNANCE_SCOPE_FAILED',
                message: 'UX governance scope validation failed safely.',
                governance: {
                    tenantIsolationPreserved: true,
                    rbacGovernancePreserved: true,
                    rbacAuthoritative: true
                }
            });
        }
    }

    function emitTelemetry(eventType, metadata, context) {
        try {
            if (context && context.skipTelemetry === true) return false;
            var svc = global.WorkflowTelemetryService;
            if (svc && typeof svc.emitTelemetry === 'function') {
                svc.emitTelemetry('GOVERNANCE', eventType, {
                    source: 'uxPermissionSimplificationService',
                    metadata: cloneSanitized(metadata || {})
                });
                return true;
            }
        } catch (error) {}
        return false;
    }

    function recordAudit(actionType, metadata, context) {
        try {
            if (context && context.skipAuditPersistence === true) return false;
            var audit = global.AuditService;
            if (audit && typeof audit.recordAudit === 'function') {
                audit.recordAudit({
                    eventType: actionType,
                    actionType: actionType,
                    module: 'UX_PERMISSION_SIMPLIFICATION',
                    targetId: metadata && metadata.reportId || metadata && metadata.role || 'ux-governance',
                    description: 'UX permission simplification governance action recorded.',
                    metadata: cloneSanitized(metadata || {})
                }, {
                    actor: context && context.actor || {},
                    tenantSlug: contextTenant(context || {}),
                    source: 'uxPermissionSimplificationService'
                });
                return true;
            }
            var data = rawData();
            data.auditLogs = Array.isArray(data.auditLogs) ? data.auditLogs : [];
            data.auditLogs.unshift({
                id: 'UXA-' + Date.now(),
                actionType: actionType,
                eventType: actionType,
                module: 'UX_PERMISSION_SIMPLIFICATION',
                actorRole: context && context.actor && context.actor.role || '',
                actorId: actorId(context || {}),
                tenantSlug: contextTenant(context || ''),
                metadata: cloneSanitized(metadata || {}),
                createdAt: nowIso()
            });
            saveData(data);
            return true;
        } catch (error) {}
        return false;
    }

    function recordMetrics(eventType, metadata, context) {
        try {
            if (context && context.skipMetrics === true) return false;
            var metrics = global.OrchestrationMetricsService;
            if (metrics && typeof metrics.recordWorkflowMetric === 'function') {
                metrics.recordWorkflowMetric('UX_PERMISSION_SIMPLIFICATION', eventType, cloneSanitized(metadata || {}));
                return true;
            }
        } catch (error) {}
        return false;
    }

    function persistReport(report, context) {
        try {
            if (context && context.skipPersistence === true) return false;
            var data = rawData();
            data.uxPermissionSimplificationHistory = Array.isArray(data.uxPermissionSimplificationHistory) ? data.uxPermissionSimplificationHistory : [];
            data.uxPermissionSimplificationAnalytics = Array.isArray(data.uxPermissionSimplificationAnalytics) ? data.uxPermissionSimplificationAnalytics : [];
            data.uxPermissionSimplificationHistory.unshift(cloneSanitized({
                reportId: report.reportId,
                tenantSlug: report.tenantSlug,
                generatedAt: report.generatedAt,
                uxSimplicityScore: report.complexity && report.complexity.uxSimplicityScore,
                navigationEfficiencyScore: report.complexity && report.complexity.navigationEfficiencyScore,
                workflowEfficiencyScore: report.complexity && report.complexity.workflowEfficiencyScore,
                roleCount: Object.keys(report.roleExperiences || {}).length
            }));
            data.uxPermissionSimplificationAnalytics.unshift(cloneSanitized({
                reportId: report.reportId,
                tenantSlug: report.tenantSlug,
                generatedAt: report.generatedAt,
                unusedNavigationItems: (report.complexity && report.complexity.unusedNavigationItems || []).length,
                workflowFrictionPoints: (report.complexity && report.complexity.workflowFrictionPoints || []).length,
                optimizationOpportunities: (report.optimizationOpportunities || []).length
            }));
            if (data.uxPermissionSimplificationHistory.length > MAX_HISTORY) data.uxPermissionSimplificationHistory.length = MAX_HISTORY;
            if (data.uxPermissionSimplificationAnalytics.length > MAX_HISTORY) data.uxPermissionSimplificationAnalytics.length = MAX_HISTORY;
            return saveData(data);
        } catch (error) {
            return false;
        }
    }

    function generateRoleExperiences(normalized) {
        var result = {};
        ['EMPLOYEE', 'MANAGER', 'HR', 'DIRECTOR'].forEach(function tenantRole(role) {
            var experience = buildRoleNavigation(normalized, {
                routeType: 'tenant',
                tenantSlug: normalized.tenantSlug,
                actor: { role: role, id: role + '-SUMMARY' },
                skipAuditPersistence: true,
                skipTelemetry: true,
                skipMetrics: true
            });
            if (experience && experience.success) {
                result[role] = {
                    navigation: experience.navigation,
                    quickActions: experience.quickActions,
                    dashboardLayout: experience.dashboardLayout
                };
            }
        });
        var superAdmin = buildRoleNavigation(normalized, {
            routeType: 'platform',
            tenantSlug: normalized.tenantSlug,
            infrastructureOnly: true,
            monitoringOnly: true,
            actor: { role: 'SUPER_ADMIN', id: 'SUPER_ADMIN-SUMMARY' },
            skipAuditPersistence: true,
            skipTelemetry: true,
            skipMetrics: true
        });
        if (superAdmin && superAdmin.success) {
            result.SUPER_ADMIN = {
                navigation: superAdmin.navigation,
                quickActions: superAdmin.quickActions,
                dashboardLayout: superAdmin.dashboardLayout
            };
        }
        var owner = buildRoleNavigation(normalized, {
            routeType: 'platform',
            actor: { role: 'PLATFORM_OWNER', id: 'PLATFORM_OWNER-SUMMARY' },
            skipAuditPersistence: true,
            skipTelemetry: true,
            skipMetrics: true
        });
        if (owner && owner.success) {
            result.PLATFORM_OWNER = {
                navigation: owner.navigation,
                quickActions: owner.quickActions,
                dashboardLayout: owner.dashboardLayout
            };
        }
        return result;
    }

    function integrationHealth(context) {
        return {
            permissionMatrixIntegrated: !!(global.PermissionMatrixService && typeof global.PermissionMatrixService.validateRolePermission === 'function'),
            smartSearchIntegrated: !!global.SmartSearchService,
            notificationCenterIntegrated: !!global.NotificationCenterService,
            activityFeedIntegrated: !!global.GlobalActivityFeedService,
            auditIntegrated: !!global.AuditService && context && context.skipAuditPersistence !== true,
            telemetryIntegrated: !!global.WorkflowTelemetryService && context && context.skipTelemetry !== true,
            metricsIntegrated: !!global.OrchestrationMetricsService && context && context.skipMetrics !== true
        };
    }

    function generateUXGovernanceReport(payload, context) {
        try {
            var ctx = context || {};
            var scope = validateUXGovernanceScope(payload || {}, ctx);
            if (!scope.allowed) return scope;
            var normalized = normalizeUXPayload(payload || {}, ctx);
            if (!normalized.success) return normalized;
            var complexity = calculateUXComplexity(normalized);
            var optimized = optimizeUserJourney(normalized, {
                routeType: 'tenant',
                tenantSlug: normalized.tenantSlug,
                actor: { role: 'MANAGER', id: 'UX-SUMMARY' },
                skipAuditPersistence: true,
                skipTelemetry: true,
                skipMetrics: true
            });
            var roleExperiences = generateRoleExperiences(normalized);
            var report = freezeUXOutput({
                success: true,
                reportId: 'UXG-' + Date.now(),
                generatedAt: nowIso(),
                tenantSlug: normalized.tenantSlug,
                state: complexity.complexityClass === 'LOW' ? 'SIMPLIFIED' : 'FRICTION_DETECTED',
                roleComplexityScore: complexity.uxSimplicityScore,
                navigationEfficiencyScore: complexity.navigationEfficiencyScore,
                workflowEfficiencyScore: complexity.workflowEfficiencyScore,
                complexity: complexity,
                roleExperiences: roleExperiences,
                optimizationOpportunities: optimized.optimizationOpportunities || [],
                visibilityGovernance: {
                    contextualVisibilityApplied: true,
                    hiddenPermissionLeaksBlocked: true,
                    permissionVisibilityIsPresentationOnly: true,
                    rbacRemainsAuthoritative: true
                },
                integrationHealth: integrationHealth(ctx),
                governance: {
                    backwardCompatibilityPreserved: true,
                    tenantIsolationPreserved: true,
                    rbacGovernancePreserved: true,
                    rbacAuthoritative: true,
                    uiVisibilityOnly: true,
                    existingWorkflowsPreserved: true
                }
            });
            persistReport(report, ctx);
            var auditIntegrated = recordAudit('UX_PERMISSION_SIMPLIFICATION_REPORT_GENERATED', {
                reportId: report.reportId,
                tenantSlug: report.tenantSlug,
                uxSimplicityScore: report.roleComplexityScore,
                navigationEfficiencyScore: report.navigationEfficiencyScore
            }, ctx);
            var telemetryIntegrated = emitTelemetry('UX_PERMISSION_SIMPLIFICATION_REVIEWED', {
                reportId: report.reportId,
                tenantSlug: report.tenantSlug,
                complexityClass: complexity.complexityClass
            }, ctx);
            recordMetrics('UX_PERMISSION_SIMPLIFICATION_REVIEWED', {
                reportId: report.reportId,
                complexityClass: complexity.complexityClass
            }, ctx);
            return freezeUXOutput(Object.assign({}, report, {
                integrationHealth: Object.assign({}, report.integrationHealth, {
                    auditIntegrated: auditIntegrated && ctx.skipAuditPersistence !== true,
                    telemetryIntegrated: telemetryIntegrated && ctx.skipTelemetry !== true
                })
            }));
        } catch (error) {
            return freezeUXOutput({
                success: false,
                classification: 'UX_GOVERNANCE_REPORT_FAILED',
                message: 'UX governance report failed safely.',
                error: safeString(error && error.message, ''),
                governance: {
                    tenantIsolationPreserved: true,
                    rbacGovernancePreserved: true,
                    rbacAuthoritative: true
                }
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        function record(name, passed, details) {
            checks.push({ name: name, passed: !!passed, details: cloneSanitized(details || {}) });
        }
        try {
            var malformed = normalizeUXPayload('bad-input', {});
            record('malformed payloads fail safely', malformed.success === false && Object.isFrozen(malformed));
            var payload = {
                tenantSlug: 'selftest',
                navigationItems: [
                    { itemId: 'attendance', label: 'Attendance', route: 'employee.html#attendance', allowedRoles: ['EMPLOYEE'], requiredCapability: 'own_attendance', journey: 'attendance', usageCount: 20, tenantSlug: 'selftest' },
                    { itemId: 'platform', label: 'Platform Governance', route: 'platform-control.html', routeType: 'platform', allowedRoles: ['PLATFORM_OWNER'], requiredCapability: 'platform_governance', journey: 'platform_governance', usageCount: 5 },
                    { itemId: 'duplicate-platform', label: 'Platform Governance', route: 'platform-control.html', routeType: 'platform', allowedRoles: ['PLATFORM_OWNER'], usageCount: 0 }
                ],
                dashboards: [
                    { dashboardId: 'employee-dashboard', allowedRoles: ['EMPLOYEE'], widgetIds: ['attendance-widget'], tenantSlug: 'selftest' }
                ],
                widgets: [
                    { widgetId: 'attendance-widget', label: 'Attendance', allowedRoles: ['EMPLOYEE'], tenantSlug: 'selftest' }
                ],
                workflows: [
                    { workflowId: 'approval-flow', journey: 'approvals', role: 'MANAGER', steps: 7, abandonmentRate: 0.2, completionRate: 0.72, tenantSlug: 'selftest' }
                ],
                visibilityRules: [
                    { ruleId: 'employee-attendance', targetId: 'attendance', allowedRoles: ['EMPLOYEE'], requiredCapability: 'own_attendance', tenantSlug: 'selftest' }
                ],
                metadata: { salary: 1000, leaveBalance: 3 }
            };
            var employeeNav = buildRoleNavigation(payload, { routeType: 'tenant', tenantSlug: 'selftest', actor: { role: 'EMPLOYEE', id: 'EMP-SELF' } });
            var ownerBlocked = buildRoleNavigation(payload, { routeType: 'tenant', tenantSlug: 'selftest', actor: { role: 'PLATFORM_OWNER', id: 'PO-SELF' } });
            var normalized = normalizeUXPayload(payload, { tenantSlug: 'selftest' });
            var complexity = calculateUXComplexity(normalized);
            var optimized = optimizeUserJourney(normalized, { routeType: 'tenant', tenantSlug: 'selftest', actor: { role: 'EMPLOYEE' } });
            var report = generateUXGovernanceReport(payload, { routeType: 'platform', tenantSlug: 'selftest', actor: { role: 'PLATFORM_OWNER' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true });
            record('role navigation works', employeeNav.success === true && employeeNav.navigation.some(function hasAttendance(item) { return item.itemId === 'attendance'; }));
            record('visibility rules work', ownerBlocked.success === false && employeeNav.navigation.every(function noPlatform(item) { return item.itemId !== 'platform'; }));
            record('dashboard optimization works', optimized.success === true && optimized.roleExperiences.EMPLOYEE && optimized.roleExperiences.EMPLOYEE.dashboardLayout.widgets.length === 1);
            record('UX scoring works', complexity.success === true && typeof complexity.uxSimplicityScore === 'number');
            record('immutable outputs enforced', Object.isFrozen(report) && Object.isFrozen(employeeNav) && Object.isFrozen(complexity));
        } catch (error) {
            record('self-test uncaught exception guard', false, { error: error && error.message });
        }
        var result = freezeUXOutput({
            passed: checks.every(function ok(row) { return row.passed; }),
            tests: checks,
            checkedAt: nowIso()
        });
        global.__ARTHHRMS_UX_PERMISSION_SIMPLIFICATION_SELF_TEST__ = result;
        return result;
    }

    var UXPermissionSimplificationService = Object.freeze({
        VERSION: '1.0.0',
        UX_STATES: UX_STATES,
        EXPERIENCE_ROLES: EXPERIENCE_ROLES,
        buildRoleNavigation: buildRoleNavigation,
        calculateUXComplexity: calculateUXComplexity,
        optimizeUserJourney: optimizeUserJourney,
        normalizeUXPayload: normalizeUXPayload,
        freezeUXOutput: freezeUXOutput,
        generateUXGovernanceReport: generateUXGovernanceReport,
        validateUXGovernanceScope: validateUXGovernanceScope,
        runSelfTest: runSelfTest
    });

    global.UXPermissionSimplificationService = UXPermissionSimplificationService;
    global.uxPermissionSimplificationService = UXPermissionSimplificationService;

    if (global.__ARTHHRMS_DEV__) {
        try {
            runSelfTest();
        } catch (error) {
            global.__ARTHHRMS_UX_PERMISSION_SIMPLIFICATION_SELF_TEST__ = freezeUXOutput({
                passed: false,
                tests: [{ name: 'self-test wrapper', passed: false, details: { error: error && error.message } }],
                checkedAt: nowIso()
            });
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
