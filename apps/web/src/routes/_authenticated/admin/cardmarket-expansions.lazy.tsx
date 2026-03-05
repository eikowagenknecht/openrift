import { createLazyFileRoute } from "@tanstack/react-router";

import { CardmarketExpansionsPage } from "@/components/admin/cardmarket-expansions-page";

export const Route = createLazyFileRoute("/_authenticated/admin/cardmarket-expansions")({
  component: CardmarketExpansionsPage,
});
