import { createFileRoute } from "@tanstack/react-router";

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
});
