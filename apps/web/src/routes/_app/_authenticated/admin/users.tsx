import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { AdminPending } from "@/features/admin/components/admin-route-components";
import { adminDashboardQueryOptions } from "@/features/admin/hooks/use-admin-dashboard";
import { adminGrantsQueryOptions } from "@/features/admin/hooks/use-admin-grants";
import { adminUsersQueryOptions } from "@/features/admin/hooks/use-admin-users";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/users")({
  head: () => adminSeoHead("Users"),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.query({ ...adminUsersQueryOptions, staleTime: "static" }),
      context.queryClient.query({ ...adminGrantsQueryOptions, staleTime: "static" }),
      context.queryClient.query({ ...adminDashboardQueryOptions, staleTime: "static" }),
    ]);
  },
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
