import type { Printing } from "@openrift/shared";

export interface CopyDetailsTarget {
  copyIds: string[];
  cardName: string;
  printingByCopyId: Map<string, Printing>;
}
