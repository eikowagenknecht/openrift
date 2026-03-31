import { createLazyFileRoute, useParams } from "@tanstack/react-router";

import { ExistingCardDetailPage } from "@/components/admin/existing-card-detail-page";

function ExistingCardPage() {
  const { cardSlug } = useParams({ from: "/_app/_authenticated/admin/cards_/$cardSlug" });
  return <ExistingCardDetailPage key={cardSlug} identifier={cardSlug} />;
}

export const Route = createLazyFileRoute("/_app/_authenticated/admin/cards_/$cardSlug")({
  component: ExistingCardPage,
});
