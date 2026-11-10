/**
 * vertex-schema — JSON repair, section 6.2 validators and citation enforcement (plan 6.6).
 * Pure module: no DOM, no browser APIs.
 */

import { COVERAGE_STATUSES, DEFAULTS, LESSON_SOURCES, TOPIC_KINDS } from "./contracts.js";
import { contentWords } from "./chunk.js";

// ---- JSON repair (used by llm.js) -------------------------------------------

/** Remove think-blocks (closed and stray opening tags) from a model reply. */
export function stripThink(s) {
  let out = String(s ?? "");
  out = out.replace(/<\s*think\s*>[\s\S]*?<\s*\/\s*think\s*>/gi, "");
  out = out.replace(/<\s*think\s*>/gi, "");
  return out;
}

/** Remove markdown code fences (opening fence lines incl. language tag and closing backticks). */
export function stripFences(s) {
  let out = String(s ?? "");
  out = out.replace(/^[ \t]*```[a-zA-Z0-9_+-]*[ \t]*\r?\n?/gm, "");
  out = out.replace(/```/g, "");
  return out;
}

/** Return the first balanced top-level object in a string as text, or null. */
export function firstBalancedJson(s) {
  const text = String(s ?? "");
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

// ---- Shared shape helpers -----------------------------------------------------

const isStr = (v) => typeof v === "string" && v.trim().length > 0;
const isStringArray = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");

function checkSourcedItem(item, where, errors, chunkIdSet) {
  if (!item || typeof item !== "object") {
    errors.push(where + ": must be an object with { text, source, chunkIds }");
    return;
  }
  if (!isStr(item.text)) errors.push(where + ".text: must be a non-empty string");
  if (!LESSON_SOURCES.includes(item.source)) {
    errors.push(where + ".source: must be one of " + LESSON_SOURCES.join(", ") + " (got " + JSON.stringify(item.source) + ")");
  }
  if (!Array.isArray(item.chunkIds) || !item.chunkIds.every((c) => typeof c === "string")) {
    errors.push(where + ".chunkIds: must be an array of chunk id strings");
  } else if (chunkIdSet && item.chunkIds.some((c) => !chunkIdSet.has(c))) {
    errors.push(where + ".chunkIds: unknown chunk id(s): " + item.chunkIds.filter((c) => !chunkIdSet.has(c)).join(", "));
  }
}

// ---- Validators (return true, or an array of human-readable errors) ----------

/** Validate a topic_map reply per plan 6.2/7.1; returns true or string[]. */
export function validateTopicMap(obj) {
  const errors = [];
  if (!obj || typeof obj !== "object" || !Array.isArray(obj.topics)) {
    return ["topics: expected an object { topics: [ ... ] }"];
  }
  const topics = obj.topics;
  if (topics.length < 5 || topics.length > 12) {
    errors.push("topics: expected 5-12 topics, got " + topics.length);
  }
  const ids = new Set();
  topics.forEach((t, i) => {
    const where = "topics[" + i + "]" + (t && t.id ? " (" + t.id + ")" : "");
    if (!t || typeof t !== "object") {
      errors.push(where + ": must be an object");
      return;
    }
    if (!isStr(t.id)) errors.push(where + ".id: must be a non-empty string");
    else if (ids.has(t.id)) errors.push(where + ".id: duplicate id " + JSON.stringify(t.id));
    else ids.add(t.id);
    if (!isStr(t.name)) errors.push(where + ".name: must be a non-empty string");
    if (!isStringArray(t.aliases)) errors.push(where + ".aliases: must be an array of strings");
    if (t.unit !== undefined && typeof t.unit !== "string") errors.push(where + ".unit: must be a string");
    if (!TOPIC_KINDS.includes(t.kind)) errors.push(where + '.kind: must be "numeric" or "conceptual"');
    if (!Number.isInteger(t.weight) || t.weight < 1 || t.weight > 5) {
      errors.push(where + ".weight: must be an integer 1..5");
    }
    if (!isStringArray(t.prereqs)) errors.push(where + ".prereqs: must be an array of topic ids");
  });
  // prereq references + cycle detection (only meaningful when ids are unique)
  const localIds = new Set(topics.filter((t) => t && typeof t.id === "string").map((t) => t.id));
  for (const t of topics) {
    if (!t || !Array.isArray(t.prereqs)) continue;
    for (const pid of t.prereqs) {
      if (!localIds.has(pid)) errors.push("topics " + t.id + ": prereq " + JSON.stringify(pid) + " is not an id in this list");
    }
  }
  if (!errors.length) {
    const byId = new Map(topics.map((t) => [t.id, t]));
    const state = new Map(); // 0 = visiting, 1 = done
    const hasCycle = (id) => {
      if (state.get(id) === 1) return false;
      if (state.get(id) === 0) return true;
      state.set(id, 0);
      for (const pid of byId.get(id).prereqs) {
        if (byId.has(pid) && hasCycle(pid)) {
          return true;
        }
      }
      state.set(id, 1);
      return false;
    };
    for (const t of topics) {
      if (hasCycle(t.id)) {
        errors.push("prereqs: topic " + t.id + " takes part in a prerequisite cycle (must be acyclic)");
        break;
      }
    }
  }
  return errors.length ? errors : true;
}

/**
 * Validate a Lesson per CONTRACTS.md Addendum v3 / plan 6.2 as amended by
 * plan3: steps <= 5, examQuestion present, meta present. `trace` is OPTIONAL
 * and IGNORED (plan3 §6.3 / Addendum v3 trace deprecation): a lesson is valid
 * whether trace is absent, null, or even malformed — trace left the product
 * flow and legacy notebooks must validate without it. topicKind is accepted
 * for signature compatibility with llm.js/prompts.js callers but no longer
 * changes the rules.
 */
export function validateLesson(obj, topicKind) {
  void topicKind; // retained in the frozen signature; trace no longer required
  const errors = [];
  if (!obj || typeof obj !== "object") {
    return ["lesson: must be an object"];
  }
  for (const key of ["oneLiner", "why", "analogy"]) {
    if (!isStr(obj[key])) errors.push(key + ": must be a non-empty string");
  }
  if (!Array.isArray(obj.steps)) {
    errors.push("steps: must be an array of { text, source, chunkIds }");
  } else {
    if (obj.steps.length > 5) errors.push("steps: at most 5 steps (got " + obj.steps.length + ")");
    if (obj.steps.length === 0) errors.push("steps: must contain at least one step");
    obj.steps.forEach((s, i) => checkSourcedItem(s, "steps[" + i + "]", errors));
  }
  if (!Array.isArray(obj.pitfalls)) {
    errors.push("pitfalls: must be an array of { text, source, chunkIds }");
  } else {
    obj.pitfalls.forEach((p, i) => checkSourcedItem(p, "pitfalls[" + i + "]", errors));
  }
  if (!isStringArray(obj.notesGaps)) errors.push("notesGaps: must be an array of strings");

  // trace: optional and ignored (plan3 §6.3). Present-or-absent both valid;
  // no trace-specific enforcement remains here.

  if (obj.diagramMermaid !== null && obj.diagramMermaid !== undefined && typeof obj.diagramMermaid !== "string") {
    errors.push("diagramMermaid: must be null or a string");
  }

  if (!obj.examQuestion || typeof obj.examQuestion !== "object") {
    errors.push("examQuestion: must be present: { q, modelAnswer, source }");
  } else {
    if (!isStr(obj.examQuestion.q)) errors.push("examQuestion.q: must be a non-empty string");
    if (!isStr(obj.examQuestion.modelAnswer)) errors.push("examQuestion.modelAnswer: must be a non-empty string");
    if (!LESSON_SOURCES.includes(obj.examQuestion.source)) {
      errors.push("examQuestion.source: must be one of " + LESSON_SOURCES.join(", "));
    }
  }

  if (!obj.meta || typeof obj.meta !== "object") {
    errors.push("meta: must be { provider, model, at }");
  } else {
    for (const key of ["provider", "model", "at"]) {
      if (!isStr(obj.meta[key])) errors.push("meta." + key + ": must be a non-empty string");
    }
  }
  return errors.length ? errors : true;
}

// ---- Citation enforcement (plan 6.6) ------------------------------------------

/**
 * Fraction of the claim's content words found in the chunk (stemmed, stopworded).
 * A claim with no content words has overlap 0.
 */
export function contentOverlap(claimText, chunkText) {
  const claim = contentWords(claimText);
  if (claim.size === 0) return 0;
  const chunk = contentWords(chunkText);
  let hit = 0;
  for (const w of claim) if (chunk.has(w)) hit += 1;
  return hit / claim.size;
}

function cloneSourcedItem(item, verifiedChunkIds, keepNotes) {
  const src = item && typeof item === "object" ? item : {};
  const sourceWasNotes = src.source === "notes";
  const keep = keepNotes && sourceWasNotes && verifiedChunkIds !== null;
  return {
    text: typeof src.text === "string" ? src.text : "",
    source: keep ? "notes" : "vertex",
    chunkIds: keep ? src.chunkIds.slice() : Array.isArray(src.chunkIds) ? [] : [],
  };
}

/**
 * Enforce citations per plan 6.6: a "notes" claim survives only if every chunkId
 * exists and its content-word overlap with each cited chunk is at least
 * DEFAULTS.citationOverlapMin; otherwise demote to "vertex". When
 * coverage.status is "not_found", force every item to "vertex".
 * Pure — returns a new Lesson object.
 */
export function enforceCitations(lesson, chunks, coverage) {
  const src = lesson && typeof lesson === "object" ? lesson : {};
  const chunkById = new Map((Array.isArray(chunks) ? chunks : []).map((c) => [c && c.id, c]));
  const forceVertex = coverage && coverage.status === COVERAGE_STATUSES[2];

  const verifyItem = (item) => {
    if (!item || typeof item !== "object" || item.source !== "notes") return null;
    const ids = Array.isArray(item.chunkIds) ? item.chunkIds : [];
    if (ids.length === 0) return null;
    for (const id of ids) {
      const chunk = chunkById.get(id);
      if (!chunk) return null;
      if (contentOverlap(item.text, chunk.text) < DEFAULTS.citationOverlapMin) return null;
    }
    return ids.slice();
  };

  const mapItem = (item) => {
    const verified = forceVertex ? null : verifyItem(item);
    return cloneSourcedItem(item, verified, !forceVertex);
  };
  // vertex items keep their (empty) chunkIds; notes-demoted items lose them.
  const mapSourced = (item) => {
    if (item && typeof item === "object" && item.source === "vertex" && !forceVertex) {
      return {
        text: typeof item.text === "string" ? item.text : "",
        source: "vertex",
        chunkIds: Array.isArray(item.chunkIds) ? item.chunkIds.slice() : [],
      };
    }
    return mapItem(item);
  };

  const eq = src.examQuestion && typeof src.examQuestion === "object" ? src.examQuestion : { q: "", modelAnswer: "", source: "vertex" };
  let examSource = eq.source === "notes" ? "notes" : "vertex";
  if (forceVertex || examSource === "notes") {
    // examQuestion carries no chunkIds, so a "notes" claim cannot be verified.
    examSource = "vertex";
  }

  return {
    oneLiner: typeof src.oneLiner === "string" ? src.oneLiner : "",
    why: typeof src.why === "string" ? src.why : "",
    analogy: typeof src.analogy === "string" ? src.analogy : "",
    steps: (Array.isArray(src.steps) ? src.steps : []).map(mapSourced),
    pitfalls: (Array.isArray(src.pitfalls) ? src.pitfalls : []).map(mapSourced),
    notesGaps: (Array.isArray(src.notesGaps) ? src.notesGaps : []).filter((g) => typeof g === "string"),
    trace: src.trace === null || src.trace === undefined
      ? null
      : (typeof src.trace === "object" ? { ...src.trace } : null),
    diagramMermaid: typeof src.diagramMermaid === "string" ? src.diagramMermaid : null,
    examQuestion: {
      q: typeof eq.q === "string" ? eq.q : "",
      modelAnswer: typeof eq.modelAnswer === "string" ? eq.modelAnswer : "",
      source: examSource,
    },
    meta: src.meta && typeof src.meta === "object" ? { ...src.meta } : { provider: "", model: "", at: "" },
  };
}
