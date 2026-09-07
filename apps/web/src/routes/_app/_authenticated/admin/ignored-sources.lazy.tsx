import { createLazyFileRoute } from "@tanstack/react-router";

import { IgnoredCandidatesPage } from "@/features/admin/components/ignored-candidates-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/ignored-sources")({
  component: IgnoredCandidatesPage,
});
