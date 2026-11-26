import { PROVIDERS, connectionFor, loadSettings, saveSettings } from '../lib/config.js';
import { analyze, listModels } from '../lib/llm.js';
import { TONES, FORMALITY } from '../lib/prompt.js';

const $ = (id) => document.getElementById(id);
let settings = await loadSettings();

const NOTES = {
  openrouter:
    '<b>openrouter/free</b> picks any free model that is up; when it fails or is rate limited, Penwright retries with the fallback (DeepSeek v4.1 Flash, about $0.05 per million input tokens). Free models are unavailable if your OpenRouter <a href="https://openrouter.ai/settings/privacy" target="_blank">privacy settings</a> require zero data retention; the fallback then handles every request.',
  ollama: 'Run <code>ollama serve</code>, pull a model (e.g. <code>ollama pull qwen3:4b</code>), then press Load models.',
  lmstudio: 'In LM Studio, start the local server (Developer tab) and load a model, then press Load models.',
  unsloth: 'Start <code>unsloth studio</code>. Create an API key under Settings → API (starts with <code>sk-unsloth-</code>).',
  custom: 'Any server that implements the OpenAI <code>/chat/completions</code> API (vLLM, llama.cpp server, LiteLLM, Groq, Together…).',
};

for (const [id, p] of Object.entries(PROVIDERS)) $('provider').add(new Option(p.label, id));
for (const t of TONES) $('tone').add(new Option(t.label, t.id));

function fillConnection() {
  const c = connectionFor(settings);
  const p = PROVIDERS[c.provider];
  $('provider').value = c.provider;
  $('baseUrl').value = c.baseUrl;
  $('apiKey').value = c.apiKey;
  $('model').value = c.model;
  $('fallbackModel').value = c.fallbackModel;
  $('apiKey').placeholder = p.needsKey ? 'Required' : 'Optional';
  $('keyHint').innerHTML = p.keyUrl ? `Get one at <a href="${p.keyUrl}" target="_blank">${new URL(p.keyUrl).host}</a>. Stored only in this browser.` : 'Stored only in this browser.';
  $('providerNote').hidden = !NOTES[c.provider];
  $('providerNote').innerHTML = NOTES[c.provider] || '';
  $('models').replaceChildren();
  $('testResult').hidden = true;
}

function fillGeneral() {
  $('autoCheck').checked = settings.autoCheck;
  $('delayMs').value = settings.delayMs;
  $('minChars').value = settings.minChars;
  $('dialect').value = settings.dialect;
  $('tone').value = settings.tone;
  $('formality').value = settings.formality;
  $('formalityLabel').textContent = FORMALITY[settings.formality - 1];
  $('disabledSites').value = settings.disabledSites.join('\n');
  $('theme').value = settings.theme;
  document.documentElement.dataset.theme = settings.theme;
}

function currentConnection() {
  return {
    provider: settings.provider,
    baseUrl: $('baseUrl').value.trim(),
    apiKey: $('apiKey').value.trim(),
    model: $('model').value.trim(),
    fallbackModel: $('fallbackModel').value.trim(),
  };
}

let savedTimer;
async function persist(patch) {
  settings = await saveSettings(patch);
  $('saved').textContent = 'Saved';
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => ($('saved').textContent = ''), 1500);
}

function saveConnection() {
  const { provider, ...conn } = currentConnection();
  return persist({ connections: { ...settings.connections, [provider]: conn } });
}

$('provider').addEventListener('change', async (e) => {
  await persist({ provider: e.target.value });
  fillConnection();
});
for (const id of ['baseUrl', 'apiKey', 'model', 'fallbackModel']) $(id).addEventListener('change', saveConnection);

$('toggleKey').addEventListener('click', () => {
  const show = $('apiKey').type === 'password';
  $('apiKey').type = show ? 'text' : 'password';
  $('toggleKey').textContent = show ? 'Hide' : 'Show';
});

function showResult(html, bad) {
  $('testResult').hidden = false;
  $('testResult').className = `result${bad ? ' bad' : ''}`;
  $('testResult').innerHTML = html;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

$('loadModels').addEventListener('click', async () => {
  const btn = $('loadModels');
  btn.disabled = true;
  try {
    const models = await listModels(currentConnection());
    $('models').replaceChildren(...models.map((m) => new Option(m)));
    showResult(`${models.length} models found. Start typing in the Model field to pick one.`);
    if (!$('model').value && models.length) {
      $('model').value = models[0];
      await saveConnection();
    }
  } catch (e) {
    showResult(esc(e.message), true);
  } finally {
    btn.disabled = false;
  }
});

$('test').addEventListener('click', async () => {
  const btn = $('test');
  btn.disabled = true;
  btn.textContent = 'Testing…';
  await saveConnection();
  const t0 = performance.now();
  try {
    const r = await analyze(currentConnection(), 'This sentence have a error.', { mode: 'check' });
    const ms = Math.round(performance.now() - t0);
    showResult(`Connected to <b>${esc(r.model)}</b> in ${ms} ms.<br>“This sentence have a error.” → “${esc(r.text)}”`);
  } catch (e) {
    showResult(esc(e.message), true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Test connection';
  }
});

$('autoCheck').addEventListener('change', (e) => persist({ autoCheck: e.target.checked }));
$('delayMs').addEventListener('change', (e) => persist({ delayMs: Math.max(300, Number(e.target.value) || 1200) }));
$('minChars').addEventListener('change', (e) => persist({ minChars: Math.max(1, Number(e.target.value) || 12) }));
$('dialect').addEventListener('change', (e) => persist({ dialect: e.target.value }));
$('tone').addEventListener('change', (e) => persist({ tone: e.target.value }));
$('formality').addEventListener('input', (e) => {
  $('formalityLabel').textContent = FORMALITY[e.target.value - 1];
  persist({ formality: Number(e.target.value) });
});
$('theme').addEventListener('change', (e) => {
  document.documentElement.dataset.theme = e.target.value;
  persist({ theme: e.target.value });
});
$('disabledSites').addEventListener('change', (e) =>
  persist({ disabledSites: e.target.value.split(/\s+/).map((s) => s.trim().toLowerCase()).filter(Boolean) }),
);

// Keep in sync with changes made from the popup or the in-page panel.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings && document.activeElement === document.body) {
    settings = { ...settings, ...changes.settings.newValue };
    fillGeneral();
  }
});

fillConnection();
fillGeneral();
