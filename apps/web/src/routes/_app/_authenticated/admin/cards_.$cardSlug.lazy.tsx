import { createLazyFileRoute, useParams } from "@tanstack/react-router";

import { AdminCardDetailPage } from "@/components/admin/admin-card-detail-page";

function ExistingCardPage() {
  const { cardSlug } = useParams({ from: "/_app/_authenticated/admin/cards_/$cardSlug" });
  return <AdminCardDetailPage key={cardSlug} mode="existing" identifier={cardSlug} />;
}

export const Route = createLazyFileRoute("/_app/_authenticated/admin/cards_/$cardSlug")({
  component: ExistingCardPage,
});
