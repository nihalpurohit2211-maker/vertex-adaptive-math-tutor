#!/usr/bin/env node
/**
 * check.mjs — all automated QA for Vertex (plan3 §9/§10/§12; replaces the
 * plan 2 §11 trace re-verification with content/revision checks). Exit 0 only
 * if every hard check passes. Files owned by tracks still in flight (Track C:
 * index.html, styles.css, src/main.js, src/render.js, src/views/*; agent E:
 * src/store.js pins/import boundary) produce specific FAIL rows — labeled
 * FAIL-owner-B / "Track C in flight" — never a crash.
 *
 * Checks:
 *  1. required files exist (incl. demo/numopt.scenarios.json); in-flight
 *     Track C files reported separately
 *  2. secret-like strings scan + .gitignore sanity
 *  3. no `innerHTML =` outside src/render.js; no inline on*= handlers
 *  4. demo notebook: parses, schema.js validation + §6.2-shape (trace-free),
 *     notes.raw byte-identical to demo/numopt.notes.md, chunks chunkNotes-consistent
 *  5. every stored `notes` citation points at an existing chunk (§6.6) and
 *     survives enforceCitations re-verification unchanged
 *  6. plan3 §9 fixture: the four exact excerpt strings are present byte-for-byte
 *     in the notes (file + notes.raw) and inside stored chunks; no
 *     Gram–Schmidt / conjugate gradient text anywhere in the notes
 *  7. plan3 v3 notebook contract: zero `trace` keys, six topics t1..t6 in §9
 *     order/labels, curated coverage statuses == §9 table, revisionPins == [],
 *     lesson takeaway == §9 "What to remember", meta marked curated
 *  8. demo/numopt.scenarios.json: parses, exactly 2 scenarios, stable option
 *     ids a1..a3/b1..b2, every choice has a reveal, §3 copy contract
 *  9. pins normalization via src/store.js normalizePins (Addendum v3) —
 *     FAIL-owner-B if the export is not in place yet (agent E in flight)
 * 10. legacy import safety: old notebook with lesson.trace + stale/duplicate
 *     revisionPins imports with trace discarded and pins normalized
 *     (FAIL-owner-B fallback)
 * 11. coverage ENGINE probe (informational + floor checks): scoreCoverage on
 *     the NEW demo notes with the notebook topic names+aliases must give
 *     t1/t2 covered and t3/t4 covered-or-thin; full live statuses vs the
 *     curated §9 table are printed as INFO (plan3 §9: thresholds are NOT
 *     tuned to the fixture). Fixture probes stay hard: canonical and hand
 *     lists must still give the exact §8 mix on tests/fixtures/demo.notes.fixture.md
 * 12. hand-list parity with the canonical notebook list (drift guard)
 * 13. plan.js sanity on the demo notebook (§6.5 invariants; pure — skipped
 *     gracefully if lesson shapes changed)
 * 14. CDN pins + SRI + CSP meta in index.html (when Track C's file has landed)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chunkNotes, scoreCoverage, queryTerms } from "../src/chunk.js";
import { buildPlan } from "../src/plan.js";
import { validateLesson, validateTopicMap, enforceCitations } from "../src/schema.js";
import { COVERAGE_STATUSES, RATINGS, AFTER_STATES, DEFAULTS } from "../src/contracts.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rows = [];
const infos = [];
const add = (name, ok, detail) => rows.push({ name, ok, detail: detail || "" });
const addInfo = (name, detail) => infos.push({ name, detail });

function readText(rel) {
  try {
    return fs.readFileSync(path.join(ROOT, rel), "utf8");
  } catch (err) {
    void err;
    return null;
  }
}

function walk(rel, acc) {
  const abs = path.join(ROOT, rel);
  let entries;
  try {
    entries = fs.readdirSync(abs, { withFileTypes: true });
  } catch (err) {
    void err;
    return acc;
  }
  for (const e of entries) {
    const r = rel ? rel + "/" + e.name : e.name;
    if (e.isDirectory()) {
      if (![".git", "node_modules", ".qoder"].includes(e.name)) walk(r, acc);
    } else {
      acc.push(r);
    }
  }
  return acc;
}

const TEXT_EXT = new Set([".js", ".mjs", ".cjs", ".html", ".css", ".json", ".md", ".txt"]);
// Legacy files retired at Phase 2 (STATE.md) — scanned for secrets, but the
// render rules only apply to the new app (index.html + src/** + worker/**).
const LEGACY = new Set(["app.js", "chat.js", "verify.mjs", "vertex_plan_2.md", "vertex_plan_v2.md", "screenshot.png"]);

// ---- plan3 §9 curated fixture table ------------------------------------------
// status / exact excerpt / §9 card "What to remember" per demo topic, in demo order.
const FIXTURE_TABLE = [
  {
    id: "t1",
    name: "Gradient descent",
    status: "covered",
    excerpt:
      "Use the negative gradient as the downhill direction. The learning rate controls the step size. A step that is too large can overshoot the minimum.",
    takeaway: "The direction tells you where to go. Step size controls how far you go. Armijo checks for sufficient decrease.",
  },
  {
    id: "t2",
    name: "Newton\u2019s method",
    status: "covered",
    excerpt:
      "Use the gradient and local curvature to choose an update. In one dimension the Newton update divides the derivative by the second derivative when that curvature is usable.",
    takeaway: "Newton uses curvature directly. BFGS updates an approximation.",
  },
  {
    id: "t3",
    name: "Armijo line search",
    status: "thin",
    excerpt: "Armijo = sufficient decrease. Need to revise the condition.",
    takeaway: "A lower objective value alone can still fail the test.",
  },
  {
    id: "t4",
    name: "Quasi-Newton / BFGS",
    status: "thin",
    excerpt: "BFGS updates a Hessian approximation using changes in position and gradient.",
    takeaway: "The update reuses information from earlier steps.",
  },
  {
    id: "t5",
    name: "Gram\u2013Schmidt",
    status: "not_found",
    excerpt: null,
    takeaway: "Orthogonal vectors have zero dot product. Orthonormal vectors also have unit length.",
  },
  {
    id: "t6",
    name: "Conjugate gradient",
    status: "not_found",
    excerpt: null,
    takeaway: "Conjugacy uses the matrix-weighted inner product.",
  },
];

// ---- 1. Required files --------------------------------------------------------
const REQUIRED = [
  "LICENSE",
  "BharatCode.txt",
  "README.md",
  "demo/numopt.notebook.json",
  "demo/numopt.notes.md",
  "demo/numopt.syllabus.txt",
  "demo/numopt.scenarios.json",
];
for (const f of REQUIRED) {
  const present = fs.existsSync(path.join(ROOT, f));
  add(`file exists: ${f}`, present, present ? "" : "MISSING (owner: Track D / G0)");
}
// App files owned by the in-flight Track C UI scope. Missing → FAIL row, not crash.
const TRACK_C_FILES = [
  "index.html",
  "styles.css",
  "src/main.js",
  "src/render.js",
  "src/views/setup.js",
  "src/views/map.js",
  "src/views/lesson.js",
  "src/views/sheet.js",
  "src/views/settings.js",
];
for (const f of TRACK_C_FILES) {
  const present = fs.existsSync(path.join(ROOT, f));
  add(`file exists: ${f}`, present, present ? "" : "not landed yet (Track C in flight)");
}

// ---- 2. Secrets + .gitignore ----------------------------------------------------
const allFiles = walk("", []);
const secretPatterns = [
  ["Google API key (AIza...)", /AIza[0-9A-Za-z_-]{10,}/],
  ["secret token (sk-...)", /\bsk-[A-Za-z0-9_-]{8,}\b/],
  ["literal Bearer token", /Bearer\s+[A-Za-z0-9._-]{12,}/],
];
const secretHits = [];
for (const f of allFiles) {
  if (!TEXT_EXT.has(path.extname(f))) continue;
  const text = readText(f);
  if (text === null) continue;
  for (const [label, re] of secretPatterns) {
    const m = text.match(re);
    if (m) secretHits.push(`${f}: ${label} -> "${m[0].slice(0, 18)}..."`);
  }
}
add("no secret-like strings in repo", secretHits.length === 0, secretHits.join("; "));

const gitignore = readText(".gitignore");
if (gitignore === null) {
  add(".gitignore sanity", false, ".gitignore missing");
} else {
  const need = [".env", "node_modules"];
  const missing = need.filter((p) => !gitignore.includes(p));
  add(".gitignore sanity", missing.length === 0, missing.length ? "should ignore: " + missing.join(", ") : "");
}

// ---- 3. innerHTML + inline handlers ---------------------------------------------
const appScope = allFiles.filter(
  (f) =>
    !LEGACY.has(f) &&
    TEXT_EXT.has(path.extname(f)) &&
    (f.startsWith("src/") || f === "index.html" || f.startsWith("worker/"))
);
const innerHits = [];
const onHits = [];
for (const f of appScope) {
  const text = readText(f);
  if (text === null) continue;
  if (f !== "src/render.js" && /innerHTML\s*=[^=]/.test(text)) innerHits.push(f);
  // attribute-style onclick= inside a tag; template strings like
  // `onclick=${...}` never match because a real tag needs "<tag ... on*=".
  if (/<[a-zA-Z][^>]*\son[a-z]+\s*=/i.test(text)) onHits.push(f);
}
add("no innerHTML= outside src/render.js", innerHits.length === 0, innerHits.length ? "found in: " + innerHits.join(", ") : "");
add("no inline on*= handlers (html/js)", onHits.length === 0, onHits.length ? "found in: " + onHits.join(", ") : "");

// ---- Hand list (§8/§9 topics, conservative aliases) -----------------------------
/**
 * Conservative hand list kept in CONTRACTS-era form; serves the engine-fixture
 * regression probe and the drift guard against the notebook's canonical list.
 */
const HAND_TOPICS = [
  { id: "t1", name: "Gradient descent", aliases: ["GD", "steepest descent", "gradient descent method", "batch gradient descent"] },
  { id: "t2", name: "Newton's method", aliases: ["Newton method", "Newton-Raphson", "Newton\u2013Raphson", "Newton Raphson"] },
  { id: "t3", name: "Line search (Armijo condition)", aliases: ["Armijo", "Armijo condition", "line search", "backtracking line search", "sufficient decrease"] },
  { id: "t4", name: "Quasi-Newton methods (BFGS)", aliases: ["BFGS", "quasi-Newton", "quasi Newton", "BFGS update", "inverse Hessian approximation", "DFP"] },
  { id: "t5", name: "Gram-Schmidt orthogonalization", aliases: ["Gram-Schmidt", "Gram\u2013Schmidt", "Gram-Schmidt process", "orthogonalization", "orthonormalization", "QR factorization", "GS"] },
  { id: "t6", name: "Conjugate gradient method", aliases: ["conjugate gradient", "CG", "Krylov subspace method"] },
];
const EXPECTED_MIX = ["covered", "covered", "thin", "thin", "not_found", "not_found"];

function mixReport(topics, notesText) {
  const chunks = chunkNotes(notesText);
  const got = topics.map((t) => scoreCoverage(t, chunks));
  const statuses = got.map((c) => c.status);
  return {
    ok: statuses.join(",") === EXPECTED_MIX.join(","),
    statuses,
    detail: topics
      .map((t, i) => `${t.id}=${statuses[i]}(${got[i].score},[${got[i].chunkIds.join(",")}])`)
      .join(" "),
  };
}

// ---- 4-7. Demo notebook ------------------------------------------------------------
const NOTEBOOK_REL = "demo/numopt.notebook.json";
const NOTES_REL = "demo/numopt.notes.md";
const notebookRaw = readText(NOTEBOOK_REL);
const notesFile = readText(NOTES_REL);
let notebook = null;
if (notebookRaw === null) {
  add("demo notebook parses", false, NOTEBOOK_REL + " missing");
} else {
  try {
    notebook = JSON.parse(notebookRaw);
    add("demo notebook parses", true);
  } catch (err) {
    add("demo notebook parses", false, "invalid JSON: " + err.message);
  }
}

const nbTopics = Array.isArray(notebook?.topics) ? notebook.topics : null;
const canonicalTopics =
  nbTopics && nbTopics.length === HAND_TOPICS.length
    ? nbTopics
        .slice()
        .sort((a, b) => (parseInt(String(a.id).replace(/\D/g, ""), 10) || 0) - (parseInt(String(b.id).replace(/\D/g, ""), 10) || 0))
        .map((t) => ({ id: t.id, name: t.name, aliases: Array.isArray(t.aliases) ? t.aliases : [] }))
    : null;

if (notebook) {
  const shapeErrors = [];
  for (const key of ["id", "title", "createdAt"]) {
    if (typeof notebook[key] !== "string" || !notebook[key]) shapeErrors.push(`${key}: must be a non-empty string`);
  }
  const chunkList = Array.isArray(notebook?.notes?.chunks) ? notebook.notes.chunks : [];
  if (!Array.isArray(notebook?.notes?.chunks)) shapeErrors.push("notes.chunks: must be an array");
  if (typeof notebook?.notes?.raw !== "string" || !notebook.notes.raw) shapeErrors.push("notes.raw: must be a non-empty string");
  const seenChunkIds = new Set();
  chunkList.forEach((c, i) => {
    if (!c || typeof c.id !== "string" || typeof c.text !== "string" || !c.text) shapeErrors.push(`notes.chunks[${i}]: must be { id, text } with non-empty strings`);
    else if (seenChunkIds.has(c.id)) shapeErrors.push(`notes.chunks[${i}]: duplicate id ${c.id}`);
    else seenChunkIds.add(c.id);
  });
  if (!["pasted", "auto"].includes(notebook?.syllabus?.source)) shapeErrors.push(`syllabus.source: must be "pasted" or "auto" (got ${JSON.stringify(notebook?.syllabus?.source)})`);
  if (typeof notebook?.syllabus?.raw !== "string") shapeErrors.push("syllabus.raw: must be a string");
  const hours = Number(notebook?.settings?.hoursToStudy);
  if (!Number.isFinite(hours) || hours <= 0) shapeErrors.push("settings.hoursToStudy: must be a positive number");
  if (!["en", "hinglish"].includes(notebook?.settings?.lang)) shapeErrors.push(`settings.lang: must be "en" or "hinglish"`);

  const topics = Array.isArray(notebook.topics) ? notebook.topics : [];
  if (!Array.isArray(notebook.topics) || topics.length === 0) shapeErrors.push("topics: must be a non-empty array");
  const tm = validateTopicMap({ topics });
  if (tm !== true) tm.forEach((e) => shapeErrors.push("topic_map." + e));

  // notes.raw byte-identical to the notes file; stored chunks chunkNotes-consistent.
  if (notesFile === null) {
    shapeErrors.push("demo/numopt.notes.md missing — cannot compare notes.raw");
  } else if (notebook.notes && notebook.notes.raw !== notesFile) {
    shapeErrors.push("notes.raw is not byte-identical to demo/numopt.notes.md");
  }
  const recomputedChunks = notesFile === null ? [] : chunkNotes(notesFile);
  if (JSON.stringify(chunkList) !== JSON.stringify(recomputedChunks)) {
    shapeErrors.push("notes.chunks do not equal chunkNotes(notes.raw) (ids must be c1..cn and texts byte-identical)");
  }

  const citationErrors = [];
  for (const t of topics) {
    const where = `topic ${t?.id ?? "?"} (${t?.name ?? "?"})`;
    if (!COVERAGE_STATUSES.includes(t?.coverage?.status)) shapeErrors.push(`${where}: bad coverage.status ${JSON.stringify(t?.coverage?.status)}`);
    const score = t?.coverage?.score;
    if (typeof score !== "number" || score < 0 || score > 1) shapeErrors.push(`${where}: coverage.score must be 0..1`);
    for (const cid of t?.coverage?.chunkIds || []) {
      if (!seenChunkIds.has(cid)) shapeErrors.push(`${where}: coverage.chunkIds cites unknown chunk ${cid}`);
    }
    if (t?.coverage?.status !== "not_found" && (t?.coverage?.chunkIds || []).length === 0) {
      shapeErrors.push(`${where}: coverage ${t.coverage.status} but no chunkIds cited`);
    }
    if (t?.coverage?.status === "not_found" && (t?.coverage?.chunkIds || []).length !== 0) {
      shapeErrors.push(`${where}: coverage not_found must cite no chunks`);
    }
    if (t.rating !== null && !RATINGS.includes(t.rating)) shapeErrors.push(`${where}: bad rating ${JSON.stringify(t.rating)}`);
    if (t.after !== null && !AFTER_STATES.includes(t.after)) shapeErrors.push(`${where}: bad after ${JSON.stringify(t.after)}`);

    const lesson = t?.lesson;
    if (lesson) {
      if ("trace" in lesson) shapeErrors.push(`${where}: lesson.trace present (plan3: zero trace keys in the demo notebook)`);
      const res = validateLesson(lesson, t.kind);
      if (res !== true) res.forEach((e) => shapeErrors.push(`${where}: lesson.${e}`));

      const items = [...(lesson.steps || []), ...(lesson.pitfalls || [])];
      for (const [i, item] of items.entries()) {
        if (item?.source === "notes") {
          const missing = (item.chunkIds || []).filter((cid) => !seenChunkIds.has(cid));
          if (missing.length) citationErrors.push(`${where}: steps/pitfalls[${i}] cites unknown chunk(s) ${missing.join(", ")}`);
          if (!(item.chunkIds || []).length) citationErrors.push(`${where}: steps/pitfalls[${i}] source "notes" without chunkIds`);
        }
      }
      // §6.6: stored notes claims must survive enforceCitations re-verification.
      if (t.coverage) {
        const verified = enforceCitations(lesson, chunkList, t.coverage);
        const sig = (l) => [...(l.steps || []), ...(l.pitfalls || [])].map((x) => `${x.source}:${(x.chunkIds || []).join("|")}`).join(";");
        if (sig(verified) !== sig(lesson)) {
          citationErrors.push(`${where}: enforceCitations demotes stored "notes" claims (citation overlap < ${DEFAULTS.citationOverlapMin} or chunk missing)`);
        }
      }
    }
  }
  add("demo notebook schema (§6.2-shape + schema.js, trace-free)", shapeErrors.length === 0, shapeErrors.join("; "));
  add("demo notes citations verified (§6.6)", citationErrors.length === 0, citationErrors.join("; "));

  // ---- 7. plan3 v3 notebook contract --------------------------------------------
  const v3Errors = [];
  const traceKeyScan = [];
  (function scan(node, where) {
    if (Array.isArray(node)) {
      node.forEach((v, i) => scan(v, `${where}[${i}]`));
    } else if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) {
        if (k === "trace") traceKeyScan.push(where + "." + k);
        scan(v, where + "." + k);
      }
    }
  })(notebook, "notebook");
  if (traceKeyScan.length) v3Errors.push(`trace keys found at: ${traceKeyScan.join(", ")}`);

  if (!Array.isArray(notebook.revisionPins) || notebook.revisionPins.length !== 0) {
    v3Errors.push(`revisionPins: must be [] (demo starts with zero pins), got ${JSON.stringify(notebook.revisionPins)}`);
  }

  FIXTURE_TABLE.forEach((row, i) => {
    const t = topics[i];
    if (!t || t.id !== row.id) {
      v3Errors.push(`topics[${i}]: expected id ${row.id}, got ${JSON.stringify(t?.id)}`);
      return;
    }
    if (t.name !== row.name) v3Errors.push(`${row.id}: name must be the §9 label "${row.name}" (got "${t.name}")`);
    if (t?.coverage?.status !== row.status) v3Errors.push(`${row.id}: curated coverage.status must be "${row.status}" (got "${t?.coverage?.status}")`);
    const lesson = t?.lesson;
    if (!lesson) {
      v3Errors.push(`${row.id}: missing curated lesson`);
      return;
    }
    if (lesson.takeaway !== row.takeaway) v3Errors.push(`${row.id}: lesson.takeaway must be the §9 "What to remember" copy (got ${JSON.stringify(lesson.takeaway)})`);
    if (typeof lesson.oneLiner !== "string" || lesson.oneLiner.trim() === "") v3Errors.push(`${row.id}: lesson.oneLiner ("The idea") must be non-empty`);
    if (lesson.meta?.provider !== "curated" || lesson.meta?.model !== "curated") {
      v3Errors.push(`${row.id}: lesson.meta must honestly mark provider/model "curated" (got ${JSON.stringify(lesson.meta)})`);
    }
  });
  if (notebook.id !== "nb-numopt-demo") v3Errors.push(`notebook.id: demo namespace "nb-numopt-demo" expected (got ${JSON.stringify(notebook.id)})`);
  add("demo notebook matches §9 curated table (v3)", v3Errors.length === 0, v3Errors.join("; "));

  // ---- 9/13-style lesson card count (six topics, six lessons) — folded into v3 row above.
  addInfo("notebook topics", topics.map((t) => `${t.id}:${t.coverage?.status}`).join(" "));

  // ---- 13. plan.js sanity on the demo notebook (§6.5 invariants) -----------------
  if (!canonicalTopics) {
    add("plan.js sanity on demo notebook (§6.5)", false, "skipped gracefully: notebook does not expose 6 canonical topics");
  } else {
    try {
      const before = JSON.stringify(notebook);
      const plan = buildPlan(notebook);
      const planErrors = [];
      if (JSON.stringify(notebook) !== before) planErrors.push("buildPlan MUTATED the notebook (must be pure)");
      const ids = topics.map((t) => t.id);
      if (plan.ordered.length !== new Set(ids).size) planErrors.push("ordered does not contain every topic exactly once");
      for (const id of ids) {
        const m = plan.minutesById[id];
        if (!Number.isInteger(m) || m < 5 || m > 20) planErrors.push(`minutesById[${id}] = ${m} outside 5..20`);
      }
      const budgetMin = Math.max(0, hours * 60);
      const fitsMin = plan.fits.reduce((a, id) => a + (plan.minutesById[id] || 0), 0);
      if (fitsMin > budgetMin) planErrors.push(`Σ minutes of fits (${fitsMin}) exceeds budget (${budgetMin})`);
      const split = new Set([...plan.fits, ...plan.ifTime]);
      if (plan.fits.length + plan.ifTime.length !== split.size) planErrors.push("fits and ifTime must be disjoint");
      if (split.size !== ids.length || ids.some((id) => !split.has(id))) planErrors.push("fits ∪ ifTime must partition the ordered topics");
      if (plan.sheetIds.length > 6) planErrors.push("sheetIds exceeds the 6-topic sheet cap");
      for (const id of plan.sheetIds) {
        const t = topics.find((x) => x.id === id);
        if (t && (t.rating === "knew" || t.after === "got")) planErrors.push(`sheetIds includes ${id} (rating knew / after got must be excluded)`);
      }
      for (const w of plan.prereqWarnings) {
        if (!ids.includes(w.topicId) || !ids.includes(w.prereqId)) planErrors.push(`prereqWarning cites unknown topic: ${JSON.stringify(w)}`);
      }
      add("plan.js sanity on demo notebook (§6.5)", planErrors.length === 0, planErrors.join("; "));
    } catch (err) {
      add("plan.js sanity on demo notebook (§6.5)", false, "skipped gracefully: buildPlan threw on current lesson shapes — " + err.message);
    }
  }
} else {
  add("demo notebook schema (§6.2-shape + schema.js, trace-free)", false, "notebook not available");
  add("demo notes citations verified (§6.6)", false, "notebook not available");
  add("demo notebook matches §9 curated table (v3)", false, "notebook not available");
  add("plan.js sanity on demo notebook (§6.5)", false, "notebook not available");
}

// ---- 6. §9 fixture excerpts byte-for-byte ----------------------------------------
const excerptErrors = [];
if (notesFile === null) {
  excerptErrors.push(NOTES_REL + " missing");
} else {
  for (const row of FIXTURE_TABLE) {
    if (row.excerpt === null) continue;
    if (!notesFile.includes(row.excerpt)) excerptErrors.push(`${row.id}: excerpt not byte-present in ${NOTES_REL}`);
    if (notebook && typeof notebook?.notes?.raw === "string" && !notebook.notes.raw.includes(row.excerpt)) {
      excerptErrors.push(`${row.id}: excerpt not byte-present in notebook notes.raw`);
    }
    const holders = (notebook?.notes?.chunks || []).filter((c) => c.text.includes(row.excerpt));
    if (notebook && holders.length === 0) excerptErrors.push(`${row.id}: excerpt not inside any stored chunk`);
    if (notebook && holders.length > 0 && !notebook.topics.find((t) => t.id === row.id)?.coverage?.chunkIds?.includes(holders[0].id)) {
      excerptErrors.push(`${row.id}: coverage.chunkIds must reference the excerpt chunk (${holders.map((c) => c.id).join(",")})`);
    }
  }
  // No-match topics: nothing about Gram–Schmidt or conjugate gradient.
  if (/gram[\s\u2010-\u2015-]*schmidt/i.test(notesFile)) excerptErrors.push("t5: notes contain a Gram–Schmidt mention but §9 requires No match found");
  if (/conjugate|krylov/i.test(notesFile)) excerptErrors.push("t6: notes contain a conjugate-gradient mention but §9 requires No match found");
}
add("§9 fixture excerpts byte-for-byte in notes (and chunks)", excerptErrors.length === 0, excerptErrors.join("; "));

// ---- 8. Scenarios file ------------------------------------------------------------
const SCENARIOS_REL = "demo/numopt.scenarios.json";
const scenariosRaw = readText(SCENARIOS_REL);
let scenariosDoc = null;
if (scenariosRaw === null) {
  add("scenarios file (plan3 §3) valid", false, SCENARIOS_REL + " missing");
} else {
  const scenErrors = [];
  try {
    scenariosDoc = JSON.parse(scenariosRaw);
  } catch (err) {
    scenErrors.push("invalid JSON: " + err.message);
  }
  if (scenariosDoc) {
    const list = Array.isArray(scenariosDoc.scenarios) ? scenariosDoc.scenarios : null;
    if (!list || list.length !== 2) scenErrors.push(`expected exactly 2 scenarios, got ${list ? list.length : "no scenarios array"}`);
    else {
      const wantIds = [["a1", "a2", "a3"], ["b1", "b2"]];
      list.forEach((s, i) => {
        const where = `scenarios[${i}] (${s?.id ?? "?"})`;
        for (const key of ["id", "heading", "setup", "prompt"]) {
          if (typeof s[key] !== "string" || !s[key].trim()) scenErrors.push(`${where}.${key}: must be a non-empty string`);
        }
        const choices = Array.isArray(s.choices) ? s.choices : null;
        if (!choices || choices.length !== wantIds[i].length) {
          scenErrors.push(`${where}.choices: expected ${wantIds[i].length} choices`);
        } else {
          choices.forEach((ch, j) => {
            if (ch.id !== wantIds[i][j]) scenErrors.push(`${where}.choices[${j}].id: stable option id "${wantIds[i][j]}" expected (got ${JSON.stringify(ch.id)})`);
            for (const key of ["label", "reveal"]) {
              if (typeof ch[key] !== "string" || !ch[key].trim()) scenErrors.push(`${where}.choices[${j}].${key}: every choice must have a plain-text label and reveal`);
            }
          });
          if (!choices.some((c) => c.recommended === true)) scenErrors.push(`${where}: no recommended choice marked`);
        }
      });
      if (list[0]?.visual?.label !== "Concept sketch") scenErrors.push("scenario A visual.label must be \"Concept sketch\"");
      if (typeof list[0]?.visual?.description !== "string" || !list[0].visual.description.includes("Long jump")) {
        scenErrors.push("scenario A visual.description must describe the bowl sketch (Long jump / Shorter step paths)");
      }
      const WANT_TAKEAWAY = "The direction tells you where to go. Step size controls how far you go. Armijo checks for sufficient decrease.";
      if (list[1]?.takeaway !== WANT_TAKEAWAY) scenErrors.push(`scenario B takeaway must be the §3 "Takeaway to pin" copy (got ${JSON.stringify(list[1]?.takeaway)})`);
    }
    if (scenariosDoc.notebookId !== "nb-numopt-demo" || scenariosDoc.topicId !== "t1") {
      scenErrors.push(`scenarios must bind to notebookId "nb-numopt-demo" and topicId "t1" (got ${JSON.stringify([scenariosDoc.notebookId, scenariosDoc.topicId])})`);
    }
  }
  add("scenarios file (plan3 §3) valid", scenErrors.length === 0, scenErrors.join("; "));
}

// ---- 9/10. Pins + legacy import via src/store.js (agent E in flight) ---------------
let storeMod = null;
let storeImportError = null;
try {
  storeMod = await import("../src/store.js");
} catch (err) {
  storeImportError = err.message;
}

if (!storeMod || typeof storeMod.normalizePins !== "function") {
  add(
    "pins normalization: store.normalizePins (Addendum v3)",
    false,
    "FAIL-owner-B: src/store.js" + (storeImportError ? " failed to import (" + storeImportError + ")" : " does not export normalizePins yet") + " — agent E in flight"
  );
  add(
    "legacy import safety: trace discarded + pins normalized",
    false,
    "FAIL-owner-B: src/store.js" + (storeImportError ? " failed to import (" + storeImportError + ")" : " unavailable") + " — agent E in flight"
  );
} else {
  const npErrors = [];
  try {
    const eqArr = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const demoNb = notebook || { topics: FIXTURE_TABLE.map((r) => ({ id: r.id })) };
    const np = (arr, nb) => storeMod.normalizePins(arr, nb);
    const cases = [
      [np(["t2", "ghost", "t1", "t2"], demoNb), ["t2", "t1"], "dedupe+stale"],
      [np(undefined, demoNb), [], "missing→[]"],
      [np("t1", demoNb), [], "non-array→[]"],
      [np(null, demoNb), [], "null→[]"],
      [np([1, null, {}, "t3", "t3"], demoNb), ["t3"], "garbage→[]"],
      [np(["t1"], null), [], "no-notebook→[]"],
    ];
    cases.forEach(([got, want, label], i) => {
      void i;
      if (!eqArr(got, want)) npErrors.push(`case ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    });
  } catch (err) {
    npErrors.push("normalizePins threw: " + err.message);
  }
  add("pins normalization: store.normalizePins (Addendum v3)", npErrors.length === 0, npErrors.join("; "));

  // (e) legacy import: old notebook WITH lesson.trace + stale/duplicate pins.
  const impErrors = [];
  try {
    const legacyTrace = {
      title: "Legacy computed trace",
      code: "function run() { return { columns: ['k'], rows: [[0]], answer: 'legacy' }; }",
      computed: true,
      result: { columns: ["k"], rows: [[0]], answer: "legacy" },
      narration: ["legacy row"],
      takeaway: "legacy takeaway",
    };
    const legacyLesson = {
      oneLiner: "Legacy one-liner.",
      why: "Legacy why.",
      analogy: "Legacy analogy.",
      steps: [{ text: "Legacy step.", source: "vertex", chunkIds: [] }],
      pitfalls: [],
      notesGaps: [],
      trace: legacyTrace,
      diagramMermaid: null,
      examQuestion: { q: "Legacy q?", modelAnswer: "Legacy a.", source: "vertex" },
      meta: { provider: "bharatcode", model: "qwen-3.8-27b", at: "2026-11-10T00:00:00.000Z" },
    };
    const legacyTopic = (id, lesson) => ({
      id,
      name: "Legacy topic " + id,
      aliases: [],
      unit: "Unit 1",
      kind: "numeric",
      weight: 3,
      prereqs: [],
      coverage: { status: "covered", score: 0.5, chunkIds: ["c1"] },
      rating: null,
      after: null,
      lesson,
    });
    const legacyNb = {
      id: "nb-legacy-import-check",
      title: "Legacy plan2 notebook",
      createdAt: "2026-11-10T00:00:00.000Z",
      notes: { raw: "legacy notes", chunks: [{ id: "c1", text: "legacy chunk" }] },
      syllabus: { raw: "legacy syllabus", source: "pasted" },
      settings: { hoursToStudy: 3, lang: "en" },
      revisionPins: ["t1", "gone-topic", "t1", "t2"],
      topics: [legacyTopic("t1", legacyLesson), legacyTopic("t2", null)],
    };
    const imported = storeMod.importNotebook(JSON.stringify(legacyNb));
    if (!imported || typeof imported !== "object") {
      impErrors.push("importNotebook returned no notebook");
    } else {
      const t1 = imported.topics?.find((t) => t.id === "t1");
      if (t1?.lesson && "trace" in t1.lesson) impErrors.push("legacy lesson.trace was NOT discarded at the import boundary");
      const pins = imported.revisionPins;
      if (!Array.isArray(pins) || JSON.stringify(pins) !== JSON.stringify(["t1", "t2"])) {
        impErrors.push(`revisionPins after import: want ["t1","t2"] (stale dropped, dup removed, order kept), got ${JSON.stringify(pins)}`);
      }
    }
  } catch (err) {
    impErrors.push("FAIL-owner-B: importNotebook threw on a legacy plan2 notebook — " + err.message);
  }
  add("legacy import safety: trace discarded + pins normalized", impErrors.length === 0, impErrors.join("; "));
}

// ---- 11. Coverage ENGINE probe (new demo notes + engine fixture) --------------------
if (!canonicalTopics) {
  add("coverage engine probe: demo notes floor (t1/t2 covered, t3/t4 covered-or-thin)", false, "notebook canonical topics unavailable — see file/schema rows above");
  add("coverage mix: canonical topics x engine fixture", false, "canonical topics unavailable (notebook missing or not 6 topics)");
  add("coverage mix: hand list x engine fixture", false, "tests/fixtures/demo.notes.fixture.md missing or unreadable");
  add("hand list matches canonical (query terms)", false, "skipped — notebook canonical list unavailable");
} else {
  const demoNotesForEngine = notesFile ?? notebook?.notes?.raw ?? null;
  if (demoNotesForEngine === null) {
    add("coverage engine probe: demo notes floor (t1/t2 covered, t3/t4 covered-or-thin)", false, NOTES_REL + " missing");
  } else {
    const chunks = chunkNotes(demoNotesForEngine);
    const live = canonicalTopics.map((t) => scoreCoverage(t, chunks));
    const byId = Object.fromEntries(canonicalTopics.map((t, i) => [t.id, live[i]]));
    const floorErrors = [];
    if (byId.t1.status !== "covered") floorErrors.push(`t1 live status "${byId.t1.status}" (want covered)`);
    if (byId.t2.status !== "covered") floorErrors.push(`t2 live status "${byId.t2.status}" (want covered)`);
    if (!["covered", "thin"].includes(byId.t3.status)) floorErrors.push(`t3 live status "${byId.t3.status}" (want covered or thin)`);
    if (!["covered", "thin"].includes(byId.t4.status)) floorErrors.push(`t4 live status "${byId.t4.status}" (want covered or thin)`);
    add("coverage engine probe: demo notes floor (t1/t2 covered, t3/t4 covered-or-thin)", floorErrors.length === 0, floorErrors.join("; "));

    const curated = FIXTURE_TABLE.map((r) => r.status).join(",");
    const liveMix = canonicalTopics.map((t, i) => live[i].status).join(",");
    addInfo(
      "live engine vs curated §9 table (accepted to differ — thresholds are not tuned to the fixture)",
      `curated: ${curated} | live: ${liveMix}` +
        (curated === liveMix ? " | MATCH" : " | DIFFERS (accepted per plan3 §9)") +
        " | per-topic: " + canonicalTopics.map((t, i) => `${t.id}=${live[i].status}(${live[i].score},[${live[i].chunkIds.join(",")}])`).join(" ")
    );
  }

  const fixtureText = readText("tests/fixtures/demo.notes.fixture.md");
  if (fixtureText === null) {
    add("coverage mix: canonical topics x engine fixture", false, "tests/fixtures/demo.notes.fixture.md missing");
    add("coverage mix: hand list x engine fixture", false, "tests/fixtures/demo.notes.fixture.md missing");
  } else {
    const r1 = mixReport(canonicalTopics, fixtureText);
    add("coverage mix: canonical topics x engine fixture", r1.ok, r1.detail);
    const r2 = mixReport(HAND_TOPICS, fixtureText);
    add("coverage mix: hand list x engine fixture", r2.ok, r2.detail);
    const r3 = mixReport(HAND_TOPICS, demoNotesForEngine ?? "");
    addInfo("coverage mix: hand list x demo/numopt.notes.md", r3.detail);
  }

  // 12 (drift guard): stemmed query terms of the hand list must equal the canonical ones.
  const parity = [];
  canonicalTopics.forEach((ct, i) => {
    const ht = HAND_TOPICS[i];
    const a = new Set(queryTerms(ct));
    const b = new Set(queryTerms(ht));
    const onlyNb = [...a].filter((w) => !b.has(w));
    const onlyHand = [...b].filter((w) => !a.has(w));
    if (onlyNb.length || onlyHand.length) {
      parity.push(`${ht.id}: notebook-only [${onlyNb.join(",")}] hand-only [${onlyHand.join(",")}]`);
    }
  });
  add("hand list matches canonical (query terms)", parity.length === 0, parity.join("; "));
}

// ---- 14. CDN pins + SRI + CSP (index.html, Track C) -----------------------------------
const indexHtml = readText("index.html");
if (indexHtml === null) {
  add("index.html CDN pins + SRI", false, "index.html not landed yet (Track C in flight)");
  add("index.html CSP meta", false, "index.html not landed yet (Track C in flight)");
} else {
  const cdnTags = indexHtml.match(/<(?:script|link)\b[^>]*>/gi) || [];
  const cdnHits = cdnTags.filter((tag) => /https:\/\/(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com)\//.test(tag));
  const unpinned = cdnHits.filter((tag) => !/integrity=["']sha(256|384|512)-/.test(tag));
  const versionless = cdnHits.filter((tag) => {
    const url = (tag.match(/https:\/\/(?:cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com)\/[^"'\s]+/) || [""])[0];
    // jsDelivr pins via @x.y.z, cdnjs via /x.y.z/ path segment
    return !/@\d+\.\d+\.\d+/.test(url) && !/\/\d+\.\d+\.\d+\//.test(url);
  });
  add(
    "index.html CDN pins + SRI",
    unpinned.length === 0 && versionless.length === 0,
    [
      unpinned.length ? `missing integrity= on: ${unpinned.map((t) => (t.match(/https:\/\/[^"'\s]+/) || ["?"])[0]).join(", ")}` : "",
      versionless.length ? `unpinned version on: ${versionless.map((t) => (t.match(/https:\/\/[^"'\s]+/) || ["?"])[0]).join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("; ")
  );
  add(
    "index.html CSP meta",
    /http-equiv=["']?Content-Security-Policy/i.test(indexHtml),
    /http-equiv=["']?Content-Security-Policy/i.test(indexHtml) ? "" : "no CSP <meta> found (plan §6.8 — Track C adds it last)"
  );
  // Addendum v5: the CSP connect-src must allow every live provider origin, or
  // the browser blocks the model call. BharatCode is the default; Gemini is the
  // opt-in provider added in v5.
  const cspContent = (indexHtml.match(/http-equiv=["']?Content-Security-Policy["']?\s+content="([^"]*)"/i) || [, ""])[1];
  const connectSrc = (cspContent.match(/connect-src\s+([^;]*)/i) || [, ""])[1];
  const neededOrigins = ["https://bharatcode.ai", "https://generativelanguage.googleapis.com"];
  const missingOrigins = neededOrigins.filter((o) => !connectSrc.includes(o));
  add(
    "CSP connect-src allows live providers (Addendum v5)",
    missingOrigins.length === 0,
    missingOrigins.length ? "connect-src missing: " + missingOrigins.join(", ") : ""
  );
}

// ---- 15. Addendum v4 — vendored KaTeX + scan-ready sheet cards ----------------
{
  const v4Errors = [];
  for (const f of ["vendor/katex/katex.min.js", "vendor/katex/katex.min.css"]) {
    if (!fs.existsSync(path.join(ROOT, f))) v4Errors.push(f + " missing (must be served with the app — no CDN)");
  }
  let woff2 = 0;
  try {
    woff2 = fs.readdirSync(path.join(ROOT, "vendor/katex/fonts")).filter((n) => n.endsWith(".woff2")).length;
  } catch (err) {
    void err;
  }
  if (woff2 < 20) v4Errors.push(`vendor/katex/fonts: expected the full woff2 set (>=20), got ${woff2}`);
  const idx = readText("index.html") || "";
  if (/katex/i.test(idx)) v4Errors.push("index.html must not load KaTeX from a CDN (vendored under vendor/katex/)");
  const rend = readText("src/render.js") || "";
  if (!rend.includes("vendor/katex/katex.min.js")) v4Errors.push("src/render.js must load the vendored katex script");
  if (!/katex\.render\(/.test(rend) || !rend.includes("displayMode: true") || !rend.includes("throwOnError: true")) {
    v4Errors.push("render.js must call katex.render with displayMode:true and throwOnError:true (fallback path must catch)");
  }
  add("KaTeX vendored (same-origin, zero CDN math)", v4Errors.length === 0, v4Errors.join("; "));
}
{
  const cardErrors = [];
  const BS = String.fromCharCode(92);
  const wantSheet = {
    t1: {
      takeaway: "Move in the direction that lowers the function nearby.",
      formula: "x_{k+1}=x_k-" + BS + "alpha_k" + BS + "nabla f(x_k)",
      formulaFallback: "xₖ₊₁ = xₖ − αₖ ∇f(xₖ)",
      notes: ["αₖ controls how far you move.", "A small step can be slow. A large step can overshoot."],
    },
  };
  const topics = Array.isArray(notebook?.topics) ? notebook.topics : [];
  for (const [id, want] of Object.entries(wantSheet)) {
    const t = topics.find((x) => x && x.id === id);
    const sh = t?.lesson?.sheet;
    if (!sh) { cardErrors.push(`${id}: lesson.sheet missing`); continue; }
    if (sh.takeaway !== want.takeaway) cardErrors.push(`${id}: sheet.takeaway must be the exact card copy (got ${JSON.stringify(sh.takeaway)})`);
    if (sh.formula !== want.formula) cardErrors.push(`${id}: sheet.formula must be the exact LaTeX (got ${JSON.stringify(sh.formula)})`);
    if (sh.formulaFallback !== want.formulaFallback) cardErrors.push(`${id}: sheet.formulaFallback must be the exact Unicode fallback`);
    if (JSON.stringify(sh.notes) !== JSON.stringify(want.notes)) cardErrors.push(`${id}: sheet.notes must match the exact two notes`);
  }
  for (const id of ["t3", "t4"]) {
    const sh = topics.find((x) => x && x.id === id)?.lesson?.sheet;
    if (!sh) { cardErrors.push(`${id}: lesson.sheet missing (Armijo and BFGS cards)`); continue; }
    for (const key of ["takeaway", "formula", "formulaFallback"]) {
      if (typeof sh[key] !== "string" || !sh[key].trim()) cardErrors.push(`${id}: sheet.${key} must be a non-empty string`);
    }
    if (!Array.isArray(sh.notes) || sh.notes.length < 1 || sh.notes.length > 2) cardErrors.push(`${id}: sheet.notes must hold 1-2 notes`);
    if (!sh.formula.includes(BS)) cardErrors.push(`${id}: sheet.formula must contain real LaTeX commands (backslashes lost?)`);
  }
  for (const id of ["t2", "t5", "t6"]) {
    const sh = topics.find((x) => x && x.id === id)?.lesson?.sheet;
    if (sh) cardErrors.push(`${id}: must NOT carry a sheet block (legacy card path — exercises the no-formula fallback)`);
  }
  const sheetView = readText("src/views/sheet.js") || "";
  if (!sheetView.includes("renderFormula")) cardErrors.push("sheet.js must render formulas through src/render.js renderFormula");
  if (!sheetView.includes("View original notes")) cardErrors.push("sheet.js must keep the verbatim disclosure labelled \"View original notes\"");
  if (!/sheet-original[^"']*no-print|no-print[^"']*sheet-original/.test(sheetView)) cardErrors.push("the disclosure must carry no-print (verbatim passage stays out of the A4 sheet)");
  add("sheet-card fixture + wiring (Addendum v4)", cardErrors.length === 0, cardErrors.join("; "));
}

// ---- Report -------------------------------------------------------------------------
const nameWidth = Math.min(66, Math.max(...rows.map((r) => r.name.length)));
console.log("\nVertex QA — scripts/check.mjs (plan3 §9/§10 content + revision checks)\n" + "-".repeat(nameWidth + 10));
let failed = 0;
for (const r of rows) {
  if (!r.ok) failed += 1;
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name.padEnd(nameWidth)}  ${r.detail}`);
}
console.log("-".repeat(nameWidth + 10));
console.log(`${rows.length - failed}/${rows.length} checks passed`);
if (infos.length) {
  console.log("\nINFO (never affects exit code):");
  for (const i of infos) console.log(`  · ${i.name}: ${i.detail}`);
}
process.exit(failed === 0 ? 0 : 1);
