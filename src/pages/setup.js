/** setup.js — demo entry or your own notes + syllabus, with offline coverage. */
import { h, icon, button, toast, setBusy } from '../ui.js';
import {
  getActiveProfile, getActiveNotebook, createNotebook, saveNotebook, recordProgress,
} from '../state.js';
import {
  chunkNotes, detectTopics, applyCoverage, aiTopicMap, isAiReady,
} from '../services.js';
import { normalizePins, normalizePinPoints, normalizeCalendar } from '../core.js';
import { describeLlmError } from '../providers.js';

export default function renderSetup(root, ctx) {
  const profile = getActiveProfile();
  const current = getActiveNotebook();
  const editing = current && current.kind !== 'demo' ? current : null;
  const demoActive = current?.kind === 'demo';

  const titleInput = h('input', { class: 'input', id: 'ws-title', maxlength: '80', value: editing?.title || '', placeholder: 'e.g. Numerical Optimization — exam eve' });
  const notes = h('textarea', { class: 'textarea', id: 'notes-raw', rows: '11', placeholder: 'Paste your lecture notes here. Headings, half-finished derivations, tutorial scribbles — all of it.' });
  const syllabus = h('textarea', { class: 'textarea', id: 'syllabus-raw', rows: '7', placeholder: 'One syllabus topic per line. Example:\nUnit 1 (Unconstrained Optimization): Gradient descent\nUnit 1 (Unconstrained Optimization): Newton’s method' });
  const hours = h('input', { class: 'input', id: 'hours', type: 'number', min: '0.5', max: '24', step: '0.5', value: String(editing?.settings?.hoursToStudy || 3) });
  const examDate = h('input', { class: 'input', id: 'exam-date', type: 'date', value: editing?.examDate || '' });
  const detect = h('input', { type: 'checkbox', id: 'detect-notes', checked: true });
  const useAi = h('input', { type: 'checkbox', id: 'use-ai', checked: false });
  const error = h('div', { class: 'form-errors', role: 'alert' });
  const status = h('p', { class: 'form-status', 'aria-live': 'polite' });

  if (editing) {
    notes.value = editing.notes?.raw || '';
    syllabus.value = editing.syllabus?.raw || '';
  }

  const fileInput = h('input', { type: 'file', accept: '.txt,.md,text/plain,text/markdown', class: 'sr-only', id: 'notes-file' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (file.size > 400000) {
      toast('That file is over 400 KB. Paste the relevant section instead.', 'error');
      fileInput.value = '';
      return;
    }
    try {
      notes.value = await file.text();
      toast('Notes loaded from file.', 'good');
    } catch {
      toast('Could not read that file.', 'error');
    }
    fileInput.value = '';
  });

  const prepareBtn = button(editing ? 'Rebuild this workspace' : 'Prepare my workspace', { icon: 'arrow' });
  const demoBusy = button('Open curated demo', { variant: 'ghost', icon: 'play' });

  const run = async () => {
    error.replaceChildren();
    const raw = notes.value.trim();
    const syllabusRaw = syllabus.value.trim();
    if (raw.length < 80) {
      error.appendChild(h('p', { class: 'field-error', text: 'Add at least a few sentences of notes (80+ characters) so coverage means something.' }));
      notes.focus();
      return;
    }
    if (raw.length > 60000) {
      error.appendChild(h('p', { class: 'field-error', text: 'Notes are over 60,000 characters. Trim to the exam-relevant sections so matching stays fast and useful.' }));
      notes.focus();
      return;
    }
    setBusy(prepareBtn, true, 'Preparing…');
    status.textContent = 'Detecting topics…';
    let topics = null;
    let usedAi = false;
    if (useAi.checked && isAiReady()) {
      try {
        status.textContent = 'Mapping the syllabus with the selected provider…';
        topics = await aiTopicMap({ syllabusRaw, notesRaw: raw, lang: 'en' });
        usedAi = true;
      } catch (err) {
        toast(`AI mapping failed: ${describeLlmError(err)} Falling back to the offline parser.`, 'error');
      }
    }
    if (!topics) {
      topics = detectTopics({ syllabusRaw, notesRaw: raw, useNotes: detect.checked });
    }
    if (topics.length < 5) {
      setBusy(prepareBtn, false, editing ? 'Rebuild this workspace' : 'Prepare my workspace');
      status.textContent = '';
      error.appendChild(h('p', { class: 'field-error', text: 'Vertex needs five to twelve topics. Add syllabus lines (one per topic) or more headings in your notes, then try again.' }));
      return;
    }
    status.textContent = 'Chunking notes and checking evidence…';
    const chunks = chunkNotes(raw);
    applyCoverage(topics, chunks);

    let nb;
    if (editing) {
      nb = editing;
      const byName = new Map((editing.topics || []).map((t) => [t.name.toLowerCase(), t]));
      for (const t of topics) {
        const old = byName.get(t.name.toLowerCase());
        if (old) {
          t.id = old.id;
          t.rating = old.rating ?? null;
          t.after = old.after ?? null;
          t.lesson = old.lesson || null;
          if (old.aliases?.length) t.aliases = [...new Set([...t.aliases, ...old.aliases])];
        }
      }
      // keep ids unique after adoption
      const used = new Set();
      topics.forEach((t, i) => {
        if (used.has(t.id)) t.id = `t${i + 1}`;
        used.add(t.id);
      });
      for (const t of topics) {
        t.prereqs = (t.prereqs || []).filter((id) => used.has(id) && id !== t.id);
      }
      nb.topics = topics;
      nb.title = titleInput.value.trim() || nb.title;
      nb.notes = { raw, chunks };
      nb.syllabus = { raw: syllabusRaw, source: syllabusRaw ? 'pasted' : 'auto' };
      nb.settings = { ...(nb.settings || {}), hoursToStudy: Number(hours.value) || 3 };
      nb.examDate = examDate.value || '';
      nb.revisionPins = normalizePins(nb.revisionPins, nb);
      nb.pinPoints = normalizePinPoints(nb.pinPoints, nb);
      nb.calendar = normalizeCalendar(nb.calendar, nb);
      saveNotebook(nb);
    } else {
      nb = createNotebook({
        title: titleInput.value.trim() || 'My revision workspace',
        notesRaw: raw,
        syllabusRaw,
        topics,
        hours: Number(hours.value) || 3,
        examDate: examDate.value || '',
        owner: profile?.id || null,
      });
      nb.notes.chunks = chunks;
      saveNotebook(nb);
    }
    recordProgress(nb);
    status.textContent = usedAi ? 'Ready. Topics were mapped by the selected provider; coverage is still local lexical evidence.' : 'Ready. Coverage was computed locally against your chunks.';
    setBusy(prepareBtn, false, editing ? 'Rebuild this workspace' : 'Prepare my workspace');
    toast(editing ? 'Workspace rebuilt. Pins and calendar were preserved where topics still match.' : 'Workspace ready. Every verdict has an excerpt.', 'good');
    ctx.navigate('#/coverage');
  };

  prepareBtn.addEventListener('click', run);
  demoBusy.addEventListener('click', async () => {
    setBusy(demoBusy, true, 'Opening demo…');
    try { await ctx.openDemo(); } finally { setBusy(demoBusy, false, 'Open curated demo'); }
  });

  const form = h('div', { class: 'setup-form card' },
    demoActive ? h('div', { class: 'notice notice-warm' }, icon('info', 18), h('p', { text: 'You are currently viewing the curated demo. Building here creates a separate workspace and leaves the demo untouched.' })) : null,
    h('div', { class: 'field-row' },
      h('div', { class: 'field grow' }, h('label', { for: 'ws-title', text: 'Workspace title' }), titleInput),
      h('div', { class: 'field' }, h('label', { for: 'hours', text: 'Study hours left' }), hours),
      h('div', { class: 'field' }, h('label', { for: 'exam-date', text: 'Exam date (optional)' }), examDate)),
    h('div', { class: 'field' },
      h('div', { class: 'row-between' },
        h('label', { for: 'notes-raw', text: 'Your lecture notes' }),
        h('div', { class: 'file-row' },
          h('label', { for: 'notes-file', class: 'file-btn' }, icon('download', 14), 'Load .txt / .md'),
          fileInput)),
      notes),
    h('div', { class: 'field' },
      h('label', { for: 'syllabus-raw', text: 'Syllabus — one topic per line' }),
      syllabus,
      h('p', { class: 'field-hint', text: 'Leave it empty and Vertex will detect topics from your notes headings. Five to twelve topics works best.' })),
    h('div', { class: 'check-row' },
      h('label', { class: 'checkbox' }, detect, h('span', { text: 'Detect topics from my notes as well' })),
      isAiReady()
        ? h('label', { class: 'checkbox' }, useAi, h('span', { text: 'Use the configured AI provider for topic mapping (optional)' }))
        : h('span', { class: 'small muted' }, 'Offline parser active · add a key in Settings for optional AI mapping')),
    error,
    h('div', { class: 'setup-actions' },
      prepareBtn,
      h('span', { class: 'small muted', text: 'Coverage runs locally. Notes are not uploaded.' })),
    status);

  const aside = h('aside', { class: 'setup-aside' },
    h('div', { class: 'card demo-card' },
      h('span', { class: 'badge badge-demo', text: 'Curated demo' }),
      h('h3', { text: 'No notes ready? Explore the full product.' }),
      h('p', { class: 'small muted', text: 'Six numerical-optimization topics with realistic exam-eve notes, curated lessons, formulas, scenarios, practice questions and a seeded calendar.' }),
      h('ul', { class: 'check-list compact' },
        h('li', null, icon('check', 14), 'Works offline'),
        h('li', null, icon('check', 14), 'Zero model requests'),
        h('li', null, icon('check', 14), 'Never touches your notebook'),
        h('li', null, icon('check', 14), 'All three coverage states')),
      demoBusy),
    h('div', { class: 'card' },
      h('h3', { text: 'What happens next' }),
      h('ol', { class: 'step-list compact' },
        h('li', null, h('strong', { text: 'Chunk' }), 'Your notes are split into stable, citeable passages.'),
        h('li', null, h('strong', { text: 'Map' }), 'Syllabus lines become ordered topics with units and weights.'),
        h('li', null, h('strong', { text: 'Match' }), 'Local lexical matching assigns explained, only mentioned or no match.'),
        h('li', null, h('strong', { text: 'Study' }), 'Lessons, practice, calendar and a one-page sheet use the same records.'))),
    h('div', { class: 'card privacy-small' },
      icon('lock', 18),
      h('div', null,
        h('h3', { text: 'Privacy, precisely' }),
        h('p', { class: 'small muted', text: 'No account, server database or tracking service. A model request happens only if you configure a provider and press an AI action. Browser-side keys are not protected from someone inspecting this browser.' }))));

  root.appendChild(h('div', { class: 'page setup-page' },
    h('div', { class: 'page-head' },
      h('div', null,
        h('p', { class: 'kicker', text: profile ? `Local profile · ${profile.name}` : 'Local workspace' }),
        h('h1', { class: 'page-title', text: editing ? 'Update your workspace.' : 'Build your revision workspace.' }),
        h('p', { class: 'page-sub', text: 'Paste your notes and syllabus. Vertex will show what is explained, what is only mentioned, and what never appears — with the exact evidence.' })),
      h('div', { class: 'page-head-actions' },
        button('Back to overview', { variant: 'ghost', onClick: () => ctx.navigate(editing ? '#/dashboard' : '#/') }))),
    h('div', { class: 'setup-layout' }, form, aside)));

  ctx.refreshShell?.();
  return () => {};
}
