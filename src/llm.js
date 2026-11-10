/**
 * llm.js — provider layer for Vertex (plan §6.3, CONTRACTS.md §llm). Track B.
 *
 * One entry point:  llm.json({ task, system, user, validate, provider })
 *   -> Promise<object>  (the parsed, validated JSON object).
 *
 * Providers:
 *   - "bharatcode" (primary, rules require it): OpenAI-compatible
 *     POST `${baseUrl}/chat/completions` with Authorization: Bearer <key>,
 *     temperature 0.3, 60 s AbortController timeout. baseUrl defaults to
 *     contracts DEFAULTS.bharatcodeBaseUrl and is overridable via
 *     llm.configure({ bharatcodeBaseUrl }) (or settings.bharatcodeBaseUrl) so
 *     a Cloudflare Worker pass-through proxy (plan Appendix A) can be swapped
 *     in later.
 *   - "demo": no network; resolves from data installed via
 *     llm.installDemoData({ topic_map, lessons:[{topicName, lesson, narration}] }).
 *     Keying convention (Track B-internal, matches prompts.js): tasks "lesson"
 *     and "narration" read the line `TOPIC: <exact topic name>` that
 *     prompts.js puts at the top of every user prompt and match it
 *     case-insensitively (trimmed) against lesson entries' topicName;
 *     "topic_map" returns the installed topic_map object verbatim.
 *   - "gemini": P1 plumbing, OFF by default (llm.configure({enableGemini:true})
 *     to arm). REST generateContent; model name comes only from config — never
 *     hardcoded.
 *
 * Error contract: plain Error with `err.kind` ∈ contracts LLM_ERROR_KINDS
 *   (no_key | network | ratelimit | timeout | cancelled | invalid_json | bad_shape),
 *   plus optional `err.retryAfterMs` (on ratelimit, from Retry-After) and
 *   `err.httpStatus`.
 *   UI mapping note: HTTP 401/403 from a provider is surfaced as
 *   kind "network" WITH err.httpStatus = 401/403 — there is no dedicated
 *   "auth" kind in the frozen contract, so the UI should special-case
 *   (kind === "network" && (httpStatus === 401 || httpStatus === 403))
 *   to show the friendly "your key looks wrong" bad-key message.
 *
 * Hardening (plan §6.3): raw text goes through schema.js repair utilities
 * (stripThink → stripFences → firstBalancedJson) before JSON.parse; on a
 * parse or validate failure we RETRY ONCE appending
 * "your last JSON failed because <errors>" to the user prompt; then throw
 * invalid_json / bad_shape. schema.js is Track A's file and may not exist
 * yet at dev time: we load it via dynamic import with an identity fallback
 * (repair simply disabled until integration) — the repair logic itself is
 * never re-implemented here. `llm.configure({ repairUtils })` can also
 * inject an alternative implementation (used by the Node smoke harness).
 *
 * Policy: concurrency limit contracts DEFAULTS.concurrency (2) across all
 * calls (cache hits skip network + limiter); exponential backoff on
 * 429/5xx with max 3 waits (1 s, 2 s, 4 s), then kind "ratelimit";
 * lesson cache keyed by hash(notes + topic + model + lang);
 * llm.cancelAll() aborts everything in flight or queued (kind "cancelled").
 * API keys are fetched from store ("bharatcode"/"gemini") or an in-memory
 * configure({key}) override — never logged, never cached to storage here.
 */

import {
  DEFAULTS,
  TIMEOUTS,
  LLM_TASKS,
  PROVIDERS,
  LLM_ERROR_KINDS,
} from './contracts.js';
import { store } from './store.js';

// ---------------------------------------------------------------------------
// module state
// ---------------------------------------------------------------------------

const config = {
  provider: null,          // overrides settings.provider
  key: null,               // bharatcode key override (in-memory only; dev/tests)
  baseUrl: null,           // bharatcode base URL override (alias: bharatcodeBaseUrl)
  bharatcodeBaseUrl: null,
  model: null,             // bharatcode model override
  lang: null,              // "en" | "hinglish" override
  concurrency: DEFAULTS.concurrency,
  // gemini (P1, off by default):
  enableGemini: false,
  geminiKey: null,
  geminiModel: null,       // REQUIRED from config — never hardcoded (plan §6.3)
  geminiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  repairUtils: null,       // optional injection: {stripThink, stripFences, firstBalancedJson}
};

/** Lesson results cache: hash(notes + topic + model + lang) -> parsed object. */
const lessonCache = new Map();

/** Data installed by llm.installDemoData for the "demo" provider. */
let demoData = null;

/** All controllers currently queued or in flight; llm.cancelAll() aborts them. */
const tracked = new Set();

let activeCount = 0;
const waiters = []; // { controller, resolve, reject }

const BACKOFF_MS = [1000, 2000, 4000]; // max 3 waits on 429/5xx (plan §6.3)

// ---------------------------------------------------------------------------
// error helper
// ---------------------------------------------------------------------------

function mkErr(kind, message) {
  if (!LLM_ERROR_KINDS.includes(kind)) {
    // Defensive: never leak an out-of-contract kind to the UI.
    kind = 'network';
  }
  const err = new Error(message);
  err.kind = kind;
  return err;
}

function cancelledErr() {
  return mkErr('cancelled', 'Request cancelled (global Cancel).');
}

// ---------------------------------------------------------------------------
// tiny non-cryptographic hash (FNV-1a 32-bit) — cache keys only, no security
// ---------------------------------------------------------------------------

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0).toString(36);
}

// ---------------------------------------------------------------------------
// misc helpers
// ---------------------------------------------------------------------------

function clone(v) {
  return typeof structuredClone === 'function'
    ? structuredClone(v)
    : JSON.parse(JSON.stringify(v));
}

/**
 * Sleep honoring "no arbitrary sleeps": used ONLY for the spec'd 429/5xx
 * backoff waits. Rejects early if the controller aborts (Cancel).
 */
function sleep(ms, controller) {
  return new Promise((resolve, reject) => {
    if (controller.signal.aborted) {
      reject(controller.__reason === 'timeout'
        ? mkErr('timeout', 'Request timed out.')
        : cancelledErr());
      return;
    }
    const timer = setTimeout(() => {
      controller.signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(controller.__reason === 'timeout'
        ? mkErr('timeout', 'Request timed out.')
        : cancelledErr());
    }
    controller.signal.addEventListener('abort', onAbort, { once: true });
  });
}

function isAbortError(err) {
  return !!err && (err.name === 'AbortError' || err.code === 20);
}

/** Extract the machine-readable `TOPIC:` marker line that prompts.js adds. */
function extractTopicMarker(userText) {
  const m = /^TOPIC:\s*(.+?)\s*$/m.exec(String(userText || ''));
  return m ? m[1] : '';
}

function normName(s) {
  return String(s || '').trim().toLowerCase();
}

/** Retry-After header → ms (seconds form or HTTP-date form). */
function parseRetryAfter(value) {
  if (!value) return null;
  const secs = Number(value);
  if (Number.isFinite(secs) && secs >= 0) return Math.round(secs * 1000);
  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) return Math.max(0, Math.round(dateMs - Date.now()));
  return null;
}

// ---------------------------------------------------------------------------
// concurrency limiter (cancel-aware)
// ---------------------------------------------------------------------------

function acquire(controller) {
  return new Promise((resolve, reject) => {
    if (controller.signal.aborted) {
      reject(controller.__reason === 'timeout'
        ? mkErr('timeout', 'Request timed out.')
        : cancelledErr());
      return;
    }
    const limit = Math.max(1, config.concurrency | 0);
    const grant = () => {
      activeCount++;
      let released = false;
      resolve(() => {
        if (released) return;
        released = true;
        activeCount--;
        // Hand the slot to the next still-alive waiter (its own grant runs).
        while (waiters.length > 0) {
          const next = waiters.shift();
          if (!next.controller.signal.aborted) {
            next.resolve();
            return;
          }
          // Aborted queue entries self-reject via their own abort listener;
          // this branch is only a safety net for a race.
        }
      });
    };
    if (activeCount < limit && waiters.length === 0) {
      grant();
      return;
    }
    const waiter = { controller, resolve: grant, reject };
    waiters.push(waiter);
    controller.signal.addEventListener('abort', () => {
      const idx = waiters.indexOf(waiter);
      if (idx !== -1) waiters.splice(idx, 1); // only meaningful while queued
      reject(controller.__reason === 'timeout'
        ? mkErr('timeout', 'Request timed out.')
        : cancelledErr());
    }, { once: true });
  });
}

// ---------------------------------------------------------------------------
// schema.js repair utilities: dynamic import with graceful identity fallback
// (Track A writes schema.js; until then repair is disabled, not re-implemented)
// ---------------------------------------------------------------------------

const IDENTITY_REPAIR = Object.freeze({
  stripThink: (s) => s,
  stripFences: (s) => s,
  firstBalancedJson: (s) => s,
});

let repairPromise = null;

function getRepairUtils() {
  if (config.repairUtils) return Promise.resolve(config.repairUtils);
  if (!repairPromise) {
    repairPromise = import('./schema.js')
      .then((mod) => {
        if (mod
          && typeof mod.stripThink === 'function'
          && typeof mod.stripFences === 'function'
          && typeof mod.firstBalancedJson === 'function') {
          return {
            stripThink: mod.stripThink,
            stripFences: mod.stripFences,
            firstBalancedJson: mod.firstBalancedJson,
          };
        }
        return IDENTITY_REPAIR; // schema.js exists but lacks the utils yet
      })
      .catch(() => IDENTITY_REPAIR); // schema.js not landed yet — no crash
  }
  return repairPromise;
}

async function repairText(raw) {
  const u = await getRepairUtils();
  const s = String(raw === undefined || raw === null ? '' : raw);
  const noThink = u.stripThink(s);
  const noFences = u.stripFences(noThink);
  const extracted = u.firstBalancedJson(noFences);
  return typeof extracted === 'string' ? extracted : noFences;
}

// ---------------------------------------------------------------------------
// provider: bharatcode / gemini shared HTTP core (OpenAI-style + Google-style)
// ---------------------------------------------------------------------------

/**
 * POST JSON with per-attempt 60 s timeout + backoff on 429/5xx.
 * extract(resData) -> string | null (null = shape problem → invalid_json).
 */
async function postWithBackoff({ url, headers, body, controller, label, extract }) {
  let lastRetryAfterMs = null;
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    if (attempt > 0) {
      await sleep(BACKOFF_MS[attempt - 1], controller);
    }
    const timer = setTimeout(() => {
      if (!controller.__reason) controller.__reason = 'timeout';
      controller.abort();
    }, TIMEOUTS.llmMs);
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });
    } catch (err) {
      if (controller.signal.aborted || isAbortError(err)) {
        if (controller.__reason === 'timeout') {
          throw mkErr('timeout', `${label} timed out after ${TIMEOUTS.llmMs / 1000} s.`);
        }
        throw cancelledErr();
      }
      throw mkErr('network', `Network/CORS error calling ${label}: ${err.message}`);
    } finally {
      clearTimeout(timer);
    }

    // Bad key / forbidden: frozen kinds have no "auth" value, so map to
    // "network" + err.httpStatus; UI shows the friendly bad-key message
    // when (kind === "network" && (httpStatus === 401 || 403)). No retry.
    if (res.status === 401 || res.status === 403) {
      const err = mkErr('network',
        `${label} rejected the key (HTTP ${res.status}). Re-paste it in Settings, or try the demo notebook.`);
      err.httpStatus = res.status;
      throw err;
    }

    if (res.status === 429 || res.status >= 500) {
      lastRetryAfterMs = parseRetryAfter(
        res.headers && typeof res.headers.get === 'function' ? res.headers.get('retry-after') : null);
      if (attempt === BACKOFF_MS.length) {
        const err = mkErr('ratelimit',
          `${label} is rate-limiting or unavailable (HTTP ${res.status}) after ${BACKOFF_MS.length} retries.`);
        err.httpStatus = res.status;
        if (lastRetryAfterMs) err.retryAfterMs = lastRetryAfterMs;
        throw err;
      }
      continue; // retryable — back off and try again
    }

    if (!res.ok) {
      const err = mkErr('network', `${label} returned HTTP ${res.status}.`);
      err.httpStatus = res.status;
      throw err;
    }

    let data;
    try {
      data = await res.json();
    } catch (err) {
      throw mkErr('invalid_json', `${label} returned a body that is not JSON.`);
    }
    const text = extract(data);
    if (typeof text !== 'string') {
      throw mkErr('invalid_json', `${label} response did not contain a message text.`);
    }
    return text;
  }
  // Unreachable: the loop always returns or throws.
  throw mkErr('network', `${label}: request loop ended unexpectedly.`);
}

async function callBharatcodeText({ model, system, user, controller }) {
  const key = config.key || store.getKey('bharatcode');
  if (!key) {
    throw mkErr('no_key',
      'No BharatCode key. Add a free one in Settings (bharatcode.ai, student email) or use the demo notebook.');
  }
  const settings = store.getSettings();
  const base = String(
    config.baseUrl || config.bharatcodeBaseUrl || settings.bharatcodeBaseUrl || DEFAULTS.bharatcodeBaseUrl
  ).replace(/\/+$/, '');
  const url = `${base}/chat/completions`;
  const body = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.3,
  });
  return postWithBackoff({
    url,
    // Bearer scheme assumed from the OpenAI-compatible description (plan T1).
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body,
    controller,
    label: 'BharatCode',
    extract: (data) => (
      data && Array.isArray(data.choices) && data.choices[0]
        && data.choices[0].message && typeof data.choices[0].message.content === 'string'
        ? data.choices[0].message.content
        : null
    ),
  });
}

async function callGeminiText({ model, system, user, controller }) {
  if (!config.enableGemini) {
    throw mkErr('no_key',
      'Gemini provider is not enabled (P1 opt-in: llm.configure({ enableGemini: true, geminiModel: "<current Flash-tier name from AI Studio>" }).');
  }
  if (!model) {
    throw mkErr('no_key',
      'Gemini model name is unset — it must come from config (llm.configure({ geminiModel })), never hardcoded.');
  }
  const key = config.geminiKey || store.getKey('gemini');
  if (!key) {
    throw mkErr('no_key', 'No Gemini key. Add one in Settings (key name "gemini") or use a different provider.');
  }
  const base = String(config.geminiBaseUrl).replace(/\/+$/, '');
  const url = `${base}/models/${encodeURIComponent(model)}:generateContent`;
  const body = JSON.stringify({
    contents: [{ parts: [{ text: `${system}\n\n${user}` }] }],
    generationConfig: { temperature: 0.3 },
  });
  return postWithBackoff({
    url,
    // Key travels in a header, not the query string, so it stays out of URLs/logs.
    headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
    body,
    controller,
    label: 'Gemini',
    extract: (data) => {
      const parts = data && data.candidates && data.candidates[0]
        && data.candidates[0].content && data.candidates[0].content.parts;
      if (!Array.isArray(parts)) return null;
      const text = parts.map((p) => (typeof p.text === 'string' ? p.text : '')).join('');
      return text.length > 0 ? text : null;
    },
  });
}

// ---------------------------------------------------------------------------
// provider: demo (no network) — data installed via installDemoData
// ---------------------------------------------------------------------------

function demoResolve(task, userText) {
  if (!demoData || typeof demoData !== 'object') {
    throw mkErr('bad_shape',
      'demo provider: no data installed — call llm.installDemoData({ topic_map, lessons }) first.');
  }
  if (task === 'topic_map') {
    const tm = demoData.topic_map;
    if (!tm || !Array.isArray(tm.topics)) {
      throw mkErr('bad_shape', 'demo provider: installed data has no topic_map.topics array.');
    }
    return clone(tm);
  }
  const topicName = extractTopicMarker(userText);
  if (!topicName) {
    throw mkErr('invalid_json',
      'demo provider: user prompt carries no "TOPIC:" marker — build prompts with prompts.js.');
  }
  const lessons = Array.isArray(demoData.lessons) ? demoData.lessons : [];
  const entry = lessons.find((l) => l && normName(l.topicName) === normName(topicName));
  if (!entry) {
    throw mkErr('bad_shape', `demo provider: no baked data for topic "${topicName}".`);
  }
  if (task === 'lesson') {
    if (!entry.lesson || typeof entry.lesson !== 'object') {
      throw mkErr('bad_shape', `demo provider: lesson data missing for topic "${topicName}".`);
    }
    return clone(entry.lesson);
  }
  // narration: entry.narration is {narration:[…], takeaway:""} (array also accepted)
  const n = entry.narration;
  if (Array.isArray(n)) return clone({ narration: n, takeaway: '' });
  if (n && typeof n === 'object' && Array.isArray(n.narration)) return clone(n);
  throw mkErr('bad_shape', `demo provider: narration data missing for topic "${topicName}".`);
}

// ---------------------------------------------------------------------------
// prompt/repair/validate loop (retry once with the failure appended)
// ---------------------------------------------------------------------------

function validationFailures(v, parsed) {
  if (v === true) return null;
  if (Array.isArray(v)) {
    if (v.length === 0) return null;
    return v.map((x) => String(x));
  }
  if (v === false) return [`object failed validation: ${JSON.stringify(parsed).slice(0, 200)}`];
  return [String(v)];
}

async function runWithRepair({ task, system, user, validate, prov, model, controller }) {
  if (prov === 'demo') {
    // Pre-saved JSON — no network, nothing to re-ask; validate once.
    const parsed = demoResolve(task, user);
    if (typeof validate === 'function') {
      const fails = validationFailures(validate(parsed), parsed);
      if (fails) {
        throw mkErr('bad_shape', `demo data failed validation: ${fails.join('; ')}`);
      }
    }
    return parsed;
  }

  const callText = prov === 'gemini' ? callGeminiText : callBharatcodeText;
  let last = null; // { type: 'parse'|'shape', messages: string[] }

  for (let attempt = 0; attempt < 2; attempt++) {
    let userText = user;
    if (attempt === 1) {
      userText = `${user}\n\nyour last JSON failed because ${last.messages.join('; ')}`;
    }
    const raw = await callText({ model, system, user: userText, controller });
    const repaired = await repairText(raw);
    let parsed;
    try {
      parsed = JSON.parse(repaired);
    } catch (err) {
      last = { type: 'parse', messages: [`JSON.parse failed: ${err.message}`] };
      continue;
    }
    if (parsed === null || typeof parsed !== 'object') {
      last = {
        type: 'parse',
        messages: [`the parsed value was ${parsed === null ? 'null' : typeof parsed}, expected a JSON object`],
      };
      continue;
    }
    if (typeof validate === 'function') {
      const fails = validationFailures(validate(parsed), parsed);
      if (fails) {
        last = { type: 'shape', messages: fails };
        continue;
      }
    }
    return parsed;
  }

  if (last.type === 'parse') {
    throw mkErr('invalid_json',
      `Model reply was not repairable JSON after 1 retry: ${last.messages.join('; ')}`);
  }
  throw mkErr('bad_shape',
    `Model reply failed validation after 1 retry: ${last.messages.join('; ')}`);
}

// ---------------------------------------------------------------------------
// public API
// ---------------------------------------------------------------------------

function lessonCacheKey(user, model, lang) {
  // plan §6.3: hash(notes + topic + model + lang) — `user` embeds the notes
  // excerpts, the TOPIC marker embeds the topic name.
  return fnv1a(`${user}\u0000${extractTopicMarker(user)}\u0000${model}\u0000${lang}`);
}

/**
 * The one LLM entry point (CONTRACTS.md §llm).
 * @param {{ task: string, system: string, user: string,
 *           validate?: (parsed:object) => true|string[],
 *           provider?: string }} opts
 * @returns {Promise<object>}
 */
export async function json({ task, system, user, validate, provider }) {
  if (!LLM_TASKS.includes(task)) {
    throw mkErr('bad_shape', `unknown task "${task}" — expected one of ${LLM_TASKS.join(', ')}.`);
  }
  if (typeof system !== 'string' || typeof user !== 'string' || user.trim() === '') {
    throw mkErr('bad_shape', 'llm.json requires string `system` and non-empty string `user`.');
  }
  const settings = store.getSettings();
  const prov = provider || config.provider || settings.provider || 'bharatcode';
  if (!PROVIDERS.includes(prov)) {
    throw mkErr('bad_shape', `unknown provider "${prov}" — expected one of ${PROVIDERS.join(', ')}.`);
  }
  const lang = config.lang || settings.lang || DEFAULTS.lang;
  let model;
  if (prov === 'bharatcode') model = config.model || settings.model || DEFAULTS.modelBharatcode;
  else if (prov === 'gemini') model = config.geminiModel || null; // never hardcoded
  else model = 'demo-baked';

  const cacheKey = task === 'lesson' ? lessonCacheKey(user, model, lang) : null;
  if (cacheKey && lessonCache.has(cacheKey)) {
    return clone(lessonCache.get(cacheKey)); // cache hit: no network, no limiter
  }

  const controller = new AbortController();
  controller.__reason = null; // 'timeout' | 'cancelled'
  tracked.add(controller);
  const release = await acquire(controller);
  try {
    // Second check: an identical call may have filled the cache while we queued.
    if (cacheKey && lessonCache.has(cacheKey)) {
      return clone(lessonCache.get(cacheKey));
    }
    const parsed = await runWithRepair({ task, system, user, validate, prov, model, controller });
    if (cacheKey) lessonCache.set(cacheKey, clone(parsed));
    return clone(parsed);
  } finally {
    release();
    tracked.delete(controller);
  }
}

/**
 * Cancel every queued/in-flight call (kind "cancelled").
 * New calls afterwards work normally.
 */
export function cancelAll() {
  for (const controller of tracked) {
    if (!controller.__reason) controller.__reason = 'cancelled';
    // abort() on a real AbortController does not throw; feature-guard for
    // stubbed controllers in harnesses rather than swallowing errors.
    if (controller && typeof controller.abort === 'function') controller.abort();
  }
}

/**
 * Configure overrides (all optional; in-memory only, never persisted):
 * { key, baseUrl | bharatcodeBaseUrl, model, lang, provider, concurrency,
 *   enableGemini, geminiKey, geminiModel, geminiBaseUrl, repairUtils }
 */
export function configure(patch) {
  if (!patch || typeof patch !== 'object') {
    throw new Error('llm.configure expects an object of settings');
  }
  for (const k of Object.keys(patch)) {
    if (!(k in config)) {
      throw new Error(`llm.configure: unknown option "${k}"`);
    }
  }
  if ('concurrency' in patch
    && !(Number.isInteger(patch.concurrency) && patch.concurrency >= 1)) {
    throw new Error('llm.configure: concurrency must be a positive integer');
  }
  if ('baseUrl' in patch) config.baseUrl = patch.baseUrl;
  if ('bharatcodeBaseUrl' in patch) config.baseUrl = patch.bharatcodeBaseUrl; // alias
  for (const k of Object.keys(patch)) {
    if (k !== 'baseUrl' && k !== 'bharatcodeBaseUrl') config[k] = patch[k];
  }
  lessonCache.clear(); // model/lang/provider changes must not reuse stale lessons
}

/**
 * Install data for the "demo" provider (no network):
 * { topic_map: {topics:[…]}, lessons: [ { topicName, lesson, narration } ] }
 * Lookup keyed on the `TOPIC:` marker in prompts.js lesson/narration users.
 */
export function installDemoData(data) {
  if (!data || typeof data !== 'object') {
    throw new TypeError('llm.installDemoData: expected { topic_map, lessons } object');
  }
  if (data.topic_map !== undefined && (!data.topic_map || !Array.isArray(data.topic_map.topics))) {
    throw new TypeError('llm.installDemoData: topic_map must have a topics array');
  }
  if (data.lessons !== undefined && !Array.isArray(data.lessons)) {
    throw new TypeError('llm.installDemoData: lessons must be an array');
  }
  if (Array.isArray(data.lessons)) {
    for (const l of data.lessons) {
      if (!l || typeof l.topicName !== 'string' || !l.lesson || typeof l.lesson !== 'object') {
        throw new TypeError('llm.installDemoData: every lessons[] entry needs { topicName, lesson }');
      }
    }
  }
  demoData = clone(data);
  lessonCache.clear();
}

export const llm = { json, configure, cancelAll, installDemoData };
export default llm;
