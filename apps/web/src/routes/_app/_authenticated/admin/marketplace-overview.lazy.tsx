import { createLazyFileRoute } from "@tanstack/react-router";

import { MarketplaceOverviewPage } from "@/components/admin/marketplace-overview-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/marketplace-overview")({
  component: MarketplaceOverviewPage,
});
