import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { AdminPending } from "@/features/admin/components/admin-route-components";
import { marketplaceGroupsQueryOptions } from "@/features/admin/hooks/use-marketplace-groups";
import { setsQueryOptions } from "@/features/cards/hooks/use-sets";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/marketplace-groups")({
  head: () => adminSeoHead("Marketplace Groups"),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.query({ ...marketplaceGroupsQueryOptions, staleTime: "static" }),
      context.queryClient.query({ ...setsQueryOptions, staleTime: "static" }),
    ]),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
