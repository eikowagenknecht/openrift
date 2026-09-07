import { createLazyFileRoute } from "@tanstack/react-router";

import { CandidateUploadPage } from "@/features/admin/components/candidate-upload-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/sources")({
  component: CandidateUploadPage,
});
