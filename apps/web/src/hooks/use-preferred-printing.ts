import type { Printing, PrintingImage } from "@openrift/shared";
import { preferredPrinting } from "@openrift/shared";

import { useCards } from "@/hooks/use-cards";
import { useDisplayStore } from "@/stores/display-store";

interface PreferredPrintingHelpers {
  /** Pick the single best printing for a card, respecting language preference. */
  getPreferredPrinting: (cardId: string) => Printing | undefined;
  /** Shortcut: get the front-face image of the preferred printing. */
  getPreferredFrontImage: (cardId: string) => PrintingImage | undefined;
}

/**
 * Central hook for picking the best printing per card, combining catalog data
 * with the user's language preference. Use this instead of hand-rolling sort
 * logic in components.
 * @returns Helpers to resolve preferred printings by card ID.
 */
export function usePreferredPrinting(): PreferredPrintingHelpers {
  "use memo";

  const { printingsByCardId, setOrderMap } = useCards();
  const languages = useDisplayStore((state) => state.languages);

  const getPreferredPrinting = (cardId: string): Printing | undefined => {
    const candidates = printingsByCardId.get(cardId);
    if (!candidates) {
      return undefined;
    }
    return preferredPrinting(candidates, setOrderMap, languages);
  };

  const getPreferredFrontImage = (cardId: string): PrintingImage | undefined => {
    const printing = getPreferredPrinting(cardId);
    return printing?.images.find((img) => img.face === "front");
  };

  return { getPreferredPrinting, getPreferredFrontImage };
}
