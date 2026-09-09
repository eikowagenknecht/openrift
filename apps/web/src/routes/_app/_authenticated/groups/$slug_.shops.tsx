import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { friendGroupShopEventsQueryOptions } from "@/features/groups/hooks/use-friend-group-shops";
import { ensureFriendGroupDetailCanonical } from "@/features/groups/hooks/use-friend-groups";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/groups/$slug_/shops")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Shop events", noIndex: true }),
  loader: async ({ context, location, params }) => {
    await Promise.all([
      ensureFriendGroupDetailCanonical({
        queryClient: context.queryClient,
        userId: context.userId,
        slug: params.slug,
        location,
      }),
      context.queryClient.query({
        ...friendGroupShopEventsQueryOptions(context.userId, params.slug),
        staleTime: "static",
      }),
    ]);
  },
  errorComponent: RouteErrorFallback,
});
