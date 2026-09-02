import { createFileRoute, redirect } from "@tanstack/react-router";

import { sessionQueryOptions } from "@/lib/auth-session";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/contribute")({
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
      title: "Contribute card data",
      description:
        "Submit a missing or corrected Riftbound card to OpenRift. Fill in what you know and send it for review, right from the app.",
      path: "/contribute",
    }),
});
