/**
 * renderOptimizationService.js
 * ARTHHRMS - Lazy Loading + Render Optimization + Scalable UI Delivery Framework
 *
 * PURPOSE:
 * Provides governed lazy loading checks, deferred-rendering analysis,
 * virtualization recommendations, memory scoring, load optimization, and
 * immutable render efficiency reports for platform operations roles.
 *
 * This service does NOT:
 * - mutate tenant business data
 * - expose cross-tenant records
 * - expose salaries, leave balances, raw documents, tokens, or private payloads
 * - bypass RBAC, tenant isolation, audit, telemetry, or render governance
 *
 * @version 1.0.0
 */
(function attachRenderOptimizationService(global) {
    'use strict';

    var MAX_HISTORY = 500;
    var MAX_ROWS = 250;

    var RENDER_STATES = Object.freeze([
        'MONITORING',
        'DEFERRED',
        'VIRTUALIZED',
        'OPTIMIZED',
        'DEGRADED',
        'CRITICAL',
        'ARCHIVED'
    ]);

    var LOAD_STATES = Object.freeze([
        'IDLE',
        'QUEUED',
        'LOADING',
        'LOADED',
        'FAILED',
        'BLOCKED',
        'ARCHIVED'
    ]);

    var OPTIMIZATION_CLASSES = Object.freeze({
        LOW: 'LOW',
        MODERATE: 'MODERATE',
        HIGH: 'HIGH',
        CRITICAL: 'CRITICAL'
    });

    var SENSITIVE_KEY_PATTERN = /(salary|payroll.?amount|payrollAmount|payslip|compensation|ctc|leave.?balance|leaveBalance|gross|net|basic|hra|pf|tds|allowance|deduction|password|secret|token|jwt|authorization|service.?role|private.?key|bank|tax|raw.?payload|raw.?content|raw.?body|raw.?document|payload|content|body|signed.?url|download.?url|storage.?path|file.?path|document|employeeRecord|confidential|privateNote)/i;
    var SENSITIVE_VALUE_PATTERN = /\b(salary|payrollAmount|payroll|compensation|ctc|leave\s*balance|leaveBalance|confidential)\s*[:=]?\s*[\w,.\- ]+/ig;

    var moduleCache = {};

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
        return role || 'EMPLOYEE';
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
            return value.map(function cloneArrayItem(item) {
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

    function freezeOptimizationOutput(value) {
        return freezeDeep(cloneSanitized(value || {}));
    }

    function roleCanViewOptimization(role, context, payload) {
        var normalizedRole = normalizeRole(role);
        var routeType = normalizeToken(context && context.routeType || payload && payload.routeType || 'platform');
        if (normalizedRole === 'PLATFORM_OWNER') return routeType === 'PLATFORM';
        if (normalizedRole === 'SUPER_ADMIN') {
            return routeType === 'PLATFORM' && (
                context && context.infrastructureOnly === true ||
                payload && payload.infrastructureOnly === true ||
                payload && normalizeToken(payload.mode || '') === 'INFRASTRUCTURE_MONITORING'
            );
        }
        return false;
    }

    function validateOptimizationScope(payload, context) {
        try {
            var ctx = context || {};
            var record = payload || {};
            var role = normalizeRole((ctx.actor && ctx.actor.role) || ctx.role || '');
            var payloadTenant = normalizeTenantSlug(record.tenantSlug || record.tenantId || record.companyId || '');
            var ctxTenant = contextTenant(ctx);
            if (!roleCanViewOptimization(role, ctx, record)) {
                return freezeOptimizationOutput({
                    success: false,
                    allowed: false,
                    classification: 'ROLE_SCOPE_BLOCKED',
                    message: 'Render optimization insights are restricted to platform operations roles.',
                    governance: {
                        tenantIsolationPreserved: true,
                        renderingOptimizationGovernancePreserved: true
                    }
                });
            }
            if (payloadTenant && ctxTenant && payloadTenant !== ctxTenant) {
                return freezeOptimizationOutput({
                    success: false,
                    allowed: false,
                    classification: 'TENANT_SCOPE_BLOCKED',
                    message: 'Render optimization scope must match the active tenant context.',
                    governance: {
                        tenantIsolationPreserved: true,
                        renderingOptimizationGovernancePreserved: true
                    }
                });
            }
            return freezeOptimizationOutput({
                success: true,
                allowed: true,
                role: role,
                visibility: role === 'SUPER_ADMIN' ? 'INFRASTRUCTURE_RENDER_MONITORING' : 'PLATFORM_RENDER_OPTIMIZATION_GOVERNANCE',
                tenantSlug: payloadTenant || ctxTenant || 'platform',
                governance: {
                    tenantIsolationPreserved: true,
                    renderingOptimizationGovernancePreserved: true
                }
            });
        } catch (error) {
            return freezeOptimizationOutput({
                success: false,
                allowed: false,
                classification: 'SCOPE_VALIDATION_FAILED',
                message: 'Render optimization scope validation failed safely.',
                governance: {
                    tenantIsolationPreserved: true,
                    renderingOptimizationGovernancePreserved: true
                }
            });
        }
    }

    function normalizeRoute(row, tenantSlug, index) {
        var source = isPlainObject(row) ? row : {};
        return {
            routeId: safeString(source.routeId || source.id || ('route-' + (index + 1)), 'route'),
            routeType: normalizeToken(source.routeType || source.type || 'dashboard'),
            tenantSlug: normalizeTenantSlug(source.tenantSlug || tenantSlug),
            loadDurationMs: safeNumber(source.loadDurationMs || source.loadMs, 0),
            moduleCount: safeNumber(source.moduleCount || source.modules, 0),
            unusedStartupModules: safeNumber(source.unusedStartupModules || source.unusedModules, 0),
            preloadedModules: safeNumber(source.preloadedModules || source.preloads, 0),
            routeFrequency: safeNumber(source.routeFrequency || source.frequency, 0),
            metadata: cloneSanitized(source.metadata || {})
        };
    }

    function normalizeModule(row, tenantSlug, index) {
        var source = isPlainObject(row) ? row : {};
        return {
            moduleId: safeString(source.moduleId || source.id || ('module-' + (index + 1)), 'module'),
            moduleType: normalizeToken(source.moduleType || source.type || 'MODULE'),
            tenantSlug: normalizeTenantSlug(source.tenantSlug || tenantSlug),
            estimatedKb: safeNumber(source.estimatedKb || source.kb || source.sizeKb, 0),
            initMs: safeNumber(source.initMs || source.initializationMs || source.loadMs, 0),
            usedAtStartup: source.usedAtStartup === true,
            critical: source.critical === true,
            deferred: source.deferred === true,
            preloaded: source.preloaded === true,
            authorized: source.authorized !== false,
            duplicateLoads: safeNumber(source.duplicateLoads, 0),
            loadFrequency: safeNumber(source.loadFrequency || source.frequency, 0),
            metadata: cloneSanitized(source.metadata || {})
        };
    }

    function normalizeComponent(row, index) {
        var source = isPlainObject(row) ? row : {};
        return {
            componentId: safeString(source.componentId || source.id || ('component-' + (index + 1)), 'component'),
            componentType: normalizeToken(source.componentType || source.type || 'COMPONENT'),
            renderDurationMs: safeNumber(source.renderDurationMs || source.renderMs, 0),
            memoryMb: safeNumber(source.memoryMb || source.memoryUsageMb, 0),
            recordCount: safeNumber(source.recordCount || source.records, 0),
            renderCycles: safeNumber(source.renderCycles || source.renderCount, 0),
            virtualized: source.virtualized === true,
            memoized: source.memoized === true,
            selectiveUpdates: source.selectiveUpdates === true,
            batched: source.batched === true,
            visibleAtStartup: source.visibleAtStartup === true,
            metadata: cloneSanitized(source.metadata || {})
        };
    }

    function normalizeDataSource(row, tenantSlug, index) {
        var source = isPlainObject(row) ? row : {};
        var rowTenant = normalizeTenantSlug(source.tenantSlug || source.tenantId || source.companyId || tenantSlug);
        return {
            sourceId: safeString(source.sourceId || source.id || ('source-' + (index + 1)), 'source'),
            tenantSlug: rowTenant,
            recordCount: safeNumber(source.recordCount || source.records, 0),
            pageSize: safeNumber(source.pageSize || source.limit, 0),
            incremental: source.incremental === true,
            duplicateRequests: safeNumber(source.duplicateRequests || source.duplicates, 0),
            cacheHitRate: clamp(source.cacheHitRate === undefined ? 0 : source.cacheHitRate, 0, 1),
            viewportBased: source.viewportBased === true,
            batched: source.batched === true,
            metadata: cloneSanitized(source.metadata || {})
        };
    }

    function normalizeOptimizationPayload(payload, context) {
        try {
            if (!isPlainObject(payload)) {
                return freezeOptimizationOutput({
                    success: false,
                    classification: 'MALFORMED_PAYLOAD',
                    message: 'Render optimization payload must be an object.'
                });
            }
            var ctxTenant = contextTenant(context || {});
            var tenantSlug = normalizeTenantSlug(payload.tenantSlug || payload.tenantId || payload.companyId || ctxTenant || 'platform');
            var scope = validateOptimizationScope(Object.assign({}, payload, { tenantSlug: tenantSlug }), context || {});
            if (!scope.success) return scope;
            var normalized = {
                success: true,
                tenantSlug: tenantSlug,
                scope: scope,
                routes: (Array.isArray(payload.routes) ? payload.routes : []).slice(0, MAX_ROWS).map(function mapRoute(row, index) {
                    return normalizeRoute(row, tenantSlug, index);
                }).filter(function sameRouteTenant(row) { return !row.tenantSlug || row.tenantSlug === tenantSlug; }),
                modules: (Array.isArray(payload.modules) ? payload.modules : []).slice(0, MAX_ROWS).map(function mapModule(row, index) {
                    return normalizeModule(row, tenantSlug, index);
                }).filter(function sameModuleTenant(row) { return !row.tenantSlug || row.tenantSlug === tenantSlug; }),
                components: (Array.isArray(payload.components) ? payload.components : []).slice(0, MAX_ROWS).map(normalizeComponent),
                dataSources: (Array.isArray(payload.dataSources) ? payload.dataSources : []).slice(0, MAX_ROWS).map(function mapSource(row, index) {
                    return normalizeDataSource(row, tenantSlug, index);
                }).filter(function sameDataTenant(row) { return !row.tenantSlug || row.tenantSlug === tenantSlug; }),
                metadata: cloneSanitized(payload.metadata || {}),
                governance: {
                    backwardCompatibilityPreserved: true,
                    tenantIsolationPreserved: true,
                    renderingOptimizationGovernancePreserved: true,
                    noGovernanceBypass: true
                }
            };
            return freezeOptimizationOutput(normalized);
        } catch (error) {
            return freezeOptimizationOutput({
                success: false,
                classification: 'NORMALIZATION_FAILED',
                message: 'Render optimization payload normalization failed safely.',
                governance: {
                    tenantIsolationPreserved: true,
                    renderingOptimizationGovernancePreserved: true
                }
            });
        }
    }

    function addIssue(issues, code, severity, targetId, message, penalty) {
        issues.push({
            code: code,
            severity: severity,
            targetId: targetId,
            message: message,
            penalty: penalty
        });
        return safeNumber(penalty, 0);
    }

    function classifyScore(score) {
        if (score < 55) return OPTIMIZATION_CLASSES.CRITICAL;
        if (score < 72) return OPTIMIZATION_CLASSES.HIGH;
        if (score < 86) return OPTIMIZATION_CLASSES.MODERATE;
        return OPTIMIZATION_CLASSES.LOW;
    }

    function calculateRenderEfficiency(normalized) {
        try {
            if (!normalized || normalized.success !== true) {
                return freezeOptimizationOutput({
                    success: false,
                    classification: 'INVALID_NORMALIZED_PAYLOAD',
                    message: 'Render efficiency requires a normalized payload.'
                });
            }
            var issues = [];
            var renderPenalty = 0;
            var memoryPenalty = 0;
            var loadPenalty = 0;
            (normalized.components || []).forEach(function scoreComponent(component) {
                if (component.renderDurationMs > 600) renderPenalty += addIssue(issues, 'SLOW_RENDER', 'HIGH', component.componentId, 'Component render duration is above target.', 12);
                else if (component.renderDurationMs > 350) renderPenalty += addIssue(issues, 'MODERATE_RENDER_DELAY', 'MODERATE', component.componentId, 'Component render duration needs review.', 7);
                if (component.recordCount > 1000 && !component.virtualized) renderPenalty += addIssue(issues, 'LARGE_DATASET_WITHOUT_VIRTUALIZATION', 'HIGH', component.componentId, 'Large render surfaces should be virtualized.', 14);
                if (component.renderCycles > 8) renderPenalty += addIssue(issues, 'EXCESSIVE_RENDER_CYCLES', 'HIGH', component.componentId, 'Render cycle count is above target.', 8);
                if (!component.memoized && component.renderDurationMs > 250) renderPenalty += addIssue(issues, 'MEMOIZATION_MISSING', 'MODERATE', component.componentId, 'Memoization should protect repeated rendering.', 5);
                if (!component.selectiveUpdates && component.recordCount > 500) renderPenalty += addIssue(issues, 'SELECTIVE_UPDATES_MISSING', 'MODERATE', component.componentId, 'Selective updates should be used for large components.', 5);
                if (!component.batched && component.renderCycles > 4) renderPenalty += addIssue(issues, 'BATCHED_RENDERING_MISSING', 'MODERATE', component.componentId, 'Render updates should be batched.', 4);
                if (component.memoryMb > 160) memoryPenalty += addIssue(issues, 'COMPONENT_MEMORY_PRESSURE', 'HIGH', component.componentId, 'Component memory use is above target.', 10);
                else if (component.memoryMb > 110) memoryPenalty += addIssue(issues, 'MODERATE_MEMORY_PRESSURE', 'MODERATE', component.componentId, 'Component memory use needs review.', 5);
            });
            (normalized.modules || []).forEach(function scoreModule(module) {
                if (module.usedAtStartup && !module.critical && !module.deferred) loadPenalty += addIssue(issues, 'NON_CRITICAL_STARTUP_MODULE', 'HIGH', module.moduleId, 'Non-critical startup module should be deferred.', 9);
                if (module.estimatedKb > 220 && !module.deferred) loadPenalty += addIssue(issues, 'LARGE_MODULE_NOT_DEFERRED', 'HIGH', module.moduleId, 'Large modules should lazy load or defer.', 9);
                if (module.initMs > 450 && !module.deferred) loadPenalty += addIssue(issues, 'SLOW_MODULE_INIT', 'HIGH', module.moduleId, 'Slow module initialization should move out of startup.', 8);
                if (module.duplicateLoads > 0) loadPenalty += addIssue(issues, 'DUPLICATE_MODULE_LOADS', 'MODERATE', module.moduleId, 'Duplicate module loads should be eliminated.', Math.min(8, module.duplicateLoads * 2));
                if (!module.authorized) loadPenalty += addIssue(issues, 'UNAUTHORIZED_MODULE_PRESENT', 'CRITICAL', module.moduleId, 'Unauthorized modules must not load.', 20);
            });
            (normalized.routes || []).forEach(function scoreRoute(route) {
                if (route.loadDurationMs > 1200) loadPenalty += addIssue(issues, 'SLOW_ROUTE_LOAD', 'HIGH', route.routeId, 'Route load duration is above target.', 10);
                if (route.unusedStartupModules > 8) loadPenalty += addIssue(issues, 'UNUSED_STARTUP_MODULES', 'HIGH', route.routeId, 'Route startup includes unused modules.', Math.min(16, route.unusedStartupModules));
            });
            (normalized.dataSources || []).forEach(function scoreSource(source) {
                if (source.recordCount > 1000 && !source.incremental) loadPenalty += addIssue(issues, 'BULK_DATA_LOAD', 'HIGH', source.sourceId, 'Large data sources should load incrementally.', 10);
                if (source.duplicateRequests > 2) loadPenalty += addIssue(issues, 'DUPLICATE_DATA_REQUESTS', 'MODERATE', source.sourceId, 'Duplicate data requests should be removed.', Math.min(8, source.duplicateRequests * 2));
                if (source.cacheHitRate < 0.4 && source.recordCount > 500) loadPenalty += addIssue(issues, 'LOW_CACHE_HIT_RATE', 'MODERATE', source.sourceId, 'Cache hit rate is below target.', 5);
                if (source.recordCount > 1000 && !source.viewportBased) renderPenalty += addIssue(issues, 'VIEWPORT_LOADING_MISSING', 'MODERATE', source.sourceId, 'Viewport-based loading should protect large datasets.', 5);
            });
            var renderEfficiencyScore = clamp(100 - renderPenalty, 0, 100);
            var memoryEfficiencyScore = clamp(100 - memoryPenalty, 0, 100);
            var loadOptimizationScore = clamp(100 - loadPenalty, 0, 100);
            var aggregateScore = Math.min(renderEfficiencyScore, memoryEfficiencyScore, loadOptimizationScore);
            return freezeOptimizationOutput({
                success: true,
                renderEfficiencyScore: renderEfficiencyScore,
                memoryEfficiencyScore: memoryEfficiencyScore,
                loadOptimizationScore: loadOptimizationScore,
                optimizationClass: classifyScore(aggregateScore),
                issues: issues,
                metrics: {
                    totalRoutes: (normalized.routes || []).length,
                    totalModules: (normalized.modules || []).length,
                    totalComponents: (normalized.components || []).length,
                    totalDataSources: (normalized.dataSources || []).length,
                    renderPenalty: renderPenalty,
                    memoryPenalty: memoryPenalty,
                    loadPenalty: loadPenalty
                }
            });
        } catch (error) {
            return freezeOptimizationOutput({
                success: false,
                classification: 'RENDER_EFFICIENCY_FAILED',
                message: 'Render efficiency scoring failed safely.'
            });
        }
    }

    function uniquePush(list, value) {
        if (value && list.indexOf(value) === -1) list.push(value);
    }

    function optimizeRenderCycle(normalized) {
        try {
            if (!normalized || normalized.success !== true) {
                return freezeOptimizationOutput({
                    success: false,
                    classification: 'INVALID_NORMALIZED_PAYLOAD',
                    message: 'Render optimization requires a normalized payload.'
                });
            }
            var optimizations = {
                deferModules: [],
                lazyLoadModules: [],
                virtualizeComponents: [],
                memoizeComponents: [],
                selectiveUpdates: [],
                batchedRendering: [],
                incrementalDataSources: [],
                viewportDataSources: [],
                routePreloads: []
            };
            var opportunities = [];
            (normalized.modules || []).forEach(function modulePlan(module) {
                if (module.authorized === false) return;
                if (module.usedAtStartup && !module.critical && !module.deferred) {
                    uniquePush(optimizations.deferModules, module.moduleId);
                    opportunities.push('Defer non-critical startup module ' + module.moduleId + '.');
                }
                if ((module.estimatedKb > 160 || module.initMs > 300) && !module.critical) {
                    uniquePush(optimizations.lazyLoadModules, module.moduleId);
                    opportunities.push('Lazy load module ' + module.moduleId + ' behind route or viewport demand.');
                }
            });
            (normalized.components || []).forEach(function componentPlan(component) {
                if (component.recordCount > 1000 && !component.virtualized) {
                    uniquePush(optimizations.virtualizeComponents, component.componentId);
                    opportunities.push('Virtualize large component ' + component.componentId + '.');
                }
                if (component.renderDurationMs > 250 && !component.memoized) {
                    uniquePush(optimizations.memoizeComponents, component.componentId);
                }
                if (component.recordCount > 500 && !component.selectiveUpdates) {
                    uniquePush(optimizations.selectiveUpdates, component.componentId);
                }
                if ((component.renderCycles > 4 || component.componentType === 'SEARCH') && !component.batched) {
                    uniquePush(optimizations.batchedRendering, component.componentId);
                    opportunities.push('Batch render updates for ' + component.componentId + '.');
                }
            });
            (normalized.dataSources || []).forEach(function dataPlan(source) {
                if (source.recordCount > 1000 && !source.incremental) {
                    uniquePush(optimizations.incrementalDataSources, source.sourceId);
                    opportunities.push('Load ' + source.sourceId + ' incrementally instead of in one batch.');
                }
                if (source.recordCount > 1000 && !source.viewportBased) {
                    uniquePush(optimizations.viewportDataSources, source.sourceId);
                }
            });
            (normalized.routes || []).forEach(function routePlan(route) {
                if (route.routeFrequency > 20 && route.preloadedModules < 3) {
                    uniquePush(optimizations.routePreloads, route.routeId);
                }
                if (route.unusedStartupModules > 0) {
                    opportunities.push('Move unused startup modules out of route ' + route.routeId + '.');
                }
            });
            return freezeOptimizationOutput({
                success: true,
                optimizations: optimizations,
                optimizationOpportunities: opportunities.slice(0, 60),
                governance: {
                    safeOptimizationOnly: true,
                    backwardCompatibilityPreserved: true,
                    tenantIsolationPreserved: true,
                    renderingOptimizationGovernancePreserved: true,
                    noUnauthorizedLoads: true
                }
            });
        } catch (error) {
            return freezeOptimizationOutput({
                success: false,
                classification: 'RENDER_OPTIMIZATION_FAILED',
                message: 'Render optimization planning failed safely.',
                governance: {
                    safeOptimizationOnly: true,
                    tenantIsolationPreserved: true
                }
            });
        }
    }

    function canLazyLoad(moduleKey, context) {
        var ctx = context || {};
        var role = normalizeRole(ctx.actor && ctx.actor.role || ctx.role || '');
        var tenantSlug = normalizeTenantSlug(ctx.tenantSlug || ctx.tenantId || ctx.companyId || '');
        var moduleTenant = normalizeTenantSlug(ctx.moduleTenantSlug || ctx.targetTenantSlug || tenantSlug);
        if (!roleCanViewOptimization(role, ctx, { routeType: ctx.routeType || 'platform', infrastructureOnly: ctx.infrastructureOnly })) {
            return freezeOptimizationOutput({
                success: false,
                allowed: false,
                classification: 'ROLE_SCOPE_BLOCKED',
                message: 'Lazy loading governance is restricted to platform operations roles.'
            });
        }
        if (ctx.authorized === false) {
            return freezeOptimizationOutput({
                success: false,
                allowed: false,
                classification: 'UNAUTHORIZED_MODULE_BLOCKED',
                message: 'Unauthorized modules cannot be lazy loaded.'
            });
        }
        if (tenantSlug && moduleTenant && tenantSlug !== moduleTenant) {
            return freezeOptimizationOutput({
                success: false,
                allowed: false,
                classification: 'TENANT_SCOPE_BLOCKED',
                message: 'Lazy loaded module scope must match the active tenant context.'
            });
        }
        return freezeOptimizationOutput({
            success: true,
            allowed: true,
            moduleKey: safeString(moduleKey, ''),
            tenantSlug: tenantSlug || moduleTenant || 'platform'
        });
    }

    async function lazyLoadModule(moduleKey, loader, context) {
        var startedAt = Date.now();
        try {
            var key = safeString(moduleKey || '', '').trim();
            if (!key) {
                return freezeOptimizationOutput({
                    success: false,
                    loadState: 'FAILED',
                    classification: 'MODULE_KEY_REQUIRED',
                    message: 'A module key is required for lazy loading.'
                });
            }
            var scope = canLazyLoad(key, context || {});
            if (!scope.success) {
                return freezeOptimizationOutput(Object.assign({}, scope, {
                    moduleKey: key,
                    loadState: 'BLOCKED',
                    governance: {
                        tenantIsolationPreserved: true,
                        renderingOptimizationGovernancePreserved: true
                    }
                }));
            }
            if (moduleCache[key]) {
                return freezeOptimizationOutput({
                    success: true,
                    moduleKey: key,
                    loadState: 'LOADED',
                    cached: true,
                    durationMs: 0,
                    moduleAvailable: true,
                    governance: {
                        tenantIsolationPreserved: true,
                        renderingOptimizationGovernancePreserved: true
                    }
                });
            }
            var loadedModule = null;
            if (typeof loader === 'function') {
                loadedModule = await loader();
            } else if (typeof loader === 'string' && global[loader]) {
                loadedModule = global[loader];
            } else if (loader && typeof loader === 'object') {
                loadedModule = loader;
            } else if (global[key]) {
                loadedModule = global[key];
            }
            if (!loadedModule) {
                return freezeOptimizationOutput({
                    success: false,
                    moduleKey: key,
                    loadState: 'FAILED',
                    classification: 'MODULE_UNAVAILABLE',
                    message: 'Lazy module dependency is unavailable.',
                    durationMs: Date.now() - startedAt,
                    governance: {
                        tenantIsolationPreserved: true,
                        renderingOptimizationGovernancePreserved: true
                    }
                });
            }
            moduleCache[key] = true;
            return freezeOptimizationOutput({
                success: true,
                moduleKey: key,
                loadState: 'LOADED',
                cached: false,
                durationMs: Date.now() - startedAt,
                moduleAvailable: true,
                moduleType: typeof loadedModule,
                governance: {
                    backwardCompatibilityPreserved: true,
                    tenantIsolationPreserved: true,
                    renderingOptimizationGovernancePreserved: true,
                    rawModuleReferenceExposed: false
                }
            });
        } catch (error) {
            return freezeOptimizationOutput({
                success: false,
                moduleKey: safeString(moduleKey || '', ''),
                loadState: 'FAILED',
                classification: 'MODULE_LOAD_FAILED',
                message: 'Lazy module load failed safely.',
                durationMs: Date.now() - startedAt,
                governance: {
                    tenantIsolationPreserved: true,
                    renderingOptimizationGovernancePreserved: true
                }
            });
        }
    }

    function buildAnalytics(normalized, efficiency, optimization) {
        var components = normalized.components || [];
        var modules = normalized.modules || [];
        var routes = normalized.routes || [];
        var sources = normalized.dataSources || [];
        return {
            componentAnalytics: {
                totalComponents: components.length,
                virtualizedComponents: components.filter(function virtualized(row) { return row.virtualized; }).length,
                memoizedComponents: components.filter(function memoized(row) { return row.memoized; }).length,
                maxRenderDurationMs: components.reduce(function maxRender(max, row) { return Math.max(max, safeNumber(row.renderDurationMs, 0)); }, 0),
                maxMemoryMb: components.reduce(function maxMemory(max, row) { return Math.max(max, safeNumber(row.memoryMb, 0)); }, 0)
            },
            moduleAnalytics: {
                totalModules: modules.length,
                deferredModules: modules.filter(function deferred(row) { return row.deferred; }).length,
                startupModules: modules.filter(function startup(row) { return row.usedAtStartup; }).length,
                lazyCandidates: optimization.optimizations && optimization.optimizations.lazyLoadModules ? optimization.optimizations.lazyLoadModules.length : 0
            },
            routeAnalytics: {
                totalRoutes: routes.length,
                slowRoutes: routes.filter(function slow(row) { return row.loadDurationMs > 1000; }).length,
                routeLoadFrequency: routes.reduce(function total(total, row) { return total + safeNumber(row.routeFrequency, 0); }, 0)
            },
            dataLoadingAnalytics: {
                totalDataSources: sources.length,
                incrementalSources: sources.filter(function incremental(row) { return row.incremental; }).length,
                duplicateRequests: sources.reduce(function duplicates(total, row) { return total + safeNumber(row.duplicateRequests, 0); }, 0)
            },
            efficiencyTrends: {
                renderEfficiencyScore: efficiency.renderEfficiencyScore || 0,
                memoryEfficiencyScore: efficiency.memoryEfficiencyScore || 0,
                loadOptimizationScore: efficiency.loadOptimizationScore || 0
            },
            optimizationSavings: {
                candidateCount: optimization.optimizationOpportunities ? optimization.optimizationOpportunities.length : 0,
                virtualizedCandidates: optimization.optimizations && optimization.optimizations.virtualizeComponents ? optimization.optimizations.virtualizeComponents.length : 0,
                deferredCandidates: optimization.optimizations && optimization.optimizations.deferModules ? optimization.optimizations.deferModules.length : 0
            }
        };
    }

    function persistReport(report) {
        try {
            var data = rawData();
            data.renderOptimizationHistory = Array.isArray(data.renderOptimizationHistory) ? data.renderOptimizationHistory.slice() : [];
            data.renderOptimizationAnalytics = Array.isArray(data.renderOptimizationAnalytics) ? data.renderOptimizationAnalytics.slice() : [];
            data.renderOptimizationHistory.unshift(cloneSanitized({
                id: report.reportId,
                reportId: report.reportId,
                tenantSlug: report.tenantSlug,
                renderState: report.renderState,
                renderEfficiencyScore: report.renderEfficiencyScore,
                memoryEfficiencyScore: report.memoryEfficiencyScore,
                loadOptimizationScore: report.loadOptimizationScore,
                optimizationClass: report.optimizationClass,
                createdAt: report.createdAt,
                immutable: true
            }));
            data.renderOptimizationAnalytics.unshift(cloneSanitized({
                id: 'ROPT-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7).toUpperCase(),
                reportId: report.reportId,
                tenantSlug: report.tenantSlug,
                componentCount: report.analytics.componentAnalytics.totalComponents,
                moduleCount: report.analytics.moduleAnalytics.totalModules,
                routeCount: report.analytics.routeAnalytics.totalRoutes,
                dataSourceCount: report.analytics.dataLoadingAnalytics.totalDataSources,
                optimizationCount: report.analytics.optimizationSavings.candidateCount,
                createdAt: report.createdAt,
                immutable: true
            }));
            data.renderOptimizationHistory = data.renderOptimizationHistory.slice(0, MAX_HISTORY);
            data.renderOptimizationAnalytics = data.renderOptimizationAnalytics.slice(0, MAX_HISTORY);
            saveData(data);
            return true;
        } catch (error) {
            return false;
        }
    }

    function auditOptimization(actionType, metadata, context) {
        try {
            if (context && context.skipAuditPersistence) return { success: true, skipped: true };
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                service.recordAudit({
                    actionType: actionType,
                    eventType: actionType,
                    module: 'Render Optimization',
                    targetId: metadata && metadata.reportId || '',
                    actorId: actorId(context || {}),
                    description: metadata && metadata.description || actionType,
                    severity: metadata && metadata.severity || 'INFO',
                    metadata: cloneSanitized(metadata || {})
                }, { source: 'renderOptimizationService' });
                return { success: true };
            }
            if (db() && typeof db().writeAuditLog === 'function') {
                db().writeAuditLog(context && context.actor && context.actor.role || 'system', actorId(context || {}), actionType, 'Render Optimization', metadata && metadata.reportId || '', metadata && metadata.description || actionType);
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Render optimization audit failed safely.' };
        }
        return { success: false, warning: 'Audit dependency unavailable.' };
    }

    function emitTelemetry(eventType, metadata, context) {
        try {
            if (context && context.skipTelemetry) return { success: true, skipped: true };
            var service = global.WorkflowTelemetryService || global.workflowTelemetryService;
            if (service && typeof service.emitTelemetry === 'function') {
                service.emitTelemetry('GOVERNANCE', eventType, {
                    source: 'renderOptimizationService',
                    severity: metadata && metadata.severity || 'INFO',
                    status: metadata && metadata.status || eventType,
                    metadata: cloneSanitized(metadata || {})
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Render optimization telemetry failed safely.' };
        }
        return { success: false, warning: 'Telemetry dependency unavailable.' };
    }

    function recordMetric(metricType, metadata, context) {
        try {
            if (context && context.skipMetrics) return { success: true, skipped: true };
            var service = global.OrchestrationMetricsService || global.orchestrationMetricsService;
            if (service && typeof service.recordWorkflowMetric === 'function') {
                service.recordWorkflowMetric(metricType, cloneSanitized(Object.assign({ source: 'renderOptimizationService' }, metadata || {})));
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Render optimization metrics failed safely.' };
        }
        return { success: false, warning: 'Metrics dependency unavailable.' };
    }

    function generateRenderOptimizationReport(payload, context) {
        try {
            var ctx = context || {};
            var normalized = normalizeOptimizationPayload(payload || {}, ctx);
            if (!normalized.success) {
                auditOptimization('RENDER_OPTIMIZATION_REVIEW_BLOCKED', {
                    severity: 'WARNING',
                    description: normalized.message || 'Render optimization review blocked.'
                }, ctx);
                return normalized;
            }
            var efficiency = calculateRenderEfficiency(normalized);
            var optimization = optimizeRenderCycle(normalized);
            var analytics = buildAnalytics(normalized, efficiency, optimization);
            var reportId = 'ROPT-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
            var report = {
                success: true,
                reportId: reportId,
                tenantSlug: normalized.tenantSlug,
                createdAt: nowIso(),
                renderState: efficiency.optimizationClass === OPTIMIZATION_CLASSES.CRITICAL ? 'CRITICAL' : efficiency.optimizationClass === OPTIMIZATION_CLASSES.HIGH ? 'DEGRADED' : optimization.optimizationOpportunities.length ? 'MONITORING' : 'OPTIMIZED',
                renderEfficiencyScore: efficiency.renderEfficiencyScore,
                memoryEfficiencyScore: efficiency.memoryEfficiencyScore,
                loadOptimizationScore: efficiency.loadOptimizationScore,
                optimizationClass: efficiency.optimizationClass,
                efficiency: efficiency,
                optimization: optimization,
                analytics: analytics,
                integrationHealth: {
                    dashboardPerformanceIntegrated: !!global.DashboardPerformanceService,
                    mobileResponsivenessIntegrated: !!global.MobileResponsivenessService,
                    smartSearchIntegrated: !!global.SmartSearchService,
                    globalActivityFeedIntegrated: !!global.GlobalActivityFeedService,
                    notificationCenterIntegrated: !!global.NotificationCenterService,
                    auditIntegrated: !!(global.AuditService || global.auditService),
                    telemetryIntegrated: !!(global.WorkflowTelemetryService || global.workflowTelemetryService),
                    metricsIntegrated: !!(global.OrchestrationMetricsService || global.orchestrationMetricsService)
                },
                governance: {
                    backwardCompatibilityPreserved: true,
                    tenantIsolationPreserved: true,
                    renderingOptimizationGovernancePreserved: true,
                    rbacVisibilityPreserved: true,
                    noGovernanceBypass: true,
                    outputsImmutable: true
                }
            };
            report = freezeOptimizationOutput(report);
            persistReport(report);
            auditOptimization('RENDER_OPTIMIZATION_REPORT_GENERATED', {
                reportId: report.reportId,
                severity: report.optimizationClass === OPTIMIZATION_CLASSES.CRITICAL ? 'ERROR' : report.optimizationClass === OPTIMIZATION_CLASSES.HIGH ? 'WARNING' : 'INFO',
                description: 'Render optimization review completed.'
            }, ctx);
            emitTelemetry('RENDER_OPTIMIZATION_REVIEWED', {
                reportId: report.reportId,
                severity: report.optimizationClass === OPTIMIZATION_CLASSES.CRITICAL ? 'ERROR' : 'INFO',
                status: report.renderState
            }, ctx);
            recordMetric('RENDER_OPTIMIZATION_REVIEWED', {
                reportId: report.reportId,
                renderEfficiencyScore: report.renderEfficiencyScore,
                memoryEfficiencyScore: report.memoryEfficiencyScore,
                loadOptimizationScore: report.loadOptimizationScore
            }, ctx);
            return report;
        } catch (error) {
            return freezeOptimizationOutput({
                success: false,
                classification: 'REPORT_FAILED',
                message: 'Render optimization report failed safely.',
                governance: {
                    tenantIsolationPreserved: true,
                    renderingOptimizationGovernancePreserved: true
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
            var malformed = normalizeOptimizationPayload('bad', {});
            record('malformed payloads fail safely', malformed.success === false && Object.isFrozen(malformed));
            var payload = {
                tenantSlug: 'selftest',
                routes: [{ routeId: 'self-route', loadDurationMs: 1400, moduleCount: 20, unusedStartupModules: 12, routeFrequency: 30 }],
                modules: [{ moduleId: 'self-feed-module', estimatedKb: 260, initMs: 560, usedAtStartup: true, critical: false, deferred: false, authorized: true }],
                components: [{ componentId: 'self-feed', renderDurationMs: 720, memoryMb: 180, recordCount: 3000, renderCycles: 10, virtualized: false, memoized: false, selectiveUpdates: false, batched: false }],
                dataSources: [{ sourceId: 'self-events', recordCount: 3000, pageSize: 1000, incremental: false, duplicateRequests: 4, cacheHitRate: 0.2, viewportBased: false }],
                metadata: { salary: 1000, leaveBalance: 4 }
            };
            var ctx = { routeType: 'platform', tenantSlug: 'selftest', actor: { role: 'PLATFORM_OWNER', id: 'PO-SELF' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true };
            var normalized = normalizeOptimizationPayload(payload, ctx);
            var efficiency = calculateRenderEfficiency(normalized);
            var optimized = optimizeRenderCycle(normalized);
            var lazyAllowed = canLazyLoad('self-feed-module', ctx);
            var report = generateRenderOptimizationReport(payload, ctx);
            record('lazy loading works', lazyAllowed.success === true && lazyAllowed.allowed === true);
            record('render optimization works', optimized.success === true && optimized.optimizations.deferModules.indexOf('self-feed-module') !== -1);
            record('virtualization works', optimized.optimizations.virtualizeComponents.indexOf('self-feed') !== -1);
            record('memory tracking works', efficiency.memoryEfficiencyScore < 100);
            record('analytics work', report.success === true && report.analytics.componentAnalytics.totalComponents === 1);
            record('immutable outputs enforced', Object.isFrozen(report) && Object.isFrozen(efficiency) && Object.isFrozen(normalized));
            record('visibility governance works', generateRenderOptimizationReport(payload, { routeType: 'tenant', tenantSlug: 'selftest', actor: { role: 'HR', id: 'HR-SELF' }, skipAuditPersistence: true }).success === false);
        } catch (error) {
            record('self-test uncaught exception guard', false, { error: error && error.message });
        }
        var result = freezeOptimizationOutput({
            passed: checks.every(function ok(row) { return row.passed; }),
            tests: checks,
            checkedAt: nowIso()
        });
        global.__ARTHHRMS_RENDER_OPTIMIZATION_SELF_TEST__ = result;
        return result;
    }

    var RenderOptimizationService = Object.freeze({
        VERSION: '1.0.0',
        RENDER_STATES: RENDER_STATES,
        LOAD_STATES: LOAD_STATES,
        OPTIMIZATION_CLASSES: OPTIMIZATION_CLASSES,
        validateOptimizationScope: validateOptimizationScope,
        lazyLoadModule: lazyLoadModule,
        calculateRenderEfficiency: calculateRenderEfficiency,
        optimizeRenderCycle: optimizeRenderCycle,
        normalizeOptimizationPayload: normalizeOptimizationPayload,
        freezeOptimizationOutput: freezeOptimizationOutput,
        generateRenderOptimizationReport: generateRenderOptimizationReport,
        runSelfTest: runSelfTest
    });

    global.RenderOptimizationService = RenderOptimizationService;
    global.renderOptimizationService = RenderOptimizationService;

    if (global.__ARTHHRMS_DEV__) {
        try {
            runSelfTest();
        } catch (error) {
            global.__ARTHHRMS_RENDER_OPTIMIZATION_SELF_TEST__ = freezeOptimizationOutput({
                passed: false,
                tests: [{ name: 'self-test wrapper', passed: false, details: { error: error && error.message } }],
                checkedAt: nowIso()
            });
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
