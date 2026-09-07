import { createLazyFileRoute, useParams } from "@tanstack/react-router";

import { AdminPageTopBar } from "@/features/admin/components/admin-page-top-bar";
import { NewCardDetailPage } from "@/features/admin/components/new-card-detail-page";

function NewCardPage() {
  const { name } = useParams({ from: "/_app/_authenticated/admin/cards_/new/$name" });
  return (
    <>
      <AdminPageTopBar title="New Card" />
      <NewCardDetailPage key={name} identifier={decodeURIComponent(name)} />
    </>
  );
}

export const Route = createLazyFileRoute("/_app/_authenticated/admin/cards_/new/$name")({
  component: NewCardPage,
});
