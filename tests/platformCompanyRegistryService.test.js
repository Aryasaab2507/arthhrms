const assert = require('node:assert/strict');
const path = require('node:path');

function load(file) {
  require(path.resolve(__dirname, '..', file));
}

function query(response) {
  return {
    select() { return this; },
    order() { return Promise.resolve(response); },
    then(resolve, reject) { return Promise.resolve(response).then(resolve, reject); }
  };
}

async function main() {
  global.window = global;
  global.crypto = { randomUUID: () => '00000000-0000-4000-8000-000000000001' };

  const actor = { id: '00000000-0000-4000-8000-000000000010', role: 'platform_owner' };
  const companyId = '00000000-0000-4000-8000-000000000020';
  const companies = [];
  const lifecycles = [];
  const invitations = [];
  const lifecycleEvents = [];
  const readinessRequests = [];
  const rpcCalls = [];
  const tableReads = [];

  const client = {
    from(table) {
      tableReads.push(table);
      const rows = table === 'platform_companies'
        ? companies
        : table === 'platform_tenant_lifecycle'
          ? lifecycles
          : table === 'platform_company_invitations'
            ? invitations
            : table === 'platform_lifecycle_events'
              ? lifecycleEvents
              : readinessRequests;
      return query({ data: rows.map((row) => ({ ...row })), error: null });
    },
    async rpc(name, params) {
      rpcCalls.push({ name, params });
      if (name === 'arth_platform_expire_owner_invitations') {
        return { data: { ok: true, expiredCount: 0 }, error: null };
      }
      if (name === 'arth_platform_create_company') {
        const company = {
          id: companyId,
          tenant_id: params.p_tenant_id,
          organization_id: params.p_organization_id,
          company_name: params.p_company_name,
          slug: params.p_slug,
          status: 'DRAFT',
          revision: 0,
          plan_type: params.p_plan_type,
          timezone: params.p_timezone,
          country: params.p_country,
          created_at: '2026-07-25T00:00:00.000Z',
          updated_at: '2026-07-25T00:00:00.000Z'
        };
        companies.push(company);
        lifecycles.push({
          company_id: companyId,
          state: 'DRAFT',
          progress: 0,
          current_owner_role: 'platform_owner',
          next_action: 'PROVISION_TENANT',
          revision: 0
        });
        lifecycleEvents.push({
          company_id: companyId,
          event_type: 'CompanyCreated',
          previous_state: '',
          new_state: 'DRAFT',
          actor_user_id: actor.id,
          actor_role: 'platform_owner',
          occurred_at: '2026-07-25T00:00:00.000Z'
        });
        return { data: { ok: true, company: { ...company }, lifecycle: { ...lifecycles[0] } }, error: null };
      }
      if (name === 'arth_platform_transition_company') {
        const company = companies[0];
        company.status = params.p_new_state;
        company.revision += 1;
        const lifecycle = lifecycles[0];
        lifecycle.state = params.p_new_state;
        lifecycle.progress = 8;
        lifecycle.next_action = 'INVITE_COMPANY_OWNER';
        lifecycle.revision += 1;
        return { data: { ok: true, company: { ...company }, lifecycle: { ...lifecycle } }, error: null };
      }
      if (name === 'arth_platform_update_company') {
        const company = companies[0];
        company.company_name = params.p_company_name;
        company.owner_email = params.p_owner_profile?.email || company.owner_email || '';
        company.metadata = {
          ...(company.metadata || {}),
          ...(params.p_change_type === 'OWNER_PROFILE'
            ? { companyOwner: { ...params.p_owner_profile, role: 'super_admin', persona: 'company_owner' } }
            : {})
        };
        company.revision += 1;
        lifecycleEvents.unshift({
          company_id: companyId,
          event_type: params.p_change_type === 'OWNER_PROFILE' ? 'CompanyOwnerProfileSaved' : 'CompanyInformationUpdated',
          previous_state: company.status,
          new_state: company.status,
          actor_user_id: actor.id,
          actor_role: 'platform_owner',
          occurred_at: '2026-07-25T01:00:00.000Z'
        });
        return { data: { ok: true, company: { ...company }, lifecycle: { ...lifecycles[0] } }, error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    }
  };

  global.TenantProvisioningService = {
    normalizeTenantSlug(value) {
      return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    },
    validateTenantSlug(value) {
      return { valid: !!value, failures: [], warnings: [] };
    },
    extractTenantFromHostname() {
      return { success: true, matched: false, tenantSlug: '' };
    }
  };
  global.supabaseClientService = {
    isEnabled(flag) { return flag === 'USE_PLATFORM_COMPANY_REGISTRY'; },
    getClient() { return client; },
    readConfig() {
      return {
        SUPABASE_URL: 'https://project.supabase.co',
        AUTH_INVITE_REDIRECT_URL: 'https://arthhrms.example/auth-callback.html',
        flags: { USE_SUPABASE_INVITES: true }
      };
    }
  };
  global.authService = {
    getCurrentUser() { return actor; },
    async getSupabaseSession() { return { access_token: 'platform-access-token' }; }
  };

  let fetchRequest = null;
  global.fetch = async (url, options) => {
    fetchRequest = { url, options };
    return {
      ok: true,
      async json() {
        return {
          ok: true,
          invitationId: '00000000-0000-4000-8000-000000000030',
          companyId,
          status: 'SENT'
        };
      }
    };
  };

  load('services/platformCompanyRegistryService.js');
  const service = global.PlatformCompanyRegistryService;
  assert.ok(Object.isFrozen(service), 'registry service must be immutable');

  const denied = await service.provisionTenant(
    { company_name: 'Denied Company' },
    { actor: { id: 'HR-1', role: 'hr' } }
  );
  assert.equal(denied.ok, false);
  assert.equal(denied.code, 'PLATFORM_OWNER_REQUIRED');
  assert.equal(rpcCalls.length, 0, 'unauthorized actors must not reach database RPCs');

  const drafted = await service.createCompanyDraft({
    company_name: 'Tabsons India Pvt Ltd',
    tenant_slug: 'tabsons-india',
    company_email: 'owner@tabsons.example'
  }, { context: { actor } });
  assert.equal(drafted.ok, true);
  assert.equal(drafted.tenant.lifecycleState, 'DRAFT');

  const provisioned = await service.provisionCompany(companyId, { context: { actor } });
  assert.equal(provisioned.ok, true);
  assert.equal(provisioned.tenant.lifecycleState, 'PROVISIONED');
  assert.equal(provisioned.tenant.tenantId, 'tabsons-india');
  assert.equal(provisioned.tenant.organizationId, 'tabsons-india');
  assert.deepEqual(
    rpcCalls.filter((call) => call.name !== 'arth_platform_expire_owner_invitations').map((call) => call.name),
    ['arth_platform_create_company', 'arth_platform_transition_company'],
    'company creation and provisioning must use audited database transactions'
  );
  const transitionCall = rpcCalls.find((call) => call.name === 'arth_platform_transition_company');
  assert.equal(
    transitionCall.params.p_expected_revision,
    0,
    'lifecycle transitions must use optimistic concurrency'
  );
  assert.ok(
    tableReads.every((table) => table.startsWith('platform_')),
    'Platform Owner registry must never read tenant HR tables'
  );

  const ownerProfile = await service.saveCompanyOwnerProfile(companyId, {
    name: 'Tabsons Owner',
    email: 'owner@tabsons.example',
    phone: '+91 9999999999',
    department: ''
  }, { context: { actor } });
  assert.equal(ownerProfile.ok, true);
  assert.equal(ownerProfile.tenant.ownerProfile.role, 'super_admin');

  const invitation = await service.inviteCompanyOwner(companyId, {
    name: 'Tabsons Owner',
    email: 'owner@tabsons.example',
    idempotencyKey: 'owner-invite-operation-1'
  }, { actor });
  assert.equal(invitation.ok, true);
  assert.equal(fetchRequest.url, 'https://project.supabase.co/functions/v1/invite-company-owner');
  assert.equal(fetchRequest.options.headers.Authorization, 'Bearer platform-access-token');
  const invitePayload = JSON.parse(fetchRequest.options.body);
  assert.equal(invitePayload.action, 'send');
  assert.equal(invitePayload.redirectTo, 'https://arthhrms.example/auth-callback.html');
  assert.equal(invitePayload.companyId, companyId);

  const view = service.getTenantProvisioningView({ actor });
  assert.equal(view.ok, true);
  assert.equal(view.tenants.length, 1);
  assert.ok(Object.isFrozen(view), 'registry views must be immutable');

  console.log('platformCompanyRegistryService.test.js passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
