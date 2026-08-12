import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { tradeSheetQueryOptions } from "@/hooks/use-card-trades";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/trades/$userId")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Trade sheet", noIndex: true }),
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(
      tradeSheetQueryOptions(context.userId, params.userId),
    );
  },
  errorComponent: RouteErrorFallback,
});
