import { createLazyFileRoute } from "@tanstack/react-router";

import { PromosPage } from "@/components/promos/promos-page";
import { PromosPending } from "@/components/promos/promos-pending";

export const Route = createLazyFileRoute("/_app/promos_/$language")({
  component: PromosPage,
  pendingComponent: PromosPending,
});
