import { createLazyFileRoute } from "@tanstack/react-router";

import { PromoTypesPage } from "@/components/admin/promo-types-page";

export const Route = createLazyFileRoute("/_authenticated/admin/promo-types")({
  component: PromoTypesPage,
});
