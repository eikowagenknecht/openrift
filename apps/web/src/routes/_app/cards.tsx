import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { CardBrowser } from "@/components/card-browser";
import { RouteErrorFallback } from "@/components/error-message";
import { Skeleton } from "@/components/ui/skeleton";
import { useHideScrollbar } from "@/hooks/use-hide-scrollbar";
import { FilterSearchProvider, filterSearchSchema } from "@/lib/search-schemas";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";
import { PAGE_PADDING, PAGE_PADDING_NO_TOP } from "@/lib/utils";

const cardsSearchSchema = filterSearchSchema.extend({
  printingId: z.string().optional(),
});

export const Route = createFileRoute("/_app/cards")({
  ssr: "data-only",
  validateSearch: cardsSearchSchema,
  head: () =>
    seoHead({
      siteUrl: getSiteUrl(),
      title: "Cards",
      description:
        "Complete Riftbound TCG card database with marketplace price comparison. Filter by set, domain, rarity, cost, and keyword to browse every card and printing.",
      path: "/cards",
    }),
  component: CardsPage,
  pendingComponent: CardsPending,
  errorComponent: RouteErrorFallback,
});

function CardsPage() {
  const search = Route.useSearch();
  useHideScrollbar();
  return (
    <FilterSearchProvider value={search}>
      <div className={`flex flex-1 flex-col ${PAGE_PADDING_NO_TOP}`}>
        <CardBrowser />
      </div>
    </FilterSearchProvider>
  );
}

// Skeleton UI for the cards page while loading
function CardsPending() {
  return (
    <div className={`${PAGE_PADDING} space-y-4`}>
      <Skeleton className="h-10 w-full rounded-lg" />
      <div className="min-w-0 flex-1">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-4">
          {Array.from({ length: 20 }, (_, i) => (
            <Skeleton key={i} className="aspect-card rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
