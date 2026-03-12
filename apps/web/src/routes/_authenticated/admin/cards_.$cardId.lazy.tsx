import { createLazyFileRoute } from "@tanstack/react-router";

import { CardSourceDetailPage } from "@/components/admin/card-source-detail-page";

export const Route = createLazyFileRoute("/_authenticated/admin/cards_/$cardId")({
  component: CardSourceDetailPage,
});
