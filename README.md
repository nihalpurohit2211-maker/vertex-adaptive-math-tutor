# Vertex — your exam, understood

**NotebookLM knows your documents. Vertex knows your exam.**

Vertex is a local-first engineering-mathematics exam-revision workspace. Paste lecture notes and a syllabus, and it shows what your notes actually explain, what they only mention, and what never appears — with the verbatim passage behind every verdict. From there: full lesson cards, a concept-and-numerical practice studio, an interactive study calendar, analytics built from real records, a searchable formula vault, and one printable A4 revision sheet built only from the pins you choose.

This repository is a rebuild of the original [Vertex](https://github.com/nihalpurohit2211-maker/vertex-adaptive-math-tutor): the original product concept, six-topic numerical-optimization demo, coverage engine, pin model and KaTeX fallback are preserved, while the interface, routing and additional workspaces are new.

## Run it

No build step, no npm dependencies, no database, no server runtime.

```bash
node scripts/serve.mjs          # http://localhost:8766
# or: python -m http.server 8766
```

Then open <http://localhost:8766>. Set `PORT` to use another port. ES modules need an HTTP origin; `file://` will not work.

`package.json` only declares `"type": "module"` so Node can import the same files the browser does. There is nothing to install.

## What is in the product

- **Landing page** — knowledge-orbit hero, six-scene scroll narrative, live coverage and gradient-descent demos, revision-sheet and calendar previews.
- **Local profile entry** (`#/login`) — honestly a local profile and workspace picker, not server authentication. No password, no account, no recovery service.
- **Setup** (`#/setup`) — curated demo or your own notes + syllabus. Offline topic detection, note chunking, and lexical coverage. AI topic mapping is optional.
- **Overview** (`#/dashboard`) — coverage stats, real planned-versus-completed study time, explained priority ordering, recent lessons and working quick actions.
- **Coverage Intelligence** (`#/coverage`) — notebook order, one accessible verdict chip per topic, two-pane evidence on desktop and inline evidence on mobile. Every excerpt is verbatim with its chunk id.
- **Lesson Studio** (`#/lesson/:id`) — one-liner, why it matters, analogy, ≤5 steps, source chips and citations, pitfalls, notes gaps, method flow, exam question, curated scenarios, interactive visualizations, and pin controls.
- **Exam Practice Studio** (`#/practice`) — six question types, numerical working space, hints, staged solutions, common mistakes and reflection. No grades, streaks or leaderboards.
- **Revision Sheet** (`#/sheet`) — topic pins and point pins, reorder/remove, collapse, reveal original notes on screen, local KaTeX rendering, Unicode fallback and A4 print styles.
- **Study Calendar** (`#/calendar`) — month/week/day, ripple-and-particle date selection, add/complete/move/delete sessions, drag-and-drop plus keyboard move buttons, rule-based suggestions with stated reasons, and real planned/completed totals.
- **Progress Intelligence** (`#/analytics`) — coverage donut and bars, unit distribution, 14-day activity, planned vs completed time, priority analysis, keyboard-accessible prerequisite graph and record-derived insights.
- **Formula Vault** (`#/formulas`) — search/filter, variables, use cases, examples, copy LaTeX, pin a formula, open a related lesson, and an interactive learning-rate explorer.
- **Settings modal** — profile, study hours, exam date, storage status, optional provider/key, remember-on-device, export/import, workspace deletion and privacy details.

The curated demo uses six numerical-optimization topics and deliberately contains all three evidence states:

| Topic | Coverage |
|---|---|
| Gradient descent | Explained |
| Newton’s method | Explained |
| Armijo line search | Only mentioned |
| Quasi-Newton / BFGS | Only mentioned |
| Gram–Schmidt | No match found |
| Conjugate gradient | No match found |

It works offline, makes zero model calls and lives under its own notebook id, so it never touches your notes, pins, calendar or settings.

## Privacy and AI

- Notes, topics, pins, calendar sessions, reflections and settings stay in this browser’s storage. There is no account backend, analytics service or silent upload.
- If browser storage is unavailable, Vertex falls back to an in-memory tier for the session. Export before closing the tab.
- AI is optional. OpenAI, Anthropic and Google Gemini adapters exist, but a request happens only after you choose a provider, store a key and press a generate action. The offline demo, lessons, coverage, calendar, analytics, formulas and sheet need none of it.
- Keys are masked, never logged, never placed in DOM attributes, never written into notebook data, and use `sessionStorage` by default. "Remember on this device" moves them to `localStorage`. Browser-side keys cannot be protected from someone inspecting the browser; the settings UI says so.
- Requests use a 60-second `AbortController`, one schema-feedback retry, and typed errors (`no_key`, `network`, `ratelimit`, `timeout`, `cancelled`, `invalid_json`, `bad_shape`). Batch work can be cancelled globally.
- The three model prompts are `topic_map`, `lesson` and `narration` in `src/prompts.js`. All demand a single JSON object and use LaTeX for mathematics. Narration is forbidden from introducing new numbers.

## Architecture

```text
index.html              shell, CSP, local KaTeX CSS
styles.css              one design system + landing + app + print + reduced motion
src/
  app.js                hash router, public/app shells, search, notifications, settings
  state.js              profiles, notebooks, keys, pins, calendar, reflections, fallback storage
  core.js               pure domain helpers (validated by the self-check in Node)
  ui.js                 DOM helpers, icons, dialogs, toasts, chips, math rendering
  charts.js             SVG charts, prerequisite graph, optimiser widgets
  services.js           topic detection, coverage, lesson scaffolds, optional AI
  providers.js          OpenAI / Anthropic / Gemini adapters and typed errors
  prompts.js            topic_map, lesson, narration
  chunk.js, plan.js     reused original coverage and planning engines
  seed.js               curated calendar, formulas, questions, scenarios, flows
  pages/                landing, login, setup, dashboard, coverage, lesson, practice,
                        sheet, calendar, analytics, formulas
demo/                   original curated notebook + scenarios + source notes
vendor/katex/           locally vendored KaTeX 0.16.22 (MIT)
scripts/check.mjs       self-check; scripts/serve.mjs is the static server
```

- Hash routes: `#/`, `#/login`, `#/setup`, `#/dashboard`, `#/coverage`, `#/lesson/:id`, `#/practice`, `#/sheet`, `#/calendar`, `#/analytics`, `#/formulas`. Settings is a modal.
- Vanilla ES modules, native hash routing, WebGL-free CSS 3D and Canvas/SVG visualizations, custom charts, native `localStorage`/`sessionStorage` with memory fallback. No framework, bundler, Tailwind runtime or external CDN.
- The math renderer uses KaTeX vendored locally with `output: 'mathml'`, so no inline styles are needed under the CSP (`default-src 'self'`). A Unicode fallback remains if KaTeX fails to load.

## Self-check

```bash
node scripts/check.mjs
```

It verifies required files, absence of secrets, demo isolation, six demo topics, all three coverage states, valid chunk citations, lesson schemas, pin normalization and duplicate prevention, calendar and formula data, practice answers, routes, prompts, CSP, no CDN, no inline scripts, key handling, timeout/cancel plumbing, print rules, the calendar interaction and reduced-motion support.

## Verification performed

- `node scripts/check.mjs` — 28/28 checks.
- Headless route sweep in Chromium, WebKit and Firefox: all workspaces render, no horizontal overflow at desktop/tablet/mobile widths, direct route loading works, pins persist to the sheet, calendar creation works, print media hides chrome, MathML renders, reduced-motion mode stacks the story.
- AI adapters were exercised end-to-end in the browser through real `fetch` calls with intercepted provider responses: OpenAI, Anthropic and Gemini request shapes, header-based keys (never URLs), single retry after invalid JSON, 401 mapping, external abort and missing-key handling. No live provider credentials were available in this environment, so no paid provider request was made.
- The sheet was printed to PDF and inspected: black-on-white A4 output, page-break protection, footer warning, no navigation or controls.

The Firefox run required the macOS 27 profile-folder workaround (`CFFIXED_USER_HOME`); that is an operating-system TCC issue, not an application issue. Actual Safari Remote Automation was unavailable, so Safari-engine coverage was done with Playwright WebKit.

## Honest limitations

- **Coverage is lexical** (BM25-lite plus aliases). It can miss heavy paraphrase. That is why every matched verdict exposes its verbatim excerpt and the terms that matched.
- **Short notes may only reach "Only mentioned".** The scorer deliberately requires more than a passing match before calling a topic explained; it does not pretend to understand prose.
- **User topics without a curated demo match get an offline revision scaffold**, not a generated mathematical explanation. The scaffold is explicit about that. Adding a provider key enables optional generation with citations.
- **Curated scenarios exist for the six demo topics.** Other workspace topics show that no scenario is attached yet rather than inventing one.
- **A model can be wrong.** The revision sheet footer says: *Check anything here against your textbook — the model can be wrong.*
- Import/export is local JSON, not cloud sync. There is no account recovery by design.

## License

MIT — see [LICENSE](LICENSE). Original Vertex © 2026 Nihal Purohit; rebuild retains the original demo data and coverage/planning engines under the same license.
