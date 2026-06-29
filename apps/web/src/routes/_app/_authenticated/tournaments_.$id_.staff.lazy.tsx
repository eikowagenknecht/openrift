import { createLazyFileRoute } from "@tanstack/react-router";

import { TournamentSectionFrame } from "@/components/tournaments/tournament-detail-frame";
import {
  TournamentStaffAddButton,
  TournamentStaffTab,
} from "@/components/tournaments/tournament-staff-tab";
import { useTournamentDetail } from "@/hooks/use-tournaments";
import { isTournamentHost } from "@/lib/tournament-display";

export const Route = createLazyFileRoute("/_app/_authenticated/tournaments_/$id_/staff")({
  component: TournamentStaffRoute,
});

function TournamentStaffRoute() {
  const { id } = Route.useParams();
  const { data: detail } = useTournamentDetail(id);
  // Only the host may add staff.
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
