const assert = require('node:assert/strict');
const path = require('node:path');

function load(file) {
  delete require.cache[require.resolve(path.resolve(__dirname, '..', file))];
  require(path.resolve(__dirname, '..', file));
}

async function main() {
  global.window = global;
  global.crypto = { randomUUID: () => '00000000-0000-4000-8000-000000000401' };
  const currentActor = { id: 'OWNER-1', role: 'super_admin', tenantId: 'tabsons', companyId: 'tabsons' };
  const state = { workforceDataHubRuns: [] };
  let flushCount = 0;
  const managers = [{ id: 'MGR-1', name: 'Manager One', employmentStatus: 'ACTIVE' }];

  global.authService = { getCurrentUser: () => currentActor };
  global.supabaseClientService = { isEnabled: flag => flag === 'USE_WORKFORCE_DATA_HUB' };
  global.supabasePersistenceService = { async flush() { flushCount += 1; } };
  global.DB = {
    get() { return state; },
    save() {},
    getEmployee(id) { return managers.find(manager => manager.id === id) || null; }
  };
  global.EmployeeMasterImportService = {
    normalizeImportPayload(input) {
      return { success: true, records: (input.records || []).map((row, index) => ({ ...row, __rowNumber: row.__rowNumber || index + 1 })), mapping: {} };
    },
    runDryRun(input) {
      const records = input.records || [];
      const seen = new Set();
      const duplicates = [];
      const validationRows = records.map((row, index) => {
        const rowNumber = row.__rowNumber || index + 1;
        const issues = [];
        if (seen.has(row.employeeCode)) {
          issues.push({ code: 'DUPLICATE_EMPLOYEE_CODE', severity: 'ERROR' });
          duplicates.push({ rowNumber, employeeCode: row.employeeCode, matchType: 'FILE_EMPLOYEE_CODE' });
        }
        seen.add(row.employeeCode);
        if (row.manager === 'MISSING') issues.push({ code: 'MANAGER_NOT_FOUND', severity: 'ERROR' });
        return { rowNumber, employeeCode: row.employeeCode, email: row.email, status: issues.length ? 'INVALID' : 'VALID', issues };
      });
      const invalid = validationRows.filter(row => row.status === 'INVALID').length;
      return {
        success: true,
        summary: { totalRecords: records.length, validRecords: records.length - invalid, invalidRecords: invalid, duplicates: duplicates.length },
        validation: { summary: { totalRecords: records.length, invalidRecords: invalid }, records: validationRows },
        duplicates: { duplicates },
        conflicts: { resolutions: [] },
        riskScore: invalid * 20
      };
    },
    executeImport(input) {
      return { success: true, importId: 'EMP-IMPORT-1', summary: { importedEmployees: input.records.length }, transaction: { snapshotId: 'SNAP-1' } };
    },
    rollbackImport() {
      return { success: true, rollback: { rollbackId: 'ROLLBACK-1' } };
    }
  };

  load('services/workforceDataHubService.js');
  const service = global.WorkforceDataHubService;
  const review = await service.createReview({
    tenantSlug: 'tabsons',
    fileName: 'employees.xlsx',
    fileType: 'XLSX',
    records: [
      { employeeCode: 'EMP-1', email: 'one@example.com', manager: 'MGR-1' },
      { employeeCode: 'EMP-1', email: 'duplicate@example.com', manager: 'MGR-1' },
      { employeeCode: 'EMP-2', email: 'two@example.com', manager: 'MISSING' }
    ]
  }, { actor: currentActor, tenantSlug: 'tabsons' });
  assert.equal(review.success, true);
  assert.equal(review.run.state, 'BLOCKED');
  assert.equal(state.workforceDataHubRuns.length, 1);

  const duplicate = await service.resolveDuplicate({
    runId: review.run.runId,
    rowNumber: 2,
    action: 'SKIP'
  }, { actor: currentActor, tenantSlug: 'tabsons' });
  assert.equal(duplicate.success, true);
  assert.equal(duplicate.run.state, 'BLOCKED', 'missing manager remains a blocker');

  const manager = await service.assignManager({
    runId: review.run.runId,
    rowNumber: 3,
    managerId: 'MGR-1'
  }, { actor: currentActor, tenantSlug: 'tabsons' });
  assert.equal(manager.success, true);
  assert.equal(manager.run.state, 'READY');

  const committed = await service.commit({ runId: review.run.runId }, { actor: currentActor, tenantSlug: 'tabsons' });
  assert.equal(committed.success, true);
  assert.equal(committed.run.state, 'COMMITTED');
  assert.equal(committed.result.summary.importedEmployees, 2);

  const rolledBack = await service.rollback({ runId: review.run.runId }, { actor: currentActor, tenantSlug: 'tabsons' });
  assert.equal(rolledBack.success, true);
  assert.equal(rolledBack.run.state, 'ROLLED_BACK');
  assert.ok(flushCount >= 5, 'each workflow mutation must flush authenticated persistence');

  assert.throws(
    () => service.dashboard({ actor: { ...currentActor, tenantId: 'other' }, tenantSlug: 'tabsons' }),
    /trusted tenant/i,
    'cross-tenant access must fail closed'
  );

  console.log('workforceDataHubService.test.js passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
