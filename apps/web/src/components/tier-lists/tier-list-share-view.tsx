import type { PublicTierListDetailResponse } from "@openrift/shared";
import { Suspense } from "react";

import type { CardViewerItem } from "@/components/card-viewer-types";
import {
  PageDescription,
  PageTopBar,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { SelectionDetailOverlays } from "@/components/selection-detail-overlays";
import { resolveTierRows, TierBoard } from "@/components/tier-lists/tier-board";
import type { TierCardView } from "@/components/tier-lists/tier-card-tile";
import { Skeleton } from "@/components/ui/skeleton";
import { useCards } from "@/hooks/use-cards";
import { useHydrated } from "@/hooks/use-hydrated";
import { CONTAINER_WIDTH, PAGE_PADDING, cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";
import { useSelectionStore } from "@/stores/selection-store";

interface TierListShareViewProps {
  data: PublicTierListDetailResponse;
}

/**
 * Public, read-only view of a shared tier list.
 *
 * The title, byline, and blurb render server-side so a crawler (and the link
 * unfurl's fallback) sees them; the board itself waits for hydration because it
 * resolves cards against the client-held catalogue.
 *
 * @returns The share page node.
 */
export function TierListShareView({ data }: TierListShareViewProps) {
  const { tierList, owner } = data;
  const rankedCount = tierList.tiers.reduce((sum, tier) => sum + tier.cardIds.length, 0);

  return (
    <>
      <PageTopBarSticky maxWidth="5xl">
        <PageTopBar>
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:items-baseline">
            <PageTopBarTitle>{tierList.title}</PageTopBarTitle>
            <span className="text-muted-foreground hidden shrink-0 text-xs sm:inline">
              by {owner.displayName} · {rankedCount} {rankedCount === 1 ? "card" : "cards"} ranked
            </span>
          </div>
        </PageTopBar>
      </PageTopBarSticky>

      <div className={cn(PAGE_PADDING, CONTAINER_WIDTH, "flex flex-col gap-4 pt-3 pb-6")}>
        {tierList.description ? <PageDescription>{tierList.description}</PageDescription> : null}
        <TierListShareBoard data={data} />
      </div>
    </>
  );
}

function TierListShareBoard({ data }: TierListShareViewProps) {
  const hydrated = useHydrated();
  // The board resolves card ids against the client-held catalogue, so there is
  // nothing to render server-side; the title and blurb above already carry the
  // page's meaning for a crawler.
  if (!hydrated) {
    return <Skeleton className="h-72 w-full" />;
  }
  return (
    <Suspense fallback={<Skeleton className="h-72 w-full" />}>
      <TierListShareBoardInner data={data} />
    </Suspense>
  );
}

function TierListShareBoardInner({ data }: TierListShareViewProps) {
  const { cardsById, printingsByCardId } = useCards();
  const showImages = useDisplayStore((state) => state.showImages);

  const rows = resolveTierRows(data.tierList.tiers, cardsById, printingsByCardId);
  // Every ranked card, in board order, so the detail overlay's next/previous
  // walks the ranking the way it reads.
  const items: CardViewerItem[] = rows.flatMap((row) =>
    row.cards.flatMap((view): CardViewerItem[] =>
      view.printing ? [{ id: view.printing.id, printing: view.printing }] : [],
    ),
  );

  const handleCardClick = (view: TierCardView) => {
    if (view.printing) {
      useSelectionStore.getState().selectCard(view.printing, items, "card");
    }
  };

  return (
    <>
      <TierBoard rows={rows} onCardClick={handleCardClick} />
      <SelectionDetailOverlays
        items={items}
        printingsByCardId={printingsByCardId}
        showImages={showImages}
        onSearchAndClose={() => {
          // No grid here for a search to drive, so tag and keyword chips in the
          // detail have nothing to filter — swallow the click rather than
          // navigating the viewer away from the ranking they came to see.
        }}
      />
    </>
  );
}
