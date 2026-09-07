import { createLazyFileRoute } from "@tanstack/react-router";

import { StatusPage } from "@/features/admin/components/status-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/status")({
  component: StatusPage,
});
