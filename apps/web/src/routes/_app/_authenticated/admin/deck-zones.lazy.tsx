import { createLazyFileRoute } from "@tanstack/react-router";

import { DeckZonesPage } from "@/features/admin/components/deck-zones-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/deck-zones")({
  component: DeckZonesPage,
});
