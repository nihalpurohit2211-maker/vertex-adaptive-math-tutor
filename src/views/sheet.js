/**
 * views/sheet.js — Screen 4 (plan3 §10): cards in store.getPins order;
 * each card = topic name + takeaway + short distinction where the lesson
 * supplies one. Controls per card: Move up / Move down / Remove, disabled
 * at boundaries. Empty state is exactly "Pin a topic from any lesson to
 * start your sheet" with a link back to the map, and "Print / Save as PDF"
 * stays hidden in the empty state. The print stylesheet renders only the
 * sheet title + cards (A4 portrait, black on white, ~12 mm margins, no
 * card split across pages).
 */
import { ROUTES } from '../contracts.js';

function cardLines(topic) {
  const lesson = topic.lesson || {};
  const takeaway = lesson.takeaway
    || lesson.oneLiner
    || (Array.isArray(lesson.steps) && lesson.steps.length ? (lesson.steps[0].text || String(lesson.steps[0])) : '')
    || 'Open the lesson to add a takeaway.';
  const distinction = lesson.distinction
    || (Array.isArray(lesson.pitfalls) && lesson.pitfalls.length ? (lesson.pitfalls[0].text || String(lesson.pitfalls[0])) : '')
    || (lesson.examQuestion && lesson.examQuestion.q ? 'Revisit: ' + lesson.examQuestion.q : '');
  return { takeaway, distinction };
}

export async function render(container, ctx) {
  const { h, actions } = ctx;
  const nb = ctx.state.notebook;

  if (!nb) {
    const card = h('div', { class: 'card empty-card' }, [
      h('p', { class: 'muted', text: 'No notebook yet — pins live on your notebook.' }),
    ]);
    const b = h('button', { type: 'button', class: 'btn btn-primary', text: 'Go to setup' });
    b.addEventListener('click', () => ctx.navigate(ROUTES.SETUP));
    card.appendChild(b);
    container.appendChild(card);
    return;
  }

  const pins = actions.getPins();
  const byId = new Map(nb.topics.map((t) => [t.id, t]));

  /* ---- on-screen controls (never printed) ---- */
  const controls = h('div', { class: 'sheet-controls no-print' });
  const back = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: '← Coverage map' });
  back.addEventListener('click', () => ctx.navigate(ROUTES.MAP));
  controls.appendChild(back);

  const printBtn = h('button', { type: 'button', class: 'btn btn-primary', id: 'btn-print', text: 'Print / Save as PDF' });
  printBtn.addEventListener('click', () => window.print());
  if (pins.length) controls.appendChild(printBtn); // hidden in the empty state (§10)

  const exportBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'btn-export', text: 'Export notebook JSON' });
  exportBtn.addEventListener('click', () => actions.exportNotebook());
  controls.appendChild(exportBtn);

  const importInput = h('input', {
    type: 'file', id: 'sheet-import', class: 'file-input',
    accept: '.json,application/json', 'aria-label': 'Import notebook JSON',
  });
  importInput.addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      const text = await f.text();
      await actions.importNotebookText(text);
    } catch (err) {
      console.warn('sheet.js: import file read failed —', err.message);
      ctx.toast('Could not read that file.', 'error');
    }
  });
  const importLabel = h('label', { class: 'file-btn', for: 'sheet-import' }, ['Import notebook JSON', importInput]);
  controls.appendChild(importLabel);
  container.appendChild(controls);

  /* ---- the printable document ---- */
  const doc = h('div', { class: 'sheet-doc', id: 'sheet-doc' });
  doc.appendChild(h('h1', { class: 'sheet-title', text: 'Vertex — revision sheet' }));

  if (!pins.length) {
    const empty = h('div', { class: 'sheet-empty' }, [
      h('p', { class: 'sheet-empty-text', text: 'Pin a topic from any lesson to start your sheet' }),
    ]);
    const mapLink = h('a', { class: 'accent-link', href: ROUTES.MAP, text: 'Open the coverage map' });
    empty.appendChild(mapLink);
    doc.appendChild(empty);
    container.appendChild(doc);
    return; // print button was intentionally not added above (empty state)
  }

  pins.forEach((topicId, i) => {
    const topic = byId.get(topicId);
    if (!topic) return; // getPins normalized — belt for re-render races
    const { takeaway, distinction } = cardLines(topic);

    const cardEl = h('section', { class: 'sheet-card' });
    cardEl.appendChild(h('h2', { class: 'sheet-card-name', text: topic.name }));
    cardEl.appendChild(h('p', { class: 'sheet-card-takeaway', text: takeaway }));
    if (distinction) cardEl.appendChild(h('p', { class: 'sheet-card-distinction' }, [
      h('strong', { text: 'Remember: ' }),
      distinction,
    ]));

    const cardControls = h('div', { class: 'sheet-card-controls no-print' });
    const up = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Move up', disabled: i === 0 });
    up.addEventListener('click', async () => {
      await actions.pinMove(topicId, -1);
      ctx.rerender();
    });
    const down = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Move down', disabled: i === pins.length - 1 });
    down.addEventListener('click', async () => {
      await actions.pinMove(topicId, 1);
      ctx.rerender();
    });
    const remove = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Remove' });
    remove.addEventListener('click', async () => {
      await actions.pinToggle(topicId);
      ctx.announce('Removed from revision sheet');
      ctx.rerender();
    });
    cardControls.appendChild(up);
    cardControls.appendChild(down);
    cardControls.appendChild(remove);
    cardEl.appendChild(cardControls);

    doc.appendChild(cardEl);
  });

  container.appendChild(doc);
}
