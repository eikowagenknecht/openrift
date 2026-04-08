import { createFileRoute } from "@tanstack/react-router";

import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/roadmap")({
  head: () =>
    seoHead({
      title: "Roadmap",
      description: "Planned features and upcoming improvements for OpenRift.",
      path: "/roadmap",
    }),
});
