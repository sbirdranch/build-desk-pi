# Print preview regression investigation — 2026-11-15

## Scope and preserved state

Worked in `build-desk-refinement`, branch `main`, HEAD `59da9e4`, one commit ahead of the locally recorded `origin/main`. The checkout was initially clean. No fetch, reset, stash, commit, push or deployment was performed. The older `build-desk` checkout's existing modified and untracked files were left untouched, as was the `build-desk-pi` checkout.

## Finding

Thumbnails use ordinary `<img>` elements. Part and plate detail previews now use `ModelPreview` with `interactiveOnly`, which attempts a GLB model through Three.js/WebGL. Both use the same encoded `/api/assets/<build>/<relative path>` endpoint; the model URL additionally carries a source hash for cache invalidation. Full-size still previews remain in the catalog but the `!interactiveOnly` rendering condition prevented their display when a model was missing or loading failed.

History identifies `9bcac34` (2026-10-26) as the part-preview change that introduced this suppression and `443ec54` (2026-10-26) as the change that applied automatic 3D to plates. The unpushed Assembly commit does not change the media component; its CSS additions are scoped to Assembly.

Read-only checks against the Pi returned HTTP 200 for sampled thumbnails and GLBs. Edge with WebGL enabled successfully rendered Cabin P01, Cab Interior and Cabin P02. A separate local browser harness bundled the current local Media component, with real assets served through a read-only proxy. With WebGL disabled, the original component reproduced the blank detail panel: “Preview not available”, “3D preview unavailable”, and zero image elements. This is a confirmed fallback regression. The particular reason 3D fails in the user's affected browser has not been established; healthy WebGL browsers rendered successfully during investigation. No general asset-server failure was observed.

## Fix

- Retain automatic 3D, but use the catalog's full-size `preview` image when the model is absent or 3D fails.
- Explain the fallback in the viewer and disable Reset while only the image is displayed.
- Dispose failed renderer resources and reinitialize when asset identity, model or source hash changes.
- Update the regression test that previously required missing models to show no image; also cover assets with neither representation.

No asset paths, registry, production data, deployment configuration or tracking state were changed.

## Verification

- Browser reproduction before fix: WebGL disabled produced zero image elements.
- Browser verification after fix: WebGL disabled displayed a decoded full-size still image.
- Browser verification with WebGL enabled: valid model loaded; a forced model 404 displayed the still image; navigating back to a valid model recovered 3D; absent model displayed the still image; enlarged Photo dialog displayed a decoded image.
- `npm test` in `web`: 62 passed, 1 existing optional real-workbook test skipped, 0 failures.
- `npm run typecheck` in `web`: passed.
- `git diff --check`: passed.

The local browser reproduction script and screenshots are retained under ignored `local-data/assembly-qa/` (`print-browser.cjs`, `normal.png`, `no-webgl.png`). The script bundles the local component and reads assets from the Pi; it does not write to the Pi. Run it from the repository root with `node local-data/assembly-qa/print-browser.cjs --no-webgl --verify-fallback` and `node local-data/assembly-qa/print-browser.cjs --verify`. It uses the installed desktop runtime's Playwright and Edge.

- Production build: `npm run build` in `web` passed.
