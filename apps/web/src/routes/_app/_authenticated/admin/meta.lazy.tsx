import { createLazyFileRoute } from "@tanstack/react-router";

import { MetaAdminPage } from "@/components/admin/meta-admin-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/meta")({
  component: MetaAdminPage,
});
