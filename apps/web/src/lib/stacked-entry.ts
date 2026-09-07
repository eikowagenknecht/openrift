import type { Printing } from "@openrift/shared/types/catalog";

export interface StackedEntry {
  printingId: string;
  printing: Printing;
  copyIds: string[];
}
