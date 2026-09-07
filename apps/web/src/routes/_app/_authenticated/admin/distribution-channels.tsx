import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { AdminPending } from "@/features/admin/components/admin-route-components";
import { adminDistributionChannelsQueryOptions } from "@/hooks/use-distribution-channels";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/distribution-channels")({
  head: () => adminSeoHead("Distribution Channels"),
  loader: ({ context }) =>
    context.queryClient.query({ ...adminDistributionChannelsQueryOptions, staleTime: "static" }),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
