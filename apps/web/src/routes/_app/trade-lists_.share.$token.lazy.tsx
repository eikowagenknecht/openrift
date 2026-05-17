import type { PublicTradeListDetailResponse } from "@openrift/shared";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { createPortal } from "react-dom";

import { CardThumbnail, useCardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import {
  PAGE_TOP_BAR_STICKY,
  PageTopBar,
  PageTopBarHeightContext,
  PageTopBarTitle,
  useMeasuredHeight,
} from "@/components/layout/page-top-bar";
import { useCards } from "@/hooks/use-cards";
import { useHydrated } from "@/hooks/use-hydrated";
import { usePublicTradeList } from "@/hooks/use-trade-lists";

export const Route = createLazyFileRoute("/_app/trade-lists_/share/$token")({
  component: SharedTradeListPage,
});

function SharedTradeListPage() {
  const [topBarSlot, setTopBarSlot] = useState<HTMLDivElement | null>(null);
  const topBarHeight = useMeasuredHeight(topBarSlot);

  return (
    <PageTopBarHeightContext value={topBarHeight}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div ref={setTopBarSlot} className={PAGE_TOP_BAR_STICKY} />
        <SharedTradeListContent topBarSlot={topBarSlot} />
      </div>
    </PageTopBarHeightContext>
  );
}

function SharedTradeListContent({ topBarSlot }: { topBarSlot: HTMLDivElement | null }) {
  const { token } = Route.useParams();
  const { data } = usePublicTradeList(token);

  const topBar = (
    <PageTopBar>
      <PageTopBarTitle>{data.tradeList.name}</PageTopBarTitle>
      <span className="text-muted-foreground hidden shrink-0 items-center gap-x-1.5 text-xs sm:flex">
        <span>Shared by {data.owner.displayName}</span>
        <span>
          · {data.items.length} {data.items.length === 1 ? "copy" : "copies"}
        </span>
      </span>
    </PageTopBar>
  );

  return (
    <>
      {topBarSlot && createPortal(topBar, topBarSlot)}
      <div className="flex min-w-0 flex-1 flex-col px-3 pb-3">
        <SharedTradeListBody data={data} />
      </div>
    </>
  );
}

function SharedTradeListBody({ data }: { data: PublicTradeListDetailResponse }) {
  const hydrated = useHydrated();
  // CardThumbnail relies on useCards (live catalog query) which is SSR-unsafe.
  // The top bar (name + owner + count) renders before hydration; the grid waits.
  if (!hydrated) {
    return null;
  }
  return <SharedTradeListGrid data={data} />;
}

function SharedTradeListGrid({ data }: { data: PublicTradeListDetailResponse }) {
  const navigate = useNavigate();
  const { printingsById } = useCards();
  const display = useCardThumbnailDisplay();

  if (data.items.length === 0) {
    return <p className="text-muted-foreground py-3 text-sm">This trade list is empty.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-3 py-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {data.items.map((item) => {
        const printing = printingsById[item.printingId];
        if (!printing) {
          return null;
        }
        return (
          <CardThumbnail
            key={item.id}
            printing={printing}
            onClick={() =>
              void navigate({
                to: "/cards/$cardSlug",
                params: { cardSlug: printing.card.slug },
              })
            }
            showImages
            view="printings"
            display={display}
          />
        );
      })}
    </div>
  );
}
