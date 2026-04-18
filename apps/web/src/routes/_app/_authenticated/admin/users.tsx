import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminUsersQueryOptions } from "@/hooks/use-admin-users";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/users")({
  staticData: { title: "Users" },
  head: () => adminSeoHead("Users"),
  loader: ({ context }) => context.queryClient.ensureQueryData(adminUsersQueryOptions),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
