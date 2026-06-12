import { createLazyFileRoute } from "@tanstack/react-router";

import { PlayerDecksPage } from "@/components/deck-check/player-decks-page";

export const Route = createLazyFileRoute("/_app/_authenticated/tournament-decks")({
  component: PlayerDecksPage,
});
