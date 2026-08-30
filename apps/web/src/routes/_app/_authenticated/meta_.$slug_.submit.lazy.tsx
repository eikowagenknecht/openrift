import { createLazyFileRoute } from "@tanstack/react-router";

import { MetaSubmitPage } from "@/components/meta/meta-submit-page";

export const Route = createLazyFileRoute("/_app/_authenticated/meta_/$slug_/submit")({
  component: MetaEventSubmitRoute,
});

function MetaEventSubmitRoute() {
  const { slug } = Route.useParams();
  const search = Route.useSearch();
  return (
    <MetaSubmitPage
      slug={slug}
      prefill={{
        playerName: search.player,
        rank: search.rank,
        rankIsTier: search.cut,
        wins: search.wins,
        losses: search.losses,
        draws: search.draws,
      }}
    />
  );
}
