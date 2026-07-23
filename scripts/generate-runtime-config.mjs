import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadEnvFile } from 'node:process';
import { parseArgs } from 'node:util';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    mode: { type: 'string', default: 'production' },
    'env-file': { type: 'string' }
  }
});
const mode = String(values.mode || 'production').trim().toLowerCase();
if (!['local', 'production'].includes(mode)) {
  throw new Error('Runtime config mode must be local or production.');
}
if (values['env-file']) {
  loadEnvFile(path.resolve(root, values['env-file']));
}
const output = path.resolve(root, positionals[0] || (mode === 'local' ? 'runtime-config.js' : 'dist/runtime-config.js'));
const env = process.env;

function boolean(name, fallback = false) {
  const value = env[name];
  if (value === undefined || value === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be true or false.`);
}

function required(name) {
  const value = String(env[name] || '').trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

const appEnvironment = String(env.APP_ENV || 'production').trim().toLowerCase();
const publicKey = String(env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || '').trim();
const supabaseUrl = required('SUPABASE_URL');
if (!/^https:\/\//i.test(supabaseUrl)) throw new Error('SUPABASE_URL must use HTTPS.');
if (!publicKey) throw new Error('SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY is required.');
if (publicKey === String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim()) {
  throw new Error('The browser key must never equal SUPABASE_SERVICE_ROLE_KEY.');
}

const flags = {
  USE_SUPABASE_EMPLOYEES: boolean('USE_SUPABASE_EMPLOYEES'),
  USE_SUPABASE_ATTENDANCE: boolean('USE_SUPABASE_ATTENDANCE'),
  USE_SUPABASE_LEAVE: boolean('USE_SUPABASE_LEAVE'),
  USE_SUPABASE_EXPENSES: boolean('USE_SUPABASE_EXPENSES'),
  USE_SUPABASE_PAYROLL: boolean('USE_SUPABASE_PAYROLL'),
  USE_SUPABASE_AUTH: boolean('USE_SUPABASE_AUTH'),
  USE_SUPABASE_IMPORTS: boolean('USE_SUPABASE_IMPORTS'),
  USE_SUPABASE_STORAGE: boolean('USE_SUPABASE_STORAGE'),
  USE_SUPABASE_INVITES: boolean('USE_SUPABASE_INVITES'),
  USE_SUPABASE_PERSISTENCE: boolean('USE_SUPABASE_PERSISTENCE')
};
const productionFlags = {
  PRODUCTION_MODE: boolean('PRODUCTION_MODE'),
  PILOT_MODE: boolean('PILOT_MODE'),
  DEVELOPMENT_MODE: boolean('DEVELOPMENT_MODE'),
  DEMO_MODE: boolean('DEMO_MODE')
};
if (mode === 'production') {
  if (appEnvironment !== 'production') throw new Error('APP_ENV must be production for a production runtime config.');
  if (!productionFlags.PRODUCTION_MODE || productionFlags.PILOT_MODE || productionFlags.DEVELOPMENT_MODE || productionFlags.DEMO_MODE) {
    throw new Error('Production mode must be enabled and pilot, development, and demo modes must be disabled.');
  }
  if (!flags.USE_SUPABASE_AUTH || !flags.USE_SUPABASE_PERSISTENCE || !flags.USE_SUPABASE_STORAGE || !flags.USE_SUPABASE_INVITES) {
    throw new Error('Supabase auth, persistence, storage, and invites must be enabled in production.');
  }
} else {
  if (productionFlags.PRODUCTION_MODE) throw new Error('Local runtime config cannot enable production mode.');
  if (!flags.USE_SUPABASE_AUTH || !flags.USE_SUPABASE_PERSISTENCE || !flags.USE_SUPABASE_STORAGE) {
    throw new Error('Supabase auth, persistence, and storage must be enabled for local application integration.');
  }
}
for (const legacyFlag of ['USE_SUPABASE_EMPLOYEES', 'USE_SUPABASE_ATTENDANCE', 'USE_SUPABASE_LEAVE', 'USE_SUPABASE_EXPENSES', 'USE_SUPABASE_PAYROLL', 'USE_SUPABASE_IMPORTS']) {
  if (flags[legacyFlag]) throw new Error(`${legacyFlag} must remain disabled when canonical persistence is enabled.`);
}

const inviteUserEndpoint = flags.USE_SUPABASE_INVITES ? required('INVITE_USER_ENDPOINT') : '';
const authInviteRedirectUrl = flags.USE_SUPABASE_INVITES ? required('AUTH_INVITE_REDIRECT_URL') : '';
const config = {
  APP_ENV: appEnvironment,
  ...productionFlags,
  SUPABASE_URL: supabaseUrl,
  SUPABASE_ANON_KEY: publicKey,
  SUPABASE_PUBLISHABLE_KEY: publicKey,
  SUPABASE_TIMEOUT_MS: Number(env.SUPABASE_TIMEOUT_MS || 10000),
  INVITE_USER_ENDPOINT: inviteUserEndpoint,
  AUTH_INVITE_REDIRECT_URL: authInviteRedirectUrl,
  REQUIRE_APP_METADATA_ROLE: boolean('REQUIRE_APP_METADATA_ROLE', true),
  REQUIRE_EMAIL_VERIFIED: boolean('REQUIRE_EMAIL_VERIFIED', true),
  flags
};
if (!Number.isFinite(config.SUPABASE_TIMEOUT_MS) || config.SUPABASE_TIMEOUT_MS < 1000 || config.SUPABASE_TIMEOUT_MS > 60000) {
  throw new Error('SUPABASE_TIMEOUT_MS must be between 1000 and 60000.');
}

const serialized = JSON.stringify(config, null, 2).replaceAll('<', '\\u003c');
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `window.ARTHHRMS_CONFIG = Object.freeze(${serialized});\n`, { encoding: 'utf8', mode: 0o600 });
console.log(`${mode === 'production' ? 'Production' : 'Local'} runtime config written to ${path.relative(root, output)} without server secrets.`);
