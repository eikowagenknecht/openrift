import { createLazyFileRoute, useParams } from "@tanstack/react-router";

import { CandidateDetailPage } from "@/components/admin/candidate-detail-page";

function ExistingCardPage() {
  const { cardSlug } = useParams({ from: "/_app/_authenticated/admin/cards_/$cardSlug" });
  return <CandidateDetailPage key={cardSlug} mode="existing" identifier={cardSlug} />;
}

export const Route = createLazyFileRoute("/_app/_authenticated/admin/cards_/$cardSlug")({
  component: ExistingCardPage,
});
