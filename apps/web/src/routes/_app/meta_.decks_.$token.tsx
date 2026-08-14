import type { MetaDeckDetailResponse } from "@openrift/shared";
import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

import { NotFoundFallback, RouteErrorFallback } from "@/components/error-message";
import { Skeleton } from "@/components/ui/skeleton";
import { initQueryOptions } from "@/hooks/use-init";
import { metaDeckQueryOptions } from "@/hooks/use-meta";
import type { FeatureFlags } from "@/lib/feature-flags";
import { featureEnabled, featureFlagsQueryOptions } from "@/lib/feature-flags";
import { formatFinishTier } from "@/lib/meta-format";
import { breadcrumbJsonLd, seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";
import { CONTAINER_WIDTH, PAGE_PADDING, cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/meta_/decks_/$token")({
  head: ({ loaderData, params }) => {
    const siteUrl = getSiteUrl();
    const path = `/meta/decks/${params.token}`;
    const data = loaderData as MetaDeckDetailResponse | undefined;
    if (!data) {
      return seoHead({ siteUrl, title: "Archived deck", path, unlisted: true });
    }
    const finish = formatFinishTier(data.meta.finishTier);
    const title = `${data.deck.name} — ${finish} at ${data.meta.event.name}`;
    const description = `${data.meta.playerName} piloted this ${data.deck.format} deck to ${finish} at ${data.meta.event.name} (${data.meta.event.eventDate}).`;
    return {
      ...seoHead({ siteUrl, title, description, path }),
      scripts: [
        breadcrumbJsonLd(siteUrl, [
          { name: "Meta", path: "/meta" },
          { name: data.meta.event.name, path: `/meta/${data.meta.event.slug}` },
          { name: data.deck.name, path },
        ]),
      ],
    };
  },
  // The flag check lives in the loader, not beforeLoad: a beforeLoad combined
  // with a head() that reads loaderData collapses the route-context type to
  // `never` in the current TanStack Router version. Same pattern as
  // help_.$slug.tsx; the redirect still fires before anything renders.
  loader: async ({ context, params }): Promise<MetaDeckDetailResponse> => {
    const flags = (await context.queryClient.ensureQueryData(
      featureFlagsQueryOptions,
    )) as FeatureFlags;
    if (!featureEnabled(flags, "meta")) {
      throw redirect({ to: "/cards" });
    }
    try {
      const [, deck] = await Promise.all([
        context.queryClient.ensureQueryData(initQueryOptions),
        context.queryClient.ensureQueryData(metaDeckQueryOptions(params.token)),
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
    <div className={cn(PAGE_PADDING, CONTAINER_WIDTH, "flex flex-col gap-4 py-4")}>
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
