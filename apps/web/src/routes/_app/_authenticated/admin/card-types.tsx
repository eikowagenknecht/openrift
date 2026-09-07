import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { AdminPending } from "@/features/admin/components/admin-route-components";
import { adminCardTypesQueryOptions } from "@/features/cards/hooks/use-card-types";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/card-types")({
  head: () => adminSeoHead("Card Types"),
  loader: ({ context }) =>
    context.queryClient.query({ ...adminCardTypesQueryOptions, staleTime: "static" }),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
