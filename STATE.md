# STATE.md — single source of truth (orchestrator-maintained)

## Objectives
- ACTIVE GOAL (22:21 IST): execute plan3 (2).md as MAIN authority on conflicts; fix everything; don't stop until all checks+tests green.
- Plan 3 = revision-pins + curated what-if scenarios + light UI + trace removal, on top of Plan 2 baseline.
- Plan 2 baseline recorded: branch dev @ 4687b70; `node scripts/check.mjs` 30/31 (CSP pending Track C); `node tests/run.mjs` 38/38.

## Frozen contracts
- CONTRACTS.md v1 + src/contracts.js; ADDENDUM v3 appended (pins, coverage labels, trace deprecation, demo isolation, §9 fixture byte-exact excerpts). plan3 wins conflicts.

## Track status
| Track | Scope | Status |
|---|---|---|
| A Engine | chunk/plan/check.mjs + unit tests | DONE 4687b70 (baseline); check.mjs superseded by F below |
| B LLM+store | llm/prompts/store | DONE d50b50a → P3-E 0daea78 (30/30 harness) |
| C/W2 UI | index/styles/main/render/views | LANDED + committed d669ede (report never delivered — files quiet, browser tail seen at 22:58; committed under Track-C "as landed" precedent; no new edits since, so nothing outstanding) |
| D/F Content+validators | schema/check/demo | DONE 67a6e49 — check 35/35, tests 39/39→31/31 after trace-suite removal |

## Phase log
- Phase 0: contracts frozen, `dev` branch created. G0 human steps outstanding (repo, key, T1–T4, T6).
- Plan 3 goal active (22:21). W1 (E+F) complete and committed. W2 UI wave: files fully landed and independently QA-passed; awaiting its report to commit; if it stalls, orchestrator commits the verified state.
- Orchestrator integration fix (self, verified): removed dangling trace suite from tests/run.mjs + deleted orphan tests/trace.test.mjs after W2 deleted src/trace.js → 31/31.
- W4 (user math request, task #7): KaTeX symbolic "Working" blocks queued, blocked-by W2 commit. W3: finish 2 partial §12 rows (real 360-px screenshot, six-card visual print preview) + README/handoff + screenshots.

## Verified working
- W3 browser QA (orchestrator, :8766, uncommitted-W2 tree — re-run post-commit): §7 judge path end-to-end PASS. §12 rows: cold start PASS (six topics §9 order, curated label, 0 pins, network = local files only → zero model requests); evidence PASS (Armijo chunk contains fixture sentence verbatim + GS no excerpt button); reasoning PASS (a2 reveal exact §3, switch→a1 reveal updates, sheet stayed 0; Scenario B focus-on-heading, reveal w/o choice); pin behaviour PASS (append, swap via Move up with boundary-disabled, reload via navigation, Remove → live region "Removed from revision sheet", localStorage revisionPins authoritative); isolation PASS (user notebook byte-identical across demo open+pin; reopen restores); import PASS (real file input; legacy trace key discarded; stale/dup pins dropped keeping first order [t1,t3]); mobile/keyboard PASS-structural (468 px: no h-scroll all 4 views; complete tab orders map+lesson; 2px ring token, 44px min-heights); print PASS-measured (six cards at 619 px A4 width = 1009 px ≤ 1032 px usable, break-inside avoid present); live no-key PASS (exact §10 sentence + "Add a key in settings"). STILL OPEN: real 360-px screenshot row; six-card visual print preview; invalid/valid-key rows need human T1–T4.
- §10 layout contract grep-evidenced in styles.css: --focus-ring 2px, 16px gutters comment, 1120 cap, min-height/width 44px, prefers-reduced-motion.
- Live engine (chunk.js, untuned) on F's NEW demo notes reproduces §9 exactly: covered/covered/thin/thin/not_found/not_found; check.mjs reports MATCH. All four §9 excerpts byte-for-byte present; zero GS/CG strings. 4 chunks c1..c4.
- E DONE 0daea78 (30/30 harness): pins API (toggle/move THROW on misuse → UI must catch kind-style and route to map per §10; getPins normalizes on read), trace discarded at BOTH load and import boundaries, demo id `nb-numopt-demo` with first-open [] / reopen restores / reset re-inits, user notebooks isolated. llm.js needed no change (zero trace imports).
- Orchestrator independently reproduced: normalizePins semantics + legacy import trace-discard in Node before E's report.
- D: all stored trace.code re-run in node:vm == stored rows (117 PASS); notes match §8 matrix byte-wise; GS/CG lexical absence proven.
- B: llm.json repair/retry/backoff/cache/cancel + store import/export via Node harness w/ fetch stubs (53/53).
- Demo provider convention (B): lessons matched by first user-prompt line `TOPIC: <exact name>`; installDemoData({topic_map, lessons:[{topicName,lesson,narration}]}).
- D chunk-boundary commitment for A tuning: c1..c6; expected coverage t1→[c1,c2] covered, t2→[c3,c4] covered, t3→[c5] thin, t4→[c6] thin, t5/t6 → not_found. Watch: CG alias "gradient" matches GD chunks — status must key off distinct-term share.


## Rejected approaches / failure log
| Error | Attempt | Root cause | Decision |
|---|---|---|---|
| scripts/check.mjs syntax FAIL (mid-file reorder) | Track A agent editing §11 checks | Agent interrupted by user mid-repair; file left inconsistent | Resumed Track A agent to reconstruct check.mjs only; engine modules + tests untouched (38/38 pass) |
| Track C "silently hung" 30 min | waited for completion notification | Track C had been KILLED by user stop; killed agents send NO notification (TaskStop reports status: killed) | Lesson: file-mtime silence → probe task status; committed C's working landed output (0314855, four-screen browser probe clean) and relaunched as W2 with plan3 scope |


## Notes
- Submission summary draft (≤1000 chars, plan3-aligned; verify against shipped state at W3):
  "Vertex is an exam-eve study tool for students who skipped the lecture. Paste your notes and syllabus: Vertex shows which topics your notes actually explain, which they only mention, and which they miss entirely — and opens the exact note passage behind every verdict. For the shaky topics it teaches the idea in two sentences, shows what your notes don't explain, and walks you through the short decisions that trip people up (why a downhill step overshoots, why a tiny decrease still fails Armijo). You choose, change your mind, or reveal the reasoning — no scores, no quiz grind. Pin what you want to revisit: your pins build a one-page printable revision sheet for the final hour. Built on the BharatCode model API for topic mapping and explanations on your own notes. Try the curated demo instantly — no key, no network. Notes and pins stay in your browser."
- Human checklist additions: approve deletion of retired app.js/chat.js/data/verify.mjs (classifier-blocked); fill Pages URL + repo URL in README; screenshots per docs/contents.md — AUTOMATION BLOCKED: take_screenshot requires the in-app Browser pane to be open/visible (NATIVE_BROWSER_VIEWPORT_UNAVAILABLE); structural QA unaffected. One-line ready: `gh repo create vertex-exam-ready --public --source . --push` (or agent-run on your word). Deadline/T6 wording still needs the official event page.
- Superseded (was: 6-vs-5 chunk friction): F rebuilt the notebook from actual notes — stored chunks == chunkNotes() (c1..c4), check.mjs asserts consistency.
- Demo bake (human step 4) may not happen → Track D contingency: hand-authored demo/numopt.notebook.json with traces actually executed; README/label must call it a sample notebook if not live-baked.
- Retired files (app.js, chat.js, data/, verify.mjs) deleted at Phase 2, after new index.html lands.
- d9 solo; old chat.js 3000 ms timeout replaced by 60 s abort per §6.3.
