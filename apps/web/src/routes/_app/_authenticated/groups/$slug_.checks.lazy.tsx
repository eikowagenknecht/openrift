import { createLazyFileRoute } from "@tanstack/react-router";

import { DeckCheckEventsPage } from "@/components/deck-check/deck-check-events-page";
import { GroupTournamentDecksView } from "@/components/deck-check/group-tournament-decks-view";
import { FriendGroupPageFrame, isJudge } from "@/components/friend-groups/friend-group-shell";

export const Route = createLazyFileRoute("/_app/_authenticated/groups/$slug_/checks")({
  component: GroupChecksRoute,
});

function GroupChecksRoute() {
  const { slug } = Route.useParams();
  return (
    <FriendGroupPageFrame
      slug={slug}
      active="checks"
      render={(data) =>
        isJudge(data.viewerRole) ? (
          <DeckCheckEventsPage slug={slug} data={data} />
        ) : (
          <GroupTournamentDecksView slug={slug} />
        )
      }
    />
  );
}
