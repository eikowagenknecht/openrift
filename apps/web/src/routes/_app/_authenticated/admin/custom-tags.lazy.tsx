import { createLazyFileRoute } from "@tanstack/react-router";

import { CustomTagsPage } from "@/components/admin/custom-tags-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/custom-tags")({
  component: CustomTagsPage,
});
