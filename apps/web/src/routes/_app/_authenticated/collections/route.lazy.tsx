import { createLazyFileRoute } from "@tanstack/react-router";

import { CollectionLayout } from "@/features/collections/components/collection-layout";

export const Route = createLazyFileRoute("/_app/_authenticated/collections")({
  component: CollectionLayout,
});
