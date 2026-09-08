import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { userTradesQueryOptions } from "@/features/groups/hooks/use-card-trades";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/trades/")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Trades", noIndex: true }),
  loader: async ({ context }) => {
    await context.queryClient.query({
      ...userTradesQueryOptions(context.userId),
      staleTime: "static",
    });
  },
  errorComponent: RouteErrorFallback,
});
