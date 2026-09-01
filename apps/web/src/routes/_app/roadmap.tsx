import { createFileRoute } from "@tanstack/react-router";

import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/roadmap")({
  head: () =>
    seoHead({
      siteUrl: getSiteUrl(),
      title: "Roadmap",
      description: "Every feature OpenRift has shipped so far, and how to shape what comes next.",
      path: "/roadmap",
    }),
});
