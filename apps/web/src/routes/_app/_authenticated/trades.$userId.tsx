import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { tradeSheetQueryOptions } from "@/hooks/use-card-trades";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/trades/$userId")({
  ssr: "data-only",
  // `from` carries the group the viewer came through, so the trail leads
  // back there; checked against the sheet's own groups before use.
  validateSearch: (search: Record<string, unknown>) => ({
    from: typeof search.from === "string" && search.from.length > 0 ? search.from : undefined,
  }),
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Trade sheet", noIndex: true }),
  loader: async ({ context, params }) => {
    await context.queryClient.query({
      ...tradeSheetQueryOptions(context.userId, params.userId),
      staleTime: "static",
    });
  },
  errorComponent: RouteErrorFallback,
});
