/** Prompt builders — strict JSON only. All maths in LaTeX. */

const JSON_RULE = 'Return ONLY one JSON object. No prose, no markdown fences. Mathematical notation must be LaTeX.';

const clip = (s, n) => {
  const text = String(s || '');
  return text.length > n ? text.slice(0, n) + '\n[…clipped…]' : text;
};

export function topicMapPrompt({ syllabus, notes, lang = 'en' }) {
  const system = `You compile an examination syllabus into ordered study topics. ${JSON_RULE}`;
  const user = [
    'Build 5–12 examination topics from the syllabus. If the syllabus is absent, use the notes outline.',
    'Return {"topics":[{...}]}. Each topic:',
    '- name: concise topic name',
    '- aliases: array of other names or abbreviations a student may write',
    '- unit: syllabus unit or grouping',
    '- kind: "numeric" if solving normally needs calculation steps, else "conceptual"',
    '- weight: integer 1–5 for likely examination importance',
    '- prereqs: array of ids from this same list only, no cycles (ids are t1…tN in syllabus order)',
    '',
    'SYLLABUS:',
    syllabus && syllabus.trim() ? clip(syllabus, 4000) : '(absent)',
    '',
    'NOTES OUTLINE:',
    clip(notes, 5000),
    '',
    'Language: ' + (lang || 'en'),
  ].join('\n');
  return { system, user };
}

export function lessonPrompt({ topic, chunks, lang = 'en' }) {
  const excerpts = (chunks || []).map((c) => `[${c.id}] ${clip(c.text, 900)}`).join('\n\n')
    || '(no matching note excerpts)';
  const system = `You write concise, mathematically accurate exam-revision cards. ${JSON_RULE}`;
  const user = [
    `TOPIC: ${topic.name} (kind: ${topic.kind || 'conceptual'}; aliases: ${(topic.aliases || []).join(', ') || 'none'})`,
    'Rules:',
    '1. Use the notes excerpts first. A step or pitfall may have source "notes" ONLY when an excerpt directly supports it, and then chunkIds must list those excerpt ids. Otherwise source is "vertex" and chunkIds is [].',
    '2. Maximum 5 explanation steps. Each step is at most 20 words.',
    '3. One-sentence analogy. notesGaps = what the excerpts still fail to explain.',
    '4. examQuestion: one typical exam question; modelAnswer at most 6 lines; source "notes" or "vertex".',
    '5. Return {"oneLiner","why","analogy","steps":[{"text","source","chunkIds"}],"pitfalls":[{"text","source","chunkIds"}],"notesGaps":[],"diagramMermaid":null,"examQuestion":{"q","modelAnswer","source"},"meta":{"provider","model","at"}}.',
    '6. Never invent a citation or a passage.',
    '',
    'NOTES EXCERPTS:',
    excerpts,
    '',
    'Language: ' + (lang || 'en'),
  ].join('\n');
  return { system, user };
}

export function narrationPrompt({ table, lang = 'en' }) {
  const system = `You narrate a numeric table without changing any number. ${JSON_RULE}`;
  const user = [
    'Write one short sentence per row, using only numbers that already occur in that row. Never introduce a new number.',
    'Return {"rows":[{"index":1,"sentence":"..."}]}.',
    '',
    'TABLE:',
    JSON.stringify(table, null, 2),
    '',
    'Language: ' + (lang || 'en'),
  ].join('\n');
  return { system, user };
}

export { JSON_RULE };
