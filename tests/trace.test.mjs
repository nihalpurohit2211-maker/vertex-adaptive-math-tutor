/** Unit tests for src/trace.js Node equivalent (plan §6.7). */
import assert from "node:assert/strict";
import { runTraceNode, staticRejectReason, validateTraceResult } from "../src/trace.js";

const okTrace = "function run() {\n  const rows = [[0, 2], [1, 1.6]];\n  return { columns: ['k', 'x_k'], rows, answer: 'x approaches 0' };\n}";
const third = "function run() {\n  return { columns: ['v'], rows: [[1 / 3, -2 / 3], [1e-9, Number.NaN]], answer: 'x' };\n}";

export const cases = [
  {
    name: "staticRejectReason rejects every forbidden token",
    fn: () => {
      for (const bad of [
        "import('x')",
        "importScripts('u')",
        "fetch('https://evil')",
        "new XMLHttpRequest()",
        "new WebSocket('w://x')",
        "eval('1')",
        "new Function('return 1')()",
        "globalThis.x",
        "self.location",
        "postMessage(1)",
      ]) {
        assert.ok(staticRejectReason(bad), "should reject: " + bad);
      }
      assert.equal(staticRejectReason(okTrace), null);
      assert.equal(staticRejectReason("const important = 1; function run(){return 1;}"), null, "'important' must not trip the import scan");
    },
  },
  {
    name: "runTraceNode computes good code and keeps rows",
    fn: async () => {
      const out = await runTraceNode(okTrace);
      assert.equal(out.computed, true);
      assert.deepEqual(out.result.columns, ["k", "x_k"]);
      assert.deepEqual(out.result.rows, [[0, 2], [1, 1.6]]);
      assert.equal(out.result.answer, "x approaches 0");
    },
  },
  {
    name: "numbers rounded to 4 decimals (scalars and vector cells)",
    fn: async () => {
      const out = await runTraceNode(
        "function run() {\n  return { columns: ['a', 'vec'], rows: [[1 / 3, [2 / 3, 1 / 7]], [-0.00004, [0]]], answer: 'ok' };\n}"
      );
      assert.equal(out.computed, true);
      assert.deepEqual(out.result.rows[0], [0.3333, [0.6667, 0.1429]]);
      assert.equal(out.result.rows[1][0], 0, "tiny negative value rounds to zero (−0 normalized)");
      assert.ok(!Object.is(out.result.rows[1][0], -0));
    },
  },
  {
    name: "NaN and Infinity are rejected",
    fn: async () => {
      const nan = await runTraceNode(third);
      assert.equal(nan.computed, false);
      assert.equal(nan.result, null);
      const inf = await runTraceNode("function run(){ return { columns:['a'], rows:[[1/0]], answer:'x' }; }");
      assert.equal(inf.computed, false);
    },
  },
  {
    name: "forbidden code is rejected before running (never executed)",
    fn: async () => {
      const out = await runTraceNode("function run(){ fetch('http://steal'); return {columns:['a'],rows:[[1]],answer:'x'}; }");
      assert.equal(out.computed, false);
      const out2 = await runTraceNode("function run(){ return {columns:['a'],rows:[[1]],answer:'x'}; }\nimport('node:fs');");
      assert.equal(out2.computed, false);
    },
  },
  {
    name: "infinite loop hits the ~2 s timeout and resolves computed:false (worker terminate on Windows)",
    fn: async () => {
      const t0 = Date.now();
      const out = await runTraceNode("function run(){ while (true) {} }\nrun();");
      const dt = Date.now() - t0;
      assert.equal(out.computed, false);
      assert.equal(out.result, null);
      assert.ok(dt >= 1500 && dt < 5000, "expected roughly the 2 s timeout, took " + dt + " ms");
    },
  },
  {
    name: "crashes, missing run(), and bad shapes resolve computed:false without throwing",
    fn: async () => {
      assert.equal((await runTraceNode("function run(){ throw new Error('boom'); }")).computed, false);
      assert.equal((await runTraceNode("const x = 1;")).computed, false);
      assert.equal((await runTraceNode("function run(){ return 42; }")).computed, false);
      assert.equal((await runTraceNode("function run(){ return { columns: [], rows: [], answer: 'x' }; }")).computed, false);
      assert.equal((await runTraceNode("function run(){ return { columns:['a','b'], rows:[[1]], answer:'x' }; }")).computed, false, "row width mismatch");
      const tooMany = await runTraceNode("function run(){ const rows=[]; for(let i=0;i<9;i++) rows.push([i]); return { columns:['i'], rows, answer:'x' }; }");
      assert.equal(tooMany.computed, false, "more than 8 rows must be rejected");
      assert.equal((await runTraceNode("function run(){ return { columns:['a'], rows:[[1]], answer:'' }; }")).computed, false, "empty answer");
    },
  },
  {
    name: "validateTraceResult normalizes without mutating input",
    fn: () => {
      const raw = { columns: ["a"], rows: [[0.5]], answer: "yes" };
      const out = validateTraceResult(raw);
      assert.deepEqual(out, { columns: ["a"], rows: [[0.5]], answer: "yes" });
      assert.notEqual(out.rows, raw.rows);
      assert.equal(validateTraceResult({ columns: "a", rows: [], answer: "y" }), null);
      assert.equal(validateTraceResult(null), null);
    },
  },
];
