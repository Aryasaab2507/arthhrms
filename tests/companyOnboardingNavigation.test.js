const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const platformControl = fs.readFileSync(path.join(root, 'platform-control.html'), 'utf8');
const companyAdmin = fs.readFileSync(path.join(root, 'super-admin.html'), 'utf8');
const companySetup = fs.readFileSync(path.join(root, 'setup.html'), 'utf8');
const platformOnboarding = fs.readFileSync(path.join(root, 'company-setup.html'), 'utf8');
const companyLogin = fs.readFileSync(path.join(root, 'ArthHRMS.html'), 'utf8');
const authGuard = fs.readFileSync(path.join(root, 'services', 'authGuard.js'), 'utf8');

assert.match(platformControl, /renderTenantRegistryActions\(t\)/, 'Company Registry must render lifecycle-aware actions.');
assert.match(
  platformControl,
  /return \[\s*\{kind:'invite-owner',label:'Invite Owner',focus:'owner-invitation'\},\s*\{kind:'company-onboarding',label:'Continue Setup',focus:'company-information'\}/,
  'CREATED companies must show both Invite Owner and Continue Setup.'
);
assert.match(platformControl, /tenantRegistryKeys\(tenant\)/, 'Company Registry must resolve every supported tenant identity shape.');
assert.match(platformControl, /_tenantRegistryRows\.get\(registryKey\)/, 'Actions must resolve from the exact rendered Registry snapshot.');
assert.match(platformControl, /Continue Setup/, 'Company Registry must expose the Company Setup handoff.');
assert.match(platformControl, /Monitor Setup/, 'Company Registry must expose setup monitoring behavior.');
assert.match(platformControl, /Monitor Import/, 'Company Registry must expose employee-import monitoring.');
assert.match(platformControl, /Open Readiness/, 'Company Registry must expose the readiness next action.');
assert.match(platformControl, /Monitor Pilot/, 'Company Registry must expose the pilot next action.');
assert.match(platformControl, /Monitor Company/, 'Company Registry must expose the live company monitoring action.');
assert.match(
  platformControl,
  /new URL\('company-setup\.html',location\.href\)[\s\S]+searchParams\.set\('companyId',companyId\)/,
  'Platform Owner actions must open the isolated control-plane onboarding workspace.'
);
assert.match(platformControl, /async function resolveRegistryTenantByKey/, 'Registry actions must recover from stale rendered state.');
assert.doesNotMatch(platformControl, /reason=company_handoff/, 'Platform Owner must not impersonate Company Owner onboarding.');
assert.match(platformOnboarding, /createCompanyDraft/, 'Platform onboarding must create persisted company registry drafts.');
assert.match(platformOnboarding, /provisionCompany/, 'Platform onboarding must provision the selected tenant.');
assert.match(platformOnboarding, /sendCompanyOwnerInvite/, 'Platform onboarding must use the real Company Owner invitation boundary.');
assert.match(platformOnboarding, /getCompanyWorkspace/, 'Platform onboarding must render persisted lifecycle state.');
assert.doesNotMatch(platformOnboarding, /location\.href\s*=\s*['"]setup\.html/, 'Platform Owner must never enter tenant setup.');

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
  /'setup\.html': \['super_admin'\]/,
  'Company Setup must remain restricted to the Company Owner role in every environment.'
);
assert.doesNotMatch(
  authGuard,
  /'setup\.html': \[[^\]]*platform_owner/,
  'Platform Owner must never be authorized for tenant setup.'
);

const actionBlock = platformControl.match(
  /function tenantRegistryActionsFor\(tenant\)\{[\s\S]+?(?=async function ensureDurableRegistryTenant)/
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
  URL,
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
assert.equal(actionContext.tenantRegistryActionsFor({ lifecycleState: 'OWNER_ACCEPTED' })[0].label, 'Monitor Setup');
assert.equal(actionContext.tenantRegistryActionsFor({ lifecycleState: 'CONFIGURING' })[0].label, 'Monitor Setup');
assert.equal(actionContext.tenantRegistryActionsFor({ lifecycleState: 'HR_READY' })[0].label, 'Monitor Import');
assert.equal(actionContext.tenantRegistryActionsFor({ lifecycleState: 'VALIDATION' })[0].label, 'Monitor Validation');
assert.equal(actionContext.tenantRegistryActionsFor({ lifecycleState: 'READY_FOR_REVIEW' })[0].label, 'Open Readiness');
assert.equal(actionContext.tenantRegistryActionsFor({ lifecycleState: 'PILOT' })[0].label, 'Monitor Pilot');
assert.equal(actionContext.tenantRegistryActionsFor({ lifecycleState: 'LIVE' })[0].label, 'Monitor Company');

console.log('Company onboarding navigation tests passed.');
