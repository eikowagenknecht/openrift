import type { Printing } from "@openrift/shared/types/catalog";

export interface CopyDetailsTarget {
  copyIds: string[];
  cardName: string;
  printingByCopyId: Map<string, Printing>;
}
