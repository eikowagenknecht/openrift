import { createLazyFileRoute } from "@tanstack/react-router";

import { SettingsTab } from "@/components/pod-tournaments/tournament-page";
import { TournamentPageFrame } from "@/components/pod-tournaments/tournament-shell";

export const Route = createLazyFileRoute("/_app/_authenticated/tournaments_/run/$id_/settings")({
  component: TournamentSettingsRoute,
});

function TournamentSettingsRoute() {
  const { id } = Route.useParams();
  return (
    <TournamentPageFrame
      id={id}
      active="settings"
      render={(data) => <SettingsTab id={id} data={data} />}
    />
  );
}
