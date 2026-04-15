import { createLazyFileRoute } from "@tanstack/react-router";

import { MarkersPage } from "@/components/admin/markers-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/markers")({
  component: MarkersPage,
});
