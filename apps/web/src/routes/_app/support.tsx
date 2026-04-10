import { createFileRoute } from "@tanstack/react-router";

import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/support")({
  head: () =>
    seoHead({
      siteUrl: getSiteUrl(),
      title: "Support",
      description:
        "Get help with OpenRift. Report bugs, request features, or contact the developer.",
      path: "/support",
    }),
});
