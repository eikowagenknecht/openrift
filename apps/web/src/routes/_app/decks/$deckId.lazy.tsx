import { createLazyFileRoute } from "@tanstack/react-router";

import { DeckEditorPage } from "@/components/deck/deck-editor-page";
import { NotFoundFallback } from "@/components/error-message";
import { useHydrated } from "@/hooks/use-hydrated";
import { FilterSearchProvider } from "@/lib/search-schemas";
import { isLocalDeckId, useLocalDecksStore } from "@/stores/local-decks-store";

export const Route = createLazyFileRoute("/_app/decks/$deckId")({
  component: DeckEditor,
});

function DeckEditor() {
  const { deckId } = Route.useParams();
  const search = Route.useSearch();
  // The browser-local store is only readable after hydration; this selector is
  // empty/undefined during SSR and the first client render.
  const localDeckExists = useLocalDecksStore((state) =>
    isLocalDeckId(deckId) ? state.decks[deckId] !== undefined : true,
  );
  // DeckEditorPage and DeckCardBrowser both read from useOwnedCount /
  // useDeckBuildingCounts → useLiveQuery, which calls useSyncExternalStore
  // without a server snapshot. Defer the mount until hydration so SSR
  // doesn't trip React's client-rendering fallback.
  const hydrated = useHydrated();
  if (!hydrated) {
    return null;
  }
  // A `local:` id that isn't in this browser (stale bookmark, cleared cache)
  // has no deck to edit.
  if (isLocalDeckId(deckId) && !localDeckExists) {
    return <NotFoundFallback />;
  }
  return (
    <FilterSearchProvider value={search}>
      {/* Key on deckId: it remounts the whole editor subtree when the deck
          changes, so a deck id never switches its local/server class within one
          mount. That keeps `useDeckDetail`'s prefix branch hook-order-stable. */}
      <DeckEditorPage key={deckId} deckId={deckId} />
    </FilterSearchProvider>
  );
}
