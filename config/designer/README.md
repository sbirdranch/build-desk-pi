# Kitten 745 designer definitions

`kitten-745-purchases.json` is a fresh transcription of the second truck's
`Screwlist.txt` and `What you need Kitten740745.txt`. The preparation tool checks
their source hashes before using these definitions. It imports 50 entries,
including optional items, with no stock, orders, vendor, dates or user notes.

- Excludes the 740 tire alternative; includes six 142 mm 745 tires.
- Combines the duplicated T8 lead screw into one entry.
- Leaves 3x8x4 and 5x11x4 bearing counts unknown: the designer lists disagree
  (16 versus 20, and 18 versus 19).
- Leaves quantities unknown for wire, LEDs, roof lights, radio equipment and
  adhesives where the designer does not supply a firm count.
- Fastener quantities come from the designer's shared 740/745 list; confirm
  against the 745 assembly manual before buying. Optional lighting and the
  recommended momentum reducer are identified in the requirement text.

This file contains design requirements only. Production Purchasing remains
build scoped in SQLite; its user-entered fields must never be replaced from
another truck's tracker.

## Kitten 980 Loader

`kitten-980-purchases.json` contains 59 standard hardware/electrical/hydraulic
requirements from the actual v1.2e screw and parts lists. Missing quantities
remain null, including M3x10. Approximate tubing/wire lengths are described rather
than converted to invented piece counts. The obsolete motor alternative is not
included; bearings and furniture bolts are not duplicated. Product links retain
the designer's destination without tracking parameters. The 26 custom metal
designs belong to fabricated build components, not this Purchasing file. See
`docs/builds/loader-import.md` for source hashes, preparation and classification.
