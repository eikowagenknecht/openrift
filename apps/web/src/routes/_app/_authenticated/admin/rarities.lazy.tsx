import { createLazyFileRoute } from "@tanstack/react-router";

import { RaritiesPage } from "@/components/admin/rarities-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/rarities")({
  component: RaritiesPage,
});
