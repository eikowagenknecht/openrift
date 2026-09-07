import { createLazyFileRoute } from "@tanstack/react-router";

import { AdminOrganizationsPage } from "@/features/admin/components/admin-organizations-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/organizations")({
  component: AdminOrganizationsPage,
});
