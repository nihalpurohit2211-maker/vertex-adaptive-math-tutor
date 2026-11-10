/**
 * prompts.js — the three prompts of plan §7 (topic_map, lesson, narration).
 * Track B. Each function returns { system, user } strings ready for
 * llm.json({ task, system, user, ... }).
 *
 * Conventions (Track B-internal, shared with llm.js demo provider):
 * - Every `user` string for tasks "lesson" and "narration" starts with a
 *   machine-readable marker line `TOPIC: <exact topic name>` so the demo
 *   provider can key installed demo data on the topic name without parsing
 *   prose. The model is told to ignore it.
 * - Lesson chunk injection (plan §6.4.5): the CALLER passes the top chunk
 *   objects (plus neighbours) it wants in context; we render them as an
 *   excerpt block with their ids ([c1], [c2], …) so the model can cite
 *   `chunkIds` exactly.
 * - `{lang}` parameterizes wording: "en" | "hinglish" (contracts DEFAULTS.lang).
 * - Prompt intent is kept verbatim from plan §7 — except plan3 §6.3
 *   removed the numeric-trace rules from the lesson prompt (v3: the
 *   product flow has no generated code or traces; legacy lesson `trace`
 *   is discarded at the store import boundary).
 */

import { DEFAULTS } from './contracts.js';

/** Language instruction line for a given lang code. */
function langLine(lang) {
  if (lang === 'hinglish') {
    return 'Language: Hinglish — write prose in natural English-script ' +
      'Hindi-English mix the way Indian college students talk ' +
      '(keep technical terms and all math in English).';
  }
  return 'Language: English — plain, student-friendly English.';
}

/** The shared output-discipline sentence from plan §7 preamble. */
const ONLY_JSON = 'Output ONLY a JSON object, no prose, no markdown fences.';
const MATH_LATEX = 'Math in LaTeX $…$.';

/**
 * topic_map prompt (plan §7.1).
 * @param {{ syllabusRaw?: string, notesOutline?: string, lang?: string }} o
 * @returns {{ system: string, user: string }}
 */
export function topicMapPrompt({ syllabusRaw, notesOutline, lang = DEFAULTS.lang }) {
  const system = [
    'You convert a college syllabus (or the outline of a student\'s notes) ' +
    'into an ordered list of exam topics for a student studying the night before.',
    ONLY_JSON,
    MATH_LATEX,
    langLine(lang),
  ].join(' ');

  const user = [
    'Convert this syllabus (or, if absent, the notes outline) into 5–12 exam topics.',
    'For each: `name`, `aliases` (other names or abbreviations a student might have written), ' +
    '`unit`, `kind` = `"numeric"` if a tiny worked example with numbers can be computed by code ' +
    '(algorithms, formulas, procedures) else `"conceptual"`, `weight` 1–5 (likely exam importance), ' +
    '`prereqs` (ids of other topics in this list only, no cycles).',
    'Return `{topics:[…]}`.',
    'Additionally give every topic an `id` of the form "t1", "t2", … in list order, ' +
    'and use those ids inside `prereqs`.',
    '',
    'SYLLABUS:',
    (syllabusRaw && syllabusRaw.trim()) ? String(syllabusRaw).trim() : '(absent — detect topics from the notes outline)',
    '',
    'NOTES OUTLINE:',
    (notesOutline && notesOutline.trim()) ? String(notesOutline).trim() : '(absent)',
  ].join('\n');

  return { system, user };
}

/**
 * lesson prompt (plan §7.2) with the chunk-injection convention.
 * @param {{ topic: {name: string, aliases?: string[], unit?: string, kind?: string},
 *           chunks?: Array<{id: string, text: string}>, lang?: string }} o
 * @returns {{ system: string, user: string }}
 */
export function lessonPrompt({ topic, chunks, lang = DEFAULTS.lang }) {
  const name = topic && topic.name ? String(topic.name) : '';
  const aliases = topic && Array.isArray(topic.aliases) && topic.aliases.length
    ? topic.aliases.join(', ')
    : '(none given)';
  const unit = topic && topic.unit ? String(topic.unit) : '(none given)';
  const kind = topic && topic.kind === 'conceptual' ? 'conceptual' : 'numeric';

  const excerptBlock = (Array.isArray(chunks) && chunks.length > 0)
    ? chunks
      .filter((c) => c && typeof c.text === 'string')
      .map((c) => `[${c.id}]\n${String(c.text).trim()}`)
      .join('\n\n')
    : '(no excerpts — the student\'s notes appear not to cover this topic; ' +
      'use your own knowledge and set source:"vertex" everywhere)';

  const system = [
    'You write a "missed-the-lecture" card for ONE topic for a college student ' +
    'studying the night before an exam.',
    'NOTES EXCERPTS are provided with ids; use them first.',
    ONLY_JSON,
    MATH_LATEX,
    langLine(lang),
  ].join(' ');

  const user = [
    'TOPIC: ' + name,
    '(The TOPIC line is for routing only; ignore it in your output.)',
    '',
    'Topic: ' + name,
    'Also known as: ' + aliases,
    'Unit: ' + unit,
    'kind: ' + kind,
    '',
    'Rules:',
    '(1) A step or pitfall may have `source:"notes"` only if an excerpt directly ' +
    'supports it, and then you must give `chunkIds`; otherwise `source:"vertex"`.',
    '(2) `notesGaps` = what a student would need that the excerpts do not explain.',
    '(3) Algorithm ≤5 steps, each ≤20 words.',
    '(4) `analogy`: one everyday sentence.',
    '(5) `diagramMermaid`: a `flowchart TD` of the algorithm, ≤8 nodes, ASCII labels, or `null`.',
    '(6) `examQuestion`: a typical question and a model answer ≤6 lines.',
    '(7) ' + langLine(lang),
    '',
    'Return the Lesson schema: {oneLiner, why, analogy, ' +
    'steps:[{text,source,chunkIds}], pitfalls:[{text,source,chunkIds}], notesGaps:[string], ' +
    'diagramMermaid|null, examQuestion:{q,modelAnswer,source}}.',
    'Return exactly the keys listed above and nothing else — no extra fields, no worked-example code.',
    '',
    'NOTES EXCERPTS (cite the bracketed ids as chunkIds):',
    excerptBlock,
  ].join('\n');

  return { system, user };
}

/**
 * narrationPrompt (plan §7.3) — numbers first, words second.
 * Legacy live path may still call this; the product flow (plan3 §2/§6.3) no longer requests narration for curated content — traces were removed and the demo ships reviewed static cards.
 * @param {{ topic: {name: string}|string, steps?: Array<string|{text: string}>,
 *           computedTable?: {columns: string[], rows: Array<Array>, answer: string} | string,
 *           lang?: string }} o
 * @returns {{ system: string, user: string }}
 */
export function narrationPrompt({ topic, steps, computedTable, lang = DEFAULTS.lang }) {
  const name = typeof topic === 'string' ? topic : (topic && topic.name ? String(topic.name) : '');

  const stepLines = Array.isArray(steps) && steps.length > 0
    ? steps
      .map((s, i) => (i + 1) + '. ' + (typeof s === 'string' ? s : (s && s.text ? String(s.text) : '')))
      .filter((line) => line.length > 3)
      .join('\n')
    : '(steps not provided)';

  const tableText = (typeof computedTable === 'string')
    ? computedTable
    : (computedTable && Array.isArray(computedTable.columns))
      ? renderTable(computedTable)
      : '(table not provided)';

  const system = [
    'You explain the rows of an already-COMPUTED numeric trace table for one topic. ' +
    'The numbers are fixed by code; you only describe them.',
    ONLY_JSON,
    langLine(lang),
  ].join(' ');

  const user = [
    'TOPIC: ' + name,
    '(The TOPIC line is for routing only; ignore it in your output.)',
    '',
    'Topic: ' + name,
    '',
    'Algorithm steps:',
    stepLines,
    '',
    'Here are the algorithm steps and the computed table (JSON, exact values):',
    tableText,
    '',
    'Write one short sentence per row explaining what happened, using ONLY numbers that ' +
    'appear in the table, plus a one-sentence takeaway. Never introduce a new number.',
    'Return `{narration:[…], takeaway:""}` — narration has exactly one string per table row, in order.',
  ].join('\n');

  return { system, user };
}

/** Render a TraceResult-shaped object as JSON + a human-readable pipe table. */
function renderTable(t) {
  const cols = t.columns.map(String);
  const header = '| ' + cols.join(' | ') + ' |';
  const body = (Array.isArray(t.rows) ? t.rows : []).map((row) => {
    const cells = (Array.isArray(row) ? row : [row]).map((cell) => {
      if (Array.isArray(cell)) return '[' + cell.map(fmt).join(', ') + ']';
      return fmt(cell);
    });
    return '| ' + cells.join(' | ') + ' |';
  });
  const answer = t.answer ? String(t.answer) : '(none)';
  return [
    JSON.stringify({ columns: t.columns, rows: t.rows, answer: t.answer }),
    '',
    header,
    ...body,
    'answer: ' + answer,
  ].join('\n');
}

/** Exact-ish cell formatting: keep numbers as-is, quote strings. */
function fmt(v) {
  if (typeof v === 'number') return String(v);
  if (v === null || v === undefined) return '';
  return String(v);
}
