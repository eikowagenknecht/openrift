import { createLazyFileRoute } from "@tanstack/react-router";

import { CandidatesListPage } from "@/components/admin/candidates-list-page";

export const Route = createLazyFileRoute("/_authenticated/admin/cards")({
  component: CandidatesListPage,
});
