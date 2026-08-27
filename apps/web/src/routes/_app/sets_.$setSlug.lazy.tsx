import type { Printing } from "@openrift/shared";
import { deduplicateByCard } from "@openrift/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createLazyFileRoute, useNavigate } from "@tanstack/react-router";

import { CardThumbnail, useCardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import {
  PageTopBar,
  PageTopBarActions,
  PageTopBarBack,
  PageTopBarPrimaryButton,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffectiveLanguageOrder } from "@/hooks/use-effective-language-order";
import { publicSetDetailQueryOptions } from "@/hooks/use-public-sets";
import { PAGE_PADDING } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

export const Route = createLazyFileRoute("/_app/sets_/$setSlug")({
  component: SetDetailPage,
  pendingComponent: SetDetailPending,
});

// Mirrors the grid below: cols 2 / 3@640 / 4@768 / 5@1024 / 6@1280 / 8@1536,
// gap-4 (16px) between cells, p-1.5 (6px) inside each cell, inside _app's
// CONTAINER_WIDTH cap (1280 → 1720@wide → 2160@xwide → 2560@xxwide) plus
// PAGE_PADDING (px-3 = -24px). Once the cap binds the per-cell size is
// constant, so the wide breakpoints use fixed px values.
const SETS_CARD_SIZES =
  "(min-width: 2560px) 291px, (min-width: 2160px) 240px, (min-width: 1720px) 186px, (min-width: 1536px) 131px, (min-width: 1280px) 184px, (min-width: 1024px) calc((100vw - 88px) / 5 - 12px), (min-width: 768px) calc((100vw - 72px) / 4 - 12px), (min-width: 640px) calc((100vw - 56px) / 3 - 12px), calc((100vw - 40px) / 2 - 12px)";

const SET_GRID =
  "grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8";

function SetDetailPage() {
  const { setSlug } = Route.useParams();
  const { data } = useSuspenseQuery(publicSetDetailQueryOptions(setSlug));
  const navigate = useNavigate();
  const showImages = useDisplayStore((s) => s.showImages);
  const display = useCardThumbnailDisplay();
  const effectiveLanguageOrder = useEffectiveLanguageOrder();

  const uniquePrintings = deduplicateByCard(data.printings, effectiveLanguageOrder);
  const printingsByCardId = Map.groupBy(data.printings, (printing) => printing.cardId);

  const handleCardClick = (printing: Printing) => {
    void navigate({ to: "/cards/$cardSlug", params: { cardSlug: printing.card.slug } });
  };

  return (
    <>
      <PageTopBarSticky>
        <PageTopBar>
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:items-baseline">
            <PageTopBarBack to="/sets" aria-label="Back to sets" />
            <PageTopBarTitle>{data.set.name}</PageTopBarTitle>
            <span className="text-muted-foreground hidden shrink-0 text-xs sm:inline">
              {uniquePrintings.length} {uniquePrintings.length === 1 ? "card" : "cards"},{" "}
              {data.printings.length} {data.printings.length === 1 ? "printing" : "printings"}
            </span>
          </div>
          <PageTopBarActions>
            <PageTopBarPrimaryButton render={<Link to="/cards" search={{ sets: [setSlug] }} />}>
              Open in card browser
            </PageTopBarPrimaryButton>
          </PageTopBarActions>
        </PageTopBar>
      </PageTopBarSticky>

      <div className={PAGE_PADDING}>
        <div className={SET_GRID}>
          {uniquePrintings.map((printing) => (
            <CardThumbnail
              key={printing.id}
              printing={printing}
              onClick={handleCardClick}
              showImages={showImages}
              display={display}
              sizes={SETS_CARD_SIZES}
              view="cards"
              siblings={printingsByCardId.get(printing.cardId)}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function SetDetailPending() {
  return (
    <>
      <PageTopBarSticky>
        <PageTopBar>
          <Skeleton className="h-5 w-48" />
        </PageTopBar>
      </PageTopBarSticky>
      <div className={PAGE_PADDING}>
        <div className={SET_GRID}>
          {Array.from({ length: 20 }, (_, i) => (
            <div key={i} className="p-1.5">
              <Skeleton className="aspect-card rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
