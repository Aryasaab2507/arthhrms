const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

class Store {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
}

function load(file) {
  delete require.cache[require.resolve(path.join(root, file))];
  require(path.join(root, file));
}

async function main() {
  global.window = global;
  global.localStorage = new Store();
  global.sessionStorage = new Store();
  global.location = {
    pathname: '/admin.html',
    href: '',
    replace(value) { this.href = value; }
  };
  global.navigator = { userAgent: 'Auth hardening test', platform: 'test' };
  global.CustomEvent = class CustomEvent { constructor(type, options) { this.type = type; this.detail = options?.detail; } };
  global.dispatchEvent = () => true;
  global.supabase = { createClient() { return {}; } };
  let domReadyHandler = null;
  global.document = {
    readyState: 'loading',
    currentScript: { src: 'https://hrms.example.com/services/authGuard.js' },
    scripts: [],
    head: { appendChild() {} },
    documentElement: {
      style: {},
      setAttribute() {},
      removeAttribute() {},
      appendChild() {}
    },
    createElement() { return { dataset: {}, set src(value) { this._src = value; }, get src() { return this._src; } }; },
    addEventListener(type, handler) { if (type === 'DOMContentLoaded') domReadyHandler = handler; }
  };

  let role = 'platform_owner';
  let userId = 'AUTH-1';
  let expiresAt = Math.floor(Date.now() / 1000) + 3600;
  let signInUserId = userId;
  let signOutCount = 0;
  let sessionAvailable = true;
  let hydrationCount = 0;

  function authUser() {
    return {
      id: userId,
      email: `${role}@example.com`,
      email_confirmed_at: '2026-07-01T00:00:00.000Z',
      app_metadata: {
        role,
        empId: ['employee', 'manager', 'hr'].includes(role) ? `EMP-${role}` : null,
        tenantSlug: role === 'platform_owner' ? '' : 'tenant-a',
        tenantId: role === 'platform_owner' ? '' : 'TEN-tenant-a',
        active: true
      },
      user_metadata: { full_name: role }
    };
  }

  const client = {
    auth: {
      async getSession() {
        return {
          data: {
            session: sessionAvailable
              ? { access_token: 'server-token', expires_at: expiresAt, user: { id: userId } }
              : null
          },
          error: null
        };
      },
      async getUser() { return { data: { user: authUser() }, error: null }; },
      async signOut() { signOutCount += 1; return { error: null }; },
      async signInWithPassword() {
        return { data: { session: { access_token: 'rotated-token', expires_at: expiresAt, user: { id: signInUserId } }, user: { id: signInUserId } }, error: null };
      },
      onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; }
    }
  };

  global.supabaseClientService = {
    isEnabled(flag) { return flag === 'USE_SUPABASE_AUTH'; },
    getClient() { return client; },
    readConfig() {
      return { flags: { USE_SUPABASE_AUTH: true, PRODUCTION_MODE: true, REQUIRE_APP_METADATA_ROLE: true, REQUIRE_EMAIL_VERIFIED: true } };
    }
  };
  global.supabasePersistenceService = {
    async hydrateAuthenticatedState() {
      hydrationCount += 1;
      return { hydrated: true, tenantId: 'tenant-a' };
    }
  };

  load('services/authService.js');
  load('services/rbacEnforcementService.js');
  load('services/authGuard.js');
  assert.equal(typeof domReadyHandler, 'function', 'guard should register before protected page initialization');

  const publicPages = new Set(['ArthHRMS.html', 'index.html', 'platform-login.html', 'password-recovery.html', 'auth-callback.html', '403.html']);
  const htmlPages = fs.readdirSync(root).filter(file => file.endsWith('.html')).sort();
  const protectedPages = htmlPages.filter(file => !publicPages.has(file));
  const policies = global.ArthAuthGuard.ROUTE_POLICIES;
  assert.deepEqual(Object.keys(policies).sort(), protectedPages.map(file => file.toLowerCase()).sort(), 'every protected HTML route must have exactly one role policy');
  protectedPages.forEach(file => {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(source, /services\/authGuard\.js/, `${file} must load the shared guard`);
    assert.match(source, /services\/supabaseClient\.js/, `${file} must load the Supabase runtime`);
    assert.match(source, /services\/authService\.js/, `${file} must load enterprise authentication`);
  });

  const platformControlSource = fs.readFileSync(path.join(root, 'platform-control.html'), 'utf8');
  const platformControlLinks = Array.from(
    platformControlSource.matchAll(/href="([^"]+\.html)(?:#[^"]*)?"/gi),
    match => match[1].split('/').pop().toLowerCase()
  );
  platformControlLinks.forEach(route => {
    if (publicPages.has(htmlPages.find(page => page.toLowerCase() === route))) return;
    assert.ok(policies[route]?.includes('platform_owner'), `Platform Control link ${route} must explicitly allow platform_owner`);
  });
  assert.doesNotMatch(platformControlSource, /href="(?:company-profile-center|organization-import-center)\.html"/i, 'Platform Control must not link Platform Owners into tenant configuration routes');
  assert.match(platformControlSource, /openPlatformPanel\('tenant'\)/, 'Company Profile navigation must remain inside Platform Tenant Governance');
  assert.match(platformControlSource, /openPlatformPanel\('migration'\)/, 'Organization Import navigation must remain inside Platform Migration Governance');

  const tenantOnlyRoutes = [
    'admin.html',
    'company-profile-center.html',
    'director.html',
    'employee-portal.html',
    'hr-dashboard.html',
    'manager.html',
    'organization-import-center.html',
    'super-admin.html'
  ];
  tenantOnlyRoutes.forEach(route => {
    assert.equal(policies[route]?.includes('platform_owner'), false, `${route} must remain isolated from platform_owner`);
  });

  const roleHomes = {
    platform_owner: 'platform-control.html',
    super_admin: 'super-admin.html',
    hr: 'hr-dashboard.html',
    manager: 'manager.html',
    employee: 'employee-portal.html'
  };
  for (const [testRole, route] of Object.entries(roleHomes)) {
    role = testRole;
    userId = `AUTH-${testRole}`;
    signInUserId = userId;
    expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const allowed = await global.authService.authorizePage(policies[route]);
    assert.equal(allowed.status, 200, `${testRole} should access its own route`);
    assert.equal(allowed.user.role, testRole);
  }

  role = 'super_admin';
  userId = 'AUTH-COMPANY-OWNER';
  signInUserId = userId;
  global.location.pathname = '/setup.html';
  global.location.href = '';
  const setupAllowed = await global.ArthAuthGuard.enforce('/setup.html');
  assert.equal(setupAllowed.status, 200, 'Company Owner role should pass the setup route guard');
  assert.equal(hydrationCount, 0, 'setup route must not run generic business-state hydration');
  assert.equal(global.ArthAuthGuard.usesDedicatedPersistence('/setup.html'), true);

  global.location.pathname = '/admin.html';
  const adminAllowed = await global.ArthAuthGuard.enforce('/admin.html');
  assert.equal(adminAllowed.status, 200);
  assert.equal(hydrationCount, 1, 'ordinary tenant routes should retain authenticated state hydration');

  role = 'platform_owner';
  userId = 'AUTH-platform_owner';
  signInUserId = userId;
  expiresAt = Math.floor(Date.now() / 1000) + 3600;
  for (const [route, allowedRoles] of Object.entries(policies).filter(([, allowedRoles]) => allowedRoles.includes('platform_owner'))) {
    const allowed = await global.authService.authorizePage(allowedRoles);
    assert.equal(allowed.status, 200, `platform_owner should access Platform Control route ${route}`);
    const routeDecision = global.rbacEnforcementService.authorizeRoute(route, allowedRoles, allowed.user);
    assert.equal(routeDecision.allowed, true, `central RBAC should authorize platform_owner for ${route}`);
  }

  role = 'employee';
  userId = 'AUTH-EMPLOYEE';
  const forbidden = await global.authService.authorizePage(policies['platform-control.html']);
  assert.equal(forbidden.status, 403, 'employee must receive a forbidden decision for Platform Control');
  assert.equal(forbidden.code, 'ROLE_FORBIDDEN');
  global.location.pathname = '/platform-control.html';
  global.location.href = '';
  const guardedForbidden = await global.ArthAuthGuard.enforce('/platform-control.html');
  assert.equal(guardedForbidden.status, 403, 'route guard must retain the forbidden status');
  assert.equal(global.location.href, '403.html', 'route guard must send unauthorized roles to Access Denied');

  global.sessionStorage.setItem('currentUser', JSON.stringify({
    id: 'AUTH-FORGED',
    authUserId: 'AUTH-FORGED',
    role: 'platform_owner',
    roleTrusted: true,
    source: 'supabase',
    sessionVersion: 1,
    sessionExpiresAt: Math.floor(Date.now() / 1000) + 3600
  }));
  sessionAvailable = false;
  global.location.pathname = '/platform-control.html';
  global.location.href = '';
  const forged = await global.ArthAuthGuard.enforce('/platform-control.html');
  assert.equal(forged.status, 401, 'forged browser state must not authorize a protected route');
  assert.match(global.location.href, /^platform-login\.html\?reason=/, 'forged platform state must redirect to the Platform Login');
  assert.equal(global.authService.getCurrentUser(), null, 'forged browser state must be cleared');
  sessionAvailable = true;

  expiresAt = Math.floor(Date.now() / 1000) - 1;
  const expired = await global.authService.validateCurrentSession();
  assert.equal(expired.status, 401, 'expired session must be rejected');
  assert.equal(expired.code, 'SESSION_EXPIRED');
  assert.equal(global.authService.getCurrentUser(), null, 'expired session cache must be cleared');

  expiresAt = Math.floor(Date.now() / 1000) + 3600;
  role = '';
  const missingRole = await global.authService.validateCurrentSession();
  assert.equal(missingRole.status, 401, 'session without trusted role metadata must be rejected');

  role = 'platform_owner';
  userId = 'AUTH-CURRENT';
  signInUserId = 'AUTH-ATTACKER';
  const fixation = await global.authService.loginWithSupabase('owner@example.com', 'not-recorded', 'platform_owner');
  assert.equal(fixation, null, 'identity mismatch after login must be treated as session fixation');
  assert.ok(signOutCount >= 1, 'rejected or replaced sessions must be invalidated');

  assert.equal(global.authService.loginByRole, undefined, 'local role login API must not exist');
  assert.equal(global.authService.loginEmployee, undefined, 'local employee login API must not exist');
  assert.equal(global.authService.loginHybrid, undefined, 'obsolete hybrid authentication API must not exist');
  assert.equal(global.authService.isLocalDemoLoginAllowed(), false, 'development authentication fallback must be permanently disabled');

  global.ARTHHRMS_CONFIG = { flags: { PRODUCTION_MODE: true, DEVELOPMENT_MODE: false, DEMO_MODE: false } };
  const productionAuthService = global.authService;
  load('db.js');
  assert.equal(global.authService, productionAuthService, 'database compatibility adapters must not replace enterprise authentication');
  assert.doesNotThrow(() => global.DB.AuthService.getCurrentUser(), 'database auth adapter must not recurse');
  assert.equal(global.DB.get().users.length, 0, 'fresh seed must not contain privileged accounts');
  assert.equal(global.DB.loginByRole, undefined, 'database must not expose password login');
  const deniedSetup = global.DB.completeInitialSetup({ company: { companyName: 'Secure Co' }, platformOwner: { name: 'Owner', email: 'owner@example.com' } });
  assert.equal(deniedSetup.ok, false, 'setup without a validated external identity must fail');
  const secureSetup = global.DB.completeInitialSetup({
    company: { companyName: 'Secure Co' },
    platformOwner: { id: 'AUTH-OWNER', authUserId: 'AUTH-OWNER', name: 'Owner', email: 'owner@example.com', role: 'platform_owner', source: 'supabase', roleTrusted: true },
    initialUser: { name: 'Tenant Admin', email: 'admin@example.com', role: 'super_admin' }
  });
  assert.equal(secureSetup.ok, true, 'validated Platform Owner may complete organization setup');
  assert.equal(global.DB.get().users.filter(user => user.role === 'super_admin').length, 0, 'setup must not automatically create Super Admin accounts');
  assert.equal(global.DB.get().users.some(user => Object.hasOwn(user, 'password')), false, 'local password fields must never be stored');
  assert.ok(global.DB.get().authInvites.some(invite => invite.role === 'super_admin' && invite.status === 'Secure Onboarding Required'), 'Super Admin must remain staged for secure onboarding');

  const authSource = fs.readFileSync(path.join(root, 'services/authService.js'), 'utf8');
  const dbSource = fs.readFileSync(path.join(root, 'db.js'), 'utf8');
  assert.doesNotMatch(authSource, /ALLOW_LOCAL_AUTH_FALLBACK|localLoginByRole|DB\.login/, 'auth service must contain no local fallback path');
  assert.doesNotMatch(dbSource, /BootstrapOnly|bootstrap\.platform|bootstrap\.super|loginByRole\s*\(/, 'database must contain no bootstrap credential or login implementation');

  console.log('authProductionHardening.test.js passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
