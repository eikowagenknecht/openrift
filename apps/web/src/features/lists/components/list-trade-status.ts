import { cardTradeLivePhase } from "@openrift/shared/card-trade-lifecycle";
import type {
  CardTradeLiveAnnotation,
  CardTradeLivePhase,
  CardTradeResponse,
  CardTradeRole,
} from "@openrift/shared/types/api/card-trade";
import type { ListEntryDetailResponse } from "@openrift/shared/types/api/list";
import type { Printing } from "@openrift/shared/types/catalog";

import {
  collapseTradeAnnotations,
  groupTradeAnnotationsByPrinting,
} from "@/features/groups/lib/trade-derivation";

/** Only `reserved` pins a specific copy; `asked`/`offered` commit supply without naming one. */
function isPinnedPhase(phase: CardTradeLivePhase): boolean {
  return phase === "reserved";
}

export interface ListTradeIndex {
  byPrinting: ReadonlyMap<string, CardTradeLiveAnnotation[]>;
  byCard: ReadonlyMap<string, CardTradeLiveAnnotation[]>;
  tradesByAnnotation: ReadonlyMap<string, CardTradeResponse[]>;
}

function annotationKey(input: {
  printingId: string;
  role: CardTradeRole;
  phase: CardTradeLivePhase;
}): string {
  return `${input.printingId}|${input.role}|${input.phase}`;
}

/**
 * `byCard` reuses {@link groupTradeAnnotationsByPrinting}'s giver-over-receiver
 * suppression from `byPrinting`. Printings missing from the catalog are skipped.
 * `tradesByAnnotation` re-derives each trade's phase client-side so a chip can
 * name the trades the aggregated annotation behind it stands for.
 */
export function buildListTradeIndex(
  annotations: readonly CardTradeLiveAnnotation[],
  printingsById: Record<string, Printing>,
  trades: readonly CardTradeResponse[],
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
  const tradesByAnnotation = new Map<string, CardTradeResponse[]>();
  for (const trade of trades) {
    const phase = cardTradeLivePhase(trade);
    if (phase === null) {
      continue;
    }
    const key = annotationKey({ printingId: trade.printingId, role: trade.role, phase });
    const existing = tradesByAnnotation.get(key);
    if (existing) {
      existing.push(trade);
    } else {
      tradesByAnnotation.set(key, [trade]);
    }
  }
  return { byPrinting, byCard, tradesByAnnotation };
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

/**
 * The live trades a displayed annotation stands for. Empty while the trade list
 * is still loading, and for the pinned-copy fallback the feed has no annotation for.
 */
export function listEntryTrades(
  annotation: CardTradeLiveAnnotation,
  index: ListTradeIndex,
): readonly CardTradeResponse[] {
  return index.tradesByAnnotation.get(annotationKey(annotation)) ?? [];
}
