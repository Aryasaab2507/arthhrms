const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'services', 'storageService.js'), 'utf8');
const calls = [];
let clicked = false;

const anchor = {
  style: {},
  click() { clicked = true; },
  remove() {}
};

const sandbox = {
  console,
  document: {
    body: { appendChild() {} },
    createElement(tag) {
      assert.equal(tag, 'a');
      return anchor;
    }
  },
  FrontendSecurityService: {
    setSafeAttribute(element, name, value) {
      if (name !== 'href' || !String(value).startsWith('https://')) return false;
      element[name] = value;
      return true;
    }
  },
  authService: {
    getCurrentUser() {
      return { id: 'user-1', empId: 'EMP-1', role: 'employee' };
    }
  },
  rbacEnforcementService: {
    resolveTenant() {
      return 'tenant-a';
    },
    requireAccess(request) {
      calls.push({ type: 'access', request });
      return true;
    }
  },
  supabaseClientService: {
    readConfig() {
      return { flags: { USE_SUPABASE_STORAGE: true } };
    },
    getClient() {
      return {
        storage: {
          from(bucket) {
            return {
              async upload(objectPath) {
                calls.push({ type: 'upload', bucket, objectPath });
                return { data: { path: objectPath }, error: null };
              },
              async createSignedUrl(objectPath, expiresIn) {
                calls.push({ type: 'signed', bucket, objectPath, expiresIn });
                return { data: { signedUrl: 'https://storage.example.test/signed' }, error: null };
              },
              async remove(objectPaths) {
                calls.push({ type: 'remove', bucket, objectPaths });
                return { data: objectPaths, error: null };
              }
            };
          }
        }
      };
    }
  }
};

vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'services/storageService.js' });

(async () => {
  const service = sandbox.storageService;
  const file = { name: '../employee contract.pdf', size: 1024, type: 'application/pdf' };
  const objectPath = service.buildPath('EMP-1', file.name, 'documents/123');

  assert.equal(objectPath, 'tenant-a/EMP-1/documents/123/employee-contract.pdf');
  const validation = service.validateFile(service.BUCKETS.EMPLOYEE_DOCS, file);
  assert.equal(validation.ok, true);
  assert.equal(validation.errors.length, 0);

  const upload = await service.uploadFile(service.BUCKETS.EMPLOYEE_DOCS, objectPath, file);
  assert.equal(upload.ok, true);
  assert.equal(upload.path, objectPath);

  const download = await service.downloadFile(service.BUCKETS.EMPLOYEE_DOCS, objectPath, file.name);
  assert.equal(download.ok, true);
  assert.equal(clicked, true);

  const removal = await service.removeFile(service.BUCKETS.EMPLOYEE_DOCS, objectPath);
  assert.equal(removal.ok, true);
  assert.equal(service.hasStoredFile({ storageBucket: 'employee-docs', storagePath: objectPath }), true);
  assert.equal(service.hasStoredFile({ fileData: 'data:application/pdf;base64,AA==' }), false);

  assert.ok(calls.some((call) => call.type === 'upload' && call.objectPath === objectPath));
  assert.ok(calls.some((call) => call.type === 'signed' && call.expiresIn === 60));
  assert.ok(calls.some((call) => call.type === 'remove' && call.objectPaths[0] === objectPath));
  assert.ok(calls.some((call) => call.type === 'access' && call.request.action === 'delete'));

  const employeePortal = fs.readFileSync(path.join(root, 'employee-portal.html'), 'utf8');
  const hrDashboard = fs.readFileSync(path.join(root, 'hr-dashboard.html'), 'utf8');
  assert.match(employeePortal, /storageService\.uploadFile/);
  assert.match(employeePortal, /storageService\.downloadFile/);
  assert.match(hrDashboard, /storageService\.uploadFile/);
  assert.match(hrDashboard, /storageService\.removeFile/);
  const rbacSource = fs.readFileSync(path.join(root, 'services', 'rbacEnforcementService.js'), 'utf8');
  assert.match(rbacSource, /documents:[\s\S]*employee:\s*\[[^\]]*'delete'/);

  console.log('storageService tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
