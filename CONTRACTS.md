# CONTRACTS.md — frozen interfaces (v1)

FROZEN at Phase 0. Subagents own only their files and **may not change**
anything here. To change a contract: stop, report to the orchestrator;
the orchestrator updates this file, `src/contracts.js` and notifies the
other tracks. Every module imports cross-track constants from
`src/contracts.js` — never re-hardcode them.

## Routes (hash-based)

| Route | Screen |
|---|---|
| `#/setup` | 1 SETUP — notes/syllabus/hours, demo button, model chip, settings |
| `#/map` | 2 MAP + PLAN |
| `#/lesson/:topicId` | 3 LESSON card |
| `#/sheet` | 4 YOUR SHEET (print) |

Unknown route → redirect `#/setup`. Startup with no state → `#/setup`.

## Data model (plan §6.2) — stored shapes

```jsonc
Notebook {
  id: string, title: string, createdAt: string (ISO),
  notes:    { raw: string, chunks: Chunk[] },            // Chunk = { id:"c1", text }
  syllabus: { raw: string, source: "pasted"|"auto" },
  settings: { hoursToStudy: number, lang: "en"|"hinglish" },
  topics: Topic[]
}
Topic {
  id: "t1", name: string, aliases: string[], unit: string,
  kind: "numeric"|"conceptual", weight: 1..5, prereqs: string[],
  coverage: { status:"covered"|"thin"|"not_found", score: 0..1, chunkIds: string[] },
  rating: null|"knew"|"kinda"|"lost",
  after:  null|"got"|"still_lost",
  lesson: null|Lesson
}
Lesson {
  oneLiner: string, why: string, analogy: string,
  steps:    LessonStep[],            // <=5; LessonStep = { text, source:"notes"|"vertex", chunkIds: string[] }
  pitfalls: LessonStep[],
  notesGaps: string[],
  trace: null | { title: string, code: string, computed: boolean,
                  result: null | { columns: string[], rows: [[number|string|number[]]], answer: string },
                  narration: string[], takeaway: string },
  diagramMermaid: null|string,
  examQuestion: { q: string, modelAnswer: string, source: "notes"|"vertex" },
  meta: { provider: string, model: string, at: string (ISO) }
}
```

Rules: `trace.computed===true` **only** when `runTrace` succeeded;
"Computed in your browser ✓" badge renders only when `computed===true`;
when false the UI shows exactly **"Illustrative example (not computed)"**.

## llm.js — `llm.json({ task, system, user, validate, provider }) -> Promise<object>` (Track B)

- `task`: one of `"topic_map" | "lesson" | "narration"` (contracts `LLM_TASKS`).
- `validate`: `(parsedObject) => true | string[]` — failure messages appended into the single retry prompt.
- Throws a plain `Error` with `err.kind` set to one of `LLM_ERROR_KINDS`
  (`no_key | network | ratelimit | timeout | cancelled | invalid_json | bad_shape`),
  plus optional `err.retryAfterMs`. UI maps kinds → messages; nothing else.
- Providers: `bharatcode` (OpenAI-compatible POST to
  `DEFAULTS.bharatcodeBaseUrl + "/chat/completions"`, `Authorization: Bearer <key>`,
  temp 0.3, 60 s abort; base URL configurable via `llm.configure({ bharatcodeBaseUrl })`
  so a Worker proxy can be swapped in), `demo` (no network; resolves from data
  installed via `llm.installDemoData(data)`, where
  `data = { topic_map: {topics:[...]}, lessons: [ { topicName, lesson, narration } ] }`
  and lookup key conventions are Track B-internal), `gemini` (P1, flag off).
- Also exports: `llm.cancelAll()`, `llm.configure({ key?, baseUrl?, model?, lang? })`,
  `llm.installDemoData(data)`. Cache key: `hash(notes + topic + model + lang)`.
- Concurrency 2; exponential backoff on 429/5xx; retry once on invalid/bad JSON.
- **The judge demo path does not call llm at all** — `store.loadDemoNotebook()`
  returns the baked notebook JSON directly.

## chunk.js (Track A)

- `chunkNotes(raw) -> Chunk[]` — blank-line/heading split, 600–1200 chars, merge tiny, stable ids `c1…cn`. Deterministic.
- `scoreCoverage(topic, chunks) -> { status, score, chunkIds }` — BM25-lite per plan §6.4; thresholds tuned so the six demo topics yield exactly **Covered, Covered, Thin, Thin, Not found, Not found** (order of the §8 table). No DOM, no imports outside contracts.

## plan.js (Track A)

- `buildPlan(notebook) -> { ordered: string[], minutesById: {topicId: number}, fits: string[], ifTime: string[], sheetIds: string[], prereqWarnings: [{topicId, prereqId}] }`
  per plan §6.5 exactly (gap map, notesBoost, priority, topological pull-ahead, clamp 5–20 min, budget fill, sheet = rating≠knew && after≠got, ≤6 by priority, overflow "Also review"). Pure; never mutates the notebook.

## schema.js (Track A)

- `validateTopicMap(obj) -> true | string[]`
- `validateLesson(obj, topicKind) -> true | string[]`
- `enforceCitations(lesson, chunks, coverage) -> Lesson` — keep `notes` source only if chunkIds exist AND content-word overlap ≥ `DEFAULTS.citationOverlapMin`, else demote to `"vertex"`; force all `"vertex"` when `coverage.status==="not_found"`. Pure, returns a new object.
- JSON repair utilities (used by llm.js): `stripThink(s)`, `stripFences(s)`, `firstBalancedJson(s)` — `<think>…</think>` removal, ``` fence removal, first balanced `{…}` extraction.

## trace.js / trace.worker.js (Track A)

- `runTrace(code) -> Promise<{ computed: boolean, result: TraceResult|null }>` —
  static reject list (contracts not needed inside worker; list per §6.7), spawns
  real-file worker `src/trace.worker.js`, shadows network APIs, 2 s hard timeout
  via `worker.terminate()`, shape + finiteness validation, round to 4 decimals.
  Never throws; failure resolves `{ computed:false, result:null }`.
- Worker contract: code must define `function run()` returning `{columns, rows, answer}`; the worker posts `{ ok, result }` or `{ ok:false, error }`.
- Node-side equivalent for `check.mjs` uses `vm` with the same static reject list,
  2 s timeout and finiteness/rounding rules.

## render.js (Track C)

- `renderSafeMarkdown(el, md)` — marked → DOMPurify → DOM; KaTeX `$…$`; CDN failure → plain text append, never blank.
- `renderMermaid(el, src)` — lazy-load, `securityLevel:"strict"`; on failure remove the block.
- `renderPlot(el, trace)` — own SVG via `createElementNS` from `trace.result.rows`.
- **Only file allowed to touch `innerHTML`** (post-DOMPurify); only file loading CDN libs. Pinned versions + SRI.

## store.js (Track B)

- Notebook CRUD in `localStorage` inside try/catch with in-memory fallback; keys per contracts `STORAGE`.
- API keys in `sessionStorage` unless `vx2.settings.remember===true` → then `localStorage`.
- `exportNotebook(nb) -> string(JSON)`, `importNotebook(json) -> Notebook` (throws on invalid — validated with schema.js at Phase 2; until then validate shape locally), `loadDemoNotebook() -> Promise<Notebook>` (fetches `demo/numopt.notebook.json`), `saveRating(topicId, rating)`, `saveAfter(topicId, after)`.
- Settings object: `{ hoursToStudy, lang, model, provider, remember, bharatcodeBaseUrl }`.

## Cross-cutting rules

- Vanilla ES modules, no build step; import specifiers are relative `.js` paths.
- No secrets in repo; keys never logged, never in DOM attributes.
- No inline `on*` handlers; rating controls are real `<button aria-pressed>`.
- Storage always try/catch. No empty catch blocks. No arbitrary sleeps.
- `index.html` sets theme tokens from the existing app: `#121212 / #1E1E1E / #FF7A1A`.
- CSP `<meta>` added last (Track C, before freeze) and tested.
