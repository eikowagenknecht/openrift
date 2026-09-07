import { createLazyFileRoute } from "@tanstack/react-router";

import { MarketplaceOverviewPage } from "@/features/admin/components/marketplace-overview-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/marketplace-overview")({
  component: MarketplaceOverviewPage,
});
