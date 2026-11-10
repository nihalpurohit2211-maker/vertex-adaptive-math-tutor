/**
 * store.js — notebook state + settings + API-key storage (plan §6.9,
 * CONTRACTS.md §store). Track B.
 *
 * - localStorage wrapped in try/catch with a transparent in-memory fallback
 *   (no empty catches; `storageInfo()` exposes which tier is live).
 * - Keys per contracts STORAGE: vx2.nb.<id>, vx2.settings,
 *   vx2.key.bharatcode, vx2.key.gemini.
 * - API keys live in sessionStorage UNLESS settings.remember === true,
 *   in which case they move to localStorage. Keys are never logged and
 *   never placed in DOM — this module only reads/writes storage values.
 * - importNotebook() hand-validates the §6.2 shape and throws descriptive
 *   Errors; Track A's schema.js validators are used opportunistically when
 *   the module is already loaded (dynamic import, graceful fallback).
 * - v3 boundary rules (plan3 §6.3/§10, CONTRACTS Addendum v3): legacy
 *   `lesson.trace` and trace-only fields are DISCARDED at the load/import
 *   boundary so old Plan 2 notebooks keep importing and trace never runs.
 * - v3 revision pins: Notebook.revisionPins is an ordered array of existing
 *   topic IDs; missing/legacy → []. normalizePins is pure and side-effect
 *   free (Node checks import it without any browser storage access);
 *   togglePin/movePin persist via the SAME saveNotebook serialization path;
 *   getPins normalizes on read. Pins change ONLY the revision sheet.
 * - `saveNotebook(demoNotebook)` works for any object — Track C may use it
 *   as a dev stub.
 */

import {
  STORAGE,
  DEFAULTS,
  RATINGS,
  AFTER_STATES,
  COVERAGE_STATUSES,
  TOPIC_KINDS,
  LESSON_SOURCES,
  PROVIDERS,
} from './contracts.js';

// Track-B-internal key for "which notebook is active". contracts.js holds
// only cross-track constants; this one is private to store.js.
const CURRENT_KEY = 'vx2.current';

// ---------------------------------------------------------------------------
// storage tier: localStorage/sessionStorage with in-memory fallback
// ---------------------------------------------------------------------------

const memory = {
  local: new Map(),
  session: new Map(),
};

const storageInfoState = {
  localAvailable: false,
  sessionAvailable: false,
  checked: false,
};

function probeStorage() {
  if (storageInfoState.checked) return;
  storageInfoState.checked = true;
  try {
    const probeKey = 'vx2.__probe__';
    window.localStorage.setItem(probeKey, '1');
    window.localStorage.removeItem(probeKey);
    storageInfoState.localAvailable = true;
  } catch (err) {
    // localStorage blocked (Safari private mode, file://, cookies disabled)
    // → in-memory fallback stays active; flag is the state we need.
    storageInfoState.localAvailable = false;
  }
  try {
    const probeKey = 'vx2.__probe__';
    window.sessionStorage.setItem(probeKey, '1');
    window.sessionStorage.removeItem(probeKey);
    storageInfoState.sessionAvailable = true;
  } catch (err) {
    storageInfoState.sessionAvailable = false;
  }
}

/** @returns {{localAvailable: boolean, sessionAvailable: boolean}} */
export function storageInfo() {
  probeStorage();
  return {
    localAvailable: storageInfoState.localAvailable,
    sessionAvailable: storageInfoState.sessionAvailable,
  };
}

function tierGet(tier, key) {
  probeStorage();
  if (tier === 'local' && storageInfoState.localAvailable) {
    try {
      return window.localStorage.getItem(key);
    } catch (err) {
      storageInfoState.localAvailable = false; // degraded at runtime → memory
    }
  }
  if (tier === 'session' && storageInfoState.sessionAvailable) {
    try {
      return window.sessionStorage.getItem(key);
    } catch (err) {
      storageInfoState.sessionAvailable = false;
    }
  }
  const v = memory[tier].get(key);
  return v === undefined ? null : v;
}

function tierSet(tier, key, value) {
  probeStorage();
  if (tier === 'local' && storageInfoState.localAvailable) {
    try {
      window.localStorage.setItem(key, value);
      return;
    } catch (err) {
      storageInfoState.localAvailable = false; // quota/security error → fallback
    }
  }
  if (tier === 'session' && storageInfoState.sessionAvailable) {
    try {
      window.sessionStorage.setItem(key, value);
      return;
    } catch (err) {
      storageInfoState.sessionAvailable = false;
    }
  }
  memory[tier].set(key, value);
}

function tierRemove(tier, key) {
  probeStorage();
  if (tier === 'local' && storageInfoState.localAvailable) {
    try {
      window.localStorage.removeItem(key);
    } catch (err) {
      storageInfoState.localAvailable = false;
    }
  }
  if (tier === 'session' && storageInfoState.sessionAvailable) {
    try {
      window.sessionStorage.removeItem(key);
    } catch (err) {
      storageInfoState.sessionAvailable = false;
    }
  }
  memory[tier].delete(key);
}

/** All keys visible in one tier (real storage keys + memory keys). */
function tierKeys(tier) {
  probeStorage();
  const keys = new Set();
  if (tier === 'local' && storageInfoState.localAvailable) {
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        keys.add(window.localStorage.key(i));
      }
    } catch (err) {
      storageInfoState.localAvailable = false;
    }
  }
  if (tier === 'session' && storageInfoState.sessionAvailable) {
    try {
      for (let i = 0; i < window.sessionStorage.length; i++) {
        keys.add(window.sessionStorage.key(i));
      }
    } catch (err) {
      storageInfoState.sessionAvailable = false;
    }
  }
  for (const k of memory[tier].keys()) keys.add(k);
  return [...keys];
}

// ---------------------------------------------------------------------------
// opportunistic schema.js validators (Track A, may not exist yet)
// ---------------------------------------------------------------------------

let schemaModule = null; // { validateLesson?, validateTopicMap? } when loaded

/** Fire-and-forget load of schema.js; failure simply keeps local validation. */
function ensureSchema() {
  if (schemaModule) return Promise.resolve(schemaModule);
  return import('./schema.js')
    .then((mod) => {
      schemaModule = mod && typeof mod === 'object' ? mod : null;
      return schemaModule;
    })
    .catch(() => {
      // schema.js absent (parallel track not landed) — hand-rolled validation
      // is the designed fallback; nothing else to do.
      return null;
    });
}

// ---------------------------------------------------------------------------
// settings
// ---------------------------------------------------------------------------

const DEFAULT_SETTINGS = Object.freeze({
  hoursToStudy: DEFAULTS.hoursToStudy,
  lang: DEFAULTS.lang,
  model: DEFAULTS.modelBharatcode,
  provider: 'bharatcode',
  remember: false,
  bharatcodeBaseUrl: DEFAULTS.bharatcodeBaseUrl,
});

export function getSettings() {
  const raw = tierGet('local', STORAGE.settings);
  let stored = null;
  if (raw !== null) {
    try {
      stored = JSON.parse(raw);
    } catch (err) {
      stored = null; // corrupt settings JSON → defaults
    }
  }
  const merged = { ...DEFAULT_SETTINGS };
  if (stored && typeof stored === 'object') {
    if (Number.isFinite(stored.hoursToStudy) && stored.hoursToStudy > 0) {
      merged.hoursToStudy = stored.hoursToStudy;
    }
    if (stored.lang === 'en' || stored.lang === 'hinglish') merged.lang = stored.lang;
    if (typeof stored.model === 'string' && stored.model.trim()) merged.model = stored.model;
    if (PROVIDERS.includes(stored.provider)) merged.provider = stored.provider;
    if (typeof stored.remember === 'boolean') merged.remember = stored.remember;
    if (typeof stored.bharatcodeBaseUrl === 'string' && stored.bharatcodeBaseUrl.trim()) {
      merged.bharatcodeBaseUrl = stored.bharatcodeBaseUrl;
    }
  }
  return merged;
}

export function setSettings(partial) {
  const before = getSettings();
  const next = { ...before };
  if (partial && typeof partial === 'object') {
    if (Number.isFinite(partial.hoursToStudy) && partial.hoursToStudy > 0) {
      next.hoursToStudy = partial.hoursToStudy;
    }
    if (partial.lang === 'en' || partial.lang === 'hinglish') next.lang = partial.lang;
    if (typeof partial.model === 'string' && partial.model.trim()) next.model = partial.model.trim();
    if (PROVIDERS.includes(partial.provider)) next.provider = partial.provider;
    if (typeof partial.remember === 'boolean') next.remember = partial.remember;
    if (typeof partial.bharatcodeBaseUrl === 'string' && partial.bharatcodeBaseUrl.trim()) {
      next.bharatcodeBaseUrl = partial.bharatcodeBaseUrl.trim();
    }
  }
  tierSet('local', STORAGE.settings, JSON.stringify(next));
  // If "remember" flipped, relocate stored API keys to the new canonical tier.
  if (before.remember !== next.remember) {
    for (const name of ['bharatcode', 'gemini']) {
      const existing = readKeyFromBothTiers(name);
      if (existing !== null) writeKeyCanonical(name, existing, next.remember);
    }
  }
  return next;
}

// ---------------------------------------------------------------------------
// API keys — sessionStorage unless settings.remember === true → localStorage
// ---------------------------------------------------------------------------

function storageKeyForKeyName(name) {
  if (name === 'bharatcode') return STORAGE.keyBharatcode;
  if (name === 'gemini') return STORAGE.keyGemini;
  return null;
}

function keyTierForRemember(remember) {
  return remember ? 'local' : 'session';
}

function readKeyFromBothTiers(name) {
  const sKey = storageKeyForKeyName(name);
  if (!sKey) return null;
  const canonical = tierGet(keyTierForRemember(getSettings().remember), sKey);
  if (canonical !== null && canonical !== '') return canonical;
  const other = tierGet(keyTierForRemember(!getSettings().remember), sKey);
  return other !== null && other !== '' ? other : null;
}

/** Write to the canonical tier and scrub the other tier. */
function writeKeyCanonical(name, value, remember) {
  const sKey = storageKeyForKeyName(name);
  if (!sKey) return;
  tierSet(keyTierForRemember(remember), sKey, value);
  tierSet(keyTierForRemember(!remember), sKey, '');
  tierRemove(keyTierForRemember(!remember), sKey);
}

/** @param {'bharatcode'|'gemini'} name @returns {string|null} */
export function getKey(name) {
  return readKeyFromBothTiers(name);
}

/** @param {'bharatcode'|'gemini'} name @param {string} value */
export function setKey(name, value) {
  if (!storageKeyForKeyName(name)) {
    throw new Error(`setKey: unknown key name "${name}" (expected "bharatcode" or "gemini")`);
  }
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('setKey: value must be a non-empty string (to remove a key use clearKey)');
  }
  writeKeyCanonical(name, value.trim(), getSettings().remember);
}

/** @param {'bharatcode'|'gemini'} name */
export function clearKey(name) {
  const sKey = storageKeyForKeyName(name);
  if (!sKey) {
    throw new Error(`clearKey: unknown key name "${name}" (expected "bharatcode" or "gemini")`);
  }
  tierRemove('local', sKey);
  tierRemove('session', sKey);
}

// ---------------------------------------------------------------------------
// active notebook id
// ---------------------------------------------------------------------------

/** @returns {string|null} id of the current notebook */
export function getState() {
  return tierGet('local', CURRENT_KEY);
}

/** @param {string|null} id notebook id to make active */
export function setState(id) {
  if (id === null || id === undefined) {
    tierRemove('local', CURRENT_KEY);
    return null;
  }
  if (typeof id !== 'string' || id.trim() === '') {
    throw new Error('setState: notebook id must be a non-empty string (or null to clear)');
  }
  tierSet('local', CURRENT_KEY, id);
  return id;
}

// ---------------------------------------------------------------------------
// notebook CRUD
// ---------------------------------------------------------------------------

const NB_ROOT = 'vx2.nb.';

// Sanity: NB_ROOT must stay in sync with contracts STORAGE.notebookKey.
if (!STORAGE.notebookKey('x').startsWith(NB_ROOT)) {
  throw new Error('store.js: NB_ROOT constant drifted from contracts STORAGE.notebookKey');
}

function nbKey(id) {
  return STORAGE.notebookKey(id);
}

// ---------------------------------------------------------------------------
// v3 boundary sanitization (plan3 §6.3/§10) — applied whenever notebook JSON
// crosses from storage/import into app memory: drop legacy trace fields and
// normalize revisionPins. Pure with respect to other modules; mutates only
// the freshly parsed object handed to it.
// ---------------------------------------------------------------------------

/**
 * Remove `lesson.trace` (and everything trace-only nested inside it: code,
 * computed, result, narration, takeaway) from every lesson in a notebook.
 * Trace was removed from the product flow in v3; old Plan 2 notebooks must
 * still open, and no renderer or runner downstream may ever see trace data.
 * @param {Notebook} nb freshly parsed notebook (mutated in place)
 */
function stripLegacyTrace(nb) {
  if (!nb || typeof nb !== 'object' || !Array.isArray(nb.topics)) return;
  for (const t of nb.topics) {
    if (t && t.lesson && typeof t.lesson === 'object' && !Array.isArray(t.lesson)) {
      delete t.lesson.trace;
    }
  }
}

/**
 * Storage/import → memory boundary: strip legacy trace, then guarantee
 * `revisionPins` is a normalized ordered array of existing topic IDs
 * (legacy notebooks default to []).
 * @param {Notebook} nb freshly parsed notebook (mutated in place)
 * @returns {Notebook} the same object, sanitized
 */
function sanitizeNotebookBoundary(nb) {
  if (!nb || typeof nb !== 'object' || Array.isArray(nb)) return nb;
  stripLegacyTrace(nb);
  nb.revisionPins = normalizePins(nb.revisionPins, nb);
  return nb;
}

// ---------------------------------------------------------------------------
// revision pins (CONTRACTS Addendum v3, plan3 §10)
// ---------------------------------------------------------------------------

/**
 * PURE — no storage, no mutation of inputs. Normalize a candidate pins array
 * against a notebook's topics: drop unknown topic IDs and duplicates, keep
 * the first valid occurrence, preserve order. Anything that is not an array
 * (undefined legacy notebooks included) becomes [].
 * @param {unknown} arr candidate pin list (array of topic id strings or garbage)
 * @param {Notebook|null|undefined} notebook notebook whose topic IDs are valid
 * @returns {string[]} normalized ordered topic IDs
 */
export function normalizePins(arr, notebook) {
  if (!Array.isArray(arr)) return [];
  const validIds = new Set();
  if (notebook && Array.isArray(notebook.topics)) {
    for (const t of notebook.topics) {
      if (t && typeof t.id === 'string' && t.id.trim() !== '') validIds.add(t.id);
    }
  }
  const out = [];
  const seen = new Set();
  for (const id of arr) {
    if (typeof id !== 'string') continue;          // garbage entry → drop
    if (!validIds.has(id)) continue;               // stale/unknown topic → drop
    if (seen.has(id)) continue;                    // duplicate → keep first
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Ordered pins of one notebook, normalized on read. A missing notebook (or a
 * corrupt/unreadable entry) reads as [] — pins are never an error source for
 * the UI; the sheet just starts empty.
 * @param {string} notebookId
 * @returns {string[]}
 */
export function getPins(notebookId) {
  if (typeof notebookId !== 'string' || notebookId.trim() === '') {
    throw new Error('getPins: notebookId must be a non-empty string');
  }
  const nb = loadNotebook(notebookId);
  if (!nb) return [];
  return normalizePins(nb.revisionPins, nb);
}

function requireNotebookForPin(opName, notebookId) {
  if (typeof notebookId !== 'string' || notebookId.trim() === '') {
    throw new Error(`${opName}: notebookId must be a non-empty string`);
  }
  const nb = loadNotebook(notebookId);
  if (!nb || typeof nb !== 'object' || !Array.isArray(nb.topics)) {
    throw new Error(`${opName}: notebook "${notebookId}" not found in storage`);
  }
  return nb;
}

/**
 * Pin toggle: append the topic once if absent, remove it if present.
 * Persists through the existing saveNotebook serialization path.
 * @param {string} notebookId
 * @param {string} topicId must exist among the notebook's topics
 * @returns {string[]} the updated normalized pins array (fresh copy)
 */
export function togglePin(notebookId, topicId) {
  const nb = requireNotebookForPin('togglePin', notebookId);
  if (typeof topicId !== 'string' || topicId.trim() === '') {
    throw new Error('togglePin: topicId must be a non-empty string');
  }
  const known = nb.topics.some((t) => t && t.id === topicId);
  if (!known) {
    throw new Error(`togglePin: topic "${topicId}" is not in notebook "${nb.id}" — unknown topics cannot be pinned`);
  }
  const pins = normalizePins(nb.revisionPins, nb);
  const idx = pins.indexOf(topicId);
  if (idx === -1) pins.push(topicId); // append once
  else pins.splice(idx, 1);           // unpin
  nb.revisionPins = pins;
  saveNotebook(nb);
  return pins.slice();
}

/**
 * Reorder a pin by swapping it with its adjacent neighbor. delta = -1 moves
 * up (toward the front), +1 moves down. At a list boundary, or when the
 * topic is not currently pinned, this is a no-op that still returns the
 * current normalized pins (and persists them, keeping storage canonical).
 * @param {string} notebookId
 * @param {string} topicId
 * @param {number} delta -1 or +1
 * @returns {string[]} the pins array after the (possible) swap
 */
export function movePin(notebookId, topicId, delta) {
  const nb = requireNotebookForPin('movePin', notebookId);
  if (delta !== -1 && delta !== 1) {
    throw new Error(`movePin: delta must be -1 (up) or +1 (down), got ${JSON.stringify(delta)}`);
  }
  if (typeof topicId !== 'string' || topicId.trim() === '') {
    throw new Error('movePin: topicId must be a non-empty string');
  }
  const pins = normalizePins(nb.revisionPins, nb);
  const i = pins.indexOf(topicId);
  const j = i === -1 ? -1 : i + delta;
  if (i !== -1 && j >= 0 && j < pins.length) {
    const tmp = pins[i];
    pins[i] = pins[j];
    pins[j] = tmp;
  }
  // i === -1 (not pinned) or boundary swap → no reorder; still write the
  // normalized list back so storage and the returned array agree.
  nb.revisionPins = pins;
  saveNotebook(nb);
  return pins.slice();
}

/**
 * Persist a notebook (any object — Track C may pass a demo stub).
 * Sets it as the active notebook when it has an id.
 */
export function saveNotebook(nb) {
  if (!nb || typeof nb !== 'object') {
    throw new Error('saveNotebook: expected a Notebook object');
  }
  const id = typeof nb.id === 'string' && nb.id.trim() ? nb.id.trim() : null;
  if (!id) {
    throw new Error('saveNotebook: notebook has no usable `id`');
  }
  tierSet('local', nbKey(id), JSON.stringify(nb));
  setState(id);
  return nb;
}

/**
 * Load a notebook by id. Called with no argument, it loads the ACTIVE
 * notebook (Track C resume path).
 * @param {string} [id] notebook id; omitted/null → active notebook
 * @returns {Notebook|null} parsed notebook or null when missing/corrupt
 */
export function loadNotebook(id) {
  if (id === undefined || id === null) {
    const active = getState();
    return active ? loadNotebook(active) : null;
  }
  if (typeof id !== 'string' || id.trim() === '') {
    throw new Error('loadNotebook: id must be a non-empty string');
  }
  const raw = tierGet('local', nbKey(id));
  if (raw === null) return null;
  try {
    // Storage → memory boundary: legacy trace dropped, pins normalized
    // (sanitizeNotebookBoundary is a no-op on non-objects).
    return sanitizeNotebookBoundary(JSON.parse(raw));
  } catch (err) {
    return null; // corrupt entry — listNotebooks surfaces it as unreadable
  }
}

/** @returns {Array<{id:string, title:string, createdAt:string, unreadable:boolean}>} */
export function listNotebooks() {
  const ids = new Set();
  for (const k of tierKeys('local')) {
    if (k.startsWith(NB_ROOT)) ids.add(k.slice(NB_ROOT.length));
  }
  const out = [];
  for (const id of ids) {
    const nb = loadNotebook(id);
    if (nb && typeof nb === 'object') {
      out.push({
        id,
        title: typeof nb.title === 'string' ? nb.title : '(untitled)',
        createdAt: typeof nb.createdAt === 'string' ? nb.createdAt : '',
        unreadable: false,
      });
    } else {
      out.push({ id, title: '(unreadable notebook)', createdAt: '', unreadable: true });
    }
  }
  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id.localeCompare(b.id)));
  return out;
}

export function deleteNotebook(id) {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new Error('deleteNotebook: id must be a non-empty string');
  }
  tierRemove('local', nbKey(id));
  if (getState() === id) setState(null);
  return true;
}

/** The currently active notebook, or null. */
export function getActiveNotebook() {
  const id = getState();
  return id ? loadNotebook(id) : null;
}

// ---------------------------------------------------------------------------
// rating / after helpers (mutate + persist the active notebook)
// ---------------------------------------------------------------------------

function mutateActiveTopic(opName, topicId, field, value) {
  if (typeof topicId !== 'string' || topicId.trim() === '') {
    throw new Error(`${opName}: topicId must be a non-empty string`);
  }
  const nb = getActiveNotebook();
  if (!nb) {
    throw new Error(`${opName}: no active notebook — open or create one first`);
  }
  const topic = Array.isArray(nb.topics) ? nb.topics.find((t) => t && t.id === topicId) : null;
  if (!topic) {
    throw new Error(`${opName}: topic "${topicId}" not found in active notebook "${nb.id}"`);
  }
  topic[field] = value;
  saveNotebook(nb);
  return topic;
}

/** rating: null | "knew" | "kinda" | "lost" */
export function saveRating(topicId, rating) {
  if (rating !== null && !RATINGS.includes(rating)) {
    throw new Error(`saveRating: rating must be one of ${RATINGS.join("/")}, or null`);
  }
  return mutateActiveTopic('saveRating', topicId, 'rating', rating);
}

/** after: null | "got" | "still_lost" */
export function saveAfter(topicId, after) {
  if (after !== null && !AFTER_STATES.includes(after)) {
    throw new Error(`saveAfter: after must be one of ${AFTER_STATES.join("/")}, or null`);
  }
  return mutateActiveTopic('saveAfter', topicId, 'after', after);
}

// ---------------------------------------------------------------------------
// export / import (plan F25)
// ---------------------------------------------------------------------------

/**
 * Serialize a notebook to pretty JSON (plan F25). Addendum v3: revisionPins
 * ride along as-is (whatever ordered list the notebook carries is exported;
 * notebooks loaded/imported through this module already hold a normalized
 * one). Round-trips through importNotebook, which re-normalizes pins and
 * drops legacy trace at the boundary.
 */
export function exportNotebook(nb) {
  if (!nb || typeof nb !== 'object') {
    throw new Error('exportNotebook: expected a Notebook object');
  }
  return JSON.stringify(nb, null, 2);
}

/**
 * Validate + parse a Notebook JSON string (plan §6.2 shape).
 * Hand-rolled local validation; schema.js validators used opportunistically.
 * v3 boundary rules (plan3 §6.3/§10, Addendum v3):
 * - legacy `lesson.trace` and trace-only fields are DISCARDED before
 *   validation, so an old Plan 2 notebook with traces imports safely and
 *   trace never reaches a renderer or runner;
 * - `revisionPins` is normalized against the imported topics (unknown IDs
 *   and duplicates dropped, first valid occurrence kept, non-arrays → []);
 *   pin problems NEVER make an import throw.
 * @throws {Error} descriptive, lists every notebook-shape problem found
 */
export function importNotebook(json) {
  let obj;
  if (typeof json === 'string') {
    try {
      obj = JSON.parse(json);
    } catch (err) {
      throw new Error(`importNotebook: not valid JSON — ${err.message}`);
    }
  } else if (json && typeof json === 'object') {
    obj = json; // already parsed (e.g. fetch().json() path)
  } else {
    throw new Error('importNotebook: expected a JSON string or a Notebook object');
  }
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    stripLegacyTrace(obj); // trace is deprecated — drop it, then never re-validate it
  }
  const errors = collectNotebookErrors(obj);
  if (schemaModule && typeof schemaModule.validateLesson === 'function' && Array.isArray(obj.topics)) {
    // Opportunistic deeper check when Track A's schema.js happens to be loaded.
    // Trace-attributed complaints are ignored on purpose: trace was removed
    // from the product flow, validators accept lessons with or without it
    // (Addendum v3), and an outdated validator must not block an import
    // whose trace we were going to discard anyway.
    for (const t of obj.topics) {
      if (t && t.lesson) {
        try {
          const v = schemaModule.validateLesson(t.lesson, t.kind);
          if (v !== true && Array.isArray(v) && v.length) {
            const relevant = v.map((x) => String(x)).filter((msg) => !/\btrace\b/i.test(msg));
            if (relevant.length) {
              errors.push(`topic "${t.name}" lesson: ${relevant.join('; ')}`);
            }
          }
        } catch (err) {
          errors.push(`topic "${t.name}" lesson: schema.validateLesson threw ${err.message}`);
        }
      }
    }
  }
  if (errors.length > 0) {
    throw new Error(`importNotebook: invalid Notebook (${errors.length} problem(s)):\n  - ` +
      errors.join('\n  - '));
  }
  obj.revisionPins = normalizePins(obj.revisionPins, obj);
  return obj;
}

function isStr(v) { return typeof v === 'string'; }
function isArr(v) { return Array.isArray(v); }

/** @returns {string[]} human-readable problems with `obj` as a Notebook */
function collectNotebookErrors(obj) {
  const e = [];
  if (!obj || typeof obj !== 'object' || isArr(obj)) {
    return ['root must be an object'];
  }
  if (!isStr(obj.id) || !obj.id.trim()) e.push('id must be a non-empty string');
  if (!isStr(obj.title)) e.push('title must be a string');
  if (!isStr(obj.createdAt)) e.push('createdAt must be a string (ISO)');

  if (!obj.notes || typeof obj.notes !== 'object') {
    e.push('notes must be an object {raw, chunks}');
  } else {
    if (!isStr(obj.notes.raw)) e.push('notes.raw must be a string');
    if (!isArr(obj.notes.chunks)) {
      e.push('notes.chunks must be an array');
    } else {
      const seenChunkIds = new Set();
      obj.notes.chunks.forEach((c, i) => {
        if (!c || typeof c !== 'object') { e.push(`notes.chunks[${i}] must be an object`); return; }
        if (!isStr(c.id) || !c.id.trim()) e.push(`notes.chunks[${i}].id must be a non-empty string`);
        if (!isStr(c.text)) e.push(`notes.chunks[${i}].text must be a string`);
        if (seenChunkIds.has(c.id)) e.push(`duplicate chunk id "${c.id}"`);
        seenChunkIds.add(c.id);
      });
    }
  }

  if (!obj.syllabus || typeof obj.syllabus !== 'object') {
    e.push('syllabus must be an object {raw, source}');
  } else {
    if (!isStr(obj.syllabus.raw)) e.push('syllabus.raw must be a string');
    if (obj.syllabus.source !== 'pasted' && obj.syllabus.source !== 'auto') {
      e.push('syllabus.source must be "pasted" or "auto"');
    }
  }

  if (!obj.settings || typeof obj.settings !== 'object') {
    e.push('settings must be an object {hoursToStudy, lang}');
  } else {
    if (!Number.isFinite(obj.settings.hoursToStudy) || obj.settings.hoursToStudy <= 0) {
      e.push('settings.hoursToStudy must be a positive number');
    }
    if (obj.settings.lang !== 'en' && obj.settings.lang !== 'hinglish') {
      e.push('settings.lang must be "en" or "hinglish"');
    }
  }

  const topicIds = new Set();
  if (!isArr(obj.topics)) {
    e.push('topics must be an array');
  } else {
    obj.topics.forEach((t, i) => collectTopicErrors(t, i, e, topicIds));
  }
  // prereq id check second pass (all ids known by then)
  if (isArr(obj.topics)) {
    obj.topics.forEach((t, i) => {
      if (t && isArr(t.prereqs)) {
        t.prereqs.forEach((p) => {
          if (!isStr(p) || !topicIds.has(p)) e.push(`topics[${i}] "${t.name}": prereq "${p}" is not a topic id in this notebook`);
        });
      }
    });
  }
  return e;
}

function collectTopicErrors(t, i, e, topicIds) {
  const label = `topics[${i}]${t && isStr(t.name) ? ' "' + t.name + '"' : ''}`;
  if (!t || typeof t !== 'object' || isArr(t)) { e.push(`${label} must be an object`); return; }
  if (!isStr(t.id) || !t.id.trim()) e.push(`${label}.id must be a non-empty string`);
  else topicIds.add(t.id);
  if (!isStr(t.name) || !t.name.trim()) e.push(`${label}.name must be a non-empty string`);
  if (!isArr(t.aliases) || t.aliases.some((a) => !isStr(a))) e.push(`${label}.aliases must be an array of strings`);
  if (!isStr(t.unit)) e.push(`${label}.unit must be a string`);
  if (!TOPIC_KINDS.includes(t.kind)) e.push(`${label}.kind must be "numeric" or "conceptual"`);
  if (!Number.isInteger(t.weight) || t.weight < 1 || t.weight > 5) e.push(`${label}.weight must be an integer 1..5`);
  if (!isArr(t.prereqs) || t.prereqs.some((p) => !isStr(p))) e.push(`${label}.prereqs must be an array of strings`);

  if (!t.coverage || typeof t.coverage !== 'object') {
    e.push(`${label}.coverage must be an object {status, score, chunkIds}`);
  } else {
    if (!COVERAGE_STATUSES.includes(t.coverage.status)) e.push(`${label}.coverage.status must be covered|thin|not_found`);
    if (!Number.isFinite(t.coverage.score) || t.coverage.score < 0 || t.coverage.score > 1) {
      e.push(`${label}.coverage.score must be a number 0..1`);
    }
    if (!isArr(t.coverage.chunkIds) || t.coverage.chunkIds.some((c) => !isStr(c))) {
      e.push(`${label}.coverage.chunkIds must be an array of strings`);
    }
  }

  if (!(t.rating === null || RATINGS.includes(t.rating))) e.push(`${label}.rating must be null|knew|kinda|lost`);
  if (!(t.after === null || AFTER_STATES.includes(t.after))) e.push(`${label}.after must be null|got|still_lost`);

  if (t.lesson === null || t.lesson === undefined) {
    // valid: unrated/unbuilt topic
  } else if (typeof t.lesson !== 'object' || isArr(t.lesson)) {
    e.push(`${label}.lesson must be null or a Lesson object`);
  } else {
    collectLessonErrors(t.lesson, label, e);
  }
}

function collectLessonErrors(l, label, e) {
  const p = `${label}.lesson`;
  if (!l || typeof l !== 'object' || isArr(l)) { e.push(`${p} must be an object`); return; }
  if (!isStr(l.oneLiner)) e.push(`${p}.oneLiner must be a string`);
  if (!isStr(l.why)) e.push(`${p}.why must be a string`);
  if (!isStr(l.analogy)) e.push(`${p}.analogy must be a string`);
  for (const field of ['steps', 'pitfalls']) {
    if (!isArr(l[field])) { e.push(`${p}.${field} must be an array`); continue; }
    if (field === 'steps' && l.steps.length > 5) e.push(`${p}.steps must have ≤5 entries`);
    l[field].forEach((s, i) => {
      if (!s || typeof s !== 'object') { e.push(`${p}.${field}[${i}] must be an object`); return; }
      if (!isStr(s.text)) e.push(`${p}.${field}[${i}].text must be a string`);
      if (!LESSON_SOURCES.includes(s.source)) e.push(`${p}.${field}[${i}].source must be "notes" or "vertex"`);
      if (!isArr(s.chunkIds) || s.chunkIds.some((c) => !isStr(c))) e.push(`${p}.${field}[${i}].chunkIds must be an array of strings`);
    });
  }
  if (!isArr(l.notesGaps) || l.notesGaps.some((g) => !isStr(g))) e.push(`${p}.notesGaps must be an array of strings`);

  // v3 (plan3 §6.3): `trace` is deprecated and already DISCARDED by
  // importNotebook's boundary pass before validation runs, so there is no
  // trace-specific check left here — an absent or formerly-present trace
  // never blocks an import.

  if (!(l.diagramMermaid === null || l.diagramMermaid === undefined || isStr(l.diagramMermaid))) {
    e.push(`${p}.diagramMermaid must be null or a string`);
  }
  if (!l.examQuestion || typeof l.examQuestion !== 'object' ||
      !isStr(l.examQuestion.q) || !isStr(l.examQuestion.modelAnswer) ||
      !LESSON_SOURCES.includes(l.examQuestion.source)) {
    e.push(`${p}.examQuestion must be {q, modelAnswer, source:"notes"|"vertex"}`);
  }
  if (!l.meta || typeof l.meta !== 'object' ||
      !isStr(l.meta.provider) || !isStr(l.meta.model) || !isStr(l.meta.at)) {
    e.push(`${p}.meta must be {provider, model, at}`);
  }
}

// ---------------------------------------------------------------------------
// demo notebook (judge path — never touches llm; plan §8)
// ---------------------------------------------------------------------------

const DEMO_URL = 'demo/numopt.notebook.json';

/**
 * Load the baked demo notebook (judge path — zero model requests) and make
 * it active. Demo isolation (plan3 §10, Addendum v3):
 * - the demo keeps its own notebook id (the baked JSON's `id`), separate
 *   from every user notebook — nothing else is read or written here;
 * - FIRST open (no stored demo under that id): revisionPins initialized to
 *   [] — the demo starts with zero pins even if the baked JSON carries any;
 * - REOPEN (stored demo exists, e.g. after pins were made): fresh curated
 *   content is served, but the stored demo pins are RESTORED (normalized
 *   against the fresh topic ids);
 * - reset/delete of the demo id only ever affects that id; user notebooks
 *   keep their own notes, selections and pins.
 * @returns {Promise<Notebook>} fetches and validates the baked demo notebook
 */
export async function loadDemoNotebook() {
  await ensureSchema(); // opportunistic deeper validation; safe if it fails
  if (typeof fetch !== 'function') {
    throw new Error('Demo notebook unavailable: this environment has no fetch(). Serve the app over http (e.g. python -m http.server) and retry.');
  }
  let res;
  try {
    res = await fetch(DEMO_URL, { cache: 'no-store' });
  } catch (err) {
    throw new Error(`Demo notebook unavailable: could not load ${DEMO_URL} (${err.message}). Check the file exists and the site is served over http — or paste your own notes instead.`);
  }
  if (!res.ok) {
    throw new Error(`Demo notebook unavailable: ${DEMO_URL} returned HTTP ${res.status}. The demo file may not be deployed yet — paste your own notes instead.`);
  }
  let text;
  try {
    text = await res.text();
  } catch (err) {
    throw new Error(`Demo notebook unavailable: failed reading ${DEMO_URL} (${err.message}).`);
  }
  let nb;
  try {
    nb = importNotebook(text);
  } catch (err) {
    throw new Error(`Demo notebook unavailable: the baked demo file is invalid. ${err.message}`);
  }
  // Pin policy for the demo namespace: fresh curated content every open,
  // pins only ever initialized (first open) or restored (reopened).
  const storedDemo = loadNotebook(nb.id);
  nb.revisionPins = storedDemo ? normalizePins(storedDemo.revisionPins, nb) : [];
  saveNotebook(nb); // becomes the active notebook (also useful as Track C dev stub)
  return nb;
}

// ---------------------------------------------------------------------------
// public surface object
// ---------------------------------------------------------------------------

export const store = {
  storageInfo,
  getState,
  setState,
  getActiveNotebook,
  saveNotebook,
  loadNotebook,
  listNotebooks,
  deleteNotebook,
  getSettings,
  setSettings,
  getKey,
  setKey,
  clearKey,
  exportNotebook,
  importNotebook,
  loadDemoNotebook,
  saveRating,
  saveAfter,
  normalizePins,
  getPins,
  togglePin,
  movePin,
};

export default store;
