import { createLazyFileRoute } from "@tanstack/react-router";

import { TierListBuilderPage } from "@/components/tier-lists/tier-list-builder-page";
import { useTierList } from "@/hooks/use-tier-lists";

export const Route = createLazyFileRoute("/_app/_authenticated/tier-lists_/$tierListId")({
  component: TierListBuilderRoute,
});

function TierListBuilderRoute() {
  const { tierListId } = Route.useParams();
  const { data } = useTierList(tierListId);
  // Keyed on the id so switching lists remounts the builder rather than
  // reconciling one board's drag state onto another's.
  return <TierListBuilderPage key={tierListId} tierList={data} />;
}
