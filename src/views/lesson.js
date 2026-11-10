/**
 * views/lesson.js — Screen 3 (plan §5): missed-the-lecture card with trust
 * tags ([Your notes ¶chunk] are real buttons that open the quoted snippet,
 * [Added by Vertex] is a label), computed trace table with the honest badge,
 * narration rows, gaps, Mermaid diagram (P1, removed on failure), likely
 * exam question + reveal, pitfalls, and [Got it] / [Still lost → explain
 * simpler]. Handles lesson===null (generate on click) and every LLM error
 * kind with its retry-card copy (plan §5 empty/error states).
 */
import { ROUTES } from '../contracts.js';
import { formatTraceValue } from '../render.js';

const COVERAGE_LABEL = {
  covered: 'Your notes: covered',
  thin: 'Your notes: thin',
  not_found: 'Your notes: nothing',
};

function buildTraceTable(ctx, trace) {
  const table = document.createElement('table');
  table.className = 'trace-table';
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  for (const c of (trace.result.columns || [])) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = String(c);
    hr.appendChild(th);
  }
  thead.appendChild(hr);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const row of (trace.result.rows || [])) {
    const tr = document.createElement('tr');
    for (const cell of row) {
      const td = document.createElement('td');
      td.textContent = formatTraceValue(cell);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

export async function render(container, ctx, topicId) {
  const { h, state, actions } = ctx;
  const nb = state.notebook;

  if (!nb) {
    const card = h('div', { class: 'card empty-card' }, [
      h('p', { class: 'muted', text: 'No notebook loaded yet — open the demo or build your course first.' }),
    ]);
    const b = h('button', { type: 'button', class: 'btn btn-accent', text: 'Go to setup' });
    b.addEventListener('click', () => ctx.navigate(ROUTES.SETUP));
    card.appendChild(b);
    container.appendChild(card);
    return;
  }

  const idx = nb.topics.findIndex((t) => t.id === topicId);
  if (idx === -1) {
    const card = h('div', { class: 'card empty-card' }, [h('p', { text: 'Unknown topic "' + String(topicId) + '".' })]);
    const b = h('button', { type: 'button', class: 'btn btn-ghost', text: '← Back to plan' });
    b.addEventListener('click', () => ctx.navigate(ROUTES.MAP));
    card.appendChild(b);
    container.appendChild(card);
    return;
  }
  const topic = nb.topics[idx];
  const plan = ctx.safePlan(nb);
  const posInPlan = plan.ordered.indexOf(topic.id) + 1;

  /* ---- top bar ---- */
  const back = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: '← Plan' });
  back.addEventListener('click', () => ctx.navigate(ROUTES.MAP));
  const pos = h('span', { class: 'chip chip-ghost', text: 'Topic ' + (posInPlan || idx + 1) + ' of ' + plan.ordered.length });
  container.appendChild(h('div', { class: 'lesson-topbar' }, [back, pos]));

  /* ---- snippet viewer for [Your notes ¶cN] tags ---- */
  const snippetBox = h('aside', { class: 'drawer card', hidden: true, 'aria-label': 'Quoted note snippet', role: 'complementary' });
  function showSnippet(chunkId) {
    const chunk = ((nb.notes && nb.notes.chunks) || []).find((c) => c.id === chunkId);
    snippetBox.replaceChildren();
    snippetBox.appendChild(h('h3', { class: 'drawer-title', text: 'From your notes — ¶' + chunkId }));
    snippetBox.appendChild(chunk
      ? h('blockquote', { class: 'snippet' }, [h('p', { text: chunk.text })])
      : h('p', { class: 'muted', text: 'The cited chunk ' + chunkId + ' no longer exists — treat this line as unverified.' }));
    snippetBox.hidden = false;
    snippetBox.scrollIntoView({ block: 'nearest' });
  }

  /* ---- generating skeleton ---- */
  if (state.generating[topic.id]) {
    const sk = h('div', { class: 'card lesson-card skeleton', role: 'status', 'aria-live': 'polite' }, [
      h('h1', { class: 'lesson-title', text: topic.name }),
      h('p', { class: 'muted', text: 'Writing this two-minute lesson… the other sections fill in when it lands. (Calls take up to ~60 s — this is a real model, not a spinner for show.)' }),
    ]);
    const cancel = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Cancel' });
    cancel.addEventListener('click', actions.cancelBuild);
    sk.appendChild(cancel);
    container.appendChild(sk);
    return;
  }

  /* ---- retry card for failed generation ---- */
  const err = state.lessonErrors[topic.id];
  if (err && err.kind && err.kind !== 'cancelled') {
    const card = h('div', { class: 'card lesson-card retry-card', role: 'alert' }, [
      h('h1', { class: 'lesson-title', text: topic.name }),
    ]);
    let msg = err.message || ctx.describeError({ kind: err.kind, httpStatus: err.httpStatus });
    if (err.kind === 'invalid_json' || err.kind === 'bad_shape') msg = "couldn't generate this one, retry — the model sent JSON we couldn't use even once more.";
    if (err.kind === 'ratelimit') msg = 'Rate limited by BharatCode (free tier has limits). Vertex backs off automatically — ' + (err.retryAfterMs ? 'try again in ~' + Math.max(1, Math.ceil(err.retryAfterMs / 1000)) + ' s.' : 'try again in a moment.');
    if (err.kind === 'no_key') msg = 'Add a free BharatCode key, or try the demo.';
    if (err.kind === 'network' && (err.httpStatus === 401 || err.httpStatus === 403)) msg = 'That BharatCode key was rejected (401/403). Paste a working key in Settings ⚙.';
    card.appendChild(h('p', { class: 'retry-msg', text: msg }));
    const retry = h('button', { type: 'button', class: 'btn btn-accent', text: 'Retry' });
    retry.addEventListener('click', () => actions.generateLesson(topic.id, {}));
    card.appendChild(h('div', { class: 'btn-row' }, [retry]));
    if (err.kind === 'no_key' || (err.kind === 'network' && (err.httpStatus === 401 || err.httpStatus === 403))) {
      const gearBtn = h('button', { type: 'button', class: 'btn btn-ghost', text: 'Open Settings ⚙' });
      gearBtn.addEventListener('click', actions.openSettings);
      card.appendChild(gearBtn);
    }
    container.appendChild(card);
    return;
  }

  /* ---- no lesson yet ---- */
  if (!topic.lesson) {
    const card = h('div', { class: 'card lesson-card' }, [
      h('h1', { class: 'lesson-title', text: topic.name }),
      h('p', { class: 'muted', text: 'No lesson generated for this topic yet. Lessons are made on demand — two model calls and one local computation.' }),
    ]);
    const gen = h('button', { type: 'button', class: 'btn btn-accent', text: 'generate this lesson' });
    gen.addEventListener('click', () => actions.generateLesson(topic.id, {}));
    card.appendChild(gen);
    container.appendChild(card);
    container.appendChild(snippetBox);
    return;
  }

  /* ---- full lesson card ---- */
  const lesson = topic.lesson;
  const card = h('article', { class: 'card lesson-card', 'aria-labelledby': 'lesson-heading' });
  card.appendChild(h('h1', { class: 'lesson-title', id: 'lesson-heading', text: topic.name }));

  const cov = (topic.coverage && topic.coverage.status) || 'not_found';
  const vertexItems = [].concat(lesson.steps || [], lesson.pitfalls || []).filter((s) => s && s.source === 'vertex').length;
  card.appendChild(h('div', { class: 'lesson-chips' }, [
    h('span', { class: 'chip ' + (cov === 'covered' ? 'chip-covered' : cov === 'thin' ? 'chip-thin' : 'chip-none'), text: COVERAGE_LABEL[cov] || 'Your notes: ?' }),
    h('span', { class: 'chip chip-vertex', text: 'Added by Vertex: ' + vertexItems + ' item' + (vertexItems === 1 ? '' : 's') }),
    topic.kind === 'conceptual' ? h('span', { class: 'chip chip-ghost', text: 'conceptual — no computed trace' }) : null,
  ]));

  const section = (title, bodyChildren) => {
    const s = h('section', { class: 'lesson-section' }, [h('h2', { class: 'section-title', text: title })].concat(bodyChildren));
    return s;
  };

  const oneLiner = h('p', { class: 'lesson-oneliner' });
  await ctx.rmd(oneLiner, '**In one line:** ' + (lesson.oneLiner || ''));
  card.appendChild(oneLiner);
  card.appendChild(section('Why it exists', [h('p', { class: 'lesson-why', text: lesson.why || '' })]));
  card.appendChild(section('Everyday analogy', [h('p', { class: 'lesson-analogy', text: lesson.analogy || '' })]));

  /* algorithm steps with trust tags */
  const stepsOl = h('ol', { class: 'steps-list' });
  (lesson.steps || []).slice(0, 5).forEach((step, i) => {
    const li = h('li', { class: 'step-item' });
    li.appendChild(h('p', { class: 'step-text', text: step.text || '' }));
    const tagWrap = h('span', { class: 'tag-row' });
    if (step.source === 'notes' && Array.isArray(step.chunkIds) && step.chunkIds.length) {
      for (const cid of step.chunkIds) {
        const tag = h('button', { type: 'button', class: 'tag tag-notes', 'aria-label': 'Your notes chunk ' + cid + ' — open the quoted snippet', text: 'Your notes ¶' + cid });
        tag.addEventListener('click', () => showSnippet(cid));
        tagWrap.appendChild(tag);
      }
    } else {
      tagWrap.appendChild(h('span', { class: 'tag tag-vertex', text: 'Added by Vertex' }));
    }
    li.appendChild(tagWrap);
    stepsOl.appendChild(li);
  });
  card.appendChild(section('Algorithm (≤5 steps)', [stepsOl]));

  /* worked example / trace */
  const trace = lesson.trace;
  if (trace) {
    const traceSec = h('section', { class: 'lesson-section trace-section' }, [
      h('h2', { class: 'section-title', text: trace.title || 'Worked example' }),
    ]);
    if (trace.computed === true) {
      traceSec.appendChild(h('span', { class: 'badge badge-computed', text: '✓ Computed in your browser' }));
    } else {
      traceSec.appendChild(h('span', { class: 'badge badge-illustrative', text: 'Illustrative example (not computed)' }));
    }
    if (trace.result && Array.isArray(trace.result.rows) && trace.result.rows.length) {
      traceSec.appendChild(buildTraceTable(ctx, trace));
      if (trace.result.answer) {
        traceSec.appendChild(h('p', { class: 'trace-answer', text: 'Answer: ' + trace.result.answer }));
      }
      if (Array.isArray(trace.narration) && trace.narration.length) {
        const nar = h('ol', { class: 'narration-list' });
        for (const line of trace.narration) nar.appendChild(h('li', { text: String(line) }));
        if (trace.takeaway) nar.appendChild(h('li', { class: 'takeaway', text: trace.takeaway }));
        traceSec.appendChild(h('h3', { class: 'sub-title', text: 'What happened, row by row' }));
        traceSec.appendChild(nar);
      }
      if (trace.computed === true && topic.kind === 'numeric' && trace.result.rows.length >= 3) {
        const plotWrap = h('div', { class: 'plot-wrap' });
        ctx.rPlot(plotWrap, trace);
        traceSec.appendChild(h('h3', { class: 'sub-title', text: 'Convergence plot' }));
        traceSec.appendChild(plotWrap);
      }
    } else if (typeof trace.code === 'string' && trace.code.trim()) {
      traceSec.appendChild(h('pre', { class: 'trace-code', text: trace.code }));
    }
    card.appendChild(traceSec);
  } else if (topic.kind === 'conceptual') {
    card.appendChild(h('p', { class: 'scope-note muted', text: 'This topic is conceptual — Vertex teaches it in words. Computed examples are for algorithmic topics (the build is STEM-tuned, on purpose).' }));
  }

  /* notes gaps */
  if (Array.isArray(lesson.notesGaps) && lesson.notesGaps.length) {
    const gaps = h('ul', { class: 'gaps-list' });
    for (const g of lesson.notesGaps) gaps.appendChild(h('li', { text: g }));
    card.appendChild(section("Your notes don't explain", [gaps]));
  }

  /* mermaid diagram (P1): rendered only if present and it renders */
  if (lesson.diagramMermaid) {
    const dia = h('div', { class: 'mermaid-block', 'aria-label': 'Algorithm flowchart' });
    card.appendChild(section('Flow', [dia]));
    await ctx.rMermaid(dia, lesson.diagramMermaid); // removes itself on failure
  }

  /* likely exam question + reveal */
  if (lesson.examQuestion && lesson.examQuestion.q) {
    const eq = lesson.examQuestion;
    const eqSec = h('section', { class: 'lesson-section' }, [h('h2', { class: 'section-title', text: 'Likely exam question' })]);
    eqSec.appendChild(h('p', { class: 'exam-q', text: eq.q }));
    if (eq.source === 'vertex') eqSec.appendChild(h('span', { class: 'tag tag-vertex', text: 'Added by Vertex' }));
    const answer = h('div', { class: 'exam-answer', hidden: true });
    await ctx.rmd(answer, eq.modelAnswer || '');
    const reveal = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'aria-expanded': 'false', text: 'Reveal model answer' });
    reveal.addEventListener('click', () => {
      const open = answer.hidden;
      answer.hidden = !open;
      reveal.setAttribute('aria-expanded', String(open));
      reveal.textContent = open ? 'Hide model answer' : 'Reveal model answer';
    });
    eqSec.appendChild(reveal);
    eqSec.appendChild(answer);
    card.appendChild(eqSec);
  }

  /* pitfalls */
  if (Array.isArray(lesson.pitfalls) && lesson.pitfalls.length) {
    const pit = h('ul', { class: 'pitfalls-list' });
    for (const p of lesson.pitfalls) {
      const li = h('li');
      li.appendChild(h('span', { text: p.text || '' }));
      if (p.source === 'notes' && Array.isArray(p.chunkIds) && p.chunkIds.length) {
        for (const cid of p.chunkIds) {
          const tag = h('button', { type: 'button', class: 'tag tag-notes', 'aria-label': 'Your notes chunk ' + cid + ' — open the quoted snippet', text: 'Your notes ¶' + cid });
          tag.addEventListener('click', () => showSnippet(cid));
          li.appendChild(tag);
        }
      } else {
        li.appendChild(h('span', { class: 'tag tag-vertex', text: 'Added by Vertex' }));
      }
      pit.appendChild(li);
    }
    card.appendChild(section('Watch out for', [pit]));
  }

  if (lesson.meta && lesson.meta.model) {
    card.appendChild(h('p', { class: 'footnote muted', text: 'Generated by ' + lesson.meta.provider + '/' + lesson.meta.model + (lesson.meta.at ? ' on ' + String(lesson.meta.at).slice(0, 10) : '') + '.' }));
  }

  /* actions */
  const gotBtn = h('button', { type: 'button', class: 'btn btn-accent', text: 'Got it' });
  gotBtn.addEventListener('click', async () => {
    await actions.setAfter(topic.id, 'got');
    ctx.toast('Marked “got it” — this topic drops off your sheet.', 'good');
    ctx.rerender();
  });
  const lostBtn = h('button', { type: 'button', class: 'btn btn-ghost', text: 'Still lost → explain simpler' });
  lostBtn.addEventListener('click', async () => {
    await actions.setAfter(topic.id, 'still_lost');
    await actions.generateLesson(topic.id, { simpler: true });
  });
  card.appendChild(h('div', { class: 'btn-row lesson-actions' }, [gotBtn, lostBtn]));

  container.appendChild(card);
  container.appendChild(snippetBox);
}
