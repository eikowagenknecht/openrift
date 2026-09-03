---
status: accepted
date: 2026-09-03
---

# ADR-044: Overnumbered as a Printing Flag

## Context and Problem Statement

`printings.art_variant` is a single `text NOT NULL` column with an FK to the `art_variants` reference table, holding one of `normal`, `altart`, `overnumbered`, `ultimate`. Riot now prints cards that are overnumbered _and_ alt art (OGN-303a of 298), which one column cannot express. The exclusivity was already lossy before that: `UNL-238` of 219 is an Ultimate whose number also runs past the set total, and only the `ultimate` half survives. How do we record overnumbering without giving up the art variant?

## Decision Drivers

- Overnumbering is a statement about the collector number against the set's printed total. It says nothing about which illustration a printing carries, so it does not belong in an enum whose other members name the artwork.
- `printings.is_signed` is the same shape of fact for the same reason and already sits beside `art_variant` as a boolean.
- The filter UI must keep presenting overnumbering next to Art Variant. Users reach for it as a version of the card, wherever it lives in the schema.
- Roughly 850 call sites read `artVariant` as a scalar. Anything that turns it into a set breaks all of them.

## Considered Options

1. **Multi-valued art variant**: `art_variant_slugs text[]` mirroring the `printing_markers` / `marker_slugs` pattern.
2. **Derive it**: compute overnumbering from the collector number and `sets.printed_total`, storing nothing.
3. **`printings.is_overnumbered boolean`**, beside `is_signed`, with `art_variant` narrowed to `normal` / `altart` / `ultimate`.

## Decision Outcome

Chosen option: **`is_overnumbered` as a boolean (option 3)**, because it puts the fact where it belongs, keeps every scalar `artVariant` read working, and reuses the `is_signed` groove the filter stack already supports end to end.

Option 1 keeps one reference table and one filter facet, but it encodes overnumbering as a kind of artwork, which is the original mistake, and it converts every scalar comparison into an array operation across the catalog's hottest read paths. Option 2 is attractive because the number already implies the answer, but it cannot be expressed as a generated column: `printed_total` lives on `sets`, PostgreSQL generated columns cannot reach another table, `printed_total` is nullable, and rune codes (`SFD-R01b`) never carry a total at all. A stored flag also stays correctable by hand, which a solo-maintained catalogue needs.

### Consequences

- Good, because an Ultimate now records that it is overnumbered as well, which the enum could never hold.
- Good, because `isStandardPrinting` gains an explicit overnumbered rejection instead of inheriting one from the art-variant check.
- Bad, because the scan pipeline's art identity key was `setSlug|name|artVariant` and would have collapsed an overnumbered printing onto the in-total print of the same card. Overnumbered printings carry their own illustration, so the key gains a segment for the flag.
- Bad, because the export CSV grows an `Overnumbered` column. The importer reads the old `overnumbered` art variant as the flag so existing exports keep working.
- Bad, because RiftCore and RiftMana name overnumbering in no column, so an import from either leaves the flag unset. `ImportEntry.isOvernumbered` is optional and the matcher reads `undefined` as "don't care" rather than "not overnumbered".
- Bad, because the slug is also stored outside `printings`, in dynamic list rules (`lists.rules` jsonb, ADR-034), which need their own carry-over. See below.

### Stored filters

`lists.rules` is the only jsonb column holding `CardFilters`, and a rule that names `overnumbered` in `artVariants` / `artVariantsExclude` would go inert once the slug is gone: an exclude would stop excluding and silently widen the wish list. Migration 280 rewrites the two unambiguous shapes onto the flag, so an exclude becomes `isOvernumbered: false` and a sole include becomes `true`. A mixed include (`["overnumbered", "altart"]`) is an OR the flag cannot express, so it only sheds the dead slug and keeps the art variants it names.

A URL carrying the slug in `artVariants` / `artVariantsEx` is not carried over. The param names a value no printing has, so the constraint drops and the link widens. Bookmarked and shared filter links are cheap to rebuild, so they are not worth a permanent read-side shim.

`user_preferences.data` needs nothing: `topLevelFilters` stores unit keys and `hiddenFilterSections` section keys, and the new `overnumbered` section is additive, so an existing preference simply does not hide it.

### Confirmation

Migration 280 backfills the flag from every row typed `overnumbered`, then compares the numeric part of `short_code` against the set's `printed_total` to catch the rest, so a typed row in a set without a total keeps the fact either way. On the catalogue as of this ADR that flags exactly the 643 rows typed `overnumbered` plus the 3 `ultimate` rows and nothing else, so the ultimates keep their art variant and gain the flag. No row typed `overnumbered` carried a letter suffix, so they all revert to `normal` art; the alt-art overnumbered printings are new data. Three wish rules carry the slug in `artVariantsExclude`; the rewrite was dry-run against a scratch copy of them plus the include shapes the catalogue has no example of, and round-trips through `down`.

No identifier generator reads `art_variant`. `short_code` carries the letter and `*` suffixes as typed, `public_code` is `short_code` plus the set total (`appendSetTotal`), and the deck codecs, export writers and card designer all read those two fields. Overnumbering was already visible in the public code (`OGN-303a/298`) and stays so.

The scanner's art key needed the opposite of a collapse. `scan-bank.ts` and `scripts/scan/catalog.ts` both key artwork by `setSlug|name|artVariant`, which separated overnumbered printings only because the slug lived in that column. They now append the flag, and the script's identity cache refreshes itself once on the segment count so a stale file cannot keep the old three-segment keys.

## More Information

The filter UI keeps overnumbering inside the Variant unit: `filter-sections.ts` lists it beside `artVariants`, `finishes` and `signed`, and the Art Variant dropdown hosts it as a flag row alongside Signed whenever both are visible. `MultiSelectCombobox` takes a list of flags for that, replacing the single-flag prop.
