import { createLazyFileRoute } from "@tanstack/react-router";

import { DeckEditorPage } from "@/components/deck/deck-editor-page";
import { useHydrated } from "@/hooks/use-hydrated";
import { FilterSearchProvider } from "@/lib/search-schemas";

export const Route = createLazyFileRoute("/_app/_authenticated/decks/$deckId")({
  component: DeckEditor,
});

function DeckEditor() {
  const { deckId } = Route.useParams();
  const search = Route.useSearch();
  // DeckEditorPage and DeckCardBrowser both read from useOwnedCount /
  // useDeckBuildingCounts → useLiveQuery, which calls useSyncExternalStore
  // without a server snapshot. Defer the mount until hydration so SSR
  // doesn't trip React's client-rendering fallback.
  const hydrated = useHydrated();
  if (!hydrated) {
    return null;
  }
  return (
    <FilterSearchProvider value={search}>
      <DeckEditorPage deckId={deckId} />
    </FilterSearchProvider>
  );
}
