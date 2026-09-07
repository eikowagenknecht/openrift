import { createLazyFileRoute } from "@tanstack/react-router";

import { TournamentSectionFrame } from "@/features/tournaments/components/tournament-detail-frame";
import { TournamentSettingsTab } from "@/features/tournaments/components/tournament-settings-tab";

export const Route = createLazyFileRoute("/_app/_authenticated/tournaments_/$id_/settings")({
  component: TournamentSettingsRoute,
});

function TournamentSettingsRoute() {
  const { id } = Route.useParams();
  return (
    <TournamentSectionFrame
      id={id}
      section="settings"
      render={(detail) => <TournamentSettingsTab detail={detail} />}
    />
  );
}
