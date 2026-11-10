# docs/ contents — screenshots the HUMAN must add at G4 (23:05–23:15)

These are the exact file names README.md references. Take them from the live
Pages URL at 1280 px (and the mobile one at 360 px), light theme = the app's
own dark theme, no fake data — use the demo notebook so it matches what
judges see.

| File | Screen | What must be visible |
|---|---|---|
| `setup.png` | 1 SETUP | "Try the demo notebook" button, notes paste box, syllabus box, hours field, model chip "BharatCode · qwen-3.8-27b". Hero shot for README top. |
| `map.png` | 2 MAP + PLAN | All six demo topics with the coverage chips: two green "Covered", two amber "Thin", "Not in your notes" on Gram–Schmidt / Conjugate gradient; minutes column and rating buttons; the "⚠ builds on Newton" prereq warning on BFGS. |
| `lesson.png` | 3 LESSON | Quasi-Newton (BFGS) card open: "Computed in your browser ✓" badge, trace table with real numbers, "Your notes"/"Added by Vertex" tags, "Your notes don't explain…" list. |
| `sheet-print.png` | 4 YOUR SHEET | Browser print preview (Ctrl+P) of the gap sheet: one A4 page, black on white, ≤6 topics. |

Optional but recommended:

- `demo.gif` (or `.webm`) — the 90-second judge script from plan §8: open live
  URL → Try demo → map → Quasi-Newton lesson with computed table → sheet →
  print preview → Settings shows "paste your free BharatCode key". If added,
  put `![90-second demo](docs/demo.gif)` directly under the hero image in
  README.md.
- `mobile-360.png` — map screen at 360 px, proof of the no-horizontal-scroll
  smoke test.

Do not commit screenshots that contain a real API key anywhere in frame
(settings modal should show the masked/empty state).
