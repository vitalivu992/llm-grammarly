import { PROVIDERS, connectionFor, loadSettings, saveSettings } from '../lib/config.js';
import { TONES, FORMALITY } from '../lib/prompt.js';

const $ = (id) => document.getElementById(id);
let settings = await loadSettings();
document.documentElement.dataset.theme = settings.theme;
const conn = connectionFor(settings);
const preset = PROVIDERS[conn.provider];

$('conn').innerHTML = `<b>${preset.label}</b> · ${conn.model || 'no model'}${conn.fallbackModel ? ` → ${conn.fallbackModel}` : ''}`;
if (preset.needsKey && !conn.apiKey) {
  $('warn').hidden = false;
  $('warn').textContent = 'Add your API key in All settings to start.';
} else if (!conn.model) {
  $('warn').hidden = false;
  $('warn').textContent = 'Pick a model in All settings.';
}

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
let host = '';
try {
  const u = new URL(tab?.url || '');
  if (/^https?:$/.test(u.protocol)) host = u.hostname;
} catch {}
if (host) {
  $('siteLabel').textContent = `Enabled on ${host}`;
  $('site').checked = !settings.disabledSites.includes(host);
} else {
  $('siteLabel').textContent = 'Not available on this page';
  $('site').disabled = true;
}

for (const t of TONES) $('tone').add(new Option(t.label, t.id));
$('autoCheck').checked = settings.autoCheck;
$('tone').value = settings.tone;
$('formality').value = settings.formality;
$('formalityLabel').textContent = FORMALITY[settings.formality - 1];

const save = async (patch) => (settings = await saveSettings(patch));
$('site').addEventListener('change', (e) => {
  const rest = settings.disabledSites.filter((h) => h !== host);
  save({ disabledSites: e.target.checked ? rest : [...rest, host] });
});
$('autoCheck').addEventListener('change', (e) => save({ autoCheck: e.target.checked }));
$('tone').addEventListener('change', (e) => save({ tone: e.target.value }));
$('formality').addEventListener('input', (e) => {
  $('formalityLabel').textContent = FORMALITY[e.target.value - 1];
  save({ formality: Number(e.target.value) });
});
$('options').addEventListener('click', () => chrome.runtime.openOptionsPage());
