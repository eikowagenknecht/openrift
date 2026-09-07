import { createLazyFileRoute } from "@tanstack/react-router";

import { CollectionImportPage } from "@/components/import/collection-import-page";

export const Route = createLazyFileRoute("/_app/_authenticated/collections/import")({
  component: CollectionImportPage,
});
