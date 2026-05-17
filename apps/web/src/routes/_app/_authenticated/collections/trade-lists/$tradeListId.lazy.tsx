import { createLazyFileRoute } from "@tanstack/react-router";

import { TradeListPage } from "@/components/trade-list/trade-list-page";
import { useHydrated } from "@/hooks/use-hydrated";

export const Route = createLazyFileRoute(
  "/_app/_authenticated/collections/trade-lists/$tradeListId",
)({
  component: TradeListDetail,
});

function TradeListDetail() {
  const { tradeListId } = Route.useParams();
  // Trade list cards render via CardThumbnail, which calls useLiveQuery
  // (printings catalog). Match the collection route's pattern and defer
  // mount until hydration to avoid SSR mismatch.
  const hydrated = useHydrated();
  if (!hydrated) {
    return null;
  }
  return <TradeListPage tradeListId={tradeListId} />;
}
