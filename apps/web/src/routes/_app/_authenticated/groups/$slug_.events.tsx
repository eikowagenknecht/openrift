import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { ensureFriendGroupDetailCanonical } from "@/features/groups/hooks/use-friend-groups";
import { groupTournamentsQueryOptions } from "@/features/tournaments/hooks/use-tournaments";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/groups/$slug_/events")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Tournaments", noIndex: true }),
  loader: async ({ context, location, params }) => {
    await Promise.all([
      ensureFriendGroupDetailCanonical({
        queryClient: context.queryClient,
        userId: context.userId,
        slug: params.slug,
        location,
      }),
      context.queryClient.query({
        ...groupTournamentsQueryOptions(context.userId, params.slug),
        staleTime: "static",
      }),
    ]);
  },
  errorComponent: RouteErrorFallback,
});
