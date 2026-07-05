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
import { catalogQueryOptions, readCatalogVersionFromServerCache } from "@/lib/catalog-query";
import { cleanedSearchForRedirect } from "@/lib/search-schemas";
import { collectionPageJsonLd, seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";
import { PAGE_PADDING_NO_TOP } from "@/lib/utils";

const CARDS_DESCRIPTION =
  "Complete Riftbound TCG card database with marketplace price comparison. Filter by set, domain, rarity, cost, and keyword to browse every card and printing.";

export const Route = createFileRoute("/_app/cards")({
  validateSearch: cardsSearchSchema,
  beforeLoad: ({ search, location }) => {
    // Strip unknown / malformed search params from the URL so bookmarks and
    // share links land on a clean canonical URL.
    const cleaned = cleanedSearchForRedirect(cardsSearchSchema, search, location.searchStr);
    if (cleaned) {
      throw redirect({ to: "/cards", search: cleaned, replace: true });
    }
  },
  // SSR-only payload — slim views over the same server-cached catalog so the
  // shell can render the live grid's chrome (filters, search, toolbar) and
  // first-row LCP candidate before hydration:
  //  - `firstRow`: front-face image URLs for the first row, real `<img>`s for
  //    the preload scanner.
  //  - `facets` + `availableLanguages` + `setLabels`: shape the filter chrome.
  //  - `totalCards` / `filteredCount`: SearchBar's "X of Y" without flashing.
  // The init query is also primed into the per-request QueryClient so chrome
  // components calling `useSuspenseQuery(initQueryOptions)` resolve sync.
  // On client-side navigation we don't need the SSR shell payload (the live
  // CardBrowser will render directly), but we DO want the catalog warmed —
  // so a route preload (`router.preloadRoute({ to: "/cards" })`) on idle from
  // the homepage primes the client QueryClient and the eventual click renders
  // the full grid with no Suspense fallback.
  // Return a stable (empty) deps object so the match ID — which is hashed from
  // `loaderDeps` (see `router-core/router.js`: `matchId = route.id +
  // interpolatedPath + loaderDepsHash`) — stays constant across filter/search/
  // sort URL changes. Otherwise every navigation creates a fresh match starting
  // in `status: "pending"`, which throws `loadPromise` to the route's Suspense
  // boundary, renders `pendingComponent` (CardsPending), unmounts the entire
  // route subtree (including the focused <input> in <SearchBar>), and remounts
  // it once the loader resolves — losing focus mid-typing. The deps object must
  // be the same shape on SSR and client to avoid a hydration mismatch (mismatched
  // matchId on hydration causes the client to render `pendingComponent` where
  // the server rendered `FirstRowPreview`). The SSR loader still gets the URL
  // search via `location.search` below, so it can compute counts / first-row.
  // The client loader doesn't need search anyway — the warm-cache path returns
  // an `empty` payload regardless.
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
      }
    | Promise<{
        firstRow: FirstRowCard[];
        facets: AvailableFiltersWire | null;
        availableLanguages: string[];
        setLabels: Record<string, string>;
        counts: CardCounts;
        filterCounts: FilterCountsWire | null;
        catalogVersion: string | null;
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
      };
      const warm =
        context.queryClient.getQueryData(catalogQueryOptions.queryKey) !== undefined &&
        context.queryClient.getQueryData(pricesQueryOptions.queryKey) !== undefined &&
        context.queryClient.getQueryData(initQueryOptions.queryKey) !== undefined;
      // On a warm client cache, return synchronously (non-Promise) so the route's
      // first mount doesn't enter a router transition. The stable client `loaderDeps`
      // above already prevents this loader from re-running on filter/search changes,
      // so this path matters only on the very first /cards entry. Cold entry returns
      // a Promise so the route shows `pendingComponent` instead of flashing an empty
      // Suspense fallback while the catalog is in flight.
      if (warm) {
        return empty;
      }
      return (async () => {
        await Promise.all([
          context.queryClient.ensureQueryData(catalogQueryOptions),
          context.queryClient.ensureQueryData(pricesQueryOptions),
          context.queryClient.ensureQueryData(initQueryOptions),
        ]);
        return empty;
      })();
    }
    const ssrSearch = location.search;
    return (async () => {
      await context.queryClient.ensureQueryData(initQueryOptions);
      // `catalogVersion` (the catalog's ETag) rides along so the hydrated
      // client can fetch the catalog as `?v=<token>` — guaranteeing the edge
      // serves a catalog at least as fresh as this SSR shell. Read directly
      // (not via a server fn): this branch already runs on the server, and the
      // serverCache entry is warm from the fetches below.
      const [firstRow, facetsPayload, counts, filterCounts, catalogVersion] = await Promise.all([
        fetchFirstRowCards({ data: ssrSearch }),
        fetchCardFacets(),
        fetchCardCounts({ data: ssrSearch }),
        fetchCardFilterCounts({ data: ssrSearch }),
        readCatalogVersionFromServerCache(),
      ]);
      return {
        firstRow,
        facets: facetsPayload.facets,
        availableLanguages: facetsPayload.availableLanguages,
        setLabels: facetsPayload.setLabels,
        counts,
        filterCounts,
        catalogVersion,
      };
    })();
  },
  head: () => {
    const siteUrl = getSiteUrl();
    const head = seoHead({
      siteUrl,
      title: "Cards",
      description: CARDS_DESCRIPTION,
      path: "/cards",
    });
    // CollectionPage only — the visible items depend on URL filters and the
    // full catalog is too large to inline as an ItemList. The Product JSON-LD
    // on each card detail page is the indexable signal for individual cards.
    return {
      ...head,
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

// Skeleton UI for the cards page while the lazy chunk loads. Renders through
// the same `CardBrowserLayout` shell the SSR preview and hydrated CardBrowser
// use, so the pending → SSR → hydrated transition stays dimensionally
// consistent (no jump in toolbar height, left-pane width, or grid position).
function CardsPending() {
  return (
    <div className={`flex flex-1 flex-col ${PAGE_PADDING_NO_TOP}`}>
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
