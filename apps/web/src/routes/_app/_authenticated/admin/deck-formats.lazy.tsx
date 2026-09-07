import { createLazyFileRoute } from "@tanstack/react-router";

import { DeckFormatsPage } from "@/features/admin/components/deck-formats-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/deck-formats")({
  component: DeckFormatsPage,
});
