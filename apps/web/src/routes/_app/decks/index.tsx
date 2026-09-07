import { createFileRoute, redirect } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { cleanedSearchForRedirect } from "@/features/cards/lib/search-schemas";
import { decksQueryOptions } from "@/features/decks/hooks/use-decks";
import { deckListSearchSchema } from "@/features/decks/lib/deck-list-search";
import { sessionQueryOptions } from "@/lib/auth-session";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/decks/")({
  ssr: "data-only",
  validateSearch: deckListSearchSchema,
  beforeLoad: ({ search, location }) => {
    const cleaned = cleanedSearchForRedirect(deckListSearchSchema, search, location.searchStr);
    if (cleaned) {
      throw redirect({ to: "/decks", search: cleaned, replace: true });
    }
  },
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Decks", noIndex: true }),
  loader: async ({ context }) => {
    const session = await context.queryClient.query({
      ...sessionQueryOptions(),
      staleTime: "static",
    });
    if (session?.user) {
      await context.queryClient.query({
        ...decksQueryOptions(session.user.id),
        staleTime: "static",
      });
    }
  },
  errorComponent: RouteErrorFallback,
});
