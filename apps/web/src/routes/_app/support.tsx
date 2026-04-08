import { createFileRoute } from "@tanstack/react-router";

import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/support")({
  head: () =>
    seoHead({
      title: "Support",
      description:
        "Get help with OpenRift. Report bugs, request features, or contact the developer.",
      path: "/support",
    }),
});
