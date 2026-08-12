import { createLazyFileRoute } from "@tanstack/react-router";

import { TradeSheetPage } from "@/components/trades/trade-sheet-page";

export const Route = createLazyFileRoute("/_app/_authenticated/trades/$userId")({
  component: TradeSheetRoute,
});

function TradeSheetRoute() {
  const { userId } = Route.useParams();
  return <TradeSheetPage userId={userId} />;
}
