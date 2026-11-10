/**
 * vertex-plan — deterministic study plan + sheet selection (plan §6.5).
 * Pure module: never mutates the notebook, no DOM, no browser APIs.
 */

import { DEFAULTS } from "./contracts.js";

// ---- Tunable plan constants (plan §6.5) -------------------------------------
export const GAP_BY_RATING = { lost: 1.0, kinda: 0.6, null: 0.6, knew: 0.1 };
export const NOTES_BOOST = { not_found: 0.3, thin: 0.15, covered: 0 };
export const MINUTES_MIN = 5;
export const MINUTES_MAX = 20;
export const SHEET_MAX_TOPICS = 6;
export const MIN_WEIGHT = 1;

/** gap value for a rating (null/unknown rating counts as unrated → 0.6). */
function gapOf(rating) {
  if (rating === "knew" || rating === "kinda" || rating === "lost") return GAP_BY_RATING[rating];
  return GAP_BY_RATING.null;
}

/** notesBoost value for a coverage status (unknown status → no boost). */
function boostOf(status) {
  return Object.prototype.hasOwnProperty.call(NOTES_BOOST, status) ? NOTES_BOOST[status] : 0;
}

function clampMinutes(v) {
  return Math.min(MINUTES_MAX, Math.max(MINUTES_MIN, Math.round(v)));
}

/**
 * Sort topics by priority desc with prerequisite pull-ahead (DFS topological
 * ordering). Cycles in prereqs are detected and tolerated (the back edge is
 * skipped), so the function always terminates.
 */
export function topoOrderByPriority(topics, priorityById) {
  const byId = new Map(topics.map((t) => [t.id, t]));
  const orderedIds = topics
    .map((t) => t.id)
    .sort((a, b) => (priorityById[b] - priorityById[a]) || (a < b ? -1 : a > b ? 1 : 0));

  const visited = new Set();
  const inStack = new Set();
  const ordered = [];
  const visit = (id) => {
    if (visited.has(id)) return;
    if (inStack.has(id)) return; // cycle: tolerate by ignoring the back edge
    inStack.add(id);
    const topic = byId.get(id);
    const prereqs = Array.isArray(topic?.prereqs) ? topic.prereqs : [];
    for (const pid of prereqs) {
      if (byId.has(pid)) visit(pid);
    }
    inStack.delete(id);
    visited.add(id);
    ordered.push(id);
  };
  for (const id of orderedIds) visit(id);
  return ordered;
}

/**
 * Build the crash-course plan from a notebook per plan §6.5:
 * priority = weight × (gap + notesBoost); topological order; minutes clamped to
 * 5..20; budget fill → fits/ifTime; sheet = rating≠knew && after≠got (≤6);
 * prereq warnings for "lost" topics with non-"knew" prereqs (prereq moved first).
 */
export function buildPlan(notebook) {
  const topics = Array.isArray(notebook?.topics) ? notebook.topics : [];
  const result = {
    ordered: [],
    minutesById: {},
    fits: [],
    ifTime: [],
    sheetIds: [],
    prereqWarnings: [],
  };
  if (topics.length === 0) return result;

  const hours = Number(notebook?.settings?.hoursToStudy);
  const budgetMin = Math.max(0, (Number.isFinite(hours) && hours > 0 ? hours : DEFAULTS.hoursToStudy) * 60);

  const priorityById = {};
  for (const t of topics) {
    const weight = Number.isFinite(t.weight) ? Math.max(MIN_WEIGHT, t.weight) : MIN_WEIGHT;
    const gap = gapOf(t.rating ?? null);
    const boost = boostOf(t?.coverage?.status);
    priorityById[t.id] = weight * (gap + boost);
  }
  const sumPriority = Object.values(priorityById).reduce((a, b) => a + b, 0);

  const ordered = topoOrderByPriority(topics, priorityById);
  const minutesById = {};
  for (const id of ordered) {
    const p = sumPriority > 0 ? priorityById[id] / sumPriority : 1 / ordered.length;
    minutesById[id] = clampMinutes(budgetMin * p);
  }

  const fits = [];
  const ifTime = [];
  let used = 0;
  let overflowing = false;
  for (const id of ordered) {
    if (!overflowing && used + minutesById[id] <= budgetMin) {
      fits.push(id);
      used += minutesById[id];
    } else {
      overflowing = true;
      ifTime.push(id);
    }
  }

  const byPriorityDesc = ordered
    .slice()
    .sort((a, b) => (priorityById[b] - priorityById[a]) || (a < b ? -1 : a > b ? 1 : 0));
  const sheetIds = byPriorityDesc
    .filter((id) => {
      const t = topics.find((x) => x.id === id);
      return t && t.rating !== "knew" && t.after !== "got";
    })
    .slice(0, SHEET_MAX_TOPICS);

  const prereqWarnings = [];
  const byId = new Map(topics.map((t) => [t.id, t]));
  const moveToFront = (id) => {
    const idx = ordered.indexOf(id);
    if (idx > 0) {
      ordered.splice(idx, 1);
      ordered.unshift(id);
    }
  };
  for (const id of ordered) {
    const t = byId.get(id);
    if (t.rating !== "lost") continue;
    for (const pid of Array.isArray(t.prereqs) ? t.prereqs : []) {
      const pre = byId.get(pid);
      if (!pre || pre.rating === "knew") continue;
      prereqWarnings.push({ topicId: id, prereqId: pid });
      moveToFront(pid);
    }
  }

  return { ordered, minutesById, fits, ifTime, sheetIds, prereqWarnings };
}
