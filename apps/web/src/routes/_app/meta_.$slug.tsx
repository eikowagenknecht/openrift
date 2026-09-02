import type { MetaEventDetailResponse } from "@openrift/shared";
import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

import { NotFoundFallback, RouteErrorFallback } from "@/components/error-message";
import { Skeleton } from "@/components/ui/skeleton";
import { initQueryOptions } from "@/hooks/use-init";
import { metaEventQueryOptions } from "@/hooks/use-meta";
import type { FeatureFlags } from "@/lib/feature-flags";
import { featureEnabled, featureFlagsQueryOptions } from "@/lib/feature-flags";
import { breadcrumbJsonLd, seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";
import { PAGE_WIDTH, PAGE_PADDING, cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/meta_/$slug")({
  head: ({ loaderData, params }) => {
    const siteUrl = getSiteUrl();
    const path = `/meta/${params.slug}`;
    const data = loaderData as MetaEventDetailResponse | undefined;
    if (!data) {
      return seoHead({ siteUrl, title: "Event", path, unlisted: true });
    }
    const { event } = data;
    const description = `${event.name} on ${event.eventDate}: standings for ${event.playerRowCount} Riftbound ${event.format} ${event.playerRowCount === 1 ? "player" : "players"}, with ${event.deckCount} archived ${event.deckCount === 1 ? "decklist" : "decklists"}.`;
    return {
      ...seoHead({ siteUrl, title: event.name, description, path }),
      scripts: [
        breadcrumbJsonLd(siteUrl, [
          { name: "Meta Archive", path: "/meta" },
          { name: event.name, path },
        ]),
      ],
    };
  },
  // The flag check lives in the loader, not beforeLoad: a beforeLoad combined
  // with a head() that reads loaderData collapses the route-context type to
  // `never` in the current TanStack Router version. Same pattern as
  // help_.$slug.tsx; the redirect still fires before anything renders.
  loader: async ({ context, params }): Promise<MetaEventDetailResponse> => {
    const flags = (await context.queryClient.query({
      ...featureFlagsQueryOptions,
      staleTime: "static",
    })) as FeatureFlags;
    if (!featureEnabled(flags, "meta")) {
      throw redirect({ to: "/cards" });
    }
    try {
      const [, event] = await Promise.all([
        context.queryClient.query({ ...initQueryOptions, staleTime: "static" }),
        context.queryClient.query({ ...metaEventQueryOptions(params.slug), staleTime: "static" }),
      ]);
      return event;
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_FOUND") {
        throw notFound();
      }
      throw error;
    }
  },
  pendingComponent: MetaEventPending,
  errorComponent: RouteErrorFallback,
  notFoundComponent: NotFoundFallback,
});

function MetaEventPending() {
  return (
    <div className={cn(PAGE_PADDING, PAGE_WIDTH.full, "flex flex-col gap-4 py-4")}>
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
