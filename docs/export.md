# CSV Export Format

OpenRift exports collections, wishlists, and tradelists as RFC 4180 CSV files (comma-separated, UTF-8, `\n` line endings). The first row is always the header. Each subsequent row represents a unique printing, with a quantity column for duplicates. A printing with copies in several distinct states (condition, grading, notes — see the metadata columns below) exports one row per state.

This document describes OpenRift's own format. The app can also export in Piltover Archive, RiftMana, and RiftCore formats — see [Other formats](#other-formats).

## Filename

```
{format}-{name}-{date}.csv
```

`format` is the format prefix (`openrift`, `piltover`, `riftmana`, `riftcore`). `name` is a kebab-cased slug of the collection or list name, or `all-cards` when exporting the whole collection. `date` is `YYYY-MM-DD`.

## Columns

| #   | Header        | Description                                                            | Example values                                                    |
| --- | ------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | Card ID       | Unique printing identifier (`SET-NNN` + optional variant suffix)       | `OGN-001`, `OGN-030a`, `SFD-R01b`                                 |
| 2   | Card Name     | Display name of the card                                               | `Blazing Scorcher`                                                |
| 3   | Rarity        | Card rarity                                                            | `Common`, `Uncommon`, `Rare`, `Epic`, `Showcase`                  |
| 4   | Type          | Card type(s), separated by `/` for multi-type cards                    | `Legend`, `Unit`, `Unit / Gear`, `Rune`, `Battlefield`            |
| 5   | Domain        | Card domain(s), separated by `/` for multi-domain cards                | `Fury`, `Mind / Body`                                             |
| 6   | Finish        | Card finish                                                            | `normal`, `foil`                                                  |
| 7   | Art Variant   | Art variant type                                                       | `normal`, `altart`, `overnumbered`, `ultimate`                    |
| 8   | Promo         | Promo/distribution marker slugs, joined with `+` (empty for non-promo) | `prerelease`, `judge+promo`                                       |
| 9   | Language      | Printing language (uppercase catalog code)                             | `EN`, `FR`, `SC`                                                  |
| 10  | Quantity      | Number of copies this row covers                                       | `1`, `3`                                                          |
| 11  | Condition     | House condition slug (empty when unrecorded or graded)                 | `near-mint`, `light-played`, `poor`                               |
| 12  | Grader        | Grading company slug, lowercase (empty when ungraded)                  | `psa`, `bgs`, `cgc`                                               |
| 13  | Grade         | Numeric grade (set only together with Grader)                          | `9.5`, `10`                                                       |
| 14  | Altered       | `Yes` when the copy is altered, empty otherwise                        | `Yes`                                                             |
| 15  | Public Notes  | Free-text note visible to other users                                  | `Pack fresh`                                                      |
| 16  | Private Notes | Free-text note visible only to the owner                               | `From Worlds side event`                                          |
| 17  | Links         | `url\|label` entries joined by `; ` (label optional)                   | `https://example.com/front.jpg\|Front; https://example.com/b.jpg` |

Columns 11–17 carry per-copy metadata. Condition and grading are mutually exclusive: a graded row has Grader + Grade and an empty Condition. All seven are empty when no metadata is recorded — older exports without these columns still import fine.

## Card ID format

The Card ID is the printing's `shortCode`. The general structure is:

```
{SET}-{NUMBER}[{variant}]
```

- **SET**: Uppercase set prefix (e.g., `OGN`, `SFD`)
- **NUMBER**: Three-digit card number (e.g., `001`, `030`); special printings
  carry a letter prefix instead (`R01` for runes, `T01` for tokens)
- **variant suffix**: Lowercase letter for alt art (`a`, `b`, etc.) or `*` for
  star variants

The Card ID carries **no finish information**: a foil and a normal copy of the
same printing share one Card ID and are split into separate rows by the
`Finish` column.

Examples:

- `OGN-001` — Origins #001, normal art
- `OGN-030a` — Origins #030, alt art variant
- `SFD-R01b` — a rune printing, second alt art

## Example

```csv
Card ID,Card Name,Rarity,Type,Domain,Finish,Art Variant,Promo,Language,Quantity,Condition,Grader,Grade,Altered,Public Notes,Private Notes,Links
OGN-001,Blazing Scorcher,Common,Unit,Fury,normal,normal,,EN,3,near-mint,,,,,,
OGN-001,Blazing Scorcher,Common,Unit,Fury,normal,normal,,EN,1,,psa,9.5,,Pack fresh,,https://example.com/slab.jpg|Slab
OGN-004,Cleave,Common,Unit,Fury,foil,normal,,EN,1,,,,,,,
OGN-030a,Emberclaw Champion,Rare,Unit,Fury / Mind,normal,altart,prerelease,EN,1,,,,Yes,,,
```

## Escaping

Fields containing commas, double quotes, or newlines are wrapped in double quotes. Double quotes within a field are escaped as `""`. This follows standard CSV conventions (RFC 4180).

## Notes for parser authors

- Rows are sorted by Card ID (set prefix, then short code).
- The Type and Domain columns may contain `/` as a separator for multi-type / multi-domain cards. Split on `/` to get individual values.
- Quantity is always a positive integer. The same Card ID may appear on multiple rows differing in the `Finish` column (foil vs normal), and the same card may appear under multiple Card IDs (art variants).
- A printing+finish combination may itself span multiple rows, one per distinct metadata state (columns 11–17). To get a total count, sum Quantity over rows sharing `Card ID + Finish + Language`.

## Other formats

Besides its own format, OpenRift exports in the formats of other collection tools, so a collection or list can be carried over. All of them round-trip through OpenRift's importer, but each loses the information its format cannot express:

- **Piltover Archive** — one row per printing and condition. Finish is a `-Foil` suffix on the Variant Number (omitted for always-foil rarities, which the format infers), promos are an extra label suffix. No grading or notes; graded and unrecorded copies export as `NM`.
- **RiftMana** — one row per card and language, with separate Normal/Foil quantity columns and per-condition counts encoded as `NM:2;LP:1` cells. Promo printings get the `-p` Card ID suffix, losing the specific promo type. The price and notes columns are left empty.
- **RiftCore** — one row per card, with separate Standard/Foil quantity columns, preceded by the `RIFTCORE COLLECTION EXPORT` marker line. The format carries no language, condition, or promo information; always-foil rarities count in the Standard column.

Wishlists and tradelists that track printings or copies export through the same writers (the list's entries are grouped per printing first). Card-kind wishlists don't reference specific printings, so they export as plain text (`<quantity> <name>` per line) instead of CSV.
