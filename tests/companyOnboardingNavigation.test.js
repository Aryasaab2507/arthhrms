const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const platformControl = fs.readFileSync(path.join(root, 'platform-control.html'), 'utf8');
const companyAdmin = fs.readFileSync(path.join(root, 'super-admin.html'), 'utf8');
const companySetup = fs.readFileSync(path.join(root, 'setup.html'), 'utf8');
const companyLogin = fs.readFileSync(path.join(root, 'ArthHRMS.html'), 'utf8');
const authGuard = fs.readFileSync(path.join(root, 'services', 'authGuard.js'), 'utf8');

assert.match(platformControl, /renderTenantRegistryActions\(t\)/, 'Company Registry must render lifecycle-aware actions.');
assert.match(platformControl, /Continue Setup/, 'Company Registry must expose the Company Setup handoff.');
assert.match(platformControl, /Resume Setup/, 'Company Registry must expose setup resume behavior.');
assert.match(platformControl, /Employee Import/, 'Company Registry must expose the employee-import next action.');
assert.match(platformControl, /Open Readiness/, 'Company Registry must expose the readiness next action.');
assert.match(platformControl, /Monitor Pilot/, 'Company Registry must expose the pilot next action.');
assert.match(platformControl, /Open Company/, 'Company Registry must expose the live company action.');
assert.match(
  platformControl,
  /authService\.logout\(\)[\s\S]+ArthHRMS\.html\?reason=company_handoff&returnTo=/,
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

console.log('Company onboarding navigation tests passed.');
