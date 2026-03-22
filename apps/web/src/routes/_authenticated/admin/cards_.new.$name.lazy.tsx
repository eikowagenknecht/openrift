import { createLazyFileRoute, useParams } from "@tanstack/react-router";

import { CandidateDetailPage } from "@/components/admin/candidate-detail-page";

function NewCardRoute() {
  const { name } = useParams({ from: "/_authenticated/admin/cards_/new/$name" });
  return <CandidateDetailPage key={name} mode="new" identifier={decodeURIComponent(name)} />;
}

export const Route = createLazyFileRoute("/_authenticated/admin/cards_/new/$name")({
  component: NewCardRoute,
});
