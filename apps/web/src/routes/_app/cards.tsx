import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { RouteErrorFallback } from "@/components/error-message";
import { Skeleton } from "@/components/ui/skeleton";
import { filterSearchSchema } from "@/lib/search-schemas";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";
import { PAGE_PADDING } from "@/lib/utils";

const cardsSearchSchema = filterSearchSchema.extend({
  // oxlint-disable-next-line unicorn/no-useless-undefined, promise/prefer-await-to-then, unicorn/prefer-top-level-await -- zod's `.catch(undefined)` is a sync fallback, not a Promise#catch
  printingId: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/_app/cards")({
  ssr: "data-only",
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
