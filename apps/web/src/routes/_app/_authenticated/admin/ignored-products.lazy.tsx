import { createLazyFileRoute } from "@tanstack/react-router";

import { IgnoredProductsPage } from "@/features/admin/components/ignored-products-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/ignored-products")({
  component: IgnoredProductsPage,
});
