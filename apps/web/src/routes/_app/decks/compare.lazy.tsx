import { createLazyFileRoute } from "@tanstack/react-router";

import { DeckComparePage } from "@/components/deck/deck-compare-page";
import { useHydrated } from "@/hooks/use-hydrated";

export const Route = createLazyFileRoute("/_app/decks/compare")({
  component: DeckCompare,
});

function DeckCompare() {
  const { from, to } = Route.useSearch();
  // useCards and the local deck store both suspend or resolve client-side; the
  // whole page is the comparison, so there is nothing to server-render around
  // them.
  const hydrated = useHydrated();
  if (!hydrated) {
    return null;
  }
  return <DeckComparePage fromId={from} toId={to} />;
}
