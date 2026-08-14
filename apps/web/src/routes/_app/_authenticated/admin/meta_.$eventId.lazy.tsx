import { createLazyFileRoute, useParams } from "@tanstack/react-router";

import { MetaEventDecksPage } from "@/components/admin/meta-event-decks-page";

function MetaEventDecksRoute() {
  const { eventId } = useParams({ from: "/_app/_authenticated/admin/meta_/$eventId" });
  return <MetaEventDecksPage key={eventId} eventId={eventId} />;
}

export const Route = createLazyFileRoute("/_app/_authenticated/admin/meta_/$eventId")({
  component: MetaEventDecksRoute,
});
