import { createLazyFileRoute } from "@tanstack/react-router";

import { CollectionGrid } from "@/components/collection/collection-grid";

export const Route = createLazyFileRoute("/_app/_authenticated/collections/")({
  component: CollectionIndex,
});

function CollectionIndex() {
  return <CollectionGrid title="All Cards" />;
}
