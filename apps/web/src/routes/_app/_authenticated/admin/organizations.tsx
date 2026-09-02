import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminUsersQueryOptions } from "@/hooks/use-admin-users";
import { adminOrganizationsQueryOptions } from "@/hooks/use-organizations";
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
