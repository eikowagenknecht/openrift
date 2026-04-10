import { createFileRoute } from "@tanstack/react-router";

import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/roadmap")({
  head: () =>
    seoHead({
      siteUrl: getSiteUrl(),
      title: "Roadmap",
      description: "Planned features and upcoming improvements for OpenRift.",
      path: "/roadmap",
    }),
});
