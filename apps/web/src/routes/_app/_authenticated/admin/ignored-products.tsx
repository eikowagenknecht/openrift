import { createFileRoute } from "@tanstack/react-router";

import { AdminPending } from "@/components/admin/admin-route-components";
import { RouteErrorFallback } from "@/components/error-message";
import { ignoredProductsQueryOptions } from "@/hooks/use-ignored-products";
import { adminSeoHead } from "@/lib/seo";

export const Route = createFileRoute("/_app/_authenticated/admin/ignored-products")({
  staticData: { title: "Ignored Products" },
  head: () => adminSeoHead("Ignored Products"),
  loader: ({ context }) => context.queryClient.ensureQueryData(ignoredProductsQueryOptions),
  pendingComponent: AdminPending,
  errorComponent: RouteErrorFallback,
});
