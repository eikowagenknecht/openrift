import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { ignoredProductsQueryOptions } from "@/hooks/use-ignored-products";

export const Route = createFileRoute("/_app/_authenticated/admin/ignored-products")({
  loader: ({ context }) => context.queryClient.ensureQueryData(ignoredProductsQueryOptions),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
