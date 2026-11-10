/** Unit tests for src/plan.js (plan §6.5). */
import assert from "node:assert/strict";
import { buildPlan } from "../src/plan.js";

const topic = (o) => ({
  id: o.id,
  name: o.name || o.id,
  aliases: [],
  unit: "u1",
  kind: "numeric",
  weight: o.weight ?? 3,
  prereqs: o.prereqs || [],
  coverage: { status: o.status || "covered", score: 0.5, chunkIds: [] },
  rating: o.rating ?? null,
  after: o.after ?? null,
  lesson: null,
});

const notebook = (topics, hours = 3) => ({
  id: "nb1",
  title: "t",
  createdAt: "2026-01-01T00:00:00.000Z",
  notes: { raw: "", chunks: [] },
  syllabus: { raw: "", source: "pasted" },
  settings: { hoursToStudy: hours, lang: "en" },
  topics,
});

export const cases = [
  {
    name: "priority formula and ordering (gap × weight with notesBoost)",
    fn: () => {
      const nb = notebook([
        topic({ id: "t1", weight: 3, rating: "kinda", status: "covered" }), // 3*0.6  = 1.8
        topic({ id: "t2", weight: 3, rating: "lost", status: "not_found" }), // 3*1.3 = 3.9
        topic({ id: "t3", weight: 4, rating: "knew", status: "thin" }), // 4*0.25 = 1.0
      ]);
      const plan = buildPlan(nb);
      assert.deepEqual(plan.ordered, ["t2", "t1", "t3"]);
      // budget 180 min: shares 3.9/6.7, 1.8/6.7, 1.0/6.7 → 104.9, 48.4, 26.9 → clamp 20,20,20
      assert.deepEqual(plan.minutesById, { t2: 20, t1: 20, t3: 20 });
      assert.equal(plan.fits.reduce((a, id) => a + plan.minutesById[id], 0) <= 180, true);
    },
  },
  {
    name: "unrated topics use the null gap (0.6)",
    fn: () => {
      const a = buildPlan(notebook([topic({ id: "t1", weight: 2, rating: null })]));
      const b = buildPlan(notebook([topic({ id: "t1", weight: 2, rating: "kinda" })]));
      assert.deepEqual(a.minutesById, b.minutesById);
    },
  },
  {
    name: "minutes clamp to 5..20 with a tight budget",
    fn: () => {
      const nb = notebook(
        [
          topic({ id: "t1", weight: 4, rating: "lost", status: "not_found" }), // p 5.2
          topic({ id: "t2", weight: 3, rating: "kinda", status: "thin" }), // p 2.25
          topic({ id: "t3", weight: 2, rating: "knew", status: "covered" }), // p 0.2
        ],
        0.25 // 15 minutes
      );
      const plan = buildPlan(nb);
      assert.equal(plan.minutesById.t1, 10); // 15*5.2/7.65 = 10.2 → 10
      assert.equal(plan.minutesById.t2, 5); // 4.4 → round 4 → clamp min 5
      assert.equal(plan.minutesById.t3, 5); // 0.4 → round 0 → clamp min 5
      assert.deepEqual(plan.fits, ["t1", "t2"]); // 10 + 5 = 15 ≤ 15
      assert.deepEqual(plan.ifTime, ["t3"]); // would exceed budget
    },
  },
  {
    name: "topological pull-ahead: low-priority prereq moves before dependent",
    fn: () => {
      const nb = notebook([
        topic({ id: "t1", weight: 5, rating: "lost", status: "not_found", prereqs: ["t2"] }),
        topic({ id: "t2", weight: 1, rating: "knew", status: "covered" }),
      ]);
      const plan = buildPlan(nb);
      assert.deepEqual(plan.ordered, ["t2", "t1"]);
    },
  },
  {
    name: "prereq cycles are tolerated (no crash, deterministic order)",
    fn: () => {
      const nb = notebook([
        topic({ id: "t1", weight: 5, rating: "lost", prereqs: ["t2"] }),
        topic({ id: "t2", weight: 3, rating: "kinda", prereqs: ["t1"] }),
        topic({ id: "t3", weight: 1, rating: null }),
      ]);
      const plan = buildPlan(nb);
      assert.equal(plan.ordered.length, 3);
      assert.deepEqual(plan.ordered.slice().sort(), ["t1", "t2", "t3"]);
      const again = buildPlan(notebook([
        topic({ id: "t1", weight: 5, rating: "lost", prereqs: ["t2"] }),
        topic({ id: "t2", weight: 3, rating: "kinda", prereqs: ["t1"] }),
        topic({ id: "t3", weight: 1, rating: null }),
      ]));
      assert.deepEqual(plan.ordered, again.ordered, "deterministic under cycles");
    },
  },
  {
    name: "sheet selection: skip knew and got, priority order, max 6",
    fn: () => {
      const topics = [];
      for (let i = 1; i <= 8; i++) {
        topics.push(topic({ id: `t${i}`, weight: i, rating: "lost", status: "not_found" }));
      }
      topics[0].rating = "knew"; // excluded
      topics[1].after = "got"; // excluded
      const plan = buildPlan(notebook(topics));
      // priorities: t8 > t7 > … > t3 (t1 knew, t2 got)
      assert.deepEqual(plan.sheetIds, ["t8", "t7", "t6", "t5", "t4", "t3"]);
      assert.equal(plan.sheetIds.length, 6);
    },
  },
  {
    name: "prereq warning: lost topic with not-knew prereq warns and prereq goes first",
    fn: () => {
      const nb = notebook([
        topic({ id: "t1", weight: 5, rating: "lost", status: "not_found" }),
        topic({ id: "t2", weight: 2, rating: "kinda", prereqs: ["t1"] }),
        topic({ id: "t3", weight: 4, rating: "lost", prereqs: ["t2"] }),
      ]);
      const plan = buildPlan(nb);
      // t3 lost + prereq t2 kinda → warning; t2 lost? no, t2 is kinda… only t3 qualifies (rating lost).
      assert.deepEqual(plan.prereqWarnings, [{ topicId: "t3", prereqId: "t2" }]);
      assert.equal(plan.ordered[0], "t2");
      assert.ok(plan.ordered.indexOf("t2") < plan.ordered.indexOf("t3"));
    },
  },
  {
    name: "no warning when prereq is rated knew",
    fn: () => {
      const nb = notebook([
        topic({ id: "t1", weight: 1, rating: "knew" }),
        topic({ id: "t2", weight: 5, rating: "lost", prereqs: ["t1"] }),
      ]);
      const plan = buildPlan(nb);
      assert.deepEqual(plan.prereqWarnings, []);
    },
  },
  {
    name: "buildPlan is pure: notebook is never mutated",
    fn: () => {
      const nb = notebook([
        topic({ id: "t1", weight: 5, rating: "lost", status: "not_found", prereqs: ["t2"] }),
        topic({ id: "t2", weight: 1, rating: "kinda" }),
      ]);
      const before = JSON.parse(JSON.stringify(nb));
      buildPlan(nb);
      buildPlan(nb);
      assert.deepEqual(nb, before);
    },
  },
  {
    name: "empty notebook returns empty plan",
    fn: () => {
      const plan = buildPlan(notebook([]));
      assert.deepEqual(plan, { ordered: [], minutesById: {}, fits: [], ifTime: [], sheetIds: [], prereqWarnings: [] });
    },
  },
  {
    name: "dangling prereq ids are ignored",
    fn: () => {
      const plan = buildPlan(notebook([topic({ id: "t1", rating: "lost", prereqs: ["nope"] })]));
      assert.deepEqual(plan.ordered, ["t1"]);
      assert.deepEqual(plan.prereqWarnings, []);
    },
  },
];
