import { createFileRoute } from "@tanstack/react-router";

import { ignoredProductsQueryOptions } from "@/hooks/use-ignored-products";

export const Route = createFileRoute("/_authenticated/admin/ignored-products")({
  loader: ({ context }) => context.queryClient.ensureQueryData(ignoredProductsQueryOptions),
});
