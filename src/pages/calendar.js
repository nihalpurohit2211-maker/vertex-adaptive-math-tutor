/** calendar.js — playful, accessible study calendar with ripple date selection. */
import {
  h, icon, button, badge, coverageChip, emptyState, toast, announce, openDialog, setBusy,
} from '../ui.js';
import {
  getActiveNotebook, addEvent, updateEvent, removeEvent, toggleEventDone,
} from '../state.js';
import { localDateKey, parseDateKey, priorityReason, SESSION_TYPES, SESSION_TYPE_LABEL, formatMinutes, sessionMinutes, plannedMinutes } from '../core.js';
import { priorityTopics, examInfo, formatDateLong, formatDateShort } from '../shared.js';

const DAY_MS = 86400000;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function monthStart(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
function startOfWeek(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }

export default function renderCalendar(root, ctx) {
  const nb = getActiveNotebook();
  if (!nb) { ctx.navigate('#/setup'); return () => {}; }
  const byId = new Map(nb.topics.map((t) => [t.id, t]));
  const today = new Date();
  const state = {
    view: 'month',
    cursor: new Date(today.getFullYear(), today.getMonth(), 1),
    selected: localDateKey(today),
  };
  const timers = [];
  const cellsById = new Map();
  const gridHost = h('div', { class: 'cal-grid-host' });
  const detailHost = h('aside', { class: 'cal-detail', id: 'day-detail' });
  const label = h('h2', { class: 'cal-label', text: '' });
  const statsHost = h('div', { class: 'cal-stats' });
  const upcomingHost = h('div', { class: 'cal-upcoming' });
  let addBtn = null;

  const eventsOn = (key) => (nb.calendar || []).filter((e) => e.date === key).sort((a, b) => a.start.localeCompare(b.start));
  const monthLabel = () => state.view === 'month'
    ? `${MONTHS[state.cursor.getMonth()]} ${state.cursor.getFullYear()}`
    : state.view === 'week'
      ? `${formatDateShort(localDateKey(startOfWeek(state.cursor)))} – ${formatDateShort(localDateKey(addDays(startOfWeek(state.cursor), 6)))}`
      : formatDateLong(state.selected);

  function setSelected(key, sourceCell = null, pointer = null) {
    state.selected = key;
    const d = parseDateKey(key);
    if (d) {
      if (state.view === 'month') {
        if (d.getMonth() !== state.cursor.getMonth() || d.getFullYear() !== state.cursor.getFullYear()) {
          state.cursor = new Date(d.getFullYear(), d.getMonth(), 1);
          drawGrid();
        }
      } else {
        state.cursor = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      }
    }
    for (const [id, cell] of cellsById) {
      const selected = id === key;
      cell.classList.toggle('selected', selected);
      cell.setAttribute('aria-current', selected ? 'date' : 'false');
    }
    label.textContent = monthLabel();
    drawDetail();
    announce(`${formatDateLong(key)} selected. ${eventsOn(key).length} session${eventsOn(key).length === 1 ? '' : 's'}.`);
    if (sourceCell) animateSelection(sourceCell, pointer);
  }

  function animateSelection(cell, pointer) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = cell.getBoundingClientRect();
    const x = pointer ? Math.min(rect.width, Math.max(0, pointer.clientX - rect.left)) : rect.width / 2;
    const y = pointer ? Math.min(rect.height, Math.max(0, pointer.clientY - rect.top)) : rect.height / 2;
    const ripple = h('span', { class: 'cal-ripple', 'aria-hidden': 'true' });
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    cell.appendChild(ripple);
    const symbols = ['∑', '∇', '∫', 'π', 'λ'];
    symbols.forEach((sym, i) => {
      const p = h('span', { class: 'cal-particle', 'aria-hidden': 'true', text: sym });
      p.style.left = x + 'px';
      p.style.top = y + 'px';
      p.style.setProperty('--dx', `${Math.cos((i / symbols.length) * Math.PI * 2) * (26 + i * 7)}px`);
      p.style.setProperty('--dy', `${Math.sin((i / symbols.length) * Math.PI * 2) * (22 + i * 6)}px`);
      cell.appendChild(p);
    });
    cell.classList.add('lift');
    timers.push(setTimeout(() => {
      cell.classList.remove('lift');
      ripple.remove();
      cell.querySelectorAll('.cal-particle').forEach((p) => p.remove());
    }, 760));
  }

  function drawGrid() {
    gridHost.replaceChildren();
    cellsById.clear();
    const focusKey = state.selected;
    if (state.view === 'month') {
      gridHost.appendChild(h('div', { class: 'cal-dow-row', 'aria-hidden': 'true' }, DOW.map((d) => h('span', { text: d }))));
      const grid = h('div', { class: 'cal-month-grid' });
      const first = monthStart(state.cursor);
      const offset = (first.getDay() + 6) % 7;
      const start = addDays(first, -offset);
      for (let i = 0; i < 42; i++) {
        const d = addDays(start, i);
        const key = localDateKey(d);
        const dayEvents = eventsOn(key);
        const otherMonth = d.getMonth() !== state.cursor.getMonth();
        const cell = h('button', {
          type: 'button',
          class: `cal-cell${otherMonth ? ' other-month' : ''}${sameDay(d, today) ? ' today' : ''}${key === state.selected ? ' selected' : ''}${dayEvents.length ? ' has-events' : ''}`,
          'data-date': key,
          'aria-label': `${formatDateLong(key)}${dayEvents.length ? `, ${dayEvents.length} study session${dayEvents.length === 1 ? '' : 's'}` : ', no sessions'}`,
          'aria-current': key === state.selected ? 'date' : 'false',
          draggable: 'false',
        },
          h('span', { class: 'cal-daynum', text: String(d.getDate()) }),
          h('span', { class: 'cal-cell-events' }, dayEvents.slice(0, 3).map((ev) => {
            const t = byId.get(ev.topicId);
            return h('span', { class: `cal-event ev-${ev.type}${ev.done ? ' done' : ''}`, title: `${ev.start} ${t?.name || ''}` },
              h('i', { class: 'ev-dot' }), h('span', { class: 'ev-name', text: t?.name || 'Session' }));
          })),
          dayEvents.length > 3 ? h('span', { class: 'cal-more', text: `+${dayEvents.length - 3}` }) : null,
          h('span', { class: 'cal-cell-dot', 'aria-hidden': 'true' }));
        cell.addEventListener('click', (e) => setSelected(key, cell, e));
        cell.addEventListener('keydown', (e) => {
          if (['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
            e.preventDefault();
            const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' ? 7 : -7;
            const nextKey = localDateKey(addDays(d, delta));
            state.selected = nextKey;
            const target = gridHost.querySelector(`[data-date="${nextKey}"]`);
            if (target) { target.focus(); target.click(); }
            else { setSelected(nextKey); drawGrid(); }
          }
        });
        cell.addEventListener('dragover', (e) => { e.preventDefault(); cell.classList.add('drag-over'); });
        cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
        cell.addEventListener('drop', (e) => {
          e.preventDefault();
          cell.classList.remove('drag-over');
          const id = e.dataTransfer?.getData('text/vertex-event');
          if (id) moveEventTo(id, key);
        });
        cellsById.set(key, cell);
        grid.appendChild(cell);
      }
      gridHost.appendChild(grid);
      gridHost.appendChild(h('p', { class: 'cal-hint small muted' }, icon('info', 13), 'Click a date for the day panel. Drag a session card from the day panel onto another date, or use the move buttons for a keyboard alternative.'));
      const focusCell = cellsById.get(focusKey);
      if (focusCell && document.activeElement?.closest('.cal-month-grid')) focusCell.focus();
    } else if (state.view === 'week') {
      const start = startOfWeek(state.cursor);
      const week = h('div', { class: 'cal-week' });
      for (let i = 0; i < 7; i++) {
        const d = addDays(start, i);
        const key = localDateKey(d);
        const list = eventsOn(key);
        const col = h('div', { class: `week-col${key === state.selected ? ' selected' : ''}${sameDay(d, today) ? ' today' : ''}` },
          h('button', { type: 'button', class: 'week-head', onClick: (e) => setSelected(key, e.currentTarget.closest('.week-col'), e) },
            h('span', { class: 'week-dow', text: DOW[i] }),
            h('span', { class: 'week-date', text: String(d.getDate()) }),
            list.length ? h('span', { class: 'week-count', text: `${list.length}` }) : null),
          h('div', { class: 'week-events' }, list.length ? list.map((ev) => {
            const t = byId.get(ev.topicId);
            return h('button', { type: 'button', class: `week-event ev-${ev.type}${ev.done ? ' done' : ''}`, onClick: () => setSelected(key, null), title: t?.name || '' },
              h('span', { class: 'week-time', text: ev.start }),
              h('span', { class: 'week-topic', text: t?.name || 'Session' }),
              h('span', { class: 'week-dur', text: `${ev.duration}m` }));
          }) : h('p', { class: 'week-empty small muted', text: 'No sessions' })));
        cellsById.set(key, col);
        week.appendChild(col);
      }
      gridHost.appendChild(week);
      gridHost.appendChild(h('p', { class: 'cal-hint small muted' }, icon('info', 13), 'Select a weekday header to open that day’s plan.'));
    } else {
      const key = state.selected;
      const list = eventsOn(key);
      gridHost.appendChild(h('div', { class: 'cal-day-view' },
        h('div', { class: 'cal-day-head' },
          h('h2', { text: 'Day plan' }),
          h('p', { class: 'small muted', text: list.length ? `${list.length} session${list.length === 1 ? '' : 's'} · ${formatMinutes(list.reduce((n, e) => n + e.duration, 0))} planned` : 'No sessions planned.' })),
        list.length ? h('div', { class: 'day-timeline' }, list.map((ev) => {
          const t = byId.get(ev.topicId);
          return h('button', { type: 'button', class: `day-event ev-${ev.type}${ev.done ? ' done' : ''}`, onClick: () => drawDetail() },
            h('span', { class: 'day-time', text: ev.start }),
            h('span', { class: 'day-line' }),
            h('span', { class: 'day-info' },
              h('strong', { text: t?.name || 'Session' }),
              h('span', { class: 'small muted', text: `${SESSION_TYPE_LABEL[ev.type]} · ${ev.duration} min · priority ${ev.priority}` }),
              ev.notes ? h('span', { class: 'small', text: ev.notes }) : null),
            ev.done ? badge('Done', 'good') : badge('Planned', 'soft'));
        })) : emptyState({ iconName: 'calendar', title: 'A clear day', text: 'Add a study session or pick a suggestion from the panel.' }),
        h('p', { class: 'small muted', text: 'Month, week and day views read the same calendar records.' })));
    }
    if (!cellsById.has(state.selected)) {
      // keep selection visible even if it falls outside the rendered grid
      const cell = gridHost.querySelector(`[data-date="${state.selected}"]`);
      if (cell) cellsById.set(state.selected, cell);
    }
    label.textContent = monthLabel();
  }

  function moveEventTo(id, date) {
    const ev = (nb.calendar || []).find((e) => e.id === id);
    if (!ev) return;
    updateEvent(nb, id, { date });
    state.selected = date;
    toast(`Session moved to ${formatDateShort(date)}.`, 'good');
    refreshAll();
    announce(`Session moved to ${formatDateLong(date)}.`);
  }

  function drawDetail() {
    const key = state.selected;
    const list = eventsOn(key);
    detailHost.replaceChildren();
    const date = parseDateKey(key);
    const exam = examInfo(nb);
    const total = list.reduce((n, e) => n + e.duration, 0);
    detailHost.appendChild(h('div', { class: 'cal-detail-head' },
      h('div', null,
        h('p', { class: 'kicker', text: 'Day detail' }),
        h('h2', { class: 'cal-detail-date', text: date ? date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) : key }),
        h('p', { class: 'small muted', text: list.length ? `${formatMinutes(total)} planned · ${list.filter((e) => e.done).length} completed` : 'Nothing planned yet.' })),
      button('Add session', { size: 'sm', icon: 'plus', onClick: () => openSessionDialog({ date: key }) })));

    if (list.length) {
      const wrap = h('div', { class: 'session-list' });
      for (const ev of list) {
        const t = byId.get(ev.topicId);
        const card = h('article', { class: `session-card${ev.done ? ' done' : ''}`, draggable: 'true' },
          h('div', { class: 'session-top' },
            h('span', { class: `session-type-badge ev-${ev.type}`, text: SESSION_TYPE_LABEL[ev.type] }),
            h('span', { class: 'session-time', text: `${ev.start} · ${ev.duration} min` }),
            h('span', { class: `priority-pill p${ev.priority}`, text: ev.priority === 3 ? 'High' : ev.priority === 2 ? 'Normal' : 'Low' })),
          h('div', { class: 'session-body' },
            h('button', { type: 'button', class: 'link-button session-topic', text: t?.name || 'Unknown topic', onClick: () => ctx.navigate(`#/lesson/${ev.topicId}`) }),
            t ? coverageChip(t.coverage.status, { small: true }) : null),
          ev.notes ? h('p', { class: 'session-notes small', text: ev.notes }) : null,
          h('div', { class: 'session-actions' },
            h('button', {
              type: 'button', class: `btn btn-sm ${ev.done ? 'btn-ghost' : 'btn-primary'}`, 'aria-pressed': ev.done ? 'true' : 'false',
              onClick: () => { toggleEventDone(nb, ev.id); toast(ev.done ? 'Marked as planned again.' : 'Session logged as completed.', 'good'); refreshAll(); },
            }, icon(ev.done ? 'check' : 'play', 13), h('span', { text: ev.done ? 'Completed' : 'Mark done' })),
            h('button', { type: 'button', class: 'icon-btn session-ctrl', title: 'Move to previous day', 'aria-label': 'Move to previous day', onClick: () => moveEventTo(ev.id, localDateKey(addDays(parseDateKey(ev.date), -1))) }, icon('chevronLeft', 15)),
            h('button', { type: 'button', class: 'icon-btn session-ctrl', title: 'Move to next day', 'aria-label': 'Move to next day', onClick: () => moveEventTo(ev.id, localDateKey(addDays(parseDateKey(ev.date), 1))) }, icon('chevronRight', 15)),
            button('Lesson', { size: 'sm', variant: 'ghost', icon: 'book', onClick: () => ctx.navigate(`#/lesson/${ev.topicId}`) }),
            h('button', { type: 'button', class: 'icon-btn session-ctrl danger', title: 'Delete session', 'aria-label': 'Delete session', onClick: () => { removeEvent(nb, ev.id); toast('Session removed.', 'info'); refreshAll(); } }, icon('trash', 15))));
        card.addEventListener('dragstart', (e) => {
          e.dataTransfer?.setData('text/vertex-event', ev.id);
          if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
          card.classList.add('dragging');
        });
        card.addEventListener('dragend', () => card.classList.remove('dragging'));
        wrap.appendChild(card);
      }
      detailHost.appendChild(wrap);
    } else {
      detailHost.appendChild(h('div', { class: 'day-empty' },
        icon('calendar', 24),
        h('p', { text: 'No sessions on this date.' }),
        button('Plan this day', { size: 'sm', variant: 'ghost', icon: 'plus', onClick: () => openSessionDialog({ date: key }) })));
    }

    const suggestions = priorityTopics(nb).slice(0, 3);
    if (suggestions.length) {
      detailHost.appendChild(h('div', { class: 'cal-suggestions' },
        h('div', { class: 'mini-head' }, h('p', { class: 'kicker', text: 'Suggestions' }), badge('Rule-based', 'soft')),
        suggestions.map(({ topic }) => {
          const type = topic.coverage.status === 'not_found' ? 'gaps' : topic.coverage.status === 'thin' ? 'numerical' : 'exam';
          return h('div', { class: 'suggestion' },
            h('div', { class: 'suggestion-main' },
              h('strong', { text: topic.name }),
              h('p', { class: 'small muted', text: priorityReason(topic, byId) }),
              h('p', { class: 'small', text: `Suggested: ${SESSION_TYPE_LABEL[type]} · 30 min` })),
            button('Plan', { size: 'sm', variant: 'ghost', icon: 'plus', onClick: () => openSessionDialog({ date: key, topicId: topic.id, type, duration: 30 }) }));
        }),
        h('p', { class: 'small muted', text: 'Suggestions use coverage status, exam weight and prerequisites. They are a heuristic, not an AI prediction.' })));
    }
    if (exam) {
      detailHost.appendChild(h('div', { class: 'cal-exam' },
        h('span', { class: 'cal-exam-num', text: String(Math.max(0, exam.days)) }),
        h('div', null, h('strong', { text: exam.days === 1 ? 'day to the exam' : 'days to the exam' }), h('p', { class: 'small muted', text: formatDateLong(nb.examDate) }))));
    }
  }

  function refreshAll() {
    drawGrid();
    drawDetail();
    drawStats();
    drawUpcoming();
    if (addBtn) addBtn.disabled = !(nb.topics || []).length;
  }

  function drawStats() {
    const planned = plannedMinutes(nb.calendar);
    const done = sessionMinutes(nb.sessions);
    const remaining = Math.max(0, planned - done);
    statsHost.replaceChildren(
      h('div', { class: 'cal-stat' }, h('span', { text: 'Planned' }), h('strong', { text: formatMinutes(planned) })),
      h('div', { class: 'cal-stat' }, h('span', { text: 'Completed' }), h('strong', { text: formatMinutes(done) })),
      h('div', { class: 'cal-stat' }, h('span', { text: 'Remaining' }), h('strong', { text: formatMinutes(remaining) })),
      h('div', { class: 'cal-stat' }, h('span', { text: 'Sessions' }), h('strong', { text: String(nb.calendar.length) })));
  }

  function drawUpcoming() {
    const todayKey = localDateKey(today);
    const upcoming = [...nb.calendar].filter((e) => !e.done && e.date >= todayKey).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)).slice(0, 4);
    upcomingHost.replaceChildren();
    upcomingHost.appendChild(h('div', { class: 'mini-head' }, h('p', { class: 'kicker', text: 'Upcoming sessions' }), button('Add', { size: 'sm', variant: 'ghost', icon: 'plus', onClick: () => openSessionDialog({ date: todayKey }) })));
    if (!upcoming.length) {
      upcomingHost.appendChild(h('p', { class: 'small muted', text: 'Nothing scheduled ahead. Use a suggestion or add a session.' }));
    } else {
      for (const ev of upcoming) {
        const t = byId.get(ev.topicId);
        upcomingHost.appendChild(h('button', { type: 'button', class: 'upcoming-row', onClick: () => { state.selected = ev.date; state.cursor = parseDateKey(ev.date); drawGrid(); drawDetail(); } },
          h('span', { class: 'upcoming-date' }, h('strong', { text: ev.date.slice(8) }), h('small', { text: MONTHS[Number(ev.date.slice(5, 7)) - 1].slice(0, 3) })),
          h('span', { class: 'upcoming-copy' }, h('strong', { text: t?.name || 'Session' }), h('span', { class: 'small muted', text: `${ev.start} · ${ev.duration} min · ${SESSION_TYPE_LABEL[ev.type]}` }))));
      }
    }
  }

  function openSessionDialog({ date = state.selected, topicId = '', type = '', duration = 45 } = {}) {
    const topics = nb.topics;
    if (!topics.length) {
      toast('Add topics to the workspace before planning a session.', 'error');
      return;
    }
    const topicSelect = h('select', { class: 'select', id: 'session-topic' }, topics.map((t) => h('option', { value: t.id, text: t.name, selected: t.id === topicId })));
    const dateInput = h('input', { class: 'input', type: 'date', id: 'session-date', value: date });
    const startInput = h('input', { class: 'input', type: 'time', id: 'session-start', value: '18:00' });
    const durationInput = h('input', { class: 'input', type: 'number', id: 'session-duration', min: '10', max: '240', step: '5', value: String(duration) });
    const typeSelect = h('select', { class: 'select', id: 'session-type' }, SESSION_TYPES.map((t) => h('option', { value: t.id, text: t.label, selected: t.id === type })));
    const prioritySelect = h('select', { class: 'select', id: 'session-priority' },
      h('option', { value: '3', text: 'High' }), h('option', { value: '2', text: 'Normal', selected: true }), h('option', { value: '1', text: 'Low' }));
    const notesInput = h('input', { class: 'input', id: 'session-notes', placeholder: 'Optional — chapter, question number, focus' });
    const error = h('p', { class: 'field-error', role: 'alert' });
    const actions = h('div', { class: 'dialog-actions-row' });
    const dialog = openDialog({
      title: 'Plan a study session',
      body: h('div', { class: 'session-form' },
        h('div', { class: 'field-row' },
          h('div', { class: 'field grow' }, h('label', { for: 'session-topic', text: 'Topic' }), topicSelect),
          h('div', { class: 'field' }, h('label', { for: 'session-date', text: 'Date' }), dateInput)),
        h('div', { class: 'field-row' },
          h('div', { class: 'field' }, h('label', { for: 'session-start', text: 'Start' }), startInput),
          h('div', { class: 'field' }, h('label', { for: 'session-duration', text: 'Minutes' }), durationInput),
          h('div', { class: 'field' }, h('label', { for: 'session-priority', text: 'Priority' }), prioritySelect)),
        h('div', { class: 'field' }, h('label', { for: 'session-type', text: 'Session type' }), typeSelect),
        h('div', { class: 'field' }, h('label', { for: 'session-notes', text: 'Notes' }), notesInput),
        error,
        h('p', { class: 'small muted', text: 'Stored in this browser only. Marking it done logs completed minutes for analytics.' })),
      actions: [],
    });
    const save = button('Save session', { icon: 'check', onClick: () => {
      if (!dateInput.value || !parseDateKey(dateInput.value)) { error.textContent = 'Choose a valid date.'; dateInput.focus(); return; }
      if (!topicSelect.value) { error.textContent = 'Choose a topic.'; topicSelect.focus(); return; }
      addEvent(nb, {
        topicId: topicSelect.value,
        date: dateInput.value,
        start: startInput.value || '18:00',
        duration: Math.min(240, Math.max(10, Number(durationInput.value) || 45)),
        type: typeSelect.value,
        priority: Number(prioritySelect.value) || 2,
        notes: notesInput.value.trim(),
      });
      state.selected = dateInput.value;
      state.cursor = parseDateKey(dateInput.value);
      if (state.view === 'month') state.cursor = monthStart(parseDateKey(dateInput.value));
      dialog.close();
      refreshAll();
      toast('Session added to the calendar.', 'good');
      announce('Study session added.');
    } });
    dialog.el.querySelector('.modal-body').appendChild(actions);
    actions.append(button('Cancel', { variant: 'ghost', onClick: () => dialog.close() }), save);
  }

  function shift(delta) {
    if (state.view === 'month') state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() + delta, 1);
    else if (state.view === 'week') state.cursor = addDays(state.cursor, delta * 7);
    else {
      state.cursor = addDays(state.cursor, delta);
      state.selected = localDateKey(state.cursor);
    }
    refreshAll();
  }

  const viewTabs = h('div', { class: 'segmented small', role: 'tablist', 'aria-label': 'Calendar view' });
  for (const view of ['month', 'week', 'day']) {
    const b = h('button', { type: 'button', role: 'tab', 'aria-selected': state.view === view ? 'true' : 'false', class: state.view === view ? 'active' : '', text: view[0].toUpperCase() + view.slice(1) });
    b.addEventListener('click', () => {
      state.view = view;
      for (const other of viewTabs.children) {
        const active = other.textContent.toLowerCase() === view;
        other.classList.toggle('active', active);
        other.setAttribute('aria-selected', active ? 'true' : 'false');
      }
      state.cursor = parseDateKey(state.selected) || today;
      if (view === 'month') state.cursor = monthStart(state.cursor);
      refreshAll();
    });
    viewTabs.appendChild(b);
  }

  addBtn = button('Add session', { icon: 'plus', onClick: () => openSessionDialog({ date: state.selected }) });

  const exam = examInfo(nb);
  const topicTotals = (() => {
    const map = new Map();
    for (const e of nb.calendar) {
      const t = byId.get(e.topicId);
      if (!t) continue;
      map.set(t.name, (map.get(t.name) || 0) + e.duration);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  })();
  const page = h('div', { class: 'page calendar-page' },
    h('div', { class: 'page-head' },
      h('div', null,
        h('p', { class: 'kicker', text: 'Interactive study calendar' }),
        h('h1', { class: 'page-title', text: 'Make the remaining time visible.' }),
        h('p', { class: 'page-sub', text: exam ? `Examination in ${exam.label}. Plan concepts, numericals, formulas and past-paper practice against the real topics in this notebook.` : 'Plan concepts, numericals, formulas and past-paper practice against the real topics in this notebook. Set an exam date in Settings for a countdown.' })),
      h('div', { class: 'page-head-actions' }, addBtn)),
    statsHost,
    h('div', { class: 'calendar-layout' },
      h('section', { class: 'cal-main card' },
        h('div', { class: 'cal-toolbar' },
          h('div', { class: 'cal-nav' },
            h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Previous period', onClick: () => shift(-1) }, icon('chevronLeft', 18)),
            h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Today', onClick: () => {
              state.selected = localDateKey(today);
              state.cursor = state.view === 'month' ? new Date(today.getFullYear(), today.getMonth(), 1) : new Date(today.getFullYear(), today.getMonth(), today.getDate());
              refreshAll();
            } }),
            h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Next period', onClick: () => shift(1) }, icon('chevronRight', 18))),
          label,
          viewTabs),
        gridHost),
      detailHost),
    h('div', { class: 'calendar-bottom' },
      h('section', { class: 'card cal-upcoming-card' }, upcomingHost),
      h('section', { class: 'card cal-legend-card' },
        h('p', { class: 'kicker', text: 'Session types' }),
        h('div', { class: 'type-legend' }, SESSION_TYPES.map((t) => h('span', { class: `type-pill ev-${t.id}`, text: t.label }))),
        topicTotals.length ? h('div', { class: 'cal-topic-dist' },
          h('p', { class: 'kicker', text: 'Planned by topic' }),
          topicTotals.map(([name, mins]) => h('div', { class: 'allocation-row' },
            h('span', { class: 'allocation-name', text: name }),
            h('span', { class: 'allocation-bar' }, h('span', { class: 'allocation-fill', style: { width: (mins / Math.max(1, topicTotals[0][1])) * 100 + '%' } })),
            h('span', { class: 'allocation-value small muted', text: formatMinutes(mins) })))) : null,
        h('p', { class: 'small muted', text: 'Click a date for the lift, ripple and coordinated day-panel reveal. Reduced-motion settings keep the same information without the particles.' }))));

  root.appendChild(page);
  refreshAll();

  const pending = (() => { try { return sessionStorage.getItem('vx3.openNewSession'); } catch { return null; } })();
  if (pending) {
    try { sessionStorage.removeItem('vx3.openNewSession'); } catch { /* blocked */ }
    const topicId = pending !== '1' && byId.has(pending) ? pending : '';
    timers.push(setTimeout(() => openSessionDialog({ date: state.selected, topicId }), 250));
  }

  ctx.refreshShell?.();
  return () => { for (const t of timers) clearTimeout(t); };
}
