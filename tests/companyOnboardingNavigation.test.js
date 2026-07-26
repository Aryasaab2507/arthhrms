const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const platformControl = fs.readFileSync(path.join(root, 'platform-control.html'), 'utf8');
const companyAdmin = fs.readFileSync(path.join(root, 'super-admin.html'), 'utf8');
const companySetup = fs.readFileSync(path.join(root, 'setup.html'), 'utf8');
const companyLogin = fs.readFileSync(path.join(root, 'ArthHRMS.html'), 'utf8');
const authGuard = fs.readFileSync(path.join(root, 'services', 'authGuard.js'), 'utf8');

assert.match(platformControl, /renderTenantRegistryActions\(t\)/, 'Company Registry must render lifecycle-aware actions.');
assert.match(
  platformControl,
  /return \[\s*\{kind:'invite-owner',label:'Invite Owner'\},\s*\{kind:'company-admin',label:'Continue Setup',wizard:true\}/,
  'CREATED companies must show both Invite Owner and Continue Setup.'
);
assert.match(platformControl, /tenantRegistryKeys\(tenant\)/, 'Company Registry must resolve every supported tenant identity shape.');
assert.match(platformControl, /_tenantRegistryRows\.get\(registryKey\)/, 'Actions must resolve from the exact rendered Registry snapshot.');
assert.match(platformControl, /Continue Setup/, 'Company Registry must expose the Company Setup handoff.');
assert.match(platformControl, /Resume Setup/, 'Company Registry must expose setup resume behavior.');
assert.match(platformControl, /Employee Import/, 'Company Registry must expose the employee-import next action.');
assert.match(platformControl, /Open Readiness/, 'Company Registry must expose the readiness next action.');
assert.match(platformControl, /Monitor Pilot/, 'Company Registry must expose the pilot next action.');
assert.match(platformControl, /Open Company/, 'Company Registry must expose the live company action.');
assert.match(
  platformControl,
  /authService\.logout\(\)[\s\S]+ArthHRMS\.html\?reason=company_handoff&tenant=/,
  'Platform Owner handoff must end the platform session and return through company authentication.'
);

assert.match(
  companyAdmin,
  /Number\(setupHome\?\.coreProgress\|\|0\)<100&&!requestedSection[\s\S]+setup\.html\?source=company-owner-login/,
  'An authenticated Company Owner must enter setup automatically while core onboarding is incomplete.'
);
assert.match(companySetup, /CompanySetupOrchestrationService/, 'The durable Company Setup route must remain present.');
assert.match(companyLogin, /function resolveTenantLoginTarget/, 'Company login must resolve the requested Company Administration return path.');
assert.match(
  companyLogin,
  /requestedUrl\.pathname !== defaultUrl\.pathname/,
  'Company login must reject return paths outside the authenticated role dashboard.'
);
assert.match(
  authGuard,
  /if \(route !== 'setup\.html'\) return configuredRoles;[\s\S]+isEnabled\?\.\('USE_COMPANY_SETUP_ORCHESTRATION'\)[\s\S]+ \? \['super_admin'\]/,
  'Durable Company Setup must remain restricted to the Company Owner role.'
);

const actionBlock = platformControl.match(
  /function tenantRegistryActionsFor\(tenant\)\{[\s\S]+?(?=async function updateTenantStage)/
)?.[0];
assert.ok(actionBlock, 'Company Registry action implementation must be discoverable.');
const legacyTenant = {
  tenantId: 'TEN-tabsons',
  tenantSlug: 'tabsons',
  companyName: 'Tabsons India Pvt Ltd',
  lifecycleState: 'CREATED'
};
const actionContext = {
  Map,
  Set,
  encodeURIComponent,
  decodeURIComponent,
  _tenantRegistryRows: new Map(),
  currentUser: { id: 'platform-owner', role: 'platform_owner' },
  tenantProvisioningSvc() {
    return { getTenantProvisioningView() { return { success: true, tenants: [] }; } };
  },
  platformView() { return { tenants: [] }; },
  esc(value) { return String(value); },
  window: {},
  globalThis: {},
  sessionStorage: { clear() {} },
  location: { href: '' },
  toast() {},
  actor() { return { id: 'platform-owner', role: 'platform_owner' }; },
  platformAggregateSvc() { return null; }
};
vm.createContext(actionContext);
vm.runInContext(actionBlock, actionContext);

const createdActions = actionContext.tenantRegistryActionsFor(legacyTenant);
assert.deepEqual(
  Array.from(createdActions, action => action.label),
  ['Invite Owner', 'Continue Setup'],
  'CREATED must render both required onboarding actions.'
);
const createdHtml = actionContext.renderTenantRegistryActions(legacyTenant);
assert.match(createdHtml, /Invite Owner/);
assert.match(createdHtml, /Continue Setup/);
assert.strictEqual(
  actionContext.registryTenantByKey('TEN-tabsons'),
  legacyTenant,
  'A rendered compatibility row must resolve by tenantId without a companyId.'
);
assert.equal(actionContext.tenantRegistryActionsFor({ lifecycleState: 'OWNER_INVITED' })[0].label, 'Resend Invite');
assert.equal(actionContext.tenantRegistryActionsFor({ lifecycleState: 'OWNER_ACCEPTED' })[0].label, 'Resume Setup');
assert.equal(actionContext.tenantRegistryActionsFor({ lifecycleState: 'CONFIGURING' })[0].label, 'Resume Setup');
assert.equal(actionContext.tenantRegistryActionsFor({ lifecycleState: 'HR_READY' })[0].label, 'Employee Import');
assert.equal(actionContext.tenantRegistryActionsFor({ lifecycleState: 'VALIDATION' })[0].label, 'Review Validation');
assert.equal(actionContext.tenantRegistryActionsFor({ lifecycleState: 'READY_FOR_REVIEW' })[0].label, 'Open Readiness');
assert.equal(actionContext.tenantRegistryActionsFor({ lifecycleState: 'PILOT' })[0].label, 'Monitor Pilot');
assert.equal(actionContext.tenantRegistryActionsFor({ lifecycleState: 'LIVE' })[0].label, 'Open Company');

console.log('Company onboarding navigation tests passed.');
