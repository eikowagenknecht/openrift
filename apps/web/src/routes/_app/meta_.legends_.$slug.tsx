import { imageUrl } from "@openrift/shared/image-url";
import type { MetaLegendDetailResponse } from "@openrift/shared/types/api/meta";
import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

import { NotFoundFallback, RouteErrorFallback } from "@/components/error-message";
import { Skeleton } from "@/components/ui/skeleton";
import { initQueryOptions } from "@/hooks/use-init";
import { metaDecksQueryOptions, metaLegendQueryOptions } from "@/hooks/use-meta";
import { publicSetListQueryOptions } from "@/hooks/use-public-sets";
import type { FeatureFlags } from "@/lib/feature-flags";
import { featureEnabled, featureFlagsQueryOptions } from "@/lib/feature-flags";
import { DECK_GRID_LIMIT } from "@/lib/meta-deck-grid";
import { metaLegendSearchSchema } from "@/lib/meta-legends-search";
import { deriveSetEras, metaScopeQueryFromScope } from "@/lib/meta-scope";
import { breadcrumbJsonLd, seoHead, toAbsoluteUrl } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";
import { PAGE_WIDTH, PAGE_PADDING, cn } from "@/lib/utils";

/**
 * Route key is `<champion>-<card-slug>` (built by `metaLegendSlug` in
 * `@openrift/shared`), with the card slug always appended even when the
 * champion has only one legend, so the URL stays valid if a second legend
 * for that champion is printed later. A legend with no champion tag keys on
 * its card slug alone.
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
    const { legend, counts } = data;
    const description = `${legend.name} in the Riftbound meta archive: ${counts.finishes} archived ${counts.finishes === 1 ? "finish" : "finishes"}, the players behind them, and the decklists they registered.`;
    const ogImage = toAbsoluteUrl(
      siteUrl,
      legend.imageId === null ? undefined : imageUrl(legend.imageId, "full"),
    );
    return {
      ...seoHead({
        siteUrl,
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
  loaderDeps: ({ search }) => search,
  // beforeLoad combined with a head() reading loaderData collapses the route
  // context type to `never` in this TanStack Router version; flag check moves here.
  loader: async ({ context, params, deps }): Promise<MetaLegendDetailResponse> => {
    const flags = (await context.queryClient.query({
      ...featureFlagsQueryOptions,
      staleTime: "static",
    })) as FeatureFlags;
    if (!featureEnabled(flags, "meta")) {
      throw redirect({ to: "/cards" });
    }
    try {
      const [sets] = await Promise.all([
        context.queryClient.query({ ...publicSetListQueryOptions, staleTime: "static" }),
        context.queryClient.query({ ...initQueryOptions, staleTime: "static" }),
      ]);
      const query = metaScopeQueryFromScope(deps, deriveSetEras(sets.sets));
      const legend = await context.queryClient.query({
        ...metaLegendQueryOptions(params.slug, query),
        staleTime: "static",
      });
      await context.queryClient.query({
        ...metaDecksQueryOptions({
          ...query,
          legend: legend.legend.cardId,
          limit: DECK_GRID_LIMIT,
        }),
        staleTime: "static",
      });
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
