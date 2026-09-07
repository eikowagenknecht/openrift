import type { Printing, PrintingImage } from "@openrift/shared/types/catalog";
import { preferredPrinting } from "@openrift/shared/utils";

import { useCards } from "@/features/cards/hooks/use-cards";
import { useEffectiveLanguageOrder } from "@/hooks/use-effective-language-order";

interface PreferredPrintingHelpers {
  getPreferredPrinting: (
    cardId: string,
    preferredPrintingId?: string | null,
  ) => Printing | undefined;
  getPreferredFrontImage: (
    cardId: string,
    preferredPrintingId?: string | null,
  ) => PrintingImage | undefined;
}

export function usePreferredPrinting(): PreferredPrintingHelpers {
  "use memo";

  const { printingsByCardId } = useCards();
  const effectiveLanguageOrder = useEffectiveLanguageOrder();

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
