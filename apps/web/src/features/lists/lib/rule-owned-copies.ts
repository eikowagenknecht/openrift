import type { OwnedCopyRow } from "@openrift/shared/list-rule-eval";
import type { CopyResponse } from "@openrift/shared/types/api/collection";
import type { Printing } from "@openrift/shared/types/catalog";

/**
 * For the net-owned live preview only; the server uses real copies. The
 * evaluator only counts by printing/card, so collection/reserved are unused.
 */
export function ownedCopiesFromCounts(
  counts: Record<string, number> | undefined,
  printingsById: Record<string, Printing>,
): OwnedCopyRow[] {
  if (!counts) {
    return [];
  }
  const rows: OwnedCopyRow[] = [];
  for (const [printingId, count] of Object.entries(counts)) {
    const printing = printingsById[printingId];
    if (!printing) {
      continue;
    }
    for (let copyIndex = 0; copyIndex < count; copyIndex++) {
      rows.push({
        copyId: `${printingId}#${copyIndex}`,
        printingId,
        cardId: printing.cardId,
        collectionId: "",
        reserved: false,
      });
    }
  }
  return rows;
}

/** Personal copies only (`groupId === null`), mirroring the server's `ownedRowsForUser`. */
export function ownedCopiesFromCopyList(
  copies: CopyResponse[],
  printingsById: Record<string, Printing>,
): OwnedCopyRow[] {
  const rows: OwnedCopyRow[] = [];
  for (const copy of copies) {
    if (copy.groupId !== null) {
      continue;
    }
    const printing = printingsById[copy.printingId];
    if (!printing) {
      continue;
    }
    rows.push({
      copyId: copy.id,
      printingId: copy.printingId,
      cardId: printing.cardId,
      collectionId: copy.collectionId,
      reserved: false,
    });
  }
  return rows;
}
