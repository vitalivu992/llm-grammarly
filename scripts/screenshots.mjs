// Regenerate docs/screenshots/*.png from the real extension. Model replies are
// scripted by a local mock server so the images are reproducible.
// Usage: node scripts/screenshots.mjs
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { startMock, launch, configure } from '../test/harness.mjs';

const OUT = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const PAGE = `<!doctype html><html><head><title>Compose</title><style>
  body { margin: 0; background: #eef0f3; font: 15px/1.55 system-ui, sans-serif; color: #1f2328; }
  .card { width: 640px; margin: 40px 0 0 60px; background: #fff; border: 1px solid #d0d7de; border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .bar { padding: 10px 16px; border-bottom: 1px solid #eaeef2; font-weight: 600; }
  .row { display: flex; gap: 10px; padding: 8px 16px; border-bottom: 1px solid #eaeef2; color: #57606a; }
  .row input { flex: 1; border: 0; font: inherit; color: #1f2328; outline: none; }
  #body { min-height: 190px; padding: 12px 16px 36px; outline: none; }
  #body p { margin: 0 0 10px; }
</style></head><body>
<div class="card">
  <div class="bar">New message</div>
  <div class="row">To <input value="sarah@example.com"></div>
  <div class="row">Subject <input value="Proposal review"></div>
  <div id="body" contenteditable="true"><p>Hi Sarah,</p><p>Thanks for you quick reply. I has reviewed the proposal and their are a few point we should discuss before friday. Could we meet tomorow afternoon?</p><p>Best,<br>Alex</p></div>
</div></body></html>`;

const FIXES = [
  ['for you quick', 'for your quick', 'grammar', 'Possessive "your" is needed before a noun.'],
  ['I has', 'I have', 'grammar', 'Use "have" with the subject "I".'],
  ['their are', 'there are', 'spelling', '"There" introduces existence; "their" is possessive.'],
  ['few point ', 'few points ', 'grammar', '"A few" takes a plural noun.'],
  ['friday', 'Friday', 'spelling', 'Days of the week are capitalized.'],
  ['tomorow', 'tomorrow', 'spelling', 'Misspelled word.'],
];
const REWRITE =
  'Hi Sarah,\nThank you for your prompt reply. I have reviewed the proposal, and there are a few points we should discuss before Friday. Would you be available to meet tomorrow afternoon?\nBest regards,\nAlex';

function respond(system, text) {
  if (/Rewrite the user's text/.test(system)) {
    return {
      text: REWRITE,
      edits: [{ from: 'Thanks', to: 'Thank you', type: 'tone', why: 'More formal greeting.' }],
    };
  }
  let out = text;
  const edits = [];
  for (const [from, to, type, why] of FIXES) {
    if (out.includes(from)) {
      out = out.replaceAll(from, to);
      edits.push({ from: from.trim(), to: to.trim(), type, why });
    }
  }
  return { text: out, edits };
}

const MODEL = 'deepseek/deepseek-v4.1-flash';
const mock = await startMock({ page: PAGE, respond });
const settings = (extra = {}) => ({
  provider: 'openrouter',
  connections: {
    openrouter: { baseUrl: `http://localhost:${mock.port}/v1`, apiKey: 'sk-or-demo', model: MODEL, fallbackModel: '' },
  },
  autoCheck: true,
  delayMs: 300,
  minChars: 5,
  tone: 'professional',
  formality: 4,
  disabledSites: [],
  ...extra,
});

async function composeShot(colorScheme, name, steps) {
  const b = await launch({ colorScheme, viewport: { width: 1160, height: 720 }, deviceScaleFactor: 2 });
  await configure(b.sw, settings());
  const page = await b.context.newPage();
  await page.goto(`http://127.0.0.1:${mock.port}/page`);
  await page.click('#body p:nth-child(2)');
  await page.evaluate(() => document.getElementById('body').dispatchEvent(new InputEvent('input', { bubbles: true })));
  await page.locator('penwright-root .badge[data-state="issues"]').waitFor();
  await page.locator('penwright-root .badge').click();
  const panel = page.locator('penwright-root .panel');
  await panel.waitFor();
  await steps?.(page, panel);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}${name}.png` });
  await b.context.close();
}

// 1. Corrections, light and dark.
await composeShot('light', 'corrections', async (_page, panel) => {
  // Show one skipped change so the toggle is visible.
  await panel.locator('.text .hunk').nth(4).click();
});
await composeShot('dark', 'corrections-dark');
await composeShot('light', 'corrections-github', async (page) => {
  await configure(page.context().serviceWorkers()[0], settings({ theme: 'github' }));
});

// 2. Tone & rewrite result.
await composeShot('light', 'rewrite', async (_page, panel) => {
  await panel.getByRole('tab', { name: /Tone/ }).click();
  await panel.getByRole('button', { name: 'Rewrite' }).click();
  await panel.locator('.text').waitFor();
  await panel.getByRole('button', { name: 'Show clean' }).click();
});

// 3. Options and popup with the stock OpenRouter preset.
{
  const b = await launch({ viewport: { width: 900, height: 820 }, deviceScaleFactor: 2 });
  await configure(b.sw, settings({ connections: { openrouter: { apiKey: 'sk-or-v1-demo-key-not-real' } }, tone: 'neutral', formality: 3 }));
  const opts = await b.context.newPage();
  await opts.goto(`chrome-extension://${b.extId}/options/options.html`);
  await opts.screenshot({ path: `${OUT}options.png` });

  // The popup reads the active tab, so put a normal page in front of it.
  const popup = await b.context.newPage();
  await popup.setViewportSize({ width: 320, height: 400 });
  const site = await b.context.newPage();
  await site.goto(`http://127.0.0.1:${mock.port}/page`);
  await site.bringToFront();
  await popup.goto(`chrome-extension://${b.extId}/popup/popup.html`);
  await popup.locator('#siteLabel', { hasText: '127.0.0.1' }).waitFor();
  await popup.screenshot({ path: `${OUT}popup.png` });
  await b.context.close();
}

mock.server.close();
console.log(`screenshots written to ${OUT}`);
