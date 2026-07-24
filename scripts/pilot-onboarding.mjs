import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const PRIVILEGED_ROLES = new Set(['platform_owner', 'super_admin']);

export function parseEnv(source = '') {
  const result = {};
  for (const line of String(source).split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[match[1]] = value;
  }
  return result;
}

export function normalizeRole(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function normalizeTenant(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function requireHttpsOrigin(value, label = 'APP_ORIGIN') {
  let parsed;
  try {
    parsed = new URL(String(value || '').trim());
  } catch {
    throw new Error(`${label} must be a valid HTTPS origin.`);
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`${label} must be an HTTPS origin without credentials, query, or fragment.`);
  }
  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    throw new Error(`${label} must not include a path.`);
  }
  return parsed.origin;
}

export function validateOnboardingInput(input = {}) {
  const role = normalizeRole(input.role);
  if (!PRIVILEGED_ROLES.has(role)) throw new Error('Only Platform Owner or first Super Admin onboarding is supported.');
  const email = String(input.email || '').trim().toLowerCase();
  const name = String(input.name || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('A valid onboarding email is required.');
  if (name.length < 2) throw new Error('A valid onboarding name is required.');
  const origin = requireHttpsOrigin(input.appOrigin);
  const redirectTo = String(input.redirectTo || `${origin}/auth-callback.html`).trim();
  const redirect = new URL(redirectTo);
  if (redirect.protocol !== 'https:' || redirect.origin !== origin || redirect.pathname !== '/auth-callback.html') {
    throw new Error('AUTH_INVITE_REDIRECT_URL must be the exact hosted /auth-callback.html URL.');
  }

  const allowedOrigins = String(input.allowedOrigins || origin)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => requireHttpsOrigin(item, 'ALLOWED_ORIGINS'));
  if (!allowedOrigins.includes(origin)) throw new Error('ALLOWED_ORIGINS must contain APP_ORIGIN.');

  const tenantId = role === 'super_admin' ? normalizeTenant(input.tenantId) : '__platform__';
  const organizationId = role === 'super_admin'
    ? String(input.organizationId || tenantId).trim()
    : '__platform__';
  if (role === 'super_admin' && (!tenantId || !organizationId)) {
    throw new Error('TENANT_ID and ORGANIZATION_ID are required for first Super Admin onboarding.');
  }
  return { role, email, name, origin, redirectTo, tenantId, organizationId };
}

function maskEmail(value) {
  const [local = '', domain = ''] = String(value || '').split('@');
  return `${local.slice(0, 2)}***@${domain}`;
}

function apiClient({ supabaseUrl, serviceRoleKey, fetchImpl = fetch }) {
  const baseUrl = String(supabaseUrl || '').replace(/\/+$/, '');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(baseUrl)) {
    throw new Error('SUPABASE_URL must be a hosted Supabase HTTPS URL.');
  }
  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required and must remain server-side.');
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json'
  };

  async function request(pathname, options = {}) {
    const response = await fetchImpl(`${baseUrl}${pathname}`, {
      ...options,
      headers: { ...headers, ...(options.headers || {}) }
    });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!response.ok) {
      const message = body?.msg || body?.message || body?.error_description || body?.error || `HTTP ${response.status}`;
      throw new Error(String(message));
    }
    return body;
  }

  return {
    async listUsers() {
      const users = [];
      for (let page = 1; page <= 100; page += 1) {
        const body = await request(`/auth/v1/admin/users?page=${page}&per_page=1000`);
        const batch = Array.isArray(body) ? body : (body?.users || []);
        users.push(...batch);
        if (batch.length < 1000) break;
      }
      return users;
    },
    invite(email, redirectTo, name, operationId) {
      return request(`/auth/v1/invite?redirect_to=${encodeURIComponent(redirectTo)}`, {
        method: 'POST',
        body: JSON.stringify({
          email,
          data: { full_name: name, onboarding_operation_id: operationId }
        })
      });
    },
    updateUser(userId, attributes) {
      return request(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
        method: 'PUT',
        body: JSON.stringify(attributes)
      });
    },
    deleteUser(userId) {
      return request(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
    },
    insert(table, row) {
      return request(`/rest/v1/${table}`, {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(row)
      });
    },
    deleteRecord(table, recordId) {
      return request(`/rest/v1/${table}?record_id=eq.${encodeURIComponent(recordId)}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' }
      });
    }
  };
}

export async function onboardPrivilegedUser(input, dependencies = {}) {
  const values = validateOnboardingInput(input);
  const client = apiClient({
    supabaseUrl: input.supabaseUrl,
    serviceRoleKey: input.serviceRoleKey,
    fetchImpl: dependencies.fetchImpl
  });
  const users = await client.listUsers();
  const privileged = users.filter((user) => PRIVILEGED_ROLES.has(normalizeRole(user.app_metadata?.role)));
  const sameEmail = users.find((user) => String(user.email || '').toLowerCase() === values.email);
  const conflicting = values.role === 'platform_owner'
    ? privileged.find((user) => normalizeRole(user.app_metadata?.role) === 'platform_owner' && String(user.email || '').toLowerCase() !== values.email)
    : privileged.find((user) => normalizeRole(user.app_metadata?.role) === 'super_admin'
      && normalizeTenant(user.app_metadata?.tenant_id || user.app_metadata?.tenantSlug) === values.tenantId
      && String(user.email || '').toLowerCase() !== values.email);

  if (conflicting) {
    throw new Error(values.role === 'platform_owner'
      ? 'A different Platform Owner already exists. Rotation requires a separately approved recovery procedure.'
      : 'A different Super Admin already exists for this tenant.');
  }
  if (sameEmail) {
    const existingRole = normalizeRole(sameEmail.app_metadata?.role);
    const existingTenant = normalizeTenant(sameEmail.app_metadata?.tenant_id || sameEmail.app_metadata?.tenantSlug);
    if (existingRole === values.role && (values.role === 'platform_owner' || existingTenant === values.tenantId)) {
      return { ok: true, unchanged: true, role: values.role, userId: sameEmail.id, email: maskEmail(values.email) };
    }
    throw new Error('The onboarding email is already assigned to a different identity scope.');
  }
  if (!input.apply) {
    return { ok: true, dryRun: true, role: values.role, email: maskEmail(values.email), tenantId: values.tenantId };
  }

  const operationId = randomUUID();
  const recordId = `AUTH-ONBOARD-${operationId}`;
  const auditId = `AUDIT-AUTH-ONBOARD-${operationId}`;
  let userId = '';
  const persisted = [];
  try {
    const inviteRedirect = new URL(values.redirectTo);
    inviteRedirect.searchParams.set('flow', 'invite');
    const invited = await client.invite(values.email, inviteRedirect.href, values.name, operationId);
    userId = invited?.id || invited?.user?.id || '';
    if (!userId) throw new Error('Supabase did not return an invited user identifier.');

    const appMetadata = {
      role: values.role,
      onboarding_method: 'release_operator_invite',
      onboarding_operation_id: operationId
    };
    if (values.role === 'super_admin') {
      Object.assign(appMetadata, {
        tenantSlug: values.tenantId,
        tenant_id: values.tenantId,
        organizationId: values.organizationId,
        organization_id: values.organizationId
      });
    }
    await client.updateUser(userId, {
      app_metadata: appMetadata,
      user_metadata: { full_name: values.name }
    });

    const timestamp = new Date().toISOString();
    await client.insert('hrms_identity_records', {
      tenant_id: values.tenantId,
      organization_id: values.organizationId,
      record_type: 'privilegedOnboarding',
      record_id: recordId,
      subject_id: userId,
      payload: {
        operationId,
        authUserId: userId,
        role: values.role,
        email: values.email,
        status: 'Invite Sent',
        redirectTo: inviteRedirect.href,
        initiatedAt: timestamp
      },
      updated_by: userId,
      updated_at: timestamp
    });
    persisted.push(['hrms_identity_records', recordId]);
    await client.insert('hrms_audit_records', {
      tenant_id: values.tenantId,
      organization_id: values.organizationId,
      record_type: 'auditLogs',
      record_id: auditId,
      subject_id: userId,
      payload: {
        operationId,
        action: 'privileged onboarding invite created',
        module: 'Authentication',
        targetRole: values.role,
        targetUserId: userId,
        timestamp
      },
      updated_by: userId,
      updated_at: timestamp
    });
    persisted.push(['hrms_audit_records', auditId]);
    return { ok: true, invited: true, role: values.role, userId, email: maskEmail(values.email), tenantId: values.tenantId };
  } catch (error) {
    for (const [table, id] of persisted.reverse()) {
      await client.deleteRecord(table, id).catch(() => {});
    }
    if (userId) await client.deleteUser(userId).catch(() => {});
    throw new Error(`Privileged onboarding failed and compensating rollback was attempted: ${error.message || error}`);
  }
}

async function loadEnvironment(argv = process.argv.slice(2)) {
  const fileIndex = argv.indexOf('--env-file');
  const envFile = fileIndex >= 0 ? argv[fileIndex + 1] : '';
  if (!envFile) return { ...process.env };
  const loaded = parseEnv(await readFile(path.resolve(envFile), 'utf8'));
  return { ...loaded, ...process.env };
}

function flag(argv, name, fallback = '') {
  const index = argv.indexOf(name);
  return index >= 0 ? (argv[index + 1] || '') : fallback;
}

async function main() {
  const argv = process.argv.slice(2);
  const env = await loadEnvironment(argv);
  const role = normalizeRole(flag(argv, '--role', env.PILOT_ONBOARDING_ROLE));
  const prefix = role === 'platform_owner' ? 'PLATFORM_OWNER' : 'FIRST_SUPER_ADMIN';
  const result = await onboardPrivilegedUser({
    role,
    name: env[`${prefix}_NAME`],
    email: env[`${prefix}_EMAIL`],
    tenantId: env.TENANT_ID,
    organizationId: env.ORGANIZATION_ID,
    appOrigin: env.APP_ORIGIN,
    redirectTo: env.AUTH_INVITE_REDIRECT_URL,
    allowedOrigins: env.ALLOWED_ORIGINS,
    supabaseUrl: env.SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    apply: argv.includes('--apply')
  });
  console.log(JSON.stringify(result));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message || String(error));
    process.exitCode = 1;
  });
}
