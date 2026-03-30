import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminUsersQueryOptions } from "@/hooks/use-admin-users";

export const Route = createFileRoute("/_app/_authenticated/admin/users")({
  loader: ({ context }) => context.queryClient.ensureQueryData(adminUsersQueryOptions),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
