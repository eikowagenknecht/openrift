import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { CardBrowserLayout } from "@/components/card-browser-layout";
import { RouteErrorFallback } from "@/components/error-message";
import { Pane } from "@/components/layout/panes";
import { Skeleton } from "@/components/ui/skeleton";
import { initQueryOptions } from "@/hooks/use-init";
import { pricesQueryOptions } from "@/hooks/use-prices";
import type { AvailableFiltersWire, CardCounts, FilterCountsWire } from "@/lib/cards-facets";
import { fetchCardCounts, fetchCardFacets, fetchCardFilterCounts } from "@/lib/cards-facets";
import type { FirstRowCard } from "@/lib/cards-first-row";
import { fetchFirstRowCards } from "@/lib/cards-first-row";
import { catalogQueryOptions } from "@/lib/catalog-query";
import { filterSearchSchema } from "@/lib/search-schemas";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";
import { PAGE_PADDING_NO_TOP } from "@/lib/utils";

const cardsSearchSchema = filterSearchSchema.extend({
  // oxlint-disable-next-line unicorn/no-useless-undefined, promise/prefer-await-to-then, unicorn/prefer-top-level-await -- zod's `.catch(undefined)` is a sync fallback, not a Promise#catch
  printingId: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/_app/cards")({
  validateSearch: cardsSearchSchema,
  beforeLoad: ({ search, location }) => {
    // Strip unknown / malformed search params from the URL. TanStack merges
    // raw URL keys onto the validated search (Object.assign in buildLocation),
    // so unknown keys appear in `search` here too — re-parse with the schema
    // to get the clean object, then redirect if the raw URL had any keys the
    // validator would drop.
    const parsed = cardsSearchSchema.safeParse(search);
    const cleaned = parsed.success ? parsed.data : {};
    const rawKeys = new Set(new URLSearchParams(location.searchStr).keys());
    const cleanedKeys = new Set(
      Object.entries(cleaned)
        .filter(([, value]) => value !== undefined)
        .map(([key]) => key),
    );
    const hasExtraneous =
      rawKeys.size !== cleanedKeys.size || [...rawKeys].some((key) => !cleanedKeys.has(key));
    if (hasExtraneous) {
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
  // Forward URL search params into the loader so `fetchCardCounts` can compute
  // the filtered count over the catalog. Excludes `printingId` because it
  // doesn't affect counts and would invalidate the loader on every selection.
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({
    context,
    deps,
  }): Promise<{
    firstRow: FirstRowCard[];
    facets: AvailableFiltersWire | null;
    availableLanguages: string[];
    setLabels: Record<string, string>;
    counts: CardCounts;
    filterCounts: FilterCountsWire | null;
  }> => {
    if (globalThis.window !== undefined) {
      const empty = {
        firstRow: [],
        facets: null,
        availableLanguages: [],
        setLabels: {},
        counts: { totalCards: 0, filteredCount: 0 },
        filterCounts: null,
      };
      const warm =
        context.queryClient.getQueryData(catalogQueryOptions.queryKey) !== undefined &&
        context.queryClient.getQueryData(pricesQueryOptions.queryKey) !== undefined &&
        context.queryClient.getQueryData(initQueryOptions.queryKey) !== undefined;
      // Once warmed, return sync so per-URL-change reruns don't enter a router transition. On cold entry (e.g. direct nav to /cards from /collection without landing-page preload), block on Promise.all so the pending skeleton shows instead of CardBrowser flashing an empty Suspense fallback.
      if (warm) {
        return empty;
      }
      await Promise.all([
        context.queryClient.ensureQueryData(catalogQueryOptions),
        context.queryClient.ensureQueryData(pricesQueryOptions),
        context.queryClient.ensureQueryData(initQueryOptions),
      ]);
      return empty;
    }
    await context.queryClient.ensureQueryData(initQueryOptions);
    const [firstRow, facetsPayload, counts, filterCounts] = await Promise.all([
      fetchFirstRowCards(),
      fetchCardFacets(),
      fetchCardCounts({ data: deps.search }),
      fetchCardFilterCounts({ data: deps.search }),
    ]);
    return {
      firstRow,
      facets: facetsPayload.facets,
      availableLanguages: facetsPayload.availableLanguages,
      setLabels: facetsPayload.setLabels,
      counts,
      filterCounts,
    };
  },
  head: () =>
    seoHead({
      siteUrl: getSiteUrl(),
      title: "Cards",
      description:
        "Complete Riftbound TCG card database with marketplace price comparison. Filter by set, domain, rarity, cost, and keyword to browse every card and printing.",
      path: "/cards",
    }),
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
        leftPane={
          <Pane className="@wide:block px-3">
            <Skeleton className="mb-4 h-7 w-24 rounded" />
            <div className="space-y-3 pb-4">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-9 w-full rounded" />
              ))}
            </div>
          </Pane>
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
