import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testsDirectory = path.join(root, 'tests');
const tests = (await readdir(testsDirectory))
  .filter((name) => name.endsWith('.test.js'))
  .sort((left, right) => left.localeCompare(right));

let passed = 0;
const failures = [];

for (const test of tests) {
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(testsDirectory, test)], {
      cwd: root,
      env: { ...process.env, NODE_ENV: 'test' },
      stdio: 'inherit'
    });
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
  if (exitCode === 0) passed += 1;
  else failures.push(test);
}

console.log(`TOTAL=${tests.length} PASSED=${passed} FAILED=${failures.length}`);
if (failures.length) {
  failures.forEach((test) => console.error(`FAIL: ${test}`));
  process.exitCode = 1;
}
