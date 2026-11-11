/** landing.js — public product page: knowledge orbit, scroll story, live mini-demos. */
import {
  h, icon, button, coverageChip, mathNode, sectionHead, sourceChip, toast, announce, svg,
} from '../ui.js';
import { learningRateWidget } from '../charts.js';
import { getActiveNotebook, getActiveProfile, listUserNotebooks, setCurrent } from '../state.js';

const COVERAGE_SAMPLES = {
  covered: {
    label: 'Gradient descent',
    note: 'Gradient descent uses the negative gradient as the downhill direction. The update is x(k+1) = x(k) − α∇f(x(k)), where the learning rate α controls the step size. A step that is too large can overshoot the minimum.',
    excerpt: 'The update is x(k+1) = x(k) − α∇f(x(k)), where the learning rate α controls the step size.',
    terms: 'gradient, descent, learning, rate, step, size',
  },
  thin: {
    label: 'Armijo line search',
    note: 'Armijo condition — copied off slide 14, one line only. Revise before the exam.',
    excerpt: 'Armijo condition — copied off slide 14, one line only.',
    terms: 'Armijo — mentioned, not explained',
  },
  not_found: {
    label: 'Gram–Schmidt',
    note: 'No matching passage about orthogonalisation or Gram–Schmidt appears in the sample notes.',
    excerpt: 'No matching passage in these notes.',
    terms: 'no evidence',
  },
};

function sceneVisual(index) {
  if (index === 0) {
    const notes = [
      ['∂f/∂x', 'lecture 4'], ['∇²f', 'page 12'], ['α = ?', 'slide 14'], ['xₖ₊₁', 'tutorial 3'],
      ['H⁻¹', '???'], ['Armijo', 'one line'], ['BFGS', 'scribble'], ['lagrange', 'unit 3'],
    ];
    return h('div', { class: 'scene-visual chaos-visual', 'aria-hidden': 'true' },
      h('div', { class: 'chaos-field' }, notes.map(([formula, tag], i) => h('span', { class: `chaos-note chaos-${i + 1}` },
        h('strong', { text: formula }), h('small', { text: tag })))));
  }
  if (index === 1) {
    const nodes = ['Objective', 'Gradient', 'Step size', 'Newton', 'Hessian', 'BFGS', 'Gram–Schmidt', 'CG'];
    const links = svg('svg', { class: 'syl-links', viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    for (const [x1, y1, x2, y2] of [[28, 26, 72, 26], [28, 26, 28, 47], [72, 26, 72, 47], [28, 47, 72, 47], [72, 47, 28, 68], [28, 68, 72, 68], [72, 68, 28, 89], [28, 89, 72, 89]]) {
      links.appendChild(svg('line', { x1, y1, x2, y2, stroke: 'currentColor', 'stroke-width': '0.5', 'stroke-dasharray': '1.5 1.5' }));
    }
    return h('div', { class: 'scene-visual syllabus-visual', 'aria-hidden': 'true' },
      h('div', { class: 'syllabus-card' },
        h('div', { class: 'syllabus-head' }, h('span', { class: 'dot-row' }, h('i'), h('i'), h('i')), h('small', { text: 'syllabus.txt · 6 topics' })),
        links,
        h('div', { class: 'syllabus-nodes' }, nodes.map((n, i) => h('span', { class: `syl-node syl-${i % 3}` }, h('i'), n)))));
  }
  if (index === 2) {
    return h('div', { class: 'scene-visual evidence-visual', 'aria-hidden': 'true' },
      h('div', { class: 'evidence-note' },
        h('span', { class: 'note-tag', text: 'c2 · your notes' }),
        h('p', { text: '“Gradient descent uses the negative gradient… the learning rate α controls the step size…”' }),
        h('span', { class: 'evidence-link', text: '↳ matched to Gradient descent' })),
      h('div', { class: 'evidence-rows' },
        h('div', { class: 'ev-row' }, h('span', { text: 'Gradient descent' }), coverageChip('covered', { small: true })),
        h('div', { class: 'ev-row' }, h('span', { text: 'Armijo line search' }), coverageChip('thin', { small: true })),
        h('div', { class: 'ev-row open' }, h('span', { text: 'Gram–Schmidt' }), coverageChip('not_found', { small: true }))));
  }
  if (index === 3) {
    const points = [];
    for (let i = 0; i <= 40; i++) {
      const x = -2.2 + (4.4 * i) / 40;
      points.push(`${180 + x * 62},${198 - x * x * 24}`);
    }
    const curve = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    curve.setAttribute('d', 'M ' + points.join(' L '));
    curve.setAttribute('fill', 'none');
    curve.setAttribute('stroke', '#DE5B34');
    curve.setAttribute('stroke-width', '3');
    const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgEl.setAttribute('viewBox', '0 0 360 220');
    svgEl.setAttribute('class', 'gd-curve');
    svgEl.setAttribute('aria-hidden', 'true');
    svgEl.appendChild(curve);
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    marker.setAttribute('cx', '180');
    marker.setAttribute('cy', '198');
    marker.setAttribute('r', '8');
    marker.setAttribute('class', 'gd-point');
    svgEl.appendChild(marker);
    const guide = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    guide.setAttribute('x1', '180'); guide.setAttribute('x2', '180'); guide.setAttribute('y1', '198'); guide.setAttribute('y2', '198');
    guide.setAttribute('class', 'gd-guide');
    svgEl.appendChild(guide);
    return h('div', { class: 'scene-visual gd-visual', 'aria-hidden': 'true' },
      h('div', { class: 'gd-card' },
        h('div', { class: 'gd-eq' }, mathNode('x_{k+1}=x_k-\\alpha\\nabla f(x_k)', 'xₖ₊₁ = xₖ − α∇f(xₖ)')),
        svgEl,
        h('div', { class: 'gd-readout' },
          h('span', null, h('small', { text: 'step size' }), h('strong', { text: 'α = 0.10' })),
          h('span', null, h('small', { text: 'direction' }), h('strong', { text: '−∇f' })),
          h('span', null, h('small', { text: 'status' }), h('strong', { text: 'descending' })))));
  }
  if (index === 4) {
    return h('div', { class: 'scene-visual sheet-visual', 'aria-hidden': 'true' },
      h('div', { class: 'assembly-sheet' },
        h('div', { class: 'assembly-head' }, h('span', { text: 'Numerical Optimization' }), h('small', { text: 'one page · exam eve' })),
        h('div', { class: 'assembly-row' }, h('span', { class: 'assembly-tag', text: 'GD' }), h('span', { class: 'assembly-line long' })),
        h('div', { class: 'assembly-eq' }, mathNode('x_{k+1}=x_k-\\alpha\\nabla f(x_k)', 'xₖ₊₁ = xₖ − α∇f(xₖ)')),
        h('div', { class: 'assembly-row' }, h('span', { class: 'assembly-tag', text: 'NT' }), h('span', { class: 'assembly-line short' })),
        h('div', { class: 'assembly-eq' }, mathNode('Hd=-\\nabla f', 'H d = −∇f')),
        h('div', { class: 'assembly-row' }, h('span', { class: 'assembly-tag', text: 'AR' }), h('span', { class: 'assembly-line long' })),
        h('div', { class: 'assembly-eq' }, mathNode('f(x+\\alpha p)\\le f(x)+c\\alpha\\nabla f^{\\top}p', 'f(x+αp) ≤ f(x) + cα∇fᵀp'))));
  }
  return h('div', { class: 'scene-visual mark-visual', 'aria-hidden': 'true' },
    h('div', { class: 'final-orbit' },
      h('span', { class: 'final-ring r1' }), h('span', { class: 'final-ring r2' }),
      h('span', { class: 'final-mark', text: '▲' }),
      h('span', { class: 'final-dot d1' }), h('span', { class: 'final-dot d2' }), h('span', { class: 'final-dot d3' })));
}

const SCENES = [
  { kicker: '01 · The night before', title: 'Too many notes.', accent: 'Too little time.', text: 'Scattered pages, half-finished derivations and a syllabus that expects all of it. Vertex starts by making the mess visible.' },
  { kicker: '02 · Syllabus intelligence', title: 'Know exactly what', accent: 'your syllabus expects.', text: 'Topics become ordered objects with units, weights and prerequisites — not a flat wall of headings.' },
  { kicker: '03 · Evidence mapping', title: 'Evidence before', accent: 'confidence.', text: 'Every topic is checked against your notes. Explained, only mentioned, or no matching passage. You can open the exact excerpt each time.' },
  { kicker: '04 · Understanding', title: 'Don’t just memorize.', accent: 'Understand why.', text: 'Move a learning rate, watch the iterate, and see why the step size — not just the direction — decides whether descent works.' },
  { kicker: '05 · Your revision sheet', title: 'Everything important.', accent: 'Nothing unnecessary.', text: 'The points you pin become one typeset page: heading, takeaway, key equation and a source you can check.' },
  { kicker: '06 · Exam eve', title: 'Your final revision', accent: 'session starts here.', text: 'A workspace built from your notes, your gaps and your calendar. Not a chatbot transcript.' },
];

export default function renderLanding(root, ctx) {
  const cleanups = [];
  const goStart = () => {
    const nb = getActiveNotebook();
    if (nb) { ctx.navigate('#/dashboard'); return; }
    const profile = getActiveProfile();
    if (profile) {
      const own = listUserNotebooks(profile.id);
      if (own.length) {
        setCurrent(own[0].id);
        ctx.navigate('#/dashboard');
      } else {
        ctx.navigate('#/setup');
      }
    } else {
      ctx.navigate('#/login');
    }
  };
  const goBuild = () => {
    if (getActiveProfile()) ctx.navigate('#/setup');
    else ctx.navigate('#/login');
  };

  const hero = h('section', { class: 'hero', id: 'top' },
    h('div', { class: 'hero-ambient', 'aria-hidden': 'true' }),
    h('div', { class: 'hero-inner' },
      h('div', { class: 'hero-copy' },
        h('p', { class: 'eyebrow' }, h('span', { class: 'eyebrow-dot' }), 'AI-guided exam revision · local-first'),
        h('h1', { class: 'display' }, 'Your exam is closer.', h('br'), h('em', { text: 'Your understanding can be too.' })),
        h('p', { class: 'hero-sub', text: 'Turn scattered lecture notes into an intelligence-backed revision plan. Find the gaps, understand the difficult concepts, and walk into your exam prepared.' }),
        h('div', { class: 'hero-actions' },
          button('Start revising', { icon: 'arrow', trailingIcon: 'arrowUpRight', onClick: goStart }),
          button('Explore the experience', { variant: 'ghost', onClick: () => document.getElementById('story')?.scrollIntoView({ behavior: 'smooth' }) })),
        h('ul', { class: 'hero-proof' },
          h('li', null, icon('check', 14), 'Curated demo works offline'),
          h('li', null, icon('check', 14), 'No account, no server'),
          h('li', null, icon('check', 14), 'Every verdict has an excerpt'))),
      h('div', { class: 'hero-art', id: 'hero-art' },
        h('div', { class: 'orbit-scene' },
          h('div', { class: 'orbit-glow', 'aria-hidden': 'true' }),
          h('div', { class: 'orbit-ring ring-a', 'aria-hidden': 'true' }),
          h('div', { class: 'orbit-ring ring-b', 'aria-hidden': 'true' }),
          h('div', { class: 'orbit-ring ring-c', 'aria-hidden': 'true' }),
          h('div', { class: 'orbit-core' }, h('span', { class: 'core-symbol', text: '▲' }), h('small', { text: 'VERTEX' })),
          h('div', { class: 'orbit-card card-a' }, mathNode('\\nabla f(x)', '∇f(x)'), h('small', { text: 'direction' })),
          h('div', { class: 'orbit-card card-b' }, mathNode('x_{k+1}=x_k-\\alpha\\nabla f', 'xₖ₊₁ = xₖ − α∇f'), h('small', { text: 'one step' })),
          h('div', { class: 'orbit-card card-c' }, mathNode('H d=-\\nabla f', 'H d = −∇f'), h('small', { text: 'curvature' })),
          h('div', { class: 'orbit-card card-d' }, mathNode('q_i^{\\top}q_j=0', 'qᵢᵀqⱼ = 0'), h('small', { text: 'orthogonal' })),
          h('div', { class: 'orbit-node node-a', 'aria-hidden': 'true' }),
          h('div', { class: 'orbit-node node-b', 'aria-hidden': 'true' }),
          h('div', { class: 'orbit-node node-c', 'aria-hidden': 'true' }),
          h('div', { class: 'orbit-sheet' },
            h('span', { class: 'sheet-tab', text: 'REVISION SHEET' }),
            h('span', { class: 'sheet-line w80' }), h('span', { class: 'sheet-line w60' }), h('span', { class: 'sheet-line w90' }),
            h('span', { class: 'sheet-line w50' }))),
        h('canvas', { class: 'hero-particles', 'aria-hidden': 'true' }),
        h('div', { class: 'orbit-caption' }, h('span', { class: 'live-dot' }), 'Knowledge orbit · pointer-reactive'))),
    h('div', { class: 'hero-metrics' },
      h('div', null, h('strong', { text: '6' }), h('span', { text: 'curated topics' })),
      h('div', null, h('strong', { text: '3' }), h('span', { text: 'evidence states' })),
      h('div', null, h('strong', { text: '1' }), h('span', { text: 'revision page' })),
      h('div', null, h('strong', { text: '0' }), h('span', { text: 'silent uploads' }))));

  /* ---------------------------------------------------------------- story */
  const story = h('section', { class: 'story', id: 'story', 'aria-label': 'How Vertex works' });
  const stage = h('div', { class: 'story-stage' });
  const scenes = SCENES.map((s, i) => {
    const scene = h('article', { class: `scene scene-${i}`, 'aria-hidden': i === 0 ? 'false' : 'true' },
      h('div', { class: 'scene-inner' },
        h('div', { class: 'scene-copy' },
          h('p', { class: 'scene-kicker', text: s.kicker }),
          h('h2', { class: 'scene-title' }, s.title, h('em', { text: s.accent })),
          h('p', { class: 'scene-text', text: s.text }),
          i === 5 ? h('div', { class: 'scene-cta' },
            button('Build my revision workspace', { icon: 'spark', onClick: goBuild }),
            button('Open curated demo', { variant: 'ghost', onClick: () => ctx.openDemo() })) : null),
        sceneVisual(i)));
    stage.appendChild(scene);
    return scene;
  });
  const rail = h('div', { class: 'story-rail', 'aria-hidden': 'true' });
  const railFill = h('span', { class: 'story-rail-fill' });
  rail.appendChild(railFill);
  stage.appendChild(rail);
  const hint = h('div', { class: 'story-hint', 'aria-hidden': 'true' }, h('span', { text: 'scroll' }), icon('chevronDown', 14));
  stage.appendChild(hint);
  story.appendChild(stage);

  /* ---------------------------------------------------------- coverage demo */
  const demoResult = h('div', { class: 'coverage-demo-result', 'aria-live': 'polite' });
  let sampleKey = 'covered';
  const sampleTabs = h('div', { class: 'segmented', role: 'tablist', 'aria-label': 'Sample topics' });
  const renderSample = (key) => {
    sampleKey = key;
    for (const btn of sampleTabs.querySelectorAll('button')) {
      btn.setAttribute('aria-selected', btn.dataset.key === key ? 'true' : 'false');
      btn.classList.toggle('active', btn.dataset.key === key);
    }
    const sample = COVERAGE_SAMPLES[key];
    const status = key;
    demoResult.replaceChildren(
      h('div', { class: 'demo-result-head' },
        h('div', null, h('p', { class: 'kicker', text: 'sample note · ' + sample.label }), h('p', { class: 'demo-note', text: sample.note })),
        coverageChip(status)),
      h('div', { class: 'demo-evidence' },
        h('span', { class: 'excerpt-label', text: key === 'not_found' ? 'no excerpt' : 'matched excerpt · c2' }),
        h('blockquote', { class: key === 'not_found' ? 'muted' : '', text: sample.excerpt }),
        h('p', { class: 'small muted', text: key === 'not_found'
          ? 'Vertex does not manufacture evidence. The topic stays visibly unmatched.'
          : `Matched terms: ${sample.terms}. Open the full workspace to inspect the surrounding chunk.` })),
      h('p', { class: 'demo-footnote small muted', text: 'Illustrative sample only — this is not your notebook.' }));
  };
  for (const key of ['covered', 'thin', 'not_found']) {
    const b = h('button', { type: 'button', role: 'tab', 'aria-selected': 'false', 'data-key': key, text: COVERAGE_SAMPLES[key].label });
    b.addEventListener('click', () => renderSample(key));
    sampleTabs.appendChild(b);
  }
  renderSample(sampleKey);

  /* -------------------------------------------------------- gradient widget */
  const widget = learningRateWidget();
  cleanups.push(() => widget.cleanup());

  const body = h('div', { class: 'landing-body' },
    h('section', { class: 'section problem-section', id: 'problem' },
      sectionHead('The problem', 'Revision tools give you more to read.', 'Vertex tells you what your notes are missing — and shows you the evidence.'),
      h('div', { class: 'feature-grid three' },
        h('article', { class: 'feature-card' },
          h('span', { class: 'feature-icon' }, icon('layers', 22)),
          h('h3', { text: 'Notes are not coverage' }),
          h('p', { text: 'A heading on page four is not an explanation. Vertex separates fully explained topics from ones your notes only mention, and from ones that never appear.' })),
        h('article', { class: 'feature-card' },
          h('span', { class: 'feature-icon' }, icon('book', 22)),
          h('h3', { text: 'Explanations stay checkable' }),
          h('p', { text: 'Claims taken from your notes carry an excerpt and a chunk id. Added context is labelled Vertex explanation. The two are never blended silently.' })),
        h('article', { class: 'feature-card' },
          h('span', { class: 'feature-icon' }, icon('compass', 22)),
          h('h3', { text: 'Practice is not a score' }),
          h('p', { text: 'Work through a numerical problem, reveal the reasoning, and reflect. No streaks, no leaderboard, no red failure banner.' })))),
    h('section', { class: 'section coverage-demo-section', id: 'coverage-demo' },
      h('div', { class: 'split-heading' },
        h('div', null,
          h('p', { class: 'kicker', text: 'Try the verdict' }),
          h('h2', { class: 'section-title', text: 'Watch evidence decide the status.' }),
          h('p', { class: 'section-sub', text: 'Three sample note fragments, three honest verdicts. Nothing is uploaded here.' })),
        sampleTabs),
      demoResult),
    h('section', { class: 'section coverage-intel-section' },
      h('div', { class: 'two-col' },
        h('div', null,
          h('p', { class: 'kicker', text: 'Coverage intelligence' }),
          h('h2', { class: 'section-title', text: 'A verdict you can audit, not a confidence score.' }),
          h('p', { class: 'section-sub', text: 'The two-pane coverage map keeps the original passage on screen while you read the verdict. On mobile, the excerpt opens inline beneath the topic.' }),
          h('ul', { class: 'check-list' },
            h('li', null, icon('check', 16), 'Exactly one status chip per topic: icon and text.'),
            h('li', null, icon('check', 16), 'Original chunk id and verbatim excerpt.'),
            h('li', null, icon('check', 16), 'Absent topics say “No matching passage in these notes.”'),
            h('li', null, icon('check', 16), 'No paraphrase presented as original evidence.'))),
        h('div', { class: 'mock-coverage card' },
          h('div', { class: 'mock-head' }, h('span', { text: 'Coverage · Numerical Optimization' }), h('span', { class: 'badge badge-demo', text: 'Curated demo' })),
          [['Gradient descent', 'covered'], ['Newton’s method', 'covered'], ['Armijo line search', 'thin'], ['Quasi-Newton / BFGS', 'thin'], ['Gram–Schmidt', 'not_found'], ['Conjugate gradient', 'not_found']]
            .map(([name, status]) => h('div', { class: `mock-row ${status === 'not_found' ? 'muted-row' : ''}` },
              h('span', { text: name }), coverageChip(status, { small: true }))),
          h('p', { class: 'mock-foot small muted', text: 'Opening one excerpt closes the previous one.' })))),
    h('section', { class: 'section lesson-preview-section' },
      h('div', { class: 'lesson-preview' },
        h('div', { class: 'lesson-preview-copy' },
          h('p', { class: 'kicker', text: 'Lesson Studio' }),
          h('h2', { class: 'section-title', text: 'A lesson card, not a chat window.' }),
          h('p', { class: 'section-sub', text: 'Each topic gets one page: idea, why it matters, analogy, at most five steps, pitfalls, what your notes still miss, a diagram, an exam question and a scenario.' }),
          h('div', { class: 'lesson-snippet' },
            h('div', { class: 'snippet-head' }, h('span', { class: 'snippet-num', text: '03' }), sourceChip('notes')),
            h('p', { text: 'On f(x) = x² with α = 0.1 each gradient step multiplies the error by 0.8 and marches down to the minimum.' }),
            mathNode('x_{k+1}=x_k-\\alpha\\nabla f(x_k)', 'xₖ₊₁ = xₖ − α∇f(xₖ)'),
            h('p', { class: 'small muted', text: 'Citation chip → c2. The full chunk opens beside the lesson.' })),
          h('div', { class: 'hero-actions' },
            button('Open Lesson Studio', { variant: 'ghost', icon: 'book', onClick: () => ctx.navigate('#/dashboard') }))),
        h('div', { class: 'lesson-preview-art' },
          h('div', { class: 'preview-chip-row' }, coverageChip('covered'), h('span', { class: 'badge badge-soft', text: 'Weight 4/5' })),
          h('h3', { text: 'Newton’s method' }),
          h('p', { class: 'muted', text: 'A local curvature model helps choose the update.' }),
          h('div', { class: 'preview-pin' }, icon('pin', 16), h('span', { text: 'Pin this takeaway → revision sheet' })),
          h('div', { class: 'preview-note' }, h('span', { class: 'note-tag', text: 'From your notes · c3' }), h('p', { text: '“For minimization apply Newton to grad f(x) = 0; the Jacobian of grad f is the Hessian H.”' }))))),
    h('section', { class: 'section gradient-section', id: 'gradient' },
      h('div', { class: 'two-col align-start' },
        h('div', null,
          h('p', { class: 'kicker', text: 'Mathematical visualization' }),
          h('h2', { class: 'section-title', text: 'Change one number. See the method fail or converge.' }),
          h('p', { class: 'section-sub', text: 'This is the actual computation for f(x) = x², not a decorative animation. For this quadratic, a fixed learning rate at or above 1 diverges.' }),
          h('ul', { class: 'check-list' },
            h('li', null, icon('check', 16), 'Iteration values are recomputed from the formula.'),
            h('li', null, icon('check', 16), 'The graph redraws from the same numbers.'),
            h('li', null, icon('check', 16), 'No score or “AI confidence” attached.')),
          h('p', { class: 'small muted', text: 'Every lesson with a suitable topic gets an interactive visualization. Formula cards reuse the same calculations.' })),
        widget.node)),
    h('section', { class: 'section sheet-preview-section' },
      h('div', { class: 'two-col' },
        h('div', null,
          h('p', { class: 'kicker', text: 'Revision sheet' }),
          h('h2', { class: 'section-title', text: 'The page you actually take into the exam.' }),
          h('p', { class: 'section-sub', text: 'Only pins build the sheet. Reorder them, remove them, reveal the original passage on screen, then print black-on-white A4.' }),
          h('ul', { class: 'check-list' },
            h('li', null, icon('check', 16), 'Heading, one-sentence takeaway, key equation, up to two notes.'),
            h('li', null, icon('check', 16), 'KaTeX served locally; a readable Unicode fallback if it ever fails.'),
            h('li', null, icon('check', 16), 'Original excerpts stay on screen and never print.')),
          h('p', { class: 'sheet-warning' }, icon('info', 16), 'Check anything here against your textbook — the model can be wrong.')),
        h('div', { class: 'paper-preview' },
          h('div', { class: 'paper-head' }, h('span', { text: 'Numerical Optimization' }), h('small', { text: 'Revision sheet · A4' })),
          h('div', { class: 'paper-pin' },
            h('span', { class: 'paper-num', text: '01' }),
            h('h4', { text: 'Gradient descent' }),
            h('p', { text: 'Move in the direction that lowers the function nearby.' }),
            mathNode('x_{k+1}=x_k-\\alpha_k\\nabla f(x_k)', 'xₖ₊₁ = xₖ − αₖ∇f(xₖ)', true),
            h('ul', null, h('li', { text: 'αₖ controls how far you move.' }), h('li', { text: 'Too large a step can overshoot.' }))),
          h('div', { class: 'paper-pin' },
            h('span', { class: 'paper-num', text: '02' }),
            h('h4', { text: 'Armijo line search' }),
            h('p', { text: 'Accept a step only when it decreases the value enough for its slope and length.' }),
            mathNode('f(x_k+\\alpha p_k)\\le f(x_k)+c\\alpha\\nabla f(x_k)^{\\top}p_k', 'f(xₖ+αpₖ) ≤ f(xₖ) + cα∇f(xₖ)ᵀpₖ', true)),
          h('p', { class: 'paper-foot', text: 'Check anything here against your textbook — the model can be wrong.' })))),
    h('section', { class: 'section calendar-preview-section' },
      h('div', { class: 'calendar-preview' },
        h('div', null,
          h('p', { class: 'kicker', text: 'Study calendar' }),
          h('h2', { class: 'section-title', text: 'Planning that feels tactile, not administrative.' }),
          h('p', { class: 'section-sub', text: 'Tap a date for a ripple, a lift and a coordinated reveal of that day’s sessions. Drag a session to another day, or move it with a keyboard button.' }),
          h('ul', { class: 'check-list' },
            h('li', null, icon('check', 16), 'Suggestions explain themselves: coverage, weight, prerequisite.'),
            h('li', null, icon('check', 16), 'Planned and completed hours come from real events.'),
            h('li', null, icon('check', 16), 'Month, week and day views share one dataset.')),
          button('See the calendar', { variant: 'ghost', icon: 'calendar', onClick: () => ctx.navigate('#/calendar') })),
        h('div', { class: 'mini-calendar card', 'aria-hidden': 'true' },
          h('div', { class: 'mini-cal-head' }, h('strong', { text: 'March' }), h('span', { class: 'badge badge-demo', text: 'exam in 5 days' })),
          h('div', { class: 'mini-cal-grid' },
            ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => h('span', { class: 'mini-cal-dow', text: d, key: i })),
            Array.from({ length: 28 }, (_, i) => h('span', {
              class: `mini-cal-day${[8, 12, 15, 19, 22].includes(i) ? ' has' : ''}${i === 15 ? ' today' : ''}${i === 19 ? ' selected' : ''}`,
              text: String(i + 1),
            }))),
          h('div', { class: 'mini-cal-events' },
            h('span', { class: 'mini-event' }, h('i', { class: 'ev-dot concept' }), '18:00 · Newton’s method'),
            h('span', { class: 'mini-event' }, h('i', { class: 'ev-dot gaps' }), '20:00 · Gram–Schmidt gap')))),
    ),
    h('section', { class: 'section privacy-section' },
      h('div', { class: 'privacy-card' },
        h('div', { class: 'privacy-mark' }, icon('lock', 26)),
        h('div', null,
          h('p', { class: 'kicker', text: 'Privacy architecture' }),
          h('h2', { class: 'section-title', text: 'Your notes stay yours unless you explicitly send an excerpt.' }),
          h('div', { class: 'privacy-grid' },
            h('div', null, h('h4', { text: 'Local by default' }), h('p', { class: 'small muted', text: 'Notes, topics, pins, sessions and settings live in this browser. No account, no server database, no analytics service.' })),
            h('div', null, h('h4', { text: 'No silent upload' }), h('p', { class: 'small muted', text: 'A model request happens only after you choose a provider, store a key, and press a generate action.' })),
            h('div', null, h('h4', { text: 'Honest key handling' }), h('p', { class: 'small muted', text: 'Keys stay in session storage by default. Browser-side keys cannot be protected from someone inspecting your browser — the UI says so.' })),
            h('div', null, h('h4', { text: 'Offline demo' }), h('p', { class: 'small muted', text: 'The six-topic curated demo needs no key, no network model call and never touches your own workspace.' }))))),
    h('section', { class: 'cta-band' },
      h('div', { class: 'cta-inner' },
        h('p', { class: 'kicker', text: 'Exam eve' }),
        h('h2', { class: 'cta-title' }, 'Walk in knowing ', h('em', { text: 'what you don’t know.' })),
        h('p', { class: 'cta-sub', text: 'Build a workspace from your notes, or explore the full curated demo first.' }),
        h('div', { class: 'hero-actions' },
          button('Start revising', { icon: 'arrow', onClick: goStart }),
          button('Open curated demo', { variant: 'light', onClick: () => ctx.openDemo() })),
        h('p', { class: 'cta-foot small', text: 'No account required for the demo · everything runs from a static file server' }))),
    h('footer', { class: 'public-footer' },
      h('div', { class: 'footer-brand' }, h('span', { class: 'brand-mark', text: '▲' }), h('strong', { text: 'VERTEX' })),
      h('p', { class: 'small muted', text: 'NotebookLM knows your documents. Vertex knows your exam.' }),
      h('nav', { class: 'footer-links', 'aria-label': 'Footer' },
        h('button', { type: 'button', text: 'How it works', onClick: () => document.getElementById('story')?.scrollIntoView({ behavior: 'smooth' }) }),
        h('button', { type: 'button', text: 'Coverage', onClick: () => document.getElementById('coverage-demo')?.scrollIntoView({ behavior: 'smooth' }) }),
        h('button', { type: 'button', text: 'Privacy', onClick: () => document.querySelector('.privacy-section')?.scrollIntoView({ behavior: 'smooth' }) }),
        h('span', { class: 'muted', text: 'MIT · static · no tracking' })))));

  root.append(hero, story, body);

  /* -------------------------------------------------------------- behavior */
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const simpleStory = reduceMotion || window.matchMedia('(max-width: 720px)').matches;
  const heroArt = hero.querySelector('#hero-art');
  const sceneEls = [...stage.querySelectorAll('.scene')];
  const gdPoint = hero.querySelector('.gd-point');
  const gdGuide = hero.querySelector('.gd-guide');
  let frame = 0;
  let heroTiltFrame = 0;

  function updateStory() {
    frame = 0;
    const rect = story.getBoundingClientRect();
    const total = Math.max(1, story.offsetHeight - window.innerHeight);
    const progress = Math.min(1, Math.max(0, -rect.top / total));
    const pos = progress * (sceneEls.length - 1);
    sceneEls.forEach((el, i) => {
      const distance = Math.abs(pos - i);
      const opacity = Math.max(0, 1 - distance * 1.5);
      el.style.setProperty('--local', Math.min(1, Math.max(0, pos - i)).toFixed(3));
      el.style.opacity = String(opacity);
      el.style.transform = `translate3d(0, ${(i - pos) * 46}px, 0) scale(${1 - Math.min(0.08, distance * 0.04)})`;
      el.style.pointerEvents = distance < 0.45 ? 'auto' : 'none';
      el.setAttribute('aria-hidden', distance < 0.45 ? 'false' : 'true');
    });
    railFill.style.transform = `scaleY(${progress})`;
    if (gdPoint && gdGuide) {
      const local = Math.min(1, Math.max(0, pos - 3));
      const x = -2.2 + 4.4 * local;
      const px = 180 + x * 62;
      const py = 198 - x * x * 24;
      gdPoint.setAttribute('cx', px.toFixed(1));
      gdPoint.setAttribute('cy', py.toFixed(1));
      gdGuide.setAttribute('x1', px.toFixed(1));
      gdGuide.setAttribute('x2', px.toFixed(1));
      gdGuide.setAttribute('y1', py.toFixed(1));
      gdGuide.setAttribute('y2', '198');
    }
  }

  const onScroll = () => {
    if (!frame) frame = requestAnimationFrame(updateStory);
  };

  function updateTilt(e) {
    if (heroTiltFrame) return;
    heroTiltFrame = requestAnimationFrame(() => {
      heroTiltFrame = 0;
      const r = heroArt.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width - 0.5) * 2;
      const y = ((e.clientY - r.top) / r.height - 0.5) * 2;
      heroArt.style.setProperty('--tilt-x', x.toFixed(3));
      heroArt.style.setProperty('--tilt-y', y.toFixed(3));
    });
  }

  /* particles */
  const canvas = hero.querySelector('.hero-particles');
  let particleFrame = 0;
  let particles = [];
  function sizeCanvas() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    particles = Array.from({ length: 34 }, (_, i) => ({
      x: (rect.width * ((i * 37) % 100)) / 100,
      y: (rect.height * ((i * 61) % 100)) / 100,
      r: 0.7 + ((i * 13) % 18) / 12,
      vx: ((i % 5) - 2) * 0.06,
      vy: ((i % 7) - 3) * 0.045,
      a: 0.12 + ((i * 7) % 30) / 100,
    }));
  }
  function drawParticles() {
    const ctx = canvas.getContext('2d');
    const w = canvas.width / (Math.min(2, window.devicePixelRatio || 1));
    const hgt = canvas.height / (Math.min(2, window.devicePixelRatio || 1));
    ctx.clearRect(0, 0, w, hgt);
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = w;
      if (p.x > w) p.x = 0;
      if (p.y < 0) p.y = hgt;
      if (p.y > hgt) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(222, 91, 52, ${p.a})`;
      ctx.fill();
    }
    particleFrame = requestAnimationFrame(drawParticles);
  }
  function startParticles() {
    if (reduceMotion) return;
    sizeCanvas();
    particleFrame = requestAnimationFrame(drawParticles);
  }
  const onResize = () => {
    if (reduceMotion) return;
    cancelAnimationFrame(particleFrame);
    sizeCanvas();
    particleFrame = requestAnimationFrame(drawParticles);
  };
  const onVisibility = () => {
    if (reduceMotion) return;
    if (document.hidden) cancelAnimationFrame(particleFrame);
    else if (!particleFrame) particleFrame = requestAnimationFrame(drawParticles);
  };

  if (simpleStory) {
    sceneEls.forEach((el) => { el.style.opacity = '1'; el.style.transform = 'none'; el.style.pointerEvents = 'auto'; el.setAttribute('aria-hidden', 'false'); });
  } else {
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    heroArt.addEventListener('pointermove', updateTilt);
    heroArt.addEventListener('pointerleave', () => {
      heroArt.style.setProperty('--tilt-x', '0');
      heroArt.style.setProperty('--tilt-y', '0');
    });
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);
    startParticles();
    updateStory();
  }

  cleanups.push(() => {
    cancelAnimationFrame(frame);
    cancelAnimationFrame(particleFrame);
    cancelAnimationFrame(heroTiltFrame);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisibility);
  });

  ctx.refreshShell?.();
  return () => cleanups.forEach((fn) => { try { fn(); } catch { /* already cleaned */ } });
}
