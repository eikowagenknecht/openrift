import type { Printing } from "@openrift/shared";

import { useCards } from "@/hooks/use-cards";
import { useDisplayStore } from "@/stores/display-store";

/**
 * The printings a chooser should offer for one card: the viewer's preferred
 * languages, plus the currently pinned printing even when its language sits
 * outside that filter (otherwise the active row vanishes from the list that is
 * supposed to show it as active).
 *
 * Shared by every "which printing?" surface — the deck builder's row menu, the
 * tier list's tile menu — so they can't drift on which printings they hide.
 *
 * @param cardId The card whose printings to offer.
 * @param pinnedPrintingId The printing currently in use, or null when the
 *   surface follows the language/set default.
 * @returns The offerable printings, in catalog order.
 */
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
