import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { marketplaceGroupsQueryOptions } from "@/hooks/use-marketplace-groups";
import { setsQueryOptions } from "@/hooks/use-sets";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/marketplace-groups")({
  staticData: { title: "Marketplace Groups" },
  head: () => adminSeoHead("Marketplace Groups"),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(marketplaceGroupsQueryOptions),
      context.queryClient.ensureQueryData(setsQueryOptions),
    ]),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
