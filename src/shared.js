/** shared.js — small view helpers used across workspaces. */
import { localLesson } from './services.js';
import { saveNotebook, recentTopics as stateRecent } from './state.js';
import { daysUntil, formatMinutes, pct, priorityScore } from './core.js';

export function topicById(notebook) {
  return new Map((notebook?.topics || []).map((t) => [t.id, t]));
}

export function coverageCounts(notebook) {
  const topics = notebook?.topics || [];
  const count = (s) => topics.filter((t) => t.coverage?.status === s).length;
  return { covered: count('covered'), thin: count('thin'), missing: count('not_found'), total: topics.length };
}

export function ensureLesson(notebook, topic) {
  if (!topic) return null;
  if (!topic.lesson) {
    topic.lesson = localLesson(topic, notebook);
    saveNotebook(notebook);
  }
  return topic.lesson;
}

export function statusLabel(status) {
  return status === 'covered' ? 'Explained' : status === 'thin' ? 'Only mentioned' : 'No match found';
}

export function examInfo(notebook) {
  if (!notebook?.examDate) return null;
  const days = daysUntil(notebook.examDate);
  return {
    date: notebook.examDate,
    days,
    label: days === null ? '' : days > 1 ? `${days} days` : days === 1 ? 'Tomorrow' : days === 0 ? 'Today' : `${Math.abs(days)} days ago`,
  };
}

export function plannedFutureMinutes(notebook) {
  const today = new Date();
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return (notebook?.calendar || []).filter((e) => !e.done && e.date >= key).reduce((n, e) => n + e.duration, 0);
}

export function priorityTopics(notebook) {
  const byId = topicById(notebook);
  return [...(notebook?.topics || [])]
    .sort((a, b) => priorityScore(b) - priorityScore(a))
    .slice(0, 5)
    .map((t) => ({ topic: t, prereqs: (t.prereqs || []).map((id) => byId.get(id)).filter(Boolean) }));
}

export function recentTopics(notebook, count = 3) {
  return stateRecent(notebook, count);
}

export function unitGroups(notebook) {
  const groups = new Map();
  for (const t of notebook?.topics || []) {
    const unit = t.unit || 'General';
    if (!groups.has(unit)) groups.set(unit, []);
    groups.get(unit).push(t);
  }
  return groups;
}

export function formatDateLong(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || '');
  if (!m) return key || '';
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    .toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatDateShort(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || '');
  if (!m) return key || '';
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    .toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function relativeTime(iso) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Date.now() - then;
  const hours = Math.round(diff / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export { daysUntil, formatMinutes, pct };
