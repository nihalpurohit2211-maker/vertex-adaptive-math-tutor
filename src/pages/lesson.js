/** lesson.js — the full topic studio: explanation, evidence, visualization, scenario, pins. */
import {
  h, icon, button, coverageChip, sourceChip, mathNode, badge, openDialog, toast,
  announce, setBusy, emptyState,
} from '../ui.js';
import { optimizerWidget } from '../charts.js';
import { getActiveNotebook, saveNotebook, markOpened, addPoint, removePoint } from '../state.js';
import { ensureLesson, topicById, relativeTime } from '../shared.js';
import { pinId } from '../core.js';
import { FLOWS, SCENARIOS } from '../seed.js';
import { buildPlan, aiLesson, isAiReady } from '../services.js';
import { describeLlmError } from '../providers.js';

const TOPIC_KEY_BY_NAME = [
  [/gradient\s*descent/i, 't1'],
  [/newton/i, 't2'],
  [/armijo/i, 't3'],
  [/quasi|bfgs/i, 't4'],
  [/gram/i, 't5'],
  [/conjugate/i, 't6'],
];

function seedKey(topic) {
  if (FLOWS[topic.id]) return topic.id;
  const hit = TOPIC_KEY_BY_NAME.find(([re]) => re.test(topic.name));
  return hit ? hit[1] : null;
}

function flowFor(topic) {
  const key = seedKey(topic);
  const steps = key ? FLOWS[key] : null;
  if (!steps) return null;
  return h('ol', { class: 'flow', 'aria-label': `Method flow for ${topic.name}` },
    steps.map((step, i) => h('li', { class: 'flow-step' },
      h('span', { class: 'flow-index', text: String(i + 1).padStart(2, '0') }),
      h('span', { class: 'flow-label', text: step }),
      i < steps.length - 1 ? h('span', { class: 'flow-arrow', 'aria-hidden': 'true' }, icon('chevronDown', 14)) : null)));
}

function scenariosFor(topic) {
  const key = seedKey(topic);
  return key ? SCENARIOS[key] || null : null;
}

export default function renderLesson(root, ctx, topicId) {
  const nb = getActiveNotebook();
  if (!nb) { ctx.navigate('#/setup'); return () => {}; }
  const topic = topicById(nb).get(topicId);
  if (!topic) {
    toast('That topic is not in this workspace.', 'error');
    ctx.navigate('#/coverage');
    return () => {};
  }
  const lesson = ensureLesson(nb, topic);
  markOpened(nb, topic.id);
  const chunks = nb.notes?.chunks || [];
  const chunkById = new Map(chunks.map((c) => [c.id, c]));
  const byId = topicById(nb);
  const plan = buildPlan(nb);
  const minutes = plan.minutesById[topic.id] || 20;
  const pinnedIds = new Set((nb.pinPoints || []).map((p) => p.id));
  const viz = ['t1', 't2', 't3', 't4', 't5', 't6'].includes(seedKey(topic)) || /gradient|newton|armijo|bfgs|gram|conjugate|descent|optim/i.test(topic.name)
    ? optimizerWidget(topic.id, topic.name)
    : null;

  const pinButtons = [];

  function togglePin(point) {
    const existing = (nb.pinPoints || []).find((p) => p.id === point.id);
    if (existing) {
      removePoint(nb, point.id);
      toast('Removed from the revision sheet.', 'info');
      announce('Pin removed from the revision sheet.');
    } else {
      const result = addPoint(nb, point);
      if (result.added) {
        toast('Pinned to the revision sheet.', 'good');
        announce('Pinned to the revision sheet.');
      } else {
        toast('That point is already pinned.', 'info');
      }
    }
    pinnedIds.clear();
    for (const p of nb.pinPoints || []) pinnedIds.add(p.id);
    for (const btn of pinButtons) {
      const on = pinnedIds.has(btn.dataset.pinId);
      btn.classList.toggle('pinned', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      const label = btn.querySelector('span');
      if (label) label.textContent = on ? 'Pinned' : 'Pin';
    }
    ctx.refreshShell?.();
  }

  function pinButton(point, label = 'Pin') {
    const id = point.id || pinId(point.topicId, point.text, point.kind || 'point');
    const full = { ...point, id };
    const btn = h('button', {
      type: 'button', class: `pin-btn${pinnedIds.has(id) ? ' pinned' : ''}`,
      'aria-pressed': pinnedIds.has(id) ? 'true' : 'false',
      'aria-label': `${pinnedIds.has(id) ? 'Unpin' : 'Pin'} this point to the revision sheet`,
      'data-pin-id': id,
      title: 'Pin to revision sheet',
    }, icon('pin', 14), h('span', { text: pinnedIds.has(id) ? 'Pinned' : label }));
    btn.addEventListener('click', () => togglePin(full));
    pinButtons.push(btn);
    return btn;
  }

  function citationChip(chunkId) {
    const chunk = chunkById.get(chunkId);
    if (!chunk) return h('span', { class: 'citation-chip missing', text: chunkId, title: 'Chunk not found' });
    const b = h('button', { type: 'button', class: 'citation-chip', title: `Open ${chunkId} from your notes` },
      icon('book', 11), h('span', { text: chunkId }));
    b.addEventListener('click', () => {
      openDialog({
        title: `Note excerpt · ${chunkId}`,
        body: h('div', { class: 'dialog-excerpt' },
          h('p', { class: 'small muted', text: 'Verbatim from your notebook. Nothing is paraphrased here.' }),
          h('pre', { class: 'evidence-text', text: chunk.text }),
          h('p', { class: 'small muted', text: `Topic: ${topic.name} · verdict: ${topic.coverage.status}` })),
        actions: [button('Close', { variant: 'ghost', onClick: () => document.querySelector('.modal-backdrop')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })],
      });
    });
    return b;
  }

  function sourceRow(source, chunkIds = []) {
    return h('span', { class: 'source-row' }, sourceChip(source),
      ...(source === 'notes' ? (chunkIds.length ? chunkIds.map(citationChip) : [h('span', { class: 'small muted', text: 'no chunk cited' })]) : []));
  }

  function section(letter, title, body, extra) {
    return h('section', { class: 'lesson-section card', id: `section-${letter}` },
      h('div', { class: 'lesson-section-head' },
        h('span', { class: 'lesson-letter', text: letter }),
        h('h2', { class: 'lesson-section-title', text: title }),
        extra || null),
      body);
  }

  const metaSource = lesson.meta?.provider === 'curated' ? 'Curated demo lesson' : lesson.meta?.provider === 'offline' ? 'Offline revision scaffold' : `${lesson.meta?.provider || 'model'} · ${lesson.meta?.model || ''}`;

  /* intro */
  const intro = h('div', { class: 'lesson-hero card' },
    h('div', { class: 'lesson-hero-main' },
      h('div', { class: 'lesson-breadcrumbs' },
        h('button', { type: 'button', class: 'crumb-link', text: 'Coverage', onClick: () => ctx.navigate('#/coverage') }),
        icon('chevronRight', 12),
        h('span', { text: topic.unit }),
        icon('chevronRight', 12),
        h('span', { text: topic.name })),
      h('div', { class: 'lesson-title-row' },
        h('h1', { class: 'page-title', text: topic.name }),
        coverageChip(topic.coverage.status)),
      h('p', { class: 'page-sub', text: `A complete revision card for ${topic.name} — explanation, evidence, pitfalls, a scenario and a pinnable takeaway.` }),
      h('div', { class: 'lesson-meta-row' },
        badge(`${topic.kind === 'numeric' ? 'Numerical' : 'Conceptual'} topic`, 'soft'),
        badge(`Weight ${topic.weight}/5`, 'soft'),
        badge(`${minutes} min plan`, 'soft'),
        badge(metaSource, 'neutral'),
        badge(topic.coverage.status === 'not_found' ? 'No note evidence' : `Evidence: ${topic.coverage.chunkIds.length} chunk${topic.coverage.chunkIds.length === 1 ? '' : 's'}`, topic.coverage.status === 'not_found' ? 'warn' : 'good')),
      (topic.prereqs || []).length ? h('p', { class: 'prereq-line', text: 'Builds on ' },
        ...topic.prereqs.map((pid, i) => {
          const p = byId.get(pid);
          if (!p) return null;
          const btn = h('button', { type: 'button', class: 'link-button', text: p.name, onClick: () => ctx.navigate(`#/lesson/${p.id}`) });
          return h('span', null, i ? ', ' : '', btn);
        })) : h('p', { class: 'prereq-line muted', text: 'No prerequisite is recorded for this topic.' })),
    h('div', { class: 'lesson-hero-side' },
      button('Back to coverage', { variant: 'ghost', size: 'sm', icon: 'chevronLeft', onClick: () => ctx.navigate('#/coverage') }),
      h('div', { class: 'hero-side-stat' }, h('span', { text: 'Your notes' }), h('strong', { text: topic.coverage.status === 'covered' ? 'Explain it' : topic.coverage.status === 'thin' ? 'Only mention it' : 'Do not mention it' })),
      h('div', { class: 'hero-side-stat' }, h('span', { text: 'Exam weight' }), h('strong', { text: `${topic.weight} / 5` })),
      h('div', { class: 'hero-side-stat' }, h('span', { text: 'Sheet points' }), h('strong', { text: String((nb.pinPoints || []).filter((p) => p.topicId === topic.id).length) }))));

  root.appendChild(h('div', { class: 'page lesson-page' }, intro));

  const layout = h('div', { class: 'lesson-layout' });
  const main = h('div', { class: 'lesson-main' });
  const aside = h('aside', { class: 'lesson-aside' });
  layout.append(main, aside);
  root.firstElementChild.appendChild(layout);

  /* B one-liner */
  main.appendChild(section('B', 'In one line', h('div', { class: 'lesson-prose' },
    h('p', { class: 'lead', text: lesson.oneLiner }),
    h('div', { class: 'source-line' }, sourceChip('vertex'), h('span', { class: 'small muted', text: 'Concise synthesis — not a quotation from your notes.' }))),
    pinButton({ topicId: topic.id, text: lesson.oneLiner, source: 'vertex', chunkIds: [], kind: 'point' })));

  /* C why */
  main.appendChild(section('C', 'Why it matters', h('div', { class: 'lesson-prose' },
    h('p', { text: lesson.why }),
    h('div', { class: 'callout' }, icon('compass', 18), h('div', null,
      h('strong', { text: 'Exam connection' }),
      h('p', { class: 'small muted', text: `This topic sits in ${topic.unit} and carries exam weight ${topic.weight}/5. ${topic.coverage.status === 'not_found' ? 'Your notes contain no matching passage, so treat the lesson as the starting point, not a summary.' : 'Use your cited excerpts below as the source of truth for what the lecture actually said.'}` })))),
    pinButton({ topicId: topic.id, text: lesson.why, source: 'vertex', chunkIds: [], kind: 'point' })));

  /* D analogy */
  main.appendChild(section('D', 'The analogy', h('div', { class: 'analogy-card' },
    h('span', { class: 'analogy-mark' }, icon('spark', 20)),
    h('p', { text: lesson.analogy })),
    pinButton({ topicId: topic.id, text: lesson.analogy, source: 'vertex', chunkIds: [], kind: 'point' })));

  /* E steps */
  const stepsBody = h('div', { class: 'step-list' });
  (lesson.steps || []).forEach((step, i) => {
    stepsBody.appendChild(h('div', { class: 'step' },
      h('span', { class: 'step-number', text: String(i + 1).padStart(2, '0') }),
      h('div', { class: 'step-body' },
        h('p', { class: 'step-text', text: step.text }),
        h('div', { class: 'step-foot' }, sourceRow(step.source, step.chunkIds || []))),
      pinButton({
        topicId: topic.id, text: step.text, source: step.source,
        chunkIds: step.chunkIds || [], kind: 'point',
      })));
  });
  main.appendChild(section('E', 'Step by step', stepsBody, badge('Max 5 steps', 'soft')));

  /* F visualization */
  if (viz) {
    const vizBody = h('div', null, viz.node,
      h('p', { class: 'small muted viz-foot', text: 'The computation is local and deterministic. Change the control and the drawn points recompute from the same formula.' }));
    main.appendChild(section('F', 'Mathematical visualization', vizBody));
  }

  /* G pitfalls */
  const pitBody = h('div', { class: 'pitfall-list' });
  (lesson.pitfalls || []).forEach((p) => {
    pitBody.appendChild(h('div', { class: 'pitfall' },
      h('span', { class: 'pitfall-icon' }, icon('info', 18)),
      h('div', { class: 'grow' }, h('p', { text: p.text }), h('div', { class: 'step-foot' }, sourceRow(p.source, p.chunkIds || []))),
      pinButton({ topicId: topic.id, text: p.text, source: p.source, chunkIds: p.chunkIds || [], kind: 'point' })));
  });
  main.appendChild(section('G', 'Common examination pitfalls', pitBody));

  /* H gaps */
  const gapsBody = h('div', { class: 'gaps-list' });
  if (!(lesson.notesGaps || []).length) gapsBody.appendChild(h('p', { class: 'muted', text: 'No gap was recorded for this lesson.' }));
  (lesson.notesGaps || []).forEach((gap) => {
    gapsBody.appendChild(h('div', { class: 'gap-row' }, icon('dash', 16), h('p', { text: gap })));
  });
  main.appendChild(section('H', 'What your notes still miss', gapsBody,
    button('Study gaps', { size: 'sm', variant: 'ghost', icon: 'target', onClick: () => ctx.navigate('#/practice') })));

  /* I diagram */
  const flow = flowFor(topic);
  if (flow) main.appendChild(section('I', 'Method at a glance', h('div', { class: 'flow-wrap' }, flow)));

  /* J exam question */
  const eq = lesson.examQuestion || { q: 'No question recorded.', modelAnswer: '', source: 'vertex' };
  main.appendChild(section('J', 'A typical examination question', h('div', { class: 'exam-card' },
    h('div', { class: 'exam-q' }, h('span', { class: 'exam-label', text: 'Question' }), h('p', { text: eq.q })),
    h('div', { class: 'exam-a' }, h('span', { class: 'exam-label', text: 'Model answer' }), h('p', { text: eq.modelAnswer }),
      h('div', { class: 'step-foot' }, sourceRow(eq.source, []), pinButton({
        topicId: topic.id, text: eq.modelAnswer, source: eq.source, chunkIds: [], kind: 'point',
      }))),
    h('p', { class: 'small muted', text: 'Model answers are a starting point, not a marking scheme. Compare with your tutorial solution.' }))));

  /* K scenario */
  const scenarios = scenariosFor(topic);
  if (scenarios && scenarios.length) {
    const scenarioWrap = h('div', { class: 'scenarios' });
    for (const scenario of scenarios) {
      let selected = null;
      const reveal = h('div', { class: 'scenario-reveal', 'aria-live': 'polite', hidden: true });
      const choices = h('div', { class: 'choice-list', role: 'group', 'aria-label': 'Choose a response' });
      const buttons = [];
      const revealBtn = button('Reveal reasoning', { variant: 'ghost', size: 'sm', icon: 'eye', onClick: () => {
        if (!selected) {
          reveal.hidden = false;
          reveal.replaceChildren(h('p', { class: 'small muted', text: 'Choose a response first, then reveal why it is or is not the appropriate decision. There is no score.' }));
          return;
        }
        const choice = scenario.choices.find((c) => c.id === selected);
        reveal.hidden = false;
        reveal.replaceChildren(
          h('p', { class: 'reveal-label', text: choice.recommended ? 'Recommended reasoning' : 'Consider this' }),
          h('p', { text: choice.reveal }),
          h('p', { class: 'small muted', text: 'You can change your choice. Nothing here is graded.' }));
      } });
      scenario.choices.forEach((choice) => {
        const b = h('button', { type: 'button', class: 'choice', 'aria-pressed': 'false' },
          h('span', { class: 'choice-dot' }), h('span', { text: choice.label }));
        b.addEventListener('click', () => {
          selected = choice.id;
          for (const other of buttons) {
            other.classList.toggle('selected', other === b);
            other.setAttribute('aria-pressed', other === b ? 'true' : 'false');
          }
          reveal.hidden = true;
          reveal.replaceChildren();
        });
        buttons.push(b);
        choices.appendChild(b);
      });
      scenarioWrap.appendChild(h('div', { class: 'scenario-card' },
        h('div', { class: 'scenario-head' }, h('span', { class: 'badge badge-demo', text: 'Curated scenario' }), h('span', { class: 'small muted', text: scenario.heading })),
        h('p', { class: 'scenario-setup', text: scenario.setup }),
        h('p', { class: 'scenario-prompt', text: scenario.prompt }),
        choices, h('div', { class: 'scenario-actions' }, revealBtn),
        reveal,
        scenario.takeaway ? h('p', { class: 'scenario-takeaway small muted', text: scenario.takeaway }) : null));
    }
    main.appendChild(section('K', 'What would you do?', scenarioWrap, badge('No score', 'soft')));
  } else {
    main.appendChild(section('K', 'What would you do?', h('p', { class: 'muted', text: 'Curated decision scenarios exist for the six demo topics. None is attached to this workspace topic yet.' })));
  }

  /* L takeaway + pin */
  const takeawayText = lesson.takeaway || lesson.oneLiner;
  const formula = lesson.sheet?.formula || '';
  const takeaway = h('div', { class: 'takeaway-card' },
    h('div', { class: 'takeaway-copy' },
      h('p', { class: 'kicker', text: 'Take this into the exam' }),
      h('p', { class: 'takeaway-text', text: takeawayText }),
      formula ? mathNode(formula, lesson.sheet?.fallback || '', true) : null,
      h('div', { class: 'takeaway-actions' },
        pinButton({ topicId: topic.id, text: takeawayText, equation: formula, source: 'vertex', chunkIds: [], kind: 'point' }),
        button('Open revision sheet', { size: 'sm', variant: 'ghost', icon: 'clipboard', onClick: () => ctx.navigate('#/sheet') }))),
    h('div', { class: 'takeaway-mark', 'aria-hidden': 'true' }, icon('pin', 28)));
  main.appendChild(section('L', 'Pin the point', takeaway));

  /* aside */
  const citedChunks = (topic.coverage.chunkIds || []).map((id) => chunkById.get(id)).filter(Boolean);
  aside.appendChild(h('div', { class: 'card aside-card' },
    h('div', { class: 'card-head' }, h('div', null, h('p', { class: 'kicker', text: 'Evidence' }), h('h2', { class: 'card-title', text: 'From your notes' })), coverageChip(topic.coverage.status, { small: true })),
    citedChunks.length
      ? h('div', { class: 'aside-chunks' }, citedChunks.map((chunk) => h('div', { class: 'aside-chunk' },
        h('div', { class: 'excerpt-head' }, h('span', { class: 'excerpt-id', text: chunk.id }), h('span', { class: 'small muted', text: 'verbatim' })),
        h('p', { class: 'aside-excerpt', text: chunk.text.slice(0, 220) + (chunk.text.length > 220 ? '…' : '') }),
        button('Read full excerpt', { size: 'sm', variant: 'ghost', icon: 'eye', onClick: () => {
          openDialog({
            title: `Note excerpt · ${chunk.id}`,
            body: h('div', { class: 'dialog-excerpt' },
              h('p', { class: 'small muted', text: 'Verbatim from your notebook.' }),
              h('pre', { class: 'evidence-text', text: chunk.text })),
            actions: [button('Close', { variant: 'ghost', onClick: () => document.querySelector('.modal-backdrop')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })],
          });
        } }))))
      : h('div', { class: 'no-evidence compact' }, icon('search', 18),
        h('p', { class: 'small', text: 'No matching passage in these notes.' }),
        h('p', { class: 'small muted', text: 'The lesson is still usable; the gap is part of the study plan.' })),
    h('p', { class: 'small muted', text: 'Original excerpts are revealed on screen only. They are never sent anywhere when you open them.' })));

  const regenerateBtn = isAiReady()
    ? button('Regenerate with AI', { variant: 'ghost', block: true, icon: 'spark', onClick: () => regenerate() })
    : button('Add a key for AI lessons', { variant: 'ghost', block: true, icon: 'settings', onClick: () => ctx.openSettings() });
  aside.appendChild(h('div', { class: 'card aside-card' },
    h('p', { class: 'kicker', text: 'Study actions' }),
    h('div', { class: 'aside-actions' },
      button('Schedule this topic', { variant: 'ghost', block: true, icon: 'calendar', onClick: () => {
        try { sessionStorage.setItem('vx3.openNewSession', topic.id); } catch { /* blocked */ }
        ctx.navigate('#/calendar');
      } }),
      button('Practice this topic', { variant: 'ghost', block: true, icon: 'target', onClick: () => ctx.navigate('#/practice') }),
      button('Open revision sheet', { variant: 'ghost', block: true, icon: 'clipboard', onClick: () => ctx.navigate('#/sheet') }),
      button('Browse formulas', { variant: 'ghost', block: true, icon: 'sigma', onClick: () => ctx.navigate('#/formulas') })),
    h('div', { class: 'field aside-priority' },
      h('label', { for: 'study-priority', text: 'Your study priority' }),
      (() => {
        const select = h('select', { class: 'select', id: 'study-priority' },
          h('option', { value: '3', text: 'High — study this first', selected: topic.studyPriority === 3 }),
          h('option', { value: '2', text: 'Normal', selected: !topic.studyPriority || topic.studyPriority === 2 }),
          h('option', { value: '1', text: 'Low — later', selected: topic.studyPriority === 1 }));
        select.addEventListener('change', () => {
          topic.studyPriority = Number(select.value) || 2;
          saveNotebook(nb);
          toast('Study priority saved for this topic.', 'good');
        });
        return select;
      })()),
    h('div', { class: 'aside-divider' }),
    h('div', { class: 'field aside-priority' },
      h('span', { class: 'field-label', text: 'Your confidence' }),
      (() => {
        const row = h('div', { class: 'rating-row', role: 'group', 'aria-label': 'Confidence rating' });
        for (const [value, label] of [['knew', 'Knew it'], ['kinda', 'Kinda'], ['lost', 'Lost']]) {
          const b = h('button', { type: 'button', class: `rating-btn${topic.rating === value ? ' active' : ''}`, 'aria-pressed': topic.rating === value ? 'true' : 'false', text: label });
          b.addEventListener('click', () => {
            topic.rating = topic.rating === value ? null : value;
            saveNotebook(nb);
            for (const other of row.children) {
              const on = other === b && topic.rating === value;
              other.classList.toggle('active', on);
              other.setAttribute('aria-pressed', on ? 'true' : 'false');
            }
            toast('Confidence saved locally.', 'good');
          });
          row.appendChild(b);
        }
        return row;
      })()),
    h('div', { class: 'field aside-priority' },
      h('span', { class: 'field-label', text: 'After this session' }),
      (() => {
        const row = h('div', { class: 'rating-row', role: 'group', 'aria-label': 'After-session state' });
        for (const [value, label] of [['got', 'Got it'], ['still_lost', 'Still lost']]) {
          const b = h('button', { type: 'button', class: `rating-btn${topic.after === value ? ' active' : ''}`, 'aria-pressed': topic.after === value ? 'true' : 'false', text: label });
          b.addEventListener('click', () => {
            topic.after = topic.after === value ? null : value;
            saveNotebook(nb);
            for (const other of row.children) {
              const on = other === b && topic.after === value;
              other.classList.toggle('active', on);
              other.setAttribute('aria-pressed', on ? 'true' : 'false');
            }
            toast('Reflection saved locally.', 'good');
          });
          row.appendChild(b);
        }
        return row;
      })()),
    h('div', { class: 'aside-divider' }),
    h('p', { class: 'small muted', text: `Lesson source: ${metaSource}.` }),
    lesson.meta?.at ? h('p', { class: 'small muted', text: `Prepared ${relativeTime(lesson.meta.at)}.` }) : null,
    regenerateBtn));

  async function regenerate() {
    try {
      setBusy(regenerateBtn, true, 'Generating…');
      const cited = citedChunks.length ? citedChunks : chunks.slice(0, 3);
      const next = await aiLesson({ topic, chunks: cited, lang: 'en' });
      next.sheet = lesson.sheet || null;
      next.takeaway = lesson.takeaway || next.oneLiner;
      topic.lesson = next;
      saveNotebook(nb);
      toast('Lesson regenerated. Notes claims are limited to cited chunks.', 'good');
      ctx.rerender();
    } catch (err) {
      toast(describeLlmError(err), 'error');
      setBusy(regenerateBtn, false, 'Regenerate with AI');
    }
  }

  /* next topic */
  const index = nb.topics.findIndex((t) => t.id === topic.id);
  const next = nb.topics[index + 1] || nb.topics[0];
  if (next && next.id !== topic.id) {
    main.appendChild(h('div', { class: 'lesson-next' },
      h('div', null, h('p', { class: 'small muted', text: 'Next in the notebook' }), h('strong', { text: next.name })),
      button('Next lesson', { variant: 'ghost', icon: 'arrow', onClick: () => ctx.navigate(`#/lesson/${next.id}`) })));
  }

  ctx.refreshShell?.();
  return () => { if (viz) viz.cleanup(); };
}
