# Remove host Bambu launch — November 4, 2026

Deployed application source `84cb716` on `Refinement_v2` at 3:01 PM EST.

Removed Open in Bambu from file and plate views, the API launch branch, the
executable configuration/type, and the detached host process launcher. Unknown
actions now return HTTP 400 before accessing the build. Reload Print Details,
model previews and manual Bambu Studio printing remain available. The shared
model-read error helper remains necessary for refresh; its permissions guidance
now refers to the service account rather than a Windows desktop launcher.

Validation: Windows 54 tests passed plus one optional workbook test skipped;
TypeScript and optimized build passed. Pi 55/55 tests (including the real workbook
clone), TypeScript and ARM64 optimized build passed. On a disposable two-build
server, the retired launch request returned 400 for each build without changing
its snapshot. Reload Print Details succeeded on an isolated copy of Truck 2's
database/assets and preserved parts and jobs. The test server was stopped.

Browser verification after deployment found zero launch buttons on both the file
and plate pages, with Reload Print Details still present and usable. Screenshot:
ignored `local-data/remove-bambu-plate.png` in the refinement checkout.

Code-only deployment preserved every application table fingerprint. The same
two-build SQLite database and private registry remain selected; source STLs and
3MFs were not changed. Rollback directory:
`/home/preston/build-desk/local-data/releases/printing-before-20261104T200114Z`.
It retains the consistent pre-release database, code/runtime archives, release
metadata and fingerprints. Roll back code while retaining the latest database;
never replace newer tracking records with a stale backup. The unused launch field
was also removed from the deployed example registry; the live private registry
already contained no executable setting.

Off-Pi archive: `local-data/remove-bambu/rollback-files.tar`.
SHA-256: `1e4c9954ae7362d9ea07780991177a64f718c94089e1882851bda4a54d91939e`.

## Orientation clarification

The user's subsequent question prompted a separate read-only audit of all 101
parts in the seven generated Truck 2 drafts. Original STL geometry axes are
preserved (translation-aligned vertices agree within 0.000054 mm). All 202
component/build transforms are unit-scale rotations/translations, without tilts,
flips or reflections. However, Bambu's arrange operation changed positions and
rotated 65 part instances around Z. Exact designer rotations were therefore not
retained, although the original print faces were retained.

The user requires fixed designer rotations for future generation. The preparation
helper now rejects rotated/scaled/nonfinite template transforms before producing
output; all seven current arranged drafts fail that guard. Existing source and
project files were left intact. This blocks silent reuse, rather than claiming
the current drafts have been regenerated with fixed rotations. See the detailed
record in `docs/builds/second-truck-import.md`.
