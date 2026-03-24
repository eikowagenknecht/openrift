import { createFileRoute } from "@tanstack/react-router";

import { AdminError, AdminPending } from "@/components/admin/admin-route-components";
import { ignoredProductsQueryOptions } from "@/hooks/use-ignored-products";

export const Route = createFileRoute("/_app/_authenticated/admin/ignored-products")({
  loader: ({ context }) => context.queryClient.ensureQueryData(ignoredProductsQueryOptions),
  pendingComponent: AdminPending,
  errorComponent: AdminError,
});
