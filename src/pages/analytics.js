/** analytics.js — learning analytics from real records only. */
import {
  h, icon, button, coverageChip, badge, emptyState, progressBar, srTable,
} from '../ui.js';
import { donutFigure, coverageBars, activityChart, prereqGraph, COLORS } from '../charts.js';
import { getActiveNotebook, recordProgress } from '../state.js';
import { coverageCounts, priorityTopics, examInfo, formatMinutes } from '../shared.js';
import {
  plannedMinutes, sessionMinutes, priorityReason, pct, daysUntil, localDateKey,
} from '../core.js';

const DAY_MS = 86400000;

function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }

export default function renderAnalytics(root, ctx) {
  const nb = getActiveNotebook();
  if (!nb) { ctx.navigate('#/setup'); return () => {}; }
  const byId = new Map(nb.topics.map((t) => [t.id, t]));
  const counts = coverageCounts(nb);
  const planned = plannedMinutes(nb.calendar);
  const completed = sessionMinutes(nb.sessions);
  const pins = nb.revisionPins.length + nb.pinPoints.length;
  const sessions = nb.sessions.length;
  const opened = new Set(nb.opened.map((o) => o.topicId)).size;
  const exam = examInfo(nb);
  const hasHistory = sessions > 0 || nb.progress.length > 1;

  const coverageData = [
    { label: 'Explained', value: counts.covered, color: COLORS.covered },
    { label: 'Only mentioned', value: counts.thin, color: COLORS.thin },
    { label: 'No match found', value: counts.missing, color: COLORS.missing },
  ];

  const stats = [
    ['Syllabus topics', String(counts.total), 'target', 'In notebook order'],
    ['Explained', String(counts.covered), 'check', `${pct(counts.covered, counts.total)}% of the syllabus`],
    ['Only mentioned', String(counts.thin), 'dash', 'Partial note evidence'],
    ['No match found', String(counts.missing), 'search', 'No matching passage'],
    ['Pinned concepts', String(pins), 'pin', 'Topic pins plus point pins'],
    ['Lessons opened', String(opened), 'book', 'Distinct topics in this notebook'],
    ['Sessions completed', String(sessions), 'calendar', 'Logged calendar sessions'],
    ['Study time', `${formatMinutes(completed)} / ${formatMinutes(planned)}`, 'clock', 'Completed vs planned'],
  ];

  const activity = [];
  const today = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = addDays(today, -i);
    const key = localDateKey(d);
    const minutes = nb.sessions.filter((s) => s.date === key).reduce((n, s) => n + s.minutes, 0);
    activity.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, value: minutes, showLabel: i % 2 === 0 });
  }
  const timeline = (nb.progress || []).map((p, i) => ({
    label: p.at ? p.at.slice(8, 10) + '/' + p.at.slice(5, 7) : `#${i + 1}`,
    value: p.covered,
    showLabel: i === 0 || i === (nb.progress || []).length - 1,
  }));
  const sumSessionMinutes = nb.sessions.reduce((n, s) => n + (Number(s.minutes) || 0), 0);
  const averageSession = nb.sessions.length ? Math.round(sumSessionMinutes / nb.sessions.length) : 0;
  const topicMinutes = (() => {
    const map = new Map();
    for (const s of nb.sessions) {
      const t = byId.get(s.topicId);
      if (!t) continue;
      map.set(t.name, (map.get(t.name) || 0) + (Number(s.minutes) || 0));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  })();

  const unitRows = (() => {
    const map = new Map();
    for (const t of nb.topics) {
      const unit = t.unit || 'General';
      if (!map.has(unit)) map.set(unit, { covered: 0, thin: 0, missing: 0, total: 0 });
      const row = map.get(unit);
      row.total += 1;
      row[t.coverage.status] += 1;
    }
    return [...map.entries()];
  })();

  let graphSelected = nb.topics[0]?.id || null;
  const graphHost = h('div', { class: 'graph-host' });
  const graphDetail = h('div', { class: 'graph-detail' });
  function renderGraph() {
    graphHost.replaceChildren(prereqGraph(nb.topics, (id) => { graphSelected = id; renderGraph(); }, graphSelected));
    const t = byId.get(graphSelected);
    if (!t) { graphDetail.replaceChildren(); return; }
    const prereqs = (t.prereqs || []).map((id) => byId.get(id)).filter(Boolean);
    const dependents = nb.topics.filter((x) => (x.prereqs || []).includes(t.id));
    graphDetail.replaceChildren(
      h('p', { class: 'kicker', text: 'Selected topic' }),
      h('div', { class: 'graph-detail-title' }, h('h3', { text: t.name }), coverageChip(t.coverage.status, { small: true })),
      h('p', { class: 'small muted', text: `${t.unit} · weight ${t.weight}/5` }),
      h('p', { class: 'small', text: prereqs.length ? `Requires: ${prereqs.map((p) => p.name).join(', ')}` : 'No prerequisite recorded.' }),
      h('p', { class: 'small', text: dependents.length ? `Unlocks: ${dependents.map((p) => p.name).join(', ')}` : 'No dependent topics recorded.' }),
      button('Open lesson', { size: 'sm', variant: 'ghost', icon: 'book', onClick: () => ctx.navigate(`#/lesson/${t.id}`) }));
  }

  const insights = (() => {
    const rows = [];
    if (counts.missing) rows.push([`${counts.missing} topic${counts.missing === 1 ? ' has' : 's have'} no matching passage in your notes.`, 'search']);
    if (pins) rows.push([`Your revision sheet contains ${pins} pinned concept${pins === 1 ? '' : 's'}.`, 'pin']);
    const tomorrowKey = localDateKey(addDays(today, 1));
    const tomorrow = nb.calendar.filter((e) => e.date === tomorrowKey);
    if (tomorrow.length) rows.push([`${tomorrow.length} planned session${tomorrow.length === 1 ? '' : 's'} scheduled for tomorrow.`, 'calendar']);
    const unopened = nb.topics.filter((t) => !nb.opened.some((o) => o.topicId === t.id));
    if (unopened.length && opened > 0) rows.push([`${unopened.length} topic${unopened.length === 1 ? '' : 's'} not opened as a lesson yet.`, 'book']);
    if (!nb.calendar.length) rows.push(['No study sessions are planned; analytics has no calendar record to analyse.', 'info']);
    if (!pins) rows.push(['No revision points pinned yet; the sheet is waiting.', 'pin']);
    return rows.slice(0, 5);
  })();

  root.appendChild(h('div', { class: 'page analytics-page' },
    h('div', { class: 'page-head' },
      h('div', null,
        h('p', { class: 'kicker', text: 'Progress intelligence' }),
        h('h1', { class: 'page-title', text: 'What the records actually say.' }),
        h('p', { class: 'page-sub', text: 'Coverage, pins, opened lessons and calendar sessions. No estimated “readiness score”, no fabricated trend lines.' })),
      h('div', { class: 'page-head-actions' },
        button('Export notebook', { variant: 'ghost', icon: 'download', onClick: () => ctx.openSettings('data') }),
        button('Plan next session', { icon: 'plus', onClick: () => ctx.navigate('#/calendar') }))),
    exam ? h('div', { class: 'exam-strip card' },
      h('span', { class: 'exam-strip-num', text: String(Math.max(0, exam.days)) }),
      h('div', null, h('strong', { text: exam.days === 1 ? 'day until the examination' : 'days until the examination' }), h('p', { class: 'small muted', text: `${formatDateLongKey(nb.examDate)} · ${counts.missing} uncovered topic${counts.missing === 1 ? '' : 's'}` }))) : null,
    h('div', { class: 'stat-grid four' }, stats.map(([label, value, iconName, meta]) => h('article', { class: 'stat-card card' },
      h('div', { class: 'stat-top' }, h('span', { class: 'stat-icon' }, icon(iconName, 18)), h('span', { class: 'stat-label', text: label })),
      h('strong', { class: 'stat-value sm', text: value }),
      h('span', { class: 'stat-meta', text: meta })))),
    h('div', { class: 'analytics-grid' },
      h('section', { class: 'card' },
        h('div', { class: 'card-head' }, h('div', null, h('p', { class: 'kicker', text: 'Coverage analysis' }), h('h2', { class: 'card-title', text: 'Topic distribution' }))),
        donutFigure(coverageData, { label: 'Topic coverage distribution', centerLabel: 'topics' })),
      h('section', { class: 'card' },
        h('div', { class: 'card-head' }, h('div', null, h('p', { class: 'kicker', text: 'Topic-by-topic' }), h('h2', { class: 'card-title', text: 'Coverage bars' })), badge('Lexical', 'soft')),
        coverageBars(nb.topics.slice(0, 8), { showUnit: false }),
        nb.topics.length > 8 ? h('p', { class: 'small muted', text: `+${nb.topics.length - 8} more topics in the coverage map.` }) : null),
      h('section', { class: 'card' },
        h('div', { class: 'card-head' }, h('div', null, h('p', { class: 'kicker', text: 'Study activity' }), h('h2', { class: 'card-title', text: 'Last 14 days' }))),
        hasHistory ? h('div', null,
          activityChart(activity, { label: 'Completed study minutes over the last 14 days' }),
          srTable('Completed study minutes', ['Day', 'Minutes'], activity.map((a) => [a.label, a.value]))) : emptyState({ iconName: 'chart', title: 'No study sessions logged', text: 'There is no historical data to plot yet. Mark a calendar session done and it appears here.', action: button('Open calendar', { size: 'sm', variant: 'ghost', onClick: () => ctx.navigate('#/calendar') }) }),
        hasHistory ? h('p', { class: 'small muted', text: 'Completed minutes only. Empty days are shown as zero, not smoothed into a trend.' }) : null),
      h('section', { class: 'card' },
        h('div', { class: 'card-head' }, h('div', null, h('p', { class: 'kicker', text: 'Coverage history' }), h('h2', { class: 'card-title', text: 'Explained topics over time' }))),
        timeline.length > 1
          ? h('div', null,
            activityChart(timeline, { label: 'Explained topics over time', unit: 'topics' }),
            h('p', { class: 'small muted', text: 'Snapshots are written when you build or rebuild a workspace and when you request a coverage snapshot.' }))
          : h('p', { class: 'small muted', text: timeline.length === 1 ? 'One snapshot exists. Another is needed before a trend can be drawn.' : 'No coverage history yet. Rebuild the workspace or save a snapshot.' })),
      h('section', { class: 'card' },
        h('div', { class: 'card-head' }, h('div', null, h('p', { class: 'kicker', text: 'Topic allocation' }), h('h2', { class: 'card-title', text: 'Where completed time went' }))),
        topicMinutes.length ? h('div', { class: 'allocation-list' }, topicMinutes.map(([name, minutes]) => h('div', { class: 'allocation-row' },
          h('span', { class: 'allocation-name', text: name }),
          h('span', { class: 'allocation-bar' }, h('span', { class: 'allocation-fill', style: { width: (minutes / Math.max(1, topicMinutes[0][1])) * 100 + '%' } })),
          h('span', { class: 'allocation-value small muted', text: formatMinutes(minutes) })))) : h('p', { class: 'small muted', text: 'No completed sessions have a topic allocation yet.' })),
      h('section', { class: 'card' },
        h('div', { class: 'card-head' }, h('div', null, h('p', { class: 'kicker', text: 'Study time' }), h('h2', { class: 'card-title', text: 'Planned vs completed' }))),
        h('div', { class: 'time-compare' },
          h('div', null, h('span', { class: 'small muted', text: 'Planned' }), h('strong', { text: formatMinutes(planned) })),
          h('div', null, h('span', { class: 'small muted', text: 'Completed' }), h('strong', { text: formatMinutes(completed) })),
          h('div', null, h('span', { class: 'small muted', text: 'Remaining' }), h('strong', { text: formatMinutes(Math.max(0, planned - completed)) }))),
        progressBar(Math.min(completed, Math.max(planned, 1)), Math.max(planned, 1), 'Completed versus planned study minutes'),
        h('p', { class: 'small muted', text: planned ? `${Math.min(100, pct(completed, planned))}% of planned minutes are marked complete.${averageSession ? ` Average completed session: ${averageSession} min.` : ''}` : 'No planned minutes yet — add sessions in the calendar.' })),
      h('section', { class: 'card unit-card' },
        h('div', { class: 'card-head' }, h('div', null, h('p', { class: 'kicker', text: 'Unit-level distribution' }), h('h2', { class: 'card-title', text: 'Where the evidence sits.' }))),
        unitRows.length ? unitRows.map(([unit, row]) => h('div', { class: 'unit-row' },
          h('div', { class: 'unit-row-head' }, h('span', { text: unit }), h('span', { class: 'small muted', text: `${row.total} topics` })),
          h('div', { class: 'unit-bar', role: 'img', 'aria-label': `${unit}: ${row.covered} explained, ${row.thin} only mentioned, ${row.missing} missing` },
            row.covered ? h('span', { class: 'unit-seg covered', style: { width: (row.covered / row.total) * 100 + '%' } }) : null,
            row.thin ? h('span', { class: 'unit-seg thin', style: { width: (row.thin / row.total) * 100 + '%' } }) : null,
            row.missing ? h('span', { class: 'unit-seg missing', style: { width: (row.missing / row.total) * 100 + '%' } }) : null))) : h('p', { class: 'muted', text: 'No units recorded.' }),
        srTable('Unit coverage', ['Unit', 'Explained', 'Only mentioned', 'Missing'], unitRows.map(([unit, row]) => [unit, row.covered, row.thin, row.missing]))),
      h('section', { class: 'card priority-analysis' },
        h('div', { class: 'card-head' }, h('div', null, h('p', { class: 'kicker', text: 'Priority analysis' }), h('h2', { class: 'card-title', text: 'Why these topics come first.' })), badge('Rule-based', 'soft')),
        h('div', { class: 'priority-list' }, priorityTopics(nb).map(({ topic }, i) => h('div', { class: 'priority-row' },
          h('span', { class: 'priority-rank', text: String(i + 1).padStart(2, '0') }),
          h('div', { class: 'priority-copy' },
            h('div', { class: 'priority-title' }, h('strong', { text: topic.name }), coverageChip(topic.coverage.status, { small: true })),
            h('p', { class: 'small muted', text: priorityReason(topic, byId) })),
          button('Open', { size: 'sm', variant: 'ghost', onClick: () => ctx.navigate(`#/lesson/${topic.id}`) })))),
        h('p', { class: 'small muted', text: 'Coverage alone is not exam readiness. The order combines weight, evidence gap and prerequisite order.' })),
      h('section', { class: 'card graph-card' },
        h('div', { class: 'card-head' }, h('div', null, h('p', { class: 'kicker', text: 'Topic relationships' }), h('h2', { class: 'card-title', text: 'Prerequisite graph' })), badge('SVG · keyboard', 'soft')),
        graphHost, graphDetail),
      h('section', { class: 'card insights-card' },
        h('div', { class: 'card-head' }, h('div', null, h('p', { class: 'kicker', text: 'Reflection insights' }), h('h2', { class: 'card-title', text: 'Only what the records support.' }))),
        insights.length ? h('ul', { class: 'insight-list' }, insights.map(([text, iconName]) => h('li', null, icon(iconName, 16), h('span', { text })))) : h('p', { class: 'muted', text: 'Nothing notable yet.' }),
        !nb.progress.length && !nb.sessions.length ? h('p', { class: 'small muted', text: 'No historical trend is reported because no history exists.' }) : null,
        h('div', { class: 'insight-actions' },
          button('Export notebook', { variant: 'ghost', size: 'sm', icon: 'download', onClick: () => ctx.openSettings('data') }),
          nb.kind !== 'demo' ? button('Snapshot coverage now', { variant: 'ghost', size: 'sm', icon: 'refresh', onClick: () => { recordProgress(nb); toast('Coverage snapshot added to progress history.', 'good'); ctx.rerender(); } }) : null)))));

  renderGraph();
  ctx.refreshShell?.();
  return () => {};
}

function formatDateLongKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || '');
  if (!m) return key || '';
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}
