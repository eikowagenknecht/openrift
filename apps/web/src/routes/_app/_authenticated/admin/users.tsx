import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminGrantsQueryOptions } from "@/hooks/use-admin-grants";
import { adminUsersQueryOptions } from "@/hooks/use-admin-users";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/users")({
  head: () => adminSeoHead("Users"),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.query({ ...adminUsersQueryOptions, staleTime: "static" }),
      context.queryClient.query({ ...adminGrantsQueryOptions, staleTime: "static" }),
    ]),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
