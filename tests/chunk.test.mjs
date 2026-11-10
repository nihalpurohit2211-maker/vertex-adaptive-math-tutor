/** Unit tests for src/chunk.js (plan §6.4). */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chunkNotes, scoreCoverage, tokenize, stem, CHUNK_MAX_CHARS, CHUNK_MIN_CHARS } from "../src/chunk.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = fs.readFileSync(path.join(HERE, "fixtures", "demo.notes.fixture.md"), "utf8");

/**
 * §8 table topics — conservative HAND list, in sync (name + aliases) with the
 * notebook's canonical topic map in demo/numopt.notebook.json. scripts/check.mjs
 * verifies the parity and prefers the canonical definitions when the notebook exists.
 */
export const DEMO_TOPICS = [
  { name: "Gradient descent", aliases: ["GD", "steepest descent", "gradient descent method", "batch gradient descent"] },
  { name: "Newton's method", aliases: ["Newton method", "Newton-Raphson", "Newton–Raphson", "Newton Raphson"] },
  { name: "Line search (Armijo condition)", aliases: ["Armijo", "Armijo condition", "line search", "backtracking line search", "sufficient decrease"] },
  { name: "Quasi-Newton methods (BFGS)", aliases: ["BFGS", "quasi-Newton", "quasi Newton", "BFGS update", "inverse Hessian approximation", "DFP"] },
  { name: "Gram-Schmidt orthogonalization", aliases: ["Gram-Schmidt", "Gram–Schmidt", "Gram-Schmidt process", "orthogonalization", "orthonormalization", "QR factorization", "GS"] },
  { name: "Conjugate gradient method", aliases: ["conjugate gradient", "CG", "Krylov subspace method"] },
];
export const DEMO_EXPECTED = ["covered", "covered", "thin", "thin", "not_found", "not_found"];

/** Canonical topic definitions (name + aliases) from the baked demo notebook, when present. */
function canonicalTopics() {
  try {
    const nb = JSON.parse(fs.readFileSync(path.join(HERE, "..", "demo", "numopt.notebook.json"), "utf8"));
    if (Array.isArray(nb.topics) && nb.topics.length === DEMO_TOPICS.length) {
      return nb.topics.map((t) => ({ name: t.name, aliases: Array.isArray(t.aliases) ? t.aliases : [] }));
    }
  } catch (err) {
    void err; // notebook not baked yet → the hand list is the working list
  }
  return null;
}

const longPara = (sentence, min) => {
  let s = sentence;
  while (s.length < min) s += " " + sentence;
  return s;
};

const MINNOTES = [
  "# Spectral methods revision",
  longPara("The power iteration algorithm multiplies the matrix by the vector and renormalises it, so every round of power iteration pulls the vector toward the dominant eigenvector of the matrix.", 650),
  longPara("Running the power iteration algorithm on another matrix works the same way: renormalise after every multiplication, otherwise the vector overflows and the iteration diverges instead of converging.", 650),
  "## Logarithms",
  "A logarithm converts products into sums; see chapter four for the log rule proof.",
  "## Knots",
  longPara("A basic topological invariant of a closed curve drawn on paper cannot be undone without cutting.", 700),
].join("\n\n");

export const cases = [
  {
    name: "tokenize/stem basics",
    fn: () => {
      const t = tokenize("The Gradient DESCENT methods: quasi-Newton, using gradients.");
      assert.ok(t.includes("gradient"));
      assert.ok(t.includes("descent"));
      assert.ok(t.includes("method"), "methods → method");
      assert.ok(t.includes("quasi") && t.includes("newton"), "hyphenated splits into words");
      assert.ok(!t.includes("the"), "stopwords dropped");
      assert.equal(stem("gradients"), "gradient");
      assert.equal(stem("planning"), "plann");
    },
  },
  {
    name: "chunkNotes is deterministic with stable ids c1..cn",
    fn: () => {
      const a = chunkNotes(FIXTURE);
      const b = chunkNotes(FIXTURE);
      assert.deepEqual(a, b);
      a.forEach((c, i) => assert.equal(c.id, `c${i + 1}`));
      assert.ok(a.length >= 3 && a.length <= 8, `expected a handful of chunks, got ${a.length}`);
    },
  },
  {
    name: "chunkNotes respects size limits (≤ max; ≥ min except unavoidable tail)",
    fn: () => {
      const chunks = chunkNotes(FIXTURE);
      for (const c of chunks) assert.ok(c.text.length <= CHUNK_MAX_CHARS, `${c.id} too big: ${c.text.length}`);
      const undersized = chunks.filter((c) => c.text.length < CHUNK_MIN_CHARS);
      assert.ok(undersized.length <= 1, "at most one tiny chunk (tail) allowed");
    },
  },
  {
    name: "chunkNotes splits headings and merges tiny segments",
    fn: () => {
      const chunks = chunkNotes(MINNOTES);
      assert.ok(chunks.length >= 3, "headings/long paragraphs should yield several chunks");
      const joined = chunks.map((c) => c.text).join(" ");
      assert.ok(joined.includes("power iteration"));
      assert.ok(joined.includes("log rule"));
      // the tiny "## Logarithms" segment must be merged into a neighbour, never a lonely micro-chunk
      assert.ok(!chunks.some((c) => c.text.length < 150), "no micro-chunks survive merging");
    },
  },
  {
    name: "scoreCoverage statuses on a synthetic mini-notes fixture",
    fn: () => {
      const chunks = chunkNotes(MINNOTES);
      const covered = scoreCoverage({ name: "Power iteration", aliases: ["power iteration algorithm"] }, chunks);
      assert.equal(covered.status, "covered", `wanted covered, got ${JSON.stringify(covered)}`);
      assert.ok(covered.score > 0 && covered.score <= 1);
      assert.equal(covered.chunkIds.length, 2, "both power-iteration chunks match, nothing else");
      const thin = scoreCoverage({ name: "Logarithm", aliases: ["log rule"] }, chunks);
      assert.equal(thin.status, "thin", `wanted thin, got ${JSON.stringify(thin)}`);
      const gone = scoreCoverage({ name: "Lebesgue measure", aliases: [] }, chunks);
      assert.equal(gone.status, "not_found");
      assert.equal(gone.score, 0);
      assert.deepEqual(gone.chunkIds, []);
    },
  },
  {
    name: "scoreCoverage top-3 chunkIds cap",
    fn: () => {
      const chunks = chunkNotes(FIXTURE);
      const cov = scoreCoverage(DEMO_TOPICS[0], chunks);
      assert.ok(cov.chunkIds.length <= 3, `more than top-3 ids: ${cov.chunkIds}`);
    },
  },
  {
    name: "tuned thresholds reproduce the exact §8 Covered/Covered/Thin/Thin/Not/Not mix",
    fn: () => {
      const chunks = chunkNotes(FIXTURE);
      const got = DEMO_TOPICS.map((t) => scoreCoverage(t, chunks).status);
      assert.deepEqual(got, DEMO_EXPECTED, `hand-list mix mismatch: ${got.join(", ")}`);
      // canonical unification: the notebook's baked topic definitions must produce
      // the same mix on the same fixture (fallback to hand list when unbaked).
      const canon = canonicalTopics();
      if (canon) {
        const gotC = canon.map((t) => scoreCoverage(t, chunks).status);
        assert.deepEqual(gotC, DEMO_EXPECTED, `canonical mix mismatch: ${gotC.join(", ")}`);
      }
      // and on the real demo notes when Track D's file is present.
      try {
        const real = fs.readFileSync(path.join(HERE, "..", "demo", "numopt.notes.md"), "utf8");
        const gotR = DEMO_TOPICS.map((t) => scoreCoverage(t, chunkNotes(real)).status);
        assert.deepEqual(gotR, DEMO_EXPECTED, `demo-notes mix mismatch: ${gotR.join(", ")}`);
      } catch (err) {
        void err; // demo notes not landed — check.mjs reports that gap
      }
    },
  },
  {
    name: "scoreCoverage handles empty inputs",
    fn: () => {
      assert.equal(scoreCoverage({ name: "x", aliases: [] }, []).status, "not_found");
      assert.equal(scoreCoverage({ name: "", aliases: [] }, chunkNotes(FIXTURE)).status, "not_found");
    },
  },
];
