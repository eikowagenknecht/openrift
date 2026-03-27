import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminSiteSettingsQueryOptions } from "@/hooks/use-site-settings";

export const Route = createFileRoute("/_app/_authenticated/admin/site-settings")({
  loader: ({ context }) => context.queryClient.ensureQueryData(adminSiteSettingsQueryOptions),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
