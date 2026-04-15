import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminDistributionChannelsQueryOptions } from "@/hooks/use-distribution-channels";

export const Route = createFileRoute("/_app/_authenticated/admin/distribution-channels")({
  staticData: { title: "Distribution Channels" },
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(adminDistributionChannelsQueryOptions),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
