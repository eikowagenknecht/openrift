import { createLazyFileRoute } from "@tanstack/react-router";

import { NotFoundFallback } from "@/components/error-message";
import { FilterSearchProvider } from "@/features/cards/lib/search-schemas";
import { DeckEditorPage } from "@/features/decks/components/deck-editor-page";
import { isLocalDeckId } from "@/features/decks/lib/local-deck";
import { useLocalDecksStore } from "@/features/decks/stores/local-decks-store";
import { useHydrated } from "@/hooks/use-hydrated";
import { ViewSurfaceProvider } from "@/hooks/use-view-prefs";

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
  // useLiveQuery (via useOwnedCount/useDeckBuildingCounts) has no server snapshot,
  // so the mount is deferred until hydration to avoid tripping React's fallback.
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
    <ViewSurfaceProvider value="deckBrowser">
      <FilterSearchProvider value={search}>
        {/* Key on deckId: remounts on change so useDeckDetail's local/server branch
            never switches within one mount (hook order must stay stable). */}
        <DeckEditorPage key={deckId} deckId={deckId} />
      </FilterSearchProvider>
    </ViewSurfaceProvider>
  );
}
