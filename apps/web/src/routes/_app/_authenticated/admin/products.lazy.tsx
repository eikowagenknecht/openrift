import { createLazyFileRoute } from "@tanstack/react-router";

import { AdminProductsPage } from "@/features/admin/components/products-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/products")({
  component: AdminProductsPage,
});
