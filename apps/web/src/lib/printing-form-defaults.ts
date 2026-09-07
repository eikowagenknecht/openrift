import type { AdminPrintingResponse } from "@openrift/shared";

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
 * `size` is part of `uq_printings_identity`, so it is copied like every other
 * field. The image URL is deliberately not copied: the duplicate gets its own
 * artwork.
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
