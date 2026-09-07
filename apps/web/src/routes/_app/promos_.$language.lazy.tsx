import { createLazyFileRoute } from "@tanstack/react-router";

import { PromosPage } from "@/features/cards/components/promos-page";
import { PromosPending } from "@/features/cards/components/promos-pending";

export const Route = createLazyFileRoute("/_app/promos_/$language")({
  component: PromosPage,
  pendingComponent: PromosPending,
});
