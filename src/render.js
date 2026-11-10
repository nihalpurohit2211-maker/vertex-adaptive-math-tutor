/**
 * render.js — the ONLY module in Vertex that touches `innerHTML`, and only
 * with DOMPurify-sanitized strings (plan3 §6.8). It is also the only module
 * that loads CDN libraries: pinned versions + real SRI hashes +
 * crossorigin="anonymous". Every load failure degrades to plain text —
 * never a blank screen, never raw model HTML.
 *
 * Pipeline for model/note markdown:  marked.parse → DOMPurify.sanitize → DOM.
 * plan3 removed KaTeX, Mermaid and trace plots from the product flow, so this
 * module loads exactly two CDN libraries: marked and DOMPurify.
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
/* Concept sketch — hand-authored bowl SVG (plan3 §3 Scenario A)           */
/* ---------------------------------------------------------------------- */

/**
 * renderConceptSketch(el, opts) — qualitative bowl with two labeled paths:
 * "Long jump" (dashed, overshoots up the other side) and "Shorter step"
 * (solid, lands near the bottom). highlight: 'long' | 'short' | null
 * emphasizes the path relevant to the selected choice. Built entirely with
 * createElementNS — static markup, never model text, never innerHTML.
 * The caption and the text alternative are rendered as readable DOM under
 * the sketch.
 */
export function renderConceptSketch(el, opts) {
  const options = opts || {};
  const highlight = options.highlight === 'long' || options.highlight === 'short' ? options.highlight : null;
  const captionText = typeof options.caption === 'string' && options.caption.trim() ? options.caption : 'Concept sketch';
  const altText = typeof options.alt === 'string' && options.alt.trim()
    ? options.alt
    : 'The sketch shows a bowl-shaped objective. From the same downhill start, a long dashed jump flies past the low point and lands higher on the other side; a short solid step lands near the bottom.';
  el.replaceChildren();

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
