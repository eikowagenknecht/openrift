import { createLazyFileRoute } from "@tanstack/react-router";

import { DeckCheckEventPage } from "@/components/deck-check/deck-check-event-page";
import { DeckCheckGuard } from "@/components/deck-check/deck-check-guard";
import { GroupDrilldownFrame } from "@/components/friend-groups/friend-group-shell";

export const Route = createLazyFileRoute("/_app/_authenticated/groups/$slug_/checks_/$eventId")({
  component: GroupCheckEventRoute,
});

function GroupCheckEventRoute() {
  const { slug, eventId } = Route.useParams();
  return (
    <GroupDrilldownFrame
      slug={slug}
      render={(data) => (
        <DeckCheckGuard data={data}>
          <DeckCheckEventPage slug={slug} eventId={eventId} data={data} />
        </DeckCheckGuard>
      )}
    />
  );
}
