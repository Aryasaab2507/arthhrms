const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function jsonResponse(value, status = 200) {
  return new Response(value == null ? '' : JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

(async () => {
  const root = path.resolve(__dirname, '..');
  const authGuardSource = fs.readFileSync(path.join(root, 'services', 'authGuard.js'), 'utf8');
  const hrDashboardSource = fs.readFileSync(path.join(root, 'hr-dashboard.html'), 'utf8');
  const onboarding = await import(pathToFileURL(path.join(root, 'scripts', 'pilot-onboarding.mjs')));
  const hosted = await import(pathToFileURL(path.join(root, 'scripts', 'configure-pilot.mjs')));

  const runtimeConfigIndex = authGuardSource.indexOf("new URL('runtime-config.js'");
  const supabaseRuntimeIndex = authGuardSource.indexOf("if (!global.supabase)");
  assert.ok(runtimeConfigIndex >= 0 && runtimeConfigIndex < supabaseRuntimeIndex,
    'the route guard must load runtime configuration before Supabase authentication');
  assert.match(hrDashboardSource, /addEventListener\('arthhrms:persistence-ready'/,
    'the HR dashboard must render the authenticated state after Supabase hydration');

  assert.equal(onboarding.requireHttpsOrigin('https://pilot.example.com/'), 'https://pilot.example.com');
  assert.throws(() => onboarding.requireHttpsOrigin('http://pilot.example.com'), /HTTPS origin/);
  assert.throws(() => onboarding.requireHttpsOrigin('https://pilot.example.com/path'), /must not include a path/);

  const validatedAdmin = onboarding.validateOnboardingInput({
    role: 'super_admin',
    name: 'Pilot Administrator',
    email: 'pilot.admin@example.com',
    tenantId: 'Pilot Tenant',
    organizationId: 'ORG-PILOT',
    appOrigin: 'https://pilot.example.com',
    redirectTo: 'https://pilot.example.com/auth-callback.html',
    allowedOrigins: 'https://pilot.example.com'
  });
  assert.equal(validatedAdmin.tenantId, 'pilot-tenant');
  assert.equal(validatedAdmin.role, 'super_admin');
  assert.throws(() => onboarding.validateOnboardingInput({
    ...validatedAdmin,
    name: 'Pilot Administrator',
    appOrigin: 'https://pilot.example.com',
    redirectTo: 'https://attacker.example.com/auth-callback.html'
  }), /exact hosted/);

  const calls = [];
  const successfulFetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes('/auth/v1/admin/users?')) return jsonResponse({ users: [] });
    if (url.includes('/auth/v1/invite?')) return jsonResponse({ id: '00000000-0000-4000-8000-000000000001' });
    if (url.includes('/auth/v1/admin/users/')) return jsonResponse({ id: '00000000-0000-4000-8000-000000000001' });
    if (url.includes('/rest/v1/')) return jsonResponse(null, 201);
    return jsonResponse({ message: 'unexpected request' }, 500);
  };
  const created = await onboarding.onboardPrivilegedUser({
    role: 'platform_owner',
    name: 'Platform Owner',
    email: 'owner@example.com',
    appOrigin: 'https://pilot.example.com',
    redirectTo: 'https://pilot.example.com/auth-callback.html',
    allowedOrigins: 'https://pilot.example.com',
    supabaseUrl: 'https://abcdefghijklmnopqrst.supabase.co',
    serviceRoleKey: 'server-only-test-key',
    apply: true
  }, { fetchImpl: successfulFetch });
  assert.equal(created.invited, true);
  assert.ok(calls.some((call) => call.url.includes('/auth/v1/invite?')), 'onboarding should use an invite');
  const updateCall = calls.find((call) => call.options.method === 'PUT');
  const updateBody = JSON.parse(updateCall.options.body);
  assert.equal(updateBody.app_metadata.role, 'platform_owner');
  assert.equal(Object.hasOwn(updateBody, 'password'), false);
  assert.equal(calls.filter((call) => call.url.includes('/rest/v1/')).length, 2, 'identity and audit records should be written');

  const rollbackCalls = [];
  const failingFetch = async (url, options = {}) => {
    rollbackCalls.push({ url, options });
    if (url.includes('/auth/v1/admin/users?')) return jsonResponse({ users: [] });
    if (url.includes('/auth/v1/invite?')) return jsonResponse({ id: '00000000-0000-4000-8000-000000000002' });
    if (options.method === 'PUT') return jsonResponse({ id: '00000000-0000-4000-8000-000000000002' });
    if (url.includes('/rest/v1/hrms_identity_records') && options.method === 'POST') {
      return jsonResponse({ message: 'persistence unavailable' }, 503);
    }
    if (options.method === 'DELETE') return jsonResponse(null);
    return jsonResponse({ message: 'unexpected request' }, 500);
  };
  await assert.rejects(onboarding.onboardPrivilegedUser({
    role: 'super_admin',
    name: 'Pilot Administrator',
    email: 'pilot.admin@example.com',
    tenantId: 'pilot',
    organizationId: 'pilot',
    appOrigin: 'https://pilot.example.com',
    redirectTo: 'https://pilot.example.com/auth-callback.html',
    allowedOrigins: 'https://pilot.example.com',
    supabaseUrl: 'https://abcdefghijklmnopqrst.supabase.co',
    serviceRoleKey: 'server-only-test-key',
    apply: true
  }, { fetchImpl: failingFetch }), /compensating rollback/);
  assert.ok(rollbackCalls.some((call) => call.url.includes('/auth/v1/admin/users/') && call.options.method === 'DELETE'));

  const config = hosted.buildHostedConfiguration({
    appOrigin: 'https://pilot.example.com',
    projectRef: 'abcdefghijklmnopqrst'
  });
  assert.deepEqual(config.authPatch, {
    site_url: 'https://pilot.example.com',
    uri_allow_list: 'https://pilot.example.com/auth-callback.html'
  });

  const managementCalls = [];
  const configured = await hosted.configureHostedPilot({
    appOrigin: 'https://pilot.example.com',
    projectRef: 'abcdefghijklmnopqrst',
    accessToken: 'management-test-token',
    apply: true
  }, {
    fetchImpl: async (_url, _token, options) => {
      managementCalls.push(options.method);
      if (options.method === 'GET') {
        return {
          site_url: 'https://pilot.example.com',
          uri_allow_list: 'https://pilot.example.com/auth-callback.html'
        };
      }
      return {};
    },
    spawnImpl: (_command, args, options) => {
      assert.ok(args.includes('ALLOWED_ORIGINS=https://pilot.example.com'));
      assert.equal(options.env.SUPABASE_ACCESS_TOKEN, 'management-test-token');
      return { status: 0 };
    }
  });
  assert.equal(configured.configured, true);
  assert.deepEqual(managementCalls, ['PATCH', 'GET']);

  console.log('pilotDeploymentPreparation.test.js passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
