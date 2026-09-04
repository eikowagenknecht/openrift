import type { Printing, PrintingImage } from "./types/index.js";
import { LOW_RARITIES, WellKnown } from "./well-known.js";

/**
 * The printing fields the standard check inspects. A structural subset of
 * {@link Printing} so wire-shaped printings (e.g. the Discord bot's catalog
 * snapshot) qualify without the enriched `card` / set fields.
 */
type StandardCheckFields = Pick<
  Printing,
  | "artVariant"
  | "isSigned"
  | "isOvernumbered"
  | "markers"
  | "finish"
  | "rarity"
  | "size"
  | "hasFoilTwin"
>;

/** The additional fields the art-fallback search needs on each candidate. */
type FallbackCandidateFields = StandardCheckFields &
  Pick<
    Printing,
    | "id"
    | "cardId"
    | "language"
    | "canonicalRank"
    | "images"
    | "fallbackArtMode"
    | "fallbackImageId"
  >;

/**
 * A "standard" printing is the plain collectible version of a card — the one a
 * player reaches for by default. It excludes every premium, promotional, or
 * collector treatment. Used by dynamic list rules (ADR-034) and the card
 * browser's "standard only / non-standard" toggle.
 *
 * Returns true iff **all** of the following hold:
 * - the art is the normal art variant,
 * - the collector number is within the set's printed total,
 * - the printing is not signed,
 * - the printing carries no markers (not a promo / stamped printing),
 * - the rarity is not `showcase` (a collector tier, never a plain version),
 * - the card is the normal physical size,
 * - the finish is standard **for the rarity**:
 *   - `metal` / `metal-deluxe` are never standard, at any rarity;
 *   - low rarities (common / uncommon) are standard only with a `normal` finish;
 *   - the always-foil rarities are standard in `foil`, and in `normal` only when
 *     no foil twin exists ({@link Printing.hasFoilTwin}) — a starter-deck rare
 *     printed only unfoiled is that card's plain version, an unfoiled duplicate
 *     of a foil pack card is not.
 *
 * @returns True when the printing is the standard version of its card.
 */
export function isStandardPrinting(printing: StandardCheckFields): boolean {
  if ((printing.artVariant || WellKnown.artVariant.NORMAL) !== WellKnown.artVariant.NORMAL) {
    return false;
  }
  if (printing.isOvernumbered) {
    return false;
  }
  if (printing.isSigned) {
    return false;
  }
  if (printing.markers.length > 0) {
    return false;
  }
  if (printing.rarity === WellKnown.rarity.SHOWCASE) {
    return false;
  }
  if (printing.size !== WellKnown.cardSize.STANDARD) {
    return false;
  }
  const { finish, rarity } = printing;
  if (finish === WellKnown.finish.METAL || finish === WellKnown.finish.METAL_DELUXE) {
    return false;
  }
  if (LOW_RARITIES.has(rarity)) {
    return finish === WellKnown.finish.NORMAL;
  }
  if (finish === WellKnown.finish.FOIL) {
    return true;
  }
  return finish === WellKnown.finish.NORMAL && printing.hasFoilTwin !== true;
}

export interface StandardArtFallback<T = Printing> {
  /**
   * The printing whose artwork substitutes for the missing image, when one is
   * known. Null only for a pinned image that no sibling printing carries (a
   * hand-made composite, art from outside the catalogue): the substitution is
   * still marked, but there is no printing to diff the differences against.
   */
  printing: T | null;
  /** The substitute artwork itself. */
  image: PrintingImage;
}

/**
 * Resolves an admin-pinned substitute (`fallbackArtMode: "pinned"`).
 *
 * The pin stores an image file, not a printing, so the art source has to be
 * recovered by looking for the same image among the card's other printings.
 * That finds it in the common case, where the pinned file is a sibling's scan,
 * and the badges then explain the substitution as fully as for a derived one.
 * Art from outside the catalogue resolves to a null printing instead, which the
 * caller marks generically. The search stays within the passed candidates (one
 * card's printings), so a pin borrowed from a *different* card also lands in the
 * null case — building a catalogue-wide image index to name that source would
 * cost every render for a rare pin.
 *
 * The face is always `front`: a pin is shown in the front-art slot no matter
 * which face the file was scanned as.
 *
 * @returns The pinned artwork with its source printing when identifiable.
 */
function resolvePinnedArt<T extends FallbackCandidateFields>(
  imageId: string,
  printing: T,
  candidates: readonly T[],
): StandardArtFallback<T> {
  const source = candidates.find(
    (c) => c.id !== printing.id && c.images.some((img) => img.imageId === imageId),
  );
  return { printing: source ?? null, image: { face: "front", imageId } };
}

/**
 * Finds substitute artwork for a printing that has no (loadable) image of its
 * own: the standard printing of the same card in the same language, or failing
 * that the standard EN printing. Candidates competing within one language are
 * ranked by `canonicalRank`, so the canonical basic version wins over reprints
 * and premium-but-still-standard finishes.
 *
 * An admin override on the printing takes precedence over that search, because
 * the search has no way to know it picked wrong: `"none"` suppresses the
 * substitute entirely (the caller falls through to its drawn placeholder), and
 * `"pinned"` shows the pinned file (see {@link resolvePinnedArt}). A `"pinned"`
 * printing whose image did not survive to the wire — the pinned file is not
 * rehosted, so there is nothing servable — arrives without a `fallbackImageId`
 * and derives as usual, which shows *something* while the rehost is pending
 * rather than punishing the printing for the override.
 *
 * The caller marks the substitution visibly (see `FallbackArtBadges` in the web
 * app) — this also covers alt-art and promo printings falling back to the
 * basic artwork, which is genuinely different art.
 *
 * @returns The fallback artwork and the printing it came from (null for a pin
 * with no printing behind it), or null when nothing substitutes: the mode is
 * `"none"`, or no standard printing with a front image exists in the printing's
 * language or EN.
 */
export function findStandardArtFallback<T extends FallbackCandidateFields>(
  printing: T,
  candidates: readonly T[],
): StandardArtFallback<T> | null {
  if (printing.fallbackArtMode === "none") {
    return null;
  }
  if (printing.fallbackArtMode === "pinned" && printing.fallbackImageId !== undefined) {
    return resolvePinnedArt(printing.fallbackImageId, printing, candidates);
  }
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
