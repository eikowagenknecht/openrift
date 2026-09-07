import { createLazyFileRoute } from "@tanstack/react-router";

import { TournamentSectionFrame } from "@/features/tournaments/components/tournament-detail-frame";
import {
  TournamentStaffAddButton,
  TournamentStaffTab,
} from "@/features/tournaments/components/tournament-staff-tab";
import { useTournamentDetail } from "@/features/tournaments/hooks/use-tournaments";
import { isTournamentHost } from "@/features/tournaments/lib/tournament-display";

export const Route = createLazyFileRoute("/_app/_authenticated/tournaments_/$id_/staff")({
  component: TournamentStaffRoute,
});

function TournamentStaffRoute() {
  const { id } = Route.useParams();
  const { data: detail } = useTournamentDetail(id);
  const host = isTournamentHost(detail.myRoles);
  return (
    <TournamentSectionFrame
      id={id}
      section="staff"
      actions={host ? <TournamentStaffAddButton tournamentId={id} /> : undefined}
      render={(data) => <TournamentStaffTab detail={data} />}
    />
  );
}
