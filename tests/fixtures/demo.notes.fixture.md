# Numerical Optimization & Linear Algebra — exam-eve notes (units 3-4)

These are my rushed notes from the last two weeks. Some derivations are half-finished, sorry about the mess. Main theme: iterative minimisation of f(x).

## Gradient descent (steepest descent)
Gradient descent minimises f(x) by repeatedly moving against the gradient: x_{k+1} = x_k - alpha * grad f(x_k). Alpha is the step size (learning rate): if alpha is too big the iteration diverges, if it is too small convergence is painfully slow. The direction -grad f(x_k) is the steepest descent direction, so gradient descent is also called the method of steepest descent. We stop when ||grad f|| < tol or after max_iter steps.

Worked example for gradient descent on f(x) = x^2 where the gradient is 2x: start x0 = 2 with step alpha = 0.1, then x1 = 2 - 0.1*4 = 1.6, x2 = 1.6 - 0.1*3.2 = 1.28, x3 = 1.28 - 0.1*2.56 = 1.024. The steepest-descent iterates shrink toward the minimiser x* = 0, slowly. With alpha = 1.0 the same gradient descent run would oscillate and diverge instead.

## Newton's method (second-order method)
Derivation, half-finished (check textbook for the rest): Taylor-expand f around x_k and keep the quadratic model m(d) = f(x_k) + g^T d + 1/2 d^T H d, where g is the gradient vector and H is the Hessian of second partial derivatives. Minimise the model: grad m = g + H d = 0, so the Newton step solves H d_k = -g_k, i.e. d_k = -H^{-1} g.

Newton update: x_{k+1} = x_k - H(x_k)^{-1} grad f(x_k). In one dimension Newton's method becomes x_{k+1} = x_k - f'(x_k)/f''(x_k). Near the solution the Newton iteration converges quadratically, much faster than gradient descent, but each step needs the second-order Hessian inverted, and far from the solution it can blow up. No worked example written here, will add numbers later.

## Line search (Armijo)
Armijo backtracking rule: start alpha = 1 and halve it until f(x + alpha d) <= f(x) + c * alpha * d^T g with c = 1e-4. (one line from the slide, that's all I have)

## Quasi-Newton / BFGS
Update formula pasted from the slide, I do not get the intuition yet: B_{k+1} = B_k - (B_k s_k s_k^T B_k)/(s_k^T B_k s_k) + (y_k y_k^T)/(s_k^T y_k), where s_k = x_{k+1} - x_k and y_k = g_{k+1} - g_k. The BFGS quasi-Newton step is then d_k = -B_{k+1}^{-1} g_k. TODO: why does this approximate the Hessian?

Linear algebra revision: the matrices chapter — I did not even open it, ran out of time. Nothing written for the missing unit 2 topics, sorry.
