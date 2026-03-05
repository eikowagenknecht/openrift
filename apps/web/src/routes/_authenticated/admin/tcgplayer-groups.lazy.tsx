import { createLazyFileRoute } from "@tanstack/react-router";

import { TcgplayerGroupsPage } from "@/components/admin/tcgplayer-groups-page";

export const Route = createLazyFileRoute("/_authenticated/admin/tcgplayer-groups")({
  component: TcgplayerGroupsPage,
});
