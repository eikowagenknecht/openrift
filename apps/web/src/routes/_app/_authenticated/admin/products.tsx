import { createFileRoute } from "@tanstack/react-router";

import { RouteErrorFallback } from "@/components/error-message";
import { AdminPending } from "@/features/admin/components/admin-route-components";
import { productsListQueryOptions } from "@/features/cards/hooks/use-products";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/products")({
  head: () => adminSeoHead("Products"),
  loader: ({ context }) =>
    context.queryClient.query({ ...productsListQueryOptions, staleTime: "static" }),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
