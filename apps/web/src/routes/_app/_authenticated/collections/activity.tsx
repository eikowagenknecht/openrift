import { createFileRoute } from "@tanstack/react-router";

import { collectionEventsQueryOptions } from "@/features/collections/hooks/use-collection-events";
import { collectionsQueryOptions } from "@/features/collections/lib/collections-query";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/collections/activity")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Collection Activity", noIndex: true }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.infiniteQuery({
        ...collectionEventsQueryOptions(context.userId),
        staleTime: "static",
      }),
      context.queryClient.query({
        ...collectionsQueryOptions(context.userId),
        staleTime: "static",
      }),
    ]);
  },
});
