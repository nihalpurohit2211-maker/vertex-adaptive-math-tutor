// Vertex content pack — deterministic math data (topics, concepts, questions, revision sheet).
window.VERTEX_DATA = {
  topics: [
    { id: "linear-equations", name: "Linear Equations", tier: 1, status: "soon", blurb: "Solve, graph and rearrange first-degree equations." },
    { id: "quadratics", name: "Quadratics", tier: 1, status: "soon", blurb: "Factoring, the formula, and parabolas." },
    { id: "systems-of-equations", name: "Systems of Equations", tier: 1, status: "soon", blurb: "Two lines, many methods: substitution, elimination, graphs." },
    { id: "inequalities", name: "Inequalities", tier: 2, status: "soon", blurb: "Number-line solutions and sign charts." },
    { id: "logarithms", name: "Logarithms & Exponentials", tier: 2, status: "soon", blurb: "Laws of logs, growth and decay." },
    { id: "sequences-and-series", name: "Sequences & Series", tier: 2, status: "soon", blurb: "AP, GP and summation tricks." },
    { id: "complex-numbers", name: "Complex Numbers", tier: 3, status: "soon", blurb: "The imaginary plane, modulus-argument form." },
    { id: "trigonometry", name: "Trigonometry", tier: 1, status: "live", blurb: "Sine and cosine rules, the unit circle, ratios, radians, solving triangles." },
    { id: "limits", name: "Limits & Continuity", tier: 2, status: "soon", blurb: "Approaching values — the doorway to calculus." },
    { id: "derivatives", name: "Derivatives", tier: 2, status: "soon", blurb: "Rules of differentiation and tangent slopes." },
    { id: "integrals", name: "Integrals", tier: 2, status: "soon", blurb: "Antiderivatives and areas under curves." },
    { id: "differential-equations", name: "Differential Equations", tier: 3, status: "soon", blurb: "Separable equations and growth models." },
    { id: "vector-algebra", name: "Vector Algebra", tier: 2, status: "soon", blurb: "Components, magnitude, addition in the plane." },
    { id: "dot-cross-products", name: "Dot & Cross Products", tier: 2, status: "soon", blurb: "Angles, projections and areas from products." },
    { id: "3d-geometry", name: "3D Lines & Planes", tier: 3, status: "soon", blurb: "Vectors in space: intersections and distances." },
    { id: "coordinate-geometry", name: "Coordinate Geometry", tier: 1, status: "soon", blurb: "Straight lines, distances, midpoints." },
    { id: "circles", name: "Circles", tier: 1, status: "soon", blurb: "Standard form, tangents, chords." },
    { id: "mensuration", name: "Mensuration", tier: 2, status: "soon", blurb: "Areas, surface areas and volumes." },
    { id: "transformations", name: "Transformations", tier: 2, status: "soon", blurb: "Rotations, reflections, enlargements." },
    { id: "proofs-similarity", name: "Similarity & Proofs", tier: 3, status: "soon", blurb: "Triangle similarity and geometric reasoning." }
  ],

  concepts: [
    { id: "sine-cosine-rule", topicId: "trigonometry", name: "Sine & Cosine Rule", icon: "📐", summary: "Find missing sides and angles in ANY triangle, not just right ones." },
    { id: "unit-circle", topicId: "trigonometry", name: "Unit Circle", icon: "⭕", summary: "Sin and cos as coordinates on a circle of radius 1, plus sign by quadrant." },
    { id: "trig-ratios", topicId: "trigonometry", name: "Right-Triangle Ratios", icon: "📏", summary: "SOH-CAH-TOA: sine, cosine, tangent from opposite, adjacent, hypotenuse." },
    { id: "radians", topicId: "trigonometry", name: "Radians & Measure", icon: "🌀", summary: "Measuring angles in pi, and arc length with theta = s / r." },
    { id: "solve-triangles", topicId: "trigonometry", name: "Solving Triangles", icon: "🔺", summary: "Angle sums, real-world triangles, and the ambiguous SSA case." }
  ],

  questions: [
    {
      id: "scr-01", conceptId: "sine-cosine-rule", difficulty: 1,
      question: "Use the cosine rule to find side c of a triangle where a = 7, b = 3 and the included angle C = 60 degrees.",
      options: ["sqrt(58) (about 7.6)", "sqrt(37) (about 6.1)", "sqrt(79) (about 8.9)", "sqrt(21.6) (about 4.7)"],
      correct: 1,
      steps: [
        "Cosine rule: c^2 = a^2 + b^2 - 2ab*cos(C)",
        "Substitute: c^2 = 49 + 9 - 2*7*3*cos(60 degrees)",
        "cos(60 degrees) = 0.5, so c^2 = 58 - 42*0.5 = 58 - 21 = 37",
        "c = sqrt(37) (about 6.1)"
      ],
      eli5: "Two sides and the angle between them lock the third side. Square the sides, subtract twice their product times cos of the angle, then take the square root.",
      hint: "The angle is 60 degrees, and cos(60 degrees) is exactly 0.5 — the cross term 2ab*cos(C) becomes just ab.",
      commonMistake: "Writing + 2ab*cos(C) instead of - 2ab*cos(C), which gives 58 + 21 = 79.",
      diagram: `<svg viewBox="0 0 220 175" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="triangle with sides a=7, b=3 and included angle C=60 degrees"><path d="M 100 25 L 35 140 L 185 140 Z" fill="none" stroke="#E6E6E6" stroke-width="2"/><path d="M 88 46 Q 100 56 113 45" fill="none" stroke="#FF7A1A" stroke-width="2"/><circle cx="100" cy="25" r="2.5" fill="#E6E6E6"/><circle cx="35" cy="140" r="2.5" fill="#E6E6E6"/><circle cx="185" cy="140" r="2.5" fill="#E6E6E6"/><text x="100" y="16" fill="#E6E6E6" font-size="13" font-family="sans-serif" text-anchor="middle">C</text><text x="100" y="68" fill="#FF7A1A" font-size="11" font-family="sans-serif" text-anchor="middle">60°</text><text x="172" y="88" fill="#E6E6E6" font-size="13" font-family="sans-serif" text-anchor="middle">a = 7</text><text x="30" y="88" fill="#E6E6E6" font-size="13" font-family="sans-serif" text-anchor="middle">b = 3</text><text x="110" y="162" fill="#E6E6E6" font-size="13" font-family="sans-serif" text-anchor="middle">c = ?</text></svg>`
    },
    {
      id: "scr-02", conceptId: "sine-cosine-rule", difficulty: 1,
      question: "Using the cosine rule, find angle B in a triangle with sides a = 5, b = 7, c = 8.",
      options: ["30 degrees", "120 degrees", "60 degrees", "45 degrees"],
      correct: 2,
      steps: [
        "Angle form: cos(B) = (a^2 + c^2 - b^2) / (2ac)",
        "Substitute: cos(B) = (25 + 64 - 49) / (2*5*8)",
        "cos(B) = 40/80 = 0.5",
        "B = 60 degrees"
      ],
      eli5: "To get an angle from three sides, put the squared sides over 2ac. Here the top comes to exactly half of the bottom, and cos = 0.5 means 60 degrees.",
      hint: "b = 7 is the middle-sized side, so the answer is a middling angle — compute cos(B) and match it to a familiar table value.",
      commonMistake: "Getting cos(B) = 0.5 but answering 120 degrees, which is where cos = -0.5."
    },
    {
      id: "scr-03", conceptId: "sine-cosine-rule", difficulty: 1,
      question: "In a triangle, A = 90 degrees, a = 10, B = 30 degrees. Use the sine rule to find side b.",
      options: ["10", "20", "5", "about 8.7"],
      correct: 2,
      steps: [
        "Sine rule: b = a*sin(B)/sin(A)",
        "Substitute: b = 10*sin(30 degrees)/sin(90 degrees)",
        "sin(30 degrees) = 0.5 and sin(90 degrees) = 1",
        "b = 10*0.5/1 = 5"
      ],
      eli5: "Match each side with the sine of the angle opposite it. Side 10 sits opposite 90 degrees (sine 1), so side b is 10 times the sine of 30 degrees, which is just half of 10.",
      hint: "Divide the known side by the sine of its opposite angle, then multiply by the sine of the angle you want the side for.",
      commonMistake: "Flipping the ratio and computing 10*sin(90 degrees)/sin(30 degrees) = 20."
    },
    {
      id: "scr-04", conceptId: "sine-cosine-rule", difficulty: 1,
      question: "Use the sine rule to find angle B when a = 8, A = 90 degrees and b = 4.",
      options: ["150 degrees", "30 degrees", "60 degrees", "45 degrees"],
      correct: 1,
      steps: [
        "Sine rule: sin(B) = b*sin(A)/a",
        "sin(B) = 4*sin(90 degrees)/8 = 4/8 = 0.5",
        "sin(B) = 0.5 gives B = 30 or 150 degrees",
        "A is already 90 degrees, so B must be under 90 degrees: B = 30 degrees"
      ],
      eli5: "The sine of the angle is opposite-over-the-hypotenuse-like ratio 4/8 = 0.5, and the angle with sine 0.5 that fits next to a right angle is 30 degrees.",
      hint: "One angle is already 90 degrees — the other two must share the remaining 90 degrees, so B is acute.",
      commonMistake: "Picking the second sine-rule solution 150 degrees, which is impossible because 150 + 90 exceeds 180 degrees."
    },
    {
      id: "scr-05", conceptId: "sine-cosine-rule", difficulty: 2,
      question: "Use the cosine rule to find the largest angle of a triangle whose sides are 3, 5 and 7.",
      options: ["90 degrees", "60 degrees", "150 degrees", "120 degrees"],
      correct: 3,
      steps: [
        "The largest angle lies opposite the largest side (7)",
        "cos(A) = (3^2 + 5^2 - 7^2)/(2*3*5) = (9 + 25 - 49)/30",
        "cos(A) = -15/30 = -0.5",
        "A = 120 degrees (cos is negative for obtuse angles)"
      ],
      eli5: "Biggest angle sits across the biggest side. Plugging 3, 5, 7 in gives cos = -0.5, and a negative cosine means the angle is past 90 degrees — exactly 120.",
      hint: "A negative cosine means an obtuse angle; find the acute angle with cos = 0.5 and subtract it from 180 degrees.",
      commonMistake: "Reporting 60 degrees from |cos| = 0.5 and forgetting the minus sign means 120 degrees."
    },

    {
      id: "uc-01", conceptId: "unit-circle", difficulty: 1,
      question: "From the unit circle, what is sin(30 degrees)?",
      options: ["sqrt(3)/2", "1/2", "sqrt(2)/2", "1"],
      correct: 1,
      steps: [
        "On the unit circle, sin is the y-coordinate of the point at the angle",
        "At 30 degrees the point is (sqrt(3)/2, 1/2)",
        "So sin(30 degrees) = 1/2"
      ],
      eli5: "Walk 30 degrees around a circle of radius 1 and measure how high you are off the ground: exactly half the radius.",
      hint: "30 degrees is the short climb — the height is the smaller of the two famous values 1/2 and sqrt(3)/2.",
      commonMistake: "Reading the x-coordinate sqrt(3)/2, which is cos(30 degrees), not sin.",
      diagram: `<svg viewBox="0 0 220 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="unit circle with a 30 degree angle marked"><line x1="20" y1="110" x2="200" y2="110" stroke="#8A8A8A" stroke-width="1.5"/><line x1="110" y1="20" x2="110" y2="200" stroke="#8A8A8A" stroke-width="1.5"/><circle cx="110" cy="110" r="80" fill="none" stroke="#E6E6E6" stroke-width="2"/><line x1="110" y1="110" x2="179.3" y2="70" stroke="#FF7A1A" stroke-width="2"/><line x1="179.3" y1="70" x2="179.3" y2="110" stroke="#FF7A1A" stroke-width="1.5" stroke-dasharray="4 3"/><path d="M 140 110 Q 141 98 137 94" fill="none" stroke="#FF7A1A" stroke-width="2"/><circle cx="179.3" cy="70" r="3" fill="#FF7A1A"/><text x="150" y="105" fill="#FF7A1A" font-size="13" font-family="sans-serif">30 deg</text><text x="188" y="93" fill="#E6E6E6" font-size="12" font-family="sans-serif">sin = 1/2</text><text x="118" y="122" fill="#8A8A8A" font-size="12" font-family="sans-serif">1</text></svg>`
    },
    {
      id: "uc-02", conceptId: "unit-circle", difficulty: 1,
      question: "On the unit circle, what is cos(0 degrees)?",
      options: ["1", "-1", "0", "1/2"],
      correct: 0,
      steps: [
        "On the unit circle, cos is the x-coordinate",
        "At 0 degrees the point is (1, 0)",
        "So cos(0 degrees) = 1"
      ],
      eli5: "Before you climb at all, you are as far right on the circle as possible, at x = 1.",
      hint: "The point at angle 0 is the rightmost point of the circle — what is its x-coordinate?",
      commonMistake: "Confusing cos with sin: the y-coordinate at 0 degrees is 0, but the x-coordinate is 1."
    },
    {
      id: "uc-03", conceptId: "unit-circle", difficulty: 2,
      question: "In which quadrant is sin(theta) > 0 and cos(theta) < 0?",
      options: ["Quadrant I", "Quadrant II", "Quadrant III", "Quadrant IV"],
      correct: 1,
      steps: [
        "sin is the y-coordinate: positive above the x-axis (Quadrants I and II)",
        "cos is the x-coordinate: negative left of the y-axis (Quadrants II and III)",
        "Both conditions hold only in Quadrant II"
      ],
      eli5: "You must be up high (positive sine) but on the left side (negative cosine) — that is the upper-left quarter of the circle.",
      hint: "Sign of sine follows up/down, sign of cosine follows left/right — find the quarter that is up AND left.",
      commonMistake: "Choosing Quadrant III, where sine is actually negative (both coordinates are below/left)."
    },
    {
      id: "uc-04", conceptId: "unit-circle", difficulty: 3,
      question: "If sin(theta) = 3/5 and theta lies in Quadrant II, what is cos(theta)?",
      options: ["4/5", "-3/5", "-4/5", "-5/4"],
      correct: 2,
      steps: [
        "Identity: cos^2 = 1 - sin^2 = 1 - 9/25 = 16/25",
        "So cos = 4/5 or -4/5",
        "In Quadrant II cosine is negative",
        "cos(theta) = -4/5"
      ],
      eli5: "The point is on the unit circle 3/5 of the way up, so it is 4/5 of the way across — but Quadrant II is the LEFT-up quarter, so the x-value is negative: -4/5.",
      hint: "Use sin^2 + cos^2 = 1 first, then decide the sign from the quadrant, not from the arithmetic.",
      commonMistake: "Answering +4/5: taking the positive square root and ignoring the Quadrant II sign rule."
    },

    {
      id: "tr-01", conceptId: "trig-ratios", difficulty: 1,
      question: "In a right triangle, an acute angle theta has opposite side 3 and hypotenuse 5. What is sin(theta)?",
      options: ["3/4", "4/5", "3/5", "4/3"],
      correct: 2,
      steps: [
        "SOH: sin = opposite/hypotenuse",
        "sin(theta) = 3/5"
      ],
      eli5: "Sine is the side facing the angle over the longest side. That is 3 over 5.",
      hint: "The hypotenuse always goes on the bottom for sine — it is the longest side, 5.",
      commonMistake: "Using opposite/adjacent (that is tangent): the adjacent side here is 4, not 5.",
      diagram: `<svg viewBox="0 0 220 170" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="right triangle with opposite 3, adjacent 4, hypotenuse 5"><path d="M 50 140 L 180 140 L 50 40 Z" fill="none" stroke="#E6E6E6" stroke-width="2"/><path d="M 50 126 L 64 126 L 64 140" fill="none" stroke="#E6E6E6" stroke-width="1.5"/><path d="M 152 140 Q 148 128 158 123" fill="none" stroke="#FF7A1A" stroke-width="2"/><text x="140" y="133" fill="#FF7A1A" font-size="13" font-family="sans-serif">theta</text><text x="30" y="90" fill="#E6E6E6" font-size="12" font-family="sans-serif" text-anchor="end">opp = 3</text><text x="115" y="160" fill="#E6E6E6" font-size="12" font-family="sans-serif" text-anchor="middle">adj = 4</text><text x="128" y="78" fill="#E6E6E6" font-size="12" font-family="sans-serif" text-anchor="start">hyp = 5</text></svg>`
    },
    {
      id: "tr-02", conceptId: "trig-ratios", difficulty: 1,
      question: "In a right triangle, angle theta has adjacent side 8 and hypotenuse 10. What is cos(theta)?",
      options: ["4/5", "3/5", "3/4", "5/4"],
      correct: 0,
      steps: [
        "CAH: cos = adjacent/hypotenuse",
        "cos(theta) = 8/10",
        "Simplify: cos(theta) = 4/5"
      ],
      eli5: "Cosine is the side touching the angle (not the long slant) over the slant: 8 over 10, which reduces to 4/5.",
      hint: "The third side is 6 (a 6-8-10 right triangle) — but cosine only needs the adjacent side and the hypotenuse.",
      commonMistake: "Reporting opposite/hypotenuse = 6/10 = 3/5, which is the sine."
    },
    {
      id: "tr-03", conceptId: "trig-ratios", difficulty: 1,
      question: "tan(theta) = 1 and theta is an acute angle. What is theta?",
      options: ["30 degrees", "45 degrees", "60 degrees", "90 degrees"],
      correct: 1,
      steps: [
        "tan = opposite/adjacent, so opposite = adjacent",
        "An isosceles right triangle has two equal acute angles",
        "45 + 45 + 90 = 180, so theta = 45 degrees"
      ],
      eli5: "Tangent 1 means the two legs are the same length, so the triangle is a symmetric corner — 45 degrees.",
      hint: "Tangent equals 1 exactly when sine and cosine are equal — which happens halfway up the first quarter turn.",
      commonMistake: "Answering 90 degrees, where tan is undefined (cos would be 0, so tan = sin/0)."
    },
    {
      id: "tr-04", conceptId: "trig-ratios", difficulty: 2,
      question: "A right triangle has hypotenuse 10 and one acute angle of 30 degrees. What is the length of the side opposite the 30-degree angle?",
      options: ["about 5.8", "5", "about 8.7", "about 11.5"],
      correct: 1,
      steps: [
        "opposite = hypotenuse*sin(30 degrees)",
        "sin(30 degrees) = 0.5",
        "opposite = 10*0.5 = 5"
      ],
      eli5: "In a 30-degree right triangle the side facing the pointy corner is always half the slant side. Half of 10 is 5.",
      hint: "Multiply the hypotenuse by the sine of the angle — and sin(30 degrees) is the simple 1/2.",
      commonMistake: "Using cos(30 degrees) and getting about 8.7, which is the longer leg, opposite the 60-degree angle."
    },
    {
      id: "tr-05", conceptId: "trig-ratios", difficulty: 2,
      question: "If sin(theta) = 5/13 and theta is acute, what is tan(theta)?",
      options: ["12/13", "5/13", "12/5", "5/12"],
      correct: 3,
      steps: [
        "Opposite = 5, hypotenuse = 13, so adjacent = sqrt(13^2 - 5^2) = sqrt(144) = 12",
        "tan = opposite/adjacent",
        "tan(theta) = 5/12"
      ],
      eli5: "5-12-13 is a famous right triangle. Sine says the far side is 5 of 13, so the floor side is 12, and tangent is far-over-floor: 5/12.",
      hint: "Recover the missing leg with Pythagoras first — 13^2 - 5^2 is a perfect square.",
      commonMistake: "Answering 12/5: tangent is opposite/adjacent, so the leg pair must stay in the SOH-CAH order."
    },

    {
      id: "rad-01", conceptId: "radians", difficulty: 1,
      question: "How many radians is a half turn, that is 180 degrees?",
      options: ["pi/2", "pi", "2pi", "pi/3"],
      correct: 1,
      steps: [
        "A full turn is 2pi radians = 360 degrees",
        "Half of that: 180 degrees = pi radians"
      ],
      eli5: "The whole circle is 2 pi radians, so half a circle is just pi — about 3.14.",
      hint: "Degrees to radians: multiply by pi/180. So 180 * (pi/180) cancels neatly.",
      commonMistake: "Saying 2pi, which is the FULL turn (360 degrees), not the half turn."
    },
    {
      id: "rad-02", conceptId: "radians", difficulty: 1,
      question: "Convert 90 degrees to radians.",
      options: ["pi/4", "pi/3", "pi/2", "pi"],
      correct: 2,
      steps: [
        "Multiply by pi/180: 90*(pi/180)",
        "90/180 = 1/2",
        "So 90 degrees = pi/2 radians"
      ],
      eli5: "A quarter turn is a quarter of 2 pi, which is pi/2.",
      hint: "90 is half of 180, and 180 degrees is pi radians — so you want half of pi.",
      commonMistake: "Confusing 90 degrees with 45 degrees and writing pi/4."
    },
    {
      id: "rad-03", conceptId: "radians", difficulty: 2,
      question: "Convert 150 degrees to radians.",
      options: ["5pi/6", "3pi/4", "2pi/3", "5pi/3"],
      correct: 0,
      steps: [
        "Multiply by pi/180: 150*(pi/180) = 150pi/180",
        "Divide top and bottom by 30",
        "150/180 = 5/6, so 150 degrees = 5pi/6 radians"
      ],
      eli5: "Take 150 pi over 180 and shrink the fraction by 30: it becomes 5 pi sixths.",
      hint: "150 = 180 - 30, so the answer is pi minus pi/6.",
      commonMistake: "Dividing by 10 instead of using pi/180 and writing 3pi/4, which is really 135 degrees."
    },
    {
      id: "rad-04", conceptId: "radians", difficulty: 3,
      question: "A circle has radius 4. A central angle subtends an arc of length 10. Find the angle in radians.",
      options: ["0.4 rad", "2.5 rad", "40 rad", "20 rad"],
      correct: 1,
      steps: [
        "Arc formula: s = r*theta, so theta = s/r",
        "theta = 10/4",
        "theta = 2.5 radians"
      ],
      eli5: "A radian is the angle that eats an arc as long as the radius. Here the arc (10) is 2.5 radii long, so the angle is 2.5 radians.",
      hint: "Radians come out of arc DIVIDED by radius — check that the answer is arc-length over radius, not the reverse.",
      commonMistake: "Computing r/s = 0.4 (or multiplying to get 40) instead of s/r."
    },

    {
      id: "st-01", conceptId: "solve-triangles", difficulty: 1,
      question: "Two angles of a triangle are 50 degrees and 60 degrees. What is the third angle?",
      options: ["70 degrees", "110 degrees", "80 degrees", "60 degrees"],
      correct: 0,
      steps: [
        "Angles of a triangle sum to 180 degrees",
        "50 + 60 = 110",
        "Third angle = 180 - 110 = 70 degrees"
      ],
      eli5: "A triangle's corners always share 180 degrees. Two of them took 110, leaving 70 for the last.",
      hint: "Add the two given angles, then subtract the total from 180.",
      commonMistake: "Stopping at the sum 110 degrees instead of subtracting it from 180."
    },
    {
      id: "st-02", conceptId: "solve-triangles", difficulty: 1,
      question: "In a right triangle, one acute angle is 35 degrees. What is the other acute angle?",
      options: ["55 degrees", "145 degrees", "45 degrees", "35 degrees"],
      correct: 0,
      steps: [
        "The right angle uses 90 of the 180 degrees",
        "The two acute angles must sum to 90 degrees",
        "Other angle = 90 - 35 = 55 degrees"
      ],
      eli5: "Once a triangle has a square corner, the two pointy corners share the leftover 90 — so the partner of 35 is 55.",
      hint: "In a right triangle the two acute angles are complementary: they add to 90 degrees.",
      commonMistake: "Subtracting 35 from 180 only (getting 145) and forgetting the 90-degree angle."
    },
    {
      id: "st-03", conceptId: "solve-triangles", difficulty: 2,
      question: "A 6 m ladder leans against a wall and makes an angle of 50 degrees with the horizontal floor. How high up the wall does it reach? (sin 50 degrees is about 0.766)",
      options: ["about 3.9 m", "about 4.6 m", "about 7.1 m", "about 7.8 m"],
      correct: 1,
      steps: [
        "Wall height is opposite the 50-degree angle; the ladder is the hypotenuse",
        "height = 6*sin(50 degrees)",
        "height = 6*0.766 = about 4.6 m"
      ],
      eli5: "The ladder slants up from the floor. The height it reaches is the ladder length times the sine of the floor angle: 6 times 0.766, about 4.6 m.",
      hint: "Which side faces the 50-degree angle — the wall or the floor? Sine links the facing side to the slant.",
      commonMistake: "Using cos(50 degrees) = 0.643 and finding the floor distance (about 3.9 m) instead of the wall height."
    },
    {
      id: "st-04", conceptId: "solve-triangles", difficulty: 3,
      question: "A triangle has a = 8, b = 5 and angle A = 40 degrees (SSA data: A is opposite side a). How many distinct triangles satisfy this?",
      options: ["Exactly two triangles", "No triangle is possible", "Exactly one triangle", "The data is not enough to decide"],
      correct: 2,
      steps: [
        "Sine rule: sin(B) = b*sin(A)/a = 5*sin(40 degrees)/8",
        "sin(B) = about 0.402, so B is about 23.7 or about 156.3 degrees",
        "But 156.3 + 40 = 196.3 exceeds 180, so the obtuse option is impossible",
        "Exactly one triangle (also: side a = 8 is already at least as long as b = 5)"
      ],
      eli5: "Two angles can share the same sine, but here the second choice would blow the triangle past 180 degrees — and since the side facing the given angle is the LONGER given side, there is only one shape.",
      hint: "Check the second sine-rule angle against the 180-degree budget — and remember SSA has one solution when the opposite side is at least the other given side.",
      commonMistake: "Always assuming SSA gives two triangles and answering 'exactly two' without testing the obtuse second angle."
    }
  ],

  sheet: {
    trigonometry: {
      formulas: [
        "sin^2(x) + cos^2(x) = 1",
        "tan(x) = sin(x)/cos(x)",
        "Cosine rule (side): a^2 = b^2 + c^2 - 2bc*cos(A)",
        "Cosine rule (angle): cos(A) = (b^2 + c^2 - a^2)/(2bc)",
        "Sine rule: a/sin(A) = b/sin(B) = c/sin(C)",
        "SOH: sin(theta) = opposite/hypotenuse",
        "CAH: cos(theta) = adjacent/hypotenuse",
        "TOA: tan(theta) = opposite/adjacent",
        "180 degrees = pi radians; degrees to radians: multiply by pi/180",
        "Arc length: s = r*theta (theta in radians); triangle area = (1/2)*a*b*sin(C)"
      ],
      rules: [
        "The interior angles of a triangle always sum to 180 degrees.",
        "Use the cosine rule for SAS (two sides and the included angle) or SSS (three sides); use the sine rule only when you have a known side-angle-opposite-angle pair.",
        "Match sides with OPPOSITE angles in the sine rule — the angle between two sides is not an opposite pair.",
        "In the SSA ambiguous case, if the side opposite the given angle is at least as long as the other given side, only one triangle exists.",
        "Signs by quadrant: all positive in I, sine positive in II, tangent positive in III, cosine positive in IV."
      ],
      commonMistakes: [
        "Dropping the minus sign in the cosine rule and writing a^2 = b^2 + c^2 + 2bc*cos(A).",
        "Using the included angle where the sine rule needs the angle OPPOSITE a known side.",
        "Mixing degrees and radians: computing cos(60) in radian mode, or forgetting to convert 150 degrees before using a formula.",
        "Reading the x-coordinate as sine and the y-coordinate as cosine on the unit circle — they are swapped."
      ],
      workedExample: {
        question: "Find side a using the cosine rule when b = 5, c = 8 and the included angle A = 60 degrees.",
        solution: [
          "Write the rule: a^2 = b^2 + c^2 - 2bc*cos(A)",
          "Substitute: a^2 = 5^2 + 8^2 - 2*5*8*cos(60 degrees)",
          "cos(60 degrees) = 0.5, so a^2 = 25 + 64 - 80*0.5 = 89 - 40 = 49",
          "a = sqrt(49) = 7"
        ]
      }
    }
  }
};
