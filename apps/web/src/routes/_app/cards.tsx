import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { RouteErrorFallback } from "@/components/error-message";
import { Skeleton } from "@/components/ui/skeleton";
import { initQueryOptions } from "@/hooks/use-init";
import type { AvailableFiltersWire, CardCounts } from "@/lib/cards-facets";
import { fetchCardCounts, fetchCardFacets } from "@/lib/cards-facets";
import type { FirstRowCard } from "@/lib/cards-first-row";
import { fetchFirstRowCards } from "@/lib/cards-first-row";
import { filterSearchSchema } from "@/lib/search-schemas";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";
import { PAGE_PADDING } from "@/lib/utils";

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
  // On client-side navigation we skip the server fns — the live catalog
  // query is already warming, so the SSR shell would never paint.
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
  }> => {
    if (globalThis.window !== undefined) {
      return {
        firstRow: [],
        facets: null,
        availableLanguages: [],
        setLabels: {},
        counts: { totalCards: 0, filteredCount: 0 },
      };
    }
    await context.queryClient.ensureQueryData(initQueryOptions);
    const [firstRow, facetsPayload, counts] = await Promise.all([
      fetchFirstRowCards(),
      fetchCardFacets(),
      fetchCardCounts({ data: deps.search }),
    ]);
    return {
      firstRow,
      facets: facetsPayload.facets,
      availableLanguages: facetsPayload.availableLanguages,
      setLabels: facetsPayload.setLabels,
      counts,
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
