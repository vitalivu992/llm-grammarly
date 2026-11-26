// Provider presets and settings storage.
import '../shared/constants.js';

export const PROVIDERS = {
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openrouter/free',
    fallbackModel: 'deepseek/deepseek-v4.1-flash',
    needsKey: true,
    keyUrl: 'https://openrouter.ai/keys',
  },
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-6-luna',
    fallbackModel: '',
    needsKey: true,
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-flash',
    fallbackModel: '',
    needsKey: true,
    keyUrl: 'https://platform.deepseek.com/api_keys',
  },
  ollama: { label: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1', model: '', fallbackModel: '', needsKey: false },
  lmstudio: { label: 'LM Studio (local)', baseUrl: 'http://localhost:1234/v1', model: '', fallbackModel: '', needsKey: false },
  unsloth: { label: 'Unsloth Studio (local)', baseUrl: 'http://localhost:8888/v1', model: '', fallbackModel: '', needsKey: true },
  custom: { label: 'Custom (OpenAI-compatible)', baseUrl: '', model: '', fallbackModel: '', needsKey: false },
};

export const { DEFAULTS } = globalThis.PWShared;

export function connectionFor(settings, provider = settings.provider) {
  const preset = PROVIDERS[provider] || PROVIDERS.custom;
  const saved = settings.connections?.[provider] || {};
  return {
    provider,
    baseUrl: saved.baseUrl ?? preset.baseUrl,
    apiKey: saved.apiKey ?? '',
    model: saved.model ?? preset.model,
    fallbackModel: saved.fallbackModel ?? preset.fallbackModel,
  };
}

export async function loadSettings() {
  const stored = await chrome.storage.local.get('settings');
  return { ...DEFAULTS, ...(stored.settings || {}) };
}

export async function saveSettings(patch) {
  const next = { ...(await loadSettings()), ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}
