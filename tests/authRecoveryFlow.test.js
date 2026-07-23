const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

class Store {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}

function load(file) {
  delete require.cache[require.resolve(path.join(root, file))];
  require(path.join(root, file));
}

async function main() {
  global.window = global;
  global.sessionStorage = new Store();
  global.localStorage = new Store();
  global.location = {
    href: 'https://arthhrms.example/auth-callback.html',
    origin: 'https://arthhrms.example',
    pathname: '/auth-callback.html',
    search: '',
    hash: ''
  };
  global.navigator = { userAgent: 'Recovery test', platform: 'test' };

  let currentUser = {
    id: 'AUTH-RECOVERY-1',
    email: 'recovery@example.com',
    email_confirmed_at: '2026-07-24T00:00:00.000Z',
    app_metadata: {},
    user_metadata: {}
  };
  let currentSession = null;
  let setSessionError = null;
  let exchangeRedirectType = '';
  let updatePayload = null;
  let signOutCalls = 0;
  let linkCalls = 0;
  let inviteUpdates = 0;
  const auditRows = [];

  function sessionFor(user = currentUser) {
    return {
      access_token: 'recovery-access-token',
      refresh_token: 'recovery-refresh-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: user.id }
    };
  }

  const client = {
    auth: {
      async setSession(tokens) {
        assert.equal(tokens.access_token, 'callback-access-token');
        assert.equal(tokens.refresh_token, 'callback-refresh-token');
        if (setSessionError) return { data: { session: null }, error: setSessionError };
        currentSession = sessionFor();
        return { data: { session: currentSession }, error: null };
      },
      async exchangeCodeForSession() {
        currentSession = sessionFor();
        return { data: { session: currentSession, redirectType: exchangeRedirectType }, error: null };
      },
      async verifyOtp() {
        currentSession = sessionFor();
        return { data: { session: currentSession }, error: null };
      },
      async getSession() {
        return { data: { session: currentSession }, error: null };
      },
      async getUser() {
        return { data: { user: currentUser }, error: null };
      },
      async updateUser(payload) {
        updatePayload = payload;
        return { data: { user: currentUser }, error: null };
      },
      async signOut() {
        signOutCalls += 1;
        currentSession = null;
        return { error: null };
      },
      onAuthStateChange() {
        return { data: { subscription: { unsubscribe() {} } } };
      }
    }
  };

  const invite = {
    inviteId: 'INV-1',
    empId: 'EMP-1',
    email: 'invite@example.com',
    role: 'employee',
    authUserId: 'AUTH-INVITE-1'
  };
  global.DB = {
    normalizeEmail(value) { return String(value || '').trim().toLowerCase(); },
    getLatestAuthInviteForEmployee(empId) { return empId === 'EMP-1' ? invite : null; },
    getLatestAuthInviteByEmail(email) { return email === invite.email ? invite : null; },
    linkAuthUserToEmployee(empId, authUserId) {
      linkCalls += 1;
      return empId === 'EMP-1' && authUserId === 'AUTH-INVITE-1'
        ? { ok: true }
        : { ok: false, error: 'Unexpected employee link' };
    },
    updateAuthInvite() {
      inviteUpdates += 1;
      return { ...invite, activationStatus: 'Active' };
    },
    getEmployee(empId) {
      return empId === 'EMP-1'
        ? { id: 'EMP-1', name: 'Invite User', email: invite.email }
        : null;
    },
    writeAuditLog(actorRole, actorId, actionType, module, targetId, description) {
      auditRows.push({ actorRole, actorId, actionType, module, targetId, description });
      return true;
    },
    isSetupRequired() { return false; }
  };
  global.supabaseClientService = {
    getClient() { return client; },
    isEnabled(flag) { return ['USE_SUPABASE_AUTH', 'USE_SUPABASE_PASSWORD_RECOVERY'].includes(flag); },
    readConfig() {
      return {
        SUPABASE_TIMEOUT_MS: 10000,
        flags: {
          USE_SUPABASE_AUTH: true,
          USE_SUPABASE_PASSWORD_RECOVERY: true,
          PRODUCTION_MODE: true,
          PILOT_MODE: false,
          DEVELOPMENT_MODE: false,
          DEMO_MODE: false,
          REQUIRE_APP_METADATA_ROLE: true,
          REQUIRE_EMAIL_VERIFIED: true
        }
      };
    }
  };
  global.operationsMonitoringService = { recordError() {} };

  load('services/authInviteService.js');
  load('services/authService.js');
  load('services/passwordRecoveryUI.js');

  const parsed = global.authInviteService.parseCallbackParams(
    'https://arthhrms.example/auth-callback.html?source=email#access_token=callback-access-token&refresh_token=callback-refresh-token&type=recovery'
  );
  assert.equal(parsed.source, 'email');
  assert.equal(parsed.type, 'recovery');
  assert.equal(global.authInviteService.detectCallbackType({ params: parsed }), 'recovery');
  assert.equal(global.authInviteService.detectCallbackType({ event: 'PASSWORD_RECOVERY' }), 'recovery');

  const recovery = await global.authService.handleAuthCallback({
    url: 'https://arthhrms.example/auth-callback.html#access_token=callback-access-token&refresh_token=callback-refresh-token&type=recovery'
  });
  assert.equal(recovery.ok, true);
  assert.equal(recovery.type, 'recovery');
  assert.equal(recovery.action, 'reset_password');
  assert.equal(linkCalls, 0, 'recovery must never link an employee');
  assert.equal(inviteUpdates, 0, 'recovery must never activate an invitation');

  const weak = await global.authService.updateRecoveredPassword('weak');
  assert.equal(weak.ok, false);
  assert.equal(weak.code, 'RECOVERY_PASSWORD_WEAK');
  assert.equal(updatePayload, null, 'weak passwords must not reach Supabase');

  const strongPassword = 'Enterprise#Pass2026';
  const updated = await global.authService.updateRecoveredPassword(strongPassword);
  assert.equal(updated.ok, true);
  assert.deepEqual(updatePayload, { password: strongPassword });
  assert.equal(signOutCalls, 1, 'recovery session should be cleared after password update');
  assert.equal(linkCalls, 0, 'password update must not link an employee');
  assert.ok(auditRows.some((row) => row.actionType === 'password recovery completed'));
  assert.ok(auditRows.every((row) => !row.description.includes(strongPassword)), 'password must never enter audit logs');

  const reused = await global.authService.updateRecoveredPassword(strongPassword);
  assert.equal(reused.ok, false);
  assert.equal(reused.code, 'RECOVERY_LINK_EXPIRED');

  exchangeRedirectType = 'recovery';
  currentUser = {
    id: 'AUTH-PKCE-RECOVERY',
    email: 'pkce-recovery@example.com',
    email_confirmed_at: '2026-07-24T00:00:00.000Z',
    app_metadata: {},
    user_metadata: {}
  };
  const pkceRecovery = await global.authService.handleAuthCallback({
    url: 'https://arthhrms.example/auth-callback.html?code=single-use-auth-code'
  });
  assert.equal(pkceRecovery.ok, true, 'PKCE redirectType must identify a code-only recovery callback');
  assert.equal(pkceRecovery.type, 'recovery');
  assert.equal(linkCalls, 0, 'code-only PKCE recovery must never link an employee');
  exchangeRedirectType = '';

  for (const type of ['magiclink', 'signup', 'email_confirmation']) {
    currentUser = {
      id: `AUTH-${type}`,
      email: `${type}@example.com`,
      email_confirmed_at: '2026-07-24T00:00:00.000Z',
      app_metadata: { role: 'platform_owner' },
      user_metadata: {}
    };
    const result = await global.authInviteService.dispatchAuthCallback({
      url: `https://arthhrms.example/auth-callback.html#access_token=callback-access-token&refresh_token=callback-refresh-token&type=${type}`
    });
    assert.equal(result.ok, true, `${type} callback should establish a session`);
    assert.equal(result.type, type);
  }
  assert.equal(linkCalls, 0, 'non-invite callbacks must not link employees');

  currentUser = {
    id: 'AUTH-INVITE-1',
    email: invite.email,
    email_confirmed_at: '2026-07-24T00:00:00.000Z',
    app_metadata: { role: 'employee', empId: 'EMP-1', tenantSlug: 'tenant-a' },
    user_metadata: { full_name: 'Invite User' }
  };
  const inviteResult = await global.authInviteService.dispatchAuthCallback({
    url: 'https://arthhrms.example/auth-callback.html#access_token=callback-access-token&refresh_token=callback-refresh-token&type=invite'
  });
  assert.equal(inviteResult.ok, true, 'invite callback behavior must remain active');
  assert.equal(inviteResult.type, 'invite');
  assert.equal(linkCalls, 1, 'invite callback still links the employee');
  assert.equal(inviteUpdates, 1, 'invite callback still records activation');

  const legacyInvite = await global.authInviteService.dispatchAuthCallback({
    url: 'https://arthhrms.example/auth-callback.html#access_token=callback-access-token&refresh_token=callback-refresh-token'
  });
  assert.equal(legacyInvite.ok, true, 'legacy invite callbacks remain discoverable from the governed invite record');
  assert.equal(legacyInvite.type, 'invite');
  assert.equal(linkCalls, 2, 'legacy invite callback still links the employee');

  setSessionError = { code: 'otp_expired', message: 'Token has expired' };
  const expired = await global.authInviteService.dispatchAuthCallback({
    url: 'https://arthhrms.example/auth-callback.html#access_token=callback-access-token&refresh_token=callback-refresh-token&type=recovery'
  });
  assert.equal(expired.ok, false);
  assert.equal(expired.code, 'RECOVERY_LINK_EXPIRED');
  assert.equal(expired.error, 'Recovery link expired. Request another password reset.');

  const policy = global.PasswordRecoveryUI.evaluate(strongPassword);
  assert.equal(policy.valid, true);
  assert.equal(global.PasswordRecoveryUI.evaluate('NoSpecialCharacter12').valid, false);

  const html = fs.readFileSync(path.join(root, 'auth-callback.html'), 'utf8');
  assert.match(html, /services\/passwordRecoveryUI\.js/);
  assert.match(html, /Password updated successfully\./);
  assert.match(html, /authService\.updateRecoveredPassword\(password\)/);
  assert.doesNotMatch(html, /service_role|SUPABASE_SERVICE_ROLE_KEY/);

  console.log('authRecoveryFlow.test.js passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
