import { createLazyFileRoute } from "@tanstack/react-router";

import { PlayerDeckPage } from "@/components/deck-check/player-deck-page";

export const Route = createLazyFileRoute("/_app/_authenticated/tournament-decks_/$entryId")({
  component: TournamentDeckRoute,
});

function TournamentDeckRoute() {
  const { entryId } = Route.useParams();
  return <PlayerDeckPage entryId={entryId} />;
}
