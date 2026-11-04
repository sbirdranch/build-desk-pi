# Second Kitten 745 — source preparation

Source: `X:\3DModels\rc_Cat745instance2`, read through the documented NAS mount
on the Pi and the user's Windows account. Original designer files are read only.
The fresh instance ID is `kitten-745-instance2`; its displayed name is
`Kitten 745 — Truck 2`. It shares the physical `h2d-main` printer.

## Inputs and interpretation

The package contains STL models and designer parts/manual files, with no saved
3MF projects. The user clarified that AI prepared the original truck's 3MFs and
massaged its original import. The original preparation scripts are retained in
the sibling `print-production` directory as read-only inputs to this work.

All 101 selected 745/beadlock STL hashes match the original geometry catalog,
including all 98 inputs to the six original AI-prepared section drafts. Exclude
740 variants and standard-wheel alternatives. Reuse these six validated layouts
as templates, not the original truck's later edited files or tracking records.
Arrange the three wheel STLs in a fresh project using the established Bambu
Studio CLI export process. The cached flattened PETG filament preset was rejected
by Bambu with code -18; the established PLA geometry export succeeded, followed
by the original material-correction process. Final rigid projects use the wheel
project's full PETG palette/settings and extruder slot 4. Native reopen/export
verified the corrected projects. TPU retains its separate stock H2D profile.

`tools/prepare-kitten-instance.py` validates source/template identities, rewrites
source references for Truck 2, writes seven independent unsliced review drafts,
derives saved object membership, copies verified part display assets and generates
new plate GLBs. All 101 assembly requirements remain unknown: one saved STL
instance does not establish a required assembly quantity. No first-truck required
counts, accepted parts, installations, preparations, jobs or user notes are copied.

The 50 Purchasing definitions are transcribed from the actual designer lists;
see `config/designer/README.md`. Conflicting/unspecified quantities stay unknown.
On hand starts at zero; Ordered is unchecked; vendor, URL, date and notes are blank.
Existing shared vendor suggestions are names only, never shared inventory.

## Artifacts and offline validation

Ignored workspace `local-data/phase4/ready` contains `instance.json`, independent
models, asset catalog, 125 GLBs, image files, README and native validation results.
Seven native reopen/export checks verified object/plate membership, H2D printer,
process and material assignments. All 125 geometry assets and 250 image references
passed integrity checks. These checks do not qualify physical printing: review
orientation, supports, copies, assembly counts, spool/nozzle choices and slicing
in Bambu Studio before printing.

`X:\BambuProjects\RC_Cat745instance2` contains the seven review projects and
README. Creation refused an existing destination; every written 3MF matched its
prepared SHA-256. The original `RC_DumpTruck` directory is unchanged.

`tools/register-build-instance.py` writes only a new database copied with SQLite's
backup API. It enforces schema 3, foreign keys, new build identity and fresh state,
then compares every pre-existing application table before committing. Existing
part IDs deliberately overlap between the two trucks. Output overwrite, duplicate
build and missing-part foreign-key tests rejected the import; failed transactions
left the original build intact and no partial registration. The source database
remained byte-identical during offline validation.

`tools/verify-multiple-builds-http.py` is restricted to disposable loopback ports.
It exercises same-ID edits, per-build request keys, Purchasing isolation, shared
vendor suggestions, assets, preparation, printer exclusion, finish/cancel,
membership refresh and four PDF exports. Restart acceptance compares the complete
saved snapshots after restarting the isolated process.

## Production release procedure

Use the SSH identity, pinned host and service from `docs/raspberry-pi.md`.
Validate source, Windows tests/typecheck/build, Pi tests/typecheck/ARM64 build,
two-build HTTP workflows, restart persistence and reports before deployment.
Install the code-only gauge change with `tools/pi-code-release.py`; it retains
code/runtime archives and leaves the current database untouched.

Then `tools/pi-register-build.py --stage <accepted-stage> --execute` stops the
service, backs up the latest database and registry, registers Truck 2 into a new
database and compares all original/global table fingerprints. It installs a
separate `local-data/kitten-745-instance2/assets` tree, selects the new database
for both builds in one registry replacement and checks both live endpoints before
declaring success. Original models, assets and old database stay available.

For rollback, stop the service and preserve a consistent backup of the current
two-build database and registry first. Restore the saved registry only if neither
build has new revisions beyond the cutover baseline. Once either build has edits,
retain the latest database and reconcile/export those records before removing the
new build; never overwrite them with the older snapshot. Gauge-only code rollback
can keep the latest schema-3 database. The cutover helper automatically restores
the prior registry on startup failure only when no post-cutover edits exist.

The loader is deliberately deferred until the second truck is tested and reviewed.

## Designer orientation requirement — subsequent user clarification

The user requires the designer's print face to be preserved and explicitly
allows rotation within the bed plane and repositioning. An audit of
all seven Truck 2 drafts found 65 of 101 parts rotated around Z by Bambu's arrange
operation. No component/build transform tilts or flips a part. Comparing every
embedded geometry vertex against the hash-verified original STL, after translation
only, confirmed all 101 original geometry axes (maximum numerical difference
0.000054 mm). Thus the original print face is retained, but exact rotations and
positions are not. Source STLs and existing 3MFs were not modified by this audit.

The preparation helper permits translation and arbitrary Z-axis rotation, while
rejecting tilts/flips that change the designer's print face, scaling, mirroring
and nonfinite transforms. All seven existing drafts pass this clarified check;
they need no regeneration for orientation. Earlier fixed-rotation restrictions
are superseded by this explicit clarification. The source STL geometry must
retain its original axes before these placement transforms, as verified in this
audit. This check does not establish sliced or physical print readiness.
Local audit results are retained under `local-data/phase4` as
`orientation-transforms.json` and `orientation-geometry.json`.
