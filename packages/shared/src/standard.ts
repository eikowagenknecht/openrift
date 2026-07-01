import type { Printing } from "./types/index.js";
import { LOW_RARITIES, WellKnown } from "./well-known.js";

/**
 * A "standard" printing is the plain collectible version of a card — the one a
 * player reaches for by default. It excludes every premium, promotional, or
 * collector treatment. Used by dynamic list rules (ADR-034) and the card
 * browser's "standard only / non-standard" toggle.
 *
 * Returns true iff **all** of the following hold:
 * - the art is the normal art variant,
 * - the printing is not signed,
 * - the printing carries no markers (not a promo / stamped printing),
 * - the finish is standard **for the rarity**:
 *   - `metal` / `metal-deluxe` are never standard, at any rarity;
 *   - low rarities (common / uncommon) are standard only with a `normal` finish;
 *   - all other rarities are standard with either a `normal` or `foil` finish
 *     (these are always-foil rarities, so foil is their plain version).
 *
 * @returns True when the printing is the standard version of its card.
 */
export function isStandardPrinting(printing: Printing): boolean {
  if ((printing.artVariant || WellKnown.artVariant.NORMAL) !== WellKnown.artVariant.NORMAL) {
    return false;
  }
  if (printing.isSigned) {
    return false;
  }
  if (printing.markers.length > 0) {
    return false;
  }
  const { finish, rarity } = printing;
  if (finish === WellKnown.finish.METAL || finish === WellKnown.finish.METAL_DELUXE) {
    return false;
  }
  if (LOW_RARITIES.has(rarity)) {
    return finish === WellKnown.finish.NORMAL;
  }
  return finish === WellKnown.finish.NORMAL || finish === WellKnown.finish.FOIL;
}
