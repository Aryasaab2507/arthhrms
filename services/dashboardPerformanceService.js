/**
 * dashboardPerformanceService.js
 * ARTHHRMS - Dashboard Performance Optimization + Enterprise UI Performance Framework
 *
 * PURPOSE:
 * Provides governed dashboard performance monitoring, scoring, slow component
 * detection, and safe optimization recommendations across platform-control,
 * strategic, HR, manager, executive, search, notification, and activity feed
 * surfaces.
 *
 * This service does NOT:
 * - mutate tenant business data
 * - expose cross-tenant dashboard internals
 * - expose salaries, leave balances, raw documents, tokens, or private payloads
 * - bypass RBAC, audit, telemetry, or performance governance
 *
 * @version 1.0.0
 */
(function attachDashboardPerformanceService(global) {
    'use strict';

    var PREFIX = '[DashboardPerformanceService]';
    var MAX_HISTORY = 500;
    var MAX_COMPONENTS = 250;

    var PERFORMANCE_STATES = Object.freeze([
        'MONITORING',
        'OPTIMIZED',
        'SLOW',
        'DEGRADED',
        'CRITICAL',
        'ARCHIVED'
    ]);

    var PERFORMANCE_CLASSES = Object.freeze({
        LOW: 'LOW',
        MODERATE: 'MODERATE',
        HIGH: 'HIGH',
        CRITICAL: 'CRITICAL'
    });

    var SENSITIVE_KEY_PATTERN = /(salary|payroll.?amount|payrollAmount|payslip|compensation|ctc|leave.?balance|leaveBalance|gross|net|basic|hra|pf|tds|allowance|deduction|password|secret|token|jwt|authorization|service.?role|private.?key|bank|tax|raw|payload|content|body|signed.?url|download.?url|storage.?path|file.?path|confidential|employeeRecord|privateNote)/i;
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

    function freezePerformanceOutput(value) {
        return freezeDeep(cloneSanitized(value || {}));
    }

    function roleCanViewPerformance(role, context, payload) {
        var normalizedRole = normalizeRole(role);
        var routeType = normalizeToken(context && context.routeType || payload && payload.routeType || 'platform');
        if (normalizedRole === 'PLATFORM_OWNER') return routeType === 'PLATFORM';
        if (normalizedRole === 'SUPER_ADMIN') return routeType === 'PLATFORM' && (context && context.infrastructureOnly === true || payload && payload.infrastructureOnly === true || payload && normalizeToken(payload.mode || '') === 'INFRASTRUCTURE_MONITORING');
        return false;
    }

    function validatePerformanceScope(payload, context) {
        try {
            var ctx = context || {};
            var record = payload || {};
            var role = normalizeRole((ctx.actor && ctx.actor.role) || ctx.role || '');
            var payloadTenant = normalizeTenantSlug(record.tenantSlug || record.tenantId || record.companyId || '');
            var ctxTenant = contextTenant(ctx);
            if (!roleCanViewPerformance(role, ctx, record)) {
                return freezePerformanceOutput({
                    success: false,
                    allowed: false,
                    classification: 'ROLE_SCOPE_BLOCKED',
                    message: 'Dashboard performance insights are restricted to platform operations roles.',
                    governance: {
                        tenantIsolationPreserved: true,
                        performanceGovernancePreserved: true
                    }
                });
            }
            if (payloadTenant && ctxTenant && payloadTenant !== ctxTenant) {
                return freezePerformanceOutput({
                    success: false,
                    allowed: false,
                    classification: 'TENANT_SCOPE_BLOCKED',
                    message: 'Dashboard performance scope must match the active tenant context.',
                    governance: {
                        tenantIsolationPreserved: true,
                        performanceGovernancePreserved: true
                    }
                });
            }
            return freezePerformanceOutput({
                success: true,
                allowed: true,
                role: role,
                visibility: role === 'SUPER_ADMIN' ? 'INFRASTRUCTURE_PERFORMANCE_MONITORING' : 'PLATFORM_PERFORMANCE_GOVERNANCE',
                tenantSlug: payloadTenant || ctxTenant || 'platform',
                governance: {
                    tenantIsolationPreserved: true,
                    performanceGovernancePreserved: true
                }
            });
        } catch (error) {
            return freezePerformanceOutput({
                success: false,
                allowed: false,
                classification: 'SCOPE_VALIDATION_FAILED',
                message: 'Dashboard performance scope validation failed safely.',
                governance: {
                    tenantIsolationPreserved: true,
                    performanceGovernancePreserved: true
                }
            });
        }
    }

    function normalizeDashboard(row, tenantSlug, index) {
        var source = isPlainObject(row) ? row : {};
        return {
            dashboardId: safeString(source.dashboardId || source.id || ('dashboard-' + (index + 1)), 'dashboard'),
            dashboardType: normalizeToken(source.dashboardType || source.type || source.module || 'dashboard'),
            tenantSlug: normalizeTenantSlug(source.tenantSlug || tenantSlug),
            pageLoadMs: safeNumber(source.pageLoadMs || source.loadMs || source.initialLoadMs, 0),
            renderTimeMs: safeNumber(source.renderTimeMs || source.renderMs, 0),
            queryTimeMs: safeNumber(source.queryTimeMs || source.dataMs, 0),
            memoryMb: safeNumber(source.memoryMb || source.memoryUsageMb, 0),
            interactionLatencyMs: safeNumber(source.interactionLatencyMs || source.inputLatencyMs, 0),
            renderCycles: safeNumber(source.renderCycles || source.renderCount, 0),
            widgetCount: safeNumber(source.widgetCount, 0),
            recordCount: safeNumber(source.recordCount || source.records, 0),
            fullPageRefresh: source.fullPageRefresh === true,
            duplicateRequests: safeNumber(source.duplicateRequests, 0),
            redundantCalculations: safeNumber(source.redundantCalculations, 0),
            blockingOperation: source.blockingOperation === true,
            metadata: cloneSanitized(source.metadata || {})
        };
    }

    function normalizeWidget(row, tenantSlug, index) {
        var source = isPlainObject(row) ? row : {};
        return {
            widgetId: safeString(source.widgetId || source.id || ('widget-' + (index + 1)), 'widget'),
            serviceName: safeString(source.serviceName || source.service || source.module || 'DashboardWidget', 'DashboardWidget'),
            tenantSlug: normalizeTenantSlug(source.tenantSlug || tenantSlug),
            renderTimeMs: safeNumber(source.renderTimeMs || source.renderMs, 0),
            queryTimeMs: safeNumber(source.queryTimeMs || source.dataMs, 0),
            memoryMb: safeNumber(source.memoryMb || source.memoryUsageMb, 0),
            recordCount: safeNumber(source.recordCount || source.records, 0),
            renderCycles: safeNumber(source.renderCycles || source.renderCount, 0),
            deferred: source.deferred === true,
            virtualized: source.virtualized === true,
            cached: source.cached === true,
            errors: safeNumber(source.errors || source.errorCount, 0),
            metadata: cloneSanitized(source.metadata || {})
        };
    }

    function normalizeInteraction(row, index) {
        var source = isPlainObject(row) ? row : {};
        return {
            interactionId: safeString(source.interactionId || source.id || ('interaction-' + (index + 1)), 'interaction'),
            category: normalizeToken(source.category || source.type || 'interaction'),
            latencyMs: safeNumber(source.latencyMs || source.durationMs || source.interactionLatencyMs, 0),
            timestamp: safeString(source.timestamp || source.createdAt || nowIso(), nowIso())
        };
    }

    function collectIntegrationSignals(tenantSlug) {
        var data = rawData();
        function ownRows(name) {
            return (Array.isArray(data[name]) ? data[name] : []).filter(function sameTenant(row) {
                return !tenantSlug || normalizeTenantSlug(row && (row.tenantSlug || row.tenantId || row.companyId)) === tenantSlug;
            }).slice(-25);
        }
        var searchRows = ownRows('searchAnalytics');
        var feedRows = ownRows('globalActivityFeedAnalytics');
        var notificationRows = ownRows('notificationCenterAnalytics');
        return {
            searchLatencyMs: searchRows.reduce(function maxSearch(max, row) { return Math.max(max, safeNumber(row && (row.latencyMs || row.searchLatencyMs), 0)); }, 0),
            activityFeedLatencyMs: feedRows.reduce(function maxFeed(max, row) { return Math.max(max, safeNumber(row && (row.latencyMs || row.feedLatencyMs), 0)); }, 0),
            notificationLatencyMs: notificationRows.reduce(function maxNotification(max, row) { return Math.max(max, safeNumber(row && (row.latencyMs || row.notificationLatencyMs), 0)); }, 0),
            searchRecords: searchRows.reduce(function sumSearch(total, row) { return total + safeNumber(row && row.resultCount, 0); }, 0),
            activityRecords: feedRows.reduce(function sumFeed(total, row) { return total + safeNumber(row && row.activityVolume, 0); }, 0),
            unreadNotifications: notificationRows.reduce(function sumNotifications(total, row) { return total + safeNumber(row && row.unreadCount, 0); }, 0)
        };
    }

    function normalizePerformancePayload(payload, context) {
        try {
            if (!isPlainObject(payload)) {
                return freezePerformanceOutput({
                    success: false,
                    classification: 'MALFORMED_PAYLOAD',
                    message: 'Dashboard performance payload must be an object.'
                });
            }
            var ctxTenant = contextTenant(context || {});
            var tenantSlug = normalizeTenantSlug(payload.tenantSlug || payload.tenantId || payload.companyId || ctxTenant || 'platform');
            var scope = validatePerformanceScope(Object.assign({}, payload, { tenantSlug: tenantSlug }), context || {});
            if (!scope.success) return scope;
            var dashboards = Array.isArray(payload.dashboards) ? payload.dashboards : [];
            var widgets = Array.isArray(payload.widgets) ? payload.widgets : [];
            var interactions = Array.isArray(payload.interactions) ? payload.interactions : [];
            var normalized = {
                success: true,
                tenantSlug: tenantSlug,
                performanceState: normalizeToken(payload.performanceState || 'MONITORING'),
                dashboards: dashboards.slice(0, MAX_COMPONENTS).map(function mapDashboard(row, index) { return normalizeDashboard(row, tenantSlug, index); }).filter(function keep(row) { return !row.tenantSlug || row.tenantSlug === tenantSlug; }),
                widgets: widgets.slice(0, MAX_COMPONENTS).map(function mapWidget(row, index) { return normalizeWidget(row, tenantSlug, index); }).filter(function keep(row) { return !row.tenantSlug || row.tenantSlug === tenantSlug; }),
                interactions: interactions.slice(0, MAX_COMPONENTS).map(normalizeInteraction),
                integrationSignals: collectIntegrationSignals(tenantSlug),
                metadata: cloneSanitized(payload.metadata || {}),
                governance: {
                    tenantIsolationPreserved: true,
                    performanceGovernancePreserved: true,
                    backwardCompatibilityPreserved: true
                }
            };
            return freezePerformanceOutput(normalized);
        } catch (error) {
            return freezePerformanceOutput({
                success: false,
                classification: 'NORMALIZATION_FAILED',
                message: 'Dashboard performance payload normalization failed safely.',
                governance: {
                    tenantIsolationPreserved: true,
                    performanceGovernancePreserved: true
                }
            });
        }
    }

    function getNormalized(input) {
        if (input && input.success === true && Array.isArray(input.dashboards) && Array.isArray(input.widgets)) return input;
        return normalizePerformancePayload(input || {}, { routeType: 'platform', actor: { role: 'PLATFORM_OWNER' } });
    }

    function average(rows, selector) {
        if (!rows.length) return 0;
        return Math.round(rows.reduce(function sum(total, row) { return total + safeNumber(selector(row), 0); }, 0) / rows.length);
    }

    function calculatePerformanceScore(input) {
        try {
            var normalized = getNormalized(input);
            if (!normalized.success) return normalized;
            var dashboards = normalized.dashboards || [];
            var widgets = normalized.widgets || [];
            var interactions = normalized.interactions || [];
            var signals = normalized.integrationSignals || {};
            var maxPageLoad = dashboards.reduce(function maxPage(max, row) { return Math.max(max, row.pageLoadMs || 0); }, 0);
            var maxRender = Math.max(
                dashboards.reduce(function maxDashboard(max, row) { return Math.max(max, row.renderTimeMs || 0); }, 0),
                widgets.reduce(function maxWidget(max, row) { return Math.max(max, row.renderTimeMs || 0); }, 0)
            );
            var maxQuery = Math.max(
                dashboards.reduce(function maxDashboard(max, row) { return Math.max(max, row.queryTimeMs || 0); }, 0),
                widgets.reduce(function maxWidget(max, row) { return Math.max(max, row.queryTimeMs || 0); }, 0)
            );
            var maxMemory = Math.max(
                dashboards.reduce(function maxDashboard(max, row) { return Math.max(max, row.memoryMb || 0); }, 0),
                widgets.reduce(function maxWidget(max, row) { return Math.max(max, row.memoryMb || 0); }, 0)
            );
            var maxInteraction = Math.max(
                dashboards.reduce(function maxDashboard(max, row) { return Math.max(max, row.interactionLatencyMs || 0); }, 0),
                interactions.reduce(function maxInteractionLatency(max, row) { return Math.max(max, row.latencyMs || 0); }, 0)
            );
            var maxIntegrationLatency = Math.max(signals.searchLatencyMs || 0, signals.activityFeedLatencyMs || 0, signals.notificationLatencyMs || 0);
            var duplicateRequests = dashboards.reduce(function count(total, row) { return total + safeNumber(row.duplicateRequests, 0); }, 0);
            var redundantCalculations = dashboards.reduce(function count(total, row) { return total + safeNumber(row.redundantCalculations, 0); }, 0);
            var blockingOperations = dashboards.filter(function isBlocking(row) { return row.blockingOperation || row.fullPageRefresh; }).length;
            var penalties = 0;
            penalties += maxPageLoad > 1800 ? 18 : maxPageLoad > 1000 ? 8 : 0;
            penalties += maxRender > 500 ? 18 : maxRender > 250 ? 8 : 0;
            penalties += maxQuery > 350 ? 14 : maxQuery > 180 ? 7 : 0;
            penalties += maxMemory > 160 ? 14 : maxMemory > 96 ? 6 : 0;
            penalties += maxInteraction > 300 ? 12 : maxInteraction > 150 ? 6 : 0;
            penalties += maxIntegrationLatency > 450 ? 10 : maxIntegrationLatency > 220 ? 5 : 0;
            penalties += Math.min(10, duplicateRequests + redundantCalculations);
            penalties += Math.min(10, blockingOperations * 5);
            var performanceScore = clamp(100 - penalties, 0, 100);
            var responsivenessPenalty = (maxInteraction > 300 ? 25 : maxInteraction > 150 ? 12 : 0) + (maxRender > 500 ? 16 : maxRender > 250 ? 8 : 0);
            var responsivenessScore = clamp(100 - responsivenessPenalty, 0, 100);
            var performanceClass = performanceScore < 55 ? PERFORMANCE_CLASSES.CRITICAL : performanceScore < 70 ? PERFORMANCE_CLASSES.HIGH : performanceScore < 85 ? PERFORMANCE_CLASSES.MODERATE : PERFORMANCE_CLASSES.LOW;
            return freezePerformanceOutput({
                success: true,
                performanceScore: Math.round(performanceScore),
                responsivenessScore: Math.round(responsivenessScore),
                renderScore: clamp(100 - (maxRender > 500 ? 30 : maxRender > 250 ? 15 : 0), 0, 100),
                queryScore: clamp(100 - (maxQuery > 350 ? 25 : maxQuery > 180 ? 12 : 0), 0, 100),
                memoryScore: clamp(100 - (maxMemory > 160 ? 25 : maxMemory > 96 ? 10 : 0), 0, 100),
                performanceClass: performanceClass,
                metrics: {
                    maxPageLoadMs: maxPageLoad,
                    maxRenderMs: maxRender,
                    maxQueryMs: maxQuery,
                    maxMemoryMb: maxMemory,
                    maxInteractionLatencyMs: maxInteraction,
                    maxIntegrationLatencyMs: maxIntegrationLatency,
                    averageRenderMs: average(widgets, function render(row) { return row.renderTimeMs; }),
                    averageQueryMs: average(widgets, function query(row) { return row.queryTimeMs; })
                },
                governance: {
                    performanceGovernancePreserved: true,
                    safeOptimizationOnly: true
                }
            });
        } catch (error) {
            return freezePerformanceOutput({
                success: false,
                classification: 'SCORING_FAILED',
                message: 'Dashboard performance scoring failed safely.'
            });
        }
    }

    function addSlow(list, component, reasonCodes, severity, recommendation) {
        if (!component || !reasonCodes.length) return;
        list.push({
            componentId: component.widgetId || component.dashboardId || component.interactionId || 'component',
            componentType: component.widgetId ? 'WIDGET' : component.dashboardId ? 'DASHBOARD' : 'INTERACTION',
            serviceName: component.serviceName || component.dashboardType || component.category || 'Dashboard',
            severity: severity || PERFORMANCE_CLASSES.MODERATE,
            reasonCodes: reasonCodes.slice(),
            renderTimeMs: component.renderTimeMs || 0,
            queryTimeMs: component.queryTimeMs || 0,
            memoryMb: component.memoryMb || 0,
            recordCount: component.recordCount || 0,
            renderCycles: component.renderCycles || 0,
            recommendation: recommendation || 'Review component rendering and data access.'
        });
    }

    function detectSlowComponents(input) {
        try {
            var normalized = getNormalized(input);
            if (!normalized.success) return normalized;
            var slowComponents = [];
            var opportunities = [];
            (normalized.dashboards || []).forEach(function inspectDashboard(row) {
                var reasons = [];
                if (row.pageLoadMs > 1800) reasons.push('SLOW_INITIAL_LOAD');
                if (row.renderTimeMs > 500) reasons.push('SLOW_RENDER');
                if (row.queryTimeMs > 350) reasons.push('SLOW_QUERY');
                if (row.memoryMb > 160) reasons.push('MEMORY_PRESSURE');
                if (row.interactionLatencyMs > 300) reasons.push('INTERACTION_DELAY');
                if (row.renderCycles > 8) reasons.push('EXCESSIVE_RENDER_CYCLES');
                if (row.fullPageRefresh) reasons.push('FULL_PAGE_REFRESH');
                if (row.duplicateRequests > 0) reasons.push('DUPLICATE_REQUESTS');
                if (row.redundantCalculations > 0) reasons.push('REDUNDANT_CALCULATIONS');
                if (row.blockingOperation) reasons.push('BLOCKING_OPERATION');
                addSlow(slowComponents, row, reasons, reasons.length > 4 ? PERFORMANCE_CLASSES.CRITICAL : PERFORMANCE_CLASSES.HIGH, 'Use selective rendering, cached metrics, and incremental refresh for this dashboard.');
            });
            (normalized.widgets || []).forEach(function inspectWidget(row) {
                var reasons = [];
                if (row.renderTimeMs > 350) reasons.push('SLOW_WIDGET_RENDER');
                if (row.queryTimeMs > 250) reasons.push('SLOW_WIDGET_QUERY');
                if (row.memoryMb > 96) reasons.push('WIDGET_MEMORY_PRESSURE');
                if (row.renderCycles > 6) reasons.push('EXCESSIVE_RENDER_CYCLES');
                if (row.recordCount > 1000 && !row.virtualized) reasons.push('LARGE_DATASET_WITHOUT_VIRTUALIZATION');
                if (row.recordCount > 500 && !row.deferred) reasons.push('DEFER_RENDERING_CANDIDATE');
                if (row.queryTimeMs > 180 && !row.cached) reasons.push('CACHE_CANDIDATE');
                addSlow(slowComponents, row, reasons, reasons.indexOf('LARGE_DATASET_WITHOUT_VIRTUALIZATION') !== -1 ? PERFORMANCE_CLASSES.CRITICAL : PERFORMANCE_CLASSES.HIGH, 'Apply virtualization, deferral, caching, or incremental loading.');
            });
            (normalized.interactions || []).forEach(function inspectInteraction(row) {
                var reasons = [];
                if (row.latencyMs > 300) reasons.push('INTERACTION_LATENCY');
                addSlow(slowComponents, row, reasons, PERFORMANCE_CLASSES.HIGH, 'Reduce blocking work before user interaction completion.');
            });
            var signals = normalized.integrationSignals || {};
            if (signals.searchLatencyMs > 180) opportunities.push('Cache SmartSearch indexes and reuse recent result windows.');
            if (signals.activityFeedLatencyMs > 220) opportunities.push('Lazy-load activity feed windows and virtualize timeline rows.');
            if (signals.notificationLatencyMs > 180) opportunities.push('Defer notification lifecycle analytics until panel focus.');
            if (slowComponents.some(function hasVirtualization(row) { return row.reasonCodes.indexOf('LARGE_DATASET_WITHOUT_VIRTUALIZATION') !== -1; })) opportunities.push('Enable widget virtualization for large activity, search, notification, and audit tables.');
            if (slowComponents.some(function hasRenders(row) { return row.reasonCodes.indexOf('EXCESSIVE_RENDER_CYCLES') !== -1; })) opportunities.push('Skip unchanged widget renders and batch dashboard refreshes.');
            if (slowComponents.some(function hasQueries(row) { return row.reasonCodes.indexOf('SLOW_QUERY') !== -1 || row.reasonCodes.indexOf('SLOW_WIDGET_QUERY') !== -1; })) opportunities.push('Reuse normalized dashboard snapshots to avoid repeated data scans.');
            return freezePerformanceOutput({
                success: true,
                slowComponents: slowComponents.slice(0, MAX_COMPONENTS),
                slowComponentCount: slowComponents.length,
                optimizationOpportunities: opportunities.filter(function unique(item, index, arr) { return arr.indexOf(item) === index; }),
                bottleneckSummary: {
                    slowQueries: slowComponents.filter(function isSlowQuery(row) { return row.reasonCodes.join('|').indexOf('QUERY') !== -1; }).length,
                    slowRenders: slowComponents.filter(function isSlowRender(row) { return row.reasonCodes.join('|').indexOf('RENDER') !== -1; }).length,
                    memoryPressure: slowComponents.filter(function isMemory(row) { return row.reasonCodes.join('|').indexOf('MEMORY') !== -1; }).length,
                    interactionDelays: slowComponents.filter(function isInteraction(row) { return row.reasonCodes.join('|').indexOf('INTERACTION') !== -1; }).length
                },
                governance: {
                    safeOptimizationOnly: true,
                    performanceGovernancePreserved: true
                }
            });
        } catch (error) {
            return freezePerformanceOutput({
                success: false,
                classification: 'SLOW_COMPONENT_DETECTION_FAILED',
                message: 'Slow component detection failed safely.'
            });
        }
    }

    function optimizeDashboardRendering(input) {
        try {
            var normalized = getNormalized(input);
            if (!normalized.success) return normalized;
            var slow = detectSlowComponents(normalized);
            var virtualization = [];
            var deferred = [];
            var incremental = [];
            var selective = [];
            (normalized.widgets || []).forEach(function classifyWidget(row) {
                if (row.recordCount > 1000 && !row.virtualized) virtualization.push(row.widgetId);
                if ((row.recordCount > 500 || row.renderTimeMs > 250) && !row.deferred) deferred.push(row.widgetId);
                if (row.queryTimeMs > 180 || row.renderCycles > 4) incremental.push(row.widgetId);
                if (row.renderCycles > 3) selective.push(row.widgetId);
            });
            (normalized.dashboards || []).forEach(function classifyDashboard(row) {
                if (row.fullPageRefresh || row.renderCycles > 5) selective.push(row.dashboardId);
                if (row.duplicateRequests > 0 || row.redundantCalculations > 0) incremental.push(row.dashboardId);
            });
            return freezePerformanceOutput({
                success: true,
                optimizations: {
                    widgetVirtualization: virtualization.filter(function unique(item, index, arr) { return arr.indexOf(item) === index; }),
                    deferredRendering: deferred.filter(function unique(item, index, arr) { return arr.indexOf(item) === index; }),
                    incrementalRefresh: incremental.filter(function unique(item, index, arr) { return arr.indexOf(item) === index; }),
                    selectiveRendering: selective.filter(function unique(item, index, arr) { return arr.indexOf(item) === index; })
                },
                optimizationOpportunities: slow.optimizationOpportunities || [],
                governance: {
                    safeOptimizationOnly: true,
                    noGovernanceBypass: true,
                    noRuntimeDataMutation: true
                }
            });
        } catch (error) {
            return freezePerformanceOutput({
                success: false,
                classification: 'OPTIMIZATION_FAILED',
                message: 'Dashboard rendering optimization failed safely.'
            });
        }
    }

    function buildAnalytics(normalized, score, slow) {
        var widgets = normalized.widgets || [];
        var dashboards = normalized.dashboards || [];
        var interactions = normalized.interactions || [];
        return {
            dashboardLoadTrends: {
                dashboards: dashboards.length,
                maxPageLoadMs: score.metrics && score.metrics.maxPageLoadMs || 0,
                averageDashboardRenderMs: average(dashboards, function render(row) { return row.renderTimeMs; })
            },
            renderLatency: {
                maxRenderMs: score.metrics && score.metrics.maxRenderMs || 0,
                averageWidgetRenderMs: average(widgets, function render(row) { return row.renderTimeMs; }),
                excessiveRenderComponents: slow.bottleneckSummary && slow.bottleneckSummary.slowRenders || 0
            },
            widgetPerformance: {
                totalWidgets: widgets.length,
                virtualizedWidgets: widgets.filter(function virtualized(row) { return row.virtualized; }).length,
                deferredWidgets: widgets.filter(function deferred(row) { return row.deferred; }).length,
                slowWidgets: slow.slowComponents.filter(function widget(row) { return row.componentType === 'WIDGET'; }).length
            },
            searchLatency: normalized.integrationSignals.searchLatencyMs || 0,
            activityFeedLatency: normalized.integrationSignals.activityFeedLatencyMs || 0,
            notificationLatency: normalized.integrationSignals.notificationLatencyMs || 0,
            interactionPerformance: {
                totalInteractions: interactions.length,
                maxInteractionLatencyMs: score.metrics && score.metrics.maxInteractionLatencyMs || 0,
                responsivenessScore: score.responsivenessScore || 0
            }
        };
    }

    function persistReport(report, context) {
        try {
            var data = rawData();
            data.dashboardPerformanceHistory = Array.isArray(data.dashboardPerformanceHistory) ? data.dashboardPerformanceHistory.slice() : [];
            data.dashboardPerformanceAnalytics = Array.isArray(data.dashboardPerformanceAnalytics) ? data.dashboardPerformanceAnalytics.slice() : [];
            var historyRow = cloneSanitized({
                id: report.reportId,
                reportId: report.reportId,
                tenantSlug: report.tenantSlug,
                performanceScore: report.performanceScore,
                responsivenessScore: report.responsivenessScore,
                performanceClass: report.performanceClass,
                slowComponentCount: report.slowComponents.length,
                createdAt: report.createdAt,
                immutable: true
            });
            var analyticsRow = cloneSanitized({
                id: 'DPA-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7).toUpperCase(),
                reportId: report.reportId,
                tenantSlug: report.tenantSlug,
                dashboardCount: report.analytics.dashboardLoadTrends.dashboards,
                widgetCount: report.analytics.widgetPerformance.totalWidgets,
                slowWidgets: report.analytics.widgetPerformance.slowWidgets,
                searchLatency: report.analytics.searchLatency,
                activityFeedLatency: report.analytics.activityFeedLatency,
                notificationLatency: report.analytics.notificationLatency,
                createdAt: report.createdAt,
                immutable: true
            });
            data.dashboardPerformanceHistory.unshift(historyRow);
            data.dashboardPerformanceAnalytics.unshift(analyticsRow);
            data.dashboardPerformanceHistory = data.dashboardPerformanceHistory.slice(0, MAX_HISTORY);
            data.dashboardPerformanceAnalytics = data.dashboardPerformanceAnalytics.slice(0, MAX_HISTORY);
            saveData(data);
            return true;
        } catch (error) {
            return false;
        }
    }

    function auditPerformance(actionType, metadata, context) {
        try {
            if (context && context.skipAuditPersistence) return { success: true, skipped: true };
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                service.recordAudit({
                    actionType: actionType,
                    eventType: actionType,
                    module: 'Dashboard Performance',
                    targetId: metadata && metadata.reportId || '',
                    actorId: actorId(context || {}),
                    description: metadata && metadata.description || actionType,
                    severity: metadata && metadata.severity || 'INFO',
                    metadata: cloneSanitized(metadata || {})
                }, { source: 'dashboardPerformanceService' });
                return { success: true };
            }
            if (db() && typeof db().writeAuditLog === 'function') {
                db().writeAuditLog(context && context.actor && context.actor.role || 'system', actorId(context || {}), actionType, 'Dashboard Performance', metadata && metadata.reportId || '', metadata && metadata.description || actionType);
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Dashboard performance audit failed safely.' };
        }
        return { success: false, warning: 'Audit dependency unavailable.' };
    }

    function emitTelemetry(eventType, metadata, context) {
        try {
            if (context && context.skipTelemetry) return { success: true, skipped: true };
            var service = global.WorkflowTelemetryService || global.workflowTelemetryService;
            if (service && typeof service.emitTelemetry === 'function') {
                service.emitTelemetry('GOVERNANCE', eventType, {
                    source: 'dashboardPerformanceService',
                    severity: metadata && metadata.severity || 'INFO',
                    status: metadata && metadata.status || eventType,
                    metadata: cloneSanitized(metadata || {})
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Dashboard performance telemetry failed safely.' };
        }
        return { success: false, warning: 'Telemetry dependency unavailable.' };
    }

    function recordMetric(metricType, metadata, context) {
        try {
            if (context && context.skipMetrics) return { success: true, skipped: true };
            var service = global.OrchestrationMetricsService || global.orchestrationMetricsService;
            if (service && typeof service.recordWorkflowMetric === 'function') {
                service.recordWorkflowMetric(metricType, cloneSanitized(Object.assign({ source: 'dashboardPerformanceService' }, metadata || {})));
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Dashboard performance metrics failed safely.' };
        }
        return { success: false, warning: 'Metrics dependency unavailable.' };
    }

    function generateDashboardPerformanceReport(payload, context) {
        try {
            var ctx = context || {};
            var normalized = normalizePerformancePayload(payload || {}, ctx);
            if (!normalized.success) {
                auditPerformance('DASHBOARD_PERFORMANCE_REVIEW_BLOCKED', {
                    severity: 'WARNING',
                    description: normalized.message || 'Dashboard performance review blocked.'
                }, ctx);
                return normalized;
            }
            var score = calculatePerformanceScore(normalized);
            var slow = detectSlowComponents(normalized);
            var optimization = optimizeDashboardRendering(normalized);
            var reportId = 'DPERF-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
            var analytics = buildAnalytics(normalized, score, slow);
            var report = {
                success: true,
                reportId: reportId,
                tenantSlug: normalized.tenantSlug,
                createdAt: nowIso(),
                performanceState: score.performanceClass === PERFORMANCE_CLASSES.CRITICAL ? 'CRITICAL' : score.performanceClass === PERFORMANCE_CLASSES.HIGH ? 'DEGRADED' : 'MONITORING',
                performanceScore: score.performanceScore,
                responsivenessScore: score.responsivenessScore,
                performanceClass: score.performanceClass,
                score: score,
                slowComponents: slow.slowComponents || [],
                optimization: optimization,
                analytics: analytics,
                integrationHealth: {
                    smartSearchIntegrated: !!global.SmartSearchService,
                    globalActivityFeedIntegrated: !!global.GlobalActivityFeedService,
                    notificationCenterIntegrated: !!global.NotificationCenterService,
                    platformAnalyticsIntegrated: !!global.PlatformAnalyticsService,
                    runtimeHealthIntegrated: !!global.RuntimeEnvironmentHealthService
                },
                governance: {
                    backwardCompatibilityPreserved: true,
                    tenantIsolationPreserved: true,
                    performanceGovernancePreserved: true,
                    noGovernanceBypass: true,
                    outputsImmutable: true
                }
            };
            report = freezePerformanceOutput(report);
            persistReport(report, ctx);
            auditPerformance('DASHBOARD_PERFORMANCE_REPORT_GENERATED', {
                reportId: report.reportId,
                severity: report.performanceClass === PERFORMANCE_CLASSES.CRITICAL ? 'ERROR' : report.performanceClass === PERFORMANCE_CLASSES.HIGH ? 'WARNING' : 'INFO',
                description: 'Dashboard performance review completed.'
            }, ctx);
            emitTelemetry('DASHBOARD_PERFORMANCE_REVIEWED', {
                reportId: report.reportId,
                severity: report.performanceClass === PERFORMANCE_CLASSES.CRITICAL ? 'ERROR' : 'INFO',
                status: report.performanceState
            }, ctx);
            recordMetric('DASHBOARD_PERFORMANCE_REVIEWED', {
                reportId: report.reportId,
                performanceScore: report.performanceScore,
                slowComponents: report.slowComponents.length
            }, ctx);
            return report;
        } catch (error) {
            return freezePerformanceOutput({
                success: false,
                classification: 'REPORT_FAILED',
                message: 'Dashboard performance report failed safely.',
                governance: {
                    tenantIsolationPreserved: true,
                    performanceGovernancePreserved: true
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
            var malformed = normalizePerformancePayload('bad', {});
            record('malformed payloads fail safely', malformed.success === false && Object.isFrozen(malformed));
            var payload = {
                tenantSlug: 'selftest',
                dashboards: [{ dashboardId: 'self-dashboard', pageLoadMs: 2200, renderTimeMs: 650, queryTimeMs: 520, memoryMb: 180, interactionLatencyMs: 360, renderCycles: 10, fullPageRefresh: true }],
                widgets: [{ widgetId: 'self-feed', serviceName: 'GlobalActivityFeedService', renderTimeMs: 620, queryTimeMs: 480, recordCount: 3000, renderCycles: 9, virtualized: false }],
                interactions: [{ interactionId: 'self-click', latencyMs: 380 }],
                metadata: { salary: 1000, leaveBalance: 4 }
            };
            var ctx = { routeType: 'platform', tenantSlug: 'selftest', actor: { role: 'PLATFORM_OWNER', id: 'PO-SELF' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true };
            var normalized = normalizePerformancePayload(payload, ctx);
            var score = calculatePerformanceScore(normalized);
            var slow = detectSlowComponents(normalized);
            var optimized = optimizeDashboardRendering(normalized);
            var report = generateDashboardPerformanceReport(payload, ctx);
            record('dashboard optimization works', optimized.success === true && optimized.optimizations.widgetVirtualization.indexOf('self-feed') !== -1);
            record('performance scoring works', score.success === true && score.performanceScore < 80);
            record('slow component detection works', slow.success === true && slow.slowComponents.length >= 1);
            record('analytics work', report.success === true && report.analytics.widgetPerformance.totalWidgets === 1);
            record('immutable outputs enforced', Object.isFrozen(report) && Object.isFrozen(report.slowComponents) && Object.isFrozen(normalized));
            record('visibility governance works', generateDashboardPerformanceReport(payload, { routeType: 'tenant', tenantSlug: 'selftest', actor: { role: 'HR', id: 'HR-SELF' }, skipAuditPersistence: true }).success === false);
        } catch (error) {
            record('self-test uncaught exception guard', false, { error: error && error.message });
        }
        var result = freezePerformanceOutput({
            passed: checks.every(function ok(row) { return row.passed; }),
            tests: checks,
            checkedAt: nowIso()
        });
        global.__ARTHHRMS_DASHBOARD_PERFORMANCE_SELF_TEST__ = result;
        return result;
    }

    var DashboardPerformanceService = Object.freeze({
        VERSION: '1.0.0',
        PERFORMANCE_STATES: PERFORMANCE_STATES,
        PERFORMANCE_CLASSES: PERFORMANCE_CLASSES,
        validatePerformanceScope: validatePerformanceScope,
        calculatePerformanceScore: calculatePerformanceScore,
        detectSlowComponents: detectSlowComponents,
        optimizeDashboardRendering: optimizeDashboardRendering,
        normalizePerformancePayload: normalizePerformancePayload,
        freezePerformanceOutput: freezePerformanceOutput,
        generateDashboardPerformanceReport: generateDashboardPerformanceReport,
        runSelfTest: runSelfTest
    });

    global.DashboardPerformanceService = DashboardPerformanceService;
    global.dashboardPerformanceService = DashboardPerformanceService;

    if (global.__ARTHHRMS_DEV__) {
        try {
            runSelfTest();
        } catch (error) {
            global.__ARTHHRMS_DASHBOARD_PERFORMANCE_SELF_TEST__ = freezePerformanceOutput({
                passed: false,
                tests: [{ name: 'self-test wrapper', passed: false, details: { error: error && error.message } }],
                checkedAt: nowIso()
            });
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
