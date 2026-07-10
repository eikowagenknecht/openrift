import type { Printing } from "@openrift/shared";

/** How the variant×collection popover was opened (see add-mode-store). */
export interface VariantPopoverScope {
  cardId: string;
  /** When present, scope the popover to this set (cards-view tile split by set). */
  setId?: string;
  /** When present, show only this printing (printings/copies view). */
  printingId?: string;
}

/**
 * Resolve the printings the variant×collection popover should offer for the
 * clicked card.
 *
 * The primary source is the catalog projection, which respects the active
 * search/set/owned filters. But that projection buckets ownership per
 * active-language copy, while some grids (the group "bulk box") show a card
 * whenever the viewer owns a playset across ANY language. A card owned solely in
 * a filtered-out language is then shown in the grid yet dropped from the catalog
 * projection, so the popover would never mount. Fall back to the language-scoped
 * full variant list (the same map the detail-pane picker uses) so the chooser
 * still resolves for those cards.
 *
 * @returns The card's printings scoped by set/printing, or undefined when no
 *   popover is open or the card has no printings in either source.
 */
export function resolveVariantPopoverPrintings(
  catalogPrintingsByCardId: ReadonlyMap<string, Printing[]>,
  languageScopedPrintingsByCardId: ReadonlyMap<string, Printing[]>,
  popover: VariantPopoverScope | null,
): Printing[] | undefined {
  if (!popover) {
    return undefined;
  }
  const printings =
    catalogPrintingsByCardId.get(popover.cardId) ??
    languageScopedPrintingsByCardId.get(popover.cardId);
  return printings?.filter((printing) => {
    if (popover.printingId) {
      return printing.id === popover.printingId;
    }
    return !popover.setId || printing.setId === popover.setId;
  });
}
