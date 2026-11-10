/**
 * views/settings.js — Settings modal (plan §5 flow diagram + §9 keys/privacy):
 * BYO BharatCode key (password field, never echoed back into the DOM after
 * save), model select, "Remember on this device", language (English now,
 * Hinglish disabled — F30 is P1), hidden Gemini section (flag off),
 * privacy copy and the bharatcode.ai link.
 */
import { DEFAULTS } from '../contracts.js';

const GEMINI_ENABLED = false; // feature flag — section stays hidden until F28

export async function render(mount, ctx) {
  const { h, state, deps, actions } = ctx;
  mount.replaceChildren();

  const backdrop = h('div', {
    class: 'modal-backdrop', role: 'dialog', 'aria-modal': 'true',
    'aria-labelledby': 'settings-heading',
  });
  const card = h('div', { class: 'modal-card card' });

  const closeBtn = h('button', { type: 'button', class: 'modal-close', 'aria-label': 'Close settings' }, ['×']);
  closeBtn.addEventListener('click', actions.closeSettings);
  card.appendChild(closeBtn);
  card.appendChild(h('h2', { class: 'modal-title', id: 'settings-heading', text: 'Settings' }));

  /* ---- BharatCode key ---- */
  card.appendChild(h('label', { class: 'field-label', for: 'settings-key', text: 'BharatCode API key' }));
  const keyInput = h('input', {
    id: 'settings-key', class: 'text-input', type: 'password', autocomplete: 'off',
    spellcheck: 'false', placeholder: 'Paste your key — free for students with a .ac.in / .edu.in email',
    'aria-label': 'BharatCode API key',
  });
  const keyStatus = h('p', { class: 'field-note', id: 'settings-key-status' });
  let hasKey = false;
  try { hasKey = !!(await deps.store.getKey('bharatcode')); }
  catch (err) { console.warn('settings.js: getKey status check failed —', err.message); }
  keyStatus.textContent = hasKey
    ? 'A key is stored in this browser (value never shown here, never in the repo, never logged).'
    : 'No key yet — the demo works without one; live lessons need a key.';
  card.appendChild(keyStatus);

  const saveKeyBtn = h('button', { type: 'button', class: 'btn btn-accent btn-sm', text: 'Save key' });
  saveKeyBtn.addEventListener('click', async () => {
    const v = keyInput.value.trim();
    if (!v) { ctx.toast('Nothing to save — paste a key first.', 'error'); return; }
    try {
      await deps.store.setKey('bharatcode', v);
      keyInput.value = ''; // never keep the key in the DOM after save
      keyStatus.textContent = 'Key stored in this browser (value never shown here, never in the repo, never logged).';
      ctx.toast('Key saved. It lives in your browser only.', 'good');
    } catch (err) {
      console.error('settings.js: setKey failed —', err.message);
      ctx.toast('Could not save the key: ' + err.message, 'error');
    }
  });
  const clearKeyBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Remove key' });
  clearKeyBtn.addEventListener('click', async () => {
    try {
      // store.js contract: setKey rejects empty values; removal is clearKey.
      if (typeof deps.store.clearKey === 'function') await deps.store.clearKey('bharatcode');
      else await deps.store.setKey('bharatcode', '');
      keyInput.value = '';
      keyStatus.textContent = 'No key yet — the demo works without one; live lessons need a key.';
      ctx.toast('Key removed from this browser.', 'info');
    } catch (err) {
      console.error('settings.js: key removal failed —', err.message);
      ctx.toast('Could not remove the key.', 'error');
    }
  });
  card.appendChild(h('div', { class: 'btn-row' }, [saveKeyBtn, clearKeyBtn]));

  const remember = h('input', { type: 'checkbox', id: 'settings-remember' });
  remember.checked = !!state.settings.remember;
  remember.addEventListener('change', async () => {
    await actions.saveSettings({ remember: remember.checked });
    try {
      const existing = await deps.store.getKey('bharatcode');
      if (existing) await deps.store.setKey('bharatcode', existing); // migrate storage location
    } catch (err) {
      console.warn('settings.js: key migration after remember-toggle failed —', err.message);
    }
    ctx.toast(remember.checked ? 'Will remember on this device (localStorage).' : 'Session only now — the key is dropped when you close the tab.', 'info');
  });
  card.appendChild(h('label', { class: 'check-row', for: 'settings-remember' }, [
    remember, h('span', { text: 'Remember on this device (otherwise the key is kept for this session only)' }),
  ]));

  /* ---- model ---- */
  card.appendChild(h('label', { class: 'field-label', for: 'settings-model', text: 'Model (BharatCode)' }));
  const modelSel = h('select', { id: 'settings-model', class: 'text-input', 'aria-label': 'BharatCode model' });
  for (const m of [DEFAULTS.modelBharatcode, 'deepseek-v4.1-flash']) {
    const opt = h('option', { value: m, text: m });
    if (state.settings.model === m) opt.selected = true;
    modelSel.appendChild(opt);
  }
  modelSel.addEventListener('change', async () => {
    await actions.saveSettings({ model: modelSel.value });
    ctx.toast('Model set to ' + modelSel.value + '.', 'good');
  });
  card.appendChild(modelSel);

  /* ---- language (F30 P1: plumbing exists, toggle disabled) ---- */
  card.appendChild(h('label', { class: 'field-label', for: 'settings-lang', text: 'Language' }));
  const langSel = h('select', { id: 'settings-lang', class: 'text-input', 'aria-label': 'Explanation language' });
  const enOpt = h('option', { value: 'en', text: 'English' });
  enOpt.selected = true;
  const hiOpt = h('option', { value: 'hinglish', text: 'Hinglish (coming soon)', disabled: true });
  langSel.appendChild(enOpt);
  langSel.appendChild(hiOpt);
  langSel.addEventListener('change', async () => {
    if (langSel.value !== 'en') { langSel.value = 'en'; return; } // Hinglish is P1
    await actions.saveSettings({ lang: 'en' });
  });
  card.appendChild(langSel);

  /* ---- Gemini (hidden while the flag is off) ---- */
  const geminiSec = h('div', { class: 'gemini-section', hidden: !GEMINI_ENABLED });
  geminiSec.appendChild(h('label', { class: 'field-label', for: 'settings-gemini', text: 'Gemini key (optional — off in this build)' }));
  geminiSec.appendChild(h('input', { id: 'settings-gemini', class: 'text-input', type: 'password', autocomplete: 'off', 'aria-label': 'Gemini API key (feature disabled)' }));
  card.appendChild(geminiSec);

  /* ---- privacy + link (plan §9) ---- */
  card.appendChild(h('p', { class: 'field-note', text: 'Privacy: your notes are stored in your browser. They are sent to the model provider you choose (and to a Worker proxy only if one is configured) to generate lessons. Check that provider\u2019s data terms — Vertex has no accounts and no server database.' }));
  card.appendChild(h('p', { class: 'field-note' }, [
    h('a', { class: 'accent-link', href: 'https://bharatcode.ai', target: '_blank', rel: 'noopener', text: 'Get a free BharatCode key at bharatcode.ai' }),
  ]));

  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) actions.closeSettings(); });
  backdrop.appendChild(card);
  mount.appendChild(backdrop);
  (hasKey ? modelSel : keyInput).focus();
}
