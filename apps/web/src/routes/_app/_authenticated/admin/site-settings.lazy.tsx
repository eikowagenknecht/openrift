import { createLazyFileRoute } from "@tanstack/react-router";

import { SiteSettingsPage } from "@/features/admin/components/site-settings-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/site-settings")({
  component: SiteSettingsPage,
});
