/**
 * vertex-trace-worker — real-file worker for src/trace.js (plan §6.7).
 * No build step: classic-script style source that is also valid as an ES
 * module, and it imports nothing so it runs in any worker scope.
 * Shadow the network/file APIs before evaluating model code, call run(),
 * post { ok:true, result } or { ok:false, error }. The parent re-checks the
 * result shape and owns the hard timeout.
 */

const SHADOWED_GLOBALS = [
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "importScripts",
  "indexedDB",
  "caches",
  "EventSource",
];

/** Best-effort property overwrite; returns whether it stuck. Never throws. */
function shadowProperty(target, prop) {
  if (!target) return false;
  try {
    target[prop] = undefined;
    return true;
  } catch (err) {
    void err; // read-only accessor (some scopes) — static scan still gates it
    return false;
  }
}

function blockApis() {
  for (const name of SHADOWED_GLOBALS) shadowProperty(globalThis, name);
  if (typeof self !== "undefined") {
    for (const name of SHADOWED_GLOBALS) shadowProperty(self, name);
  }
  if (typeof navigator !== "undefined") shadowProperty(navigator, "sendBeacon");
}

const scope = typeof self !== "undefined" ? self : globalThis;
scope.onmessage = (event) => {
  const code = event && event.data && typeof event.data.code === "string" ? event.data.code : "";
  try {
    blockApis();
    const runIn = new Function(
      '"use strict";\n' +
        String(code) +
        "\n;if (typeof run !== \"function\") { throw new Error('trace code must define function run()'); }\nreturn run();"
    );
    const result = runIn();
    scope.postMessage({ ok: true, result });
  } catch (err) {
    scope.postMessage({ ok: false, error: String((err && err.message) || err) });
  }
};
