import { createLazyFileRoute } from "@tanstack/react-router";

import { ImagesPage } from "@/components/admin/images-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/images")({
  component: ImagesPage,
});
