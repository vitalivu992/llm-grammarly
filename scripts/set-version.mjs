// Stamps a version into package.json and src/manifest.json (CI only; versions live in git tags).
//   node scripts/set-version.mjs 1.2.3
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) throw new Error(`Bad version: ${version}`);
for (const f of ['package.json', 'src/manifest.json']) {
  const json = JSON.parse(readFileSync(f, 'utf8'));
  json.version = version;
  writeFileSync(f, JSON.stringify(json, null, 2) + '\n');
}
