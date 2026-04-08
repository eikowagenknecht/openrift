import { createFileRoute } from "@tanstack/react-router";

import { catalogQueryOptions } from "@/hooks/use-cards";
import { collectionEventsQueryOptions } from "@/hooks/use-collection-events";
import { collectionsQueryOptions } from "@/hooks/use-collections";

export const Route = createFileRoute("/_app/_authenticated/collections/activity")({
  head: () => ({ meta: [{ title: "Collection Activity — OpenRift" }] }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureInfiniteQueryData(collectionEventsQueryOptions),
      context.queryClient.ensureQueryData(catalogQueryOptions),
      context.queryClient.ensureQueryData(collectionsQueryOptions),
    ]);
  },
});
