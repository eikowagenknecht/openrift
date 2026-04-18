import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { marketplaceGroupsQueryOptions } from "@/hooks/use-marketplace-groups";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/marketplace-groups")({
  staticData: { title: "Marketplace Groups" },
  head: () => adminSeoHead("Marketplace Groups"),
  loader: ({ context }) => context.queryClient.ensureQueryData(marketplaceGroupsQueryOptions),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
