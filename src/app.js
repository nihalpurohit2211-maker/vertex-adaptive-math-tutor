/** app.js — shell, hash router, search, notifications and settings. */
import {
  h, icon, button, avatarNode, toast, announce, openDialog, confirmDialog, badge,
} from './ui.js';
import * as state from './state.js';
import { cancelAll, isConfigured, providerLabel, PROVIDER_LABEL } from './providers.js';
import { coverageCounts, recentTopics, examInfo } from './shared.js';
import { localDateKey } from './core.js';
import renderLanding from './pages/landing.js';
import renderLogin from './pages/login.js';
import renderSetup from './pages/setup.js';
import renderDashboard from './pages/dashboard.js';
import renderCoverage from './pages/coverage.js';
import renderLesson from './pages/lesson.js';
import renderPractice from './pages/practice.js';
import renderSheet from './pages/sheet.js';
import renderCalendar from './pages/calendar.js';
import renderAnalytics from './pages/analytics.js';
import renderFormulas from './pages/formulas.js';

const PAGES = {
  landing: renderLanding,
  login: renderLogin,
  setup: renderSetup,
  dashboard: renderDashboard,
  coverage: renderCoverage,
  lesson: renderLesson,
  practice: renderPractice,
  sheet: renderSheet,
  calendar: renderCalendar,
  analytics: renderAnalytics,
  formulas: renderFormulas,
};

const TITLES = {
  landing: 'Vertex — your exam, understood',
  login: 'Vertex — local profile',
  setup: 'Vertex — build a workspace',
  dashboard: 'Overview · Vertex',
  coverage: 'Coverage · Vertex',
  lesson: 'Lesson · Vertex',
  practice: 'Exam Practice · Vertex',
  sheet: 'Revision Sheet · Vertex',
  calendar: 'Study Calendar · Vertex',
  analytics: 'Progress · Vertex',
  formulas: 'Formula Vault · Vertex',
};

const PUBLIC = new Set(['landing', 'login']);
let currentCleanup = null;
let currentRoute = null;
let appRoot = null;

function parseRoute() {
  const raw = location.hash || '#/';
  const path = raw.replace(/^#\/?/, '').replace(/\/+$/, '');
  if (!path) return { name: 'landing', param: null };
  const [segment, ...rest] = path.split('/');
  let param = rest.length ? rest.join('/') : null;
  if (param) {
    try { param = decodeURIComponent(param); } catch { param = rest.join('/'); }
  }
  if (segment === 'lesson') return { name: 'lesson', param };
  if (Object.prototype.hasOwnProperty.call(PAGES, segment)) return { name: segment, param };
  return { name: 'landing', param: null, unknown: true };
}

function navigate(hash) {
  const target = hash || '#/';
  if (location.hash === target) render();
  else location.hash = target;
}

const ctx = {
  navigate,
  rerender: () => render(),
  openSettings: (tab) => openSettings(tab),
  openDemo: () => openDemo(),
  refreshShell: () => refreshShell(),
  toast,
  announce,
};

/* -------------------------------------------------------------------------- */
/* public chrome                                                               */
/* -------------------------------------------------------------------------- */

function jumpToSection(id) {
  if (currentRoute?.name === 'landing') {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    navigate('#/');
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  }
}

function startRevising() {
  const nb = state.getActiveNotebook();
  if (nb) { navigate('#/dashboard'); return; }
  const profile = state.getActiveProfile();
  if (profile) {
    const own = state.listUserNotebooks(profile.id);
    if (own.length) {
      state.setCurrent(own[0].id);
      navigate('#/dashboard');
    } else {
      navigate('#/setup');
    }
    return;
  }
  navigate('#/login');
}

function publicHeader(routeName) {
  const profile = state.getActiveProfile();
  const nb = state.getActiveNotebook();
  const nav = routeName === 'landing'
    ? h('nav', { class: 'public-nav', 'aria-label': 'Product navigation' },
      h('button', { type: 'button', text: 'Product', onClick: () => jumpToSection('problem') }),
      h('button', { type: 'button', text: 'How it works', onClick: () => jumpToSection('story') }),
      h('button', { type: 'button', text: 'Coverage', onClick: () => jumpToSection('coverage-demo') }),
      h('button', { type: 'button', text: 'Visualizations', onClick: () => jumpToSection('gradient') }))
    : h('nav', { class: 'public-nav', 'aria-label': 'Public navigation' },
      h('button', { type: 'button', text: 'Home', onClick: () => navigate('#/') }));
  return h('header', { class: 'public-header' },
    h('div', { class: 'public-header-inner' },
      h('button', { type: 'button', class: 'brand-button', 'aria-label': 'Vertex home', onClick: () => navigate('#/') },
        h('span', { class: 'brand-mark', text: '▲' }), h('span', { class: 'brand-word', text: 'VERTEX' })),
      nav,
      h('div', { class: 'public-actions' },
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm demo-link', onClick: () => openDemo() }, icon('play', 14), h('span', { text: 'Try demo' })),
        nb
          ? button('Open workspace', { size: 'sm', icon: 'arrow', onClick: () => navigate('#/dashboard') })
          : profile
            ? button('Open workspace', { size: 'sm', icon: 'arrow', onClick: () => startRevising() })
            : button('Sign in', { size: 'sm', variant: 'ghost', onClick: () => navigate('#/login') }),
        !nb && profile ? avatarNode(profile, 'sm') : null)));
}

/* -------------------------------------------------------------------------- */
/* app chrome                                                                  */
/* -------------------------------------------------------------------------- */

function pinTotal(nb) {
  return (nb?.revisionPins?.length || 0) + (nb?.pinPoints?.length || 0);
}

function lessonHref(nb) {
  const recent = recentTopics(nb, 1)[0] || nb?.topics?.[0];
  return recent ? `#/lesson/${recent.id}` : '#/coverage';
}

function sidebarNav(nb, route) {
  const items = [
    ['dashboard', 'Overview', 'home', '#/dashboard'],
    ['coverage', 'Coverage', 'target', '#/coverage'],
    ['lesson', 'Lessons', 'book', lessonHref(nb)],
    ['practice', 'Practice', 'compass', '#/practice'],
    ['sheet', 'Revision sheet', 'clipboard', '#/sheet', pinTotal(nb)],
    ['calendar', 'Calendar', 'calendar', '#/calendar'],
    ['analytics', 'Analytics', 'chart', '#/analytics'],
    ['formulas', 'Formula Vault', 'sigma', '#/formulas'],
  ];
  return h('nav', { class: 'side-nav', 'aria-label': 'Study navigation' },
    h('p', { class: 'side-nav-label', text: 'Study workspace' }),
    items.map(([key, label, iconName, href, count]) => {
      const active = route.name === key || (key === 'lesson' && route.name === 'lesson');
      return h('a', {
        href,
        class: `side-link${active ? ' active' : ''}`,
        'aria-current': active ? 'page' : undefined,
      },
        icon(iconName, 18),
        h('span', { class: 'side-label', text: label }),
        key === 'sheet' ? h('span', { class: 'side-count', 'data-pin-count': '1', hidden: !count, text: count ? String(count) : '0' }) : null);
    }));
}

function appShell(nb, route) {
  const profile = state.getActiveProfile();
  const counts = coverageCounts(nb);
  const exam = examInfo(nb);
  const workspaces = state.listNotebooks();
  const select = h('select', { class: 'notebook-select', 'aria-label': 'Switch workspace' },
    !nb ? h('option', { value: '', text: 'No workspace yet', selected: true }) : null,
    workspaces.map((n) => h('option', { value: n.id, text: n.kind === 'demo' ? `${n.title} · demo` : n.title, selected: n.id === nb?.id })));
  select.addEventListener('change', () => {
    if (!select.value) return;
    state.setCurrent(select.value);
    navigate('#/dashboard');
  });

  const sidebar = h('aside', { class: 'sidebar', id: 'sidebar' },
    h('div', { class: 'side-brand' },
      h('button', { type: 'button', class: 'brand-button', 'aria-label': nb ? 'Back to overview' : 'Build a workspace', onClick: () => navigate(nb ? '#/dashboard' : '#/setup') },
        h('span', { class: 'brand-mark', text: '▲' }), h('span', { class: 'brand-word', text: 'VERTEX' })),
      h('button', { type: 'button', class: 'icon-btn sidebar-close', 'aria-label': 'Close navigation', onClick: () => document.body.classList.remove('sidebar-open') }, icon('close', 18))),
    nb?.kind === 'demo' ? h('div', { class: 'side-demo' }, h('span', { class: 'badge badge-demo', text: 'Curated demo' }), h('p', { class: 'small', text: 'Your own notebooks stay untouched.' })) : null,
    sidebarNav(nb, route),
    h('div', { class: 'side-bottom' },
      h('button', { type: 'button', class: 'side-profile', onClick: () => openSettings('study') },
        avatarNode(profile, 'sm'),
        h('span', { class: 'side-profile-copy' }, h('strong', { text: profile?.name || 'Guest' }), h('small', { text: nb?.kind === 'demo' ? 'Demo workspace' : nb ? 'Local workspace' : 'No workspace yet' })),
        icon('settings', 16)),
      h('p', { class: 'side-privacy small' }, icon('lock', 12), h('span', { text: 'Local-first · no tracking' })),
      nb?.kind === 'demo' ? h('button', { type: 'button', class: 'side-exit', onClick: () => { state.exitDemo(); navigate(state.getActiveNotebook() ? '#/dashboard' : '#/'); } }, 'Exit demo') : null));

  const notificationCount = buildNotifications(nb).length;
  const topbar = h('header', { class: 'topbar' },
    h('button', { type: 'button', class: 'icon-btn menu-btn', 'aria-label': 'Open navigation', 'aria-controls': 'sidebar', 'aria-expanded': 'false', onClick: () => {
      document.body.classList.toggle('sidebar-open');
      document.querySelector('.menu-btn')?.setAttribute('aria-expanded', document.body.classList.contains('sidebar-open') ? 'true' : 'false');
    } }, icon('menu', 20)),
    h('div', { class: 'notebook-switch' },
      select,
      h('span', { class: 'notebook-meta small' }, nb
        ? h('span', null, h('span', { text: `${counts.total} topics` }), h('span', { class: 'dot-sep', text: '·' }), h('span', { text: `${counts.missing} gaps` }))
        : h('span', { text: 'Paste notes to start' }))),
    h('div', { class: 'topbar-actions' },
      exam ? h('span', { class: 'countdown-pill', title: 'Days until your examination' }, icon('clock', 14), h('span', { text: `${Math.max(0, exam.days)}d` })) : null,
      h('button', { type: 'button', class: 'search-trigger', onClick: () => openSearch() }, icon('search', 16), h('span', { text: 'Search' }), h('kbd', { text: '/' })),
      h('button', { type: 'button', class: 'icon-btn bell-btn', 'aria-label': notificationCount ? `Notifications, ${notificationCount} items` : 'Notifications', onClick: () => openNotifications(nb) },
        icon('bell', 18),
        notificationCount ? h('span', { class: 'bell-dot', text: String(notificationCount) }) : null),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Open settings', onClick: () => openSettings('study') }, icon('settings', 18)),
      h('button', { type: 'button', class: 'top-profile', 'aria-label': 'Profile and settings', onClick: () => openSettings('study') },
        avatarNode(profile, 'sm'), h('span', { class: 'top-profile-name', text: profile?.name || 'Guest' }))));

  return h('div', { class: 'app-shell' },
    sidebar,
    h('div', { class: 'sidebar-scrim', onClick: () => document.body.classList.remove('sidebar-open') }),
    h('div', { class: 'app-main' }, topbar, nb?.kind === 'demo' ? h('div', { class: 'demo-strip' },
      h('span', { class: 'demo-strip-copy' }, icon('spark', 14), h('span', { text: 'Curated demo — your own notebooks, pins and calendar are untouched.' })),
      h('button', { type: 'button', class: 'demo-strip-exit', onClick: () => { state.exitDemo(); navigate(state.getActiveNotebook() ? '#/dashboard' : '#/'); } }, 'Exit demo')) : null,
    h('main', { class: 'content', id: 'view', tabindex: '-1' })));
}

/* -------------------------------------------------------------------------- */
/* render                                                                      */
/* -------------------------------------------------------------------------- */

function render() {
  if (typeof currentCleanup === 'function') {
    try { currentCleanup(); } catch { /* view already gone */ }
  }
  currentCleanup = null;
  document.body.classList.remove('sidebar-open');
  let route = parseRoute();
  if (route.unknown) {
    history.replaceState(null, '', '#/');
    route = { name: 'landing', param: null };
  }
  currentRoute = route;

  const nb = state.getActiveNotebook();
  const profile = state.getActiveProfile();

  // guards
  if (route.name === 'setup' && !profile) { navigate('#/login'); return; }
  if (!PUBLIC.has(route.name) && route.name !== 'setup' && !nb) {
    navigate(profile ? '#/setup' : '#/login');
    return;
  }
  if (route.name === 'lesson' && (!nb || !nb.topics.some((t) => t.id === route.param))) {
    if (nb) {
      toast('That topic is unavailable in this workspace.', 'error');
      navigate('#/coverage');
    } else {
      navigate('#/login');
    }
    return;
  }

  appRoot = document.getElementById('app');
  appRoot.replaceChildren();
  document.body.classList.toggle('route-public', PUBLIC.has(route.name));

  const publicPage = PUBLIC.has(route.name);
  let view;
  if (publicPage) {
    view = h('main', { class: 'public-main', id: 'view', tabindex: '-1' });
    appRoot.append(publicHeader(route.name), view);
  } else {
    const shell = appShell(nb, route);
    appRoot.append(shell);
    view = shell.querySelector('#view');
  }

  document.title = route.name === 'lesson'
    ? `${nb?.topics.find((t) => t.id === route.param)?.name || 'Lesson'} · Vertex`
    : TITLES[route.name] || 'Vertex';

  const renderer = PAGES[route.name];
  try {
    const cleanup = renderer(view, ctx, route.param);
    if (typeof cleanup === 'function') currentCleanup = cleanup;
    view.classList.add('route-enter');
  } catch (err) {
    console.error('Vertex view failed:', err);
    view.replaceChildren(h('div', { class: 'card error-card' },
      h('h1', { text: 'This screen failed to render.' }),
      h('p', { class: 'muted', text: 'Vertex kept you on a usable page instead of leaving a blank screen.' }),
      h('p', { class: 'small muted', text: String(err?.message || err) }),
      button('Back to overview', { onClick: () => navigate(state.getActiveNotebook() ? '#/dashboard' : '#/') })));
  }
  window.scrollTo(0, 0);
  refreshShell();
}

function refreshShell() {
  const nb = state.getActiveNotebook();
  const count = pinTotal(nb);
  for (const el of document.querySelectorAll('[data-pin-count]')) {
    el.textContent = String(count);
    el.hidden = count === 0;
  }
  const bell = document.querySelector('.bell-btn');
  if (bell && nb) {
    const n = buildNotifications(nb).length;
    let dot = bell.querySelector('.bell-dot');
    if (n && !dot) {
      dot = h('span', { class: 'bell-dot', text: String(n) });
      bell.appendChild(dot);
    } else if (dot) {
      dot.textContent = String(n);
      dot.hidden = n === 0;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* demo                                                                        */
/* -------------------------------------------------------------------------- */

async function openDemo() {
  toast('Loading the curated demo…');
  try {
    const nb = await state.loadDemoNotebook();
    navigate('#/dashboard');
    toast('Curated demo ready — no key and no model request.', 'good');
    announce('Curated demo opened. Six topics loaded.');
    return nb;
  } catch (err) {
    toast(`Could not open the demo: ${err.message}. Serve the folder over HTTP and retry.`, 'error');
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* search                                                                      */
/* -------------------------------------------------------------------------- */

function openSearch() {
  const nb = state.getActiveNotebook();
  const pages = [
    ['Overview', 'dashboard', 'home'], ['Coverage', 'coverage', 'target'], ['Practice', 'practice', 'compass'],
    ['Revision sheet', 'sheet', 'clipboard'], ['Calendar', 'calendar', 'calendar'], ['Analytics', 'analytics', 'chart'],
    ['Formula Vault', 'formulas', 'sigma'], ['Setup / notes', 'setup', 'book'],
  ];
  const topics = (nb?.topics || []).map((t) => ({ label: t.name, meta: `${t.unit} · ${t.coverage.status === 'covered' ? 'Explained' : t.coverage.status === 'thin' ? 'Only mentioned' : 'No match'}`, route: `#/lesson/${t.id}`, icon: 'book' }));
  const formulas = [];
  const input = h('input', { class: 'input search-input', type: 'search', placeholder: 'Search pages, topics and formulas…', 'aria-label': 'Search Vertex' });
  const results = h('div', { class: 'search-results', role: 'listbox', 'aria-label': 'Search results' });
  let dialog = null;
  const choose = (route) => { dialog.close(); navigate(route); };
  const renderResults = () => {
    const q = input.value.trim().toLowerCase();
    const items = [
      ...pages.map(([label, route, iconName]) => ({ label, meta: 'Workspace page', route: '#/' + route, icon: iconName })),
      ...topics,
    ].filter((it) => !q || `${it.label} ${it.meta}`.toLowerCase().includes(q)).slice(0, 9);
    results.replaceChildren();
    if (!items.length) {
      results.appendChild(h('p', { class: 'search-empty small muted', text: 'No page or topic matches that search. The Formula Vault has its own search.' }));
      return;
    }
    items.forEach((it, i) => {
      const b = h('button', { type: 'button', class: 'search-result', role: 'option', 'data-index': i, onClick: () => choose(it.route) },
        h('span', { class: 'search-result-icon' }, icon(it.icon, 16)),
        h('span', { class: 'search-result-copy' }, h('strong', { text: it.label }), h('span', { class: 'small muted', text: it.meta })),
        icon('arrowUpRight', 14));
      results.appendChild(b);
    });
  };
  input.addEventListener('input', renderResults);
  input.addEventListener('keydown', (e) => {
    const buttons = [...results.querySelectorAll('.search-result')];
    if (!buttons.length) return;
    const active = buttons.findIndex((b) => b === document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); buttons[Math.min(buttons.length - 1, active + 1)].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); buttons[Math.max(0, active - 1)].focus(); }
    if (e.key === 'Enter') { e.preventDefault(); (buttons[active] || buttons[0]).click(); }
  });
  renderResults();
  dialog = openDialog({
    title: 'Search Vertex',
    wide: true,
    body: h('div', { class: 'search-body' }, input, h('p', { class: 'small muted', text: 'Pages and topics in the active notebook. Formulas live in the vault.' }), results),
  });
  setTimeout(() => input.focus(), 30);
}

/* -------------------------------------------------------------------------- */
/* notifications                                                               */
/* -------------------------------------------------------------------------- */

function buildNotifications(nb) {
  if (!nb) return [];
  const items = [];
  const exam = examInfo(nb);
  if (exam && exam.days >= 0) items.push({ icon: 'clock', title: `${exam.days === 0 ? 'Examination today' : `${exam.days} day${exam.days === 1 ? '' : 's'} to the examination`}`, text: nb.examDate, route: '#/calendar' });
  const todayKey = localDateKey(new Date());
  const upcoming = nb.calendar.filter((e) => !e.done && e.date >= todayKey).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)).slice(0, 3);
  for (const e of upcoming) {
    const t = nb.topics.find((x) => x.id === e.topicId);
    items.push({ icon: 'calendar', title: `${t?.name || 'Session'} · ${e.start}`, text: `${e.date} · ${e.duration} min`, route: '#/calendar' });
  }
  const missing = nb.topics.filter((t) => t.coverage.status === 'not_found').length;
  if (missing) items.push({ icon: 'search', title: `${missing} topic${missing === 1 ? '' : 's'} with no matching passage`, text: 'Open the coverage map to inspect the evidence.', route: '#/coverage' });
  const pins = pinTotal(nb);
  if (pins) items.push({ icon: 'pin', title: `${pins} pinned point${pins === 1 ? '' : 's'} on your sheet`, text: 'Print or reorder them before the exam.', route: '#/sheet' });
  return items;
}

function openNotifications(nb) {
  const items = buildNotifications(nb);
  openDialog({
    title: 'Notifications',
    body: h('div', { class: 'notification-list' },
      items.length ? items.map((item) => h('button', { type: 'button', class: 'notification-row', onClick: () => {
        document.querySelector('.modal-backdrop .icon-btn')?.click();
        navigate(item.route);
      } },
        h('span', { class: 'notification-icon' }, icon(item.icon, 17)),
        h('span', { class: 'grow' }, h('strong', { text: item.title }), h('span', { class: 'small muted', text: item.text })),
        icon('chevronRight', 14))) : h('p', { class: 'muted', text: 'Nothing needs your attention right now.' })),
  });
}

/* -------------------------------------------------------------------------- */
/* settings                                                                    */
/* -------------------------------------------------------------------------- */

function downloadNotebook(nb) {
  const blob = new Blob([state.exportNotebook(nb)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: `${nb.id}.notebook.json` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function openSettings(initialTab = 'study') {
  const nb = state.getActiveNotebook();
  const profile = state.getActiveProfile();
  let tab = initialTab;
  let dialog = null;
  const tabs = h('div', { class: 'modal-tabs', role: 'tablist', 'aria-label': 'Settings sections' });
  const host = h('div', { class: 'settings-host' });

  const switchTab = (next) => {
    tab = next;
    for (const b of tabs.children) {
      const active = b.dataset.tab === next;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    }
    renderTab();
  };

  function saveAndRefresh(message) {
    toast(message, 'good');
    dialog.close();
    render();
  }

  function renderTab() {
    host.replaceChildren();
    if (tab === 'study') {
      const nameInput = h('input', { class: 'input', id: 'settings-name', value: profile?.name || '', placeholder: 'Display name', maxlength: '40' });
      const hoursInput = h('input', { class: 'input', id: 'settings-hours', type: 'number', min: '0.5', max: '24', step: '0.5', value: String(nb?.settings?.hoursToStudy || state.getSettings().hoursToStudy || 3) });
      const examInput = h('input', { class: 'input', id: 'settings-exam', type: 'date', value: nb?.examDate || '' });
      const status = h('p', { class: 'form-status', 'aria-live': 'polite' });
      host.append(
        h('section', { class: 'settings-section' },
          h('h3', { text: 'Local profile' }),
          h('p', { class: 'small muted', text: 'A profile is a local label, not an account. There is no password or server authentication.' }),
          h('div', { class: 'field-row' },
            h('div', { class: 'field grow' }, h('label', { for: 'settings-name', text: 'Display name' }), nameInput),
            profile ? h('span', { class: 'avatar-inline' }, avatarNode(profile, 'md')) : null)),
        h('section', { class: 'settings-section' },
          h('h3', { text: 'Study plan' }),
          h('div', { class: 'field-row' },
            h('div', { class: 'field' }, h('label', { for: 'settings-hours', text: 'Hours available' }), hoursInput),
            h('div', { class: 'field' }, h('label', { for: 'settings-exam', text: 'Exam date (optional)' }), examInput)),
          h('p', { class: 'small muted', text: 'The exam date is only shown if you set it. Vertex never invents one.' })),
        h('section', { class: 'settings-section' },
          h('h3', { text: 'Browser storage' }),
          h('p', { class: 'small', text: state.storageInfo().local ? 'localStorage is available. Notebooks, pins and calendar events persist on this device.' : 'localStorage is blocked. Vertex is running in memory for this session; export before closing the tab.' }),
          status),
        h('div', { class: 'settings-actions' },
          button('Save study settings', { icon: 'check', onClick: () => {
            try {
              if (profile && nameInput.value.trim()) state.updateProfile(profile.id, { name: nameInput.value.trim() });
              if (nb) {
                nb.settings = { ...(nb.settings || {}), hoursToStudy: Math.max(0.5, Math.min(24, Number(hoursInput.value) || 3)) };
                nb.examDate = examInput.value || '';
                state.saveNotebook(nb);
              }
              state.setSettings({ hoursToStudy: Math.max(0.5, Math.min(24, Number(hoursInput.value) || 3)) });
              saveAndRefresh('Study settings saved.');
            } catch (err) {
              status.textContent = err.message;
            }
          } })));
    } else if (tab === 'ai') {
      const settings = state.getSettings();
      const provider = h('select', { class: 'select', id: 'settings-provider' },
        h('option', { value: 'off', text: 'No provider (offline)', selected: settings.provider === 'off' }),
        Object.entries(PROVIDER_LABEL).map(([id, label]) => h('option', { value: id, text: label, selected: settings.provider === id })));
      const modelDefaults = { openai: 'gpt-4o-mini', anthropic: 'claude-3-5-haiku-latest', gemini: 'gemini-2.0-flash' };
      const model = h('input', { class: 'input', id: 'settings-model', value: settings.provider === 'off' ? '' : settings.model, placeholder: modelDefaults[settings.provider] || 'model id' });
      const keyInput = h('input', { class: 'input', id: 'settings-key', type: 'password', autocomplete: 'new-password', spellcheck: 'false', placeholder: 'Paste a key to store it' });
      const remember = h('input', { type: 'checkbox', id: 'settings-remember', checked: settings.remember });
      const keyState = h('p', { class: 'small muted', id: 'key-state', text: settings.provider === 'off' ? 'No provider selected.' : state.getKey(settings.provider) ? `A key is stored for ${PROVIDER_LABEL[settings.provider]}.` : `No key stored for ${PROVIDER_LABEL[settings.provider]}.` });
      const status = h('p', { class: 'form-status', 'aria-live': 'polite' });
      const updateKeyState = () => {
        const p = provider.value;
        keyState.textContent = p === 'off' ? 'No provider selected.' : state.getKey(p) ? `A key is stored for ${PROVIDER_LABEL[p]}.` : `No key stored for ${PROVIDER_LABEL[p]}.`;
        model.placeholder = modelDefaults[p] || 'model id';
      };
      provider.addEventListener('change', updateKeyState);
      host.append(
        h('section', { class: 'settings-section' },
          h('h3', { text: 'Optional AI provider' }),
          h('p', { class: 'small muted', text: 'The demo and all offline lessons work without this. A request is sent only when you press an AI action, and only to the provider you select.' }),
          h('div', { class: 'field-row' },
            h('div', { class: 'field' }, h('label', { for: 'settings-provider', text: 'Provider' }), provider),
            h('div', { class: 'field grow' }, h('label', { for: 'settings-model', text: 'Model' }), model)),
          h('div', { class: 'field' },
            h('label', { for: 'settings-key', text: 'API key' }),
            keyInput,
            h('p', { class: 'field-hint', text: 'The key is masked, never placed in a DOM attribute, never logged and never written into notebook data. Browser-side keys cannot be protected from someone inspecting this browser.' })),
          h('label', { class: 'checkbox' }, remember, h('span', { text: 'Remember the key on this device (otherwise sessionStorage only)' })),
          keyState,
          h('p', { class: 'small muted', text: `Current selection: ${providerLabel()}.` })),
        h('section', { class: 'settings-section' },
          h('h3', { text: 'Key controls' }),
          h('div', { class: 'settings-inline-actions' },
            button('Save provider & key', { icon: 'check', onClick: () => {
              const p = provider.value;
              state.setSettings({ provider: p, model: model.value.trim() || modelDefaults[p] || 'gpt-4o-mini', remember: remember.checked });
              if (p !== 'off' && keyInput.value.trim()) {
                state.setKey(p, keyInput.value.trim());
                keyInput.value = '';
              }
              cancelAll();
              saveAndRefresh('AI settings saved.');
            } }),
            button('Forget this key', { variant: 'ghost', icon: 'trash', onClick: () => {
              if (provider.value === 'off') { status.textContent = 'Select a provider first.'; return; }
              state.clearKey(provider.value);
              updateKeyState();
              status.textContent = 'Key removed from this browser.';
              toast('Key removed.', 'info');
            } }),
            button('Cancel in-flight requests', { variant: 'ghost', icon: 'close', onClick: () => {
              cancelAll();
              status.textContent = 'Any in-flight model request was cancelled. Saved notebook data is unchanged.';
            } })),
          status));
    } else {
      const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'sr-only' });
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        try {
          const text = await file.text();
          const imported = state.importNotebook(text);
          dialog.close();
          navigate('#/dashboard');
          toast(`Imported “${imported.title}”.`, 'good');
        } catch (err) {
          toast(`Import failed: ${err.message}`, 'error');
        }
        fileInput.value = '';
      });
      host.append(
        h('section', { class: 'settings-section' },
          h('h3', { text: 'Notebook data' }),
          nb ? h('div', { class: 'data-row' },
            h('div', null, h('strong', { text: nb.title }), h('p', { class: 'small muted', text: `${nb.topics.length} topics · ${pinTotal(nb)} pins · id ${nb.id}` })),
            h('div', { class: 'settings-inline-actions' },
              button('Export JSON', { variant: 'ghost', icon: 'download', onClick: () => downloadNotebook(nb) }),
              button('Import JSON', { variant: 'ghost', icon: 'download', onClick: () => fileInput.click() }),
              fileInput)) : h('p', { class: 'muted', text: 'No active notebook.' }),
          h('p', { class: 'small muted', text: 'Export writes the notebook — notes, topics, pins, calendar, sessions, reflections — to a local JSON file. Nothing is uploaded.' })),
        nb ? h('section', { class: 'settings-section' },
          h('h3', { text: 'Workspace management' }),
          h('div', { class: 'settings-inline-actions' },
            button('Export notebook', { variant: 'ghost', icon: 'download', onClick: () => downloadNotebook(nb) }),
            nb.kind === 'demo'
              ? button('Exit curated demo', { variant: 'ghost', icon: 'arrow', onClick: () => { state.exitDemo(); dialog.close(); navigate(state.getActiveNotebook() ? '#/dashboard' : '#/'); } })
              : button('Delete this workspace', { variant: 'danger', icon: 'trash', onClick: async () => {
                const ok = await confirmDialog({
                  title: 'Delete this workspace?',
                  text: 'This removes the notebook, its pins, calendar sessions and reflections from this browser. Export a JSON copy first if you may want it back.',
                  confirmLabel: 'Delete workspace',
                  danger: true,
                });
                if (!ok) return;
                state.removeNotebook(nb.id);
                dialog.close();
                const next = state.getActiveNotebook();
                navigate(next ? '#/dashboard' : state.getActiveProfile() ? '#/setup' : '#/');
                toast('Workspace deleted from this browser.', 'info');
              } }))) : null,
        h('section', { class: 'settings-section' },
          h('h3', { text: 'Privacy architecture' }),
          h('p', { class: 'small muted', text: 'No account, server database, analytics service or silent upload. Notes stay in browser storage until you explicitly send an excerpt with an AI action. If storage is blocked, an in-memory tier keeps the session usable.' })));
    }
  }

  for (const [id, label] of [['study', 'Study'], ['ai', 'AI & keys'], ['data', 'Data & privacy']]) {
    const b = h('button', { type: 'button', role: 'tab', 'data-tab': id, 'aria-selected': tab === id ? 'true' : 'false', class: tab === id ? 'active' : '', text: label });
    b.addEventListener('click', () => switchTab(id));
    tabs.appendChild(b);
  }

  dialog = openDialog({
    title: 'Settings',
    wide: true,
    body: h('div', { class: 'settings-body' }, tabs, host),
  });
  renderTab();
  return dialog;
}

/* -------------------------------------------------------------------------- */
/* boot                                                                        */
/* -------------------------------------------------------------------------- */

function bindGlobal() {
  window.addEventListener('hashchange', render);
  document.addEventListener('keydown', (e) => {
    const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT' || e.target.isContentEditable);
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openSearch();
      return;
    }
    if (!typing && e.key === '/') {
      e.preventDefault();
      openSearch();
      return;
    }
    if (e.key === 'Escape') {
      document.body.classList.remove('sidebar-open');
      document.querySelector('.menu-btn')?.setAttribute('aria-expanded', 'false');
    }
  });
  window.addEventListener('error', (e) => {
    console.error('Vertex error:', e.message);
    toast('An unexpected error occurred. The app is still usable; check the console for details.', 'error');
  });
  window.addEventListener('unhandledrejection', (e) => {
    console.error('Vertex rejection:', e.reason);
    if (e.reason?.kind === 'cancelled') return;
    toast('An unexpected error occurred. Nothing was saved.', 'error');
  });
}

function boot() {
  bindGlobal();
  if (!location.hash) history.replaceState(null, '', '#/');
  if (!location.hash || location.hash === '#') history.replaceState(null, '', '#/');
  render();
}

boot();
