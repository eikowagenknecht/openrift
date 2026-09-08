import type { Printing } from "@openrift/shared/types/catalog";
import { legendDisplayName } from "@openrift/shared/utils";
import { useSuspenseQuery } from "@tanstack/react-query";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { PencilLineIcon } from "lucide-react";

import {
  PageTopBar,
  PageTopBarActions,
  PageTopBarBack,
  PageTopBarButton,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { Card as CardPanel } from "@/components/ui/card";
import { CollectionSlot } from "@/features/cards/components/card-page-collection-slot";
import { CardPageFactRows } from "@/features/cards/components/card-page-fact-rows";
import { CardPageHero } from "@/features/cards/components/card-page-hero";
import { CardPageInfoTable } from "@/features/cards/components/card-page-info-table";
import { PriceHistorySection } from "@/features/cards/components/card-page-price-history";
import { CardPagePrintings } from "@/features/cards/components/card-page-printings";
import { RelatedCardsSection } from "@/features/cards/components/card-page-related-cards";
import { ShareLinkButton } from "@/features/cards/components/card-page-share-button";
import { cardDetailQueryOptions } from "@/features/cards/hooks/use-card-detail";
import { resolveCardMetaPrinting } from "@/features/cards/lib/card-meta";
import { useEffectiveLanguageOrder } from "@/hooks/use-effective-language-order";
import { cn, PAGE_PADDING, PAGE_PADDING_NO_TOP, PAGE_WIDTH } from "@/lib/utils";

const routeApi = getRouteApi("/_app/cards_/$cardSlug/{-$printingSlug}");

export function CardDetailPage() {
  const { cardSlug, printingSlug } = routeApi.useParams();
  const { printingId: linkedPrintingId } = routeApi.useSearch();
  const navigate = useNavigate();
  const { data } = useSuspenseQuery(cardDetailQueryOptions(cardSlug));
  const { card, sets } = data;
  const effectiveLanguageOrder = useEffectiveLanguageOrder();
  const rankByLang = new Map(effectiveLanguageOrder.map((lang, i) => [lang, i]));
  const unlistedRank = effectiveLanguageOrder.length;
  const printings = data.printings.toSorted((a, b) => {
    const aRank = rankByLang.get(a.language) ?? unlistedRank;
    const bRank = rankByLang.get(b.language) ?? unlistedRank;
    return aRank - bRank || a.canonicalRank - b.canonicalRank;
  });
  // Derived from the URL, not useState: the route stays mounted across
  // `$cardSlug` changes, and state would keep showing the previous card's printing.
  const selectedPrinting = resolveCardMetaPrinting(
    printings,
    printingSlug ?? linkedPrintingId,
    effectiveLanguageOrder,
  );

  // Mirrored into the path; the route's `head()` reads it for deep-link unfurls.
  // `?printingId=` is dropped on the way, so the two never disagree.
  const selectPrinting = (printing: Printing) => {
    void navigate({
      to: "/cards/$cardSlug/{-$printingSlug}",
      params: { cardSlug, printingSlug: printing.slug },
      search: (prev) => ({ ...prev, printingId: undefined }),
      replace: true,
    });
  };

  if (!selectedPrinting) {
    return (
      <div className={PAGE_PADDING}>
        <p className="text-muted-foreground">No printings found for this card.</p>
      </div>
    );
  }

  return (
    <>
      <PageTopBarSticky width="capped">
        <PageTopBar>
          <PageTopBarBack to="/cards" aria-label="All cards" />
          <PageTopBarTitle>{legendDisplayName(card)}</PageTopBarTitle>
          <PageTopBarActions>
            <PageTopBarButton
              aria-label="Suggest a correction"
              render={<Link to="/contribute/$cardSlug" params={{ cardSlug }} />}
            >
              <PencilLineIcon className="size-4" />
              <span className="hidden sm:inline">Suggest a correction</span>
            </PageTopBarButton>
            <ShareLinkButton cardName={legendDisplayName(card)} />
          </PageTopBarActions>
        </PageTopBar>
      </PageTopBarSticky>
      <div className={cn(PAGE_WIDTH.capped, PAGE_PADDING_NO_TOP, "flex flex-col gap-4 pt-3")}>
        <div className="flex flex-col gap-6 md:flex-row">
          <CardPageHero card={card} printing={selectedPrinting} siblings={printings} />

          <CardPanel className="min-w-0 flex-1 p-4">
            <CardPageInfoTable card={card} printing={selectedPrinting} sets={sets} />
            <CardPageFactRows
              card={card}
              printing={selectedPrinting}
              products={data.productsByPrinting.get(selectedPrinting.id) ?? []}
            />
          </CardPanel>
        </div>

        <CollectionSlot cardSlug={cardSlug} printing={selectedPrinting} siblings={printings} />

        <CardPagePrintings
          printings={printings}
          selectedPrintingId={selectedPrinting.id}
          onSelect={selectPrinting}
        />

        <PriceHistorySection printing={selectedPrinting} />

        <RelatedCardsSection related={data.related} />
      </div>
    </>
  );
}
