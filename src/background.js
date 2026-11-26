// Service worker: owns settings and every network call to the LLM.
import { analyze } from './lib/llm.js';
import { PROVIDERS, connectionFor, loadSettings } from './lib/config.js';

// Ollama answers 403 to requests carrying a chrome-extension:// Origin unless
// OLLAMA_ORIGINS is set. Strip Origin from this extension's own requests to local
// servers so local providers work out of the box. Scoped to our initiator only, so
// web pages' requests to localhost keep their Origin.
async function installLocalOriginRule() {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [1],
    addRules: [
      {
        id: 1,
        priority: 1,
        action: { type: 'modifyHeaders', requestHeaders: [{ header: 'origin', operation: 'remove' }] },
        condition: {
          regexFilter: '^https?://(localhost|127\\.0\\.0\\.1|\\[::1\\])(:\\d+)?/',
          // runtime.id is the gecko id in Firefox; the request initiator is the moz-extension UUID.
          initiatorDomains: [new URL(chrome.runtime.getURL('')).hostname],
          resourceTypes: ['xmlhttprequest', 'other'],
        },
      },
    ],
  });
}
installLocalOriginRule();

// One in-flight analysis per frame: a newer request cancels the older one.
const inflight = new Map();

async function handleAnalyze(msg, sender) {
  const key = `${sender.tab?.id ?? 'ext'}:${sender.frameId ?? 0}:${msg.channel || ''}`;
  inflight.get(key)?.abort();
  const ctrl = new AbortController();
  inflight.set(key, ctrl);
  try {
    const settings = await loadSettings();
    const conn = connectionFor(settings);
    if (PROVIDERS[conn.provider]?.needsKey && !conn.apiKey) {
      return { error: 'Add your API key in the extension options.', needsSetup: true };
    }
    const opts = {
      mode: msg.mode || 'check',
      tone: msg.tone ?? settings.tone,
      formality: msg.formality ?? settings.formality,
      dialect: settings.dialect,
    };
    const result = await analyze(conn, msg.text, opts, ctrl.signal);
    return { ok: true, ...result };
  } catch (e) {
    if (e.name === 'AbortError') return { aborted: true };
    return { error: e.message || String(e) };
  } finally {
    if (inflight.get(key) === ctrl) inflight.delete(key);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const run = async () => {
    switch (msg?.type) {
      case 'analyze':
        return handleAnalyze(msg, sender);
      case 'cancel': {
        const key = `${sender.tab?.id ?? 'ext'}:${sender.frameId ?? 0}:${msg.channel || ''}`;
        inflight.get(key)?.abort();
        return { ok: true };
      }
      case 'openOptions':
        chrome.runtime.openOptionsPage();
        return { ok: true };
      default:
        return { error: 'unknown message' };
    }
  };
  run()
    .catch((e) => ({ error: e.message || String(e) }))
    .then(sendResponse);
  return true;
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== 'install') return;
  const settings = await loadSettings();
  if (!connectionFor(settings).apiKey) chrome.runtime.openOptionsPage();
});
