import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { friendGroupDetailQueryOptions } from "@/hooks/use-friend-groups";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/groups/$slug_/manage")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Manage group", noIndex: true }),
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(
      friendGroupDetailQueryOptions(context.userId, params.slug),
    );
  },
  errorComponent: RouteErrorFallback,
});
