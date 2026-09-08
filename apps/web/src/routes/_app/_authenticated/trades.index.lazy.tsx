import { createLazyFileRoute } from "@tanstack/react-router";

import { TradesIndexPage } from "@/features/groups/components/trades-index-page";

export const Route = createLazyFileRoute("/_app/_authenticated/trades/")({
  component: TradesIndexPage,
});
