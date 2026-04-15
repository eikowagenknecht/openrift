import { createLazyFileRoute } from "@tanstack/react-router";

import { DistributionChannelsPage } from "@/components/admin/distribution-channels-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/distribution-channels")({
  component: DistributionChannelsPage,
});
