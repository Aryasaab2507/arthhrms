import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadEnvFile } from 'node:process';
import { parseArgs } from 'node:util';
import {
  resolveRuntimeConfig,
  serializeBrowserRuntimeConfig
} from './runtime-config-contract.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    mode: { type: 'string', default: 'production' },
    'env-file': { type: 'string' }
  }
});
const mode = String(values.mode || 'production').trim().toLowerCase();
if (!['local', 'production'].includes(mode)) {
  throw new Error('Runtime config mode must be local or production.');
}
if (values['env-file']) {
  loadEnvFile(path.resolve(root, values['env-file']));
}
const output = path.resolve(root, positionals[0] || 'dist/runtime-config.js');
const config = resolveRuntimeConfig(process.env, mode);
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, serializeBrowserRuntimeConfig(config), { encoding: 'utf8', mode: 0o600 });
console.log(`${mode === 'production' ? 'Production' : 'Local'} runtime config written to ${path.relative(root, output)} without server secrets.`);
