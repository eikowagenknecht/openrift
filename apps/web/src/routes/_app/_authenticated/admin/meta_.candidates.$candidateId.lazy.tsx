import { createLazyFileRoute, useParams } from "@tanstack/react-router";

import { MetaCandidateDetailPage } from "@/components/admin/meta-candidate-detail-page";

function MetaCandidateDetailRoute() {
  const { candidateId } = useParams({
    from: "/_app/_authenticated/admin/meta_/candidates/$candidateId",
  });
  return <MetaCandidateDetailPage key={candidateId} candidateId={candidateId} />;
}

export const Route = createLazyFileRoute(
  "/_app/_authenticated/admin/meta_/candidates/$candidateId",
)({
  component: MetaCandidateDetailRoute,
});
