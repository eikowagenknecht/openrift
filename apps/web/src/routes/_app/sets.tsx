import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { publicSetListQueryOptions } from "@/hooks/use-public-sets";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/sets")({
  head: () =>
    seoHead({
      siteUrl: getSiteUrl(),
      title: "Riftbound Card Sets",
      description:
        "Browse all Riftbound card sets. View cards, printings, and details for each set.",
      path: "/sets",
    }),
  loader: ({ context }) => context.queryClient.ensureQueryData(publicSetListQueryOptions),
  component: () => null,
  pendingComponent: () => null,
  errorComponent: RouteErrorFallback,
});
