import type { MetaDeckDetailResponse } from "@openrift/shared/types/api/meta";
import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

import { NotFoundFallback, RouteErrorFallback } from "@/components/error-message";
import { Skeleton } from "@/components/ui/skeleton";
import { metaDeckQueryOptions } from "@/features/meta/hooks/use-meta";
import { archivedDeckIdentity } from "@/features/meta/lib/meta-deck-archive";
import { formatRank } from "@/features/meta/lib/meta-format";
import { initQueryOptions } from "@/hooks/use-init";
import type { FeatureFlags } from "@/lib/feature-flags";
import { featureEnabled, featureFlagsQueryOptions } from "@/lib/feature-flags";
import { breadcrumbJsonLd, seoHead } from "@/lib/seo";
import { deckShareImageUrl, shareImageVersion } from "@/lib/share-image";
import { getSiteUrl } from "@/lib/site-config";
import { PAGE_WIDTH, PAGE_PADDING, cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/meta_/decks_/$token")({
  head: ({ loaderData, params }) => {
    const siteUrl = getSiteUrl();
    const path = `/meta/decks/${params.token}`;
    const data = loaderData as MetaDeckDetailResponse | undefined;
    if (!data) {
      return seoHead({ siteUrl, title: "Archived deck", path, unlisted: true });
    }
    const finish = formatRank(data.meta.rank, data.meta.rankIsTier);
    const legend = archivedDeckIdentity(data.cards)?.name ?? null;
    const named = legend ?? data.meta.playerName;
    const title = `${named}, ${finish} at ${data.meta.event.name}`;
    const piloted = legend === null ? `this ${data.deck.format} deck` : legend;
    const description = `${data.meta.playerName} piloted ${piloted} to ${finish} at ${data.meta.event.name} (${data.meta.event.eventDate}).`;
    const ogImage = deckShareImageUrl(
      siteUrl,
      params.token,
      shareImageVersion(data.deck.updatedAt),
    );
    return {
      ...seoHead({ siteUrl, title, description, path, ogImage }),
      scripts: [
        breadcrumbJsonLd(siteUrl, [
          { name: "Meta Archive", path: "/meta" },
          { name: data.meta.event.name, path: `/meta/${data.meta.event.slug}` },
          { name: named, path },
        ]),
      ],
    };
  },
  // The flag check lives in the loader, not beforeLoad: a beforeLoad combined
  // with a head() that reads loaderData collapses the route-context type to
  // `never` in the current TanStack Router version. Same pattern as
  // help_.$slug.tsx; the redirect still fires before anything renders.
  loader: async ({ context, params }): Promise<MetaDeckDetailResponse> => {
    const flags = (await context.queryClient.query({
      ...featureFlagsQueryOptions,
      staleTime: "static",
    })) as FeatureFlags;
    if (!featureEnabled(flags, "meta")) {
      throw redirect({ to: "/cards" });
    }
    try {
      const [, deck] = await Promise.all([
        context.queryClient.query({ ...initQueryOptions, staleTime: "static" }),
        context.queryClient.query({ ...metaDeckQueryOptions(params.token), staleTime: "static" }),
      ]);
      return deck;
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_FOUND") {
        throw notFound();
      }
      throw error;
    }
  },
  pendingComponent: MetaDeckPending,
  errorComponent: RouteErrorFallback,
  notFoundComponent: NotFoundFallback,
});

function MetaDeckPending() {
  return (
    <div className={cn(PAGE_PADDING, PAGE_WIDTH.full, "flex flex-col gap-4 py-4")}>
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
