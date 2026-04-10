import { createFileRoute } from "@tanstack/react-router";

import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/changelog")({
  head: () =>
    seoHead({
      siteUrl: getSiteUrl(),
      title: "Changelog",
      description: "Recent updates and new features in OpenRift.",
      path: "/changelog",
    }),
});
