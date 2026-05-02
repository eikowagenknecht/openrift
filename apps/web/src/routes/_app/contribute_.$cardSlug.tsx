import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback, RouteNotFoundFallback } from "@/components/error-message";
import { cardDetailQueryOptions } from "@/hooks/use-card-detail";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/contribute_/$cardSlug")({
  head: ({ params }) =>
    seoHead({
      siteUrl: getSiteUrl(),
      title: `Suggest correction for ${params.cardSlug}`,
      description: "Suggest a correction to a Riftbound card on OpenRift.",
      path: `/contribute/${params.cardSlug}`,
    }),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(cardDetailQueryOptions(params.cardSlug)),
  component: () => null,
  errorComponent: RouteErrorFallback,
  notFoundComponent: RouteNotFoundFallback,
});
