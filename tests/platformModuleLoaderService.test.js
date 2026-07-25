const assert = require('node:assert/strict');
const path = require('node:path');

function load(file) {
  delete require.cache[require.resolve(path.resolve(__dirname, '..', file))];
  require(path.resolve(__dirname, '..', file));
}

global.window = global;
global.document = {
  querySelectorAll() { return []; }
};

load('services/platformModuleLoaderService.js');
const service = global.PlatformModuleLoaderService;

assert.deepEqual(service.groupsForPanel('overview', ''), ['overview']);
assert.deepEqual(service.groupsForPanel('tenant', ''), ['company']);
assert.deepEqual(service.groupsForPanel('migration', ''), ['company']);
assert.deepEqual(service.groupsForPanel('monitoring', 'Enterprise Notification Center'), ['notifications']);
assert.deepEqual(service.groupsForPanel('monitoring', 'Integration Marketplace'), ['integrations']);
assert.deepEqual(service.groupsForPanel('monitoring', 'Enterprise Multi-Tenant Usage Command Center'), ['analytics']);
assert.deepEqual(service.groupsForPanel('monitoring', 'Platform Health + Tenant Intelligence'), ['operations']);
assert.deepEqual(service.groupsForPanel('audit', ''), ['audit']);
assert.deepEqual(service.groupsForPanel('security', ''), []);

console.log('platformModuleLoaderService.test.js passed');
