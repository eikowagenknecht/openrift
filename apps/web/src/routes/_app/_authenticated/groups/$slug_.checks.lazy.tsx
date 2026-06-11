import { createLazyFileRoute } from "@tanstack/react-router";

import { DeckCheckEventsPage } from "@/components/deck-check/deck-check-events-page";
import { DeckCheckGuard } from "@/components/deck-check/deck-check-guard";
import { FriendGroupPageFrame } from "@/components/friend-groups/friend-group-shell";

export const Route = createLazyFileRoute("/_app/_authenticated/groups/$slug_/checks")({
  component: GroupChecksRoute,
});

function GroupChecksRoute() {
  const { slug } = Route.useParams();
  return (
    <FriendGroupPageFrame
      slug={slug}
      active="checks"
      render={(data) => (
        <DeckCheckGuard data={data}>
          <DeckCheckEventsPage slug={slug} data={data} />
        </DeckCheckGuard>
      )}
    />
  );
}
