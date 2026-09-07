import { createLazyFileRoute } from "@tanstack/react-router";

import { MetaEventRunPage } from "@/features/meta/components/meta-event-run-page";

export const Route = createLazyFileRoute("/_app/meta_/$slug_/players_/$key")({
  component: MetaEventRunPage,
});
