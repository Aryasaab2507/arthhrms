const BOOLEAN_VALUES = Object.freeze(new Set(['true', 'false']));

export const LEGACY_SUPABASE_FLAGS = Object.freeze([
  'USE_SUPABASE_EMPLOYEES',
  'USE_SUPABASE_ATTENDANCE',
  'USE_SUPABASE_LEAVE',
  'USE_SUPABASE_EXPENSES',
  'USE_SUPABASE_PAYROLL',
  'USE_SUPABASE_IMPORTS'
]);

export const CANONICAL_SUPABASE_FLAGS = Object.freeze([
  'USE_SUPABASE_AUTH',
  'USE_SUPABASE_PASSWORD_RECOVERY',
  'USE_SUPABASE_STORAGE',
  'USE_SUPABASE_INVITES',
  'USE_SUPABASE_PERSISTENCE'
]);

function booleanValue(env, name, fallback = false) {
  const raw = env[name];
  if (raw === undefined || raw === null || raw === '') return fallback;
  if (raw === true || raw === false) return raw;
  const normalized = String(raw).trim().toLowerCase();
  if (!BOOLEAN_VALUES.has(normalized)) throw new Error(`${name} must be true or false.`);
  return normalized === 'true';
}

function requiredValue(env, name) {
  const value = String(env[name] || '').trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function validateHttpsUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch (_error) {
    throw new Error(`${label} must be a valid URL.`);
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error(`${label} must use HTTPS without embedded credentials.`);
  }
  return parsed;
}

function normalizeHostedOrigin(env, isProduction) {
  const explicit = String(env.APP_ORIGIN || '').trim();
  const productionHost = String(env.VERCEL_PROJECT_PRODUCTION_URL || '').trim();
  const previewHost = String(env.VERCEL_URL || '').trim();
  const vercelHost = isProduction ? productionHost : (previewHost || productionHost);
  const candidate = explicit || (vercelHost
    ? `${/^https?:\/\//i.test(vercelHost) ? '' : 'https://'}${vercelHost}`
    : '');
  if (!candidate) return '';
  const parsed = validateHttpsUrl(candidate, explicit ? 'APP_ORIGIN' : 'Vercel application URL');
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(`${explicit ? 'APP_ORIGIN' : 'Vercel application URL'} must be an origin without a path, query, or fragment.`);
  }
  if (isProduction && explicit && productionHost && previewHost && String(env.VERCEL_ENV || '').trim().toLowerCase() === 'preview') {
    const productionOrigin = validateHttpsUrl(
      `${/^https?:\/\//i.test(productionHost) ? '' : 'https://'}${productionHost}`,
      'VERCEL_PROJECT_PRODUCTION_URL'
    ).origin;
    const previewOrigin = validateHttpsUrl(
      `${/^https?:\/\//i.test(previewHost) ? '' : 'https://'}${previewHost}`,
      'VERCEL_URL'
    ).origin;
    if (parsed.origin === previewOrigin && previewOrigin !== productionOrigin) {
      throw new Error('APP_ORIGIN must not use VERCEL_URL from a preview deployment in production mode.');
    }
  }
  return parsed.origin;
}

function validateCallbackUrl(value, isProduction, field, expectedFlow = '') {
  if (!value) return '';
  let parsed;
  try {
    parsed = new URL(value);
  } catch (_error) {
    throw new Error(`${field} must be a valid URL.`);
  }
  const localHttp = !isProduction && parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  if ((parsed.protocol !== 'https:' && !localHttp) || parsed.username || parsed.password) {
    throw new Error(`${field} must use HTTPS, except for local loopback development.`);
  }
  if (!/\/auth-callback\.html$/i.test(parsed.pathname) || parsed.hash) {
    throw new Error(`${field} must target the exact /auth-callback.html path.`);
  }
  const queryIsValid = expectedFlow
    ? parsed.searchParams.size === 1 && parsed.searchParams.get('flow') === expectedFlow
    : !parsed.search;
  if (!queryIsValid) {
    const suffix = expectedFlow ? `?flow=${expectedFlow}` : 'without a query';
    throw new Error(`${field} must target /auth-callback.html ${suffix}.`);
  }
  return parsed.href;
}

export function createUnconfiguredRuntimeConfig() {
  return {
    APP_ENV: 'unconfigured',
    PRODUCTION_MODE: false,
    PILOT_MODE: false,
    DEVELOPMENT_MODE: false,
    DEMO_MODE: false,
    SUPABASE_URL: '',
    SUPABASE_ANON_KEY: '',
    SUPABASE_PUBLISHABLE_KEY: '',
    SUPABASE_TIMEOUT_MS: 10000,
    APP_ORIGIN: '',
    INVITE_USER_ENDPOINT: '',
    AUTH_INVITE_REDIRECT_URL: '',
    PASSWORD_RECOVERY_REDIRECT_URL: '',
    REQUIRE_APP_METADATA_ROLE: true,
    REQUIRE_EMAIL_VERIFIED: true,
    flags: Object.fromEntries([
      ...LEGACY_SUPABASE_FLAGS,
      ...CANONICAL_SUPABASE_FLAGS
    ].map((name) => [name, false]))
  };
}

export function resolveRuntimeConfig(env = process.env, requestedMode = 'production') {
  const mode = String(requestedMode || 'production').trim().toLowerCase();
  if (!['local', 'production'].includes(mode)) {
    throw new Error('Runtime config mode must be local or production.');
  }
  const isProduction = mode === 'production';
  const appEnvironment = String(env.APP_ENV || (isProduction ? 'production' : 'development')).trim().toLowerCase();
  const supabaseUrl = requiredValue(env, 'SUPABASE_URL');
  const parsedSupabaseUrl = validateHttpsUrl(supabaseUrl, 'SUPABASE_URL');
  const publicKey = String(env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || '').trim();
  if (!publicKey) throw new Error('SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY is required.');
  if (/[\r\n"'\\]/.test(publicKey)) throw new Error('The Supabase browser key contains invalid characters.');
  if (publicKey === String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim()) {
    throw new Error('The browser key must never equal SUPABASE_SERVICE_ROLE_KEY.');
  }

  const flags = Object.fromEntries(LEGACY_SUPABASE_FLAGS.map((name) => [name, booleanValue(env, name, false)]));
  for (const name of CANONICAL_SUPABASE_FLAGS) {
    flags[name] = booleanValue(env, name, isProduction);
  }

  const productionFlags = {
    PRODUCTION_MODE: booleanValue(env, 'PRODUCTION_MODE', isProduction),
    PILOT_MODE: booleanValue(env, 'PILOT_MODE', false),
    DEVELOPMENT_MODE: booleanValue(env, 'DEVELOPMENT_MODE', !isProduction),
    DEMO_MODE: booleanValue(env, 'DEMO_MODE', false)
  };
  if (isProduction) {
    if (appEnvironment !== 'production') throw new Error('APP_ENV must be production for a production runtime config.');
    if (!productionFlags.PRODUCTION_MODE || productionFlags.PILOT_MODE || productionFlags.DEVELOPMENT_MODE || productionFlags.DEMO_MODE) {
      throw new Error('Production runtime mode flags are malformed or contradictory.');
    }
  } else if (productionFlags.PRODUCTION_MODE) {
    throw new Error('Local runtime config cannot enable production mode.');
  }

  if (flags.USE_SUPABASE_PERSISTENCE) {
    for (const legacyFlag of LEGACY_SUPABASE_FLAGS) {
      if (flags[legacyFlag]) {
        throw new Error(`${legacyFlag} cannot be enabled with canonical Supabase persistence.`);
      }
    }
  }

  const hostedOrigin = normalizeHostedOrigin(env, isProduction);
  const inviteUserEndpoint = flags.USE_SUPABASE_INVITES
    ? String(env.INVITE_USER_ENDPOINT || `${parsedSupabaseUrl.origin}/functions/v1/invite-user`).trim()
    : '';
  if (inviteUserEndpoint) validateHttpsUrl(inviteUserEndpoint, 'INVITE_USER_ENDPOINT');
  const inviteCallbackEnabled = flags.USE_SUPABASE_AUTH && flags.USE_SUPABASE_INVITES;
  const recoveryCallbackEnabled = flags.USE_SUPABASE_AUTH && flags.USE_SUPABASE_PASSWORD_RECOVERY;
  if (isProduction && (inviteCallbackEnabled || recoveryCallbackEnabled) && !hostedOrigin) {
    throw new Error('APP_ORIGIN or VERCEL_PROJECT_PRODUCTION_URL is required for production authentication callbacks.');
  }
  const authInviteRedirectUrl = inviteCallbackEnabled
    ? validateCallbackUrl(
      String(env.AUTH_INVITE_REDIRECT_URL || (hostedOrigin ? `${hostedOrigin}/auth-callback.html` : '')).trim(),
      isProduction,
      'AUTH_INVITE_REDIRECT_URL'
    )
    : '';
  const passwordRecoveryRedirectUrl = recoveryCallbackEnabled
    ? validateCallbackUrl(
      String(env.PASSWORD_RECOVERY_REDIRECT_URL || (hostedOrigin ? `${hostedOrigin}/auth-callback.html?flow=recovery` : '')).trim(),
      isProduction,
      'PASSWORD_RECOVERY_REDIRECT_URL',
      'recovery'
    )
    : '';
  if (isProduction) {
    for (const [field, value] of [
      ['AUTH_INVITE_REDIRECT_URL', authInviteRedirectUrl],
      ['PASSWORD_RECOVERY_REDIRECT_URL', passwordRecoveryRedirectUrl]
    ]) {
      if (value && new URL(value).origin !== hostedOrigin) {
        throw new Error(`${field} must use the production APP_ORIGIN.`);
      }
    }
  }
  if (authInviteRedirectUrl && passwordRecoveryRedirectUrl && authInviteRedirectUrl === passwordRecoveryRedirectUrl) {
    throw new Error('Invitation and password recovery redirects must remain distinct.');
  }

  const timeout = Number(env.SUPABASE_TIMEOUT_MS || 10000);
  if (!Number.isFinite(timeout) || timeout < 1000 || timeout > 60000) {
    throw new Error('SUPABASE_TIMEOUT_MS must be between 1000 and 60000.');
  }

  return {
    APP_ENV: appEnvironment,
    ...productionFlags,
    SUPABASE_URL: parsedSupabaseUrl.origin,
    SUPABASE_ANON_KEY: publicKey,
    SUPABASE_PUBLISHABLE_KEY: publicKey,
    SUPABASE_TIMEOUT_MS: timeout,
    APP_ORIGIN: hostedOrigin,
    INVITE_USER_ENDPOINT: inviteUserEndpoint,
    AUTH_INVITE_REDIRECT_URL: authInviteRedirectUrl,
    PASSWORD_RECOVERY_REDIRECT_URL: passwordRecoveryRedirectUrl,
    REQUIRE_APP_METADATA_ROLE: booleanValue(env, 'REQUIRE_APP_METADATA_ROLE', true),
    REQUIRE_EMAIL_VERIFIED: booleanValue(env, 'REQUIRE_EMAIL_VERIFIED', true),
    flags
  };
}

export function serializeBrowserRuntimeConfig(config) {
  const serialized = JSON.stringify(config, null, 2).replaceAll('<', '\\u003c');
  return [
    '(function installArthRuntimeConfig() {',
    `  const config = ${serialized};`,
    '  config.flags = Object.freeze(config.flags);',
    "  Object.defineProperty(window, 'ARTHHRMS_CONFIG', {",
    '    value: Object.freeze(config),',
    '    writable: false,',
    '    configurable: false,',
    '    enumerable: true',
    '  });',
    '}());',
    ''
  ].join('\n');
}
