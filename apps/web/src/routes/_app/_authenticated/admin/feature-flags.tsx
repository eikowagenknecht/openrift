import { createFileRoute } from "@tanstack/react-router";

import { AdminError, AdminPending } from "@/components/admin/admin-route-components";
import { adminFeatureFlagsQueryOptions } from "@/hooks/use-feature-flags";

export const Route = createFileRoute("/_app/_authenticated/admin/feature-flags")({
  loader: ({ context }) => context.queryClient.ensureQueryData(adminFeatureFlagsQueryOptions),
  pendingComponent: AdminPending,
  errorComponent: AdminError,
});
