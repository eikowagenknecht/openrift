import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { providerStatsQueryOptions } from "@/hooks/use-candidates";
import { providerSettingsQueryOptions } from "@/hooks/use-provider-settings";

export const Route = createFileRoute("/_app/_authenticated/admin/sources")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(providerStatsQueryOptions),
      context.queryClient.ensureQueryData(providerSettingsQueryOptions),
    ]);
  },
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
