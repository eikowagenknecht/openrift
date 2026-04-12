import { createLazyFileRoute } from "@tanstack/react-router";

import { CollectionStatsPage } from "@/components/collection/collection-stats-page";

export const Route = createLazyFileRoute("/_app/_authenticated/collections/stats")({
  component: CollectionStatsPage,
});
