/**
 * charts.js — custom SVG/canvas visualisations. No dependencies.
 */
import { h, svg, svgText, srTable, toast } from './ui.js';
import { json, isConfigured, describeLlmError } from './providers.js';
import { narrationPrompt } from './prompts.js';

export const COLORS = {
  covered: '#2F6B57',
  thin: '#C08A2E',
  missing: '#A94B3F',
  ink: '#1C2723',
  muted: '#6B756E',
  line: '#DFD6C6',
  accent: '#DE5B34',
};

function polar(cx, cy, r, angle) {
  const a = (angle - 90) * (Math.PI / 180);
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function arcPath(cx, cy, rOuter, rInner, start, end) {
  const sweep = end - start;
  if (sweep >= 359.999) {
    return [
      `M ${cx} ${cy - rOuter}`,
      `A ${rOuter} ${rOuter} 0 1 1 ${cx - 0.01} ${cy - rOuter}`,
      `M ${cx} ${cy - rInner}`,
      `A ${rInner} ${rInner} 0 1 0 ${cx + 0.01} ${cy - rInner}`,
      'Z',
    ].join(' ');
  }
  const [x1, y1] = polar(cx, cy, rOuter, end);
  const [x2, y2] = polar(cx, cy, rOuter, start);
  const [x3, y3] = polar(cx, cy, rInner, start);
  const [x4, y4] = polar(cx, cy, rInner, end);
  const large = sweep > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 ${large} 0 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 ${large} 1 ${x4} ${y4} Z`;
}

export function donut(data, { size = 210, centerTop = '', centerBottom = '', label = 'Coverage distribution' } = {}) {
  const total = data.reduce((n, d) => n + d.value, 0);
  const cx = 110; const cy = 110; const rOuter = 98; const rInner = 70;
  const chart = svg('svg', { viewBox: '0 0 220 220', width: size, height: size, role: 'img', 'aria-label': label, class: 'donut' });
  if (!total) {
    chart.appendChild(svg('circle', { cx, cy, r: (rOuter + rInner) / 2, fill: 'none', stroke: COLORS.line, 'stroke-width': rOuter - rInner }));
  } else {
    let angle = 0;
    for (const d of data) {
      if (d.value <= 0) continue;
      const sweep = (d.value / total) * 360;
      chart.appendChild(svg('path', {
        d: arcPath(cx, cy, rOuter, rInner, angle, angle + Math.max(sweep, 0.7)),
        fill: d.color,
        class: 'donut-seg',
      }));
      const title = svg('title', {});
      title.textContent = `${d.label}: ${d.value} (${Math.round((d.value / total) * 100)}%)`;
      chart.lastChild.appendChild(title);
      angle += sweep;
    }
  }
  if (centerTop || centerBottom) {
    chart.appendChild(svgText(centerTop, { x: 110, y: centerBottom ? 104 : 114, 'text-anchor': 'middle', class: 'donut-value' }));
    if (centerBottom) chart.appendChild(svgText(centerBottom, { x: 110, y: 128, 'text-anchor': 'middle', class: 'donut-label' }));
  }
  return chart;
}

export function donutFigure(data, opts = {}) {
  const total = data.reduce((n, d) => n + d.value, 0);
  const chart = donut(data, { ...opts, centerTop: String(total), centerBottom: opts.centerLabel || 'topics' });
  const legend = h('ul', { class: 'legend' }, data.map((d) => h('li', { class: 'legend-item' },
    h('span', { class: 'legend-dot', style: { background: d.color }, 'aria-hidden': 'true' }),
    h('span', { class: 'legend-label', text: d.label }),
    h('span', { class: 'legend-value', text: `${d.value}${total ? ` · ${Math.round((d.value / total) * 100)}%` : ''}` }))));
  return h('div', { class: 'donut-wrap' },
    h('div', { class: 'donut-chart' }, chart),
    legend,
    srTable(opts.label || 'Coverage distribution', ['Category', 'Topics'],
      data.map((d) => [d.label, d.value])));
}

export function barChart(items, { max = null, height = 150, label = 'Bar chart', color = COLORS.accent } = {}) {
  const peak = max || Math.max(1, ...items.map((i) => i.value));
  const width = 320;
  const top = 14;
  const bottom = 26;
  const plot = height - top - bottom;
  const slot = items.length ? width / items.length : width;
  const chart = svg('svg', { viewBox: `0 0 ${width} ${height}`, class: 'bar-chart', role: 'img', 'aria-label': label, preserveAspectRatio: 'none' });
  chart.appendChild(svg('line', { x1: 0, y1: height - bottom, x2: width, y2: height - bottom, stroke: COLORS.line }));
  items.forEach((item, i) => {
    const barW = Math.max(4, slot * 0.52);
    const x = i * slot + (slot - barW) / 2;
    const bh = Math.max(item.value > 0 ? 3 : 0, (item.value / peak) * plot);
    const bar = svg('rect', {
      x, y: height - bottom - bh, width: barW, height: bh,
      rx: Math.min(6, barW / 2), fill: item.color || color, class: 'bar-rect',
    });
    const title = svg('title', {});
    title.textContent = `${item.label}: ${item.value}`;
    bar.appendChild(title);
    chart.appendChild(bar);
    chart.appendChild(svgText(item.label, { x: x + barW / 2, y: height - 8, 'text-anchor': 'middle', class: 'chart-tick' }));
    if (item.value > 0) {
      chart.appendChild(svgText(String(item.value), { x: x + barW / 2, y: height - bottom - bh - 5, 'text-anchor': 'middle', class: 'chart-value' }));
    }
  });
  return chart;
}

export function activityChart(items, { label = 'Study activity', height = 170, unit = 'min' } = {}) {
  const width = 560;
  const top = 16;
  const bottom = 28;
  const plot = height - top - bottom;
  const peak = Math.max(1, ...items.map((i) => i.value));
  const slot = items.length ? width / items.length : width;
  const chart = svg('svg', { viewBox: `0 0 ${width} ${height}`, class: 'activity-chart', role: 'img', 'aria-label': label, preserveAspectRatio: 'none' });
  for (let g = 0; g <= 3; g++) {
    const y = top + (plot / 3) * g;
    chart.appendChild(svg('line', { x1: 0, y1: y, x2: width, y2: y, stroke: COLORS.line, 'stroke-dasharray': g === 3 ? '0' : '3 5' }));
  }
  items.forEach((item, i) => {
    const barW = Math.max(3, slot * 0.5);
    const x = i * slot + (slot - barW) / 2;
    const bh = item.value ? Math.max(4, (item.value / peak) * plot) : 0;
    const bar = svg('rect', { x, y: height - bottom - bh, width: barW, height: bh, rx: 4, fill: item.color || COLORS.covered, class: 'bar-rect' });
    const title = svg('title', {});
    title.textContent = `${item.label}: ${item.value} ${unit}`;
    bar.appendChild(title);
    chart.appendChild(bar);
    if (item.showLabel) chart.appendChild(svgText(item.label, { x: x + barW / 2, y: height - 9, 'text-anchor': 'middle', class: 'chart-tick' }));
  });
  return chart;
}

export function groupedBars(items, { height = 200, label = 'Planned versus completed study time' } = {}) {
  const width = 560;
  const top = 16;
  const bottom = 30;
  const plot = height - top - bottom;
  const peak = Math.max(1, ...items.map((i) => Math.max(i.planned, i.completed)));
  const slot = items.length ? width / items.length : width;
  const chart = svg('svg', { viewBox: `0 0 ${width} ${height}`, class: 'grouped-chart', role: 'img', 'aria-label': label, preserveAspectRatio: 'none' });
  for (let g = 0; g <= 3; g++) {
    const y = top + (plot / 3) * g;
    chart.appendChild(svg('line', { x1: 0, y1: y, x2: width, y2: y, stroke: COLORS.line, 'stroke-dasharray': g === 3 ? '0' : '3 5' }));
  }
  items.forEach((item, i) => {
    const groupW = slot * 0.62;
    const barW = groupW / 2 - 2;
    const x = i * slot + (slot - groupW) / 2;
    const planH = item.planned ? Math.max(3, (item.planned / peak) * plot) : 0;
    const doneH = item.completed ? Math.max(3, (item.completed / peak) * plot) : 0;
    const planned = svg('rect', { x, y: height - bottom - planH, width: barW, height: planH, rx: 4, fill: 'none', stroke: COLORS.thin, 'stroke-width': 2, class: 'bar-planned' });
    const pt = svg('title', {}); pt.textContent = `${item.label} planned: ${item.planned} min`; planned.appendChild(pt);
    chart.appendChild(planned);
    const done = svg('rect', { x: x + barW + 4, y: height - bottom - doneH, width: barW, height: doneH, rx: 4, fill: COLORS.covered, class: 'bar-completed' });
    const dt = svg('title', {}); dt.textContent = `${item.label} completed: ${item.completed} min`; done.appendChild(dt);
    chart.appendChild(done);
    if (item.showLabel) chart.appendChild(svgText(item.label, { x: x + groupW / 2, y: height - 9, 'text-anchor': 'middle', class: 'chart-tick' }));
  });
  return chart;
}

export function sparkline(values, { width = 120, height = 38, color = COLORS.accent } = {}) {
  const peak = Math.max(1, ...values);
  const min = Math.min(...values, 0);
  const span = peak - min || 1;
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * width},${height - 4 - ((v - min) / span) * (height - 8)}`);
  const chart = svg('svg', { viewBox: `0 0 ${width} ${height}`, width, height, 'aria-hidden': 'true', class: 'sparkline' });
  if (pts.length > 1) {
    chart.appendChild(svg('polyline', { points: pts.join(' '), fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  }
  return chart;
}

export function coverageBars(topics, { showUnit = false } = {}) {
  const rows = topics.map((t) => {
    const status = t.coverage?.status || 'not_found';
    const value = status === 'covered' ? 100 : status === 'thin' ? 52 : 12;
    return h('div', { class: 'coverage-bar-row' },
      h('div', { class: 'coverage-bar-head' },
        h('span', { class: 'coverage-bar-name', text: t.name }),
        h('span', { class: 'coverage-bar-status', text: status === 'covered' ? 'Explained' : status === 'thin' ? 'Only mentioned' : 'No match' })),
      h('div', { class: 'coverage-bar-track', role: 'img', 'aria-label': `${t.name}: ${status === 'covered' ? 'explained' : status === 'thin' ? 'only mentioned' : 'no match found'}` },
        h('span', { class: `coverage-bar-fill fill-${status}`, style: { width: value + '%' } })),
      showUnit ? h('span', { class: 'coverage-bar-unit', text: t.unit }) : null);
  });
  return h('div', { class: 'coverage-bars' }, rows);
}

/** Prerequisite graph: SVG edges + keyboard-focusable HTML nodes. */
export function prereqGraph(topics, onSelect, selectedId) {
  const n = topics.length;
  const positions = new Map();
  const radius = 38;
  topics.forEach((t, i) => {
    const angle = (i / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2;
    positions.set(t.id, {
      x: 50 + radius * Math.cos(angle),
      y: 50 + radius * Math.sin(angle),
    });
  });
  const edgeSvg = svg('svg', { viewBox: '0 0 100 100', class: 'graph-edges', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  for (const t of topics) {
    for (const p of t.prereqs || []) {
      if (!positions.has(p)) continue;
      const a = positions.get(p);
      const b = positions.get(t.id);
      edgeSvg.appendChild(svg('line', {
        x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: COLORS.line,
        'stroke-width': 0.6, 'stroke-dasharray': '1.6 1.4',
      }));
    }
  }
  const wrap = h('div', { class: 'graph-wrap' }, edgeSvg);
  for (const t of topics) {
    const pos = positions.get(t.id);
    const status = t.coverage?.status || 'not_found';
    const btn = h('button', {
      type: 'button',
      class: `graph-node node-${status}${selectedId === t.id ? ' selected' : ''}`,
      style: { left: pos.x + '%', top: pos.y + '%' },
      'aria-pressed': selectedId === t.id ? 'true' : 'false',
      title: `${t.name} — ${status === 'covered' ? 'explained' : status === 'thin' ? 'only mentioned' : 'no match found'}`,
    }, h('span', { class: 'graph-node-label', text: t.name }));
    btn.addEventListener('click', () => onSelect(t.id));
    wrap.appendChild(btn);
  }
  wrap.appendChild(h('p', { class: 'graph-legend muted small', text: 'Dashed arrows show prerequisites. Select a node for details.' }));
  return wrap;
}

/* -------------------------------------------------------------------------- */
/* optimiser widgets                                                           */
/* -------------------------------------------------------------------------- */

const CANVAS_W = 620;
const CANVAS_H = 300;

function setupCanvas(canvas) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  const w = rect.width || CANVAS_W;
  const hgt = rect.height || CANVAS_H;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(hgt * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h: hgt };
}

function drawGrid(ctx, w, h, xMin, xMax, yMin, yMax) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#FFFCF6';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#E8E0D2';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 8; i++) {
    const x = (w / 8) * i;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let i = 0; i <= 5; i++) {
    const y = (h / 5) * i;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  const toX = (x) => ((x - xMin) / (xMax - xMin)) * w;
  const toY = (y) => h - ((y - yMin) / (yMax - yMin)) * h;
  ctx.strokeStyle = '#9C9487';
  ctx.lineWidth = 1.3;
  if (0 >= xMin && 0 <= xMax) { ctx.beginPath(); ctx.moveTo(toX(0), 0); ctx.lineTo(toX(0), h); ctx.stroke(); }
  if (0 >= yMin && 0 <= yMax) { ctx.beginPath(); ctx.moveTo(0, toY(0)); ctx.lineTo(w, toY(0)); ctx.stroke(); }
  return { toX, toY };
}

export function learningRateWidget() {
  const wrap = h('div', { class: 'viz' });
  const canvas = h('canvas', { class: 'viz-canvas', 'aria-label': 'Gradient descent on f(x) = x squared with a movable learning rate' });
  const status = h('p', { class: 'viz-status', 'aria-live': 'polite' });
  const slider = h('input', { type: 'range', min: '0.01', max: '1.1', step: '0.01', value: '0.1', class: 'range', id: 'lr-range', 'aria-label': 'Learning rate alpha' });
  const out = h('output', { for: 'lr-range', class: 'range-value', text: 'α = 0.10' });
  const iterations = h('div', { class: 'iteration-list', 'aria-hidden': 'true' });
  let raf = 0;
  let frame = 0;
  let narrationBox = null;

  function compute(alpha) {
    const pts = [4];
    let x = 4;
    for (let i = 0; i < 24; i++) {
      x = x - alpha * 2 * x;
      if (!Number.isFinite(x) || Math.abs(x) > 50) { pts.push(x); return { pts, diverged: true }; }
      pts.push(x);
    }
    return { pts, diverged: false };
  }

  function draw(alpha, upto = 24) {
    const { ctx, w, h: height } = setupCanvas(canvas);
    const { toX, toY } = drawGrid(ctx, w, height, -4.5, 4.5, -1, 18);
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (let i = 0; i <= 160; i++) {
      const x = -4.5 + (9 * i) / 160;
      const y = x * x;
      if (y > 18) continue;
      const px = toX(x); const py = toY(y);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    const { pts, diverged } = compute(alpha);
    const shown = pts.slice(0, upto + 1);
    ctx.strokeStyle = '#2F6B57';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    shown.forEach((x, i) => {
      const px = toX(x); const py = toY(Math.min(x * x, 18));
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();
    shown.forEach((x, i) => {
      const px = toX(x); const py = toY(Math.min(x * x, 18));
      ctx.beginPath();
      ctx.arc(px, py, i === 0 ? 6 : i === shown.length - 1 ? 5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = i === shown.length - 1 ? COLORS.accent : '#2F6B57';
      ctx.fill();
      ctx.strokeStyle = '#FFFCF6'; ctx.lineWidth = 1.5; ctx.stroke();
    });
    const last = shown[shown.length - 1];
    status.textContent = diverged
      ? `α = ${alpha.toFixed(2)} diverges on f(x) = x²: for this quadratic the stable range is 0 < α < 1.`
      : upto >= 24
        ? `α = ${alpha.toFixed(2)} converges: x₂₄ ≈ ${last.toExponential(2)}. Fixed step, f(x) = x².`
        : `Step ${upto}: x = ${last.toFixed(4)}, f(x) = ${(last * last).toFixed(4)}.`;
    iterations.replaceChildren(...shown.slice(0, 5).map((x, i) => h('span', { text: `x${i}: ${Number(x).toFixed(4)}` })));
  }

  function update() {
    cancelAnimationFrame(raf);
    const alpha = Number(slider.value);
    out.textContent = `α = ${alpha.toFixed(2)}`;
    if (narrationBox) { narrationBox.remove(); narrationBox = null; }
    draw(alpha, 24);
  }

  function animate() {
    cancelAnimationFrame(raf);
    const alpha = Number(slider.value);
    let step = 1;
    const tick = () => {
      draw(alpha, step);
      step += 1;
      if (step <= 24) raf = requestAnimationFrame(tick);
    };
    tick();
  }

  slider.addEventListener('input', update);
  const animateBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm' }, 'Animate steps');
  animateBtn.addEventListener('click', animate);
  const resetBtn = h('button', {
    type: 'button', class: 'btn btn-ghost btn-sm',
  }, 'Reset');
  resetBtn.addEventListener('click', () => { slider.value = '0.1'; update(); });

  const narrateBtn = isConfigured() ? h('button', { type: 'button', class: 'btn btn-ghost btn-sm' }, 'Narrate table') : null;
  if (narrateBtn) {
    narrateBtn.addEventListener('click', async () => {
      const alpha = Number(slider.value);
      const { pts } = compute(alpha);
      const table = pts.slice(0, 6).map((x, i) => ({
        step: i, x: Number(x.toFixed(4)), f: Number((x * x).toFixed(4)), alpha,
      }));
      const allowed = new Set(table.flatMap((r) => [r.step, r.x, r.f, r.alpha]).map((n) => Number(n)));
      narrateBtn.disabled = true;
      narrateBtn.textContent = 'Narrating…';
      try {
        const prompt = narrationPrompt({ table });
        const result = await json({
          ...prompt,
          validate: (out) => {
            if (!out || !Array.isArray(out.rows) || !out.rows.length) return ['expected {"rows":[...]} with at least one row'];
            if (out.rows.length > table.length) return ['too many narration rows'];
            const errors = [];
            out.rows.forEach((row, i) => {
              if (!Number.isInteger(row?.index)) errors.push(`rows[${i}].index must be an integer`);
              if (typeof row?.sentence !== 'string' || !row.sentence.trim()) errors.push(`rows[${i}].sentence must be a non-empty string`);
              const numbers = (row?.sentence || '').match(/-?\d+(?:\.\d+)?/g) || [];
              for (const n of numbers) if (!allowed.has(Number(n))) errors.push(`rows[${i}] introduces the number ${n}, which is not in the table`);
            });
            return errors.length ? errors : true;
          },
        });
        if (narrationBox) narrationBox.remove();
        narrationBox = h('div', { class: 'narration-box', 'aria-live': 'polite' },
          h('p', { class: 'kicker', text: 'AI narration · numeric table only' }),
          result.rows.map((row) => h('p', { text: `${row.index}. ${row.sentence}` })),
          h('p', { class: 'small muted', text: 'Generated from the table above. No notes were sent.' }));
        wrap.appendChild(narrationBox);
      } catch (err) {
        toast(describeLlmError(err), 'error');
      } finally {
        narrateBtn.disabled = false;
        narrateBtn.textContent = 'Narrate table';
      }
    });
  }

  wrap.appendChild(h('div', { class: 'viz-head' },
    h('div', null, h('p', { class: 'viz-title', text: 'Learning-rate explorer' }), h('p', { class: 'viz-sub', text: 'f(x) = x², start x₀ = 4, 24 fixed steps' })),
    h('div', { class: 'viz-actions' }, animateBtn, resetBtn, narrateBtn)));
  wrap.appendChild(canvas);
  wrap.appendChild(h('div', { class: 'range-row' }, slider, out));
  wrap.appendChild(status);
  wrap.appendChild(iterations);
  requestAnimationFrame(() => draw(0.1, 24));
  return { node: wrap, cleanup() { cancelAnimationFrame(raf); } };
}

export function newtonWidget() {
  const wrap = h('div', { class: 'viz' });
  const canvas = h('canvas', { class: 'viz-canvas', 'aria-label': 'One Newton step on a quadratic' });
  const slider = h('input', { type: 'range', min: '-4', max: '8', step: '0.5', value: '6', class: 'range', id: 'newton-start', 'aria-label': 'Starting point' });
  const out = h('output', { for: 'newton-start', class: 'range-value', text: 'x₀ = 6' });
  const status = h('p', { class: 'viz-status', 'aria-live': 'polite' });
  function draw() {
    const x0 = Number(slider.value);
    out.textContent = `x₀ = ${x0.toFixed(1)}`;
    const { ctx, w, h: height } = setupCanvas(canvas);
    const f = (x) => x * x - 4 * x + 1;
    const fp = (x) => 2 * x - 4;
    const x1 = x0 - fp(x0) / 2;
    const { toX, toY } = drawGrid(ctx, w, height, -2, 9, -5, 30);
    ctx.strokeStyle = COLORS.accent; ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (let i = 0; i <= 160; i++) {
      const x = -2 + (11 * i) / 160;
      const y = f(x);
      if (y > 30 || y < -5) continue;
      const px = toX(x); const py = toY(y);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    const pairs = [[x0, f(x0)], [x1, f(x1)]];
    ctx.strokeStyle = '#2F6B57'; ctx.lineWidth = 1.6; ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.moveTo(toX(pairs[0][0]), toY(pairs[0][1])); ctx.lineTo(toX(pairs[1][0]), toY(pairs[1][1])); ctx.stroke();
    ctx.setLineDash([]);
    for (const [i, [x, y]] of pairs.entries()) {
      ctx.beginPath(); ctx.arc(toX(x), toY(y), i === 1 ? 5 : 6, 0, Math.PI * 2);
      ctx.fillStyle = i === 1 ? COLORS.accent : '#2F6B57'; ctx.fill();
      ctx.strokeStyle = '#FFFCF6'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    status.textContent = `f′(x₀) = ${fp(x0).toFixed(2)}, f″ = 2, so x₁ = ${x1.toFixed(2)}. The minimum is at x = 2.`;
  }
  slider.addEventListener('input', draw);
  wrap.appendChild(h('div', { class: 'viz-head' },
    h('div', null, h('p', { class: 'viz-title', text: 'One Newton step' }), h('p', { class: 'viz-sub', text: 'f(x) = x² − 4x + 1, constant curvature 2' }))));
  wrap.appendChild(canvas);
  wrap.appendChild(h('div', { class: 'range-row' }, slider, out));
  wrap.appendChild(status);
  requestAnimationFrame(draw);
  return { node: wrap, cleanup() {} };
}

export function gramSchmidtWidget() {
  const wrap = h('div', { class: 'viz' });
  const plot = svg('svg', { viewBox: '0 0 320 260', class: 'vector-plot', role: 'img', 'aria-label': 'Gram-Schmidt orthogonalisation of a1 equals 3,4 and a2 equals 1,2' });
  const status = h('p', { class: 'viz-status', 'aria-live': 'polite' });
  const scale = 34;
  const ox = 40;
  const oy = 220;
  const toXY = (x, y) => [ox + x * scale, oy - y * scale];
  function arrow(x1, y1, x2, y2, color, dash = '') {
    const [a, b] = toXY(x1, y1);
    const [c, d] = toXY(x2, y2);
    const g = svg('g', {});
    g.appendChild(svg('line', { x1: a, y1: b, x2: c, y2: d, stroke: color, 'stroke-width': 2.4, 'stroke-dasharray': dash, 'stroke-linecap': 'round' }));
    const angle = Math.atan2(d - b, c - a);
    g.appendChild(svg('polygon', {
      points: `${c},${d} ${c - 8 * Math.cos(angle - 0.4)},${d - 8 * Math.sin(angle - 0.4)} ${c - 8 * Math.cos(angle + 0.4)},${d - 8 * Math.sin(angle + 0.4)}`,
      fill: color,
    }));
    return g;
  }
  // axes + grid
  for (let i = 0; i <= 5; i++) {
    plot.appendChild(svg('line', { x1: ox + i * scale, y1: 20, x2: ox + i * scale, y2: oy, stroke: COLORS.line, 'stroke-width': 0.8 }));
    plot.appendChild(svg('line', { x1: ox, y1: oy - i * scale, x2: ox + 5.5 * scale, y2: oy - i * scale, stroke: COLORS.line, 'stroke-width': 0.8 }));
  }
  plot.appendChild(svg('line', { x1: ox, y1: oy, x2: ox + 5.4 * scale, y2: oy, stroke: COLORS.muted, 'stroke-width': 1.2 }));
  plot.appendChild(svg('line', { x1: ox, y1: oy, x2: ox, y2: 16, stroke: COLORS.muted, 'stroke-width': 1.2 }));
  plot.appendChild(arrow(0, 0, 3, 4, COLORS.ink));
  plot.appendChild(svgText('a₁ = (3, 4)', { x: toXY(1.6, 4.1)[0], y: toXY(1.6, 4.1)[1], class: 'vector-label' }));
  plot.appendChild(arrow(0, 0, 1, 2, COLORS.thin, '5 4'));
  plot.appendChild(svgText('a₂ = (1, 2)', { x: toXY(1.15, 2.2)[0], y: toXY(1.15, 2.2)[1], class: 'vector-label' }));
  plot.appendChild(arrow(0, 0, 3 / 5, 4 / 5, COLORS.covered));
  plot.appendChild(svgText('q₁', { x: toXY(0.8, 0.8)[0], y: toXY(0.8, 0.8)[1], class: 'vector-label' }));
  plot.appendChild(arrow(3 / 5, 4 / 5, 1, 2, COLORS.accent, '3 3'));
  plot.appendChild(arrow(0, 0, -4 / 5, 3 / 5, COLORS.accent));
  plot.appendChild(svgText('q₂ = (−4/5, 3/5)', { x: toXY(-1.5, 1.1)[0], y: toXY(-1.5, 1.1)[1], class: 'vector-label accent-label' }));
  status.textContent = 'q₁ is the unit direction of a₁. q₂ is the normalised remainder of a₂ after its projection on q₁ is removed. q₁ᵀq₂ = 0.';
  wrap.appendChild(h('div', { class: 'viz-head' },
    h('div', null, h('p', { class: 'viz-title', text: 'Orthogonalise, then normalise' }), h('p', { class: 'viz-sub', text: 'a₁ = (3,4), a₂ = (1,2) — q₁ = (3/5,4/5), q₂ = (−4/5,3/5)' }))));
  wrap.appendChild(plot);
  wrap.appendChild(status);
  return { node: wrap, cleanup() {} };
}

export function optimizerWidget(topicId, topicName = '') {
  const name = String(topicName);
  if (topicId === 't2' || /newton/i.test(name)) return newtonWidget();
  if (topicId === 't5' || /gram/i.test(name)) return gramSchmidtWidget();
  return learningRateWidget();
}
