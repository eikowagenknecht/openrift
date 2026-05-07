import { createFileRoute, notFound } from "@tanstack/react-router";

import { RouteErrorFallback, RouteNotFoundFallback } from "@/components/error-message";
import { cardDetailQueryOptions } from "@/hooks/use-card-detail";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/contribute_/$cardSlug_/image/$printingId")({
  head: ({ params }) =>
    seoHead({
      siteUrl: getSiteUrl(),
      title: `Suggest an image for ${params.cardSlug}`,
      description: "Suggest a missing image for a Riftbound card printing on OpenRift.",
      path: `/contribute/${params.cardSlug}/image/${params.printingId}`,
    }),
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(cardDetailQueryOptions(params.cardSlug));
    if (!data.printings.some((p) => p.id === params.printingId)) {
      throw notFound();
    }
  },
  component: () => null,
  errorComponent: RouteErrorFallback,
  notFoundComponent: RouteNotFoundFallback,
});
