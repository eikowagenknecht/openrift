import { createLazyFileRoute, useSearch } from "@tanstack/react-router";

import { PrintingDeskCreatePage } from "@/features/admin/components/printing-desk-form-page";

function PrintingDeskNewRoute() {
  const { card } = useSearch({ from: "/_app/_authenticated/admin/printing-desk_/new" });
  return <PrintingDeskCreatePage cardSlug={card} />;
}

export const Route = createLazyFileRoute("/_app/_authenticated/admin/printing-desk_/new")({
  component: PrintingDeskNewRoute,
});
