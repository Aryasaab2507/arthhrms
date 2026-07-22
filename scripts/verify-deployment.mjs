import { access, readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const read = (file) => readFile(path.join(root, file), 'utf8');

const requiredFiles = [
  'package.json', 'package-lock.json', 'Dockerfile', '.dockerignore', '.gitignore',
  'README.md', 'LICENSE', '_headers', 'deploy/nginx.conf',
  '.github/workflows/ci.yml', '.github/workflows/release.yml',
  'context/DEPLOYMENT_CHECKLIST.md', 'context/ROLLBACK_RUNBOOK.md',
  'supabase/functions/invite-user/deno.lock',
  'dist/health.json', 'dist/runtime-config.js'
];
for (const file of requiredFiles) {
  try { await access(path.join(root, file)); } catch { failures.push(`Missing deployment artifact: ${file}`); }
}

const sourcePages = (await readdir(root)).filter((name) => name.endsWith('.html')).sort();
const publicPages = new Set(['ArthHRMS.html', 'auth-callback.html', '403.html']);
for (const page of sourcePages) {
  const source = await read(page);
  const built = await read(path.join('dist', page));
  check(publicPages.has(page) || source.includes('services/authGuard.js'), `${page} lacks the shared authentication guard.`);
  check(built.includes('/runtime-config.js'), `${page} build lacks runtime configuration injection.`);
  check(!built.includes('@supabase/supabase-js@2"'), `${page} build contains an unpinned Supabase client.`);
  check(built.indexOf('/runtime-config.js') < built.indexOf('@supabase/supabase-js@'), `${page} loads Supabase before runtime configuration.`);
}

const migrations = (await readdir(path.join(root, 'supabase', 'migrations'))).filter((name) => name.endsWith('.sql')).sort();
check(migrations.length === 2, 'Exactly two canonical Supabase migrations are required.');
if (migrations.length === 2) {
  check(await read(path.join('supabase', 'migrations', migrations[0])) === await read('context/sql/authenticated_business_persistence.sql'), 'Persistence migration differs from its reviewed canonical SQL.');
  check(await read(path.join('supabase', 'migrations', migrations[1])) === await read('context/sql/storage_policies.sql'), 'Storage migration differs from its reviewed canonical SQL.');
}

const persistenceSql = await read('context/sql/authenticated_business_persistence.sql');
check(/force row level security/i.test(persistenceSql), 'Canonical persistence does not force RLS.');
check(!/user_metadata/i.test(persistenceSql), 'Canonical persistence uses mutable user metadata for authorization.');
check(/revoke all on public\.%I from anon/i.test(persistenceSql), 'Canonical persistence does not revoke anonymous table access.');

const runtimeConfig = await read('dist/runtime-config.js');
check(!runtimeConfig.includes('SUPABASE_SERVICE_ROLE_KEY'), 'Built runtime config references the service role key.');
const dockerfile = await read('Dockerfile');
check((dockerfile.match(/@sha256:/g) || []).length === 2, 'Docker base images must be digest pinned.');
check(/USER nginx/.test(dockerfile), 'Production container must run as the unprivileged nginx user.');
check(/HEALTHCHECK[\s\S]*\/healthz/.test(dockerfile), 'Production container health check is missing.');
const headers = await read('_headers');
check(headers.includes('Content-Security-Policy:'), 'Content Security Policy header is missing.');
check(headers.includes('Strict-Transport-Security:'), 'HSTS header is missing.');

const packageManifest = JSON.parse(await read('package.json'));
const packageLock = JSON.parse(await read('package-lock.json'));
check(packageManifest.engines?.node === '24.17.0', 'Node.js runtime must be exactly pinned.');
check(packageManifest.engines?.npm === '11.13.0', 'npm runtime must be exactly pinned.');
check(packageManifest.packageManager === 'npm@11.13.0', 'package manager must be exactly pinned.');
check(packageLock.lockfileVersion === 3, 'npm lockfile version 3 is required.');

const ciWorkflow = await read('.github/workflows/ci.yml');
const releaseWorkflow = await read('.github/workflows/release.yml');
for (const [name, workflow] of [['CI', ciWorkflow], ['release', releaseWorkflow]]) {
  const actions = [...workflow.matchAll(/uses:\s*([^\s]+)/g)].map((match) => match[1]);
  check(actions.length > 0 && actions.every((action) => /@[a-f0-9]{40}$/i.test(action)), `${name} workflow actions must use full commit SHAs.`);
  check(workflow.includes('deno-version: v2.8.1'), `${name} workflow must pin the Deno runtime.`);
  check(workflow.includes('deno check --frozen') && workflow.includes('deno lint'), `${name} workflow must validate locked Supabase Edge Functions.`);
}
check(releaseWorkflow.includes('environment: production'), 'Release workflow lacks the protected production environment.');
check(releaseWorkflow.indexOf('Build immutable release image') < releaseWorkflow.indexOf('Apply database migrations'), 'Release image must build before production migrations are applied.');
check(releaseWorkflow.indexOf('Apply database migrations') < releaseWorkflow.indexOf('Publish immutable release image'), 'Migration and image publication order is invalid.');
check(releaseWorkflow.includes('RepoDigests'), 'Release workflow must record the published image digest.');

const supabaseConfig = await read('supabase/config.toml');
check(/\[functions\.invite-user\][\s\S]*?verify_jwt\s*=\s*true/.test(supabaseConfig), 'Invite function must verify JWTs at the gateway.');
const inviteFunction = await read('supabase/functions/invite-user/index.ts');
check(inviteFunction.includes('allowedOrigins.has(origin)'), 'Invite function lacks exact origin allowlisting.');
check(!inviteFunction.includes('Access-Control-Allow-Origin": "*"'), 'Invite function must not allow wildcard CORS.');
check(!/assignableRoles[^\n]*platform_owner/.test(inviteFunction), 'Invite function must not provision Platform Owners.');
const denoLock = JSON.parse(await read('supabase/functions/invite-user/deno.lock'));
check(denoLock.version === '5', 'Deno dependency lock version 5 is required.');
check(denoLock.specifiers?.['jsr:@supabase/supabase-js@2.110.8'] === '2.110.8', 'Supabase Edge Function client is not dependency locked.');

const productionEnv = await read('deploy/production.env.example');
for (const expected of [
  'APP_ENV=production', 'PRODUCTION_MODE=true', 'DEMO_MODE=false',
  'USE_SUPABASE_AUTH=true', 'USE_SUPABASE_STORAGE=true',
  'USE_SUPABASE_INVITES=true', 'USE_SUPABASE_PERSISTENCE=true'
]) {
  check(productionEnv.includes(expected), `Production environment template lacks ${expected}.`);
}
check(!productionEnv.includes('SUPABASE_SERVICE_ROLE_KEY='), 'Browser-safe production environment template exposes a service-role variable.');

const services = await readdir(path.join(root, 'services'));
for (const service of services.filter((name) => name.endsWith('.js'))) {
  const source = await read(path.join('services', service));
  check(!/systemIntegration\s*(?::\s*true|===\s*true)|__bypass/.test(source), `${service} retains a hidden authorization bypass.`);
}

if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL: ${failure}`));
  console.error(`DEPLOYMENT_VERIFICATION=FAILED CHECKS=${failures.length}`);
  process.exitCode = 1;
} else {
  console.log(`DEPLOYMENT_VERIFICATION=PASSED HTML=${sourcePages.length} MIGRATIONS=${migrations.length}`);
}
