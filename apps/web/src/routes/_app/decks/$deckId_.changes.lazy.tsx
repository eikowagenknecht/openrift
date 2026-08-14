import { createLazyFileRoute } from "@tanstack/react-router";

import { DeckChangesPage } from "@/components/deck/deck-changes-page";
import { useHydrated } from "@/hooks/use-hydrated";

export const Route = createLazyFileRoute("/_app/decks/$deckId_/changes")({
  component: DeckChanges,
});

function DeckChanges() {
  const { deckId } = Route.useParams();
  const { from } = Route.useSearch();
  // useDecks and useCards both suspend on client-only stores; the whole page is
  // the comparison, so there is nothing to server-render around them.
  const hydrated = useHydrated();
  if (!hydrated) {
    return null;
  }
  return <DeckChangesPage deckId={deckId} fromId={from} />;
}
