import { createFileRoute } from "@tanstack/react-router";

import { CollectionGrid } from "@/components/collection/collection-grid";

export const Route = createFileRoute("/_authenticated/collection/")({
  component: CollectionIndex,
});

function CollectionIndex() {
  return <CollectionGrid />;
}
