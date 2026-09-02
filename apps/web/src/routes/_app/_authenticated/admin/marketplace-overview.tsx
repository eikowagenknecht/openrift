import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminJobSchedulesQueryOptions } from "@/hooks/use-job-schedules";
import { marketplaceGroupsQueryOptions } from "@/hooks/use-marketplace-groups";
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
