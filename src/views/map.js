/**
 * views/map.js — Screen 2 (plan3 §10): six rows in notebook order, one
 * status chip per row (covered → Explained, thin → Only mentioned,
 * not_found → No match found — each chip carries text + icon), ONE action
 * per row ("Open lesson"), and on matched rows "View excerpt" which opens
 * the exact note text (toggles to "Hide excerpt"; opening one closes the
 * previous). Absent rows read "No matching passage in these notes."
 * Excerpts appear below the row on mobile and beside the list on wide
 * screens. Ratings, prereq banners and plan-header math are removed from
 * the flow (plan3 §4); the underlying data fields stay untouched.
 */
import { ROUTES } from '../contracts.js';
import { icon } from '../render.js';

const CHIP = {
  covered: { label: 'Explained', icon: 'check' },
  thin: { label: 'Only mentioned', icon: 'short-line' },
  not_found: { label: 'No match found', icon: 'search' },
};

function statusChip(h, status) {
  const chip = CHIP[status] || CHIP.not_found;
  return h('span', { class: 'chip chip-' + (CHIP[status] ? status : 'not_found') }, [
    icon(chip.icon),
    h('span', { text: chip.label }),
  ]);
}

export async function render(container, ctx) {
  const { h, state } = ctx;
  const nb = state.notebook;

  if (!nb) {
    const card = h('div', { class: 'card empty-card' }, [
      h('h2', { class: 'card-title', text: 'No notebook yet.' }),
      h('p', { class: 'muted', text: 'Try the curated demo or paste your own notes — both live on the setup screen.' }),
    ]);
    const b1 = h('button', { type: 'button', class: 'btn btn-primary', text: 'Go to setup' });
    b1.addEventListener('click', () => ctx.navigate(ROUTES.SETUP));
    card.appendChild(b1);
    container.appendChild(card);
    return;
  }

  const hasSyllabus = !!(nb.syllabus && String(nb.syllabus.raw || '').trim());
  const isDemo = nb.id === 'nb-numopt-demo' || /demo/i.test(String(nb.id || '') + ' ' + String(nb.title || ''));

  /* ---- header: no budget math, no ratings (plan3 §4) ---- */
  const head = h('div', { class: 'page-head' });
  head.appendChild(h('h1', {
    class: 'page-title',
    text: hasSyllabus ? 'Your coverage' : 'Topics detected from your notes',
  }));
  head.appendChild(h('p', {
    class: 'page-sub muted',
    text: hasSyllabus
      ? 'How much of your syllabus these notes actually explain.'
      : 'A coverage map against an exam syllabus needs a syllabus — add one on the setup screen for a gap list.',
  }));
  if (isDemo) head.appendChild(h('p', { class: 'demo-label', text: 'Demo notebook — curated demo' }));
  container.appendChild(head);

  /* ---- prefetch banner (live path only) ---- */
  if (state.prefetch && state.prefetch.active) {
    const banner = h('div', { class: 'progress-panel', role: 'status', 'aria-live': 'polite' }, [
      h('span', { text: 'Preparing first lessons… (' + state.prefetch.done + ' of ' + state.prefetch.total + ' ready) — the rest prepare when you open them.' }),
    ]);
    const cancel = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Cancel' });
    cancel.addEventListener('click', ctx.actions.cancelBuild);
    banner.appendChild(cancel);
    container.appendChild(banner);
  }

  /* ---- two-pane layout: list + wide-screen excerpt panel ---- */
  const layout = h('div', { class: 'map-layout' });
  const list = h('div', { class: 'map-list', role: 'list' });
  const panel = h('aside', {
    class: 'excerpt-panel card', id: 'excerpt-panel', hidden: true,
    role: 'complementary', 'aria-label': 'Matched note excerpt',
  });
  const panelTitle = h('h2', { class: 'card-title', id: 'excerpt-panel-title' });
  const panelClose = h('button', { type: 'button', class: 'icon-btn excerpt-close', 'aria-label': 'Hide excerpt' }, ['×']);
  panel.appendChild(panelTitle);
  panel.appendChild(panelClose);
  const panelBody = h('div', { class: 'excerpt-panel-body' });
  panel.appendChild(panelBody);

  const wideQuery = window.matchMedia('(min-width: 900px)');
  let openTopicId = null;
  let openToggleBtn = null;

  function closeOpen() {
    if (!openTopicId) return;
    const node = panelBody.firstChild;
    if (node) node.remove();
    panel.hidden = true;
    if (openToggleBtn) {
      openToggleBtn.textContent = 'View excerpt';
      openToggleBtn.setAttribute('aria-expanded', 'false');
    }
    openTopicId = null;
    openToggleBtn = null;
  }

  panelClose.addEventListener('click', closeOpen);

  function excerptNodeFor(topic) {
    const wrap = h('div', { class: 'excerpt-body' });
    wrap.appendChild(h('p', { class: 'excerpt-source', text: 'From your notes' }));
    const chunks = (nb.notes && nb.notes.chunks) || [];
    const hits = (topic.coverage.chunkIds || [])
      .map((id) => chunks.find((c) => c && c.id === id))
      .filter(Boolean);
    if (!hits.length) {
      wrap.appendChild(h('p', { class: 'muted', text: 'No matching passage in these notes.' }));
    }
    for (const c of hits) {
      wrap.appendChild(h('blockquote', { class: 'excerpt-text' }, [h('p', { text: c.text })]));
    }
    return wrap;
  }

  function openExcerpt(topic, toggleBtn, rowEl) {
    const wasOpen = openTopicId === topic.id;
    closeOpen();
    if (wasOpen) return; // second click just closes
    const node = excerptNodeFor(topic);
    openTopicId = topic.id;
    openToggleBtn = toggleBtn;
    toggleBtn.textContent = 'Hide excerpt';
    toggleBtn.setAttribute('aria-expanded', 'true');
    if (wideQuery.matches) {
      panelTitle.textContent = topic.name;
      panelBody.appendChild(node);
      panel.hidden = false;
      panel.scrollIntoView({ block: 'nearest' });
    } else {
      rowEl.appendChild(node);
    }
  }

  // Moving between breakpoints: re-home the one open excerpt.
  function onBreakpoint() {
    if (!openTopicId) return;
    const topic = nb.topics.find((t) => t.id === openTopicId);
    const btn = openToggleBtn;
    const row = list.querySelector('.map-row[data-topic="' + openTopicId + '"]');
    const node = panelBody.firstChild || (row && row.querySelector('.excerpt-body'));
    if (node) node.remove();
    panel.hidden = true;
    openTopicId = null;
    openToggleBtn = null;
    if (topic && btn && row) openExcerpt(topic, btn, row);
  }
  if (wideQuery.addEventListener) wideQuery.addEventListener('change', onBreakpoint);
  else wideQuery.addListener(onBreakpoint); // Safari ≤13 safety; detached in cleanup

  /* ---- rows, in notebook order ---- */
  nb.topics.forEach((topic) => {
    const cov = topic.coverage || { status: 'not_found', chunkIds: [] };
    const matched = cov.status === 'covered' || cov.status === 'thin';

    const row = h('div', { class: 'map-row card', role: 'listitem', dataset: { topic: topic.id } });

    const headRow = h('div', { class: 'row-head' });
    headRow.appendChild(h('div', { class: 'row-title-wrap' }, [
      h('h2', { class: 'topic-name', text: topic.name }),
      h('p', { class: 'row-unit muted', text: topic.unit || '' }),
    ]));
    headRow.appendChild(statusChip(h, cov.status));
    row.appendChild(headRow);

    if (!matched) {
      row.appendChild(h('p', { class: 'row-absent', text: 'No matching passage in these notes.' }));
    }

    const actionsWrap = h('div', { class: 'row-actions' });
    const openBtn = h('button', {
      type: 'button', class: 'btn btn-lesson',
      'aria-label': 'Open lesson: ' + topic.name,
    }, [h('span', { text: 'Open lesson' }), icon('arrow')]);
    openBtn.addEventListener('click', () => ctx.navigate(ROUTES.LESSON_PREFIX + topic.id));
    actionsWrap.appendChild(openBtn);

    if (matched) {
      const excerptBtn = h('button', {
        type: 'button', class: 'btn btn-ghost btn-sm excerpt-toggle',
        'aria-expanded': 'false', text: 'View excerpt',
      });
      excerptBtn.addEventListener('click', () => openExcerpt(topic, excerptBtn, row));
      actionsWrap.appendChild(excerptBtn);
    }
    row.appendChild(actionsWrap);

    list.appendChild(row);
  });

  layout.appendChild(list);
  layout.appendChild(panel);
  container.appendChild(layout);

  /* ---- bottom: sheet entry ---- */
  const pins = ctx.actions.getPins();
  const sheetBtn = h('button', { type: 'button', class: 'btn btn-primary', id: 'btn-sheet', text: 'Open revision sheet' });
  sheetBtn.addEventListener('click', () => ctx.navigate(ROUTES.SHEET));
  const sheetNote = h('span', { class: 'muted', text: pins.length + ' topic' + (pins.length === 1 ? '' : 's') + ' pinned' });
  container.appendChild(h('div', { class: 'btn-row map-cta' }, [sheetBtn, sheetNote]));

  container.appendChild(h('p', { class: 'footnote muted', text: 'Explained and Only mentioned are estimates from your notes — open a lesson even when the match looks weak. No match found describes the search, not the exam.' }));

  /* cleanup: drop the breakpoint listener when leaving the view */
  return () => {
    try {
      if (wideQuery.removeEventListener) wideQuery.removeEventListener('change', onBreakpoint);
      else wideQuery.removeListener(onBreakpoint);
    } catch (err) {
      console.warn('map.js: breakpoint listener cleanup failed —', err.message);
    }
  };
}
