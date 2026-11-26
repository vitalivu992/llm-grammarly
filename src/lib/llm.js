// OpenAI-compatible chat client. Every supported provider speaks /chat/completions.
import { buildMessages, parseResult } from './prompt.js';

export class LlmError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

// After the primary model fails (rate limit, account data policy, outage), go
// straight to the fallback for a while instead of paying the failure every time.
const COOLDOWN_MS = 5 * 60 * 1000;
const cooldown = new Map();

function headers(cfg) {
  const h = { 'Content-Type': 'application/json' };
  if (cfg.apiKey) h.Authorization = `Bearer ${cfg.apiKey}`;
  if (cfg.provider === 'openrouter') {
    h['X-Title'] = 'Penwright';
  }
  return h;
}

export function baseUrl(cfg) {
  return String(cfg.baseUrl || '').replace(/\/+$/, '');
}

async function chat(cfg, model, messages, { signal } = {}) {
  const body = { model, messages, stream: false };
  // OpenAI's current models only accept the default temperature.
  if (cfg.provider !== 'openai') body.temperature = 0.2;
  // Local servers differ in response_format support (LM Studio rejects json_object),
  // so only ask for JSON mode from hosted APIs that accept it.
  if (['openai', 'openrouter', 'deepseek'].includes(cfg.provider)) {
    body.response_format = { type: 'json_object' };
  }
  if (cfg.provider === 'openrouter') body.reasoning = { exclude: true };
  let res;
  try {
    res = await fetch(`${baseUrl(cfg)}/chat/completions`, {
      method: 'POST',
      headers: headers(cfg),
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new LlmError(`Cannot reach ${baseUrl(cfg)} (${e.message})`);
  }
  const textBody = await res.text();
  let data;
  try {
    data = JSON.parse(textBody);
  } catch {
    data = null;
  }
  if (!res.ok || data?.error) {
    const msg = data?.error?.message || data?.error || textBody.slice(0, 200) || res.statusText;
    const status = res.status || data?.error?.code || 0;
    throw new LlmError(`${model}: ${typeof msg === 'string' ? msg : JSON.stringify(msg)} (${status})`, status);
  }
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new LlmError(`${model}: empty response`);
  return content;
}

// Run one analysis. Tries the primary model, then the fallback model on any
// failure (rate limit, outage, unparseable output).
export async function analyze(cfg, text, opts = {}, signal) {
  const messages = buildMessages(text, opts);
  let models = [cfg.model, cfg.fallbackModel].filter((m, i, a) => m && a.indexOf(m) === i);
  if (!models.length) throw new LlmError('No model configured. Open the extension options.');
  const key = `${baseUrl(cfg)}|${cfg.model}`;
  if (models.length > 1 && cooldown.get(key) > Date.now()) models = models.slice(1);
  let lastErr;
  for (const model of models) {
    try {
      const raw = await chat(cfg, model, messages, { signal });
      return { ...parseResult(raw, text), model };
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      if (model === cfg.model) cooldown.set(key, Date.now() + COOLDOWN_MS);
      lastErr = e;
    }
  }
  throw lastErr;
}

export async function listModels(cfg, signal) {
  const res = await fetch(`${baseUrl(cfg)}/models`, { headers: headers(cfg), signal });
  if (!res.ok) throw new LlmError(`Listing models failed (${res.status})`, res.status);
  const data = await res.json();
  const list = Array.isArray(data) ? data : data.data || data.models || [];
  return list.map((m) => m.id || m.name).filter(Boolean).sort();
}
