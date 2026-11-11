/** dashboard.js — the study command centre, driven entirely by notebook records. */
import {
  h, icon, button, coverageChip, mathNode, badge, progressBar, emptyState, toast, srTable,
} from '../ui.js';
import { donutFigure, groupedBars, COLORS } from '../charts.js';
import {
  getActiveNotebook, getActiveProfile, saveNotebook, recordProgress,
  toggleTopicPin, exitDemo,
} from '../state.js';
import {
  coverageCounts, priorityTopics, recentTopics, plannedFutureMinutes, examInfo,
  ensureLesson, formatMinutes, formatDateLong,
} from '../shared.js';
import { priorityReason, plannedMinutes, completedMinutes, pct } from '../core.js';
import { recomputeCoverage } from '../services.js';

const DAY_MS = 86400000;

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfWeek(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}

function studySeries(nb, mode) {
  const events = nb.calendar || [];
  const sessions = nb.sessions || [];
  const now = new Date();
  const items = [];
  if (mode === 'daily') {
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const key = dateKey(d);
      items.push({
        label: d.toLocaleDateString(undefined, { weekday: 'short' }),
        showLabel: true,
        planned: events.filter((e) => e.date === key).reduce((n, e) => n + e.duration, 0),
        completed: sessions.filter((s) => s.date === key).reduce((n, s) => n + s.minutes, 0),
      });
    }
    return items;
  }
  if (mode === 'weekly') {
    for (let i = 5; i >= 0; i--) {
      const start = startOfWeek(now);
      start.setDate(start.getDate() - i * 7);
      const end = new Date(start.getTime() + 6 * DAY_MS);
      const sk = dateKey(start);
      const ek = dateKey(end);
      items.push({
        label: `${start.getDate()}/${start.getMonth() + 1}`,
        showLabel: true,
        planned: events.filter((e) => e.date >= sk && e.date <= ek).reduce((n, e) => n + e.duration, 0),
        completed: sessions.filter((s) => s.date >= sk && s.date <= ek).reduce((n, s) => n + s.minutes, 0),
      });
    }
    return items;
  }
  const keys = [...events.map((e) => e.date), ...sessions.map((s) => s.date)].filter(Boolean).sort();
  if (!keys.length) return [];
  const first = new Date(keys[0] + 'T12:00:00');
  const last = new Date(keys[keys.length - 1] + 'T12:00:00');
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime())) return [];
  const days = Math.min(28, Math.max(1, Math.round((last - first) / DAY_MS) + 1));
  for (let i = 0; i < days; i++) {
    const d = new Date(first.getTime() + i * DAY_MS);
    const key = dateKey(d);
    items.push({
      label: `${d.getDate()}/${d.getMonth() + 1}`,
      showLabel: days <= 14 || i % 2 === 0,
      planned: events.filter((e) => e.date === key).reduce((n, e) => n + e.duration, 0),
      completed: sessions.filter((s) => s.date === key).reduce((n, s) => n + s.minutes, 0),
    });
  }
  return items;
}

export default function renderDashboard(root, ctx) {
  const nb = getActiveNotebook();
  if (!nb) { ctx.navigate('#/setup'); return () => {}; }
  const profile = getActiveProfile();
  const counts = coverageCounts(nb);
  const byId = new Map(nb.topics.map((t) => [t.id, t]));
  const pins = (nb.revisionPins?.length || 0) + (nb.pinPoints?.length || 0);
  const futureMinutes = plannedFutureMinutes(nb);
  const exam = examInfo(nb);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const recent = recentTopics(nb, 3);
  const priority = priorityTopics(nb);
  const fallbackTopic = priority[0]?.topic || nb.topics[0];
  const continueTopic = recent[0] || fallbackTopic;
  const anyPins = nb.revisionPins?.length || 0;

  const upcoming = [...(nb.calendar || [])]
    .filter((e) => !e.done && e.date >= dateKey(new Date()))
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))[0] || null;
  const nextTopic = upcoming ? byId.get(upcoming.topicId) : null;
  const todayKey = dateKey(new Date());
  const todayEvents = (nb.calendar || []).filter((e) => e.date === todayKey).sort((a, b) => a.start.localeCompare(b.start));

  const goLesson = (id) => ctx.navigate(`#/lesson/${id}`);
  const openSheet = () => ctx.navigate('#/sheet');

  const coverageData = [
    { label: 'Explained', value: counts.covered, color: COLORS.covered },
    { label: 'Only mentioned', value: counts.thin, color: COLORS.thin },
    { label: 'No match found', value: counts.missing, color: COLORS.missing },
  ];

  const statCards = [
    {
      label: 'Syllabus coverage', value: `${pct(counts.covered, counts.total)}%`, icon: 'target',
      meta: `${counts.covered} of ${counts.total} topics fully explained`,
      extra: progressBar(counts.covered, counts.total, 'Syllabus coverage'),
    },
    { label: 'Explained topics', value: String(counts.covered), icon: 'check', meta: 'Notes contain meaningful explanation' },
    { label: 'Only mentioned', value: String(counts.thin), icon: 'dash', meta: 'Partial or shallow note evidence' },
    { label: 'No match found', value: String(counts.missing), icon: 'search', meta: 'No matching passage in your notes' },
    { label: 'Pinned revision points', value: String(pins), icon: 'pin', meta: anyPins ? `${anyPins} topic${anyPins === 1 ? '' : 's'} pinned` : 'Pin from any lesson' },
    { label: 'Remaining study time', value: formatMinutes(futureMinutes), icon: 'clock', meta: 'Planned sessions still ahead' },
  ];

  const chartState = { mode: 'daily' };
  const chartHost = h('div', { class: 'chart-host' });
  const chartSummary = h('p', { class: 'small muted chart-summary' });
  const tabs = h('div', { class: 'segmented small', role: 'tablist', 'aria-label': 'Study time range' });
  const renderChart = () => {
    for (const b of tabs.querySelectorAll('button')) {
      const active = b.dataset.mode === chartState.mode;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    }
    const series = studySeries(nb, chartState.mode);
    chartHost.replaceChildren();
    if (!series.length || series.every((s) => !s.planned && !s.completed)) {
      chartHost.appendChild(emptyState({
        iconName: 'calendar', title: 'No study time recorded yet',
        text: 'Plan a session in the calendar. Completed minutes appear when you tick a session done.',
        action: button('Plan a session', { size: 'sm', variant: 'ghost', icon: 'plus', onClick: () => ctx.navigate('#/calendar') }),
      }));
      chartSummary.textContent = '';
      return;
    }
    chartHost.appendChild(groupedBars(series));
    chartHost.appendChild(srTable('Study time by period', ['Period', 'Planned minutes', 'Completed minutes'],
      series.map((s) => [s.label, s.planned, s.completed])));
    const planned = series.reduce((n, s) => n + s.planned, 0);
    const done = series.reduce((n, s) => n + s.completed, 0);
    chartSummary.textContent = `${formatMinutes(planned)} planned · ${formatMinutes(done)} completed in this range. Planned comes from calendar events; completed from sessions you marked done.`;
  };
  for (const [mode, label] of [['daily', 'Daily'], ['weekly', 'Weekly'], ['plan', 'Plan']]) {
    const b = h('button', { type: 'button', role: 'tab', 'data-mode': mode, 'aria-selected': mode === chartState.mode ? 'true' : 'false', text: label });
    b.addEventListener('click', () => { chartState.mode = mode; renderChart(); });
    tabs.appendChild(b);
  }

  const quickActions = [
    ['Add lecture notes', 'book', () => ctx.navigate('#/setup')],
    ['Update syllabus', 'clipboard', () => ctx.navigate('#/setup')],
    ['Generate topic map', 'refresh', () => {
      if (nb.kind === 'demo') {
        toast('The curated demo keeps its reviewed coverage verdicts. Open your own workspace to re-run matching.', 'info');
        return;
      }
      recomputeCoverage(nb);
      recordProgress(nb);
      toast('Coverage recomputed against the current note chunks.', 'good');
      ctx.rerender();
    }],
    ['Start practice', 'target', () => ctx.navigate('#/practice')],
    ['Open revision sheet', 'clipboard', openSheet],
    ['Plan study session', 'calendar', () => {
      try { sessionStorage.setItem('vx3.openNewSession', '1'); } catch { /* sessionStorage blocked */ }
      ctx.navigate('#/calendar');
    }],
  ];

  const page = h('div', { class: 'page dashboard-page' });

  page.appendChild(h('div', { class: 'page-head dashboard-head' },
    h('div', null,
      h('p', { class: 'kicker', text: `${greeting}${profile ? ', ' + profile.name : ''} · ${nb.kind === 'demo' ? 'Curated demo' : nb.title}` }),
      h('h1', { class: 'page-title', text: "Let's make this study session count." }),
      h('p', { class: 'page-sub', text: exam ? `Examination in ${exam.label} (${formatDateLong(nb.examDate)}). ${counts.missing} topics have no matching passage in your notes.` : `${counts.missing} topics have no matching passage in your notes. Set an exam date in Settings to see a countdown.` })),
    h('div', { class: 'page-head-actions' },
      continueTopic ? button('Continue studying', { icon: 'play', onClick: () => goLesson(continueTopic.id) }) : null,
      button('Open sheet', { variant: 'ghost', icon: 'clipboard', onClick: openSheet }))));

  page.appendChild(h('div', { class: 'stat-grid' }, statCards.map((s) => h('article', { class: 'stat-card card' },
    h('div', { class: 'stat-top' }, h('span', { class: 'stat-icon' }, icon(s.icon, 18)), h('span', { class: 'stat-label', text: s.label })),
    h('strong', { class: 'stat-value', text: s.value }),
    h('span', { class: 'stat-meta', text: s.meta }),
    s.extra || null))));

  page.appendChild(h('div', { class: 'dashboard-grid' },
    h('section', { class: 'card coverage-card' },
      h('div', { class: 'card-head' },
        h('div', null, h('p', { class: 'kicker', text: 'Syllabus coverage' }), h('h2', { class: 'card-title', text: 'Evidence, not confidence.' })),
        button('Full map', { size: 'sm', variant: 'ghost', icon: 'arrow', onClick: () => ctx.navigate('#/coverage') })),
      donutFigure(coverageData, { label: 'Coverage distribution', centerLabel: 'topics' }),
      h('p', { class: 'small muted', text: 'A topic counts as explained only when note evidence contains a meaningful explanation. Matched rows open the verbatim excerpt.' })),
    h('section', { class: 'card study-card' },
      h('div', { class: 'card-head' },
        h('div', null, h('p', { class: 'kicker', text: 'Study time' }), h('h2', { class: 'card-title', text: 'Planned versus completed.' })),
        tabs),
      chartHost,
      chartSummary,
      h('div', { class: 'chart-key' },
        h('span', null, h('i', { class: 'key-swatch planned' }), 'Planned'),
        h('span', null, h('i', { class: 'key-swatch completed' }), 'Completed')))));

  page.appendChild(h('div', { class: 'dashboard-grid lower' },
    h('section', { class: 'card priority-card' },
      h('div', { class: 'card-head' },
        h('div', null, h('p', { class: 'kicker', text: 'Priority topics' }), h('h2', { class: 'card-title', text: 'What needs attention first.' })),
        h('span', { class: 'badge badge-soft', text: 'Rule-based' })),
      priority.length ? h('div', { class: 'priority-list' }, priority.map(({ topic, prereqs }, i) => h('div', { class: 'priority-row' },
        h('span', { class: 'priority-rank', text: String(i + 1).padStart(2, '0') }),
        h('div', { class: 'priority-copy' },
          h('div', { class: 'priority-title' }, h('button', { type: 'button', class: 'link-button', text: topic.name, onClick: () => goLesson(topic.id) }), coverageChip(topic.coverage.status, { small: true })),
          h('p', { class: 'small muted', text: priorityReason(topic, byId) }),
          prereqs.length ? h('p', { class: 'small', text: `Study ${prereqs.map((p) => p.name).join(', ')} first.` }) : null),
        button('Study', { size: 'sm', variant: 'ghost', onClick: () => goLesson(topic.id) })))) : emptyState({ iconName: 'target', title: 'No topics yet', text: 'Add notes and a syllabus to build the map.', action: button('Open setup', { size: 'sm', onClick: () => ctx.navigate('#/setup') }) }),
      h('p', { class: 'small muted priority-foot', text: 'Ordered by exam weight, coverage gap and prerequisites. Not an AI prediction.' })),
    h('section', { class: 'card today-card' },
      h('div', { class: 'card-head' },
        h('div', null, h('p', { class: 'kicker', text: 'Today' }), h('h2', { class: 'card-title', text: todayEvents.length ? `${todayEvents.length} planned session${todayEvents.length === 1 ? '' : 's'}.` : 'A clear day.' })),
        button('Calendar', { size: 'sm', variant: 'ghost', icon: 'calendar', onClick: () => ctx.navigate('#/calendar') })),
      todayEvents.length ? h('div', { class: 'today-list' }, todayEvents.map((e) => {
        const t = byId.get(e.topicId);
        return h('div', { class: `today-row${e.done ? ' done' : ''}` },
          h('span', { class: 'today-time', text: e.start }),
          h('div', { class: 'grow' }, h('button', { type: 'button', class: 'link-button', text: t?.name || 'Unknown topic', onClick: () => ctx.navigate('#/calendar') }), h('span', { class: 'small muted', text: `${e.duration} min · ${e.type}` })),
          e.done ? badge('Done', 'good') : badge('Planned', 'soft'));
      })) : h('div', { class: 'next-session' },
        nextTopic ? h('div', null,
          h('p', { class: 'small muted', text: 'Next planned session' }),
          h('strong', { text: nextTopic.name }),
          h('p', { class: 'small muted', text: `${formatDateLong(upcoming.date)} · ${upcoming.start} · ${upcoming.duration} min` })) : h('p', { class: 'small muted', text: 'No future sessions planned. Use the calendar to place one.' }),
        button('Plan', { size: 'sm', variant: 'ghost', icon: 'plus', onClick: () => ctx.navigate('#/calendar') })),
      exam ? h('div', { class: 'countdown-card' },
        h('span', { class: 'countdown-number', text: String(Math.max(0, exam.days)) }),
        h('div', null, h('strong', { text: exam.days === 1 ? 'day until the exam' : 'days until the exam' }), h('p', { class: 'small muted', text: formatDateLong(nb.examDate) }))) : null)));

  page.appendChild(h('section', { class: 'continue-section' },
    h('div', { class: 'section-head-row' },
      h('div', null, h('p', { class: 'kicker', text: 'Continue learning' }), h('h2', { class: 'section-title sm', text: 'Pick up where you stopped.' })),
      button('All lessons', { size: 'sm', variant: 'ghost', icon: 'book', onClick: () => ctx.navigate('#/coverage') })),
    h('div', { class: 'continue-grid' }, recent.length ? recent.map((t) => {
      const lesson = t.lesson || ensureLesson(nb, t);
      return h('article', { class: 'continue-card card' },
        h('div', { class: 'continue-top' }, coverageChip(t.coverage.status, { small: true }), h('span', { class: 'small muted', text: t.unit })),
        h('h3', { text: t.name }),
        h('p', { class: 'small', text: lesson?.takeaway || lesson?.oneLiner || 'Open the lesson to build its explanation.' }),
        h('div', { class: 'continue-foot' }, button('Continue', { size: 'sm', variant: 'ghost', icon: 'arrow', onClick: () => goLesson(t.id) })));
    }) : priority.slice(0, 3).map(({ topic }) => {
      const lesson = topic.lesson || ensureLesson(nb, topic);
      return h('article', { class: 'continue-card card' },
        h('div', { class: 'continue-top' }, coverageChip(topic.coverage.status, { small: true }), h('span', { class: 'small muted', text: topic.unit })),
        h('h3', { text: topic.name }),
        h('p', { class: 'small', text: lesson?.takeaway || lesson?.oneLiner || 'Open the lesson to build its explanation.' }),
        h('div', { class: 'continue-foot' }, button('Start lesson', { size: 'sm', variant: 'ghost', icon: 'arrow', onClick: () => goLesson(topic.id) })));
    }))));

  page.appendChild(h('section', { class: 'quick-section' },
    h('div', { class: 'section-head-row' }, h('div', null, h('p', { class: 'kicker', text: 'Quick actions' }), h('h2', { class: 'section-title sm', text: 'Everything one click away.' }))),
    h('div', { class: 'quick-grid' }, quickActions.map(([label, iconName, fn]) => h('button', { type: 'button', class: 'quick-action', onClick: fn },
      h('span', { class: 'quick-icon' }, icon(iconName, 20)), h('span', { text: label }), icon('arrowUpRight', 14))))));

  root.appendChild(page);
  renderChart();
  ctx.refreshShell?.();
  return () => {};
}
