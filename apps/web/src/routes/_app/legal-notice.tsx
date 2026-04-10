import { createFileRoute } from "@tanstack/react-router";

import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/legal-notice")({
  head: () =>
    seoHead({
      siteUrl: getSiteUrl(),
      title: "Legal Notice",
      description: "Legal notice and imprint for OpenRift.",
      path: "/legal-notice",
    }),
});
