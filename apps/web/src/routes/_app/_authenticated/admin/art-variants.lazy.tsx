import { createLazyFileRoute } from "@tanstack/react-router";

import { ArtVariantsPage } from "@/components/admin/art-variants-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/art-variants")({
  component: ArtVariantsPage,
});
