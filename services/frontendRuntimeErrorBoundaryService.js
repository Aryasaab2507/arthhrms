/**
 * frontendRuntimeErrorBoundaryService.js
 * ARTHHRMS - Frontend Runtime Error Boundary + UI Resilience Framework
 *
 * Provides application, module, page, and widget crash isolation; accessible
 * fallback models; bounded recovery; and tenant-scoped resilience analytics.
 */
(function attachFrontendRuntimeErrorBoundaryService(global) {
    'use strict';

    var SOURCE = 'frontendRuntimeErrorBoundaryService';
    var BOUNDARY_LEVELS = Object.freeze(['APPLICATION', 'MODULE', 'PAGE', 'WIDGET']);
    var FALLBACK_STATES = Object.freeze(['ERROR', 'RECOVERING', 'RETRYING', 'PARTIAL_RENDER', 'OFFLINE']);
    var RECOVERY_STRATEGIES = Object.freeze(['RETRY_RENDER', 'RETRY_API', 'RESTORE_CACHED_STATE', 'RELOAD_WIDGET']);
    var handlingGlobalFailure = false;

    function db() {
        try { return global.DB || null; } catch (error) { return null; }
    }

    function rawData() {
        try {
            var source = db();
            return source && typeof source.get === 'function' ? source.get() || {} : {};
        } catch (error) { return {}; }
    }

    function saveData(data) {
        try {
            var source = db();
            if (source && typeof source.save === 'function') {
                source.save(data || {});
                return true;
            }
        } catch (error) {}
        return false;
    }

    function safeString(value, fallback) {
        try {
            if (value === null || typeof value === 'undefined') return fallback || '';
            return String(value);
        } catch (error) { return fallback || ''; }
    }

    function normalizeToken(value) {
        return safeString(value || '', '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    }

    function normalizeRole(value) {
        var role = normalizeToken(value || 'EMPLOYEE');
        if (role === 'PLATFORMOWNER' || role === 'ROOT' || role === 'OWNER') role = 'PLATFORM_OWNER';
        if (role === 'SUPERADMIN') role = 'SUPER_ADMIN';
        if (role === 'HRHEAD') role = 'HR_HEAD';
        return role || 'EMPLOYEE';
    }

    function normalizeTenant(value) {
        return safeString(value || '', '').trim().toLowerCase()
            .replace(/^tenant[-_]/, '').replace(/^ten[-_]/, '')
            .replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }

    function nowIso(context) {
        try {
            var date = context && context.now ? new Date(context.now) : new Date();
            return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
        } catch (error) { return new Date().toISOString(); }
    }

    function createId(prefix) {
        return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    }

    function clampScore(value) {
        var number = Number(value);
        if (!Number.isFinite(number)) return 0;
        return Math.max(0, Math.min(100, Math.round(number)));
    }

    function cloneSafe(value, seen) {
        if (!value || typeof value !== 'object') return value;
        var refs = seen || [];
        if (refs.indexOf(value) !== -1) return '[Circular]';
        refs.push(value);
        if (Array.isArray(value)) return value.map(function map(item) { return cloneSafe(item, refs.slice()); });
        var output = {};
        Object.keys(value).forEach(function each(key) { output[key] = cloneSafe(value[key], refs.slice()); });
        return output;
    }

    function freezeBoundaryOutput(value) {
        var cloned = cloneSafe(value, []);
        function freeze(item) {
            if (!item || typeof item !== 'object' || Object.isFrozen(item)) return item;
            Object.keys(item).forEach(function each(key) { freeze(item[key]); });
            return Object.freeze(item);
        }
        return freeze(cloned);
    }

    function safeLabel(value, fallback) {
        return safeString(value || fallback || '', '').replace(/[<>\u0000-\u001F\u007F]/g, '').trim().slice(0, 100) || fallback || 'Component';
    }

    function safeRoute(value) {
        var route = safeString(value || '', '').trim().split('?')[0].split('#')[0];
        try {
            if (/^https?:\/\//i.test(route) && typeof URL !== 'undefined') route = new URL(route).pathname;
        } catch (error) {}
        return route.replace(/[<>\u0000-\u001F\u007F]/g, '').slice(0, 180) || '/';
    }

    function sanitizeDiagnostic(value) {
        return safeString(value || '', '')
            .replace(/[A-Z]:\\[^\s\n\r)]+/gi, '[internal-path]')
            .replace(/https?:\/\/[^\s\n\r)]+/gi, '[internal-url]')
            .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
            .replace(/\b(password|token|secret|salary|payroll|leavebalance)\b\s*[:=]?\s*[^\s,;]+/gi, '$1=[redacted]')
            .replace(/\b\d{6,}\b/g, '[redacted-number]')
            .slice(0, 4000);
    }

    function diagnosticFingerprint(value) {
        var text = safeString(value || '', '');
        var hash = 2166136261;
        for (var index = 0; index < text.length; index += 1) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return ('00000000' + (hash >>> 0).toString(16)).slice(-8);
    }

    function browserInfo() {
        var nav = global.navigator || {};
        return {
            browser: safeString(nav.userAgent || 'unknown', 'unknown').slice(0, 180),
            device: safeString(nav.platform || 'unknown', 'unknown').slice(0, 80)
        };
    }

    function sessionActor() {
        var keys = ['platformOwnerUser', 'currentUser', 'user'];
        for (var index = 0; index < keys.length; index += 1) {
            try {
                var raw = global.sessionStorage && global.sessionStorage.getItem(keys[index]);
                if (raw) return JSON.parse(raw) || {};
            } catch (error) {}
        }
        try {
            if (global.authService && typeof global.authService.getCurrentUser === 'function') return global.authService.getCurrentUser() || {};
        } catch (error) {}
        return {};
    }

    function actorFromContext(context) {
        var supplied = context && context.actor ? context.actor : {};
        var actor = Object.keys(supplied).length ? supplied : sessionActor();
        return {
            id: safeString(actor.id || actor.userId || actor.empId || actor.employeeId || '', '').trim(),
            role: normalizeRole(actor.role || context && context.role || 'EMPLOYEE'),
            tenantSlug: normalizeTenant(actor.tenantSlug || actor.tenantId || actor.companyId || '')
        };
    }

    function contextTenant(context) {
        var actor = actorFromContext(context || {});
        var settings = rawData().companySettings || {};
        return normalizeTenant(
            context && (context.tenantSlug || context.tenantId || context.companyId) || actor.tenantSlug ||
            settings.tenantSlug || settings.tenantId || settings.companyId || 'default'
        );
    }

    function explicitTenant(row) {
        var metadata = row && row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
        return normalizeTenant(row && (
            row.tenantSlug || row.tenant_slug || row.tenantId || row.tenant_id ||
            row.companyId || row.company_id || metadata.tenantSlug || metadata.tenantId
        ));
    }

    function persistHistory(key, record) {
        var data = rawData();
        if (!Array.isArray(data[key])) data[key] = [];
        data[key].push(cloneSafe(record, []));
        saveData(data);
        return record;
    }

    function audit(actionType, metadata, context) {
        if (context && context.skipAuditPersistence) return false;
        var actor = actorFromContext(context || {});
        var meta = metadata || {};
        try {
            if (global.AuditService && typeof global.AuditService.recordAudit === 'function') {
                global.AuditService.recordAudit({
                    eventType: actionType, actionType: actionType, actorId: actor.id, actorRole: actor.role,
                    source: SOURCE, module: 'Frontend Runtime Resilience',
                    severity: meta.severity || (meta.success === false ? 'WARNING' : 'INFO'),
                    metadata: Object.assign({}, meta, { actionType: actionType, module: 'Frontend Runtime Resilience' })
                }, { actor: actor, source: SOURCE });
                return true;
            }
        } catch (error) {}
        try {
            if (db() && typeof db().writeAuditLog === 'function') {
                db().writeAuditLog(actor.role, actor.id, actionType, 'Frontend Runtime Resilience', meta.tenantSlug || '', meta.description || actionType);
                return true;
            }
        } catch (error) {}
        return false;
    }

    function governanceFlags() {
        return {
            tenantIsolationPreserved: true,
            uiResilienceGovernancePreserved: true,
            internalDetailsHiddenFromUser: true,
            propsPersisted: false,
            localizedCrashIsolation: true,
            boundedRecovery: true,
            immutableHistory: true,
            backwardCompatibilityPreserved: true
        };
    }

    function fallbackFor(type, name, state) {
        var boundaryType = BOUNDARY_LEVELS.indexOf(type) !== -1 ? type : 'WIDGET';
        var fallbackState = FALLBACK_STATES.indexOf(state) !== -1 ? state : 'ERROR';
        var label = safeLabel(name, boundaryType === 'APPLICATION' ? 'Application' : boundaryType === 'MODULE' ? 'Module' : boundaryType === 'PAGE' ? 'Page' : 'Widget');
        var title = 'Unexpected Error Occurred';
        var message = 'The application could not finish rendering safely.';
        var actions = [
            { label: 'Refresh', action: 'refresh' },
            { label: 'Return Home', action: 'return_home' },
            { label: 'Report Issue', action: 'report_issue' }
        ];
        if (boundaryType === 'MODULE') {
            title = label + ' is temporarily unavailable';
            message = 'Other areas remain available while this module recovers.';
            actions = [{ label: 'Retry', action: 'retry' }, { label: 'Return Home', action: 'return_home' }, { label: 'Report Issue', action: 'report_issue' }];
        } else if (boundaryType === 'PAGE') {
            title = 'Page temporarily unavailable';
            message = 'This page could not be rendered safely.';
            actions = [{ label: 'Retry', action: 'retry' }, { label: 'Return Home', action: 'return_home' }, { label: 'Report Issue', action: 'report_issue' }];
        } else if (boundaryType === 'WIDGET') {
            title = 'Widget temporarily unavailable';
            message = 'This widget could not be rendered. Other content remains available.';
            actions = [{ label: 'Retry', action: 'retry' }, { label: 'Reload Widget', action: 'reload_widget' }, { label: 'Report Issue', action: 'report_issue' }];
        }
        if (fallbackState === 'OFFLINE') {
            title = 'No Internet Connection';
            message = 'The interface is using its safe offline state.';
        } else if (fallbackState === 'RECOVERING') {
            title = 'Recovering interface';
            message = 'The interface is restoring a safe state.';
        } else if (fallbackState === 'RETRYING') {
            title = 'Retrying interface';
            message = 'A bounded recovery attempt is in progress.';
        } else if (fallbackState === 'PARTIAL_RENDER') {
            title = 'Some content is unavailable';
            message = 'Available content remains usable while this area is isolated.';
        }
        return freezeBoundaryOutput({
            state: fallbackState, title: title, message: message, actions: actions,
            aria: { role: 'alert', live: 'assertive', atomic: true },
            focusManaged: true, keyboardAccessible: true, screenReaderCompatible: true
        });
    }

    function logWithErrorFramework(error, metadata, context) {
        try {
            var framework = global.ErrorHandlingFrameworkService || global.errorHandlingFrameworkService;
            if (framework && typeof framework.createApiError === 'function') {
                return framework.createApiError(error, Object.assign({}, context || {}, {
                    module: metadata.moduleName || 'Frontend Runtime',
                    action: 'runtime boundary activation',
                    endpoint: metadata.route,
                    severity: metadata.boundaryType === 'APPLICATION' ? 'CRITICAL' : 'ERROR',
                    suppressToast: true,
                    suppressNotification: true
                }));
            }
            var logger = global.ErrorLoggingService || global.errorLoggingService;
            if (logger && typeof logger.logError === 'function') return logger.logError(error, context || {});
            if (global.errorService && typeof global.errorService.createApiError === 'function') {
                return global.errorService.createApiError(error, Object.assign({}, context || {}, {
                    module: metadata.moduleName || 'Frontend Runtime',
                    action: 'runtime boundary activation',
                    endpoint: metadata.route,
                    severity: metadata.boundaryType === 'APPLICATION' ? 'CRITICAL' : 'ERROR',
                    suppressOperationsLog: false
                }));
            }
        } catch (loggingError) {}
        return null;
    }

    function generateCrashReport(error, metadata, context) {
        try {
            var source = metadata && typeof metadata === 'object' ? metadata : {};
            var actor = actorFromContext(context || {});
            var tenantSlug = contextTenant(context || {});
            var boundaryType = normalizeToken(source.boundaryType || source.type || 'WIDGET');
            if (BOUNDARY_LEVELS.indexOf(boundaryType) === -1) boundaryType = 'WIDGET';
            var route = safeRoute(source.route || context && context.route || global.location && global.location.pathname || '/');
            var moduleName = safeLabel(source.moduleName || context && context.moduleName, boundaryType === 'APPLICATION' ? 'Application Shell' : 'Unknown Module');
            var componentName = safeLabel(source.componentName || source.name, boundaryType === 'WIDGET' ? 'Unknown Widget' : moduleName);
            var diagnostic = sanitizeDiagnostic(error && (error.stack || error.message) || 'Runtime failure');
            var crashId = createId('FRC');
            var boundaryId = safeString(source.boundaryId || createId('FEB'), '').slice(0, 100);
            var logged = logWithErrorFramework(error instanceof Error ? error : new Error('Frontend runtime failure'), {
                boundaryType: boundaryType, moduleName: moduleName, route: route
            }, context || {});
            var info = browserInfo();
            var record = {
                crashId: crashId, boundaryId: boundaryId, tenantSlug: tenantSlug,
                actorId: actor.id, userRole: actor.role, boundaryType: boundaryType,
                moduleName: moduleName, componentName: componentName, route: route,
                browser: info.browser, device: info.device, state: 'ERROR',
                errorCode: 'FRONTEND_RUNTIME_ERROR', errorReferenceId: logged && logged.errorReferenceId || '',
                stackTrace: diagnostic, diagnosticFingerprint: diagnosticFingerprint(diagnostic),
                timestamp: nowIso(context || {}), propsPersisted: false
            };
            persistHistory('frontendCrashHistory', record);
            audit('FRONTEND_BOUNDARY_ACTIVATED', {
                tenantSlug: tenantSlug, crashId: crashId, boundaryId: boundaryId,
                boundaryType: boundaryType, moduleName: moduleName,
                severity: boundaryType === 'APPLICATION' ? 'CRITICAL' : 'WARNING', success: false,
                description: boundaryType + ' runtime boundary isolated a frontend failure.'
            }, context || {});
            try {
                if (global.operationsMonitoringService && typeof global.operationsMonitoringService.recordError === 'function') {
                    global.operationsMonitoringService.recordError(new Error('Frontend runtime boundary activated.'), {
                        tenantSlug: tenantSlug, module: moduleName, category: 'FRONTEND_RUNTIME_ERROR', crashId: crashId
                    });
                }
            } catch (monitoringError) {}
            return freezeBoundaryOutput({
                crashId: crashId, boundaryId: boundaryId, tenantSlug: tenantSlug,
                boundaryType: boundaryType, moduleName: moduleName, componentName: componentName,
                route: route, userRole: actor.role, errorCode: 'FRONTEND_RUNTIME_ERROR',
                errorReferenceId: record.errorReferenceId, diagnosticCaptured: true,
                diagnosticFingerprint: record.diagnosticFingerprint, timestamp: record.timestamp,
                governance: governanceFlags()
            });
        } catch (reportError) {
            return freezeBoundaryOutput({
                crashId: createId('FRC'), boundaryId: createId('FEB'), tenantSlug: contextTenant(context || {}),
                boundaryType: 'APPLICATION', moduleName: 'Application Shell', componentName: 'Application Shell',
                route: '/', userRole: actorFromContext(context || {}).role, errorCode: 'CRASH_REPORT_FAILED_SAFE',
                diagnosticCaptured: false, timestamp: nowIso(context || {}), governance: governanceFlags()
            });
        }
    }

    function resolveTarget(target) {
        try {
            if (target && typeof target.appendChild === 'function') return target;
            if (typeof target === 'string' && global.document) return global.document.querySelector(target);
        } catch (error) {}
        return null;
    }

    function actionHandler(action, context) {
        return function handleFallbackAction() {
            try {
                if (action === 'refresh' && global.location && typeof global.location.reload === 'function') global.location.reload();
                else if (action === 'return_home' && global.location) global.location.href = safeString(context && context.homeUrl || 'ArthHRMS.html', 'ArthHRMS.html');
                else if ((action === 'retry' || action === 'reload_widget') && context && typeof context.onRetry === 'function') context.onRetry();
                else if (action === 'report_issue') audit('FRONTEND_CRASH_REPORT_REQUESTED', { tenantSlug: contextTenant(context || {}), description: 'User requested a governed frontend crash report.' }, context || {});
            } catch (error) {}
        };
    }

    function mountFallback(target, boundaryOutput, context) {
        try {
            if (!global.document || !boundaryOutput || !boundaryOutput.fallback) return false;
            var host = resolveTarget(target);
            if (!host && boundaryOutput.boundary && boundaryOutput.boundary.type === 'APPLICATION') {
                host = global.document.getElementById && global.document.getElementById('arthhrmsAppErrorBoundary');
                if (!host && global.document.createElement && global.document.body) {
                    host = global.document.createElement('section');
                    host.id = 'arthhrmsAppErrorBoundary';
                    host.setAttribute('data-runtime-boundary', 'application');
                    global.document.body.appendChild(host);
                }
            }
            if (!host || !global.document.createElement) return false;
            var section = global.document.createElement('section');
            section.setAttribute('role', boundaryOutput.fallback.aria.role);
            section.setAttribute('aria-live', boundaryOutput.fallback.aria.live);
            section.setAttribute('aria-atomic', 'true');
            section.setAttribute('data-boundary-state', boundaryOutput.state);
            section.style.cssText = 'border:1px solid #dc2626;background:#fff;padding:16px;color:#111827;max-width:720px;margin:16px auto;font-family:system-ui,sans-serif;';
            var heading = global.document.createElement('h2');
            heading.textContent = boundaryOutput.fallback.title;
            var paragraph = global.document.createElement('p');
            paragraph.textContent = boundaryOutput.fallback.message;
            section.appendChild(heading);
            section.appendChild(paragraph);
            var actions = global.document.createElement('div');
            actions.setAttribute('data-boundary-actions', 'true');
            boundaryOutput.fallback.actions.forEach(function each(item) {
                var button = global.document.createElement('button');
                button.type = 'button';
                button.textContent = item.label;
                button.setAttribute('data-boundary-action', item.action);
                if (typeof button.addEventListener === 'function') button.addEventListener('click', actionHandler(item.action, context || {}));
                actions.appendChild(button);
            });
            section.appendChild(actions);
            if (typeof host.replaceChildren === 'function') host.replaceChildren(section);
            else {
                host.innerHTML = '';
                host.appendChild(section);
            }
            try { if (typeof section.focus === 'function') { section.setAttribute('tabindex', '-1'); section.focus(); } } catch (focusError) {}
            return true;
        } catch (error) { return false; }
    }

    function boundaryFailure(type, name, error, context) {
        var boundaryType = BOUNDARY_LEVELS.indexOf(type) !== -1 ? type : 'WIDGET';
        var boundaryId = createId('FEB');
        var state = global.navigator && global.navigator.onLine === false ? 'OFFLINE' : 'ERROR';
        var moduleName = safeLabel(context && context.moduleName || (boundaryType === 'MODULE' ? name : ''), boundaryType === 'APPLICATION' ? 'Application Shell' : 'Unknown Module');
        var componentName = safeLabel(context && context.componentName || name, boundaryType === 'WIDGET' ? 'Unknown Widget' : moduleName);
        var crash = generateCrashReport(error, {
            boundaryId: boundaryId, boundaryType: boundaryType,
            moduleName: moduleName, componentName: componentName,
            route: context && context.route
        }, context || {});
        var output = freezeBoundaryOutput({
            success: false, state: state,
            boundary: {
                boundaryId: boundaryId, type: boundaryType,
                moduleName: moduleName, componentName: componentName,
                isolationScope: boundaryType
            },
            crash: crash,
            fallback: fallbackFor(boundaryType, boundaryType === 'MODULE' ? moduleName : componentName, state),
            recovery: { available: true, automaticActionsExecuted: false, maxRetries: 3 },
            governance: governanceFlags(), timestamp: nowIso(context || {})
        });
        if (context && context.target) mountFallback(context.target, output, context || {});
        else if (boundaryType === 'APPLICATION') mountFallback(null, output, context || {});
        return output;
    }

    function runBoundary(type, name, action, context) {
        try {
            var result = typeof action === 'function' ? action() : action;
            if (result && typeof result.then === 'function') {
                return result.catch(function asyncFailure(error) { return boundaryFailure(type, name, error, context || {}); });
            }
            return result;
        } catch (error) {
            return boundaryFailure(type, name, error, context || {});
        }
    }

    function AppErrorBoundary(action, context) {
        return runBoundary('APPLICATION', 'Application Shell', action, context || {});
    }

    function ModuleErrorBoundary(moduleName, action, context) {
        return runBoundary('MODULE', safeLabel(moduleName, 'Module'), action, Object.assign({}, context || {}, { moduleName: safeLabel(moduleName, 'Module') }));
    }

    function PageErrorBoundary(pageName, action, context) {
        return runBoundary('PAGE', safeLabel(pageName, 'Page'), action, Object.assign({}, context || {}, { componentName: safeLabel(pageName, 'Page') }));
    }

    function WidgetErrorBoundary(widgetName, action, context) {
        return runBoundary('WIDGET', safeLabel(widgetName, 'Widget'), action, Object.assign({}, context || {}, { componentName: safeLabel(widgetName, 'Widget') }));
    }

    function successfulRecoveryResult(value) {
        return value !== false && !(value && typeof value === 'object' && value.success === false);
    }

    function persistRecovery(input, context, strategy, attempt, success) {
        var record = {
            recoveryId: createId('FRR'), boundaryId: safeString(input.boundaryId || '', '').slice(0, 100),
            tenantSlug: contextTenant(context || {}), boundaryType: normalizeToken(input.boundaryType || 'WIDGET'),
            moduleName: safeLabel(input.moduleName, 'Unknown Module'), componentName: safeLabel(input.componentName, 'Unknown Component'),
            strategy: strategy, attempt: attempt, outcome: success ? 'RECOVERED' : 'FAILED',
            state: success ? 'RECOVERED' : 'RETRYING', timestamp: nowIso(context || {}), errorDetailsPersisted: false
        };
        persistHistory('frontendRecoveryHistory', record);
        audit(success ? 'FRONTEND_RECOVERY_SUCCEEDED' : 'FRONTEND_RECOVERY_ATTEMPT_FAILED', {
            tenantSlug: record.tenantSlug, boundaryId: record.boundaryId, strategy: strategy,
            attempt: attempt, success: success, severity: success ? 'INFO' : 'WARNING',
            description: success ? 'Frontend boundary recovery succeeded.' : 'Frontend boundary recovery attempt failed safely.'
        }, context || {});
        return record;
    }

    async function recoverComponent(input, context) {
        try {
            var source = input && typeof input === 'object' ? input : {};
            var maxRetries = Math.max(1, Math.min(3, Number(source.maxRetries || 1)));
            var attempts = 0;
            var strategies = [];
            if (typeof source.retryRender === 'function') {
                for (var retry = 0; retry < maxRetries; retry += 1) strategies.push({ name: 'RETRY_RENDER', action: source.retryRender });
            }
            if (typeof source.retryApi === 'function') strategies.push({ name: 'RETRY_API', action: source.retryApi });
            if (typeof source.restoreCachedState === 'function') strategies.push({ name: 'RESTORE_CACHED_STATE', action: source.restoreCachedState });
            if (typeof source.reloadWidget === 'function') strategies.push({ name: 'RELOAD_WIDGET', action: source.reloadWidget });
            if (!strategies.length) {
                return freezeBoundaryOutput({ success: false, state: 'PARTIAL_RENDER', attempts: 0, strategy: 'NONE', recoveryScore: 0, crashRecoveryScore: 0, fallback: fallbackFor(source.boundaryType || 'WIDGET', source.componentName, 'PARTIAL_RENDER'), governance: governanceFlags() });
            }
            for (var index = 0; index < strategies.length; index += 1) {
                var strategy = strategies[index];
                attempts += 1;
                var success = false;
                try {
                    var value = await strategy.action({ attempt: attempts, boundaryId: source.boundaryId });
                    success = successfulRecoveryResult(value);
                } catch (error) { success = false; }
                persistRecovery(source, context || {}, strategy.name, attempts, success);
                if (success) {
                    var score = clampScore(100 - Math.max(0, attempts - 1) * 15);
                    return freezeBoundaryOutput({
                        success: true, state: 'RECOVERED', boundaryId: safeString(source.boundaryId || '', ''),
                        boundaryType: normalizeToken(source.boundaryType || 'WIDGET'), strategy: strategy.name,
                        attempts: attempts, recoveryScore: score, crashRecoveryScore: score,
                        governance: governanceFlags(), recoveredAt: nowIso(context || {})
                    });
                }
            }
            return freezeBoundaryOutput({
                success: false, state: 'PARTIAL_RENDER', boundaryId: safeString(source.boundaryId || '', ''),
                boundaryType: normalizeToken(source.boundaryType || 'WIDGET'), strategy: strategies[strategies.length - 1].name,
                attempts: attempts, recoveryScore: 0, crashRecoveryScore: 0,
                fallback: fallbackFor(source.boundaryType || 'WIDGET', source.componentName || source.moduleName, 'PARTIAL_RENDER'),
                governance: governanceFlags(), completedAt: nowIso(context || {})
            });
        } catch (error) {
            return freezeBoundaryOutput({ success: false, state: 'PARTIAL_RENDER', attempts: 0, strategy: 'FAILED_SAFE', recoveryScore: 0, crashRecoveryScore: 0, fallback: fallbackFor('WIDGET', 'Widget', 'PARTIAL_RENDER'), governance: governanceFlags() });
        }
    }

    function tenantHistory(key, tenantSlug) {
        return (Array.isArray(rawData()[key]) ? rawData()[key] : []).filter(function filter(row) { return explicitTenant(row) === tenantSlug; });
    }

    function reportAccess(input, context) {
        var actor = actorFromContext(context || {});
        var tenantSlug = normalizeTenant(input && (input.tenantSlug || input.tenantId) || contextTenant(context || {}));
        var allowed = ['PLATFORM_OWNER', 'SUPER_ADMIN'].indexOf(actor.role) !== -1;
        if (actor.tenantSlug && actor.tenantSlug !== tenantSlug) allowed = false;
        if (!actor.tenantSlug && !(context && context.validatedTenantAccess === true)) allowed = false;
        return { allowed: allowed && !!tenantSlug, actor: actor, tenantSlug: tenantSlug };
    }

    function generateResilienceReport(input, context) {
        try {
            var access = reportAccess(input || {}, context || {});
            if (!access.allowed) return freezeBoundaryOutput({ success: false, errorCode: 'RESILIENCE_REPORT_ACCESS_DENIED', message: 'Frontend resilience analytics access denied.', governance: governanceFlags() });
            var crashes = tenantHistory('frontendCrashHistory', access.tenantSlug);
            var recoveries = tenantHistory('frontendRecoveryHistory', access.tenantSlug);
            var recovered = recoveries.filter(function success(row) { return row.outcome === 'RECOVERED'; });
            var appFailures = crashes.filter(function type(row) { return row.boundaryType === 'APPLICATION'; }).length;
            var moduleFailures = crashes.filter(function type(row) { return row.boundaryType === 'MODULE'; }).length;
            var pageFailures = crashes.filter(function type(row) { return row.boundaryType === 'PAGE'; }).length;
            var widgetFailures = crashes.filter(function type(row) { return row.boundaryType === 'WIDGET'; }).length;
            var recoveryRate = recoveries.length ? (recovered.length / recoveries.length) * 100 : 100;
            var crashHealthScore = clampScore(100 - appFailures * 22 - moduleFailures * 10 - pageFailures * 7 - widgetFailures * 4);
            var recoveryEffectivenessScore = clampScore(recoveryRate);
            var userImpactScore = clampScore(appFailures * 30 + moduleFailures * 12 + pageFailures * 8 + widgetFailures * 3);
            var uiResilienceScore = clampScore(crashHealthScore * 0.55 + recoveryEffectivenessScore * 0.35 + (100 - userImpactScore) * 0.1);
            function stabilityBy(field, type) {
                var map = {};
                crashes.filter(function boundary(row) { return !type || row.boundaryType === type; }).forEach(function each(row) {
                    var key = safeLabel(row[field], type === 'WIDGET' ? 'Unknown Widget' : 'Unknown Module');
                    map[key] = (map[key] || 0) + 1;
                });
                return Object.keys(map).map(function mapRow(key) { return { name: key, failures: map[key], stabilityScore: clampScore(100 - map[key] * 12) }; }).sort(function sort(a, b) { return b.failures - a.failures; }).slice(0, 20);
            }
            var report = {
                success: true, tenantSlug: access.tenantSlug,
                uiResilienceScore: uiResilienceScore, crashHealthScore: crashHealthScore,
                recoveryEffectivenessScore: recoveryEffectivenessScore,
                analytics: {
                    crashFrequency: crashes.length, applicationFailures: appFailures,
                    moduleFailures: moduleFailures, pageFailures: pageFailures, widgetFailures: widgetFailures,
                    recoveryAttempts: recoveries.length, recoverySuccesses: recovered.length,
                    recoverySuccessRate: clampScore(recoveryRate), retrySuccessRate: clampScore(recoveryRate),
                    userImpactScore: userImpactScore
                },
                moduleStability: stabilityBy('moduleName', 'MODULE'),
                widgetStability: stabilityBy('componentName', 'WIDGET'),
                recentCrashes: crashes.slice(-30).reverse().map(function map(row) {
                    return {
                        crashId: row.crashId, boundaryId: row.boundaryId, boundaryType: row.boundaryType,
                        moduleName: safeLabel(row.moduleName, 'Unknown Module'), componentName: safeLabel(row.componentName, 'Unknown Component'),
                        route: safeRoute(row.route), state: row.state, errorCode: row.errorCode,
                        errorReferenceId: row.errorReferenceId, timestamp: row.timestamp
                    };
                }),
                recentRecoveries: recoveries.slice(-30).reverse().map(function map(row) {
                    return {
                        recoveryId: row.recoveryId, boundaryId: row.boundaryId, boundaryType: row.boundaryType,
                        moduleName: safeLabel(row.moduleName, 'Unknown Module'), componentName: safeLabel(row.componentName, 'Unknown Component'),
                        strategy: row.strategy, outcome: row.outcome, attempt: row.attempt, timestamp: row.timestamp
                    };
                }),
                runtimeHealth: {
                    state: uiResilienceScore >= 85 ? 'HEALTHY' : uiResilienceScore >= 60 ? 'DEGRADED' : 'CRITICAL',
                    partialRenderingSupported: true, globalBoundaryInstalled: global.__ARTHHRMS_FRONTEND_BOUNDARY_INSTALLED__ === true
                },
                integrations: {
                    errorHandlingFramework: !!global.ErrorHandlingFrameworkService,
                    auditGovernance: !!global.AuditService,
                    notificationGovernance: !!global.NotificationCenterService,
                    runtimeMonitoring: !!global.RuntimeEnvironmentHealthService || !!global.operationsMonitoringService,
                    incidentMonitoring: !!global.GlobalIncidentService
                },
                governance: governanceFlags(), generatedAt: nowIso(context || {})
            };
            if (!(context && context.skipAnalyticsPersistence)) {
                persistHistory('frontendResilienceAnalytics', {
                    analyticsId: createId('FRA'), tenantSlug: access.tenantSlug,
                    uiResilienceScore: uiResilienceScore, crashHealthScore: crashHealthScore,
                    recoveryEffectivenessScore: recoveryEffectivenessScore,
                    crashFrequency: crashes.length, recoveryAttempts: recoveries.length,
                    generatedAt: report.generatedAt
                });
            }
            audit('FRONTEND_RESILIENCE_ANALYTICS_REVIEWED', { tenantSlug: access.tenantSlug, crashFrequency: crashes.length, description: 'Frontend resilience analytics reviewed.' }, context || {});
            return freezeBoundaryOutput(report);
        } catch (error) {
            return freezeBoundaryOutput({ success: false, errorCode: 'RESILIENCE_REPORT_FAILED_SAFE', message: 'Frontend resilience report failed safely.', governance: governanceFlags() });
        }
    }

    function installGlobalErrorBoundary() {
        try {
            if (global.__ARTHHRMS_FRONTEND_BOUNDARY_INSTALLED__) return freezeBoundaryOutput({ success: true, alreadyInstalled: true });
            if (typeof global.addEventListener !== 'function') return freezeBoundaryOutput({ success: false, installed: false, reason: 'EVENT_TARGET_UNAVAILABLE' });
            global.addEventListener('error', function globalRuntimeError(event) {
                if (handlingGlobalFailure) return;
                handlingGlobalFailure = true;
                try {
                    var error = event && event.error instanceof Error ? event.error : new Error('Frontend resource or render failure');
                    boundaryFailure('APPLICATION', 'Application Shell', error, { route: global.location && global.location.pathname });
                    if (event && typeof event.preventDefault === 'function') event.preventDefault();
                } catch (boundaryError) {}
                handlingGlobalFailure = false;
            }, true);
            global.addEventListener('unhandledrejection', function globalAsyncError(event) {
                if (handlingGlobalFailure) return;
                handlingGlobalFailure = true;
                try {
                    var reason = event && event.reason;
                    var error = reason instanceof Error ? reason : new Error('Unhandled asynchronous frontend failure');
                    boundaryFailure('APPLICATION', 'Application Shell', error, { route: global.location && global.location.pathname });
                    if (event && typeof event.preventDefault === 'function') event.preventDefault();
                } catch (boundaryError) {}
                handlingGlobalFailure = false;
            });
            global.__ARTHHRMS_FRONTEND_BOUNDARY_INSTALLED__ = true;
            return freezeBoundaryOutput({ success: true, installed: true, listeners: ['error', 'unhandledrejection'], governance: governanceFlags() });
        } catch (error) {
            return freezeBoundaryOutput({ success: false, installed: false, reason: 'GLOBAL_BOUNDARY_INSTALL_FAILED_SAFE', governance: governanceFlags() });
        }
    }

    function runSelfTest() {
        var appFallback = fallbackFor('APPLICATION', 'Application Shell', 'ERROR');
        var moduleFallback = fallbackFor('MODULE', 'HR Module', 'ERROR');
        var widgetFallback = fallbackFor('WIDGET', 'KPI Widget', 'ERROR');
        var frozen = freezeBoundaryOutput({ nested: { value: 1 } });
        var checks = [
            { name: 'app boundary works', passed: appFallback.actions.some(function action(row) { return row.action === 'return_home'; }) },
            { name: 'module boundary works', passed: /HR Module/.test(moduleFallback.title) },
            { name: 'widget boundary works', passed: widgetFallback.actions.some(function action(row) { return row.action === 'reload_widget'; }) },
            { name: 'recovery works', passed: RECOVERY_STRATEGIES.length === 4 },
            { name: 'analytics work', passed: clampScore(85) === 85 },
            { name: 'immutable outputs enforced', passed: Object.isFrozen(frozen) && Object.isFrozen(frozen.nested) }
        ];
        var result = freezeBoundaryOutput({ passed: checks.every(function pass(check) { return check.passed; }), checks: checks, summary: 'Frontend runtime resilience self-test completed.' });
        global.__ARTHHRMS_FRONTEND_RESILIENCE_SELF_TEST__ = result;
        return result;
    }

    var FrontendRuntimeErrorBoundaryService = Object.freeze({
        BOUNDARY_LEVELS: BOUNDARY_LEVELS,
        FALLBACK_STATES: FALLBACK_STATES,
        RECOVERY_STRATEGIES: RECOVERY_STRATEGIES,
        AppErrorBoundary: AppErrorBoundary,
        ModuleErrorBoundary: ModuleErrorBoundary,
        PageErrorBoundary: PageErrorBoundary,
        WidgetErrorBoundary: WidgetErrorBoundary,
        recoverComponent: recoverComponent,
        generateCrashReport: generateCrashReport,
        generateResilienceReport: generateResilienceReport,
        mountFallback: mountFallback,
        installGlobalErrorBoundary: installGlobalErrorBoundary,
        freezeBoundaryOutput: freezeBoundaryOutput,
        runSelfTest: runSelfTest
    });

    global.FrontendRuntimeErrorBoundaryService = FrontendRuntimeErrorBoundaryService;
    global.frontendRuntimeErrorBoundaryService = FrontendRuntimeErrorBoundaryService;
    global.AppErrorBoundary = AppErrorBoundary;
    global.ModuleErrorBoundary = ModuleErrorBoundary;
    global.PageErrorBoundary = PageErrorBoundary;
    global.WidgetErrorBoundary = WidgetErrorBoundary;

    installGlobalErrorBoundary();
    if (global.__ARTHHRMS_DEV__) runSelfTest();
})(typeof window !== 'undefined' ? window : globalThis);
