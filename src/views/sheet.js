/**
 * views/sheet.js — Screen 4 (plan3 §10 + Addendum v4): cards in
 * store.getPins order; each card = real heading + one-sentence takeaway +
 * ONE formula (vendored KaTeX via renderFormula; Unicode fallback on any
 * failure) + up to two short notes + a <details> "View original notes"
 * disclosure holding the cited note passages VERBATIM (no-print — never in
 * the A4 output). Cards for lessons without a sheet block render title +
 * takeaway normally; long equations scroll inside their own block so the
 * 360px page itself never scrolls sideways. Empty state is exactly "Pin a
 * topic from any lesson to start your sheet" with a link back to the map,
 * and "Print / Save as PDF" stays hidden in the empty state. The print
 * stylesheet renders only the sheet title + cards (A4 portrait, black on
 * white, ~12 mm margins, no card split across pages).
 */
import { ROUTES } from '../contracts.js';
import { renderFormula } from '../render.js';

/** Markdown syntax never belongs in card text — strip it where the card is built. */
function plainText(s) {
  return String(s ?? '')
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

const SUBSCRIPTS = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋', '−': '₋', '=': '₌', '(': '₍', ')': '₎', a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ', r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ' };
const SUPERSCRIPTS = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', T: 'ᵀ', n: 'ⁿ', i: 'ⁱ' };
const GREEK = { rho: 'ρ', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', theta: 'θ', lambda: 'λ', sigma: 'σ', tau: 'τ', phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω', nabla: '∇' };

function mapGlyphs(s, table) {
  let out = '';
  for (const ch of s) {
    if (!table[ch]) return null; // one unmappable char leaves the whole token untouched
    out += table[ch];
  }
  return out;
}

// Display-only: ASCII math notation reads as Unicode glyphs in the disclosure.
// Stored note text is never rewritten; code identifiers (my_var) and markdown
// emphasis (_italic_) are left alone by the alnum-before/boundary-after guards.
function prettyMath(text) {
  let s = String(text ?? '');
  s = s.replace(/([A-Za-z0-9)\]}])\^\{([^{}]+)\}(?![A-Za-z0-9])/g, (m, b, inner) => {
    const sup = mapGlyphs(inner, SUPERSCRIPTS);
    return sup ? b + sup : m;
  });
  s = s.replace(/([A-Za-z0-9)\]}])\^([0-9A-Za-z+\-=()])(?![A-Za-z0-9])/g, (m, b, c) => SUPERSCRIPTS[c] ? b + SUPERSCRIPTS[c] : m);
  s = s.replace(/([A-Za-z0-9])_\{([^{}]+)\}(?![A-Za-z0-9])/g, (m, b, inner) => {
    const sub = mapGlyphs(inner, SUBSCRIPTS);
    return sub ? b + sub : m;
  });
  s = s.replace(/([A-Za-z0-9])_([0-9a-z+\-=()])(?![A-Za-z0-9])/g, (m, b, c) => SUBSCRIPTS[c] ? b + SUBSCRIPTS[c] : m);
  s = s.replace(/\b(rho|alpha|beta|gamma|delta|epsilon|theta|lambda|sigma|tau|phi|chi|psi|omega|nabla)\b/g, (m) => GREEK[m]);
  return s;
}

function cardModel(topic, chunks) {
  const lesson = topic.lesson || {};
  const sheet = lesson.sheet && typeof lesson.sheet === 'object' && !Array.isArray(lesson.sheet) ? lesson.sheet : {};
  const takeaway = plainText(sheet.takeaway)
    || plainText(lesson.takeaway || lesson.oneLiner)
    || 'Open the lesson to add a takeaway.';
  const notes = (Array.isArray(sheet.notes) ? sheet.notes : []).map(plainText).filter(Boolean).slice(0, 2);
  const formula = typeof sheet.formula === 'string' && sheet.formula.trim() ? sheet.formula : null;
  const formulaFallback = typeof sheet.formulaFallback === 'string' ? sheet.formulaFallback : '';
  const cov = topic.coverage || {};
  const originals = cov.status === 'not_found' ? [] : (cov.chunkIds || [])
    .map((id) => chunks.find((c) => c && c.id === id))
    .filter(Boolean);
  return { takeaway, notes, formula, formulaFallback, originals };
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
  const chunks = (nb.notes && nb.notes.chunks) || [];

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
    const { takeaway, notes, formula, formulaFallback, originals } = cardModel(topic, chunks);

    const cardEl = h('section', { class: 'sheet-card' });
    cardEl.appendChild(h('h2', { class: 'sheet-card-name', text: topic.name }));
    cardEl.appendChild(h('p', { class: 'sheet-card-takeaway', text: takeaway }));

    if (formula) {
      const formulaEl = h('div', { class: 'sheet-card-formula' });
      cardEl.appendChild(formulaEl);
      // Rendered after mount; the same DOM is what print uses. KaTeX or the
      // Unicode fallback — never raw LaTeX on a failure path.
      void renderFormula(formulaEl, formula, formulaFallback);
    }
    if (notes.length) {
      const ul = h('ul', { class: 'sheet-card-notes' });
      for (const n of notes) ul.appendChild(h('li', { text: n }));
      cardEl.appendChild(ul);
    }
    if (originals.length) {
      const details = h('details', { class: 'sheet-original no-print' });
      details.appendChild(h('summary', { text: 'View original notes' }));
      for (const c of originals) {
        const quote = h('blockquote', { class: 'sheet-original-text' });
        details.appendChild(quote);
        // Verbatim source string through the repo's sanitized markdown path
        // (marked -> DOMPurify), so headings read as headings. Plain-text
        // fallback if the libraries are unavailable. ASCII math notation is
        // normalized to Unicode glyphs for display only — data stays verbatim.
        void ctx.rmd(quote, prettyMath(c.text));
      }
      cardEl.appendChild(details);
    }

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
