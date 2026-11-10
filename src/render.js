/**
 * render.js — the ONLY module in Vertex that touches `innerHTML`, and only
 * with DOMPurify-sanitized strings (plan3 §6.8). It owns every third-party
 * load: two CDN libraries (marked + DOMPurify — pinned versions, real SRI
 * hashes, crossorigin="anonymous") and the vendored KaTeX under
 * vendor/katex/ (same-origin: no CDN, no SRI, demo works offline). Every
 * load failure degrades to plain text — never a blank screen, never raw
 * model HTML.
 *
 * Pipeline for model/note markdown:  marked.parse → DOMPurify.sanitize → DOM.
 * Math has one narrow entry point (Addendum v4): renderFormula() passes ONE
 * stored LaTeX string from lesson.sheet to katex.render — the page is never
 * scanned for $ delimiters and model output is never fed to KaTeX.
 * plan3 removed Mermaid and trace plots from the product flow.
 * Authored SVG (the concept sketch) is built with document.createElementNS —
 * static markup, never model text — so it needs no sanitizing pass.
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
});

/** key -> Promise<boolean>; failure resolves false (never rejects). */
const libCache = new Map();

function injectLib(key) {
  const spec = CDN[key];
  if (!spec) return Promise.resolve(false);
  if (spec.global && typeof window[spec.global] !== 'undefined') return Promise.resolve(true);
  return new Promise((resolve, reject) => {
    const node = document.createElement('script');
    node.src = spec.url;
    node.async = true;
    node.integrity = spec.integrity;
    node.crossOrigin = 'anonymous';
    node.onload = () => resolve(typeof window[spec.global] !== 'undefined');
    node.onerror = () => reject(new Error('Failed to load ' + spec.url));
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

/**
 * renderSafeMarkdown(el, md) — model/note text in, sanitized DOM out.
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
  return el;
}

/* ---------------------------------------------------------------------- */
/* Math (Addendum v4) — vendored KaTeX, one stored formula at a time       */
/* ---------------------------------------------------------------------- */

// KaTeX 0.16.22 served from vendor/katex/ (npm dist, unmodified): script +
// stylesheet + fonts/ all same-origin, so CSP needs no third-party entry
// and the demo makes zero external requests for math.
const VENDOR = Object.freeze({
  katex: {
    global: 'katex',
    script: 'vendor/katex/katex.min.js',
    stylesheet: 'vendor/katex/katex.min.css',
  },
});

let katexPromise = null;
function loadKatex() {
  if (!katexPromise) {
    katexPromise = new Promise((resolve) => {
      if (typeof window.katex !== 'undefined') { resolve(true); return; }
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = VENDOR.katex.stylesheet;
      document.head.appendChild(link);
      const node = document.createElement('script');
      node.src = VENDOR.katex.script;
      node.async = true;
      node.onload = () => resolve(typeof window.katex !== 'undefined');
      node.onerror = () => resolve(false);
      document.head.appendChild(node);
    });
  }
  return katexPromise;
}

/**
 * renderFormula(el, latex, fallbackText) — the ONLY math entry point.
 * Renders one stored string (lesson.sheet.formula) with katex.render in
 * displayMode; throwOnError:true, and any failure — bad LaTeX, KaTeX not
 * loadable — shows the readable Unicode fallback as plain text. Never
 * regex-scans prose, never renders model output, never injects HTML.
 */
export async function renderFormula(el, latex, fallbackText) {
  const fb = typeof fallbackText === 'string' ? fallbackText : '';
  el.replaceChildren();
  if (typeof latex !== 'string' || !latex.trim()) {
    el.textContent = fb;
    el.classList.add('formula-fallback');
    return el;
  }
  const ok = await loadKatex();
  if (!ok) {
    el.textContent = fb;
    el.classList.add('formula-fallback');
    return el;
  }
  try {
    window.katex.render(latex, el, { displayMode: true, throwOnError: true, trust: false });
    el.classList.add('formula-rendered');
  } catch (err) {
    console.warn('render.js: KaTeX could not render the stored formula —', err.message);
    el.replaceChildren();
    el.textContent = fb;
    el.classList.add('formula-fallback');
  }
  return el;
}

/* ---------------------------------------------------------------------- */
/* Tiny shared inline-SVG icons (createElementNS — no innerHTML, no fonts) */
/* ---------------------------------------------------------------------- */

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(name, attrs) {
  const node = document.createElementNS(SVG_NS, name);
  for (const k of Object.keys(attrs)) node.setAttribute(k, String(attrs[k]));
  return node;
}

/**
 * icon(name) -> <svg> with the plan3 §5 status icon:
 *  - 'check'          → Explained
 *  - 'short-line'     → Only mentioned
 *  - 'search'         → No match found
 *  - 'pin' / 'pinned' → revision-pin toggle states
 *  - 'arrow'          → secondary nav affordance
 * Icons are aria-hidden; the adjacent text always carries the meaning, so
 * the map still reads in grayscale and for colour-vision differences.
 */
export function icon(name) {
  const svg = svgEl('svg', {
    class: 'icon icon-' + name,
    width: '14', height: '14', viewBox: '0 0 16 16',
    'aria-hidden': 'true', focusable: 'false',
  });
  if (name === 'check') {
    svg.appendChild(svgEl('path', {
      d: 'M2.5 8.5 L6.5 12.5 L13.5 4',
      fill: 'none', stroke: 'currentColor',
      'stroke-width': '2.2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    }));
  } else if (name === 'short-line') {
    svg.appendChild(svgEl('line', {
      x1: '3', y1: '8', x2: '13', y2: '8',
      stroke: 'currentColor', 'stroke-width': '2.4', 'stroke-linecap': 'round',
    }));
  } else if (name === 'search') {
    svg.appendChild(svgEl('circle', { cx: '7', cy: '7', r: '4.2', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }));
    svg.appendChild(svgEl('line', {
      x1: '10.4', y1: '10.4', x2: '14', y2: '14',
      stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round',
    }));
  } else if (name === 'pin') {
    svg.appendChild(svgEl('path', {
      d: 'M8 14 L8 9 M5 2.5 L11 2.5 L11 6.5 L12.5 9 L3.5 9 L5 6.5 Z',
      fill: 'none', stroke: 'currentColor',
      'stroke-width': '1.7', 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    }));
  } else if (name === 'pinned') {
    svg.appendChild(svgEl('path', {
      d: 'M8 14 L8 9 M5 2.5 L11 2.5 L11 6.5 L12.5 9 L3.5 9 L5 6.5 Z',
      fill: 'currentColor', stroke: 'currentColor',
      'stroke-width': '1.7', 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    }));
  } else if (name === 'arrow') {
    svg.appendChild(svgEl('path', {
      d: 'M3 8 L12 8 M8.5 4.5 L12 8 L8.5 11.5',
      fill: 'none', stroke: 'currentColor',
      'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    }));
  } else {
    console.warn('render.js: unknown icon name "' + String(name) + '" — rendering a dot instead.');
    svg.appendChild(svgEl('circle', { cx: '8', cy: '8', r: '3', fill: 'currentColor' }));
  }
  return svg;
}

/* ---------------------------------------------------------------------- */
/* Concept sketch — hand-authored SVGs keyed by scenario visual.kind       */
/* ---------------------------------------------------------------------- */

function sketchSvg(altText) {
  return svgEl('svg', {
    viewBox: '0 0 320 170',
    class: 'sketch-svg',
    role: 'img',
    'aria-label': altText,
  });
}

/** Bowl (plan3 §3 Scenario A) — the default sketch, preserved verbatim. */
function buildBowlSketch(highlight) {
  const svg = svgEl('svg', {
    viewBox: '0 0 320 170',
    class: 'sketch-svg',
    role: 'img',
    'aria-label': 'Concept sketch: a bowl-shaped curve. A dashed arrow jumps from the left rim straight over the bottom and up the right side. A solid arrow takes a short step down toward the bottom.',
  });

  // axes-free qualitative bowl
  svg.appendChild(svgEl('path', {
    d: 'M 24 34 Q 160 210 296 34',
    fill: 'none', stroke: 'var(--sketch-line, #17213A)', 'stroke-width': '2.4', 'stroke-linecap': 'round',
  }));

  const startX = 84;
  const startY = 76; // a point on the left slope
  svg.appendChild(svgEl('circle', { cx: String(startX), cy: String(startY), r: '4.5', fill: '#4338CA' }));
  const startLabel = svgEl('text', { x: String(startX - 6), y: String(startY - 10), class: 'sketch-text', 'text-anchor': 'start' });
  startLabel.textContent = 'you are here';
  svg.appendChild(startLabel);

  const bottomX = 160;
  const bottomY = 138; // vertex of the parabola ≈ (24+296)/2, Q midpoint formula
  svg.appendChild(svgEl('circle', { cx: String(bottomX), cy: String(bottomY - 24), r: '3.5', fill: '#475569' }));

  // Long jump — dashed, lands up the other side
  const longActive = highlight === 'long';
  svg.appendChild(svgEl('path', {
    d: 'M 92 68 Q 190 30 258 60',
    fill: 'none', stroke: '#9F1239',
    'stroke-width': longActive ? '3.4' : '2.4',
    'stroke-dasharray': '7 5', 'stroke-linecap': 'round',
    opacity: highlight === null || longActive ? '1' : '0.35',
    class: 'sketch-path-long',
  }));
  svg.appendChild(svgEl('path', {
    d: 'M 258 60 l -9 -2 m 9 2 l -3 -8',
    fill: 'none', stroke: '#9F1239', 'stroke-width': longActive ? '3.2' : '2.2', 'stroke-linecap': 'round',
    opacity: highlight === null || longActive ? '1' : '0.35',
  }));
  const longText = svgEl('text', { x: '196', y: '28', class: 'sketch-text sketch-text-long', 'text-anchor': 'middle' });
  longText.textContent = 'Long jump';
  svg.appendChild(longText);

  // Shorter step — solid, lands near the bottom
  const shortActive = highlight === 'short';
  svg.appendChild(svgEl('path', {
    d: 'M 92 84 Q 126 116 148 118',
    fill: 'none', stroke: '#065F46',
    'stroke-width': shortActive ? '3.4' : '2.4', 'stroke-linecap': 'round',
    opacity: highlight === null || shortActive ? '1' : '0.35',
    class: 'sketch-path-short',
  }));
  svg.appendChild(svgEl('path', {
    d: 'M 148 118 l -8 -4 m 8 4 l -1 -9',
    fill: 'none', stroke: '#065F46', 'stroke-width': shortActive ? '3.2' : '2.2', 'stroke-linecap': 'round',
    opacity: highlight === null || shortActive ? '1' : '0.35',
  }));
  const shortText = svgEl('text', { x: '120', y: '146', class: 'sketch-text sketch-text-short', 'text-anchor': 'middle' });
  shortText.textContent = 'Shorter step';
  svg.appendChild(shortText);

  const caption = svgEl('text', { x: '296', y: '162', class: 'sketch-text', 'text-anchor': 'end' });
  caption.textContent = 'step →';
  svg.appendChild(caption);
  return svg;
}

/** Newton on a flat stretch: the tangent crosses the axis far past the root. */
function buildNewtonSketch(highlight, altText) {
  const svg = sketchSvg(altText);
  const longActive = highlight === 'long';
  const shortActive = highlight === 'short';

  svg.appendChild(svgEl('line', { x1: '24', y1: '140', x2: '296', y2: '140', stroke: '#475569', 'stroke-width': '1.6' }));
  svg.appendChild(svgEl('path', {
    d: 'M 28 52 C 50 100 62.5 122 110 126 C 157.5 130 176 132 200 140 C 224 148 252 152 292 154',
    fill: 'none', stroke: 'var(--sketch-line, #17213A)', 'stroke-width': '2.4', 'stroke-linecap': 'round',
  }));
  const fnLabel = svgEl('text', { x: '30', y: '40', class: 'sketch-text', 'text-anchor': 'start' });
  fnLabel.textContent = 'f(x)';
  svg.appendChild(fnLabel);
  const axisLabel = svgEl('text', { x: '296', y: '162', class: 'sketch-text', 'text-anchor': 'end' });
  axisLabel.textContent = 'x →';
  svg.appendChild(axisLabel);

  svg.appendChild(svgEl('circle', { cx: '110', cy: '126', r: '4.5', fill: '#4338CA' }));
  const hereLabel = svgEl('text', { x: '110', y: '108', class: 'sketch-text', 'text-anchor': 'middle' });
  hereLabel.textContent = 'current point';
  svg.appendChild(hereLabel);
  svg.appendChild(svgEl('circle', { cx: '200', cy: '140', r: '3', fill: '#475569' }));
  const rootLabel = svgEl('text', { x: '200', y: '158', class: 'sketch-text', 'text-anchor': 'middle' });
  rootLabel.textContent = 'root';
  svg.appendChild(rootLabel);
  svg.appendChild(svgEl('circle', { cx: '276', cy: '140', r: '3.5', fill: '#475569' }));
  const newtonLabel = svgEl('text', { x: '272', y: '126', class: 'sketch-text', 'text-anchor': 'middle' });
  newtonLabel.textContent = 'Newton point';
  svg.appendChild(newtonLabel);

  // Unguarded jump — the dashed tangent runs out to the distant axis crossing
  svg.appendChild(svgEl('path', {
    d: 'M 110 126 L 276 140',
    fill: 'none', stroke: '#9F1239', 'stroke-width': longActive ? '3.4' : '2.4',
    'stroke-dasharray': '7 5', 'stroke-linecap': 'round',
    opacity: highlight === null || longActive ? '1' : '0.35', class: 'sketch-path-long',
  }));
  svg.appendChild(svgEl('path', {
    d: 'M 276 140 L 266.7 142.7 M 276 140 L 267.3 135.7',
    fill: 'none', stroke: '#9F1239', 'stroke-width': longActive ? '3.2' : '2.2', 'stroke-linecap': 'round',
    opacity: highlight === null || longActive ? '1' : '0.35',
  }));
  const longText = svgEl('text', { x: '176', y: '112', class: 'sketch-text sketch-text-long', 'text-anchor': 'middle' });
  longText.textContent = 'Newton step';
  svg.appendChild(longText);

  // Guarded step — solid, stops short of the root while the curve still bends
  svg.appendChild(svgEl('path', {
    d: 'M 110 126 L 150 140',
    fill: 'none', stroke: '#065F46', 'stroke-width': shortActive ? '3.4' : '2.4', 'stroke-linecap': 'round',
    opacity: highlight === null || shortActive ? '1' : '0.35', class: 'sketch-path-short',
  }));
  svg.appendChild(svgEl('path', {
    d: 'M 150 140 L 141.5 140.2 M 150 140 L 143.4 134.5',
    fill: 'none', stroke: '#065F46', 'stroke-width': shortActive ? '3.2' : '2.2', 'stroke-linecap': 'round',
    opacity: highlight === null || shortActive ? '1' : '0.35',
  }));
  const shortText = svgEl('text', { x: '136', y: '158', class: 'sketch-text sketch-text-short', 'text-anchor': 'middle' });
  shortText.textContent = 'guarded step';
  svg.appendChild(shortText);
  return svg;
}

/** Armijo: objective vs step size, the sufficient-decrease line from f(0). */
function buildArmijoSketch(highlight, altText) {
  const svg = sketchSvg(altText);
  const longActive = highlight === 'long';
  const shortActive = highlight === 'short';

  svg.appendChild(svgEl('line', { x1: '40', y1: '24', x2: '40', y2: '146', stroke: '#475569', 'stroke-width': '1.6' }));
  svg.appendChild(svgEl('line', { x1: '40', y1: '146', x2: '296', y2: '146', stroke: '#475569', 'stroke-width': '1.6' }));
  const fLabel = svgEl('text', { x: '30', y: '28', class: 'sketch-text', 'text-anchor': 'middle' });
  fLabel.textContent = 'f';
  svg.appendChild(fLabel);
  const axisLabel = svgEl('text', { x: '296', y: '162', class: 'sketch-text', 'text-anchor': 'end' });
  axisLabel.textContent = 'step size →';
  svg.appendChild(axisLabel);

  svg.appendChild(svgEl('path', {
    d: 'M 40 50 C 70 96 96 124 130 124 C 176 124 220 96 284 64',
    fill: 'none', stroke: 'var(--sketch-line, #17213A)', 'stroke-width': '2.4', 'stroke-linecap': 'round',
  }));
  svg.appendChild(svgEl('path', { d: 'M 40 50 L 284 92', fill: 'none', stroke: '#475569', 'stroke-width': '1.6' }));
  const lineLabel = svgEl('text', { x: '196', y: '66', class: 'sketch-text', 'text-anchor': 'middle' });
  lineLabel.textContent = 'Armijo line';
  svg.appendChild(lineLabel);

  svg.appendChild(svgEl('circle', { cx: '40', cy: '50', r: '4.5', fill: '#4338CA' }));
  const nowLabel = svgEl('text', { x: '48', y: '42', class: 'sketch-text', 'text-anchor': 'start' });
  nowLabel.textContent = 'current';
  svg.appendChild(nowLabel);

  // Larger step — dashed, its curve point sits above the line (fails)
  svg.appendChild(svgEl('path', {
    d: 'M 262 75 L 262 146',
    fill: 'none', stroke: '#9F1239', 'stroke-width': longActive ? '3.4' : '2.4',
    'stroke-dasharray': '7 5', 'stroke-linecap': 'round',
    opacity: highlight === null || longActive ? '1' : '0.35', class: 'sketch-path-long',
  }));
  svg.appendChild(svgEl('circle', { cx: '262', cy: '75', r: '4', fill: '#9F1239' }));
  const longText = svgEl('text', { x: '262', y: '60', class: 'sketch-text sketch-text-long', 'text-anchor': 'middle' });
  longText.textContent = 'fails';
  svg.appendChild(longText);

  // Smaller step — solid, its curve point sits below the line (passes)
  svg.appendChild(svgEl('path', {
    d: 'M 97 114 L 97 146',
    fill: 'none', stroke: '#065F46', 'stroke-width': shortActive ? '3.4' : '2.4', 'stroke-linecap': 'round',
    opacity: highlight === null || shortActive ? '1' : '0.35', class: 'sketch-path-short',
  }));
  svg.appendChild(svgEl('circle', { cx: '97', cy: '114', r: '4', fill: '#065F46' }));
  const shortText = svgEl('text', { x: '97', y: '102', class: 'sketch-text sketch-text-short', 'text-anchor': 'middle' });
  shortText.textContent = 'passes';
  svg.appendChild(shortText);
  return svg;
}

/** BFGS: elliptical contours, a direct overshoot vs the accumulated-info path. */
function buildBfgsSketch(highlight, altText) {
  const svg = sketchSvg(altText);
  const longActive = highlight === 'long';
  const shortActive = highlight === 'short';

  for (const r of [[132, 54], [88, 36], [44, 18]]) {
    svg.appendChild(svgEl('ellipse', {
      cx: '185', cy: '92', rx: String(r[0]), ry: String(r[1]),
      fill: 'none', stroke: 'var(--sketch-line, #17213A)', 'stroke-width': '1.2', opacity: '0.45',
    }));
  }
  svg.appendChild(svgEl('circle', { cx: '185', cy: '92', r: '3.5', fill: '#475569' }));
  const minLabel = svgEl('text', { x: '185', y: '160', class: 'sketch-text', 'text-anchor': 'middle' });
  minLabel.textContent = 'minimum';
  svg.appendChild(minLabel);
  svg.appendChild(svgEl('circle', { cx: '71', cy: '65', r: '4.5', fill: '#4338CA' }));
  const startLabel = svgEl('text', { x: '60', y: '52', class: 'sketch-text', 'text-anchor': 'middle' });
  startLabel.textContent = 'start';
  svg.appendChild(startLabel);

  // Direct path — dashed, overshoots past the minimum then corrects back
  svg.appendChild(svgEl('path', {
    d: 'M 71 65 L 232 116 L 185 92',
    fill: 'none', stroke: '#9F1239', 'stroke-width': longActive ? '3.4' : '2.4',
    'stroke-dasharray': '7 5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    opacity: highlight === null || longActive ? '1' : '0.35', class: 'sketch-path-long',
  }));
  svg.appendChild(svgEl('path', {
    d: 'M 185 92 L 193.5 93 M 185 92 L 190.8 98.3',
    fill: 'none', stroke: '#9F1239', 'stroke-width': longActive ? '3.2' : '2.2', 'stroke-linecap': 'round',
    opacity: highlight === null || longActive ? '1' : '0.35',
  }));
  const longText = svgEl('text', { x: '150', y: '74', class: 'sketch-text sketch-text-long', 'text-anchor': 'middle' });
  longText.textContent = 'direct step';
  svg.appendChild(longText);

  // BFGS path — solid, curves in with the accumulated curvature information
  svg.appendChild(svgEl('path', {
    d: 'M 71 65 C 110 78 130 108 160 104 C 176 101 181 96 185 92',
    fill: 'none', stroke: '#065F46', 'stroke-width': shortActive ? '3.4' : '2.4',
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    opacity: highlight === null || shortActive ? '1' : '0.35', class: 'sketch-path-short',
  }));
  svg.appendChild(svgEl('path', {
    d: 'M 185 92 L 181.5 99.8 M 185 92 L 177.2 95.5',
    fill: 'none', stroke: '#065F46', 'stroke-width': shortActive ? '3.2' : '2.2', 'stroke-linecap': 'round',
    opacity: highlight === null || shortActive ? '1' : '0.35',
  }));
  const shortText = svgEl('text', { x: '96', y: '124', class: 'sketch-text sketch-text-short', 'text-anchor': 'middle' });
  shortText.textContent = 'BFGS path';
  svg.appendChild(shortText);
  return svg;
}

/** Gram–Schmidt: project v2 onto v1, keep the perpendicular residual, normalize. */
function buildGramSchmidtSketch(highlight, altText) {
  const svg = sketchSvg(altText);
  const longActive = highlight === 'long';
  const shortActive = highlight === 'short';

  svg.appendChild(svgEl('circle', { cx: '56', cy: '132', r: '20', fill: 'none', stroke: '#475569', 'stroke-width': '1.2', opacity: '0.7' }));
  const unitLabel = svgEl('text', { x: '34', y: '168', class: 'sketch-text', 'text-anchor': 'start' });
  unitLabel.textContent = 'unit circle';
  svg.appendChild(unitLabel);

  // v1 — the vector we project onto
  svg.appendChild(svgEl('path', { d: 'M 56 132 L 281 84.2', fill: 'none', stroke: 'var(--sketch-line, #17213A)', 'stroke-width': '2.2', 'stroke-linecap': 'round' }));
  svg.appendChild(svgEl('path', { d: 'M 281 84.2 L 272.9 89.2 M 281 84.2 L 271.5 83', fill: 'none', stroke: 'var(--sketch-line, #17213A)', 'stroke-width': '2.2', 'stroke-linecap': 'round' }));
  const v1Label = svgEl('text', { x: '286', y: '80', class: 'sketch-text', 'text-anchor': 'start' });
  v1Label.textContent = 'v1';
  svg.appendChild(v1Label);

  // Projection of v2 onto v1 — dashed guide along v1 up to the foot P
  svg.appendChild(svgEl('path', { d: 'M 56 132 L 254.1 89.9', fill: 'none', stroke: '#475569', 'stroke-width': '2.6', 'stroke-dasharray': '6 4', 'stroke-linecap': 'round', opacity: '0.85' }));
  const projLabel = svgEl('text', { x: '150', y: '100', class: 'sketch-text', 'text-anchor': 'middle' });
  projLabel.textContent = 'projection';
  svg.appendChild(projLabel);

  // Unprojected v2 — dashed, nearly parallel to v1 (the "long" raw vector)
  svg.appendChild(svgEl('path', {
    d: 'M 56 132 L 260.7 121.3',
    fill: 'none', stroke: '#9F1239', 'stroke-width': longActive ? '3.4' : '2.4',
    'stroke-dasharray': '7 5', 'stroke-linecap': 'round',
    opacity: highlight === null || longActive ? '1' : '0.35', class: 'sketch-path-long',
  }));
  svg.appendChild(svgEl('path', {
    d: 'M 260.7 121.3 L 251.9 125 M 260.7 121.3 L 251.5 118.6',
    fill: 'none', stroke: '#9F1239', 'stroke-width': longActive ? '3.2' : '2.2', 'stroke-linecap': 'round',
    opacity: highlight === null || longActive ? '1' : '0.35',
  }));
  const longText = svgEl('text', { x: '150', y: '141', class: 'sketch-text sketch-text-long', 'text-anchor': 'middle' });
  longText.textContent = 'v2';
  svg.appendChild(longText);

  // Residual — solid, perpendicular to v1 from the foot P out to the v2 tip
  svg.appendChild(svgEl('path', {
    d: 'M 254.1 89.9 L 260.7 121.3',
    fill: 'none', stroke: '#065F46', 'stroke-width': shortActive ? '3.4' : '2.4', 'stroke-linecap': 'round',
    opacity: highlight === null || shortActive ? '1' : '0.35', class: 'sketch-path-short',
  }));
  svg.appendChild(svgEl('path', {
    d: 'M 260.7 121.3 L 256.1 114.1 M 260.7 121.3 L 261.9 112.9',
    fill: 'none', stroke: '#065F46', 'stroke-width': shortActive ? '3.2' : '2.2', 'stroke-linecap': 'round',
    opacity: highlight === null || shortActive ? '1' : '0.35',
  }));
  svg.appendChild(svgEl('path', { d: 'M 246.3 91.6 L 247.9 99.4 L 255.8 97.7', fill: 'none', stroke: '#475569', 'stroke-width': '1.4' }));
  const shortText = svgEl('text', { x: '272', y: '108', class: 'sketch-text sketch-text-short', 'text-anchor': 'start' });
  shortText.textContent = 'residual';
  svg.appendChild(shortText);

  // Normalized residual u2 marked on the unit circle
  svg.appendChild(svgEl('path', { d: 'M 56 132 L 60.2 151.6', fill: 'none', stroke: '#065F46', 'stroke-width': '2', 'stroke-linecap': 'round' }));
  svg.appendChild(svgEl('path', { d: 'M 60.2 151.6 L 56.2 145.3 M 60.2 151.6 L 61.3 144.2', fill: 'none', stroke: '#065F46', 'stroke-width': '2', 'stroke-linecap': 'round' }));
  const u2Label = svgEl('text', { x: '68', y: '154', class: 'sketch-text sketch-text-short', 'text-anchor': 'start' });
  u2Label.textContent = 'u2';
  svg.appendChild(u2Label);
  svg.appendChild(svgEl('circle', { cx: '56', cy: '132', r: '3', fill: '#475569' }));
  return svg;
}

/** CG: a narrow valley — steepest-descent zigzag vs two conjugate moves. */
function buildCgSketch(highlight, altText) {
  const svg = sketchSvg(altText);
  const longActive = highlight === 'long';
  const shortActive = highlight === 'short';

  for (const r of [[140, 34], [95, 23], [50, 12]]) {
    svg.appendChild(svgEl('ellipse', {
      cx: '170', cy: '90', rx: String(r[0]), ry: String(r[1]),
      fill: 'none', stroke: 'var(--sketch-line, #17213A)', 'stroke-width': '1.2', opacity: '0.45',
    }));
  }
  svg.appendChild(svgEl('circle', { cx: '170', cy: '90', r: '3.5', fill: '#475569' }));
  const minLabel = svgEl('text', { x: '170', y: '158', class: 'sketch-text', 'text-anchor': 'middle' });
  minLabel.textContent = 'minimum';
  svg.appendChild(minLabel);
  svg.appendChild(svgEl('circle', { cx: '80', cy: '64', r: '4.5', fill: '#4338CA' }));
  const startLabel = svgEl('text', { x: '74', y: '52', class: 'sketch-text', 'text-anchor': 'middle' });
  startLabel.textContent = 'start';
  svg.appendChild(startLabel);

  // Steepest descent — dashed zigzag bouncing across the narrow valley
  svg.appendChild(svgEl('path', {
    d: 'M 80 64 L 106 118 L 132 66 L 158 116 L 184 70 L 206 112',
    fill: 'none', stroke: '#9F1239', 'stroke-width': longActive ? '3.4' : '2.4',
    'stroke-dasharray': '7 5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    opacity: highlight === null || longActive ? '1' : '0.35', class: 'sketch-path-long',
  }));
  svg.appendChild(svgEl('path', {
    d: 'M 206 112 L 199.6 106.3 M 206 112 L 205 103.5',
    fill: 'none', stroke: '#9F1239', 'stroke-width': longActive ? '3.2' : '2.2', 'stroke-linecap': 'round',
    opacity: highlight === null || longActive ? '1' : '0.35',
  }));
  const longText = svgEl('text', { x: '150', y: '142', class: 'sketch-text sketch-text-long', 'text-anchor': 'middle' });
  longText.textContent = 'steepest descent';
  svg.appendChild(longText);

  // CG — solid, one long-axis move then one short-axis move into the center
  svg.appendChild(svgEl('path', {
    d: 'M 80 64 L 170 64 L 170 90',
    fill: 'none', stroke: '#065F46', 'stroke-width': shortActive ? '3.4' : '2.4',
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    opacity: highlight === null || shortActive ? '1' : '0.35', class: 'sketch-path-short',
  }));
  svg.appendChild(svgEl('path', {
    d: 'M 170 90 L 173 82 M 170 90 L 167 82',
    fill: 'none', stroke: '#065F46', 'stroke-width': shortActive ? '3.2' : '2.2', 'stroke-linecap': 'round',
    opacity: highlight === null || shortActive ? '1' : '0.35',
  }));
  const shortText = svgEl('text', { x: '120', y: '50', class: 'sketch-text sketch-text-short', 'text-anchor': 'middle' });
  shortText.textContent = 'CG path';
  svg.appendChild(shortText);
  return svg;
}

const SKETCH_BUILDERS = new Map([
  ['bowl', buildBowlSketch],
  ['newton', buildNewtonSketch],
  ['armijo', buildArmijoSketch],
  ['bfgs', buildBfgsSketch],
  ['gram-schmidt', buildGramSchmidtSketch],
  ['cg', buildCgSketch],
]);

/** Warn once per unknown kind (and once for a missing target) — never throw. */
const sketchWarned = new Set();

/**
 * renderConceptSketch(el, opts) — dispatches to a hand-authored sketch by
 * opts.kind (default 'bowl'). highlight: 'long' | 'short' | null emphasizes
 * the dashed vs solid path relevant to the selected choice; dashed-vs-solid
 * carries the meaning so every sketch reads in grayscale. Built entirely with
 * createElementNS — static markup, never model text, never innerHTML. The
 * caption and text alternative render as readable DOM under the sketch. An
 * unknown kind or missing target warns once and renders nothing.
 */
export function renderConceptSketch(el, opts) {
  const options = opts || {};
  const kind = options.kind == null ? 'bowl' : options.kind;
  const build = typeof kind === 'string' ? SKETCH_BUILDERS.get(kind) : undefined;
  if (!build) {
    const key = 'kind:' + String(kind);
    if (!sketchWarned.has(key)) {
      sketchWarned.add(key);
      console.warn('render.js: unknown concept sketch kind "' + String(kind) + '" — rendering nothing.');
    }
    if (el && typeof el.replaceChildren === 'function') el.replaceChildren();
    return;
  }
  if (!el || typeof el.replaceChildren !== 'function') {
    if (!sketchWarned.has('#target')) {
      sketchWarned.add('#target');
      console.warn('render.js: renderConceptSketch called without a DOM target — rendering nothing.');
    }
    return;
  }

  const highlight = options.highlight === 'long' || options.highlight === 'short' ? options.highlight : null;
  const captionText = typeof options.caption === 'string' && options.caption.trim() ? options.caption : 'Concept sketch';
  const altText = typeof options.alt === 'string' && options.alt.trim()
    ? options.alt
    : kind === 'bowl'
      ? 'The sketch shows a bowl-shaped objective. From the same downhill start, a long dashed jump flies past the low point and lands higher on the other side; a short solid step lands near the bottom.'
      : captionText;
  el.replaceChildren();

  const svg = build(highlight, altText);

  const figure = document.createElement('figure');
  figure.className = 'sketch-figure';
  figure.appendChild(svg);
  const figcaption = document.createElement('figcaption');
  figcaption.className = 'sketch-caption';
  figcaption.textContent = captionText;
  figure.appendChild(figcaption);
  el.appendChild(figure);

  const alt = document.createElement('p');
  alt.className = 'sketch-alt sr-only';
  alt.textContent = altText;
  el.appendChild(alt);
}
