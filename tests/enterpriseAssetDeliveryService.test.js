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
    setAttribute() {}, removeAttribute() {}, appendChild() {}, querySelector() { return null; }, querySelectorAll() { return []; },
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
  global.navigator = { userAgent: 'Node enterprise asset delivery test', platform: 'Win32' };
  global.location = {
    href: '',
    origin: 'https://platform.arthhrms.example',
    hostname: 'platform.arthhrms.example',
    pathname: '/platform-control.html',
    replace(url) { this.href = url; }
  };
  global.document = {
    querySelector() { return null; }, querySelectorAll() { return []; }, getElementById() { return null; },
    createElement() { return fakeEl(); }, addEventListener() {}, body: fakeEl(), documentElement: fakeEl()
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
    companyName: 'Tabsons',
    timezone: 'Asia/Calcutta'
  };
  data.platformTenants = [
    { tenantId: 'TEN-tabsons', tenantSlug: 'tabsons', companyName: 'Tabsons', lifecycleState: 'ACTIVE' },
    { tenantId: 'TEN-abc', tenantSlug: 'abc', companyName: 'ABC', lifecycleState: 'ACTIVE', privateNote: 'ABC confidential asset' }
  ];
  data.assetDeliveryRecords = [
    { assetId: 'AST-LOGO', tenantSlug: 'tabsons', assetType: 'logos', assetPath: '/assets/branding/tabsons-logo.png', visibility: 'PUBLIC', sizeBytes: 180000, mimeType: 'image/png', region: 'ap-south-1', optimized: false, cdnHitCount: 70, originHitCount: 20, bandwidthBytes: 1800000, averageDownloadMs: 94 },
    { assetId: 'AST-JS', tenantSlug: 'tabsons', assetType: 'javascript', assetPath: '/assets/app/main.js', visibility: 'PUBLIC', sizeBytes: 76000, mimeType: 'application/javascript', versionedPath: 'main.old111.js', cdnHitCount: 95, originHitCount: 5, bandwidthBytes: 760000, averageDownloadMs: 42 },
    { assetId: 'AST-DOC', tenantSlug: 'tabsons', assetType: 'downloadable_documents', assetPath: '/documents/hr/private-handbook.pdf', visibility: 'PRIVATE', sizeBytes: 400000, mimeType: 'application/pdf', region: 'ap-south-1', cdnHitCount: 10, originHitCount: 12, bandwidthBytes: 1200000, averageDownloadMs: 150 },
    { assetId: 'AST-ABC', tenantSlug: 'abc', assetType: 'downloadable_documents', assetPath: '/documents/abc/secret.pdf', visibility: 'PRIVATE', sizeBytes: 300000, mimeType: 'application/pdf', privateNote: 'ABC confidential asset', cdnHitCount: 30, originHitCount: 2, bandwidthBytes: 900000 }
  ];
  data.assetDeliveryMetricsHistory = [
    { metricsId: 'ADM-1', tenantSlug: 'tabsons', cdnHitRatio: 82, bandwidthBytes: 2500000, averageDownloadMs: 81, imageSavingsBytes: 320000, region: 'ap-south-1', immutable: true },
    { metricsId: 'ADM-X', tenantSlug: 'abc', cdnHitRatio: 90, bandwidthBytes: 900000, privateNote: 'ABC confidential asset', immutable: true }
  ];
  data.enterpriseAssetDeliveryHistory = [];
  data.enterpriseAssetVersionHistory = [];
  data.enterpriseAssetSignedUrlHistory = [];
  data.enterpriseCdnInvalidationHistory = [];
  data.auditLogs = [];
  global.DB.save(data);
}

function ownerContext(tenantSlug = 'tabsons') {
  return {
    tenantSlug,
    actor: { id: 'PO-1', role: 'PLATFORM_OWNER', tenantSlug },
    now: '2026-06-28T10:00:00.000Z'
  };
}

function directorContext(tenantSlug = 'tabsons') {
  return {
    tenantSlug,
    actor: { id: 'DIR-1', role: 'DIRECTOR', tenantSlug },
    now: '2026-06-28T10:00:00.000Z'
  };
}

function employeeContext(tenantSlug = 'tabsons') {
  return {
    tenantSlug,
    actor: { id: 'EMP-1', role: 'EMPLOYEE', tenantSlug },
    now: '2026-06-28T10:00:00.000Z'
  };
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
    'services/storageHardeningService.js',
    'services/documentVisibilityService.js',
    'services/signedUrlGovernanceService.js',
    'services/dashboardPerformanceService.js',
    'services/enterpriseRedisCacheService.js'
  ].forEach(load);
  seedData();

  global.__ARTHHRMS_DEV__ = true;
  try {
    load('services/enterpriseAssetDeliveryService.js');
  } catch (error) {
    if (error && error.code !== 'MODULE_NOT_FOUND') throw error;
  }

  const svc = global.EnterpriseAssetDeliveryService;
  assert.ok(svc, 'EnterpriseAssetDeliveryService should be exported');
  assert.ok(Object.isFrozen(svc), 'asset delivery service export should be frozen');
  assert.equal(global.enterpriseAssetDeliveryService, svc, 'lowercase asset delivery alias should be exported');
  ['AssetDeliveryService', 'ImageOptimizationService', 'SignedUrlService', 'AssetVersionService', 'CdnMetricsCollector', 'CacheControlService'].forEach(name => {
    assert.equal(typeof svc[name], 'object', `${name} helper object should exist`);
    assert.ok(Object.isFrozen(svc[name]), `${name} helper object should be frozen`);
  });
  ['CLOUDFLARE', 'AWS_CLOUDFRONT', 'AZURE_CDN', 'GOOGLE_CLOUD_CDN'].forEach(provider => {
    assert.ok(svc.CDN_PROVIDERS.includes(provider), `${provider} provider should be supported`);
  });
  ['images', 'logos', 'avatars', 'icons', 'css', 'javascript', 'fonts', 'downloadable_documents', 'videos'].forEach(type => {
    assert.ok(svc.ASSET_TYPES.includes(type), `${type} asset type should be supported`);
  });
  assert.equal(global.__ARTHHRMS_ENTERPRISE_ASSET_DELIVERY_SELF_TEST__.passed, true, 'development self-test should pass');

  const imageHeaders = svc.CacheControlService.getCachePolicy({ tenantSlug: 'tabsons', assetType: 'images', assetPath: '/assets/hero.png', fingerprinted: true }, ownerContext());
  assert.equal(imageHeaders.success, true, 'image cache policy should be generated');
  assert.equal(imageHeaders.cachePolicy.maxAgeSeconds, 31536000, 'images should cache for 365 days');
  assert.match(imageHeaders.cachePolicy.cacheControl, /immutable/i, 'fingerprinted image cache policy should be immutable');
  assert.ok(imageHeaders.cachePolicy.etag, 'ETag should be present');
  assert.ok(imageHeaders.cachePolicy.lastModified, 'Last-Modified should be present');

  const htmlHeaders = svc.CacheControlService.getCachePolicy({ tenantSlug: 'tabsons', assetType: 'html', assetPath: '/platform-control.html' }, ownerContext());
  assert.equal(htmlHeaders.success, true, 'HTML cache policy should be generated');
  assert.equal(htmlHeaders.cachePolicy.noLongCache, true, 'HTML should not receive long cache headers');
  assert.ok(htmlHeaders.cachePolicy.maxAgeSeconds <= 300, 'HTML max-age should stay short');

  const compression = svc.AssetDeliveryService.negotiateCompression({ acceptEncoding: 'br, gzip', assetType: 'javascript' }, ownerContext());
  assert.equal(compression.success, true, 'compression should negotiate');
  assert.equal(compression.encoding, 'br', 'Brotli should be preferred when accepted');
  const gzip = svc.AssetDeliveryService.negotiateCompression({ acceptEncoding: 'gzip', assetType: 'css' }, ownerContext());
  assert.equal(gzip.encoding, 'gzip', 'gzip should be supported');

  const versioned = svc.AssetVersionService.versionAsset({
    tenantSlug: 'tabsons',
    assetType: 'javascript',
    assetPath: '/assets/app/main.js',
    content: 'console.log("asset-v2")',
    previousVersion: 'main.old111.js'
  }, ownerContext());
  assert.equal(versioned.success, true, 'asset versioning should succeed');
  assert.match(versioned.versionedAsset.versionedPath, /^main\.[a-f0-9]{8}\.js$/i, 'versioned path should include a fingerprint');
  assert.ok(versioned.invalidatedOldAssets.includes('main.old111.js'), 'old assets should be invalidated after versioning');
  assert.equal(versioned.governance.staleAssetDeliveryPrevented, true);

  const optimized = svc.ImageOptimizationService.optimizeImage({
    tenantSlug: 'tabsons',
    assetId: 'AST-LOGO',
    assetPath: '/assets/branding/tabsons-logo.png',
    assetType: 'logos',
    width: 1600,
    height: 800,
    sizeBytes: 180000,
    device: { supportsAvif: true, supportsWebp: true, viewportWidth: 390, devicePixelRatio: 2 }
  }, ownerContext());
  assert.equal(optimized.success, true, 'image optimization should succeed');
  assert.ok(optimized.optimization.variants.some(item => item.format === 'webp'), 'WebP variant should be generated');
  assert.ok(optimized.optimization.variants.some(item => item.format === 'avif'), 'AVIF variant should be generated');
  assert.ok(optimized.optimization.responsiveWidths.length >= 4, 'responsive image widths should be generated');
  assert.equal(optimized.optimization.lazyLoading, true, 'lazy loading should be enabled');
  assert.equal(optimized.optimization.progressiveLoading, true, 'progressive loading should be enabled');
  assert.equal(optimized.optimization.thumbnail.generated, true, 'thumbnail metadata should be generated');
  assert.ok(optimized.optimization.savingsBytes > 0, 'optimization should report bandwidth savings');

  const signed = svc.SignedUrlService.generateSignedUrl({
    tenantSlug: 'tabsons',
    assetId: 'AST-DOC',
    assetPath: '/documents/hr/private-handbook.pdf',
    assetType: 'downloadable_documents',
    visibility: 'PRIVATE',
    expiresInSeconds: 900,
    action: 'DOWNLOAD'
  }, ownerContext());
  assert.equal(signed.success, true, 'private asset signed URL should be generated');
  assert.match(signed.signedUrl.url, /^https:\/\/cdn\.arthhrms\.example\/tenant\/tabsons\/asset\//, 'signed URL should be tenant scoped');
  assert.equal(signed.signedUrl.expiresSafely, true);
  assert.equal(signed.governance.privateAssetsRequireAuthorization, true);
  assert.doesNotMatch(text(signed), /private-handbook|signature=secret|rawSecret/i, 'signed URL output should not expose raw object names or secrets');

  const validSigned = svc.SignedUrlService.validateSignedUrl(signed.signedUrl, ownerContext());
  assert.equal(validSigned.success, true, 'fresh signed URL should validate');
  const expiredSigned = svc.SignedUrlService.validateSignedUrl(signed.signedUrl, { ...ownerContext(), now: '2026-06-28T10:20:00.000Z' });
  assert.equal(expiredSigned.success, false, 'expired signed URL should be blocked');
  assert.equal(expiredSigned.code, 'SIGNED_URL_EXPIRED');

  const traversal = svc.AssetDeliveryService.resolveAsset({
    tenantSlug: 'tabsons',
    assetType: 'images',
    assetPath: '../secrets.env',
    visibility: 'PUBLIC'
  }, ownerContext());
  assert.equal(traversal.success, false, 'directory traversal should be blocked');
  assert.equal(traversal.code, 'ASSET_PATH_BLOCKED');

  const mimeBlocked = svc.AssetDeliveryService.resolveAsset({
    tenantSlug: 'tabsons',
    assetType: 'images',
    assetPath: '/assets/malware.exe',
    mimeType: 'application/x-msdownload',
    visibility: 'PUBLIC'
  }, ownerContext());
  assert.equal(mimeBlocked.success, false, 'unsupported MIME should be blocked');
  assert.equal(mimeBlocked.code, 'ASSET_MIME_BLOCKED');

  const crossTenant = svc.AssetDeliveryService.resolveAsset({
    tenantSlug: 'abc',
    assetId: 'AST-ABC',
    assetPath: '/documents/abc/secret.pdf',
    assetType: 'downloadable_documents',
    visibility: 'PRIVATE',
    privateNote: 'ABC confidential asset'
  }, ownerContext('tabsons'));
  assert.equal(crossTenant.success, false, 'cross-tenant asset access should be denied');
  assert.equal(crossTenant.code, 'TENANT_ACCESS_DENIED');
  assert.doesNotMatch(text(crossTenant), /ABC confidential|secret\.pdf|AST-ABC/i, 'cross-tenant denial should not leak asset data');

  const fallback = svc.AssetDeliveryService.resolveAsset({
    tenantSlug: 'tabsons',
    assetId: 'AST-LOGO',
    assetPath: '/assets/branding/tabsons-logo.png',
    assetType: 'logos',
    provider: 'CLOUDFLARE',
    cdnAvailable: false,
    visibility: 'PUBLIC'
  }, ownerContext());
  assert.equal(fallback.success, true, 'CDN outage should fall back to origin');
  assert.equal(fallback.delivery.cdnAvailable, false);
  assert.equal(fallback.delivery.originFallback, true);
  assert.match(fallback.delivery.url, /^https:\/\/origin\.arthhrms\.example\//, 'origin URL should be used during CDN outage');

  const invalidation = svc.AssetDeliveryService.invalidateAssetCache({
    tenantSlug: 'tabsons',
    assetPath: '/assets/app/main.js',
    reason: 'asset version promotion'
  }, ownerContext());
  assert.equal(invalidation.success, true, 'CDN cache invalidation should be recorded');
  assert.ok(invalidation.invalidation.invalidatedKeys.length >= 1, 'invalidation should include cache keys');

  const metrics = svc.CdnMetricsCollector.collectMetrics({ tenantSlug: 'tabsons', region: 'ap-south-1' }, directorContext());
  assert.equal(metrics.success, true, 'CDN metrics should be collected');
  assertScore(metrics.analytics.cdnHitRatio, 'cdn hit ratio');
  assert.ok(metrics.analytics.bandwidthBytes > 0, 'bandwidth usage should be tracked');
  assert.ok(metrics.analytics.averageDownloadMs >= 0, 'download time should be tracked');
  assert.ok(metrics.analytics.imageOptimizationSavingsBytes >= 0, 'image savings should be tracked');
  assertScore(metrics.assetPerformanceScore, 'asset performance score');
  assertScore(metrics.deliveryEfficiencyScore, 'delivery efficiency score');
  assertScore(metrics.cdnHealthScore, 'CDN health score');

  const report = svc.AssetDeliveryService.generateAssetDeliveryReport({ tenantSlug: 'tabsons' }, directorContext());
  assert.equal(report.success, true, 'director should see asset delivery analytics');
  assert.equal(report.architecture.browser, true);
  assert.equal(report.architecture.cdnEdge, true);
  assert.equal(report.architecture.originServer, true);
  assert.equal(report.architecture.storage, true);
  assert.equal(report.security.signedUrls, true);
  assert.equal(report.security.originProtection, true);
  assert.equal(report.security.hotlinkPrevention, true);
  assert.equal(report.security.mimeValidation, true);
  assert.equal(report.governance.tenantIsolationPreserved, true);
  assert.equal(report.governance.cdnGovernancePreserved, true);
  assert.doesNotMatch(text(report), /ABC confidential|secret\.pdf|AST-ABC/i, 'asset delivery report should remain tenant scoped');
  assert.ok(Object.isFrozen(report) && Object.isFrozen(report.analytics));

  const employeeReport = svc.AssetDeliveryService.generateAssetDeliveryReport({ tenantSlug: 'tabsons' }, employeeContext());
  assert.equal(employeeReport.success, false, 'employee cannot view CDN operations center');
  assert.equal(employeeReport.code, 'ASSET_GOVERNANCE_DENIED');

  const malformed = svc.AssetDeliveryService.resolveAsset('bad-payload', ownerContext());
  assert.equal(malformed.success, false, 'malformed asset payload should fail safely');
  assert.ok(Object.isFrozen(malformed));

  const data = global.DB.get();
  assert.ok(data.enterpriseAssetDeliveryHistory.length >= 1, 'asset delivery history should be persisted');
  assert.ok(data.enterpriseAssetDeliveryHistory.every(row => row.immutable === true));
  assert.ok(data.enterpriseAssetVersionHistory.length >= 1, 'asset version history should be persisted');
  assert.ok(data.enterpriseAssetVersionHistory.every(row => row.immutable === true));
  assert.ok(data.enterpriseAssetSignedUrlHistory.length >= 1, 'signed URL history should be persisted');
  assert.ok(data.enterpriseAssetSignedUrlHistory.every(row => row.immutable === true));
  assert.ok(data.enterpriseCdnInvalidationHistory.length >= 1, 'CDN invalidation history should be persisted');
  assert.ok(data.enterpriseCdnInvalidationHistory.every(row => row.immutable === true));
  assert.ok(data.assetDeliveryMetricsHistory.some(row => row.immutable === true && row.tenantSlug === 'tabsons'), 'asset metrics history should remain immutable');
  assert.ok((data.auditLogs || []).some(row => /ASSET_|CDN_|SIGNED_URL/.test(String(row.actionType || row.action || row.type || ''))), 'asset delivery actions should be audited');

  const frozen = svc.freezeAssetDeliveryOutput({ nested: { value: 1 } });
  assert.ok(Object.isFrozen(frozen) && Object.isFrozen(frozen.nested), 'asset delivery outputs should be deeply frozen');

  console.log('enterpriseAssetDeliveryService.test.js passed');
}

main();
