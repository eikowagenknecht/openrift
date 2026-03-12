import { createLazyFileRoute } from "@tanstack/react-router";

import { CardSourcesListPage } from "@/components/admin/card-sources-list-page";

export const Route = createLazyFileRoute("/_authenticated/admin/cards")({
  component: CardSourcesListPage,
});
