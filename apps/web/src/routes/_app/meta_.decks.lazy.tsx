import { createLazyFileRoute } from "@tanstack/react-router";

import { MetaDeckBrowserPage } from "@/features/meta/components/meta-deck-browser-page";

export const Route = createLazyFileRoute("/_app/meta_/decks")({
  component: MetaDeckBrowserPage,
});
