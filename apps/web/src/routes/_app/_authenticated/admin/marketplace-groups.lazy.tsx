import { createLazyFileRoute } from "@tanstack/react-router";

import { MarketplaceGroupsPage } from "@/components/admin/marketplace-groups-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/marketplace-groups")({
  component: MarketplaceGroupsPage,
});
