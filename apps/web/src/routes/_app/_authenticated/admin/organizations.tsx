import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { AdminPending } from "@/features/admin/components/admin-route-components";
import { adminUsersQueryOptions } from "@/features/admin/hooks/use-admin-users";
import { adminOrganizationsQueryOptions } from "@/features/tournaments/hooks/use-organizations";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/organizations")({
  head: () => adminSeoHead("Organizations"),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.query({ ...adminOrganizationsQueryOptions, staleTime: "static" }),
      context.queryClient.query({ ...adminUsersQueryOptions, staleTime: "static" }),
    ]),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
