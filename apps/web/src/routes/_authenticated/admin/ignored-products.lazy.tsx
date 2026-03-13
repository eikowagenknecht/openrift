import { createLazyFileRoute } from "@tanstack/react-router";

import { IgnoredProductsPage } from "@/components/admin/ignored-products-page";

export const Route = createLazyFileRoute("/_authenticated/admin/ignored-products")({
  component: IgnoredProductsPage,
});
