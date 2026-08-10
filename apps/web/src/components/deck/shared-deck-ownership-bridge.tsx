import type { Marketplace } from "@openrift/shared";
import { useEffect } from "react";

import { useCards } from "@/hooks/use-cards";
import type { DeckOwnershipData } from "@/hooks/use-deck-ownership";
import { useDeckOwnership } from "@/hooks/use-deck-ownership";
import { useBorrowedCounts } from "@/hooks/use-loans";
import { useDeckBuildingCounts } from "@/hooks/use-owned-count";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";

interface SharedDeckOwnershipBridgeProps {
  builderCards: DeckBuilderCard[];
  isLoggedIn: boolean;
  marketplace: Marketplace;
  onResult: (data: DeckOwnershipData | undefined) => void;
}

/**
 * Client-only sibling that computes `DeckOwnershipData` for the shared-deck
 * page and publishes it to the parent. Lives outside `DeckOverview` so the
 * shell stays mounted across hydration — only the `ownershipData` prop flips
 * from `undefined` to filled. Render this only when `useHydrated()` is
 * true, and wrap in a Suspense boundary since `useCards()` suspends on the
 * catalog fetch.
 *
 * @returns null — output flows through `onResult`.
 */
export function SharedDeckOwnershipBridge({
  builderCards,
  isLoggedIn,
  marketplace,
  onResult,
}: SharedDeckOwnershipBridgeProps) {
  const { allPrintings } = useCards();
  // No home-collection exemption here: this measures someone else's deck
  // against the viewer's own collection, and the deck's home collection is
  // owner-only anyway (never part of a shared deck's payload).
  const { data: counts } = useDeckBuildingCounts(isLoggedIn);
  const { data: borrowedCounts } = useBorrowedCounts(isLoggedIn);

  // Pass `{}` for logged-out viewers so useDeckOwnership still computes deck
  // pricing (it bails out only when the map is undefined). Matches the
  // previous in-route behavior on the share page.
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
  );

  useEffect(() => {
    onResult(ownershipData);
  }, [ownershipData, onResult]);

  return null;
}
