const assert = require('node:assert/strict');
const path = require('node:path');

function load(file) {
  delete require.cache[require.resolve(path.resolve(__dirname, '..', file))];
  require(path.resolve(__dirname, '..', file));
}

async function main() {
  global.window = global;
  const actor = { id: 'PLATFORM-1', role: 'platform_owner' };
  const tenants = [
    {
      companyId: 'COMPANY-1',
      tenantId: 'tabsons',
      tenantSlug: 'tabsons',
      companyName: 'Tabsons India Pvt Ltd',
      lifecycleState: 'LIVE',
      progress: 100,
      planType: 'enterprise',
      country: 'India',
      timezone: 'Asia/Kolkata',
      ownerAuthUserId: 'OWNER-1',
      invitationStatus: 'ACTIVATED',
      readinessStatus: 'PILOT_ACTIVE',
      readinessScore: 96,
      metadata: { employeeCount: 200, billingState: 'ACTIVE' },
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-10T00:00:00.000Z'
    },
    {
      companyId: 'COMPANY-2',
      tenantId: 'future-co',
      tenantSlug: 'future-co',
      companyName: 'Future Company',
      lifecycleState: 'READY_FOR_REVIEW',
      progress: 90,
      planType: 'growth',
      country: 'India',
      timezone: 'Asia/Kolkata',
      ownerAuthUserId: 'OWNER-2',
      invitationStatus: 'ACTIVATED',
      readinessStatus: 'PENDING_REVIEW',
      readinessScore: 91,
      metadata: {},
      createdAt: '2026-07-02T00:00:00.000Z',
      updatedAt: new Date().toISOString()
    }
  ];
  const events = [
    { company_id: 'COMPANY-1', tenant_id: 'tabsons', event_type: 'CompanyCreated', previous_state: '', new_state: 'DRAFT', actor_role: 'platform_owner', occurred_at: '2026-07-01T00:00:00.000Z' },
    { company_id: 'COMPANY-1', tenant_id: 'tabsons', event_type: 'CompanyActivated', previous_state: 'PILOT', new_state: 'LIVE', actor_role: 'platform_owner', occurred_at: '2026-07-10T00:00:00.000Z' }
  ];

  global.authService = { getCurrentUser: () => actor };
  global.PlatformCompanyRegistryService = {
    async loadRegistry() { return { success: true, ok: true }; },
    getTenants() { return tenants; }
  };
  const query = {
    select() { return this; },
    order() { return this; },
    async range(from, to) {
      return { data: events.slice(from, to + 1), error: null };
    }
  };
  global.supabaseClientService = {
    isEnabled: flag => flag === 'USE_PLATFORM_COMPANY_REGISTRY',
    getClient: () => ({ from: () => query })
  };

  load('services/platformAggregateIntegrationService.js');
  const service = global.PlatformAggregateIntegrationService;
  const loaded = await service.load({ actor });
  assert.equal(loaded.success, true);
  assert.equal(loaded.snapshot.totalCompanies, 2);
  assert.equal(loaded.snapshot.liveCompanies, 1);
  assert.equal(loaded.snapshot.pendingReadinessReviews, 1);
  assert.equal(loaded.snapshot.employeeCount, 200);
  assert.equal(loaded.snapshot.averageOnboardingDays, 9);
  assert.equal(loaded.snapshot.privacy.employeeRecordsQueried, false);
  assert.equal(loaded.projection.platformTenants.length, 2);
  assert.equal(loaded.projection.tenantBillingRecords[0].planKey, 'enterprise');
  assert.equal(JSON.stringify(loaded).includes('salaryAmount'), false);
  assert.equal(JSON.stringify(loaded).includes('"payrollRecords":['), false);

  const denied = service.getSnapshot({ actor: { id: 'OWNER-1', role: 'super_admin' } });
  assert.equal(denied.code, 'PLATFORM_OWNER_REQUIRED');

  console.log('platformAggregateIntegrationService.test.js passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
