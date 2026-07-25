const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.resolve(__dirname, '..', 'supabase', 'functions', 'invite-user', 'index.ts'),
  'utf8'
);

assert.match(source, /\["send", "resend", "cancel"\]\.includes\(action\)/, 'invite actions must be explicitly allowlisted');
assert.match(source, /requestedTenant !== callerTenant \|\| requestedOrganization !== callerOrganization/, 'every invite action must validate tenant scope');
assert.match(source, /admin\.auth\.admin\.deleteUser\(authUserId\)/, 'cancellation must revoke the pending Supabase Auth user');
assert.match(source, /Activated invitations cannot be changed/, 'activated invitations must be immutable');
assert.match(source, /Accepted invitations cannot be cancelled/, 'confirmed Auth users must not be deleted by cancellation');
assert.match(source, /Accepted invitations cannot be resent/, 'confirmed Auth users must not be deleted by resend');
assert.match(source, /record_type: "auditLogs"/, 'cancellation must append a durable audit event');
assert.match(source, /resendCount:/, 'resends must be counted');
assert.doesNotMatch(source, /assignableRoles[^\n]*(platform_owner|super_admin)/, 'tenant invites must not assign privileged platform roles');

console.log('inviteLifecycleEdgeFunction.test.js passed');
