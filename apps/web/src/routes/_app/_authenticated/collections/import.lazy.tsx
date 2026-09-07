import { createLazyFileRoute } from "@tanstack/react-router";

import { CollectionImportPage } from "@/features/collections/components/collection-import-page";

export const Route = createLazyFileRoute("/_app/_authenticated/collections/import")({
  component: CollectionImportPage,
});
