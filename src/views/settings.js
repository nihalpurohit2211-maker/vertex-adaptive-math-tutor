/**
 * views/settings.js — Settings modal (plan §5 flow diagram + §9 keys/privacy,
 * Addendum v5 multi-provider): a provider select (BharatCode default ·
 * Google AI Studio/Gemini · Demo), then the key + model fields for whichever
 * provider is active. Keys are password fields, never echoed back into the
 * DOM after save, never logged, never in the repo. "Remember on this device"
 * applies to every stored key (store.js relocates both tiers on flip).
 * Language (English now, Hinglish disabled — F30 is P1), privacy copy and the
 * provider links are common to all providers.
 */
import { DEFAULTS } from '../contracts.js';

const PROVIDER_LABELS = {
  bharatcode: 'BharatCode (default — free student key)',
  gemini: 'Google AI Studio (Gemini)',
  demo: 'Demo only (no key, no live lessons)',
};
const PROVIDER_ORDER = ['bharatcode', 'gemini', 'demo'];
const GEMINI_MODEL_SUGGESTIONS = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-flash-latest', 'gemini-2.0-flash'];

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

  /* ---- provider select (Addendum v5) ---- */
  card.appendChild(h('label', { class: 'field-label', for: 'settings-provider', text: 'Model provider' }));
  const provSel = h('select', { id: 'settings-provider', class: 'text-input', 'aria-label': 'Model provider' });
  for (const p of PROVIDER_ORDER) {
    const opt = h('option', { value: p, text: PROVIDER_LABELS[p] });
    if (state.settings.provider === p) opt.selected = true;
    provSel.appendChild(opt);
  }
  card.appendChild(provSel);
  card.appendChild(h('p', {
    class: 'field-note',
    text: 'BharatCode is the default. Switch to Google AI Studio to use your own Gemini key, or Demo to explore the curated notebook without any key.',
  }));

  /* ---- shared "remember" toggle (applies to every stored key) ---- */
  const remember = h('input', { type: 'checkbox', id: 'settings-remember' });
  remember.checked = !!state.settings.remember;
  remember.addEventListener('change', async () => {
    // store.setSettings relocates BOTH bharatcode and gemini keys to the new
    // canonical tier when `remember` flips — no per-key migration needed here.
    await actions.saveSettings({ remember: remember.checked });
    ctx.toast(remember.checked ? 'Will remember on this device (localStorage).' : 'Session only now — keys are dropped when you close the tab.', 'info');
  });
  const rememberRow = h('label', { class: 'check-row', for: 'settings-remember' }, [
    remember, h('span', { text: 'Remember on this device (otherwise keys are kept for this session only)' }),
  ]);

  /* ---- BharatCode section ---- */
  const bcSec = h('div', { class: 'provider-section' });
  bcSec.appendChild(h('label', { class: 'field-label', for: 'settings-key', text: 'BharatCode API key' }));
  const bcKeyInput = h('input', {
    id: 'settings-key', class: 'text-input', type: 'password', autocomplete: 'off',
    spellcheck: 'false', placeholder: 'Paste your key — free for students with a .ac.in / .edu.in email',
    'aria-label': 'BharatCode API key',
  });
  const bcKeyStatus = h('p', { class: 'field-note', id: 'settings-key-status' });
  let bcHasKey = false;
  try { bcHasKey = !!(await deps.store.getKey('bharatcode')); }
  catch (err) { console.warn('settings.js: bharatcode getKey status check failed —', err.message); }
  bcKeyStatus.textContent = bcHasKey
    ? 'A key is stored in this browser (value never shown here, never in the repo, never logged).'
    : 'No key yet — the demo works without one; live lessons need a key.';
  bcSec.appendChild(bcKeyStatus);
  bcSec.appendChild(bcKeyInput);

  const bcSaveBtn = h('button', { type: 'button', class: 'btn btn-accent btn-sm', text: 'Save key' });
  bcSaveBtn.addEventListener('click', async () => {
    const v = bcKeyInput.value.trim();
    if (!v) { ctx.toast('Nothing to save — paste a key first.', 'error'); return; }
    try {
      await deps.store.setKey('bharatcode', v);
      bcKeyInput.value = ''; // never keep the key in the DOM after save
      bcKeyStatus.textContent = 'Key stored in this browser (value never shown here, never in the repo, never logged).';
      ctx.toast('BharatCode key saved. It lives in your browser only.', 'good');
    } catch (err) {
      console.error('settings.js: bharatcode setKey failed —', err.message);
      ctx.toast('Could not save the key: ' + err.message, 'error');
    }
  });
  const bcClearBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Remove key' });
  bcClearBtn.addEventListener('click', async () => {
    try {
      if (typeof deps.store.clearKey === 'function') await deps.store.clearKey('bharatcode');
      else await deps.store.setKey('bharatcode', '');
      bcKeyInput.value = '';
      bcKeyStatus.textContent = 'No key yet — the demo works without one; live lessons need a key.';
      ctx.toast('BharatCode key removed from this browser.', 'info');
    } catch (err) {
      console.error('settings.js: bharatcode key removal failed —', err.message);
      ctx.toast('Could not remove the key.', 'error');
    }
  });
  bcSec.appendChild(h('div', { class: 'btn-row' }, [bcSaveBtn, bcClearBtn]));

  bcSec.appendChild(h('label', { class: 'field-label', for: 'settings-model', text: 'Model (BharatCode)' }));
  const bcModelSel = h('select', { id: 'settings-model', class: 'text-input', 'aria-label': 'BharatCode model' });
  for (const m of [DEFAULTS.modelBharatcode, 'deepseek-v4.1-flash']) {
    const opt = h('option', { value: m, text: m });
    if (state.settings.model === m) opt.selected = true;
    bcModelSel.appendChild(opt);
  }
  bcModelSel.addEventListener('change', async () => {
    await actions.saveSettings({ model: bcModelSel.value });
    ctx.rerender(); // keep the setup model chip in sync behind the modal
    ctx.toast('BharatCode model set to ' + bcModelSel.value + '.', 'good');
  });
  bcSec.appendChild(bcModelSel);
  bcSec.appendChild(h('p', { class: 'field-note' }, [
    h('a', { class: 'accent-link', href: 'https://bharatcode.ai', target: '_blank', rel: 'noopener', text: 'Get a free BharatCode key at bharatcode.ai' }),
  ]));
  card.appendChild(bcSec);

  /* ---- Google AI Studio (Gemini) section ---- */
  const gmSec = h('div', { class: 'provider-section' });
  gmSec.appendChild(h('label', { class: 'field-label', for: 'settings-gemini-key', text: 'Google AI Studio API key' }));
  const gmKeyInput = h('input', {
    id: 'settings-gemini-key', class: 'text-input', type: 'password', autocomplete: 'off',
    spellcheck: 'false', placeholder: 'Paste your Gemini API key from aistudio.google.com',
    'aria-label': 'Google AI Studio (Gemini) API key',
  });
  const gmKeyStatus = h('p', { class: 'field-note', id: 'settings-gemini-status' });
  let gmHasKey = false;
  try { gmHasKey = !!(await deps.store.getKey('gemini')); }
  catch (err) { console.warn('settings.js: gemini getKey status check failed —', err.message); }
  gmKeyStatus.textContent = gmHasKey
    ? 'A Gemini key is stored in this browser (value never shown here, never in the repo, never logged).'
    : 'No Gemini key yet — live Gemini lessons need one.';
  gmSec.appendChild(gmKeyStatus);
  gmSec.appendChild(gmKeyInput);

  const gmSaveBtn = h('button', { type: 'button', class: 'btn btn-accent btn-sm', text: 'Save key' });
  gmSaveBtn.addEventListener('click', async () => {
    const v = gmKeyInput.value.trim();
    if (!v) { ctx.toast('Nothing to save — paste a key first.', 'error'); return; }
    try {
      await deps.store.setKey('gemini', v);
      gmKeyInput.value = ''; // never keep the key in the DOM after save
      gmKeyStatus.textContent = 'Gemini key stored in this browser (value never shown here, never in the repo, never logged).';
      ctx.toast('Gemini key saved. It lives in your browser only.', 'good');
    } catch (err) {
      console.error('settings.js: gemini setKey failed —', err.message);
      ctx.toast('Could not save the key: ' + err.message, 'error');
    }
  });
  const gmClearBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Remove key' });
  gmClearBtn.addEventListener('click', async () => {
    try {
      if (typeof deps.store.clearKey === 'function') await deps.store.clearKey('gemini');
      else await deps.store.setKey('gemini', '');
      gmKeyInput.value = '';
      gmKeyStatus.textContent = 'No Gemini key yet — live Gemini lessons need one.';
      ctx.toast('Gemini key removed from this browser.', 'info');
    } catch (err) {
      console.error('settings.js: gemini key removal failed —', err.message);
      ctx.toast('Could not remove the key.', 'error');
    }
  });
  gmSec.appendChild(h('div', { class: 'btn-row' }, [gmSaveBtn, gmClearBtn]));

  gmSec.appendChild(h('label', { class: 'field-label', for: 'settings-gemini-model', text: 'Model (Gemini)' }));
  const gmModelInput = h('input', {
    id: 'settings-gemini-model', class: 'text-input', type: 'text', autocomplete: 'off',
    spellcheck: 'false', list: 'gemini-model-suggestions',
    value: state.settings.geminiModel || DEFAULTS.geminiModel,
    'aria-label': 'Gemini model id',
  });
  const gmDatalist = h('datalist', { id: 'gemini-model-suggestions' });
  for (const m of GEMINI_MODEL_SUGGESTIONS) gmDatalist.appendChild(h('option', { value: m }));
  gmSec.appendChild(gmDatalist);
  gmSec.appendChild(gmModelInput);
  gmSec.appendChild(h('p', { class: 'field-note', text: 'Any model id your AI Studio key supports — e.g. gemini-2.5-flash. Saved when you leave the field.' }));
  gmModelInput.addEventListener('change', async () => {
    const v = gmModelInput.value.trim();
    if (!v) { gmModelInput.value = state.settings.geminiModel || DEFAULTS.geminiModel; return; }
    await actions.saveSettings({ geminiModel: v });
    ctx.rerender(); // keep the setup model chip in sync behind the modal
    ctx.toast('Gemini model set to ' + v + '.', 'good');
  });
  gmSec.appendChild(h('p', { class: 'field-note' }, [
    h('a', { class: 'accent-link', href: 'https://aistudio.google.com/app/apikey', target: '_blank', rel: 'noopener', text: 'Get a Gemini API key at aistudio.google.com' }),
  ]));
  card.appendChild(gmSec);

  /* ---- remember + language (common) ---- */
  card.appendChild(rememberRow);

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

  /* ---- privacy (common) ---- */
  card.appendChild(h('p', { class: 'field-note', text: 'Privacy: your notes are stored in your browser. They are sent to the model provider you choose (and to a Worker proxy only if one is configured) to generate lessons. Check that provider\u2019s data terms — Vertex has no accounts and no server database.' }));

  /* ---- show only the active provider's section ---- */
  function syncSections() {
    const p = state.settings.provider;
    bcSec.hidden = p !== 'bharatcode';
    gmSec.hidden = p !== 'gemini';
  }
  provSel.addEventListener('change', async () => {
    await actions.saveSettings({ provider: provSel.value });
    syncSections();
    ctx.rerender(); // keep the setup model chip in sync behind the modal
    ctx.toast('Provider set to ' + (PROVIDER_LABELS[provSel.value] || provSel.value) + '.', 'good');
  });
  syncSections();

  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) actions.closeSettings(); });
  backdrop.appendChild(card);
  mount.appendChild(backdrop);

  // Focus the active provider's key input (or the model field if a key exists).
  if (state.settings.provider === 'gemini') (gmHasKey ? gmModelInput : gmKeyInput).focus();
  else if (state.settings.provider === 'bharatcode') (bcHasKey ? bcModelSel : bcKeyInput).focus();
  else provSel.focus();
}
