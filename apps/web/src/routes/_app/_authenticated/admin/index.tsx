import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { AdminPending } from "@/features/admin/components/admin-route-components";
import { adminDashboardQueryOptions } from "@/features/admin/hooks/use-admin-dashboard";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/")({
  head: () => adminSeoHead("Dashboard"),
  loader: async ({ context }) => {
    await context.queryClient.query({ ...adminDashboardQueryOptions, staleTime: "static" });
  },
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
