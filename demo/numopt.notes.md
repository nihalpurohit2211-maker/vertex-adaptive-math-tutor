# Numerical Optimization — exam-eve notes

*typed at 1am, 9am exam. only wrote what i half-remember, sorry future me. abbrevs: gd = gradient descent, f' = derivative, grad = gradient vector, H = Hessian.*

## 1. Gradient descent (gd, steepest descent)

Use the negative gradient as the downhill direction. The learning rate controls the step size. A step that is too large can overshoot the minimum. update rule: x_{k+1} = x_k − alpha · grad f(x_k), alpha = step size / learning rate. prof writes eta for alpha. too small → crawls; too big → oscillate then diverge (saw it blow up in tutorial 3). stop when ||grad|| ~ 0. for convex f, gd converges to the global min (lecture 4 proof, not in these notes). every lecture sheet calls it gd but steepest descent is the formal name.

### gd tiny numerical example (tutorial 3, this part is solid)

f(x) = x^2, grad = 2x, x0 = 4, alpha = 0.1 → x1 = 4 − 0.1·8 = 3.2, x2 = 2.56, x3 = 2.048. each step multiplies the error by 0.8 (= 1 − 2·alpha): linear convergence, marches down to the min at 0. with alpha = 0.3 the factor is 0.4, same gd rule, shrinks faster. don't push alpha past 1 for this f or the factor flips past −1 and gradient descent diverges past the minimum instead of shrinking toward it. prof loves asking what the learning rate controls — step length vs speed in steepest descent.

## 2. Newton (Newton–Raphson)

Use the gradient and local curvature to choose an update. In one dimension the Newton update divides the derivative by the second derivative when that curvature is usable. for roots f(x) = 0: linearize at x_k, jump to where the tangent crosses zero: x_{k+1} = x_k − f(x_k)/f'(x_k). converges QUADRATICALLY near a simple root — correct digits roughly double each step, massively faster than gd, but only LOCAL: bad x0 → jumps to another root or blows up. breaks when f'(x_k) = 0 (it divides by it). sqrt trick: f(x) = x^2 − a.

### newton for MINIMIZATION — attempted derivation (INCOMPLETE!!)

want grad f(x) = 0, so run Newton–Raphson on g(x) = grad f(x). Jacobian of g is H (the matrix of second derivatives, entries d^2f/dx_i dx_j), so the step becomes x_{k+1} = x_k − H(x_k)^{−1} · grad f(x_k). scalar sanity check: f = x^2, H = 2, grad = 2x → x − 2x/2 = 0, lands on the min in one step, neat. BUT inverting a full n×n H every single step is total pain for big n. so the trick must be to keep some M_k ≈ H^{−1} cheaply and just re-fit it each step using the new s_k ... where do i even start — THAT'S WHERE I GOT STUCK. ask Arav before the exam, definitely 10 marks.

## 3. Line search (Armijo condition) — copied off slide 14, one line only

Armijo = sufficient decrease. Need to revise the condition. something about picking t_k so f(x_k + t·d_k) ≤ f(x_k) + c·t·grad f(x_k)^T d_k with c = 1e-4, then backtracking t → t/2 until it holds? unsure — no worked example written, that is exactly what i need to revise.

## 4. Quasi-Newton / BFGS (formula paste — zero intuition, missed the lecture)

BFGS updates a Hessian approximation using changes in position and gradient. pasted off the slide (inverse-Hessian version): H_{k+1} = (I − rho_k · s_k y_k^T) H_k (I − rho_k · y_k s_k^T) + rho_k · s_k s_k^T, rho_k = 1/(y_k^T s_k), s = position change, y = gradient change. start with H_0 = I presumably. DFP is "similar, terms swapped" — did not check. y^T s > 0 supposedly keeps it positive definite?? none of this is explained in my notes, just the formula.

*that's all i have. unit 2 matrices chapter i literally did not open — will lose marks, whatever.*
