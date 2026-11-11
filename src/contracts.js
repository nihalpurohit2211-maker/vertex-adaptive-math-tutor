/**
 * contracts.js — shared domain constants used by the reused coverage and plan
 * engines. Field names follow the original Vertex data model.
 */

export const COVERAGE_STATUSES = ['covered', 'thin', 'not_found'];
export const TOPIC_KINDS = ['numeric', 'conceptual'];
export const LESSON_SOURCES = ['notes', 'vertex'];
export const RATINGS = ['knew', 'kinda', 'lost'];
export const AFTER_STATES = ['got', 'still_lost'];

export const DEFAULTS = {
  hoursToStudy: 3,
  lang: 'en',
  citationOverlapMin: 0.25,
};

/**
 * @typedef {Object} Chunk { id: "c1", text: string }
 * @typedef {Object} Coverage { status: "covered"|"thin"|"not_found", score: number, chunkIds: string[] }
 * @typedef {Object} Topic { id, name, aliases, unit, kind, weight, prereqs, coverage, rating, after, lesson }
 * @typedef {Object} Lesson { oneLiner, why, analogy, steps, pitfalls, notesGaps, diagramMermaid, examQuestion, meta }
 * @typedef {Object} Notebook { id, title, createdAt, notes, syllabus, settings, topics }
 */
