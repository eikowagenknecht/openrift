import { createLazyFileRoute } from "@tanstack/react-router";

import { TournamentStaffInvitePage } from "@/components/tournaments/tournament-staff-invite-page";

export const Route = createLazyFileRoute("/_app/_authenticated/tournaments_/staff-invite/$token")({
  component: StaffInviteRoute,
});

function StaffInviteRoute() {
  const { token } = Route.useParams();
  return <TournamentStaffInvitePage token={token} />;
}
