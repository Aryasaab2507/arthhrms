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
        USE_SUPABASE_IMPORTS: false,
        USE_SUPABASE_STORAGE: false,
        USE_SUPABASE_INVITES: false,
        USE_SUPABASE_PERSISTENCE: false,
        PRODUCTION_MODE: false,
        PILOT_MODE: false,
        DEVELOPMENT_MODE: true,
        DEMO_MODE: true,
        REQUIRE_APP_METADATA_ROLE: true,
        REQUIRE_EMAIL_VERIFIED: true
    };

    function readMeta(name) {
        if (!global.document) return '';
        const node = global.document.querySelector(`meta[name="${name}"]`);
        return node ? String(node.getAttribute('content') || '').trim() : '';
    }

    function readConfig() {
        const injected = global.ARTHHRMS_CONFIG || {};
        const env = (global.process && global.process.env) || {};
        const flag = (name, fallback = false) => {
            const value = injected.flags?.[name] ?? injected[name] ?? env[name] ?? readMeta('arthhrms:' + name.toLowerCase().replace(/_/g, '-'));
            if (value === undefined || value === null || value === '') return fallback;
            if (value === true || value === false) return value;
            return String(value).toLowerCase() === 'true';
        };
        const flags = {
            ...DEFAULT_FLAGS,
            USE_SUPABASE_EMPLOYEES: flag('USE_SUPABASE_EMPLOYEES', false),
            USE_SUPABASE_ATTENDANCE: flag('USE_SUPABASE_ATTENDANCE', false),
            USE_SUPABASE_LEAVE: flag('USE_SUPABASE_LEAVE', false),
            USE_SUPABASE_EXPENSES: flag('USE_SUPABASE_EXPENSES', false),
            USE_SUPABASE_PAYROLL: flag('USE_SUPABASE_PAYROLL', false),
            USE_SUPABASE_AUTH: flag('USE_SUPABASE_AUTH', false),
            USE_SUPABASE_IMPORTS: flag('USE_SUPABASE_IMPORTS', false),
            USE_SUPABASE_STORAGE: flag('USE_SUPABASE_STORAGE', false),
            USE_SUPABASE_INVITES: flag('USE_SUPABASE_INVITES', false),
            USE_SUPABASE_PERSISTENCE: flag('USE_SUPABASE_PERSISTENCE', false),
            PRODUCTION_MODE: flag('PRODUCTION_MODE', false),
            PILOT_MODE: flag('PILOT_MODE', false),
            DEVELOPMENT_MODE: flag('DEVELOPMENT_MODE', true),
            DEMO_MODE: flag('DEMO_MODE', true),
            REQUIRE_APP_METADATA_ROLE: flag('REQUIRE_APP_METADATA_ROLE', true),
            REQUIRE_EMAIL_VERIFIED: flag('REQUIRE_EMAIL_VERIFIED', true)
        };
        const publicKey = injected.SUPABASE_PUBLISHABLE_KEY || injected.SUPABASE_ANON_KEY ||
            env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY ||
            readMeta('arthhrms:supabase-publishable-key') || readMeta('arthhrms:supabase-anon-key') || '';
        return {
            SUPABASE_URL: injected.SUPABASE_URL || env.SUPABASE_URL || readMeta('arthhrms:supabase-url') || '',
            SUPABASE_ANON_KEY: publicKey,
            SUPABASE_PUBLISHABLE_KEY: publicKey,
            INVITE_USER_ENDPOINT: injected.INVITE_USER_ENDPOINT || env.INVITE_USER_ENDPOINT || readMeta('arthhrms:invite-user-endpoint') || '',
            AUTH_INVITE_REDIRECT_URL: injected.AUTH_INVITE_REDIRECT_URL || env.AUTH_INVITE_REDIRECT_URL || readMeta('arthhrms:auth-invite-redirect-url') || '',
            SUPABASE_TIMEOUT_MS: Number(injected.SUPABASE_TIMEOUT_MS || env.SUPABASE_TIMEOUT_MS || 10000),
            flags
        };
    }

    function hasConfig() {
        const config = readConfig();
        return !!(config.SUPABASE_URL && config.SUPABASE_ANON_KEY);
    }

    function isEnabled(flagName) {
        const config = readConfig();
        return !!(config.flags && config.flags[flagName]);
    }

    function getClient() {
        if (!hasConfig()) return null;
        if (global.__arthSupabaseClient) return global.__arthSupabaseClient;
        const factory = global.supabase && global.supabase.createClient;
        if (!factory) return null;
        const config = readConfig();
        global.__arthSupabaseClient = factory(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true,
                flowType: 'pkce',
                storageKey: 'arthhrms.supabase.auth'
            }
        });
        return global.__arthSupabaseClient;
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
        hasConfig,
        isEnabled,
        getClient,
        healthCheck,
        flags: DEFAULT_FLAGS
    };

    global.supabaseClientService = global.supabaseClientService || supabaseClientService;
})(typeof window !== 'undefined' ? window : globalThis);
