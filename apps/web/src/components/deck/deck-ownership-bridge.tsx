import type { Marketplace } from "@openrift/shared";
import { useEffect } from "react";

import { useIncomingTradeCounts } from "@/hooks/use-card-trades";
import { useCards } from "@/hooks/use-cards";
import { useDeckOwnership } from "@/hooks/use-deck-ownership";
import { useBorrowedCounts } from "@/hooks/use-loans";
import { useDeckBuildingCounts } from "@/hooks/use-owned-count";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import type { OwnershipBandSources } from "@/lib/deck-ownership-band";
import { collectOwnershipBandSources, sameOwnershipBandSources } from "@/lib/deck-ownership-band";
import type { DeckOwnershipData } from "@/lib/deck-ownership-types";

interface DeckOwnershipBridgeProps {
  builderCards: DeckBuilderCard[];
  isLoggedIn: boolean;
  marketplace: Marketplace;
  onResult: (data: DeckOwnershipData | undefined) => void;
}

/**
 * Client-only: computes `DeckOwnershipData` for a deck the viewer doesn't own.
 * Render only after `useHydrated()` is true, inside a Suspense boundary —
 * `useCards()` and `usePrices()` both suspend on their fetches.
 */
export function DeckOwnershipBridge({
  builderCards,
  isLoggedIn,
  marketplace,
  onResult,
}: DeckOwnershipBridgeProps) {
  const { allPrintings } = useCards();
  // No home-collection exemption here: the deck's home collection is owner-only
  // and never part of a shared deck's payload.
  const { data: counts } = useDeckBuildingCounts(isLoggedIn);
  const { data: borrowedCounts } = useBorrowedCounts(isLoggedIn);
  // Cards from reserved trades are not in hand: advisory only, so the user
  // doesn't buy a copy that's already on its way.
  const { data: incomingCounts } = useIncomingTradeCounts(isLoggedIn);

  // Pass `{}` for logged-out viewers so useDeckOwnership still computes pricing;
  // it bails out only when the map is undefined.
  const ownershipData = useDeckOwnership(
    builderCards,
    allPrintings,
    counts?.available ?? (isLoggedIn ? undefined : {}),
    marketplace,
    counts?.locked,
    borrowedCounts,
    counts && {
      loaned: counts.lockedLoaned,
      reserved: counts.lockedReserved,
      excluded: counts.lockedExcluded,
    },
    incomingCounts,
  );

  useEffect(() => {
    onResult(ownershipData);
  }, [ownershipData, onResult]);

  return null;
}

/**
 * Client-only: gathers deck-building copy counts and catalog printings, using
 * "available" counts since copies in excluded collections can't be sleeved.
 */
export function OwnershipBandSourcesBridge({
  cards,
  homeCollectionId,
  onResult,
}: {
  cards: DeckBuilderCard[];
  homeCollectionId?: string | null;
  onResult: React.Dispatch<React.SetStateAction<OwnershipBandSources | undefined>>;
}) {
  const { printingsByCardId } = useCards();
  const { getPreferredPrinting } = usePreferredPrinting();
  const { data } = useDeckBuildingCounts(true, homeCollectionId);
  // Borrowed copies come from the loans feed, not the copies collection, so
  // they are never phantom copy rows.
  const { data: borrowedCounts } = useBorrowedCounts(true);
  const sources = data
    ? collectOwnershipBandSources(
        cards,
        printingsByCardId,
        getPreferredPrinting,
        data.available,
        data.locked,
        borrowedCounts,
      )
    : undefined;
  useEffect(() => {
    onResult((previous) => (sameOwnershipBandSources(previous, sources) ? previous : sources));
  }, [sources, onResult]);
  return null;
}
