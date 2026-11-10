/**
 * main.js — Vertex shell: hash router, boot, global error toast, keyboard
 * shortcuts (plan §6.10) and the cross-view flow orchestration
 * (setup → map → lesson → sheet, plan §5).
 *
 * Engine modules (store/llm/schema/chunk/plan/trace/prompts) are written by
 * other tracks; they are loaded dynamically and every one falls back to a
 * local dev stub so this UI boots standalone during development. All calls
 * code strictly against CONTRACTS.md signatures.
 */
import {
  ROUTES,
  DEFAULTS,
  STORAGE,
  LLM_ERROR_KINDS,
  COVERAGE_STATUSES,
} from './contracts.js';
import {
  renderSafeMarkdown,
  renderMermaid,
  renderPlot,
  formatTraceValue,
} from './render.js';
import * as viewSetup from './views/setup.js';
import * as viewMap from './views/map.js';
import * as viewLesson from './views/lesson.js';
import * as viewSheet from './views/sheet.js';
import * as viewSettings from './views/settings.js';

/* ---------------------------------------------------------------------- */
/* DOM helper (no innerHTML outside render.js, no inline on* handlers)     */
/* ---------------------------------------------------------------------- */

export function h(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') node.className = String(v);
      else if (k === 'text') node.textContent = String(v);
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k === 'hidden') node.hidden = !!v;
      else if (k.startsWith('on')) continue; // inline handlers are banned
      else node.setAttribute(k, String(v));
    }
  }
  const kids = children === null || children === undefined ? [] : (Array.isArray(children) ? children : [children]);
  for (const kid of kids) {
    if (kid === null || kid === undefined || kid === false) continue;
    node.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
  }
  return node;
}

/* ---------------------------------------------------------------------- */
/* Dev-mode mocks (used ONLY while a track's module is not on disk yet)    */
/* ---------------------------------------------------------------------- */

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'can', 'do', 'for',
  'from', 'had', 'has', 'have', 'how', 'if', 'in', 'into', 'is', 'it', 'its',
  'no', 'not', 'of', 'on', 'or', 'so', 'than', 'that', 'the', 'this', 'to',
  'we', 'what', 'when', 'with', 'you', 'your',
]);

function tokenize(s) {
  return String(s || '').toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function makeMockStore() {
  const mem = new Map();
  let current = null;
  const get = (k) => { try { return localStorage.getItem(k); } catch (err) { console.warn('store mock: localStorage unavailable —', err.message); return mem.has(k) ? mem.get(k) : null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (err) { console.warn('store mock: write failed —', err.message); mem.set(k, v); } };
  const del = (k) => { try { localStorage.removeItem(k); } catch (err) { console.warn('store mock: remove failed —', err.message); mem.delete(k); } };
  const sget = (k) => { try { return sessionStorage.getItem(k); } catch (err) { console.warn('store mock: sessionStorage unavailable —', err.message); return mem.has('ss:' + k) ? mem.get('ss:' + k) : null; } };
  const sset = (k, v) => { try { sessionStorage.setItem(k, v); } catch (err) { console.warn('store mock: session write failed —', err.message); mem.set('ss:' + k, v); } };
  const sdel = (k) => { try { sessionStorage.removeItem(k); } catch (err) { console.warn('store mock: session remove failed —', err.message); mem.delete('ss:' + k); } };
  const api = {
    async getSettings() {
      try { return JSON.parse(get(STORAGE.settings) || '{}'); }
      catch (err) { console.warn('store mock: bad settings JSON —', err.message); return {}; }
    },
    async setSettings(patch) {
      const next = { ...(await api.getSettings()), ...patch };
      set(STORAGE.settings, JSON.stringify(next));
      return next;
    },
    async getKey(provider) {
      const k = provider === 'gemini' ? STORAGE.keyGemini : STORAGE.keyBharatcode;
      return sget(k) || get(k) || null;
    },
    async setKey(provider, value) {
      const k = provider === 'gemini' ? STORAGE.keyGemini : STORAGE.keyBharatcode;
      if (!value) { sdel(k); del(k); return; }
      const s = await api.getSettings();
      if (s.remember) { set(k, value); sdel(k); } else { sset(k, value); del(k); }
    },
    async saveNotebook(nb) {
      current = nb;
      set(STORAGE.notebookKey(nb.id), JSON.stringify(nb));
      set('vx2.nb.last', nb.id);
    },
    async loadNotebook(id) {
      const key = id || get('vx2.nb.last');
      if (!key) return current;
      const raw = get(STORAGE.notebookKey(key));
      if (!raw) return current;
      try { current = JSON.parse(raw); return current; }
      catch (err) { console.warn('store mock: notebook JSON unreadable —', err.message); return current; }
    },
    async exportNotebook(nb) { return JSON.stringify(nb, null, 2); },
    async importNotebook(json) {
      const o = JSON.parse(json);
      if (!o || typeof o !== 'object' || !Array.isArray(o.topics) || !o.notes || typeof o.notes.raw !== 'string') {
        throw new Error('Not a valid Vertex notebook JSON');
      }
      return o;
    },
    async loadDemoNotebook() {
      const r = await fetch('demo/numopt.notebook.json');
      if (!r.ok) throw new Error('demo notebook fetch failed (' + r.status + ')');
      return r.json();
    },
    async saveRating(topicId, rating) {
      if (!current) return;
      const t = current.topics.find((x) => x.id === topicId);
      if (t) { t.rating = rating; await api.saveNotebook(current); }
    },
    async saveAfter(topicId, after) {
      if (!current) return;
      const t = current.topics.find((x) => x.id === topicId);
      if (t) { t.after = after; await api.saveNotebook(current); }
    },
  };
  return api;
}

function makeMockLlm() {
  let demoData = null;
  const fail = (kind, msg) => { const e = new Error(msg); e.kind = kind; return e; };
  return {
    config: {},
    async json({ task, user }) {
      if (demoData && task === 'topic_map' && demoData.topic_map) {
        return JSON.parse(JSON.stringify(demoData.topic_map));
      }
      if (demoData && Array.isArray(demoData.lessons) && typeof user === 'string') {
        const hit = demoData.lessons.find((l) => l && typeof l.topicName === 'string' && user.includes(l.topicName));
        if (hit && task === 'lesson' && hit.lesson) return JSON.parse(JSON.stringify(hit.lesson));
        if (hit && task === 'narration' && hit.narration) return JSON.parse(JSON.stringify(hit.narration));
      }
      throw fail('no_key', 'Dev stub LLM has no data for task "' + task + '". Track B llm.js will replace this.');
    },
    cancelAll() { /* dev stub has no in-flight calls */ },
    configure(cfg) { Object.assign(this.config, cfg || {}); },
    installDemoData(d) { demoData = d; },
  };
}

function makeMockSchema() {
  return {
    validateTopicMap(o) {
      if (!o || !Array.isArray(o.topics) || o.topics.length === 0) return ['expected {topics:[…]} with at least 1 topic'];
      const bad = o.topics.filter((t) => !t || typeof t.name !== 'string' || !t.name.trim());
      return bad.length ? ['every topic needs a string name'] : true;
    },
    validateLesson(o) {
      if (!o || typeof o !== 'object') return ['lesson must be an object'];
      const errs = [];
      for (const k of ['oneLiner', 'why', 'analogy']) if (typeof o[k] !== 'string') errs.push(k + ' must be a string');
      if (!Array.isArray(o.steps) || o.steps.length > 5) errs.push('steps must be an array of ≤5');
      if (!Array.isArray(o.pitfalls)) errs.push('pitfalls must be an array');
      if (!Array.isArray(o.notesGaps)) errs.push('notesGaps must be an array');
      if (o.trace !== null && (!o.trace || typeof o.trace !== 'object')) errs.push('trace must be null or an object');
      if (!o.examQuestion || typeof o.examQuestion.q !== 'string') errs.push('examQuestion.q required');
      return errs.length ? errs : true;
    },
    enforceCitations(lesson) { return lesson; },
    stripThink: (s) => String(s || '').replace(/<think>[\s\S]*?<\/think>/g, ''),
    stripFences: (s) => String(s || '').replace(/```(json)?/gi, ''),
    firstBalancedJson: (s) => { const m = String(s || '').match(/\{[\s\S]*\}/); return m ? m[0] : null; },
  };
}

function makeMockChunk() {
  return {
    chunkNotes(raw) {
      const blocks = String(raw || '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
      const parts = [];
      let cur = '';
      for (const b of blocks) {
        if (!cur) { cur = b; continue; }
        if ((cur + '\n\n' + b).length <= 1200) cur = cur + '\n\n' + b;
        else { parts.push(cur); cur = b; }
      }
      if (cur) parts.push(cur);
      const chunks = [];
      for (let i = 0; i < parts.length; i++) {
        if (chunks.length && parts[i].length < 200) chunks[chunks.length - 1].text += '\n\n' + parts[i];
        else chunks.push({ id: 'c' + (chunks.length + 1), text: parts[i] });
      }
      return chunks;
    },
    scoreCoverage(topic, chunks) {
      const terms = [...new Set(tokenize([topic.name, ...(topic.aliases || [])].join(' ')))];
      if (!terms.length || !chunks.length) return { status: 'not_found', score: 0, chunkIds: [] };
      const scored = chunks.map((c) => {
        const words = tokenize(c.text);
        let hits = 0;
        for (const t of terms) {
          const n = words.filter((w) => w.startsWith(t.slice(0, Math.max(3, t.length - 2)))).length;
          if (n) hits += n / (n + 1.2);
        }
        return { id: c.id, hits, raw: words };
      }).filter((s) => s.hits > 0).sort((a, b) => b.hits - a.hits);
      if (!scored.length) return { status: 'not_found', score: 0, chunkIds: [] };
      const topTerms = new Set(scored[0].raw);
      const a = terms.filter((t) => [...topTerms].some((w) => w.startsWith(t.slice(0, 3)))).length / terms.length;
      const b = scored.length >= 2 ? 2 : 1;
      const status = a >= 0.8 && b >= 2 ? 'covered' : (a >= 0.4 || b >= 1 ? 'thin' : 'not_found');
      return { status, score: Math.round(a * 100) / 100, chunkIds: scored.slice(0, 3).map((s) => s.id) };
    },
  };
}

/** plan.js §6.5 implemented locally for dev mode; real Track A module wins. */
function computePlan(nb) {
  const topics = (nb && nb.topics) || [];
  const byId = new Map(topics.map((t) => [t.id, t]));
  const budgetMin = Math.max(1, Math.round(((nb.settings && nb.settings.hoursToStudy) || DEFAULTS.hoursToStudy) * 60));
  const GAP = { knew: 0.1, kinda: 0.6, lost: 1.0 };
  const BOOST = { not_found: 0.30, thin: 0.15, covered: 0 };
  const prio = (t) => {
    const g = GAP[t.rating] !== undefined ? GAP[t.rating] : 0.6;
    const b = BOOST[t.coverage && t.coverage.status] || 0;
    return (t.weight || 3) * (g + b);
  };
  const inSet = (id) => byId.has(id);
  const ordered = [];
  const placed = new Set();
  const place = (t) => {
    if (!t || placed.has(t.id)) return;
    placed.add(t.id);
    for (const p of (t.prereqs || [])) if (inSet(p)) place(byId.get(p));
    ordered.push(t.id);
  };
  const sorted = [...topics].sort((x, y) => prio(y) - prio(x));
  for (const t of sorted) place(t);
  const sum = sorted.reduce((s, t) => s + prio(t), 0) || 1;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const minutesById = {};
  for (const t of topics) minutesById[t.id] = clamp(Math.round((budgetMin * prio(t)) / sum), 5, 20);
  const fits = [];
  const ifTime = [];
  let acc = 0;
  for (const id of ordered) {
    const m = minutesById[id] || 0;
    if (acc + m <= budgetMin) { fits.push(id); acc += m; } else ifTime.push(id);
  }
  const candidates = ordered.filter((id) => {
    const t = byId.get(id);
    return t && t.rating !== 'knew' && t.after !== 'got';
  });
  const sheetIds = candidates.slice(0, 6);
  const prereqWarnings = [];
  for (const t of topics) {
    if (t.rating === 'lost') {
      for (const p of (t.prereqs || [])) {
        const pt = byId.get(p);
        if (pt && pt.rating !== 'knew') prereqWarnings.push({ topicId: t.id, prereqId: p });
      }
    }
  }
  return { ordered, minutesById, fits, ifTime, sheetIds, candidates, prereqWarnings };
}

function makeMockTrace() {
  return {
    async runTrace() { return { computed: false, result: null }; },
  };
}

function makeMockPrompts() {
  return {
    topicMapPrompt: ({ syllabus, notes, lang }) => buildTopicMapPrompt({ syllabus, notes, lang }),
    lessonPrompt: ({ topic, chunkTexts, lang, simpler }) => buildLessonPrompt({ topic, chunkTexts, lang, simpler }),
    narrationPrompt: ({ topic, columns, rows, steps, lang }) => buildNarrationPrompt({ topic, columns, rows, steps, lang }),
  };
}

/* ---------------------------------------------------------------------- */
/* Built-in prompt copies (plan §7). Used as fallback if prompts.js is     */
/* missing OR its exact function signatures differ — reported as friction. */
/* ---------------------------------------------------------------------- */

const JSON_RULE = 'Output ONLY a JSON object, no prose, no markdown fences. Math in LaTeX $…$.';

function clip(s, n) {
  s = String(s || '');
  return s.length > n ? s.slice(0, n) + '\n[…clipped…]' : s;
}

function buildTopicMapPrompt({ syllabus, notes, lang }) {
  const src = (syllabus && syllabus.trim()) ? 'the SYLLABUS' : 'the NOTES OUTLINE';
  const user = [
    'Convert ' + src + ' into 5–12 exam topics.',
    'For each topic: "name", "aliases" (other names or abbreviations a student might have written), "unit",',
    '"kind" = "numeric" if a tiny worked example with numbers can be computed by code (algorithms, formulas, procedures) else "conceptual",',
    '"weight" 1–5 (likely exam importance), "prereqs" (ids like "t1" of other topics in this list only, no cycles).',
    'Assign ids t1…tN in syllabus order.',
    'Return {"topics":[…]}.',
    '',
    'SYLLABUS:',
    syllabus && syllabus.trim() ? clip(syllabus, 4000) : '(absent — detect topics from the notes outline)',
    '',
    'NOTES OUTLINE:',
    clip(notes, 6000),
    '',
    'Language: ' + (lang || 'en'),
  ].join('\n');
  return { system: 'You are a strict study-plan compiler. ' + JSON_RULE, user };
}

function buildLessonPrompt({ topic, chunkTexts, lang, simpler }) {
  const excerpts = (chunkTexts || []).map((c) => '[' + c.id + '] ' + clip(c.text, 900)).join('\n\n') || '(no relevant excerpts found in the student notes)';
  const user = [
    'You write a "missed-the-lecture" card for ONE topic for a college student studying the night before an exam.',
    'TOPIC: ' + (topic.name || '') + ' (kind: ' + (topic.kind || 'conceptual') + ', aliases: ' + ((topic.aliases || []).join(', ') || 'none') + ')',
    'NOTES EXCERPTS are provided with ids; use them first.',
    'Rules:',
    '(1) A step or pitfall may have "source":"notes" only if an excerpt directly supports it, and then you must give its "chunkIds"; otherwise "source":"vertex".',
    '(2) "notesGaps" = what a student would need that the excerpts do not explain.',
    '(3) Algorithm ≤5 steps, each ≤20 words. (4) "analogy": one everyday sentence.',
    '(5) If kind is "numeric", write "trace.code": a JS `function run(){…}` returning {columns, rows, answer}; tiny example, ≤8 rows, small friendly numbers, only Math, no imports/randomness/I/O, ≤40 lines. Do NOT state computed numbers in any prose.',
    '(6) "diagramMermaid": a `flowchart TD` of the algorithm, ≤8 nodes, ASCII labels, or null.',
    '(7) "examQuestion": {q, modelAnswer (≤6 lines), source}.',
    '(8) Language: ' + (lang || 'en') + '.',
    simpler ? 'The student marked the previous version "still lost": rewrite with a NEW everyday analogy, simpler words, and shorter steps.' : '',
    'Return the Lesson JSON: {oneLiner, why, analogy, steps:[{text,source,chunkIds}], pitfalls:[…], notesGaps:[…], trace:{title,code,computed:false,result:null,narration:[],takeaway}|null, diagramMermaid, examQuestion, meta:{provider,model,at}}.',
    '',
    'NOTES EXCERPTS:',
    excerpts,
  ].filter(Boolean).join('\n');
  return { system: 'You are a concise exam-eve tutor. ' + JSON_RULE, user };
}

function buildNarrationPrompt({ topic, columns, rows, steps, lang }) {
  const user = [
    'TOPIC: ' + (topic && topic.name ? topic.name : ''),
    'Here are the algorithm steps:',
    JSON.stringify(steps || []),
    'and the COMPUTED table:',
    JSON.stringify({ columns, rows }),
    'Write one short sentence per row explaining what happened, using ONLY numbers that appear in the table, plus a one-sentence takeaway.',
    'Return {"narration":[…],"takeaway":""}. Language: ' + (lang || 'en') + '.',
  ].join('\n');
  return { system: 'You describe computed results. Do not introduce new numbers. ' + JSON_RULE, user };
}

/* ---------------------------------------------------------------------- */
/* App state + dependency resolution                                         */
/* ---------------------------------------------------------------------- */

const state = {
  settings: {
    hoursToStudy: DEFAULTS.hoursToStudy,
    lang: DEFAULTS.lang,
    model: DEFAULTS.modelBharatcode,
    provider: 'bharatcode',
    remember: false,
    bharatcodeBaseUrl: DEFAULTS.bharatcodeBaseUrl,
  },
  notebook: null,
  build: { active: false, stage: -1 },
  prefetch: { active: false, total: 0, done: 0 },
  setupError: null,
  lessonErrors: {},
  generating: {},
  mapOrder: null,
};

const deps = {};
const depsReal = {};

async function loadDeps() {
  const mocks = {
    store: makeMockStore,
    llm: makeMockLlm,
    schema: makeMockSchema,
    chunk: makeMockChunk,
    plan: null,
    trace: makeMockTrace,
    prompts: makeMockPrompts,
  };
  for (const name of Object.keys(mocks)) {
    try {
      const mod = await import('./' + name + '.js');
      if (!mod || typeof mod !== 'object') throw new Error('module has no exports');
      deps[name] = mod;
      depsReal[name] = true;
    } catch (err) {
      console.warn('main.js: src/' + name + '.js unavailable — using dev stub (' + err.message + ')');
      depsReal[name] = false;
      if (name === 'plan') {
        deps.plan = { buildPlan: computePlan };
      } else {
        deps[name] = mocks[name]();
      }
    }
  }
}

function safePlan(nb) {
  try {
    const p = deps.plan.buildPlan(nb);
    if (p && Array.isArray(p.ordered)) {
      if (!Array.isArray(p.candidates)) {
        const byId = new Map(nb.topics.map((t) => [t.id, t]));
        p.candidates = p.ordered.filter((id) => {
          const t = byId.get(id);
          return t && t.rating !== 'knew' && t.after !== 'got';
        });
      }
      return p;
    }
    throw new Error('buildPlan returned a non-contract shape');
  } catch (err) {
    console.warn('main.js: plan.js failed, using local §6.5 computation —', err.message);
    return computePlan(nb);
  }
}

/* ---------------------------------------------------------------------- */
/* Toast + error copy                                                      */
/* ---------------------------------------------------------------------- */

function toast(message, kind) {
  const cont = document.getElementById('toast-container');
  if (!cont) return;
  const el = h('div', { class: 'toast toast-' + (kind || 'info') }, [String(message)]);
  cont.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  const ms = kind === 'error' ? 9000 : 4200;
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 320);
  }, ms);
  while (cont.childElementCount > 4) cont.removeChild(cont.firstChild);
}

function llmKind(err) {
  const kind = err && err.kind;
  return LLM_ERROR_KINDS.includes(kind) ? kind : null;
}

/** Maps contract error kinds → UI copy (CONTRACTS.md: nothing else). */
function describeError(err) {
  const kind = llmKind(err);
  const status = err && err.httpStatus;
  if (kind === 'no_key') return 'Add a free BharatCode key (Settings ⚙), or try the demo.';
  if (kind === 'network') {
    if (status === 401 || status === 403) return 'That BharatCode key was rejected (401/403). Paste a working key in Settings ⚙.';
    return 'Could not reach BharatCode (network or CORS). Retry, or use the demo.';
  }
  if (kind === 'ratelimit') {
    const s = err && err.retryAfterMs ? Math.max(1, Math.ceil(err.retryAfterMs / 1000)) : null;
    return 'Rate limited — Vertex is backing off.' + (s ? ' Try again in ~' + s + ' s.' : ' Try again in a moment.');
  }
  if (kind === 'timeout') return 'The model took longer than 60 s. Retry?';
  if (kind === 'cancelled') return 'Cancelled.';
  if (kind === 'invalid_json' || kind === 'bad_shape') return "couldn't generate this one, retry";
  return 'Something went wrong. Retry, or try the demo.';
}

/* ---------------------------------------------------------------------- */
/* Context passed to every view                                            */
/* ---------------------------------------------------------------------- */

const ctx = {
  h,
  state,
  deps,
  depsReal,
  navigate,
  toast,
  rerender: null, // set after router defined
  openSettings,
  describeError,
  safePlan,
  rmd: renderSafeMarkdown,
  rMermaid: renderMermaid,
  rPlot: renderPlot,
  fmtTrace: formatTraceValue,
  actions: {
    tryDemo,
    buildCourse,
    cancelBuild,
    generateLesson,
    rateTopic,
    setAfter,
    exportNotebook,
    importNotebookText,
    openSettings,
    closeSettings,
    saveSettings,
    fallbackPlan: computePlan,
  },
};

/* ---------------------------------------------------------------------- */
/* Router (hash-based, CONTRACTS.md §Routes)                               */
/* ---------------------------------------------------------------------- */

function normalizeHash(raw) {
  if (!raw || raw === '#' || raw === '#/') return ROUTES.SETUP;
  if (raw.startsWith(ROUTES.LESSON_PREFIX)) {
    const id = raw.slice(ROUTES.LESSON_PREFIX.length);
    return id ? ROUTES.LESSON_PREFIX + id : ROUTES.SETUP;
  }
  if (raw === ROUTES.SETUP || raw === ROUTES.MAP || raw === ROUTES.SHEET) return raw;
  return ROUTES.SETUP;
}

function parseRoute(hash) {
  if (hash.startsWith(ROUTES.LESSON_PREFIX)) {
    return { name: 'lesson', param: decodeURIComponent(hash.slice(ROUTES.LESSON_PREFIX.length)) };
  }
  if (hash === ROUTES.MAP) return { name: 'map', param: null };
  if (hash === ROUTES.SHEET) return { name: 'sheet', param: null };
  return { name: 'setup', param: null };
}

let currentViewCleanup = null;

async function route() {
  const target = normalizeHash(location.hash);
  if (target !== location.hash) {
    location.replace(target); // unknown route → #/setup (also fires hashchange)
    return;
  }
  const r = parseRoute(target);
  if (typeof currentViewCleanup === 'function') {
    try { currentViewCleanup(); } catch (err) { console.warn('main.js: view cleanup failed —', err.message); }
  }
  currentViewCleanup = null;

  const root = document.getElementById('root');
  root.replaceChildren();
  for (const btn of document.querySelectorAll('.nav-btn[data-route]')) {
    btn.classList.toggle('is-active', btn.getAttribute('data-route') === target);
    btn.setAttribute('aria-current', btn.getAttribute('data-route') === target ? 'page' : 'false');
  }
  const section = h('div', { class: 'view view-' + r.name, id: 'view-' + r.name });
  root.appendChild(section);
  try {
    if (r.name === 'setup') await viewSetup.render(section, ctx);
    else if (r.name === 'map') await viewMap.render(section, ctx);
    else if (r.name === 'lesson') await viewLesson.render(section, ctx, r.param);
    else await viewSheet.render(section, ctx);
  } catch (err) {
    console.error('main.js: view "' + r.name + '" failed to render —', err);
    section.appendChild(fallbackCard(err));
  }
  window.scrollTo(0, 0);
}

function fallbackCard(err) {
  const card = h('div', { class: 'card empty-card' }, [
    h('h2', { class: 'card-title', text: 'This screen failed to render.' }),
    h('p', { class: 'muted', text: 'Vertex is keeping you on screen instead of a blank page. Error: ' + ((err && err.message) || 'unknown') }),
  ]);
  const btn = h('button', { type: 'button', class: 'btn btn-accent', text: 'Back to setup' });
  btn.addEventListener('click', () => navigate(ROUTES.SETUP));
  card.appendChild(btn);
  return card;
}

function navigate(hash) {
  const target = normalizeHash(hash);
  if (location.hash === target) route();
  else location.hash = target;
}
ctx.rerender = route;

/* ---------------------------------------------------------------------- */
/* Settings helpers                                                        */
/* ---------------------------------------------------------------------- */

function applySettingsToLlm() {
  if (deps.llm && typeof deps.llm.configure === 'function') {
    deps.llm.configure({
      baseUrl: state.settings.bharatcodeBaseUrl || DEFAULTS.bharatcodeBaseUrl,
      model: state.settings.model,
      lang: state.settings.lang,
    });
  }
}

async function saveSettings(patch) {
  Object.assign(state.settings, patch || {});
  try { await deps.store.setSettings(patch || {}); }
  catch (err) { console.warn('main.js: store.setSettings failed —', err.message); }
  applySettingsToLlm();
}

function openSettings() {
  const mount = document.getElementById('settings-modal-root');
  if (!mount || mount.childElementCount > 0) return;
  viewSettings.render(mount, ctx).catch((err) => {
    console.error('main.js: settings modal failed —', err);
    toast('Settings failed to open.', 'error');
  });
}

function closeSettings() {
  const mount = document.getElementById('settings-modal-root');
  if (mount) mount.replaceChildren();
}

/* ---------------------------------------------------------------------- */
/* Flow actions                                                            */
/* ---------------------------------------------------------------------- */

async function tryDemo() {
  toast('Loading demo notebook…');
  let nb = null;
  try {
    nb = await deps.store.loadDemoNotebook();
  } catch (err) {
    console.warn('main.js: store.loadDemoNotebook() failed —', err.message, '— falling back to dev stub.');
  }
  if (!nb) {
    try {
      const r = await fetch('demo/dev-stub.notebook.json');
      if (r.ok) nb = await r.json();
    } catch (err) {
      console.warn('main.js: dev stub fetch failed —', err.message);
    }
  }
  if (!nb) {
    toast('No demo notebook found (demo/numopt.notebook.json or demo/dev-stub.notebook.json).', 'error');
    return;
  }
  state.notebook = nb;
  state.lessonErrors = {};
  try { await deps.store.saveNotebook(nb); }
  catch (err) { console.warn('main.js: could not persist demo notebook —', err.message); }
  navigate(ROUTES.MAP);
}

function setBuildStage(i) {
  state.build = { active: true, stage: i };
  route();
}

async function buildCourse({ notesRaw, syllabusRaw, hours }) {
  const provider = state.settings.provider || 'bharatcode';
  if (provider === 'bharatcode') {
    let key = null;
    try { key = await deps.store.getKey('bharatcode'); }
    catch (err) { console.warn('main.js: getKey failed —', err.message); }
    if (!key) {
      state.setupError = { kind: 'no_key' };
      route();
      return;
    }
  }
  state.setupError = null;
  try {
    setBuildStage(0); // Reading notes
    let chunks;
    try { chunks = deps.chunk.chunkNotes(notesRaw); }
    catch (err) {
      console.warn('main.js: chunkNotes failed —', err.message);
      chunks = makeMockChunk().chunkNotes(notesRaw);
    }

    setBuildStage(1); // Mapping topics
    // prompts.js destructures { syllabusRaw, notesOutline, lang }; both key
    // spellings are passed so the mock fallback and the real module agree.
    const mapPrompt = callPrompt('topicMapPrompt', {
      syllabus: syllabusRaw, syllabusRaw: syllabusRaw,
      notes: notesRaw, notesOutline: notesRaw,
      lang: state.settings.lang,
    });
    const map = await deps.llm.json({
      task: 'topic_map',
      system: mapPrompt.system,
      user: mapPrompt.user,
      validate: (o) => {
        try { return deps.schema.validateTopicMap(o); }
        catch (err) { console.warn('main.js: validateTopicMap threw —', err.message); return true; }
      },
      provider,
    });
    const topics = (map.topics || []).map((t, i) => ({
      id: typeof t.id === 'string' && t.id ? t.id : 't' + (i + 1),
      name: String(t.name || ('Topic ' + (i + 1))),
      aliases: Array.isArray(t.aliases) ? t.aliases.map(String) : [],
      unit: String(t.unit || ''),
      kind: t.kind === 'numeric' ? 'numeric' : 'conceptual',
      weight: Math.min(5, Math.max(1, Number(t.weight) || 3)),
      prereqs: Array.isArray(t.prereqs) ? t.prereqs.map(String) : [],
      coverage: { status: 'not_found', score: 0, chunkIds: [] },
      rating: null,
      after: null,
      lesson: null,
    }));
    const nb = {
      id: 'nb-' + Date.now(),
      title: 'My crash course',
      createdAt: new Date().toISOString(),
      notes: { raw: notesRaw, chunks },
      syllabus: { raw: syllabusRaw || '', source: syllabusRaw && syllabusRaw.trim() ? 'pasted' : 'auto' },
      settings: { hoursToStudy: hours, lang: state.settings.lang },
      topics,
    };

    setBuildStage(2); // Checking coverage
    for (const t of topics) {
      try {
        t.coverage = deps.chunk.scoreCoverage(t, chunks);
        if (!COVERAGE_STATUSES.includes(t.coverage.status)) t.coverage = { status: 'not_found', score: 0, chunkIds: [] };
      } catch (err) {
        console.warn('main.js: scoreCoverage failed for ' + t.name + ' —', err.message);
        t.coverage = { status: 'not_found', score: 0, chunkIds: [] };
      }
    }
    state.notebook = nb;
    const plan = safePlan(nb);
    try { await deps.store.saveNotebook(nb); }
    catch (err) { console.warn('main.js: saveNotebook failed —', err.message); }
    await saveSettings({ hoursToStudy: hours });

    // Never a blank screen: show the map now, prefetch lessons in background.
    state.build = { active: false, stage: -1 };
    navigate(ROUTES.MAP);
    const firstThree = plan.fits.slice(0, 3);
    state.prefetch = { active: true, total: firstThree.length, done: 0 };
    await Promise.allSettled(firstThree.map((id) =>
      generateLesson(id, { silent: true, keepView: true }).then(() => {
        state.prefetch.done += 1;
        route();
      })
    ));
    state.prefetch.active = false;
    route();
  } catch (err) {
    state.build = { active: false, stage: -1 };
    if (llmKind(err) === 'cancelled') {
      toast('Build cancelled.', 'info');
    } else {
      state.setupError = {
        kind: llmKind(err) || 'network',
        httpStatus: err && err.httpStatus,
        message: describeError(err),
      };
    }
    route();
  }
}

function callPrompt(name, args) {
  const fns = deps.prompts;
  if (fns && typeof fns[name] === 'function') {
    try {
      const out = fns[name](args);
      if (out && typeof out.user === 'string') return out;
      if (typeof out === 'string') return { system: JSON_RULE, user: out };
      console.warn('main.js: prompts.' + name + ' returned no usable prompt; using built-in copy.');
    } catch (err) {
      console.warn('main.js: prompts.' + name + ' threw (signature drift?); using built-in copy —', err.message);
    }
  }
  if (name === 'topicMapPrompt') return buildTopicMapPrompt(args);
  if (name === 'lessonPrompt') return buildLessonPrompt(args);
  return buildNarrationPrompt(args);
}

async function generateLesson(topicId, opts) {
  opts = opts || {};
  const nb = state.notebook;
  if (!nb) { toast('No notebook yet — build a course or open the demo first.', 'error'); return; }
  const topic = nb.topics.find((t) => t.id === topicId);
  if (!topic) { toast('Unknown topic.', 'error'); return; }
  if (state.generating[topicId]) return;

  state.generating[topicId] = true;
  delete state.lessonErrors[topicId];
  if (!opts.keepView) route();

  const provider = state.settings.provider || 'bharatcode';
  try {
    const chunks = Array.isArray(nb.notes.chunks) ? nb.notes.chunks : [];
    const cited = chunks.filter((c) => (topic.coverage.chunkIds || []).includes(c.id));
    const promptChunks = cited.length ? cited : chunks.slice(0, 3);
    const p = callPrompt('lessonPrompt', {
      topic,
      chunks: promptChunks,
      chunkTexts: promptChunks,
      lang: state.settings.lang,
      simpler: !!opts.simpler,
    });
    // prompts.js lessonPrompt has no "simpler" option; add the instruction
    // ourselves for the "Still lost → explain simpler" path.
    const lessonPromptOut = opts.simpler
      ? {
        system: p.system,
        user: p.user + '\n\nThe student did not follow the first explanation: use plainer words, one idea per step, fewer symbols, and a smaller example if possible.',
      }
      : p;
    let lesson = await deps.llm.json({
      task: 'lesson',
      system: lessonPromptOut.system,
      user: lessonPromptOut.user,
      validate: (o) => {
        try { return deps.schema.validateLesson(o, topic.kind); }
        catch (err) { console.warn('main.js: validateLesson threw —', err.message); return true; }
      },
      provider,
    });
    try { lesson = deps.schema.enforceCitations(lesson, chunks, topic.coverage); }
    catch (err) { console.warn('main.js: enforceCitations failed —', err.message); }
    lesson = lesson || {};
    lesson.meta = lesson.meta || { provider, model: state.settings.model, at: new Date().toISOString() };

    if (lesson.trace && typeof lesson.trace.code === 'string') {
      let ran = { computed: false, result: null };
      try { ran = await deps.trace.runTrace(lesson.trace.code); }
      catch (err) { console.warn('main.js: runTrace threw —', err.message); }
      if (ran && ran.computed && ran.result) {
        lesson.trace.computed = true;
        lesson.trace.result = ran.result;
        try {
          const np = callPrompt('narrationPrompt', {
            topic,
            // prompts.js destructures { topic, steps, computedTable, lang }.
            computedTable: ran.result,
            columns: ran.result.columns,
            rows: ran.result.rows,
            steps: (lesson.steps || []).map((s) => s.text),
            lang: state.settings.lang,
          });
          const nn = await deps.llm.json({
            task: 'narration',
            system: np.system,
            user: np.user,
            validate: (o) => (o && Array.isArray(o.narration) && typeof o.takeaway === 'string') ? true : ['narration must be an array and takeaway a string'],
            provider,
          });
          lesson.trace.narration = nn.narration;
          lesson.trace.takeaway = nn.takeaway;
        } catch (err) {
          console.warn('main.js: narration failed, keeping lesson narration —', err.message);
          if (!Array.isArray(lesson.trace.narration)) lesson.trace.narration = [];
        }
      } else {
        lesson.trace.computed = false; // exact UI label handled in lesson view
        if (!Array.isArray(lesson.trace.narration)) lesson.trace.narration = [];
      }
    }

    topic.lesson = lesson;
    state.lessonErrors[topicId] = null;
    try { await deps.store.saveNotebook(nb); }
    catch (err) { console.warn('main.js: saveNotebook failed —', err.message); }
  } catch (err) {
    const kind = llmKind(err);
    if (kind === 'cancelled') state.lessonErrors[topicId] = null;
    else {
      state.lessonErrors[topicId] = {
        kind: kind || 'network',
        httpStatus: err && err.httpStatus,
        retryAfterMs: err && err.retryAfterMs,
        message: describeError(err),
      };
    }
    if (!opts.silent && kind && kind !== 'cancelled') toast(describeError(err), 'error');
  } finally {
    delete state.generating[topicId];
    route();
  }
}

async function rateTopic(topicId, rating) {
  const nb = state.notebook;
  if (!nb) return;
  const topic = nb.topics.find((t) => t.id === topicId);
  if (!topic) return;
  topic.rating = topic.rating === rating ? null : rating;
  try { await deps.store.saveRating(topicId, topic.rating); }
  catch (err) { console.warn('main.js: saveRating failed —', err.message); }
  route();
}

async function setAfter(topicId, after) {
  const nb = state.notebook;
  if (!nb) return;
  const topic = nb.topics.find((t) => t.id === topicId);
  if (!topic) return;
  topic.after = after;
  try { await deps.store.saveAfter(topicId, after); }
  catch (err) { console.warn('main.js: saveAfter failed —', err.message); }
}

function cancelBuild() {
  try {
    if (deps.llm && typeof deps.llm.cancelAll === 'function') deps.llm.cancelAll();
  } catch (err) { console.warn('main.js: cancelAll failed —', err.message); }
  state.build = { active: false, stage: -1 };
  state.prefetch = { active: false, total: 0, done: 0 };
  state.generating = {};
  toast('Cancelled — what was already prepared is still here.', 'info');
  route();
}

async function exportNotebook() {
  const nb = state.notebook;
  if (!nb) { toast('Nothing to export yet.', 'error'); return; }
  let json;
  try { json = await deps.store.exportNotebook(nb); }
  catch (err) {
    console.warn('main.js: store.exportNotebook failed —', err.message);
    json = JSON.stringify(nb, null, 2);
  }
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: (nb.id || 'vertex') + '.notebook.json', 'aria-hidden': 'true' });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('Notebook JSON downloaded — you can re-import it any time.', 'good');
}

async function importNotebookText(text) {
  let nb;
  try { nb = await deps.store.importNotebook(text); }
  catch (err) {
    console.warn('main.js: importNotebook failed —', err.message);
    toast('Import failed: ' + ((err && err.message) || 'not valid notebook JSON'), 'error');
    return;
  }
  if (!nb || !Array.isArray(nb.topics)) {
    toast('Import failed: file is not a Vertex notebook.', 'error');
    return;
  }
  state.notebook = nb;
  state.lessonErrors = {};
  try { await deps.store.saveNotebook(nb); }
  catch (err) { console.warn('main.js: saveNotebook after import failed —', err.message); }
  toast('Notebook imported — opening your plan.', 'good');
  navigate(ROUTES.MAP);
}

/* ---------------------------------------------------------------------- */
/* Keyboard shortcuts (plan §6.10) + global error handling                 */
/* ---------------------------------------------------------------------- */

function bindShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    if (typing) return; // shortcuts ignore inputs/textareas
    if (e.key === 'Escape') { closeSettings(); return; }
    if (e.key === ',') { e.preventDefault(); openSettings(); return; }
    if (e.key === 'm') { navigate(ROUTES.MAP); return; }
    if (e.key === 's') { navigate(ROUTES.SHEET); return; }
    if (e.key === 'd') { navigate(ROUTES.SETUP); return; }
    if (e.key === 'p' && location.hash === ROUTES.SHEET) { e.preventDefault(); window.print(); return; }
    if (/^[1-9]$/.test(e.key) && location.hash === ROUTES.MAP && state.mapOrder) {
      const id = state.mapOrder[Number(e.key) - 1];
      if (id) navigate(ROUTES.LESSON_PREFIX + id);
    }
  });
}

function bindGlobalErrors() {
  window.addEventListener('error', (e) => {
    console.error('Vertex global error:', e.message, e.filename, e.lineno);
    toast('Unexpected error: ' + (e.message || 'see console'), 'error');
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    console.error('Vertex unhandled rejection:', reason);
    if (reason && (reason.name === 'AbortError' || llmKind(reason) === 'cancelled')) return;
    toast('Unexpected error: ' + ((reason && reason.message) || 'see console'), 'error');
  });
}

function bindHeaderNav() {
  for (const btn of document.querySelectorAll('.nav-btn[data-route]')) {
    btn.addEventListener('click', () => navigate(btn.getAttribute('data-route')));
  }
  const gear = document.getElementById('btn-settings');
  if (gear) gear.addEventListener('click', openSettings);
}

/* ---------------------------------------------------------------------- */
/* Boot                                                                    */
/* ---------------------------------------------------------------------- */

async function boot() {
  bindGlobalErrors();
  await loadDeps();
  try {
    const stored = await deps.store.getSettings();
    if (stored && typeof stored === 'object') {
      for (const k of Object.keys(state.settings)) {
        if (stored[k] !== undefined && stored[k] !== null) state.settings[k] = stored[k];
      }
    }
  } catch (err) { console.warn('main.js: getSettings failed —', err.message); }
  applySettingsToLlm();
  try {
    const nb = await deps.store.loadNotebook();
    if (nb && Array.isArray(nb.topics) && nb.notes) state.notebook = nb;
  } catch (err) { console.warn('main.js: no saved notebook to resume —', err.message); }
  bindHeaderNav();
  bindShortcuts();
  window.addEventListener('hashchange', route);
  if (!location.hash) location.replace(ROUTES.SETUP);
  await route();
}

boot().catch((err) => {
  console.error('main.js: boot failed —', err);
  const root = document.getElementById('root');
  if (root) {
    root.replaceChildren();
    root.appendChild(fallbackCard(err));
  }
  toast('Vertex failed to start — see the console.', 'error');
});
