import { createLazyFileRoute } from "@tanstack/react-router";

import { PrintingEventsPage } from "@/features/admin/components/printing-events-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/printing-events")({
  component: PrintingEventsPage,
});
