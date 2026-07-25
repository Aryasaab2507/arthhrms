const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const platformControl = fs.readFileSync(path.join(root, 'platform-control.html'), 'utf8');
const companyAdmin = fs.readFileSync(path.join(root, 'super-admin.html'), 'utf8');

function section(start, end) {
  const from = platformControl.indexOf(start);
  const to = platformControl.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `Missing ${start}`);
  assert.notEqual(to, -1, `Missing ${end}`);
  return platformControl.slice(from, to);
}

const overviewTasks = section(
  'function platformOverviewRenderTasks(){',
  'function platformMonitoringRenderTasks(){'
);
const monitoringTasks = section(
  'function platformMonitoringRenderTasks(){',
  'function platformAuditRenderTasks(){'
);
const scheduler = section(
  'async function schedulePlatformPanelRender(',
  'function renderAll('
);

assert.ok(!overviewTasks.includes('Predictive Workforce'));
assert.ok(!overviewTasks.includes('Advanced OKR'));
for (const tenantOperation of [
  'Employee Bulk Import',
  'Employee Profile',
  'Payroll Governance',
  'Leave and Attendance',
  'Recruitment Governance',
  'Team Workspace'
]) {
  assert.ok(
    !monitoringTasks.includes(tenantOperation),
    `${tenantOperation} must not initialize in the Platform Control plane`
  );
}

assert.ok(platformControl.includes("'Enterprise Operations Center':'Operations Summary'"));
assert.ok(platformControl.includes('task.name===preferredName||task.run?.name===preferredName'));
assert.ok(platformControl.includes('tasks=preferred===summary?[summary]:[summary,preferred]'));
assert.ok(platformControl.includes('tasks=tasks.slice(0,3)'));
assert.ok(scheduler.includes('const renderKey=`${resolvedPanelId}:${resolvedHeading}`'));
assert.ok(scheduler.includes('loading?.yieldToBrowser?.()'));
assert.ok(scheduler.includes('performance.now()-sliceStarted>=12'));
assert.ok(platformControl.includes('services/loadingService.js'));
assert.ok(platformControl.includes('services/platformModuleLoaderService.js'));
assert.ok(platformControl.includes('PlatformModuleLoaderService?.loadForPanel'));
assert.ok((platformControl.match(/data-platform-src=/g) || []).length >= 120);
assert.ok((platformControl.match(/<script\s+src=/g) || []).length <= 40);

assert.ok(companyAdmin.includes('href="employee-migration-center.html"'));
assert.ok(companyAdmin.includes('href="go-live-readiness-center.html"'));

console.log('platformControlPerformance.test.js passed');
