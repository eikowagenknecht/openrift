import { createLazyFileRoute } from "@tanstack/react-router";

import { TierListShareView } from "@/components/tier-lists/tier-list-share-view";
import { usePublicTierList } from "@/hooks/use-tier-lists";

export const Route = createLazyFileRoute("/_app/tier-lists_/share/$token")({
  component: SharedTierListPage,
});

function SharedTierListPage() {
  const { token } = Route.useParams();
  const { data } = usePublicTierList(token);
  return <TierListShareView data={data} />;
}
