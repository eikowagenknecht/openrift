import { createLazyFileRoute, useParams } from "@tanstack/react-router";

import { NewCardDetailPage } from "@/components/admin/new-card-detail-page";

function NewCardPage() {
  const { name } = useParams({ from: "/_app/_authenticated/admin/cards_/new/$name" });
  return <NewCardDetailPage key={name} identifier={decodeURIComponent(name)} />;
}

export const Route = createLazyFileRoute("/_app/_authenticated/admin/cards_/new/$name")({
  component: NewCardPage,
});
