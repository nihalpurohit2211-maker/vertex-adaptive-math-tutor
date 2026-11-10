# docs/ contents — screenshots for the README (plan 3)

Capture is blocked while the in-app Browser pane is hidden (screenshot returns
NATIVE_BROWSER_VIEWPORT_UNAVAILABLE). Open that pane once and the orchestrator
can auto-capture all four at http://localhost:8766 (1280 px desktop / 360 px
mobile), using the curated demo so they match exactly what judges see.
Otherwise take them manually from a normal browser at the same URL. Light
theme is the app's own palette.

| File | Screen | What must be visible |
|---|---|---|
| `setup.png` | Setup | "Try the demo" prominent (indigo primary), notes + syllabus fields below it, the three coverage-state preview chips. Hero shot for README top. |
| `map.png` | Coverage map | All six demo topics in fixture order with text-bearing chips: green "Explained" ×2, amber "Only mentioned" ×2, rose "No match found" ×2, one row with "View excerpt" open showing the Armijo line verbatim. |
| `lesson.png` | Gradient-descent lesson | "What would you do?" Scenario A with a choice selected (indigo) and its reveal panel + the bowl "Concept sketch" with Long jump / Shorter step paths; "Pinned for revision" state. |
| `sheet-print.png` | Revision sheet | Print preview (Ctrl+P) with all six demo cards pinned: one A4 page, black on white, title + cards only, no controls. |

Optional but recommended:

- `demo.gif` — the 60-second judge walkthrough from plan 3 §8: Try demo →
  Armijo excerpt → gradient-descent scenarios → pin → sheet → print preview.
- `mobile-360.png` — lesson at 360 px, proof of the no-horizontal-scroll test.

Do not commit screenshots that contain a real API key anywhere in frame
(settings modal should show the masked/empty state).
