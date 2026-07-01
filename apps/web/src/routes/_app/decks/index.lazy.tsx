import { createLazyFileRoute } from "@tanstack/react-router";

import { DeckListPage } from "@/components/deck/deck-list-page";

export const Route = createLazyFileRoute("/_app/decks/")({
  component: DeckListPage,
});
