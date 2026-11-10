# reference_numbers.md — independently computed worked examples

Every number in this file came from **executing the code below with Node v24**
(`node raw.mjs`, `node traces.mjs` in a scratch dir; commands and raw outputs pasted
verbatim). Nothing here was typed from memory or produced by an LLM.

Two labels are used throughout:

- **REF** — human-verifiable reference math (raw precision, 10 d.p.). Use these to
  cross-check the app by hand.
- **DEMO TRACE** — the 4-decimal rows baked into
  `demo/numopt.notebook.json` (`lesson.trace.result.rows`). They must equal the
  REF numbers rounded to 4 d.p. `scripts/check.mjs` re-runs the trace `run()` code
  in Node and compares against the stored rows.

---

## (a) Newton's method — sqrt(2) via f(x) = x² − 2

Iteration: `x_{k+1} = x_k − f(x_k)/f'(x_k) = x_k − (x_k² − 2)/(2·x_k)`, start `x0 = 1.5`.

REF code (excerpt of `raw.mjs`):

```js
let x = 1.5;
for (let k = 0; k < 5; k++) {
  const f = x * x - 2, fp = 2 * x, xn = x - f / fp;
  console.log(`k=${k} x=${x.toFixed(10)} f=${f.toFixed(10)} f'=${fp.toFixed(10)} next=${xn.toFixed(10)}`);
  x = xn;
}
```

Actual output (`node raw.mjs`):

```text
k=0  x=1.5000000000  f=0.2500000000  f'=3.0000000000  next=1.4166666667
k=1  x=1.4166666667  f=0.0069444444  f'=2.8333333333  next=1.4142156863
k=2  x=1.4142156863  f=0.0000060073  f'=2.8284313725  next=1.4142135624
k=3  x=1.4142135624  f=0.0000000000  f'=2.8284271247  next=1.4142135624
k=4  x=1.4142135624  f=0.0000000000  f'=2.8284271247  next=1.4142135624
Math.SQRT2 = 1.4142135624   error at end = -0.0000000000
```

DEMO TRACE (same iteration inside the notebook's sandbox-contract `run()`; rows are
REF rounded to 4 d.p.):

| k | x_k | f(x_k) | f'(x_k) | x_{k+1} |
|---|-----|--------|---------|---------|
| 0 | 1.5 | 0.25 | 3 | 1.4167 |
| 1 | 1.4167 | 0.0069 | 2.8333 | 1.4142 |
| 2 | 1.4142 | 0 | 2.8284 | 1.4142 |
| 3 | 1.4142 | 0 | 2.8284 | 1.4142 |
| 4 | 1.4142 | 0 | 2.8284 | 1.4142 |

Note: REF f at k=2 is 0.0000060073, which **rounds to 0** at 4 d.p. — the trace row
showing `0` is correct rounding, not a different computation.

---

## (b) BFGS — two updates on a 2×2 quadratic

Problem: minimize `f(x) = x1² + x2²/2 − 2·x1 − x2`, i.e. `A = [[2,0],[0,1]]`,
`b = [2,1]`, `g(x) = Ax − b`, true minimizer `(1, 1)`. Start `x0 = (0,0)`, `H0 = I`.
Direction `d_k = −H_k·g_k`; exact line search on the quadratic
`t_k = −(d·g)/(dᵀAd)`. Update (inverse-Hessian BFGS):
`H_{k+1} = (I − ρ s yᵀ) H (I − ρ y sᵀ) + ρ s sᵀ`, `ρ = 1/(yᵀs)`, `s = x_{k+1}−x_k`, `y = g_{k+1}−g_k`.

REF code (excerpt of `raw.mjs`; full listing at the end):

```js
for (let k = 0; k < 2; k++) {
  const g = grad(xx);
  const d = [-H[0][0]*g[0] - H[0][1]*g[1], -H[1][0]*g[0] - H[1][1]*g[1]];
  const t = -dot(d, g) / dot(d, Av(A, d));
  const xNew = [xx[0] + t*d[0], xx[1] + t*d[1]];
  // ... s, y, rho, H+ = (I - rho s y')H(I - rho y s') + rho s s'
}
```

Actual output (`node raw.mjs`):

```text
iter 0: x=(0.0000000000, 0.0000000000)  g=(-2.0000000000, -1.0000000000)  d=(2.0000000000, 1.0000000000)  t=0.5555555556
        x+=(1.1111111111, 0.5555555556)  s=(1.1111111111, 0.5555555556)  y=(2.2222222222, 0.5555555556)  y.s=2.7777777778  rho=0.3600000000
        H+ = [[0.5061728395, -0.0246913580], [-0.0246913580, 1.0987654321]]
iter 1: x=(1.1111111111, 0.5555555556)  g=(0.2222222222, -0.4444444444)  d=(-0.1234567901, 0.4938271605)  t=0.9000000000
        x+=(1.0000000000, 1.0000000000)  s=(-0.1111111111, 0.4444444444)  y=(-0.2222222222, 0.4444444444)  y.s=0.2222222222  rho=4.5000000000
        H+ = [[0.5000000000, 0.0000000000], [0.0000000000, 1.0000000000]]
final x=(1.0000000000, 1.0000000000)  g=(0.0000000000, 0.0000000000)  (true minimizer (1,1))
```

Sanity facts a human can check: `y.s = 2.7777777778` → `rho = 0.36` exactly; after
two updates `H = [[0.5, 0], [0, 1]] = A⁻¹` exactly; BFGS with exact line search
solves an n-dim quadratic in n steps — here n = 2.

DEMO TRACE (notebook rows, 4 d.p.; `H` cells store `[h11, h12, h22]`):

| k | x_k | grad f(x_k) | d_k = −H_k g_k | t_k | H_k (h11, h12, h22) |
|---|-----|-------------|----------------|-----|----------------------|
| 0 | [0, 0] | [-2, -1] | [2, 1] | 0.5556 | [1, 0, 1] |
| 1 | [1.1111, 0.5556] | [0.2222, -0.4444] | [-0.1235, 0.4938] | 0.9 | [0.5062, -0.0247, 1.0988] |
| 2 | [1, 1] | [0, 0] | [0, 0] | "-" | [0.5, 0, 1] |

(k=2 is the reporting row: d and t are not applied again; the code emits `[0,0]` /
`"-"` there.)

---

## (c) Gram–Schmidt on v1 = (1,1), v2 = (2,1)

Classical process: `u1 = v1`; `u2 = v2 − (v2·u1 / u1·u1)·u1`; then normalize.

REF code (excerpt of `raw.mjs`):

```js
const u1 = [1, 1], v2 = [2, 1];
const c = (v2[0]*u1[0] + v2[1]*u1[1]) / (u1[0]*u1[0] + u1[1]*u1[1]); // = 3/2
const u2 = [v2[0] - c*u1[0], v2[1] - c*u1[1]];
// q = u / |u|
```

Actual output (`node raw.mjs`):

```text
u1 = v1 = (1.0000000000, 1.0000000000)
v2.u1 = 3.0000000000   u1.u1 = 2.0000000000   coeff c = 1.5000000000   c*u1 = (1.5000000000, 1.5000000000)
u2 = v2 - c*u1 = (0.5000000000, -0.5000000000)   u1.u2 = 0.0000000000
|u1| = 1.4142135624  |u2| = 0.7071067812
q1 = (0.7071067812, 0.7071067812)   q2 = (0.7071067812, -0.7071067812)   q1.q2 = 0.0000000000   |q1|=1? 1.0000000000  |q2|=1? 1.0000000000
```

DEMO TRACE (notebook rows):

| k | v_k | projection removed | u_k (orthogonal part) | q_k (normalized) |
|---|-----|--------------------|-----------------------|------------------|
| 1 | [1, 1] | [0, 0] | [1, 1] | [0.7071, 0.7071] |
| 2 | [2, 1] | [1.5, 1.5] | [0.5, -0.5] | [0.7071, -0.7071] |

---

## The exact trace `run()` code baked into the notebook

These three strings are byte-identical to `topics[i].lesson.trace.code` in
`demo/numopt.notebook.json`. Re-run each in plain node (they are pure) and the
returned object deep-equals the stored `trace.result`.

### Newton

```js
function run() {
  var round4 = function (v) { return Math.round(v * 10000) / 10000; };
  var columns = ["k", "x_k", "f(x_k)", "f'(x_k)", "x_{k+1}"];
  var rows = [];
  var x = 1.5;
  for (var k = 0; k < 5; k++) {
    var f = x * x - 2;
    var fp = 2 * x;
    var xn = x - f / fp;
    rows.push([k, round4(x), round4(f), round4(fp), round4(xn)]);
    x = xn;
  }
  var answer = "sqrt(2) = 1.4142 to 4 decimals; Newton's quadratic convergence gets there by k = 2.";
  return { columns: columns, rows: rows, answer: answer };
}
```

### BFGS

```js
function run() {
  var r = function (v) { return Math.round(v * 10000) / 10000; };
  var mv = function (m, v) { return [m[0][0] * v[0] + m[0][1] * v[1], m[1][0] * v[0] + m[1][1] * v[1]]; };
  var dot = function (a, b) { return a[0] * b[0] + a[1] * b[1]; };
  var A = [[2, 0], [0, 1]];
  var b = [2, 1];
  var H = [[1, 0], [0, 1]];
  var x = [0, 0];
  var rows = [];
  for (var k = 0; k < 3; k++) {
    var g = [A[0][0] * x[0] + A[0][1] * x[1] - b[0], A[1][0] * x[0] + A[1][1] * x[1] - b[1]];
    var d = [-H[0][0] * g[0] - H[0][1] * g[1], -H[1][0] * g[0] - H[1][1] * g[1]];
    var t = k < 2 ? -dot(d, g) / dot(d, mv(A, d)) : 0;
    var xNew = [x[0] + t * d[0], x[1] + t * d[1]];
    rows.push([k, [r(x[0]), r(x[1])], [r(g[0]), r(g[1])], [r(d[0]), r(d[1])],
      k < 2 ? r(t) : "-", [r(H[0][0]), r(H[0][1]), r(H[1][1])]]);
    if (k === 2) break;
    var gNew = [A[0][0] * xNew[0] + A[0][1] * xNew[1] - b[0], A[1][0] * xNew[0] + A[1][1] * xNew[1] - b[1]];
    var s = [xNew[0] - x[0], xNew[1] - x[1]];
    var y = [gNew[0] - g[0], gNew[1] - g[1]];
    var rho = 1 / dot(y, s);
    var yH = [y[0] * H[0][0] + y[1] * H[1][0], y[0] * H[0][1] + y[1] * H[1][1]];
    var W = [[H[0][0] - rho * s[0] * yH[0], H[0][1] - rho * s[0] * yH[1]],
             [H[1][0] - rho * s[1] * yH[0], H[1][1] - rho * s[1] * yH[1]]];
    var z = mv(W, y);
    H = [[W[0][0] - rho * z[0] * s[0] + rho * s[0] * s[0], W[0][1] - rho * z[0] * s[1] + rho * s[0] * s[1]],
         [W[1][0] - rho * z[1] * s[0] + rho * s[1] * s[0], W[1][1] - rho * z[1] * s[1] + rho * s[1] * s[1]]];
    x = xNew;
  }
  var answer = "BFGS with exact line search hits the minimizer x = (1, 1) of f = x1^2 + x2^2/2 - 2 x1 - x2 after only 2 updates.";
  return { columns: ["k", "x_k", "grad f(x_k)", "d_k = -H_k g_k", "t_k", "H_k (h11, h12, h22)"], rows: rows, answer: answer };
}
```

### Gram–Schmidt

```js
function run() {
  var r = function (v) { return Math.round(v * 10000) / 10000; };
  var dot = function (a, b) { return a[0] * b[0] + a[1] * b[1]; };
  var v = [[1, 1], [2, 1]];
  var us = [];
  var rows = [];
  for (var k = 0; k < v.length; k++) {
    var proj = [0, 0];
    for (var j = 0; j < us.length; j++) {
      var c = dot(v[k], us[j]) / dot(us[j], us[j]);
      proj = [proj[0] + c * us[j][0], proj[1] + c * us[j][1]];
    }
    var u = [v[k][0] - proj[0], v[k][1] - proj[1]];
    us.push(u);
    var n = Math.sqrt(dot(u, u));
    rows.push([k + 1, [r(v[k][0]), r(v[k][1])], [r(proj[0]), r(proj[1])], [r(u[0]), r(u[1])], [r(u[0] / n), r(u[1] / n)]]);
  }
  var answer = "q1 = (0.7071, 0.7071), q2 = (0.7071, -0.7071); q1 dot q2 = 0, so the pair is orthonormal.";
  return { columns: ["k", "v_k", "projection removed", "u_k (orthogonal part)", "q_k (normalized)"], rows: rows, answer: answer };
}
```

---

## Commands actually run (scratch dir, node v24.18.0, Git Bash, 2026-11-11)

1. `node raw.mjs` — the raw-precision loops; its full output is pasted in
   sections (a), (b), (c) above.
2. `node traces.mjs` — executes the three `run()` bodies exactly as embedded in
   the notebook; pretty-printed JSON output equals the DEMO TRACE tables above.
3. `node verify_d9.mjs` — fresh process; `JSON.parse` of
   `demo/numopt.notebook.json`, each stored `trace.code` re-run in `node:vm`
   with only `Math` in context, strict deep-equal against the stored rows, plus
   the §8 matrix and citation checks. Tail of the actual output:

```text
PASS  t2 executed trace == stored rows (strict deep equal)
PASS  t4 executed trace == stored rows (strict deep equal)
PASS  t5 executed trace == stored rows (strict deep equal)
PASS  Armijo section is EXACTLY one line between headings
PASS  Gram-Schmidt / GS absent from notes
PASS  Conjugate gradient / CG absent from notes
PASS  notes GD alpha=0.1 sequence correct: 3.2,2.56,2.048
PASS  notes GD alpha=0.3 sequence correct: 1.6,0.64,0.256
ALL CHECKS PASSED
```

Track A: `scripts/check.mjs` should perform the same step-3 comparison (vm +
2 s timeout + finiteness + 4-dp rounding) so the baked demo numbers stay
independently re-verified in CI.
