import { createLazyFileRoute } from "@tanstack/react-router";

import { PackOpenerPage } from "@/features/decks/components/pack-opener-page";

export const Route = createLazyFileRoute("/_app/pack-opener")({
  component: PackOpenerPage,
});
