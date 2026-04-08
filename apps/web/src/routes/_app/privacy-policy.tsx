import { createFileRoute } from "@tanstack/react-router";

import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/privacy-policy")({
  head: () =>
    seoHead({
      title: "Privacy Policy",
      description: "How OpenRift handles your data, cookies, and privacy.",
      path: "/privacy-policy",
    }),
});
