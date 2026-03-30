# CSV Export Format

OpenRift exports collections as RFC 4180 CSV files (comma-separated, UTF-8, `\n` line endings). The first row is always the header. Each subsequent row represents a unique printing in the collection, with a quantity column for duplicates.

## Filename

```
openrift-{collection-name}-{date}.csv
```

`collection-name` is a kebab-cased slug of the collection name, or `all-cards` when exporting everything. `date` is `YYYY-MM-DD`.

## Columns

| #   | Header      | Description                                                             | Example values                                                    |
| --- | ----------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | Card ID     | Unique printing identifier (`SET-NNN` + optional variant/finish suffix) | `OGN-001`, `OGN-030a`, `OGN-004f`                                 |
| 2   | Card Name   | Display name of the card                                                | `Blazing Scorcher`                                                |
| 3   | Rarity      | Card rarity                                                             | `Common`, `Uncommon`, `Rare`, `Epic`, `Showcase`                  |
| 4   | Type        | Card type                                                               | `Legend`, `Unit`, `Rune`, `Spell`, `Gear`, `Battlefield`, `Other` |
| 5   | Domain      | Card domain(s), separated by `/` for multi-domain cards                 | `Fury`, `Mind / Body`                                             |
| 6   | Finish      | Card finish                                                             | `normal`, `foil`                                                  |
| 7   | Art Variant | Art variant type                                                        | `normal`, `altart`, `overnumbered`                                |
| 8   | Quantity    | Number of copies owned                                                  | `1`, `3`                                                          |

## Card ID format

The Card ID is the printing's `shortCode`. The general structure is:

```
{SET}-{NUMBER}[{variant}][{finish}]
```

- **SET**: Uppercase set prefix (e.g., `OGN`, `ALP`)
- **NUMBER**: Three-digit collector number (e.g., `001`, `030`)
- **variant suffix**: Lowercase letter for alt art (`a`, `b`, etc.)
- **finish suffix**: `f` for foil printings

Examples:

- `OGN-001` — Origins #001, normal finish, normal art
- `OGN-030a` — Origins #030, alt art variant
- `OGN-004f` — Origins #004, foil finish

## Example

```csv
Card ID,Card Name,Rarity,Type,Domain,Finish,Art Variant,Quantity
OGN-001,Blazing Scorcher,Common,Unit,Fury,normal,normal,3
OGN-004f,Cleave,Common,Unit,Fury,foil,normal,1
OGN-030a,Emberclaw Champion,Rare,Unit,Fury / Mind,normal,altart,1
```

## Escaping

Fields containing commas, double quotes, or newlines are wrapped in double quotes. Double quotes within a field are escaped as `""`. This follows standard CSV conventions (RFC 4180).

## Notes for parser authors

- Rows are sorted by Card ID (set prefix, then collector number).
- The Domain column may contain `/` as a separator for multi-domain cards. Split on `/` to get individual domains.
- Quantity is always a positive integer. Each row is a unique printing — the same card may appear multiple times with different finishes or art variants.
