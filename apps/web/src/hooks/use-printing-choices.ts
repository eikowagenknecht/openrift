import type { Printing } from "@openrift/shared";

import { useCards } from "@/hooks/use-cards";
import { useDisplayStore } from "@/stores/display-store";

// Includes pinnedPrintingId even when its language is filtered out, or the
// active row would vanish from its own chooser.
export function usePrintingChoices(
  cardId: string,
  pinnedPrintingId: string | null,
): readonly Printing[] {
  const { printingsByCardId } = useCards();
  const languages = useDisplayStore((state) => state.languages);
  const allPrintings = printingsByCardId.get(cardId) ?? [];

  if (!languages || languages.length === 0) {
    return allPrintings;
  }
  return allPrintings.filter(
    (printing) => languages.includes(printing.language) || printing.id === pinnedPrintingId,
  );
}
