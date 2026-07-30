import { createFileRoute } from "@tanstack/react-router";

import { deckDetailQueryOptions } from "@/hooks/use-decks";
import { initQueryOptions } from "@/hooks/use-init";
import { sessionQueryOptions } from "@/lib/auth-session";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";
import { isLocalDeckId } from "@/stores/local-decks-store";

interface DeckImportSearch {
  replaceDeckId?: string;
  /** A deck code to prefill and auto-parse, for deep links (e.g. the Discord bot). */
  code?: string;
}

export const Route = createFileRoute("/_app/decks/import")({
  ssr: "data-only",
  validateSearch: (search: Record<string, unknown>): DeckImportSearch => {
    const result: DeckImportSearch = {};
    const replaceDeckId = search.replaceDeckId;
    if (typeof replaceDeckId === "string" && replaceDeckId.length > 0) {
      result.replaceDeckId = replaceDeckId;
    }
    const code = search.code;
    if (typeof code === "string" && code.length > 0) {
      result.code = code;
    }
    return result;
  },
  loaderDeps: ({ search }) => ({ replaceDeckId: search.replaceDeckId }),
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Import Deck", noIndex: true }),
  // Auth-optional (ADR-035): logged out, a pasted code creates a browser-local
  // deck (no loader prefetch needed). Replace mode only prefetches server deck
  // detail — a `local:` target lives in this browser's storage, and asking the
  // server about its synthetic id would 404.
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(initQueryOptions);
    if (deps.replaceDeckId && !isLocalDeckId(deps.replaceDeckId)) {
      const session = await context.queryClient.ensureQueryData(sessionQueryOptions());
      if (session?.user) {
        await context.queryClient.ensureQueryData(
          deckDetailQueryOptions(session.user.id, deps.replaceDeckId),
        );
      }
    }
  },
});
