import { createLazyFileRoute } from "@tanstack/react-router";

import { DeckEditorPage } from "@/components/deck/deck-editor-page";
import { FilterSearchProvider } from "@/lib/search-schemas";

export const Route = createLazyFileRoute("/_app/_authenticated/decks/$deckId")({
  component: DeckEditor,
});

function DeckEditor() {
  const { deckId } = Route.useParams();
  const search = Route.useSearch();
  return (
    <FilterSearchProvider value={search}>
      <DeckEditorPage deckId={deckId} />
    </FilterSearchProvider>
  );
}
