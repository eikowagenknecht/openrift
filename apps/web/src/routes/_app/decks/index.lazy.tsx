import { createLazyFileRoute } from "@tanstack/react-router";

import { DeckListPage } from "@/features/decks/components/deck-list-page";

export const Route = createLazyFileRoute("/_app/decks/")({
  component: DeckListPage,
});
