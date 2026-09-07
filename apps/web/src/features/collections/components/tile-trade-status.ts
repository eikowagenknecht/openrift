import type { CardTradeLiveAnnotation } from "@openrift/shared/types/api/card-trade";
import type { CopyResponse } from "@openrift/shared/types/api/collection";
import type { Printing } from "@openrift/shared/types/catalog";

import {
  collapseTradeAnnotations,
  groupTradeAnnotationsByPrinting,
} from "@/features/groups/lib/trade-derivation";
import { liveTradeStatus, tradeStatusTitle } from "@/features/groups/lib/trade-status-labels";

// What a /collections tile shows about the live trades touching it.

export interface TileTradeStatus {
  annotation: CardTradeLiveAnnotation;
  totalCount?: number;
  title: string;
}

export function tradeChipTitle({
  annotation,
  totalCount,
  availableCount,
}: {
  annotation: CardTradeLiveAnnotation;
  totalCount?: number;
  availableCount: number;
}): string {
  const { label, direction } = liveTradeStatus(annotation);
  if (annotation.role !== "giver" || annotation.phase !== "asked") {
    return tradeStatusTitle({ label, direction, count: annotation.quantity, totalCount });
  }
  // A giver-side `asked` count is other people's bids, not committed copies:
  // name the copies still free alongside it so the number can't read as spoken-for.
  const wanted =
    annotation.quantity === 1 ? "1 copy wanted" : `${annotation.quantity} copies wanted`;
  return `${label} (${direction}) · ${wanted}, ${availableCount} available`;
}

// What the user physically holds free, not the server's reservable supply.
// `altered` stays counted: that exclusion in `buildSupply` is a matching policy, not unavailability.
export function availableCopyCount(
  copies: readonly CopyResponse[] | undefined,
  printingId: string,
): number {
  return (copies ?? []).filter(
    (copy) => copy.printingId === printingId && !copy.reserved && !copy.onLoan,
  ).length;
}

// Uses the annotation's phase, not copies' `reserved` flag, to pick the word:
// `reserved` stays true after the cards change hands until the giver syncs.
export function tileTradeStatus({
  annotations,
  copies,
  printingId,
  siblingIds,
  withSiblingTotal,
  isGroupCollection,
}: {
  annotations: readonly CardTradeLiveAnnotation[] | undefined;
  copies: readonly CopyResponse[] | undefined;
  printingId: string;
  siblingIds: readonly string[];
  withSiblingTotal: boolean;
  isGroupCollection: boolean;
}): TileTradeStatus | null {
  // An annotation always names a personal collection; on a group "bulk box" it
  // describes copies elsewhere, not the ones this tile shows.
  if (isGroupCollection) {
    return null;
  }
  const byPrinting = groupTradeAnnotationsByPrinting(
    (annotations ?? []).filter((entry) => siblingIds.includes(entry.printingId)),
  );
  const annotation = collapseTradeAnnotations(byPrinting.get(printingId) ?? []);
  if (!annotation) {
    return null;
  }
  // Only annotations in the winning role and phase count toward the total, or
  // summing would put copies merely asked for behind a "Reserved" word.
  const totalCount = withSiblingTotal
    ? [...byPrinting.values()]
        .flat()
        .filter((entry) => entry.role === annotation.role && entry.phase === annotation.phase)
        .reduce((sum, entry) => sum + entry.quantity, 0)
    : undefined;
  return {
    annotation,
    totalCount,
    title: tradeChipTitle({
      annotation,
      totalCount,
      availableCount: availableCopyCount(copies, printingId),
    }),
  };
}

export function tradeAnnotationByCopyId(
  annotations: readonly CardTradeLiveAnnotation[] | undefined,
  printingByCopyId: ReadonlyMap<string, Printing>,
): Map<string, CardTradeLiveAnnotation> {
  const byPrinting = groupTradeAnnotationsByPrinting(annotations ?? []);
  const byCopy = new Map<string, CardTradeLiveAnnotation>();
  for (const [copyId, printing] of printingByCopyId) {
    const annotation = collapseTradeAnnotations(byPrinting.get(printing.id) ?? []);
    if (annotation) {
      byCopy.set(copyId, annotation);
    }
  }
  return byCopy;
}
