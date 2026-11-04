# Kitten 980 Loader — independent third build

Source: `X:\3DModels\rc_kitten980WheeledLoader`, designer package v1.2e.
Build ID `kitten-980-loader`; name `Kitten 980 Loader`; common printer `h2d-main`.
The user explicitly selected **both buckets** and classified the custom metal
designs as fabricated components, not 3D-printed or Purchasing items.

## Prepared dataset

- 88 printable component types; seven independent PETG projects and 22 plates.
  Arms 2 plates, Cabin 3, Front Chassis 3, Rear Chassis 6, Wheels 1, Knife Bucket
  4 and Teeth Bucket 3. Required assembly quantities stay unconfirmed where the
  designer does not provide a component count; saved STL instances are not BOM
  quantities.
- 26 custom metal component types, totaling 48 pieces from the designer's Metal
  Plate overview. Both bucket sets are included. The 1/2/3 mm designs retain
  their original DXF, STEP and 123DX references. Their supplied STL equivalents
  provide browsing geometry only and are never placed in print projects.
- 59 Purchasing entries transcribed from the supplied screw/parts lists. The
  recommended JGB37-3530 drive motors are used, without the superseded JGB37-555
  alternative. Duplicate bearings/furniture bolts are combined. M3x10's missing
  quantity and other unspecified/approximate quantities remain unknown. Product
  links come from the designer's list, with tracking query strings removed; no
  stock, Ordered flags, dates or vendor selections are copied from another build.
- A separate three-model Window Templates project is an untracked cutting-guide
  resource. The root front-window STL is byte-identical to the one under Windows
  Template and is not counted twice. The snowblower adapter is a separate
  accessory package and is not a loader assembly component.
- Three locally cached references: the designer's overview render and two
  finished-loader photographs, with original bytes, source attribution and
  ungraded thumbnail/preview derivatives.

The reference source is [Burnie222rc's YouMagine model gallery](https://youmagine.com/designs/bf110583-024c-40dd-8cd9-e98e6cd40110).
That designer page also identifies pre-oriented STL inputs and minimum wall,
infill and shell requirements. The projects use H2D 0.4 mm, four walls, 40% gyroid,
1.2 mm top/bottom thickness and six shell layers at 0.2 mm. All objects use the
PETG slot in the established full H2D palette. Physical spools, supports,
orientations, output quantities and slicing still need review in Bambu Studio.

Files: `X:\BambuProjects\RC_Kitten980WheeledLoader`, beside `RC_Cat745instance2`.
It contains eight unsliced review projects (including the template resource),
README and a hash manifest. Creation refuses an existing destination and checks
every copied model's hash. Source designer files and both truck folders remain
unchanged. No physical printer execution is performed by these tools.

## Preparation and verification

`tools/export-loader-projects.py` uses the established Bambu Studio CLI geometry
export, PETG correction and native reopen/export validation. Bed-plane rotation
and placement are permitted; tilting/flipping the designer's print face is not.
`tools/verify-project-print-faces.py` compares hash-verified source STL vertices
against saved geometry before placement and checks every transform. All 88
vehicle meshes and three template meshes passed; maximum vertex differences
were 0.000059 mm and 0.000055 mm, respectively, within the 0.001 mm audit tolerance.

`tools/prepare-loader-data.py` derives fresh scoped parts, plate mappings,
fabricated design quantities and Purchasing definitions. It generates 114 part
models and 22 plate models, with 272 image references. Repeated bucket basenames
are resolved from full saved source paths; preview membership and tracked
membership must agree. Generic basename matches cannot select fabricated parts.

The public gallery serves WebP bytes even for URLs ending in `.jpg`. Originals
are saved with their actual format and served as `image/webp`; hashes match the
downloaded bytes. No color grading, replacement imagery or synthetic photos are
used. The overview shows the three references and credits the designer when a
photo opens.

## Fabricated parts and migration

Schema 4 adds the normalized `fabrication_parts` table. The legacy `print_parts`
table remains the component identity/requirements store; a fabrication row
explicitly distinguishes nonprinted components. Existing printed parts acquire
no extra metadata or changed counts. Fabricated completion comes from its own
completed quantity and method (`Unspecified`, `Hand made`, `Outsourced`), rather
than print results. Installation cannot exceed completed quantity. No print job
or Purchasing entry is created by fabrication updates.

The build tree includes components with no print-file membership. Fabricated
sections show their parts and fabrication context instead of empty plate gauges.
Part details expose fabrication method, completed quantity, requirement,
installation, material/thickness and design references; manual reprint controls
are absent. Vehicle Parts complete includes all physical component types, while
Plates complete continues to count print plates only. Broad styling is unchanged.

Domain checks and SQLite triggers reject fabricated part-to-plate associations
and print-result rows. `web/scripts/migrate-fabrication.ts` creates a new
consistent database copy, adds schema 4 and compares all 18 pre-existing tables
without changing their business rows. Only the new migration record and the
initially empty fabrication table are added. `tools/register-build-instance.py`
then adds the loader in a new copy and verifies existing-build/global records.

## Release and rollback

The acceptance stage uses cloned data on loopback 4178. Tests cover fabrication
and print separation, both bucket mappings, three-build printer exclusion,
selected-build Purchasing/reports, reference serving, browser save/reload and
process restart. Production is not modified by acceptance writes.

`tools/pi-loader-release.py` requires all acceptance gates before stopping the
service. It backs up the latest production database, code, registry, both
existing build directories, printer configuration and assets. It migrates that
latest snapshot, registers the loader, compares every existing business row,
installs a separate loader asset root, swaps code/registry and checks all live
build endpoints. Existing database and code trees are retained.

Rollback must pair the preserved schema-3 code and registry/database. Before
rolling back, stop the service and preserve the latest schema-4 database and
registry. Direct restoration of the old pair is allowed only before any build
has newer revisions than the cutover baseline. If new edits exist, keep the
schema-4 data and use compatible code or reconcile those edits before restoring
the older pair. The helper refuses automatic rollback over post-cutover edits.
