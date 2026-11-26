// End-to-end: real extension in Chromium against a mock local LLM server.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startMock, launch, configure } from './harness.mjs';

let mock, browser, page, base;

const settingsFor = (extra = {}) => ({
  provider: 'ollama',
  connections: { ollama: { baseUrl: `http://localhost:${mock.port}/v1`, apiKey: '', model: 'mock', fallbackModel: '' } },
  autoCheck: true,
  delayMs: 300,
  minChars: 5,
  tone: 'neutral',
  formality: 3,
  disabledSites: [],
  ...extra,
});

const badge = () => page.locator('penwright-root .badge');
const panel = () => page.locator('penwright-root .panel');
const badgeVisible = async () => (await badge().count()) > 0 && (await badge().isVisible());

async function freshPage() {
  page = await browser.context.newPage();
  await page.goto(`${base}/page`);
}

before(async () => {
  mock = await startMock();
  base = `http://127.0.0.1:${mock.port}`;
  browser = await launch();
  await configure(browser.sw, settingsFor());
});

after(async () => {
  await browser?.context.close();
  mock?.server.close();
});

test('textarea: auto-check flags issues and Apply fixes them', async () => {
  await freshPage();
  await page.click('#ta');
  await page.keyboard.type('I has went to teh store yesterday.');
  await assert.doesNotReject(badge().and(page.locator('[data-state="issues"]')).waitFor({ timeout: 10000 }));
  assert.equal(await badge().textContent(), '2');
  await badge().click();
  await panel().waitFor();
  assert.equal(await panel().locator('.edit').count(), 2);
  assert.match(await panel().locator('.why').first().textContent(), /use/);
  await panel().getByRole('button', { name: /Apply 2 changes/ }).click();
  assert.equal(await page.inputValue('#ta'), 'I went to the store yesterday.');
  assert.equal(await badge().getAttribute('data-state'), 'clean');
  assert.ok(await panel().isHidden());
  // Requests to local servers must not carry the extension Origin (Ollama 403s it).
  assert.ok(mock.requests.length > 0);
  assert.ok(mock.requests.every((r) => r.origin === undefined));
});

test('textarea: a rejected change is left alone', async () => {
  await freshPage();
  await page.click('#ta');
  await page.keyboard.type('teh cat and teh dog are here.');
  await badge().and(page.locator('[data-state="issues"]')).waitFor({ timeout: 10000 });
  await badge().click();
  await panel().locator('.text .hunk').first().click();
  await panel().getByRole('button', { name: /Apply 1 change$/ }).click();
  assert.equal(await page.inputValue('#ta'), 'teh cat and the dog are here.');
});

test('contenteditable: edits keep formatting', async () => {
  await freshPage();
  await page.click('#ce b');
  await page.keyboard.press('End');
  await page.keyboard.type(' ');
  await badge().and(page.locator('[data-state="issues"]')).waitFor({ timeout: 10000 });
  await badge().click();
  await panel().getByRole('button', { name: /Apply 2 changes/ }).click();
  const html = await page.innerHTML('#ce');
  assert.match(html, /<b>the<\/b>/);
  assert.equal((await page.innerText('#ce')).trim().replace(/\s+/g, ' '), 'We have the plan ready now.');
});

test('iframe: fields inside frames get their own badge', async () => {
  await freshPage();
  const frame = page.frameLocator('#frame');
  await frame.locator('#inner').click();
  await page.keyboard.type('Did you recieve it?');
  const b = frame.locator('penwright-root .badge[data-state="issues"]');
  await b.waitFor({ timeout: 10000 });
  await b.click();
  await frame.locator('penwright-root .panel').getByRole('button', { name: /Apply 1 change/ }).click();
  assert.equal(await frame.locator('#inner').inputValue(), 'Did you receive it?');
});

test('rewrite: tone and formality produce an applicable rewrite', async () => {
  await freshPage();
  await page.click('#ta2');
  await page.keyboard.type('hey can u send the file asap');
  await badge().waitFor();
  await badge().click();
  await panel().getByRole('tab', { name: /Tone/ }).click();
  await panel().getByRole('button', { name: 'Professional' }).click();
  await panel().locator('input[type="range"]').fill('5');
  await panel().getByRole('button', { name: 'Rewrite' }).click();
  await panel().getByRole('button', { name: /Apply/ }).click();
  assert.equal(await page.inputValue('#ta2'), 'Hello, could you please send the file as soon as possible?');
  const last = mock.requests.at(-1).system;
  assert.match(last, /professional tone at formality level 5 of 5/);
  const stored = await browser.sw.evaluate(() => chrome.storage.local.get('settings'));
  assert.equal(stored.settings.tone, 'professional');
  assert.equal(stored.settings.formality, 5);
});

test('fallback model answers when the primary fails', async () => {
  await configure(browser.sw, settingsFor({ connections: { ollama: { baseUrl: `http://localhost:${mock.port}/v1`, model: 'broken', fallbackModel: 'mock' } } }));
  await freshPage();
  const before = mock.requests.length;
  await page.click('#ta');
  await page.keyboard.type('Please recieve this.');
  await badge().and(page.locator('[data-state="issues"]')).waitFor({ timeout: 10000 });
  await badge().click();
  assert.equal(await panel().locator('.model').textContent(), 'mock');
  assert.deepEqual(mock.requests.slice(before).map((r) => r.model), ['broken', 'mock']);
  await configure(browser.sw, settingsFor());
});

test('no badge on password fields or disabled sites', async () => {
  await freshPage();
  await page.click('#pw');
  await page.keyboard.type('secret teh');
  await page.waitForTimeout(800);
  assert.equal(await badgeVisible(), false);

  await configure(browser.sw, settingsFor({ disabledSites: ['127.0.0.1'] }));
  await freshPage();
  await page.click('#ta');
  await page.keyboard.type('teh teh teh teh');
  await page.waitForTimeout(800);
  assert.equal(await badgeVisible(), false);
  await configure(browser.sw, settingsFor());
});

test('options page: test connection and model list', async () => {
  const p = await browser.context.newPage();
  await p.goto(`chrome-extension://${browser.extId}/options/options.html`);
  assert.equal(await p.inputValue('#provider'), 'ollama');
  await p.click('#loadModels');
  await p.locator('#testResult', { hasText: '2 models found' }).waitFor();
  await p.click('#test');
  await p.locator('#testResult', { hasText: 'Connected to' }).waitFor();
  // Switching provider shows that provider's preset.
  const modelIs = (v) => p.waitForFunction((v) => document.getElementById('model').value === v, v, { timeout: 3000 });
  await p.selectOption('#provider', 'openrouter');
  await modelIs('openrouter/free');
  assert.equal(await p.inputValue('#fallbackModel'), 'deepseek/deepseek-v4.1-flash');
  await p.selectOption('#provider', 'ollama');
  await modelIs('mock');
  await p.close();
});

test('theme: chosen in options, applied live to the in-page panel', async () => {
  await freshPage();
  await page.click('#ta');
  await page.keyboard.type('I has went to teh store yesterday.');
  await badge().and(page.locator('[data-state="issues"]')).waitFor({ timeout: 10000 });
  const theme = () => page.locator('penwright-root .pw').getAttribute('data-theme');
  assert.equal(await theme(), 'priority');
  assert.equal(await badge().evaluate((el) => getComputedStyle(el).borderRadius), '50%');

  const p = await browser.context.newPage();
  await p.goto(`chrome-extension://${browser.extId}/options/options.html`);
  await p.selectOption('#theme', 'github');
  assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), 'github');
  await page.waitForFunction(() => document.querySelector('penwright-root').shadowRoot.querySelector('.pw').dataset.theme === 'github');
  // GitHub primary buttons are green.
  await badge().click();
  await panel().waitFor();
  const bg = await panel().getByRole('button', { name: /Apply/ }).evaluate((el) => getComputedStyle(el).backgroundColor);
  assert.equal(bg, 'rgb(31, 136, 61)');
  await p.close();
  await configure(browser.sw, settingsFor());
});

test('popup renders the active connection', async () => {
  const p = await browser.context.newPage();
  await p.goto(`chrome-extension://${browser.extId}/popup/popup.html`);
  assert.match(await p.textContent('#conn'), /Ollama/);
  await p.close();
});
