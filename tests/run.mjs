#!/usr/bin/env node
/** Trivial test runner: imports each *.test.mjs suite and runs its cases with node:assert. */
import * as chunkSuite from "./chunk.test.mjs";
import * as planSuite from "./plan.test.mjs";
import * as schemaSuite from "./schema.test.mjs";
import * as traceSuite from "./trace.test.mjs";

const suites = [
  { name: "chunk", cases: chunkSuite.cases },
  { name: "plan", cases: planSuite.cases },
  { name: "schema", cases: schemaSuite.cases },
  { name: "trace", cases: traceSuite.cases },
];

let passed = 0;
const failures = [];
for (const suite of suites) {
  console.log("\n== " + suite.name + " ==");
  for (const c of suite.cases) {
    const label = `${suite.name}: ${c.name}`;
    try {
      await c.fn();
      passed += 1;
      console.log(`  ok    ${c.name}`);
    } catch (err) {
      failures.push({ label, err });
      console.log(`  FAIL  ${c.name}`);
      console.log("        " + String(err && err.message ? err.message : err).split("\n").join("\n        "));
    }
  }
}

console.log(`\n${passed} passed, ${failures.length} failed (${passed + failures.length} total)`);
process.exit(failures.length === 0 ? 0 : 1);
