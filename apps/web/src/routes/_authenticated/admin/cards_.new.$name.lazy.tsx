import { createLazyFileRoute, useParams } from "@tanstack/react-router";

import { CardSourceDetailPage } from "@/components/admin/card-source-detail-page";

function NewCardRoute() {
  const { name } = useParams({ from: "/_authenticated/admin/cards_/new/$name" });
  return <CardSourceDetailPage mode="new" identifier={decodeURIComponent(name)} />;
}

export const Route = createLazyFileRoute("/_authenticated/admin/cards_/new/$name")({
  component: NewCardRoute,
});
