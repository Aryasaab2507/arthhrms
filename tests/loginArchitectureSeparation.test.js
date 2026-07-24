const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

class Store {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function load(file) {
  delete require.cache[require.resolve(path.join(root, file))];
  require(path.join(root, file));
}

async function main() {
  const companyPage = fs.readFileSync(path.join(root, 'ArthHRMS.html'), 'utf8');
  assert.doesNotMatch(companyPage, /platform[_\s-]*owner/i, 'company login must not expose Platform Owner');
  assert.doesNotMatch(companyPage, /role-tab|data-role|login\(['"][a-z_]+/i, 'company login must not ask the user to select a role');
  assert.match(companyPage, /id="companyLoginForm"/, 'company login must expose one form');
  assert.match(companyPage, /id="forgotPasswordLink"[\s\S]*Forgot Password\?/i, 'company login must expose password recovery below the password field');
  assert.match(companyPage, /href="password-recovery\.html\?source=company"/, 'company login must open the password recovery page');
  assert.match(companyPage, /loginTenantWithSupabase\s*\(/, 'company login must use the tenant-only authentication boundary');
  assert.match(companyPage, /restoreTenantSessionFromSupabase\s*\(/, 'company login must restore only tenant sessions');

  const indexPage = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(indexPage, /location\.replace\(target\.href\)/, 'root entry must redirect to the canonical company login');
  assert.match(indexPage, /target\.search=location\.search/, 'root redirect must preserve the query string');
  assert.match(indexPage, /target\.hash=location\.hash/, 'root redirect must preserve the hash');
  assert.doesNotMatch(indexPage, /companyLoginForm|loginTenantWithSupabase/, 'root entry must not duplicate the company login flow');

  const platformPage = fs.readFileSync(path.join(root, 'platform-login.html'), 'utf8');
  assert.match(platformPage, /Platform Owner Login/, 'dedicated Platform Owner login must exist');
  assert.match(platformPage, /loginPlatformOwnerWithSupabase\s*\(/, 'platform login must use the platform-only authentication boundary');
  assert.match(platformPage, /restorePlatformSessionFromSupabase\s*\(/, 'platform login must restore only platform sessions');
  assert.match(platformPage, /location\.replace\(['"]platform-control\.html['"]\)/, 'platform login must redirect to Platform Control');
  assert.match(platformPage, /href="password-recovery\.html\?source=platform"/, 'platform login must open the password recovery page');
  assert.doesNotMatch(platformPage, /role-tab|data-role/, 'platform login must not expose role selection');

  const recoveryPage = fs.readFileSync(path.join(root, 'password-recovery.html'), 'utf8');
  assert.match(recoveryPage, /services\/passwordRecoveryUI\.js/, 'password recovery page must load the reusable recovery UI');
  assert.match(recoveryPage, /PasswordRecoveryUI\.mountRequest\s*\(/, 'password recovery page must mount the request component');
  assert.match(recoveryPage, /authService\.requestPasswordRecovery\s*\(/, 'password recovery page must call the real auth API');

  const guardSource = fs.readFileSync(path.join(root, 'services', 'authGuard.js'), 'utf8');
  assert.match(guardSource, /'platform-login\.html'/, 'dedicated platform login must be registered as a public route');
  assert.match(
    guardSource,
    /allowedRoles\.length === 1 && allowedRoles\[0\] === 'platform_owner'[\s\S]*'platform-login\.html'/,
    'platform-only protected routes must return to the dedicated platform login'
  );

  global.window = global;
  global.sessionStorage = new Store();
  global.location = {
    origin: 'https://hrms.example.com',
    pathname: '/ArthHRMS.html',
    replace() {}
  };
  global.navigator = { userAgent: 'Login separation test', platform: 'test' };

  let role = 'employee';
  let authUserId = 'AUTH-employee';
  let signOutCount = 0;
  let resetRequest = null;

  function user() {
    const tenantRole = role !== 'platform_owner';
    return {
      id: authUserId,
      email: `${role}@example.com`,
      email_confirmed_at: '2026-07-24T00:00:00.000Z',
      app_metadata: {
        role,
        empId: ['employee', 'manager', 'hr'].includes(role) ? `EMP-${role}` : null,
        tenantSlug: tenantRole ? 'tenant-a' : '',
        tenantId: tenantRole ? 'TEN-tenant-a' : '',
        active: true
      },
      user_metadata: { full_name: 'Authenticated User' }
    };
  }

  const client = {
    auth: {
      async getSession() {
        return {
          data: {
            session: {
              access_token: 'validated-access-token',
              expires_at: Math.floor(Date.now() / 1000) + 3600,
              user: { id: authUserId }
            }
          },
          error: null
        };
      },
      async getUser() { return { data: { user: user() }, error: null }; },
      async signOut() { signOutCount += 1; return { error: null }; },
      async signInWithPassword(credentials) {
        assert.deepEqual(Object.keys(credentials).sort(), ['email', 'password'], 'role must never be sent as a login credential');
        return {
          data: {
            session: {
              access_token: 'new-access-token',
              expires_at: Math.floor(Date.now() / 1000) + 3600,
              user: { id: authUserId }
            },
            user: { id: authUserId }
          },
          error: null
        };
      },
      async resetPasswordForEmail(email, options) {
        resetRequest = { email, options };
        return { data: {}, error: null };
      },
      onAuthStateChange() {
        return { data: { subscription: { unsubscribe() {} } } };
      }
    }
  };

  global.supabaseClientService = {
    isEnabled(name) { return ['USE_SUPABASE_AUTH', 'USE_SUPABASE_PASSWORD_RECOVERY'].includes(name); },
    getClient() { return client; },
    readConfig() {
      return {
        AUTH_INVITE_REDIRECT_URL: 'https://hrms.example.com/auth-callback.html',
        SUPABASE_TIMEOUT_MS: 10000,
        flags: {
          USE_SUPABASE_AUTH: true,
          USE_SUPABASE_PASSWORD_RECOVERY: true,
          PRODUCTION_MODE: true,
          REQUIRE_APP_METADATA_ROLE: true,
          REQUIRE_EMAIL_VERIFIED: true
        }
      };
    }
  };

  load('services/authService.js');

  const tenantRedirects = {
    super_admin: 'super-admin.html',
    admin: 'admin.html',
    hr: 'hr-dashboard.html',
    manager: 'manager.html',
    employee: 'employee-portal.html'
  };
  for (const [trustedRole, redirectTo] of Object.entries(tenantRedirects)) {
    role = trustedRole;
    authUserId = `AUTH-${trustedRole}`;
    const result = await global.authService.loginTenantWithSupabase('account@example.com', 'never-logged');
    assert.equal(result?.user?.role, trustedRole, `${trustedRole} must be read from app_metadata`);
    assert.equal(result?.redirectTo, redirectTo, `${trustedRole} must receive its role home`);
  }

  role = 'platform_owner';
  authUserId = 'AUTH-platform-owner';
  const tenantRejection = await global.authService.loginTenantWithSupabase('owner@example.com', 'never-logged');
  assert.equal(tenantRejection, null, 'Platform Owner credentials must fail closed on the company login boundary');

  role = 'employee';
  authUserId = 'AUTH-employee-platform-attempt';
  const platformRejection = await global.authService.loginPlatformOwnerWithSupabase('employee@example.com', 'never-logged');
  assert.equal(platformRejection, null, 'tenant credentials must fail closed on the platform login boundary');

  role = 'platform_owner';
  authUserId = 'AUTH-platform-owner-valid';
  const platformResult = await global.authService.loginPlatformOwnerWithSupabase('owner@example.com', 'never-logged');
  assert.equal(platformResult?.user?.role, 'platform_owner', 'trusted Platform Owner metadata must be accepted');
  assert.equal(platformResult?.redirectTo, 'platform-control.html', 'Platform Owner must receive Platform Control');
  assert.ok(signOutCount >= 3, 'session rotation and rejected surface attempts must invalidate local sessions');

  const reset = await global.authService.requestPasswordRecovery('USER@Example.com');
  assert.equal(reset.ok, true, 'password recovery request must be accepted');
  assert.equal(resetRequest.email, 'user@example.com', 'recovery email must be normalized');
  assert.equal(resetRequest.options.redirectTo, 'https://hrms.example.com/auth-callback.html?flow=recovery', 'recovery must use the approved typed callback');
  assert.match(reset.message, /if an account exists/i, 'recovery response must resist account enumeration');

  const invalidReset = await global.authService.requestPasswordRecovery('not-an-email');
  assert.equal(invalidReset.ok, false, 'invalid email must be rejected before the network request');

  const callbackSource = fs.readFileSync(path.join(root, 'auth-callback.html'), 'utf8');
  assert.match(callbackSource, /passwordRecoveryUI/, 'existing recovery callback UI must remain wired');
  assert.match(callbackSource, /updateRecoveredPassword/, 'existing password update flow must remain wired');

  console.log('loginArchitectureSeparation.test.js passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
