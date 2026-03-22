import { createLazyFileRoute, useParams } from "@tanstack/react-router";

import { CandidateDetailPage } from "@/components/admin/candidate-detail-page";

function ExistingCardRoute() {
  const { cardSlug } = useParams({ from: "/_authenticated/admin/cards_/$cardSlug" });
  return <CandidateDetailPage key={cardSlug} mode="existing" identifier={cardSlug} />;
}

export const Route = createLazyFileRoute("/_authenticated/admin/cards_/$cardSlug")({
  component: ExistingCardRoute,
});
