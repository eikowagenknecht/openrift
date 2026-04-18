import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { unifiedMappingsQueryOptions } from "@/hooks/use-unified-mappings";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/marketplace-mappings")({
  staticData: { title: "Marketplace Mappings" },
  head: () => adminSeoHead("Marketplace Mappings"),
  loader: ({ context }) => context.queryClient.ensureQueryData(unifiedMappingsQueryOptions()),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
