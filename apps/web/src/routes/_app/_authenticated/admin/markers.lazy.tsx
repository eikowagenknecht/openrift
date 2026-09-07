import { createLazyFileRoute } from "@tanstack/react-router";

import { MarkersPage } from "@/features/admin/components/markers-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/markers")({
  component: MarkersPage,
});
