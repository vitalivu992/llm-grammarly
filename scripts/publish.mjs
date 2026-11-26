// Upload a zip to a store and submit it for review. Used by .github/workflows/release.yml.
// Usage: node scripts/publish.mjs chrome|edge <zip>
// Env (chrome): CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN, CWS_PUBLISHER_ID, CWS_EXTENSION_ID
// Env (edge):   EDGE_CLIENT_ID, EDGE_API_KEY, EDGE_PRODUCT_ID
// Firefox is published with `web-ext sign` (see the workflow).
import { readFileSync } from 'node:fs';

const [store, zipPath] = process.argv.slice(2);
const zip = readFileSync(zipPath);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function env(...names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) throw new Error(`Missing secrets: ${missing.join(', ')}`);
  return names.map((n) => process.env[n]);
}

async function call(url, init) {
  const res = await fetch(url, init);
  const body = await res.text();
  if (!res.ok) throw new Error(`${init?.method || 'GET'} ${url} → ${res.status} ${body}`);
  return { res, json: body ? JSON.parse(body) : {} };
}

// Chrome Web Store API v2: https://developer.chrome.com/docs/webstore/using-api
async function chrome() {
  const [clientId, clientSecret, refreshToken, publisher, item] = env(
    'CWS_CLIENT_ID', 'CWS_CLIENT_SECRET', 'CWS_REFRESH_TOKEN', 'CWS_PUBLISHER_ID', 'CWS_EXTENSION_ID',
  );
  const { json: token } = await call('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  });
  const auth = { Authorization: `Bearer ${token.access_token}` };
  const base = `https://chromewebstore.googleapis.com/v2/publishers/${publisher}/items/${item}`;

  const { json: up } = await call(`https://chromewebstore.googleapis.com/upload/v2/publishers/${publisher}/items/${item}:upload`, {
    method: 'POST', headers: auth, body: zip,
  });
  console.log('upload:', JSON.stringify(up));
  let state = up.uploadState;
  for (let i = 0; state === 'IN_PROGRESS' && i < 60; i++) {
    await sleep(5000);
    state = (await call(`${base}:fetchStatus`, { headers: auth })).json.lastAsyncUploadState;
  }
  if (state !== 'SUCCEEDED') throw new Error(`Chrome upload did not succeed: ${state}`);

  const { json: pub } = await call(`${base}:publish`, { method: 'POST', headers: auth });
  console.log('publish:', JSON.stringify(pub));
}

// Edge Add-ons API v1.1: https://learn.microsoft.com/microsoft-edge/extensions/update/api/using-addons-api
async function edge() {
  const [clientId, apiKey, product] = env('EDGE_CLIENT_ID', 'EDGE_API_KEY', 'EDGE_PRODUCT_ID');
  const headers = { Authorization: `ApiKey ${apiKey}`, 'X-ClientID': clientId };
  const base = `https://api.addons.microsoftedge.microsoft.com/v1/products/${product}/submissions`;

  async function wait(statusUrl, what) {
    for (let i = 0; i < 60; i++) {
      const { json } = await call(statusUrl, { headers });
      if (json.status !== 'InProgress') {
        console.log(`${what}:`, JSON.stringify(json));
        if (json.status !== 'Succeeded') throw new Error(`Edge ${what} failed: ${json.message || json.status}`);
        return;
      }
      await sleep(5000);
    }
    throw new Error(`Edge ${what} timed out`);
  }
  const operation = (res) => res.headers.get('location').split('/').pop();

  const { res: up } = await call(`${base}/draft/package`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/zip' }, body: zip,
  });
  await wait(`${base}/draft/package/operations/${operation(up)}`, 'upload');

  const { res: pub } = await call(base, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes: `Automated release of ${zipPath.match(/\d+\.\d+\.\d+/)?.[0] || 'a new version'}.` }),
  });
  await wait(`${base}/operations/${operation(pub)}`, 'publish');
}

const stores = { chrome, edge };
if (!stores[store] || !zipPath) {
  console.error('Usage: node scripts/publish.mjs chrome|edge <zip>');
  process.exit(2);
}
await stores[store]();
