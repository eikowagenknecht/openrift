import { createLazyFileRoute } from "@tanstack/react-router";

import { DeckImportPage } from "@/features/collections/components/deck-import-page";

export const Route = createLazyFileRoute("/_app/decks/import")({
  component: DeckImportPage,
});
