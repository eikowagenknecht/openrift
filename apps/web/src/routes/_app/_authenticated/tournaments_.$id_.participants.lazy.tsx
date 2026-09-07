import { createLazyFileRoute } from "@tanstack/react-router";

import { TournamentSectionFrame } from "@/features/tournaments/components/tournament-detail-frame";
import {
  AddParticipantButton,
  TournamentParticipantsTab,
} from "@/features/tournaments/components/tournament-participants-tab";
import { useTournamentDetail } from "@/features/tournaments/hooks/use-tournaments";
import { canManageTournament } from "@/features/tournaments/lib/tournament-display";

export const Route = createLazyFileRoute("/_app/_authenticated/tournaments_/$id_/participants")({
  component: TournamentParticipantsRoute,
});

function TournamentParticipantsRoute() {
  const { id } = Route.useParams();
  const { data: detail } = useTournamentDetail(id);
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
