import { createFileRoute, redirect } from "@tanstack/react-router";

import { sessionQueryOptions } from "@/lib/auth-session";
import { seoHead, websiteJsonLd } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/")({
  head: () => {
    const siteUrl = getSiteUrl();
    return {
      ...seoHead({
        siteUrl,
        title: "OpenRift — Riftbound Card Collection Browser",
        description:
          "Browse, collect, and build decks for the Riftbound trading card game. Search cards, track your collection, compare prices, and share decks.",
        path: "/",
      }),
      scripts: [websiteJsonLd(siteUrl)],
    };
  },
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions());
    if (session?.user) {
      throw redirect({ to: "/cards" });
    }
  },
});
