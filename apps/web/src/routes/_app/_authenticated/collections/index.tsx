import { createFileRoute } from "@tanstack/react-router";

import { CollectionPending } from "@/components/collection/collection-pending";
import { RouteErrorFallback } from "@/components/error-message";
import { collectionsQueryOptions } from "@/lib/collections-query";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/collections/")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Collections", noIndex: true }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(collectionsQueryOptions(context.userId));
  },
  pendingComponent: CollectionPending,
  errorComponent: RouteErrorFallback,
});
