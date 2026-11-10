// verify.mjs — frozen contract checker for Vertex. Dev-only; not referenced by index.html.
// Run: node verify.mjs   (from the project root)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')));
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

const fails = [];
const notes = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };

// ---------- 0. files ----------
const FILES = ['index.html', 'styles.css', 'data/topics.js', 'app.js', 'chat.js', 'BharatCode.txt', 'README.md', '.gitignore'];
for (const f of FILES) check(exists(f), `missing file: ${f}`);
if (fails.length) { report(); process.exit(1); }

const html = read('index.html');
const css = read('styles.css');
const appJs = read('app.js');
const chatJs = read('chat.js');
const gitignore = read('.gitignore');

// ---------- 1. frozen IDs / views / globals ----------
const IDS = ['btn-demo-seed', 'btn-start-quiz', 'btn-mode-revision', 'board', 'quiz-card', 'options',
  'btn-hint', 'btn-why', 'chat-log', 'chat-input', 'settings-key'];
for (const id of IDS) check(new RegExp(`id=["']${id}["']`).test(html), `index.html missing frozen id: ${id}`);

const VIEWS = ['view-dashboard', 'view-picker', 'view-quiz', 'view-mastered', 'view-sheet', 'view-chat', 'modal-settings'];
for (const v of VIEWS) check(new RegExp(`data-view=["']${v}["']`).test(html), `index.html missing view: ${v}`);
check(/view-dashboard(?!.*view-picker)/s.test(html), 'view-dashboard must be the default/first view');
check(!/data-view=["']view-login["']/.test(html) && !/id=["']login/i.test(html), 'no login view allowed (§1.8)');
check(!/https?:\/\/[^"']*\.(?:css|js)|cdn\.jsdelivr|unpkg\.com|googleapis\.com/.test(html), 'no external CDN assets (§1.1)');
check(/<script src=["']data\/topics\.js["']/.test(html) && /<script src=["']app\.js["']/.test(html) && /<script src=["']chat\.js["']/.test(html),
  'index.html must load data/topics.js, app.js, chat.js');
check(/id=["']print-area["']/.test(html), 'index.html needs a #print-area for the PDF export');
check(!/\sonclick=/.test(html), 'no inline onclick in index.html (§6 rendering rule)');
check(!/\sonclick=/.test(appJs), 'app.js must not generate inline onclick attributes');

const GLOBALS_APP = ['VertexEngine', 'VertexUI', 'VertexBoard', 'VertexQuiz', 'VertexSheet', 'VertexPDF'];
for (const g of GLOBALS_APP) check(new RegExp(`window\\.${g}\\s*=`).test(appJs), `app.js missing global: window.${g}`);
for (const m of ['init', 'next', 'answer', 'state']) check(new RegExp(`${m}\\s*[(:]`).test(appJs), `VertexEngine missing .${g0(m)}`);
for (const m of ['show']) check(new RegExp(`function ${m}|${m}\\s*[:(]`).test(appJs), `VertexUI missing .show`);
check(/VertexChat\s*=|window\.VertexChat/.test(chatJs), 'chat.js missing global: VertexChat');
check(/VertexChat\.send|send\s*[:(]/.test(chatJs), 'VertexChat missing .send');
check(/window\.VERTEX_DATA\s*=/.test(read('data/topics.js')), 'data/topics.js must define window.VERTEX_DATA');
check(!/verify\.mjs/.test(html), 'index.html must not reference verify.mjs');

function g0(m) { return m; }

// ---------- 2. data schema ----------
const sandbox = { window: {}, console };
sandbox.self = sandbox.window;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
let D = null;
try {
  vm.runInContext(read('data/topics.js'), sandbox, { timeout: 5000 });
  D = sandbox.window.VERTEX_DATA;
} catch (e) { check(false, `data/topics.js failed to evaluate: ${e.message}`); }
if (!D) { report(); process.exit(1); }

check(Array.isArray(D.topics) && D.topics.length >= 20, `topics must be >=20 (got ${D.topics && D.topics.length})`);
const live = (D.topics || []).filter(t => t.status === 'live');
check(live.length === 1, `exactly one live topic required (got ${live.length})`);
check(live[0] && live[0].id === 'trigonometry', 'live topic must be trigonometry');
check(live[0] && live[0].tier === 1, 'trigonometry must be tier 1');
for (const t of D.topics || []) {
  check([1, 2, 3].includes(t.tier), `topic ${t.id}: tier must be 1|2|3`);
  check(['live', 'soon'].includes(t.status), `topic ${t.id}: status must be live|soon`);
  check(typeof t.blurb === 'string' && t.blurb.length > 0, `topic ${t.id}: blurb missing`);
}

const CONCEPT_ORDER = ['sine-cosine-rule', 'unit-circle', 'trig-ratios', 'radians', 'solve-triangles'];
const trigConcepts = (D.concepts || []).filter(c => c.topicId === 'trigonometry');
check(trigConcepts.length === 5, `trigonometry needs exactly 5 concepts (got ${trigConcepts.length})`);
const gotOrder = trigConcepts.map(c => c.id);
check(JSON.stringify(gotOrder) === JSON.stringify(CONCEPT_ORDER),
  `concept order must be ${CONCEPT_ORDER.join(', ')} (demo arc tie-break depends on it) — got ${gotOrder.join(', ')}`);
for (const c of trigConcepts) {
  check(typeof c.name === 'string' && typeof c.icon === 'string' && typeof c.summary === 'string',
    `concept ${c.id}: name/icon/summary must be non-empty strings`);
}

const qs = D.questions || [];
const byId = new Set();
for (const q of qs) {
  check(!byId.has(q.id), `duplicate question id: ${q.id}`);
  byId.add(q.id);
  check(Array.isArray(q.options) && q.options.length === 4, `question ${q.id}: options must be length 4`);
  check(Number.isInteger(q.correct) && q.correct >= 0 && q.correct <= 3, `question ${q.id}: correct must be 0-3`);
  check([1, 2, 3].includes(q.difficulty), `question ${q.id}: difficulty must be 1|2|3`);
  check(Array.isArray(q.steps) && q.steps.length >= 2 && q.steps.length <= 4, `question ${q.id}: steps must be 2-4`);
  for (const f of ['eli5', 'hint', 'commonMistake', 'question'])
    check(typeof q[f] === 'string' && q[f].length > 0, `question ${q.id}: ${f} missing`);
  check(CONCEPT_ORDER.includes(q.conceptId), `question ${q.id}: unknown conceptId`);
  if (Array.isArray(q.options)) {
    const uniq = new Set(q.options.map(s => String(s).trim()));
    check(uniq.size === 4, `question ${q.id}: duplicate option text`);
    check(q.options.every(o => typeof o === 'string' && o.trim().length > 0), `question ${q.id}: empty option`);
  }
}
const diagrams = qs.filter(q => q.diagram);
check(diagrams.length <= 3, `at most 3 inline SVG diagrams (got ${diagrams.length})`);
for (const q of diagrams) check(/<svg[\s>]/i.test(q.diagram), `question ${q.id}: diagram must be inline SVG markup`);

const countOf = (id) => qs.filter(q => q.conceptId === id).length;
const diffsOf = (id) => qs.filter(q => q.conceptId === id).map(q => q.difficulty);
check(countOf('sine-cosine-rule') === 5, `sine-cosine-rule needs 5 questions (got ${countOf('sine-cosine-rule')})`);
check(JSON.stringify(diffsOf('sine-cosine-rule').slice().sort()) === JSON.stringify([1, 1, 1, 1, 2]),
  `sine-cosine-rule difficulties must be 1,1,1,1,2 — got ${diffsOf('sine-cosine-rule')}`);
// trig-ratios carries the recovery half of the demo arc: 2 wrongs + 3 rights must fit its bank
check(countOf('trig-ratios') === 5, `trig-ratios needs 5 questions (got ${countOf('trig-ratios')})`);
check(JSON.stringify(diffsOf('trig-ratios').slice().sort()) === JSON.stringify([1, 1, 1, 2, 2]),
  `trig-ratios difficulties must be 1,1,1,2,2 — got ${diffsOf('trig-ratios')}`);
for (const id of ['unit-circle', 'radians', 'solve-triangles']) {
  check(countOf(id) === 4, `${id} needs 4 questions (got ${countOf(id)})`);
  check(JSON.stringify(diffsOf(id).slice().sort()) === JSON.stringify([1, 1, 2, 3]),
    `${id} difficulties must be 1,1,2,3 — got ${diffsOf(id)}`);
}
check(qs.length === 22, `total question count must be 22 (got ${qs.length})`);

const scrD1 = qs.filter(q => q.conceptId === 'sine-cosine-rule' && q.difficulty === 1);
check(scrD1.length >= 4, `sine-cosine-rule needs >=4 difficulty-1 questions (got ${scrD1.length})`);
check(scrD1.some(q => /cosine rule/i.test(q.question)), 'a cosine-rule question must exist at difficulty 1');
check(qs.filter(q => q.conceptId === 'sine-cosine-rule').some(q => /sine rule/i.test(q.question)),
  'sine-cosine-rule must also teach the sine rule');

check(D.sheet && D.sheet.trigonometry, 'sheet must contain trigonometry');
if (D.sheet && D.sheet.trigonometry) {
  const s = D.sheet.trigonometry;
  check(Array.isArray(s.formulas) && s.formulas.length >= 8 && s.formulas.length <= 10,
    `sheet.formulas must be 8-10 (got ${s.formulas && s.formulas.length})`);
  check(Array.isArray(s.rules) && s.rules.length === 5, `sheet.rules must be 5 (got ${s.rules && s.rules.length})`);
  check(Array.isArray(s.commonMistakes) && s.commonMistakes.length === 4,
    `sheet.commonMistakes must be 4 (got ${s.commonMistakes && s.commonMistakes.length})`);
  check(s.workedExample && /cosine/i.test(s.workedExample.question || ''), 'workedExample must be the cosine rule');
  check(s.workedExample && Array.isArray(s.workedExample.solution) && s.workedExample.solution.length >= 3,
    'workedExample.solution must have >=3 steps');
}

// ---------- 3. seed math + independent 7-tap demo arc simulation ----------
const SEED = { 'sine-cosine-rule': 6, 'unit-circle': 6, 'trig-ratios': 6, 'radians': 9, 'solve-triangles': 9 };
const seedInApp = appJs.match(/DEMO_SEED[\s\S]{0,400}/);
check(!!seedInApp, 'app.js must contain the DEMO_SEED block');
if (seedInApp) {
  for (const [k, v] of Object.entries(SEED))
    check(new RegExp(`['"]?${k}['"]?\\s*:\\s*${v}\\b`).test(seedInApp[0]), `DEMO_SEED ${k} must be ${v}`);
}
for (const key of ['vertex_scores', 'vertex_streak', 'vertex_mistakes', 'vertex_lastTopic', 'vertex_api_key'])
  check(appJs.includes(key), `app.js missing localStorage key: ${key}`);
check(!/vertex_alpha|vertex_beta/.test(appJs), 'legacy vertex_alpha/vertex_beta keys must not be used');
check(/window\.print\(\)/.test(appJs) || /window\.print\(\)/.test(chatJs), 'VertexPDF must call window.print()');

// Independent re-implementation of §6 — deliberately does NOT import app.js.
function simulate(answers) {
  const score = { ...SEED };
  const asked = new Set();
  let diff = 1, cc = 0, cw = 0;
  const arc = [];
  for (const wantRight of answers) {
    const weak = CONCEPT_ORDER.filter(id => score[id] < 7);
    if (!weak.length) break;
    let target = null, picked = null;
    for (const id of weak) {                       // lowest score, tie -> concept order
      const s = score[id];
      if (target === null || s < score[target]) target = id;
    }
    const pool = (cid, cap) => qs.filter(q => q.conceptId === cid && !asked.has(q.id) && q.difficulty <= cap)
      .sort((a, b) => b.difficulty - a.difficulty || a.id.localeCompare(b.id));
    picked = pool(target, diff)[0] || null;
    if (!picked) {
      for (const id of weak) {                     // next-weakest fallback
        if (id === target) continue;
        const alt = pool(id, diff)[0];
        if (alt) { picked = alt; target = id; break; }
      }
    }
    if (!picked) { arc.push({ concept: target, note: 'bank exhausted' }); break; }
    asked.add(picked.id);
    arc.push({ concept: target, id: picked.id, d: picked.difficulty, q: picked.question, right: wantRight });
    if (wantRight) { score[target] = Math.min(10, score[target] + 1); cc += 1; cw = 0; if (cc >= 2) { diff = Math.min(3, diff + 1); cc = 0; } }
    else { score[target] = Math.max(0, score[target] - 1); cw += 1; cc = 0; if (cw >= 2) { diff = Math.max(1, diff - 1); cw = 0; } }
  }
  return { arc, score, diff };
}

const ARC = [true, true, false, false, true, true, true];
const sim = simulate(ARC);
const expectedConcepts = ['sine-cosine-rule', 'unit-circle', 'trig-ratios', 'trig-ratios', 'trig-ratios', 'trig-ratios', 'trig-ratios'];
check(sim.arc.length === 7, `7-tap arc must run 7 questions (got ${sim.arc.length}: ${JSON.stringify(sim.arc)})`);
sim.arc.forEach((step, i) => {
  check(step.concept === expectedConcepts[i], `arc tap ${i + 1} must hit ${expectedConcepts[i]} (got ${step.concept})`);
  check(step.right === ARC[i], `arc tap ${i + 1} answer mismatch`);
});
if (sim.arc[0]) check(/cosine rule/i.test(sim.arc[0].q || ''), `arc tap 1 must be the cosine rule question (got: ${sim.arc[0].q})`);
if (sim.arc[2]) check(sim.arc[2].d <= 2, `arc tap 3 must be difficulty <=2 (got ${sim.arc[2].d})`);
const allMastered = Object.values(sim.score).every(s => s >= 7);
check(allMastered, `arc must end with every concept >=7 (got ${JSON.stringify(sim.score)})`);
check(sim.score['trig-ratios'] === 7, `arc must end trig-ratios at exactly 7 (got ${sim.score['trig-ratios']})`);

// hint cost: correct-after-hint must not raise the score
check(/hint/i.test(appJs) && /(\+\s*0|no gain|hinted)/i.test(appJs), 'app.js must implement hint cost (correct-after-hint = +0)');

// ---------- 4. styles + chat ----------
check(/@media\s+print/.test(css), 'styles.css must contain @media print');
check(/@media\s+print[\s\S]*?display\s*:\s*none/.test(css), 'print stylesheet must hide app chrome');
check(/#print-area/.test(css), 'print stylesheet must target #print-area');
check(/background\s*:\s*#fff/i.test(css.match(/@media\s+print[\s\S]*$/)?.[0] || ''), 'print must be black on white');
check(/#121212/.test(css) && /#1E1E1E/i.test(css) && /#FF7A1A/i.test(css), 'theme colors #121212 / #1E1E1E / #FF7A1A required');
check(/@media\s*\(max-width\s*:\s*3[0-9][0-9]px\)|@media\s*\(max-width\s*:\s*4[0-9][0-9]px\)|@media\s*\(min-width/.test(css),
  'styles.css must include responsive breakpoints');

check(/AbortController/.test(chatJs), 'chat.js must use AbortController');
const timeouts = [...chatJs.matchAll(/setTimeout\(\s*[^,]*,\s*(\d+)\s*\)|timeout[^0-9]{0,12}(\d{3,5})/g)]
  .map(m => Number(m[1] || m[2])).filter(n => !Number.isNaN(n));
check(timeouts.some(t => t > 0 && t <= 3000), `chat.js needs a <=3000ms abort timeout (found ${timeouts.join(',') || 'none'})`);
check(!/signal\s*:\s*undefined/.test(chatJs), 'chat.js fetch signal must not be undefined');
const canned = (chatJs.match(/FALLBACK|CANNED|canned/g) || []).length;
check(canned >= 1, 'chat.js must ship a canned fallback map');
check(!/["'][A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}["']/.test(chatJs), 'chat.js must not embed a key');

// ---------- 5. secrets / hygiene ----------
const textFiles = FILES.filter(f => !f.endsWith('.png'));
for (const f of textFiles) {
  const body = read(f);
  check(!/sk-[A-Za-z0-9]{8,}/.test(body), `possible secret (sk-...) in ${f}`);
  check(!/api[_-]?key\s*=\s*["'][^"']{8,}["']/i.test(body), `possible hardcoded api key in ${f}`);
}
check(/\.DS_Store/.test(gitignore) && /Thumbs\.db/.test(gitignore), '.gitignore must list .DS_Store and Thumbs.db');
check(!exists('package.json') && !exists('node_modules'), 'no package files or node_modules allowed (§1.1)');

report();
process.exit(fails.length ? 1 : 0);

function report() {
  const label = (n) => `  ✓ ${n}`;
  for (const n of notes) console.log(label(n));
  if (fails.length) {
    console.log(`verify.mjs: ${fails.length} FAILURE(S)`);
    for (const f of fails) console.log(`  ✗ ${f}`);
  } else {
    console.log('verify.mjs: all contracts green (files, IDs, globals, schema, seed math, 7-tap arc, print, chat timeout, hygiene)');
    console.log(`  · topics=${D.topics.length} live=${live.length} concepts(trig)=${trigConcepts.length} questions=${qs.length} diagrams=${diagrams.length}`);
    console.log('  · arc: ' + sim.arc.map(a => `${a.concept} d${a.d} ${a.right ? 'R' : 'W'}`).join(' → ') +
      ` → ${JSON.stringify(sim.score)}`);
  }
}
