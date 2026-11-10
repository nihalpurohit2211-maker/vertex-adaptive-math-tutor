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
| A Engine | chunk/plan/schema/trace/check.mjs + unit tests | DONE 4687b70 — 38/38 tests, check.mjs 30/31 (only FAIL = CSP meta, Track C's last step) |
| B LLM+store | llm/prompts/store | DONE d50b50a — 53/53 harness PASS |
| C UI | index.html/styles.css/main/render/views | running (index.html already modified; awaiting report) |
| D Content | demo notes/syllabus/reference/README/LICENSE/docs | DONE 172128e — 117 PASS trace re-verification |

## Phase log
- Phase 0: contracts frozen, `dev` branch created. G0 human steps outstanding (repo, key, T1–T4, T6).
- Phase 1 mid-point: B+D committed.
- Plan 3 goal active (22:21). Wave 1 running: Track C (Plan 2 UI, alive — files active 22:24), P3-E (store/prompts), P3-F (schema/check/demo fixture). Tag `v0-trig-mcq` created locally at 32a4471 (push pending human repo).
- Queued: W2 UI wave (light theme §5, scenarios §3/§10 interaction contract, pin UI, 1-page print, trace surface + trace.js/worker deletion) — launches on Track C report to avoid same-file corruption (see failure log). W3: §12 QA matrix + §7 acceptance + README/submission copy from final state.

## Verified working
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
- Accepted friction (A): baked demo stores 6 chunks (D's split); live chunkNotes() merges tiny c5→c6 giving 5. Harmless: demo path never re-chunks, citations resolve against stored chunks, statuses identical. check.mjs compares statuses only.
- Demo bake (human step 4) may not happen → Track D contingency: hand-authored demo/numopt.notebook.json with traces actually executed; README/label must call it a sample notebook if not live-baked.
- Retired files (app.js, chat.js, data/, verify.mjs) deleted at Phase 2, after new index.html lands.
- d9 solo; old chat.js 3000 ms timeout replaced by 60 s abort per §6.3.
