import type { AdminPrintingResponse } from "@openrift/shared";

/** Values the create-printing form falls back to when nothing is duplicated. */
export interface PrintingFormFallbacks {
  setSlug: string;
  rarity: string;
  artVariant: string;
  finish: string;
  size: string;
  language: string;
}

export interface PrintingFormDefaults {
  shortCode: string;
  setId: string;
  rarity: string;
  artVariant: string;
  finish: string;
  size: string;
  isSigned: boolean;
  isOvernumbered: boolean;
  markerSlugs: string[];
  distributionChannelSlugs: string[];
  artist: string;
  publicCode: string;
  language: string;
  printedName: string;
  printedYear: string;
  printedRulesText: string;
  printedEffectText: string;
  flavorText: string;
}

/**
 * Initial field values for the admin create-printing form, either blank or
 * copied from the printing being duplicated.
 *
 * Every field lives here rather than inline at each `useState` so a duplicate
 * carries the whole source printing. `size` in particular is part of the
 * printing identity (`uq_printings_identity`), so a duplicate that silently
 * reset it to the default landed on a different printing than the admin was
 * looking at. The image URL is deliberately not copied: the duplicate gets its
 * own artwork.
 *
 * @returns The form's initial values.
 */
export function printingFormDefaults(
  source: AdminPrintingResponse | null,
  fallbacks: PrintingFormFallbacks,
): PrintingFormDefaults {
  const printedYear = source?.printedYear;
  return {
    shortCode: source?.shortCode ?? "",
    setId: source?.setSlug ?? fallbacks.setSlug,
    rarity: source?.rarity ?? fallbacks.rarity,
    artVariant: source?.artVariant ?? fallbacks.artVariant,
    finish: source?.finish ?? fallbacks.finish,
    size: source?.size ?? fallbacks.size,
    isSigned: source?.isSigned ?? false,
    isOvernumbered: source?.isOvernumbered ?? false,
    markerSlugs: source?.markerSlugs ?? [],
    distributionChannelSlugs: source?.distributionChannelSlugs ?? [],
    artist: source?.artist ?? "",
    publicCode: source?.publicCode ?? "",
    language: source?.language ?? fallbacks.language,
    printedName: source?.printedName ?? "",
    printedYear: printedYear === null || printedYear === undefined ? "" : String(printedYear),
    printedRulesText: source?.printedRulesText ?? "",
    printedEffectText: source?.printedEffectText ?? "",
    flavorText: source?.flavorText ?? "",
  };
}
