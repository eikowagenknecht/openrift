import { createLazyFileRoute } from "@tanstack/react-router";

import { IgnoredSourcesPage } from "@/components/admin/ignored-sources-page";

export const Route = createLazyFileRoute("/_authenticated/admin/ignored-sources")({
  component: IgnoredSourcesPage,
});
