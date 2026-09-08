import { sortCards } from "@openrift/shared/filters-sort";
import type { CopyResponse } from "@openrift/shared/types/api/collection";
import type { Printing } from "@openrift/shared/types/catalog";

import type { CsvExportFormat, CsvExportLabels } from "@/features/collections/lib/csv-export";
import { CSV_EXPORT_FORMATS } from "@/features/collections/lib/csv-export";
import type { StackedEntry } from "@/features/collections/lib/stacked-entry";
import type { GroupInfo } from "@/lib/card-group-types";

export function buildCollectionCsv(
  copies: readonly CopyResponse[],
  allPrintings: readonly Printing[],
  sets: readonly GroupInfo[],
  labels: CsvExportLabels,
  format: CsvExportFormat,
): string {
  const printingById = new Map(allPrintings.map((printing) => [printing.id, printing]));

  const stackMap = new Map<string, StackedEntry>();
  for (const copy of copies) {
    const printing = printingById.get(copy.printingId);
    if (!printing) {
      continue;
    }
    const existing = stackMap.get(copy.printingId);
    if (existing) {
      existing.copyIds.push(copy.id);
    } else {
      stackMap.set(copy.printingId, { printingId: copy.printingId, printing, copyIds: [copy.id] });
    }
  }

  const stacks = [...stackMap.values()];
  const sortedPrintings = sortCards(
    stacks.map((stack) => stack.printing),
    "id",
    { sets },
  );
  const byPrintingId = new Map(stacks.map((stack) => [stack.printingId, stack]));
  const sortedStacks = sortedPrintings
    .map((printing) => byPrintingId.get(printing.id))
    .filter((stack): stack is StackedEntry => stack !== undefined);

  const copiesById = new Map(copies.map((copy) => [copy.id, copy]));
  return CSV_EXPORT_FORMATS[format].generate(sortedStacks, labels, copiesById);
}
