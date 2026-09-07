import { createLazyFileRoute } from "@tanstack/react-router";

import { CardDetailPage } from "@/features/cards/components/card-detail-page";

export const Route = createLazyFileRoute("/_app/cards_/$cardSlug")({
  component: CardDetailPage,
});
