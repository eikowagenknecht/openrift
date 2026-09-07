import { createLazyFileRoute } from "@tanstack/react-router";

import { RaritiesPage } from "@/features/admin/components/rarities-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/rarities")({
  component: RaritiesPage,
});
