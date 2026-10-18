const assert = require('node:assert/strict');
const path = require('node:path');

function load(file) {
  require(path.resolve(__dirname, '..', file));
}

async function main() {
  global.window = global;
  let linkCalls = 0;
  let activationCalls = 0;

  global.DB = {
    normalizeEmail(value) { return String(value || '').trim().toLowerCase(); },
    linkAuthUserToEmployee() { linkCalls += 1; },
    writeAuditLog() {}
  };
  global.authService = {
    normalizeRole(value) { return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_'); },
    getRoleRedirect(role) { return role === 'super_admin' ? 'super-admin.html' : 'ArthHRMS.html'; }
  };
  global.supabaseClientService = {
    getClient() {
      return {
        async rpc(name) {
          assert.equal(name, 'arth_complete_company_owner_activation');
          activationCalls += 1;
          return {
            data: {
              ok: true,
              companyId: 'COMPANY-1',
              invitationId: 'INVITE-1',
              state: 'OWNER_ACCEPTED',
              nextAction: 'BEGIN_COMPANY_SETUP'
            },
            error: null
          };
        }
      };
    }
  };

  load('services/authInviteService.js');

  const session = {
    user: {
      id: 'OWNER-AUTH-1',
      email: 'owner@tabsons.example',
      email_confirmed_at: '2026-07-25T00:00:00.000Z',
      app_metadata: {
        role: 'super_admin',
        tenant_id: 'tabsons-india',
        organization_id: 'tabsons-india',
        onboarding_method: 'company_owner_invite',
        onboarding_operation_id: 'OWNER-OP-1',
        company_owner: true
      },
      user_metadata: { full_name: 'Tabsons Owner' }
    }
  };

  const activated = await global.authInviteService.handleInviteCallback({ session, passwordCreated: true });
  assert.equal(activated.ok, true);
  assert.equal(activated.user.role, 'super_admin');
  assert.equal(activated.user.tenantId, 'tabsons-india');
  assert.equal(activated.redirectTo, 'organization-import-center.html?source=company-owner-invite');
  assert.equal(activated.invite.state, 'OWNER_ACCEPTED');
  assert.equal(activationCalls, 1);
  assert.equal(linkCalls, 0, 'Company Owner activation must never link an employee');

  const invalid = structuredClone(session);
  invalid.user.app_metadata.company_owner = false;
  const rejected = await global.authInviteService.handleInviteCallback({ session: invalid, passwordCreated: true });
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /metadata is invalid/i);
  assert.equal(activationCalls, 1, 'invalid trusted metadata must fail before the activation RPC');
  assert.equal(linkCalls, 0);

  console.log('companyOwnerActivation.test.js passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
