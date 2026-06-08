import { createFileRoute } from "@tanstack/react-router";

import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/card-designer")({
  head: () =>
    seoHead({
      siteUrl: getSiteUrl(),
      title: "Card Designer",
      description:
        "Design your own custom Riftbound-style card with your own background image, then download it or copy it to share. Everything stays in your browser.",
      path: "/card-designer",
      noIndex: true,
    }),
});
