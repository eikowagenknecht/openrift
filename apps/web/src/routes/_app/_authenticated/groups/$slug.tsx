import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { ensureFriendGroupDetailCanonical } from "@/features/groups/hooks/use-friend-groups";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/groups/$slug")({
  ssr: "data-only",
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Group", noIndex: true }),
  loader: async ({ context, location, params }) => {
    await ensureFriendGroupDetailCanonical({
      queryClient: context.queryClient,
      userId: context.userId,
      slug: params.slug,
      location,
    });
  },
  errorComponent: RouteErrorFallback,
});
