import { createLazyFileRoute, useParams } from "@tanstack/react-router";

import { MetaEventPlayersPage } from "@/components/admin/meta-event-players-page";

function MetaEventDecksRoute() {
  const { eventId } = useParams({ from: "/_app/_authenticated/admin/meta_/$eventId" });
  return <MetaEventPlayersPage key={eventId} eventId={eventId} />;
}

export const Route = createLazyFileRoute("/_app/_authenticated/admin/meta_/$eventId")({
  component: MetaEventDecksRoute,
});
