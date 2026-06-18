import { createLazyFileRoute } from "@tanstack/react-router";

import { DeckCheckEntryPage } from "@/components/deck-check/deck-check-entry-page";
import { DeckCheckGuard } from "@/components/deck-check/deck-check-guard";
import { GroupDrilldownFrame } from "@/components/friend-groups/friend-group-shell";

export const Route = createLazyFileRoute(
  "/_app/_authenticated/groups/$slug_/events_/$eventId_/$entryId",
)({
  component: GroupCheckEntryRoute,
});

function GroupCheckEntryRoute() {
  const { slug, eventId, entryId } = Route.useParams();
  return (
    <GroupDrilldownFrame
      slug={slug}
      render={(data) => (
        <DeckCheckGuard data={data}>
          <DeckCheckEntryPage slug={slug} eventId={eventId} entryId={entryId} data={data} />
        </DeckCheckGuard>
      )}
    />
  );
}
