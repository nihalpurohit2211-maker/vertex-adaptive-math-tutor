# Vertex — exam-ready notes

> *Exam-ready without picking up a pen.*

**NotebookLM knows your documents. Vertex knows your exam.**

<!-- HERO SCREENSHOT PENDING (G4): human to add docs/setup.png — see docs/contents.md -->
![Vertex setup screen](docs/setup.png)

**One-liner:** Vertex turns your messy notes and your syllabus into a pen-free, personalized exam-eve crash course: it finds what your notes are missing, teaches only what you don't understand, and prints a one-page sheet of your gaps.

**Live demo (no key needed):** _TODO(G0) — Pages URL to be filled in by the human; expected `https://<owner>.github.io/vertex-exam-ready/` once GitHub Pages is enabled._ The demo button loads a baked notebook JSON in under a second — no API key, no network calls.

## What it does

- **Coverage map** — every syllabus topic is scored against *your* notes as Covered / Thin / Not in your notes, with the matched note snippets shown on tap ("why we think so").
- **Gap-tagged lessons** — a two-minute "missed-the-lecture" card per shaky topic; every line is tagged *Your notes* or *Added by Vertex*, and notes-citations are verified against your text, not trusted.
- **Computed traces** — worked examples whose numbers are computed by sandboxed code in your browser (badge: "Computed in your browser ✓"), never guessed by the model; narration is written after the numbers and may only reuse them.
- **One-tap ratings + a deterministic plan** — tap Knew it / Kind of / No idea; the plan (order, minutes per topic, prerequisites first) is a fixed formula over your ratings, your time budget and topic weights — reproducible, not model-vibes.
- **Printable gap sheet** — one A4 page of only the topics you don't know: one-liner, algorithm, mini-trace, watch-outs, likely question. Print → Save as PDF.

## How it differs from NotebookLM (honest)

NotebookLM already does a lot of "study from your documents". We are not pretending otherwise — the moat is the exam-first *workflow*:

| Capability | NotebookLM | Vertex |
|---|---|---|
| Quizzes, flashcards, tutor-style Learning Guide | ✅ yes | deliberately not built (quiz grind is what we remove) |
| Audio/video overviews of sources | ✅ yes | ❌ not built (cut from v1) |
| Grounded answers with citations | ✅ yes | ✅ yes, **plus citations are machine-checked against your notes** and demoted if they don't hold |
| **Syllabus coverage map** (what your notes miss vs the actual exam syllabus) | ❌ | ✅ |
| **Computed worked examples** (numbers by code, not by the LLM) | ❌ | ✅ |
| **Deterministic time-budget plan** with prerequisite ordering + one-tap self-rating | ❌ | ✅ |
| **One-page personal gap sheet** for the exam eve | partly (study guides) | ✅, print-first |

## How it works

```
 notes + syllabus
      │  topic map (BharatCode)          ┌─ coverage: BM25-lite chunk scoring
      ▼                                  ▼
 [topics, aliases, weights, prereqs] ──► Covered / Thin / Not in your notes
      │
      ▼  lesson (1 call, top chunks only) ──► steps tagged notes|vertex + gaps
      ▼
 trace code ──► sandboxed worker run (2 s timeout, static scan) ──► table
      ▼
 table ──► narration (separate call; may only reuse table numbers)
      ▼
 ratings + hours ──► deterministic plan ──► printable gap sheet
```

## How it uses the BharatCode model API

Vertex is built for the [BharatCode](https://bharatcode.ai) model API — OpenAI-compatible chat completions at `https://bharatcode.ai/api/model/v1`, models `qwen-3.8-27b` and `deepseek-v4.1-flash`. BharatCode does the three LLM jobs: topic mapping, lesson generation, and narration of computed tables. Keys are bring-your-own and **free for students with `.ac.in` / `.edu.in` emails** (subject to the provider's usage limits) — exactly the students Vertex is for. Model output is hardened: fences/`<think>` stripped, first balanced JSON extracted, schema-validated, one retry with the validation error fed back.

## Keys & privacy

- Your notes **stay in your browser** (localStorage, guarded with try/catch + in-memory fallback). Vertex has no accounts and no server database.
- Notes excerpts are sent **only to the model provider you choose in Settings**, to generate lessons. Check that provider's data terms.
- API keys are kept in `sessionStorage` (gone when the tab closes) unless you tick "Remember on this device". Keys are never logged, never rendered into DOM attributes, never committed.
- The demo notebook needs **no key at all** and makes **no network calls**.

## Run locally

ES modules need an HTTP origin (opening `index.html` from `file://` will not work):

```bash
python -m http.server 8765     # or: node scripts/serve.mjs
# then open http://localhost:8765
```

`scripts/check.mjs` runs the contract + data checks, including re-executing every stored trace in Node and re-scoring coverage on the demo notes.

## Demo notebook honesty

"Try the demo notebook" loads `demo/numopt.notebook.json`. It is currently a **sample notebook authored for the offline demo** on realistic exam-eve notes: every stored trace was executed in Node and re-verified row-by-row (see `demo/reference_numbers.md`), but the prose was authored, not baked live from the API. If the live bake (real pipeline + real BharatCode key) completes before submission, the orchestrator replaces this file with the exported JSON and this paragraph will say so.

## Honest limitations

- **Tuned for STEM-algorithmic topics** (algorithms, formulas, procedures). Other subjects still get coverage map + lesson + sheet, but no computed trace, and the UI says so.
- **Lexical coverage** (BM25-lite + aliases) can miss heavy paraphrase — clicking a coverage chip shows exactly which snippets matched, so you can see why a verdict was made.
- **Hackathon-grade sandbox**: the trace runner is a worker + API shadowing + 2 s timeout + static scan, not a hardened VM. Trace code comes only from the model you chose in your own session.
- **The model can still be wrong.** Every computed number is code-verified, but prose is prose — check against your textbook. The sheet footer says exactly that.
- Free-tier API limits can bite mid-session; the app degrades to retry-with-backoff messages and the no-key demo path always works.

## Roadmap (coming soon)

Photo/handwritten notes (vision), past-paper ingestion for exam weights, shared-key hosted mode, spaced nudges the night before and morning of the exam, Hinglish/Hindi polish, share a sheet with classmates, teacher view, subject packs beyond STEM, PWA/offline.

## License

MIT — see [LICENSE](LICENSE). © 2026 Nihal Purohit.

## Support

If this saved your exam eve, **⭐ star the repo** (`vertex-exam-ready` — exact URL is filled in at G0 together with the live-demo link above) — stars and votes are part of how the hackathon judging works, and it genuinely helps.
