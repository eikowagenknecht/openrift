# Finish Rules

Each printing has a **finish**: `normal` (non-foil) or `foil`. Which finishes exist for a given card is determined by a set of rules evaluated in order — the first match wins.

| Condition                         | Finishes        |
| --------------------------------- | --------------- |
| Set is OGS (Proving Grounds)      | non-foil only   |
| Super type includes Token         | non-foil only   |
| Card type is Rune (non-Showcase)  | non-foil only   |
| Rarity is Common or Uncommon      | non-foil + foil |
| Rarity is Rare, Epic, or Showcase | foil only       |

These rules are implemented in `getFinishes()` in `packages/shared/src/db/refresh-catalog.ts` and applied during catalog refresh to determine which printing rows to create.

## Notes

- Showcase Runes (alt-art) skip the base Rune rule and fall through to the rarity-based rules (foil only).
- Showcase rarity falls through to the last rule (foil only), which matches how they're sold.
- Prices are only seeded for finishes that have a corresponding printing row. If TCGPlayer lists a price for a finish that doesn't exist per these rules, it's skipped.
