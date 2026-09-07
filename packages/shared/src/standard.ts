import type { Printing, PrintingImage } from "./types/index.js";
import { LOW_RARITIES, WellKnown } from "./well-known.js";

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
 * The plain collectible version of a card, excluding every premium,
 * promotional, or collector treatment. Always-foil rarities count foil as
 * standard, but their normal finish only when no foil twin exists.
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
  printing: T | null;
  image: PrintingImage;
}

// `candidates` must already be scoped to one card. A pin whose image belongs
// to another card resolves to a null printing, not an error.
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

// An admin override takes precedence over the derived search: "none"
// suppresses the substitute entirely, "pinned" shows the pinned file. A
// "pinned" printing with no servable image yet falls through to deriving.
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
