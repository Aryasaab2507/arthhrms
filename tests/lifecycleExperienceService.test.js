const assert = require('node:assert/strict');
const path = require('node:path');

function load(file) {
  delete require.cache[require.resolve(path.resolve(__dirname, '..', file))];
  require(path.resolve(__dirname, '..', file));
}

async function main() {
  global.window = global;
  global.crypto = { randomUUID: () => '00000000-0000-4000-8000-000000000501' };
  const actor = {
    id: 'HR-USER-1',
    authUserId: 'HR-USER-1',
    empId: 'EMP-HR-1',
    email: 'hr@tabsons.example',
    role: 'hr',
    tenantId: 'tabsons',
    tenantSlug: 'tabsons',
    organizationId: 'tabsons-org',
    source: 'supabase',
    roleTrusted: true
  };
  const state = {
    employees: [{ id: 'EMP-HR-1', role: 'hr', email: actor.email }],
    users: [],
    authInvites: [],
    departments: [],
    designations: [],
    attendancePolicyDefinitions: [],
    leavePolicyDefinitions: [],
    pendingActions: [],
    lifecycleTimelineEvents: [],
    notifications: []
  };
  let saveCount = 0;
  let flushCount = 0;
  let notificationCount = 0;

  global.authService = { getCurrentUser: () => actor };
  global.supabaseClientService = { isEnabled: flag => flag === 'USE_LIFECYCLE_TASKS' };
  global.supabasePersistenceService = { async flush() { flushCount += 1; } };
  global.notificationService = {
    pushNotification() {
      notificationCount += 1;
      return { id: `N-${notificationCount}` };
    }
  };
  global.PendingActionService = { getPendingActions: () => [] };
  global.DB = {
    get() { return JSON.parse(JSON.stringify(state)); },
    save(next) {
      Object.keys(state).forEach(key => delete state[key]);
      Object.assign(state, JSON.parse(JSON.stringify(next)));
      saveCount += 1;
    }
  };

  load('services/lifecycleExperienceService.js');
  const service = global.LifecycleExperienceService;
  const first = await service.synchronize({ actor, tenantId: 'tabsons' });
  assert.equal(first.success, true);
  assert.equal(first.role, 'hr');
  assert.equal(first.total, 4);
  assert.equal(first.pending, 3, 'employee import should be complete after an employee exists');
  assert.equal(state.pendingActions.length, 4);
  assert.ok(state.lifecycleTimelineEvents.some(row => row.eventType === 'FirstLoginExperiencePresented'));
  assert.equal(notificationCount, 3);
  assert.equal(saveCount, 1);
  assert.equal(flushCount, 1);

  const second = await service.synchronize({ actor, tenantId: 'tabsons' });
  assert.equal(second.success, true);
  assert.equal(saveCount, 1, 'idempotent synchronization must not rewrite unchanged tasks');
  assert.equal(notificationCount, 3, 'idempotent synchronization must not resend task notifications');

  state.attendancePolicyDefinitions.push({ id: 'ATT-1' });
  const completed = await service.synchronize({ actor, tenantId: 'tabsons' });
  assert.equal(completed.success, true);
  assert.equal(completed.completed, 2);
  assert.ok(state.lifecycleTimelineEvents.some(row => row.eventType === 'LifecycleTaskCompleted'));

  assert.throws(
    () => service.dashboard({ actor, tenantId: 'other-tenant' }),
    /outside the trusted tenant scope/i,
    'cross-tenant lifecycle access must fail closed'
  );
  assert.throws(
    () => service.dashboard({ actor: { ...actor, source: 'development' }, tenantId: 'tabsons' }),
    /trusted tenant-scoped session/i,
    'untrusted sessions must fail closed'
  );

  console.log('lifecycleExperienceService.test.js passed');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
