const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'platform-control.html'), 'utf8');
const shellStyles = fs.readFileSync(path.join(root, 'styles', 'platform-control-shell.css'), 'utf8');
const authGuard = fs.readFileSync(path.join(root, 'services', 'authGuard.js'), 'utf8');

const requiredModules = [
  'dashboard',
  'companies',
  'company-onboarding',
  'users',
  'identity-access',
  'security',
  'imports',
  'deployments',
  'operations',
  'monitoring',
  'system-health',
  'notifications',
  'integrations',
  'governance',
  'analytics',
  'billing',
  'audit-logs',
  'feature-flags',
  'branding',
  'settings',
  'test-lab',
  'qa-center',
  'support'
];

assert.match(page, /styles\/platform-control-shell\.css/, 'Platform Control must load its shell stylesheet.');
assert.match(page, /id="platformNavigationSearch"[^>]+type="search"/, 'Module navigation must provide an accessible search control.');
assert.match(page, /id="platformBreadcrumbCurrent"/, 'The current platform module must be exposed in a breadcrumb.');
assert.match(page, /function filterPlatformNavigation\(/, 'Module search must have a deterministic filter.');
assert.match(page, /function restorePlatformNavigation\(/, 'Module deep links must restore the selected platform module.');
assert.match(page, /function openPlatformModule\(/, 'Buried platform capabilities must be reachable through focused module navigation.');
assert.match(page, /\['ArrowDown','ArrowUp'\]/, 'The module navigation must support keyboard traversal.');

const moduleIds = Array.from(page.matchAll(/\bdata-module="([^"]+)"/g), match => match[1]);
requiredModules.forEach(moduleId => {
  assert.ok(moduleIds.includes(moduleId), `Platform module ${moduleId} must be discoverable.`);
});
assert.equal(new Set(moduleIds).size, moduleIds.length, 'Platform module identifiers must be unique.');

const panelIds = new Set(Array.from(page.matchAll(/\bid="panel-([^"]+)"/g), match => match[1]));
const panelControls = Array.from(page.matchAll(/\baria-controls="panel-([^"]+)"/g), match => match[1])
  .filter(panelId => !panelId.includes('$'));
panelControls.forEach(panelId => {
  assert.ok(panelIds.has(panelId), `Navigation references missing panel ${panelId}.`);
});

assert.equal((page.match(/\bid="panel-overview"/g) || []).length, 1, 'The dashboard panel must have one stable DOM identifier.');
assert.ok(
  page.indexOf('id="panel-overview"') < page.indexOf('Enterprise Global Search Bar'),
  'Dashboard intelligence must be contained by the dashboard panel instead of rendering above every module.'
);

const focusedHeadings = Array.from(
  page.matchAll(/openPlatformModule\('[^']+',this,'([^']+)'\)/g),
  match => match[1]
);
focusedHeadings.forEach(heading => {
  assert.ok(page.includes(`>${heading}<`), `Focused module heading is missing: ${heading}.`);
});

const linkedPages = Array.from(
  page.matchAll(/class="platform-nav-item"[^>]+href="([^"]+\.html)"/g),
  match => match[1].toLowerCase()
);
linkedPages.forEach(linkedPage => {
  const policyPattern = new RegExp(`'${linkedPage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'\\s*:\\s*\\[[^\\]]*'platform_owner'`);
  assert.match(authGuard, policyPattern, `${linkedPage} must explicitly authorize Platform Owner access.`);
});
assert.doesNotMatch(
  page,
  /class="platform-nav-item"[^>]+href="(?:company-profile-center|organization-import-center|super-admin|hr-dashboard|admin|manager|employee-portal)\.html"/i,
  'The Platform Control shell must not link into tenant dashboards.'
);

assert.match(shellStyles, /html\[data-user-theme="dark"\]/, 'The shell must support the existing dark theme preference.');
assert.match(shellStyles, /@media \(max-width: 980px\)/, 'The shell must include tablet navigation behavior.');
assert.match(shellStyles, /@media \(max-width: 620px\)/, 'The shell must include mobile layout behavior.');
assert.doesNotMatch(shellStyles, /letter-spacing:\s*-\d/, 'The shell must not use negative letter spacing.');

console.log('platformControlShell.test.js passed');
