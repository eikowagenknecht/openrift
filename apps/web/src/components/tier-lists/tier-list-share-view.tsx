import type { PublicTierListDetailResponse } from "@openrift/shared/types/api/tier-list";
import { Link } from "@tanstack/react-router";
import { MonitorPlayIcon } from "lucide-react";
import { Suspense } from "react";

import {
  PageDescription,
  PageTopBar,
  PageTopBarActions,
  PageTopBarButton,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { SelectionDetailOverlays } from "@/components/selection-detail-overlays";
import { TierBoard } from "@/components/tier-lists/tier-board";
import { Skeleton } from "@/components/ui/skeleton";
import { useCards } from "@/hooks/use-cards";
import { useHydrated } from "@/hooks/use-hydrated";
import type { CardViewerItem } from "@/lib/card-viewer-types";
import type { TierCardView } from "@/lib/tier-list-presentation";
import { resolveTierRows, tierRowsToQueue } from "@/lib/tier-list-presentation";
import { cn, PAGE_PADDING, PAGE_WIDTH } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";
import { useSelectionStore } from "@/stores/selection-store";

interface TierListShareViewProps {
  data: PublicTierListDetailResponse;
}

interface TierListSharePageProps extends TierListShareViewProps {
  token: string;
}

export function TierListShareView({ data, token }: TierListSharePageProps) {
  const { tierList, owner } = data;
  const rankedCount = tierList.tiers.reduce((sum, tier) => sum + tier.cards.length, 0);

  return (
    <>
      <PageTopBarSticky width="full">
        <PageTopBar>
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:items-baseline">
            <PageTopBarTitle>{tierList.title}</PageTopBarTitle>
            <span className="text-muted-foreground hidden shrink-0 text-xs sm:inline">
              by {owner.displayName} · {rankedCount} {rankedCount === 1 ? "card" : "cards"} ranked
            </span>
          </div>
          {rankedCount > 0 && (
            <PageTopBarActions>
              <PageTopBarButton
                render={
                  <Link to="/stage" search={{ tierShare: token, i: 0 }}>
                    <MonitorPlayIcon />
                    Present
                  </Link>
                }
              />
            </PageTopBarActions>
          )}
        </PageTopBar>
      </PageTopBarSticky>

      <div className={cn(PAGE_PADDING, PAGE_WIDTH.full, "flex flex-col gap-4 pt-3 pb-6")}>
        {tierList.description ? <PageDescription>{tierList.description}</PageDescription> : null}
        <TierListShareBoard data={data} />
      </div>
    </>
  );
}

function TierListShareBoard({ data }: TierListShareViewProps) {
  const hydrated = useHydrated();
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
  // Board order, so the detail overlay's next/previous walks the ranking as read.
  const items: CardViewerItem[] = tierRowsToQueue(rows);

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
          // No grid here to filter.
        }}
      />
    </>
  );
}
