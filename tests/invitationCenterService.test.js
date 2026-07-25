const assert = require('node:assert/strict');
const path = require('node:path');

function load(file) {
  delete require.cache[require.resolve(path.resolve(__dirname, '..', file))];
  require(path.resolve(__dirname, '..', file));
}

async function main() {
  global.window = global;
  const actor = {
    id: 'AUTH-OWNER-1',
    role: 'super_admin',
    tenantId: 'tabsons-india',
    companyId: 'tabsons-india'
  };
  const employees = [
    { id: 'EMP-1', name: 'HR User', email: 'hr@tabsons.example', role: 'hr', dept: 'HR' },
    { id: 'EMP-2', name: 'Manager User', email: 'manager@tabsons.example', role: 'manager', dept: 'Operations' },
    { id: 'EMP-3', name: 'Active User', email: 'active@tabsons.example', role: 'employee', authUserId: 'AUTH-3' }
  ];
  const invitations = [
    {
      inviteId: 'INV-1',
      empId: 'EMP-1',
      name: 'HR User',
      email: 'hr@tabsons.example',
      role: 'hr',
      status: 'Invite Sent',
      sentAt: '2026-07-25T10:00:00.000Z'
    }
  ];
  const calls = [];

  global.supabaseClientService = {
    isEnabled(flag) { return flag === 'USE_INVITATION_CENTER'; }
  };
  global.authService = {
    getCurrentUser() { return actor; }
  };
  global.DB = {
    getEmployees() { return employees; },
    getEmployee(id) { return employees.find(employee => employee.id === id) || null; }
  };
  global.authInviteService = {
    getInvites() { return invitations; },
    async sendInvite(payload) {
      calls.push({ action: 'send', payload });
      return { ok: true, invite: { inviteId: 'INV-2' } };
    },
    async resendInvite(inviteId) {
      calls.push({ action: 'resend', inviteId });
      return { ok: true };
    },
    async cancelInvite(inviteId) {
      calls.push({ action: 'cancel', inviteId });
      return { ok: true };
    }
  };

  load('services/invitationCenterService.js');
  const service = global.InvitationCenterService;
  assert.ok(Object.isFrozen(service), 'Invitation Center service must be immutable');
  assert.equal(service.isEnabled(), true);
  assert.equal(service.summary().pending, 1);
  assert.equal(service.list({ status: 'SENT' }).length, 1);
  assert.deepEqual(
    service.eligibleEmployees().map(employee => employee.id),
    ['EMP-2'],
    'pending and activated employees must not be offered for duplicate invitation'
  );

  const sent = await service.send({ empId: 'EMP-2', role: 'manager' });
  assert.equal(sent.ok, true);
  assert.equal(calls[0].payload.tenantId, actor.tenantId);
  assert.equal(calls[0].payload.companyId, actor.companyId);
  assert.equal(calls[0].payload.invitedByRole, 'super_admin');

  await service.resend('INV-1');
  await service.cancel('INV-1');
  assert.deepEqual(calls.map(call => call.action), ['send', 'resend', 'cancel']);

  actor.role = 'employee';
  assert.throws(() => service.list(), /not allowed/i, 'employee access must fail closed');

  console.log('invitationCenterService.test.js passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
