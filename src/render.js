/**
 * render.js — the ONLY module in Vertex that touches `innerHTML`, and only
 * with DOMPurify-sanitized strings (plan §6.8). It is also the only module
 * that loads CDN libraries: pinned versions + real SRI hashes +
 * crossorigin="anonymous". Every load failure degrades to plain text —
 * never a blank screen, never raw model HTML.
 *
 * Pipeline for model markdown:  marked.parse → DOMPurify.sanitize → DOM
 * (+ KaTeX pass for $…$ / $$…$$ if present). Mermaid runs with
 * securityLevel:"strict" and is removed on any failure. Plots are built
 * by our own code with document.createElementNS — no chart library.
 */

// Pinned CDN assets with sha384 SRI hashes computed from the exact files
// (2026-11-10, via crypto: sha384 of the downloaded bytes).
const CDN = Object.freeze({
  marked: {
    global: 'marked',
    url: 'https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js',
    integrity: 'sha384-/TQbtLCAerC3jgaim+N78RZSDYV7ryeoBCVqTuzRrFec2akfBkHS7ACQ3PQhvMVi',
  },
  dompurify: {
    global: 'DOMPurify',
    url: 'https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js',
    integrity: 'sha384-+VfUPEb0PdtChMwmBcBmykRMDd+v6D/oFmB3rZM/puCMDYcIvF968OimRh4KQY9a',
  },
  katex: {
    global: 'katex',
    url: 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js',
    integrity: 'sha384-7zkQWkzuo3B5mTepMUcHkMB5jZaolc2xDwL6VFqjFALcbeS9Ggm/Yr2r3Dy4lfFg',
  },
  katexCss: {
    url: 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css',
    integrity: 'sha384-nB0miv6/jRmo5UMMR1wu3Gz6NLsoTkbqJghGIsx//Rlm+ZU03BU6SQNC66uf4l5+',
  },
  mermaid: {
    global: 'mermaid',
    url: 'https://cdn.jsdelivr.net/npm/mermaid@10.9.3/dist/mermaid.min.js',
    integrity: 'sha384-R63zfMfSwJF4xCR11wXii+QUsbiBIdiDzDbtxia72oGWfkT7WHJfmD/I/eeHPJyT',
  },
});

/** key -> Promise<boolean>; failure resolves false (never rejects). */
const libCache = new Map();

function injectLib(key) {
  const spec = CDN[key];
  if (!spec) return Promise.resolve(false);
  if (spec.global && typeof window[spec.global] !== 'undefined') return Promise.resolve(true);
  return new Promise((resolve, reject) => {
    let node;
    if (key === 'katexCss') {
      node = document.createElement('link');
      node.rel = 'stylesheet';
      node.href = spec.url;
      node.integrity = spec.integrity;
      node.crossOrigin = 'anonymous';
      node.onload = () => resolve(true);
      node.onerror = () => reject(new Error('Failed to load ' + spec.url));
    } else {
      node = document.createElement('script');
      node.src = spec.url;
      node.async = true;
      node.integrity = spec.integrity;
      node.crossOrigin = 'anonymous';
      node.onload = () => resolve(typeof window[spec.global] !== 'undefined');
      node.onerror = () => reject(new Error('Failed to load ' + spec.url));
    }
    document.head.appendChild(node);
  });
}

function loadLib(key) {
  if (!libCache.has(key)) {
    libCache.set(key, injectLib(key).catch((err) => {
      console.warn('render.js: CDN load failed for', key, '-', err.message);
      return false;
    }));
  }
  return libCache.get(key);
}

function appendPlainText(el, text) {
  el.replaceChildren(document.createTextNode(String(text ?? '')));
}

/* ---------------------------------------------------------------------- */
/* Markdown                                                                */
/* ---------------------------------------------------------------------- */

/** True when the source contains a plausible $…$ / $$…$$ math span. */
function hasMath(text) {
  return /\$\S[\s\S]*?\$/.test(text);
}

/**
 * renderSafeMarkdown(el, md) — model text in, sanitized DOM out.
 * Async because marked/DOMPurify load lazily. On any library failure the
 * markdown is appended as a plain text node (readable, never blank).
 */
export async function renderSafeMarkdown(el, md) {
  const text = String(md ?? '');
  el.replaceChildren();
  if (!text) return el;

  const [okMarked, okPurify] = await Promise.all([loadLib('marked'), loadLib('dompurify')]);
  if (!okMarked || !okPurify) {
    appendPlainText(el, text);
    return el;
  }

  let html;
  try {
    html = String(window.marked.parse(text, { async: false, gfm: true, breaks: false }));
  } catch (err) {
    console.warn('render.js: marked.parse failed —', err.message);
    appendPlainText(el, text);
    return el;
  }

  let clean;
  try {
    clean = String(window.DOMPurify.sanitize(html, { RETURN_TRUSTED_TYPE: false }));
  } catch (err) {
    console.warn('render.js: DOMPurify failed —', err.message);
    appendPlainText(el, text);
    return el;
  }

  const tmp = document.createElement('div');
  tmp.innerHTML = clean; // the only innerHTML sink for model text, post-sanitize
  while (tmp.firstChild) el.appendChild(tmp.firstChild);

  if (hasMath(text)) {
    const [okKatex] = await Promise.all([loadLib('katex'), loadLib('katexCss')]);
    if (okKatex) {
      try {
        typesetMath(el);
      } catch (err) {
        // Graceful per spec: KaTeX absent/broken → keep the original $…$ text.
        console.warn('render.js: KaTeX pass skipped —', err.message);
      }
    }
  }
  return el;
}

const MATH_RE = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;

/** Walk text nodes and replace $…$ spans with rendered KaTeX. */
function typesetMath(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const targets = [];
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (n.nodeValue && n.nodeValue.includes('$')) targets.push(n);
  }
  for (const node of targets) {
    if (!node.parentNode) continue; // replaced by an earlier pass
    if (node.parentElement && node.parentElement.closest('.katex')) continue;
    const s = node.nodeValue;
    let m;
    let last = 0;
    let frag = null;
    MATH_RE.lastIndex = 0;
    while ((m = MATH_RE.exec(s)) !== null) {
      if (!frag) frag = document.createDocumentFragment();
      frag.appendChild(document.createTextNode(s.slice(last, m.index)));
      const display = m[1] !== undefined;
      const tex = display ? m[1] : m[2];
      let replaced = false;
      try {
        const rendered = window.katex.renderToString(tex, { displayMode: display, throwOnError: false });
        if (window.DOMPurify) {
          const clean = String(window.DOMPurify.sanitize(rendered));
          const holder = document.createElement(display ? 'div' : 'span');
          holder.innerHTML = clean; // sanitized KaTeX output
          holder.className = 'katex-holder';
          frag.appendChild(holder);
          replaced = true;
        }
      } catch (err) {
        console.warn('render.js: KaTeX render skipped for one span —', err.message);
      }
      if (!replaced) frag.appendChild(document.createTextNode(m[0])); // keep raw $…$
      last = m.index + m[0].length;
    }
    if (frag) {
      frag.appendChild(document.createTextNode(s.slice(last)));
      node.parentNode.replaceChild(frag, node);
    }
  }
}

/* ---------------------------------------------------------------------- */
/* Mermaid                                                                 */
/* ---------------------------------------------------------------------- */

let mermaidSeq = 0;

/**
 * renderMermaid(el, src) — lazy-load, securityLevel "strict".
 * On ANY failure (CDN, parse, sanitize) the block is removed, per spec:
 * the diagram is P1 garnish, never a broken frame.
 */
export async function renderMermaid(el, src) {
  try {
    if (!src || typeof src !== 'string') {
      el.remove();
      return;
    }
    const [okMermaid, okPurify] = await Promise.all([loadLib('mermaid'), loadLib('dompurify')]);
    if (!okMermaid || !okPurify) {
      el.remove();
      return;
    }
    window.mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: el.dataset.mermaidTheme === 'neutral' ? 'neutral' : 'dark',
      flowchart: { htmlLabels: false },
    });
    const id = 'vx-mermaid-' + (++mermaidSeq);
    const out = await window.mermaid.render(id, String(src));
    const svg = out && out.svg;
    if (!svg) {
      el.remove();
      return;
    }
    const clean = String(window.DOMPurify.sanitize(svg));
    const holder = document.createElement('div');
    holder.className = 'mermaid-svg';
    holder.innerHTML = clean; // sanitized Mermaid SVG
    el.replaceChildren(holder);
    const stray = document.getElementById('d-' + id);
    if (stray) stray.remove();
  } catch (err) {
    console.warn('render.js: Mermaid block removed —', err.message);
    el.remove();
  }
}

/* ---------------------------------------------------------------------- */
/* Own-SVG plot from computed trace rows (F14, no libraries)               */
/* ---------------------------------------------------------------------- */

const PLOT_PALETTE = ['#FF7A1A', '#3ecf8e', '#5aa2ff', '#d86bff', '#ffd166', '#ff5b5b'];
const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(name, attrs) {
  const node = document.createElementNS(SVG_NS, name);
  for (const k of Object.keys(attrs)) node.setAttribute(k, String(attrs[k]));
  return node;
}

function cellNumber(row, j) {
  const v = row[j];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (Array.isArray(v) && typeof v[0] === 'number' && Number.isFinite(v[0])) return v[0];
  return null;
}

function tickText(v) {
  if (Math.abs(v) >= 1000) return String(Math.round(v));
  if (Number.isInteger(v)) return String(v);
  return String(Math.round(v * 10000) / 10000);
}

/**
 * renderPlot(el, trace) — line chart of numeric trace columns.
 * First numeric column → x axis; each other numeric column → one series.
 * Pure DOM via createElementNS; degrades to a text note, never blank.
 */
export function renderPlot(el, trace) {
  el.replaceChildren();
  const rows = trace && trace.result && Array.isArray(trace.result.rows) ? trace.result.rows : [];
  const cols = trace && trace.result && Array.isArray(trace.result.columns) ? trace.result.columns : [];
  const numericIdx = [];
  for (let j = 0; j < cols.length; j++) {
    let hits = 0;
    for (const r of rows) if (cellNumber(r, j) !== null) hits++;
    if (hits >= Math.min(2, rows.length)) numericIdx.push(j);
  }
  if (rows.length < 2 || numericIdx.length < 2) {
    appendPlainText(el, 'Not enough numeric columns in this trace to plot.');
    return;
  }

  const xIdx = numericIdx[0];
  const seriesIdx = numericIdx.slice(1);
  const points = [];
  for (const r of rows) {
    const x = cellNumber(r, xIdx);
    if (x === null) continue;
    points.push({ x, ys: seriesIdx.map((j) => cellNumber(r, j)) });
  }
  if (points.length < 2) {
    appendPlainText(el, 'Not enough numeric rows in this trace to plot.');
    return;
  }

  const W = 640;
  const H = 320;
  const ML = 56;
  const MR = 14;
  const MT = 14;
  const MB = 44;
  const xVals = points.map((p) => p.x);
  const yVals = points.flatMap((p) => p.ys).filter((v) => v !== null);
  let xMin = Math.min(...xVals);
  let xMax = Math.max(...xVals);
  let yMin = Math.min(...yVals);
  let yMax = Math.max(...yVals);
  if (xMax === xMin) xMax = xMin + 1;
  if (yMax === yMin) yMax = yMin + 1;
  const xPad = (xMax - xMin) * 0.06;
  const yPad = (yMax - yMin) * 0.08;
  xMin -= xPad; xMax += xPad; yMin -= yPad; yMax += yPad;

  const sx = (v) => ML + ((v - xMin) / (xMax - xMin)) * (W - ML - MR);
  const sy = (v) => H - MB - ((v - yMin) / (yMax - yMin)) * (H - MT - MB);

  const svg = svgEl('svg', {
    viewBox: `0 0 ${W} ${H}`,
    role: 'img',
    'aria-label': 'Computed trace plot: ' + (trace.title || 'worked example'),
    class: 'trace-plot',
  });
  svg.appendChild(svgEl('rect', { x: ML, y: MT, width: W - ML - MR, height: H - MT - MB, class: 'plot-bg' }));

  // axes + ticks
  svg.appendChild(svgEl('line', { x1: ML, y1: H - MB, x2: W - MR, y2: H - MB, class: 'plot-axis' }));
  svg.appendChild(svgEl('line', { x1: ML, y1: MT, x2: ML, y2: H - MB, class: 'plot-axis' }));
  for (let i = 0; i <= 4; i++) {
    const xv = xMin + ((xMax - xMin) * i) / 4;
    const yv = yMin + ((yMax - yMin) * i) / 4;
    const tx = svgEl('text', { x: sx(xv), y: H - MB + 16, class: 'plot-tick', 'text-anchor': 'middle' });
    tx.textContent = tickText(xv);
    svg.appendChild(tx);
    const ty = svgEl('text', { x: ML - 8, y: sy(yv) + 4, class: 'plot-tick', 'text-anchor': 'end' });
    ty.textContent = tickText(yv);
    svg.appendChild(ty);
    svg.appendChild(svgEl('line', { x1: ML, y1: sy(yv), x2: W - MR, y2: sy(yv), class: 'plot-grid' }));
  }
  const xl = svgEl('text', { x: (ML + W - MR) / 2, y: H - 8, class: 'plot-label', 'text-anchor': 'middle' });
  xl.textContent = cols[xIdx] || 'x';
  svg.appendChild(xl);

  seriesIdx.forEach((j, s) => {
    const color = PLOT_PALETTE[s % PLOT_PALETTE.length];
    const pts = points.filter((p) => p.ys[s] !== null);
    if (pts.length >= 2) {
      svg.appendChild(svgEl('polyline', {
        points: pts.map((p) => sx(p.x).toFixed(1) + ',' + sy(p.ys[s]).toFixed(1)).join(' '),
        fill: 'none', stroke: color, 'stroke-width': 2.5, class: 'plot-line',
      }));
    }
    for (const p of pts) {
      svg.appendChild(svgEl('circle', { cx: sx(p.x).toFixed(1), cy: sy(p.ys[s]).toFixed(1), r: 3.5, fill: color, class: 'plot-dot' }));
    }
    const lx = ML + 12 + s * 150;
    svg.appendChild(svgEl('circle', { cx: lx, cy: MT + 10, r: 4, fill: color }));
    const lt = svgEl('text', { x: lx + 9, y: MT + 14, class: 'plot-legend' });
    lt.textContent = cols[j] || ('series ' + (s + 1));
    svg.appendChild(lt);
  });

  el.appendChild(svg);
}

/* ---------------------------------------------------------------------- */
/* Small shared formatting                                                 */
/* ---------------------------------------------------------------------- */

/** Format one trace-table cell (number, array of numbers, or string). */
export function formatTraceValue(v) {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return '(' + v.map(formatTraceValue).join(', ') + ')';
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return String(v);
    return String(Math.round(v * 10000) / 10000);
  }
  return String(v);
}
