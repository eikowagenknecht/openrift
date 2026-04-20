import { createLazyFileRoute } from "@tanstack/react-router";

import { CardTypesPage } from "@/components/admin/card-types-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/card-types")({
  component: CardTypesPage,
});
