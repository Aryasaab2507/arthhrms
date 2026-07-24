import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  createUnconfiguredRuntimeConfig,
  serializeBrowserRuntimeConfig
} from './runtime-config-contract.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');
const SUPABASE_JS_VERSION = '2.110.8';
const runtimeConfigTag = '<script src="/runtime-config.js"></script>';
const authGuardTag = '<script src="services/authGuard.js"></script>';
const rbacTag = '<script src="services/rbacEnforcementService.js"></script>';
const persistenceTag = '<script src="services/supabasePersistenceService.js"></script>';
const loadingServiceTag = '<script src="services/loadingService.js"></script>';
const loadingStylesheetTag = '<link rel="stylesheet" href="styles/loading-system.css">';

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
  html = html.replace(
    /https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2(?:\.\d+\.\d+)?/g,
    `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@${SUPABASE_JS_VERSION}`
  );
  if (html.includes(authGuardTag)) {
    const authBoundary = [
      html.includes('runtime-config.js') ? '' : runtimeConfigTag,
      html.includes('services/rbacEnforcementService.js') ? '' : rbacTag,
      html.includes('services/supabasePersistenceService.js') ? '' : persistenceTag,
      authGuardTag
    ].filter(Boolean).join('\n');
    html = html.replace(authGuardTag, authBoundary);
  }
  if (!html.includes('runtime-config.js')) {
    const supabaseScript = /<script\s+src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[^\"]+"><\/script>/i;
    html = supabaseScript.test(html)
      ? html.replace(supabaseScript, `${runtimeConfigTag}\n$&`)
      : html.replace('</head>', `  ${runtimeConfigTag}\n</head>`);
  }
  if (!html.includes('services/loadingService.js')) {
    const frontendSecurityTag = '<script src="services/frontendSecurityService.js"></script>';
    html = html.includes(frontendSecurityTag)
      ? html.replace(frontendSecurityTag, `${frontendSecurityTag}\n${loadingServiceTag}`)
      : html.replace('</head>', `  ${loadingServiceTag}\n</head>`);
  }
  if (!html.includes('styles/loading-system.css')) {
    html = html.replace('</head>', `  ${loadingStylesheetTag}\n</head>`);
  }
  await writeFile(path.join(output, file), html, 'utf8');
}

await writeFile(
  path.join(output, 'runtime-config.js'),
  `// Replaced by the deployment environment before production traffic is enabled.\n${serializeBrowserRuntimeConfig(createUnconfiguredRuntimeConfig())}`,
  'utf8'
);

await writeFile(path.join(output, 'health.json'), JSON.stringify({
  status: 'ok',
  service: 'arthhrms-frontend',
  schemaVersion: 1
}) + '\n', 'utf8');

console.log(`Built ${htmlFiles.length} HTML entry points in ${path.relative(root, output)}.`);
