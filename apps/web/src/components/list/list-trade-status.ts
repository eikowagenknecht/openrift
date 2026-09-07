import type {
  CardTradeLiveAnnotation,
  CardTradeLivePhase,
} from "@openrift/shared/types/api/card-trade";
import type { ListEntryDetailResponse } from "@openrift/shared/types/api/list";
import type { Printing } from "@openrift/shared/types/catalog";

import { collapseTradeAnnotations, groupTradeAnnotationsByPrinting } from "@/lib/trade-derivation";

/** Only `reserved` pins a specific copy; `asked`/`offered` commit supply without naming one. */
function isPinnedPhase(phase: CardTradeLivePhase): boolean {
  return phase === "reserved";
}

export interface ListTradeIndex {
  byPrinting: ReadonlyMap<string, CardTradeLiveAnnotation[]>;
  byCard: ReadonlyMap<string, CardTradeLiveAnnotation[]>;
}

/**
 * `byCard` reuses {@link groupTradeAnnotationsByPrinting}'s giver-over-receiver
 * suppression from `byPrinting`. Printings missing from the catalog are skipped.
 */
export function buildListTradeIndex(
  annotations: readonly CardTradeLiveAnnotation[],
  printingsById: Record<string, Printing>,
): ListTradeIndex {
  const byPrinting = groupTradeAnnotationsByPrinting(annotations);
  const byCard = new Map<string, CardTradeLiveAnnotation[]>();
  for (const [printingId, group] of byPrinting) {
    const cardId = printingsById[printingId]?.cardId;
    if (cardId === undefined) {
      continue;
    }
    const existing = byCard.get(cardId);
    if (existing) {
      existing.push(...group);
    } else {
      byCard.set(cardId, [...group]);
    }
  }
  return { byPrinting, byCard };
}

/**
 * The list's `reserved` flag and the live-trade feed are separate queries;
 * entries can land before annotations resolve.
 */
function reservedFallback(printingId: string): CardTradeLiveAnnotation {
  return { printingId, role: "giver", phase: "reserved", tradeCount: 1, quantity: 1 };
}

/** Copy-kind entries split pinned from unpinned annotations by `reserved`. */
export function listEntryTradeStatus(
  entry: ListEntryDetailResponse,
  index: ListTradeIndex,
): CardTradeLiveAnnotation | null {
  if (entry.kind === "card") {
    return collapseTradeAnnotations(index.byCard.get(entry.cardId) ?? []);
  }
  const annotations = index.byPrinting.get(entry.printingId) ?? [];
  if (entry.kind === "printing") {
    return collapseTradeAnnotations(annotations);
  }
  if (entry.reserved) {
    return (
      collapseTradeAnnotations(annotations.filter((one) => isPinnedPhase(one.phase))) ??
      reservedFallback(entry.printingId)
    );
  }
  return collapseTradeAnnotations(annotations.filter((one) => !isPinnedPhase(one.phase)));
}
