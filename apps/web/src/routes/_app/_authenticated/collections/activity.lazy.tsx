import { createLazyFileRoute } from "@tanstack/react-router";

import { CollectionActivityPage } from "@/components/collection/collection-activity-page";

export const Route = createLazyFileRoute("/_app/_authenticated/collections/activity")({
  component: CollectionActivityPage,
});
