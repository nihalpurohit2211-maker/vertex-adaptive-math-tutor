# Vertex — exam-ready notes

> *Exam-ready without picking up a pen.*

**NotebookLM knows your documents. Vertex knows your exam.**

<!-- HERO SCREENSHOT PENDING: human to add docs/setup.png — see docs/contents.md -->
![Vertex setup screen](docs/setup.png)

**One-liner:** Paste your notes and syllabus. See what your notes leave out, reason through the tricky bits, and take a short revision sheet into your final study session.

**Live demo (no key needed):** _TODO — Pages URL to be filled in by the human; expected `https://<owner>.github.io/vertex-exam-ready/` once GitHub Pages is enabled._ "Try the demo" opens a curated six-topic demo in under a second — no API key, **zero model requests, zero generated code executed**.

## What it does

- **Notes vs. syllabus coverage** — every syllabus topic is labelled **Explained**, **Only mentioned**, or **No match found** against *your* notes; matched rows open the exact note excerpt so you can check the verdict yourself.
- **Missed-the-lecture lessons** — a two-minute card per topic: the idea in two sentences, what your notes say, what's missing. Exact excerpts are labelled *From your notes*; added context is labelled *Vertex explanation*.
- **"What would you do?" walkthroughs** — short engineering decisions (e.g. gradient descent overshooting, a tiny decrease that still fails Armijo). Pick, change your mind, or reveal the reasoning directly — for reflection, not scoring. No streaks, no grades, no red failure states.
- **Revision pins** — pin any point from a lesson; pins are yours: reorder, remove, they persist across reload, and **only your pins** build the sheet.
- **One-page revision sheet** — pinned topics as heading + takeaway + one distinction, printed black-on-white A4 via Print → Save as PDF.

## How it differs from NotebookLM (honest)

Google's tools already offer interactive lessons, quizzes, feedback and study prioritization — we are not pretending otherwise. Vertex's value is a narrower, deliberate workflow:

| Capability | NotebookLM | Vertex |
|---|---|---|
| Quizzes, flashcards, tutor-style guide | ✅ yes | deliberately not built (quiz grind is what we remove) |
| Audio/video overviews | ✅ yes | ❌ cut |
| Grounded answers with citations | ✅ yes | ✅ with excerpts shown verbatim so the verdict is checkable |
| **Syllabus-vs-notes coverage** with three visible states | ❌ | ✅ |
| **Short conceptual decision walkthroughs** tied to the exact gap | ❌ | ✅ (curated for the demo; reviewed content) |
| **Student-built revision sheet from explicit pins** | partly (study guides) | ✅, print-first, one A4 page |

## How it works

```
 notes + syllabus
      │  topic map (BharatCode, live path)        curated demo: bundled content
      ▼
 [topics, aliases] ──► lexical matching over your note chunks
      ▼                Explained / Only mentioned / No match found
 lesson: idea · your excerpt · what's missing · "What would you do?"
      ▼
 pins (ordered, yours) ──► one-page A4 revision sheet ──► Print / Save as PDF
```

## How it uses the BharatCode model API

The live path is built for the [BharatCode](https://bharatcode.ai) model API — OpenAI-compatible chat completions at `https://bharatcode.ai/api/model/v1`, models `qwen-3.8-27b` and `deepseek-v4.1-flash` — for topic mapping and short explanations on **your own** notes and syllabus. Keys are bring-your-own and **free for students with `.ac.in` / `.edu.in` emails** (subject to the provider's usage limits). Model output is hardened: fences/`<think>` stripped, first balanced JSON extracted, schema-validated, one retry with the validation error fed back; friendly retry and no-key states are preserved. The featured scenarios are reviewed content, not model output, so the demo stays consistent. **Live-path status: beta until the CORS/latency/JSON checks (T1–T4) are run with a real key.**

## Keys & privacy

- Your notes **stay in your browser** (localStorage, try/catch + in-memory fallback). Vertex has no accounts and no server database.
- Notes excerpts are sent **only to the model provider you choose in Settings**, to generate lessons. Check that provider's data terms.
- API keys live in `sessionStorage` (gone when the tab closes) unless you tick "Remember on this device". Keys are never logged, never rendered into DOM attributes, never committed.
- The demo is fully offline: no key, no network, and it never runs generated code. Opening the demo never touches your own notebook or pins — the demo lives under its own notebook id.

## Run locally

ES modules need an HTTP origin (opening `index.html` from `file://` will not work):

```bash
python -m http.server 8765     # or: node scripts/serve.mjs
# then open http://localhost:8765
```

`node scripts/check.mjs` runs the automated checks: required files, secret scan, HTML-safety scans, demo fixture integrity (exact excerpt text, curated statuses, zero trace code), pin normalization and legacy-notebook import safety.

## Demo honesty

"Try the demo" loads `demo/numopt.notebook.json` + `demo/numopt.scenarios.json`: a **curated demo** — team-reviewed lesson copy and scenarios on realistic exam-eve notes, with stored coverage verdicts. It is labelled "Curated demo" in the UI. The live engine uses the same shapes with real matching on your notes.

## Honest limitations

- **Coverage is lexical** (BM25-lite + aliases) and can miss heavy paraphrase — the excerpt shown on every matched row lets you verify each verdict.
- **Scenarios are curated, not generated** — the two gradient-descent walkthroughs are hand-reviewed content; other topics get short reviewed cards. More cards are on the roadmap.
- **Earlier builds computed worked examples in a browser sandbox**; that surface was removed from the product flow, so today's numbers-free lessons avoid fake precision rather than pretend at it.
- **The model can still be wrong** on the live path — check against your textbook. The sheet footer says exactly that.
- Free-tier API limits can bite mid-session; the app degrades to retry-with-backoff messages and the no-key demo always works.

## Roadmap (coming soon)

15/45-minute "short on time" queue switch, more reasoning cards (Newton vs BFGS, Gram–Schmidt), Hinglish explanations, past-paper evidence for exam weights, photo/handwritten notes (vision), shared-key hosted mode, spaced nudges, share a sheet with classmates, teacher view, PWA/offline.

## License

MIT — see [LICENSE](LICENSE). © 2026 Nihal Purohit.

## Support

If this saved your exam eve, **⭐ star the repo** (`vertex-exam-ready` — exact URL filled in with the live-demo link above) — stars and votes are part of how the hackathon judging works, and it genuinely helps.
