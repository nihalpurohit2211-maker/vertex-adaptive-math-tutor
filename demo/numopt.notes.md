# Numerical Optimization & Linear Algebra — exam-eve notes

*typed at 1am, 9am exam. only wrote what i half-remember, sorry future me. abbrevs: gd = gradient descent, f' = derivative, grad = gradient vector, H = Hessian.*

## 1. Gradient Descent (GD, "steepest descent")

idea: grad f points UPHILL, so walk opposite it. update rule: x_{k+1} = x_k − alpha · grad f(x_k). alpha = step size / learning rate. if alpha too big → oscillate then diverge (saw it blow up in tutorial); too small → crawls. stop when ||grad|| ~ 0. for convex f this converges to the global min (proof was lecture 4, not in these notes). every lecture sheet calls it "gd", prof writes eta for alpha.

### GD tiny numerical example (tutorial 3, this one is solid)

f(x) = x^2, so grad = 2x, start x0 = 4, alpha = 0.1:
x1 = 4 − 0.1·(2·4) = 4 − 0.8 = 3.2
x2 = 3.2 − 0.1·6.4 = 2.56
x3 = 2.56 − 0.512 = 2.048
pattern: each step multiplies error by 0.8 (= 1 − 2·alpha), linear convergence, marches down to the min at 0. with alpha = 0.3 the factor is 0.4 and it hits 1.6, 0.64, 0.256 — same rule, shrinks faster. don't push alpha past 1 for this f or the factor flips past −1 and it diverges past the min. prof loves asking "what does alpha control" — tradeoff between step length and speed; too big overshoots past the min every iteration instead of shrinking toward it.

## 2. Newton's Method (Newton–Raphson)

for solving f(x) = 0: linearize at x_k, i.e. f(x_k) + f'(x_k)(x − x_k) = 0, solve that line for where it crosses zero: x_{k+1} = x_k − f(x_k)/f'(x_k). geometrically: the tangent at x_k is the line y = f(x_k) + f'(x_k)(x − x_k); set y = 0, solve, that's the next x. repeat. converges QUADRATICALLY near a simple root — error constant e_{k+1} ≈ [f''(x*)/(2f'(x*))]·e_k^2, so right digits double each step — massively faster than gd, but only LOCAL: bad x0 → jumps to another root or blows up. breaks when f'(x_k) = 0 (divide by it). standard way to get sqrt's: f(x) = x^2 − a.

### newton for MINIMIZATION — attempted derivation (INCOMPLETE!!)

want grad f(x) = 0, so run Newton–Raphson on g(x) = grad f(x). Jacobian of g is the Hessian H(x_k) (entries H_ij = d^2f / dx_i dx_j). so:
x_{k+1} = x_k − H(x_k)^{−1} · grad f(x_k).
scalar sanity check: f = x^2, H = 2, grad = 2x → x − 2x/2 = 0, lands on the min in one step, neat.
BUT inverting a full n×n H every single step is total pain for big n. so the trick must be to keep some M_k ≈ H^{−1} cheaply and only UPDATE it each step using the new s_k ... where do i even start — THAT'S WHERE I GOT STUCK. ask Arav before the exam, this is definitely 10 marks.

## 3. Line search (Armijo condition) — one thing i copied off slide 14

choose t_k so we don't overshoot: sufficient decrease rule f(x_k + t·d_k) ≤ f(x_k) + c·t·grad f(x_k)^T d_k with c = 1e-4, start at t = 1 and backtrack t → t/2 until it holds (a.k.a. backtracking line search).

## 4. Quasi-Newton methods / BFGS (formula paste — zero intuition written, missed the lecture)

the BFGS update (inverse-Hessian version, straight off the slide):
H_{k+1} = (I − rho_k · s_k y_k^T) H_k (I − rho_k · y_k s_k^T) + rho_k · s_k s_k^T,   rho_k = 1/(y_k^T s_k),   s_k = x_{k+1} − x_k,   y_k = g_{k+1} − g_k where g = grad f.
start with H_0 = I presumably. DFP is "similar, terms swapped" — did not check. y^T s > 0 supposedly keeps H "positive definite" so directions stay descent?? none of this is explained anywhere in my notes, just the formula.

*that's all i have. unit 2 matrices chapter i literally did not open — will lose marks, whatever.*
