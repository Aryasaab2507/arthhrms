import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseEnv, requireHttpsOrigin } from './pilot-onboarding.mjs';

export function buildHostedConfiguration(input = {}) {
  const origin = requireHttpsOrigin(input.appOrigin);
  const callbackUrl = `${origin}/auth-callback.html`;
  const inviteCallbackUrl = `${callbackUrl}?flow=invite`;
  const recoveryCallbackUrl = `${callbackUrl}?flow=recovery`;
  const callbackAllowList = [callbackUrl, inviteCallbackUrl, recoveryCallbackUrl].join(',');
  const projectRef = String(input.projectRef || '').trim();
  if (!/^[a-z0-9]{20}$/i.test(projectRef)) throw new Error('SUPABASE_PROJECT_REF is invalid.');
  return {
    origin,
    callbackUrl,
    inviteCallbackUrl,
    recoveryCallbackUrl,
    callbackAllowList,
    projectRef,
    authPatch: {
      site_url: origin,
      uri_allow_list: callbackAllowList
    }
  };
}

async function requestJson(url, accessToken, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) throw new Error(body?.message || body?.error || `Supabase Management API returned ${response.status}.`);
  return body;
}

export async function configureHostedPilot(input = {}, dependencies = {}) {
  const config = buildHostedConfiguration(input);
  if (!input.apply) return { ok: true, dryRun: true, ...config };
  const accessToken = String(input.accessToken || '').trim();
  if (!accessToken) throw new Error('SUPABASE_ACCESS_TOKEN is required to update hosted configuration.');
  const fetchImpl = dependencies.fetchImpl || requestJson;
  const endpoint = `https://api.supabase.com/v1/projects/${config.projectRef}/config/auth`;
  await fetchImpl(endpoint, accessToken, {
    method: 'PATCH',
    body: JSON.stringify(config.authPatch)
  });

  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const runner = dependencies.spawnImpl || spawnSync;
  const secretResult = runner(command, [
    'supabase', 'secrets', 'set',
    `ALLOWED_ORIGINS=${config.origin}`,
    '--project-ref', config.projectRef,
    '--yes'
  ], {
    cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: accessToken },
    encoding: 'utf8',
    stdio: dependencies.spawnImpl ? 'pipe' : 'inherit'
  });
  if (secretResult?.status !== 0) throw new Error('Hosted ALLOWED_ORIGINS update failed.');

  const verified = await fetchImpl(endpoint, accessToken, { method: 'GET' });
  if (verified?.site_url !== config.origin || String(verified?.uri_allow_list || '') !== config.callbackAllowList) {
    throw new Error('Hosted Auth URL verification did not match the requested exact origin and callback.');
  }
  return {
    ok: true,
    configured: true,
    origin: config.origin,
    callbackUrl: config.callbackUrl,
    inviteCallbackUrl: config.inviteCallbackUrl,
    recoveryCallbackUrl: config.recoveryCallbackUrl,
    projectRef: config.projectRef
  };
}

async function loadEnvironment(argv) {
  const index = argv.indexOf('--env-file');
  const file = index >= 0 ? argv[index + 1] : '';
  if (!file) return { ...process.env };
  return { ...parseEnv(await readFile(path.resolve(file), 'utf8')), ...process.env };
}

async function main() {
  const argv = process.argv.slice(2);
  const env = await loadEnvironment(argv);
  const result = await configureHostedPilot({
    appOrigin: env.APP_ORIGIN,
    projectRef: env.SUPABASE_PROJECT_REF,
    accessToken: env.SUPABASE_ACCESS_TOKEN,
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
