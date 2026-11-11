/** coverage.js — evidence-backed syllabus coverage with verbatim excerpts. */
import { h, icon, button, coverageChip, badge, emptyState, announce } from '../ui.js';
import { getActiveNotebook } from '../state.js';
import { coverageCounts, topicById, ensureLesson } from '../shared.js';

function words(text) {
  return new Set(String(text || '').toLowerCase().match(/[a-z]{4,}/g) || []);
}

function matchReason(topic, chunk) {
  const query = words([topic.name, ...(topic.aliases || [])].join(' '));
  const found = words(chunk.text);
  const hits = [...query].filter((w) => found.has(w));
  if (!hits.length) return 'Matched by the coverage scorer; inspect the passage directly.';
  return `Matched topic terms: ${hits.slice(0, 6).join(', ')}.`;
}

export default function renderCoverage(root, ctx) {
  const nb = getActiveNotebook();
  if (!nb) { ctx.navigate('#/setup'); return () => {}; }
  const counts = coverageCounts(nb);
  const byId = topicById(nb);
  const chunkById = new Map((nb.notes?.chunks || []).map((c) => [c.id, c]));
  const topics = nb.topics;
  let selectedId = topics.find((t) => t.coverage?.chunkIds?.length)?.id || topics[0]?.id || null;

  const panel = h('div', { class: 'evidence-panel card', id: 'evidence-panel' });
  const rows = new Map();
  const inlineNodes = new Map();

  function evidenceContent(topic, compact = false) {
    const lesson = topic.lesson || ensureLesson(nb, topic);
    const chunks = (topic.coverage?.chunkIds || []).map((id) => chunkById.get(id)).filter(Boolean);
    const head = h('div', { class: 'evidence-head' },
      h('div', null,
        h('p', { class: 'kicker', text: 'Evidence trail' }),
        h('h2', { class: 'card-title', text: topic.name }),
        h('p', { class: 'small muted', text: `${topic.unit} · weight ${topic.weight}/5` })),
      coverageChip(topic.coverage?.status || 'not_found'));
    const body = h('div', { class: 'evidence-body' });
    if (chunks.length) {
      body.appendChild(h('div', { class: 'evidence-meta' },
        h('span', { class: 'badge badge-soft', text: `Chunk ${chunks.map((c) => c.id).join(', ')}` }),
        h('span', { class: 'small muted', text: `Lexical score ${Math.round((topic.coverage.score || 0) * 100)} / 100` })));
      for (const chunk of chunks.slice(0, compact ? 1 : 3)) {
        body.appendChild(h('div', { class: 'excerpt-block' },
          h('div', { class: 'excerpt-head' },
            h('span', { class: 'excerpt-id', text: chunk.id }),
            h('span', { class: 'small muted', text: 'verbatim from your notes' })),
          h('pre', { class: 'evidence-text', text: chunk.text }),
          h('p', { class: 'small muted', text: matchReason(topic, chunk) })));
      }
      if (compact && chunks.length > 1) {
        body.appendChild(h('p', { class: 'small muted', text: `${chunks.length - 1} more cited chunk${chunks.length > 2 ? 's' : ''} available in the desktop evidence panel.` }));
      }
    } else {
      body.appendChild(h('div', { class: 'no-evidence' },
        icon('search', 22),
        h('h3', { text: 'No matching passage in these notes.' }),
        h('p', { class: 'small muted', text: 'Vertex does not manufacture evidence. Treat this as a gap to study, not as an error in your notes.' }),
        h('p', { class: 'small muted', text: `Coverage scorer: ${topic.coverage?.status === 'thin' ? 'only mentioned' : 'no match found'}.` })));
    }
    body.appendChild(h('div', { class: 'evidence-actions' },
      button('Open lesson', { icon: 'book', size: 'sm', onClick: () => ctx.navigate(`#/lesson/${topic.id}`) }),
      !chunks.length
        ? button('Plan a gap session', { variant: 'ghost', size: 'sm', icon: 'calendar', onClick: () => {
          try { sessionStorage.setItem('vx3.openNewSession', topic.id); } catch { /* blocked */ }
          ctx.navigate('#/calendar');
        } })
        : button('Practice this topic', { variant: 'ghost', size: 'sm', icon: 'target', onClick: () => ctx.navigate('#/practice') })));
    return h('div', { class: 'evidence-inner' }, head, body,
      h('p', { class: 'evidence-note small muted' },
        h('strong', { text: 'What this verdict means. ' }),
        topic.coverage?.status === 'covered'
          ? 'The notes contain a meaningful explanation, not just the topic name.'
          : topic.coverage?.status === 'thin'
            ? 'The topic appears, but the explanation is shallow or incomplete.'
            : 'No meaningful matching passage was found. This is a gap, not a claim that you never saw the topic.'));
  }

  function refreshEvidence() {
    const topic = byId.get(selectedId);
    panel.replaceChildren(topic ? evidenceContent(topic) : emptyState({ iconName: 'search', title: 'Select a topic', text: 'The verbatim excerpt opens here.' }));
    for (const [id, node] of inlineNodes) {
      const open = id === selectedId;
      node.replaceChildren();
      node.hidden = !open;
      if (open && topic) node.appendChild(evidenceContent(topic, true));
      node.closest('.topic-row')?.classList.toggle('selected', open);
      node.closest('.topic-row')?.classList.toggle('open', open);
    }
    for (const [id, row] of rows) {
      const selected = id === selectedId;
      row.classList.toggle('selected', selected);
      row.querySelector('.row-select')?.setAttribute('aria-expanded', selected ? 'true' : 'false');
    }
    announce(`Evidence for ${topic?.name || 'selected topic'} opened.`);
  }

  const list = h('div', { class: 'coverage-list' });
  topics.forEach((topic, index) => {
    const row = h('div', { class: 'topic-row', 'data-topic': topic.id });
    const main = h('button', { type: 'button', class: 'row-select', 'aria-expanded': 'false', 'aria-controls': `inline-${topic.id}` },
      h('span', { class: 'topic-index', text: String(index + 1).padStart(2, '0') }),
      h('span', { class: 'topic-main' },
        h('span', { class: 'topic-name', text: topic.name }),
        h('span', { class: 'topic-sub' }, h('span', { text: topic.unit }), h('span', { class: 'dot-sep', text: '·' }), h('span', { text: `Weight ${topic.weight}/5` }))),
      h('span', { class: 'topic-verdict' }, coverageChip(topic.coverage?.status || 'not_found')));
    main.addEventListener('click', () => { selectedId = topic.id; refreshEvidence(); });
    const actions = h('div', { class: 'topic-actions' },
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => { selectedId = topic.id; refreshEvidence(); panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } },
        icon('eye', 14), h('span', { text: topic.coverage?.chunkIds?.length ? 'View excerpt' : 'View status' })),
      h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => ctx.navigate(`#/lesson/${topic.id}`) },
        icon('arrow', 14), h('span', { text: 'Open lesson' })));
    const inline = h('div', { class: 'inline-excerpt', id: `inline-${topic.id}`, hidden: true });
    inlineNodes.set(topic.id, inline);
    rows.set(topic.id, row);
    row.append(main, actions, inline);
    list.appendChild(row);
  });

  const gapCount = counts.missing;

  root.appendChild(h('div', { class: 'page coverage-page' },
    h('div', { class: 'page-head' },
      h('div', null,
        h('p', { class: 'kicker', text: nb.kind === 'demo' ? 'Curated demo · coverage' : 'Coverage intelligence' }),
        h('h1', { class: 'page-title', text: 'What your notes actually cover.' }),
        h('p', { class: 'page-sub', text: 'Every topic gets exactly one verdict. Matched topics reveal the verbatim passage, its chunk id and the terms that matched. Unmatched topics stay visibly unmatched.' })),
      h('div', { class: 'page-head-actions' },
        button('Update notes', { variant: 'ghost', icon: 'book', onClick: () => ctx.navigate('#/setup') }),
        button('Study the gaps', { icon: 'target', onClick: () => ctx.navigate('#/practice') }))),
    h('div', { class: 'coverage-summary card' },
      h('div', { class: 'coverage-summary-stat' }, h('strong', { text: String(counts.total) }), h('span', { text: 'syllabus topics' })),
      h('div', { class: 'coverage-summary-stat' }, coverageChip('covered', { small: true }), h('strong', { text: String(counts.covered) }), h('span', { text: 'explained' })),
      h('div', { class: 'coverage-summary-stat' }, coverageChip('thin', { small: true }), h('strong', { text: String(counts.thin) }), h('span', { text: 'only mentioned' })),
      h('div', { class: 'coverage-summary-stat' }, coverageChip('not_found', { small: true }), h('strong', { text: String(counts.missing) }), h('span', { text: 'no match' })),
      h('div', { class: 'coverage-summary-note' }, h('span', { class: 'small muted', text: gapCount ? `${gapCount} gap${gapCount === 1 ? '' : 's'} to close before the exam.` : 'Every topic has some note evidence.' }))),
    h('div', { class: 'coverage-layout' },
      h('section', { class: 'coverage-list-card card', 'aria-label': 'Coverage by topic' },
        h('div', { class: 'card-head' },
          h('div', null, h('p', { class: 'kicker', text: 'Notebook order' }), h('h2', { class: 'card-title', text: 'Topics and verdicts' })),
          badge(`${counts.total} topics`, 'soft')),
        topics.length ? list : emptyState({ iconName: 'book', title: 'No topics yet', text: 'Build a workspace from your notes to see coverage.', action: button('Open setup', { size: 'sm', onClick: () => ctx.navigate('#/setup') }) }),
        h('p', { class: 'small muted coverage-foot', text: 'Coverage is lexical (BM25-lite plus aliases) and can miss heavy paraphrase — that is exactly why every matched row exposes its excerpt.' })),
      panel)));

  if (selectedId) refreshEvidence();
  else panel.appendChild(emptyState({ iconName: 'search', title: 'No topics yet', text: 'Build a workspace first.' }));

  ctx.refreshShell?.();
  return () => {};
}
