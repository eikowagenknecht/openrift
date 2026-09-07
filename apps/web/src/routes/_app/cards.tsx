import { createFileRoute, redirect } from "@tanstack/react-router";

import { CardBrowserLayout } from "@/components/card-browser-layout";
import { RouteErrorFallback } from "@/components/error-message";
import { Skeleton } from "@/components/ui/skeleton";
import { initQueryOptions } from "@/hooks/use-init";
import { pricesQueryOptions } from "@/hooks/use-prices";
import type { AvailableFiltersWire, CardCounts, FilterCountsWire } from "@/lib/cards-facets";
import { fetchCardCounts, fetchCardFacets, fetchCardFilterCounts } from "@/lib/cards-facets";
import type { FirstRowCard } from "@/lib/cards-first-row";
import { fetchFirstRowCards } from "@/lib/cards-first-row";
import { cardsSearchSchema } from "@/lib/cards-search-schema";
import {
  catalogFetchUrl,
  catalogQueryOptions,
  normalizeCatalogLangs,
  readCatalogVersionFromServerCache,
} from "@/lib/catalog-query";
import { cleanedSearchForRedirect } from "@/lib/search-schemas";
import { collectionPageJsonLd, seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";
import { cn, PAGE_PADDING_NO_TOP } from "@/lib/utils";

const CARDS_DESCRIPTION =
  "Complete Riftbound TCG card database with marketplace price comparison. Filter by set, domain, rarity, cost, and keyword to browse every card and printing.";

export const Route = createFileRoute("/_app/cards")({
  validateSearch: cardsSearchSchema,
  beforeLoad: ({ search, location }) => {
    const cleaned = cleanedSearchForRedirect(cardsSearchSchema, search, location.searchStr);
    if (cleaned) {
      throw redirect({ to: "/cards", search: cleaned, replace: true });
    }
  },
  // Must stay a stable empty object: loaderDeps feeds the match ID, and a
  // changing ID remounts the route, losing focus in <SearchBar>'s input.
  loaderDeps: () => ({}),
  loader: ({
    context,
    location,
  }):
    | {
        firstRow: FirstRowCard[];
        facets: AvailableFiltersWire | null;
        availableLanguages: string[];
        setLabels: Record<string, string>;
        counts: CardCounts;
        filterCounts: FilterCountsWire | null;
        catalogVersion: string | null;
        catalogPreloadLangs: string[];
      }
    | Promise<{
        firstRow: FirstRowCard[];
        facets: AvailableFiltersWire | null;
        availableLanguages: string[];
        setLabels: Record<string, string>;
        counts: CardCounts;
        filterCounts: FilterCountsWire | null;
        catalogVersion: string | null;
        catalogPreloadLangs: string[];
      }> => {
    if (globalThis.window !== undefined) {
      const empty = {
        firstRow: [],
        facets: null,
        availableLanguages: [],
        setLabels: {},
        counts: { totalCards: 0, filteredCount: 0 },
        filterCounts: null,
        catalogVersion: null,
        catalogPreloadLangs: [],
      };
      const warm =
        context.queryClient.getQueryData(catalogQueryOptions.queryKey) !== undefined &&
        context.queryClient.getQueryData(pricesQueryOptions.queryKey) !== undefined &&
        context.queryClient.getQueryData(initQueryOptions.queryKey) !== undefined;
      // Warm cache returns synchronously so first mount skips the router's
      // pending transition; cold entry returns a Promise for pendingComponent.
      if (warm) {
        return empty;
      }
      return (async () => {
        await Promise.all([
          context.queryClient.query({ ...catalogQueryOptions, staleTime: "static" }),
          context.queryClient.query({ ...pricesQueryOptions, staleTime: "static" }),
          context.queryClient.query({ ...initQueryOptions, staleTime: "static" }),
        ]);
        return empty;
      })();
    }
    const ssrSearch = location.search;
    return (async () => {
      await context.queryClient.query({ ...initQueryOptions, staleTime: "static" });
      // catalogVersion (the catalog's ETag) rides along so the hydrated
      // client fetches `?v=<token>`, at least as fresh as this SSR shell.
      const [firstRow, facetsPayload, counts, filterCounts, catalogVersion] = await Promise.all([
        fetchFirstRowCards({ data: ssrSearch }),
        fetchCardFacets(),
        fetchCardCounts({ data: ssrSearch }),
        fetchCardFilterCounts({ data: ssrSearch }),
        readCatalogVersionFromServerCache(),
      ]);
      // location.search is untyped in the loader; re-validate to read the
      // languages filter.
      const ssrLanguages = cardsSearchSchema.parse(ssrSearch).languages ?? [];
      const catalogPreloadLangs = normalizeCatalogLangs(
        ssrLanguages.length > 0 ? ssrLanguages : ["EN"],
      );
      return {
        firstRow,
        facets: facetsPayload.facets,
        availableLanguages: facetsPayload.availableLanguages,
        setLabels: facetsPayload.setLabels,
        counts,
        filterCounts,
        catalogVersion,
        catalogPreloadLangs,
      };
    })();
  },
  head: ({ loaderData }) => {
    const siteUrl = getSiteUrl();
    const head = seoHead({
      siteUrl,
      title: "Cards",
      description: CARDS_DESCRIPTION,
      path: "/cards",
    });
    // href must byte-match fetchCatalogFromEdge's URL or the browser
    // downloads the catalog twice.
    const catalogVersion = loaderData?.catalogVersion ?? null;
    const preloadLangs = loaderData?.catalogPreloadLangs ?? [];
    const catalogHref = catalogFetchUrl(
      "",
      catalogVersion,
      preloadLangs.length > 0 ? { langs: preloadLangs } : undefined,
    );
    return {
      ...head,
      links: [
        ...(head.links ?? []),
        // crossOrigin: "anonymous" must match fetch(url)'s cors request, or
        // Chrome discards the preload with a credentials-mode warning.
        { rel: "preload", as: "fetch", href: catalogHref, crossOrigin: "anonymous" },
      ],
      scripts: [
        collectionPageJsonLd({
          siteUrl,
          name: "Riftbound Card Database",
          description: CARDS_DESCRIPTION,
          path: "/cards",
        }),
      ],
    };
  },
  pendingComponent: CardsPending,
  errorComponent: RouteErrorFallback,
});

function CardsPending() {
  return (
    <div className={cn("flex flex-1 flex-col", PAGE_PADDING_NO_TOP)}>
      <CardBrowserLayout
        toolbar={
          <div className="bg-input mb-1.5 h-9 w-full rounded-md sm:mb-3" aria-hidden="true" />
        }
        gridSlot={
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
            {Array.from({ length: 20 }, (_, i) => (
              <Skeleton key={i} className="aspect-card rounded-lg" />
            ))}
          </div>
        }
      />
    </div>
  );
}
