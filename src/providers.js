/**
 * providers.js — optional browser-side model adapters (OpenAI, Anthropic,
 * Gemini). Keys are read from state at call time, never logged or rendered.
 * Every request has a 60 s AbortController and a global cancel switch.
 */
import { getSettings, getKey } from './state.js';

export class LlmError extends Error {
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'LlmError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

export const PROVIDER_LABEL = { openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Google Gemini' };

const TIMEOUT_MS = 60000;
const controllers = new Set();

export function cancelAll() {
  for (const c of controllers) {
    try { c.abort(); } catch { /* already aborted */ }
  }
  controllers.clear();
}

export function isConfigured() {
  const { provider } = getSettings();
  return provider !== 'off' && !!getKey(provider);
}

export function providerLabel() {
  const { provider } = getSettings();
  return PROVIDER_LABEL[provider] || 'No model';
}

function stripThinking(text) {
  return String(text || '')
    .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '')
    .replace(/```(?:json|javascript|js)?/gi, '')
    .replace(/```/g, '')
    .trim();
}

/** First balanced {...} object, string-aware. */
export function firstBalancedJson(text) {
  const s = stripThinking(text);
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

function normaliseValidation(validate, data) {
  if (typeof validate !== 'function') return true;
  let result;
  try { result = validate(data); } catch (err) { return [err.message || String(err)]; }
  if (result === true || result === undefined || result === null) return true;
  if (Array.isArray(result)) return result.length ? result.map(String) : true;
  if (result === false) return ['response failed validation'];
  return true;
}

function readText(provider, data) {
  if (provider === 'openai') return data?.choices?.[0]?.message?.content || '';
  if (provider === 'anthropic') return (data?.content || []).map((c) => c.text || '').join('');
  if (provider === 'gemini') return (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  return '';
}

function buildRequest(provider, key, settings, { system, user }) {
  if (provider === 'openai') {
    return {
      url: 'https://api.openai.com/v1/chat/completions',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: {
        model: settings.model || 'gpt-4o-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      },
    };
  }
  if (provider === 'anthropic') {
    return {
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: {
        model: settings.model || 'claude-3-5-haiku-latest',
        max_tokens: 2400,
        temperature: 0.2,
        system,
        messages: [{ role: 'user', content: user }],
      },
    };
  }
  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.model || 'gemini-2.0-flash')}:generateContent`,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
    },
  };
}

async function requestOnce(provider, key, settings, payload, externalSignal) {
  const { url, headers, body } = buildRequest(provider, key, settings, payload);
  const controller = new AbortController();
  controllers.add(controller);
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, TIMEOUT_MS);
  const onAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', onAbort, { once: true });
  }
  try {
    let res;
    try {
      res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
    } catch (err) {
      if (timedOut) throw new LlmError('timeout', 'The model took longer than 60 seconds.');
      if (controller.signal.aborted) throw new LlmError('cancelled', 'Cancelled.');
      throw new LlmError('network', 'Could not reach the model provider (network or CORS).', { httpStatus: 0 });
    }
    if (!res.ok) {
      let message = '';
      try {
        const errBody = await res.json();
        message = errBody?.error?.message || errBody?.message || '';
      } catch { /* non-JSON error body */ }
      const kind = res.status === 429 || res.status >= 500 ? 'ratelimit' : 'network';
      const retryAfter = Number(res.headers.get('retry-after'));
      throw new LlmError(kind, message || `Provider returned HTTP ${res.status}.`, {
        httpStatus: res.status,
        retryAfterMs: Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined,
      });
    }
    let data;
    try { data = await res.json(); } catch {
      throw new LlmError('invalid_json', 'The provider returned an unreadable response.');
    }
    return readText(provider, data);
  } finally {
    clearTimeout(timer);
    controllers.delete(controller);
    if (externalSignal) externalSignal.removeEventListener('abort', onAbort);
  }
}

/**
 * Call the selected provider and return validated JSON. One retry only,
 * with the validation error fed back into the prompt.
 */
export async function json({ system, user, validate, signal }) {
  const settings = getSettings();
  const provider = settings.provider;
  if (provider === 'off') throw new LlmError('no_key', 'No AI provider is selected.');
  const key = getKey(provider);
  if (!key) throw new LlmError('no_key', 'No API key is stored for this provider.');

  let lastKind = 'bad_shape';
  let lastMessage = '';
  let promptUser = user;
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await requestOnce(provider, key, settings, { system, user: promptUser }, signal);
    const candidate = firstBalancedJson(text);
    if (!candidate) {
      lastKind = 'invalid_json';
      lastMessage = 'The response contained no JSON object.';
      promptUser = `${user}\n\nYour previous response was not valid JSON. Return only one JSON object.`;
      continue;
    }
    let parsed;
    try { parsed = JSON.parse(candidate); } catch (err) {
      lastKind = 'invalid_json';
      lastMessage = 'The response JSON could not be parsed.';
      promptUser = `${user}\n\nYour previous response was invalid JSON (${err.message}). Return only one JSON object.`;
      continue;
    }
    if (parsed && typeof parsed === 'object' && typeof parsed.provider === 'undefined') {
      // meta is filled by the caller when absent; nothing to do here.
    }
    const verdict = normaliseValidation(validate, parsed);
    if (verdict === true) return parsed;
    lastKind = 'bad_shape';
    lastMessage = verdict.join('; ');
    promptUser = `${user}\n\nYour previous response failed schema validation: ${lastMessage}\nFix exactly these problems and return one JSON object.`;
  }
  throw new LlmError(lastKind, lastMessage || 'The model response was not usable.');
}

export function describeLlmError(err) {
  const kind = err?.kind;
  if (kind === 'no_key') return 'Add an API key in Settings, or continue with the offline curated content.';
  if (kind === 'network') {
    if (err.httpStatus === 401 || err.httpStatus === 403) return 'The provider rejected that key. Check it in Settings.';
    return 'Could not reach the provider (network or CORS). The offline content still works.';
  }
  if (kind === 'ratelimit') return 'The provider is rate-limiting requests. Try again shortly.';
  if (kind === 'timeout') return 'The request passed 60 seconds and was stopped. Try again.';
  if (kind === 'cancelled') return 'Cancelled.';
  if (kind === 'invalid_json' || kind === 'bad_shape') return 'The model returned unusable JSON. Nothing was saved; try again.';
  return 'The model request failed. Nothing was saved.';
}
