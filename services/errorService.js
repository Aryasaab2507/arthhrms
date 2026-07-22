// Central async safety helpers for ARTHHRMS.
(function (global) {
    const DEFAULT_TIMEOUT_MS = 10000;
    const activeKeys = new Set();

    function readTimeout() {
        const config = global.supabaseClientService?.readConfig?.() || {};
        const value = Number(config.SUPABASE_TIMEOUT_MS || config.timeoutMs || 0);
        return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
    }

    function formatError(error) {
        if (!error) return 'Unexpected error';
        if (typeof error === 'string') return error;
        return error.message || error.error_description || error.details || String(error);
    }

    function userMessage(error, fallback) {
        const text = formatError(error);
        if (/timeout|timed out/i.test(text)) return fallback || 'Request timed out. Please retry.';
        if (/network|failed to fetch|offline/i.test(text)) return fallback || 'Connection issue. Local fallback remains available where supported.';
        return fallback || text || 'Something went wrong. Please retry.';
    }

    function showMessage(message, type) {
        if (!message) return;
        if (typeof global.toast === 'function') {
            global.toast(message, type || 'warn');
            return;
        }
        if (global.console) console.warn(message);
    }

    function logError(error, context = {}) {
        const safe = {
            module: context.module || 'system',
            action: context.action || context.label || 'async-operation',
            message: formatError(error),
            at: new Date().toISOString()
        };
        if (!context.suppressOperationsLog && global.operationsMonitoringService?.recordError) {
            try {
                global.operationsMonitoringService.recordError(error, {
                    module: safe.module,
                    action: safe.action,
                    severity: context.severity || 'MEDIUM',
                    source: context.source || 'errorService',
                    metadata: context.metadata || {}
                });
            } catch (opsErr) {}
        }
        if (global.console) console.warn('[ARTHHRMS]', safe);
        return safe;
    }

    function withTimeout(operation, timeoutMs, label) {
        const ms = Number(timeoutMs) > 0 ? Number(timeoutMs) : readTimeout();
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`${label || 'Operation'} timed out after ${ms}ms`)), ms);
            Promise.resolve(operation)
                .then(value => {
                    clearTimeout(timer);
                    resolve(value);
                })
                .catch(error => {
                    clearTimeout(timer);
                    reject(error);
                });
        });
    }

    function getButton(buttonOrId) {
        if (!buttonOrId) return null;
        if (typeof buttonOrId !== 'string') return buttonOrId;
        return global.document?.getElementById(buttonOrId) || null;
    }

    function beginProcessing(key, options = {}) {
        const actionKey = key || options.action || 'operation';
        if (activeKeys.has(actionKey)) return { blocked: true, done() {} };
        activeKeys.add(actionKey);

        const button = getButton(options.button || options.buttonId);
        const previous = button ? {
            disabled: button.disabled,
            html: button.innerHTML,
            text: button.textContent
        } : null;

        if (button) {
            button.disabled = true;
            button.setAttribute('aria-busy', 'true');
            if (options.loadingText) button.textContent = options.loadingText;
        }

        return {
            blocked: false,
            done() {
                activeKeys.delete(actionKey);
                if (!button || !previous) return;
                button.disabled = previous.disabled;
                button.removeAttribute('aria-busy');
                if (options.loadingText) button.innerHTML = previous.html || previous.text || '';
            }
        };
    }

    async function safeAsync(action, options = {}) {
        try {
            const operation = typeof action === 'function' ? action() : action;
            const result = options.timeout === false
                ? await operation
                : await withTimeout(operation, options.timeoutMs || readTimeout(), options.label || options.action || 'Operation');
            return result;
        } catch (error) {
            logError(error, options);
            if (options.message !== false) showMessage(userMessage(error, options.message), options.toastType || 'warn');
            if (typeof options.fallback === 'function') return options.fallback(error);
            if (options.fallback !== undefined) return options.fallback;
            if (options.rethrow) throw error;
            return { ok: false, error: userMessage(error, options.message), rawError: error };
        }
    }

    async function guardedAction(key, action, options = {}) {
        const guard = beginProcessing(key, options);
        if (guard.blocked) {
            showMessage(options.blockedMessage || 'Already processing. Please wait.', 'warn');
            return { ok: false, blocked: true };
        }
        try {
            return await safeAsync(action, options);
        } finally {
            guard.done();
        }
    }

    function wrapGlobalAction(functionName, options = {}) {
        const original = global[functionName];
        if (typeof original !== 'function' || original.__arthWrapped) return false;
        const wrapped = function (...args) {
            const key = `${functionName}:${args.map(value => String(value)).join(':')}`;
            const eventButton = options.button || options.buttonId ? null : (global.event?.currentTarget || null);
            return guardedAction(key, () => original.apply(this, args), {
                action: functionName,
                label: options.label || functionName,
                button: eventButton,
                ...options
            });
        };
        wrapped.__arthWrapped = true;
        wrapped.__arthOriginal = original;
        global[functionName] = wrapped;
        return true;
    }

    function retry(action, options = {}) {
        const attempts = Math.max(1, Number(options.retries || 2) + 1);
        const delayMs = Number(options.delayMs || 400);
        let lastError;
        return (async () => {
            for (let attempt = 1; attempt <= attempts; attempt += 1) {
                try {
                    return await action(attempt);
                } catch (error) {
                    lastError = error;
                    if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, delayMs));
                }
            }
            throw lastError;
        })();
    }

    const ERROR_CATEGORIES = Object.freeze([
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
    const SEVERITIES = Object.freeze(['INFO', 'WARNING', 'ERROR', 'CRITICAL', 'FATAL']);
    const UI_STATES = Object.freeze(['LOADING', 'EMPTY', 'SUCCESS', 'ERROR', 'PERMISSION_DENIED', 'OFFLINE', 'MAINTENANCE']);

    function framework() {
        return global.ErrorHandlingFrameworkService || global.errorHandlingFrameworkService || null;
    }

    function freezeOutput(value) {
        if (framework()?.freezeErrorOutput) return framework().freezeErrorOutput(value);
        if (Array.isArray(value)) return Object.freeze(value.map(freezeOutput));
        if (value && typeof value === 'object') {
            const clone = {};
            Object.keys(value).forEach(key => { clone[key] = freezeOutput(value[key]); });
            return Object.freeze(clone);
        }
        return value;
    }

    function fallbackCategory(error) {
        const text = formatError(error).toLowerCase();
        if (/token|session|login|credential/.test(text)) return 'AUTHENTICATION_ERROR';
        if (/permission|forbidden|unauthorized|access denied/.test(text)) return 'AUTHORIZATION_ERROR';
        if (/not found|deleted|missing/.test(text)) return 'RESOURCE_NOT_FOUND';
        if (/duplicate|already exists|conflict/.test(text)) return 'CONFLICT_ERROR';
        if (/rate limit|too many/.test(text)) return 'RATE_LIMIT_ERROR';
        if (/network|offline|timeout|failed to fetch/.test(text)) return 'NETWORK_ERROR';
        if (/upload|file|csv|xlsx|xls/.test(text)) return 'FILE_UPLOAD_ERROR';
        if (/server|database|sql|exception|internal/.test(text)) return 'SERVER_ERROR';
        if (/required|invalid|validation|malformed/.test(text)) return 'VALIDATION_ERROR';
        return 'UNKNOWN_ERROR';
    }

    function normalizeErrorPayload(error, context = {}) {
        if (framework()?.normalizeErrorPayload) return framework().normalizeErrorPayload(error, context);
        const code = fallbackCategory(error);
        return freezeOutput({
            success: false,
            error_code: code,
            message: userMessage(error, code === 'SERVER_ERROR' ? 'Something went wrong. Our team has been notified.' : ''),
            details: {},
            severity: context.severity || 'ERROR',
            ui: {
                title: code === 'NETWORK_ERROR' ? 'No Internet Connection' : (code === 'AUTHORIZATION_ERROR' ? 'Permission Denied' : 'Unexpected Error Occurred'),
                actions: code === 'AUTHORIZATION_ERROR' ? ['Request Access', 'Contact Administrator'] : ['Retry'],
                ariaLive: code === 'SERVER_ERROR' ? 'assertive' : 'polite',
                keyboardAccessible: true,
                screenReaderCompatible: true
            },
            governance: {
                tenantIsolationPreserved: true,
                errorGovernancePreserved: true,
                apiResponseStandardized: true
            }
        });
    }

    function createApiSuccess(data = {}, message = '') {
        if (framework()?.createApiSuccess) return framework().createApiSuccess(data, message);
        return freezeOutput({ success: true, message, data });
    }

    function createApiError(error, context = {}) {
        if (framework()?.createApiError) return framework().createApiError(error, context);
        const normalized = normalizeErrorPayload(error, context);
        logError(error, context);
        return freezeOutput({
            success: false,
            error_code: normalized.error_code,
            message: normalized.message,
            details: normalized.details || {}
        });
    }

    function createValidationError(input = {}, context = {}) {
        if (framework()?.createValidationError) return framework().createValidationError(input, context);
        return freezeOutput({
            success: false,
            error_code: 'VALIDATION_ERROR',
            message: input.message || 'Please correct the highlighted fields.',
            details: { field: input.field || '', inlineMessage: input.message || '' },
            ui: { fieldHighlight: true, inlineMessage: true, preventSubmit: true, ariaLive: 'polite' }
        });
    }

    function createUIState(state, options = {}, context = {}) {
        if (framework()?.createUIState) return framework().createUIState(state, options, context);
        const normalized = UI_STATES.includes(String(state || '').toUpperCase()) ? String(state).toUpperCase() : 'ERROR';
        return freezeOutput({
            state: normalized,
            title: options.title || normalized.replace(/_/g, ' '),
            message: options.message || '',
            aria: { live: normalized === 'ERROR' ? 'assertive' : 'polite', role: normalized === 'ERROR' ? 'alert' : 'status' },
            keyboardAccessible: true,
            screenReaderCompatible: true,
            actions: normalized === 'PERMISSION_DENIED' ? [{ label: 'Request Access' }, { label: 'Contact Administrator' }] : []
        });
    }

    function showToast(input, context = {}) {
        if (framework()?.showToast) return framework().showToast(input, context);
        const payload = typeof input === 'object' ? input : { message: input };
        const message = payload.message || '';
        showMessage(message, payload.type || 'info');
        return freezeOutput({ type: payload.type || 'INFO', message, ariaLive: payload.type === 'ERROR' ? 'assertive' : 'polite' });
    }

    global.errorService = {
        ERROR_CATEGORIES,
        SEVERITIES,
        UI_STATES,
        formatError,
        userMessage,
        logError,
        logGovernedError: (error, context = {}) => framework()?.logError ? framework().logError(error, context) : logError(error, context),
        showMessage,
        showToast,
        withTimeout,
        beginProcessing,
        safeAsync,
        guardedAction,
        wrapGlobalAction,
        retry,
        normalizeErrorPayload,
        createValidationError,
        createApiSuccess,
        createApiError,
        createUIState,
        createConfirmationDialog: (input, context = {}) => framework()?.createConfirmationDialog ? framework().createConfirmationDialog(input, context) : freezeOutput({ required: /delete|archive|reset|remove|bulk/i.test(String(input?.action || '')), message: 'This action cannot be undone.' }),
        withErrorBoundary: (boundary, action, context = {}) => framework()?.withErrorBoundary ? framework().withErrorBoundary(boundary, action, context) : safeAsync(action, { ...context, message: false }),
        generateErrorGovernanceReport: (input, context = {}) => framework()?.generateErrorGovernanceReport ? framework().generateErrorGovernanceReport(input, context) : freezeOutput({ success: true, summary: { totalErrors: 0 }, integrationHealth: { frameworkLoaded: false } }),
        freezeErrorOutput: freezeOutput
    };
})(typeof window !== 'undefined' ? window : globalThis);
