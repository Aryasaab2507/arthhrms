/**
 * userPreferenceService.js
 * ARTHHRMS - User Preference Persistence + Personalized Enterprise Experience Framework
 *
 * PURPOSE:
 * Provides tenant-scoped, user-scoped preference persistence for theme,
 * dashboard, notification, navigation, accessibility, search, and display
 * preferences while preserving RBAC authority and tenant isolation.
 *
 * This service does NOT:
 * - expose another user's preferences
 * - change RBAC permissions or tenant isolation
 * - persist salary, leave balance, payroll, HR documents, tokens, or raw payloads
 * - mutate existing tenant business workflows
 *
 * @version 1.0.0
 */
(function attachUserPreferenceService(global) {
    'use strict';

    var PREFIX = '[UserPreferenceService]';
    var MAX_HISTORY = 500;
    var MAX_ROWS = 300;

    var PREFERENCE_STATES = Object.freeze([
        'DEFAULT',
        'CUSTOMIZED',
        'ACTIVE',
        'RESET',
        'ARCHIVED'
    ]);

    var THEME_MODES = Object.freeze([
        'DEFAULT',
        'LIGHT',
        'DARK',
        'CUSTOM',
        'SYSTEM'
    ]);

    var DISPLAY_DENSITIES = Object.freeze([
        'COMPACT',
        'COMFORTABLE',
        'SPACIOUS'
    ]);

    var NOTIFICATION_CHANNELS = Object.freeze([
        'IN_APP',
        'EMAIL',
        'SMS',
        'PUSH'
    ]);

    var SENSITIVE_KEY_PATTERN = /(salary|payroll.?amount|payrollAmount|payslip|compensation|ctc|leave.?balance|leaveBalance|gross|net|basic|hra|pf|tds|allowance|deduction|password|secret|token|jwt|authorization|service.?role|private.?key|bank|tax|raw.?payload|raw.?content|raw.?body|raw.?document|payload|content|body|signed.?url|download.?url|storage.?path|file.?path|document|employeeRecord|confidential|privateNote|rawPayload|confidentialEmployeeRecord)/i;
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

    function normalizeTenantSlug(value) {
        return safeString(value || '', '').trim().toLowerCase().replace(/^tenant[-_]/, '').replace(/^ten[-_]/, '').replace(/[^a-z0-9_-]/g, '').replace(/_+/g, '-').replace(/^-|-$/g, '');
    }

    function contextTenant(context) {
        return normalizeTenantSlug(context && (context.tenantSlug || context.tenantId || context.companyId || context.actor && (context.actor.tenantSlug || context.actor.tenantId || context.actor.companyId)));
    }

    function actorId(context) {
        return safeString(context && context.actor && (context.actor.id || context.actor.userId || context.actor.empId || context.actor.employeeId || context.actor.email) || context && (context.actorId || context.userId || context.employeeId) || '', '');
    }

    function preferenceUserId(payload, context) {
        var record = payload || {};
        return safeString(record.userId || record.employeeId || record.actorId || context && (context.userId || context.actorId || context.employeeId) || actorId(context), '').trim();
    }

    function arrayOf(value, max) {
        return Array.isArray(value) ? value.slice(0, max || MAX_ROWS) : [];
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

    function freezePreferenceOutput(value) {
        return freezeDeep(cloneSanitized(value || {}));
    }

    function governanceFlags() {
        return {
            backwardCompatibilityPreserved: true,
            tenantIsolationPreserved: true,
            userPreferenceGovernancePreserved: true,
            rbacGovernancePreserved: true,
            personalPreferencesOnly: true,
            personalizationNeverChangesPermissions: true,
            personalizationNeverChangesRBAC: true,
            outputsImmutable: true
        };
    }

    function integrationHealth(context) {
        return {
            themeIntegrated: !!(global.ThemeEngineService || global.BrandingGovernanceService || global.brandingGovernanceService),
            accessibilityIntegrated: !!(global.AccessibilityService || global.AccessibilityGovernanceService || global.accessibilityGovernanceService),
            notificationCenterIntegrated: !!(global.NotificationCenterService || global.notificationCenterService),
            smartSearchIntegrated: !!(global.SmartSearchService || global.smartSearchService),
            uxGovernanceIntegrated: !!(global.UXGovernanceService || global.UXPermissionSimplificationService || global.uxPermissionSimplificationService),
            auditIntegrated: !!global.AuditService && !(context && context.skipAuditPersistence),
            telemetryIntegrated: !!global.WorkflowTelemetryService && !(context && context.skipTelemetry)
        };
    }

    function defaultPreferences() {
        return {
            theme: {
                mode: 'DEFAULT',
                selectedTheme: 'default',
                accentColor: '#1a56db'
            },
            dashboard: {
                layout: 'STANDARD',
                widgets: ['overview', 'notifications'],
                hiddenWidgets: [],
                defaultRoute: 'dashboard'
            },
            notifications: {
                channels: ['IN_APP'],
                digestFrequency: 'IMMEDIATE',
                quietHours: { start: '', end: '' },
                mutedCategories: []
            },
            navigation: {
                shortcuts: [],
                pinnedModules: []
            },
            accessibility: {
                reducedMotion: false,
                highContrast: false,
                fontScale: 1,
                keyboardMode: false
            },
            search: {
                savedSearches: [],
                defaultScope: 'GLOBAL'
            },
            display: {
                density: 'COMFORTABLE',
                language: 'en-IN',
                timezone: 'Asia/Kolkata'
            }
        };
    }

    function validatePreferenceScope(payload, context) {
        try {
            var tenant = normalizeTenantSlug(payload && (payload.tenantSlug || payload.tenantId || payload.companyId) || '');
            var ctxTenant = contextTenant(context || {});
            var targetUser = preferenceUserId(payload || {}, context || {});
            var actor = actorId(context || {});

            if (!targetUser) {
                return freezePreferenceOutput({
                    success: false,
                    allowed: false,
                    classification: 'USER_SCOPE_BLOCKED',
                    message: 'A preference user scope is required.',
                    governance: governanceFlags()
                });
            }

            if (actor && targetUser && String(actor).toLowerCase() !== String(targetUser).toLowerCase()) {
                return freezePreferenceOutput({
                    success: false,
                    allowed: false,
                    classification: 'USER_SCOPE_BLOCKED',
                    message: 'Users may only access their own preference records.',
                    requestedUserId: targetUser,
                    actorId: actor,
                    governance: governanceFlags()
                });
            }

            if (tenant && ctxTenant && tenant !== ctxTenant) {
                return freezePreferenceOutput({
                    success: false,
                    allowed: false,
                    classification: 'TENANT_SCOPE_BLOCKED',
                    message: 'Cross-tenant preference access is blocked.',
                    tenantSlug: tenant,
                    contextTenant: ctxTenant,
                    governance: governanceFlags()
                });
            }

            return freezePreferenceOutput({
                success: true,
                allowed: true,
                userId: targetUser,
                tenantSlug: tenant || ctxTenant,
                actorId: actor || targetUser,
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('validatePreferenceScope failed safely', error && error.message);
            return freezePreferenceOutput({
                success: false,
                allowed: false,
                classification: 'PREFERENCE_SCOPE_ERROR',
                message: 'Preference scope validation failed safely.',
                governance: governanceFlags()
            });
        }
    }

    function safeList(value, max) {
        return arrayOf(value, max || 30).map(function normalizeItem(item) {
            return safeString(item, '').trim().replace(/[<>]/g, '').slice(0, 80);
        }).filter(Boolean);
    }

    function normalizeHex(value, fallback, warnings, label) {
        var color = safeString(value || '', '').trim();
        if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
        if (value !== undefined && value !== null && warnings) warnings.push(label + ' defaulted because the supplied color was invalid.');
        return fallback;
    }

    function normalizeTheme(input, warnings) {
        var base = defaultPreferences().theme;
        var theme = isPlainObject(input) ? input : {};
        var mode = normalizeToken(theme.mode || theme.themeMode, base.mode);
        if (THEME_MODES.indexOf(mode) === -1) {
            warnings.push('Theme mode defaulted because the supplied mode was invalid.');
            mode = 'DEFAULT';
        }
        return {
            mode: mode,
            selectedTheme: safeString(theme.selectedTheme || theme.themeId || base.selectedTheme, base.selectedTheme).replace(/[<>]/g, '').slice(0, 80),
            accentColor: normalizeHex(theme.accentColor, base.accentColor, warnings, 'Theme accent color')
        };
    }

    function normalizeDashboard(input) {
        var base = defaultPreferences().dashboard;
        var dashboard = isPlainObject(input) ? input : {};
        return {
            layout: normalizeToken(dashboard.layout, base.layout),
            widgets: safeList(Array.isArray(dashboard.widgets) ? dashboard.widgets : base.widgets, 40),
            hiddenWidgets: safeList(dashboard.hiddenWidgets, 40),
            defaultRoute: safeString(dashboard.defaultRoute || base.defaultRoute, base.defaultRoute).replace(/[^a-zA-Z0-9/_-]/g, '').slice(0, 80) || base.defaultRoute
        };
    }

    function normalizeNotifications(input, warnings) {
        var base = defaultPreferences().notifications;
        var notifications = isPlainObject(input) ? input : {};
        var channels = safeList(Array.isArray(notifications.channels) ? notifications.channels : base.channels, 10).map(function channelName(channel) {
            return normalizeToken(channel, '');
        }).filter(function allowedChannel(channel) {
            return NOTIFICATION_CHANNELS.indexOf(channel) !== -1;
        });
        if (Array.isArray(notifications.channels) && channels.length !== notifications.channels.length) {
            warnings.push('Notification channels were filtered to supported delivery channels.');
        }
        if (!channels.length) channels = base.channels.slice();
        var digest = normalizeToken(notifications.digestFrequency, base.digestFrequency);
        if (['IMMEDIATE', 'DAILY', 'WEEKLY', 'NEVER'].indexOf(digest) === -1) {
            warnings.push('Notification digest frequency defaulted because the supplied value was invalid.');
            digest = base.digestFrequency;
        }
        var quiet = isPlainObject(notifications.quietHours) ? notifications.quietHours : {};
        return {
            channels: channels,
            digestFrequency: digest,
            quietHours: {
                start: /^([01]\d|2[0-3]):[0-5]\d$/.test(safeString(quiet.start, '')) ? quiet.start : base.quietHours.start,
                end: /^([01]\d|2[0-3]):[0-5]\d$/.test(safeString(quiet.end, '')) ? quiet.end : base.quietHours.end
            },
            mutedCategories: safeList(notifications.mutedCategories, 20).map(function categoryName(category) {
                return normalizeToken(category, '');
            }).filter(Boolean)
        };
    }

    function normalizeNavigation(input) {
        var navigation = isPlainObject(input) ? input : {};
        return {
            shortcuts: safeList(navigation.shortcuts, 30),
            pinnedModules: safeList(navigation.pinnedModules || navigation.collapsedGroups, 30)
        };
    }

    function normalizeAccessibility(input, warnings) {
        var base = defaultPreferences().accessibility;
        var accessibility = isPlainObject(input) ? input : {};
        var rawScale = safeNumber(accessibility.fontScale, base.fontScale);
        var fontScale = clamp(rawScale, 0.85, 1.4);
        if (rawScale !== fontScale) warnings.push('Accessibility font scale was clamped to the supported range.');
        return {
            reducedMotion: accessibility.reducedMotion === true,
            highContrast: accessibility.highContrast === true,
            fontScale: Number(fontScale.toFixed(2)),
            keyboardMode: accessibility.keyboardMode === true || accessibility.keyboardFirst === true
        };
    }

    function normalizeSearch(input) {
        var base = defaultPreferences().search;
        var search = isPlainObject(input) ? input : {};
        return {
            savedSearches: safeList(search.savedSearches || search.savedQueries, 20),
            defaultScope: normalizeToken(search.defaultScope, base.defaultScope)
        };
    }

    function normalizeDisplay(input, warnings) {
        var base = defaultPreferences().display;
        var display = isPlainObject(input) ? input : {};
        var density = normalizeToken(display.density, base.density);
        if (DISPLAY_DENSITIES.indexOf(density) === -1) {
            warnings.push('Display density defaulted because the supplied value was invalid.');
            density = base.density;
        }
        var language = safeString(display.language || base.language, base.language).replace(/[^a-zA-Z-]/g, '').slice(0, 12) || base.language;
        if (display.language && language !== display.language) warnings.push('Display language was sanitized.');
        var timezone = safeString(display.timezone || base.timezone, base.timezone).replace(/[^a-zA-Z0-9/_+-]/g, '').slice(0, 64) || base.timezone;
        return {
            density: density,
            language: language,
            timezone: timezone
        };
    }

    function normalizePreferencePayload(payload, context) {
        try {
            if (!isPlainObject(payload)) {
                return freezePreferenceOutput({
                    success: false,
                    classification: 'MALFORMED_PREFERENCE_PAYLOAD',
                    message: 'Preference payload must be an object.',
                    governance: governanceFlags()
                });
            }
            var warnings = [];
            var scope = validatePreferenceScope(payload, context || {});
            if (!scope.success) return scope;
            var preferences = isPlainObject(payload.preferences) ? payload.preferences : {};
            var state = normalizeToken(payload.preferenceState || payload.state, 'CUSTOMIZED');
            if (PREFERENCE_STATES.indexOf(state) === -1) {
                warnings.push('Preference state defaulted because the supplied value was invalid.');
                state = 'CUSTOMIZED';
            }
            return freezePreferenceOutput({
                success: true,
                tenantSlug: scope.tenantSlug,
                userId: scope.userId,
                preferenceState: state,
                preferences: {
                    theme: normalizeTheme(preferences.theme, warnings),
                    dashboard: normalizeDashboard(preferences.dashboard),
                    notifications: normalizeNotifications(preferences.notifications, warnings),
                    navigation: normalizeNavigation(preferences.navigation),
                    accessibility: normalizeAccessibility(preferences.accessibility, warnings),
                    search: normalizeSearch(preferences.search),
                    display: normalizeDisplay(preferences.display, warnings)
                },
                analytics: {
                    themeAdoption: clamp(payload.analytics && payload.analytics.themeAdoption, 0, 100),
                    dashboardCustomization: clamp(payload.analytics && payload.analytics.dashboardCustomization, 0, 100),
                    notificationPreferenceUsage: clamp(payload.analytics && payload.analytics.notificationPreferenceUsage, 0, 100),
                    accessibilityPreferenceUsage: clamp(payload.analytics && payload.analytics.accessibilityPreferenceUsage, 0, 100),
                    preferenceResetFrequency: clamp(payload.analytics && payload.analytics.preferenceResetFrequency, 0, 100)
                },
                metadata: cloneSanitized(payload.metadata || {}),
                validationWarnings: warnings,
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('normalizePreferencePayload failed safely', error && error.message);
            return freezePreferenceOutput({
                success: false,
                classification: 'PREFERENCE_NORMALIZATION_ERROR',
                message: 'Preference payload normalization failed safely.',
                governance: governanceFlags()
            });
        }
    }

    function preferenceKey(tenantSlug, userId) {
        return normalizeTenantSlug(tenantSlug) + '::' + safeString(userId, '').toLowerCase();
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
        var auditDetails = cloneSanitized(details || {});
        try {
            if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                global.AuditService.recordAudit({
                    actionType: actionType,
                    eventType: actionType,
                    actorId: actorId(context) || 'SYSTEM',
                    tenantSlug: contextTenant(context),
                    entityType: 'USER_PREFERENCE',
                    module: 'User Preferences',
                    targetId: auditDetails.userId || '',
                    details: auditDetails
                });
                var recordedData = rawData();
                recordedData.auditLogs = Array.isArray(recordedData.auditLogs) ? recordedData.auditLogs : [];
                if (!recordedData.auditLogs.some(function matchesRecent(row) {
                    return (row.actionType === actionType || row.eventType === actionType) && String(row.targetId || row.actorId || '') === String(auditDetails.userId || actorId(context) || '');
                })) {
                    recordedData.auditLogs.unshift({
                        id: 'AUD-PREF-' + Date.now(),
                        actionType: actionType,
                        eventType: actionType,
                        actorId: actorId(context) || 'SYSTEM',
                        tenantSlug: contextTenant(context),
                        module: 'User Preferences',
                        targetId: auditDetails.userId || '',
                        createdAt: nowIso(),
                        details: auditDetails
                    });
                    recordedData.auditLogs = recordedData.auditLogs.slice(0, MAX_HISTORY);
                    saveData(recordedData);
                }
                return true;
            }
        } catch (error) {}
        try {
            var data = rawData();
            data.auditLogs = Array.isArray(data.auditLogs) ? data.auditLogs : [];
            data.auditLogs.unshift({
                id: 'AUD-PREF-' + Date.now(),
                actionType: actionType,
                eventType: actionType,
                actorId: actorId(context) || 'SYSTEM',
                tenantSlug: contextTenant(context),
                module: 'User Preferences',
                targetId: auditDetails.userId || '',
                createdAt: nowIso(),
                details: auditDetails
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
                if (typeof global.WorkflowTelemetryService.emitTelemetry === 'function') {
                    global.WorkflowTelemetryService.emitTelemetry('WORKFLOW', eventType, {
                        source: 'userPreferenceService',
                        metadata: cloneSanitized(details || {})
                    });
                    return true;
                }
            }
        } catch (error) {}
        return false;
    }

    function calculatePreferenceAnalytics(record) {
        try {
            var preferences = record && record.preferences || {};
            var analytics = record && record.analytics || {};
            var customized = 0;
            if (preferences.theme && preferences.theme.mode && preferences.theme.mode !== 'DEFAULT') customized += 14;
            if (preferences.dashboard && (preferences.dashboard.widgets || []).length > 2) customized += 16;
            if (preferences.notifications && ((preferences.notifications.channels || []).length > 1 || preferences.notifications.digestFrequency !== 'IMMEDIATE')) customized += 14;
            if (preferences.navigation && ((preferences.navigation.shortcuts || []).length || (preferences.navigation.pinnedModules || []).length)) customized += 14;
            if (preferences.accessibility && (preferences.accessibility.reducedMotion || preferences.accessibility.highContrast || preferences.accessibility.keyboardMode || preferences.accessibility.fontScale !== 1)) customized += 14;
            if (preferences.search && (preferences.search.savedSearches || []).length) customized += 10;
            if (preferences.display && preferences.display.density !== 'COMFORTABLE') customized += 8;
            customized += Math.round((safeNumber(analytics.themeAdoption, 0) + safeNumber(analytics.dashboardCustomization, 0) + safeNumber(analytics.notificationPreferenceUsage, 0) + safeNumber(analytics.accessibilityPreferenceUsage, 0)) / 8);
            var adoption = clamp(customized, 0, 100);
            var utilization = clamp(Math.round((adoption + ((preferences.dashboard && preferences.dashboard.widgets || []).length * 6) + ((preferences.navigation && preferences.navigation.shortcuts || []).length * 5)) / 2), 0, 100);
            return freezePreferenceOutput({
                success: true,
                personalizationAdoptionScore: adoption,
                preferenceUtilizationScore: utilization,
                themeAdoption: safeNumber(analytics.themeAdoption, 0),
                dashboardCustomization: safeNumber(analytics.dashboardCustomization, 0),
                notificationPreferenceUsage: safeNumber(analytics.notificationPreferenceUsage, 0),
                accessibilityPreferenceUsage: safeNumber(analytics.accessibilityPreferenceUsage, 0),
                preferenceResetFrequency: safeNumber(analytics.preferenceResetFrequency, 0)
            });
        } catch (error) {
            return freezePreferenceOutput({
                success: false,
                personalizationAdoptionScore: 0,
                preferenceUtilizationScore: 0,
                classification: 'PREFERENCE_ANALYTICS_ERROR'
            });
        }
    }

    function persistPreferenceRecord(normalized, state, context, actionType) {
        var data = rawData();
        var generatedAt = nowIso();
        var key = preferenceKey(normalized.tenantSlug, normalized.userId);
        var analytics = calculatePreferenceAnalytics(normalized);
        var record = {
            preferenceId: 'PREF-' + key.replace(/[^a-zA-Z0-9]/g, '-'),
            preferenceKey: key,
            tenantSlug: normalized.tenantSlug,
            userId: normalized.userId,
            preferenceState: state || 'ACTIVE',
            preferences: normalized.preferences,
            analytics: {
                themeAdoption: normalized.analytics.themeAdoption,
                dashboardCustomization: normalized.analytics.dashboardCustomization,
                notificationPreferenceUsage: normalized.analytics.notificationPreferenceUsage,
                accessibilityPreferenceUsage: normalized.analytics.accessibilityPreferenceUsage,
                preferenceResetFrequency: normalized.analytics.preferenceResetFrequency,
                personalizationAdoptionScore: analytics.personalizationAdoptionScore,
                preferenceUtilizationScore: analytics.preferenceUtilizationScore
            },
            updatedAt: generatedAt,
            createdAt: generatedAt,
            version: 1,
            metadata: normalized.metadata || {}
        };

        data.userPreferenceRecords = Array.isArray(data.userPreferenceRecords) ? data.userPreferenceRecords : [];
        var existingIndex = data.userPreferenceRecords.findIndex(function findPreference(row) {
            return preferenceKey(row.tenantSlug, row.userId) === key;
        });
        if (existingIndex >= 0) {
            record.createdAt = data.userPreferenceRecords[existingIndex].createdAt || generatedAt;
            record.version = safeNumber(data.userPreferenceRecords[existingIndex].version, 0) + 1;
            data.userPreferenceRecords[existingIndex] = cloneSanitized(record);
        } else {
            data.userPreferenceRecords.unshift(cloneSanitized(record));
        }
        data.userPreferenceRecords = data.userPreferenceRecords.slice(0, MAX_HISTORY);

        data.userPreferenceHistory = Array.isArray(data.userPreferenceHistory) ? data.userPreferenceHistory : [];
        data.userPreferenceHistory.unshift(cloneSanitized({
            historyId: 'PREF-HIST-' + Date.now(),
            preferenceKey: key,
            tenantSlug: normalized.tenantSlug,
            userId: normalized.userId,
            actionType: actionType || 'PREFERENCE_UPDATE',
            preferenceState: record.preferenceState,
            version: record.version,
            preferences: record.preferences,
            analytics: record.analytics,
            createdAt: generatedAt,
            immutable: true
        }));
        data.userPreferenceHistory = data.userPreferenceHistory.slice(0, MAX_HISTORY);

        data.userPreferenceAnalytics = Array.isArray(data.userPreferenceAnalytics) ? data.userPreferenceAnalytics : [];
        data.userPreferenceAnalytics.unshift(cloneSanitized({
            analyticsId: 'PREF-AN-' + Date.now(),
            preferenceKey: key,
            tenantSlug: normalized.tenantSlug,
            userId: normalized.userId,
            personalizationAdoptionScore: analytics.personalizationAdoptionScore,
            preferenceUtilizationScore: analytics.preferenceUtilizationScore,
            themeAdoption: record.analytics.themeAdoption,
            dashboardCustomization: record.analytics.dashboardCustomization,
            notificationPreferenceUsage: record.analytics.notificationPreferenceUsage,
            accessibilityPreferenceUsage: record.analytics.accessibilityPreferenceUsage,
            preferenceResetFrequency: record.analytics.preferenceResetFrequency,
            createdAt: generatedAt,
            immutable: true
        }));
        data.userPreferenceAnalytics = data.userPreferenceAnalytics.slice(0, MAX_HISTORY);

        saveData(data);
        try {
            if (global.localStorage && typeof global.localStorage.setItem === 'function') {
                global.localStorage.setItem('arthhrms:userPreferences:' + key, JSON.stringify(cloneSanitized(record)));
            }
        } catch (error) {}
        return record;
    }

    function saveUserPreferences(payload, context) {
        try {
            var normalized = normalizePreferencePayload(payload, context || {});
            if (!normalized.success) return normalized;
            var record = persistPreferenceRecord(normalized, 'ACTIVE', context || {}, 'PREFERENCE_UPDATE');
            var auditRecorded = recordAudit('USER_PREFERENCE_UPDATE', record, context || {});
            var telemetryRecorded = recordTelemetry('USER_PREFERENCE_SAVED', record, context || {});
            var analytics = calculatePreferenceAnalytics(record);
            return freezePreferenceOutput({
                success: true,
                preferenceRecord: record,
                personalizationAdoptionScore: analytics.personalizationAdoptionScore,
                preferenceUtilizationScore: analytics.preferenceUtilizationScore,
                integrationHealth: Object.assign({}, integrationHealth(context || {}), {
                    auditIntegrated: auditRecorded,
                    telemetryIntegrated: telemetryRecorded
                }),
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('saveUserPreferences failed safely', error && error.message);
            return freezePreferenceOutput({
                success: false,
                classification: 'PREFERENCE_SAVE_ERROR',
                message: 'Preference save failed safely.',
                governance: governanceFlags()
            });
        }
    }

    function findPreferenceRecord(query, context) {
        var scope = validatePreferenceScope(query || {}, context || {});
        if (!scope.success) return { scope: scope, record: null };
        var key = preferenceKey(scope.tenantSlug, scope.userId);
        var data = rawData();
        var records = Array.isArray(data.userPreferenceRecords) ? data.userPreferenceRecords : [];
        var record = records.find(function findRecord(row) {
            return preferenceKey(row.tenantSlug, row.userId) === key;
        }) || null;
        if (!record && global.localStorage && typeof global.localStorage.getItem === 'function') {
            try {
                var stored = global.localStorage.getItem('arthhrms:userPreferences:' + key);
                if (stored) record = JSON.parse(stored);
            } catch (error) {}
        }
        return { scope: scope, record: record };
    }

    function loadUserPreferences(query, context) {
        try {
            var found = findPreferenceRecord(query || {}, context || {});
            if (!found.scope.success) return found.scope;
            var record = found.record || {
                preferenceId: 'PREF-DEFAULT-' + preferenceKey(found.scope.tenantSlug, found.scope.userId).replace(/[^a-zA-Z0-9]/g, '-'),
                preferenceKey: preferenceKey(found.scope.tenantSlug, found.scope.userId),
                tenantSlug: found.scope.tenantSlug,
                userId: found.scope.userId,
                preferenceState: 'DEFAULT',
                preferences: defaultPreferences(),
                analytics: {},
                source: 'DEFAULT',
                version: 0,
                createdAt: nowIso(),
                updatedAt: nowIso()
            };
            recordAudit('USER_PREFERENCE_LOAD', { tenantSlug: record.tenantSlug, userId: record.userId, preferenceState: record.preferenceState }, Object.assign({}, context || {}, { skipAuditPersistence: true }));
            return freezePreferenceOutput({
                success: true,
                preferenceRecord: record,
                governance: governanceFlags(),
                integrationHealth: integrationHealth(context || {})
            });
        } catch (error) {
            safeWarn('loadUserPreferences failed safely', error && error.message);
            return freezePreferenceOutput({
                success: false,
                classification: 'PREFERENCE_LOAD_ERROR',
                message: 'Preference load failed safely.',
                governance: governanceFlags()
            });
        }
    }

    function restoreDefaultPreferences(payload, context) {
        try {
            var scope = validatePreferenceScope(payload || {}, context || {});
            if (!scope.success) return scope;
            var normalized = normalizePreferencePayload({
                tenantSlug: scope.tenantSlug,
                userId: scope.userId,
                preferenceState: 'RESET',
                preferences: defaultPreferences(),
                analytics: { preferenceResetFrequency: 1 },
                metadata: { source: 'restore-default-preferences' }
            }, context || {});
            if (!normalized.success) return normalized;
            var record = persistPreferenceRecord(normalized, 'RESET', context || {}, 'PREFERENCE_RESET');
            var auditRecorded = recordAudit('USER_PREFERENCE_RESET', record, context || {});
            var telemetryRecorded = recordTelemetry('USER_PREFERENCE_RESET', record, context || {});
            var analytics = calculatePreferenceAnalytics(record);
            return freezePreferenceOutput({
                success: true,
                preferenceRecord: record,
                personalizationAdoptionScore: analytics.personalizationAdoptionScore,
                preferenceUtilizationScore: analytics.preferenceUtilizationScore,
                integrationHealth: Object.assign({}, integrationHealth(context || {}), {
                    auditIntegrated: auditRecorded,
                    telemetryIntegrated: telemetryRecorded
                }),
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('restoreDefaultPreferences failed safely', error && error.message);
            return freezePreferenceOutput({
                success: false,
                classification: 'PREFERENCE_RESTORE_ERROR',
                message: 'Preference restore failed safely.',
                governance: governanceFlags()
            });
        }
    }

    function generatePreferenceReport(query, context) {
        try {
            var loaded = loadUserPreferences(query || {}, Object.assign({}, context || {}, { skipAuditPersistence: true }));
            if (!loaded.success) return loaded;
            var record = loaded.preferenceRecord;
            var analytics = calculatePreferenceAnalytics(record);
            var data = rawData();
            var key = preferenceKey(record.tenantSlug, record.userId);
            var history = (Array.isArray(data.userPreferenceHistory) ? data.userPreferenceHistory : []).filter(function samePreference(row) {
                return preferenceKey(row.tenantSlug, row.userId) === key;
            }).slice(0, 20);
            var auditRecorded = recordAudit('USER_PREFERENCE_REPORT_ACCESS', { tenantSlug: record.tenantSlug, userId: record.userId }, context || {});
            var telemetryRecorded = recordTelemetry('USER_PREFERENCE_REPORT_GENERATED', { tenantSlug: record.tenantSlug, userId: record.userId }, context || {});
            return freezePreferenceOutput({
                success: true,
                generatedAt: nowIso(),
                tenantSlug: record.tenantSlug,
                userId: record.userId,
                preferenceRecord: record,
                preferenceHistory: history,
                personalizationAdoptionScore: analytics.personalizationAdoptionScore,
                preferenceUtilizationScore: analytics.preferenceUtilizationScore,
                personalization: {
                    personalizedDashboards: true,
                    personalizedWidgetLayouts: true,
                    preferredNavigationShortcuts: true,
                    savedSearchPreferences: true,
                    notificationPreferences: true,
                    accessibilityPreferences: true,
                    personalizationNeverChangesPermissions: true,
                    personalizationNeverChangesRBAC: true
                },
                analytics: analytics,
                integrationHealth: Object.assign({}, integrationHealth(context || {}), {
                    auditIntegrated: auditRecorded,
                    telemetryIntegrated: telemetryRecorded
                }),
                governance: governanceFlags()
            });
        } catch (error) {
            safeWarn('generatePreferenceReport failed safely', error && error.message);
            return freezePreferenceOutput({
                success: false,
                classification: 'PREFERENCE_REPORT_ERROR',
                message: 'Preference report failed safely.',
                governance: governanceFlags()
            });
        }
    }

    function runSelfTest() {
        var checks = [];
        function record(name, passed, details) {
            checks.push({ name: name, passed: !!passed, details: details || null });
        }
        try {
            var context = { tenantSlug: 'self-test', actor: { id: 'SELF-USER', role: 'EMPLOYEE', tenantSlug: 'self-test' }, skipAuditPersistence: true, skipTelemetry: true };
            var malformed = normalizePreferencePayload('bad', context);
            record('malformed payloads fail safely', malformed.success === false && Object.isFrozen(malformed));
            var payload = {
                tenantSlug: 'self-test',
                userId: 'SELF-USER',
                preferenceState: 'CUSTOMIZED',
                preferences: {
                    theme: { mode: 'dark', accentColor: '#1a56db' },
                    notifications: { channels: ['in_app', 'email'], digestFrequency: 'daily' },
                    accessibility: { reducedMotion: true, fontScale: 1.1 },
                    dashboard: { widgets: ['overview', 'notifications', 'search'] },
                    navigation: { shortcuts: ['attendance'] },
                    search: { savedSearches: ['my tasks'] },
                    display: { density: 'compact' }
                }
            };
            var saved = saveUserPreferences(payload, context);
            var loaded = loadUserPreferences({ tenantSlug: 'self-test', userId: 'SELF-USER' }, context);
            var report = generatePreferenceReport({ tenantSlug: 'self-test', userId: 'SELF-USER' }, context);
            var restored = restoreDefaultPreferences({ tenantSlug: 'self-test', userId: 'SELF-USER' }, context);
            var blocked = loadUserPreferences({ tenantSlug: 'other-tenant', userId: 'SELF-USER' }, context);
            record('preference persistence works', saved.success && loaded.success && loaded.preferenceRecord.preferences.theme.mode === 'DARK');
            record('theme preferences work', saved.preferenceRecord.preferences.theme.mode === 'DARK');
            record('notification preferences work', saved.preferenceRecord.preferences.notifications.channels.indexOf('EMAIL') !== -1);
            record('accessibility preferences work', saved.preferenceRecord.preferences.accessibility.reducedMotion === true);
            record('tenant isolation works', blocked.success === false && /TENANT/i.test(blocked.classification || ''));
            record('immutable outputs enforced', Object.isFrozen(saved) && Object.isFrozen(report) && Object.isFrozen(restored.preferenceRecord));
        } catch (error) {
            record('self-test failure captured', false, safeString(error && error.message, 'unknown'));
        }
        var result = freezePreferenceOutput({
            passed: checks.every(function allPassed(row) { return row.passed === true; }),
            checks: checks,
            generatedAt: nowIso()
        });
        try { global.__ARTHHRMS_USER_PREFERENCE_SELF_TEST__ = result; } catch (error) {}
        return result;
    }

    var service = freezeDeep({
        PREFERENCE_STATES: PREFERENCE_STATES,
        THEME_MODES: THEME_MODES,
        saveUserPreferences: saveUserPreferences,
        loadUserPreferences: loadUserPreferences,
        restoreDefaultPreferences: restoreDefaultPreferences,
        normalizePreferencePayload: normalizePreferencePayload,
        freezePreferenceOutput: freezePreferenceOutput,
        generatePreferenceReport: generatePreferenceReport,
        generateUserPreferenceReport: generatePreferenceReport,
        calculatePreferenceAnalytics: calculatePreferenceAnalytics,
        validatePreferenceScope: validatePreferenceScope,
        runSelfTest: runSelfTest
    });

    try {
        global.UserPreferenceService = service;
        global.userPreferenceService = service;
    } catch (error) {}

    if (global.__ARTHHRMS_DEV__) {
        runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
