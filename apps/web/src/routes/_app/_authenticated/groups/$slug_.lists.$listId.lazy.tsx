import { createLazyFileRoute } from "@tanstack/react-router";

import { SharedListPage } from "@/components/friend-groups/shared-list-page";

export const Route = createLazyFileRoute("/_app/_authenticated/groups/$slug_/lists/$listId")({
  component: SharedListRoute,
});

function SharedListRoute() {
  const { slug, listId } = Route.useParams();
  return <SharedListPage slug={slug} listId={listId} />;
}
