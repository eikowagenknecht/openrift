import type { Marketplace, PriceLookup, Printing } from "@openrift/shared";
import { preferredPrinting } from "@openrift/shared";

import type { DeckBuilderCard } from "@/lib/deck-builder-card";

import { useEffectiveLanguageOrder } from "./use-effective-language-order";
import { usePrices } from "./use-prices";

export interface CardOwnership {
  cardId: string;
  cardName: string;
  zone: string;
  needed: number;
  owned: number;
  shortfall: number;
  /**
   * Copies sitting in collections excluded from deck building (locked away).
   * These don't reduce the shortfall — the user has to either move them or
   * toggle the collection back on before they count.
   */
  locked: number;
  /**
   * Price for the printing the deck builder shows for this card row — either
   * the explicitly-pinned `preferredPrintingId` or the language-preference
   * canonical fallback. `undefined` when no price is available for that
   * printing on the selected marketplace.
   */
  displayPrice: number | undefined;
  /**
   * The printing whose price backed `displayPrice` — used to deep-link to the
   * matching marketplace product. `undefined` when the card has no printings.
   */
  displayPrinting: { id: string; language: string; shortCode: string } | undefined;
}

export interface DeckOwnershipData {
  /** Per-card ownership keyed by `cardId:zone` */
  byCardZone: Map<string, CardOwnership>;
  totalNeeded: number;
  totalOwned: number;
  totalLocked: number;
  missingCount: number;
  deckValueCents: number | undefined;
  ownedValueCents: number | undefined;
  missingValueCents: number | undefined;
  missingCards: CardOwnership[];
}

/**
 * Compute deck ownership and cost data from deck cards, catalog printings, and owned counts.
 * @returns Aggregated ownership stats, per-card breakdown, and missing cards list.
 */
export function computeDeckOwnership(
  deckCards: DeckBuilderCard[],
  allPrintings: Printing[],
  ownedCountByPrinting: Record<string, number> | undefined,
  marketplace: Marketplace,
  prices: PriceLookup,
  languageOrder: readonly string[],
  lockedCountByPrinting?: Record<string, number>,
): DeckOwnershipData {
  // Intentionally NOT `"use memo"`: when React Compiler memoizes a `"use
  // memo"` helper, it wraps the call site in a cache check. On cache hits
  // the call is skipped, and the helper's own useMemoCache(N) doesn't fire —
  // which shifts every later `_c` slot in the parent fiber's memoCache and
  // produces "previous cache allocated with size X but size Y was requested"
  // warnings. `useDeckOwnership` already memoizes this call via the outer
  // compiler, so there's no benefit to marking this as `"use memo"` too.

  // Index printings by cardId so we can resolve the deck row's preferred
  // printing without scanning the full list per card.
  const printingsByCardId = new Map<string, Printing[]>();
  for (const printing of allPrintings) {
    const bucket = printingsByCardId.get(printing.cardId);
    if (bucket) {
      bucket.push(printing);
    } else {
      printingsByCardId.set(printing.cardId, [printing]);
    }
  }

  // Build owned count by cardId (sum across all printings)
  const ownedByCardId = new Map<string, number>();
  if (ownedCountByPrinting) {
    for (const printing of allPrintings) {
      const count = ownedCountByPrinting[printing.id] ?? 0;
      if (count > 0) {
        ownedByCardId.set(printing.cardId, (ownedByCardId.get(printing.cardId) ?? 0) + count);
      }
    }
  }

  // Same fan-out for copies sitting in excluded ("locked") collections.
  const lockedByCardId = new Map<string, number>();
  if (lockedCountByPrinting) {
    for (const printing of allPrintings) {
      const count = lockedCountByPrinting[printing.id] ?? 0;
      if (count > 0) {
        lockedByCardId.set(printing.cardId, (lockedByCardId.get(printing.cardId) ?? 0) + count);
      }
    }
  }

  // Track how many copies have been "claimed" across zones for each card.
  // A user who owns 2 copies of a card in main (need 3) and sideboard (need 1)
  // should see the total 2 distributed across zones. Locked copies use a
  // separate tracker so they're attributed in zone order without competing
  // with available copies.
  const claimedByCardId = new Map<string, number>();
  const claimedLockedByCardId = new Map<string, number>();

  const byCardZone = new Map<string, CardOwnership>();
  const missingCards: CardOwnership[] = [];
  let totalNeeded = 0;
  let totalOwned = 0;
  let totalLocked = 0;
  let missingCount = 0;
  let hasPrices = false;
  let deckValueCents = 0;
  let ownedValueCents = 0;
  let missingValueCents = 0;

  for (const card of deckCards) {
    const totalOwnedForCard = ownedByCardId.get(card.cardId) ?? 0;
    const alreadyClaimed = claimedByCardId.get(card.cardId) ?? 0;
    const availableForZone = Math.max(0, totalOwnedForCard - alreadyClaimed);
    const ownedInZone = Math.min(card.quantity, availableForZone);
    const shortfall = card.quantity - ownedInZone;

    claimedByCardId.set(card.cardId, alreadyClaimed + ownedInZone);

    // Locked copies cover whatever's still missing after available copies are
    // applied — capped at the remaining shortfall so a card with 4 locked
    // copies but only 1 still needed reports `locked: 1`, not 4.
    const totalLockedForCard = lockedByCardId.get(card.cardId) ?? 0;
    const alreadyClaimedLocked = claimedLockedByCardId.get(card.cardId) ?? 0;
    const lockedAvailableForZone = Math.max(0, totalLockedForCard - alreadyClaimedLocked);
    const lockedInZone = Math.min(shortfall, lockedAvailableForZone);
    claimedLockedByCardId.set(card.cardId, alreadyClaimedLocked + lockedInZone);

    // Resolve the printing the deck builder displays for this row, mirroring
    // `usePreferredPrinting`: explicit pin first, then language-preference
    // canonical fallback. Pricing the wrong language variant here would let
    // a cheaper non-EN printing bleed into the missing-cards dialog even
    // when the deck row pins (or canonically resolves to) EN.
    const candidates = printingsByCardId.get(card.cardId) ?? [];
    let resolvedPrinting: Printing | undefined;
    if (card.preferredPrintingId) {
      resolvedPrinting = candidates.find((p) => p.id === card.preferredPrintingId);
    }
    if (!resolvedPrinting) {
      resolvedPrinting = preferredPrinting(candidates, languageOrder);
    }

    const displayPrice = resolvedPrinting
      ? prices.get(resolvedPrinting.id, marketplace)
      : undefined;
    const displayPrinting = resolvedPrinting
      ? {
          id: resolvedPrinting.id,
          language: resolvedPrinting.language,
          shortCode: resolvedPrinting.shortCode,
        }
      : undefined;

    const entry: CardOwnership = {
      cardId: card.cardId,
      cardName: card.cardName,
      zone: card.zone,
      needed: card.quantity,
      owned: ownedInZone,
      shortfall,
      locked: lockedInZone,
      displayPrice,
      displayPrinting,
    };

    byCardZone.set(`${card.cardId}:${card.zone}`, entry);
    totalNeeded += card.quantity;
    totalOwned += ownedInZone;
    totalLocked += lockedInZone;

    if (shortfall > 0) {
      missingCount += shortfall;
      missingCards.push(entry);
    }

    if (displayPrice !== undefined) {
      hasPrices = true;
      deckValueCents += displayPrice * card.quantity;
      ownedValueCents += displayPrice * ownedInZone;
      missingValueCents += displayPrice * shortfall;
    }
  }

  return {
    byCardZone,
    totalNeeded,
    totalOwned,
    totalLocked,
    missingCount,
    deckValueCents: hasPrices ? deckValueCents : undefined,
    ownedValueCents: hasPrices ? ownedValueCents : undefined,
    missingValueCents: hasPrices ? missingValueCents : undefined,
    missingCards,
  };
}

/**
 * Hook that computes deck ownership and cost data.
 * @returns DeckOwnershipData with per-card and aggregate stats.
 */
export function useDeckOwnership(
  deckCards: DeckBuilderCard[],
  allPrintings: Printing[],
  ownedCountByPrinting: Record<string, number> | undefined,
  marketplace: Marketplace,
  lockedCountByPrinting?: Record<string, number>,
): DeckOwnershipData | undefined {
  const prices = usePrices();
  const languageOrder = useEffectiveLanguageOrder();
  if (!ownedCountByPrinting) {
    return undefined;
  }
  return computeDeckOwnership(
    deckCards,
    allPrintings,
    ownedCountByPrinting,
    marketplace,
    prices,
    languageOrder,
    lockedCountByPrinting,
  );
}
