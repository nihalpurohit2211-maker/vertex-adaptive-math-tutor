/** sheet.js — the one-page revision sheet built only from explicit pins. */
import {
  h, icon, button, coverageChip, sourceChip, mathNode, emptyState, toast, openDialog,
} from '../ui.js';
import {
  getActiveNotebook, toggleTopicPin, moveTopicPin, removePoint, movePoint,
} from '../state.js';
import { topicById } from '../shared.js';

export default function renderSheet(root, ctx) {
  const nb = getActiveNotebook();
  if (!nb) { ctx.navigate('#/setup'); return () => {}; }
  const byId = topicById(nb);
  const chunkById = new Map((nb.notes?.chunks || []).map((c) => [c.id, c]));
  const content = h('div', { class: 'sheet-content' });
  let includeExcerpts = false;

  function openExcerpt(topic, chunkIds) {
    const chunks = (chunkIds || []).map((id) => chunkById.get(id)).filter(Boolean);
    if (!chunks.length) return;
    const dialog = openDialog({
      title: `Original notes · ${topic.name}`,
      wide: true,
      body: h('div', { class: 'dialog-excerpt' },
        h('p', { class: 'small muted', text: 'Only revealed on screen. Not printed unless you explicitly include excerpts.' }),
        chunks.map((chunk) => h('div', { class: 'excerpt-block' },
          h('div', { class: 'excerpt-head' }, h('span', { class: 'excerpt-id', text: chunk.id }), h('span', { class: 'small muted', text: 'verbatim' })),
          h('pre', { class: 'evidence-text', text: chunk.text })))),
    });
    const closeBtn = button('Close', { variant: 'ghost', onClick: () => dialog.close() });
    dialog.el.querySelector('.modal-actions')?.appendChild(closeBtn);
    return dialog;
  }

  function pinControls({ onUp, onDown, onRemove, onLesson, onExcerpt, excerptEnabled, upDisabled, downDisabled }) {
    return h('div', { class: 'pin-controls', 'aria-label': 'Pin controls' },
      h('button', { type: 'button', class: 'icon-btn pin-ctrl', title: 'Move up', 'aria-label': 'Move pin up', disabled: upDisabled, onClick: onUp }, icon('chevronDown', 16, 'flip-up')),
      h('button', { type: 'button', class: 'icon-btn pin-ctrl', title: 'Move down', 'aria-label': 'Move pin down', disabled: downDisabled, onClick: onDown }, icon('chevronDown', 16)),
      onExcerpt ? h('button', { type: 'button', class: 'icon-btn pin-ctrl', title: 'Reveal original notes', 'aria-label': 'Reveal original notes', disabled: !excerptEnabled, onClick: onExcerpt }, icon('eye', 16)) : null,
      h('button', { type: 'button', class: 'icon-btn pin-ctrl', title: 'Open lesson', 'aria-label': 'Open lesson', onClick: onLesson }, icon('book', 16)),
      h('button', { type: 'button', class: 'icon-btn pin-ctrl danger', title: 'Remove pin', 'aria-label': 'Remove pin', onClick: onRemove }, icon('trash', 16)));
  }

  function pinCard(item, index) {
    const isTopic = item.kind === 'topic';
    const topic = item.topic;
    const body = h('div', { class: 'pin-body' });
    if (isTopic) {
      const sheet = item.topic.lesson?.sheet || null;
      const takeaway = sheet?.takeaway || item.topic.lesson?.takeaway || item.topic.lesson?.oneLiner || 'No takeaway recorded.';
      body.appendChild(h('p', { class: 'pin-takeaway', text: takeaway }));
      if (sheet?.formula) body.appendChild(h('div', { class: 'pin-equation' }, mathNode(sheet.formula, sheet.fallback || '', true)));
      if ((sheet?.notes || []).length) {
        body.appendChild(h('ul', { class: 'pin-notes' }, sheet.notes.slice(0, 2).map((n) => h('li', { text: n }))));
      } else if (item.topic.lesson?.notesGaps?.length) {
        body.appendChild(h('ul', { class: 'pin-notes' }, item.topic.lesson.notesGaps.slice(0, 2).map((n) => h('li', { text: n }))));
      }
      body.appendChild(h('div', { class: 'pin-source' },
        sourceChip('vertex'),
        h('span', { class: 'small muted', text: `Topic note · ${item.topic.name}` })));
    } else {
      body.appendChild(h('p', { class: 'pin-takeaway', text: item.pin.text }));
      if (item.pin.equation) body.appendChild(h('div', { class: 'pin-equation' }, mathNode(item.pin.equation, '', true)));
      body.appendChild(h('div', { class: 'pin-source' },
        sourceChip(item.pin.source),
        ...(item.pin.chunkIds || []).map((id) => h('span', { class: 'chip chip-neutral chip-sm', text: id })),
        h('span', { class: 'small muted', text: `From ${item.topic.name}` })));
    }
    if (includeExcerpts && item.chunkIds.length) {
      body.appendChild(h('div', { class: 'print-excerpt' },
        h('p', { class: 'small muted', text: 'Original notes (included in print):' }),
        item.chunkIds.map((id) => chunkById.get(id)).filter(Boolean).slice(0, 1).map((chunk) => h('pre', { class: 'evidence-text', text: chunk.text }))));
    }
    return h('article', { class: `pin-card${isTopic ? ' topic-pin' : ' point-pin'}`, 'data-pin': item.key },
      h('div', { class: 'pin-head' },
        h('span', { class: 'pin-number', text: String(index + 1).padStart(2, '0') }),
        h('div', { class: 'pin-title-wrap' },
          h('h3', { class: 'pin-title', text: item.title }),
          h('div', { class: 'pin-meta' }, isTopic ? coverageChip(item.topic.coverage.status, { small: true }) : h('span', { class: 'badge badge-soft', text: 'Pinned point' }), h('span', { class: 'small muted', text: item.topic.unit }))),
        h('div', { class: 'pin-head-actions' },
          pinControls(item.controls),
          h('button', { type: 'button', class: 'collapse-btn', 'aria-expanded': 'true', 'aria-label': 'Collapse pin', onClick: (e) => {
            const open = body.hidden;
            body.hidden = !open;
            e.currentTarget.setAttribute('aria-expanded', open ? 'true' : 'false');
            e.currentTarget.classList.toggle('collapsed', !open);
            e.currentTarget.replaceChildren(icon(open ? 'chevronDown' : 'chevronRight', 16));
          } }, icon('chevronDown', 16)))),
      body);
  }

  function buildItems() {
    const topicItems = nb.revisionPins.map((id, i) => {
      const topic = byId.get(id);
      if (!topic) return null;
      const chunkIds = topic.coverage?.chunkIds || [];
      return {
        key: `topic-${id}`,
        kind: 'topic',
        topic,
        title: topic.name,
        chunkIds,
        controls: {
          upDisabled: i === 0,
          downDisabled: i === nb.revisionPins.length - 1,
          onUp: () => { moveTopicPin(nb, id, -1); refresh(); },
          onDown: () => { moveTopicPin(nb, id, 1); refresh(); },
          onRemove: () => { toggleTopicPin(nb, id); toast('Topic removed from the sheet.', 'info'); refresh(); ctx.refreshShell?.(); },
          onLesson: () => ctx.navigate(`#/lesson/${id}`),
          onExcerpt: chunkIds.length ? () => openExcerpt(topic, chunkIds) : null,
          excerptEnabled: chunkIds.length > 0,
        },
      };
    }).filter(Boolean);
    const pointItems = (nb.pinPoints || []).map((p, i) => {
      const topic = byId.get(p.topicId);
      if (!topic) return null;
      return {
        key: `point-${p.id}`,
        kind: 'point',
        topic,
        pin: p,
        title: topic.name,
        chunkIds: p.chunkIds || [],
        controls: {
          upDisabled: i === 0,
          downDisabled: i === nb.pinPoints.length - 1,
          onUp: () => { movePoint(nb, p.id, -1); refresh(); },
          onDown: () => { movePoint(nb, p.id, 1); refresh(); },
          onRemove: () => { removePoint(nb, p.id); toast('Pinned point removed.', 'info'); refresh(); ctx.refreshShell?.(); },
          onLesson: () => ctx.navigate(`#/lesson/${p.topicId}`),
          onExcerpt: (p.chunkIds || []).length ? () => openExcerpt(topic, p.chunkIds) : null,
          excerptEnabled: (p.chunkIds || []).length > 0,
        },
      };
    }).filter(Boolean);
    return [...topicItems, ...pointItems];
  }

  function refresh() {
    const items = buildItems();
    const count = items.length;
    const badgeEl = document.getElementById('sheet-live-count');
    if (badgeEl) badgeEl.textContent = String(count);
    content.replaceChildren();

    if (!count) {
      content.appendChild(h('div', { class: 'card sheet-empty' }, emptyState({
        iconName: 'pin',
        title: 'No pins yet.',
        text: 'Open any lesson and pin a takeaway, a step or a pitfall. Only explicit pins build this sheet.',
        action: h('div', { class: 'hero-actions' },
          button('Open coverage', { icon: 'target', onClick: () => ctx.navigate('#/coverage') }),
          button('Browse formulas', { variant: 'ghost', icon: 'sigma', onClick: () => ctx.navigate('#/formulas') })),
      })));
      return;
    }

    content.appendChild(h('div', { class: 'sheet-paper', id: 'sheet-paper' },
      h('div', { class: 'sheet-paper-head' },
        h('div', null,
          h('p', { class: 'kicker', text: 'Vertex revision sheet' }),
          h('h1', { class: 'sheet-title', text: nb.title }),
          h('p', { class: 'sheet-sub', text: `${nb.topics.length} syllabus topics · ${count} pinned point${count === 1 ? '' : 's'}${nb.examDate ? ` · exam ${new Date(nb.examDate + 'T12:00:00').toLocaleDateString()}` : ''}` })),
        h('span', { class: 'sheet-mark', text: '▲' })),
      h('div', { class: 'pins-list' }, items.map(pinCard)),
      h('p', { class: 'sheet-footer-warning', text: 'Check anything here against your textbook — the model can be wrong.' }),
      h('p', { class: 'sheet-footer-note', text: 'Built only from explicit pins. Original excerpts are hidden unless you enable them above, and are never printed by default.' })));

    content.appendChild(h('div', { class: 'sheet-side' },
      h('div', { class: 'card' },
        h('p', { class: 'kicker', text: 'Sheet controls' }),
        h('p', { class: 'small muted', text: 'Pin order is your order. Topic pins come first, then individual pinned points.' }),
        h('label', { class: 'checkbox' },
          (() => { const cb = h('input', { type: 'checkbox', checked: includeExcerpts }); cb.addEventListener('change', () => { includeExcerpts = cb.checked; refresh(); }); return cb; })(),
          h('span', { text: 'Reveal original excerpts on this page' })),
        h('div', { class: 'aside-divider' }),
        h('p', { class: 'small muted', text: 'Printing hides navigation, buttons and background decoration. The footer warning stays.' }),
        button('Print / Save as PDF', { icon: 'printer', block: true, onClick: () => window.print() })),
      h('div', { class: 'card' },
        h('p', { class: 'kicker', text: 'Pins' }),
        h('p', { class: 'small muted', text: `${nb.revisionPins.length} topic pin${nb.revisionPins.length === 1 ? '' : 's'} · ${(nb.pinPoints || []).length} point pin${(nb.pinPoints || []).length === 1 ? '' : 's'}.` }),
        button('Go to coverage', { variant: 'ghost', block: true, icon: 'target', onClick: () => ctx.navigate('#/coverage') }))));
  }

  root.appendChild(h('div', { class: 'page sheet-page' },
    h('div', { class: 'page-head' },
      h('div', null,
        h('p', { class: 'kicker', text: 'Revision sheet' }),
        h('h1', { class: 'page-title', text: 'One page. Everything you chose to keep.' }),
        h('p', { class: 'page-sub', text: 'Pins persist across reloads. Reorder them, remove them, reveal the original passage on screen, then print or save as A4 PDF.' })),
      h('div', { class: 'page-head-actions' },
        h('span', { class: 'badge badge-strong', id: 'sheet-live-count', text: String(nb.revisionPins.length + (nb.pinPoints?.length || 0)) }),
        button('Print sheet', { icon: 'printer', onClick: () => window.print() }))),
    content));

  refresh();
  ctx.refreshShell?.();
  return () => {};
}
