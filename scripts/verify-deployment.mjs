import { access, readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const read = (file) => readFile(path.join(root, file), 'utf8');

const requiredFiles = [
  'package.json', 'package-lock.json', 'Dockerfile', '.dockerignore', '.gitignore',
  'README.md', 'LICENSE', '_headers', 'vercel.json', 'deploy/nginx.conf',
  '.github/workflows/ci.yml', '.github/workflows/release.yml',
  'context/DEPLOYMENT_CHECKLIST.md', 'context/ROLLBACK_RUNBOOK.md',
  'scripts/configure-pilot.mjs', 'scripts/pilot-onboarding.mjs',
  'scripts/runtime-config-contract.mjs',
  'services/authCallbackService.js', 'services/passwordRecoveryService.js',
  'supabase/functions/invite-user/deno.lock',
  'dist/health.json', 'dist/runtime-config.js'
];
for (const file of requiredFiles) {
  try { await access(path.join(root, file)); } catch { failures.push(`Missing deployment artifact: ${file}`); }
}

const sourcePages = (await readdir(root)).filter((name) => name.endsWith('.html')).sort();
const publicPages = new Set(['ArthHRMS.html', 'index.html', 'platform-login.html', 'password-recovery.html', 'auth-callback.html', '403.html']);
for (const page of sourcePages) {
  const source = await read(page);
  const built = await read(path.join('dist', page));
  check(publicPages.has(page) || source.includes('services/authGuard.js'), `${page} lacks the shared authentication guard.`);
  check(built.includes('/runtime-config.js'), `${page} build lacks runtime configuration injection.`);
  check(!built.includes('@supabase/supabase-js@2"'), `${page} build contains an unpinned Supabase client.`);
  if (built.includes('@supabase/supabase-js@')) {
    check(built.indexOf('/runtime-config.js') < built.indexOf('@supabase/supabase-js@'), `${page} loads Supabase before runtime configuration.`);
  }
  if (!publicPages.has(page)) {
    check(!/id=["']loginScreen["']|loginWithSupabase|loginTenantWithSupabase|loginPlatformOwnerWithSupabase/.test(source), `${page} retains a page-local authentication flow.`);
    check(built.includes('services/rbacEnforcementService.js'), `${page} build lacks the RBAC enforcement boundary.`);
    check(built.includes('services/supabasePersistenceService.js'), `${page} build lacks authenticated persistence.`);
    check(built.indexOf('/runtime-config.js') < built.indexOf('services/authGuard.js'), `${page} runs its guard before runtime configuration.`);
    check(built.indexOf('services/rbacEnforcementService.js') < built.indexOf('services/authGuard.js'), `${page} runs its guard before RBAC is available.`);
    check(built.indexOf('services/supabasePersistenceService.js') < built.indexOf('services/authGuard.js'), `${page} runs its guard before persistence is available.`);
  }
}

const migrations = (await readdir(path.join(root, 'supabase', 'migrations'))).filter((name) => name.endsWith('.sql')).sort();
const persistenceMigration = migrations.find(name => name.endsWith('_authenticated_business_persistence.sql'));
const storageMigration = migrations.find(name => name.endsWith('_storage_policies.sql'));
const integrationMigration = migrations.find(name => name.endsWith('_harden_application_integration.sql'));
const documentStorageMigration = migrations.find(name => name.endsWith('_integrate_document_storage.sql'));
const employeeDocumentDeleteMigration = migrations.find(name => name.endsWith('_allow_employee_document_delete.sql'));
const inviteActivationMigration = migrations.find(name => name.endsWith('_secure_auth_invite_activation.sql'));
check(!!persistenceMigration, 'Canonical persistence migration is missing.');
check(!!storageMigration, 'Canonical Storage migration is missing.');
check(!!integrationMigration, 'Application integration hardening migration is missing.');
check(!!documentStorageMigration, 'Document Storage integration migration is missing.');
check(!!employeeDocumentDeleteMigration, 'Employee document delete policy migration is missing.');
check(!!inviteActivationMigration, 'Secure invitation activation migration is missing.');
if (persistenceMigration) {
  check(await read(path.join('supabase', 'migrations', persistenceMigration)) === await read('context/sql/authenticated_business_persistence.sql'), 'Persistence migration differs from its reviewed canonical SQL.');
}
if (storageMigration) {
  check(await read(path.join('supabase', 'migrations', storageMigration)) === await read('context/sql/storage_policies.sql'), 'Storage migration differs from its reviewed canonical SQL.');
}
if (integrationMigration) {
  const integrationSql = await read(path.join('supabase', 'migrations', integrationMigration));
  check(/set schema arth_private/i.test(integrationSql), 'Manager RLS helper remains in the exposed public schema.');
  check(/revoke all on function public\.rls_auto_enable\(\) from public, anon, authenticated/i.test(integrationSql), 'RLS event trigger function remains client executable.');
  check(/allowed_mime_types/i.test(integrationSql) && /file_size_limit/i.test(integrationSql), 'Storage boundary limits are missing.');
}
if (documentStorageMigration) {
  const documentStorageSql = await read(path.join('supabase', 'migrations', documentStorageMigration));
  check(/foldername\(name\)\)\[2\]\s*=\s*'shared'/i.test(documentStorageSql), 'Shared employee document access is not tenant-scoped in the migration.');
  check(/arth_storage_is_own_path\(name\)/i.test(documentStorageSql), 'Employee-owned document access is missing from the migration.');
}
if (employeeDocumentDeleteMigration) {
  const deleteSql = await read(path.join('supabase', 'migrations', employeeDocumentDeleteMigration));
  check(/hrms_documents_self_delete/i.test(deleteSql), 'Employee document metadata delete policy is missing.');
  check(/subject_id\s*=\s*public\.arth_persistence_emp_id\(\)/i.test(deleteSql), 'Employee document delete is not restricted to the authenticated subject.');
  check(/payload\s*->>\s*'source'[\s\S]*'employee'/i.test(deleteSql), 'Employee document delete is not restricted to employee uploads.');
}
if (inviteActivationMigration) {
  const inviteActivationSql = await read(path.join('supabase', 'migrations', inviteActivationMigration));
  check(/security definer/i.test(inviteActivationSql), 'Invite activation RPC does not own its controlled transaction.');
  check(/auth\.uid\(\)/i.test(inviteActivationSql), 'Invite activation RPC does not bind activation to the authenticated user.');
  check(/tenant_id\s*=\s*caller_tenant[\s\S]*organization_id\s*=\s*caller_organization/i.test(inviteActivationSql), 'Invite activation RPC lacks tenant and organization validation.');
  check(/hrms_audit_records/i.test(inviteActivationSql), 'Invite activation RPC does not persist an audit event.');
  check(/revoke all on function public\.arth_complete_auth_invite_activation\(\) from public, anon/i.test(inviteActivationSql), 'Invite activation RPC is exposed to anonymous callers.');
}

const persistenceSql = await read('context/sql/authenticated_business_persistence.sql');
check(/force row level security/i.test(persistenceSql), 'Canonical persistence does not force RLS.');
check(!/user_metadata/i.test(persistenceSql), 'Canonical persistence uses mutable user metadata for authorization.');
check(/revoke all on public\.%I from anon/i.test(persistenceSql), 'Canonical persistence does not revoke anonymous table access.');

const runtimeConfig = await read('dist/runtime-config.js');
check(!runtimeConfig.includes('SUPABASE_SERVICE_ROLE_KEY'), 'Built runtime config references the service role key.');
check(runtimeConfig.includes("Object.defineProperty(window, 'ARTHHRMS_CONFIG'"), 'Runtime configuration is not installed as an immutable browser contract.');
if (/"APP_ENV": "production"/.test(runtimeConfig)) {
  for (const flag of [
    'USE_SUPABASE_AUTH', 'USE_SUPABASE_PASSWORD_RECOVERY', 'USE_SUPABASE_STORAGE',
    'USE_SUPABASE_INVITES', 'USE_SUPABASE_PERSISTENCE'
  ]) {
    check(new RegExp(`"${flag}": true`).test(runtimeConfig), `Production runtime config did not default ${flag} to true.`);
  }
} else {
  check(/"APP_ENV": "unconfigured"/.test(runtimeConfig), 'Build-time runtime placeholder is malformed.');
}
const authServiceSource = await read('services/authService.js');
const authCallbackSource = await read('services/authCallbackService.js');
const authInviteSource = await read('services/authInviteService.js');
const passwordRecoverySource = await read('services/passwordRecoveryService.js');
const supabaseClientSource = await read('services/supabaseClient.js');
const recoveryPage = await read('password-recovery.html');
const callbackPage = await read('auth-callback.html');
const companyLoginPage = await read('ArthHRMS.html');
check(authServiceSource.includes('resetPasswordForEmail'), 'Auth service lacks the Supabase password recovery request API.');
check(authServiceSource.includes('authCallbackService.dispatchAuthCallback'), 'Auth service does not use the dedicated callback dispatcher.');
check(authCallbackSource.includes('switch (type)'), 'Authentication callback types are not dispatched explicitly.');
check(authCallbackSource.includes('exchangeCodeForSession'), 'PKCE callback exchange is missing.');
check(!/linkAuthUserToEmployee/.test(authCallbackSource), 'Authentication callback dispatcher is coupled to employee linking.');
check(!/updateUser\(\{\s*password/.test(authInviteSource), 'Invite onboarding still owns password recovery.');
check(authInviteSource.includes("client.rpc('arth_complete_auth_invite_activation')"), 'Invite onboarding does not use the tenant-scoped activation transaction.');
check(passwordRecoverySource.includes('updateUser({ password:'), 'Recovery service does not use the current Supabase password update API.');
check(!/linkAuthUserToEmployee/.test(passwordRecoverySource), 'Password recovery is coupled to employee linking.');
check(supabaseClientSource.includes('detectSessionInUrl: false'), 'Supabase client may race the explicit PKCE callback dispatcher.');
check(!/process\.env|querySelector\(['"]meta/.test(supabaseClientSource), 'Browser Supabase initialization has conflicting runtime configuration sources.');
const disabledRecoveryPlaceholder = ['Password recovery is unavailable.', 'Contact your administrator.'].join(' ');
check(!authServiceSource.includes(disabledRecoveryPlaceholder), 'Auth service retains the disabled recovery placeholder.');
check(recoveryPage.includes('services/passwordRecoveryUI.js'), 'Password recovery page does not load the reusable recovery component.');
check(recoveryPage.includes('PasswordRecoveryUI.mountRequest'), 'Password recovery request component is not mounted.');
check(callbackPage.includes('services/authCallbackService.js'), 'Auth callback page does not load the callback dispatcher.');
check(callbackPage.includes('services/passwordRecoveryService.js'), 'Auth callback page does not load the recovery service.');
check(companyLoginPage.includes('href="password-recovery.html?source=company"'), 'Company login does not open the password recovery page.');
check(!/Platform Owner|platform_owner|platform-login\.html/i.test(companyLoginPage), 'Company login exposes Platform Owner authentication.');
const dockerfile = await read('Dockerfile');
check((dockerfile.match(/@sha256:/g) || []).length === 2, 'Docker base images must be digest pinned.');
check(/USER nginx/.test(dockerfile), 'Production container must run as the unprivileged nginx user.');
check(/HEALTHCHECK[\s\S]*\/healthz/.test(dockerfile), 'Production container health check is missing.');
const headers = await read('_headers');
check(headers.includes('Content-Security-Policy:'), 'Content Security Policy header is missing.');
check(headers.includes('Strict-Transport-Security:'), 'HSTS header is missing.');
const dockerRuntimeTemplate = await read('deploy/runtime-config.template.js');
check(dockerRuntimeTemplate.includes('Object.defineProperty(window, "ARTHHRMS_CONFIG"'), 'Container runtime config does not use the immutable browser contract.');
const databaseSource = await read('db.js');
check(!/process\.env|querySelector\(`meta\[name="arthhrms:/.test(databaseSource), 'Database runtime flags have conflicting browser sources.');

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
check(releaseWorkflow.includes('vars.PRODUCTION_APP_ORIGIN'), 'Release workflow lacks the protected hosted application origin.');
check(releaseWorkflow.includes('node scripts/configure-pilot.mjs --apply'), 'Release workflow does not configure hosted Auth and CORS.');
check(releaseWorkflow.indexOf('Build immutable release image') < releaseWorkflow.indexOf('Apply database migrations'), 'Release image must build before production migrations are applied.');
check(releaseWorkflow.indexOf('Apply database migrations') < releaseWorkflow.indexOf('Publish immutable release image'), 'Migration and image publication order is invalid.');
check(releaseWorkflow.includes('RepoDigests'), 'Release workflow must record the published image digest.');

const supabaseConfig = await read('supabase/config.toml');
check(/\[functions\.invite-user\][\s\S]*?verify_jwt\s*=\s*true/.test(supabaseConfig), 'Invite function must verify JWTs at the gateway.');
const inviteFunction = await read('supabase/functions/invite-user/index.ts');
check(inviteFunction.includes('allowedOrigins.has(origin)'), 'Invite function lacks exact origin allowlisting.');
check(!inviteFunction.includes('Access-Control-Allow-Origin": "*"'), 'Invite function must not allow wildcard CORS.');
check(!/assignableRoles[^\n]*platform_owner/.test(inviteFunction), 'Invite function must not provision Platform Owners.');
check(!/assignableRoles[^\n]*super_admin/.test(inviteFunction), 'Tenant invitation function must not provision Super Admins.');
const denoLock = JSON.parse(await read('supabase/functions/invite-user/deno.lock'));
check(denoLock.version === '5', 'Deno dependency lock version 5 is required.');
check(denoLock.specifiers?.['jsr:@supabase/supabase-js@2.110.8'] === '2.110.8', 'Supabase Edge Function client is not dependency locked.');

const productionEnv = await read('deploy/production.env.example');
check(/^SUPABASE_URL=https:\/\//m.test(productionEnv), 'Production environment template lacks required SUPABASE_URL.');
check(/^SUPABASE_PUBLISHABLE_KEY=/m.test(productionEnv), 'Production environment template lacks a required public browser key.');
check(!productionEnv.includes('SUPABASE_SERVICE_ROLE_KEY='), 'Browser-safe production environment template exposes a service-role variable.');
const vercelConfig = JSON.parse(await read('vercel.json'));
check(vercelConfig.outputDirectory === 'dist', 'Vercel must deploy the reviewed dist output.');
check(vercelConfig.buildCommand === 'npm run build:production', 'Vercel must run the complete production build and verification command.');
const vercelHeaders = JSON.stringify(vercelConfig.headers || []);
check(vercelHeaders.includes('Content-Security-Policy'), 'Vercel security headers lack Content Security Policy.');
check(vercelHeaders.includes('Strict-Transport-Security'), 'Vercel security headers lack HSTS.');
check(vercelHeaders.includes('/runtime-config.js') && vercelHeaders.includes('no-store'), 'Vercel runtime configuration is cacheable.');

const pilotOnboarding = await read('scripts/pilot-onboarding.mjs');
check(pilotOnboarding.includes('/auth/v1/invite'), 'Privileged onboarding must use invitation-based account creation.');
check(!/password\s*:/i.test(pilotOnboarding), 'Privileged onboarding must not create bootstrap passwords.');
check(pilotOnboarding.includes('app_metadata'), 'Privileged onboarding must write trusted app metadata.');
check(pilotOnboarding.includes('compensating rollback'), 'Privileged onboarding lacks partial-failure rollback.');
const hostedConfig = await read('scripts/configure-pilot.mjs');
check(hostedConfig.includes('site_url') && hostedConfig.includes('uri_allow_list'), 'Hosted Auth callback configuration is incomplete.');
check(hostedConfig.includes('flow=invite') && hostedConfig.includes('flow=recovery'), 'Hosted Auth callback allowlist lacks typed invite or recovery routes.');
check(hostedConfig.includes('ALLOWED_ORIGINS='), 'Hosted Edge Function origin configuration is incomplete.');

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
