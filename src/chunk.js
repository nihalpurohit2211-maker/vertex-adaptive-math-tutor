/**
 * vertex-chunk — deterministic note chunking + BM25-lite coverage scoring (plan §6.4).
 * Pure module: no DOM, no browser APIs, only ./contracts.js for shared constants.
 */

import { COVERAGE_STATUSES } from "./contracts.js";

// ---- Tunable chunking constants (plan §6.4 step 1) ------------------------
export const CHUNK_MIN_CHARS = 600; // target lower bound for a chunk
export const CHUNK_MAX_CHARS = 1200; // hard upper bound for a chunk

// ---- Tunable retrieval constants (plan §6.4 steps 2-4) --------------------
export const COVERAGE_TOP_K = 3; // chunkIds kept per topic
export const BM25_K1 = 1.2; // term-frequency saturation
export const BM25_B = 0.75; // length normalization
export const MIN_TOKEN_LEN = 2; // tuned to 2: demo notes use 2-letter abbrevs ("gd", "cg") as real content words
export const COVERED_TERM_SHARE_MIN = 0.6; // (a) share of query terms in top chunk (tuned on real demo notes)
export const COVERED_CHUNKS_MIN = 2; // (b) chunks clearing the score floor
export const THIN_TERM_SHARE_MIN = 0.6; // share that alone justifies "thin"
export const CHUNK_SCORE_FLOOR = 0.09; // (b) a chunk clears when normalized BM25 ≥ this...
export const CHUNK_SHARE_FLOOR = 0.3; // ...AND at least this share of query terms appears in it

// ---- Light English stopword list -------------------------------------------
export const STOPWORDS = new Set([
  "a", "about", "above", "after", "again", "all", "also", "am", "an", "and", "any", "are",
  "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but",
  "by", "can", "cannot", "could", "did", "do", "does", "doing", "down", "during", "each",
  "few", "for", "from", "further", "had", "has", "have", "having", "he", "her", "here", "hers",
  "herself", "him", "himself", "his", "how", "i", "if", "in", "into", "is", "it", "its",
  "itself", "just", "let", "like", "may", "me", "might", "more", "most", "must", "my",
  "myself", "no", "nor", "not", "now", "of", "off", "on", "once", "only", "or", "other",
  "our", "ours", "out", "over", "own", "same", "she", "should", "so", "some", "such", "than",
  "that", "the", "their", "them", "themselves", "then", "there", "these", "they", "this",
  "those", "through", "to", "too", "under", "until", "up", "upon", "use", "used", "using",
  "was", "we", "were", "what", "when", "where", "which", "while", "who", "whom", "why",
  "will", "with", "would", "you", "your", "yours", "yourself",
]);

// ---- Text utilities ---------------------------------------------------------

/** Collapse CRLF, backslashes-in-microcode aside, trim trailing space per line. */
function normalizeNewlines(text) {
  return String(text ?? "").replace(/\r\n?/g, "\n");
}

/** Very light stemmer: singularise, then strip -ing / -ed. Deterministic. */
export function stem(word) {
  let w = word;
  if (w.length > 4 && w.endsWith("ies")) w = w.slice(0, -3) + "y";
  else if (w.length > 4 && w.endsWith("sses")) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith("es")) w = w.slice(0, -2);
  else if (w.length > 3 && !w.endsWith("ss") && w.endsWith("s")) w = w.slice(0, -1);
  if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
  if (w.length > 4 && w.endsWith("y")) w = w.slice(0, -1) + "i"; // derivativ-e style leftovers are fine
  return w;
}

/** Lowercase → alphabetic tokens ≥ MIN_TOKEN_LEN, stopwords dropped, light stemming. */
export function tokenize(text) {
  const words = normalizeNewlines(text).toLowerCase().match(/[a-z]+/g) || [];
  const out = [];
  for (const w of words) {
    if (w.length < MIN_TOKEN_LEN) continue;
    if (STOPWORDS.has(w)) continue;
    const s = stem(w);
    if (s.length < 2 || STOPWORDS.has(s)) continue;
    out.push(s);
  }
  return out;
}

/** Distinct stemmed content words of a text (used by citation overlap too). */
export function contentWords(text) {
  return new Set(tokenize(text));
}

// ---- Chunking ---------------------------------------------------------------

const SENTENCE_SPLIT = /(?<=[.!?])\s+/;

/** Split one oversized segment at sentence boundaries, hard-split as last resort. */
function splitOversized(segment) {
  if (segment.length <= CHUNK_MAX_CHARS) return [segment];
  const sentences = segment.split(SENTENCE_SPLIT).filter((s) => s.trim().length > 0);
  const parts = [];
  let buf = "";
  const flush = () => {
    if (buf.trim()) parts.push(buf.trim());
    buf = "";
  };
  for (let sentence of sentences) {
    while (sentence.length > CHUNK_MAX_CHARS) {
      // hard split on whitespace for monster "sentences" (formulas, run-ons)
      let cut = sentence.lastIndexOf(" ", CHUNK_MAX_CHARS);
      if (cut <= 0) cut = CHUNK_MAX_CHARS;
      parts.push(sentence.slice(0, cut).trim());
      sentence = sentence.slice(cut).trim();
    }
    if ((buf + " " + sentence).trim().length > CHUNK_MAX_CHARS) flush();
    buf = buf ? buf + " " + sentence : sentence;
  }
  flush();
  return parts;
}

/**
 * Split raw notes into stable-id chunks per plan §6.4: blank-line/heading split,
 * 600-1200 chars (tiny segments merged, oversized split), ids c1..cn. Deterministic.
 */
export function chunkNotes(raw) {
  const text = normalizeNewlines(raw);
  const lines = text.split("\n");
  const segments = [];
  let cur = [];
  const pushCur = () => {
    const seg = cur.join("\n").trim();
    if (seg) segments.push(seg);
    cur = [];
  };
  for (const line of lines) {
    if (!line.trim()) {
      pushCur();
    } else if (/^\s{0,3}#{1,6}\s/.test(line)) {
      pushCur(); // headings start a new segment (and stay glued to their body)
      cur.push(line);
    } else {
      cur.push(line);
    }
  }
  pushCur();

  const parts = [];
  for (const seg of segments) parts.push(...splitOversized(seg));

  // Greedy pack: merge tiny parts with following ones until ≥ CHUNK_MIN_CHARS.
  const packed = [];
  for (let i = 0; i < parts.length; i++) {
    let buf = parts[i];
    while (
      buf.length < CHUNK_MIN_CHARS &&
      i + 1 < parts.length &&
      buf.length + 2 + parts[i + 1].length <= CHUNK_MAX_CHARS
    ) {
      i += 1;
      buf = buf + "\n\n" + parts[i];
    }
    packed.push(buf);
  }
  // A tiny tail is folded back into the previous chunk when it still fits.
  if (
    packed.length > 1 &&
    packed[packed.length - 1].length < CHUNK_MIN_CHARS &&
    packed[packed.length - 2].length + 2 + packed[packed.length - 1].length <= CHUNK_MAX_CHARS
  ) {
    packed[packed.length - 2] = packed[packed.length - 2] + "\n\n" + packed[packed.length - 1];
    packed.pop();
  }

  return packed.map((t, idx) => ({ id: `c${idx + 1}`, text: t }));
}

// ---- BM25-lite coverage -----------------------------------------------------

/** Distinct stemmed query terms = topic name + aliases. */
export function queryTerms(topic) {
  const raw = [topic?.name ?? "", ...(topic?.aliases ?? [])].join(" ");
  return Array.from(new Set(tokenize(raw)));
}

function termFreqMap(tokens) {
  const map = new Map();
  for (const t of tokens) map.set(t, (map.get(t) || 0) + 1);
  return map;
}

/**
 * Score a topic's coverage over note chunks per plan §6.4 (BM25-lite, top-3 ids,
 * thresholds COVERED/THIN/CHUNK_SCORE_FLOOR tuned on the demo notes).
 */
export function scoreCoverage(topic, chunks) {
  const list = Array.isArray(chunks) ? chunks : [];
  const terms = queryTerms(topic);
  const empty = {
    status: COVERAGE_STATUSES[2],
    score: 0,
    chunkIds: [],
  };
  if (list.length === 0 || terms.length === 0) return empty;

  const docs = list.map((c) => termFreqMap(tokenize(c.text)));
  const docLen = docs.map((m) => {
    let n = 0;
    for (const v of m.values()) n += v;
    return n;
  });
  const avgLen = docLen.reduce((a, b) => a + b, 0) / docs.length || 1;

  const idf = new Map();
  for (const t of terms) {
    let df = 0;
    for (const m of docs) if (m.has(t)) df += 1;
    idf.set(t, Math.log(1 + (docs.length - df + 0.5) / (df + 0.5)));
  }
  const maxScore = terms.reduce((a, t) => a + idf.get(t) * (BM25_K1 + 1), 0) || 1;

  const perChunk = list.map((c, idx) => {
    let score = 0;
    for (const t of terms) {
      const tf = docs[idx].get(t) || 0;
      if (tf === 0) continue;
      const norm = BM25_K1 * (1 - BM25_B + (BM25_B * docLen[idx]) / avgLen);
      score += idf.get(t) * ((tf * (BM25_K1 + 1)) / (tf + norm));
    }
    const chunkShare = terms.filter((t) => docs[idx].has(t)).length / terms.length;
    return { id: c.id, score, norm: score / maxScore, chunkShare };
  });

  const ranked = perChunk
    .filter((r) => r.score > 0)
    .sort((a, b) => (b.score - a.score) || a.id.localeCompare(b.id, "en"));
  if (ranked.length === 0) return empty;

  const top = ranked[0];
  const termShare = top.chunkShare;
  // §6.4 (b): a chunk "clears the score floor" only with enough BM25 mass AND a
  // real share of the query terms in it (kills generic single-word near-hits).
  const chunksAboveFloor = ranked.filter(
    (r) => r.norm >= CHUNK_SCORE_FLOOR && r.chunkShare >= CHUNK_SHARE_FLOOR
  ).length;

  let status;
  if (termShare >= COVERED_TERM_SHARE_MIN && chunksAboveFloor >= COVERED_CHUNKS_MIN) {
    status = COVERAGE_STATUSES[0];
  } else if (termShare >= THIN_TERM_SHARE_MIN || chunksAboveFloor >= 1) {
    status = COVERAGE_STATUSES[1];
  } else {
    status = COVERAGE_STATUSES[2];
  }
  const chunkIds = ranked.slice(0, COVERAGE_TOP_K).map((r) => r.id);
  return { status, score: Math.min(1, Number(top.norm.toFixed(4))), chunkIds };
}
