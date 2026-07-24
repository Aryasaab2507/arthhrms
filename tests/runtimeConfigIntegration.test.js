const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'arthhrms-runtime-config-'));
const envFile = path.join(tempDirectory, '.env.local');
const outputFile = path.join(tempDirectory, 'runtime-config.js');
const publicKey = 'sb_publishable_runtime_config_integration_test';
const serviceKey = 'server_only_runtime_config_integration_test';
const variableNames = [
  'APP_ENV', 'PRODUCTION_MODE', 'PILOT_MODE', 'DEVELOPMENT_MODE', 'DEMO_MODE',
  'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY',
  'SUPABASE_TIMEOUT_MS', 'SUPABASE_SERVICE_ROLE_KEY', 'INVITE_USER_ENDPOINT',
  'AUTH_INVITE_REDIRECT_URL', 'REQUIRE_APP_METADATA_ROLE', 'REQUIRE_EMAIL_VERIFIED',
  'USE_SUPABASE_EMPLOYEES', 'USE_SUPABASE_ATTENDANCE', 'USE_SUPABASE_LEAVE',
  'USE_SUPABASE_EXPENSES', 'USE_SUPABASE_PAYROLL', 'USE_SUPABASE_IMPORTS',
  'USE_SUPABASE_AUTH', 'USE_SUPABASE_PASSWORD_RECOVERY', 'USE_SUPABASE_STORAGE', 'USE_SUPABASE_INVITES',
  'USE_SUPABASE_PERSISTENCE'
];

function generate(output, mode, environment, envPath = '') {
  const args = [
    path.join(root, 'scripts', 'generate-runtime-config.mjs'),
    output,
    `--mode=${mode}`
  ];
  if (envPath) args.push(`--env-file=${envPath}`);
  return spawnSync(process.execPath, args, {
    cwd: root,
    env: environment,
    encoding: 'utf8'
  });
}

try {
  fs.writeFileSync(envFile, [
    'APP_ENV=development',
    'PRODUCTION_MODE=false',
    'PILOT_MODE=false',
    'DEVELOPMENT_MODE=true',
    'DEMO_MODE=false',
    'SUPABASE_URL=https://runtime-config-test.supabase.co',
    `SUPABASE_PUBLISHABLE_KEY=${publicKey}`,
    'SUPABASE_ANON_KEY=',
    'SUPABASE_TIMEOUT_MS=12000',
    `SUPABASE_SERVICE_ROLE_KEY=${serviceKey}`,
    'INVITE_USER_ENDPOINT=https://runtime-config-test.supabase.co/functions/v1/invite-user',
    'AUTH_INVITE_REDIRECT_URL=http://localhost:3000/auth-callback.html',
    'REQUIRE_APP_METADATA_ROLE=true',
    'REQUIRE_EMAIL_VERIFIED=true',
    'USE_SUPABASE_EMPLOYEES=false',
    'USE_SUPABASE_ATTENDANCE=false',
    'USE_SUPABASE_LEAVE=false',
    'USE_SUPABASE_EXPENSES=false',
    'USE_SUPABASE_PAYROLL=false',
    'USE_SUPABASE_IMPORTS=false',
    'USE_SUPABASE_AUTH=true',
    'USE_SUPABASE_PASSWORD_RECOVERY=true',
    'USE_SUPABASE_STORAGE=true',
    'USE_SUPABASE_INVITES=true',
    'USE_SUPABASE_PERSISTENCE=true',
    ''
  ].join('\n'));

  const childEnvironment = { ...process.env };
  variableNames.forEach(name => delete childEnvironment[name]);
  const generated = generate(outputFile, 'local', childEnvironment, envFile);
  assert.equal(generated.status, 0, generated.stderr || generated.stdout);

  const runtimeSource = fs.readFileSync(outputFile, 'utf8');
  assert.ok(runtimeSource.includes(publicKey), 'publishable key should be injected into the local browser config');
  assert.ok(!runtimeSource.includes(serviceKey), 'service role key must never enter browser configuration');

  const captured = {};
  const context = {
    console,
    URL,
    document: { querySelector() { return null; } },
    supabase: {
      createClient(url, key, options) {
        captured.url = url;
        captured.key = key;
        captured.options = options;
        return { url, key, options };
      }
    }
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(runtimeSource, context);
  vm.runInContext(fs.readFileSync(path.join(root, 'services', 'supabaseClient.js'), 'utf8'), context);

  const config = context.supabaseClientService.readConfig();
  assert.equal(config.SUPABASE_URL, 'https://runtime-config-test.supabase.co');
  assert.equal(config.SUPABASE_PUBLISHABLE_KEY, publicKey);
  assert.equal(config.flags.USE_SUPABASE_AUTH, true);
  assert.equal(config.flags.USE_SUPABASE_PASSWORD_RECOVERY, true);
  assert.equal(config.flags.USE_SUPABASE_PERSISTENCE, true);
  assert.equal(config.flags.USE_SUPABASE_STORAGE, true);

  context.supabaseClientService.getClient();
  assert.equal(captured.url, config.SUPABASE_URL, 'Supabase client must receive the injected project URL');
  assert.equal(captured.key, publicKey, 'Supabase client must receive the injected publishable key');
  assert.equal(captured.options.auth.flowType, 'pkce');
  assert.equal(captured.options.auth.detectSessionInUrl, false, 'the explicit callback dispatcher must own PKCE exchange');

  const productionOutput = path.join(tempDirectory, 'runtime-config.production.js');
  const productionEnvironment = {
    ...childEnvironment,
    SUPABASE_URL: 'https://runtime-config-test.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: publicKey,
    VERCEL_PROJECT_PRODUCTION_URL: 'arthhrms.example.com'
  };
  const production = generate(productionOutput, 'production', productionEnvironment);
  assert.equal(production.status, 0, production.stderr || production.stdout);
  const productionContext = {};
  productionContext.window = productionContext;
  vm.createContext(productionContext);
  vm.runInContext(fs.readFileSync(productionOutput, 'utf8'), productionContext);
  const productionConfig = productionContext.ARTHHRMS_CONFIG;
  for (const flag of [
    'USE_SUPABASE_AUTH',
    'USE_SUPABASE_PASSWORD_RECOVERY',
    'USE_SUPABASE_PERSISTENCE',
    'USE_SUPABASE_STORAGE',
    'USE_SUPABASE_INVITES'
  ]) {
    assert.equal(productionConfig.flags[flag], true, `${flag} should default true in production`);
  }
  assert.equal(productionConfig.AUTH_INVITE_REDIRECT_URL, 'https://arthhrms.example.com/auth-callback.html');
  assert.equal(vm.runInContext('Object.isFrozen(ARTHHRMS_CONFIG) && Object.isFrozen(ARTHHRMS_CONFIG.flags)', productionContext), true);

  const overrideOutput = path.join(tempDirectory, 'runtime-config.override.js');
  const override = generate(overrideOutput, 'production', {
    ...productionEnvironment,
    USE_SUPABASE_STORAGE: 'false'
  });
  assert.equal(override.status, 0, override.stderr || override.stdout);
  const overrideSource = fs.readFileSync(overrideOutput, 'utf8');
  assert.match(overrideSource, /"USE_SUPABASE_STORAGE": false/, 'explicit optional feature overrides must be respected');

  const localDefaultOutput = path.join(tempDirectory, 'runtime-config.local-default.js');
  const localDefault = generate(localDefaultOutput, 'local', {
    ...childEnvironment,
    SUPABASE_URL: 'https://runtime-config-test.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: publicKey
  });
  assert.equal(localDefault.status, 0, localDefault.stderr || localDefault.stdout);
  const localDefaultSource = fs.readFileSync(localDefaultOutput, 'utf8');
  assert.match(localDefaultSource, /"USE_SUPABASE_AUTH": false/, 'local auth should remain opt-in');
  assert.match(localDefaultSource, /"USE_SUPABASE_PASSWORD_RECOVERY": false/, 'local recovery should remain opt-in');

  const missingRequired = generate(path.join(tempDirectory, 'runtime-config.invalid.js'), 'production', childEnvironment);
  assert.notEqual(missingRequired.status, 0, 'production generation must fail when required Supabase configuration is missing');
  assert.match(missingRequired.stderr, /SUPABASE_URL is required/);

  console.log('Runtime configuration integration tests passed.');
} finally {
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}
