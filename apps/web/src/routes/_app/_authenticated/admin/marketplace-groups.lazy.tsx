import { createLazyFileRoute } from "@tanstack/react-router";

import { MarketplaceGroupsPage } from "@/features/admin/components/marketplace-groups-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/marketplace-groups")({
  component: MarketplaceGroupsPage,
});
