/** formulas.js — searchable formula notebook with local math rendering and pins. */
import {
  h, icon, button, badge, mathNode, emptyState, toast, announce, openDialog, copyText, debounce,
} from '../ui.js';
import { getActiveNotebook, addPoint } from '../state.js';
import { learningRateWidget } from '../charts.js';
import { FORMULAS } from '../seed.js';
import { topicById } from '../shared.js';

export default function renderFormulas(root, ctx) {
  const nb = getActiveNotebook();
  if (!nb) { ctx.navigate('#/setup'); return () => {}; }
  const byId = topicById(nb);
  const state = { query: '', category: 'all', topic: 'all', expanded: new Set() };
  const listHost = h('div', { class: 'formula-grid' });
  const countEl = h('p', { class: 'small muted formula-count' });

  const categories = [...new Set(FORMULAS.map((f) => f.category))];

  function relatedFor(formula) {
    const direct = (formula.topicIds || []).map((id) => byId.get(id)).filter(Boolean);
    if (direct.length) return direct;
    const text = `${formula.name} ${formula.category} ${formula.explanation}`.toLowerCase();
    return nb.topics.filter((t) => {
      const words = t.name.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
      return t.name.length > 4 && (text.includes(t.name.toLowerCase()) || words.some((w) => text.includes(w)));
    });
  }

  function chooseTopic(formula) {
    return new Promise((resolve) => {
      const topics = nb.topics;
      if (!topics.length) { resolve(null); return; }
      const select = h('select', { class: 'select' }, topics.map((t) => h('option', { value: t.id, text: t.name })));
      let settled = false;
      const finish = (v) => { if (settled) return; settled = true; resolve(v); dialog.close(); };
      const dialog = openDialog({
        title: 'Attach this formula to a topic',
        body: h('div', null,
          h('p', { class: 'small muted', text: 'A revision-sheet pin must belong to a topic in this notebook so its source stays traceable.' }),
          h('div', { class: 'field' }, h('label', { text: 'Topic' }), select)),
        actions: [button('Cancel', { variant: 'ghost', onClick: () => finish(null) }), button('Pin formula', { icon: 'pin', onClick: () => finish(select.value) })],
        onClose: () => finish(null),
      });
    });
  }

  async function pinFormula(formula, card) {
    const related = relatedFor(formula);
    let topic = related[0];
    if (!topic) {
      const id = await chooseTopic(formula);
      topic = id ? byId.get(id) : null;
    }
    if (!topic) return;
    const result = addPoint(nb, {
      topicId: topic.id,
      text: formula.explanation,
      equation: formula.latex,
      source: 'vertex',
      chunkIds: [],
      kind: 'formula',
    });
    if (result.added) {
      toast(`Formula pinned to ${topic.name}.`, 'good');
      announce('Formula pinned to the revision sheet.');
      card.querySelector('.pin-formula span')?.replaceChildren(document.createTextNode('Pinned'));
      card.querySelector('.pin-formula')?.classList.add('pinned');
    } else {
      toast('That formula is already pinned.', 'info');
    }
    ctx.refreshShell?.();
  }

  function formulaCard(formula) {
    const expanded = state.expanded.has(formula.id);
    const related = relatedFor(formula);
    const card = h('article', { class: `formula-card card${expanded ? ' expanded' : ''}` },
      h('div', { class: 'formula-head' },
        h('div', null,
          h('div', { class: 'formula-eyebrow' }, badge(formula.category, 'soft'), h('span', { class: 'small muted', text: formula.unit })),
          h('h2', { class: 'formula-name', text: formula.name })),
        h('div', { class: 'formula-actions' },
          h('button', { type: 'button', class: 'icon-btn', title: 'Copy equation', 'aria-label': `Copy ${formula.name} equation`, onClick: async () => {
            const ok = await copyText(formula.latex);
            toast(ok ? 'LaTeX copied.' : 'Copy was blocked by the browser.', ok ? 'good' : 'error');
          } }, icon('copy', 16)),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': expanded ? 'Collapse formula' : 'Expand formula', 'aria-expanded': expanded ? 'true' : 'false', onClick: () => {
            if (expanded) state.expanded.delete(formula.id); else state.expanded.add(formula.id);
            renderList();
          } }, icon(expanded ? 'chevronDown' : 'chevronRight', 16)))),
      h('div', { class: 'formula-equation' }, mathNode(formula.latex, formula.fallback, true)),
      h('p', { class: 'formula-explanation', text: formula.explanation }),
      h('div', { class: 'formula-foot' },
        h('span', { class: 'source-chip source-vertex' }, icon('spark', 12), h('span', { text: 'Vertex reference' })),
        h('div', { class: 'formula-links' },
          related.slice(0, 2).map((t) => h('button', { type: 'button', class: 'link-button small', text: t.name, onClick: () => ctx.navigate(`#/lesson/${t.id}`) })),
          formula.id === 'f-gd' ? h('button', { type: 'button', class: 'link-button small', text: 'Explore α', onClick: () => openGradientDialog() }) : null)),
      expanded ? h('div', { class: 'formula-details' },
        h('div', { class: 'formula-detail-grid' },
          h('div', null,
            h('h4', { text: 'Variables' }),
            h('dl', { class: 'var-list' }, (formula.vars || []).map(([sym, desc]) => h('div', null, h('dt', { text: sym }), h('dd', { text: desc }))))),
          h('div', null, h('h4', { text: 'When to use it' }), h('p', { class: 'small', text: formula.use }))),
        h('div', { class: 'formula-example' }, h('h4', { text: 'Simple example' }), h('p', { class: 'small', text: formula.example })),
        h('div', { class: 'formula-detail-actions' },
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm pin-formula', onClick: () => pinFormula(formula, card) }, icon('pin', 14), h('span', { text: 'Add to revision sheet' })),
          related[0] ? button('Open related lesson', { size: 'sm', variant: 'ghost', icon: 'book', onClick: () => ctx.navigate(`#/lesson/${related[0].id}`) }) : null)) : null);
    return card;
  }

  function openGradientDialog() {
    const widget = learningRateWidget();
    let dialog = null;
    dialog = openDialog({
      title: 'Gradient descent · learning-rate explorer',
      wide: true,
      body: h('div', null,
        widget.node,
        h('p', { class: 'small muted', text: 'This uses f(x) = x² and the actual update xₖ₊₁ = xₖ − α·2xₖ. For this quadratic, α ≥ 1 diverges.' })),
      actions: [button('Close', { variant: 'ghost', onClick: () => dialog.close() })],
      onClose: () => widget.cleanup(),
    });
  }

  function renderList() {
    const q = state.query.trim().toLowerCase();
    const filtered = FORMULAS.filter((f) => {
      if (state.category !== 'all' && f.category !== state.category) return false;
      if (state.topic !== 'all' && !relatedFor(f).some((t) => t.id === state.topic)) return false;
      if (!q) return true;
      return `${f.name} ${f.category} ${f.unit} ${f.explanation} ${f.use} ${f.latex}`.toLowerCase().includes(q);
    });
    listHost.replaceChildren();
    if (!filtered.length) {
      listHost.appendChild(emptyState({ iconName: 'sigma', title: 'No formula matches', text: 'Try a broader search term or clear the filters.', action: button('Reset filters', { size: 'sm', onClick: () => { state.query = ''; state.category = 'all'; state.topic = 'all'; searchInput.value = ''; categorySelect.value = 'all'; topicSelect.value = 'all'; renderList(); } }) }));
    } else {
      filtered.forEach((f) => listHost.appendChild(formulaCard(f)));
    }
    countEl.textContent = `${filtered.length} of ${FORMULAS.length} formulas · ${nb.topics.length} topics in this workspace`;
  }

  const searchInput = h('input', { class: 'input search-input', type: 'search', placeholder: 'Search formulas or variables…', 'aria-label': 'Search formulas' });
  searchInput.addEventListener('input', debounce(() => { state.query = searchInput.value; renderList(); }, 120));
  const categorySelect = h('select', { class: 'select', 'aria-label': 'Filter by category' },
    h('option', { value: 'all', text: 'All categories' }), categories.map((c) => h('option', { value: c, text: c })));
  categorySelect.addEventListener('change', () => { state.category = categorySelect.value; renderList(); });
  const topicSelect = h('select', { class: 'select', 'aria-label': 'Filter by related topic' },
    h('option', { value: 'all', text: 'All topics' }), nb.topics.map((t) => h('option', { value: t.id, text: t.name })));
  topicSelect.addEventListener('change', () => { state.topic = topicSelect.value; renderList(); });

  root.appendChild(h('div', { class: 'page formulas-page' },
    h('div', { class: 'page-head' },
      h('div', null,
        h('p', { class: 'kicker', text: 'Formula Vault' }),
        h('h1', { class: 'page-title', text: 'A formula notebook you can search.' }),
        h('p', { class: 'page-sub', text: 'Definitions, variables, conditions and a simple example — with local KaTeX rendering and a one-click pin to the revision sheet.' })),
      h('div', { class: 'page-head-actions' },
        button('Open revision sheet', { variant: 'ghost', icon: 'clipboard', onClick: () => ctx.navigate('#/sheet') }),
        button('Open coverage', { variant: 'ghost', icon: 'target', onClick: () => ctx.navigate('#/coverage') }))),
    h('section', { class: 'formula-toolbar card' },
      h('div', { class: 'search-wrap' }, icon('search', 18), searchInput),
      h('div', { class: 'toolbar-selects' }, categorySelect, topicSelect),
      h('div', { class: 'toolbar-note' }, h('span', { class: 'small muted', text: 'LaTeX is rendered locally. No CDN and no model call.' }))),
    h('div', { class: 'formula-meta-row' }, countEl,
      h('div', { class: 'formula-tips' }, icon('info', 14), h('span', { class: 'small muted', text: 'Expand a card for variables and an example. Copy gives you the raw LaTeX.' }))),
    listHost));

  renderList();
  ctx.refreshShell?.();
  return () => {};
}
