import { createLazyFileRoute } from "@tanstack/react-router";

import { SuperTypesPage } from "@/components/admin/super-types-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/super-types")({
  component: SuperTypesPage,
});
