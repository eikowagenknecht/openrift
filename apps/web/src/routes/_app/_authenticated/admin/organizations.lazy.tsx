import { createLazyFileRoute } from "@tanstack/react-router";

import { AdminOrganizationsPage } from "@/components/admin/admin-organizations-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/organizations")({
  component: AdminOrganizationsPage,
});
