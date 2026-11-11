/**
 * services.js — topic detection, coverage, local lesson scaffolds and optional
 * AI generation. The offline path never invents citations or worked numbers.
 */
import { chunkNotes, scoreCoverage } from './chunk.js';
import { buildPlan } from './plan.js';
import { json, LlmError, isConfigured } from './providers.js';
import { topicMapPrompt, lessonPrompt } from './prompts.js';

export { chunkNotes, scoreCoverage, buildPlan };

const numericHint = /(descent|newton|gradient|hessian|search|method|algorithm|matrix|decomposition|integrat|derivative|eigen|factor|interpolat|regression|simplex)/i;
const hardHint = /(newton|hessian|lagrange|gradient|conjugate|bfgs|quasi)/i;

function cleanLine(line) {
  return String(line)
    .replace(/^[\s>*\-–—•\d.)]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitUnit(line) {
  const m = /^([^:]{2,60}):\s*(.+)$/.exec(line);
  if (m && /unit|module|part|chapter|section/i.test(m[1])) {
    return { unit: m[1].trim(), name: m[2].trim() };
  }
  return { unit: '', name: line };
}

function acronym(name) {
  const words = name.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
  if (words.length < 2) return [];
  const a = words.map((w) => w[0]).join('').toLowerCase();
  return a.length >= 2 ? [a] : [];
}

function parseCandidate(text) {
  const { unit, name } = splitUnit(cleanLine(text));
  if (!name || name.length < 3 || name.length > 90) return null;
  if (/^(notes?|lecture|page|the|and|example)\b/i.test(name) && name.split(/\s+/).length > 10) return null;
  const paren = /\(([^)]+)\)/.exec(name);
  const cleanName = name.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleanName) return null;
  const aliases = [];
  if (paren) aliases.push(paren[1].trim());
  aliases.push(...acronym(cleanName));
  return { name: cleanName.slice(0, 70), aliases: aliases.filter((a) => a && a.length > 1), unit: unit.slice(0, 60) };
}

/**
 * Offline topic detection. Syllabus lines are authoritative; headings from the
 * notes fill gaps when asked. Order is preserved. Returns 5–12 topics.
 */
export function detectTopics({ syllabusRaw = '', notesRaw = '', useNotes = true }) {
  const candidates = [];
  const seen = new Set();
  const add = (candidate) => {
    if (!candidate) return;
    const key = candidate.name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  };

  const syllabusLines = String(syllabusRaw || '').split('\n').map(cleanLine).filter((x) => x.length > 2);
  for (const line of syllabusLines) add(parseCandidate(line));

  if (useNotes && candidates.length < 5) {
    const headingLines = String(notesRaw || '').split('\n')
      .filter((l) => /^\s{0,3}#{1,6}\s+/.test(l))
      .map((l) => l.replace(/^\s{0,3}#{1,6}\s+/, ''));
    for (const line of headingLines) {
      if (candidates.length >= 12) break;
      add(parseCandidate(line));
    }
  }

  if (candidates.length < 5) {
    const sentences = String(notesRaw || '')
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .filter((s) => s.length > 25 && s.length < 140)
      .slice(0, 12);
    for (const s of sentences) {
      if (candidates.length >= 5) break;
      const short = s.split(' ').slice(0, 7).join(' ').replace(/[,.;:]$/, '');
      add(parseCandidate(short));
    }
  }

  const limited = candidates.slice(0, 12);
  return limited.map((c, i) => {
    const unit = c.unit || `Unit ${Math.floor(i / 3) + 1}`;
    const sameUnitPrev = limited.slice(0, i).reverse().find((x) => (x.unit || '') === (c.unit || ''));
    return {
      id: `t${i + 1}`,
      name: c.name,
      aliases: c.aliases,
      unit,
      kind: numericHint.test(c.name) ? 'numeric' : 'conceptual',
      weight: hardHint.test(c.name) ? 4 : 3,
      prereqs: sameUnitPrev ? [`t${limited.indexOf(sameUnitPrev) + 1}`] : [],
      coverage: { status: 'not_found', score: 0, chunkIds: [] },
      rating: null,
      after: null,
      lesson: null,
    };
  });
}

export function makeChunks(notesRaw) {
  return chunkNotes(notesRaw);
}

export function applyCoverage(topics, chunks) {
  for (const topic of topics) {
    try {
      topic.coverage = scoreCoverage(topic, chunks);
    } catch {
      topic.coverage = { status: 'not_found', score: 0, chunkIds: [] };
    }
  }
  return topics;
}

export function recomputeCoverage(notebook) {
  const chunks = notebook.notes?.chunks || [];
  applyCoverage(notebook.topics, chunks);
  return notebook;
}

/* -------------------------------------------------------------------------- */
/* optional AI generation                                                      */
/* -------------------------------------------------------------------------- */

function normaliseAiTopics(raw) {
  const list = Array.isArray(raw?.topics) ? raw.topics.slice(0, 12) : [];
  if (list.length < 5) return null;
  const mapped = list.map((t, i) => ({
    id: `t${i + 1}`,
    name: String(t.name || `Topic ${i + 1}`).slice(0, 80),
    aliases: Array.isArray(t.aliases) ? t.aliases.map(String).slice(0, 6) : [],
    unit: String(t.unit || `Unit ${Math.floor(i / 3) + 1}`).slice(0, 60),
    kind: t.kind === 'numeric' ? 'numeric' : 'conceptual',
    weight: Math.min(5, Math.max(1, Number(t.weight) || 3)),
    prereqs: Array.isArray(t.prereqs)
      ? t.prereqs.map((p) => (Number.isInteger(Number(p)) ? `t${Number(p)}` : String(p)))
      : [],
    coverage: { status: 'not_found', score: 0, chunkIds: [] },
    rating: null,
    after: null,
    lesson: null,
  }));
  const valid = new Set(mapped.map((t) => t.id));
  for (const topic of mapped) {
    topic.prereqs = [...new Set(topic.prereqs)].filter((p) => valid.has(p) && p !== topic.id);
  }
  return mapped;
}

function validateTopicMap(obj) {
  const errors = [];
  if (!obj || !Array.isArray(obj.topics)) return ['expected {"topics":[...]}'];
  if (obj.topics.length < 5) errors.push('need at least 5 topics');
  if (obj.topics.length > 12) errors.push('maximum 12 topics');
  obj.topics.forEach((t, i) => {
    if (!t || typeof t !== 'object') { errors.push(`topics[${i}] must be an object`); return; }
    if (typeof t.name !== 'string' || !t.name.trim()) errors.push(`topics[${i}].name is required`);
    if (!Array.isArray(t.aliases)) errors.push(`topics[${i}].aliases must be an array`);
    if (typeof t.unit !== 'string') errors.push(`topics[${i}].unit must be a string`);
    if (t.kind !== 'numeric' && t.kind !== 'conceptual') errors.push(`topics[${i}].kind must be numeric or conceptual`);
    if (!Number.isInteger(Number(t.weight)) || Number(t.weight) < 1 || Number(t.weight) > 5) errors.push(`topics[${i}].weight must be 1..5`);
    if (!Array.isArray(t.prereqs)) errors.push(`topics[${i}].prereqs must be an array`);
  });
  return errors.length ? errors : true;
}

export async function aiTopicMap({ syllabusRaw, notesRaw, lang, signal }) {
  const prompt = topicMapPrompt({ syllabus: syllabusRaw, notes: notesRaw, lang });
  const raw = await json({ ...prompt, validate: validateTopicMap, signal });
  const topics = normaliseAiTopics(raw);
  if (!topics) throw new LlmError('bad_shape', 'The model returned too few topics.');
  return topics;
}

const LESSON_SOURCES = new Set(['notes', 'vertex']);

function validateLessonShape(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object') return ['lesson must be an object'];
  for (const key of ['oneLiner', 'why', 'analogy']) {
    if (typeof obj[key] !== 'string' || !obj[key].trim()) errors.push(`${key} must be a non-empty string`);
  }
  if (!Array.isArray(obj.steps)) errors.push('steps must be an array');
  else {
    if (obj.steps.length > 5) errors.push('steps must have at most 5 entries');
    obj.steps.forEach((s, i) => {
      if (!s || typeof s.text !== 'string') errors.push(`steps[${i}].text is required`);
      if (!LESSON_SOURCES.has(s.source)) errors.push(`steps[${i}].source must be notes or vertex`);
      if (!Array.isArray(s.chunkIds)) errors.push(`steps[${i}].chunkIds must be an array`);
    });
  }
  if (!Array.isArray(obj.pitfalls)) errors.push('pitfalls must be an array');
  if (!Array.isArray(obj.notesGaps)) errors.push('notesGaps must be an array');
  if (!obj.examQuestion || typeof obj.examQuestion.q !== 'string' || typeof obj.examQuestion.modelAnswer !== 'string') {
    errors.push('examQuestion must contain q and modelAnswer');
  }
  return errors.length ? errors : true;
}

/** Never allow a notes claim without a chunk that exists in the notebook. */
export function enforceCitations(lesson, chunks) {
  const valid = new Set((chunks || []).map((c) => c.id));
  const fix = (row) => {
    if (!row || typeof row !== 'object') return row;
    const ids = Array.isArray(row.chunkIds) ? row.chunkIds.filter((id) => valid.has(id)) : [];
    if (row.source === 'notes' && ids.length === 0) return { ...row, source: 'vertex', chunkIds: [] };
    return { ...row, chunkIds: ids };
  };
  return {
    ...lesson,
    steps: (lesson.steps || []).slice(0, 5).map(fix),
    pitfalls: (lesson.pitfalls || []).map(fix),
    notesGaps: Array.isArray(lesson.notesGaps) ? lesson.notesGaps.map(String) : [],
  };
}

export async function aiLesson({ topic, chunks, lang, signal }) {
  const prompt = lessonPrompt({ topic, chunks, lang });
  const raw = await json({ ...prompt, validate: validateLessonShape, signal });
  const lesson = enforceCitations(raw, chunks);
  lesson.diagramMermaid = typeof raw.diagramMermaid === 'string' ? raw.diagramMermaid : null;
  lesson.meta = {
    provider: raw.meta?.provider || 'provider',
    model: raw.meta?.model || 'model',
    at: new Date().toISOString(),
  };
  return lesson;
}

/* -------------------------------------------------------------------------- */
/* offline lesson scaffold                                                     */
/* -------------------------------------------------------------------------- */

export function localLesson(topic, notebook) {
  const chunks = notebook?.notes?.chunks || [];
  const cited = chunks.filter((c) => (topic.coverage?.chunkIds || []).includes(c.id));
  const evidence = cited[0] || null;
  const status = topic.coverage?.status || 'not_found';
  const statusLine = status === 'covered'
    ? 'Your notes explain it, so this card focuses on exam wording and the conditions people skip.'
    : status === 'thin'
      ? 'Your notes mention it but do not complete the explanation, so part of this card is a scaffold rather than a summary.'
      : 'There is no matching passage in your notes, so this card is a revision scaffold, not a summary of evidence.';
  const steps = [];
  if (evidence) {
    steps.push({
      text: `Your notes say: “${evidence.text.replace(/\s+/g, ' ').slice(0, 150)}…”`,
      source: 'notes',
      chunkIds: [evidence.id],
    });
  }
  steps.push(
    { text: `Write the definition of ${topic.name} in one sentence, in your own words.`, source: 'vertex', chunkIds: [] },
    { text: 'List the formula or procedure, the conditions for using it, and the quantity being found.', source: 'vertex', chunkIds: [] },
    { text: 'Work one example end to end and show every substitution, not just the final number.', source: 'vertex', chunkIds: [] },
    { text: 'Check the assumptions and units; state the result with its condition.', source: 'vertex', chunkIds: [] },
  );
  const pitfalls = [
    {
      text: status === 'covered'
        ? 'Do not reproduce the notes without the conditions of the method; exams award method marks for those conditions.'
        : 'Do not assume the lecture covered this. The absence of a matching passage is a gap to close before the exam.',
      source: 'vertex',
      chunkIds: [],
    },
  ];
  const gaps = [];
  if (status === 'not_found') gaps.push(`No matching passage for ${topic.name} was found in your notes.`);
  if (status === 'thin') gaps.push('The note evidence only mentions the idea; a complete worked example is missing.');
  if (status === 'covered') gaps.push('Your notes explain the idea; check whether they also state every condition and a worked example.');
  return {
    oneLiner: `${topic.name} — a revision card built around what your notes do and do not contain.`,
    why: `${statusLine} The topic carries exam weight ${topic.weight}/5 in your syllabus.`,
    analogy: 'A revision card is a recipe: name the dish, list the ingredients, then follow the steps once without hiding any substitution.',
    steps: steps.slice(0, 5),
    pitfalls,
    notesGaps: gaps,
    diagramMermaid: null,
    examQuestion: {
      q: `State the definition or method for ${topic.name} and apply it once to a short example from your tutorial sheet.`,
      modelAnswer: 'Vertex has not generated a model answer for this topic. Write your own, then compare it with your textbook or tutorial solution. Adding an API key in Settings enables a generated card with citations.',
      source: 'vertex',
    },
    meta: { provider: 'offline', model: 'revision scaffold', at: new Date().toISOString() },
  };
}

export function isAiReady() {
  return isConfigured();
}
