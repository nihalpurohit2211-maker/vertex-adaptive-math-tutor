# STATE.md — single source of truth (orchestrator-maintained)

## Objectives
- Ship Vertex per plan_2.md: notes+syllabus → coverage map → lessons with computed traces → one-page sheet. P0 only. Submit 23:30 IST, freeze 23:15.

## Frozen contracts
- CONTRACTS.md + src/contracts.js v1 (Phase 0, this commit). Tracks report changes; orchestrator edits.

## Track status
| Track | Scope | Status |
|---|---|---|
| A Engine | chunk/plan/schema/trace/check.mjs + unit tests | modules DONE (38/38 tests); check.mjs corrupted by interruption → resumed agent repairing it |
| B LLM+store | llm/prompts/store | DONE d50b50a — 53/53 harness PASS |
| C UI | index.html/styles.css/main/render/views | running (index.html already modified; awaiting report) |
| D Content | demo notes/syllabus/reference/README/LICENSE/docs | DONE 172128e — 117 PASS trace re-verification |

## Phase log
- Phase 0: contracts frozen, `dev` branch created. G0 human steps outstanding (repo, key, T1–T4, T6).
- Phase 1 mid-point: B+D committed.

## Verified working
- D: all stored trace.code re-run in node:vm == stored rows (117 PASS); notes match §8 matrix byte-wise; GS/CG lexical absence proven.
- B: llm.json repair/retry/backoff/cache/cancel + store import/export via Node harness w/ fetch stubs (53/53).
- Demo provider convention (B): lessons matched by first user-prompt line `TOPIC: <exact name>`; installDemoData({topic_map, lessons:[{topicName,lesson,narration}]}).
- D chunk-boundary commitment for A tuning: c1..c6; expected coverage t1→[c1,c2] covered, t2→[c3,c4] covered, t3→[c5] thin, t4→[c6] thin, t5/t6 → not_found. Watch: CG alias "gradient" matches GD chunks — status must key off distinct-term share.


## Rejected approaches / failure log
| Error | Attempt | Root cause | Decision |
|---|---|---|---|
| scripts/check.mjs syntax FAIL (mid-file reorder) | Track A agent editing §11 checks | Agent interrupted by user mid-repair; file left inconsistent | Resumed Track A agent to reconstruct check.mjs only; engine modules + tests untouched (38/38 pass) |


## Notes
- Demo bake (human step 4) may not happen → Track D contingency: hand-authored demo/numopt.notebook.json with traces actually executed; README/label must call it a sample notebook if not live-baked.
- Retired files (app.js, chat.js, data/, verify.mjs) deleted at Phase 2, after new index.html lands.
- d9 solo; old chat.js 3000 ms timeout replaced by 60 s abort per §6.3.
