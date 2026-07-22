import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');
const SUPABASE_JS_VERSION = '2.110.8';
const runtimeConfigTag = '<script src="/runtime-config.js"></script>';

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const directory of ['services', 'styles', 'utils']) {
  await cp(path.join(root, directory), path.join(output, directory), { recursive: true });
}
for (const file of ['db.js', '_headers']) {
  await cp(path.join(root, file), path.join(output, file));
}

const htmlFiles = (await readdir(root)).filter((name) => name.endsWith('.html')).sort();
for (const file of htmlFiles) {
  let html = await readFile(path.join(root, file), 'utf8');
  html = html.replaceAll(
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
    `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@${SUPABASE_JS_VERSION}`
  );
  if (!html.includes('runtime-config.js')) {
    const supabaseScript = /<script\s+src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[^\"]+"><\/script>/i;
    html = supabaseScript.test(html)
      ? html.replace(supabaseScript, `${runtimeConfigTag}\n$&`)
      : html.replace('</head>', `  ${runtimeConfigTag}\n</head>`);
  }
  await writeFile(path.join(output, file), html, 'utf8');
}

await writeFile(path.join(output, 'runtime-config.js'), [
  '// Replaced by the deployment environment before production traffic is enabled.',
  'window.ARTHHRMS_CONFIG = Object.freeze({',
  "  APP_ENV: 'unconfigured',",
  '  PRODUCTION_MODE: false, PILOT_MODE: false, DEVELOPMENT_MODE: false, DEMO_MODE: false,',
  "  SUPABASE_URL: '', SUPABASE_ANON_KEY: '', SUPABASE_PUBLISHABLE_KEY: '',",
  "  INVITE_USER_ENDPOINT: '', AUTH_INVITE_REDIRECT_URL: '', SUPABASE_TIMEOUT_MS: 10000,",
  '  REQUIRE_APP_METADATA_ROLE: true, REQUIRE_EMAIL_VERIFIED: true,',
  '  flags: Object.freeze({})',
  '});',
  ''
].join('\n'), 'utf8');

await writeFile(path.join(output, 'health.json'), JSON.stringify({
  status: 'ok',
  service: 'arthhrms-frontend',
  schemaVersion: 1
}) + '\n', 'utf8');

console.log(`Built ${htmlFiles.length} HTML entry points in ${path.relative(root, output)}.`);
