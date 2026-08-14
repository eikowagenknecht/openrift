import { createLazyFileRoute } from "@tanstack/react-router";

import { MetaDeckPage } from "@/components/meta/meta-deck-page";

export const Route = createLazyFileRoute("/_app/meta_/decks_/$token")({
  component: MetaDeckRoute,
});

function MetaDeckRoute() {
  const { token } = Route.useParams();
  return <MetaDeckPage token={token} />;
}
