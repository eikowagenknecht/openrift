import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { AdminPending } from "@/features/admin/components/admin-route-components";
import { adminSiteSettingsQueryOptions } from "@/hooks/use-site-settings";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/site-settings")({
  head: () => adminSeoHead("Site Settings"),
  loader: ({ context }) =>
    context.queryClient.query({ ...adminSiteSettingsQueryOptions, staleTime: "static" }),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
