import { createLazyFileRoute } from "@tanstack/react-router";

import { TradeSheetPage } from "@/features/groups/components/trade-sheet-page";

export const Route = createLazyFileRoute("/_app/_authenticated/trades/$userId")({
  component: TradeSheetRoute,
});

function TradeSheetRoute() {
  const { userId } = Route.useParams();
  const { from } = Route.useSearch();
  return <TradeSheetPage userId={userId} fromGroupSlug={from} />;
}
