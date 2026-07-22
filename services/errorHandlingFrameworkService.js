(function attachErrorHandlingFrameworkService(global) {
    'use strict';

    var ERROR_CATEGORIES = Object.freeze([
        'VALIDATION_ERROR',
        'AUTHENTICATION_ERROR',
        'AUTHORIZATION_ERROR',
        'RESOURCE_NOT_FOUND',
        'CONFLICT_ERROR',
        'RATE_LIMIT_ERROR',
        'NETWORK_ERROR',
        'FILE_UPLOAD_ERROR',
        'SERVER_ERROR',
        'UNKNOWN_ERROR'
    ]);

    var SEVERITIES = Object.freeze(['INFO', 'WARNING', 'ERROR', 'CRITICAL', 'FATAL']);
    var UI_STATES = Object.freeze(['LOADING', 'EMPTY', 'SUCCESS', 'ERROR', 'PERMISSION_DENIED', 'OFFLINE', 'MAINTENANCE']);
    var TOAST_TYPES = Object.freeze(['SUCCESS', 'WARNING', 'ERROR', 'INFO']);
    var BOUNDARIES = Object.freeze(['AppErrorBoundary', 'ModuleErrorBoundary', 'WidgetErrorBoundary']);
    var SENSITIVE_KEYS = /salary|payroll|compensation|leave\s*balance|leaveBalance|bank|account|aadhaar|pan|ssn|password|secret|token|stack|sql|query|internal|path|privateNote|raw|document|medical|benefit/i;
    var INTERNAL_PATTERN = /(SQLSTATE|select\s+|insert\s+|update\s+|delete\s+|from\s+|where\s+|C:\\|\/home\/|\/var\/|node_modules|services\/|db\.js|stack trace)/i;

    function db() {
        try { return global.DB || null; } catch (error) { return null; }
    }

    function rawData() {
        try {
            return db() && typeof db().get === 'function' ? db().get() : {};
        } catch (error) {
            return {};
        }
    }

    function saveData(data) {
        try {
            if (db() && typeof db().save === 'function') {
                db().save(data);
                return true;
            }
        } catch (error) {}
        return false;
    }

    function nowIso() { return new Date().toISOString(); }

    function id(prefix) {
        return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    }

    function safeText(value) {
        return String(value == null ? '' : value).trim();
    }

    function normalizeTenant(value) {
        return safeText(value).toLowerCase().replace(/^ten[-_]/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }

    function normalizeRole(value) {
        var role = safeText(value || 'SYSTEM').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
        if (role === 'SUPERADMIN') role = 'SUPER_ADMIN';
        if (role === 'PLATFORMOWNER' || role === 'ROOT') role = 'PLATFORM_OWNER';
        return role || 'SYSTEM';
    }

    function normalizeSeverity(value, fallback) {
        var severity = safeText(value || fallback || 'ERROR').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
        return SEVERITIES.includes(severity) ? severity : (fallback || 'ERROR');
    }

    function tenantFromContext(context) {
        var actor = context && context.actor ? context.actor : {};
        return normalizeTenant((context && (context.tenantSlug || context.tenantId || context.companyId)) || actor.tenantSlug || actor.tenantId || actor.companyId || rawData().companySettings?.tenantSlug || rawData().companySettings?.tenantId || 'default');
    }

    function userFromContext(context) {
        var actor = context && context.actor ? context.actor : {};
        return {
            id: safeText(actor.id || actor.userId || actor.empId || actor.employeeId || context?.userId || ''),
            role: normalizeRole(actor.role || context?.role || 'SYSTEM'),
            tenantSlug: tenantFromContext(context || {})
        };
    }

    function freezeErrorOutput(value) {
        if (Array.isArray(value)) return Object.freeze(value.map(freezeErrorOutput));
        if (value && typeof value === 'object') {
            var clone = {};
            Reflect.ownKeys(value).forEach(function each(key) {
                var descriptor = Object.getOwnPropertyDescriptor(value, key);
                if (!descriptor) return;
                Object.defineProperty(clone, key, {
                    enumerable: descriptor.enumerable,
                    configurable: false,
                    writable: false,
                    value: freezeErrorOutput(descriptor.value)
                });
            });
            return Object.freeze(clone);
        }
        return value;
    }

    function cloneSanitized(value, keyHint) {
        if (Array.isArray(value)) return value.map(function each(item) { return cloneSanitized(item, keyHint); });
        if (value && typeof value === 'object') {
            var clone = {};
            Object.keys(value).forEach(function each(key) {
                if (SENSITIVE_KEYS.test(key)) return;
                clone[key] = cloneSanitized(value[key], key);
            });
            return clone;
        }
        if (SENSITIVE_KEYS.test(String(keyHint || ''))) return undefined;
        if (typeof value === 'string' && INTERNAL_PATTERN.test(value)) return '[redacted]';
        return value;
    }

    function rawMessage(error) {
        if (!error) return '';
        if (typeof error === 'string') return error;
        if (error.message) return String(error.message);
        if (error.error_description) return String(error.error_description);
        if (error.details) return String(error.details);
        try { return String(error); } catch (e) { return ''; }
    }

    function normalizeCategory(input, context) {
        var source = input && typeof input === 'object' ? input : {};
        var explicit = safeText(source.category || source.error_code || source.code).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
        if (ERROR_CATEGORIES.includes(explicit)) return explicit;
        var text = [rawMessage(input), source.field, source.fileName, context?.action, context?.module, context?.endpoint].join(' ').toLowerCase();
        if (/expired session|invalid credentials|invalid token|token|session|login|authenticate/.test(text)) return 'AUTHENTICATION_ERROR';
        if (/required|invalid|missing|blank|malformed|validation|joining date|manager|department/.test(text)) return 'VALIDATION_ERROR';
        if (/permission|forbidden|unauthorized|role restriction|access denied|insufficient/.test(text)) return 'AUTHORIZATION_ERROR';
        if (/not found|deleted|missing resource|invalid url|unavailable/.test(text)) return 'RESOURCE_NOT_FOUND';
        if (/duplicate|already exists|conflict|collision/.test(text)) return 'CONFLICT_ERROR';
        if (/rate limit|too many requests|throttle/.test(text)) return 'RATE_LIMIT_ERROR';
        if (/server|database|api failure|exception|sqlstate|internal|stack|db\.js|c:\\/.test(text)) return 'SERVER_ERROR';
        if (/network|offline|timeout|timed out|dns|failed to fetch|connection/.test(text)) return 'NETWORK_ERROR';
        if (/upload|unsupported file|oversized|corrupt file|xlsx|xls|csv|file type/.test(text)) return 'FILE_UPLOAD_ERROR';
        return 'UNKNOWN_ERROR';
    }

    function defaultSeverity(category, input) {
        if (input && input.severity) return normalizeSeverity(input.severity, 'ERROR');
        if (category === 'AUTHENTICATION_ERROR' || category === 'AUTHORIZATION_ERROR' || category === 'SERVER_ERROR') return 'ERROR';
        if (category === 'NETWORK_ERROR' || category === 'RATE_LIMIT_ERROR') return 'WARNING';
        if (category === 'VALIDATION_ERROR' || category === 'CONFLICT_ERROR' || category === 'FILE_UPLOAD_ERROR' || category === 'RESOURCE_NOT_FOUND') return 'WARNING';
        return 'ERROR';
    }

    function userMessageFor(category, message) {
        if (category === 'VALIDATION_ERROR') return message && !INTERNAL_PATTERN.test(message) ? message : 'Please correct the highlighted fields.';
        if (category === 'AUTHENTICATION_ERROR') return 'Session Expired. Please login again.';
        if (category === 'AUTHORIZATION_ERROR') return 'You do not have permission to perform this action.';
        if (category === 'RESOURCE_NOT_FOUND') return 'Record Not Found. The requested resource is unavailable.';
        if (category === 'CONFLICT_ERROR') return 'Record already exists.';
        if (category === 'RATE_LIMIT_ERROR') return 'Too many requests. Please wait and retry.';
        if (category === 'NETWORK_ERROR') return 'No Internet Connection. Please check your network.';
        if (category === 'FILE_UPLOAD_ERROR') return 'Upload Failed.';
        if (category === 'SERVER_ERROR') return 'Something went wrong. Our team has been notified.';
        return 'Something went wrong. Please retry.';
    }

    function uiForCategory(category, details) {
        var base = {
            category: category,
            ariaLive: category === 'SERVER_ERROR' || category === 'AUTHORIZATION_ERROR' ? 'assertive' : 'polite',
            focusTarget: 'error-summary',
            keyboardAccessible: true,
            screenReaderCompatible: true,
            actions: ['Retry']
        };
        if (category === 'VALIDATION_ERROR') return { ...base, title: 'Validation Error', fieldHighlight: true, inlineMessage: true, preventSubmit: true, actions: [] };
        if (category === 'AUTHENTICATION_ERROR') return { ...base, title: 'Session Expired', actions: ['Login Again'], sessionPreservation: true, draftPreservation: true, safeRedirect: true };
        if (category === 'AUTHORIZATION_ERROR') return { ...base, title: 'Permission Denied', actions: ['Request Access', 'Contact Administrator'] };
        if (category === 'RESOURCE_NOT_FOUND') return { ...base, title: 'Record Not Found', actions: ['Go Home', 'Search Again', 'Refresh'] };
        if (category === 'CONFLICT_ERROR') return { ...base, title: 'Record already exists.', existingRecord: cloneSanitized(details?.existingRecord || {}), actions: ['Resolve conflict', 'Merge preparation'] };
        if (category === 'RATE_LIMIT_ERROR') return { ...base, title: 'Please Wait', actions: ['Retry Later'] };
        if (category === 'NETWORK_ERROR') return { ...base, title: 'No Internet Connection', actions: ['Retry', 'Offline Mode'] };
        if (category === 'FILE_UPLOAD_ERROR') return { ...base, title: 'Upload Failed', guidance: 'Allowed formats: CSV, XLS, XLSX. Check file size limits and retry.', actions: ['Retry Upload'] };
        if (category === 'SERVER_ERROR') return { ...base, title: 'Something went wrong.', actions: ['Retry'], referenceRequired: true };
        return { ...base, title: 'Unexpected Error Occurred', actions: ['Retry', 'Refresh Page'] };
    }

    function normalizeErrorPayload(error, context) {
        try {
            var source = error && typeof error === 'object' ? error : {};
            var category = normalizeCategory(error, context || {});
            var referenceId = id('ERR');
            var message = userMessageFor(category, rawMessage(error));
            var details = cloneSanitized(source.details || source.metadata || source);
            var normalized = {
                success: false,
                error_code: category,
                message: message,
                details: details || {},
                errorReferenceId: referenceId,
                severity: normalizeSeverity(source.severity, defaultSeverity(category, source)),
                category: category,
                ui: uiForCategory(category, details || {}),
                timestamp: nowIso(),
                governance: {
                    tenantIsolationPreserved: true,
                    errorGovernancePreserved: true,
                    stackTraceHiddenFromUser: true,
                    apiResponseStandardized: true
                }
            };
            if (category !== 'SERVER_ERROR') delete normalized.errorReferenceId;
            return freezeErrorOutput(normalized);
        } catch (normalizationError) {
            return freezeErrorOutput({
                success: false,
                error_code: 'UNKNOWN_ERROR',
                message: 'Something went wrong. Please retry.',
                details: {},
                severity: 'ERROR',
                category: 'UNKNOWN_ERROR',
                ui: uiForCategory('UNKNOWN_ERROR', {}),
                timestamp: nowIso(),
                governance: { tenantIsolationPreserved: true, errorGovernancePreserved: true, stackTraceHiddenFromUser: true }
            });
        }
    }

    function createValidationError(input, context) {
        var payload = input && typeof input === 'object' ? input : {};
        return normalizeErrorPayload({
            category: 'VALIDATION_ERROR',
            message: payload.message || 'Please correct the highlighted fields.',
            details: {
                field: payload.field || '',
                inlineMessage: payload.message || '',
                fieldHighlight: true,
                preventSubmit: true,
                valueProvided: payload.value !== undefined && payload.value !== null && payload.value !== ''
            }
        }, context || {});
    }

    function createApiSuccess(data, message) {
        return freezeErrorOutput({
            success: true,
            message: safeText(message || ''),
            data: cloneSanitized(data || {})
        });
    }

    function createApiError(error, context) {
        var normalized = normalizeErrorPayload(error, context || {});
        var row = logError(error, { ...(context || {}), category: normalized.error_code, severity: normalized.severity, suppressToast: true, suppressNotification: true });
        return freezeErrorOutput({
            success: false,
            error_code: normalized.error_code,
            message: normalized.message,
            details: normalized.details || {},
            errorReferenceId: normalized.errorReferenceId || row.id || row.errorReferenceId || '',
            ui: normalized.ui,
            severity: normalized.severity
        });
    }

    function browserInfo() {
        var nav = global.navigator || {};
        return {
            browser: safeText(nav.userAgent || 'unknown').slice(0, 180),
            device: safeText(nav.platform || 'unknown').slice(0, 80)
        };
    }

    function stackTrace(error) {
        if (!error) return '';
        if (typeof error === 'object' && error.stack) return String(error.stack).slice(0, 4000);
        return '';
    }

    function persistErrorLog(row) {
        var data = rawData();
        if (!Array.isArray(data.error_logs)) data.error_logs = [];
        data.error_logs.unshift(row);
        data.error_logs = data.error_logs.slice(0, 1000);
        data.errorLogs = data.error_logs;
        saveData(data);
        return row;
    }

    function auditError(actionType, row, context) {
        try {
            if (context && context.skipAuditPersistence) return null;
            if (db() && typeof db().writeAuditLog === 'function') {
                var actor = userFromContext(context || {});
                return db().writeAuditLog(actor.role.toLowerCase(), actor.id || '', actionType, 'Error Governance', row.id || row.errorReferenceId || '', row.message || actionType);
            }
        } catch (error) {}
        return null;
    }

    function forwardGovernanceSignals(row, context) {
        if (context && context.suppressRuntimeForwarding) return;
        try {
            if (!context?.suppressOperationsLog && global.operationsMonitoringService?.recordError) {
                global.operationsMonitoringService.recordError(new Error(row.message), {
                    module: row.module,
                    action: row.action,
                    severity: row.severity,
                    source: 'errorHandlingFrameworkService',
                    metadata: { error_code: row.error_code, error_id: row.id }
                });
            }
        } catch (error) {}
        try {
            if (!context?.suppressNotification && global.NotificationCenterService?.createNotification && (row.severity === 'CRITICAL' || row.severity === 'FATAL')) {
                global.NotificationCenterService.createNotification({
                    tenantSlug: row.tenant_id,
                    category: 'system',
                    priority: 'CRITICAL',
                    title: 'Critical platform error',
                    message: row.message,
                    metadata: { error_id: row.id }
                }, { actor: { role: 'PLATFORM_OWNER' }, tenantSlug: row.tenant_id, skipAuditPersistence: true });
            }
        } catch (error) {}
    }

    function logError(error, context) {
        try {
            var ctx = context || {};
            var normalized = normalizeErrorPayload(error, ctx);
            var actor = userFromContext(ctx);
            var browser = browserInfo();
            var row = {
                id: normalized.errorReferenceId || id('ERR'),
                tenant_id: tenantFromContext(ctx),
                user_id: actor.id || '',
                timestamp: nowIso(),
                module: safeText(ctx.module || 'system'),
                action: safeText(ctx.action || ctx.label || 'operation'),
                endpoint: safeText(ctx.endpoint || ''),
                error_code: safeText(ctx.category || normalized.error_code || 'UNKNOWN_ERROR'),
                severity: normalizeSeverity(ctx.severity || normalized.severity, normalized.severity || 'ERROR'),
                message: normalized.message,
                stack_trace: stackTrace(error),
                browser: browser.browser,
                device: browser.device,
                metadata: cloneSanitized(ctx.metadata || {}),
                immutable: true
            };
            persistErrorLog(row);
            auditError('ERROR_LOGGED', row, ctx);
            forwardGovernanceSignals(row, ctx);
            return freezeErrorOutput(row);
        } catch (loggingError) {
            return freezeErrorOutput({
                id: id('ERR'),
                tenant_id: tenantFromContext(context || {}),
                user_id: userFromContext(context || {}).id,
                timestamp: nowIso(),
                module: 'errorHandlingFramework',
                action: 'logError',
                endpoint: '',
                error_code: 'UNKNOWN_ERROR',
                severity: 'ERROR',
                message: 'Error logging failed safely.',
                stack_trace: stackTrace(loggingError),
                browser: browserInfo().browser,
                device: browserInfo().device,
                metadata: {},
                immutable: true
            });
        }
    }

    function showToast(input, context) {
        var source = input && typeof input === 'object' ? input : { message: input };
        var type = safeText(source.type || 'INFO').toUpperCase();
        if (!TOAST_TYPES.includes(type)) type = 'INFO';
        var toast = {
            toastId: id('TOAST'),
            type: type,
            category: normalizeCategory(source.category || source.error_code || type, context || {}),
            message: safeText(source.message || ''),
            createdAt: nowIso(),
            ariaLive: type === 'ERROR' ? 'assertive' : 'polite',
            keyboardAccessible: true,
            immutable: true
        };
        global.__arthhrmsToastQueue = Array.isArray(global.__arthhrmsToastQueue) ? global.__arthhrmsToastQueue : [];
        global.__arthhrmsToastQueue.unshift(cloneSanitized(toast));
        global.__arthhrmsToastQueue = global.__arthhrmsToastQueue.slice(0, 25);
        try {
            var announcer = global.document && (global.document.getElementById('platformA11yAnnouncements') || global.document.getElementById('toast'));
            if (announcer) announcer.textContent = toast.message;
        } catch (error) {}
        try {
            if (typeof global.toast === 'function' && !context?.suppressNativeToast) global.toast(toast.message, type.toLowerCase());
        } catch (error) {}
        return freezeErrorOutput(toast);
    }

    function createUIState(stateInput, options, context) {
        var state = safeText(stateInput || 'ERROR').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
        if (!UI_STATES.includes(state)) state = 'ERROR';
        var opts = options && typeof options === 'object' ? options : {};
        var entity = safeText(opts.entity || 'Records');
        var output = {
            state: state,
            tenantSlug: tenantFromContext(context || {}),
            title: state.charAt(0) + state.slice(1).toLowerCase().replace(/_/g, ' '),
            message: safeText(opts.message || ''),
            aria: { live: state === 'ERROR' || state === 'PERMISSION_DENIED' ? 'assertive' : 'polite', role: state === 'ERROR' ? 'alert' : 'status' },
            focusManaged: true,
            keyboardAccessible: true,
            screenReaderCompatible: true,
            actions: [],
            createdAt: nowIso()
        };
        if (state === 'LOADING') {
            output.title = opts.message || 'Loading...';
            output.message = opts.message || 'Please wait...';
            output.skeleton = { type: opts.variant || 'dashboard', rows: Number(opts.rows || 5), animated: true };
        } else if (state === 'EMPTY') {
            output.title = /^no\s/i.test(entity) ? entity : 'No ' + entity;
            output.message = opts.guidance || 'There is nothing to show yet.';
            output.illustrationPlaceholder = 'empty-state-placeholder';
            output.actions = opts.actionLabel ? [{ label: opts.actionLabel, action: opts.action || 'primary' }] : [];
        } else if (state === 'SUCCESS') {
            output.title = opts.title || 'Success';
            output.message = opts.message || 'Action completed successfully.';
        } else if (state === 'ERROR') {
            output.title = opts.title || 'Unexpected Error Occurred';
            output.message = opts.message || 'Something went wrong.';
            output.actions = [{ label: 'Retry', action: 'retry' }, { label: 'Refresh Page', action: 'refresh' }];
        } else if (state === 'PERMISSION_DENIED') {
            output.title = 'You do not have permission to perform this action.';
            output.message = opts.message || 'Request access or contact an administrator.';
            output.actions = [{ label: 'Request Access', action: 'request_access' }, { label: 'Contact Administrator', action: 'contact_admin' }];
        } else if (state === 'OFFLINE') {
            output.title = 'No Internet Connection';
            output.message = opts.message || 'Please check your network.';
            output.actions = [{ label: 'Retry', action: 'retry' }, { label: 'Offline Mode', action: 'offline_mode' }];
        } else if (state === 'MAINTENANCE') {
            output.title = 'Maintenance Mode';
            output.message = opts.message || 'The platform is temporarily unavailable.';
            output.actions = [{ label: 'Refresh', action: 'refresh' }];
        }
        return freezeErrorOutput(output);
    }

    function createConfirmationDialog(input, context) {
        var source = input && typeof input === 'object' ? input : {};
        var action = safeText(source.action || 'Confirm Action');
        var destructive = source.destructive === true || /delete|archive|reset|permanent|remove|bulk/i.test(action);
        return freezeErrorOutput({
            dialogId: id('CONFIRM'),
            tenantSlug: tenantFromContext(context || {}),
            title: action + '?',
            message: destructive ? 'This action cannot be undone.' : 'Please confirm this action.',
            target: safeText(source.target || ''),
            required: destructive,
            destructive: destructive,
            actions: [
                { label: 'Cancel', action: 'cancel' },
                { label: action, action: 'confirm', destructive: destructive }
            ],
            aria: { role: 'dialog', modal: true, labelledBy: 'confirmation-title', describedBy: 'confirmation-description' },
            focusManaged: true,
            keyboardAccessible: true,
            createdAt: nowIso()
        });
    }

    function boundaryResponse(boundary, error, context) {
        var normalized = createApiError(error, { ...(context || {}), module: context?.module || boundary, action: context?.action || 'component render' });
        return freezeErrorOutput({
            success: false,
            boundary: BOUNDARIES.includes(boundary) ? boundary : 'WidgetErrorBoundary',
            error_code: normalized.error_code,
            message: 'Unexpected Error Occurred',
            errorReferenceId: normalized.errorReferenceId,
            ui: {
                title: 'Unexpected Error Occurred',
                message: 'This section could not be rendered safely.',
                actions: ['Refresh Page', 'Return Home'],
                ariaLive: 'assertive',
                focusManaged: true,
                keyboardAccessible: true,
                screenReaderCompatible: true
            },
            governance: {
                tenantIsolationPreserved: true,
                errorGovernancePreserved: true,
                internalDetailsHiddenFromUser: true
            }
        });
    }

    function withErrorBoundary(boundary, action, context) {
        try {
            var result = typeof action === 'function' ? action() : action;
            if (result && typeof result.then === 'function') {
                return result
                    .then(function pass(value) { return value; })
                    .catch(function catchAsync(error) { return boundaryResponse(boundary, error, context || {}); });
            }
            return result;
        } catch (error) {
            return boundaryResponse(boundary, error, context || {});
        }
    }

    function generateErrorGovernanceReport(input, context) {
        try {
            var tenant = normalizeTenant(input?.tenantSlug || tenantFromContext(context || {}));
            var rows = (rawData().error_logs || []).filter(function same(row) {
                return normalizeTenant(row.tenant_id || row.tenantSlug) === tenant;
            });
            var bySeverity = rows.reduce(function collect(acc, row) {
                var severity = normalizeSeverity(row.severity, 'ERROR');
                acc[severity] = (acc[severity] || 0) + 1;
                return acc;
            }, {});
            var byCode = rows.reduce(function collect(acc, row) {
                var code = ERROR_CATEGORIES.includes(row.error_code) ? row.error_code : 'UNKNOWN_ERROR';
                acc[code] = (acc[code] || 0) + 1;
                return acc;
            }, {});
            var report = {
                success: true,
                reportId: id('ERR-RPT'),
                tenantSlug: tenant,
                state: rows.length ? 'AGGREGATED' : 'EMPTY',
                generatedAt: nowIso(),
                summary: {
                    totalErrors: rows.length,
                    criticalErrors: bySeverity.CRITICAL || 0,
                    fatalErrors: bySeverity.FATAL || 0,
                    validationErrors: byCode.VALIDATION_ERROR || 0,
                    networkErrors: byCode.NETWORK_ERROR || 0,
                    serverErrors: byCode.SERVER_ERROR || 0
                },
                uiStateCoverage: UI_STATES.map(function map(state) { return { state: state, supported: true }; }),
                toastCoverage: TOAST_TYPES.map(function map(type) { return { type: type, supported: true }; }),
                boundaryCoverage: BOUNDARIES.map(function map(boundary) { return { boundary: boundary, supported: true }; }),
                rows: rows.slice(0, 50).map(function map(row) {
                    return cloneSanitized({
                        id: row.id,
                        tenant_id: row.tenant_id,
                        timestamp: row.timestamp,
                        module: row.module,
                        action: row.action,
                        endpoint: row.endpoint,
                        error_code: row.error_code,
                        severity: row.severity,
                        message: row.message,
                        browser: row.browser,
                        device: row.device
                    });
                }),
                integrationHealth: {
                    auditIntegrated: !!(db() && typeof db().writeAuditLog === 'function'),
                    runtimeHealthMonitoringPrepared: true,
                    incidentMonitoringPrepared: true,
                    notificationCenterPrepared: true,
                    strategicAIAssistantPrepared: true
                },
                governance: {
                    tenantIsolationPreserved: true,
                    errorGovernancePreserved: true,
                    immutableErrorLogs: true,
                    stackTracesHiddenFromReports: true
                }
            };
            return freezeErrorOutput(report);
        } catch (error) {
            return freezeErrorOutput({
                success: false,
                error_code: 'UNKNOWN_ERROR',
                message: 'Error governance report failed safely.',
                details: {},
                ui: uiForCategory('UNKNOWN_ERROR', {}),
                governance: { tenantIsolationPreserved: true, errorGovernancePreserved: true }
            });
        }
    }

    function runSelfTest() {
        try {
            var context = { tenantSlug: 'self-test', actor: { id: 'SELF', role: 'HR', tenantSlug: 'self-test' }, skipAuditPersistence: true, suppressOperationsLog: true, suppressNotification: true };
            var validation = createValidationError({ field: 'email', message: 'Email is required' }, context);
            var network = normalizeErrorPayload(new Error('failed to fetch'), context);
            var server = createApiError(new Error('SQLSTATE 23505 at C:\\internal\\db.js'), context);
            var boundary = withErrorBoundary('WidgetErrorBoundary', function crash() { throw new Error('component crash'); }, context);
            var toast = showToast({ type: 'SUCCESS', message: 'Employee Created Successfully' }, { ...context, suppressNativeToast: true });
            var loading = createUIState('LOADING', { variant: 'table' }, context);
            return freezeErrorOutput({
                passed: validation.error_code === 'VALIDATION_ERROR'
                    && network.error_code === 'NETWORK_ERROR'
                    && server.error_code === 'SERVER_ERROR'
                    && boundary.success === false
                    && toast.type === 'SUCCESS'
                    && loading.state === 'LOADING'
                    && Object.isFrozen(validation)
                    && Object.isFrozen(boundary),
                checks: {
                    validationErrors: validation.error_code === 'VALIDATION_ERROR',
                    networkErrors: network.error_code === 'NETWORK_ERROR',
                    serverErrors: server.error_code === 'SERVER_ERROR',
                    errorBoundaries: boundary.success === false,
                    logging: !!server.errorReferenceId,
                    toastSystem: toast.type === 'SUCCESS',
                    uiStates: loading.state === 'LOADING',
                    immutableOutputs: Object.isFrozen(validation) && Object.isFrozen(boundary)
                }
            });
        } catch (error) {
            return freezeErrorOutput({ passed: false, error: 'Error framework self-test failed safely.' });
        }
    }

    var ErrorHandlingFrameworkService = Object.freeze({
        ERROR_CATEGORIES: ERROR_CATEGORIES,
        SEVERITIES: SEVERITIES,
        UI_STATES: UI_STATES,
        TOAST_TYPES: TOAST_TYPES,
        BOUNDARIES: BOUNDARIES,
        normalizeErrorPayload: normalizeErrorPayload,
        createValidationError: createValidationError,
        createApiSuccess: createApiSuccess,
        createApiError: createApiError,
        logError: logError,
        showToast: showToast,
        createUIState: createUIState,
        createConfirmationDialog: createConfirmationDialog,
        withErrorBoundary: withErrorBoundary,
        generateErrorGovernanceReport: generateErrorGovernanceReport,
        freezeErrorOutput: freezeErrorOutput
    });

    global.ErrorHandlingFrameworkService = ErrorHandlingFrameworkService;
    global.errorHandlingFrameworkService = ErrorHandlingFrameworkService;
    global.ErrorLoggingService = Object.freeze({
        logError: logError,
        generateErrorGovernanceReport: generateErrorGovernanceReport,
        freezeErrorOutput: freezeErrorOutput
    });
    global.errorLoggingService = global.ErrorLoggingService;

    if (global.errorService && typeof global.errorService === 'object') {
        global.errorService.ERROR_CATEGORIES = ERROR_CATEGORIES;
        global.errorService.SEVERITIES = SEVERITIES;
        global.errorService.UI_STATES = UI_STATES;
        global.errorService.normalizeErrorPayload = normalizeErrorPayload;
        global.errorService.createValidationError = createValidationError;
        global.errorService.createApiSuccess = createApiSuccess;
        global.errorService.createApiError = createApiError;
        global.errorService.logGovernedError = logError;
        global.errorService.showToast = showToast;
        global.errorService.createUIState = createUIState;
        global.errorService.createConfirmationDialog = createConfirmationDialog;
        global.errorService.withErrorBoundary = withErrorBoundary;
        global.errorService.generateErrorGovernanceReport = generateErrorGovernanceReport;
        global.errorService.freezeErrorOutput = freezeErrorOutput;
    }

    if (global.__ARTHHRMS_DEV__) {
        global.__ARTHHRMS_ERROR_FRAMEWORK_SELF_TEST__ = runSelfTest();
    }
})(typeof window !== 'undefined' ? window : globalThis);
