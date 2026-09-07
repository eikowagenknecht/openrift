import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { AdminPending } from "@/features/admin/components/admin-route-components";
import { adminJobSchedulesQueryOptions } from "@/features/admin/hooks/use-job-schedules";
import { marketplaceGroupsQueryOptions } from "@/features/admin/hooks/use-marketplace-groups";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/marketplace-overview")({
  head: () => adminSeoHead("Marketplace Overview"),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.query({ ...marketplaceGroupsQueryOptions, staleTime: "static" }),
      context.queryClient.query({ ...adminJobSchedulesQueryOptions, staleTime: "static" }),
    ]),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
