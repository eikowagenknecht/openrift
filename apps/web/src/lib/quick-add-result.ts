import type { Printing } from "@openrift/shared";

export interface QuickAddCardResult {
  cardId: string;
  cardName: string;
  defaultPrinting: Printing;
  printings: Printing[];
  ownedCount: number;
}
