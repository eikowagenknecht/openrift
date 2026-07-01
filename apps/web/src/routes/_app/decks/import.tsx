import { createFileRoute } from "@tanstack/react-router";

import { deckDetailQueryOptions } from "@/hooks/use-decks";
import { initQueryOptions } from "@/hooks/use-init";
import { sessionQueryOptions } from "@/lib/auth-session";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

interface DeckImportSearch {
  replaceDeckId?: string;
}

export const Route = createFileRoute("/_app/decks/import")({
  ssr: "data-only",
  validateSearch: (search: Record<string, unknown>): DeckImportSearch => {
    const value = search.replaceDeckId;
    if (typeof value === "string" && value.length > 0) {
      return { replaceDeckId: value };
    }
    return {};
  },
  loaderDeps: ({ search }) => ({ replaceDeckId: search.replaceDeckId }),
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Import Deck", noIndex: true }),
  // Auth-optional (ADR-035): logged out, a pasted code creates a browser-local
  // deck (no loader prefetch needed). Replace mode targets a server deck, so it
  // only prefetches that deck's detail when a session exists.
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(initQueryOptions);
    if (deps.replaceDeckId) {
      const session = await context.queryClient.ensureQueryData(sessionQueryOptions());
      if (session?.user) {
        await context.queryClient.ensureQueryData(
          deckDetailQueryOptions(session.user.id, deps.replaceDeckId),
        );
      }
    }
  },
});
