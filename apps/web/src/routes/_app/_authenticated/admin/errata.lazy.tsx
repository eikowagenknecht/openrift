import { createLazyFileRoute } from "@tanstack/react-router";

import { ErrataUploadPage } from "@/features/admin/components/errata-upload-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/errata")({
  component: ErrataUploadPage,
});
