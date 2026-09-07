import { createFileRoute } from "@tanstack/react-router";

import { publicSetListQueryOptions } from "@/features/cards/hooks/use-public-sets";
import { collectionsQueryOptions } from "@/features/collections/lib/collections-query";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/collections/stats")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Collection Statistics", noIndex: true }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.query({
        ...collectionsQueryOptions(context.userId),
        staleTime: "static",
      }),
      context.queryClient.query({ ...publicSetListQueryOptions, staleTime: "static" }),
    ]);
  },
});
