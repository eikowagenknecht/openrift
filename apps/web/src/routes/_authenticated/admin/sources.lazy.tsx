import { createLazyFileRoute } from "@tanstack/react-router";

import { CardSourceUploadPage } from "@/components/admin/card-source-upload-page";

export const Route = createLazyFileRoute("/_authenticated/admin/sources")({
  component: CardSourceUploadPage,
});
