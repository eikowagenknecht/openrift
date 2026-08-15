import { isAllowedLinkUrl } from "@openrift/shared";
import { createFileRoute } from "@tanstack/react-router";

import { deckDetailQueryOptions } from "@/hooks/use-decks";
import { initQueryOptions } from "@/hooks/use-init";
import { sessionQueryOptions } from "@/lib/auth-session";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";
import { isLocalDeckId } from "@/stores/local-decks-store";

interface DeckImportSearch {
  replaceDeckId?: string;
  /** Deck data to prefill and auto-parse, for deep links (e.g. the Discord bot or the browser extension). Any format the import box accepts. */
  code?: string;
  /** A deck name to prefill alongside `code` (e.g. the source page's deck title). */
  name?: string;
  /** The page the deck came from, offered on the review step as a deck link. Allowlisted hosts only. */
  source?: string;
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
    const name = search.name;
    if (typeof name === "string") {
      // Clamp to the deck contract's name limit so a hostile link can't
      // produce an unsaveable prefill.
      const trimmed = name.trim().slice(0, 200);
      if (trimmed.length > 0) {
        result.name = trimmed;
      }
    }
    const source = search.source;
    // The param is whatever the address bar says, so it faces the same two
    // rules a typed-in deck link does: allowlisted https host, and the deck
    // contract's 500-char URL limit. Anything else is dropped rather than
    // offered and then rejected on save.
    //
    // Checked with `isAllowedLinkUrl` rather than `deckLinkSchema`: every route
    // file is evaluated on every page load, so importing the schema put all 700
    // lines of `response-schemas` in the startup graph for one URL check on one
    // route. (The oRPC contracts still pull that module in elsewhere, so this
    // removes a preload rather than the zod work itself.)
    if (typeof source === "string" && source.length <= 500 && isAllowedLinkUrl(source)) {
      result.source = source;
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
