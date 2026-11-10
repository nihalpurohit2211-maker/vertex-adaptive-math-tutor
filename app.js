/* Vertex — app.js (engine agent)
 * Adaptive math tutor client: state machine + mastery model + selection + rendering.
 * Plain browser script, zero dependencies, no modules, no CDN. Loads AFTER data/topics.js.
 * Model per vertex_plan_v2.md §6. Rendering per §7: app.js populates the containers that
 * already exist in index.html using the class names that already exist in styles.css —
 * no parallel DOM, no injected replacement controls. addEventListener only, no inline
 * handlers, no eval. Every lookup tolerates a missing element.
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Frozen constants
   * ------------------------------------------------------------------ */
  var LS = {
    scores: 'vertex_scores',        // map conceptId -> integer 0..10
    streak: 'vertex_streak',        // integer day-streak (seeded demo state)
    mistakes: 'vertex_mistakes',    // array of {questionId, chosen, correct, ts}
    lastTopic: 'vertex_lastTopic',  // topic id string
    apiKey: 'vertex_api_key'        // settings-only; never logged, never echoed into the DOM
  };
  var MASTER_SCORE = 7;   // mastery threshold: score >= 7
  var START_SCORE = 5;    // default per-concept score
  var REVISION_MAX_Q = 6; // revision mode: max 6 questions
  var REVISION_CAP = 2;   // revision mode: difficulty cap 2
  var VIEW_IDS = ['view-dashboard', 'view-picker', 'view-quiz', 'view-mastered', 'view-sheet', 'view-chat'];

  /* ------------------------------------------------------------------ *
   * Tiny DOM + storage helpers (every one tolerates a missing element)
   * ------------------------------------------------------------------ */
  function $(id) {
    try { return document.getElementById(id); } catch (e) { return null; }
  }
  function view(name) {
    try { return document.querySelector('[data-view="' + name + '"]'); } catch (e) { return null; }
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function clearNode(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { /* private mode: run in-memory */ } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function lsJson(k, fallback) {
    var raw = lsGet(k);
    if (raw === null) return fallback;
    try { var v = JSON.parse(raw); return v === null || v === undefined ? fallback : v; }
    catch (e) { return fallback; }
  }
  function clampScore(n) {
    n = Math.round(Number(n));
    if (!isFinite(n)) return START_SCORE;
    return Math.max(0, Math.min(10, n));
  }

  /* ------------------------------------------------------------------ *
   * Data access (tolerates a missing/partial window.VERTEX_DATA)
   * ------------------------------------------------------------------ */
  function D() {
    var d = window.VERTEX_DATA;
    if (!d || typeof d !== 'object') d = {};
    return {
      topics: Array.isArray(d.topics) ? d.topics : [],
      concepts: Array.isArray(d.concepts) ? d.concepts : [],
      questions: Array.isArray(d.questions) ? d.questions : [],
      sheet: d.sheet && typeof d.sheet === 'object' ? d.sheet : {}
    };
  }
  function liveTopics() { return D().topics.filter(function (t) { return t.status === 'live'; }); }
  function topicById(id) {
    var list = D().topics.filter(function (t) { return t.id === id; });
    return list[0] || null;
  }
  function conceptsOfTopic(topicId) {
    // Keep VERTEX_DATA.concepts array order — the demo arc's tie-break depends on it.
    return D().concepts.filter(function (c) { return c.topicId === topicId; });
  }
  function conceptById(id) {
    var list = D().concepts.filter(function (c) { return c.id === id; });
    return list[0] || null;
  }
  function questionById(id) {
    var list = D().questions.filter(function (q) { return q.id === id; });
    return list[0] || null;
  }
  function questionsOfConcept(conceptId) {
    return D().questions.filter(function (q) { return q.conceptId === conceptId; });
  }

  /* ------------------------------------------------------------------ *
   * Persistence: scores / streak / mistakes / lastTopic
   * ------------------------------------------------------------------ */
  function defaultScores() {
    var s = {};
    D().concepts.forEach(function (c) { s[c.id] = START_SCORE; });
    return s;
  }
  function getScores() {
    var s = defaultScores();
    var stored = lsJson(LS.scores, null);
    if (stored && typeof stored === 'object') {
      Object.keys(stored).forEach(function (k) {
        if (typeof stored[k] === 'number') s[k] = clampScore(stored[k]);
      });
    }
    return s;
  }
  function saveScores(scores) { lsSet(LS.scores, JSON.stringify(scores)); }
  function scoreOf(conceptId) {
    var v = getScores()[conceptId];
    return typeof v === 'number' ? v : START_SCORE;
  }
  function streakInfo() {
    var v = lsJson(LS.streak, 0);
    if (v && typeof v === 'object') {
      return { count: Math.max(0, Math.round(Number(v.count) || 0)), day: v.day || null };
    }
    var n = Number(v);
    return { count: isFinite(n) ? Math.max(0, Math.round(n)) : 0, day: null };
  }
  function getStreak() { return streakInfo().count; }
  function getMistakes() {
    var v = lsJson(LS.mistakes, []);
    return Array.isArray(v) ? v : [];
  }
  function saveMistakes(list) { lsSet(LS.mistakes, JSON.stringify(list.slice(-50))); }
  function pushMistake(questionId, chosen, correct) {
    var list = getMistakes();
    list.push({ questionId: questionId, chosen: chosen, correct: correct, ts: Date.now() });
    saveMistakes(list);
  }
  function getLastTopic() { return lsGet(LS.lastTopic) || ''; }
  function saveLastTopic(id) { lsSet(LS.lastTopic, id); }

  /* ------------------------------------------------------------------ *
   * Demo seed (auto on first load, "Try the demo", Settings reset).
   * The 3 mistake entries below are templates: each one is resolved at
   * seed time to a REAL questionId from window.VERTEX_DATA (chosen is a
   * plausible wrong option, correct is the real answer key).
   * ------------------------------------------------------------------ */
  var DEMO_SEED = {
    scores: {
      'sine-cosine-rule': 6,
      'unit-circle': 6,
      'trig-ratios': 6,
      'radians': 9,
      'solve-triangles': 9
    },
    streak: 4,
    lastTopic: 'trigonometry',
    mistakes: [
      { conceptId: 'trig-ratios', qIndex: 0, chosenOffset: 1 },
      { conceptId: 'sine-cosine-rule', qIndex: 0, chosenOffset: 2 },
      { conceptId: 'unit-circle', qIndex: 0, chosenOffset: 3 }
    ]
  };

  function seedDemoState() {
    var scores = defaultScores();
    Object.keys(DEMO_SEED.scores).forEach(function (id) { scores[id] = DEMO_SEED.scores[id]; });
    saveScores(scores);
    lsSet(LS.streak, String(DEMO_SEED.streak));
    lsSet(LS.lastTopic, DEMO_SEED.lastTopic);

    var now = Date.now();
    var list = [];
    DEMO_SEED.mistakes.forEach(function (m, i) {
      var pool = questionsOfConcept(m.conceptId);
      var q = pool[m.qIndex] || pool[0];
      if (!q) return; // data not present: seed whatever we can, never throw
      list.push({
        questionId: q.id,
        chosen: (q.correct + m.chosenOffset) % 4, // a plausible wrong option
        correct: q.correct,
        ts: now - (i + 1) * 3600 * 1000            // 1h/2h/3h ago
      });
    });
    saveMistakes(list);
  }

  function resetDemoData() {
    lsDel(LS.scores); lsDel(LS.streak); lsDel(LS.mistakes); lsDel(LS.lastTopic);
    // vertex_api_key is deliberately kept — it is the user's own key, not demo data.
    seedDemoState();
  }

  /* ------------------------------------------------------------------ *
   * Engine state machine (FROZEN model — §6)
   * phases: idle -> question -> answered -> (question | mastered | gaps | revision-done)
   * ------------------------------------------------------------------ */
  var Engine = {
    session: null, // {topicId, mode, difficulty, cc, cw, asked:{}, askedList, results, current, hinted, answered, chosen, count, correctCount, focusConceptId, phase}

    init: function () {
      if (lsGet(LS.scores) === null) seedDemoState(); // auto-seed on first load
      UI.renderDashboard();
      UI.show('view-dashboard');
      return this;
    },

    startSession: function (topicId, opts) {
      opts = opts || {};
      var topic = topicById(topicId);
      if (!topic || topic.status !== 'live') return null;
      this.session = {
        topicId: topicId,
        mode: opts.mode || null,               // null = adaptive drill | 'revision'
        difficulty: topic.tier || 1,           // session difficulty starts at the topic's tier
        cc: 0, cw: 0,                          // consecutive-correct / consecutive-wrong streaks
        asked: {}, askedList: [],
        results: [],                           // render-side log: true=right, false=wrong per answer
        current: null, hinted: false, answered: false, chosen: -1,
        count: 0, correctCount: 0,
        focusConceptId: opts.focusConceptId || null, // re-drill one concept (recent mistake tap)
        phase: 'question'
      };
      saveLastTopic(topicId);
      var q = this.advance();
      return q;
    },

    // Weak concepts of the active topic with score < MASTER_SCORE,
    // in VERTEX_DATA.concepts order (ties resolve to earlier index).
    weakConcepts: function () {
      var s = this.session;
      if (!s) return [];
      if (s.focusConceptId) {
        var f = conceptById(s.focusConceptId);
        return f ? [f] : [];
      }
      var scores = getScores();
      return conceptsOfTopic(s.topicId).filter(function (c) {
        return (typeof scores[c.id] === 'number' ? scores[c.id] : START_SCORE) < MASTER_SCORE;
      });
    },

    difficultyCap: function () {
      var s = this.session;
      if (!s) return 1;
      var cap = s.difficulty;
      if (s.mode === 'revision') cap = Math.min(cap, REVISION_CAP);
      return cap;
    },

    // Highest-difficulty unasked question of a concept at or below the cap.
    // Tie-break at equal difficulty: id.localeCompare (matches verify.mjs exactly).
    poolFor: function (conceptId) {
      var s = this.session, cap = this.difficultyCap();
      var pool = questionsOfConcept(conceptId).filter(function (q) {
        return !s.asked[q.id] && q.difficulty <= cap;
      });
      pool.sort(function (a, b) {
        return b.difficulty - a.difficulty || String(a.id).localeCompare(String(b.id));
      });
      return pool[0] || null;
    },

    pickNextQuestion: function () {
      var s = this.session;
      if (!s) return null;
      var weak = this.weakConcepts();
      if (!weak.length) return null;
      var scores = getScores();
      // Lowest score first (ties keep concept-array order via the stable sort);
      // if that concept's bank is exhausted, move to the next-weakest (same rule).
      var ordered = weak.slice().sort(function (a, b) {
        var sa = typeof scores[a.id] === 'number' ? scores[a.id] : START_SCORE;
        var sb = typeof scores[b.id] === 'number' ? scores[b.id] : START_SCORE;
        return sa - sb;
      });
      for (var i = 0; i < ordered.length; i++) {
        var q = this.poolFor(ordered[i].id);
        if (q) return q;
      }
      return null;
    },

    // Advance the drill: pick the next question, or move to an end state.
    advance: function () {
      var s = this.session;
      if (!s) return null;
      if (s.mode === 'revision' && s.count >= REVISION_MAX_Q) {
        s.phase = 'revision-done';
        return null;
      }
      var q = this.pickNextQuestion();
      if (q) {
        s.current = q;
        s.asked[q.id] = true;
        s.askedList.push(q.id);
        s.hinted = false; s.answered = false; s.chosen = -1;
        s.phase = 'question';
        return q;
      }
      // No question available: end state. Revision always ends on the sheet.
      if (s.mode === 'revision') {
        s.current = null;
        s.phase = 'revision-done';
        return null;
      }
      var concepts = conceptsOfTopic(s.topicId);
      var allMastered = concepts.length > 0 && concepts.every(function (c) {
        return scoreOf(c.id) >= MASTER_SCORE;
      });
      s.current = null;
      s.phase = allMastered ? 'mastered' : 'gaps';
      return null;
    },

    next: function () {
      return this.advance();
    },

    // i is the 0-based option index the learner chose.
    answer: function (i) {
      var s = this.session;
      if (!s || !s.current || s.answered || s.phase !== 'question') return null;
      var q = s.current;
      var right = (i === q.correct);
      var scores = getScores();
      var before = typeof scores[q.conceptId] === 'number' ? scores[q.conceptId] : START_SCORE;
      var delta;
      if (right) {
        // Hint cost: a correct answer after the hint is a no gain (+0); plain correct = +1.
        delta = s.hinted ? 0 : 1;
        scores[q.conceptId] = Math.min(10, before + delta);
        s.cc += 1; s.cw = 0;
        if (s.cc >= 2) { s.difficulty = Math.min(3, s.difficulty + 1); s.cc = 0; }
        s.correctCount += 1;
      } else {
        delta = -1; // wrong after hint is still -1
        scores[q.conceptId] = Math.max(0, before - 1);
        s.cw += 1; s.cc = 0;
        if (s.cw >= 2) { s.difficulty = Math.max(1, s.difficulty - 1); s.cw = 0; }
        pushMistake(q.id, i, q.correct);
      }
      saveScores(scores);
      s.answered = true;
      s.chosen = i;
      s.count += 1;
      s.phase = 'answered';
      return {
        right: right,
        delta: delta,
        hinted: s.hinted,
        score: scores[q.conceptId],
        conceptId: q.conceptId,
        questionId: q.id,
        difficulty: s.difficulty
      };
    },

    showHint: function () {
      var s = this.session;
      if (!s || !s.current || s.answered) return null;
      s.hinted = true; // per-question flag; resets when the next question is served
      return s.current.hint;
    },

    // Plain snapshot for the console / automated walkthroughs.
    state: function () {
      var s = this.session;
      var concepts = s ? conceptsOfTopic(s.topicId) : [];
      var scores = getScores();
      var weakest = null;
      for (var i = 0; i < concepts.length; i++) {
        var v = scoreOf(concepts[i].id);
        if (weakest === null || v < scoreOf(weakest.id)) weakest = concepts[i];
      }
      return {
        scores: scores,
        sessionDifficulty: s ? s.difficulty : null,
        currentQuestion: s ? s.current : null,
        askedIds: s ? s.askedList.slice() : [],
        mode: s ? s.mode : null,
        streak: getStreak(),
        mistakes: getMistakes(),
        stats: s ? {
          answered: s.count,
          correct: s.correctCount,
          accuracy: s.count ? Math.round((s.correctCount / s.count) * 100) / 100 : 0,
          weakestConceptId: weakest ? weakest.id : null,
          topicId: s.topicId,
          consecutiveCorrect: s.cc,
          consecutiveWrong: s.cw
        } : { answered: 0, correct: 0, accuracy: 0, weakestConceptId: null, topicId: null, consecutiveCorrect: 0, consecutiveWrong: 0 },
        phase: s ? s.phase : 'idle',
        hinted: s ? s.hinted : false,
        focusConceptId: s ? s.focusConceptId : null
      };
    }
  };

  /* ------------------------------------------------------------------ *
   * UI — view switching (§7: sections toggled via data-view + hidden).
   * Exactly one of the six [data-view] sections is visible. modal-settings
   * stays hidden unless show('modal-settings') is called explicitly, and
   * while it is open the underlying view stays visible underneath it.
   * Nothing but view-dashboard is visible at boot.
   * ------------------------------------------------------------------ */
  var UI = {
    lastView: 'view-dashboard', // which section the modal opens on top of

    show: function (viewId) {
      var modal = view('modal-settings');
      if (viewId === 'modal-settings') {
        if (modal) modal.hidden = false;
        markNav(this.lastView);
        return modal;
      }
      var target = null;
      var sections = Array.prototype.slice.call(document.querySelectorAll('[data-view]'));
      sections.forEach(function (sec) {
        var name = sec.getAttribute('data-view');
        if (name === 'modal-settings') { sec.hidden = true; return; } // never auto-shown
        var active = (name === viewId);
        sec.hidden = !active;
        if (active) target = sec;
      });
      if (!target) target = $(viewId); // id-tolerant fallback
      if (target) { target.hidden = false; this.lastView = viewId; }
      markNav(viewId);
      return target;
    },

    toastTimer: null,
    toastHideTimer: null,
    // Uses the existing #toast element: hidden attribute + .show class, per styles.css §16.
    toast: function (msg) {
      var t = $('toast');
      if (!t) return;
      t.textContent = msg;
      t.hidden = false;
      try { void t.offsetWidth; } catch (e) { /* reflow nudge for the transition */ }
      t.classList.add('show');
      if (this.toastTimer) clearTimeout(this.toastTimer);
      if (this.toastHideTimer) clearTimeout(this.toastHideTimer);
      var self = this;
      this.toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
      this.toastHideTimer = setTimeout(function () { t.hidden = true; }, 3000);
    },

    renderDashboard: function () { renderDashboard(); },

    startQuiz: function (topicId, opts) {
      var q = Engine.startSession(topicId, opts);
      this.show('view-quiz');
      Board.render();
      if (q) { Quiz.render(q); }
      else { finishSession(); }
    },

    startSessionWithFocus: function (conceptId) {
      var c = conceptById(conceptId);
      if (!c) return;
      this.startQuiz(c.topicId, { focusConceptId: conceptId });
    }
  };

  // Header nav active state follows the visible view (the modal keeps the
  // previous view's nav button active).
  function markNav(viewId) {
    Array.prototype.slice.call(document.querySelectorAll('.nav-btn[data-goto]')).forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-goto') === viewId);
    });
  }

  /* ------------------------------------------------------------------ *
   * Mastery board — five bars /10 in #board-rows, live after every answer.
   * styles.css: .bar-row carries mastered|low (score colour), the .bar
   * fill carries mastered|mid|low (bar colour), width inline = score*10%.
   * ------------------------------------------------------------------ */
  function boardStateClass(score) {
    return score >= MASTER_SCORE ? 'mastered' : score <= 4 ? 'low' : 'mid';
  }
  function boardRow(c, score) {
    var state = boardStateClass(score);
    var row = el('div', 'bar-row ' + state);
    row.setAttribute('data-concept', c.id);
    var head = el('div', 'row-head');
    head.appendChild(el('span', 'bar-name', c.name));
    head.appendChild(el('span', 'bar-score', score + '/10'));
    row.appendChild(head);
    var track = el('div', 'bar-track');
    var fill = el('div', 'bar ' + state);
    fill.style.width = (score * 10) + '%';
    track.appendChild(fill);
    row.appendChild(track);
    return row;
  }

  var Board = {
    render: function () {
      var host = $('board-rows');
      if (!host) return;
      clearNode(host);
      var topicId = (Engine.session && Engine.session.topicId) || getLastTopic() || 'trigonometry';
      var concepts = conceptsOfTopic(topicId);
      if (!concepts.length) {
        host.appendChild(el('p', 'section-note', 'Mastery board appears once a topic pack is available.'));
        return;
      }
      concepts.forEach(function (c) {
        host.appendChild(boardRow(c, scoreOf(c.id)));
      });
    }
  };

  /* ------------------------------------------------------------------ *
   * Quiz view rendering — fills the static shells in #quiz-card:
   * #progress-dots .dot, #quiz-prompt, #options li.option > span.key,
   * #mode-chip, .diagram, #hint-panel, #why-panel (via showWhy).
   * Answer lock = .locked on #options (the container, per styles.css §11);
   * flash = .flash-correct / .flash-wrong on the option itself.
   * ------------------------------------------------------------------ */
  var Quiz = {
    selectedIndex: -1, // keyboard pre-selection (1–4), before Enter submits

    render: function (q) {
      this.selectedIndex = -1;
      if (!q) return;
      var card = $('quiz-card');
      if (!card) return;
      var s = Engine.session;

      this.renderDots();

      var modeChip = $('mode-chip');
      if (modeChip) {
        modeChip.textContent = (s && s.mode === 'revision')
          ? 'revision · 30 min'
          : 'adaptive · level ' + (s ? s.difficulty : 1);
      }

      var prompt = $('quiz-prompt');
      if (prompt) prompt.textContent = q.question;

      // Diagram: curated inline SVG from the local data file only (never user input).
      var oldFig = card.querySelector('.diagram');
      if (oldFig && oldFig.parentNode) oldFig.parentNode.removeChild(oldFig);
      if (q.diagram) {
        var fig = el('div', 'diagram');
        fig.innerHTML = q.diagram;
        var optsUl = $('options');
        if (optsUl && optsUl.parentNode === card) card.insertBefore(fig, optsUl);
        else card.appendChild(fig);
      }

      // Options: li.option with an inner span.key showing 1–4.
      var options = $('options');
      if (options) {
        clearNode(options);
        options.classList.remove('locked');
        (q.options || []).forEach(function (text, idx) {
          var li = el('li', 'option');
          li.setAttribute('role', 'button');
          li.tabIndex = 0;
          li.appendChild(el('span', 'key', String(idx + 1)));
          li.appendChild(el('span', 'opt-text', text));
          li.addEventListener('click', function () { submitAnswer(idx); });
          li.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); submitAnswer(idx); }
          });
          options.appendChild(li);
        });
      }

      // Per-question panel reset (static shells stay in place, never rebuilt).
      var hintPanel = $('hint-panel');
      if (hintPanel) { clearNode(hintPanel); hintPanel.hidden = true; }
      var whyPanel = $('why-panel');
      if (whyPanel) whyPanel.hidden = true;
      var whySteps = $('why-steps');
      if (whySteps) clearNode(whySteps);
      var whyMistake = whyPanel && whyPanel.querySelector('.why-mistake');
      if (whyMistake) whyPanel.removeChild(whyMistake);
      var eli5 = $('eli5-panel');
      if (eli5) { eli5.textContent = ''; eli5.hidden = true; }
      var eli5Btn = $('btn-eli5');
      if (eli5Btn) eli5Btn.setAttribute('aria-expanded', 'false');

      var fb = card.querySelector('.quiz-feedback');
      if (fb && fb.parentNode) fb.parentNode.removeChild(fb);
      var nextBtn = card.querySelector('.quiz-next');
      if (nextBtn) nextBtn.hidden = true;
    },

    renderDots: function () {
      var dots = $('progress-dots');
      if (!dots) return;
      clearNode(dots);
      var s = Engine.session;
      if (!s) return;
      var results = s.results || [];
      var count = Math.max(s.askedList.length, results.length + 1);
      if (s.mode === 'revision') count = REVISION_MAX_Q;
      for (var i = 0; i < count; i++) {
        var cls = 'dot';
        if (i < results.length) cls += ' done ' + (results[i] ? 'right' : 'wrong');
        else if (i === results.length && i < s.askedList.length) cls += ' current';
        dots.appendChild(el('span', cls));
      }
    },

    reflectAnswer: function (result) {
      var s = Engine.session;
      if (!s || !s.current) return;
      var q = s.current;
      var options = $('options');
      if (options) {
        options.classList.add('locked'); // container-level lock, per styles.css §11
        Array.prototype.slice.call(options.children).forEach(function (node, idx) {
          node.style.outline = '';
          if (idx === q.correct) node.classList.add('flash-correct');
          if (idx === s.chosen && idx !== q.correct) node.classList.add('flash-wrong');
        });
      }
      var card = $('quiz-card');
      if (card) {
        var old = card.querySelector('.quiz-feedback');
        if (old && old.parentNode) old.parentNode.removeChild(old);
        var fb = el('p', 'section-note quiz-feedback');
        if (result.right) {
          fb.textContent = result.delta === 0
            ? 'Correct — but you used the hint, so no gain (+0) this time.'
            : 'Correct! +1 mastery.';
        } else {
          fb.textContent = 'Not quite. −1 mastery — we will drill this until it sticks.';
        }
        var actions = card.querySelector('.quiz-actions');
        if (actions) card.insertBefore(fb, actions); else card.appendChild(fb);
      }
      var nextBtn = card && card.querySelector('.quiz-next');
      if (nextBtn) {
        nextBtn.hidden = false;
        if (s.mode === 'revision' && (s.count >= REVISION_MAX_Q || !Engine.pickNextQuestion())) {
          nextBtn.textContent = 'Open your revision sheet';
        } else if (!Engine.pickNextQuestion()) {
          nextBtn.textContent = 'See your results';
        } else {
          nextBtn.textContent = 'Next question';
        }
      }
      this.renderDots();
      Board.render();
    }
  };

  function submitAnswer(idx) {
    var s = Engine.session;
    if (!s || s.phase !== 'question' || s.answered) return;
    var result = Engine.answer(idx);
    if (result) {
      if (!s.results) s.results = [];
      s.results.push(result.right);
      Quiz.reflectAnswer(result);
      if (!result.right) {
        // Wrong answer: open the Why panel automatically (steps are the point).
        showWhy(true);
      }
    }
  }

  function continueFlow() {
    var s = Engine.session;
    if (!s) { UI.show('view-dashboard'); renderDashboard(); return; }
    if (s.phase === 'question' && !s.answered) return; // nothing to continue from yet
    if (s.mode === 'revision' && s.count >= REVISION_MAX_Q) { s.phase = 'revision-done'; }
    if (s.phase === 'revision-done') {
      endSessionBookkeeping();
      UI.show('view-sheet');
      Sheet.render();
      return;
    }
    var q = Engine.next();
    if (q) {
      Quiz.render(q);
      Board.render();
      return;
    }
    if (s.phase === 'revision-done') {
      UI.show('view-sheet');
      Sheet.render();
      return;
    }
    endSessionBookkeeping();
    finishSession();
  }

  function finishSession() {
    var s = Engine.session;
    if (!s) return;
    var gaps = s.phase === 'gaps';
    UI.show('view-mastered');
    renderOutcome(gaps);
  }

  function endSessionBookkeeping() {
    // Session reached an end state — the day-streak ticks up once per day.
    var today = new Date().toISOString().slice(0, 10);
    var info = streakInfo();
    var count = info.day === today ? info.count : info.count + 1;
    lsSet(LS.streak, JSON.stringify({ count: count, day: today }));
  }

  /* ------------------------------------------------------------------ *
   * Outcome view — populates the static #mastered-heading / #mastered-sub /
   * #mastered-stats shells (used for BOTH mastered and the honest
   * complete-with-gaps variant). Buttons (#btn-open-pdf, #btn-retake) are
   * the markup's own and are wired once in wire().
   * ------------------------------------------------------------------ */
  function statCard(labelText, valueText) {
    var c = el('div', 'stat');
    c.appendChild(el('p', 'label', labelText));
    c.appendChild(el('p', 'value', valueText));
    return c;
  }

  function renderOutcome(isGaps) {
    var topicId = (Engine.session && Engine.session.topicId) || getLastTopic() || 'trigonometry';
    var st = Engine.state();
    var weak = conceptsOfTopic(topicId).filter(function (c) { return scoreOf(c.id) < MASTER_SCORE; });

    var h = $('mastered-heading');
    if (h) h.textContent = isGaps ? 'Session complete — some gaps remain' : 'Mastered — every bar is at 7+';

    var sub = $('mastered-sub');
    if (sub) {
      sub.textContent = isGaps
        ? 'Honest result: the question bank ran dry while these concepts were still below the mastery line — ' +
          weak.map(function (c) { return c.name + ' (' + scoreOf(c.id) + '/10)'; }).join(', ') +
          '. Re-drill them from a recent mistake on the dashboard, or retake the session.'
        : 'Every question, one step up — and you took them. All five concepts are at or above the mastery line.';
    }

    var stats = $('mastered-stats');
    if (stats) {
      clearNode(stats);
      var weakest = st.stats.weakestConceptId ? conceptById(st.stats.weakestConceptId) : null;
      stats.appendChild(statCard('Accuracy', Math.round((st.stats.accuracy || 0) * 100) + '%'));
      stats.appendChild(statCard('Questions answered', String(st.stats.answered)));
      stats.appendChild(statCard('Weakest concept', weakest ? weakest.name : '—'));
    }

    // Gaps variant: reuse the board markup pattern for the bars still below 7.
    var prev = document.querySelector('.outcome-gaps');
    if (prev && prev.parentNode) prev.parentNode.removeChild(prev);
    if (isGaps && weak.length && stats && stats.parentNode) {
      var wrap = el('div', 'card outcome-gaps');
      wrap.appendChild(el('h2', 'section-title', 'Still below the mastery line'));
      var rows = el('div', 'board-rows');
      weak.forEach(function (c) { rows.appendChild(boardRow(c, scoreOf(c.id))); });
      wrap.appendChild(rows);
      stats.parentNode.insertBefore(wrap, stats.nextSibling);
    }
  }

  /* ------------------------------------------------------------------ *
   * Dashboard — populates the static shells: #greeting, #streak,
   * #topic-cards, #continue-slot, #recent-mistakes. The demo banner, the
   * mode buttons and their data-toast/data-goto hooks already live in the
   * markup; nothing is injected beside them.
   * ------------------------------------------------------------------ */
  function agoText(ts) {
    var m = Math.max(1, Math.round((Date.now() - ts) / 60000));
    if (m < 60) return m + 'm ago';
    var hrs = Math.round(m / 60);
    if (hrs < 24) return hrs + 'h ago';
    return Math.round(hrs / 24) + 'd ago';
  }

  function dashTopicCard(t) {
    var card = el('div', 'card topic-card');
    card.appendChild(el('h3', 'topic-name', t.name));
    card.appendChild(el('p', 'topic-blurb', t.blurb || ''));
    conceptsOfTopic(t.id).forEach(function (c) {
      var sc = scoreOf(c.id);
      var mini = el('div', 'mini-bar');
      mini.setAttribute('title', c.name + ' — ' + sc + '/10');
      var fillSpan = el('span', sc >= MASTER_SCORE ? 'mastered' : null);
      fillSpan.style.width = (sc * 10) + '%'; // fill width = score × 10%
      mini.appendChild(fillSpan);
      card.appendChild(mini);
    });
    var meta = el('div', 'topic-meta');
    meta.appendChild(el('span', 'chip chip-live', 'live'));
    meta.appendChild(el('span', 'topic-tier', 'Tier ' + t.tier));
    card.appendChild(meta);
    var btn = el('button', 'btn btn-accent', 'Start adaptive drill');
    btn.type = 'button';
    btn.addEventListener('click', function () { UI.startQuiz(t.id, {}); });
    card.appendChild(btn);
    return card;
  }

  function renderDashboard() {
    var hour = new Date().getHours();
    var greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    var g = $('greeting');
    if (g) g.textContent = greet + '. Let’s close a gap.';
    var st = $('streak');
    if (st) st.textContent = getStreak() + '-day streak';

    var cards = $('topic-cards');
    if (cards) {
      clearNode(cards);
      var topics = D().topics;
      var liveList = topics.filter(function (t) { return t.status === 'live'; });
      liveList.forEach(function (t) { cards.appendChild(dashTopicCard(t)); });
      var soonCount = topics.length - liveList.length;
      if (soonCount > 0) {
        var teaser = el('div', 'card topic-card');
        teaser.appendChild(el('h3', 'topic-name', soonCount + ' more topics on the map'));
        teaser.appendChild(el('p', 'topic-blurb', 'Algebra, calculus, vectors, geometry — curated packs landing next.'));
        teaser.appendChild(el('span', 'chip chip-soon', 'coming soon'));
        var browse = el('button', 'btn btn-ghost', 'Browse the topic map');
        browse.type = 'button';
        browse.addEventListener('click', function () { renderPicker(); UI.show('view-picker'); });
        teaser.appendChild(browse);
        cards.appendChild(teaser);
      }
    }

    var slot = $('continue-slot');
    if (slot) {
      clearNode(slot);
      var t = topicById(getLastTopic());
      if (t && t.status === 'live') {
        var cont = el('div', 'card topic-card');
        cont.appendChild(el('h3', 'topic-name', 'Continue ' + t.name));
        cont.appendChild(el('p', 'topic-blurb', 'Pick the adaptive drill up right where you left off.'));
        var go = el('button', 'btn btn-accent', 'Continue');
        go.type = 'button';
        go.addEventListener('click', function () { UI.startQuiz(t.id, {}); });
        cont.appendChild(go);
        slot.appendChild(cont);
      } else {
        slot.appendChild(el('p', 'section-note', 'No session in progress yet — start Trigonometry and Vertex takes it from there.'));
      }
    }

    var listHost = $('recent-mistakes');
    if (listHost) {
      clearNode(listHost);
      var list = getMistakes().slice(-5).reverse();
      if (!list.length) {
        listHost.appendChild(el('li', 'section-note', 'No mistakes logged yet — the honest kind are the most useful.'));
      } else {
        list.forEach(function (m) {
          var q = questionById(m.questionId);
          var li = el('li');
          li.setAttribute('role', 'button');
          li.tabIndex = 0;
          li.appendChild(el('span', 'mistake-q', q ? q.question : m.questionId));
          var meta = q
            ? 'You: ' + optionText(q, m.chosen) + ' · Correct: ' + optionText(q, q.correct) + ' · ' + agoText(m.ts)
            : agoText(m.ts);
          li.appendChild(el('span', 'mistake-meta', meta));
          if (q) {
            // Tap a mistake to re-drill exactly that concept.
            li.addEventListener('click', function () { UI.startSessionWithFocus(q.conceptId); });
            li.addEventListener('keydown', function (e) {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); UI.startSessionWithFocus(q.conceptId); }
            });
          }
          listHost.appendChild(li);
        });
      }
    }
  }

  function optionText(q, idx) {
    return q.options && q.options[idx] !== undefined ? String(q.options[idx]) : '?';
  }

  /* ------------------------------------------------------------------ *
   * Topic picker — fills #topic-grid from VERTEX_DATA.topics: .live tile
   * clickable (starts the quiz), .soon tiles dimmed, never start a quiz.
   * ------------------------------------------------------------------ */
  function renderPicker() {
    var grid = $('topic-grid');
    if (!grid) return;
    clearNode(grid);
    D().topics.forEach(function (t) {
      var isLive = t.status === 'live';
      var tile = el('button', 'topic-card ' + (isLive ? 'live' : 'soon'));
      tile.type = 'button';
      tile.appendChild(el('span', 'topic-name', t.name));
      tile.appendChild(el('span', 'topic-tier', 'Tier ' + t.tier));
      tile.appendChild(el('span', 'topic-blurb', t.blurb || ''));
      if (isLive) {
        tile.appendChild(el('span', 'chip chip-live', 'live'));
        tile.addEventListener('click', function () { UI.startQuiz(t.id, {}); });
      } else {
        tile.appendChild(el('span', 'chip chip-soon', 'coming soon'));
        tile.setAttribute('aria-disabled', 'true');
        tile.addEventListener('click', function () { UI.toast(t.name + ' — coming soon.'); });
      }
      grid.appendChild(tile);
    });
  }

  /* ------------------------------------------------------------------ *
   * Hint + Why — fill the existing #hint-panel / #why-panel shells.
   * Hint marks the question hinted: a later correct answer gains +0.
   * ------------------------------------------------------------------ */
  function showHint() {
    var s = Engine.session;
    if (!s || !s.current || s.answered) return;
    var text = Engine.showHint(); // marks hinted: correct-after-hint = no gain (+0)
    var panel = $('hint-panel');
    if (!panel) return;
    clearNode(panel);
    panel.appendChild(el('strong', null, 'Hint'));
    panel.appendChild(el('p', null, text || 'Break the problem into one formula at a time.'));
    panel.appendChild(el('p', 'section-note', 'Cost: a correct answer after a hint gains nothing (+0).'));
    panel.hidden = false;
  }

  function showWhy(forceOpen) {
    var s = Engine.session;
    if (!s || !s.current) return;
    var q = s.current;
    var panel = $('why-panel');
    if (!panel) return;
    var steps = $('why-steps');
    if (steps) {
      clearNode(steps);
      (q.steps || []).forEach(function (step) { steps.appendChild(el('li', null, step)); });
    }
    var oldM = panel.querySelector('.why-mistake');
    if (oldM) panel.removeChild(oldM);
    if (q.commonMistake) {
      var mp = el('p', 'section-note why-mistake', 'Common mistake: ' + q.commonMistake);
      var anchor = $('btn-eli5');
      if (anchor && anchor.parentNode === panel) panel.insertBefore(mp, anchor);
      else panel.appendChild(mp);
    }
    var eli5 = $('eli5-panel');
    if (eli5) eli5.textContent = q.eli5 || '';
    // W toggles; a wrong answer force-opens it.
    panel.hidden = forceOpen ? false : !panel.hidden;
  }

  /* ------------------------------------------------------------------ *
   * Revision sheet — fills the existing #sheet-content shell using the
   * sheet selectors in styles.css (.sheet h2/h3/ul/li/.formula/.worked-example).
   * ------------------------------------------------------------------ */
  var Sheet = {
    render: function () {
      var host = $('sheet-content');
      if (!host) return;
      clearNode(host);
      var topicId = (Engine.session && Engine.session.topicId) || getLastTopic() || 'trigonometry';
      var topic = topicById(topicId);
      var sheet = D().sheet[topicId];
      host.appendChild(el('h2', null, (topic ? topic.name : 'Revision') + ' — everything worth re-reading'));
      if (!sheet) {
        host.appendChild(el('p', null, 'The sheet for this topic is still being written by the content team.'));
        return;
      }
      host.appendChild(el('h3', null, 'Formulas'));
      var ul = el('ul');
      (sheet.formulas || []).forEach(function (f) {
        var li = el('li');
        li.appendChild(el('span', 'formula', f));
        ul.appendChild(li);
      });
      host.appendChild(ul);
      host.appendChild(el('h3', null, 'Rules'));
      ul = el('ul');
      (sheet.rules || []).forEach(function (r) { ul.appendChild(el('li', null, r)); });
      host.appendChild(ul);
      host.appendChild(el('h3', null, 'Common mistakes'));
      ul = el('ul');
      (sheet.commonMistakes || []).forEach(function (m) { ul.appendChild(el('li', null, m)); });
      host.appendChild(ul);
      if (sheet.workedExample) {
        var we = el('div', 'worked-example');
        we.appendChild(el('h3', null, 'Worked example'));
        we.appendChild(el('p', null, sheet.workedExample.question));
        var ol = el('ol');
        (sheet.workedExample.solution || []).forEach(function (step) { ol.appendChild(el('li', null, step)); });
        we.appendChild(ol);
        host.appendChild(we);
      }
    }
  };

  /* ------------------------------------------------------------------ *
   * PDF export — fills the two existing print sections in #print-area
   * (mistakes with solutions + the sheet), then calls window.print().
   * The print stylesheet in styles.css takes care of black-on-white.
   * ------------------------------------------------------------------ */
  function printList(list, ordered) {
    var host = ordered ? el('ol') : el('ul');
    (list || []).forEach(function (item) {
      var li = el('li', null, String(item));
      // #print-area li have no UA markers (the app CSS resets list-style and
      // the print sheet does not restore it) — restore them inline.
      li.style.display = 'list-item';
      li.style.listStyleType = ordered ? 'decimal' : 'disc';
      host.appendChild(li);
    });
    host.style.paddingLeft = '20px';
    return host;
  }

  var PDF = {
    open: function () {
      var topicId = (Engine.session && Engine.session.topicId) || getLastTopic() || 'trigonometry';
      var topic = topicById(topicId);
      this.fill(topicId, topic);
      window.print();
    },

    fill: function (topicId, topic) {
      var name = topic ? topic.name : topicId;

      var mSec = $('print-mistakes');
      if (mSec) {
        clearNode(mSec);
        mSec.appendChild(el('h2', null, 'Your mistakes, with solutions — ' + name));
        var mistakes = getMistakes();
        if (!mistakes.length) {
          mSec.appendChild(el('p', null, 'No mistakes logged — nothing to patch here.'));
        } else {
          mistakes.slice(-10).reverse().forEach(function (m) {
            var q = questionById(m.questionId);
            var block = el('div', 'print-mistake');
            block.appendChild(el('h3', null, q ? q.question : m.questionId));
            if (q) {
              block.appendChild(el('p', null, 'Your answer: ' + optionText(q, m.chosen)));
              block.appendChild(el('p', null, 'Correct answer: ' + optionText(q, q.correct)));
              block.appendChild(el('p', null, 'Solution, step by step:'));
              block.appendChild(printList(q.steps, true));
            }
            mSec.appendChild(block);
          });
        }
      }

      var sSec = $('print-sheet');
      var sheet = D().sheet[topicId];
      if (sSec) {
        clearNode(sSec);
        sSec.appendChild(el('h2', null, 'Revision sheet — ' + name));
        if (sheet) {
          sSec.appendChild(el('h3', null, 'Formulas'));
          sSec.appendChild(printList(sheet.formulas, false));
          sSec.appendChild(el('h3', null, 'Rules'));
          sSec.appendChild(printList(sheet.rules, false));
          sSec.appendChild(el('h3', null, 'Common mistakes'));
          sSec.appendChild(printList(sheet.commonMistakes, false));
          if (sheet.workedExample) {
            sSec.appendChild(el('h3', null, 'Worked example: ' + sheet.workedExample.question));
            sSec.appendChild(printList(sheet.workedExample.solution, true));
          }
        } else {
          sSec.appendChild(el('p', null, 'The sheet for this topic is still being written.'));
        }
      }
    }
  };

  /* ------------------------------------------------------------------ *
   * Chat. chat.js owns VertexChat: it self-wires #btn-chat-send (document
   * delegation) + Enter in #chat-input, appends the user message AND the
   * reply into #chat-log, and toggles #chip-offline. When chat.js is
   * present the engine therefore wires NOTHING for chat — one click must
   * produce exactly one user message and one reply (no double rendering).
   * Only if VertexChat is entirely absent does the engine drive the same
   * existing shells itself, with the msg-row/.msg markup styles.css knows.
   * ------------------------------------------------------------------ */
  function chatOwnedExternally() {
    return !!(window.VertexChat && typeof window.VertexChat.send === 'function');
  }

  function msgRow(role, text, pending) {
    var row = el('div', 'msg-row ' + role);
    row.appendChild(el('div', 'msg-sender', role === 'user' ? 'You' : 'Tutor'));
    row.appendChild(el('div', 'msg' + (pending ? ' pending' : ''), text));
    return row;
  }

  function sendChatFallback() {
    var input = $('chat-input');
    var log = $('chat-log');
    if (!input || !log) return;
    var text = String(input.value || '').trim();
    if (!text) return;
    input.value = '';
    log.appendChild(msgRow('user', text)); // user input is NEVER interpolated as HTML
    var pending = msgRow('tutor', 'Thinking…', true);
    log.appendChild(pending);
    try { log.scrollTop = log.scrollHeight; } catch (e) { /* non-scrolling log */ }
    var reply = 'Tutor offline — connect a BharatCode API key in Settings for live answers.';
    if (window.VertexChat && typeof window.VertexChat.offlineReply === 'function') {
      try { reply = String(window.VertexChat.offlineReply(text) || reply); } catch (e) { /* keep canned */ }
    }
    var bubble = pending.querySelector('.msg');
    if (bubble) { bubble.textContent = reply; bubble.classList.remove('pending'); }
    var chip = $('chip-offline');
    if (chip) chip.hidden = false;
  }

  /* ------------------------------------------------------------------ *
   * Settings (API key + reset demo data) — uses the existing controls
   * only. The key lives in localStorage vertex_api_key; it is never
   * logged and never echoed into the DOM (the field is not prefilled).
   * ------------------------------------------------------------------ */
  function saveApiKeyField() {
    var input = $('settings-key');
    if (!input) return;
    var v = String(input.value || '').trim();
    if (v) lsSet(LS.apiKey, v); else lsDel(LS.apiKey);
    input.value = ''; // never leave the key sitting in the DOM
    UI.toast('API key stored only in your browser.');
  }

  function closeSettings() {
    var m = view('modal-settings');
    if (m) m.hidden = true;
    var key = $('settings-key');
    if (key) key.value = '';
  }

  /* ------------------------------------------------------------------ *
   * Keyboard (document-level; ignored while typing in a field)
   * 1–4 select an option · Enter submits / advances · H hint · W why
   * ------------------------------------------------------------------ */
  function isTyping(e) {
    var t = e.target;
    if (!t || !t.tagName) return false;
    var tag = t.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable;
  }
  function selectOption(idx) {
    var opts = $('options');
    if (!opts || !opts.children[idx]) return;
    Quiz.selectedIndex = idx;
    Array.prototype.slice.call(opts.children).forEach(function (node, i) {
      node.style.outline = i === idx ? '2px solid var(--accent)' : '';
    });
  }
  function onKeydown(e) {
    var modal = view('modal-settings');
    var modalOpen = !!(modal && !modal.hidden);
    if (e.key === 'Escape') {
      if (modalOpen) closeSettings();
      return;
    }
    if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey || modalOpen) return;
    var quizView = view('view-quiz');
    if (!quizView || quizView.hidden || !Engine.session) return;
    var s = Engine.session;
    if (e.key >= '1' && e.key <= '4' && !s.answered) {
      selectOption(Number(e.key) - 1);
      e.preventDefault();
    } else if (e.key === 'Enter') {
      if (s.phase === 'question' && !s.answered && Quiz.selectedIndex >= 0) {
        submitAnswer(Quiz.selectedIndex);
      } else if (s.phase === 'answered' || s.phase === 'revision-done') {
        continueFlow();
      }
      e.preventDefault();
    } else if (e.key === 'h' || e.key === 'H') {
      showHint();
      e.preventDefault();
    } else if (e.key === 'w' || e.key === 'W') {
      showWhy(false);
      e.preventDefault();
    }
  }

  /* ------------------------------------------------------------------ *
   * Navigation helper for the generic data-goto delegation
   * ------------------------------------------------------------------ */
  function gotoView(id) {
    if (!id) return;
    if (id === 'view-dashboard') { Engine.session = null; renderDashboard(); }
    else if (id === 'view-picker') renderPicker();
    else if (id === 'view-sheet') Sheet.render();
    UI.show(id);
  }

  /* ------------------------------------------------------------------ *
   * One-time wiring — every control is the one index.html already ships;
   * nothing is injected as a replacement.
   * ------------------------------------------------------------------ */
  function wire() {
    var b;

    b = $('btn-demo-seed');
    if (b) b.addEventListener('click', function () {
      seedDemoState();
      Engine.session = null;
      renderDashboard();
      UI.show('view-dashboard');
      Board.render();
      UI.toast('Demo state loaded — open Trigonometry and take the 7-tap arc.');
    });

    b = $('btn-start-quiz');
    if (b) b.addEventListener('click', function () {
      var t = liveTopics()[0];
      if (t) UI.startQuiz(t.id, {});
    });

    b = $('btn-mode-revision');
    if (b) b.addEventListener('click', function () {
      var t = liveTopics()[0];
      if (t) UI.startQuiz(t.id, { mode: 'revision' });
    });

    b = $('btn-hint');
    if (b) b.addEventListener('click', function () { showHint(); });
    b = $('btn-why');
    if (b) b.addEventListener('click', function () { showWhy(false); });

    var eli5Btn = $('btn-eli5');
    if (eli5Btn) eli5Btn.addEventListener('click', function () {
      // Re-look-up the button itself: this handler must not depend on the
      // shared wire() scratch var (it would point at the last control wired).
      var btn = $('btn-eli5');
      var p = $('eli5-panel');
      if (!btn || !p) return;
      p.hidden = !p.hidden;
      btn.setAttribute('aria-expanded', p.hidden ? 'false' : 'true');
    });

    b = $('btn-retake');
    if (b) b.addEventListener('click', function () {
      var topicId = (Engine.session && Engine.session.topicId) || getLastTopic() || 'trigonometry';
      UI.startQuiz(topicId, {});
    });

    b = $('btn-export-pdf');
    if (b) b.addEventListener('click', function () { PDF.open(); });

    // Settings modal — existing controls only.
    b = $('btn-save-key');
    if (b) b.addEventListener('click', saveApiKeyField);
    b = $('btn-reset-demo');
    if (b) b.addEventListener('click', function () {
      resetDemoData();
      Engine.session = null;
      renderDashboard();
      UI.show('view-dashboard');
      Board.render();
      UI.toast('Demo data reset.');
    });
    b = $('btn-close-settings');
    if (b) b.addEventListener('click', closeSettings);
    var keyInput = $('settings-key');
    if (keyInput) {
      keyInput.type = 'password';
      keyInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); saveApiKeyField(); }
      });
    }
    var modal = view('modal-settings');
    if (modal) modal.addEventListener('click', function (e) {
      // Click on the backdrop itself (outside .modal-card) closes.
      if (e.target === modal) closeSettings();
    });

    // Next-question control, inside #quiz-card, .btn .btn-accent — created
    // once, then shown/hidden by Quiz.render / reflectAnswer.
    var card = $('quiz-card');
    if (card && !card.querySelector('.quiz-next')) {
      var nextBtn = el('button', 'btn btn-accent quiz-next', 'Next question');
      nextBtn.type = 'button';
      nextBtn.hidden = true;
      nextBtn.addEventListener('click', function () { continueFlow(); });
      card.appendChild(nextBtn);
    }

    // Generic navigation: data-goto="view-...", data-open="modal-settings",
    // data-toast="..." (roadmap buttons). Delegation, addEventListener only.
    document.addEventListener('click', function (e) {
      var node = e.target;
      if (!node || typeof node.closest !== 'function') return;
      var open = node.closest('[data-open]');
      if (open && open.getAttribute('data-open') === 'modal-settings') {
        UI.show('modal-settings');
        return;
      }
      var tst = node.closest('[data-toast]');
      if (tst) UI.toast(tst.getAttribute('data-toast'));
      var goto = node.closest('[data-goto]');
      if (goto) {
        if (tst) return; // toast-only buttons must not also navigate
        gotoView(goto.getAttribute('data-goto'));
      }
    });

    // Chat: chat.js owns the wire-up when VertexChat exists — wiring it here
    // too would fire send() twice for a single click. Only take over if the
    // global is missing entirely.
    if (!chatOwnedExternally()) {
      var send = $('btn-chat-send');
      if (send) send.addEventListener('click', sendChatFallback);
      var cin = $('chat-input');
      if (cin) cin.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); sendChatFallback(); }
      });
    }

    document.addEventListener('keydown', onKeydown);
  }

  /* ------------------------------------------------------------------ *
   * Boot
   * ------------------------------------------------------------------ */
  function boot() {
    wire();
    Engine.init();
    Board.render();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* ------------------------------------------------------------------ *
   * Frozen globals (§7) — chat's VertexChat comes from chat.js; not ours.
   * ------------------------------------------------------------------ */
  window.VertexEngine = Engine;
  window.VertexUI = UI;
  window.VertexBoard = Board;
  window.VertexQuiz = Quiz;
  window.VertexSheet = Sheet;
  window.VertexPDF = PDF;
})();
