const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
require(path.join(root, 'services', 'frontendSecurityService.js'));

function fakeFile(name, type, bytes) {
  const content = Uint8Array.from(bytes);
  return {
    name,
    type,
    size: content.byteLength,
    slice() {
      return { arrayBuffer: async () => content.slice().buffer };
    },
    arrayBuffer: async () => content.slice().buffer
  };
}

async function main() {
  const service = global.FrontendSecurityService;
  assert.ok(service, 'frontend security service must be exported');

  assert.equal(service.escapeHTML('<img onerror="x">'), '&lt;img onerror=&quot;x&quot;&gt;');
  assert.equal(service.sanitizeURL('javascript:alert(1)'), '');
  assert.equal(service.sanitizeURL('java&#x73;cript:alert(1)'), '');
  assert.equal(service.sanitizeURL('data:text/html;base64,PHNjcmlwdD4='), '');
  assert.ok(service.sanitizeURL('/employee-portal.html'));
  assert.equal(service.sanitizeURL('https://user:password@example.com/file'), '');

  const malicious = '<div style="background:url(javascript:alert(1))"><img src="javascript:alert(1)" onerror="alert(1)"><script>alert(1)</script><button onclick="alert(1)">Bad</button><button onclick="editShift(\'SH001\')">Good</button></div>';
  const sanitized = service.sanitizeMarkup(malicious);
  assert.doesNotMatch(sanitized, /<script|onerror|javascript:|onclick="alert/i);
  assert.match(sanitized, /editShift/);
  assert.equal(service.sanitizeStyle('color:red;background:url(https://evil.example/x)'), '');

  assert.equal(service.sanitizeFilename('../../payroll.csv', 'download'), 'payroll.csv');
  assert.equal(service.escapeCSVCell('=HYPERLINK("https://evil.example")'), '"\'=HYPERLINK(""https://evil.example"")"');
  assert.equal(service.escapeCSVCell('+cmd|calc'), "'+cmd|calc");

  const disguised = service.validateFileDescriptor({ name: 'resume.exe.pdf', type: 'application/pdf', size: 100 }, 'document');
  assert.equal(disguised.valid, false, 'disguised executable extension must be rejected');

  const png = fakeFile('avatar.png', 'image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  assert.equal((await service.validateFile(png, 'image')).valid, true, 'valid PNG signature should pass');
  const fakePng = fakeFile('avatar.png', 'image/png', [0x4d, 0x5a, 0x90, 0, 0, 0]);
  assert.equal((await service.validateFile(fakePng, 'image')).valid, false, 'executable bytes disguised as PNG must fail');
  const htmlCsv = fakeFile('employees.csv', 'text/csv', Array.from(Buffer.from('<script>alert(1)</script>')));
  assert.equal((await service.validateFile(htmlCsv, 'spreadsheet')).valid, false, 'HTML disguised as CSV must fail');

  const htmlFiles = fs.readdirSync(root).filter(file => file.endsWith('.html')).map(file => path.join(root, file));
  const contextHtml = path.join(root, 'context', 'system-architecture-map.html');
  if (fs.existsSync(contextHtml)) htmlFiles.push(contextHtml);
  assert.ok(htmlFiles.length >= 30, 'all application entry points should be inspected');
  htmlFiles.forEach(file => {
    const source = fs.readFileSync(file, 'utf8');
    const securityIndex = source.indexOf('frontendSecurityService.js');
    const firstExecutableScript = source.search(/<script\b/i);
    assert.ok(source.includes('Content-Security-Policy'), `${path.basename(file)} must define a CSP`);
    assert.ok(securityIndex >= 0, `${path.basename(file)} must load the frontend security boundary`);
    assert.ok(firstExecutableScript >= 0 && securityIndex >= firstExecutableScript, `${path.basename(file)} security boundary must be the first script`);
  });

  const headers = fs.readFileSync(path.join(root, '_headers'), 'utf8');
  ['Content-Security-Policy', 'Strict-Transport-Security', 'X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Permissions-Policy'].forEach(header => {
    assert.ok(headers.includes(header + ':'), `${header} must be configured`);
  });
  assert.match(headers, /require-trusted-types-for 'script'/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'db.js'), 'utf8'), /\.document\.write\s*\(/, 'report rendering must not use document.write');

  console.log('frontendSecurityService.test.js passed');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
