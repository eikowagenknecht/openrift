import type { MetaLegendDetailResponse } from "@openrift/shared";
import { imageUrl } from "@openrift/shared";
import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

import { NotFoundFallback, RouteErrorFallback } from "@/components/error-message";
import { Skeleton } from "@/components/ui/skeleton";
import { initQueryOptions } from "@/hooks/use-init";
import { metaDecksQueryOptions, metaLegendQueryOptions } from "@/hooks/use-meta";
import { publicSetListQueryOptions } from "@/hooks/use-public-sets";
import type { FeatureFlags } from "@/lib/feature-flags";
import { featureEnabled, featureFlagsQueryOptions } from "@/lib/feature-flags";
import { metaLegendSearchSchema } from "@/lib/meta-legends-search";
import { breadcrumbJsonLd, seoHead, toAbsoluteUrl } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";
import { PAGE_WIDTH, PAGE_PADDING, cn } from "@/lib/utils";

/**
 * The route key is the legend's champion followed by its card slug —
 * `/meta/legends/kennen-heart-of-the-tempest` — composed by `metaLegendSlug`
 * (`@openrift/shared`) and resolved by the API against the same function.
 *
 * The champion leads because that is what players call a legend, and the card
 * slug always follows rather than only when a champion has several legend
 * variants. A conditional suffix would make the key a property of the
 * catalogue's current shape: `/meta/legends/kennen` would resolve until the day
 * a second Kennen legend was printed and then stop, taking every saved link with
 * it. Carrying the card slug always costs a few characters and buys a key that
 * never changes. A legend with no champion tag keys on its card slug alone.
 */
export const Route = createFileRoute("/_app/meta_/legends_/$slug")({
  validateSearch: metaLegendSearchSchema,
  head: ({ loaderData, params }) => {
    const siteUrl = getSiteUrl();
    const path = `/meta/legends/${params.slug}`;
    const data = loaderData as MetaLegendDetailResponse | undefined;
    if (!data) {
      return seoHead({ siteUrl, title: "Legend", path, unlisted: true });
    }
    const { legend, finishes } = data;
    const description = `${legend.name} in the Riftbound meta archive: ${finishes.length} archived ${finishes.length === 1 ? "finish" : "finishes"}, the players behind them, and the decklists they registered.`;
    const ogImage = toAbsoluteUrl(
      siteUrl,
      legend.imageId === null ? undefined : imageUrl(legend.imageId, "full"),
    );
    return {
      ...seoHead({
        siteUrl,
        // The card's own page answers the bare legend name; this page is that
        // legend's tournament record, so the title says which of the two it is.
        title: `${legend.name} in the Meta Archive`,
        description,
        path,
        ogImage,
      }),
      scripts: [
        breadcrumbJsonLd(siteUrl, [
          { name: "Meta Archive", path: "/meta" },
          { name: "Legends", path: "/meta/legends" },
          { name: legend.name, path },
        ]),
      ],
    };
  },
  // The flag check lives in the loader, not beforeLoad: a beforeLoad combined
  // with a head() that reads loaderData collapses the route-context type to
  // `never` in the current TanStack Router version. Same pattern as
  // meta_.$slug.tsx; the redirect still fires before anything renders.
  loader: async ({ context, params }): Promise<MetaLegendDetailResponse> => {
    const flags = (await context.queryClient.query({
      ...featureFlagsQueryOptions,
      staleTime: "static",
    })) as FeatureFlags;
    if (!featureEnabled(flags, "meta")) {
      throw redirect({ to: "/cards" });
    }
    try {
      // The archive's whole deck payload backs the decklist grid: it is one
      // cached response the rest of the archive already holds, and narrowing it
      // by legend client-side is how every other archive surface filters it.
      // The set list is here for the scope bar's eras, which are derived from
      // set release dates rather than stored.
      const [legend] = await Promise.all([
        context.queryClient.query({ ...metaLegendQueryOptions(params.slug), staleTime: "static" }),
        context.queryClient.query({ ...initQueryOptions, staleTime: "static" }),
        context.queryClient.query({ ...metaDecksQueryOptions, staleTime: "static" }),
        context.queryClient.query({ ...publicSetListQueryOptions, staleTime: "static" }),
      ]);
      return legend;
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_FOUND") {
        throw notFound();
      }
      throw error;
    }
  },
  pendingComponent: MetaLegendPending,
  errorComponent: RouteErrorFallback,
  notFoundComponent: NotFoundFallback,
});

function MetaLegendPending() {
  return (
    <div className={cn(PAGE_PADDING, PAGE_WIDTH.capped, "flex flex-col gap-4 py-4")}>
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
