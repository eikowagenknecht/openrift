import { createLazyFileRoute } from "@tanstack/react-router";

import { StatusPage } from "@/components/admin/status-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/status")({
  component: StatusPage,
});
