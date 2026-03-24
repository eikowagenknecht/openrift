import { createFileRoute } from "@tanstack/react-router";

import { AdminError, AdminPending } from "@/components/admin/admin-route-components";
import { marketplaceGroupsQueryOptions } from "@/hooks/use-marketplace-groups";

export const Route = createFileRoute("/_app/_authenticated/admin/marketplace-groups")({
  loader: ({ context }) => context.queryClient.ensureQueryData(marketplaceGroupsQueryOptions),
  pendingComponent: AdminPending,
  errorComponent: AdminError,
});
