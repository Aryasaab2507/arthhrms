const assert = require('node:assert/strict');
const path = require('node:path');

function load(file) {
  delete require.cache[require.resolve(path.resolve(__dirname, '..', file))];
  require(path.resolve(__dirname, '..', file));
}

async function main() {
  global.window = global;
  const actor = {
    id: 'OWNER-1',
    role: 'super_admin',
    tenantId: 'tabsons',
    organizationId: 'tabsons-org'
  };
  const state = { goLiveApprovals: [] };
  let flushCount = 0;
  let rpcInput = null;
  const passingRun = {
    runId: 'GL-RUN-0001',
    tenantSlug: 'tabsons',
    status: 'READY_FOR_APPROVAL',
    certificationEligible: true,
    blockingIssues: [],
    readinessScore: 96
  };
  const dashboard = {
    success: true,
    certificationStatus: 'READY_FOR_APPROVAL',
    tenantSlug: 'tabsons',
    validationHistory: [passingRun]
  };

  global.authService = { getCurrentUser: () => actor };
  global.DB = { get: () => state };
  global.supabasePersistenceService = {
    async flush() { flushCount += 1; }
  };
  global.GoLiveValidationService = {
    generateDashboard: () => dashboard,
    runValidation: () => ({ ...passingRun, success: true }),
    approveGoLive(input) {
      const approval = {
        approvalId: 'APPROVAL-1',
        runId: input.runId,
        tenantSlug: input.tenantSlug,
        status: 'APPROVED_FOR_CERTIFICATION'
      };
      state.goLiveApprovals.push(approval);
      return { success: true, approval };
    }
  };

  const query = {
    select() { return this; },
    eq() { return this; },
    order() { return this; },
    async limit() { return { data: [], error: null }; }
  };
  const supabase = {
    from() { return query; },
    async rpc(name, input) {
      assert.equal(name, 'arth_submit_company_readiness_review');
      rpcInput = input;
      return {
        data: {
          request: { id: 'REQUEST-1', status: 'PENDING_REVIEW' },
          lifecycle: { state: 'READY_FOR_REVIEW' }
        },
        error: null
      };
    }
  };
  global.supabaseClientService = {
    isEnabled: flag => flag === 'USE_COMPANY_SETUP_ORCHESTRATION',
    getClient: () => supabase
  };

  load('services/companyReadinessOrchestrationService.js');
  const service = global.CompanyReadinessOrchestrationService;

  const loaded = await service.generateDashboard();
  assert.equal(loaded.success, true);
  assert.equal(loaded.tenantId, 'tabsons');

  const validation = await service.runValidation({ mode: 'FULL' });
  assert.equal(validation.success, true);
  assert.equal(flushCount, 1);

  const submitted = await service.submitForPilot({ validationRunId: passingRun.runId });
  assert.equal(submitted.success, true);
  assert.equal(submitted.request.status, 'PENDING_REVIEW');
  assert.equal(rpcInput.p_validation_run_id, passingRun.runId);
  assert.equal(state.goLiveApprovals.length, 1);
  assert.equal(flushCount, 2);

  const replay = await service.submitForPilot({ validationRunId: passingRun.runId });
  assert.equal(replay.success, true);
  assert.equal(state.goLiveApprovals.length, 1, 'retries must not duplicate Company Owner approval records');

  global.authService.getCurrentUser = () => ({ ...actor, role: 'hr' });
  const denied = await service.generateDashboard();
  assert.equal(denied.code, 'COMPANY_OWNER_REQUIRED');

  console.log('companyReadinessOrchestrationService.test.js passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
