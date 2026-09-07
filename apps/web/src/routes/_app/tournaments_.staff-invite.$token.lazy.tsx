import { createLazyFileRoute } from "@tanstack/react-router";

import { TournamentStaffInvitePage } from "@/features/tournaments/components/tournament-staff-invite-page";

export const Route = createLazyFileRoute("/_app/tournaments_/staff-invite/$token")({
  component: StaffInviteRoute,
});

function StaffInviteRoute() {
  const { token } = Route.useParams();
  return <TournamentStaffInvitePage token={token} />;
}
