import { createLazyFileRoute } from "@tanstack/react-router";

import { PrintingDeskPage } from "@/features/admin/components/printing-desk-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/printing-desk")({
  component: PrintingDeskPage,
});
