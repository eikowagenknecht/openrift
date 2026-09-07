import { createLazyFileRoute } from "@tanstack/react-router";

import { CollectionActivityPage } from "@/features/collections/components/collection-activity-page";

export const Route = createLazyFileRoute("/_app/_authenticated/collections/activity")({
  component: CollectionActivityPage,
});
