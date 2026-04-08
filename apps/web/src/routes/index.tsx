import { createFileRoute, redirect } from "@tanstack/react-router";

import { catalogQueryOptions } from "@/hooks/use-cards";
import { sessionQueryOptions } from "@/lib/auth-session";
import { seoHead, websiteJsonLd } from "@/lib/seo";

export const Route = createFileRoute("/")({
  head: () => ({
    ...seoHead({
      title: "OpenRift — Riftbound Card Collection Browser",
      description:
        "Browse, collect, and build decks for the Riftbound trading card game. Search cards, track your collection, compare prices, and share decks.",
      path: "/",
    }),
    scripts: [websiteJsonLd()],
  }),
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions());
    if (session?.user) {
      throw redirect({ to: "/cards" });
    }
  },
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(catalogQueryOptions);
  },
});
