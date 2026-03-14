import { createLazyFileRoute, useParams } from "@tanstack/react-router";

import { CardSourceDetailPage } from "@/components/admin/card-source-detail-page";

function ExistingCardRoute() {
  const { cardId } = useParams({ from: "/_authenticated/admin/cards_/$cardId" });
  return <CardSourceDetailPage mode="existing" identifier={cardId} />;
}

export const Route = createLazyFileRoute("/_authenticated/admin/cards_/$cardId")({
  component: ExistingCardRoute,
});
