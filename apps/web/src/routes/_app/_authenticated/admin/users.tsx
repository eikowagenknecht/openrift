import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminGrantsQueryOptions } from "@/hooks/use-admin-grants";
import { adminUsersQueryOptions } from "@/hooks/use-admin-users";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/users")({
  staticData: { title: "Users" },
  head: () => adminSeoHead("Users"),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(adminUsersQueryOptions),
      context.queryClient.ensureQueryData(adminGrantsQueryOptions),
    ]),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
