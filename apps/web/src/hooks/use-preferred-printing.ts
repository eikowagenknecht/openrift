import type { Printing, PrintingImage } from "@openrift/shared";
import { preferredPrinting } from "@openrift/shared";

import { useCards } from "@/hooks/use-cards";
import { useLanguageList } from "@/hooks/use-enums";
import { useDisplayStore } from "@/stores/display-store";

interface PreferredPrintingHelpers {
  /**
   * Pick the single best printing for a card. Resolution order:
   * 1. `preferredPrintingId` when provided and resolvable
   * 2. Language-preference canonical (existing behavior)
   */
  getPreferredPrinting: (
    cardId: string,
    preferredPrintingId?: string | null,
  ) => Printing | undefined;
  /** Shortcut: get the front-face image of the preferred printing. */
  getPreferredFrontImage: (
    cardId: string,
    preferredPrintingId?: string | null,
  ) => PrintingImage | undefined;
}

/**
 * Central hook for picking the best printing per card, combining catalog data
 * with the user's language preference. Use this instead of hand-rolling sort
 * logic in components.
 * @returns Helpers to resolve preferred printings by card ID.
 */
export function usePreferredPrinting(): PreferredPrintingHelpers {
  "use memo";

  const { printingsByCardId } = useCards();
  const userLanguages = useDisplayStore((state) => state.languages);
  const defaultLanguageList = useLanguageList();
  const effectiveLanguageOrder =
    userLanguages.length > 0 ? userLanguages : defaultLanguageList.map((l) => l.code);

  const getPreferredPrinting = (
    cardId: string,
    preferredPrintingId?: string | null,
  ): Printing | undefined => {
    const candidates = printingsByCardId.get(cardId);
    if (!candidates) {
      return undefined;
    }
    if (preferredPrintingId) {
      const match = candidates.find((p) => p.id === preferredPrintingId);
      if (match) {
        return match;
      }
    }
    return preferredPrinting(candidates, effectiveLanguageOrder);
  };

  const getPreferredFrontImage = (
    cardId: string,
    preferredPrintingId?: string | null,
  ): PrintingImage | undefined => {
    const printing = getPreferredPrinting(cardId, preferredPrintingId);
    return printing?.images.find((img) => img.face === "front");
  };

  return { getPreferredPrinting, getPreferredFrontImage };
}
