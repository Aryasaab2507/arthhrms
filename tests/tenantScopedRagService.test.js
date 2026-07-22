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

function load(file) {
  require(path.resolve(__dirname, '..', file));
}

function setupRuntime() {
  global.window = global;
  global.localStorage = new Store();
  global.sessionStorage = new Store();
  global.confirm = () => true;
  global.alert = () => {};
  global.navigator = { userAgent: 'Node tenant-scoped RAG foundation test', platform: 'Win32' };
  global.location = {
    href: '',
    origin: 'https://tabsons.arthhrms.example',
    hostname: 'tabsons.arthhrms.example',
    pathname: '/platform-control.html',
    replace(url) { this.href = url; }
  };
  global.document = {
    querySelector() { return null; }, querySelectorAll() { return []; }, getElementById() { return null; },
    createElement() { return fakeEl(); }, addEventListener() {}, body: fakeEl(), documentElement: fakeEl()
  };
}

function hrContext(tenantSlug = 'tabsons') {
  return {
    tenantSlug,
    actor: { id: 'HR-1', role: 'HR', tenantSlug },
    now: '2026-06-30T15:00:00.000Z'
  };
}

function directorContext(tenantSlug = 'tabsons') {
  return {
    tenantSlug,
    actor: { id: 'DIR-1', role: 'DIRECTOR', tenantSlug },
    now: '2026-06-30T15:00:00.000Z'
  };
}

function employeeContext(tenantSlug = 'tabsons') {
  return {
    tenantSlug,
    actor: { id: 'EMP-1', role: 'EMPLOYEE', tenantSlug },
    now: '2026-06-30T15:00:00.000Z'
  };
}

function seedData() {
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
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC', lifecycleState: 'ACTIVE' }
  ];
  data.employees = [
    { id: 'EMP-1', empId: 'EMP-1', name: 'Alice Apollo', role: 'EMPLOYEE', department: 'People', tenantSlug: 'tabsons' },
    { id: 'HR-1', empId: 'HR-1', name: 'Harini HR', role: 'HR', department: 'People', tenantSlug: 'tabsons' },
    { id: 'DIR-1', empId: 'DIR-1', name: 'Dev Director', role: 'DIRECTOR', department: 'Leadership', tenantSlug: 'tabsons' },
    { id: 'HR-X', empId: 'HR-X', name: 'ABC HR', role: 'HR', department: 'People', tenantSlug: 'abc' }
  ];
  data.departments = [
    { departmentId: 'DEPT-PEOPLE', name: 'People', tenantSlug: 'tabsons', status: 'ACTIVE' },
    { departmentId: 'DEPT-FIN', name: 'Finance', tenantSlug: 'abc', status: 'ACTIVE' }
  ];
  data.documents = [
    { documentId: 'DOC-SEED-1', title: 'Existing HR Policy', category: 'POLICY', status: 'ACTIVE', tenantSlug: 'tabsons', department: 'People' }
  ];
  data.knowledgeDocumentHistory = [];
  data.knowledgeMetadataHistory = [];
  data.knowledgeChunkHistory = [];
  data.knowledgeEmbeddingQueue = [];
  data.knowledgeVectorHistory = [];
  data.knowledgeSearchIndex = [];
  data.knowledgeRegistryHistory = [];
  data.knowledgeSearchHistory = [];
  data.knowledgeAnalyticsHistory = [];
  data.auditLogs = [];
  global.DB.save(data);
}

function text(value) {
  return JSON.stringify(value);
}

function assertScore(value, label) {
  assert.ok(Number.isFinite(value), `${label} should be numeric`);
  assert.ok(value >= 0 && value <= 100, `${label} should be between 0 and 100`);
}

function main() {
  setupRuntime();
  global.__ARTHHRMS_DEV__ = false;
  [
    'db.js',
    'services/auditService.js',
    'services/validationRegistryService.js',
    'services/uploadValidationService.js',
    'services/distributedQueueService.js',
    'services/enterpriseLoggingPipelineService.js'
  ].forEach(load);
  seedData();

  global.__ARTHHRMS_DEV__ = true;
  try {
    load('services/tenantScopedRagService.js');
  } catch (error) {
    if (error && error.code === 'MODULE_NOT_FOUND') {
      assert.fail('TenantScopedRagService should be exported');
    }
    throw error;
  }

  const svc = global.TenantScopedRagService;
  assert.ok(svc, 'TenantScopedRagService should be exported');
  assert.equal(global.tenantScopedRagService, svc, 'lowercase RAG alias should be exported');
  assert.ok(Object.isFrozen(svc), 'RAG service export should be frozen');
  [
    'KnowledgeService',
    'DocumentParser',
    'ChunkingService',
    'EmbeddingProvider',
    'VectorRepository',
    'KnowledgeSearchService',
    'KnowledgeRegistry'
  ].forEach(name => {
    assert.equal(typeof svc[name], 'object', `${name} helper object should exist`);
    assert.ok(Object.isFrozen(svc[name]), `${name} helper object should be frozen`);
  });
  assert.ok(svc.KNOWLEDGE_SOURCE_TYPES.includes('EMPLOYEE_HANDBOOK'), 'employee handbook source should be supported');
  assert.ok(svc.SUPPORTED_DOCUMENT_FORMATS.includes('PDF'), 'PDF parsing surface should be supported');
  assert.ok(svc.CHUNKING_STRATEGIES.includes('FIXED_SIZE'), 'fixed chunking should be supported');
  assert.ok(svc.CHUNKING_STRATEGIES.includes('SLIDING_WINDOW'), 'sliding window chunking should be supported');
  assert.ok(svc.VECTOR_PROVIDERS.includes('PGVECTOR'), 'pgvector abstraction should be present');
  assert.ok(svc.EMBEDDING_PROVIDERS.includes('LOCAL'), 'local embedding interface should be present');
  assert.equal(global.__ARTHHRMS_TENANT_RAG_SELF_TEST__.passed, true, 'development RAG self-test should pass');

  const upload = svc.KnowledgeService.uploadKnowledgeDocument({
    tenantSlug: 'tabsons',
    sourceType: 'LEAVE_POLICY',
    documentType: 'PDF',
    policyType: 'Leave',
    department: 'People',
    ownerId: 'HR-1',
    fileName: 'leave-policy.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 4096,
    tags: ['leave', 'policy', 'handbook'],
    approvalStatus: 'APPROVED',
    retention: { retentionDays: 2555, archiveAfterDays: 1800 },
    content: 'Apollo leave policy. Employees may carry forward leave after approval. Payroll policy content is not used here. Emergency leave requires HR approval.'
  }, hrContext());
  assert.equal(upload.success, true, 'knowledge document upload should succeed');
  assert.equal(upload.document.tenantSlug, 'tabsons', 'upload must retain tenant scope');
  assert.equal(upload.document.status, 'UPLOADED', 'uploaded document should enter upload status');
  assert.equal(upload.document.indexStatus, 'PENDING', 'uploaded document should wait for indexing');
  assert.equal(upload.governance.tenantIsolationPreserved, true, 'upload governance should preserve tenant isolation');
  assert.equal(upload.governance.aiGenerationDisabled, true, 'upload must not enable answer generation');
  assert.ok(Object.isFrozen(upload.document), 'uploaded document output should be frozen');

  const metadata = svc.DocumentParser.extractMetadata({
    tenantSlug: 'tabsons',
    documentId: upload.document.documentId
  }, hrContext());
  assert.equal(metadata.success, true, 'metadata extraction should succeed');
  assert.equal(metadata.metadata.fileExtension, 'pdf', 'metadata should include file extension');
  assert.equal(metadata.metadata.department, 'People', 'metadata should include department');
  assert.equal(metadata.metadata.policyType, 'Leave', 'metadata should include policy type');
  assert.equal(metadata.metadata.ownerId, 'HR-1', 'metadata should include owner');

  const extracted = svc.DocumentParser.extractText({
    tenantSlug: 'tabsons',
    documentId: upload.document.documentId
  }, hrContext());
  assert.equal(extracted.success, true, 'text extraction should succeed');
  assert.match(extracted.text, /carry forward leave/i, 'extracted text should contain document content');

  const chunks = svc.ChunkingService.chunkDocument({
    tenantSlug: 'tabsons',
    documentId: upload.document.documentId,
    strategy: 'FIXED_SIZE',
    chunkSize: 72,
    metadata: { department: 'People', policyType: 'Leave' }
  }, hrContext());
  assert.equal(chunks.success, true, 'fixed-size chunking should succeed');
  assert.ok(chunks.chunks.length >= 2, 'small fixed chunk size should create multiple chunks');
  assert.ok(chunks.chunks.every(row => row.tenantSlug === 'tabsons' && row.documentId === upload.document.documentId), 'chunks must carry tenant and document ids');
  assert.equal(chunks.chunks[0].chunkOrder, 1, 'chunks should be ordered');
  assert.ok(Object.isFrozen(chunks.chunks[0]), 'chunk outputs should be frozen');

  const sliding = svc.ChunkingService.chunkDocument({
    tenantSlug: 'tabsons',
    documentId: 'DOC-SLIDING',
    text: 'Alpha policy context creates overlapping windows so later recovery can preserve nearby meaning across chunk boundaries.',
    strategy: 'SLIDING_WINDOW',
    chunkSize: 48,
    overlap: 12,
    metadata: { department: 'People', policyType: 'Training' }
  }, hrContext());
  assert.equal(sliding.success, true, 'sliding window chunking should succeed with direct text');
  assert.ok(sliding.chunks.length >= 2, 'sliding window should create overlapping chunks');
  assert.ok(sliding.chunks[1].charStart < sliding.chunks[0].charEnd, 'sliding window should overlap adjacent chunks');

  const embedding = svc.EmbeddingProvider.createEmbeddingRequest({
    tenantSlug: 'tabsons',
    documentId: upload.document.documentId,
    chunks: chunks.chunks,
    provider: 'LOCAL',
    model: 'local-governed-embedding'
  }, hrContext());
  assert.equal(embedding.success, true, 'embedding request should be prepared');
  assert.equal(embedding.embeddingRequest.externalLlmCalled, false, 'embedding provider must not call external LLMs');
  assert.equal(embedding.embeddingRequest.embeddingGenerated, false, 'embedding request should not generate embeddings yet');
  assert.equal(embedding.embeddingRequest.queued, true, 'embedding request should be queue-ready');
  assert.equal(embedding.providerInterfacePrepared, true, 'embedding provider abstraction should be ready');

  const vectors = svc.VectorRepository.storeVectors({
    tenantSlug: 'tabsons',
    documentId: upload.document.documentId,
    chunks: chunks.chunks,
    provider: 'PGVECTOR',
    embeddingRequestId: embedding.embeddingRequest.requestId
  }, hrContext());
  assert.equal(vectors.success, true, 'vector store abstraction should persist searchable vectors');
  assert.equal(vectors.vectorStore.provider, 'PGVECTOR', 'vector provider should remain provider-neutral');
  assert.ok(vectors.vectorStore.vectorCount >= chunks.chunks.length, 'vector store should include chunk vectors');
  assert.equal(vectors.vectorStore.externalProviderCalled, false, 'vector abstraction must not call an external provider');

  const registry = svc.KnowledgeRegistry.getKnowledgeRegistry({ tenantSlug: 'tabsons' }, directorContext());
  assert.equal(registry.success, true, 'knowledge registry should be readable by governed roles');
  assert.ok(registry.documents.some(row => row.documentId === upload.document.documentId), 'registry should include uploaded document');
  assert.ok(registry.chunks.length >= chunks.chunks.length, 'registry should include chunks');
  assert.ok(registry.vectorStores.length >= 1, 'registry should include vector status');

  const search = svc.KnowledgeSearchService.searchKnowledge({
    tenantSlug: 'tabsons',
    query: 'carry forward leave approval',
    searchMode: 'HYBRID',
    filters: {
      department: 'People',
      policyType: 'Leave',
      documentType: 'PDF',
      tags: ['leave']
    },
    limit: 10
  }, directorContext());
  assert.equal(search.success, true, 'hybrid search should succeed');
  assert.ok(search.results.some(row => row.documentId === upload.document.documentId), 'search should return the indexed policy');
  assert.equal(search.answerGenerated, false, 'search must not generate AI answers');
  assert.equal(search.externalLlmCalled, false, 'search must not call external LLMs');
  assertScore(search.searchAccuracyScore, 'search accuracy score');

  const vectorSearch = svc.KnowledgeSearchService.searchKnowledge({
    tenantSlug: 'tabsons',
    query: 'emergency HR approval',
    searchMode: 'VECTOR',
    limit: 5
  }, directorContext());
  assert.equal(vectorSearch.success, true, 'vector search should use local abstraction');
  assert.ok(vectorSearch.results.length >= 1, 'vector search should return locally scored chunks');

  const otherIndex = svc.KnowledgeService.indexKnowledgeDocument({
    tenantSlug: 'abc',
    sourceType: 'HR_POLICY',
    documentType: 'TXT',
    policyType: 'Payroll',
    department: 'Finance',
    ownerId: 'HR-X',
    fileName: 'abc-private.txt',
    mimeType: 'text/plain',
    sizeBytes: 1024,
    approvalStatus: 'APPROVED',
    content: 'ABC private knowledge. Secret payroll integration note for tenant ABC only.'
  }, hrContext('abc'));
  assert.equal(otherIndex.success, true, 'other tenant should be able to index its own knowledge');

  const leakSearch = svc.KnowledgeSearchService.searchKnowledge({
    tenantSlug: 'tabsons',
    query: 'ABC private knowledge secret payroll',
    searchMode: 'HYBRID',
    limit: 10
  }, directorContext());
  assert.equal(leakSearch.success, true, 'same-tenant search should complete even when query names another tenant');
  assert.equal(leakSearch.results.some(row => row.tenantSlug === 'abc'), false, 'search results must not include another tenant');
  assert.doesNotMatch(text(leakSearch), /ABC private knowledge|tenant ABC only/i, 'search output must not leak other-tenant content');

  const denied = svc.KnowledgeSearchService.searchKnowledge({
    tenantSlug: 'abc',
    query: 'ABC private',
    searchMode: 'KEYWORD'
  }, hrContext('tabsons'));
  assert.equal(denied.success, false, 'cross-tenant search should be denied');
  assert.equal(denied.code, 'TENANT_ACCESS_DENIED', 'cross-tenant search should fail closed');

  const employeeUpload = svc.KnowledgeService.uploadKnowledgeDocument({
    tenantSlug: 'tabsons',
    sourceType: 'HR_POLICY',
    documentType: 'TXT',
    fileName: 'employee-owned.txt',
    mimeType: 'text/plain',
    content: 'employee upload attempt'
  }, employeeContext());
  assert.equal(employeeUpload.success, false, 'employee should not manage the knowledge library');

  const duplicate = svc.KnowledgeService.uploadKnowledgeDocument({
    tenantSlug: 'tabsons',
    sourceType: 'LEAVE_POLICY',
    documentType: 'PDF',
    policyType: 'Leave',
    department: 'People',
    ownerId: 'HR-1',
    fileName: 'leave-policy.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 4096,
    tags: ['leave'],
    content: 'Apollo leave policy. Employees may carry forward leave after approval. Payroll policy content is not used here. Emergency leave requires HR approval.'
  }, hrContext());
  assert.equal(duplicate.success, false, 'duplicate uploads should be rejected safely');
  assert.match(duplicate.code, /DUPLICATE/i, 'duplicate upload should be classified');

  const unsupported = svc.KnowledgeService.uploadKnowledgeDocument({
    tenantSlug: 'tabsons',
    sourceType: 'HR_POLICY',
    documentType: 'EXE',
    fileName: 'bad.exe',
    mimeType: 'application/x-msdownload',
    content: 'bad'
  }, hrContext());
  assert.equal(unsupported.success, false, 'unsupported formats should be rejected safely');

  const corrupted = svc.DocumentParser.extractText({
    tenantSlug: 'tabsons',
    documentType: 'PDF',
    fileName: 'corrupted.pdf',
    mimeType: 'application/pdf',
    corrupted: true,
    content: ''
  }, hrContext());
  assert.equal(corrupted.success, false, 'corrupted PDFs should fail safely');
  assert.doesNotThrow(() => svc.KnowledgeService.indexKnowledgeDocument('bad-payload', hrContext()), 'malformed indexing payloads should not throw');

  const report = svc.KnowledgeService.generateKnowledgeReport({ tenantSlug: 'tabsons' }, directorContext());
  assert.equal(report.success, true, 'knowledge report should be generated');
  assert.ok(report.analytics.documentCount >= 1, 'analytics should count documents');
  assert.ok(report.analytics.chunkCount >= chunks.chunks.length, 'analytics should count chunks');
  assertScore(report.analytics.knowledgeCoverageScore, 'knowledge coverage score');
  assertScore(report.analytics.indexHealthScore, 'index health score');
  assert.equal(report.governance.aiGenerationDisabled, true, 'report should confirm AI generation is disabled');
  assert.equal(report.integrations.distributedQueue, true, 'queue integration should be detected');
  assert.equal(report.futureAiIntegration.noExternalLlmCalls, true, 'future roadmap should preserve no external calls today');

  const db = global.DB.get();
  assert.ok(db.knowledgeDocumentHistory.every(row => row.tenantSlug === 'tabsons' || row.tenantSlug === 'abc'), 'document history should remain tenant scoped');
  assert.ok(db.knowledgeDocumentHistory.every(row => row.immutable === true), 'document history should be immutable');
  assert.ok(db.knowledgeChunkHistory.every(row => row.immutable === true), 'chunk history should be immutable');
  assert.ok(db.knowledgeVectorHistory.every(row => row.immutable === true), 'vector history should be immutable');
  assert.ok(db.knowledgeSearchHistory.every(row => row.immutable === true), 'search history should be immutable');
  assert.ok((db.auditLogs || []).some(row => /KNOWLEDGE|RAG/.test(String(row.actionType || row.action || row.module || ''))), 'knowledge actions should be audited');

  console.log('tenantScopedRagService.test.js passed');
}

main();
