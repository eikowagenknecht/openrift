import { createLazyFileRoute } from "@tanstack/react-router";

import { ImagesPage } from "@/features/admin/components/images-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/images")({
  component: ImagesPage,
});
