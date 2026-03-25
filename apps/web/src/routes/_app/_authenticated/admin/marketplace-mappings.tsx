import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { unifiedMappingsQueryOptions } from "@/hooks/use-unified-mappings";

export const Route = createFileRoute("/_app/_authenticated/admin/marketplace-mappings")({
  loader: ({ context }) => context.queryClient.ensureQueryData(unifiedMappingsQueryOptions()),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
