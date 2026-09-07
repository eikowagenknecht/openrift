import { createFileRoute, notFound } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { CollectionPending } from "@/features/collections/components/collection-pending";
import { listDetailQueryOptions } from "@/features/lists/hooks/use-lists";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/collections/lists/$listId")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "List", noIndex: true }),
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.query({
        ...listDetailQueryOptions(context.userId, params.listId),
        staleTime: "static",
      });
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_FOUND") {
        throw notFound();
      }
      throw error;
    }
  },
  pendingComponent: CollectionPending,
  errorComponent: RouteErrorFallback,
});
