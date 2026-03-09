import { createLazyFileRoute } from "@tanstack/react-router";

import { CandidateUploadPage } from "@/components/admin/candidate-upload-page";

export const Route = createLazyFileRoute("/_authenticated/admin/candidates-upload")({
  component: CandidateUploadPage,
});
