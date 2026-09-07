import { createLazyFileRoute } from "@tanstack/react-router";

import { CardTagsPage } from "@/features/admin/components/card-tags-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/card-tags")({
  component: CardTagsPage,
});
