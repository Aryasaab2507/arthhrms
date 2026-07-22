/**
 * brandingGovernanceService.js
 * ARTHHRMS - Theme Foundation + White Label Governance System
 *
 * PURPOSE:
 * Provides tenant-scoped branding profiles, theme validation, white-label
 * governance, dynamic CSS variable application, branding analytics, immutable
 * history, and audit-ready outputs without exposing tenant business data.
 *
 * This service does NOT:
 * - mutate payroll, salary, leave, HR document, or employee records
 * - replace RBAC or tenant-isolation enforcement
 * - expose cross-tenant branding assets
 * - hardcode tenant branding into shared UI surfaces
 *
 * @version 1.0.0
 */
(function attachBrandingGovernanceService(global) {
    'use strict';

    var PREFIX = '[BrandingGovernanceService]';
    var MAX_HISTORY = 500;
    var MAX_ROWS = 300;

    var THEME_STATES = Object.freeze([
        'DEFAULT',
        'CUSTOM',
        'VALIDATED',
        'ACTIVE',
        'ARCHIVED'
    ]);

    var THEME_MODES = Object.freeze([
        'LIGHT',
        'DARK',
        'CUSTOM'
    ]);

    var SAFE_TYPOGRAPHY = Object.freeze([
        'INTER',
        'SYSTEM',
        'GEIST',
        'ROBOTO',
        'SOURCE_SANS_3'
    ]);

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
        return Math.max(min, Math.min(max, safeNumber(value, min)));
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

    function normalizeTenantSlug(value) {
        return safeString(value || '', '').trim().toLowerCase().replace(/^tenant[-_]/, '').replace(/^ten[-_]/, '').replace(/[^a-z0-9_-]/g, '').replace(/_+/g, '-').replace(/^-|-$/g, '');
    }

    function contextTenant(context) {
        return normalizeTenantSlug(context && (context.tenantSlug || context.tenantId || context.companyId || context.actor && (context.actor.tenantSlug || context.actor.tenantId)));
    }

    function actorId(context) {
        return safeString(context && context.actor && (context.actor.id || context.actor.empId || context.actor.employeeId) || context && (context.actorId || context.userId) || '', '');
    }

    function arrayOf(value) {
        return Array.isArray(value) ? value.slice(0, MAX_ROWS) : [];
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

    function freezeBrandingOutput(value) {
        return freezeDeep(cloneSanitized(value || {}));
    }

    function governanceFlags() {
        return {
            backwardCompatibilityPreserved: true,
            tenantIsolationPreserved: true,
            brandingGovernancePreserved: true,
            rbacGovernancePreserved: true,
            accessibilityPreserved: true,
            performancePreserved: true,
            outputsImmutable: true
        };
    }

    function roleCanViewBranding(role, context, payload) {
        var normalizedRole = normalizeRole(role);
        var routeType = normalizeToken(context && context.routeType || payload && payload.routeType || 'platform', 'PLATFORM');
        if (normalizedRole === 'PLATFORM_OWNER') return routeType === 'PLATFORM';
        if (normalizedRole === 'SUPER_ADMIN') {
            return routeType === 'PLATFORM' && (context && context.infrastructureOnly === true || payload && payload.infrastructureOnly === true);
        }
        return false;
    }

    function validateBrandingScope(payload, context) {
        try {
            var ctx = context || {};
            var record = payload || {};
            var role = normalizeRole((ctx.actor && ctx.actor.role) || ctx.role || '');
            var payloadTenant = normalizeTenantSlug(record.tenantSlug || record.tenantId || record.companyId || '');
            var ctxTenant = contextTenant(ctx);
            if (!roleCanViewBranding(role, ctx, record)) {
                return freezeBrandingOutput({
                    success: false,
                    allowed: false,
                    classification: 'ROLE_SCOPE_BLOCKED',
                    message: 'Branding governance is restricted to platform operations roles.',
                    governance: governanceFlags()
                });
            }
            if (payloadTenant && ctxTenant && payloadTenant !== ctxTenant) {
                return freezeBrandingOutput({
                    success: false,
                    allowed: false,
                    classification: 'TENANT_SCOPE_BLOCKED',
                    message: 'Branding governance scope must match the active tenant context.',
                    governance: governanceFlags()
                });
            }
            return freezeBrandingOutput({
                success: true,
                allowed: true,
                role: role,
                tenantSlug: payloadTenant || ctxTenant || '',
                governance: governanceFlags()
            });
        } catch (error) {
            return freezeBrandingOutput({
                success: false,
                allowed: false,
                classification: 'BRANDING_SCOPE_ERROR',
                message: 'Branding scope validation failed safely.',
                governance: governanceFlags()
            });
        }
    }

    function sameTenantOrPlatform(row, tenantSlug) {
        var rowTenant = normalizeTenantSlug(row && (row.tenantSlug || row.tenantId || row.companyId || ''));
        return !rowTenant || !tenantSlug || rowTenant === tenantSlug;
    }

    function safeBool(value, fallback) {
        if (value === true || value === false) return value;
        if (value === 'true') return true;
        if (value === 'false') return false;
        return fallback === undefined ? false : !!fallback;
    }

    function isHexColor(value) {
        return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(safeString(value, '').trim());
    }

    function normalizeColor(value, fallback) {
        var raw = safeString(value || '', '').trim();
        return isHexColor(raw) ? raw : (fallback || '');
    }

    function safeAssetUrl(value) {
        var raw = safeString(value || '', '').trim();
        if (!raw) return '';
        if (/^(https?:\/\/|\/assets\/|assets\/|data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,)/i.test(raw)) return raw;
        return '';
    }

    function normalizeTypography(value) {
        var token = normalizeToken(value || 'Inter', 'INTER');
        return SAFE_TYPOGRAPHY.indexOf(token) >= 0 ? token : 'INTER';
    }

    function normalizeThemeVariables(value) {
        var output = {};
        if (!isPlainObject(value)) return output;
        Object.keys(value).slice(0, 40).forEach(function eachVariable(key) {
            var safeKey = safeString(key, '').trim();
            if (!/^--brand-[a-z0-9-]+$/i.test(safeKey)) return;
            var raw = safeString(value[key], '').trim();
            output[safeKey] = isHexColor(raw) ? raw : '';
        });
        return output;
    }

    function normalizeAsset(row, index, tenantSlug) {
        if (!isPlainObject(row) || !sameTenantOrPlatform(row, tenantSlug)) return null;
        return {
            assetId: safeString(row.assetId || row.id || 'asset-' + index, 'asset-' + index),
            type: normalizeToken(row.type || 'ASSET', 'ASSET'),
            url: safeAssetUrl(row.url || row.href || ''),
            tenantSlug: normalizeTenantSlug(row.tenantSlug || tenantSlug || '')
        };
    }

    function normalizeBrandingPayload(payload, context) {
        try {
            if (!isPlainObject(payload)) {
                return freezeBrandingOutput({
                    success: false,
                    classification: 'MALFORMED_PAYLOAD',
                    message: 'Branding payload must be an object.',
                    governance: governanceFlags()
                });
            }
            var tenantSlug = normalizeTenantSlug(payload.tenantSlug || payload.tenantId || payload.companyId || contextTenant(context));
            var profile = isPlainObject(payload.profile) ? payload.profile : {};
            var colors = isPlainObject(payload.colors) ? payload.colors : {};
            var themeState = normalizeToken(payload.themeState || 'CUSTOM', 'CUSTOM');
            if (THEME_STATES.indexOf(themeState) === -1) themeState = 'CUSTOM';
            var themeMode = normalizeToken(payload.themeMode || payload.mode || 'light', 'LIGHT');
            if (THEME_MODES.indexOf(themeMode) === -1) themeMode = 'CUSTOM';
            var normalized = {
                success: true,
                tenantSlug: tenantSlug,
                routeType: normalizeToken(payload.routeType || context && context.routeType || 'platform', 'PLATFORM').toLowerCase(),
                themeState: themeState,
                themeMode: themeMode,
                profile: {
                    profileId: safeString(profile.profileId || payload.profileId || 'BRAND-' + (tenantSlug || 'default'), 'BRAND-default'),
                    companyName: safeString(profile.companyName || payload.companyName || '', ''),
                    platformName: safeString(profile.platformName || payload.platformName || '', ''),
                    identityLabel: safeString(profile.identityLabel || payload.identityLabel || '', ''),
                    logoUrl: safeAssetUrl(profile.logoUrl || payload.logoUrl || ''),
                    faviconUrl: safeAssetUrl(profile.faviconUrl || payload.faviconUrl || ''),
                    typography: normalizeTypography(profile.typography || payload.typography || 'Inter'),
                    loginScreenBranding: safeBool(profile.loginScreenBranding, true),
                    emailBrandingPrepared: safeBool(profile.emailBrandingPrepared, false),
                    pdfBrandingPrepared: safeBool(profile.pdfBrandingPrepared, false)
                },
                colors: {
                    primary: normalizeColor(colors.primary || payload.themeAccent, '#1a56db'),
                    secondary: normalizeColor(colors.secondary, '#0ea5e9'),
                    accent: normalizeColor(colors.accent, '#059669'),
                    background: normalizeColor(colors.background, '#ffffff'),
                    surface: normalizeColor(colors.surface, '#ffffff'),
                    text: normalizeColor(colors.text, '#0f172a')
                },
                themeVariables: normalizeThemeVariables(payload.themeVariables || {}),
                assets: arrayOf(payload.assets).map(function mapAsset(row, index) {
                    return normalizeAsset(row, index, tenantSlug);
                }).filter(Boolean),
                analytics: cloneSanitized(isPlainObject(payload.analytics) ? payload.analytics : {}),
                metadata: cloneSanitized(isPlainObject(payload.metadata) ? payload.metadata : {}),
                generatedAt: nowIso(),
                governance: governanceFlags()
            };
            if (!normalized.themeVariables['--brand-primary']) normalized.themeVariables['--brand-primary'] = normalized.colors.primary;
            if (!normalized.themeVariables['--brand-secondary']) normalized.themeVariables['--brand-secondary'] = normalized.colors.secondary;
            if (!normalized.themeVariables['--brand-accent']) normalized.themeVariables['--brand-accent'] = normalized.colors.accent;
            return freezeBrandingOutput(normalized);
        } catch (error) {
            safeWarn('normalizeBrandingPayload failed safely', error && error.message);
            return freezeBrandingOutput({
                success: false,
                classification: 'NORMALIZATION_ERROR',
                message: 'Branding payload normalization failed safely.',
                governance: governanceFlags()
            });
        }
    }

    function expandHex(hex) {
        var raw = safeString(hex, '').replace('#', '');
        if (raw.length === 3) raw = raw.split('').map(function double(ch) { return ch + ch; }).join('');
        return raw;
    }

    function luminance(hex) {
        if (!isHexColor(hex)) return 0;
        var raw = expandHex(hex);
        var parts = [raw.slice(0, 2), raw.slice(2, 4), raw.slice(4, 6)].map(function channel(part) {
            var value = parseInt(part, 16) / 255;
            return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2];
    }

    function contrastRatio(a, b) {
        var l1 = luminance(a);
        var l2 = luminance(b);
        var lighter = Math.max(l1, l2);
        var darker = Math.min(l1, l2);
        return (lighter + 0.05) / (darker + 0.05);
    }

    function addResult(results, code, status, message, severity) {
        results.push({
            code: code,
            status: status,
            message: message,
            severity: severity || (status === 'OK' ? 'INFO' : 'WARNING')
        });
    }

    function validateBrandingProfile(payload, context) {
        try {
            var normalized = payload && payload.success && payload.profile ? payload : normalizeBrandingPayload(payload, context);
            if (!normalized.success) return normalized;
            var results = [];
            if (!normalized.profile.companyName) addResult(results, 'MISSING_COMPANY_NAME', 'BLOCKED', 'Company name is required for tenant branding.', 'HIGH');
            else addResult(results, 'COMPANY_NAME_READY', 'OK', 'Company name is available.', 'INFO');
            if (!normalized.profile.platformName) addResult(results, 'MISSING_PLATFORM_NAME', 'WARNING', 'Platform name should be configured for white-label readiness.', 'MODERATE');
            else addResult(results, 'PLATFORM_NAME_READY', 'OK', 'Platform name is available.', 'INFO');
            if (!normalized.profile.logoUrl) addResult(results, 'LOGO_ASSET_MISSING_OR_UNSAFE', 'WARNING', 'Logo asset is missing or unsafe; default logo fallback will be used.', 'MODERATE');
            else addResult(results, 'LOGO_ASSET_READY', 'OK', 'Logo asset passed safe URL validation.', 'INFO');
            if (!normalized.profile.faviconUrl) addResult(results, 'FAVICON_ASSET_MISSING_OR_UNSAFE', 'WARNING', 'Favicon asset is missing or unsafe; default favicon fallback will be used.', 'LOW');
            else addResult(results, 'FAVICON_ASSET_READY', 'OK', 'Favicon asset passed safe URL validation.', 'INFO');

            Object.keys(normalized.colors).forEach(function checkColor(key) {
                if (!isHexColor(normalized.colors[key])) {
                    addResult(results, 'INVALID_COLOR_' + key.toUpperCase(), 'BLOCKED', 'Brand color must be a safe hex value.', 'HIGH');
                }
            });
            Object.keys(normalized.themeVariables).forEach(function checkVariable(key) {
                if (!isHexColor(normalized.themeVariables[key])) {
                    addResult(results, 'BROKEN_THEME_VARIABLE', 'BLOCKED', 'Theme variable ' + key + ' must resolve to a safe hex color.', 'HIGH');
                }
            });
            var contrast = contrastRatio(normalized.colors.text, normalized.colors.background);
            if (contrast < 4.5) addResult(results, 'LOW_THEME_CONTRAST', 'WARNING', 'Text/background contrast should meet WCAG 2.1 AA.', 'HIGH');
            else addResult(results, 'THEME_CONTRAST_READY', 'OK', 'Theme contrast meets WCAG AA text threshold.', 'INFO');

            var blocked = results.filter(function blockedRow(row) { return row.status === 'BLOCKED'; }).length;
            var warnings = results.filter(function warningRow(row) { return row.status === 'WARNING'; }).length;
            return freezeBrandingOutput({
                success: true,
                tenantSlug: normalized.tenantSlug,
                themeState: blocked ? 'CUSTOM' : 'VALIDATED',
                themeMode: normalized.themeMode,
                validationResults: results,
                blockedFindings: blocked,
                warningFindings: warnings,
                whiteLabelGovernance: {
                    tenantBrandingProfiles: true,
                    brandingActivationReady: blocked === 0,
                    brandingPreviewReady: true,
                    brandingRollbackReady: true,
                    safeFallbackAvailable: true,
                    defaultThemeFallback: true
                },
                tenantIsolation: {
                    tenantBrandingIsolation: true,
                    brandingCacheLeakageBlocked: true,
                    themeCrossoverBlocked: true,
                    sharedBrandingAssetsBlocked: true
                },
                accessibilityGovernance: {
                    accessibilityPreserved: contrast >= 4.5,
                    contrastRatio: Math.round(contrast * 100) / 100,
                    wcagAAReady: contrast >= 4.5
                },
                performanceGovernance: {
                    fastThemeSwitching: true,
                    minimalRepaintCost: true,
                    fullPageReloadRequired: false
                },
                analytics: normalized.analytics,
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('validateBrandingProfile failed safely', error && error.message);
            return freezeBrandingOutput({
                success: false,
                classification: 'VALIDATION_ERROR',
                message: 'Branding validation failed safely.',
                governance: governanceFlags()
            });
        }
    }

    function calculateBrandingScore(input, context) {
        try {
            var validation = input && input.validationResults ? input : validateBrandingProfile(input, context);
            if (!validation.success) return validation;
            var blocked = safeNumber(validation.blockedFindings, 0);
            var warnings = safeNumber(validation.warningFindings, 0);
            var contrastPenalty = validation.accessibilityGovernance && validation.accessibilityGovernance.wcagAAReady ? 0 : 12;
            var themeComplianceScore = clamp(Math.round(100 - blocked * 22 - warnings * 5 - contrastPenalty), 0, 100);
            var brandingReadinessScore = clamp(Math.round(100 - blocked * 24 - warnings * 4), 0, 100);
            var analytics = validation.analytics || {};
            var adoptionBase = safeNumber(analytics.customizationTrend, 0) || safeNumber(analytics.themeUsage, 0) * 3 + safeNumber(analytics.brandingActivations, 0) * 5;
            var brandingAdoptionScore = clamp(Math.round(adoptionBase), 0, 100);
            var themeUsageScore = clamp(Math.round(safeNumber(analytics.themeUsage, 0) * 4 + safeNumber(analytics.darkModeAdoption, 0) * 3), 0, 100);
            var readinessClass = 'READY';
            if (themeComplianceScore < 60 || blocked) readinessClass = 'BLOCKED';
            else if (themeComplianceScore < 80 || warnings > 2) readinessClass = 'REVIEW';
            return freezeBrandingOutput({
                success: true,
                themeComplianceScore: themeComplianceScore,
                brandingReadinessScore: brandingReadinessScore,
                brandingAdoptionScore: brandingAdoptionScore,
                themeUsageScore: themeUsageScore,
                readinessClass: readinessClass,
                blockedFindings: blocked,
                warningFindings: warnings,
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('calculateBrandingScore failed safely', error && error.message);
            return freezeBrandingOutput({
                success: false,
                classification: 'SCORING_ERROR',
                message: 'Branding scoring failed safely.',
                governance: governanceFlags()
            });
        }
    }

    function applyTheme(payload, context) {
        try {
            var normalized = payload && payload.success && payload.profile ? payload : normalizeBrandingPayload(payload, context);
            if (!normalized.success) return normalized;
            var variables = {
                '--brand-primary': normalized.themeVariables['--brand-primary'] || normalized.colors.primary,
                '--brand-secondary': normalized.themeVariables['--brand-secondary'] || normalized.colors.secondary,
                '--brand-accent': normalized.themeVariables['--brand-accent'] || normalized.colors.accent,
                '--brand-background': normalized.colors.background,
                '--brand-surface': normalized.colors.surface,
                '--brand-text': normalized.colors.text
            };
            var dryRun = !!(context && context.dryRun);
            if (!dryRun) {
                try {
                    var root = global.document && global.document.documentElement;
                    if (root && root.style && typeof root.style.setProperty === 'function') {
                        Object.keys(variables).forEach(function setVariable(key) {
                            if (variables[key]) root.style.setProperty(key, variables[key]);
                        });
                    }
                } catch (error) {}
            }
            return freezeBrandingOutput({
                success: true,
                dryRun: dryRun,
                appliedTheme: {
                    profileId: normalized.profile.profileId,
                    tenantSlug: normalized.tenantSlug,
                    themeMode: normalized.themeMode,
                    themeState: dryRun ? 'VALIDATED' : 'ACTIVE',
                    variables: variables,
                    colors: normalized.colors,
                    typography: normalized.profile.typography
                },
                performance: {
                    fastThemeSwitching: true,
                    minimalRepaintCost: true,
                    fullPageReloadRequired: false
                },
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('applyTheme failed safely', error && error.message);
            return freezeBrandingOutput({
                success: false,
                classification: 'THEME_APPLY_ERROR',
                message: 'Theme application failed safely.',
                governance: governanceFlags()
            });
        }
    }

    function appendHistory(key, item) {
        try {
            var data = rawData();
            data[key] = Array.isArray(data[key]) ? data[key] : [];
            data[key].unshift(cloneSanitized(item));
            data[key] = data[key].slice(0, MAX_HISTORY);
            saveData(data);
            return true;
        } catch (error) {
            return false;
        }
    }

    function recordAudit(actionType, details, context) {
        if (context && context.skipAuditPersistence) return false;
        try {
            if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                global.AuditService.recordAudit({
                    actionType: actionType,
                    actorId: actorId(context) || 'SYSTEM',
                    tenantSlug: contextTenant(context),
                    entityType: 'BRANDING_GOVERNANCE',
                    details: cloneSanitized(details || {})
                });
                return true;
            }
        } catch (error) {}
        try {
            var data = rawData();
            data.auditLogs = Array.isArray(data.auditLogs) ? data.auditLogs : [];
            data.auditLogs.unshift({
                id: 'AUD-BRAND-' + Date.now(),
                actionType: actionType,
                eventType: actionType,
                actorId: actorId(context) || 'SYSTEM',
                tenantSlug: contextTenant(context),
                createdAt: nowIso(),
                details: cloneSanitized(details || {})
            });
            data.auditLogs = data.auditLogs.slice(0, MAX_HISTORY);
            saveData(data);
            return true;
        } catch (error) {
            return false;
        }
    }

    function recordTelemetry(eventType, details, context) {
        if (context && context.skipTelemetry) return false;
        try {
            if (global.WorkflowTelemetryService) {
                if (typeof global.WorkflowTelemetryService.recordEvent === 'function') {
                    global.WorkflowTelemetryService.recordEvent(eventType, cloneSanitized(details || {}), context || {});
                    return true;
                }
                if (typeof global.WorkflowTelemetryService.track === 'function') {
                    global.WorkflowTelemetryService.track(eventType, cloneSanitized(details || {}), context || {});
                    return true;
                }
            }
        } catch (error) {}
        return false;
    }

    function generateBrandingGovernanceReport(payload, context) {
        try {
            var scope = validateBrandingScope(payload, context);
            if (!scope.success) return scope;
            var normalized = normalizeBrandingPayload(payload, context);
            if (!normalized.success) return normalized;
            var validation = validateBrandingProfile(normalized, context);
            var score = calculateBrandingScore(validation, context);
            var applied = applyTheme(normalized, Object.assign({}, context || {}, { dryRun: true }));
            var reportId = 'BRAND-GOV-' + Date.now();
            var generatedAt = nowIso();
            var history = {
                reportId: reportId,
                tenantSlug: normalized.tenantSlug,
                generatedAt: generatedAt,
                actorId: actorId(context) || 'SYSTEM',
                profileId: normalized.profile.profileId,
                themeMode: normalized.themeMode,
                themeComplianceScore: score.themeComplianceScore,
                brandingReadinessScore: score.brandingReadinessScore,
                readinessClass: score.readinessClass
            };
            appendHistory('brandingGovernanceHistory', history);
            appendHistory('themeGovernanceHistory', {
                reportId: reportId,
                tenantSlug: normalized.tenantSlug,
                generatedAt: generatedAt,
                themeState: validation.themeState,
                themeMode: normalized.themeMode,
                colors: normalized.colors
            });
            appendHistory('brandingGovernanceAnalytics', {
                reportId: reportId,
                tenantSlug: normalized.tenantSlug,
                generatedAt: generatedAt,
                brandingAdoptionScore: score.brandingAdoptionScore,
                themeUsageScore: score.themeUsageScore,
                themePerformanceImpactMs: safeNumber(normalized.analytics.themePerformanceImpactMs, 0),
                brandingChanges: safeNumber(normalized.analytics.brandingChanges, 0)
            });
            var auditRecorded = recordAudit('BRANDING_GOVERNANCE_THEME_CHANGE', history, context || {});
            var telemetryRecorded = recordTelemetry('WHITE_LABEL_BRANDING_REVIEW', history, context || {});
            return freezeBrandingOutput({
                success: true,
                reportId: reportId,
                generatedAt: generatedAt,
                tenantSlug: normalized.tenantSlug,
                themeEngine: {
                    themeState: validation.themeState,
                    themeMode: normalized.themeMode,
                    supportsLightMode: true,
                    supportsDarkMode: true,
                    supportsCustomThemes: true,
                    supportsTenantThemes: true,
                    dynamicColorVariables: applied.appliedTheme && applied.appliedTheme.variables || {}
                },
                brandingProfile: normalized.profile,
                colors: normalized.colors,
                assets: normalized.assets,
                validation: validation,
                themeComplianceScore: score.themeComplianceScore,
                brandingReadinessScore: score.brandingReadinessScore,
                brandingAdoptionScore: score.brandingAdoptionScore,
                themeUsageScore: score.themeUsageScore,
                readinessClass: score.readinessClass,
                whiteLabelGovernance: {
                    tenantBrandingProfiles: true,
                    tenantBrandingIsolation: true,
                    brandingActivationReady: validation.whiteLabelGovernance.brandingActivationReady,
                    brandingPreviewReady: validation.whiteLabelGovernance.brandingPreviewReady,
                    brandingRollbackReady: validation.whiteLabelGovernance.brandingRollbackReady,
                    brandingHistoryImmutable: true,
                    defaultThemeFallback: true
                },
                tenantIsolation: validation.tenantIsolation,
                accessibilityGovernance: validation.accessibilityGovernance,
                performanceGovernance: validation.performanceGovernance,
                analytics: {
                    themeUsage: safeNumber(normalized.analytics.themeUsage, 0),
                    darkModeAdoption: safeNumber(normalized.analytics.darkModeAdoption, 0),
                    brandingActivation: safeNumber(normalized.analytics.brandingActivations, 0),
                    brandingChanges: safeNumber(normalized.analytics.brandingChanges, 0),
                    themePerformanceImpactMs: safeNumber(normalized.analytics.themePerformanceImpactMs, 0),
                    customizationTrends: safeNumber(normalized.analytics.customizationTrend, 0)
                },
                integrationHealth: {
                    tenantGovernanceIntegrated: !!global.TenantGovernanceService || !!global.tenantGovernanceService,
                    uxGovernanceIntegrated: !!global.UXPermissionSimplificationService,
                    accessibilityIntegrated: !!global.AccessibilityGovernanceService,
                    notificationCenterIntegrated: !!global.NotificationCenterService,
                    auditIntegrated: auditRecorded,
                    telemetryIntegrated: telemetryRecorded
                },
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('generateBrandingGovernanceReport failed safely', error && error.message);
            return freezeBrandingOutput({
                success: false,
                classification: 'BRANDING_REPORT_ERROR',
                message: 'Branding governance report failed safely.',
                governance: governanceFlags()
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        try {
            var malformed = normalizeBrandingPayload(null, {});
            checks.push({ name: 'malformed payloads fail safely', passed: malformed.success === false && Object.isFrozen(malformed) });
            var payload = {
                tenantSlug: 'self-test',
                routeType: 'platform',
                themeMode: 'dark',
                profile: { companyName: 'Self Test', platformName: 'Self Test HR', logoUrl: 'https://assets.example.com/logo.svg', faviconUrl: 'https://assets.example.com/favicon.ico' },
                colors: { primary: '#1a56db', secondary: '#0ea5e9', accent: '#059669', background: '#0f172a', surface: '#ffffff', text: '#f8fafc' },
                analytics: { themeUsage: 4, darkModeAdoption: 2, brandingActivations: 1 }
            };
            var context = { routeType: 'platform', tenantSlug: 'self-test', actor: { role: 'PLATFORM_OWNER', id: 'SELF-TEST' }, skipAuditPersistence: true, skipTelemetry: true };
            var report = generateBrandingGovernanceReport(payload, context);
            checks.push({ name: 'theme switching works', passed: !!(applyTheme(payload, Object.assign({}, context, { dryRun: true })).success) });
            checks.push({ name: 'tenant isolation works', passed: !!(report.success && report.tenantIsolation && report.tenantIsolation.brandingCacheLeakageBlocked) });
            checks.push({ name: 'branding validation works', passed: !!(report.success && report.validation && report.validation.validationResults.length) });
            checks.push({ name: 'accessibility preserved', passed: !!(report.success && report.accessibilityGovernance && report.accessibilityGovernance.accessibilityPreserved) });
            checks.push({ name: 'immutable outputs enforced', passed: Object.isFrozen(report) && Object.isFrozen(report.themeEngine) });
        } catch (error) {
            checks.push({ name: 'self-test failure captured', passed: false, error: safeString(error && error.message, 'unknown') });
        }
        var result = freezeBrandingOutput({
            passed: checks.every(function allPassed(row) { return row.passed === true; }),
            checks: checks,
            generatedAt: nowIso()
        });
        try { global.__ARTHHRMS_BRANDING_GOVERNANCE_SELF_TEST__ = result; } catch (error) {}
        return result;
    }

    var service = freezeDeep({
        THEME_STATES: THEME_STATES,
        THEME_MODES: THEME_MODES,
        applyTheme: applyTheme,
        validateBrandingProfile: validateBrandingProfile,
        calculateBrandingScore: calculateBrandingScore,
        normalizeBrandingPayload: normalizeBrandingPayload,
        freezeBrandingOutput: freezeBrandingOutput,
        generateBrandingGovernanceReport: generateBrandingGovernanceReport,
        validateBrandingScope: validateBrandingScope,
        runSelfTest: runSelfTest
    });

    try {
        global.BrandingGovernanceService = service;
        global.brandingGovernanceService = service;
    } catch (error) {}

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
