import { createLazyFileRoute } from "@tanstack/react-router";

import { MetaEventsPage } from "@/components/meta/meta-events-page";

export const Route = createLazyFileRoute("/_app/meta_/events")({
  component: MetaEventsPage,
});
