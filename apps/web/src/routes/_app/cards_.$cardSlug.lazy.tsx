import { createLazyFileRoute } from "@tanstack/react-router";

import { CardDetailPage } from "@/components/cards/card-detail-page";

export const Route = createLazyFileRoute("/_app/cards_/$cardSlug")({
  component: CardDetailPage,
});
