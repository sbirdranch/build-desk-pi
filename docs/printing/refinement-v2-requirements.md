# WP-03 — Printing Refinements Requirements
Version: 0.1 (initial planning baseline)
Date: 2026-11-03
Project: Build Desk Pi — Refinement_v2
Status: User-agreed changes; documentation only, not implementation authorization.

## Intent
Preserve the existing Printing core workflow, tree/navigation, plate preparation, print-job lifecycle and inspection/results. Make three targeted improvements: eliminate redundant layout-review acknowledgement controls, replace overview progress bars with realistic mechanical gauges, and reduce vertical space and scrolling.

## PR-01 — Remove layout-review acknowledgements
- Remove checkboxes whose sole purpose is to have a user affirm that they reviewed a saved plate layout.
- Remove counters, completion tallies or progress displays used solely to track the number of layouts acknowledged/reviewed. No requirement to monitor reviewed-layout counts.
- A layout must still be reviewed as part of preparation before printing, but no checkbox attestation is needed.
- Review and simplify corresponding UI labels, persisted acknowledgement fields, dependencies and save/start gates associated **only** with this acknowledgement.
- Preserve substantive print-preparation checks: verified layout quantities, planned plate runs, saved source file revisions, unambiguous part associations, and other validated preparation data required to safely track production.
- Do not silently bypass a functional validation just because it currently shares a screen or flag with a redundant acknowledgement. Audit actual implementation before changing gates; identify any required replacement logic.
- Do not change existing print/inspection histories or accepted-unit calculations.

## PR-02 — Overview progress indicators as gauges
- Replace progress **bars** on the Printing overview with dial/radial analog instrument gauges.
- Visual direction: plausible old-equipment instruments, faded/worn faces, subtle aging, legible marks, real-looking needle and bezel. The effect should be restrained and photographic/industrial, not exaggerated or cartoon steampunk.
- Preserve present Build Desk theme, colors and overall layout language.
- Prefer reusable gauge presentation shared with WP-02 Purchasing where appropriate, while allowing correct gauge labels, units, scales and values specific to each module.
- Preserve the existing meaning/denominator of each overview progress metric; explicitly inventory and validate current computations before redesigning presentation.
- Accessible text/numeric values must remain readable, and the dial must not be the only way the metric is communicated.
- Avoid oversized gauges creating new scrolling on the overview.

## PR-03 — Compact layout and reduced scrolling
- Reduce excessive use of vertical space across the Printing module and avoid unnecessary horizontal scrolling.
- Specifically, on the overview Build Sections list, put **section name and files/parts detail on the same row**, rather than separate lines.
- Prefer horizontal alignment of related information, reduced redundant padding/gaps, dense but readable rows, and fewer tall stacked panels.
- Preserve existing responsive behavior, navigation, selection controls and touch usability; allow graceful wrapping on narrow screens rather than overflow.
- Avoid nested scrollbars if a compact content arrangement can remove them. Keep important actions easy to find.

## Dependencies
- WP-01 data-store redesign must not copy dead layout-review attestations into the new production schema unless required for historical preservation; actual printing preparation/inspection records must migrate intact.
- WP-02 and WP-03 should share a restrained instrument-gauge visual system if implementation supports it, but neither module should impose inappropriate metrics on the other.
- Work in Refinement_v2. All tests on disposable fixtures/copies; no changes to live Pi production data in planning.

## Initial acceptance tests
1. No redundant saved-layout review checkbox remains in Printing screens.
2. Review counts and progress based solely on acknowledgements are absent.
3. Valid print-preparation data can be reviewed, saved and used to start printing without a separate acknowledgement tick.
4. Existing functional validation still prevents invalid quantity, layout, file revision and part mapping from starting a tracked job.
5. Existing print/job/result history and accepted quantities are unchanged.
6. Printing overview progress metrics have the same meaning and numerical value as before, displayed in restrained dial gauges rather than progress bars.
7. All gauges remain legible as text and fit desktop overview without excess vertical growth.
8. Build Sections list displays section name and file/part count inline on normal desktop width.
9. Editing, navigation and responsive narrow-screen behavior work without clipping or unnecessary nested scrolling.
10. Automated tests and Pi 3 performance stay acceptable.

## Implementation investigation items
- Identify every acknowledgement checkbox and any backend/model validation or persistence coupled to them.
- Inventory existing Printing overview bar metrics and decide exact gauge count/sizing based on current UI.
- Review layout density in the actual deployed UI at common desktop viewport sizes before committing final CSS dimensions.
- Determine how to retain historical acknowledgement fields, if any, as inert legacy data without disrupting database migration.

## Out of scope
Changing print preparation/inspection lifecycle, printer telemetry, Bambu Studio workflows, inventory reconciliation, or other unrequested Printing behavior. Additional user refinements can be appended to this requirements file.
