import { createFileRoute } from "@tanstack/react-router";

import { collectionEventsQueryOptions } from "@/hooks/use-collection-events";
import { collectionsQueryOptions } from "@/hooks/use-collections";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/collections/activity")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Collection Activity", noIndex: true }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureInfiniteQueryData(collectionEventsQueryOptions),
      context.queryClient.ensureQueryData(collectionsQueryOptions),
    ]);
  },
});
