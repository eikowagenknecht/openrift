import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { tierListsQueryOptions } from "@/hooks/use-tier-lists";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/tier-lists")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Tier lists", noIndex: true }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(tierListsQueryOptions(context.userId));
  },
  errorComponent: RouteErrorFallback,
});
