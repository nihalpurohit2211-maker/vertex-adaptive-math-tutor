#!/usr/bin/env node
/**
 * scripts/check.mjs — the Vertex self-check. No dependencies.
 * Verifies files, routes, demo evidence, lesson citations, pins, calendar,
 * formulas, prompts, secrets and the no-CDN / no-build constraints.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizePins, normalizePinPoints, addPinPoint, movePinPoint, normalizeCalendar,
} from '../src/core.js';
import { FORMULAS, QUESTIONS, SCENARIOS, FLOWS, seedDemoNotebook } from '../src/seed.js';
import { topicMapPrompt, lessonPrompt, narrationPrompt } from '../src/prompts.js';
import { firstBalancedJson } from '../src/providers.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
let failed = 0;

function check(name, fn) {
  try {
    const value = fn();
    if (value === false) throw new Error('returned false');
    results.push({ ok: true, name, note: typeof value === 'string' ? value : '' });
  } catch (err) {
    failed += 1;
    results.push({ ok: false, name, note: err.message });
  }
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'vendor' || entry.name === '.git' || entry.name === 'node_modules') continue;
      walk(rel, out);
    } else {
      out.push(rel);
    }
  }
  return out;
}

const DEMO = JSON.parse(read('demo/numopt.notebook.json'));
const seeded = seedDemoNotebook(JSON.parse(JSON.stringify(DEMO)));
const demoChunks = new Set(DEMO.notes.chunks.map((c) => c.id));
const demoTopics = new Set(DEMO.topics.map((t) => t.id));

/* ------------------------------------------------------------------ files */
const REQUIRED = [
  'index.html', 'styles.css', 'package.json', 'README.md', 'favicon.svg',
  'src/app.js', 'src/state.js', 'src/core.js', 'src/ui.js', 'src/charts.js',
  'src/seed.js', 'src/services.js', 'src/providers.js', 'src/prompts.js',
  'src/chunk.js', 'src/plan.js', 'src/contracts.js', 'src/shared.js',
  'src/pages/landing.js', 'src/pages/login.js', 'src/pages/setup.js',
  'src/pages/dashboard.js', 'src/pages/coverage.js', 'src/pages/lesson.js',
  'src/pages/practice.js', 'src/pages/sheet.js', 'src/pages/calendar.js',
  'src/pages/analytics.js', 'src/pages/formulas.js',
  'demo/numopt.notebook.json', 'demo/numopt.scenarios.json',
  'vendor/katex/katex.min.js', 'vendor/katex/katex.min.css', 'vendor/katex/LICENSE',
  'scripts/check.mjs', 'scripts/serve.mjs',
];
check('required files exist', () => {
  const missing = REQUIRED.filter((f) => !exists(f));
  if (missing.length) throw new Error('missing: ' + missing.join(', '));
  return `${REQUIRED.length} files`;
});

/* ------------------------------------------------------------------ secrets */
check('no committed secrets or API keys', () => {
  const files = walk('.').filter((f) => !f.startsWith('vendor/') && !f.endsWith('.png'));
  const patterns = [
    /sk-[A-Za-z0-9_-]{20,}/,
    /AIza[0-9A-Za-z_-]{30,}/,
    /ghp_[A-Za-z0-9]{30,}/,
    /xox[bap]-[A-Za-z0-9-]{20,}/,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /\bapi[_-]?key\s*[:=]\s*["'][A-Za-z0-9_-]{16,}/i,
  ];
  for (const file of files) {
    const text = read(file);
    for (const re of patterns) if (re.test(text)) throw new Error(`possible secret in ${file}`);
  }
  return `${files.length} files scanned`;
});

/* ------------------------------------------------------------------ demo */
check('demo notebook keeps six ordered topics', () => {
  if (!Array.isArray(DEMO.topics) || DEMO.topics.length !== 6) throw new Error('expected 6 topics');
  if (DEMO.id !== 'nb-numopt-demo') throw new Error('demo must keep its own notebook id');
  if (Object.values(DEMO).some((v) => typeof v === 'string' && v.startsWith('vx3.nb.'))) throw new Error('demo leaks storage key');
  return DEMO.title;
});

check('all three coverage states exist in the demo', () => {
  const states = new Set(DEMO.topics.map((t) => t.coverage.status));
  for (const s of ['covered', 'thin', 'not_found']) if (!states.has(s)) throw new Error('missing ' + s);
  return [...states].join(', ');
});

check('every evidence-backed demo verdict has valid chunk references', () => {
  for (const t of DEMO.topics) {
    if (!['covered', 'thin', 'not_found'].includes(t.coverage.status)) throw new Error(`${t.id} bad status`);
    if (t.coverage.chunkIds.some((id) => !demoChunks.has(id))) throw new Error(`${t.id} cites an unknown chunk`);
    if (t.coverage.status === 'not_found' && t.coverage.chunkIds.length) throw new Error(`${t.id} claims no evidence but cites chunks`);
    if (t.coverage.status !== 'not_found' && t.coverage.chunkIds.length === 0) throw new Error(`${t.id} claims evidence without a chunk`);
  }
  return '6 verdicts';
});

check('demo lessons exist and respect the schema', () => {
  const sources = new Set(['notes', 'vertex']);
  for (const t of DEMO.topics) {
    const l = t.lesson;
    if (!l) throw new Error(`${t.id} has no lesson`);
    for (const key of ['oneLiner', 'why', 'analogy']) if (typeof l[key] !== 'string' || !l[key]) throw new Error(`${t.id}.${key} missing`);
    if (!Array.isArray(l.steps) || l.steps.length > 5) throw new Error(`${t.id} steps > 5`);
    for (const step of l.steps) {
      if (step.text.trim().split(/\s+/).length > 20) throw new Error(`${t.id} has a step over 20 words`);
    }
    for (const step of [...l.steps, ...(l.pitfalls || [])]) {
      if (!sources.has(step.source)) throw new Error(`${t.id} bad source`);
      if (step.source === 'notes' && (!step.chunkIds.length || step.chunkIds.some((id) => !demoChunks.has(id)))) {
        throw new Error(`${t.id} notes claim without valid chunk`);
      }
    }
    if (!l.examQuestion || typeof l.examQuestion.q !== 'string' || !l.examQuestion.q) throw new Error(`${t.id} exam question missing`);
    if (!l.meta || !l.meta.provider) throw new Error(`${t.id} meta missing`);
  }
  return '6 lessons';
});

check('demo and user notebook ids are distinct', () => {
  if (DEMO.id !== 'nb-numopt-demo') throw new Error('demo id changed');
  const stateText = read('src/state.js');
  if (!stateText.includes("uid('nb')")) throw new Error('user notebooks are not given their own ids');
  if (/id:\s*['"]nb-numopt-demo['"]/.test(stateText)) throw new Error('user creation reuses the demo id');
  return 'nb-numopt-demo vs generated nb-*';
});

/* ------------------------------------------------------------------ pins */
check('pin normalization drops unknown ids and duplicates', () => {
  const nb = { topics: [{ id: 't1' }, { id: 't2' }] };
  const out = normalizePins(['t1', 'nope', 't1', 7, 't2'], nb);
  if (JSON.stringify(out) !== JSON.stringify(['t1', 't2'])) throw new Error(JSON.stringify(out));
  if (normalizePins(undefined, nb).length !== 0) throw new Error('missing pins must become []');
  return out.join(',');
});

check('duplicate pinned points are prevented', () => {
  const nb = { topics: [{ id: 't1' }] };
  const point = { topicId: 't1', text: 'The step size controls distance.', kind: 'point' };
  const once = addPinPoint([], point, nb);
  const twice = addPinPoint(once.points, point, nb);
  if (!once.added || twice.added) throw new Error('dedupe failed');
  if (twice.points.length !== 1) throw new Error('duplicate stored');
  const moved = movePinPoint([...twice.points, { ...twice.points[0], id: 'pin-2', text: 'second' }], 'pin-2', -1);
  if (moved[0].id !== 'pin-2') throw new Error('reorder failed');
  if (normalizePinPoints([{ topicId: 'ghost', text: 'x' }], nb).length !== 0) throw new Error('invalid topic pin survived');
  return 'add/dedupe/reorder';
});

/* ------------------------------------------------------------------ calendar */
check('seed calendar, sessions and practice reference real topics', () => {
  if (!seeded.calendar.length) throw new Error('no demo calendar');
  for (const e of seeded.calendar) {
    if (!demoTopics.has(e.topicId)) throw new Error('calendar references unknown topic ' + e.topicId);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) throw new Error('bad date ' + e.date);
  }
  for (const s of seeded.sessions) if (!demoTopics.has(s.topicId)) throw new Error('session references unknown topic');
  for (const p of seeded.practice) if (!demoTopics.has(p.topicId)) throw new Error('practice references unknown topic');
  const normalized = normalizeCalendar([{ topicId: 'ghost', date: '2026-01-01' }], { topics: DEMO.topics });
  if (normalized.length !== 0) throw new Error('calendar accepted an unknown topic');
  return `${seeded.calendar.length} events`;
});

/* ------------------------------------------------------------------ formulas */
check('formula vault data is complete', () => {
  if (FORMULAS.length < 12) throw new Error('need at least 12 formulas');
  const ids = new Set();
  for (const f of FORMULAS) {
    for (const key of ['id', 'name', 'category', 'unit', 'latex', 'fallback', 'explanation', 'use', 'example']) {
      if (typeof f[key] !== 'string' || !f[key].trim()) throw new Error(`${f.id || '?'} missing ${key}`);
    }
    if (ids.has(f.id)) throw new Error('duplicate formula id ' + f.id);
    ids.add(f.id);
    if (!Array.isArray(f.vars) || !f.vars.length) throw new Error(f.id + ' has no variables');
    for (const tid of f.topicIds || []) if (!demoTopics.has(tid)) throw new Error(`${f.id} references unknown demo topic ${tid}`);
  }
  if (!FORMULAS.some((f) => f.id === 'f-gd')) throw new Error('gradient descent formula missing');
  return `${FORMULAS.length} formulas`;
});

check('practice bank has questions, solutions and valid topics', () => {
  if (QUESTIONS.length < 10) throw new Error('need at least 10 questions');
  const types = new Set();
  for (const q of QUESTIONS) {
    if (!demoTopics.has(q.topicId)) throw new Error('question references unknown topic');
    if (!q.solution || !q.solution.result) throw new Error(q.id + ' has no solution result');
    if (!q.prompt) throw new Error(q.id + ' has no prompt');
    types.add(q.type);
    if (Array.isArray(q.options)) {
      if (!Number.isInteger(q.answerIndex) || q.answerIndex < 0 || q.answerIndex >= q.options.length) throw new Error(q.id + ' bad answer index');
      if (!q.options.includes(q.options[q.answerIndex])) throw new Error(q.id + ' answer not in options');
    }
  }
  for (const needed of ['mcq', 'numeric', 'derivation', 'formula', 'mistake', 'next', 'theory']) {
    if (!types.has(needed)) throw new Error('missing question type ' + needed);
  }
  return `${QUESTIONS.length} questions, ${types.size} types`;
});

check('curated scenarios belong to demo topics and stay unscored', () => {
  for (const [topicId, list] of Object.entries(SCENARIOS)) {
    if (!demoTopics.has(topicId)) throw new Error('scenario for unknown topic ' + topicId);
    for (const s of list) {
      if (!Array.isArray(s.choices) || s.choices.length < 2) throw new Error('scenario needs choices');
      for (const c of s.choices) {
        if (!c.label || !c.reveal) throw new Error('choice missing label or reasoning');
        if ('score' in c || 'correct' in c) throw new Error('scenario must not be scored');
      }
    }
  }
  if (!FLOWS.t1 || FLOWS.t1.length < 4) throw new Error('gradient flow missing');
  return `${Object.keys(SCENARIOS).length} scenarios, ${Object.keys(FLOWS).length} flows`;
});

/* ------------------------------------------------------------------ routes */
check('all required routes and page modules resolve', () => {
  const app = read('src/app.js');
  const pages = ['landing', 'login', 'setup', 'dashboard', 'coverage', 'lesson', 'practice', 'sheet', 'calendar', 'analytics', 'formulas'];
  for (const page of pages) {
    if (!app.includes(`${page}: render${page[0].toUpperCase() + page.slice(1)}`)) throw new Error('route missing: ' + page);
    const file = `src/pages/${page}.js`;
    if (!read(file).includes('export default function')) throw new Error(file + ' has no default render');
  }
  for (const route of ['#/dashboard', '#/coverage', '#/practice', '#/sheet', '#/calendar', '#/analytics', '#/formulas', '#/setup', '#/login']) {
    if (!app.includes(route)) throw new Error('navigation references missing route ' + route);
  }
  if (!app.includes("'#/lesson/'") && !app.includes('`#/lesson/')) throw new Error('lesson route missing');
  return '11 routes';
});

/* ------------------------------------------------------------------ prompts */
check('all three required prompts exist and demand strict JSON', () => {
  const p1 = topicMapPrompt({ syllabus: 'Unit 1: Gradient descent', notes: 'notes', lang: 'en' });
  const p2 = lessonPrompt({ topic: { name: 'Gradient descent', kind: 'numeric', aliases: [] }, chunks: [{ id: 'c1', text: 'gradient' }], lang: 'en' });
  const p3 = narrationPrompt({ table: [{ x: 1 }], lang: 'en' });
  for (const [name, p] of [['topic_map', p1], ['lesson', p2], ['narration', p3]]) {
    if (!p.system || !p.user) throw new Error(name + ' prompt incomplete');
    if (!/JSON/.test(p.system) || !/no markdown fences/i.test(p.system)) throw new Error(name + ' does not demand strict JSON');
  }
  if (!p2.user.includes('[c1]')) throw new Error('lesson prompt does not render chunks as [c1]');
  if (!/only numbers that already occur/i.test(p3.user)) throw new Error('narration prompt may invent numbers');
  return 'topic_map, lesson, narration';
});

check('balanced JSON extraction handles prose and strings', () => {
  const out = firstBalancedJson('Here you go:\n```json\n{"a":{"b":"}"},"c":[1,2]}\n```\nthanks');
  const parsed = JSON.parse(out);
  if (parsed.a.b !== '}' || parsed.c.length !== 2) throw new Error('extraction wrong');
  return 'first balanced object';
});

/* ------------------------------------------------------------------ security */
check('CSP is present and does not allow inline script or eval', () => {
  const html = read('index.html');
  const m = /content="([^"]*Content-Security-Policy|default-src[^"]*)"/.exec(html.replace(/\n/g, ' '));
  if (!m) throw new Error('CSP meta tag missing');
  const csp = m[1];
  if (!csp.includes("default-src 'self'")) throw new Error('default-src self missing');
  if (/unsafe-inline|unsafe-eval/.test(csp)) throw new Error('CSP weakened with unsafe-inline/eval');
  if (!csp.includes('connect-src')) throw new Error('connect-src missing');
  for (const origin of ['api.openai.com', 'api.anthropic.com', 'generativelanguage.googleapis.com']) {
    if (!csp.includes(origin)) throw new Error('allowed provider missing: ' + origin);
  }
  return 'default-src self, no unsafe-inline';
});

check('no CDN or external asset is required', () => {
  const files = ['index.html', 'styles.css', ...walk('src').map((f) => f.replaceAll(path.sep, '/'))];
  const allow = [
    'http://www.w3.org/2000/svg',
    'https://api.openai.com', 'https://api.anthropic.com', 'https://generativelanguage.googleapis.com',
  ];
  for (const file of files) {
    const text = read(file);
    for (const m of text.matchAll(/https?:\/\/[^\s"'`)]+/g)) {
      const url = m[0];
      if (allow.some((a) => url.startsWith(a))) continue;
      throw new Error(`external URL in ${file}: ${url}`);
    }
    if (/cdn\.|unpkg|jsdelivr|fonts\.googleapis/i.test(text)) throw new Error(`CDN reference in ${file}`);
  }
  if (!read('index.html').includes('vendor/katex/katex.min.css')) throw new Error('local KaTeX CSS not linked');
  if (!exists('vendor/katex/fonts')) throw new Error('local KaTeX fonts missing');
  return 'self-hosted assets only';
});

check('index uses external scripts only and has a skip link', () => {
  const html = read('index.html');
  if (/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i.test(html)) throw new Error('inline script found');
  if (/\son[a-z]+\s*=/i.test(html)) throw new Error('inline event handler found');
  if (!html.includes('class="skip-link"')) throw new Error('skip link missing');
  if (!html.includes('type="module"')) throw new Error('module entry missing');
  return 'module + skip link';
});

check('API keys are never placed in DOM attributes or notebook data', () => {
  const ui = read('src/ui.js');
  const app = read('src/app.js');
  if (/setAttribute\([^)]*key/i.test(ui) || /dataset\.[a-z]*key/i.test(ui)) throw new Error('ui.js may expose a key in DOM');
  if (/\$\{[^}]*getKey\(/.test(app)) throw new Error('app.js interpolates a key into markup');
  const provider = read('src/providers.js');
  if (/console\.(log|info|debug)\([^)]*key/i.test(provider)) throw new Error('provider logs a key');
  if (/keyInput[^\n]*\bvalue\s*:/.test(app)) throw new Error('settings pre-fills a key value');
  if (/apiKey/.test(read('demo/numopt.notebook.json'))) throw new Error('demo notebook contains an API key');
  return 'no keys in DOM, logs or fixtures';
});

check('storage has an in-memory fallback', () => {
  const stateText = read('src/state.js');
  if (!stateText.includes('memory') || !stateText.includes('probe()')) throw new Error('no fallback tier');
  if (!stateText.includes('try') || !stateText.includes('catch')) throw new Error('storage not guarded');
  return 'memory tier present';
});

check('model requests have a 60-second timeout and cancellation', () => {
  const p = read('src/providers.js');
  if (!p.includes('60000')) throw new Error('60000 ms timeout missing');
  if (!p.includes('AbortController')) throw new Error('AbortController missing');
  if (!p.includes('cancelAll')) throw new Error('cancelAll missing');
  if (!p.includes('invalid_json') || !p.includes('bad_shape')) throw new Error('typed errors missing');
  if (!p.includes('firstBalancedJson')) throw new Error('JSON extraction missing');
  return '60 s, abort, one retry';
});

check('no silent upload path exists', () => {
  const provider = read('src/providers.js');
  if (!/export async function json/.test(provider)) throw new Error('json entry missing');
  const stateText = read('src/state.js');
  if (/fetch\([^)]*notes/i.test(stateText)) throw new Error('notes uploaded outside an explicit action');
  if (!read('src/pages/setup.js').includes('Notes are not uploaded')) throw new Error('setup does not state the upload policy');
  return 'explicit actions only';
});

/* ------------------------------------------------------------------ quality */
check('print stylesheet and sheet warning exist', () => {
  const css = read('styles.css');
  if (!/@media print/.test(css) || !/A4/.test(css)) throw new Error('A4 print styles missing');
  if (!css.includes('.pin-card { break-inside: avoid')) throw new Error('page-break protection missing');
  const sheet = read('src/pages/sheet.js');
  if (!sheet.includes('Check anything here against your textbook')) throw new Error('sheet footer warning missing');
  if (!sheet.includes('window.print()')) throw new Error('print action missing');
  return 'A4, page breaks, warning';
});

check('calendar keeps its signature interaction and accessibility', () => {
  const cal = read('src/pages/calendar.js');
  for (const token of ['cal-ripple', 'cal-particle', 'openSessionDialog', 'toggleEventDone', 'dragstart', 'aria-label', 'ArrowRight', 'prefers-reduced-motion']) {
    if (!cal.includes(token)) throw new Error('calendar missing ' + token);
  }
  const css = read('styles.css');
  if (!css.includes('@keyframes ripple') || !css.includes('@keyframes particleFly')) throw new Error('ripple/particle styles missing');
  return 'ripple, particles, keyboard, DnD';
});

check('math is rendered locally with a Unicode fallback', () => {
  const ui = read('src/ui.js');
  if (!ui.includes('vendor/katex/katex.min.js')) throw new Error('local KaTeX loader missing');
  if (!ui.includes('texToUnicode')) throw new Error('Unicode fallback missing');
  if (/cdn|jsdelivr|unpkg/i.test(ui)) throw new Error('math renderer uses a CDN');
  if (!read('index.html').includes('vendor/katex/katex.min.css')) throw new Error('KaTeX CSS not local');
  return 'local KaTeX + Unicode';
});

check('no placeholder routes or dead anchor links', () => {
  const files = walk('src').filter((f) => f.endsWith('.js'));
  for (const file of files) {
    const text = read(file);
    if (/href="?#"?/.test(text)) throw new Error('placeholder href in ' + file);
    if (/onClick:\s*\(\)\s*=>\s*\{\s*\}/.test(text)) throw new Error('empty click handler in ' + file);
  }
  return `${files.length} modules`;
});

check('reduced motion is respected across animation surfaces', () => {
  const css = read('styles.css');
  if (!css.includes('prefers-reduced-motion')) throw new Error('CSS reduced-motion block missing');
  for (const file of ['src/pages/landing.js', 'src/pages/calendar.js']) {
    if (!read(file).includes('prefers-reduced-motion')) throw new Error(file + ' ignores reduced motion');
  }
  return 'CSS + JS guards';
});

/* ------------------------------------------------------------------ report */
const width = Math.max(...results.map((r) => r.name.length));
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(width)}  ${r.note}`);
}
console.log(`\n${results.length - failed}/${results.length} checks passed.`);
if (failed) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
