import type { DeckZone, Marketplace, PriceLookup, Printing, Rarity } from "@openrift/shared";
import { WellKnown, getOrientation, legendDisplayName, preferredPrinting } from "@openrift/shared";

import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { REQUIRED_ZONES } from "@/lib/deck-zone-labels";

import { useEffectiveLanguageOrder } from "./use-effective-language-order";
import { usePrices } from "./use-prices";

export interface CardOwnership {
  cardId: string;
  /** Canonical catalog name — used for marketplace search URLs and the copy/paste buy-list. */
  cardName: string;
  /**
   * Card slug for linking to the in-app card detail page. Resolved from the
   * display printing; `undefined` when the card has no printings in the catalog.
   */
  cardSlug: string | undefined;
  /** Colloquial Legend name ("Azir, Emperor of the Sands") for on-screen display only. */
  displayName: string;
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
   * How many of this card's locked copies (anywhere in the deck, not just
   * this zone) are locked for each reason: out on loan, reserved for a live
   * outgoing trade, or sitting in a collection excluded from deck building.
   * Used only to word the "why is this locked" tooltip — the displayed count
   * is still `locked`, which is capped to this zone's shortfall.
   */
  lockedLoaned: number;
  lockedReserved: number;
  lockedExcluded: number;
  /**
   * Copies the viewer is currently borrowing from a friend (ADR-039,
   * acknowledged active loans). Borrowed copies are physically in hand, so
   * they DO reduce the shortfall — shown separately because they aren't owned.
   */
  borrowed: number;
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
  displayPrinting: OwnershipPrinting | undefined;
  /**
   * Cheapest priced printing that fills this card's shortfall, preferring the
   * viewer's languages. A creator can pin a premium printing; the viewer
   * completing the deck buys the cheapest copy they accept, so missing-cards
   * pricing uses this instead of `displayPrice`. `undefined` when nothing is
   * missing or no printing has a price.
   */
  completionPrice: number | undefined;
  completionPrinting: OwnershipPrinting | undefined;
}

interface OwnershipPrinting {
  id: string;
  language: string;
  shortCode: string;
  rarity: Rarity;
  imageId: string | undefined;
  /** True for Battlefields — their art is stored landscape and rotated for display. */
  landscape: boolean;
}

/**
 * Projects a catalog printing down to the fields the ownership consumers
 * (missing-cards dialog, list rows) render and deep-link with.
 * @returns The compact printing shape.
 */
function toOwnershipPrinting(printing: Printing): OwnershipPrinting {
  return {
    id: printing.id,
    language: printing.language,
    shortCode: printing.shortCode,
    rarity: printing.rarity,
    imageId: printing.images[0]?.imageId,
    landscape: getOrientation(printing.card.types) === "landscape",
  };
}

/**
 * Tooltip sentence for a row's locked copies — the count capped to this zone's
 * shortfall, the reasons drawn from the card-wide breakdown ("why is this
 * locked"). Only meaningful when `entry.locked > 0`.
 * @returns One sentence naming the locked copies and why they don't count.
 */
export function lockedReasonText(entry: CardOwnership): string {
  const reasons: string[] = [];
  if (entry.lockedLoaned > 0) {
    reasons.push("out on loan");
  }
  if (entry.lockedReserved > 0) {
    reasons.push("reserved for a trade");
  }
  if (entry.lockedExcluded > 0) {
    reasons.push("in a collection excluded from deck building");
  }
  const why = reasons.length > 0 ? reasons.join(" or ") : "unavailable for deck building";
  return entry.locked === 1
    ? `1 more copy is locked: ${why}`
    : `${entry.locked} more copies are locked: ${why}`;
}

/**
 * Zones whose cards make up the deck proper. Overflow is a free parking zone
 * (see `COPY_LIMIT_ZONES` in `use-deck-builder`) — cards stashed there aren't
 * part of the deck, so they're left out of every ownership and cost total.
 * @returns True when the zone counts toward ownership and value.
 */
function isCountedZone(zone: string): boolean {
  return zone !== WellKnown.deckZone.OVERFLOW;
}

/** The deck proper — the zones behind the "X / 56" completion figure. */
const REQUIRED_ZONE_SET: ReadonlySet<DeckZone> = new Set(REQUIRED_ZONES);

export interface DeckOwnershipData {
  /**
   * Per-card ownership keyed by `cardId:zone`. Overflow rows are present so
   * they still render owned counts and prices, but they don't feed the totals.
   */
  byCardZone: Map<string, CardOwnership>;
  totalNeeded: number;
  totalOwned: number;
  /**
   * Needed/owned across the deck proper only (legend, champion, runes,
   * battlefields, main — no sideboard). This is the basis the hero's owned
   * chip displays, so its denominator matches the "X / 56" completion figure.
   * `totalNeeded`/`totalOwned` above keep counting the sideboard for the
   * missing-cards flows.
   */
  requiredZoneNeeded: number;
  requiredZoneOwned: number;
  /**
   * Per card, the canonical-ranked printing the viewer actually owns copies
   * of — drives the "show my printings" display toggle. Absent when the
   * viewer owns none.
   */
  ownedPrintingByCardId: ReadonlyMap<string, OwnershipPrinting>;
  totalLocked: number;
  totalBorrowed: number;
  missingCount: number;
  /**
   * `missingCount` split by scope: shortfall inside the deck proper vs the
   * sideboard. The hero's ownership chip renders them as "4 + 2 side missing"
   * so the deck-proper fraction next to it can't read as contradicting the
   * missing figure. Always sums to `missingCount`.
   */
  requiredZoneMissing: number;
  sideboardMissing: number;
  deckValueCents: number | undefined;
  /** Deck value excluding the sideboard — legend, champion, runes, battlefields, main. */
  mainValueCents: number | undefined;
  /** Deck value of the sideboard zone alone. */
  sideboardValueCents: number | undefined;
  ownedValueCents: number | undefined;
  /**
   * Cost to buy every missing copy the cheapest way, preferring the viewer's
   * languages (see {@link CardOwnership.completionPrice}).
   */
  missingValueCents: number | undefined;
  /**
   * Cost of the missing copies at the deck's displayed printings (the
   * creator's pins). Shown alongside the cheapest figure when they differ.
   */
  missingAsDisplayedValueCents: number | undefined;
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
  borrowedCountByPrinting?: Record<string, number>,
  lockedReasonCountByPrinting?: {
    loaned: Record<string, number>;
    reserved: Record<string, number>;
    excluded: Record<string, number>;
  },
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

  // And for borrowed copies (ADR-039) — in hand, buildable, not owned.
  const borrowedByCardId = new Map<string, number>();
  if (borrowedCountByPrinting) {
    for (const printing of allPrintings) {
      const count = borrowedCountByPrinting[printing.id] ?? 0;
      if (count > 0) {
        borrowedByCardId.set(printing.cardId, (borrowedByCardId.get(printing.cardId) ?? 0) + count);
      }
    }
  }

  // Same fan-out for the locked reason breakdown, used only to word the "why
  // locked" tooltip — the capped `lockedByCardId` above still owns the actual
  // displayed count, so these aren't re-capped per zone.
  const loanedByCardId = new Map<string, number>();
  if (lockedReasonCountByPrinting?.loaned) {
    for (const printing of allPrintings) {
      const count = lockedReasonCountByPrinting.loaned[printing.id] ?? 0;
      if (count > 0) {
        loanedByCardId.set(printing.cardId, (loanedByCardId.get(printing.cardId) ?? 0) + count);
      }
    }
  }

  const reservedByCardId = new Map<string, number>();
  if (lockedReasonCountByPrinting?.reserved) {
    for (const printing of allPrintings) {
      const count = lockedReasonCountByPrinting.reserved[printing.id] ?? 0;
      if (count > 0) {
        reservedByCardId.set(printing.cardId, (reservedByCardId.get(printing.cardId) ?? 0) + count);
      }
    }
  }

  const excludedByCardId = new Map<string, number>();
  if (lockedReasonCountByPrinting?.excluded) {
    for (const printing of allPrintings) {
      const count = lockedReasonCountByPrinting.excluded[printing.id] ?? 0;
      if (count > 0) {
        excludedByCardId.set(printing.cardId, (excludedByCardId.get(printing.cardId) ?? 0) + count);
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
  const claimedBorrowedByCardId = new Map<string, number>();

  const byCardZone = new Map<string, CardOwnership>();
  const ownedPrintingByCardId = new Map<string, OwnershipPrinting>();
  const missingCards: CardOwnership[] = [];
  let totalNeeded = 0;
  let totalOwned = 0;
  let requiredZoneNeeded = 0;
  let requiredZoneOwned = 0;
  let totalLocked = 0;
  let totalBorrowed = 0;
  let missingCount = 0;
  let requiredZoneMissing = 0;
  let sideboardMissing = 0;
  let hasPrices = false;
  let deckValueCents = 0;
  let mainValueCents = 0;
  let sideboardValueCents = 0;
  let ownedValueCents = 0;
  let missingValueCents = 0;
  let missingAsDisplayedValueCents = 0;

  // Overflow rows are walked last so a stashed copy never claims an owned copy
  // ahead of the zone that actually needs it — their own owned/borrowed numbers
  // are whatever the deck proper left over.
  const orderedCards = deckCards.toSorted(
    (left, right) => Number(isCountedZone(right.zone)) - Number(isCountedZone(left.zone)),
  );

  for (const card of orderedCards) {
    const counted = isCountedZone(card.zone);
    const totalOwnedForCard = ownedByCardId.get(card.cardId) ?? 0;
    const alreadyClaimed = claimedByCardId.get(card.cardId) ?? 0;
    const availableForZone = Math.max(0, totalOwnedForCard - alreadyClaimed);
    const ownedInZone = Math.min(card.quantity, availableForZone);

    claimedByCardId.set(card.cardId, alreadyClaimed + ownedInZone);

    // Borrowed copies (ADR-039) are physically in hand, so they cover need
    // that owned copies don't — reducing the shortfall, tracked separately.
    const totalBorrowedForCard = borrowedByCardId.get(card.cardId) ?? 0;
    const alreadyClaimedBorrowed = claimedBorrowedByCardId.get(card.cardId) ?? 0;
    const borrowedAvailableForZone = Math.max(0, totalBorrowedForCard - alreadyClaimedBorrowed);
    const borrowedInZone = Math.min(card.quantity - ownedInZone, borrowedAvailableForZone);
    claimedBorrowedByCardId.set(card.cardId, alreadyClaimedBorrowed + borrowedInZone);

    const shortfall = card.quantity - ownedInZone - borrowedInZone;

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

    // The canonical-ranked printing the viewer owns, for the "show my
    // printings" display toggle. Computed once per card (first zone wins).
    if (!ownedPrintingByCardId.has(card.cardId) && ownedCountByPrinting) {
      const ownedCandidates = candidates.filter(
        (candidate) => (ownedCountByPrinting[candidate.id] ?? 0) > 0,
      );
      const bestOwned = preferredPrinting(ownedCandidates, languageOrder);
      if (bestOwned) {
        ownedPrintingByCardId.set(card.cardId, toOwnershipPrinting(bestOwned));
      }
    }

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
    const displayPrinting = resolvedPrinting ? toOwnershipPrinting(resolvedPrinting) : undefined;

    // Cheapest way to fill this card's remaining copies. First tier: printings
    // in the viewer's languages (`languageOrder` is their preference list when
    // set, every language otherwise). Fallback tier: any priced printing.
    let completionPrice: number | undefined;
    let completionResolved: Printing | undefined;
    if (shortfall > 0) {
      const pools = [
        candidates.filter((candidate) => languageOrder.includes(candidate.language)),
        candidates,
      ];
      for (const pool of pools) {
        for (const candidate of pool) {
          const price = prices.get(candidate.id, marketplace);
          if (price !== undefined && (completionPrice === undefined || price < completionPrice)) {
            completionPrice = price;
            completionResolved = candidate;
          }
        }
        if (completionPrice !== undefined) {
          break;
        }
      }
    }
    const completionPrinting = completionResolved
      ? toOwnershipPrinting(completionResolved)
      : undefined;

    const entry: CardOwnership = {
      cardId: card.cardId,
      cardName: card.cardName,
      cardSlug: resolvedPrinting?.card.slug,
      displayName: legendDisplayName({
        name: card.cardName,
        types: card.cardTypes,
        tags: card.tags,
      }),
      zone: card.zone,
      needed: card.quantity,
      owned: ownedInZone,
      shortfall,
      locked: lockedInZone,
      lockedLoaned: loanedByCardId.get(card.cardId) ?? 0,
      lockedReserved: reservedByCardId.get(card.cardId) ?? 0,
      lockedExcluded: excludedByCardId.get(card.cardId) ?? 0,
      borrowed: borrowedInZone,
      displayPrice,
      displayPrinting,
      completionPrice,
      completionPrinting,
    };

    byCardZone.set(`${card.cardId}:${card.zone}`, entry);

    if (!counted) {
      continue;
    }

    totalNeeded += card.quantity;
    totalOwned += ownedInZone;
    totalLocked += lockedInZone;
    totalBorrowed += borrowedInZone;
    if (REQUIRED_ZONE_SET.has(card.zone)) {
      requiredZoneNeeded += card.quantity;
      requiredZoneOwned += ownedInZone;
    }

    if (shortfall > 0) {
      missingCount += shortfall;
      // The only counted zone outside the deck proper is the sideboard.
      if (REQUIRED_ZONE_SET.has(card.zone)) {
        requiredZoneMissing += shortfall;
      } else {
        sideboardMissing += shortfall;
      }
      missingCards.push(entry);
    }

    if (displayPrice !== undefined) {
      hasPrices = true;
      deckValueCents += displayPrice * card.quantity;
      if (card.zone === WellKnown.deckZone.SIDEBOARD) {
        sideboardValueCents += displayPrice * card.quantity;
      } else {
        mainValueCents += displayPrice * card.quantity;
      }
      ownedValueCents += displayPrice * ownedInZone;
      missingAsDisplayedValueCents += displayPrice * shortfall;
    }
    // Missing cost uses the cheapest acceptable printing; fall back to the
    // displayed one when nothing cheaper is priced.
    const completionPerCopy = completionPrice ?? displayPrice;
    if (completionPerCopy !== undefined && shortfall > 0) {
      hasPrices = true;
      missingValueCents += completionPerCopy * shortfall;
    }
  }

  return {
    byCardZone,
    totalNeeded,
    totalOwned,
    requiredZoneNeeded,
    requiredZoneOwned,
    ownedPrintingByCardId,
    totalLocked,
    totalBorrowed,
    missingCount,
    requiredZoneMissing,
    sideboardMissing,
    deckValueCents: hasPrices ? deckValueCents : undefined,
    mainValueCents: hasPrices ? mainValueCents : undefined,
    sideboardValueCents: hasPrices ? sideboardValueCents : undefined,
    ownedValueCents: hasPrices ? ownedValueCents : undefined,
    missingValueCents: hasPrices ? missingValueCents : undefined,
    missingAsDisplayedValueCents: hasPrices ? missingAsDisplayedValueCents : undefined,
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
  borrowedCountByPrinting?: Record<string, number>,
  lockedReasonCountByPrinting?: {
    loaned: Record<string, number>;
    reserved: Record<string, number>;
    excluded: Record<string, number>;
  },
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
    borrowedCountByPrinting,
    lockedReasonCountByPrinting,
  );
}
