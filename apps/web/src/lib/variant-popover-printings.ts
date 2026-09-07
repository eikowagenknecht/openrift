import type { Printing } from "@openrift/shared";

export interface VariantPopoverScope {
  cardId: string;
  setId?: string;
  printingId?: string;
}

// The catalog projection buckets ownership per active-language copy, so a
// card owned only in a filtered-out language is missing from it even though
// some grids still show the card. Fall back to the language-scoped full
// variant list for those cards.
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
