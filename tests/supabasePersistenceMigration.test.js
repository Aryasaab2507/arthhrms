const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

class Store {
  constructor() { this.map = new Map(); }
  get length() { return this.map.size; }
  key(index) { return Array.from(this.map.keys())[index] || null; }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

class Query {
  constructor(database, table) {
    this.database = database;
    this.table = table;
    this.operation = 'select';
    this.filters = [];
    this.inFilters = [];
    this.payload = null;
    this.conflict = [];
    this.single = false;
    this.limitCount = null;
    this.rangeStart = null;
    this.rangeEnd = null;
  }

  select() { return this; }
  delete() { this.operation = 'delete'; return this; }
  insert(payload) { this.operation = 'insert'; this.payload = Array.isArray(payload) ? payload : [payload]; return this; }
  update(payload) { this.operation = 'update'; this.payload = [payload]; return this; }
  eq(column, value) { this.filters.push([column, value]); return this; }
  in(column, values) { this.inFilters.push([column, values]); return this; }
  order() { return this; }
  limit(value) { this.limitCount = Number(value); return this; }
  range(start, end) { this.rangeStart = Number(start); this.rangeEnd = Number(end); return this; }
  maybeSingle() { this.single = true; return this; }
  upsert(payload, options = {}) {
    this.operation = 'upsert';
    this.payload = Array.isArray(payload) ? payload : [payload];
    this.conflict = String(options.onConflict || '').split(',').filter(Boolean);
    return this;
  }

  execute() {
    const rows = this.database.get(this.table) || [];
    if (this.operation === 'upsert') {
      this.payload.forEach(input => {
        const row = clone(input);
        const index = rows.findIndex(existing => this.conflict.every(key => existing[key] === row[key]));
        if (index >= 0) rows[index] = { ...rows[index], ...row };
        else rows.push(row);
      });
      this.database.set(this.table, rows);
      return { data: clone(this.payload), error: null };
    }

    const matches = row => this.filters.every(([key, value]) => row[key] === value)
      && this.inFilters.every(([key, values]) => values.includes(row[key]));
    if (this.operation === 'delete') {
      this.database.set(this.table, rows.filter(row => !matches(row)));
      return { data: null, error: null };
    }
    if (this.operation === 'insert') {
      for (const input of this.payload) {
        if (rows.some(row => row.tenant_id === input.tenant_id && row.record_type === input.record_type && row.record_id === input.record_id)) {
          return { data: null, error: new Error('duplicate key') };
        }
        rows.push(clone(input));
      }
      this.database.set(this.table, rows);
      return { data: clone(this.payload), error: null };
    }
    if (this.operation === 'update') {
      const updated = [];
      rows.forEach((row, index) => {
        if (!matches(row)) return;
        rows[index] = { ...row, ...clone(this.payload[0]) };
        updated.push(clone(rows[index]));
      });
      this.database.set(this.table, rows);
      return { data: updated, error: null };
    }

    let selected = rows.filter(matches).map(clone);
    if (Number.isFinite(this.limitCount)) selected = selected.slice(0, this.limitCount);
    if (Number.isFinite(this.rangeStart)) selected = selected.slice(this.rangeStart, this.rangeEnd + 1);
    return { data: this.single ? (selected[0] || null) : selected, error: null };
  }

  then(resolve, reject) {
    return Promise.resolve().then(() => this.execute()).then(resolve, reject);
  }
}

async function main() {
  global.window = global;
  global.localStorage = new Store();
  global.sessionStorage = new Store();
  global.ARTHHRMS_CONFIG = {
    flags: {
      PRODUCTION_MODE: true,
      DEVELOPMENT_MODE: false,
      USE_SUPABASE_PERSISTENCE: true
    }
  };

  const database = new Map();
  const client = { from(table) { return new Query(database, table); } };
  let principal = {
    id: '10000000-0000-4000-8000-000000000001',
    source: 'supabase',
    roleTrusted: true,
    role: 'hr',
    empId: 'HR-1',
    tenantId: 'tenant-a',
    organizationId: 'org-a'
  };
  global.authService = { getCurrentUser() { return principal; } };
  global.supabaseClientService = {
    getClient() { return client; },
    readConfig() { return global.ARTHHRMS_CONFIG; }
  };

  require(path.join(root, 'db.js'));
  const legacy = global.DB.get();
  legacy.companySettings = { ...legacy.companySettings, tenantId: 'tenant-a', organizationId: 'org-a' };
  legacy.employees = [{ id: 'EMP-1', empId: 'EMP-1', name: 'Migrated Employee', managerId: 'HR-1', password: 'legacy-secret' }];
  legacy.attendance = [{ id: 'ATT-1', empId: 'EMP-1', date: '2026-07-20', status: 'Present' }];
  legacy.leaveRequests = [{ id: 'LEV-1', empId: 'EMP-1', status: 'Pending' }];
  legacy.payroll = [{ id: 'PAY-1', empId: 'EMP-1', month: '2026-07' }];
  legacy.departments = [{ id: 'DEP-1', name: 'Operations' }];
  legacy.designations = [{ id: 'DES-1', name: 'Analyst' }];
  legacy.jobOpenings = [{ id: 'JOB-1', title: 'Analyst' }];
  legacy.training = [{ id: 'TRN-1', empId: 'EMP-1', title: 'Induction' }];
  legacy.performanceGoals = [{ id: 'GOAL-1', empId: 'EMP-1', title: 'Quality' }];
  legacy.documents = [{ id: 'DOC-1', empId: 'EMP-1', name: 'Policy' }];
  legacy.assets = [{ id: 'AST-1', empId: 'EMP-1', name: 'Laptop' }];
  legacy.notifications = [{ id: 'NOT-1', to: 'EMP-1', title: 'Welcome' }];
  legacy.customReports = [{ id: 'REP-1', name: 'Headcount' }];
  global.localStorage.setItem('arthhrms_db', JSON.stringify(legacy));

  require(path.join(root, 'services', 'supabasePersistenceService.js'));
  const service = global.supabasePersistenceService;
  const result = await service.hydrateAuthenticatedState();

  assert.equal(result.hydrated, true, 'authenticated state should hydrate');
  assert.equal(result.tenantId, 'tenant-a', 'authenticated tenant should own the hydration');
  assert.equal(global.DB.get().employees[0].name, 'Migrated Employee', 'legacy data should migrate once');
  assert.equal(global.localStorage.getItem('arthhrms_db'), null, 'legacy business storage should be purged after persistence');
  assert.equal(database.get('hrms_tenant_state')[0].tenant_id, 'tenant-a', 'tenant manifest must be tenant scoped');
  assert.ok(!database.get('hrms_tenant_state')[0].state.employees, 'tenant manifest must not duplicate business records');
  assert.equal(database.get('hrms_employees')[0].payload.password, undefined, 'legacy credentials must never enter business projections');

  const requiredDomains = [
    'employees', 'attendance', 'leave', 'payroll', 'departments', 'designations', 'recruitment',
    'training', 'performance', 'documents', 'assets', 'notifications', 'reports', 'settings'
  ];
  const domains = new Set(service.ENTITY_DEFINITIONS.map(definition => definition.domain));
  requiredDomains.forEach(domain => assert.ok(domains.has(domain), `${domain} persistence mapping is required`));

  service.ENTITY_DEFINITIONS.forEach(definition => {
    const rows = database.get(definition.table) || [];
    rows.forEach(row => assert.equal(row.tenant_id, 'tenant-a', `${definition.table} row crossed tenant scope`));
  });

  const next = global.DB.get();
  next.employees.push({ id: 'EMP-2', empId: 'EMP-2', name: 'Persisted Employee', managerId: 'HR-1' });
  global.DB.save(next);
  await global.DB.whenPersistenceIdle();
  assert.ok(database.get('hrms_employees').some(row => row.record_id === 'EMP-2'), 'CRUD writes must reach Supabase');

  const afterDelete = global.DB.get();
  afterDelete.employees = afterDelete.employees.filter(employee => employee.id !== 'EMP-2');
  global.DB.save(afterDelete);
  await global.DB.whenPersistenceIdle();
  assert.ok(!database.get('hrms_employees').some(row => row.record_id === 'EMP-2'), 'CRUD deletes must reach Supabase');

  const persistedEmployeeId = global.DB.get().employees[0].id;
  database.set('hrms_employees', database.get('hrms_employees').filter(row => row.record_id !== persistedEmployeeId));
  const stale = global.DB.get();
  stale.employees[0].name = 'Stale Update';
  global.DB.save(stale);
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await assert.rejects(global.DB.whenPersistenceIdle(), /update conflict/i, 'stale updates must fail instead of recreating records');
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(global.DB.get().employees[0].name, 'Migrated Employee', 'failed writes must roll back to confirmed state');

  principal = { ...principal, role: 'employee', tenantId: '', organizationId: '' };
  assert.throws(() => service.currentContext({}), /trusted tenant claim/i, 'ordinary users must fail closed without a tenant claim');

  const dbSource = fs.readFileSync(path.join(root, 'db.js'), 'utf8');
  assert.ok(!/localStorage/.test(dbSource), 'db.js must not depend on localStorage');
  const sql = fs.readFileSync(path.join(root, 'context', 'sql', 'authenticated_business_persistence.sql'), 'utf8');
  assert.match(sql, /enable row level security/gi, 'business tables must enable RLS');
  assert.match(sql, /app_metadata/gi, 'RLS must use trusted app metadata claims');
  assert.ok(!/user_metadata/.test(sql), 'RLS must not trust user-editable metadata');

  global.localStorage.setItem('arthhrms_db', JSON.stringify({ companySettings: { tenantId: 'tenant-b' } }));
  assert.throws(() => service.readLegacyBusinessState('tenant-a'), /does not match/i, 'legacy data must not cross tenant boundaries');

  console.log('Supabase persistence migration tests passed.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
