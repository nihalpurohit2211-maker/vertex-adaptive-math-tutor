/**
 * vertex-trace — computed-example sandbox (plan §6.7).
 * Browser: runTrace() spawns the real-file module worker src/trace.worker.js.
 * Node (check.mjs/tests): runTraceNode() uses node:worker_threads + vm, with the
 * same static reject list, 2 s hard timeout and finiteness/rounding rules.
 * Neither entry ever rejects: failure resolves { computed: false, result: null }.
 */

import { DEFAULTS, TIMEOUTS } from "./contracts.js";

// Static reject list (plan §6.7 step 1). Literal arrays keep the scan itself
// free of these tokens; the scanner never runs in the browser page context.
const FORBIDDEN = [
  ["import", /\bimport\b/, "uses import"],
  ["importScripts", /\bimportScripts\b/, "uses importScripts"],
  ["fetch", /\bfetch\b/, "uses fetch"],
  ["XMLHttpRequest", /XMLHttpRequest/, "uses XMLHttpRequest"],
  ["WebSocket", /WebSocket/, "uses WebSocket"],
  ["eval", /\beval\b/, "uses eval"],
  ["Function", /\bFunction\b/, "uses the Function constructor"],
  ["globalThis", /globalThis/, "touches globalThis"],
  ["self.", /\bself\./, "touches self."],
  ["postMessage", /\bpostMessage\b/, "calls postMessage"],
];

/** Reason string when code trips the static scan, else null. */
export function staticRejectReason(code) {
  const src = typeof code === "string" ? code : "";
  for (const [, re, why] of FORBIDDEN) {
    if (re.test(src)) return "trace code " + why + " (sandbox contract §6.7 forbids it)";
  }
  return null;
}

function roundNumber(v) {
  const f = 10 ** DEFAULTS.traceDecimals;
  const r = Math.round(v * f) / f;
  return Object.is(r, -0) ? 0 : r;
}

function validCell(cell) {
  if (typeof cell === "number") return Number.isFinite(cell);
  if (typeof cell === "string") return true;
  if (Array.isArray(cell)) return cell.every((x) => typeof x === "number" && Number.isFinite(x));
  return false;
}

/**
 * Validate a raw trace result { columns, rows, answer }: shape + finiteness
 * (NaN/Infinity rejected, ≤8 rows), numbers rounded to DEFAULTS.traceDecimals.
 * Returns a NEW normalized result, or null when invalid.
 */
export function validateTraceResult(result) {
  if (!result || typeof result !== "object") return null;
  const { columns, rows, answer } = result;
  if (!Array.isArray(columns) || columns.length === 0 || !columns.every((c) => typeof c === "string")) return null;
  if (!Array.isArray(rows)) return null;
  if (rows.length > TIMEOUTS.traceMaxRows) return null;
  if (typeof answer !== "string" || answer.length === 0) return null;
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== columns.length) return null;
    if (!row.every(validCell)) return null;
  }
  return {
    columns: columns.slice(),
    rows: rows.map((row) =>
      row.map((cell) => {
        if (typeof cell === "number") return roundNumber(cell);
        if (Array.isArray(cell)) return cell.map(roundNumber);
        return cell;
      })
    ),
    answer,
  };
}

function failure() {
  return { computed: false, result: null };
}

/**
 * Run model-generated trace code in the browser sandbox worker. Resolves
 * { computed:true, result } on success, { computed:false, result:null } on any
 * failure (static scan, crash, 2 s timeout via worker.terminate(), bad shape).
 */
export async function runTrace(code) {
  if (staticRejectReason(code)) return failure();
  if (typeof Worker === "undefined" || typeof document === "undefined") return failure();
  return new Promise((resolve) => {
    let worker;
    try {
      worker = new Worker(new URL("./trace.worker.js", import.meta.url), { type: "module" });
    } catch (err) {
      resolve(failure());
      return;
    }
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        worker.terminate();
      } catch (err) {
        void err; // terminate races its own message; the answer is already settled
      }
      resolve(value);
    };
    const timer = setTimeout(() => finish(failure()), TIMEOUTS.traceMs); // hard 2 s timeout
    worker.onmessage = (event) => {
      const data = event.data;
      if (!data || data.ok !== true) {
        finish(failure());
        return;
      }
      const result = validateTraceResult(data.result);
      finish(result ? { computed: true, result } : failure());
    };
    worker.onerror = () => finish(failure());
    try {
      worker.postMessage({ code });
    } catch (err) {
      finish(failure());
    }
  });
}

// Node-side sandbox body: runs inside a worker_thread, shadows the same APIs the
// browser worker shadows, evaluates the code in a fresh vm context and calls run().
const NODE_WORKER_SOURCE = [
  'const wt = require("node:worker_threads");',
  "const vm = require(\"node:vm\");",
  "const code = wt.workerData.code;",
  "const blocked = function () { throw new Error(\"sandboxed API blocked\"); };",
  "const sandbox = {",
  "  Math: Math, JSON: JSON, Number: Number, String: String, Boolean: Boolean, Array: Array,",
  "  Object: Object, Date: Date, Infinity: Infinity, NaN: NaN, isNaN: isNaN, isFinite: isFinite,",
  "  parseInt: parseInt, parseFloat: parseFloat, console: { log: function () {} },",
  "  fetch: undefined, XMLHttpRequest: undefined, WebSocket: undefined, EventSource: undefined,",
  "  importScripts: blocked, indexedDB: undefined, caches: undefined, self: undefined,",
  "};",
  "vm.createContext(sandbox);",
  "try {",
  '  const wrapped = String(code) + "\\n;if (typeof run !== \\"function\\") { throw new Error(\'code must define function run()\'); }\\nrun();";',
  "  const value = vm.runInContext(wrapped, sandbox, { timeout: 1900 });",
  "  wt.parentPort.postMessage({ ok: true, result: value });",
  "} catch (err) {",
  "  wt.parentPort.postMessage({ ok: false, error: String((err && err.message) || err) });",
  "}",
].join("\n");

/**
 * Node equivalent of runTrace for scripts/check.mjs and unit tests: same static
 * scan, 2 s hard timeout via worker terminate, same finiteness/rounding rules.
 */
export async function runTraceNode(code) {
  if (staticRejectReason(code)) return failure();
  let worker;
  try {
    const { Worker } = await import("node:worker_threads");
    worker = new Worker(NODE_WORKER_SOURCE, { eval: true, workerData: { code } });
  } catch (err) {
    void err; // node:worker_threads unavailable (e.g. browser) → not computed
    return failure();
  }
  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try {
        const term = worker.terminate(); // kills a looping worker
        if (term && typeof term.catch === "function") term.catch(() => undefined); // already exited — fine
      } catch (err) {
        void err;
      }
      resolve(value);
    };
    timer = setTimeout(() => finish(failure()), TIMEOUTS.traceMs);
    worker.on("message", (data) => {
      if (!data || data.ok !== true) {
        finish(failure());
        return;
      }
      const result = validateTraceResult(data.result);
      finish(result ? { computed: true, result } : failure());
    });
    worker.on("error", () => finish(failure()));
    worker.on("exit", () => finish(failure()));
  });
}
