import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { providerStatsQueryOptions } from "@/hooks/use-admin-card-queries";
import { providerSettingsQueryOptions } from "@/hooks/use-provider-settings";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/sources")({
  staticData: { title: "Sources" },
  head: () => adminSeoHead("Sources"),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(providerStatsQueryOptions),
      context.queryClient.ensureQueryData(providerSettingsQueryOptions),
    ]);
  },
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
