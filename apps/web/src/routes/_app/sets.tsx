import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { publicSetListQueryOptions } from "@/hooks/use-public-sets";

export const Route = createFileRoute("/_app/sets")({
  head: () => ({
    meta: [
      { title: "Card Sets — Riftbound | OpenRift" },
      {
        name: "description",
        content: "Browse all Riftbound card sets. View cards, printings, and details for each set.",
      },
      { property: "og:title", content: "Card Sets — Riftbound" },
      {
        property: "og:description",
        content: "Browse all Riftbound card sets. View cards, printings, and details for each set.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://openrift.app/sets" },
    ],
    links: [{ rel: "canonical", href: "https://openrift.app/sets" }],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(publicSetListQueryOptions),
  component: () => null,
  pendingComponent: () => null,
  errorComponent: RouteErrorFallback,
});
