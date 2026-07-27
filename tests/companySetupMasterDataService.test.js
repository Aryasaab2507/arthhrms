const assert = require('node:assert/strict');
const path = require('node:path');

async function main() {
  global.window = global;
  global.crypto = { randomUUID: () => '00000000-0000-4000-8000-000000000202' };
  global.CustomEvent = class CustomEvent {
    constructor(type, options) { this.type = type; this.detail = options?.detail; }
  };
  global.dispatchEvent = () => true;

  const actor = {
    id: 'OWNER-1',
    role: 'super_admin',
    source: 'supabase',
    roleTrusted: true,
    companyOwner: true,
    tenantSlug: 'tabsons-india',
    organizationId: 'tabsons-india'
  };
  const calls = [];
  let catalog = {
    department: [{ id: 'department:legal', name: 'Legal', code: 'LEGAL', source: 'tenant' }]
  };
  let invitations = [];

  const client = {
    async rpc(name, params) {
      calls.push({ name, params });
      if (name === 'arth_get_company_setup_reference_data') {
        return {
          data: {
            ok: true,
            catalog,
            employees: [{
              id: 'EMP-001',
              name: 'Asha Rao',
              email: 'asha@example.com',
              department: 'Human Resources',
              role: 'employee',
              authUserId: ''
            }],
            invitations
          },
          error: null
        };
      }
      if (name === 'arth_upsert_company_setup_master_data') {
        const record = {
          id: `${params.p_master_type}:${params.p_payload.code.toLowerCase()}`,
          ...params.p_payload,
          source: 'company-setup'
        };
        catalog = {
          ...catalog,
          [params.p_master_type]: [...(catalog[params.p_master_type] || []), record]
        };
        return { data: { ok: true, masterType: params.p_master_type, record }, error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    }
  };

  global.authService = { getCurrentUser: () => actor };
  global.supabaseClientService = { getClient: () => client };
  global.authInviteService = {
    async sendDurableInvite(input) {
      invitations = [{
        inviteId: 'AUTH-INV-1',
        empId: input.empId,
        name: input.name,
        email: input.email,
        role: input.role,
        status: 'Invite Sent'
      }];
      return { ok: true, invite: invitations[0] };
    },
    async resendDurableInvite(inviteId) { return { ok: true, invite: { inviteId } }; },
    async cancelDurableInvite(inviteId) { return { ok: true, invite: { inviteId, status: 'Cancelled' } }; }
  };

  require(path.resolve(__dirname, '..', 'services', 'companySetupMasterDataService.js'));
  const service = global.CompanySetupMasterDataService;
  assert.ok(Object.isFrozen(service));
  assert.ok(service.MASTER_TYPES.includes('department'));
  assert.ok(service.MASTER_TYPES.includes('notification_provider'));

  const loaded = await service.load();
  assert.equal(loaded.loaded, true);
  assert.ok(service.list('department').some(row => row.code === 'HR'));
  assert.ok(service.list('department').some(row => row.code === 'LEGAL' && row.source === 'tenant'));
  assert.equal(service.searchEmployees('asha').length, 1);

  const created = await service.add('department', {
    name: 'Customer Success',
    code: 'CS',
    description: 'Customer operations'
  });
  assert.equal(created.code, 'CS');
  assert.ok(service.list('department').some(row => row.code === 'CS'));
  assert.equal(calls.at(-1).name, 'arth_upsert_company_setup_master_data');
  assert.equal(calls.at(-1).params.p_master_type, 'department');

  const invited = await service.inviteEmployee({ employeeId: 'EMP-001', role: 'hr' });
  assert.equal(invited.ok, true);
  assert.equal(service.snapshot().invitations[0].inviteId, 'AUTH-INV-1');

  global.authService.getCurrentUser = () => ({ ...actor, tenantSlug: 'other-tenant', companyOwner: false });
  await assert.rejects(() => service.add('department', { name: 'Unsafe', code: 'UNSAFE' }), /Company Owner/);

  console.log('companySetupMasterDataService.test.js passed');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
