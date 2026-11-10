/**
 * views/setup.js — Screen 1 (plan3 §10): "Try the demo" FIRST in reading
 * order, then "Use my notes" with the existing notes/syllabus/hours fields.
 * No key → exact copy "Add a BharatCode key to use your notes, or try the
 * demo." A small three-chip coverage preview sits beside the form; the
 * import/export entry points stay. Two columns on desktop, one on mobile.
 */
import { ROUTES, DEFAULTS } from '../contracts.js';
import { icon } from '../render.js';

const STAGES = ['Reading notes', 'Mapping topics', 'Checking coverage', 'Preparing first lessons'];

function readText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read ' + file.name));
    reader.readAsText(file);
  });
}

function statusChip(h, kind, label) {
  return h('span', { class: 'chip chip-' + kind }, [
    icon(kind === 'covered' ? 'check' : kind === 'thin' ? 'short-line' : 'search'),
    h('span', { text: label }),
  ]);
}

export async function render(container, ctx) {
  const { state, actions } = ctx;
  const h = ctx.h;

  container.appendChild(h('div', { class: 'page-head' }, [
    h('h1', { class: 'page-title', text: 'Vertex · exam-eve revision' }),
    h('p', { class: 'page-sub', text: 'Paste your notes and syllabus. See what your notes leave out, reason through the tricky bits, and take a short revision sheet into your final study session.' }),
  ]));

  const grid = h('div', { class: 'setup-grid' });

  /* ---- 1. demo card — first in reading order, prominent ---- */
  const demoCard = h('section', { class: 'card demo-card', 'aria-labelledby': 'demo-heading' });
  demoCard.appendChild(h('h2', { class: 'card-title', id: 'demo-heading', text: 'Try the demo' }));
  demoCard.appendChild(h('p', {
    class: 'muted',
    text: 'A curated six-topic numerical optimization notebook — no API key needed. Inspect matched note text, walk through the scenarios, and pin a revision sheet.',
  }));
  const demoBtn = h('button', { type: 'button', class: 'btn btn-primary btn-lg', id: 'btn-demo', text: 'Try the demo' });
  demoBtn.addEventListener('click', () => actions.tryDemo());
  demoCard.appendChild(demoBtn);
  demoCard.appendChild(h('p', { class: 'demo-label', text: 'Demo notebook — curated demo' }));

  const preview = h('div', { class: 'coverage-preview', role: 'group', 'aria-label': 'What the coverage map shows' });
  preview.appendChild(h('p', { class: 'preview-title', text: 'The map labels every topic with one of:' }));
  const chips = h('div', { class: 'preview-chips' }, [
    statusChip(h, 'covered', 'Explained'),
    statusChip(h, 'thin', 'Only mentioned'),
    statusChip(h, 'not_found', 'No match found'),
  ]);
  preview.appendChild(chips);
  demoCard.appendChild(preview);

  if (state.notebook) {
    const resume = h('p', { class: 'resume-line' }, [
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'btn-resume', text: 'Continue: open “' + (state.notebook.title || 'your notebook') + '”' }),
    ]);
    resume.querySelector('#btn-resume').addEventListener('click', () => ctx.navigate(ROUTES.MAP));
    demoCard.appendChild(resume);
  }
  grid.appendChild(demoCard);

  /* ---- 2. use-my-notes card ---- */
  const form = h('section', { class: 'card build-card', 'aria-labelledby': 'build-heading' });
  form.appendChild(h('h2', { class: 'card-title', id: 'build-heading', text: 'Use my notes' }));
  form.appendChild(h('p', { class: 'muted', text: 'Vertex maps your notes against your syllabus and writes short lessons. Your notes stay in your browser; the model is only used to prepare them.' }));

  const notes = h('textarea', {
    id: 'setup-notes', class: 'text-input notes-box', rows: '7', spellcheck: 'false',
    'aria-label': 'Your notes', placeholder: 'Paste your lecture notes here — shorthand, half-derivations, skipped lines and all.',
  });
  form.appendChild(h('div', { class: 'step' }, [
    h('label', { class: 'step-label', for: 'setup-notes' }, ['Your notes']),
    notes,
  ]));

  const syllabus = h('textarea', {
    id: 'setup-syllabus', class: 'text-input syllabus-box', rows: '4', spellcheck: 'false',
    'aria-label': 'Syllabus topics', placeholder: 'One topic per line, e.g.:\nNewton’s method\nQuasi-Newton / BFGS\nGram–Schmidt',
  });
  const detect = h('input', { type: 'checkbox', id: 'setup-detect' });
  detect.addEventListener('change', () => {
    syllabus.disabled = detect.checked;
    syllabus.classList.toggle('is-disabled', detect.checked);
  });
  form.appendChild(h('div', { class: 'step' }, [
    h('label', { class: 'step-label', for: 'setup-syllabus' }, ['Syllabus topics']),
    syllabus,
    h('label', { class: 'check-row', for: 'setup-detect' }, [detect, h('span', { text: 'Detect topics from my notes instead' })]),
  ]));

  const hours = h('input', {
    type: 'number', id: 'setup-hours', class: 'text-input hours-input',
    min: '0.5', max: '24', step: '0.5', 'aria-label': 'Hours you have to study',
    value: String(state.settings.hoursToStudy || DEFAULTS.hoursToStudy),
  });
  form.appendChild(h('div', { class: 'step' }, [
    h('label', { class: 'step-label', for: 'setup-hours' }, ['I have']),
    h('div', { class: 'hours-row' }, [hours, h('span', { class: 'muted', text: 'hours to study' })]),
  ]));

  const buildBtn = h('button', { type: 'button', class: 'btn btn-primary', id: 'btn-build', text: 'Use my notes' });
  const prov = state.settings.provider || 'bharatcode';
  const chipLabel = prov === 'demo'
    ? 'Demo'
    : prov === 'gemini'
      ? 'Google AI Studio · ' + (state.settings.geminiModel || DEFAULTS.geminiModel)
      : 'BharatCode · ' + state.settings.model;
  const modelChip = h('button', {
    type: 'button', class: 'model-chip', id: 'model-chip',
    'aria-label': 'Model: ' + chipLabel + '. Open settings to change.',
  }, [
    'Model: ' + chipLabel + ' ',
    h('span', { class: 'caret', 'aria-hidden': 'true', text: '▾' }),
  ]);
  modelChip.addEventListener('click', actions.openSettings);
  buildBtn.addEventListener('click', () => {
    const notesRaw = notes.value.trim();
    if (!notesRaw) {
      state.setupError = { kind: 'empty_notes', message: 'Paste your notes first — Vertex starts from your text.' };
      ctx.rerender();
      return;
    }
    const syllabusRaw = detect.checked ? '' : syllabus.value.trim();
    const hoursNum = Math.min(24, Math.max(0.5, Number(hours.value) || DEFAULTS.hoursToStudy));
    actions.buildCourse({ notesRaw, syllabusRaw, hours: hoursNum });
  });
  form.appendChild(h('div', { class: 'build-row' }, [buildBtn, modelChip]));

  /* ---- no-key / error state — exact plan3 §10 copy ---- */
  if (state.setupError) {
    const err = state.setupError;
    const box = h('div', { class: 'error-box', role: 'alert' });
    if (err.kind === 'no_key') {
      const wantProvider = err.provider || state.settings.provider || 'bharatcode';
      const providerName = wantProvider === 'gemini' ? 'Google AI Studio (Gemini)' : 'BharatCode';
      box.appendChild(h('p', { text: 'Add a ' + providerName + ' key to use your notes, or try the demo.' }));
      const keyBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Add a key in settings' });
      keyBtn.addEventListener('click', actions.openSettings);
      const demoBtn2 = h('button', { type: 'button', class: 'btn btn-primary btn-sm', text: 'Try the demo' });
      demoBtn2.addEventListener('click', () => actions.tryDemo());
      box.appendChild(h('div', { class: 'btn-row' }, [demoBtn2, keyBtn]));
    } else {
      box.appendChild(h('p', { text: err.message || ctx.describeError(err) }));
      const dismiss = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Dismiss' });
      dismiss.addEventListener('click', () => { state.setupError = null; ctx.rerender(); });
      box.appendChild(dismiss);
    }
    form.appendChild(box);
  }

  /* ---- progress panel (never a blank screen) ---- */
  if (state.build && state.build.active) {
    const panel = h('div', { class: 'progress-panel', role: 'status', 'aria-live': 'polite' });
    panel.appendChild(h('h3', { class: 'progress-title', text: 'Preparing your notebook' }));
    const list = h('ol', { class: 'progress-steps' });
    STAGES.forEach((label, i) => {
      const st = state.build.stage;
      const cls = i < st ? 'step-done' : (i === st ? 'step-current' : 'step-pending');
      const marker = i < st ? '✓ ' : (i === st ? '● ' : '○ ');
      list.appendChild(h('li', { class: 'progress-step ' + cls }, [marker + label]));
    });
    panel.appendChild(list);
    const cancel = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'btn-cancel-build', text: 'Cancel' });
    cancel.addEventListener('click', actions.cancelBuild);
    panel.appendChild(cancel);
    form.appendChild(panel);
    buildBtn.disabled = true;
  }

  /* ---- import / export entry points (kept) ---- */
  const ioRow = h('div', { class: 'io-row' });
  const importInput = h('input', {
    type: 'file', id: 'setup-import', class: 'file-input',
    accept: '.json,application/json', 'aria-label': 'Import a Vertex notebook JSON file',
  });
  importInput.addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      await actions.importNotebookText(await readText(f));
    } catch (err) {
      console.warn('setup.js: import file read failed —', err.message);
      ctx.toast('Could not read that file.', 'error');
    }
  });
  ioRow.appendChild(h('label', { class: 'file-btn', for: 'setup-import' }, ['Import notebook JSON', importInput]));
  if (state.notebook) {
    const exportBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'btn-export', text: 'Export notebook JSON' });
    exportBtn.addEventListener('click', () => actions.exportNotebook());
    ioRow.appendChild(exportBtn);
  }
  form.appendChild(ioRow);

  grid.appendChild(form);
  container.appendChild(grid);

  container.appendChild(h('p', { class: 'footnote muted', text: 'The demo opens under its own notebook id — your notes and pins stay untouched. A BharatCode key is only needed to prepare lessons from your own notes.' }));
}
