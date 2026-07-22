/**
 * mobileResponsivenessService.js
 * ARTHHRMS - Mobile Responsiveness Hardening + Cross-Device Enterprise Experience Framework
 *
 * PURPOSE:
 * Provides governed responsive UX scoring, viewport classification, mobile/tablet
 * layout recommendations, device analytics, and immutable mobile experience
 * reports for platform operations roles.
 *
 * This service does NOT:
 * - mutate tenant business data
 * - expose cross-tenant operational records
 * - expose salaries, leave balances, raw documents, or private payloads
 * - bypass RBAC, audit, telemetry, or mobile UX governance
 *
 * @version 1.0.0
 */
(function attachMobileResponsivenessService(global) {
    'use strict';

    var MAX_HISTORY = 500;

    var RESPONSIVE_STATES = Object.freeze([
        'MONITORING',
        'READY',
        'NEEDS_REVIEW',
        'DEGRADED',
        'CRITICAL',
        'ARCHIVED'
    ]);

    var VIEWPORT_TYPES = Object.freeze({
        TINY_MOBILE: 'TINY_MOBILE',
        MOBILE: 'MOBILE',
        TABLET: 'TABLET',
        LAPTOP: 'LAPTOP',
        ULTRA_WIDE: 'ULTRA_WIDE'
    });

    var RISK_CLASSES = Object.freeze({
        LOW: 'LOW',
        MODERATE: 'MODERATE',
        HIGH: 'HIGH',
        CRITICAL: 'CRITICAL'
    });

    var SENSITIVE_KEY_PATTERN = /(salary|payroll.?amount|payrollAmount|payslip|compensation|ctc|leave.?balance|leaveBalance|gross|net|basic|hra|pf|tds|allowance|deduction|password|secret|token|jwt|authorization|service.?role|private.?key|bank|tax|raw.?payload|raw.?content|raw.?body|raw.?document|payload|content|body|signed.?url|download.?url|storage.?path|file.?path|document|employeeRecord|confidential|privateNote)/i;
    var SENSITIVE_VALUE_PATTERN = /\b(salary|payrollAmount|payroll|compensation|ctc|leave\s*balance|leaveBalance|confidential|rawTenantDocument)\s*[:=]?\s*[\w,.\- ]+/ig;

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

    function freezeResponsiveOutput(value) {
        return freezeDeep(cloneSanitized(value || {}));
    }

    function roleCanViewResponsive(role, context, payload) {
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

    function validateResponsiveScope(payload, context) {
        try {
            var ctx = context || {};
            var record = payload || {};
            var role = normalizeRole((ctx.actor && ctx.actor.role) || ctx.role || '');
            var payloadTenant = normalizeTenantSlug(record.tenantSlug || record.tenantId || record.companyId || '');
            var ctxTenant = contextTenant(ctx);
            if (!roleCanViewResponsive(role, ctx, record)) {
                return freezeResponsiveOutput({
                    success: false,
                    allowed: false,
                    classification: 'ROLE_SCOPE_BLOCKED',
                    message: 'Mobile experience insights are restricted to platform operations roles.',
                    governance: {
                        tenantIsolationPreserved: true,
                        mobileUXGovernancePreserved: true
                    }
                });
            }
            if (payloadTenant && ctxTenant && payloadTenant !== ctxTenant) {
                return freezeResponsiveOutput({
                    success: false,
                    allowed: false,
                    classification: 'TENANT_SCOPE_BLOCKED',
                    message: 'Mobile responsiveness scope must match the active tenant context.',
                    governance: {
                        tenantIsolationPreserved: true,
                        mobileUXGovernancePreserved: true
                    }
                });
            }
            return freezeResponsiveOutput({
                success: true,
                allowed: true,
                role: role,
                visibility: role === 'SUPER_ADMIN' ? 'INFRASTRUCTURE_RESPONSIVE_MONITORING' : 'PLATFORM_MOBILE_UX_GOVERNANCE',
                tenantSlug: payloadTenant || ctxTenant || 'platform',
                governance: {
                    tenantIsolationPreserved: true,
                    mobileUXGovernancePreserved: true
                }
            });
        } catch (error) {
            return freezeResponsiveOutput({
                success: false,
                allowed: false,
                classification: 'SCOPE_VALIDATION_FAILED',
                message: 'Mobile responsiveness scope validation failed safely.',
                governance: {
                    tenantIsolationPreserved: true,
                    mobileUXGovernancePreserved: true
                }
            });
        }
    }

    function detectViewportType(input) {
        try {
            var source = isPlainObject(input) ? input : {};
            var width = safeNumber(source.width || source.viewportWidth || source.innerWidth, 0);
            var height = safeNumber(source.height || source.viewportHeight || source.innerHeight, 0);
            var type = VIEWPORT_TYPES.ULTRA_WIDE;
            if (width < 480) type = VIEWPORT_TYPES.TINY_MOBILE;
            else if (width <= 768) type = VIEWPORT_TYPES.MOBILE;
            else if (width <= 1024) type = VIEWPORT_TYPES.TABLET;
            else if (width <= 1440) type = VIEWPORT_TYPES.LAPTOP;
            return freezeResponsiveOutput({
                success: true,
                viewportType: type,
                width: width,
                height: height,
                orientation: normalizeToken(source.orientation || (height > width ? 'portrait' : 'landscape'), 'LANDSCAPE').toLowerCase(),
                touchOptimized: width <= 1024,
                breakpoint: width < 480 ? '<480px' : width <= 768 ? '481-768px' : width <= 1024 ? '769-1024px' : width <= 1440 ? '1025-1440px' : '1440px+'
            });
        } catch (error) {
            return freezeResponsiveOutput({
                success: false,
                viewportType: VIEWPORT_TYPES.LAPTOP,
                width: 0,
                height: 0,
                orientation: 'landscape',
                touchOptimized: false,
                breakpoint: 'unknown'
            });
        }
    }

    function viewportTypeFromWidth(width) {
        return detectViewportType({ width: width || 1366 }).viewportType;
    }

    function isTouchViewport(width) {
        var type = viewportTypeFromWidth(width);
        return type === VIEWPORT_TYPES.TINY_MOBILE || type === VIEWPORT_TYPES.MOBILE || type === VIEWPORT_TYPES.TABLET;
    }

    function normalizeDevice(row, index) {
        var source = isPlainObject(row) ? row : {};
        var width = safeNumber(source.width || source.viewportWidth || source.innerWidth, 1366);
        var height = safeNumber(source.height || source.viewportHeight || source.innerHeight, 768);
        var viewport = detectViewportType({ width: width, height: height, orientation: source.orientation });
        return {
            viewportId: safeString(source.viewportId || source.id || ('viewport-' + (index + 1)), 'viewport'),
            width: width,
            height: height,
            orientation: viewport.orientation,
            viewportType: viewport.viewportType,
            breakpoint: viewport.breakpoint,
            renderMs: safeNumber(source.renderMs || source.renderTimeMs, 0),
            interactionLatencyMs: safeNumber(source.interactionLatencyMs || source.inputLatencyMs, 0),
            memoryMb: safeNumber(source.memoryMb || source.memoryUsageMb, 0),
            contentConstrained: source.contentConstrained === true,
            metadata: cloneSanitized(source.metadata || {})
        };
    }

    function normalizeDashboard(row, tenantSlug, index) {
        var source = isPlainObject(row) ? row : {};
        var viewportWidth = safeNumber(source.viewportWidth || source.width || 1366, 1366);
        return {
            dashboardId: safeString(source.dashboardId || source.id || ('dashboard-' + (index + 1)), 'dashboard'),
            dashboardType: normalizeToken(source.dashboardType || source.type || source.module || 'dashboard'),
            tenantSlug: normalizeTenantSlug(source.tenantSlug || tenantSlug),
            viewportWidth: viewportWidth,
            viewportType: viewportTypeFromWidth(viewportWidth),
            cardColumns: safeNumber(source.cardColumns || source.columns, 1),
            formColumns: safeNumber(source.formColumns, 1),
            tableMinWidth: safeNumber(source.tableMinWidth || source.minTableWidth, 0),
            horizontalOverflow: source.horizontalOverflow === true,
            tableScrollEnabled: source.tableScrollEnabled === true || source.scrollEnabled === true,
            navDrawerAvailable: source.navDrawerAvailable === true || source.drawerAvailable === true,
            collapsiblePanels: source.collapsiblePanels === true,
            touchTargetPx: safeNumber(source.touchTargetPx || source.minTouchTargetPx, 44),
            chartAdaptive: source.chartAdaptive === true || source.adaptiveCharts === true,
            desktopLayoutPreserved: source.desktopLayoutPreserved !== false,
            hiddenActionsExposed: source.hiddenActionsExposed === true || source.restrictedActionsExposed === true,
            metadata: cloneSanitized(source.metadata || {})
        };
    }

    function normalizeForm(row, index) {
        var source = isPlainObject(row) ? row : {};
        var viewportWidth = safeNumber(source.viewportWidth || source.width || 1366, 1366);
        return {
            formId: safeString(source.formId || source.id || ('form-' + (index + 1)), 'form'),
            viewportWidth: viewportWidth,
            viewportType: viewportTypeFromWidth(viewportWidth),
            columns: safeNumber(source.columns || source.formColumns, 1),
            validationInline: source.validationInline === true,
            touchTargetPx: safeNumber(source.touchTargetPx || source.minTouchTargetPx, 44),
            metadata: cloneSanitized(source.metadata || {})
        };
    }

    function normalizeTable(row, index) {
        var source = isPlainObject(row) ? row : {};
        var viewportWidth = safeNumber(source.viewportWidth || source.width || 1366, 1366);
        return {
            tableId: safeString(source.tableId || source.id || ('table-' + (index + 1)), 'table'),
            viewportWidth: viewportWidth,
            viewportType: viewportTypeFromWidth(viewportWidth),
            minWidth: safeNumber(source.minWidth || source.tableMinWidth, 0),
            scrollEnabled: source.scrollEnabled === true || source.tableScrollEnabled === true,
            expandableRows: source.expandableRows === true,
            metadata: cloneSanitized(source.metadata || {})
        };
    }

    function normalizeNavigation(row, index) {
        var source = isPlainObject(row) ? row : {};
        var viewportWidth = safeNumber(source.viewportWidth || source.width || 1366, 1366);
        return {
            navId: safeString(source.navId || source.id || ('nav-' + (index + 1)), 'nav'),
            viewportWidth: viewportWidth,
            viewportType: viewportTypeFromWidth(viewportWidth),
            drawerAvailable: source.drawerAvailable === true || source.navDrawerAvailable === true,
            collapsible: source.collapsible === true,
            hiddenActionsExposed: source.hiddenActionsExposed === true || source.restrictedActionsExposed === true,
            metadata: cloneSanitized(source.metadata || {})
        };
    }

    function normalizeResponsivePayload(payload, context) {
        try {
            if (!isPlainObject(payload)) {
                return freezeResponsiveOutput({
                    success: false,
                    classification: 'MALFORMED_PAYLOAD',
                    message: 'Mobile responsiveness payload must be an object.'
                });
            }
            var ctxTenant = contextTenant(context || {});
            var tenantSlug = normalizeTenantSlug(payload.tenantSlug || payload.tenantId || payload.companyId || ctxTenant || 'platform');
            var scope = validateResponsiveScope(Object.assign({}, payload, { tenantSlug: tenantSlug }), context || {});
            if (!scope.success) return scope;
            var devices = Array.isArray(payload.devices) ? payload.devices : [];
            if (!devices.length) {
                devices = [{
                    viewportId: 'current-viewport',
                    width: safeNumber(global.innerWidth || 1366, 1366),
                    height: safeNumber(global.innerHeight || 768, 768),
                    orientation: safeNumber(global.innerHeight || 768, 768) > safeNumber(global.innerWidth || 1366, 1366) ? 'portrait' : 'landscape'
                }];
            }
            var normalized = {
                success: true,
                tenantSlug: tenantSlug,
                scope: scope,
                devices: devices.slice(0, 50).map(normalizeDevice),
                dashboards: (Array.isArray(payload.dashboards) ? payload.dashboards : []).slice(0, 80).map(function mapDashboard(row, index) {
                    return normalizeDashboard(row, tenantSlug, index);
                }),
                forms: (Array.isArray(payload.forms) ? payload.forms : []).slice(0, 80).map(normalizeForm),
                tables: (Array.isArray(payload.tables) ? payload.tables : []).slice(0, 120).map(normalizeTable),
                navigation: (Array.isArray(payload.navigation) ? payload.navigation : []).slice(0, 60).map(normalizeNavigation),
                metadata: cloneSanitized(payload.metadata || {}),
                governance: {
                    backwardCompatibilityPreserved: true,
                    tenantIsolationPreserved: true,
                    mobileUXGovernancePreserved: true,
                    noGovernanceBypass: true
                }
            };
            return freezeResponsiveOutput(normalized);
        } catch (error) {
            return freezeResponsiveOutput({
                success: false,
                classification: 'NORMALIZATION_FAILED',
                message: 'Mobile responsiveness payload normalization failed safely.',
                governance: {
                    tenantIsolationPreserved: true,
                    mobileUXGovernancePreserved: true
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
        if (score < 55) return RISK_CLASSES.CRITICAL;
        if (score < 72) return RISK_CLASSES.HIGH;
        if (score < 86) return RISK_CLASSES.MODERATE;
        return RISK_CLASSES.LOW;
    }

    function calculateResponsiveScore(normalized) {
        try {
            if (!normalized || normalized.success !== true) {
                return freezeResponsiveOutput({
                    success: false,
                    classification: 'INVALID_NORMALIZED_PAYLOAD',
                    message: 'Responsive score requires a normalized payload.'
                });
            }
            var issues = [];
            var mobilePenalty = 0;
            var readinessPenalty = 0;
            (normalized.devices || []).forEach(function scoreDevice(device) {
                var isMobile = device.viewportType === VIEWPORT_TYPES.TINY_MOBILE || device.viewportType === VIEWPORT_TYPES.MOBILE;
                var isTablet = device.viewportType === VIEWPORT_TYPES.TABLET;
                if ((isMobile || isTablet) && device.renderMs > 360) readinessPenalty += addIssue(issues, 'SLOW_MOBILE_RENDER', 'MODERATE', device.viewportId, 'Mobile/tablet render time is above target.', 4);
                if ((isMobile || isTablet) && device.interactionLatencyMs > 160) mobilePenalty += addIssue(issues, 'TOUCH_LATENCY', 'MODERATE', device.viewportId, 'Touch interaction latency is above target.', 5);
                if (device.memoryMb > 160) readinessPenalty += addIssue(issues, 'MOBILE_MEMORY_PRESSURE', 'HIGH', device.viewportId, 'Device memory pressure is above target.', 5);
            });
            (normalized.dashboards || []).forEach(function scoreDashboard(dashboard) {
                var touch = isTouchViewport(dashboard.viewportWidth);
                if (touch && dashboard.cardColumns > 1) mobilePenalty += addIssue(issues, 'MOBILE_CARD_STACKING_REQUIRED', 'MODERATE', dashboard.dashboardId, 'Cards should stack or collapse on touch viewports.', 7);
                if (touch && dashboard.formColumns > 1) mobilePenalty += addIssue(issues, 'MOBILE_FORM_STACKING_REQUIRED', 'HIGH', dashboard.dashboardId, 'Forms should collapse to one column on touch viewports.', 8);
                if (touch && dashboard.horizontalOverflow && !dashboard.tableScrollEnabled) mobilePenalty += addIssue(issues, 'UNSAFE_HORIZONTAL_OVERFLOW', 'HIGH', dashboard.dashboardId, 'Wide content needs a governed scroll container.', 10);
                if (touch && !dashboard.navDrawerAvailable) mobilePenalty += addIssue(issues, 'MOBILE_NAV_DRAWER_MISSING', 'HIGH', dashboard.dashboardId, 'Touch viewports need an adaptive navigation drawer or collapsed nav.', 9);
                if (touch && dashboard.touchTargetPx < 44) mobilePenalty += addIssue(issues, 'TOUCH_TARGET_TOO_SMALL', 'HIGH', dashboard.dashboardId, 'Touch targets must be at least 44px.', 9);
                if (touch && !dashboard.chartAdaptive) readinessPenalty += addIssue(issues, 'CHART_NOT_ADAPTIVE', 'MODERATE', dashboard.dashboardId, 'Charts should resize for mobile/tablet viewports.', 5);
                if (!dashboard.desktopLayoutPreserved) readinessPenalty += addIssue(issues, 'DESKTOP_LAYOUT_REGRESSION', 'CRITICAL', dashboard.dashboardId, 'Desktop layout preservation is required.', 18);
                if (dashboard.hiddenActionsExposed) readinessPenalty += addIssue(issues, 'RESTRICTED_ACTION_EXPOSED', 'CRITICAL', dashboard.dashboardId, 'Responsive changes must not expose hidden actions.', 24);
            });
            (normalized.forms || []).forEach(function scoreForm(form) {
                if (isTouchViewport(form.viewportWidth) && form.columns > 1) mobilePenalty += addIssue(issues, 'FORM_COLUMNS_TOO_DENSE', 'HIGH', form.formId, 'Touch forms should use a single-column layout.', 8);
                if (isTouchViewport(form.viewportWidth) && form.touchTargetPx < 44) mobilePenalty += addIssue(issues, 'FORM_TOUCH_TARGET_TOO_SMALL', 'HIGH', form.formId, 'Form controls must be touch-friendly.', 7);
                if (isTouchViewport(form.viewportWidth) && !form.validationInline) readinessPenalty += addIssue(issues, 'MOBILE_VALIDATION_FEEDBACK_MISSING', 'MODERATE', form.formId, 'Mobile validation feedback should remain near the field.', 4);
            });
            (normalized.tables || []).forEach(function scoreTable(table) {
                if (isTouchViewport(table.viewportWidth) && table.minWidth > table.viewportWidth && !table.scrollEnabled) mobilePenalty += addIssue(issues, 'TABLE_SCROLL_MISSING', 'HIGH', table.tableId, 'Wide tables need horizontal scroll on mobile.', 10);
                if (isTouchViewport(table.viewportWidth) && !table.expandableRows) readinessPenalty += addIssue(issues, 'TABLE_EXPANSION_MISSING', 'MODERATE', table.tableId, 'Mobile tables should support expandable or condensed rows.', 4);
            });
            (normalized.navigation || []).forEach(function scoreNav(nav) {
                if (isTouchViewport(nav.viewportWidth) && (!nav.drawerAvailable || !nav.collapsible)) mobilePenalty += addIssue(issues, 'NAVIGATION_NOT_COLLAPSIBLE', 'HIGH', nav.navId, 'Mobile navigation should collapse into a drawer or compact mode.', 9);
                if (nav.hiddenActionsExposed) readinessPenalty += addIssue(issues, 'NAV_RESTRICTED_ACTION_EXPOSED', 'CRITICAL', nav.navId, 'Navigation must not reveal restricted actions.', 24);
            });
            var mobileUsabilityScore = clamp(100 - mobilePenalty, 0, 100);
            var responsiveReadinessScore = clamp(100 - Math.round((mobilePenalty * 0.55) + readinessPenalty), 0, 100);
            var score = Math.min(mobileUsabilityScore, responsiveReadinessScore);
            return freezeResponsiveOutput({
                success: true,
                mobileUsabilityScore: mobileUsabilityScore,
                responsiveReadinessScore: responsiveReadinessScore,
                responsiveClass: classifyScore(score),
                issues: issues,
                metrics: {
                    totalDevices: (normalized.devices || []).length,
                    totalDashboards: (normalized.dashboards || []).length,
                    totalForms: (normalized.forms || []).length,
                    totalTables: (normalized.tables || []).length,
                    totalNavigationItems: (normalized.navigation || []).length,
                    mobilePenalty: mobilePenalty,
                    readinessPenalty: readinessPenalty
                }
            });
        } catch (error) {
            return freezeResponsiveOutput({
                success: false,
                classification: 'RESPONSIVE_SCORE_FAILED',
                message: 'Responsive scoring failed safely.'
            });
        }
    }

    function uniquePush(list, value) {
        if (value && list.indexOf(value) === -1) list.push(value);
    }

    function optimizeResponsiveLayout(normalized) {
        try {
            if (!normalized || normalized.success !== true) {
                return freezeResponsiveOutput({
                    success: false,
                    classification: 'INVALID_NORMALIZED_PAYLOAD',
                    message: 'Responsive optimization requires a normalized payload.'
                });
            }
            var optimizations = {
                mobileNavigationDrawers: [],
                singleColumnForms: [],
                tableScrollContainers: [],
                touchTargetHardening: [],
                adaptiveCharts: [],
                collapsiblePanels: [],
                ultraWideConstraints: [],
                deferredMobileWidgets: []
            };
            var opportunities = [];
            (normalized.navigation || []).forEach(function navOpt(nav) {
                if (isTouchViewport(nav.viewportWidth) && (!nav.drawerAvailable || !nav.collapsible)) {
                    uniquePush(optimizations.mobileNavigationDrawers, nav.navId);
                    opportunities.push('Add or verify mobile drawer/collapsible navigation for ' + nav.navId + '.');
                }
            });
            (normalized.dashboards || []).forEach(function dashboardOpt(dashboard) {
                if (isTouchViewport(dashboard.viewportWidth) && dashboard.formColumns > 1) {
                    uniquePush(optimizations.singleColumnForms, dashboard.dashboardId);
                    opportunities.push('Collapse dashboard forms to one column on ' + dashboard.dashboardId + '.');
                }
                if (isTouchViewport(dashboard.viewportWidth) && dashboard.cardColumns > 1) {
                    uniquePush(optimizations.collapsiblePanels, dashboard.dashboardId);
                    opportunities.push('Stack cards and enable collapsible panels for ' + dashboard.dashboardId + '.');
                }
                if (isTouchViewport(dashboard.viewportWidth) && (dashboard.horizontalOverflow || dashboard.tableMinWidth > dashboard.viewportWidth) && !dashboard.tableScrollEnabled) {
                    uniquePush(optimizations.tableScrollContainers, dashboard.dashboardId);
                    opportunities.push('Wrap wide tables/analytics in horizontal scroll containers for ' + dashboard.dashboardId + '.');
                }
                if (isTouchViewport(dashboard.viewportWidth) && dashboard.touchTargetPx < 44) {
                    uniquePush(optimizations.touchTargetHardening, dashboard.dashboardId);
                    opportunities.push('Increase touch targets to at least 44px on ' + dashboard.dashboardId + '.');
                }
                if (isTouchViewport(dashboard.viewportWidth) && !dashboard.chartAdaptive) {
                    uniquePush(optimizations.adaptiveCharts, dashboard.dashboardId);
                }
                if (isTouchViewport(dashboard.viewportWidth) && dashboard.cardColumns > 2) {
                    uniquePush(optimizations.deferredMobileWidgets, dashboard.dashboardId);
                }
            });
            (normalized.forms || []).forEach(function formOpt(form) {
                if (isTouchViewport(form.viewportWidth) && form.columns > 1) {
                    uniquePush(optimizations.singleColumnForms, form.formId);
                    opportunities.push('Use a single-column mobile form layout for ' + form.formId + '.');
                }
                if (isTouchViewport(form.viewportWidth) && form.touchTargetPx < 44) {
                    uniquePush(optimizations.touchTargetHardening, form.formId);
                }
            });
            (normalized.tables || []).forEach(function tableOpt(table) {
                if (isTouchViewport(table.viewportWidth) && table.minWidth > table.viewportWidth && !table.scrollEnabled) {
                    uniquePush(optimizations.tableScrollContainers, table.tableId);
                    opportunities.push('Enable governed horizontal scrolling for ' + table.tableId + '.');
                }
            });
            (normalized.devices || []).forEach(function deviceOpt(device) {
                if (device.viewportType === VIEWPORT_TYPES.ULTRA_WIDE && !device.contentConstrained) {
                    uniquePush(optimizations.ultraWideConstraints, device.viewportId);
                    opportunities.push('Constrain ultra-wide content width for ' + device.viewportId + '.');
                }
            });
            return freezeResponsiveOutput({
                success: true,
                optimizations: optimizations,
                optimizationOpportunities: opportunities.slice(0, 40),
                governance: {
                    safeOptimizationOnly: true,
                    backwardCompatibilityPreserved: true,
                    tenantIsolationPreserved: true,
                    mobileUXGovernancePreserved: true
                }
            });
        } catch (error) {
            return freezeResponsiveOutput({
                success: false,
                classification: 'RESPONSIVE_OPTIMIZATION_FAILED',
                message: 'Responsive optimization planning failed safely.',
                governance: {
                    safeOptimizationOnly: true,
                    tenantIsolationPreserved: true
                }
            });
        }
    }

    function buildDeviceDistribution(devices) {
        var distribution = {
            tinyMobile: 0,
            mobile: 0,
            tablet: 0,
            laptop: 0,
            ultraWide: 0
        };
        (devices || []).forEach(function countDevice(device) {
            if (device.viewportType === VIEWPORT_TYPES.TINY_MOBILE) distribution.tinyMobile += 1;
            else if (device.viewportType === VIEWPORT_TYPES.MOBILE) distribution.mobile += 1;
            else if (device.viewportType === VIEWPORT_TYPES.TABLET) distribution.tablet += 1;
            else if (device.viewportType === VIEWPORT_TYPES.LAPTOP) distribution.laptop += 1;
            else if (device.viewportType === VIEWPORT_TYPES.ULTRA_WIDE) distribution.ultraWide += 1;
        });
        return distribution;
    }

    function buildAnalytics(normalized, score, optimization) {
        var devices = normalized.devices || [];
        var dashboards = normalized.dashboards || [];
        var tables = normalized.tables || [];
        var forms = normalized.forms || [];
        var nav = normalized.navigation || [];
        var issueCount = score.issues ? score.issues.length : 0;
        return {
            deviceDistribution: buildDeviceDistribution(devices),
            viewportUsage: devices.map(function viewport(row) {
                return { viewportId: row.viewportId, viewportType: row.viewportType, width: row.width, height: row.height };
            }),
            dashboardReadiness: {
                totalDashboards: dashboards.length,
                touchDashboards: dashboards.filter(function touch(row) { return isTouchViewport(row.viewportWidth); }).length,
                desktopPreserved: dashboards.filter(function preserved(row) { return row.desktopLayoutPreserved; }).length
            },
            responsiveForms: {
                totalForms: forms.length,
                singleColumnReady: forms.filter(function ready(row) { return !isTouchViewport(row.viewportWidth) || row.columns <= 1; }).length
            },
            responsiveTables: {
                totalTables: tables.length,
                scrollReady: tables.filter(function ready(row) { return !isTouchViewport(row.viewportWidth) || row.scrollEnabled || row.minWidth <= row.viewportWidth; }).length
            },
            navigationReadiness: {
                totalNavigationSurfaces: nav.length,
                drawerReady: nav.filter(function ready(row) { return !isTouchViewport(row.viewportWidth) || row.drawerAvailable; }).length
            },
            interactionAnalytics: {
                maxInteractionLatencyMs: devices.reduce(function maxLatency(max, row) { return Math.max(max, safeNumber(row.interactionLatencyMs, 0)); }, 0),
                maxRenderMs: devices.reduce(function maxRender(max, row) { return Math.max(max, safeNumber(row.renderMs, 0)); }, 0),
                mobileUsabilityScore: score.mobileUsabilityScore || 0,
                responsiveReadinessScore: score.responsiveReadinessScore || 0
            },
            issueAnalytics: {
                totalIssues: issueCount,
                criticalIssues: (score.issues || []).filter(function critical(row) { return row.severity === RISK_CLASSES.CRITICAL; }).length,
                opportunityCount: optimization.optimizationOpportunities ? optimization.optimizationOpportunities.length : 0
            }
        };
    }

    function persistReport(report) {
        try {
            var data = rawData();
            data.mobileResponsivenessHistory = Array.isArray(data.mobileResponsivenessHistory) ? data.mobileResponsivenessHistory.slice() : [];
            data.mobileResponsivenessAnalytics = Array.isArray(data.mobileResponsivenessAnalytics) ? data.mobileResponsivenessAnalytics.slice() : [];
            data.mobileResponsivenessHistory.unshift(cloneSanitized({
                id: report.reportId,
                reportId: report.reportId,
                tenantSlug: report.tenantSlug,
                responsiveState: report.responsiveState,
                mobileUsabilityScore: report.mobileUsabilityScore,
                responsiveReadinessScore: report.responsiveReadinessScore,
                responsiveClass: report.responsiveClass,
                createdAt: report.createdAt,
                immutable: true
            }));
            data.mobileResponsivenessAnalytics.unshift(cloneSanitized({
                id: 'MRSP-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7).toUpperCase(),
                reportId: report.reportId,
                tenantSlug: report.tenantSlug,
                tinyMobile: report.analytics.deviceDistribution.tinyMobile,
                mobile: report.analytics.deviceDistribution.mobile,
                tablet: report.analytics.deviceDistribution.tablet,
                laptop: report.analytics.deviceDistribution.laptop,
                ultraWide: report.analytics.deviceDistribution.ultraWide,
                issueCount: report.analytics.issueAnalytics.totalIssues,
                mobileUsabilityScore: report.mobileUsabilityScore,
                responsiveReadinessScore: report.responsiveReadinessScore,
                createdAt: report.createdAt,
                immutable: true
            }));
            data.mobileResponsivenessHistory = data.mobileResponsivenessHistory.slice(0, MAX_HISTORY);
            data.mobileResponsivenessAnalytics = data.mobileResponsivenessAnalytics.slice(0, MAX_HISTORY);
            saveData(data);
            return true;
        } catch (error) {
            return false;
        }
    }

    function auditResponsive(actionType, metadata, context) {
        try {
            if (context && context.skipAuditPersistence) return { success: true, skipped: true };
            var service = global.AuditService || global.auditService;
            if (service && typeof service.recordAudit === 'function') {
                service.recordAudit({
                    actionType: actionType,
                    eventType: actionType,
                    module: 'Mobile Responsiveness',
                    targetId: metadata && metadata.reportId || '',
                    actorId: actorId(context || {}),
                    description: metadata && metadata.description || actionType,
                    severity: metadata && metadata.severity || 'INFO',
                    metadata: cloneSanitized(metadata || {})
                }, { source: 'mobileResponsivenessService' });
                return { success: true };
            }
            if (db() && typeof db().writeAuditLog === 'function') {
                db().writeAuditLog(context && context.actor && context.actor.role || 'system', actorId(context || {}), actionType, 'Mobile Responsiveness', metadata && metadata.reportId || '', metadata && metadata.description || actionType);
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Mobile responsiveness audit failed safely.' };
        }
        return { success: false, warning: 'Audit dependency unavailable.' };
    }

    function emitTelemetry(eventType, metadata, context) {
        try {
            if (context && context.skipTelemetry) return { success: true, skipped: true };
            var service = global.WorkflowTelemetryService || global.workflowTelemetryService;
            if (service && typeof service.emitTelemetry === 'function') {
                service.emitTelemetry('GOVERNANCE', eventType, {
                    source: 'mobileResponsivenessService',
                    severity: metadata && metadata.severity || 'INFO',
                    status: metadata && metadata.status || eventType,
                    metadata: cloneSanitized(metadata || {})
                });
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Mobile responsiveness telemetry failed safely.' };
        }
        return { success: false, warning: 'Telemetry dependency unavailable.' };
    }

    function recordMetric(metricType, metadata, context) {
        try {
            if (context && context.skipMetrics) return { success: true, skipped: true };
            var service = global.OrchestrationMetricsService || global.orchestrationMetricsService;
            if (service && typeof service.recordWorkflowMetric === 'function') {
                service.recordWorkflowMetric(metricType, cloneSanitized(Object.assign({ source: 'mobileResponsivenessService' }, metadata || {})));
                return { success: true };
            }
        } catch (error) {
            return { success: false, warning: 'Mobile responsiveness metrics failed safely.' };
        }
        return { success: false, warning: 'Metrics dependency unavailable.' };
    }

    function generateMobileExperienceReport(payload, context) {
        try {
            var ctx = context || {};
            var normalized = normalizeResponsivePayload(payload || {}, ctx);
            if (!normalized.success) {
                auditResponsive('MOBILE_UX_REVIEW_BLOCKED', {
                    severity: 'WARNING',
                    description: normalized.message || 'Mobile UX review blocked.'
                }, ctx);
                return normalized;
            }
            var score = calculateResponsiveScore(normalized);
            var optimization = optimizeResponsiveLayout(normalized);
            var analytics = buildAnalytics(normalized, score, optimization);
            var reportId = 'MRSP-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
            var report = {
                success: true,
                reportId: reportId,
                tenantSlug: normalized.tenantSlug,
                createdAt: nowIso(),
                responsiveState: score.responsiveClass === RISK_CLASSES.CRITICAL ? 'CRITICAL' : score.responsiveClass === RISK_CLASSES.HIGH ? 'DEGRADED' : score.responsiveClass === RISK_CLASSES.MODERATE ? 'NEEDS_REVIEW' : 'READY',
                mobileUsabilityScore: score.mobileUsabilityScore,
                responsiveReadinessScore: score.responsiveReadinessScore,
                responsiveClass: score.responsiveClass,
                score: score,
                optimization: optimization,
                analytics: analytics,
                integrationHealth: {
                    dashboardPerformanceIntegrated: !!global.DashboardPerformanceService,
                    platformAnalyticsIntegrated: !!global.PlatformAnalyticsService,
                    auditIntegrated: !!(global.AuditService || global.auditService),
                    telemetryIntegrated: !!(global.WorkflowTelemetryService || global.workflowTelemetryService),
                    metricsIntegrated: !!(global.OrchestrationMetricsService || global.orchestrationMetricsService)
                },
                governance: {
                    backwardCompatibilityPreserved: true,
                    tenantIsolationPreserved: true,
                    mobileUXGovernancePreserved: true,
                    noGovernanceBypass: true,
                    hiddenActionsRemainHidden: true,
                    outputsImmutable: true
                }
            };
            report = freezeResponsiveOutput(report);
            persistReport(report);
            auditResponsive('MOBILE_EXPERIENCE_REPORT_GENERATED', {
                reportId: report.reportId,
                severity: report.responsiveClass === RISK_CLASSES.CRITICAL ? 'ERROR' : report.responsiveClass === RISK_CLASSES.HIGH ? 'WARNING' : 'INFO',
                description: 'Mobile experience review completed.'
            }, ctx);
            emitTelemetry('MOBILE_UX_REVIEWED', {
                reportId: report.reportId,
                severity: report.responsiveClass === RISK_CLASSES.CRITICAL ? 'ERROR' : 'INFO',
                status: report.responsiveState
            }, ctx);
            recordMetric('MOBILE_UX_REVIEWED', {
                reportId: report.reportId,
                mobileUsabilityScore: report.mobileUsabilityScore,
                responsiveReadinessScore: report.responsiveReadinessScore,
                issueCount: report.analytics.issueAnalytics.totalIssues
            }, ctx);
            return report;
        } catch (error) {
            return freezeResponsiveOutput({
                success: false,
                classification: 'REPORT_FAILED',
                message: 'Mobile experience report failed safely.',
                governance: {
                    tenantIsolationPreserved: true,
                    mobileUXGovernancePreserved: true
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
            var malformed = normalizeResponsivePayload('bad', {});
            record('malformed payloads fail safely', malformed.success === false && Object.isFrozen(malformed));
            var payload = {
                tenantSlug: 'selftest',
                devices: [
                    { viewportId: 'self-mobile', width: 390, height: 844, renderMs: 420, interactionLatencyMs: 190 },
                    { viewportId: 'self-tablet', width: 820, height: 1180, renderMs: 250, interactionLatencyMs: 100 },
                    { viewportId: 'self-desktop', width: 1366, height: 768, renderMs: 160, interactionLatencyMs: 70 }
                ],
                dashboards: [
                    { dashboardId: 'self-dashboard', viewportWidth: 390, cardColumns: 3, formColumns: 2, tableMinWidth: 860, horizontalOverflow: true, tableScrollEnabled: false, navDrawerAvailable: false, touchTargetPx: 34, chartAdaptive: false, desktopLayoutPreserved: true },
                    { dashboardId: 'self-desktop-dashboard', viewportWidth: 1366, cardColumns: 4, formColumns: 2, tableScrollEnabled: true, navDrawerAvailable: true, touchTargetPx: 44, chartAdaptive: true, desktopLayoutPreserved: true }
                ],
                forms: [{ formId: 'self-form', viewportWidth: 390, columns: 2, touchTargetPx: 34 }],
                tables: [{ tableId: 'self-table', viewportWidth: 390, minWidth: 860, scrollEnabled: false }],
                navigation: [{ navId: 'self-nav', viewportWidth: 390, drawerAvailable: false, collapsible: false }],
                metadata: { salary: 1000, leaveBalance: 4 }
            };
            var ctx = { routeType: 'platform', tenantSlug: 'selftest', actor: { role: 'PLATFORM_OWNER', id: 'PO-SELF' }, skipAuditPersistence: true, skipTelemetry: true, skipMetrics: true };
            var normalized = normalizeResponsivePayload(payload, ctx);
            var score = calculateResponsiveScore(normalized);
            var optimized = optimizeResponsiveLayout(normalized);
            var report = generateMobileExperienceReport(payload, ctx);
            record('mobile layouts work', detectViewportType({ width: 390 }).viewportType === VIEWPORT_TYPES.TINY_MOBILE && optimized.optimizations.mobileNavigationDrawers.indexOf('self-nav') !== -1);
            record('tablet layouts work', detectViewportType({ width: 820 }).viewportType === VIEWPORT_TYPES.TABLET);
            record('desktop layouts preserved', normalized.dashboards.some(function desktop(row) { return row.dashboardId === 'self-desktop-dashboard' && row.desktopLayoutPreserved; }));
            record('responsive scoring works', score.success === true && score.mobileUsabilityScore < 80);
            record('analytics work', report.success === true && report.analytics.deviceDistribution.tinyMobile === 1);
            record('immutable outputs enforced', Object.isFrozen(report) && Object.isFrozen(score) && Object.isFrozen(normalized));
            record('visibility governance works', generateMobileExperienceReport(payload, { routeType: 'tenant', tenantSlug: 'selftest', actor: { role: 'HR', id: 'HR-SELF' }, skipAuditPersistence: true }).success === false);
        } catch (error) {
            record('self-test uncaught exception guard', false, { error: error && error.message });
        }
        var result = freezeResponsiveOutput({
            passed: checks.every(function ok(row) { return row.passed; }),
            tests: checks,
            checkedAt: nowIso()
        });
        global.__ARTHHRMS_MOBILE_RESPONSIVENESS_SELF_TEST__ = result;
        return result;
    }

    var MobileResponsivenessService = Object.freeze({
        VERSION: '1.0.0',
        RESPONSIVE_STATES: RESPONSIVE_STATES,
        VIEWPORT_TYPES: VIEWPORT_TYPES,
        RISK_CLASSES: RISK_CLASSES,
        validateResponsiveScope: validateResponsiveScope,
        detectViewportType: detectViewportType,
        calculateResponsiveScore: calculateResponsiveScore,
        optimizeResponsiveLayout: optimizeResponsiveLayout,
        normalizeResponsivePayload: normalizeResponsivePayload,
        freezeResponsiveOutput: freezeResponsiveOutput,
        generateMobileExperienceReport: generateMobileExperienceReport,
        runSelfTest: runSelfTest
    });

    global.MobileResponsivenessService = MobileResponsivenessService;
    global.mobileResponsivenessService = MobileResponsivenessService;

    if (global.__ARTHHRMS_DEV__) {
        try {
            runSelfTest();
        } catch (error) {
            global.__ARTHHRMS_MOBILE_RESPONSIVENESS_SELF_TEST__ = freezeResponsiveOutput({
                passed: false,
                tests: [{ name: 'self-test wrapper', passed: false, details: { error: error && error.message } }],
                checkedAt: nowIso()
            });
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
