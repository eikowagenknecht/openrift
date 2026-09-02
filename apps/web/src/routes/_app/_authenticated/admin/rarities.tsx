import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminRaritiesQueryOptions } from "@/hooks/use-rarities";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/rarities")({
  head: () => adminSeoHead("Rarities"),
  loader: ({ context }) =>
    context.queryClient.query({ ...adminRaritiesQueryOptions, staleTime: "static" }),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
