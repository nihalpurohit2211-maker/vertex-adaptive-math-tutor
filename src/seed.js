/**
 * seed.js — curated demo records that are not part of the original notebook
 * fixture: calendar, sessions, formulas, practice bank, scenarios and diagram
 * flows. Static content — reviewed, offline, no model calls.
 */
import { localDateKey } from './core.js';

function dateKey(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return localDateKey(d);
}

function isoOffset(days, hours = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(d.getHours() + hours, 0, 0, 0);
  return d.toISOString();
}

export function seedDemoNotebook(nb) {
  nb.kind = 'demo';
  nb.owner = 'demo';
  if (!nb.examDate) nb.examDate = dateKey(5);

  ensureSheet(nb, 't2', {
    takeaway: 'Newton uses curvature directly; BFGS updates an approximation.',
    formula: String.raw`x_{k+1}=x_k-H(x_k)^{-1}\nabla f(x_k)`,
    fallback: 'xₖ₊₁ = xₖ − H(xₖ)⁻¹∇f(xₖ)',
    notes: ['H must be invertible and the start near the solution.', 'H is the Jacobian of ∇f.'],
  });
  ensureSheet(nb, 't5', {
    takeaway: 'Orthogonal vectors have zero dot product; orthonormal vectors also have unit length.',
    formula: String.raw`v_k=a_k-\sum_{i<k}(a_k^{\top}q_i)\,q_i,\qquad q_k=\frac{v_k}{\|v_k\|}`,
    fallback: 'vₖ = aₖ − Σᵢ<ₖ (aₖᵀqᵢ)qᵢ,  qₖ = vₖ/‖vₖ‖',
    notes: ['Subtract every earlier direction before normalising.', 'Stop if the remainder has zero norm: the vectors were dependent.'],
  });
  ensureSheet(nb, 't6', {
    takeaway: 'Conjugate directions avoid undoing progress; the update uses the matrix-weighted inner product.',
    formula: String.raw`p_k=-g_k+\beta_k p_{k-1},\qquad \beta_k=\frac{g_k^{\top}g_k}{g_{k-1}^{\top}g_{k-1}}`,
    fallback: 'pₖ = −gₖ + βₖpₖ₋₁,  βₖ = (gₖᵀgₖ)/(gₖ₋₁ᵀgₖ₋₁)',
    notes: ['For a quadratic, conjugate directions converge in at most n steps in exact arithmetic.', 'Restart if progress stalls.'],
  });

  if (!Array.isArray(nb.calendar)) {
    nb.calendar = [
      { id: 'ev-demo-1', topicId: 't1', date: dateKey(-2), start: '17:30', duration: 40, type: 'numerical', priority: 3, notes: 'Tutorial 3 examples — worked cleanly.', done: true },
      { id: 'ev-demo-2', topicId: 't3', date: dateKey(-1), start: '19:00', duration: 25, type: 'formulas', priority: 2, notes: 'Armijo condition from slide 14.', done: true },
      { id: 'ev-demo-3', topicId: 't2', date: dateKey(0), start: '17:00', duration: 45, type: 'concept', priority: 3, notes: 'Finish the minimization derivation.', done: true },
      { id: 'ev-demo-4', topicId: 't2', date: dateKey(0), start: '19:30', duration: 30, type: 'numerical', priority: 3, notes: 'One Newton step by hand.', done: false },
      { id: 'ev-demo-5', topicId: 't4', date: dateKey(1), start: '18:00', duration: 40, type: 'concept', priority: 2, notes: 'BFGS vs Newton — what is actually stored.', done: false },
      { id: 'ev-demo-6', topicId: 't5', date: dateKey(2), start: '17:30', duration: 35, type: 'gaps', priority: 3, notes: 'No notes at all — build the idea from scratch.', done: false },
      { id: 'ev-demo-7', topicId: 't6', date: dateKey(3), start: '18:30', duration: 30, type: 'concept', priority: 2, notes: 'Conjugacy before formulas.', done: false },
      { id: 'ev-demo-8', topicId: 't3', date: dateKey(4), start: '17:00', duration: 30, type: 'exam', priority: 3, notes: 'Past-paper Armijo question.', done: false },
    ];
  }

  if (!Array.isArray(nb.sessions)) {
    nb.sessions = [
      { id: 's1', topicId: 't1', minutes: 40, date: dateKey(-2), at: isoOffset(-2, 1), eventId: 'ev-demo-1' },
      { id: 's2', topicId: 't3', minutes: 25, date: dateKey(-1), at: isoOffset(-1, 2), eventId: 'ev-demo-2' },
      { id: 's3', topicId: 't1', minutes: 30, date: dateKey(-4), at: isoOffset(-4, 1) },
      { id: 's4', topicId: 't2', minutes: 45, date: dateKey(-3), at: isoOffset(-3, 2) },
      { id: 's5', topicId: 't1', minutes: 20, date: dateKey(-6), at: isoOffset(-6, 1) },
    ];
  }

  if (!Array.isArray(nb.opened)) {
    nb.opened = [
      { topicId: 't1', at: isoOffset(0, -2) },
      { topicId: 't2', at: isoOffset(-1, 1) },
      { topicId: 't3', at: isoOffset(-2, 2) },
    ];
  }

  if (!Array.isArray(nb.practice)) {
    nb.practice = [
      {
        id: 'pr1', topicId: 't1', questionId: 'q-t1-2', at: isoOffset(-1, 2),
        reflection: { difficult: 'Choosing the step size', formula: 'xₖ₊₁ = xₖ − α∇f(xₖ)', change: 'Shrink α before changing direction', pinned: false },
      },
      {
        id: 'pr2', topicId: 't2', questionId: 'q-t2-1', at: isoOffset(-2, 3),
        reflection: { difficult: 'Solving the Hessian system', formula: 'H d = −∇f', change: 'Write H first, then solve', pinned: false },
      },
    ];
  }

  if (!Array.isArray(nb.progress)) {
    nb.progress = [
      { at: isoOffset(-6, 1), covered: 2, total: 6 },
      { at: isoOffset(-2, 1), covered: 2, total: 6 },
    ];
  }
  return nb;
}

function ensureSheet(nb, topicId, sheet) {
  const topic = (nb.topics || []).find((t) => t.id === topicId);
  if (topic && topic.lesson && !topic.lesson.sheet) topic.lesson.sheet = sheet;
}

/* -------------------------------------------------------------------------- */
/* formulas                                                                    */
/* -------------------------------------------------------------------------- */

const F = (id, name, category, unit, topicIds, latex, fallback, explanation, vars, use, example) =>
  ({ id, name, category, unit, topicIds, latex, fallback, explanation, vars, use, example, source: 'Vertex reference' });

export const FORMULAS = [
  F('f-objective', 'Objective function', 'Foundations', 'Unconstrained optimization', ['t1', 't2', 't4', 't6'],
    String.raw`\min_{x\in\mathbb{R}^n} f(x)`,
    'min over x ∈ ℝⁿ of f(x)',
    'The function you are trying to make as small as possible. Everything else — gradients, steps, stopping rules — serves this line.',
    [['x', 'decision variables (a vector)'], ['f', 'scalar objective']],
    'Write this first so the direction of every later formula is unambiguous.',
    'f(x) = x₁² + 3x₂² has its minimum at (0, 0).'),
  F('f-gradient', 'Gradient vector', 'Derivatives', 'Unconstrained optimization', ['t1', 't2', 't3', 't4', 't6'],
    String.raw`\nabla f(x)=\left[\frac{\partial f}{\partial x_1},\ldots,\frac{\partial f}{\partial x_n}\right]^{\top}`,
    '∇f(x) = [∂f/∂x₁, …, ∂f/∂xₙ]ᵀ',
    'A vector of first partial derivatives. It points in the direction of steepest increase, so its negative points locally downhill.',
    [['∇f', 'gradient'], ['xᵢ', 'one coordinate']],
    'Use it to build a descent direction; a zero gradient is a necessary condition for an unconstrained minimum.',
    'f(x,y) = x² + y² gives ∇f = (2x, 2y).'),
  F('f-partial', 'Partial derivative', 'Derivatives', 'Calculus', [],
    String.raw`\frac{\partial f}{\partial x_i}=\lim_{h\to 0}\frac{f(\ldots,x_i+h,\ldots)-f(\ldots,x_i,\ldots)}{h}`,
    '∂f/∂xᵢ = lim h→0 [f(…, xᵢ+h, …) − f(…)]/h',
    'Differentiate with respect to one variable while freezing the others. The gradient stacks these.',
    [['xᵢ', 'the varying coordinate'], ['h', 'small change']],
    'Use it whenever the objective has several variables but you need the slope along one axis.',
    'For f = x²y, ∂f/∂x = 2xy and ∂f/∂y = x².'),
  F('f-gd', 'Gradient descent update', 'First-order methods', 'Unconstrained optimization', ['t1', 't3'],
    String.raw`x_{k+1}=x_k-\alpha_k\nabla f(x_k)`,
    'xₖ₊₁ = xₖ − αₖ∇f(xₖ)',
    'Move opposite the gradient. The learning rate α decides how far; it is not a property of the direction.',
    [['xₖ', 'current iterate'], ['αₖ', 'step size / learning rate'], ['∇f', 'gradient at xₖ']],
    'Use it when you can evaluate gradients cheaply and need a simple, low-memory method.',
    'f = x², x₀ = 4, α = 0.1 gives x₁ = 4 − 0.1·8 = 3.2.'),
  F('f-lr', 'Stable learning rate (quadratic)', 'First-order methods', 'Unconstrained optimization', ['t1'],
    String.raw`0<\alpha<\frac{2}{L},\qquad L=\max_x\|\nabla^2 f(x)\|`,
    '0 < α < 2/L,  L = max ‖∇²f‖',
    'For an L-smooth quadratic, a fixed step below 2/L keeps gradient descent from diverging. Too small is safe but slow.',
    [['L', 'largest curvature (Lipschitz constant)'], ['α', 'fixed step size']],
    'Use it to sanity-check a learning rate before blaming the direction.',
    'f = 5x² has L = 10, so a stable fixed step needs 0 < α < 0.2.'),
  F('f-stop', 'Convergence criterion', 'Foundations', 'Unconstrained optimization', ['t1', 't2', 't4', 't6'],
    String.raw`\|\nabla f(x_k)\|<\varepsilon`,
    '‖∇f(xₖ)‖ < ε',
    'Stop when the gradient is small enough for your tolerance. A small step alone is not proof of a minimum.',
    [['ε', 'chosen tolerance'], ['‖·‖', 'Euclidean norm']],
    'Use it as the stopping test in a first-order loop, alongside a maximum iteration count.',
    'With ε = 10⁻⁶, stop once every gradient component is below roughly 10⁻⁶.'),
  F('f-newton', 'Newton update', 'Second-order methods', 'Unconstrained optimization', ['t2', 't4'],
    String.raw`x_{k+1}=x_k-H(x_k)^{-1}\nabla f(x_k)`,
    'xₖ₊₁ = xₖ − H(xₖ)⁻¹∇f(xₖ)',
    'Apply Newton–Raphson to ∇f = 0. The Hessian rescales the step using local curvature.',
    [['H', 'Hessian matrix ∇²f'], ['H⁻¹', 'inverse curvature']],
    'Use it near a solution with usable curvature; it converges quadratically there.',
    'f = x² − 4x, x₀ = 0: H = 2, ∇f = −4, so x₁ = 0 − (1/2)(−4) = 2.'),
  F('f-hessian', 'Hessian matrix', 'Second-order methods', 'Unconstrained optimization', ['t2', 't4'],
    String.raw`H_{ij}=\frac{\partial^2 f}{\partial x_i\,\partial x_j}`,
    'Hᵢⱼ = ∂²f / ∂xᵢ∂xⱼ',
    'The matrix of second partial derivatives. It describes how the gradient changes and therefore the local shape.',
    [['H', 'n×n symmetric matrix for smooth f']],
    'Use it to test curvature and to build Newton-type steps.',
    'f = x² + 3xy + y² has H = [[2, 3], [3, 2]].'),
  F('f-second-order', 'Second-order condition', 'Second-order methods', 'Unconstrained optimization', ['t2', 't5'],
    String.raw`\nabla f(x^*)=0\ \text{ and }\ \nabla^2 f(x^*)\succ 0`,
    '∇f(x*) = 0 and ∇²f(x*) ≻ 0',
    'A stationary point is a strict local minimum when the Hessian is positive definite. A zero gradient alone is not enough.',
    [['x*', 'stationary point'], ['≻ 0', 'positive definite']],
    'Use it after solving ∇f = 0 to classify the point.',
    'f = x² has H = 2 > 0 at x = 0, so it is a minimum.'),
  F('f-armijo', 'Armijo sufficient decrease', 'Line search', 'Unconstrained optimization', ['t3'],
    String.raw`f(x_k+\alpha p_k)\le f(x_k)+c\,\alpha\,\nabla f(x_k)^{\top}p_k`,
    'f(xₖ + αpₖ) ≤ f(xₖ) + c·α·∇f(xₖ)ᵀpₖ',
    'Accepts a step only if it decreases the objective by at least a fraction of what the local linear model predicts. Usually 10⁻⁴ ≤ c < 1.',
    [['pₖ', 'search direction'], ['c', 'sufficient-decrease constant']],
    'Use it inside backtracking: shrink α until the inequality holds.',
    'With c = 10⁻⁴, a tiny decrease that is below c·α·slope fails the test.'),
  F('f-bfgs', 'BFGS inverse-Hessian update', 'Second-order methods', 'Unconstrained optimization', ['t4'],
    String.raw`H_{k+1}=(I-\rho_k s_k y_k^{\top})H_k(I-\rho_k y_k s_k^{\top})+\rho_k s_k s_k^{\top},\quad \rho_k=\frac{1}{y_k^{\top}s_k}`,
    'Hₖ₊₁ = (I − ρₖsₖyₖᵀ)Hₖ(I − ρₖyₖsₖᵀ) + ρₖsₖsₖᵀ,  ρₖ = 1/(yₖᵀsₖ)',
    'Updates an approximation H to the inverse Hessian from the observed step s and gradient change y. No true Hessian solve is needed.',
    [['sₖ', 'step xₖ₊₁ − xₖ'], ['yₖ', 'gradient change'], ['Hₖ', 'inverse-Hessian estimate']],
    'Use it when full Hessians are too expensive but first-order methods are too slow.',
    'Initialize H₀ = I, take a step, observe s and y, then apply the update; keep yᵀs > 0.'),
  F('f-lagrange', 'Lagrange multiplier condition', 'Constraints', 'Constrained optimization', [],
    String.raw`\nabla f(x)=\sum_{i=1}^{m}\lambda_i\nabla g_i(x),\qquad g_i(x)=0`,
    '∇f(x) = Σ λᵢ∇gᵢ(x),  gᵢ(x) = 0',
    'At a regular constrained optimum, the objective gradient is a linear combination of constraint gradients. The multipliers are the weights.',
    [['gᵢ', 'equality constraints'], ['λᵢ', 'Lagrange multipliers']],
    'Use it for equality-constrained problems; add KKT inequalities for active constraints.',
    'Minimise x + y subject to x² + y² = 1: ∇f = (1,1) must be parallel to (2x,2y).'),
  F('f-gram', 'Gram–Schmidt', 'Linear algebra', 'Linear algebra', ['t5'],
    String.raw`v_k=a_k-\sum_{i<k}(a_k^{\top}q_i)q_i,\qquad q_k=\frac{v_k}{\|v_k\|}`,
    'vₖ = aₖ − Σᵢ<ₖ(aₖᵀqᵢ)qᵢ,  qₖ = vₖ/‖vₖ‖',
    'Build an orthonormal basis one vector at a time: remove the component along every previous direction, then normalise.',
    [['aₖ', 'incoming vector'], ['qᵢ', 'earlier orthonormal vectors'], ['vₖ', 'orthogonal remainder']],
    'Use it for QR factorisation, least squares and cleaning up a basis.',
    'a₁=(3,4) gives q₁=(3/5,4/5); project and subtract the next vector to continue.'),
  F('f-cg', 'Conjugate gradient direction', 'First-order methods', 'Linear algebra', ['t6'],
    String.raw`p_k=-g_k+\beta_k p_{k-1},\qquad \beta_k=\frac{g_k^{\top}g_k}{g_{k-1}^{\top}g_{k-1}}`,
    'pₖ = −gₖ + βₖpₖ₋₁,  βₖ = (gₖᵀgₖ)/(gₖ₋₁ᵀgₖ₋₁)',
    'Fletcher–Reeves conjugacy: each new direction combines the current steepest-descent direction with the previous search direction.',
    [['gₖ', 'gradient at step k'], ['βₖ', 'conjugacy weight'], ['pₖ', 'search direction']],
    'Use it for large symmetric positive-definite systems where storing a Hessian is impractical.',
    'For a quadratic in n variables, exact arithmetic converges in at most n steps.'),
  F('f-taylor', 'Second-order Taylor model', 'Foundations', 'Calculus', ['t2', 't4'],
    String.raw`f(x+d)\approx f(x)+\nabla f(x)^{\top}d+\tfrac12 d^{\top}\nabla^2 f(x)d`,
    'f(x+d) ≈ f(x) + ∇f(x)ᵀd + ½dᵀ∇²f(x)d',
    'The local quadratic model behind Newton’s method. Minimising it gives d = −H⁻¹∇f.',
    [['d', 'candidate step'], ['H', 'Hessian at x']],
    'Use it to see why curvature changes the step, not just the direction.',
    'For f = x², the model is exact: f(x+d) = x² + 2xd + d².'),
];

/* -------------------------------------------------------------------------- */
/* practice questions                                                          */
/* -------------------------------------------------------------------------- */

const S = (interpretation, formula, substitution, calculation, result, reasoning, mistakes) =>
  ({ interpretation, formula, substitution, calculation, result, reasoning, mistakes });

export const QUESTIONS = [
  {
    id: 'q-t1-1', topicId: 't1', type: 'mcq', difficulty: 1,
    prompt: 'A gradient descent step points downhill, but the objective increases after the step. What is the most likely cause?',
    options: ['The gradient sign is wrong', 'The step size is too large', 'The function has no minimum', 'The Hessian is singular'],
    answerIndex: 1,
    hint: 'The negative gradient is only a local linear model.',
    solution: S('A downhill direction is local; a long step can leave the region where the model holds.',
      String.raw`x_{k+1}=x_k-\alpha_k\nabla f(x_k)`, 'Keep the direction, reduce α.', 'Re-evaluate f after a shorter step.',
      'The step size is too large — shorten it before changing direction.',
      'The gradient describes slope near the current point, not across the whole valley.',
      'Reversing the direction points uphill; a singular Hessian is a Newton issue.'),
  },
  {
    id: 'q-t1-2', topicId: 't1', type: 'numeric', difficulty: 2,
    prompt: 'Run two gradient descent steps on f(x) = x² from x₀ = 4 with α = 0.1. Report x₁ and x₂.',
    known: ['f(x) = x²', '∇f(x) = 2x', 'x₀ = 4', 'α = 0.1'],
    hint: 'Each step subtracts α times the gradient at the current point.',
    solution: S('Apply the update twice, recomputing the gradient each time.',
      String.raw`x_{k+1}=x_k-\alpha(2x_k)`,
      'x₁ = 4 − 0.1·8; x₂ = x₁ − 0.1·2x₁',
      'x₁ = 3.2; x₂ = 3.2 − 0.64 = 2.56',
      'x₁ = 3.2 and x₂ = 2.56.',
      'The error is multiplied by (1 − 2α) = 0.8 on this quadratic, so it shrinks geometrically.',
      'Using the original gradient again for step two gives 2.4 instead of 2.56.'),
  },
  {
    id: 'q-t1-3', topicId: 't1', type: 'mistake', difficulty: 2,
    prompt: 'A classmate writes: “The gradient points downhill, so we add α∇f(x).” Identify the mistake.',
    options: ['The gradient should be normalised first', 'Adding the gradient moves uphill; the update subtracts it', 'α must equal 1', 'The gradient does not exist'],
    answerIndex: 1,
    hint: 'Which direction does ∇f point?',
    solution: S('∇f points toward steepest increase; descent uses the negative gradient.',
      String.raw`x_{k+1}=x_k-\alpha\nabla f(x_k)`, 'Change + to −.', 'The sign of the update flips.',
      'The update must subtract the gradient, not add it.',
      'A gradient is an ascent direction by definition; minimisation reverses it.',
      'Normalising fixes magnitude, not sign.'),
  },
  {
    id: 'q-t2-1', topicId: 't2', type: 'numeric', difficulty: 2,
    prompt: 'Take one Newton step for f(x) = x² − 4x starting at x₀ = 0.',
    known: ['f′(x) = 2x − 4', 'f″(x) = 2'],
    hint: 'Newton solves f′(x) = 0: x₁ = x₀ − f′(x₀)/f″(x₀).',
    solution: S('Apply the one-dimensional Newton update.',
      String.raw`x_{k+1}=x_k-\frac{f'(x_k)}{f''(x_k)}`,
      'x₁ = 0 − (−4)/2',
      'x₁ = 2',
      'x₁ = 2, which is the minimiser of this quadratic.',
      'A quadratic has constant curvature, so one Newton step lands exactly at the stationary point.',
      'Dividing by f′(x) instead of f″(x) is dimensionally and numerically wrong.'),
  },
  {
    id: 'q-t2-2', topicId: 't2', type: 'mcq', difficulty: 2,
    prompt: 'When is Newton’s method a poor choice for minimisation?',
    options: ['When gradients are cheap', 'When the Hessian is singular or indefinite far from the solution', 'When the function is quadratic', 'When the starting point is close to the minimum'],
    answerIndex: 1,
    hint: 'Think about what H⁻¹ requires and where the quadratic model is trustworthy.',
    solution: S('Newton needs an invertible, usable curvature model.',
      String.raw`x_{k+1}=x_k-H_k^{-1}\nabla f(x_k)`,
      'If H is singular, H⁻¹ does not exist; if H is indefinite, the step need not descend.',
      'Near a minimum H is positive definite and the method is fast.',
      'Avoid it (or modify it) when curvature is unusable or the start is far away.',
      'Convergence is only local; quadratic speed is a local promise.',
      'Cheap gradients make Newton more attractive, not less.'),
  },
  {
    id: 'q-t2-3', topicId: 't2', type: 'derivation', difficulty: 3,
    prompt: 'Derive the Newton update for minimisation starting from the stationarity condition ∇f(x) = 0.',
    hint: 'Apply Newton–Raphson to the gradient function g(x) = ∇f(x) and identify its Jacobian.',
    solution: S('Treat the gradient as a vector function and linearise it at the current point.',
      String.raw`g(x)=\nabla f(x),\quad g(x_k+d)\approx g(x_k)+\nabla^2 f(x_k)d`,
      'Set the linear model to zero: ∇f(xₖ) + H(xₖ)d = 0.',
      'Solve for d: d = −H(xₖ)⁻¹∇f(xₖ).',
      'The update is xₖ₊₁ = xₖ − H(xₖ)⁻¹∇f(xₖ).',
      'This is Newton–Raphson applied to g = ∇f; the Jacobian of the gradient is the Hessian.',
      'Forgetting that H must be invertible, or linearising f instead of ∇f, are the common errors.'),
  },
  {
    id: 'q-t3-1', topicId: 't3', type: 'formula', difficulty: 2,
    prompt: 'Which inequality is the Armijo sufficient-decrease condition?',
    options: [
      'f(xₖ + αpₖ) ≤ f(xₖ) + c α ∇f(xₖ)ᵀpₖ',
      'f(xₖ + αpₖ) < f(xₖ)',
      '‖∇f(xₖ + αpₖ)‖ < ε',
      'α = 1',
    ],
    answerIndex: 0,
    hint: 'Armijo compares the actual decrease with a fraction of the linear-model prediction.',
    solution: S('Armijo asks for sufficient decrease, not merely any decrease.',
      String.raw`f(x_k+\alpha p_k)\le f(x_k)+c\,\alpha\,\nabla f(x_k)^{\top}p_k`,
      'The right-hand side is the linear model’s predicted decrease scaled by c.',
      'With pₖ downhill, the right-hand side is below f(xₖ).',
      'Option 1 is the condition.',
      'Backtracking shrinks α until the inequality is true.',
      'A tiny decrease can satisfy f(x+αp) < f(x) but still fail Armijo.'),
  },
  {
    id: 'q-t3-2', topicId: 't3', type: 'theory', difficulty: 2,
    prompt: 'Explain in two or three sentences why “the objective decreased” is not enough to accept a line-search step.',
    hint: 'Compare the actual decrease to the decrease the local model predicts.',
    solution: S('The line search certifies that the step is long enough to make meaningful progress.',
      String.raw`f(x_k+\alpha p_k)\le f(x_k)+c\,\alpha\,\nabla f(x_k)^{\top}p_k`,
      'A step can lower f by an arbitrarily small amount while α is tiny.',
      'Armijo rules out those useless micro-steps.',
      'Accept only a step with sufficient decrease relative to its length and slope.',
      'Without the condition, backtracking could stop almost immediately and stall.',
      'Confusing “any decrease” with “sufficient decrease” is the standard exam trap.'),
  },
  {
    id: 'q-t4-1', topicId: 't4', type: 'mcq', difficulty: 2,
    prompt: 'What does the BFGS matrix actually approximate?',
    options: ['The gradient', 'The Hessian itself', 'The inverse Hessian', 'The step size'],
    answerIndex: 2,
    hint: 'The search direction is written dₖ = −Hₖ∇f(xₖ).',
    solution: S('BFGS maintains an approximation to the inverse Hessian so the direction is a cheap Newton-like step.',
      String.raw`d_k=-H_k\nabla f(x_k)`,
      'If H were the Hessian, forming the direction would need a linear solve every iteration.',
      'The update uses the secant pair (sₖ, yₖ).',
      'It approximates the inverse Hessian.',
      'That is why BFGS costs O(n²) storage instead of O(n³) work per step.',
      'Saying it approximates the Hessian confuses the matrix with its inverse.'),
  },
  {
    id: 'q-t4-2', topicId: 't4', type: 'theory', difficulty: 3,
    prompt: 'Why is the condition yᵀs > 0 important in a quasi-Newton update?',
    hint: 'Consider what it says about curvature along the step.',
    solution: S('It guarantees the secant pair carries positive curvature along the step.',
      String.raw`y_k^{\top}s_k>0`,
      'y is the gradient change; s is the step.',
      'Positive yᵀs keeps the updated inverse Hessian positive definite.',
      'It preserves a descent direction and avoids a degenerate update.',
      'A line search satisfying Wolfe conditions normally supplies this property.',
      'Ignoring the condition can make the approximation indefinite.'),
  },
  {
    id: 'q-t5-1', topicId: 't5', type: 'numeric', difficulty: 2,
    prompt: 'Apply Gram–Schmidt to a₁ = (3, 4) and a₂ = (1, 2). Give q₁ and q₂.',
    known: ['‖a₁‖ = 5', 'a₂ᵀq₁ = 11/5'],
    hint: 'Normalise a₁, subtract its projection from a₂, then normalise the remainder.',
    solution: S('Orthogonalise the second vector against the first, then normalise both.',
      String.raw`q_1=\frac{a_1}{\|a_1\|},\quad v_2=a_2-(a_2^{\top}q_1)q_1,\quad q_2=\frac{v_2}{\|v_2\|}`,
      'q₁ = (3/5, 4/5); v₂ = (1,2) − (11/5)(3/5,4/5)',
      'v₂ = (−8/25, 6/25); ‖v₂‖ = 2/5',
      'q₁ = (3/5, 4/5) and q₂ = (−4/5, 3/5).',
      'The remainder is perpendicular to q₁ by construction, and normalising gives unit length.',
      'Subtracting the projection from q₁ instead of a₂, or forgetting to normalise v₂.'),
  },
  {
    id: 'q-t5-2', topicId: 't5', type: 'mcq', difficulty: 1,
    prompt: 'Two non-zero vectors are orthonormal. Which pair of facts is true?',
    options: ['Dot product 0; both unit length', 'Dot product 1; both unit length', 'Dot product 0; arbitrary lengths', 'Parallel; equal length'],
    answerIndex: 0,
    hint: '“Ortho” is about angle; “normal” is about length.',
    solution: S('Orthonormal means orthogonal and normalised.',
      String.raw`u^{\top}v=0,\quad \|u\|=\|v\|=1`,
      'Both conditions are required.', 'Orthogonality gives the zero dot product; normalisation gives unit norms.',
      'Dot product 0 and both unit length.',
      'This is exactly the output Gram–Schmidt produces.',
      'Orthogonal alone does not force unit length.'),
  },
  {
    id: 'q-t6-1', topicId: 't6', type: 'mcq', difficulty: 2,
    prompt: 'What advantage does conjugate gradient have over steepest descent on a quadratic?',
    options: ['It never needs a gradient', 'It uses conjugate directions so it does not undo earlier progress', 'It always uses a fixed step of 1', 'It avoids matrix-vector products'],
    answerIndex: 1,
    hint: 'Think about zig-zagging in narrow valleys.',
    solution: S('Conjugate directions remove the repeated cancellation that causes steepest descent to zig-zag.',
      String.raw`p_k=-g_k+\beta_kp_{k-1}`,
      'The new direction is A-conjugate to the previous ones.',
      'In exact arithmetic a quadratic in n variables converges in at most n steps.',
      'It avoids undoing earlier progress.',
      'It still uses gradients and matrix-vector products; it avoids storing a Hessian.',
      'Conjugacy is not the same as orthogonality of the search directions.'),
  },
  {
    id: 'q-t6-2', topicId: 't6', type: 'next', difficulty: 2,
    prompt: 'In Fletcher–Reeves CG, you have gₖ₋₁, gₖ and pₖ₋₁. What is the next search direction?',
    options: ['pₖ = −gₖ + βₖpₖ₋₁', 'pₖ = gₖ + βₖpₖ₋₁', 'pₖ = −gₖ − H⁻¹gₖ', 'pₖ = pₖ₋₁'],
    answerIndex: 0,
    hint: 'CG blends the current steepest-descent direction with the previous search direction.',
    solution: S('Combine the negative gradient with the previous direction using the conjugacy weight.',
      String.raw`p_k=-g_k+\beta_kp_{k-1},\quad \beta_k=\frac{g_k^{\top}g_k}{g_{k-1}^{\top}g_{k-1}}`,
      'βₖ is a ratio of squared gradient norms for Fletcher–Reeves.',
      'The sign of gₖ is negative in the update.',
      'pₖ = −gₖ + βₖpₖ₋₁.',
      'The positive β term reuses the previous direction without losing descent.',
      'Adding +gₖ points uphill.'),
  },
];

/* -------------------------------------------------------------------------- */
/* scenarios + flows                                                           */
/* -------------------------------------------------------------------------- */

export const SCENARIOS = {
  t1: [
    {
      heading: 'Scenario A · Overshooting',
      setup: 'You are running gradient descent on a smooth bowl-shaped objective. Your direction points downhill locally. After a large step, you land on the other side of the valley and the objective is higher.',
      prompt: 'What would you try first?',
      choices: [
        { id: 'a1', label: 'Reduce the step size', reveal: 'The direction describes what happens close to where you are. A large step can carry you past the low point and up the other side.', recommended: true },
        { id: 'a2', label: 'Reverse the direction', reveal: 'Reversing a downhill direction points uphill locally. The large move is the part to reconsider in this scenario.' },
        { id: 'a3', label: 'Take a larger step', reveal: 'A longer move can carry you farther up the other side of the valley. Try a shorter candidate step first.' },
      ],
      takeaway: 'The direction tells you where to go. Step size controls how far you go.',
    },
    {
      heading: 'Scenario B · A tiny decrease',
      setup: 'The next candidate step lowers the objective a little. It still fails the Armijo sufficient-decrease check.',
      prompt: 'Does any decrease pass Armijo?',
      choices: [
        { id: 'b1', label: 'Any decrease is enough.', reveal: 'Armijo asks whether the decrease is sufficient for this candidate step and local slope.' },
        { id: 'b2', label: 'The decrease must be sufficient.', reveal: 'Backtracking can shorten the candidate step and test it again.', recommended: true },
      ],
      takeaway: 'The direction tells you where to go. Step size controls how far you go. Armijo checks for sufficient decrease.',
    },
  ],
  t2: [{
    heading: 'Scenario · A far-away start',
    setup: 'You start Newton’s method on a non-convex objective far from the solution. The first step jumps to a completely different region and the objective increases.',
    prompt: 'What is the most reasonable next move?',
    choices: [
      { id: 'n1', label: 'Keep iterating; Newton always recovers', reveal: 'Newton is only locally convergent. A far-away start can leave the region where the quadratic model is trustworthy.' },
      { id: 'n2', label: 'Damp the step or switch to a line-search method first', reveal: 'A damped Newton step or a gradient-based method can bring you into the basin where the curvature model works. This is the safer move.', recommended: true },
    ],
    takeaway: 'Newton is fast near a solution and fragile far from one.',
  }],
  t3: [{
    heading: 'Scenario · Backtracking stops too early',
    setup: 'Your backtracking loop accepts the first candidate that lowers f(x), even if the decrease is tiny. The optimiser crawls.',
    prompt: 'Which check is missing?',
    choices: [
      { id: 'l1', label: 'A sufficient-decrease test', reveal: 'Armijo compares the actual decrease with c·α·slope. Without it, a micro-step can pass and the loop stalls.', recommended: true },
      { id: 'l2', label: 'A larger initial step', reveal: 'A larger candidate does not fix the acceptance rule; it may still accept a useless decrease.' },
    ],
    takeaway: 'Any decrease is not the same as enough decrease.',
  }],
  t4: [{
    heading: 'Scenario · The approximate Hessian',
    setup: 'You need Newton-like speed but forming and inverting the Hessian is too expensive. You implement BFGS, storing an n×n matrix.',
    prompt: 'What should the matrix contain?',
    choices: [
      { id: 'b1', label: 'An approximation to the inverse Hessian', reveal: 'The direction is dₖ = −Hₖ∇f. Storing H⁻¹ avoids a linear solve every iteration, and the secant update refines it.', recommended: true },
      { id: 'b2', label: 'The exact Hessian, updated cheaply', reveal: 'BFGS never needs the exact Hessian; it updates an inverse-curvature approximation from observed steps.' },
    ],
    takeaway: 'Quasi-Newton trades exact curvature for a cheap, updatable model.',
  }],
  t5: [{
    heading: 'Scenario · Dependent columns',
    setup: 'While running Gram–Schmidt, the remainder vₖ has zero norm because the new vector is a combination of earlier ones.',
    prompt: 'What does this tell you?',
    choices: [
      { id: 'g1', label: 'The vectors are linearly dependent', reveal: 'A zero orthogonal remainder means the new vector adds no new direction. A full orthonormal basis cannot include it.', recommended: true },
      { id: 'g2', label: 'You made an arithmetic error', reveal: 'Possibly, but zero remainder is the expected signal of linear dependence. Check the dependency before assuming a mistake.' },
    ],
    takeaway: 'Gram–Schmidt reveals dependence when a remainder collapses to zero.',
  }],
  t6: [{
    heading: 'Scenario · Zig-zagging',
    setup: 'Steepest descent zig-zags in a narrow valley. You switch to conjugate gradient.',
    prompt: 'Why does CG make more progress per step?',
    choices: [
      { id: 'c1', label: 'It uses conjugate directions that do not undo earlier progress', reveal: 'Each direction is A-conjugate to the previous ones, so progress along earlier directions is preserved.', recommended: true },
      { id: 'c2', label: 'It uses a larger fixed step size', reveal: 'CG can use a line search just like steepest descent. The gain comes from the direction, not a magic step size.' },
    ],
    takeaway: 'Conjugacy is about not revisiting the same curvature directions.',
  }],
};

export const FLOWS = {
  t1: ['Start at x₀', 'Compute ∇f(xₖ)', 'Choose step αₖ', 'xₖ₊₁ = xₖ − αₖ∇f', '‖∇f‖ < ε → stop'],
  t2: ['Start x₀', 'Compute ∇f and H', 'Solve H d = −∇f', 'xₖ₊₁ = xₖ + d', 'Repeat near the solution'],
  t3: ['Candidate α', 'Check Armijo', 'Decrease sufficient?', 'Accept the step', 'Else shrink α and retry'],
  t4: ['Start H₀ = I', 'dₖ = −Hₖ∇f', 'Line search', 'Observe sₖ, yₖ', 'Update H via BFGS'],
  t5: ['Take a₁', 'q₁ = a₁/‖a₁‖', 'Subtract projection', 'Normalise remainder', 'Repeat for each vector'],
  t6: ['p₀ = −g₀', 'Line search αₖ', 'xₖ₊₁ = xₖ + αₖpₖ', 'Compute βₖ', 'pₖ₊₁ = −gₖ₊₁ + βₖpₖ'],
};

export const DIAGRAM_EDGES = {
  t1: [[0, 1], [1, 2], [2, 3], [3, 4]],
  t2: [[0, 1], [1, 2], [2, 3], [3, 4]],
  t3: [[0, 1], [1, 2], [2, 3], [2, 4]],
  t4: [[0, 1], [1, 2], [2, 3], [3, 4]],
  t5: [[0, 1], [1, 2], [2, 3], [3, 4]],
  t6: [[0, 1], [1, 2], [2, 3], [3, 4]],
};

export { dateKey, isoOffset };
