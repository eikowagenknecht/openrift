import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/creators")({
  head: () =>
    seoHead({
      siteUrl: getSiteUrl(),
      title: "For creators",
      description:
        "Tools for Riftbound streamers and video makers: card lookups in chat, tier lists, and the Stage for putting cards on screen or into OBS.",
      path: "/creators",
    }),
  errorComponent: RouteErrorFallback,
});
