import { createLazyFileRoute } from "@tanstack/react-router";

import { DeckComparePage } from "@/features/decks/components/deck-compare-page";
import { useHydrated } from "@/hooks/use-hydrated";

export const Route = createLazyFileRoute("/_app/decks/compare")({
  component: DeckCompare,
});

function DeckCompare() {
  const { from, to } = Route.useSearch();
  // useCards and the local deck store both resolve client-side, so there is
  // nothing to server-render before hydration.
  const hydrated = useHydrated();
  if (!hydrated) {
    return null;
  }
  return <DeckComparePage fromId={from} toId={to} />;
}
