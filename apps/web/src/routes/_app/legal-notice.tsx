import { createFileRoute } from "@tanstack/react-router";

import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/legal-notice")({
  head: () =>
    seoHead({
      title: "Legal Notice",
      description: "Legal notice and imprint for OpenRift.",
      path: "/legal-notice",
    }),
});
