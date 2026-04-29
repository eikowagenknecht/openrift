import { createFileRoute } from "@tanstack/react-router";

import { collectionsQueryOptions } from "@/lib/collections-query";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/collections/import")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Import / Export", noIndex: true }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(collectionsQueryOptions(context.userId));
  },
});
