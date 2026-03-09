import { createLazyFileRoute } from "@tanstack/react-router";

import { CandidatesPage } from "@/components/admin/candidates-page";

export const Route = createLazyFileRoute("/_authenticated/admin/candidates")({
  component: CandidatesPage,
});
