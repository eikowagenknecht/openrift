import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { productsListQueryOptions } from "@/hooks/use-products";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/products")({
  staticData: { title: "Products" },
  head: () => adminSeoHead("Products"),
  loader: ({ context }) => context.queryClient.ensureQueryData(productsListQueryOptions),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
