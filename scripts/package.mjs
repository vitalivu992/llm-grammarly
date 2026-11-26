// Build store packages from src/:
//   dist/penwright-<version>-chromium.zip  Chrome Web Store and Edge Add-ons
//   dist/penwright-<version>-firefox.zip   addons.mozilla.org (dist/firefox/ is the unpacked copy)
// Usage: node scripts/package.mjs
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = `${ROOT}src`;
const DIST = `${ROOT}dist`;
// Permanent once the add-on is on AMO.
const GECKO_ID = 'penwright@lvsoftwares';

const manifest = JSON.parse(readFileSync(`${SRC}/manifest.json`, 'utf8'));
const pkg = JSON.parse(readFileSync(`${ROOT}package.json`, 'utf8'));
if (manifest.version !== pkg.version) {
  throw new Error(`Version mismatch: manifest ${manifest.version}, package.json ${pkg.version}`);
}
const { version } = manifest;

function build(sourceDir, filename) {
  execFileSync('npx', ['web-ext', 'build', '--source-dir', sourceDir, '--artifacts-dir', DIST, '--filename', filename, '--overwrite-dest'], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  console.log(`dist/${filename}`);
}

build(SRC, `penwright-${version}-chromium.zip`);

// Firefox MV3 has no extension service workers: run background.js as an event page.
const FF = `${DIST}/firefox`;
rmSync(FF, { recursive: true, force: true });
cpSync(SRC, FF, { recursive: true });
const { minimum_chrome_version, ...ff } = manifest;
ff.background = { scripts: ['background.js'], type: 'module' };
ff.browser_specific_settings = {
  gecko: {
    id: GECKO_ID,
    strict_min_version: '142.0',
    // The text being checked goes to the LLM endpoint the user configures.
    data_collection_permissions: { required: ['websiteContent'] },
  },
};
writeFileSync(`${FF}/manifest.json`, `${JSON.stringify(ff, null, 2)}\n`);
build(FF, `penwright-${version}-firefox.zip`);
