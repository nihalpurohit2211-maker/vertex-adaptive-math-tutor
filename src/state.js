/**
 * state.js — local-first persistence. Profiles, notebooks, keys, pins,
 * calendar events, study sessions and progress. Every storage call is
 * guarded; a memory tier keeps the app usable when storage is blocked.
 */
import {
  normalizePins, normalizePinPoints, addPinPoint, removePinPoint, movePinPoint,
  normalizeCalendar, uid, localDateKey,
} from './core.js';
import { seedDemoNotebook } from './seed.js';

const P = 'vx3.';
const memory = { local: new Map(), session: new Map() };
const info = { checked: false, local: false, session: false };

function probe() {
  if (info.checked) return;
  info.checked = true;
  try {
    localStorage.setItem(P + '__probe', '1');
    localStorage.removeItem(P + '__probe');
    info.local = true;
  } catch { /* blocked → memory tier */ }
  try {
    sessionStorage.setItem(P + '__probe', '1');
    sessionStorage.removeItem(P + '__probe');
    info.session = true;
  } catch { /* blocked → memory tier */ }
}

export function storageInfo() {
  probe();
  return { local: info.local, session: info.session };
}

function get(tier, key) {
  probe();
  if (tier === 'local' && info.local) {
    try { return localStorage.getItem(key); } catch { info.local = false; }
  }
  if (tier === 'session' && info.session) {
    try { return sessionStorage.getItem(key); } catch { info.session = false; }
  }
  return memory[tier].has(key) ? memory[tier].get(key) : null;
}

function set(tier, key, value) {
  probe();
  if (tier === 'local' && info.local) {
    try { localStorage.setItem(key, value); return; } catch { info.local = false; }
  }
  if (tier === 'session' && info.session) {
    try { sessionStorage.setItem(key, value); return; } catch { info.session = false; }
  }
  memory[tier].set(key, value);
}

function remove(tier, key) {
  probe();
  if (tier === 'local' && info.local) {
    try { localStorage.removeItem(key); } catch { info.local = false; }
  }
  if (tier === 'session' && info.session) {
    try { sessionStorage.removeItem(key); } catch { info.session = false; }
  }
  memory[tier].delete(key);
}

function localKeys() {
  probe();
  const keys = new Set();
  if (info.local) {
    try {
      for (let i = 0; i < localStorage.length; i++) keys.add(localStorage.key(i));
    } catch { info.local = false; }
  }
  for (const k of memory.local.keys()) keys.add(k);
  return [...keys];
}

function readJSON(key, fallback) {
  const raw = get('local', key);
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

function writeJSON(key, value) {
  set('local', key, JSON.stringify(value));
}

/* -------------------------------------------------------------------------- */
/* settings + keys                                                             */
/* -------------------------------------------------------------------------- */

const DEFAULT_SETTINGS = Object.freeze({
  hoursToStudy: 3,
  lang: 'en',
  provider: 'off',
  model: 'gpt-4o-mini',
  remember: false,
});

export function getSettings() {
  const stored = readJSON(P + 'settings', null);
  const out = { ...DEFAULT_SETTINGS };
  if (stored && typeof stored === 'object') {
    if (Number.isFinite(stored.hoursToStudy) && stored.hoursToStudy > 0) out.hoursToStudy = stored.hoursToStudy;
    if (stored.lang === 'en' || stored.lang === 'hinglish') out.lang = stored.lang;
    if (['off', 'openai', 'anthropic', 'gemini'].includes(stored.provider)) out.provider = stored.provider;
    if (typeof stored.model === 'string' && stored.model.trim()) out.model = stored.model.trim();
    if (typeof stored.remember === 'boolean') out.remember = stored.remember;
  }
  return out;
}

export function setSettings(patch) {
  const next = { ...getSettings(), ...(patch && typeof patch === 'object' ? patch : {}) };
  if (!['off', 'openai', 'anthropic', 'gemini'].includes(next.provider)) next.provider = 'off';
  if (!Number.isFinite(next.hoursToStudy) || next.hoursToStudy <= 0) next.hoursToStudy = 3;
  writeJSON(P + 'settings', next);
  return next;
}

const KEY_NAMES = ['openai', 'anthropic', 'gemini'];

function keyName(provider) {
  if (!KEY_NAMES.includes(provider)) throw new Error('Unknown provider key');
  return P + 'key.' + provider;
}

export function getKey(provider) {
  if (!KEY_NAMES.includes(provider)) return null;
  const k = keyName(provider);
  const canonical = get(getSettings().remember ? 'local' : 'session', k);
  if (canonical) return canonical;
  return get(getSettings().remember ? 'session' : 'local', k) || null;
}

export function setKey(provider, value) {
  const k = keyName(provider);
  const remember = getSettings().remember;
  set(remember ? 'local' : 'session', k, value);
  remove(remember ? 'session' : 'local', k);
}

export function clearKey(provider) {
  if (!KEY_NAMES.includes(provider)) return;
  remove('local', keyName(provider));
  remove('session', keyName(provider));
}

export function hasKey(provider) {
  return !!getKey(provider);
}

/* -------------------------------------------------------------------------- */
/* profiles                                                                    */
/* -------------------------------------------------------------------------- */

export function getProfiles() {
  const list = readJSON(P + 'profiles', []);
  return Array.isArray(list) ? list.filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string') : [];
}

export function createProfile(name, avatar = '◆') {
  const clean = String(name || '').trim().slice(0, 40);
  if (!clean) throw new Error('Enter a display name first.');
  const profiles = getProfiles();
  const profile = {
    id: uid('profile'),
    name: clean,
    avatar: String(avatar || '◆').slice(0, 2),
    createdAt: new Date().toISOString(),
  };
  profiles.push(profile);
  writeJSON(P + 'profiles', profiles);
  setActiveProfile(profile.id);
  return profile;
}

export function updateProfile(id, patch) {
  const profiles = getProfiles();
  const p = profiles.find((x) => x.id === id);
  if (!p) return null;
  if (typeof patch.name === 'string' && patch.name.trim()) p.name = patch.name.trim().slice(0, 40);
  if (typeof patch.avatar === 'string' && patch.avatar.trim()) p.avatar = patch.avatar.trim().slice(0, 2);
  writeJSON(P + 'profiles', profiles);
  return p;
}

export function deleteProfile(id) {
  const profiles = getProfiles().filter((p) => p.id !== id);
  writeJSON(P + 'profiles', profiles);
  for (const nb of listNotebooks()) {
    if (nb.owner === id) removeNotebook(nb.id);
  }
  if (getActiveProfile()?.id === id) setActiveProfile(profiles[0]?.id || null);
  return profiles;
}

export function getActiveProfile() {
  const id = get('local', P + 'activeProfile');
  if (!id) return null;
  return getProfiles().find((p) => p.id === id) || null;
}

export function setActiveProfile(id) {
  if (id) set('local', P + 'activeProfile', id);
  else remove('local', P + 'activeProfile');
}

/* -------------------------------------------------------------------------- */
/* notebooks                                                                   */
/* -------------------------------------------------------------------------- */

function nbKey(id) { return P + 'nb.' + id; }

export function listNotebooks() {
  const out = [];
  for (const k of localKeys()) {
    if (!k.startsWith(P + 'nb.')) continue;
    const id = k.slice((P + 'nb.').length);
    if (id === 'last') continue;
    const nb = getNotebook(id);
    if (!nb) continue;
    out.push({
      id: nb.id,
      title: nb.title || 'Untitled workspace',
      createdAt: nb.createdAt || '',
      owner: nb.owner || null,
      kind: nb.kind || 'user',
      topics: Array.isArray(nb.topics) ? nb.topics.length : 0,
    });
  }
  return out.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '') || a.id.localeCompare(b.id));
}

export function listUserNotebooks(profileId = getActiveProfile()?.id) {
  return listNotebooks().filter((n) => n.kind !== 'demo' && (!profileId || n.owner === profileId));
}

export function getNotebook(id) {
  if (!id) return null;
  const nb = readJSON(nbKey(id), null);
  if (!nb || typeof nb !== 'object' || !Array.isArray(nb.topics)) return null;
  nb.revisionPins = normalizePins(nb.revisionPins, nb);
  nb.pinPoints = normalizePinPoints(nb.pinPoints, nb);
  nb.calendar = normalizeCalendar(nb.calendar, nb);
  nb.sessions = Array.isArray(nb.sessions) ? nb.sessions.filter((s) => s && typeof s.at === 'string') : [];
  nb.opened = Array.isArray(nb.opened) ? nb.opened.filter((o) => o && typeof o.topicId === 'string') : [];
  nb.practice = Array.isArray(nb.practice) ? nb.practice.filter((p) => p && typeof p.topicId === 'string') : [];
  return nb;
}

export function saveNotebook(nb) {
  if (!nb || typeof nb !== 'object' || !nb.id) throw new Error('Notebook needs an id');
  nb.revisionPins = normalizePins(nb.revisionPins, nb);
  nb.pinPoints = normalizePinPoints(nb.pinPoints, nb);
  nb.calendar = normalizeCalendar(nb.calendar, nb);
  writeJSON(nbKey(nb.id), nb);
  set('local', P + 'current', nb.id);
  return nb;
}

export function setCurrent(id) {
  if (id) set('local', P + 'current', id);
  else remove('local', P + 'current');
}

export function getActiveNotebook() {
  const id = get('local', P + 'current');
  return id ? getNotebook(id) : null;
}

export function removeNotebook(id) {
  remove('local', nbKey(id));
  if (get('local', P + 'current') === id) remove('local', P + 'current');
}

export function createNotebook({ title, notesRaw, syllabusRaw, topics, hours, lang = 'en', examDate = '', owner = getActiveProfile()?.id || null }) {
  const now = new Date().toISOString();
  const nb = {
    id: uid('nb'),
    title: String(title || 'My revision workspace').slice(0, 80),
    createdAt: now,
    owner,
    kind: 'user',
    examDate: examDate || '',
    notes: { raw: String(notesRaw || ''), chunks: [] },
    syllabus: { raw: String(syllabusRaw || ''), source: syllabusRaw && syllabusRaw.trim() ? 'pasted' : 'auto' },
    settings: { hoursToStudy: Number(hours) || 3, lang },
    topics: Array.isArray(topics) ? topics : [],
    revisionPins: [],
    pinPoints: [],
    calendar: [],
    sessions: [],
    opened: [],
    practice: [],
    progress: [],
  };
  saveNotebook(nb);
  return nb;
}

/* -------------------------------------------------------------------------- */
/* demo                                                                        */
/* -------------------------------------------------------------------------- */

export async function loadDemoNotebook() {
  const res = await fetch('demo/numopt.notebook.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Demo notebook returned HTTP ${res.status}`);
  const fresh = await res.json();
  if (!fresh || !Array.isArray(fresh.topics)) throw new Error('Demo notebook is malformed');
  const stored = getNotebook(fresh.id);
  const demo = seedDemoNotebook(fresh);
  if (stored) {
    demo.revisionPins = stored.revisionPins;
    demo.pinPoints = stored.pinPoints;
    demo.calendar = stored.calendar;
    demo.sessions = stored.sessions;
    demo.opened = stored.opened;
    demo.practice = stored.practice;
    demo.progress = stored.progress;
  }
  demo.owner = 'demo';
  demo.kind = 'demo';
  saveNotebook(demo);
  return demo;
}

export function exitDemo() {
  const current = getActiveNotebook();
  if (current && current.kind === 'demo') {
    const own = listUserNotebooks();
    setCurrent(own[0]?.id || null);
  }
}

/* -------------------------------------------------------------------------- */
/* derived records                                                             */
/* -------------------------------------------------------------------------- */

export function toggleTopicPin(nb, topicId) {
  const pins = normalizePins(nb.revisionPins, nb);
  const i = pins.indexOf(topicId);
  if (i === -1) pins.push(topicId);
  else pins.splice(i, 1);
  nb.revisionPins = pins;
  saveNotebook(nb);
  return pins;
}

export function moveTopicPin(nb, topicId, delta) {
  const pins = normalizePins(nb.revisionPins, nb);
  const i = pins.indexOf(topicId);
  const j = i + delta;
  if (i >= 0 && j >= 0 && j < pins.length) [pins[i], pins[j]] = [pins[j], pins[i]];
  nb.revisionPins = pins;
  saveNotebook(nb);
  return pins;
}

export function addPoint(nb, point) {
  const result = addPinPoint(nb.pinPoints, point, nb);
  nb.pinPoints = result.points;
  if (result.added) saveNotebook(nb);
  return result;
}

export function removePoint(nb, id) {
  nb.pinPoints = removePinPoint(nb.pinPoints, id);
  saveNotebook(nb);
  return nb.pinPoints;
}

export function movePoint(nb, id, delta) {
  nb.pinPoints = movePinPoint(nb.pinPoints, id, delta);
  saveNotebook(nb);
  return nb.pinPoints;
}

export function markOpened(nb, topicId) {
  nb.opened = [
    { topicId, at: new Date().toISOString() },
    ...(Array.isArray(nb.opened) ? nb.opened : []).filter((o) => o.topicId !== topicId),
  ].slice(0, 20);
  saveNotebook(nb);
}

export function recentTopics(nb, count = 3) {
  if (!nb) return [];
  const byId = new Map(nb.topics.map((t) => [t.id, t]));
  return (nb.opened || []).map((o) => byId.get(o.topicId)).filter(Boolean).slice(0, count);
}

export function addEvent(nb, event) {
  const next = { ...event, id: event.id || uid('ev') };
  nb.calendar = normalizeCalendar([...(nb.calendar || []), next], nb);
  saveNotebook(nb);
  return nb.calendar;
}

export function updateEvent(nb, id, patch) {
  nb.calendar = normalizeCalendar((nb.calendar || []).map((e) => (e.id === id ? { ...e, ...patch } : e)), nb);
  saveNotebook(nb);
  return nb.calendar;
}

export function removeEvent(nb, id) {
  nb.calendar = normalizeCalendar((nb.calendar || []).filter((e) => e.id !== id), nb);
  nb.sessions = (nb.sessions || []).filter((s) => s.eventId !== id);
  saveNotebook(nb);
  return nb.calendar;
}

export function toggleEventDone(nb, id) {
  const ev = (nb.calendar || []).find((e) => e.id === id);
  if (!ev) return nb.calendar;
  updateEvent(nb, id, { done: !ev.done });
  if (!ev.done) {
    nb.sessions = [
      ...(nb.sessions || []).filter((s) => s.eventId !== id),
      { id: uid('session'), eventId: id, topicId: ev.topicId, minutes: ev.duration, date: ev.date, at: new Date().toISOString() },
    ];
  } else {
    nb.sessions = (nb.sessions || []).filter((s) => s.eventId !== id);
  }
  saveNotebook(nb);
  return nb.calendar;
}

export function logPractice(nb, record) {
  nb.practice = [{ id: uid('practice'), at: new Date().toISOString(), ...record }, ...(nb.practice || [])].slice(0, 60);
  saveNotebook(nb);
  return nb.practice;
}

export function recordProgress(nb) {
  const covered = nb.topics.filter((t) => t.coverage?.status === 'covered').length;
  nb.progress = [...(nb.progress || []), { at: new Date().toISOString(), covered, total: nb.topics.length }].slice(-40);
  saveNotebook(nb);
  return nb.progress;
}

/* -------------------------------------------------------------------------- */
/* import / export                                                             */
/* -------------------------------------------------------------------------- */

export function exportNotebook(nb) {
  return JSON.stringify(nb, null, 2);
}

export function importNotebook(text) {
  let obj;
  try { obj = JSON.parse(text); } catch { throw new Error('That file is not valid JSON.'); }
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.topics) || !obj.notes || !Array.isArray(obj.notes.chunks)) {
    throw new Error('That JSON is not a Vertex notebook.');
  }
  if (!obj.id || typeof obj.id !== 'string') obj.id = uid('nb');
  if (listNotebooks().some((n) => n.id === obj.id)) obj.id = uid('nb');
  obj.owner = getActiveProfile()?.id || null;
  obj.kind = 'user';
  obj.revisionPins = normalizePins(obj.revisionPins, obj);
  obj.pinPoints = normalizePinPoints(obj.pinPoints, obj);
  obj.calendar = normalizeCalendar(obj.calendar, obj);
  obj.sessions = Array.isArray(obj.sessions) ? obj.sessions : [];
  obj.opened = Array.isArray(obj.opened) ? obj.opened : [];
  obj.practice = Array.isArray(obj.practice) ? obj.practice : [];
  saveNotebook(obj);
  return obj;
}

export function todayKey() {
  return localDateKey(new Date());
}
