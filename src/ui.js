/**
 * ui.js — DOM helpers, icons, dialogs, toasts, chips and math rendering.
 * No innerHTML. Charts and pages build nodes with h().
 */
import { STATUS_META } from './core.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function h(tag, attrs, ...children) {
  const node = document.createElement(tag);
  if (attrs && typeof attrs === 'object' && !(attrs instanceof Node)) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class' || k === 'className') node.className = String(v);
      else if (k === 'text') node.textContent = String(v);
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k === 'on' && typeof v === 'object') {
        for (const [ev, fn] of Object.entries(v)) if (typeof fn === 'function') node.addEventListener(ev, fn);
      } else if (k === 'value') node.value = v;
      else if (k === 'checked' || k === 'selected' || k === 'disabled' || k === 'hidden' || k === 'multiple') node[k] = !!v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else node.setAttribute(k, String(v));
    }
  } else if (attrs !== null && attrs !== undefined) {
    children.unshift(attrs);
  }
  append(node, children);
  return node;
}

export function append(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    node.setAttribute(k, String(v));
  }
  return node;
}

export function svgText(text, attrs = {}) {
  const node = svg('text', attrs);
  node.textContent = text;
  return node;
}

const ICONS = {
  arrow: ['M5 12h14', 'M13 6l6 6-6 6'],
  arrowUpRight: ['M7 17L17 7', 'M8 7h9v9'],
  chevronDown: ['M6 9l6 6 6-6'],
  chevronLeft: ['M15 18l-6-6 6-6'],
  chevronRight: ['M9 6l6 6-6 6'],
  check: ['M20 6L9 17l-5-5'],
  dash: ['M6 12h12'],
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.3-4.3'],
  close: ['M18 6L6 18', 'M6 6l12 12'],
  plus: ['M12 5v14', 'M5 12h14'],
  home: ['M3 11l9-8 9 8', 'M5 10v10h14V10'],
  grid: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M3 14h7v7H3z', 'M14 14h7v7h-7z'],
  book: ['M4 19.5A2.5 2.5 0 0 1 6.5 17H20', 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'],
  target: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z', 'M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'],
  clipboard: ['M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2', 'M9 3h6v4H9z', 'M9 12h6', 'M9 16h4'],
  calendar: ['M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14H4z', 'M8 2v4', 'M16 2v4', 'M4 10h16'],
  chart: ['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M22 20H2'],
  sigma: ['M18 4H6l6 8-6 8h12'],
  pin: ['M12 17v5', 'M8 3h8l-1 6 3 3v2H6v-2l3-3z'],
  settings: ['M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'],
  bell: ['M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9', 'M10 21h4'],
  user: ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'],
  menu: ['M3 6h18', 'M3 12h18', 'M3 18h18'],
  play: ['M8 5v14l11-7z'],
  spark: ['M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z', 'M19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9z'],
  clock: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 6v6l4 2'],
  copy: ['M9 9h11v11H9z', 'M5 15H4V4h11v1'],
  download: ['M12 3v12', 'M7 10l5 5 5-5', 'M4 21h16'],
  trash: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 15H6L5 6', 'M10 11v6', 'M14 11v6'],
  printer: ['M6 9V3h12v6', 'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2', 'M6 14h12v7H6z'],
  info: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 16v-5', 'M12 8h.01'],
  lock: ['M5 11h14v10H5z', 'M8 11V7a4 4 0 0 1 8 0v4'],
  layers: ['M12 2l9 5-9 5-9-5z', 'M3 12l9 5 9-5', 'M3 17l9 5 9-5'],
  compass: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M16.2 7.8l-2.1 6.3-6.3 2.1 2.1-6.3z'],
  refresh: ['M21 12a9 9 0 1 1-2.6-6.4', 'M21 3v6h-6'],
  external: ['M14 3h7v7', 'M10 14L21 3', 'M21 14v7H3V3h7'],
  filter: ['M3 5h18l-7 8v6l-4 2v-8z'],
  eye: ['M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  flame: ['M12 22c4 0 7-3 7-7 0-5-4-7-4-11-3 2-4 5-4 7-2-1-2-3-2-4-2 3-4 5-4 8 0 4 3 7 7 7z'],
  pause: ['M8 4h3v16H8z', 'M13 4h3v16h-3z'],
};

export function icon(name, size = 18, cls = '') {
  const node = svg('svg', {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round',
    'stroke-linejoin': 'round', 'aria-hidden': 'true', class: `icon ${cls}`.trim(),
  });
  for (const d of ICONS[name] || ICONS.info) node.appendChild(svg('path', { d }));
  return node;
}

/* -------------------------------------------------------------------------- */
/* chips + text                                                                */
/* -------------------------------------------------------------------------- */

export function coverageChip(status, opts = {}) {
  const meta = STATUS_META[status] || STATUS_META.not_found;
  return h('span', { class: `chip chip-${status}${opts.small ? ' chip-sm' : ''}` },
    icon(meta.icon, opts.small ? 12 : 14), h('span', { text: meta.label }));
}

export function sourceChip(source) {
  const notes = source === 'notes';
  return h('span', { class: `source-chip ${notes ? 'source-notes' : 'source-vertex'}` },
    icon(notes ? 'book' : 'spark', 12), h('span', { text: notes ? 'From your notes' : 'Vertex explanation' }));
}

export function badge(text, kind = 'neutral') {
  return h('span', { class: `badge badge-${kind}`, text });
}

export function weightBadge(weight) {
  return h('span', { class: 'weight-badge', title: `Exam weight ${weight} of 5`, 'aria-label': `Exam weight ${weight} of 5` },
    h('span', { class: 'weight-dots', 'aria-hidden': 'true' },
      [1, 2, 3, 4, 5].map((i) => h('i', { class: i <= weight ? 'on' : '' }))),
    h('span', { class: 'weight-text', text: `W${weight}` }));
}

export function md(text) {
  const wrap = h('span', { class: 'md' });
  const raw = String(text ?? '');
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  for (const m of raw.matchAll(re)) {
    if (m.index > last) wrap.appendChild(document.createTextNode(raw.slice(last, m.index)));
    const token = m[0];
    if (token.startsWith('**')) wrap.appendChild(h('strong', { text: token.slice(2, -2) }));
    else if (token.startsWith('`')) wrap.appendChild(h('code', { text: token.slice(1, -1) }));
    else wrap.appendChild(h('em', { text: token.slice(1, -1) }));
    last = m.index + token.length;
  }
  if (last < raw.length) wrap.appendChild(document.createTextNode(raw.slice(last)));
  return wrap;
}

/* -------------------------------------------------------------------------- */
/* math                                                                        */
/* -------------------------------------------------------------------------- */

let katexPromise = null;

export function ensureKatex() {
  if (window.katex && typeof window.katex.render === 'function') return Promise.resolve(window.katex);
  if (katexPromise) return katexPromise;
  katexPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'vendor/katex/katex.min.js';
    script.async = true;
    script.onload = () => resolve(window.katex);
    script.onerror = () => reject(new Error('KaTeX unavailable'));
    document.head.appendChild(script);
  });
  return katexPromise;
}

export function texToUnicode(tex) {
  return String(tex || '')
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
    .replace(/\\sqrt\{([^{}]+)\}/g, '√($1)')
    .replace(/\\left|\\right/g, '')
    .replace(/\\mathbb\{R\}/g, 'ℝ')
    .replace(/\\nabla/g, '∇').replace(/\\alpha/g, 'α').replace(/\\beta/g, 'β')
    .replace(/\\lambda/g, 'λ').replace(/\\varepsilon/g, 'ε').replace(/\\epsilon/g, 'ε')
    .replace(/\\Delta/g, 'Δ').replace(/\\delta/g, 'δ').replace(/\\partial/g, '∂')
    .replace(/\\sum/g, 'Σ').replace(/\\prod/g, 'Π').replace(/\\cdot/g, '·')
    .replace(/\\times/g, '×').replace(/\\le/g, '≤').replace(/\\ge/g, '≥')
    .replace(/\\approx/g, '≈').replace(/\\to/g, '→').replace(/\\infty/g, '∞')
    .replace(/\\top/g, 'ᵀ').replace(/\\succ/g, '≻').replace(/\\prec/g, '≺')
    .replace(/\\lVert|\\rVert|\\\|/g, '‖').replace(/\\quad|\\qquad/g, '  ')
    .replace(/\\text\{([^{}]+)\}/g, '$1')
    .replace(/\^\{([^{}]+)\}/g, '^($1)').replace(/_\{([^{}]+)\}/g, '_($1)')
    .replace(/\\[a-zA-Z]+/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function mathNode(tex, fallback = '', display = false) {
  const node = h('span', { class: `math-node${display ? ' math-display' : ''}`, text: fallback || texToUnicode(tex) });
  ensureKatex().then((katex) => {
    if (!node.isConnected || !katex) return;
    try {
      katex.render(String(tex), node, { output: 'mathml', displayMode: !!display, throwOnError: true });
      node.classList.add('math-ready');
    } catch {
      node.textContent = fallback || texToUnicode(tex);
    }
  }).catch(() => { /* unicode fallback stays */ });
  return node;
}

/* -------------------------------------------------------------------------- */
/* buttons, empty states                                                       */
/* -------------------------------------------------------------------------- */

export function button(label, opts = {}) {
  const n = h('button', {
    type: opts.type || 'button',
    class: `btn ${opts.variant ? 'btn-' + opts.variant : 'btn-primary'}${opts.size ? ' btn-' + opts.size : ''}${opts.block ? ' btn-block' : ''}${opts.class ? ' ' + opts.class : ''}`,
    'aria-label': opts.ariaLabel || undefined,
    disabled: opts.disabled,
  });
  if (opts.icon) n.appendChild(icon(opts.icon, opts.iconSize || 16));
  n.appendChild(h('span', { text: label }));
  if (opts.trailingIcon) n.appendChild(icon(opts.trailingIcon, 16));
  if (typeof opts.onClick === 'function') n.addEventListener('click', opts.onClick);
  return n;
}

export function iconButton(name, label, onClick, opts = {}) {
  const n = h('button', {
    type: 'button',
    class: `icon-btn${opts.class ? ' ' + opts.class : ''}`,
    'aria-label': label,
    title: opts.title || label,
  }, icon(name, opts.size || 18));
  if (onClick) n.addEventListener('click', onClick);
  return n;
}

export function emptyState({ iconName = 'compass', title, text, action }) {
  return h('div', { class: 'empty-state' },
    h('span', { class: 'empty-icon' }, icon(iconName, 26)),
    h('h3', { text: title }),
    h('p', { class: 'muted', text }),
    action || null);
}

export function sectionHead(kicker, title, text, extra) {
  return h('div', { class: 'section-head' },
    h('div', null,
      kicker ? h('p', { class: 'kicker', text: kicker }) : null,
      h('h2', { class: 'section-title', text: title }),
      text ? h('p', { class: 'section-sub', text }) : null),
    extra || null);
}

export function spinner(size = 18) {
  return h('span', { class: 'spinner', style: { width: size + 'px', height: size + 'px' }, 'aria-hidden': 'true' });
}

export function setBusy(btn, busy, label) {
  if (!btn) return;
  btn.disabled = !!busy;
  btn.classList.toggle('is-busy', !!busy);
  if (label) {
    btn.querySelector('span:last-child').textContent = label;
  }
  if (busy) btn.prepend(spinner(14));
  else btn.querySelector('.spinner')?.remove();
}

/* -------------------------------------------------------------------------- */
/* toast + live region                                                         */
/* -------------------------------------------------------------------------- */

export function toast(message, kind = 'info') {
  const cont = document.getElementById('toast-container');
  if (!cont) return;
  const el = h('div', { class: `toast toast-${kind}` },
    icon(kind === 'error' ? 'info' : kind === 'good' ? 'check' : 'spark', 16),
    h('span', { text: String(message) }));
  cont.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  const ms = kind === 'error' ? 8000 : 3800;
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 260);
  }, ms);
  while (cont.childElementCount > 4) cont.firstElementChild.remove();
}

export function announce(message) {
  const region = document.getElementById('live-region');
  if (!region) return;
  region.textContent = '';
  requestAnimationFrame(() => { region.textContent = String(message); });
}

/* -------------------------------------------------------------------------- */
/* dialogs                                                                     */
/* -------------------------------------------------------------------------- */

let dialogSeq = 0;
let openDialogs = 0;

export function openDialog({ title, body, actions = [], wide = false, className = '', onClose = null }) {
  const root = document.getElementById('modal-root');
  if (!root) return { close() {} };
  const previous = document.activeElement;
  const id = 'dialog-title-' + (++dialogSeq);
  openDialogs += 1;
  document.body.classList.add('modal-open');
  const panel = h('div', {
    class: `modal${wide ? ' modal-wide' : ''}${className ? ' ' + className : ''}`,
    role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id, tabindex: '-1',
  });
  const closeBtn = iconButton('close', 'Close dialog', () => close());
  panel.appendChild(h('div', { class: 'modal-head' },
    h('h2', { class: 'modal-title', id, text: title }),
    closeBtn));
  const bodyEl = h('div', { class: 'modal-body' });
  append(bodyEl, [body]);
  panel.appendChild(bodyEl);
  if (actions.length) {
    panel.appendChild(h('div', { class: 'modal-actions' }, actions));
  }
  const backdrop = h('div', { class: 'modal-backdrop' }, panel);
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusables = [...panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter((n) => !n.disabled && n.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    backdrop.classList.add('closing');
    openDialogs = Math.max(0, openDialogs - 1);
    if (openDialogs === 0) document.body.classList.remove('modal-open');
    setTimeout(() => backdrop.remove(), 180);
    if (previous && typeof previous.focus === 'function') previous.focus();
    if (typeof onClose === 'function') onClose();
  }
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', onKey);
  root.appendChild(backdrop);
  requestAnimationFrame(() => {
    backdrop.classList.add('open');
    const focusTarget = panel.querySelector('input, textarea, select, button:not(.icon-btn)') || panel;
    focusTarget.focus();
  });
  return { el: panel, close };
}

export function confirmDialog({ title, text, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => {
      if (settled) return;
      settled = true;
      resolve(v);
      dialog.close();
    };
    const dialog = openDialog({
      title,
      body: h('p', { class: 'muted', text }),
      actions: [
        button('Cancel', { variant: 'ghost', onClick: () => finish(false) }),
        button(confirmLabel, { variant: danger ? 'danger' : 'primary', onClick: () => finish(true) }),
      ],
      onClose: () => finish(false),
    });
  });
}

/* -------------------------------------------------------------------------- */
/* misc                                                                        */
/* -------------------------------------------------------------------------- */

export function debounce(fn, ms = 180) {
  let t = 0;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch { return false; }
  }
}

export function avatarNode(profile, size = 'md') {
  const name = profile?.name || 'Guest';
  return h('span', { class: `avatar avatar-${size}`, 'aria-hidden': 'true', text: profile?.avatar || name.slice(0, 1).toUpperCase() });
}

export function srTable(caption, headers, rows) {
  return h('div', { class: 'sr-only' },
    h('table', null,
      h('caption', { text: caption }),
      h('thead', null, h('tr', null, headers.map((x) => h('th', { scope: 'col', text: x })))),
      h('tbody', null, rows.map((r) => h('tr', null, r.map((x) => h('td', { text: String(x) })))))));
}

export function progressBar(value, max, label) {
  const percent = max ? Math.round((value / max) * 100) : 0;
  return h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(max), 'aria-valuenow': String(value), 'aria-label': label || 'Progress' },
    h('span', { class: 'progress-fill', style: { width: percent + '%' } }));
}
