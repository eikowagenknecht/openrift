import { createLazyFileRoute } from "@tanstack/react-router";

import { MetaEventRunPage } from "@/components/meta/meta-event-run-page";

export const Route = createLazyFileRoute("/_app/meta_/$slug_/players_/$key")({
  component: MetaEventRunPage,
});
