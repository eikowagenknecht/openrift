import { createFileRoute } from "@tanstack/react-router";

import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/privacy-policy")({
  head: () =>
    seoHead({
      siteUrl: getSiteUrl(),
      title: "Privacy Policy",
      description: "How OpenRift handles your data, cookies, and privacy.",
      path: "/privacy-policy",
    }),
});
