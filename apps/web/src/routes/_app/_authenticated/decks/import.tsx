import { createFileRoute } from "@tanstack/react-router";

import { deckDetailQueryOptions } from "@/hooks/use-decks";
import { initQueryOptions } from "@/hooks/use-init";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

interface DeckImportSearch {
  replaceDeckId?: string;
}

export const Route = createFileRoute("/_app/_authenticated/decks/import")({
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
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(initQueryOptions);
    if (deps.replaceDeckId) {
      await context.queryClient.ensureQueryData(
        deckDetailQueryOptions(context.userId, deps.replaceDeckId),
      );
    }
  },
});
