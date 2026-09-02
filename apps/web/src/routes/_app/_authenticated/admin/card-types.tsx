import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { adminCardTypesQueryOptions } from "@/hooks/use-card-types";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/card-types")({
  head: () => adminSeoHead("Card Types"),
  loader: ({ context }) =>
    context.queryClient.query({ ...adminCardTypesQueryOptions, staleTime: "static" }),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
