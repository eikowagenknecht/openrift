import { createLazyFileRoute, useParams } from "@tanstack/react-router";

import { PrintingDeskCardPage } from "@/features/admin/components/printing-desk-card-page";

function PrintingDeskCardRoute() {
  const { cardSlug } = useParams({
    from: "/_app/_authenticated/admin/printing-desk_/cards/$cardSlug",
  });
  return <PrintingDeskCardPage cardSlug={cardSlug} />;
}

export const Route = createLazyFileRoute(
  "/_app/_authenticated/admin/printing-desk_/cards/$cardSlug",
)({
  component: PrintingDeskCardRoute,
});
