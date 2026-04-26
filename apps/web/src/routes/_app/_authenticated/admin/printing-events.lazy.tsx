import { createLazyFileRoute } from "@tanstack/react-router";

import { PrintingEventsPage } from "@/components/admin/printing-events-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/printing-events")({
  component: PrintingEventsPage,
});
