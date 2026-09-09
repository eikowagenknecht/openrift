import { createFileRoute, redirect } from "@tanstack/react-router";

import { sessionQueryOptions } from "@/lib/auth-session";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/contribute_/fix")({
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
  head: () =>
    seoHead({
      siteUrl: getSiteUrl(),
      title: "Fix something on a card",
      description:
        "Suggest a correction to a Riftbound card on OpenRift. Pick the card, then tell us what is wrong.",
      path: "/contribute/fix",
    }),
});
