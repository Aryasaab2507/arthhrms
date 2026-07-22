const assert = require('node:assert/strict');
const path = require('node:path');

class Store {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
}

function fakeEl() {
  return {
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, removeAttribute() {}, appendChild() {}, insertBefore() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    value: '', textContent: '', innerHTML: ''
  };
}

function setupRuntime() {
  global.window = global;
  global.localStorage = new Store();
  global.sessionStorage = new Store();
  global.confirm = () => true;
  global.alert = () => {};
  global.navigator = { userAgent: 'Node compliance governance test', platform: 'Win32' };
  global.location = {
    href: '',
    origin: 'https://platform.arthhrms.example',
    hostname: 'platform.arthhrms.example',
    pathname: '/platform-control.html',
    replace(url) { this.href = url; }
  };
  global.document = {
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementById() { return null; },
    createElement() { return fakeEl(); },
    addEventListener() {},
    body: fakeEl(),
    documentElement: fakeEl()
  };
}

function load(file) {
  require(path.resolve(__dirname, '..', file));
}

function ctx(role = 'PLATFORM_OWNER', tenantSlug = 'tabsons', id = 'PO-1') {
  return {
    tenantSlug,
    actor: { id, role, tenantSlug, department: 'Platform' },
    now: '2026-07-01T12:00:00.000Z'
  };
}

function assertScore(value, label) {
  assert.ok(Number.isFinite(value), `${label} should be numeric`);
  assert.ok(value >= 0 && value <= 100, `${label} should be between 0 and 100`);
}

function text(value) {
  return JSON.stringify(value);
}

function seedComplianceData() {
  global.DB.migrate();
  const data = global.DB.get();
  data.companySettings = {
    ...(data.companySettings || {}),
    tenantId: 'TEN-tabsons',
    tenantSlug: 'tabsons',
    companyId: 'TEN-tabsons',
    companyName: 'Tabsons'
  };
  data.platformTenants = [
    { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyName: 'Tabsons', lifecycleState: 'ACTIVE' },
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC', lifecycleState: 'ACTIVE', privateNote: 'ABC private compliance evidence' }
  ];
  data.auditLogs = [];
  data.complianceControlHistory = [];
  data.complianceEvidenceHistory = [];
  data.compliancePolicyHistory = [
    { tenantSlug: 'tabsons', policyId: 'POL-INFOSEC', policyKey: 'INFORMATION_SECURITY_POLICY', version: 2, owner: 'Security', approvalStatus: 'APPROVED', reviewDate: '2026-06-15', nextReview: '2026-12-15', immutable: true },
    { tenantSlug: 'tabsons', policyId: 'POL-AUP', policyKey: 'ACCEPTABLE_USE_POLICY', version: 1, owner: 'HR', approvalStatus: 'APPROVED', reviewDate: '2026-06-15', nextReview: '2026-12-15', immutable: true },
    { tenantSlug: 'tabsons', policyId: 'POL-PASSWORD', policyKey: 'PASSWORD_POLICY', version: 3, owner: 'Security', approvalStatus: 'APPROVED', reviewDate: '2026-06-15', nextReview: '2026-12-15', immutable: true },
    { tenantSlug: 'tabsons', policyId: 'POL-BACKUP', policyKey: 'BACKUP_POLICY', version: 2, owner: 'Infrastructure', approvalStatus: 'APPROVED', reviewDate: '2026-06-15', nextReview: '2026-12-15', immutable: true },
    { tenantSlug: 'tabsons', policyId: 'POL-RETENTION', policyKey: 'RETENTION_POLICY', version: 2, owner: 'Compliance', approvalStatus: 'APPROVED', reviewDate: '2026-06-15', nextReview: '2026-12-15', immutable: true },
    { tenantSlug: 'tabsons', policyId: 'POL-IR', policyKey: 'INCIDENT_RESPONSE', version: 1, owner: 'Security', approvalStatus: 'APPROVED', reviewDate: '2026-06-15', nextReview: '2026-12-15', immutable: true },
    { tenantSlug: 'tabsons', policyId: 'POL-BCP', policyKey: 'BUSINESS_CONTINUITY', version: 1, owner: 'Operations', approvalStatus: 'APPROVED', reviewDate: '2026-06-15', nextReview: '2026-12-15', immutable: true },
    { tenantSlug: 'tabsons', policyId: 'POL-VENDOR', policyKey: 'VENDOR_MANAGEMENT', version: 1, owner: 'Procurement', approvalStatus: 'APPROVED', reviewDate: '2026-06-15', nextReview: '2026-12-15', immutable: true },
    { tenantSlug: 'tabsons', policyId: 'POL-ACCESS', policyKey: 'ACCESS_CONTROL', version: 2, owner: 'Security', approvalStatus: 'APPROVED', reviewDate: '2026-06-15', nextReview: '2026-12-15', immutable: true },
    { tenantSlug: 'tabsons', policyId: 'POL-DP', policyKey: 'DATA_PROTECTION', version: 2, owner: 'Compliance', approvalStatus: 'APPROVED', reviewDate: '2026-06-15', nextReview: '2026-12-15', immutable: true },
    { tenantSlug: 'abc', policyId: 'POL-ABC', policyKey: 'PRIVATE_POLICY', version: 1, privateNote: 'ABC private compliance evidence', immutable: true }
  ];
  data.complianceRiskRegister = [
    { tenantSlug: 'tabsons', riskId: 'RISK-1', severity: 'MEDIUM', likelihood: 2, impact: 3, owner: 'Security', mitigation: 'Quarterly access reviews', residualRisk: 'LOW', reviewDate: '2026-07-15', immutable: true },
    { tenantSlug: 'tabsons', riskId: 'RISK-2', severity: 'LOW', likelihood: 1, impact: 2, owner: 'Operations', mitigation: 'Backup monitoring', residualRisk: 'LOW', reviewDate: '2026-07-15', immutable: true },
    { tenantSlug: 'abc', riskId: 'RISK-ABC', severity: 'CRITICAL', privateNote: 'ABC private compliance evidence', immutable: true }
  ];
  data.environmentConfigurationHistory = [
    { tenantSlug: 'tabsons', key: 'DATABASE_URL', configured: true, secret: true, immutable: true },
    { tenantSlug: 'tabsons', key: 'REDIS_URL', configured: true, secret: true, immutable: true },
    { tenantSlug: 'tabsons', key: 'JWT_SECRET', configured: true, secret: true, immutable: true },
    { tenantSlug: 'tabsons', key: 'MFA_REQUIRED', configured: true, value: true, immutable: true },
    { tenantSlug: 'abc', key: 'PRIVATE_ABC_SECRET', configured: true, value: 'ABC private compliance evidence', immutable: true }
  ];
  data.infrastructureConfigurationHistory = [
    { tenantSlug: 'tabsons', component: 'certificate', configured: true, status: 'VALID', immutable: true },
    { tenantSlug: 'tabsons', component: 'storage_bucket', configured: true, status: 'READY', encrypted: true, immutable: true },
    { tenantSlug: 'tabsons', component: 'secure_headers', configured: true, status: 'READY', immutable: true }
  ];
  data.permissionMatrixHistory = [
    { tenantSlug: 'tabsons', matrixId: 'RBAC-1', state: 'ACTIVE', rbacAuthoritative: true, immutable: true }
  ];
  data.mfaConfigurationHistory = [
    { tenantSlug: 'tabsons', configurationId: 'MFA-1', enabled: true, requiredForPrivilegedRoles: true, immutable: true }
  ];
  data.loginSecurityPolicyHistory = [
    { tenantSlug: 'tabsons', policyId: 'LOGIN-1', lockoutThreshold: 5, rateLimitEnabled: true, state: 'ACTIVE', immutable: true }
  ];
  data.sessionPolicyHistory = [
    { tenantSlug: 'tabsons', policyId: 'SESS-1', inactivityTimeoutMinutes: 30, distributedSessions: true, state: 'ACTIVE', immutable: true }
  ];
  data.auditRetentionHistory = [
    { tenantSlug: 'tabsons', policyId: 'AUDRET-1', retentionDays: 2555, immutable: true }
  ];
  data.tenantIsolationValidationHistory = [
    { tenantSlug: 'tabsons', validationId: 'TI-1', status: 'PASSED', immutable: true }
  ];
  data.validationRegistryRuleHistory = [
    { tenantSlug: 'tabsons', ruleId: 'VR-1', category: 'TENANT_VALIDATION', status: 'ACTIVE', immutable: true },
    { tenantSlug: 'tabsons', ruleId: 'VR-2', category: 'SECURITY_VALIDATION', status: 'ACTIVE', immutable: true }
  ];
  data.apiGatewayRateLimitHistory = [
    { tenantSlug: 'tabsons', policyId: 'RL-1', scope: 'TENANT', limitPerMinute: 200, state: 'ACTIVE', immutable: true }
  ];
  data.enterpriseLogHistory = [
    { tenantSlug: 'tabsons', logId: 'LOG-OK', level: 'INFO', category: 'SECURITY', message: 'Compliance logging seed.', immutable: true },
    { tenantSlug: 'abc', logId: 'LOG-ABC', level: 'ERROR', message: 'ABC private compliance evidence', immutable: true }
  ];
  data.observabilityHealthHistory = [
    { tenantSlug: 'tabsons', endpoint: '/health', status: 'HEALTHY', immutable: true },
    { tenantSlug: 'tabsons', endpoint: '/ready', status: 'HEALTHY', immutable: true },
    { tenantSlug: 'tabsons', endpoint: '/live', status: 'HEALTHY', immutable: true }
  ];
  data.tenantBackupHistory = [
    { tenantSlug: 'tabsons', backupId: 'BKP-1', state: 'COMPLETED', backupType: 'FULL_BACKUP', immutable: true }
  ];
  data.backupIntegrityVerificationHistory = [
    { tenantSlug: 'tabsons', verificationId: 'BIV-1', backupId: 'BKP-1', integrityStatus: 'PASSED', checksumMatched: true, immutable: true }
  ];
  data.disasterRecoverySimulationHistory = [
    { tenantSlug: 'tabsons', simulationId: 'DR-1', status: 'COMPLETED', recoverySuccessful: true, immutable: true }
  ];
  data.productionReadinessRecords = [
    { tenantSlug: 'tabsons', readinessId: 'READY-1', readinessState: 'CERTIFIED', immutable: true }
  ];
  data.enterpriseProductionCertificationHistory = [
    { tenantSlug: 'tabsons', reportId: 'PROD-READY-1', certificationStatus: 'PRODUCTION_READY', scores: { security: 98, reliability: 99, overallProductionScore: 97 }, immutable: true }
  ];
  data.employees = [
    { id: 'EMP-1', tenantSlug: 'tabsons', name: 'Private Employee', salary: 999999 },
    { id: 'EMP-X', tenantSlug: 'abc', name: 'ABC Private', privateNote: 'ABC private compliance evidence' }
  ];
  global.DB.save(data);
}

function main() {
  setupRuntime();
  global.__ARTHHRMS_DEV__ = false;
  [
    'db.js',
    'services/auditService.js',
    'services/validationRegistryService.js',
    'services/enterpriseProductionCertificationService.js',
    'services/infrastructureObservabilityService.js',
    'services/enterpriseLoggingPipelineService.js',
    'services/apiGatewayGovernanceService.js',
    'services/backupIntegrityVerificationService.js',
    'services/disasterRecoverySimulationService.js'
  ].forEach(load);
  seedComplianceData();

  global.__ARTHHRMS_DEV__ = true;
  try {
    load('services/complianceGovernanceService.js');
  } catch (error) {
    if (error && error.code === 'MODULE_NOT_FOUND') {
      assert.fail('ComplianceGovernanceService should be exported');
    }
    throw error;
  }

  const svc = global.ComplianceGovernanceService;
  assert.ok(svc, 'ComplianceGovernanceService should be exported');
  assert.equal(global.complianceGovernanceService, svc, 'lowercase compliance alias should be exported');
  assert.ok(Object.isFrozen(svc), 'compliance export should be frozen');
  [
    'ComplianceRegistry',
    'EvidenceCollector',
    'ControlValidator',
    'PolicyRegistry',
    'RiskEngine',
    'ComplianceScoreService'
  ].forEach(name => {
    assert.equal(typeof svc[name], 'object', `${name} helper should exist`);
    assert.ok(Object.isFrozen(svc[name]), `${name} helper should be frozen`);
  });
  assert.equal(global.__ARTHHRMS_COMPLIANCE_GOVERNANCE_SELF_TEST__.passed, true, 'development self-test should pass');

  const controls = svc.ComplianceRegistry.loadControls({ tenantSlug: 'tabsons' }, ctx());
  assert.equal(controls.success, true, 'control registry should load');
  assert.ok(controls.controls.length >= 20, 'SOC 2 and ISO controls should be registered');
  assert.ok(controls.controls.some(row => row.framework === 'SOC2' && row.category === 'Security'), 'SOC 2 Security controls should exist');
  assert.ok(controls.controls.some(row => row.framework === 'ISO27001' && row.category === 'Access Control'), 'ISO access controls should exist');
  controls.controls.forEach(control => {
    ['controlId', 'framework', 'category', 'owner', 'description', 'implementationStatus', 'evidenceStatus', 'reviewFrequency', 'riskRating', 'lastReview', 'nextReview', 'evidenceReferences'].forEach(key => {
      assert.ok(Object.prototype.hasOwnProperty.call(control, key), `control should include ${key}`);
    });
  });

  const evidence = svc.EvidenceCollector.collectEvidence({ tenantSlug: 'tabsons' }, ctx());
  assert.equal(evidence.success, true, 'evidence collection should work');
  assert.ok(evidence.evidenceReferences.length >= 8, 'evidence references should be collected');
  ['Audit Logs', 'Monitoring', 'Infrastructure', 'Security', 'Configuration', 'Backups', 'Recovery Reports', 'Validation Reports'].forEach(source => {
    assert.ok(evidence.evidenceReferences.some(row => row.source === source), `${source} evidence should be present`);
  });
  assert.ok(evidence.evidenceReferences.every(row => row.immutable === true), 'evidence references should be immutable');
  assert.doesNotMatch(text(evidence), /999999|Private Employee|ABC private compliance evidence|PRIVATE_ABC_SECRET/i, 'evidence output must not leak sensitive or cross-tenant data');

  const validation = svc.ControlValidator.validateControls({ tenantSlug: 'tabsons' }, ctx());
  assert.equal(validation.success, true, 'automated control validation should run');
  assertScore(validation.controlValidationScore, 'control validation score');
  ['RBAC enabled', 'MFA enabled', 'Audit logging active', 'Encryption active', 'Secrets configured', 'Password policy', 'Session management', 'Backup policy', 'Monitoring', 'Logging', 'Rate limiting', 'Disaster recovery', 'Tenant isolation', 'API validation', 'Secure headers'].forEach(name => {
    assert.ok(validation.automatedControls.some(row => row.name === name), `${name} should be validated`);
  });
  assert.equal(validation.automatedControls.filter(row => row.status === 'FAILED').length, 0, 'seeded tenant should pass automated controls');

  const failedValidation = svc.ControlValidator.validateControls({
    tenantSlug: 'tabsons',
    evidence: {
      rbacEnabled: false,
      mfaEnabled: false,
      auditLoggingActive: false,
      disasterRecoveryReady: false
    }
  }, ctx());
  assert.equal(failedValidation.success, true, 'failed controls should produce validation output');
  assert.ok(failedValidation.failedControls.length >= 4, 'missing evidence should produce failed controls');
  assert.ok(failedValidation.exceptions.some(row => row.exceptionType === 'MISSING_EVIDENCE'), 'missing evidence exceptions should be tracked');

  const policies = svc.PolicyRegistry.loadPolicies({ tenantSlug: 'tabsons' }, ctx());
  assert.equal(policies.success, true, 'policy registry should load');
  assert.ok(policies.policies.length >= 10, 'required policies should be present');
  ['Information Security Policy', 'Acceptable Use Policy', 'Password Policy', 'Backup Policy', 'Retention Policy', 'Incident Response', 'Business Continuity', 'Vendor Management', 'Access Control', 'Data Protection'].forEach(name => {
    assert.ok(policies.policies.some(row => row.name === name && row.approvalStatus === 'APPROVED'), `${name} should be approved`);
  });

  const upsertedPolicy = svc.PolicyRegistry.upsertPolicy({
    tenantSlug: 'tabsons',
    policyKey: 'PASSWORD_POLICY',
    owner: 'Security',
    approvalStatus: 'APPROVED',
    reviewDate: '2026-07-01',
    nextReview: '2027-07-01'
  }, ctx());
  assert.equal(upsertedPolicy.success, true, 'policy updates should be versioned');
  assert.equal(upsertedPolicy.policy.version, 4, 'policy update should increment version');
  assert.equal(upsertedPolicy.policy.immutable, true, 'policy history should be immutable');

  const risk = svc.RiskEngine.generateRiskRegister({ tenantSlug: 'tabsons' }, ctx());
  assert.equal(risk.success, true, 'risk register should load');
  assert.ok(risk.risks.length >= 2, 'seeded risks should be returned');
  assertScore(risk.enterpriseRiskScore, 'enterprise risk score');
  assert.ok(risk.risks.every(row => row.riskId && row.owner && row.mitigation), 'risks should include governance fields');

  const report = svc.ComplianceScoreService.generateComplianceReport({ tenantSlug: 'tabsons' }, ctx());
  assert.equal(report.success, true, 'compliance report should generate');
  assertScore(report.scores.soc2Readiness, 'SOC 2 readiness');
  assertScore(report.scores.iso27001Readiness, 'ISO readiness');
  assertScore(report.scores.securityScore, 'security score');
  assertScore(report.scores.governanceScore, 'governance score');
  assertScore(report.scores.evidenceCompleteness, 'evidence completeness');
  assertScore(report.scores.riskScore, 'risk score');
  assert.equal(report.certificationClaims.soc2Certified, false, 'SOC 2 certification must not be claimed');
  assert.equal(report.certificationClaims.iso27001Certified, false, 'ISO 27001 certification must not be claimed');
  assert.equal(report.governance.productionWorkflowBehaviorChanged, false, 'production workflow behavior must not change');
  assert.equal(report.governance.complianceGovernancePreserved, true, 'compliance governance should be preserved');
  assert.equal(report.execution.backgroundReady, true, 'validation should be background-ready');
  assert.equal(report.execution.incrementalReady, true, 'validation should be incremental-ready');
  assert.equal(report.execution.nonBlocking, true, 'validation should be non-blocking');
  assert.ok(report.upcomingReviews.length >= 1, 'upcoming reviews should be generated');
  assert.ok(Object.isFrozen(report), 'report should be immutable');
  assert.doesNotMatch(text(report), /999999|Private Employee|ABC private compliance evidence|PRIVATE_ABC_SECRET/i, 'report must not leak sensitive or cross-tenant data');

  const crossTenant = svc.ComplianceScoreService.generateComplianceReport({ tenantSlug: 'abc' }, ctx('PLATFORM_OWNER', 'tabsons', 'PO-1'));
  assert.equal(crossTenant.success, false, 'cross-tenant compliance report should be denied');
  assert.equal(crossTenant.code, 'TENANT_ACCESS_DENIED');
  assert.doesNotMatch(text(crossTenant), /ABC private compliance evidence/i, 'cross-tenant denial must not leak data');

  const employeeDenied = svc.ComplianceScoreService.generateComplianceReport({ tenantSlug: 'tabsons' }, ctx('EMPLOYEE', 'tabsons', 'EMP-1'));
  assert.equal(employeeDenied.success, false, 'employee should not access compliance governance');
  assert.equal(employeeDenied.code, 'COMPLIANCE_RBAC_DENIED');

  const platformDenied = svc.ComplianceScoreService.generateComplianceReport({ platformScope: true }, ctx('HR', 'tabsons', 'HR-1'));
  assert.equal(platformDenied.success, false, 'platform-wide evidence should be platform-owner restricted');
  assert.equal(platformDenied.code, 'COMPLIANCE_PLATFORM_SCOPE_DENIED');

  const db = global.DB.get();
  assert.ok(db.complianceEvidenceHistory.every(row => row.immutable === true), 'evidence history should be immutable');
  assert.ok(db.complianceControlHistory.every(row => row.immutable === true), 'control history should be immutable');
  assert.ok(db.compliancePolicyHistory.every(row => row.immutable === true), 'policy history should be immutable');
  assert.ok(db.auditLogs.some(row => /COMPLIANCE_GOVERNANCE/.test(String(row.actionType || row.action || row.module || ''))), 'compliance actions should be audited');
  assert.equal(db.employees.find(row => row.id === 'EMP-1').salary, 999999, 'business data must remain unchanged');

  console.log('complianceGovernanceService.test.js passed');
}

main();
