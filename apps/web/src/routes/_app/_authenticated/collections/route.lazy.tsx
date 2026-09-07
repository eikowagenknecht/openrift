import { createLazyFileRoute } from "@tanstack/react-router";

import { CollectionLayout } from "@/components/collection/collection-layout";

export const Route = createLazyFileRoute("/_app/_authenticated/collections")({
  component: CollectionLayout,
});
