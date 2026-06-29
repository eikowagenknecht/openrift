import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { friendGroupDetailQueryOptions } from "@/hooks/use-friend-groups";
import { groupTournamentsQueryOptions } from "@/hooks/use-tournaments";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/groups/$slug_/events")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Tournaments", noIndex: true }),
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(
        friendGroupDetailQueryOptions(context.userId, params.slug),
      ),
      context.queryClient.ensureQueryData(
        groupTournamentsQueryOptions(context.userId, params.slug),
      ),
    ]);
  },
  errorComponent: RouteErrorFallback,
});
