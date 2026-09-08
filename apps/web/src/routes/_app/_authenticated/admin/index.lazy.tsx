import { createLazyFileRoute } from "@tanstack/react-router";

import { DashboardPage } from "@/features/admin/components/dashboard-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/")({
  component: DashboardPage,
});
