/** practice.js — understanding-first practice: no grades, no streaks, no failure states. */
import {
  h, icon, button, badge, coverageChip, mathNode, emptyState, toast, announce, openDialog,
} from '../ui.js';
import { getActiveNotebook, logPractice, addPoint } from '../state.js';
import { ensureLesson, formatDateShort, relativeTime, unitGroups } from '../shared.js';
import { QUESTIONS } from '../seed.js';

const TYPE_LABEL = {
  mcq: 'Multiple choice', numeric: 'Numerical', derivation: 'Derivation', mistake: 'Spot the mistake',
  next: 'What happens next', formula: 'Formula selection', theory: 'Short explanation',
};

const DIFFICULTY_LABEL = { 1: 'Warm-up', 2: 'Exam standard', 3: 'Stretch' };

function questionsFor(topic, nb) {
  const bank = QUESTIONS.filter((q) => q.topicId === topic.id);
  if (bank.length) return bank;
  const lesson = ensureLesson(nb, topic);
  const eq = lesson.examQuestion || {};
  return [{
    id: `exam-${topic.id}`,
    topicId: topic.id,
    type: 'theory',
    difficulty: 2,
    prompt: eq.q || `Explain ${topic.name} in your own words and give one worked example.`,
    hint: 'Write the definition, the method, and the condition for using it.',
    generatedFromLesson: true,
    solution: {
      interpretation: 'This question comes from the topic’s exam-question record, not a model run.',
      formula: lesson.sheet?.formula || '',
      substitution: 'State what is given and what is asked.',
      calculation: 'Carry out one example from your tutorial sheet.',
      result: eq.modelAnswer || 'No reviewed model answer is attached to this topic yet.',
      reasoning: 'Compare your answer with the textbook/tutorial solution and check every condition.',
      mistakes: 'Omitting the conditions of the method is the most common loss of method marks.',
    },
  }];
}

export default function renderPractice(root, ctx) {
  const nb = getActiveNotebook();
  if (!nb) { ctx.navigate('#/setup'); return () => {}; }
  const byId = new Map(nb.topics.map((t) => [t.id, t]));
  const state = { difficulty: 'all', topic: 'all', active: null, revealed: false, selectedOption: null, hint: false };
  const page = h('div', { class: 'page practice-page' });
  root.appendChild(page);

  function head() {
    return h('div', { class: 'page-head' },
      h('div', null,
        h('p', { class: 'kicker', text: 'Exam Practice Studio' }),
        h('h1', { class: 'page-title', text: 'Practice understanding, not performance.' }),
        h('p', { class: 'page-sub', text: 'Work a numerical problem, reveal the reasoning, then reflect. There are no scores, streaks or leaderboards here.' })),
      h('div', { class: 'page-head-actions' },
        button('Browse formulas', { variant: 'ghost', icon: 'sigma', onClick: () => ctx.navigate('#/formulas') }),
        button('Open revision sheet', { variant: 'ghost', icon: 'clipboard', onClick: () => ctx.navigate('#/sheet') })));
  }

  function home() {
    page.replaceChildren(head());
    const all = nb.topics.flatMap((t) => questionsFor(t, nb).map((q) => ({ ...q, topic: t })));
    const available = all.length;
    const reflected = (nb.practice || []).length;
    const topicsWith = new Set(all.map((q) => q.topicId)).size;

    page.appendChild(h('div', { class: 'stat-grid four' },
      h('article', { class: 'stat-card card' }, h('div', { class: 'stat-top' }, icon('target', 18), h('span', { class: 'stat-label', text: 'Questions available' })), h('strong', { class: 'stat-value', text: String(available) }), h('span', { class: 'stat-meta', text: `${topicsWith} topics` })),
      h('article', { class: 'stat-card card' }, h('div', { class: 'stat-top' }, icon('compass', 18), h('span', { class: 'stat-label', text: 'Question types' })), h('strong', { class: 'stat-value', text: String(new Set(all.map((q) => q.type)).size) }), h('span', { class: 'stat-meta', text: 'Conceptual and numerical' })),
      h('article', { class: 'stat-card card' }, h('div', { class: 'stat-top' }, icon('clipboard', 18), h('span', { class: 'stat-label', text: 'Reflections saved' })), h('strong', { class: 'stat-value', text: String(reflected) }), h('span', { class: 'stat-meta', text: 'Your notes on your own reasoning' })),
      h('article', { class: 'stat-card card' }, h('div', { class: 'stat-top' }, icon('info', 18), h('span', { class: 'stat-label', text: 'Grading' })), h('strong', { class: 'stat-value', text: 'None' }), h('span', { class: 'stat-meta', text: 'Reflection replaces a score' }))));

    const difficulty = h('div', { class: 'segmented small', role: 'tablist', 'aria-label': 'Difficulty filter' });
    for (const [value, label] of [['all', 'All levels'], ['1', 'Warm-up'], ['2', 'Exam standard'], ['3', 'Stretch']]) {
      const b = h('button', { type: 'button', role: 'tab', 'aria-selected': state.difficulty === value ? 'true' : 'false', class: state.difficulty === value ? 'active' : '', text: label });
      b.addEventListener('click', () => { state.difficulty = value; home(); });
      difficulty.appendChild(b);
    }
    const topicSelect = h('select', { class: 'select', 'aria-label': 'Filter by topic' },
      h('option', { value: 'all', text: 'All topics' }),
      nb.topics.map((t) => h('option', { value: t.id, text: t.name, selected: state.topic === t.id })));
    topicSelect.addEventListener('change', () => { state.topic = topicSelect.value; home(); });

    const filtered = nb.topics
      .filter((t) => state.topic === 'all' || t.id === state.topic)
      .map((t) => ({ topic: t, questions: questionsFor(t, nb).filter((q) => state.difficulty === 'all' || String(q.difficulty) === state.difficulty) }))
      .filter((x) => x.questions.length);

    const groups = new Map();
    for (const x of filtered) {
      const unit = x.topic.unit || 'General';
      if (!groups.has(unit)) groups.set(unit, []);
      groups.get(unit).push(x);
    }

    const listCard = h('section', { class: 'card practice-bank' },
      h('div', { class: 'card-head' },
        h('div', null, h('p', { class: 'kicker', text: 'Question bank' }), h('h2', { class: 'card-title', text: 'Choose a topic to work through.' })),
        h('div', { class: 'filter-row' }, difficulty, topicSelect)),
      groups.size ? [...groups.entries()].map(([unit, items]) => h('div', { class: 'unit-block' },
        h('div', { class: 'unit-head' }, h('h3', { text: unit }), h('span', { class: 'small muted', text: `${items.reduce((n, i) => n + i.questions.length, 0)} questions` })),
        items.map(({ topic, questions }) => {
          const lesson = ensureLesson(nb, topic);
          const types = [...new Set(questions.map((q) => TYPE_LABEL[q.type]))];
          return h('div', { class: 'practice-topic-row' },
            h('div', { class: 'practice-topic-main' },
              h('div', { class: 'practice-topic-title' }, h('strong', { text: topic.name }), coverageChip(topic.coverage.status, { small: true })),
              h('p', { class: 'small muted', text: `${questions.length} question${questions.length === 1 ? '' : 's'} · ${types.join(' · ')}` }),
              lesson?.takeaway ? h('p', { class: 'small practice-takeaway', text: lesson.takeaway }) : null),
            button('Start', { size: 'sm', variant: 'ghost', icon: 'arrow', onClick: () => startQuestion(questions[0].id) }));
        }))) : emptyState({ iconName: 'target', title: 'No questions match', text: 'Clear a filter or add topics to the workspace.', action: button('Reset filters', { size: 'sm', onClick: () => { state.difficulty = 'all'; state.topic = 'all'; home(); } }) }));

    page.appendChild(h('div', { class: 'practice-layout' }, listCard, h('aside', { class: 'practice-aside' },
      h('div', { class: 'card' },
        h('p', { class: 'kicker', text: 'Previous sessions' }),
        (nb.practice || []).length ? h('div', { class: 'history-list' }, nb.practice.slice(0, 6).map((p) => {
          const t = byId.get(p.topicId);
          return h('div', { class: 'history-row' },
            h('span', { class: 'history-icon' }, icon('target', 14)),
            h('div', { class: 'grow' },
              h('strong', { text: t?.name || 'Topic' }),
              h('span', { class: 'small muted', text: `${formatDateShort((p.at || '').slice(0, 10))} · ${relativeTime(p.at)}` }),
              p.reflection?.difficult ? h('span', { class: 'small', text: `Hardest: ${p.reflection.difficult}` }) : null));
        })) : h('p', { class: 'small muted', text: 'No reflections yet. They appear here after you finish a question.' })),
      h('div', { class: 'card practice-note' },
        h('h3', { text: 'How this is different' }),
        h('p', { class: 'small muted', text: 'The solution is not hidden behind a score. Read it, then write what was difficult, which formula you needed, and what you would change. Pin the idea if it belongs on your sheet.' })))));
  }

  function startQuestion(id) {
    const entry = nb.topics.flatMap((t) => questionsFor(t, nb).map((q) => ({ ...q, topic: t }))).find((q) => q.id === id);
    if (!entry) { toast('That question is unavailable.', 'error'); home(); return; }
    state.active = entry;
    state.revealed = false;
    state.selectedOption = null;
    state.hint = false;
    questionView();
  }

  function questionView() {
    const q = state.active;
    const topic = q.topic;
    const lesson = ensureLesson(nb, topic);
    page.replaceChildren(h('div', { class: 'question-topbar' },
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: home }, icon('chevronLeft', 14), h('span', { text: 'All practice' })),
      h('div', { class: 'question-topbar-meta' },
        coverageChip(topic.coverage.status, { small: true }),
        badge(TYPE_LABEL[q.type] || q.type, 'soft'),
        badge(DIFFICULTY_LABEL[q.difficulty] || 'Exam standard', 'neutral'))));

    const optionButtons = [];
    const optionsWrap = h('div', { class: 'options', role: 'group', 'aria-label': 'Answer options' });
    if (Array.isArray(q.options)) {
      q.options.forEach((opt, i) => {
        const b = h('button', { type: 'button', class: 'option', 'aria-pressed': 'false' },
          h('span', { class: 'option-letter', text: String.fromCharCode(65 + i) }), h('span', { text: opt }));
        b.addEventListener('click', () => {
          state.selectedOption = i;
          for (const other of optionButtons) {
            other.classList.toggle('selected', other === b);
            other.setAttribute('aria-pressed', other === b ? 'true' : 'false');
          }
        });
        optionButtons.push(b);
        optionsWrap.appendChild(b);
      });
    }

    const hint = h('div', { class: 'hint-box', hidden: true }, h('strong', { text: 'Hint' }), h('p', { text: q.hint || 'Re-read the definition and list the known quantities first.' }));
    const working = h('textarea', { class: 'textarea working-area', rows: '6', placeholder: 'Work here. Write every substitution — this is your space, not a submission.' });
    const solutionHost = h('div', { class: 'solution-host' });
    const reflectionHost = h('div', { class: 'reflection-host' });

    const revealBtn = button('Reveal solution', { icon: 'eye', onClick: () => {
      state.revealed = true;
      revealBtn.disabled = true;
      solutionHost.replaceChildren(solutionBlock(q));
      reflectionHost.replaceChildren(reflectionBlock(q, lesson));
      solutionHost.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } });

    const hintBtn = button('Show a hint', { variant: 'ghost', icon: 'info', onClick: (e) => {
      hint.hidden = !hint.hidden;
      e.currentTarget.querySelector('span:last-child').textContent = hint.hidden ? 'Show a hint' : 'Hide hint';
    } });

    page.appendChild(h('div', { class: 'question-layout' },
      h('article', { class: 'question-card card' },
        h('p', { class: 'kicker', text: topic.unit }),
        h('h1', { class: 'question-title', text: topic.name }),
        h('p', { class: 'question-prompt', text: q.prompt }),
        q.known?.length ? h('div', { class: 'known-box' }, h('span', { class: 'known-label', text: 'Known' }), h('ul', null, q.known.map((k) => h('li', { text: k })))) : null,
        Array.isArray(q.options) ? optionsWrap : null,
        (q.type === 'numeric' || q.type === 'derivation') ? h('div', { class: 'field' }, h('label', { for: 'working', text: 'Your working' }), working) : null,
        h('div', { class: 'question-actions' }, hintBtn, revealBtn),
        hint,
        solutionHost,
        reflectionHost),
      h('aside', { class: 'question-aside' },
        h('div', { class: 'card' },
          h('p', { class: 'kicker', text: 'Topic context' }),
          h('h3', { text: topic.name }),
          h('p', { class: 'small muted', text: lesson?.oneLiner || '' }),
          h('div', { class: 'aside-divider' }),
          h('p', { class: 'small muted', text: 'Your notes: ' + (topic.coverage.status === 'covered' ? 'contain a meaningful explanation.' : topic.coverage.status === 'thin' ? 'only mention this topic.' : 'have no matching passage.') }),
          h('div', { class: 'question-aside-actions' },
            button('Open lesson', { variant: 'ghost', block: true, icon: 'book', onClick: () => ctx.navigate(`#/lesson/${topic.id}`) }),
            button('Back to practice', { variant: 'ghost', block: true, icon: 'arrow', onClick: home }))),
        h('div', { class: 'card' },
          h('p', { class: 'kicker', text: 'Reflection first' }),
          h('p', { class: 'small muted', text: 'After revealing the solution, record which step was difficult and which formula you actually needed. That note is more useful than a percentage.' })))));
  }

  function solutionBlock(q) {
    const s = q.solution || {};
    const rows = [
      ['1 · Problem interpretation', s.interpretation],
      ['2 · Relevant formula', s.formula],
      ['3 · Substitution', s.substitution],
      ['4 · Calculation', s.calculation],
      ['5 · Final result', s.result],
      ['6 · Reasoning', s.reasoning],
      ['Common mistakes', s.mistakes],
    ].filter(([, value]) => value);
    return h('section', { class: 'solution card' },
      h('div', { class: 'card-head' },
        h('div', null, h('p', { class: 'kicker', text: 'Solution' }), h('h2', { class: 'card-title', text: 'One reasoned route, not the only route.' })),
        h('span', { class: 'source-chip source-vertex' }, icon('spark', 12), h('span', { text: q.generatedFromLesson ? 'From the lesson record' : 'Vertex explanation' }))),
      h('ol', { class: 'solution-steps' }, rows.map(([label, value]) => h('li', null,
        h('span', { class: 'solution-label', text: label }),
        String(value).includes('\\') ? mathNode(value, value, false) : h('p', { text: value })))),
      h('p', { class: 'small muted', text: 'Check this against your textbook. A model or a curated card can still be wrong.' }));
  }

  function reflectionBlock(q, lesson) {
    const difficult = h('input', { class: 'input', placeholder: 'e.g. solving the Hessian system' });
    const formula = h('input', { class: 'input', placeholder: 'e.g. H d = −∇f' });
    const change = h('input', { class: 'input', placeholder: 'e.g. write H before substituting' });
    const status = h('p', { class: 'form-status', 'aria-live': 'polite' });
    const save = button('Save reflection', { icon: 'check', onClick: () => {
      if (!difficult.value.trim() && !formula.value.trim() && !change.value.trim()) {
        status.textContent = 'Add one line to at least one reflection field first.';
        difficult.focus();
        return;
      }
      logPractice(nb, {
        topicId: q.topicId,
        questionId: q.id,
        reflection: {
          difficult: difficult.value.trim(),
          formula: formula.value.trim(),
          change: change.value.trim(),
          pinned: false,
        },
      });
      status.textContent = 'Saved locally with this notebook.';
      toast('Reflection saved.', 'good');
      save.disabled = true;
      save.querySelector('span:last-child').textContent = 'Saved';
    } });
    const pin = button('Pin the key idea', { variant: 'ghost', icon: 'pin', onClick: () => {
      const result = addPoint(nb, {
        topicId: q.topicId,
        text: q.solution?.result || q.prompt,
        equation: q.solution?.formula || '',
        source: 'vertex',
        chunkIds: [],
        kind: 'point',
      });
      if (result.added) {
        toast('Pinned to the revision sheet.', 'good');
        announce('Pinned to the revision sheet.');
        pin.disabled = true;
        pin.querySelector('span:last-child').textContent = 'Pinned';
      } else {
        toast('That idea is already on the sheet.', 'info');
      }
      ctx.refreshShell?.();
    } });

    return h('section', { class: 'reflection card' },
      h('div', { class: 'card-head' }, h('div', null, h('p', { class: 'kicker', text: 'Reflect' }), h('h2', { class: 'card-title', text: 'What will you do differently?' }))),
      h('div', { class: 'reflection-grid' },
        h('div', { class: 'field' }, h('label', { text: 'Which step was difficult?' }), difficult),
        h('div', { class: 'field' }, h('label', { text: 'Which formula did you need?' }), formula),
        h('div', { class: 'field' }, h('label', { text: 'What would you change next time?' }), change)),
      h('div', { class: 'reflection-actions' }, save, pin),
      h('p', { class: 'small muted', text: 'Should this idea become a revision-sheet pin? Pin it, or leave the reflection here.' }),
      status);
  }

  home();
  ctx.refreshShell?.();
  return () => {};
}
