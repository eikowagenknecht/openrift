import { createFileRoute } from "@tanstack/react-router";

import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/changelog")({
  head: () =>
    seoHead({
      title: "Changelog",
      description: "Recent updates and new features in OpenRift.",
      path: "/changelog",
    }),
});
