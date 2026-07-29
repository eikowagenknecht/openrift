import type { Printing, PrintingImage } from "./types/index.js";
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

export interface StandardArtFallback {
  /** The standard printing whose artwork substitutes for the missing image. */
  printing: Printing;
  /** That printing's front-face image. */
  image: PrintingImage;
}

/**
 * Finds substitute artwork for a printing that has no (loadable) image of its
 * own: the standard printing of the same card in the same language, or failing
 * that the standard EN printing. Candidates competing within one language are
 * ranked by `canonicalRank`, so the canonical basic version wins over reprints
 * and premium-but-still-standard finishes.
 *
 * The caller marks the substitution visibly (see `FallbackArtChip` in the web
 * app) — this also covers alt-art and promo printings falling back to the
 * basic artwork, which is genuinely different art.
 *
 * @returns The fallback printing and its front image, or null when no standard
 * printing with a front image exists in the printing's language or EN.
 */
export function findStandardArtFallback(
  printing: Printing,
  candidates: readonly Printing[],
): StandardArtFallback | null {
  const ranked = candidates
    .filter((c) => c.id !== printing.id && c.cardId === printing.cardId && isStandardPrinting(c))
    .toSorted((a, b) => a.canonicalRank - b.canonicalRank);
  const languages =
    printing.language === WellKnown.language.EN
      ? [WellKnown.language.EN]
      : [printing.language, WellKnown.language.EN];
  for (const language of languages) {
    for (const candidate of ranked) {
      if (candidate.language !== language) {
        continue;
      }
      const image = candidate.images.find((img) => img.face === "front");
      if (image) {
        return { printing: candidate, image };
      }
    }
  }
  return null;
}
