import { access, readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const read = (file) => readFile(path.join(root, file), 'utf8');
const isVercelBuild = process.env.VERCEL === '1';

const requiredFiles = [
  'package.json', 'package-lock.json', 'Dockerfile',
  'README.md', 'LICENSE', '_headers', 'vercel.json', 'deploy/nginx.conf',
  '.github/workflows/ci.yml', '.github/workflows/release.yml',
  'context/DEPLOYMENT_CHECKLIST.md', 'context/ROLLBACK_RUNBOOK.md',
  'scripts/configure-pilot.mjs', 'scripts/pilot-onboarding.mjs',
  'scripts/runtime-config-contract.mjs',
  'services/authCallbackService.js', 'services/passwordRecoveryService.js',
  'supabase/functions/invite-user/deno.lock',
  'services/platformCompanyRegistryService.js',
  'services/companySetupOrchestrationService.js',
  'services/invitationCenterService.js',
  'services/workforceDataHubService.js',
  'services/lifecycleExperienceService.js',
  'services/companyReadinessOrchestrationService.js',
  'services/companyReadinessPage.js',
  'services/platformAggregateIntegrationService.js',
  'services/platformModuleLoaderService.js',
  'supabase/functions/invite-company-owner/deno.json',
  'supabase/functions/invite-company-owner/deno.lock',
  'supabase/functions/invite-company-owner/index.ts',
  'dist/health.json', 'dist/runtime-config.js'
];
if (!isVercelBuild) {
  requiredFiles.push('.dockerignore', '.gitignore');
}
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
const platformLifecycleMigration = migrations.find(name => name.endsWith('_platform_company_lifecycle.sql'));
const companySetupMigration = migrations.find(name => name.endsWith('_company_setup_orchestration.sql'));
const companyReadinessMigration = migrations.find(name => name.endsWith('_company_readiness_handoff.sql'));
check(!!persistenceMigration, 'Canonical persistence migration is missing.');
check(!!storageMigration, 'Canonical Storage migration is missing.');
check(!!integrationMigration, 'Application integration hardening migration is missing.');
check(!!documentStorageMigration, 'Document Storage integration migration is missing.');
check(!!employeeDocumentDeleteMigration, 'Employee document delete policy migration is missing.');
check(!!inviteActivationMigration, 'Secure invitation activation migration is missing.');
check(!!platformLifecycleMigration, 'Platform company lifecycle migration is missing.');
check(!!companySetupMigration, 'Company setup orchestration migration is missing.');
check(!!companyReadinessMigration, 'Company readiness handoff migration is missing.');
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
if (platformLifecycleMigration) {
  const lifecycleSql = await read(path.join('supabase', 'migrations', platformLifecycleMigration));
  for (const table of [
    'platform_companies', 'platform_tenant_lifecycle',
    'platform_lifecycle_events', 'platform_company_invitations'
  ]) {
    check(new RegExp(`alter table public\\.${table} force row level security`, 'i').test(lifecycleSql), `${table} does not force RLS.`);
    check(new RegExp(`grant select on public\\.${table} to authenticated`, 'i').test(lifecycleSql), `${table} lacks Platform Owner read access.`);
    check(!new RegExp(`grant [^;]*(insert|update|delete)[^;]* on public\\.${table} to authenticated`, 'i').test(lifecycleSql), `${table} allows unaudited client mutations.`);
  }
  check(!/user_metadata/i.test(lifecycleSql), 'Platform lifecycle authorization uses mutable user metadata.');
  check(/arth_complete_company_owner_activation/i.test(lifecycleSql), 'Company Owner activation transaction is missing.');
  check(/revision is stale/i.test(lifecycleSql), 'Platform lifecycle lacks optimistic concurrency.');
  check(/Idempotency key is already assigned/i.test(lifecycleSql), 'Platform lifecycle lacks idempotency conflict detection.');
}
if (companySetupMigration) {
  const setupSql = await read(path.join('supabase', 'migrations', companySetupMigration));
  for (const table of ['company_setup_workspaces', 'company_setup_step_versions']) {
    check(new RegExp(`alter table public\\.${table} force row level security`, 'i').test(setupSql), `${table} does not force RLS.`);
    check(new RegExp(`grant select on public\\.${table} to authenticated`, 'i').test(setupSql), `${table} lacks tenant-scoped read access.`);
    check(!new RegExp(`grant [^;]*(insert|update|delete)[^;]* on public\\.${table} to authenticated`, 'i').test(setupSql), `${table} allows unaudited client mutations.`);
  }
  check(/arth_persistence_tenant_allowed\(tenant_id\)/i.test(setupSql), 'Company setup reads are not tenant scoped.');
  check(/owner_auth_user_id = caller_id/i.test(setupSql), 'Company setup mutations are not bound to the Company Owner.');
  check(/Company setup revision is stale/i.test(setupSql), 'Company setup lacks optimistic concurrency.');
  check(/CompanySetupStepSaved/i.test(setupSql), 'Company setup step saves are not lifecycle audited.');
  check(!/user_metadata/i.test(setupSql), 'Company setup authorization uses mutable user metadata.');
}
if (companyReadinessMigration) {
  const readinessSql = await read(path.join('supabase', 'migrations', companyReadinessMigration));
  check(/alter table public\.platform_company_readiness_requests force row level security/i.test(readinessSql), 'Company readiness requests do not force RLS.');
  check(/owner_auth_user_id = caller_id/i.test(readinessSql), 'Readiness submission is not bound to the authenticated Company Owner.');
  check(/status <> 'READY_FOR_APPROVAL'/i.test(readinessSql), 'Readiness submission lacks a passing validation gate.');
  check(/not public\.arth_is_platform_owner\(\)/i.test(readinessSql), 'Pilot review is not restricted to the Platform Owner.');
  check(/arth_enforce_certified_lifecycle_activation/i.test(readinessSql), 'Pilot and production lifecycle activation lack a database certification gate.');
}

const persistenceSql = await read('context/sql/authenticated_business_persistence.sql');
check(/force row level security/i.test(persistenceSql), 'Canonical persistence does not force RLS.');
check(!/user_metadata/i.test(persistenceSql), 'Canonical persistence uses mutable user metadata for authorization.');
check(/revoke all on public\.%I from anon/i.test(persistenceSql), 'Canonical persistence does not revoke anonymous table access.');

const runtimeConfig = await read('dist/runtime-config.js');
const runtimeContractSource = await read('scripts/runtime-config-contract.mjs');
check(!runtimeConfig.includes('SUPABASE_SERVICE_ROLE_KEY'), 'Built runtime config references the service role key.');
check(runtimeConfig.includes("Object.defineProperty(window, 'ARTHHRMS_CONFIG'"), 'Runtime configuration is not installed as an immutable browser contract.');
check(runtimeConfig.includes('PASSWORD_RECOVERY_REDIRECT_URL'), 'Built runtime config lacks the dedicated password recovery redirect.');
check(runtimeContractSource.includes('VERCEL_PROJECT_PRODUCTION_URL'), 'Runtime generation lacks the Vercel production-origin source.');
check(runtimeContractSource.includes('isProduction ? productionHost : (previewHost || productionHost)'), 'Production runtime generation may use a preview deployment URL.');
check(runtimeContractSource.includes("'PASSWORD_RECOVERY_REDIRECT_URL',") && runtimeContractSource.includes("'recovery'"), 'Runtime generation does not validate the typed recovery callback independently.');
if (/"APP_ENV": "production"/.test(runtimeConfig)) {
  for (const flag of [
    'USE_SUPABASE_AUTH', 'USE_SUPABASE_PASSWORD_RECOVERY', 'USE_SUPABASE_STORAGE',
    'USE_SUPABASE_INVITES', 'USE_SUPABASE_PERSISTENCE'
  ]) {
    check(new RegExp(`"${flag}": true`).test(runtimeConfig), `Production runtime config did not default ${flag} to true.`);
  }
  const inviteRedirect = runtimeConfig.match(/"AUTH_INVITE_REDIRECT_URL": "([^"]+)"/)?.[1] || '';
  const recoveryRedirect = runtimeConfig.match(/"PASSWORD_RECOVERY_REDIRECT_URL": "([^"]+)"/)?.[1] || '';
  check(!!inviteRedirect && /\/auth-callback\.html$/.test(inviteRedirect), 'Production invitation callback is missing or malformed.');
  check(!!recoveryRedirect && /\/auth-callback\.html\?flow=recovery$/.test(recoveryRedirect), 'Production recovery callback is missing or malformed.');
  check(inviteRedirect !== recoveryRedirect, 'Production invitation and recovery callbacks are not isolated.');
} else {
  check(/"APP_ENV": "unconfigured"/.test(runtimeConfig), 'Build-time runtime placeholder is malformed.');
}
const authServiceSource = await read('services/authService.js');
const authCallbackSource = await read('services/authCallbackService.js');
const authInviteSource = await read('services/authInviteService.js');
const workforceDataHubSource = await read('services/workforceDataHubService.js');
const lifecycleExperienceSource = await read('services/lifecycleExperienceService.js');
const companyReadinessSource = await read('services/companyReadinessOrchestrationService.js');
const platformAggregateSource = await read('services/platformAggregateIntegrationService.js');
const persistenceServiceSource = await read('services/supabasePersistenceService.js');
const passwordRecoverySource = await read('services/passwordRecoveryService.js');
const supabaseClientSource = await read('services/supabaseClient.js');
const recoveryPage = await read('password-recovery.html');
const callbackPage = await read('auth-callback.html');
const companyLoginPage = await read('ArthHRMS.html');
check(authServiceSource.includes('resetPasswordForEmail'), 'Auth service lacks the Supabase password recovery request API.');
const recoveryRedirectResolver = authServiceSource.slice(
  authServiceSource.indexOf('function passwordRecoveryRedirectUrl()'),
  authServiceSource.indexOf('async function invalidateSupabaseSession()')
);
check(recoveryRedirectResolver.includes('PASSWORD_RECOVERY_REDIRECT_URL'), 'Password recovery does not use its dedicated runtime redirect.');
check(!recoveryRedirectResolver.includes('AUTH_INVITE_REDIRECT_URL'), 'Password recovery still depends on the invitation redirect.');
check(authServiceSource.includes('authCallbackService.dispatchAuthCallback'), 'Auth service does not use the dedicated callback dispatcher.');
check(authCallbackSource.includes('switch (type)'), 'Authentication callback types are not dispatched explicitly.');
check(authCallbackSource.includes('exchangeCodeForSession'), 'PKCE callback exchange is missing.');
check(!/linkAuthUserToEmployee/.test(authCallbackSource), 'Authentication callback dispatcher is coupled to employee linking.');
check(!/updateUser\(\{\s*password/.test(authInviteSource), 'Invite onboarding still owns password recovery.');
check(authInviteSource.includes("client.rpc('arth_complete_auth_invite_activation')"), 'Invite onboarding does not use the tenant-scoped activation transaction.');
check(authInviteSource.includes("client.rpc('arth_complete_company_owner_activation')"), 'Company Owner onboarding does not use its lifecycle activation transaction.');
check(workforceDataHubSource.includes('EmployeeMasterImportService'), 'Workforce Data Hub does not reuse the reviewed employee import engine.');
check(workforceDataHubSource.includes('supabasePersistenceService?.flush'), 'Workforce Data Hub does not confirm durable persistence.');
check(workforceDataHubSource.includes("run.state !== 'READY'"), 'Workforce Data Hub lacks a validation commit gate.');
check(lifecycleExperienceSource.includes('PendingActionService'), 'Lifecycle experience does not reuse pending-action intelligence.');
check(lifecycleExperienceSource.includes('notificationService.pushNotification'), 'Lifecycle experience does not reuse the notification boundary.');
check(lifecycleExperienceSource.includes('supabasePersistenceService?.flush'), 'Lifecycle tasks do not confirm durable persistence.');
check(lifecycleExperienceSource.includes('trusted tenant scope'), 'Lifecycle task access does not fail closed across tenants.');
check(persistenceServiceSource.includes("stateKey: 'lifecycleTimelineEvents'"), 'Tenant lifecycle timeline lacks a Supabase persistence projection.');
check(companyReadinessSource.includes("rpc('arth_submit_company_readiness_review'"), 'Company readiness does not use the audited tenant handoff RPC.');
check(companyReadinessSource.includes("role !== 'super_admin'"), 'Company readiness is not restricted to the Company Owner compatibility role.');
check(persistenceServiceSource.includes("stateKey: 'goLiveValidationRuns'"), 'Go-live validation runs lack a Supabase persistence projection.');
check(persistenceServiceSource.includes("stateKey: 'launchCertificationAuditHistory'"), 'Launch certification audit history lacks a Supabase persistence projection.');
check(platformAggregateSource.includes("from('platform_lifecycle_events')"), 'Platform aggregates are not connected to the durable lifecycle event stream.');
check(platformAggregateSource.includes('tenantBusinessRecordsQueried: false'), 'Platform aggregates do not explicitly preserve tenant business-data confidentiality.');
check(platformAggregateSource.includes("role) !== 'platform_owner'"), 'Platform aggregates are not restricted to the Platform Owner.');
for (const servicePath of [
  'services/platformAnalyticsService.js',
  'services/tenantGovernanceService.js',
  'services/tenantBillingService.js',
  'services/platformHealthMonitoringService.js'
]) {
  const integrationSource = await read(servicePath);
  check(integrationSource.includes('PlatformAggregateIntegrationService?.getProjection'), `${servicePath} does not consume the durable aggregate projection.`);
}
const platformControlSource = await read('platform-control.html');
const platformCompanySetupSource = await read('company-setup.html');
check(platformControlSource.includes('services/platformAggregateIntegrationService.js'), 'Platform Control does not load durable platform aggregates.');
check(platformControlSource.includes('platformAggregateSvc()?.load'), 'Platform Control does not initialize aggregate integrations after authentication.');
check(platformControlSource.includes("label:'Continue Setup',focus:'company-information'"), 'Company Registry lacks the CREATED-to-Platform-Onboarding action.');
check(platformControlSource.includes('_tenantRegistryRows.get(registryKey)'), 'Company Registry actions are not bound to the rendered tenant identity.');
check(platformControlSource.includes('tenantRegistryKeys(tenant)'), 'Company Registry does not normalize durable and compatibility tenant identities.');
check(platformControlSource.includes("new URL('company-setup.html',location.href)"), 'Company Registry does not open the Platform Owner onboarding workspace.');
check(platformControlSource.includes('resolveRegistryTenantByKey'), 'Company Registry lacks durable lookup recovery for stale rendered rows.');
check(!platformControlSource.includes('reason=company_handoff'), 'Platform Control retains the obsolete tenant impersonation handoff.');
check(platformCompanySetupSource.includes('services/platformCompanyRegistryService.js'), 'Platform onboarding workspace lacks the durable registry service.');
check(platformCompanySetupSource.includes('services/authInviteService.js'), 'Platform onboarding workspace lacks the Supabase invitation boundary.');
check(platformCompanySetupSource.includes('createCompanyDraft'), 'Platform onboarding workspace cannot create durable company drafts.');
check(platformCompanySetupSource.includes('provisionCompany'), 'Platform onboarding workspace cannot provision tenants.');
check(platformCompanySetupSource.includes('sendCompanyOwnerInvite'), 'Platform onboarding workspace cannot send Company Owner invitations.');
check(platformCompanySetupSource.includes('getCompanyWorkspace'), 'Platform onboarding workspace cannot monitor persisted lifecycle state.');
check(!/location\.href\s*=\s*['"]setup\.html/.test(platformCompanySetupSource), 'Platform Owner onboarding workspace can enter tenant setup.');
check(platformControlSource.includes("'Enterprise Operations Center':'Operations Summary'"), 'Platform Operations lacks focused lazy initialization.');
check(platformControlSource.includes('tasks=preferred===summary?[summary]:[summary,preferred]'), 'Platform module navigation still schedules every center.');
check(platformControlSource.includes('const renderKey=`${resolvedPanelId}:${resolvedHeading}`'), 'Platform render cache is not isolated by module.');
check(platformControlSource.includes('services/platformModuleLoaderService.js'), 'Platform Control lacks its authenticated module loader.');
check(platformControlSource.includes('PlatformModuleLoaderService?.loadForPanel'), 'Platform Control does not lazy-load opened modules.');
check((platformControlSource.match(/data-platform-src=/g) || []).length >= 120, 'Platform Control still eagerly initializes heavy service modules.');
check((platformControlSource.match(/<script\s+src=/g) || []).length <= 40, 'Platform Control startup script budget is exceeded.');
for (const tenantOperation of ['Employee Bulk Import', 'Employee Profile', 'Payroll Governance', 'Leave and Attendance']) {
  const monitoringStart = platformControlSource.indexOf('function platformMonitoringRenderTasks(){');
  const monitoringEnd = platformControlSource.indexOf('function platformAuditRenderTasks(){', monitoringStart);
  check(!platformControlSource.slice(monitoringStart, monitoringEnd).includes(tenantOperation), `${tenantOperation} still initializes in Platform Control monitoring.`);
}
const readinessPageSource = await read('go-live-readiness-center.html');
check(readinessPageSource.includes('services/companyReadinessOrchestrationService.js'), 'Go-live readiness does not load tenant orchestration.');
check(!readinessPageSource.includes('id="tenantInput"'), 'Go-live readiness still trusts an editable tenant scope.');
check(readinessPageSource.includes('Submit for Pilot'), 'Go-live readiness lacks the Platform Owner pilot handoff.');
check(!readinessPageSource.includes('function initCenter'), 'Go-live readiness retains its duplicate legacy controller.');
const companyAdminSource = await read('super-admin.html');
check(companyAdminSource.includes('href="employee-migration-center.html"'), 'Company Administration does not route to Workforce Data Hub.');
check(companyAdminSource.includes('href="go-live-readiness-center.html"'), 'Company Administration does not route to readiness.');
const authGuardSource = await read('services/authGuard.js');
check(/'go-live-certification-center\.html': \['platform_owner'\]/.test(authGuardSource), 'Final certification is not isolated to the Platform Owner.');
check(/'go-live-readiness-center\.html': \['super_admin'\]/.test(authGuardSource), 'Company readiness is not isolated to the Company Owner.');
check(/'company-setup\.html': \['platform_owner'\]/.test(authGuardSource), 'Platform onboarding workspace is not isolated to the Platform Owner.');
check(/'setup\.html': \['super_admin'\]/.test(authGuardSource), 'Tenant setup is not isolated to the Company Owner.');
check(!/'setup\.html': \[[^\]]*platform_owner/.test(authGuardSource), 'Platform Owner retains access to tenant setup.');
for (const [page, mount] of [
  ['super-admin.html', 'saLifecycleExperience'],
  ['hr-dashboard.html', 'hrLifecycleExperience'],
  ['manager.html', 'mgLifecycleExperience'],
  ['employee-portal.html', 'empLifecycleExperience'],
  ['admin.html', 'adLifecycleExperience']
]) {
  const pageSource = await read(page);
  check(pageSource.includes('services/lifecycleExperienceService.js'), `${page} does not load the centralized lifecycle experience.`);
  check(pageSource.includes(mount), `${page} lacks its role-specific lifecycle mount.`);
}
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
check(dockerRuntimeTemplate.includes('PASSWORD_RECOVERY_REDIRECT_URL'), 'Container runtime config lacks the isolated recovery callback.');
const dockerRuntimeEntrypoint = await read('deploy/docker-entrypoint.d/40-runtime-config.sh');
check(dockerRuntimeEntrypoint.includes('PASSWORD_RECOVERY_REDIRECT_URL="${PASSWORD_RECOVERY_REDIRECT_URL:-${APP_ORIGIN}/auth-callback.html?flow=recovery}"'), 'Container runtime does not derive a dedicated recovery callback.');
check(dockerRuntimeEntrypoint.includes('Invitation and password recovery redirects must remain distinct'), 'Container runtime does not enforce auth callback isolation.');
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
check(/\[functions\.invite-company-owner\][\s\S]*?verify_jwt\s*=\s*true/.test(supabaseConfig), 'Company Owner invite function must verify JWTs at the gateway.');
const inviteFunction = await read('supabase/functions/invite-user/index.ts');
check(inviteFunction.includes('allowedOrigins.has(origin)'), 'Invite function lacks exact origin allowlisting.');
check(!inviteFunction.includes('Access-Control-Allow-Origin": "*"'), 'Invite function must not allow wildcard CORS.');
check(!/assignableRoles[^\n]*platform_owner/.test(inviteFunction), 'Invite function must not provision Platform Owners.');
check(!/assignableRoles[^\n]*super_admin/.test(inviteFunction), 'Tenant invitation function must not provision Super Admins.');
check(inviteFunction.includes('["send", "resend", "cancel"]'), 'Tenant invitation function lacks the governed lifecycle action dispatcher.');
check(inviteFunction.includes('admin.auth.admin.deleteUser(authUserId)'), 'Tenant invite cancellation lacks Auth revocation.');
check(inviteFunction.includes('record_type: "auditLogs"'), 'Tenant invite cancellation is not durably audited.');
const denoLock = JSON.parse(await read('supabase/functions/invite-user/deno.lock'));
check(denoLock.version === '5', 'Deno dependency lock version 5 is required.');
check(denoLock.specifiers?.['jsr:@supabase/supabase-js@2.110.8'] === '2.110.8', 'Supabase Edge Function client is not dependency locked.');
const companyOwnerInviteFunction = await read('supabase/functions/invite-company-owner/index.ts');
check(companyOwnerInviteFunction.includes('callerData.user.app_metadata?.role'), 'Company Owner invitation does not authorize from trusted app metadata.');
check(companyOwnerInviteFunction.includes('!== "platform_owner"'), 'Company Owner invitation is not restricted to Platform Owners.');
check(companyOwnerInviteFunction.includes('arth_platform_record_owner_invite'), 'Company Owner invitation does not persist the audited lifecycle transaction.');
check(companyOwnerInviteFunction.includes('deleteUser(authUserId)'), 'Company Owner invitation lacks compensating Auth rollback.');
check(!/password\s*:/i.test(companyOwnerInviteFunction), 'Company Owner invitation creates a bootstrap password.');
const companyOwnerDenoLock = JSON.parse(await read('supabase/functions/invite-company-owner/deno.lock'));
check(companyOwnerDenoLock.version === '5', 'Company Owner Edge Function dependency lock version 5 is required.');
check(companyOwnerDenoLock.specifiers?.['jsr:@supabase/supabase-js@2.110.8'] === '2.110.8', 'Company Owner Edge Function client is not dependency locked.');

const productionEnv = await read('deploy/production.env.example');
check(/^SUPABASE_URL=https:\/\//m.test(productionEnv), 'Production environment template lacks required SUPABASE_URL.');
check(/^SUPABASE_PUBLISHABLE_KEY=/m.test(productionEnv), 'Production environment template lacks a required public browser key.');
check(!productionEnv.includes('SUPABASE_SERVICE_ROLE_KEY='), 'Browser-safe production environment template exposes a service-role variable.');
check(productionEnv.includes('PASSWORD_RECOVERY_REDIRECT_URL=https://hr.example.com/auth-callback.html?flow=recovery'), 'Production environment template lacks the dedicated recovery callback.');
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
