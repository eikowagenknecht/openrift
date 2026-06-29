import { createLazyFileRoute } from "@tanstack/react-router";

import { TournamentSectionFrame } from "@/components/tournaments/tournament-detail-frame";
import {
  AddParticipantButton,
  TournamentParticipantsTab,
} from "@/components/tournaments/tournament-participants-tab";
import { useTournamentDetail } from "@/hooks/use-tournaments";
import { canManageTournament } from "@/lib/tournament-display";

export const Route = createLazyFileRoute("/_app/_authenticated/tournaments_/$id_/participants")({
  component: TournamentParticipantsRoute,
});

function TournamentParticipantsRoute() {
  const { id } = Route.useParams();
  const { data: detail } = useTournamentDetail(id);
  // Hosts / organizers may add players by hand.
  const showAdd = canManageTournament(detail.myRoles);
  return (
    <TournamentSectionFrame
      id={id}
      section="participants"
      actions={showAdd ? <AddParticipantButton id={id} /> : undefined}
      render={(loadedDetail) => <TournamentParticipantsTab id={id} detail={loadedDetail} />}
    />
  );
}
