import { createLazyFileRoute, useParams } from "@tanstack/react-router";

import { CandidateDetailPage } from "@/components/admin/candidate-detail-page";

function NewCardPage() {
  const { name } = useParams({ from: "/_app/_authenticated/admin/cards_/new/$name" });
  return <CandidateDetailPage key={name} mode="new" identifier={decodeURIComponent(name)} />;
}

export const Route = createLazyFileRoute("/_app/_authenticated/admin/cards_/new/$name")({
  component: NewCardPage,
});
