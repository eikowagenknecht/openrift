import { createLazyFileRoute } from "@tanstack/react-router";

import { OverlayDashboard } from "@/components/overlay/overlay-dashboard";

export const Route = createLazyFileRoute("/_app/_authenticated/overlay")({
  component: OverlayDashboard,
});
