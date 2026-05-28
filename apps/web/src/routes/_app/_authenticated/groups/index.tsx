import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { friendGroupsQueryOptions } from "@/hooks/use-friend-groups";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/groups/")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Groups", noIndex: true }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(friendGroupsQueryOptions(context.userId));
  },
  errorComponent: RouteErrorFallback,
});
