import type { Printing } from "@openrift/shared/types/catalog";

export interface QuickAddCardResult {
  cardId: string;
  cardName: string;
  defaultPrinting: Printing;
  printings: Printing[];
  ownedCount: number;
}
