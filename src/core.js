/**
 * core.js — pure domain helpers. No DOM, no storage.
 * The self-check imports this file in Node, so keep it browser-free.
 */

export const COVERAGE_STATUSES = ['covered', 'thin', 'not_found'];

export const STATUS_META = {
  covered: { label: 'Explained', icon: 'check', short: 'Explained' },
  thin: { label: 'Only mentioned', icon: 'dash', short: 'Mentioned' },
  not_found: { label: 'No match found', icon: 'search', short: 'Missing' },
};

export const SESSION_TYPES = [
  { id: 'concept', label: 'Understand concept' },
  { id: 'numerical', label: 'Solve numerical problems' },
  { id: 'formulas', label: 'Revise formulas' },
  { id: 'exam', label: 'Practice examination questions' },
  { id: 'gaps', label: 'Review missing coverage' },
];

export const SESSION_TYPE_LABEL = Object.fromEntries(SESSION_TYPES.map((t) => [t.id, t.label]));

export function isValidTopicId(notebook, id) {
  return !!notebook && Array.isArray(notebook.topics) && notebook.topics.some((t) => t && t.id === id);
}

/** Drop unknown ids and duplicates, keep first occurrence and order. */
export function normalizePins(arr, notebook) {
  const valid = new Set((notebook && Array.isArray(notebook.topics) ? notebook.topics : [])
    .map((t) => t && t.id).filter(Boolean));
  const seen = new Set();
  const out = [];
  for (const id of Array.isArray(arr) ? arr : []) {
    if (typeof id !== 'string' || !valid.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Stable id for a pin point (topic + text). */
export function pinId(topicId, text, kind = 'point') {
  let hash = 0;
  const s = `${topicId}|${kind}|${String(text || '')}`;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  return `pin-${topicId}-${Math.abs(hash).toString(36)}`;
}

export function normalizePinPoints(arr, notebook) {
  const seen = new Set();
  const out = [];
  for (const p of Array.isArray(arr) ? arr : []) {
    if (!p || typeof p !== 'object') continue;
    if (!isValidTopicId(notebook, p.topicId)) continue;
    const text = typeof p.text === 'string' ? p.text.trim() : '';
    if (!text) continue;
    const id = typeof p.id === 'string' && p.id.trim() ? p.id.trim() : pinId(p.topicId, text, p.kind);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      topicId: p.topicId,
      text,
      equation: typeof p.equation === 'string' ? p.equation : '',
      source: p.source === 'notes' ? 'notes' : 'vertex',
      chunkIds: Array.isArray(p.chunkIds) ? p.chunkIds.filter((c) => typeof c === 'string') : [],
      kind: p.kind === 'formula' ? 'formula' : 'point',
      createdAt: typeof p.createdAt === 'string' ? p.createdAt : new Date().toISOString(),
    });
  }
  return out;
}

/** Add a pin point unless the same topic/text/kind already exists. */
export function addPinPoint(points, point, notebook) {
  const normalized = normalizePinPoints(points, notebook);
  const candidate = normalizePinPoints([point], notebook)[0];
  if (!candidate) return { points: normalized, added: false };
  if (normalized.some((p) => p.id === candidate.id)) return { points: normalized, added: false };
  normalized.push(candidate);
  return { points: normalized, added: true };
}

export function removePinPoint(points, id) {
  return (Array.isArray(points) ? points : []).filter((p) => p && p.id !== id);
}

export function movePinPoint(points, id, delta) {
  const list = (Array.isArray(points) ? points : []).slice();
  const i = list.findIndex((p) => p && p.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return list;
  [list[i], list[j]] = [list[j], list[i]];
  return list;
}

/* -------------------------------------------------------------------------- */
/* calendar                                                                    */
/* -------------------------------------------------------------------------- */

export function localDateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDateKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function normalizeCalendar(arr, notebook) {
  const out = [];
  const seen = new Set();
  for (const ev of Array.isArray(arr) ? arr : []) {
    if (!ev || typeof ev !== 'object') continue;
    if (!isValidTopicId(notebook, ev.topicId)) continue;
    const date = parseDateKey(ev.date) ? ev.date : null;
    if (!date) continue;
    const id = typeof ev.id === 'string' && ev.id ? ev.id : `ev-${date}-${ev.topicId}-${out.length}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      topicId: ev.topicId,
      date,
      start: /^\d{2}:\d{2}$/.test(ev.start || '') ? ev.start : '18:00',
      duration: Math.min(240, Math.max(10, Number(ev.duration) || 45)),
      type: SESSION_TYPE_LABEL[ev.type] ? ev.type : 'concept',
      priority: [1, 2, 3].includes(ev.priority) ? ev.priority : 2,
      notes: typeof ev.notes === 'string' ? ev.notes : '',
      done: ev.done === true,
    });
  }
  return out.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

/** Priority score for suggestions — explained in the UI, never called AI. */
export function priorityScore(topic) {
  const statusBoost = { not_found: 3, thin: 2, covered: 1 }[topic?.coverage?.status] || 2;
  const weight = Math.min(5, Math.max(1, Number(topic?.weight) || 3));
  const userPriority = Math.min(3, Math.max(1, Number(topic?.studyPriority) || 2));
  const ratingBoost = topic?.rating === 'lost' ? 2 : topic?.rating === 'kinda' ? 1 : topic?.rating === 'knew' ? -1 : 0;
  return weight * 2 + statusBoost + userPriority + ratingBoost;
}

export function priorityReason(topic, byId) {
  const status = topic?.coverage?.status;
  const bits = [];
  if (status === 'not_found') bits.push('no matching passage in your notes');
  else if (status === 'thin') bits.push('your notes only mention it');
  else bits.push('explained in your notes');
  bits.push(`exam weight ${topic?.weight || 3}/5`);
  const prereqs = (topic?.prereqs || []).map((id) => byId?.get(id)).filter(Boolean);
  if (prereqs.length) bits.push(`builds on ${prereqs.map((p) => p.name).join(', ')}`);
  if (topic?.studyPriority === 3) bits.push('you marked this as high priority');
  if (topic?.studyPriority === 1) bits.push('you marked this as low priority');
  if (topic?.rating === 'lost') bits.push('you marked this as lost');
  return bits.join(' · ');
}

export function plannedMinutes(events) {
  return (Array.isArray(events) ? events : []).reduce((n, e) => n + (Number(e.duration) || 0), 0);
}

export function completedMinutes(events) {
  return (Array.isArray(events) ? events : []).filter((e) => e.done).reduce((n, e) => n + (Number(e.duration) || 0), 0);
}

export function sessionMinutes(sessions) {
  return (Array.isArray(sessions) ? sessions : []).reduce((n, s) => n + (Number(s.minutes) || 0), 0);
}

export function formatMinutes(min) {
  const m = Math.max(0, Math.round(Number(min) || 0));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (!h) return `${rest} min`;
  if (!rest) return `${h} hr`;
  return `${h} hr ${rest} min`;
}

export function daysUntil(dateKey, from = new Date()) {
  const d = parseDateKey(dateKey);
  if (!d) return null;
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.round((d - a) / 86400000);
}

export function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

export function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, Number(n) || 0));
}
