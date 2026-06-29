import { createLazyFileRoute } from "@tanstack/react-router";

import { TournamentSectionFrame } from "@/components/tournaments/tournament-detail-frame";
import { TournamentSettingsTab } from "@/components/tournaments/tournament-settings-tab";

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
