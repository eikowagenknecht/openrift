import { createLazyFileRoute } from "@tanstack/react-router";

import { DeckZonesPage } from "@/components/admin/deck-zones-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/deck-zones")({
  component: DeckZonesPage,
});
