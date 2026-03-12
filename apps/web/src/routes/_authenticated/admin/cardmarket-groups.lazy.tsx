import { createLazyFileRoute } from "@tanstack/react-router";

import { CardmarketGroupsPage } from "@/components/admin/cardmarket-groups-page";

export const Route = createLazyFileRoute("/_authenticated/admin/cardmarket-groups")({
  component: CardmarketGroupsPage,
});
