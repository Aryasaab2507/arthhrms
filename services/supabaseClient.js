// Supabase client foundation for ARTHHRMS.
// Business persistence is enabled only through reviewed environment configuration and RLS.
(function (global) {
    const DEFAULT_FLAGS = {
        USE_SUPABASE_EMPLOYEES: false,
        USE_SUPABASE_ATTENDANCE: false,
        USE_SUPABASE_LEAVE: false,
        USE_SUPABASE_EXPENSES: false,
        USE_SUPABASE_PAYROLL: false,
        USE_SUPABASE_AUTH: false,
        USE_SUPABASE_PASSWORD_RECOVERY: false,
        USE_SUPABASE_IMPORTS: false,
        USE_SUPABASE_STORAGE: false,
        USE_SUPABASE_INVITES: false,
        USE_SUPABASE_PERSISTENCE: false,
        PRODUCTION_MODE: false,
        PILOT_MODE: false,
        DEVELOPMENT_MODE: false,
        DEMO_MODE: false,
        REQUIRE_APP_METADATA_ROLE: true,
        REQUIRE_EMAIL_VERIFIED: true
    };
    let singletonClient = null;

    function flagValue(injected, name, fallback = false) {
        const value = injected.flags?.[name] ?? injected[name];
        if (value === undefined || value === null || value === '') return fallback;
        if (value === true || value === false) return value;
        const normalized = String(value).trim().toLowerCase();
        return normalized === 'true' ? true : normalized === 'false' ? false : fallback;
    }

    function readConfig() {
        const injected = global.ARTHHRMS_CONFIG || {};
        const flags = {
            ...DEFAULT_FLAGS,
            USE_SUPABASE_EMPLOYEES: flagValue(injected, 'USE_SUPABASE_EMPLOYEES', false),
            USE_SUPABASE_ATTENDANCE: flagValue(injected, 'USE_SUPABASE_ATTENDANCE', false),
            USE_SUPABASE_LEAVE: flagValue(injected, 'USE_SUPABASE_LEAVE', false),
            USE_SUPABASE_EXPENSES: flagValue(injected, 'USE_SUPABASE_EXPENSES', false),
            USE_SUPABASE_PAYROLL: flagValue(injected, 'USE_SUPABASE_PAYROLL', false),
            USE_SUPABASE_AUTH: flagValue(injected, 'USE_SUPABASE_AUTH', false),
            USE_SUPABASE_PASSWORD_RECOVERY: flagValue(injected, 'USE_SUPABASE_PASSWORD_RECOVERY', false),
            USE_SUPABASE_IMPORTS: flagValue(injected, 'USE_SUPABASE_IMPORTS', false),
            USE_SUPABASE_STORAGE: flagValue(injected, 'USE_SUPABASE_STORAGE', false),
            USE_SUPABASE_INVITES: flagValue(injected, 'USE_SUPABASE_INVITES', false),
            USE_SUPABASE_PERSISTENCE: flagValue(injected, 'USE_SUPABASE_PERSISTENCE', false),
            PRODUCTION_MODE: flagValue(injected, 'PRODUCTION_MODE', false),
            PILOT_MODE: flagValue(injected, 'PILOT_MODE', false),
            DEVELOPMENT_MODE: flagValue(injected, 'DEVELOPMENT_MODE', false),
            DEMO_MODE: flagValue(injected, 'DEMO_MODE', false),
            REQUIRE_APP_METADATA_ROLE: flagValue(injected, 'REQUIRE_APP_METADATA_ROLE', true),
            REQUIRE_EMAIL_VERIFIED: flagValue(injected, 'REQUIRE_EMAIL_VERIFIED', true)
        };
        const publicKey = String(injected.SUPABASE_PUBLISHABLE_KEY || injected.SUPABASE_ANON_KEY || '').trim();
        return {
            APP_ENV: String(injected.APP_ENV || 'unconfigured').trim().toLowerCase(),
            SUPABASE_URL: String(injected.SUPABASE_URL || '').trim(),
            SUPABASE_ANON_KEY: publicKey,
            SUPABASE_PUBLISHABLE_KEY: publicKey,
            APP_ORIGIN: String(injected.APP_ORIGIN || '').trim(),
            INVITE_USER_ENDPOINT: String(injected.INVITE_USER_ENDPOINT || '').trim(),
            AUTH_INVITE_REDIRECT_URL: String(injected.AUTH_INVITE_REDIRECT_URL || '').trim(),
            PASSWORD_RECOVERY_REDIRECT_URL: String(injected.PASSWORD_RECOVERY_REDIRECT_URL || '').trim(),
            SUPABASE_TIMEOUT_MS: Number(injected.SUPABASE_TIMEOUT_MS || 10000),
            flags
        };
    }

    function validateConfig() {
        const injected = global.ARTHHRMS_CONFIG;
        if (!injected || typeof injected !== 'object') return { ok: false, code: 'RUNTIME_CONFIG_MISSING' };
        for (const name of Object.keys(DEFAULT_FLAGS)) {
            const value = injected.flags?.[name] ?? injected[name];
            if (value !== undefined && value !== '' && value !== true && value !== false && !['true', 'false'].includes(String(value).trim().toLowerCase())) {
                return { ok: false, code: 'RUNTIME_FLAG_MALFORMED', field: name };
            }
        }
        const config = readConfig();
        let parsedUrl;
        try {
            parsedUrl = new URL(config.SUPABASE_URL);
        } catch (_error) {
            return { ok: false, code: 'SUPABASE_URL_INVALID' };
        }
        if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password) {
            return { ok: false, code: 'SUPABASE_URL_INSECURE' };
        }
        if (!config.SUPABASE_ANON_KEY || /[\r\n"'\\]/.test(config.SUPABASE_ANON_KEY)) {
            return { ok: false, code: 'SUPABASE_BROWSER_KEY_INVALID' };
        }
        if (
            injected.SUPABASE_SERVICE_ROLE_KEY &&
            String(injected.SUPABASE_SERVICE_ROLE_KEY).trim() === config.SUPABASE_ANON_KEY
        ) {
            return { ok: false, code: 'SUPABASE_SERVICE_KEY_EXPOSED' };
        }
        if (!Number.isFinite(config.SUPABASE_TIMEOUT_MS) || config.SUPABASE_TIMEOUT_MS < 1000 || config.SUPABASE_TIMEOUT_MS > 60000) {
            return { ok: false, code: 'SUPABASE_TIMEOUT_INVALID' };
        }
        if (config.APP_ENV === 'production') {
            if (
                !config.flags.PRODUCTION_MODE ||
                config.flags.PILOT_MODE ||
                config.flags.DEVELOPMENT_MODE ||
                config.flags.DEMO_MODE
            ) {
                return { ok: false, code: 'RUNTIME_MODE_CONFLICT' };
            }
        }
        if (config.flags.USE_SUPABASE_PERSISTENCE) {
            const legacyEnabled = [
                'USE_SUPABASE_EMPLOYEES',
                'USE_SUPABASE_ATTENDANCE',
                'USE_SUPABASE_LEAVE',
                'USE_SUPABASE_EXPENSES',
                'USE_SUPABASE_PAYROLL',
                'USE_SUPABASE_IMPORTS'
            ].find(name => config.flags[name]);
            if (legacyEnabled) return { ok: false, code: 'PERSISTENCE_MODE_CONFLICT', field: legacyEnabled };
        }
        if (config.INVITE_USER_ENDPOINT) {
            try {
                const endpoint = new URL(config.INVITE_USER_ENDPOINT);
                if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) {
                    return { ok: false, code: 'INVITE_ENDPOINT_INSECURE' };
                }
            } catch (_error) {
                return { ok: false, code: 'INVITE_ENDPOINT_INVALID' };
            }
        }
        let appOrigin = '';
        if (config.APP_ORIGIN) {
            try {
                const parsedOrigin = new URL(config.APP_ORIGIN);
                if (
                    parsedOrigin.protocol !== 'https:' ||
                    parsedOrigin.username ||
                    parsedOrigin.password ||
                    parsedOrigin.pathname !== '/' ||
                    parsedOrigin.search ||
                    parsedOrigin.hash
                ) {
                    return { ok: false, code: 'APP_ORIGIN_INVALID' };
                }
                appOrigin = parsedOrigin.origin;
            } catch (_error) {
                return { ok: false, code: 'APP_ORIGIN_INVALID' };
            }
        }
        const validateCallback = (value, field, expectedFlow = '') => {
            if (!value) return { ok: true, origin: '' };
            try {
                const callback = new URL(value);
                const localHttp = config.APP_ENV !== 'production' &&
                    callback.protocol === 'http:' &&
                    ['localhost', '127.0.0.1', '::1'].includes(callback.hostname);
                const queryIsValid = expectedFlow
                    ? callback.searchParams.size === 1 && callback.searchParams.get('flow') === expectedFlow
                    : !callback.search;
                if (
                    (callback.protocol !== 'https:' && !localHttp) ||
                    callback.username ||
                    callback.password ||
                    !/\/auth-callback\.html$/i.test(callback.pathname) ||
                    callback.hash ||
                    !queryIsValid
                ) {
                    return { ok: false, code: `${field}_INVALID` };
                }
                if (config.APP_ENV === 'production' && (!appOrigin || callback.origin !== appOrigin)) {
                    return { ok: false, code: `${field}_ORIGIN_MISMATCH` };
                }
                return { ok: true, origin: callback.origin };
            } catch (_error) {
                return { ok: false, code: `${field}_INVALID` };
            }
        };
        const inviteCallback = validateCallback(config.AUTH_INVITE_REDIRECT_URL, 'AUTH_INVITE_REDIRECT_URL');
        if (!inviteCallback.ok) return inviteCallback;
        const recoveryCallback = validateCallback(
            config.PASSWORD_RECOVERY_REDIRECT_URL,
            'PASSWORD_RECOVERY_REDIRECT_URL',
            'recovery'
        );
        if (!recoveryCallback.ok) return recoveryCallback;
        if (
            config.APP_ENV === 'production' &&
            config.flags.USE_SUPABASE_INVITES &&
            !config.AUTH_INVITE_REDIRECT_URL
        ) {
            return { ok: false, code: 'AUTH_INVITE_REDIRECT_URL_REQUIRED' };
        }
        if (
            config.APP_ENV === 'production' &&
            config.flags.USE_SUPABASE_PASSWORD_RECOVERY &&
            !config.PASSWORD_RECOVERY_REDIRECT_URL
        ) {
            return { ok: false, code: 'PASSWORD_RECOVERY_REDIRECT_URL_REQUIRED' };
        }
        if (
            config.AUTH_INVITE_REDIRECT_URL &&
            config.PASSWORD_RECOVERY_REDIRECT_URL &&
            config.AUTH_INVITE_REDIRECT_URL === config.PASSWORD_RECOVERY_REDIRECT_URL
        ) {
            return { ok: false, code: 'AUTH_REDIRECTS_NOT_ISOLATED' };
        }
        return { ok: true, code: 'RUNTIME_CONFIG_VALID', config };
    }

    function hasConfig() {
        return validateConfig().ok;
    }

    function isEnabled(flagName) {
        const config = readConfig();
        return !!(config.flags && config.flags[flagName]);
    }

    function getClient() {
        if (!hasConfig()) return null;
        if (singletonClient) return singletonClient;
        const factory = global.supabase && global.supabase.createClient;
        if (!factory) return null;
        const config = readConfig();
        singletonClient = factory(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: false,
                flowType: 'pkce',
                storageKey: 'arthhrms.supabase.auth'
            }
        });
        return singletonClient;
    }

    async function healthCheck() {
        const client = getClient();
        if (!client) return { ok: false, reason: hasConfig() ? 'Supabase JS library not loaded' : 'Supabase config missing' };
        try {
            const query = client.from('hrms_tenant_state').select('tenant_id', { count: 'exact', head: true });
            const { error } = global.errorService?.withTimeout
                ? await global.errorService.withTimeout(query, readConfig().SUPABASE_TIMEOUT_MS, 'Supabase health check')
                : await query;
            return error ? { ok: false, reason: error.message } : { ok: true };
        } catch (err) {
            return { ok: false, reason: err.message || String(err) };
        }
    }

    const supabaseClientService = {
        readConfig,
        validateConfig,
        hasConfig,
        isEnabled,
        getClient,
        healthCheck,
        flags: DEFAULT_FLAGS
    };

    global.supabaseClientService = global.supabaseClientService || supabaseClientService;
})(typeof window !== 'undefined' ? window : globalThis);
