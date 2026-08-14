import { createLazyFileRoute } from "@tanstack/react-router";

import { MetaOverviewPage } from "@/components/meta/meta-overview-page";

export const Route = createLazyFileRoute("/_app/meta")({
  component: MetaOverviewPage,
});
