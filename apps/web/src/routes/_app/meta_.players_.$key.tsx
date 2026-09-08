import type { MetaPlayerDetailResponse } from "@openrift/shared/types/api/meta";
import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

import { NotFoundFallback, RouteErrorFallback } from "@/components/error-message";
import { Skeleton } from "@/components/ui/skeleton";
import { publicSetListQueryOptions } from "@/features/cards/hooks/use-public-sets";
import { metaDecksQueryOptions, metaPlayerQueryOptions } from "@/features/meta/hooks/use-meta";
import {
  deriveSetEras,
  metaScopeQueryFromScope,
  metaScopeSearchSchema,
} from "@/features/meta/lib/meta-scope";
import { initQueryOptions } from "@/hooks/use-init";
import type { FeatureFlags } from "@/lib/feature-flags";
import { featureEnabled, featureFlagsQueryOptions } from "@/lib/feature-flags";
import { breadcrumbJsonLd, seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";
import { PAGE_WIDTH, PAGE_PADDING, cn } from "@/lib/utils";

/**
 * The route key is the identity a source filed the player's standings rows
 * under, folded by `metaPlayerKey` (`@openrift/shared`): `u347713` for a
 * uvsgames account, `pn<name>` for a playloltcg name. The archive keeps no
 * player table of its own, so the key is the source's and the page is whatever
 * the source published under it.
 */
export const Route = createFileRoute("/_app/meta_/players_/$key")({
  validateSearch: metaScopeSearchSchema,
  head: ({ loaderData, params }) => {
    const siteUrl = getSiteUrl();
    const path = `/meta/players/${encodeURIComponent(params.key)}`;
    const data = loaderData as MetaPlayerDetailResponse | undefined;
    if (!data) {
      return seoHead({ siteUrl, title: "Player", path, unlisted: true });
    }
    const { name, finishes } = data;
    const description = `${name} in the Riftbound meta archive: ${finishes.length} archived ${finishes.length === 1 ? "finish" : "finishes"}, the legends they brought, and the decklists they registered.`;
    return {
      ...seoHead({
        siteUrl,
        title: `${name} in the Meta Archive`,
        description,
        path,
      }),
      scripts: [
        breadcrumbJsonLd(siteUrl, [
          { name: "Meta Archive", path: "/meta" },
          { name, path },
        ]),
      ],
    };
  },
  loaderDeps: ({ search }) => search,
  // beforeLoad combined with a head() reading loaderData collapses the route
  // context type to `never` in this TanStack Router version; flag check moves here.
  loader: async ({ context, params, deps }): Promise<MetaPlayerDetailResponse> => {
    const flags = (await context.queryClient.query({
      ...featureFlagsQueryOptions,
      staleTime: "static",
    })) as FeatureFlags;
    if (!featureEnabled(flags, "meta")) {
      throw redirect({ to: "/cards" });
    }
    try {
      const [player, sets] = await Promise.all([
        context.queryClient.query({ ...metaPlayerQueryOptions(params.key), staleTime: "static" }),
        context.queryClient.query({ ...publicSetListQueryOptions, staleTime: "static" }),
        context.queryClient.query({ ...initQueryOptions, staleTime: "static" }),
      ]);
      await context.queryClient.query({
        ...metaDecksQueryOptions({
          ...metaScopeQueryFromScope(deps, deriveSetEras(sets.sets)),
          player: params.key,
        }),
        staleTime: "static",
      });
      return player;
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_FOUND") {
        throw notFound();
      }
      throw error;
    }
  },
  pendingComponent: MetaPlayerPending,
  errorComponent: RouteErrorFallback,
  notFoundComponent: NotFoundFallback,
});

function MetaPlayerPending() {
  return (
    <div className={cn(PAGE_PADDING, PAGE_WIDTH.capped, "flex flex-col gap-4 py-4")}>
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
