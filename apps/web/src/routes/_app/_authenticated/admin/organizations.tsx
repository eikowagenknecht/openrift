import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminUsersQueryOptions } from "@/hooks/use-admin-users";
import { adminOrganizationsQueryOptions } from "@/hooks/use-organizations";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/organizations")({
  staticData: { title: "Organizations" },
  head: () => adminSeoHead("Organizations"),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(adminOrganizationsQueryOptions),
      context.queryClient.ensureQueryData(adminUsersQueryOptions),
    ]),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
