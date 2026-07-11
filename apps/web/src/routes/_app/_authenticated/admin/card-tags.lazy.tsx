import { createLazyFileRoute } from "@tanstack/react-router";

import { CardTagsPage } from "@/components/admin/card-tags-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/card-tags")({
  component: CardTagsPage,
});
