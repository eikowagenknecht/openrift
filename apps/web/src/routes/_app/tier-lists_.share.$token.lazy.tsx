import { createLazyFileRoute } from "@tanstack/react-router";

import { TierListShareView } from "@/features/stage/components/tier-list-share-view";
import { usePublicTierList } from "@/features/stage/hooks/use-tier-lists";

export const Route = createLazyFileRoute("/_app/tier-lists_/share/$token")({
  component: SharedTierListPage,
});

function SharedTierListPage() {
  const { token } = Route.useParams();
  const { data } = usePublicTierList(token);
  // The public response deliberately omits the share token (reaching it already
  // proves the token was known), so the Present link gets it from the URL.
  return <TierListShareView data={data} token={token} />;
}
