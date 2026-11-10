#!/usr/bin/env node
/**
 * check.mjs — all automated QA for Vertex (plan §11). Exit 0 only if every
 * check passes. Files owned by tracks still in flight (Track C: index.html,
 * styles.css, src/main.js, src/render.js, src/views/*) produce specific FAIL
 * rows, never a crash.
 *
 * Checks:
 *  1. required files exist (§11 + §6.1); in-flight Track C files reported separately
 *  2. secret-like strings scan + .gitignore sanity
 *  3. no `innerHTML =` outside src/render.js; no inline on*= handlers
 *  4. demo notebook: parses, schema.js validation + §6.2 shape
 *  5. every stored `notes` citation points at an existing chunk (§6.6) and
 *     survives enforceCitations re-verification unchanged
 *  6. every stored trace.code re-runs via runTraceNode (vm sandbox) and its
 *     rows match the stored rows at 4 dp
 *  7. coverage probe (merged from the Track A scratch probe): the six §8 topics
 *     must score exactly covered,covered,thin,thin,not_found,not_found using
 *     (a) the notebook's canonical topic definitions (name+aliases) with the
 *     conservative hand list as fallback, and (b) the hand list alone, on BOTH
 *     demo/numopt.notes.md and tests/fixtures/demo.notes.fixture.md
 *  8. hand-list parity with the canonical notebook list (drift guard)
 *  9. plan.js sanity on the demo notebook (§6.5 invariants; pure — notebook not mutated)
 * 10. CDN pins + SRI + CSP meta in index.html (when Track C's file has landed)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chunkNotes, scoreCoverage, queryTerms } from "../src/chunk.js";
import { buildPlan } from "../src/plan.js";
import { validateLesson, validateTopicMap, enforceCitations } from "../src/schema.js";
import { runTraceNode, staticRejectReason } from "../src/trace.js";
import {
  COVERAGE_STATUSES,
  RATINGS,
  AFTER_STATES,
  TIMEOUTS,
  DEFAULTS,
} from "../src/contracts.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rows = [];
const add = (name, ok, detail) => rows.push({ name, ok, detail: detail || "" });

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

// ---- 1. Required files --------------------------------------------------------
const REQUIRED = [
  "LICENSE",
  "BharatCode.txt",
  "README.md",
  "demo/numopt.notebook.json",
  "demo/numopt.notes.md",
  "demo/numopt.syllabus.txt",
];
for (const f of REQUIRED) {
  const present = fs.existsSync(path.join(ROOT, f));
  add(`file exists: ${f}`, present, present ? "" : "MISSING (owner: Track D / G0)");
}
// §6.1 app files owned by the in-flight Track C UI scope. Missing → FAIL row, not crash.
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

// ---- Coverage probe (merged from the former probe.tmp.mjs) ------------------------
const EXPECTED_MIX = ["covered", "covered", "thin", "thin", "not_found", "not_found"];

/**
 * Conservative hand list for the six §8 topics. Fallback when the demo notebook
 * has not landed; kept in parity with the notebook's canonical topic map by the
 * "hand list matches canonical" check below (drift guard).
 */
const HAND_TOPICS = [
  { id: "t1", name: "Gradient descent", aliases: ["GD", "steepest descent", "gradient descent method", "batch gradient descent"] },
  { id: "t2", name: "Newton's method", aliases: ["Newton method", "Newton-Raphson", "Newton\u2013Raphson", "Newton Raphson"] },
  { id: "t3", name: "Line search (Armijo condition)", aliases: ["Armijo", "Armijo condition", "line search", "backtracking line search", "sufficient decrease"] },
  { id: "t4", name: "Quasi-Newton methods (BFGS)", aliases: ["BFGS", "quasi-Newton", "quasi Newton", "BFGS update", "inverse Hessian approximation", "DFP"] },
  { id: "t5", name: "Gram-Schmidt orthogonalization", aliases: ["Gram-Schmidt", "Gram\u2013Schmidt", "Gram-Schmidt process", "orthogonalization", "orthonormalization", "QR factorization", "GS"] },
  { id: "t6", name: "Conjugate gradient method", aliases: ["conjugate gradient", "CG", "Krylov subspace method"] },
];

function mixReport(topics, notesText, label) {
  const chunks = chunkNotes(notesText);
  const got = topics.map((t) => scoreCoverage(t, chunks));
  const statuses = got.map((c) => c.status);
  const ok = statuses.join(",") === EXPECTED_MIX.join(",");
  const detail = ok
    ? "mix: " + statuses.join(",")
    : topics
        .map((t, i) => `${t.name}=${statuses[i]}(want ${EXPECTED_MIX[i]}, score ${got[i].score})`)
        .join("; ");
  return { ok, label, detail, statuses };
}

function addCoverageProbe(label, topics, notesRel) {
  const notesText = readText(notesRel);
  if (notesText === null) {
    add(`coverage mix: ${label}`, false, `${notesRel} missing`);
    return;
  }
  const r = mixReport(topics, notesText, label);
  add(`coverage mix: ${label}`, r.ok, r.detail);
}

// ---- 4-6. Demo notebook -------------------------------------------------------------
const NOTEBOOK_REL = "demo/numopt.notebook.json";
const notebookRaw = readText(NOTEBOOK_REL);
let notebook = null;
if (notebookRaw === null) {
  add("demo notebook parses", false, NOTEBOOK_REL + " not landed yet (Track D)");
} else {
  try {
    notebook = JSON.parse(notebookRaw);
    add("demo notebook parses", true);
  } catch (err) {
    add("demo notebook parses", false, "invalid JSON: " + err.message);
  }
}

// Canonical topic definitions come from the notebook when it exists; the hand
// list is the conservative fallback and the parity reference.
const nbTopics = Array.isArray(notebook?.topics) ? notebook.topics.slice() : null;
const canonicalAvailable = !!nbTopics && nbTopics.length === HAND_TOPICS.length;
if (nbTopics && !canonicalAvailable) {
  add("notebook topic map matches §8 (6 topics)", false, `notebook has ${nbTopics.length} topics, expected 6`);
}
const canonicalTopics = canonicalAvailable
  ? nbTopics
      .slice()
      .sort((a, b) => (parseInt(String(a.id).replace(/\D/g, ""), 10) || 0) - (parseInt(String(b.id).replace(/\D/g, ""), 10) || 0))
      .map((t) => ({ id: t.id, name: t.name, aliases: Array.isArray(t.aliases) ? t.aliases : [] }))
  : null;

// (a) canonical × both notes files, (b) hand list × both notes files.
if (canonicalTopics) {
  addCoverageProbe("notebook topics x demo/numopt.notes.md", canonicalTopics, "demo/numopt.notes.md");
  addCoverageProbe("notebook topics x engine fixture", canonicalTopics, "tests/fixtures/demo.notes.fixture.md");
} else {
  add("coverage mix: notebook topics x demo/numopt.notes.md", false, canonicalAvailable ? "notes file missing" : "canonical topics unavailable (demo notebook missing or not 6 topics) — hand-list fallback probes below");
  add("coverage mix: notebook topics x engine fixture", false, "canonical topics unavailable — hand-list fallback probes below");
}
addCoverageProbe("hand list x demo/numopt.notes.md", HAND_TOPICS, "demo/numopt.notes.md");
addCoverageProbe("hand list x engine fixture", HAND_TOPICS, "tests/fixtures/demo.notes.fixture.md");

// 8 (drift guard). Stemmed query terms of the hand list must equal the canonical ones.
if (canonicalTopics) {
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
} else {
  add("hand list matches canonical (query terms)", true, "skipped — notebook not available; hand list IS the working list");
}

// ---- 4. §6.2 shape + schema.js validation + 5. citations + 6. traces -----------------
function cellRound(cell) {
  if (typeof cell === "number") return Math.round(cell * 10 ** DEFAULTS.traceDecimals) / 10 ** DEFAULTS.traceDecimals;
  if (Array.isArray(cell)) return cell.map((x) => (typeof x === "number" ? Math.round(x * 10 ** DEFAULTS.traceDecimals) / 10 ** DEFAULTS.traceDecimals : x));
  return cell;
}

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
  // schema.js topic-map validation over the baked topics (ids, kinds, weights, prereq DAG).
  const tm = validateTopicMap({ topics });
  if (tm !== true) tm.forEach((e) => shapeErrors.push("topic_map." + e));

  const citationErrors = [];
  const traceChecks = [];
  const rerunPromises = [];
  let computedTraces = 0;
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
    if (t.rating !== null && !RATINGS.includes(t.rating)) shapeErrors.push(`${where}: bad rating ${JSON.stringify(t.rating)}`);
    if (t.after !== null && !AFTER_STATES.includes(t.after)) shapeErrors.push(`${where}: bad after ${JSON.stringify(t.after)}`);

    // coverage.status must be reproducible by scoreCoverage on the stored chunks
    // (canonical definitions, engine constants) — status only; top-k ids may differ.
    if (t?.coverage && t.name) {
      const recomputed = scoreCoverage(t, chunkList);
      if (recomputed.status !== t.coverage.status) {
        shapeErrors.push(`${where}: stored coverage.status "${t.coverage.status}" but engine recomputes "${recomputed.status}" on stored chunks`);
      }
    }

    const lesson = t?.lesson;
    if (lesson) {
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

      const tr = lesson.trace;
      if (tr && typeof tr.code === "string") {
        const lines = tr.code.split(/\r?\n/).length;
        if (lines > TIMEOUTS.traceMaxLines) shapeErrors.push(`${where}: trace.code has ${lines} lines (max ${TIMEOUTS.traceMaxLines} per §6.7)`);
        const forbidden = staticRejectReason(tr.code);
        if (forbidden) shapeErrors.push(`${where}: ${forbidden}`);
        if (tr.computed === true) {
          computedTraces += 1;
          rerunPromises.push(
            runTraceNode(tr.code).then((out) => {
              if (!out.computed) {
                traceChecks.push(`${where}: trace.code did NOT re-compute in Node`);
                return;
              }
              const a = ((tr.result && tr.result.rows) || []).map((r) => r.map(cellRound));
              const b = out.result.rows.map((r) => r.map(cellRound));
              if (JSON.stringify(a) !== JSON.stringify(b)) {
                traceChecks.push(`${where}: re-run rows differ from stored rows (4-dp compare)`);
              }
            })
          );
        }
      }
    }
  }
  add("demo notebook schema (§6.2 + schema.js)", shapeErrors.length === 0, shapeErrors.join("; "));
  add("demo notes citations verified (§6.6)", citationErrors.length === 0, citationErrors.join("; "));

  await Promise.all(rerunPromises).catch((err) => {
    traceChecks.push("trace re-run crashed: " + err.message);
  });
  add(
    "stored traces re-run in Node reproduce rows",
    computedTraces > 0 && traceChecks.length === 0,
    computedTraces === 0 ? "no computed traces stored in demo notebook" : traceChecks.join("; ")
  );

  // ---- 9. plan.js sanity on the demo notebook (§6.5 invariants) ----------------------
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
  // NOTE: fits need not be a literal prefix of the final `ordered` — §6.5's
  // prereq banner rule moves prerequisites to the front after budget-fill.
  if (plan.sheetIds.length > 6) planErrors.push("sheetIds exceeds the 6-topic sheet cap");
  for (const id of plan.sheetIds) {
    const t = topics.find((x) => x.id === id);
    if (t && (t.rating === "knew" || t.after === "got")) planErrors.push(`sheetIds includes ${id} (rating knew / after got must be excluded)`);
  }
  for (const w of plan.prereqWarnings) {
    if (!ids.includes(w.topicId) || !ids.includes(w.prereqId)) planErrors.push(`prereqWarning cites unknown topic: ${JSON.stringify(w)}`);
  }
  add("plan.js sanity on demo notebook (§6.5)", planErrors.length === 0, planErrors.join("; "));
} else {
  add("demo notebook schema (§6.2 + schema.js)", false, "notebook not available");
  add("demo notes citations verified (§6.6)", false, "notebook not available");
  add("stored traces re-run in Node reproduce rows", false, "notebook not available");
  add("plan.js sanity on demo notebook (§6.5)", false, "notebook not available");
}

// ---- 10. CDN pins + SRI + CSP (index.html, Track C) -----------------------------------
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
}

// ---- Report -------------------------------------------------------------------------
const nameWidth = Math.min(62, Math.max(...rows.map((r) => r.name.length)));
console.log("\nVertex QA — scripts/check.mjs (plan §11)\n" + "-".repeat(nameWidth + 10));
let failed = 0;
for (const r of rows) {
  if (!r.ok) failed += 1;
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name.padEnd(nameWidth)}  ${r.detail}`);
}
console.log("-".repeat(nameWidth + 10));
console.log(`${rows.length - failed}/${rows.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
