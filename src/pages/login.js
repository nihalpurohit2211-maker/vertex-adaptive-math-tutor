/** login.js — honest local profile + workspace entry. No fake authentication. */
import { h, icon, button, toast, avatarNode, openDialog } from '../ui.js';
import {
  getProfiles, getActiveProfile, setActiveProfile, createProfile,
  listUserNotebooks, setCurrent, storageInfo,
} from '../state.js';

const AVATARS = ['◆', '✦', '▲', '●', '◐', '✳', '⌘', '∿'];

export default function renderLogin(root, ctx) {
  let cleanup = () => {};
  const profiles = getProfiles();
  const active = getActiveProfile();
  const workspaces = active ? listUserNotebooks(active.id) : [];

  const goHome = () => ctx.navigate('#/');
  const enterProfile = (profile) => {
    setActiveProfile(profile.id);
    const own = listUserNotebooks(profile.id);
    if (own.length) {
      setCurrent(own[0].id);
      ctx.navigate('#/dashboard');
    } else {
      ctx.navigate('#/setup');
    }
  };

  const panel = h('div', { class: 'login-panel' });
  const header = h('div', { class: 'login-head' },
    h('p', { class: 'kicker', text: profiles.length ? 'Continue studying' : 'A quieter way to revise' }),
    h('h1', { class: 'login-title', text: profiles.length ? 'Welcome back.' : 'Make this exam different.' }),
    h('p', { class: 'login-sub', text: profiles.length
      ? 'Choose a local profile to reopen its workspaces.'
      : 'Create a local study profile. It lives only in this browser — no account, no password, no server.' }));

  panel.append(header);

  if (profiles.length) {
    const list = h('div', { class: 'profile-list' });
    for (const p of profiles) {
      const own = listUserNotebooks(p.id);
      const row = h('div', { class: `profile-row${active?.id === p.id ? ' current' : ''}` },
        avatarNode(p),
        h('div', { class: 'profile-copy' },
          h('strong', { text: p.name }),
          h('span', { class: 'small muted', text: own.length ? `${own.length} workspace${own.length === 1 ? '' : 's'}` : 'No workspace yet' })),
        h('div', { class: 'profile-actions' },
          own.length > 0 ? button('Open', { size: 'sm', variant: 'ghost', onClick: () => { setActiveProfile(p.id); setCurrent(own[0].id); ctx.navigate('#/dashboard'); } }) : null,
          button(active?.id === p.id ? 'Continue' : 'Use profile', {
            size: 'sm', onClick: () => enterProfile(p),
          })));
      list.appendChild(row);
    }
    panel.appendChild(h('div', { class: 'login-section' }, h('p', { class: 'field-label', text: 'Profiles on this device' }), list));
  }

  if (active && workspaces.length) {
    const ws = h('div', { class: 'workspace-list' });
    for (const nb of workspaces) {
      ws.appendChild(h('div', { class: 'workspace-row' },
        h('span', { class: 'workspace-icon' }, icon('book', 18)),
        h('div', { class: 'grow' },
          h('strong', { text: nb.title }),
          h('span', { class: 'small muted', text: `${nb.topics} topics · created ${new Date(nb.createdAt).toLocaleDateString()}` })),
        button('Open workspace', { size: 'sm', variant: 'ghost', onClick: () => { setCurrent(nb.id); ctx.navigate('#/dashboard'); } })));
    }
    panel.appendChild(h('div', { class: 'login-section' },
      h('div', { class: 'row-between' },
        h('p', { class: 'field-label', text: `${active.name}’s workspaces` }),
        button('New workspace', { size: 'sm', variant: 'ghost', icon: 'plus', onClick: () => ctx.navigate('#/setup') })),
      ws));
  }

  /* new profile */
  const form = h('form', { class: 'login-form', novalidate: true });
  const nameInput = h('input', { class: 'input', id: 'display-name', name: 'name', maxlength: '40', placeholder: 'e.g. Nihal', autocomplete: 'nickname', required: true });
  const error = h('p', { class: 'field-error', role: 'alert' });
  let avatar = AVATARS[0];
  const avatarRow = h('div', { class: 'avatar-pick', role: 'radiogroup', 'aria-label': 'Choose an avatar' });
  AVATARS.forEach((a, i) => {
    const b = h('button', {
      type: 'button', class: `avatar-choice${i === 0 ? ' selected' : ''}`, role: 'radio',
      'aria-checked': i === 0 ? 'true' : 'false', 'aria-label': `Avatar ${a}`, text: a,
    });
    b.addEventListener('click', () => {
      avatar = a;
      for (const child of avatarRow.children) {
        child.classList.toggle('selected', child === b);
        child.setAttribute('aria-checked', child === b ? 'true' : 'false');
      }
    });
    avatarRow.appendChild(b);
  });
  form.append(
    h('div', { class: 'field' }, h('label', { for: 'display-name', text: 'Display name' }), nameInput, error),
    h('div', { class: 'field' }, h('span', { class: 'field-label', text: 'Pick a mark' }), avatarRow),
    button('Create local profile', { icon: 'arrow', onClick: () => submit.click() }));
  const submit = form.querySelector('button.btn');
  submit.addEventListener('click', (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (name.length < 2) {
      error.textContent = 'Use at least two characters so the workspace feels like yours.';
      nameInput.focus();
      return;
    }
    try {
      const p = createProfile(name, avatar);
      toast(`Profile created. Welcome, ${p.name}.`, 'good');
      ctx.navigate('#/setup');
    } catch (err) {
      error.textContent = err.message;
    }
  });
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit.click(); }
  });
  panel.appendChild(h('div', { class: 'login-section' },
    h('p', { class: 'field-label', text: profiles.length ? 'Or create another profile' : 'Create your profile' }),
    form));

  panel.appendChild(h('div', { class: 'login-section' },
    h('button', { type: 'button', class: 'demo-entry', onClick: () => ctx.openDemo() },
      h('span', { class: 'demo-entry-icon' }, icon('spark', 22)),
      h('span', { class: 'grow' },
        h('strong', { text: 'Open the curated demo' }),
        h('span', { class: 'small muted', text: 'Six numerical-optimization topics. Offline. No key, no profile, no changes to your notes.' })),
      h('span', { class: 'demo-entry-go' }, icon('arrowUpRight', 18)))));

  panel.appendChild(h('div', { class: 'login-privacy' },
    h('span', { class: 'privacy-lock' }, icon('lock', 16)),
    h('p', { class: 'small', text: 'This is a local profile, not an account. There is no authentication server, no password and no recovery service. Notes stay in this browser’s storage; if storage is blocked, Vertex keeps working in memory for this session.' }),
    h('p', { class: 'small muted', text: storageInfo().local ? 'Browser storage available.' : 'Browser storage is blocked — this session runs in memory.' })));

  /* art */
  const art = h('div', { class: 'login-art', id: 'login-art', 'aria-hidden': 'true' },
    h('div', { class: 'login-grid-bg' }),
    h('div', { class: 'login-scene' },
      h('div', { class: 'axis axis-x' }), h('div', { class: 'axis axis-y' }), h('div', { class: 'axis axis-z' }),
      h('div', { class: 'login-plane' }),
      h('div', { class: 'login-note-card note-a' }, h('small', { text: 'lecture 04' }), h('strong', { text: '∇f = 0' }), h('span', { text: 'stationary' })),
      h('div', { class: 'login-note-card note-b' }, h('small', { text: 'your notes' }), h('strong', { text: 'H d = −∇f' }), h('span', { text: 'Newton direction' })),
      h('div', { class: 'login-note-card note-c' }, h('small', { text: 'revision sheet' }), h('strong', { text: 'α < 2/L' }), h('span', { text: 'stable step' })),
      h('div', { class: 'login-node ln-1' }), h('div', { class: 'login-node ln-2' }), h('div', { class: 'login-node ln-3' }),
      h('div', { class: 'login-core' }, h('span', { text: '▲' }))),
    h('div', { class: 'login-art-caption' },
      h('p', { class: 'kicker', text: 'The knowledge orbit' }),
      h('p', { text: 'Scattered lecture material, ordered around one exam.' }),
      h('p', { class: 'small', text: 'No account. No server. No silent upload.' })));

  root.appendChild(h('div', { class: 'login-page' }, art, panel));

  const artEl = root.querySelector('#login-art');
  const onMove = (e) => {
    const r = artEl.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width - 0.5) * 2;
    const y = ((e.clientY - r.top) / r.height - 0.5) * 2;
    artEl.style.setProperty('--lx', x.toFixed(3));
    artEl.style.setProperty('--ly', y.toFixed(3));
  };
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    artEl.addEventListener('pointermove', onMove);
    cleanup = () => artEl.removeEventListener('pointermove', onMove);
  }
  ctx.refreshShell?.();
  return cleanup;
}
