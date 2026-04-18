import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminSiteSettingsQueryOptions } from "@/hooks/use-site-settings";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/site-settings")({
  staticData: { title: "Site Settings" },
  head: () => adminSeoHead("Site Settings"),
  loader: ({ context }) => context.queryClient.ensureQueryData(adminSiteSettingsQueryOptions),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
