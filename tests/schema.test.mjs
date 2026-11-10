/** Unit tests for src/schema.js (plan 6.6 + JSON repair). */
import assert from "node:assert/strict";
import {
  contentOverlap,
  enforceCitations,
  firstBalancedJson,
  stripFences,
  stripThink,
  validateLesson,
  validateTopicMap,
} from "../src/schema.js";

// Think-tag literals built by concatenation so no reply-formatting parser sees them.
const OPEN_THINK = "<" + "think>";
const CLOSE_THINK = "<" + "/think>";

const CHUNKS = [
  {
    id: "c1",
    text: "Gradient descent multiplies the learning rate by the gradient vector at each iteration and subtracts it from the current point until the gradient norm falls below the tolerance.",
  },
  {
    id: "c2",
    text: "Newton method uses the Hessian of second partial derivatives to build a quadratic model and solves the linear system for the step.",
  },
];

const item = (text, source, chunkIds) => ({ text, source, chunkIds });

const goodLesson = (over = {}) => ({
  oneLiner: "Take steps against the gradient.",
  why: "It needs only first derivatives.",
  analogy: "Walking blindfolded down a hill.",
  steps: [item("compute the gradient vector at the current point", "notes", ["c1"])],
  pitfalls: [item("a learning rate that is too big diverges", "vertex", [])],
  notesGaps: ["No stopping rule is explained."],
  trace: {
    title: "Gradient descent on f(x)=x^2",
    code: "function run(){ return { columns:['k','x'], rows:[[0,2],[1,1.6]], answer:'x approaches 0' }; }",
    computed: true,
    result: { columns: ["k", "x"], rows: [[0, 2], [1, 1.6]], answer: "x approaches 0" },
    narration: ["Start at x=2.", "After one step x=1.6."],
    takeaway: "Each step shrinks x toward 0.",
  },
  diagramMermaid: null,
  examQuestion: { q: "State the gradient descent update.", modelAnswer: "x_{k+1}=x_k-alpha*grad.", source: "vertex" },
  meta: { provider: "bharatcode", model: "qwen-3.8-27b", at: "2026-01-01T00:00:00Z" },
  ...over,
});

const goodTopicMap = () => ({
  topics: [
    { id: "t1", name: "Gradient descent", aliases: [], unit: "u1", kind: "numeric", weight: 4, prereqs: [] },
    { id: "t2", name: "Newton", aliases: [], unit: "u1", kind: "numeric", weight: 3, prereqs: ["t1"] },
    { id: "t3", name: "Armijo", aliases: [], unit: "u1", kind: "conceptual", weight: 2, prereqs: ["t1"] },
    { id: "t4", name: "BFGS", aliases: [], unit: "u2", kind: "numeric", weight: 3, prereqs: ["t2"] },
    { id: "t5", name: "Gram-Schmidt", aliases: [], unit: "u3", kind: "numeric", weight: 2, prereqs: [] },
  ],
});

export const cases = [
  {
    name: "stripThink removes closed and stray tags",
    fn: () => {
      assert.equal(stripThink(OPEN_THINK + "hidden answer" + CLOSE_THINK + "result"), "result");
      assert.equal(stripThink("plain text"), "plain text");
      assert.equal(stripThink(OPEN_THINK + "unclosed tail"), "unclosed tail"); // content survives, tag is stripped
      assert.equal(stripThink("THINKING" + OPEN_THINK + "x" + CLOSE_THINK + "ok"), "THINKINGok");
    },
  },
  {
    name: "stripFences removes markdown code fences",
    fn: () => {
      const fenced = "```json\n{\"a\": 1}\n```";
      assert.equal(JSON.parse(stripFences(fenced)).a, 1);
      assert.equal(JSON.parse(stripFences("```\n{\"a\": 2}\n```")).a, 2);
      assert.equal(stripFences("{\"a\": 3}"), "{\"a\": 3}");
    },
  },
  {
    name: "firstBalancedJson extracts the first balanced object",
    fn: () => {
      assert.equal(firstBalancedJson("prose {\"a\": {\"b\": 1}} more"), "{\"a\": {\"b\": 1}}");
      assert.equal(JSON.parse(firstBalancedJson("text {\"s\": \"brace } inside\"} x")).s, "brace } inside");
      assert.equal(JSON.parse(firstBalancedJson("text {\"s\": \"escaped \\\"}\"} x")).s, "escaped \"}");
      assert.equal(firstBalancedJson('{"unclosed": 1'), null);
      assert.equal(firstBalancedJson("no object here"), null);
    },
  },
  {
    name: "validateTopicMap accepts a good map",
    fn: () => {
      assert.equal(validateTopicMap(goodTopicMap()), true);
    },
  },
  {
    name: "validateTopicMap rejects bad maps with messages",
    fn: () => {
      const dup = goodTopicMap();
      dup.topics[1].id = "t1";
      assert.ok(validateTopicMap(dup).some((e) => /duplicate/.test(e)));

      const badWeight = goodTopicMap();
      badWeight.topics[0].weight = 6;
      assert.ok(validateTopicMap(badWeight).some((e) => /weight/.test(e)));

      const badKind = goodTopicMap();
      badKind.topics[0].kind = "algebraic";
      assert.ok(validateTopicMap(badKind).some((e) => /kind/.test(e)));

      const dangling = goodTopicMap();
      dangling.topics[0].prereqs = ["nope"];
      assert.ok(validateTopicMap(dangling).some((e) => /not an id/.test(e)));

      const cyclic = goodTopicMap();
      cyclic.topics[0].prereqs = ["t2"]; // t1 <-> t2
      assert.ok(validateTopicMap(cyclic).some((e) => /cycle/i.test(e)));

      const tooFew = { topics: goodTopicMap().topics.slice(0, 3) };
      assert.ok(validateTopicMap(tooFew).some((e) => /5-12/.test(e)));

      assert.ok(Array.isArray(validateTopicMap(null)));
      assert.ok(validateTopicMap({ topics: "nope" }).length >= 1);
    },
  },
  {
    name: "validateLesson accepts a conforming numeric lesson",
    fn: () => {
      assert.equal(validateLesson(goodLesson(), "numeric"), true);
      const conceptual = goodLesson({ trace: null });
      assert.equal(validateLesson(conceptual, "conceptual"), true);
    },
  },
  {
    name: "validateLesson enforces 6.2 shapes",
    fn: () => {
      const sixSteps = goodLesson();
      sixSteps.steps = Array.from({ length: 6 }, (_, i) => item("step " + i, "vertex", []));
      assert.ok(validateLesson(sixSteps, "conceptual").some((e) => /at most 5/.test(e)));

      const manyRows = goodLesson();
      manyRows.trace.result.rows = Array.from({ length: 9 }, (_, i) => [i, i]);
      assert.ok(validateLesson(manyRows, "numeric").some((e) => /at most 8 rows/.test(e)));

      const ragged = goodLesson();
      ragged.trace.result.rows = [[0, 1, 2]];
      assert.ok(validateLesson(ragged, "numeric").some((e) => /cells but 2 columns/.test(e)));

      const noTrace = goodLesson({ trace: null });
      assert.ok(validateLesson(noTrace, "numeric").some((e) => /trace/.test(e)));
      assert.equal(validateLesson(noTrace, "conceptual"), true);

      const noExam = goodLesson();
      delete noExam.examQuestion;
      assert.ok(validateLesson(noExam, "conceptual").some((e) => /examQuestion/.test(e)));

      const badSource = goodLesson();
      badSource.steps = [item("x".repeat(3), "wikipedia", [])];
      assert.ok(validateLesson(badSource, "conceptual").some((e) => /source/.test(e)));

      const badTraceShape = goodLesson();
      badTraceShape.trace.code = "";
      assert.ok(validateLesson(badTraceShape, "numeric").some((e) => /trace\.code/.test(e)));

      const noAnswer = goodLesson();
      delete noAnswer.trace.result.answer;
      assert.ok(validateLesson(noAnswer, "numeric").some((e) => /answer/.test(e)));
    },
  },
  {
    name: "contentOverlap measures claim-to-chunk overlap",
    fn: () => {
      const high = contentOverlap("compute the gradient vector at the current point", CHUNKS[0].text);
      assert.ok(high >= 0.6, "expected high overlap, got " + high);
      const low = contentOverlap("the mitochondria is the powerhouse of the cell", CHUNKS[0].text);
      assert.ok(low <= 0.2, "expected low overlap, got " + low);
    },
  },
  {
    name: "enforceCitations keeps verified notes claims and demotes unverified ones",
    fn: () => {
      const lesson = goodLesson();
      lesson.steps = [
        item("subtract the gradient vector times the learning rate from the current point", "notes", ["c1"]), // verified
        item("the hessian is inverted at every single iteration of the outer loop", "notes", ["c1"]), // low overlap
        item("the iteration converges cubically for saddle points", "notes", ["c99"]), // unknown chunk
        item("an everyday analogy is walking downhill blindfolded", "vertex", []), // untouched
      ];
      lesson.pitfalls = [item("the gradient norm falls below the tolerance", "notes", ["c1"])];
      const before = JSON.parse(JSON.stringify(lesson));
      const out = enforceCitations(lesson, CHUNKS, { status: "covered", score: 0.9, chunkIds: ["c1"] });
      assert.equal(out.steps[0].source, "notes");
      assert.deepEqual(out.steps[0].chunkIds, ["c1"]);
      assert.equal(out.steps[1].source, "vertex");
      assert.deepEqual(out.steps[1].chunkIds, []);
      assert.equal(out.steps[2].source, "vertex");
      assert.equal(out.steps[3].source, "vertex");
      assert.deepEqual(out.steps[3].chunkIds, []);
      assert.equal(out.pitfalls[0].source, "notes");
      assert.deepEqual(lesson, before, "input lesson must not be mutated");
      assert.notEqual(out, lesson);
    },
  },
  {
    name: "enforceCitations: notes claim citing an existing chunk with low overlap demotes",
    fn: () => {
      const lesson = goodLesson();
      lesson.examQuestion = { q: "Define the Newton step.", modelAnswer: "d = minus H inverse g.", source: "notes" };
      const out = enforceCitations(lesson, CHUNKS, { status: "thin", score: 0.5, chunkIds: ["c2"] });
      // examQuestion has no chunkIds to verify against → unconditionally demoted
      assert.equal(out.examQuestion.source, "vertex");
    },
  },
  {
    name: "enforceCitations forces everything to vertex when coverage is not_found",
    fn: () => {
      const lesson = goodLesson();
      lesson.steps = [item("subtract the gradient vector times the learning rate from the current point", "notes", ["c1"])];
      const out = enforceCitations(lesson, CHUNKS, { status: "not_found", score: 0, chunkIds: [] });
      assert.equal(out.steps[0].source, "vertex");
      assert.deepEqual(out.steps[0].chunkIds, []);
      assert.equal(out.examQuestion.source, "vertex");
      assert.ok(out.trace, "trace carried through");
      assert.equal(out.trace.code, lesson.trace.code);
    },
  },
];
