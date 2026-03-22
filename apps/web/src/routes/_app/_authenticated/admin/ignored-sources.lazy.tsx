import { createLazyFileRoute } from "@tanstack/react-router";

import { IgnoredCandidatesPage } from "@/components/admin/ignored-candidates-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/ignored-sources")({
  component: IgnoredCandidatesPage,
});
