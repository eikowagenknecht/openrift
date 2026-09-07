import { createLazyFileRoute } from "@tanstack/react-router";

import { DistributionChannelsPage } from "@/features/admin/components/distribution-channels-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/distribution-channels")({
  component: DistributionChannelsPage,
});
