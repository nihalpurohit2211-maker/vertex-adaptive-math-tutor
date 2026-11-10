/**
 * vertex-contracts — frozen interface constants shared by every module.
 * FROZEN at Phase 0. Do not change values without updating CONTRACTS.md
 * and notifying the orchestrator. This file holds only cross-track
 * constants; track-internal helpers live in each track's own module.
 */

export const CONTRACT_VERSION = "1";

// Hash routes (CONTRACTS.md §Routes)
export const ROUTES = {
  SETUP: "#/setup",
  MAP: "#/map",
  LESSON_PREFIX: "#/lesson/",
  SHEET: "#/sheet",
};

// Storage (plan §6.9). Values only — the API is store.js.
export const STORAGE = {
  notebookKey: (id) => `vx2.nb.${id}`,
  settings: "vx2.settings",
  keyBharatcode: "vx2.key.bharatcode",
  keyGemini: "vx2.key.gemini",
};

export const PROVIDERS = ["bharatcode", "demo", "gemini"];

export const LLM_TASKS = ["topic_map", "lesson", "narration"];

// Typed error `kind` values thrown by llm.json() (CONTRACTS.md §llm)
export const LLM_ERROR_KINDS = [
  "no_key", // user has not pasted a BharatCode key
  "network", // fetch failed / CORS / offline
  "ratelimit", // 429/5xx after backoff
  "timeout", // 60 s AbortController fired
  "cancelled", // global Cancel pressed
  "invalid_json", // unrepairable JSON after 1 retry
  "bad_shape", // parsed but failed `validate` after 1 retry
];

export const COVERAGE_STATUSES = ["covered", "thin", "not_found"];
export const TOPIC_KINDS = ["numeric", "conceptual"];
export const RATINGS = ["knew", "kinda", "lost"]; // null = unrated
export const AFTER_STATES = ["got", "still_lost"]; // null = unanswered
export const LESSON_SOURCES = ["notes", "vertex"];

export const TIMEOUTS = {
  llmMs: 60000, // plan §6.3 — replaces old 3000 ms chat timeout
  traceMs: 2000, // plan §6.7
  traceMaxLines: 40,
  traceMaxRows: 8,
};

export const DEFAULTS = {
  hoursToStudy: 3,
  lang: "en", // "en" | "hinglish" (F30 is P1; plumbing exists, toggle hidden)
  modelBharatcode: "qwen-3.8-27b",
  bharatcodeBaseUrl: "https://bharatcode.ai/api/model/v1",
  // Google AI Studio (Gemini) — opt-in provider (Addendum v5). The model id is
  // a user-editable default, never a hardcoded constant in the call path:
  // llm.json reads it from config.geminiModel, which settings.js persists.
  geminiModel: "gemini-2.5-flash",
  geminiBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
  concurrency: 2,
  citationOverlapMin: 0.25,
  traceDecimals: 4,
};

/**
 * @typedef {Object} Chunk            { id: "c1", text: string }
 * @typedef {Object} Coverage         { status: "covered"|"thin"|"not_found", score: number (0..1), chunkIds: string[] }
 * @typedef {Object} TraceResult      { columns: string[], rows: Array<Array<number|string|number[]>>, answer: string }
 * @typedef {Object} Trace            { title: string, code: string, computed: boolean, result: TraceResult|null, narration: string[], takeaway: string }
 * @typedef {Object} LessonStep       { text: string, source: "notes"|"vertex", chunkIds: string[] }
 * @typedef {Object} Lesson           see CONTRACTS.md §Lesson — oneLiner, why, analogy, steps(<=5), pitfalls, notesGaps, trace|null, diagramMermaid|null, examQuestion{q,modelAnswer,source}, meta{provider,model,at}
 * @typedef {Object} Topic            see CONTRACTS.md §Topic — id, name, aliases, unit, kind, weight(1..5), prereqs, coverage, rating, after, lesson
 * @typedef {Object} Notebook         see CONTRACTS.md §Notebook — id, title, createdAt, notes{raw,chunks}, syllabus{raw,source}, settings, topics
 */
