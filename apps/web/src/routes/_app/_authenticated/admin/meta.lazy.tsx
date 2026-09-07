import { createLazyFileRoute } from "@tanstack/react-router";

import { MetaAdminPage } from "@/features/admin/components/meta-admin-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/meta")({
  component: MetaAdminPage,
});
