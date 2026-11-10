# STATE.md — single source of truth (orchestrator-maintained)

## Objectives
- Ship Vertex per plan_2.md: notes+syllabus → coverage map → lessons with computed traces → one-page sheet. P0 only. Submit 23:30 IST, freeze 23:15.

## Frozen contracts
- CONTRACTS.md + src/contracts.js v1 (Phase 0, this commit). Tracks report changes; orchestrator edits.

## Track status
| Track | Scope | Status |
|---|---|---|
| A Engine | chunk/plan/schema/trace/check.mjs + unit tests | spawned |
| B LLM+store | llm/prompts/store | spawned |
| C UI | index.html/styles.css/main/render/views | spawned |
| D Content | demo notes/syllabus/reference/README/LICENSE/docs | spawned |

## Phase log
- Phase 0: contracts frozen, `dev` branch created. G0 human steps outstanding (repo, key, T1–T4, T6).

## Verified working
- (none yet)

## Rejected approaches / failure log
| Error | Attempt | Root cause | Decision |
|---|---|---|---|
| — | — | — | nothing logged yet |

## Notes
- Demo bake (human step 4) may not happen → Track D contingency: hand-authored demo/numopt.notebook.json with traces actually executed; README/label must call it a sample notebook if not live-baked.
- Retired files (app.js, chat.js, data/, verify.mjs) deleted at Phase 2, after new index.html lands.
- d9 solo; old chat.js 3000 ms timeout replaced by 60 s abort per §6.3.
