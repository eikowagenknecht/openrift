import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { friendGroupsQueryOptions } from "@/hooks/use-friend-groups";
import { myOrganizationsQueryOptions } from "@/hooks/use-organizations";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/tournaments_/new")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "New tournament", noIndex: true }),
  validateSearch: (search: Record<string, unknown>): { group?: string } => ({
    group: typeof search.group === "string" ? search.group : undefined,
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(myOrganizationsQueryOptions(context.userId)),
      context.queryClient.ensureQueryData(friendGroupsQueryOptions(context.userId)),
    ]);
  },
  errorComponent: RouteErrorFallback,
});
