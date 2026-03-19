import { createLazyFileRoute, useParams } from "@tanstack/react-router";

import { CardSourceDetailPage } from "@/components/admin/card-source-detail-page";

function ExistingCardRoute() {
  const { cardSlug } = useParams({ from: "/_authenticated/admin/cards_/$cardSlug" });
  return <CardSourceDetailPage mode="existing" identifier={cardSlug} />;
}

export const Route = createLazyFileRoute("/_authenticated/admin/cards_/$cardSlug")({
  component: ExistingCardRoute,
});
