import { createLazyFileRoute, useParams, useSearch } from "@tanstack/react-router";

import { AdminPageTopBar } from "@/components/admin/admin-page-top-bar";
import { CreatePrintingPage } from "@/components/admin/create-printing-page";

function CreatePrintingRoute() {
  const { cardSlug } = useParams({
    from: "/_app/_authenticated/admin/cards_/$cardSlug_/printings/create",
  });
  const { duplicateFrom } = useSearch({
    from: "/_app/_authenticated/admin/cards_/$cardSlug_/printings/create",
  });
  return (
    <>
      <AdminPageTopBar title="Create Printing" />
      <CreatePrintingPage cardSlug={cardSlug} duplicateFrom={duplicateFrom} />
    </>
  );
}

export const Route = createLazyFileRoute(
  "/_app/_authenticated/admin/cards_/$cardSlug_/printings/create",
)({
  component: CreatePrintingRoute,
});
