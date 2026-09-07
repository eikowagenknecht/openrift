import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

import { NotFoundFallback, RouteErrorFallback } from "@/components/error-message";
import { cardDetailQueryOptions } from "@/features/cards/hooks/use-card-detail";
import { sessionQueryOptions } from "@/lib/auth-session";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/contribute_/$cardSlug_/image/$printingId")({
  beforeLoad: async ({ location, context }) => {
    const session = await context.queryClient.query({
      ...sessionQueryOptions(),
      staleTime: "static",
    });
    if (!session?.user) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href || undefined, email: undefined },
      });
    }
  },
  head: ({ params }) =>
    seoHead({
      siteUrl: getSiteUrl(),
      title: `Suggest an image for ${params.cardSlug}`,
      description: "Suggest a missing image for a Riftbound card printing on OpenRift.",
      path: `/contribute/${params.cardSlug}/image/${params.printingId}`,
    }),
  loader: async ({ context, params }) => {
    const data = await context.queryClient.query({
      ...cardDetailQueryOptions(params.cardSlug),
      staleTime: "static",
    });
    if (!data.printings.some((p) => p.id === params.printingId)) {
      throw notFound();
    }
  },
  component: () => null,
  errorComponent: RouteErrorFallback,
  notFoundComponent: NotFoundFallback,
});
