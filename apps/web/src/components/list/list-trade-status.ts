import type {
  CardTradeLiveAnnotation,
  CardTradeLivePhase,
  ListEntryDetailResponse,
  Printing,
} from "@openrift/shared";

import { collapseTradeAnnotations, groupTradeAnnotationsByPrinting } from "@/lib/trade-derivation";

// Resolves the live-trade status one list entry should show. List entries come
// in three shapes and only one of them names a printing the way the live-trade
// feed does, so the mapping lives here rather than in the cells.

/**
 * Phases that pin specific physical copies. Accepting a trade reserves copies
 * and the pin survives the swap, so on a copy-kind entry these two belong to
 * the copy the list marks as `reserved`. `asked` and `offered` commit supply
 * without naming a copy, so they belong to the printing and every copy of it
 * shows them.
 * @param phase The trade's phase.
 * @returns Whether the phase pins named copies.
 */
function isPinnedPhase(phase: CardTradeLivePhase): boolean {
  return phase === "reserved";
}

/** The viewer's live-trade annotations, indexed for both list-entry shapes. */
export interface ListTradeIndex {
  /** Printing id → its surviving annotations. Drives printing- and copy-kind entries. */
  byPrinting: ReadonlyMap<string, CardTradeLiveAnnotation[]>;
  /** Card id → the annotations of every printing of that card. Drives card-kind entries. */
  byCard: ReadonlyMap<string, CardTradeLiveAnnotation[]>;
}

/** Stable empty index, for callers with no session or no annotations loaded yet. */
export const EMPTY_LIST_TRADE_INDEX: ListTradeIndex = {
  byPrinting: new Map(),
  byCard: new Map(),
};

/**
 * Indexes the viewer's live-trade annotations by printing and by card.
 *
 * The per-printing index is {@link groupTradeAnnotationsByPrinting}'s, so the
 * giver-over-receiver suppression it applies holds here too. The card index is
 * built from that same map, which means a card-kind entry inherits the
 * suppression from each of its printings rather than re-deriving it.
 *
 * Annotations name a printing and nothing else, so the card index needs the
 * catalog to resolve each one to its card. A printing missing from the catalog
 * is skipped; it can't be rendered either.
 * @param annotations The viewer's live-trade annotations, in any order.
 * @param printingsById The catalog, for the printing → card step.
 * @returns Both lookups.
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
 * What a pinned copy shows when the feed carries no annotation for it. The
 * list payload's `reserved` flag and the live-trade feed are two queries, so
 * the entries land first and the annotations resolve a moment later; without
 * this the reservation marker would blink in late on every load. Quantity 1
 * because the tile is one copy.
 * @param printingId The copy's printing.
 * @returns A giver-side reserved annotation for that printing.
 */
function reservedFallback(printingId: string): CardTradeLiveAnnotation {
  return { printingId, role: "giver", phase: "reserved", tradeCount: 1, quantity: 1 };
}

/**
 * The single live-trade annotation a list entry's chip should show, or null
 * when nothing is in flight for it.
 *
 * Per kind:
 * - **card** (wish lists): any printing of the card can fill the wish, so the
 *   whole card's annotations collapse into one status.
 * - **printing** (wish lists): the entry's own printing.
 * - **copy** (tradelists): `reserved` is the per-copy truth for which copy a
 *   trade pinned, so a pinned copy takes its word from the printing's pinned
 *   annotations and an unpinned one takes the printing's unpinned commitments.
 *   Splitting the two keeps a reserved copy from reading as merely offered,
 *   and keeps a free copy from claiming its neighbour's reservation.
 * @param entry The list entry.
 * @param index The viewer's indexed annotations.
 * @returns The annotation to render, or null.
 */
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
