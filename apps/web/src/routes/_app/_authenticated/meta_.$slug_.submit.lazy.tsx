import { useQuery } from "@tanstack/react-query";
import { createLazyFileRoute } from "@tanstack/react-router";

import { MetaSubmitPage } from "@/features/meta/components/meta-submit-page";
import { metaDeckQueryOptions } from "@/features/meta/hooks/use-meta";
import { metaSubmissionTextFromCards } from "@/features/meta/lib/meta-submission-form";

export const Route = createLazyFileRoute("/_app/_authenticated/meta_/$slug_/submit")({
  component: MetaEventSubmitRoute,
});

function MetaEventSubmitRoute() {
  const { slug } = Route.useParams();
  const search = Route.useSearch();
  const token = search.deck;
  const { data: archived } = useQuery({
    ...metaDeckQueryOptions(token ?? ""),
    enabled: token !== undefined,
  });

  return (
    <MetaSubmitPage
      slug={slug}
      prefill={{
        kind: search.ask,
        playerName: search.player,
        rank: search.rank,
        rankIsTier: search.cut,
        wins: search.wins,
        losses: search.losses,
        draws: search.draws,
        legendName: search.legend,
        legendCardId: search.legendId,
        deckText: archived ? metaSubmissionTextFromCards(archived.cards) : undefined,
      }}
    />
  );
}
