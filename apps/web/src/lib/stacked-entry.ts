import type { Printing } from "@openrift/shared";

export interface StackedEntry {
  printingId: string;
  printing: Printing;
  copyIds: string[];
}
