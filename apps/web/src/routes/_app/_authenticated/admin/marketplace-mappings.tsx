import { createFileRoute } from "@tanstack/react-router";

import { AdminError, AdminPending } from "@/components/admin/admin-route-components";
import { unifiedMappingsQueryOptions } from "@/hooks/use-unified-mappings";

export const Route = createFileRoute("/_app/_authenticated/admin/marketplace-mappings")({
  loader: ({ context }) => context.queryClient.ensureQueryData(unifiedMappingsQueryOptions()),
  pendingComponent: AdminPending,
  errorComponent: AdminError,
});
