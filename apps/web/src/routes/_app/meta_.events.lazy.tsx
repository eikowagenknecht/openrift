import { createLazyFileRoute } from "@tanstack/react-router";

import { MetaEventsPage } from "@/features/meta/components/meta-events-page";

export const Route = createLazyFileRoute("/_app/meta_/events")({
  component: MetaEventsPage,
});
