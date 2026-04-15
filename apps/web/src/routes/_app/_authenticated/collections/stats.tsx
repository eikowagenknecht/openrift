import { createFileRoute } from "@tanstack/react-router";

import { collectionsQueryOptions } from "@/hooks/use-collections";
import { copiesQueryOptions } from "@/hooks/use-copies";
import { publicSetListQueryOptions } from "@/hooks/use-public-sets";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/collections/stats")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Collection Statistics", noIndex: true }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(collectionsQueryOptions),
      context.queryClient.ensureQueryData(copiesQueryOptions()),
      context.queryClient.ensureQueryData(publicSetListQueryOptions),
    ]);
  },
});
