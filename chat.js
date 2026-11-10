/* chat.js — Vertex tutor chat client (BharatCode API + canned offline fallback).
 *
 * Plain browser script — no modules, no dependencies. Defines the frozen
 * global window.VertexChat with send(text).
 *
 * Security notes:
 *  - The API key lives only in localStorage under "vertex_api_key".
 *  - It is never logged, never placed in a DOM attribute, never hardcoded.
 *  - All rendered text (user input included) goes through textContent.
 */
(function () {
  'use strict';

  var ENDPOINT = 'https://bharatcode.ai/api/model/v1/chat/completions';
  var MODEL = 'qwen-3.8-27b';
  var MAX_TOKENS = 300;
  var TEMPERATURE = 0.4;
  var TIMEOUT_MS = 3000;                 /* hard 3 s abort budget */
  var KEY_STORAGE = 'vertex_api_key';
  var TOPIC_STORAGE = 'vertex_lastTopic';
  var CHIP_ID = 'chat-offline-chip';
  var CHIP_ALT_IDS = ['chat-offline-chip', 'offline-chip', 'chip-offline'];
  var SEND_BUTTON_SELECTOR = '#chat-send, #btn-chat-send, #btn-send, [data-chat-send]';

  /* ---------- canned fallback map (keyed by topic context) ---------- */

  var GENERIC_FALLBACK =
    'Here is how to think about it offline: write down what is known, what is ' +
    'asked, and which rule connects them (definitions, then a rule like the ' +
    'sine or cosine rule, then arithmetic). Add a BharatCode API key in ' +
    'Settings for full live tutoring.';

  var FALLBACKS = [
    {
      test: /cosine|cos\s+rule|a\s*\^\s*2\s*=|b2\s*\+\s*c2/i,
      answer:
        'Cosine rule (offline): a\u00B2 = b\u00B2 + c\u00B2 \u2212 2bc\u00B7cos A. ' +
        'Use it when you know two sides and the included angle (find the third side), ' +
        'or all three sides (find an angle: cos A = (b\u00B2 + c\u00B2 \u2212 a\u00B2) / 2bc). ' +
        'Check the sign: if A is obtuse, cos A is negative and a\u00B2 > b\u00B2 + c\u00B2.'
    },
    {
      test: /sine rule|law of sines|sin\s*\/\s*a|a\s*\/\s*sin/i,
      answer:
        'Sine rule (offline): a / sin A = b / sin B = c / sin C. ' +
        'Use it when you know a side and its opposite angle. Beware the ambiguous ' +
        'case (SSA): sin B = value can give B or 180\u00B0 \u2212 B \u2014 test both against the ' +
        'angle sum of the triangle.'
    },
    {
      test: /soh|cah|toa|opposite|adjacent|hypotenuse|trig\s+ratio|sin\s*=?\s*opp|tan\s*=?\s*opp/i,
      answer:
        'SOH-CAH-TOA (offline): for a right triangle, sin \u03B8 = opposite / hypotenuse, ' +
        'cos \u03B8 = adjacent / hypotenuse, tan \u03B8 = opposite / adjacent. ' +
        'Label the sides relative to the angle you care about first \u2014 mixing up ' +
        'opposite and adjacent is the classic mistake. Also tan \u03B8 = sin \u03B8 / cos \u03B8.'
    },
    {
      test: /radian|degree|\bdeg\b|180\s*\u00B0|pi\s*\*|angle measure/i,
      answer:
        'Radians (offline): 180\u00B0 = \u03C0 rad. Degrees \u2192 radians: multiply by \u03C0/180. ' +
        'Radians \u2192 degrees: multiply by 180/\u03C0. Quick marks: 90\u00B0 = \u03C0/2, ' +
        '60\u00B0 = \u03C0/3, 45\u00B0 = \u03C0/4, 30\u00B0 = \u03C0/6. Always check whether your ' +
        'calculator is in DEG or RAD mode before evaluating a trig function.'
    },
    {
      test: /unit circle|identit|sin2|cos2|sin\^?2|tan.*sec|pythagorean identity/i,
      answer:
        'Unit circle (offline): a point at angle \u03B8 on the unit circle is (cos \u03B8, sin \u03B8), ' +
        'so \u22121 \u2264 sin, cos \u2264 1 and tan \u03B8 = sin \u03B8 / cos \u03B8 (undefined at 90\u00B0, 270\u00B0). ' +
        'Key identity: sin\u00B2\u03B8 + cos\u00B2\u03B8 = 1 (it is just Pythagoras on the radius). ' +
        'Use symmetry: reference angle + quadrant sign beats memorising every value.'
    }
  ];

  function fallbackFor(question) {
    for (var i = 0; i < FALLBACKS.length; i++) {
      if (FALLBACKS[i].test.test(question)) return FALLBACKS[i].answer;
    }
    return GENERIC_FALLBACK;
  }

  /* ---------- tiny DOM helpers (all rendering via textContent, never raw HTML) ---------- */

  function getEl(id) {
    try { return document.getElementById(id); } catch (e) { return null; }
  }

  function appendMessage(role, text) {
    var log = getEl('chat-log');
    if (!log) return null;
    var row = document.createElement('div');
    row.className = 'msg-row ' + (role === 'user' ? 'user' : 'tutor');
    var sender = document.createElement('span');
    sender.className = 'msg-sender';
    sender.textContent = role === 'user' ? 'You' : 'Vertex';
    var body = document.createElement('div');
    body.className = 'msg' + (text === 'Thinking\u2026' ? ' pending' : '');
    body.textContent = text;
    row.appendChild(sender);
    row.appendChild(body);
    log.appendChild(row);
    try { log.scrollTop = log.scrollHeight; } catch (e) { /* non-scrolling log */ }
    return body;
  }

  function getChip() {
    for (var i = 0; i < CHIP_ALT_IDS.length; i++) {
      var el = getEl(CHIP_ALT_IDS[i]);
      if (el) return el;
    }
    /* Not shipped in index.html yet — create one next to the chat log. */
    var log = getEl('chat-log');
    var view = getEl('view-chat');
    var parent = view || (log ? log.parentNode : null) || document.body;
    if (!parent) return null;
    var chip = document.createElement('span');
    chip.id = CHIP_ID;
    chip.className = 'chip chip-offline';
    chip.textContent = 'offline mode';
    chip.hidden = true;
    try { parent.insertBefore(chip, log && log.parentNode === parent ? log : parent.firstChild); }
    catch (e) { parent.appendChild(chip); }
    return chip;
  }

  function showChip() {
    var chip = getChip();
    if (chip) { chip.hidden = false; }
  }

  function hideChip() {
    var chip = null;
    for (var i = 0; i < CHIP_ALT_IDS.length; i++) {
      chip = getEl(CHIP_ALT_IDS[i]);
      if (chip) break;
    }
    if (chip) { chip.hidden = true; }
  }

  /* ---------- key + prompt ---------- */

  function readKey() {
    try {
      var raw = localStorage.getItem(KEY_STORAGE);
      return typeof raw === 'string' ? raw.trim() : '';
    } catch (e) { return ''; }
  }

  function sheetFacts() {
    var facts = '';
    try {
      var data = window.VERTEX_DATA;
      var topicId = 'trigonometry';
      try { topicId = localStorage.getItem(TOPIC_STORAGE) || 'trigonometry'; } catch (e) { /* default */ }
      var sheet = data && data.sheet && (data.sheet[topicId] || data.sheet.trigonometry);
      if (sheet) {
        var lines = [];
        if (sheet.formulas && sheet.formulas.length) {
          lines = lines.concat(mapStrings(sheet.formulas));
        }
        if (sheet.rules && sheet.rules.length) {
          lines = lines.concat(mapStrings(sheet.rules));
        }
        if (lines.length) facts = ' Facts for this topic:\n- ' + lines.join('\n- ');
      }
    } catch (e) { /* facts stay empty; the model can still answer generically */ }
    return facts;
  }

  function mapStrings(arr) {
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      if (typeof arr[i] === 'string' && arr[i].length) out.push(arr[i]);
    }
    return out;
  }

  function systemPrompt() {
    return 'You are Vertex, an adaptive math tutor. Explain in short steps. If unsure, say so.' + sheetFacts();
  }

  /* ---------- conversation (kept in memory only; never stores the key) ---------- */

  var history = [];   /* [{ role: 'user'|'assistant', content: string }] */
  var HISTORY_MAX = 10;

  function pushHistory(role, content) {
    history.push({ role: role, content: content });
    while (history.length > HISTORY_MAX) history.shift();
  }

  function buildMessages(question) {
    var messages = [{ role: 'system', content: systemPrompt() }];
    for (var i = 0; i < history.length; i++) {
      messages.push({ role: history[i].role, content: history[i].content });
    }
    messages.push({ role: 'user', content: question });
    return messages;
  }

  /* ---------- remote call with hard 3 s AbortController timeout ---------- */

  function askRemote(question, key, pending) {
    var controller = new AbortController();
    var settled = false;

    var timer = setTimeout(function () { controller.abort(); }, 3000);

    function finish(text, offline) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      renderInto(pending, text);
      pushHistory('assistant', text);
      if (offline) showChip(); else hideChip();
    }

    function run() {
      return fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + key,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: MODEL,
          messages: buildMessages(question),
          max_tokens: MAX_TOKENS,
          temperature: TEMPERATURE
        }),
        signal: controller.signal
      }).then(function (res) {
        /* (d) non-200 response */
        if (!res || res.status !== 200) {
          return fallbackFor(question);
        }
        /* (e) malformed / empty JSON body */
        return res.json().then(function (data) {
          var answer = extractContent(data);
          return answer === null ? fallbackFor(question) : answer;
        }, function () {
          return fallbackFor(question);
        });
      }).then(function (text) {
        finish(text, isFallbackText(question, text));
      });
    }

    run().catch(function () {
      /* (b) timeout/abort and (c) network error / rejection / CORS block */
      finish(fallbackFor(question), true);
    });
  }

  function isFallbackText(question, text) {
    for (var i = 0; i < FALLBACKS.length; i++) {
      if (FALLBACKS[i].answer === text) return true;
    }
    return text === GENERIC_FALLBACK;
  }

  function extractContent(data) {
    try {
      var choice = data && data.choices && data.choices[0];
      var msg = choice && (choice.message || choice.delta);
      var content = msg && msg.content;
      if (typeof content === 'string' && content.trim()) return content.trim();
      return null;
    } catch (e) { return null; }
  }

  function renderInto(el, text) {
    if (!el) return;
    el.textContent = text;
    el.className = 'msg';
  }

  /* ---------- public entry ---------- */

  function send(text) {
    var question = '';
    try {
      question = typeof text === 'string' ? text.trim() : '';
    } catch (e) { question = ''; }
    if (!question) {
      var input = getEl('chat-input');
      if (input && typeof input.value === 'string') question = input.value.trim();
    }
    if (!question) return;

    appendMessage('user', question);
    pushHistory('user', question);
    var pending = appendMessage('assistant', 'Thinking\u2026');

    var input2 = getEl('chat-input');
    if (input2) { try { input2.value = ''; } catch (e) { /* read-only input */ } }

    var key = readKey();

    /* (a) no / empty API key -> instant canned reply + offline chip */
    if (!key) {
      var canned = fallbackFor(question);
      renderInto(pending, canned);
      pushHistory('assistant', canned);
      showChip();
      return;
    }

    try {
      askRemote(question, key, pending);
    } catch (e) {
      /* defensive: any synchronous failure still renders a usable reply */
      var safe = fallbackFor(question);
      renderInto(pending, safe);
      pushHistory('assistant', safe);
      showChip();
    }
  }

  /* ---------- self-installed wire-up (addEventListener only, no inline handlers) ---------- */

  var wired = false;

  function wire() {
    if (wired) return;
    wired = true;

    var input = getEl('chat-input');
    if (input && input.addEventListener) {
      input.addEventListener('keydown', function (e) {
        if (e && (e.key === 'Enter' || e.keyCode === 13) && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          send(input.value);
        }
      });
    }

    /* Clicks on any chat-send styled button (id-agnostic so index.html can
       name it freely): #chat-send, #btn-chat-send, #btn-send or [data-chat-send]. */
    if (document.addEventListener) {
      document.addEventListener('click', function (e) {
        var target = e && e.target;
        if (!target || typeof target.closest !== 'function') return;
        var btn = target.closest(SEND_BUTTON_SELECTOR);
        if (!btn) return;
        e.preventDefault();
        var inp = getEl('chat-input');
        send(inp ? inp.value : '');
      });
    }
  }

  if (document.readyState === 'loading' && document.addEventListener) {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }

  window.VertexChat = {
    send: send,
    /* exposed for tests / app.js integration; internal helpers stay private */
    offlineReply: fallbackFor
  };
}());
