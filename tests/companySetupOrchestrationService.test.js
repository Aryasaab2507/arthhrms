const assert = require('node:assert/strict');
const path = require('node:path');

function load(file) {
  require(path.resolve(__dirname, '..', file));
}

async function main() {
  global.window = global;
  global.crypto = { randomUUID: () => '00000000-0000-4000-8000-000000000101' };

  const actor = {
    id: 'OWNER-1',
    role: 'super_admin',
    source: 'supabase',
    roleTrusted: true,
    companyOwner: true,
    tenantSlug: 'tabsons-india',
    tenantId: 'tabsons-india',
    organizationId: 'tabsons-india'
  };
  let workspace = {
    id: 'WORKSPACE-1',
    company_id: 'COMPANY-1',
    tenant_id: 'tabsons-india',
    organization_id: 'tabsons-india',
    status: 'DRAFT',
    current_step: 'organizationInformation',
    completed_steps: [],
    progress: 0,
    draft_payload: {
      organizationInformation: { companyName: 'Tabsons India Pvt Ltd' }
    },
    revision: 0
  };
  const calls = [];

  const client = {
    async rpc(name, params) {
      calls.push({ name, params });
      if (name === 'arth_get_or_create_company_setup') {
        return {
          data: {
            ok: true,
            workspace: structuredClone(workspace),
            company: { id: 'COMPANY-1', company_name: 'Tabsons India Pvt Ltd' }
          },
          error: null
        };
      }
      if (name === 'arth_save_company_setup_step') {
        assert.equal(params.p_expected_revision, workspace.revision);
        const complete = params.p_complete !== false;
        workspace = {
          ...workspace,
          status: 'IN_PROGRESS',
          current_step: complete ? 'organizationStructure' : workspace.current_step,
          completed_steps: complete ? [params.p_step_key] : workspace.completed_steps,
          progress: complete ? 10 : workspace.progress,
          draft_payload: {
            ...workspace.draft_payload,
            [params.p_step_key]: params.p_payload
          },
          revision: workspace.revision + 1
        };
        return {
          data: {
            ok: true,
            workspace: structuredClone(workspace),
            version: { step_key: params.p_step_key, step_version: workspace.revision }
          },
          error: null
        };
      }
      if (name === 'arth_complete_company_core_setup') {
        assert.equal(params.p_expected_revision, workspace.revision);
        workspace = {
          ...workspace,
          status: 'CORE_SETUP_COMPLETE',
          current_step: 'provisionTenant',
          completed_steps: [
            'organizationInformation', 'organizationStructure',
            'workingConfiguration', 'leaveConfiguration',
            'payrollConfiguration', 'identitySecurity',
            'notifications', 'administrator', 'review', 'provisionTenant'
          ],
          progress: 100,
          revision: workspace.revision + 1
        };
        return {
          data: {
            ok: true,
            workspace: structuredClone(workspace),
            lifecycle: { state: 'ORG_STRUCTURE', next_action: 'CONFIGURE_POLICIES' }
          },
          error: null
        };
      }
      throw new Error(`Unexpected RPC ${name}`);
    }
  };

  global.supabaseClientService = {
    isEnabled(flag) { return flag === 'USE_COMPANY_SETUP_ORCHESTRATION'; },
    getClient() { return client; }
  };
  global.authService = { getCurrentUser() { return actor; } };

  load('services/companySetupOrchestrationService.js');
  const service = global.CompanySetupOrchestrationService;
  assert.ok(Object.isFrozen(service));
  assert.equal(service.CORE_STEPS.length, 10);
  assert.equal(service.SETUP_TASKS.length, 21);

  const denied = await service.loadWorkspace({
    actor: { ...actor, role: 'hr' }
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.code, 'COMPANY_OWNER_REQUIRED');
  assert.equal(calls.length, 0);

  const loaded = await service.loadWorkspace({ actor });
  assert.equal(loaded.ok, true);
  assert.equal(loaded.workspace.tenant_id, 'tabsons-india');
  assert.equal(loaded.tasks.find((task) => task.key === 'companyOwner').completed, true);
  assert.equal(loaded.tasks.find((task) => task.key === 'companyProfile').completed, false);

  const saved = await service.saveStep({
    stepKey: 'organizationInformation',
    payload: { companyName: 'Tabsons India Pvt Ltd' },
    idempotencyKey: 'company-setup-step-0001'
  }, { actor });
  assert.equal(saved.ok, true);
  assert.equal(saved.workspace.revision, 1);
  assert.equal(saved.home.tasks.find((task) => task.key === 'companyProfile').status, 'DRAFTED');
  assert.equal(saved.home.tasks.find((task) => task.key === 'companyProfile').completed, false);

  const draftSaved = await service.saveStep({
    stepKey: 'organizationStructure',
    payload: {
      headOffice: { name: 'Mumbai HQ' },
      departments: [{ name: 'HR', code: 'HR' }]
    },
    complete: false,
    idempotencyKey: 'company-setup-draft-0001'
  }, { actor });
  assert.equal(draftSaved.ok, true);
  assert.equal(draftSaved.workspace.current_step, 'organizationStructure');
  assert.deepEqual(draftSaved.workspace.completed_steps, ['organizationInformation']);
  assert.equal(draftSaved.workspace.progress, 10);

  const completed = await service.completeCoreSetup({
    idempotencyKey: 'company-core-complete-0001'
  }, { actor });
  assert.equal(completed.ok, true);
  assert.equal(completed.workspace.status, 'CORE_SETUP_COMPLETE');
  assert.equal(completed.lifecycle.state, 'ORG_STRUCTURE');
  assert.deepEqual(
    calls.map((call) => call.name),
    [
      'arth_get_or_create_company_setup',
      'arth_save_company_setup_step',
      'arth_save_company_setup_step',
      'arth_complete_company_core_setup'
    ]
  );
  assert.ok(Object.isFrozen(completed));

  console.log('companySetupOrchestrationService.test.js passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
