import { createLazyFileRoute, useParams, useSearch } from "@tanstack/react-router";

import { ExistingCardDetailPage } from "@/components/admin/existing-card-detail-page";

function ExistingCardPage() {
  const { cardSlug } = useParams({ from: "/_app/_authenticated/admin/cards_/$cardSlug" });
  const { focusMarketplace, focusFinish, focusLanguage, set } = useSearch({
    from: "/_app/_authenticated/admin/cards_/$cardSlug",
  });
  return (
    <ExistingCardDetailPage
      key={cardSlug}
      identifier={cardSlug}
      focusMarketplace={focusMarketplace}
      focusFinish={focusFinish}
      focusLanguage={focusLanguage}
      setSlug={set}
    />
  );
}

export const Route = createLazyFileRoute("/_app/_authenticated/admin/cards_/$cardSlug")({
  component: ExistingCardPage,
});
