import { createLazyFileRoute } from "@tanstack/react-router";

import { MetaFrontPage } from "@/features/meta/components/meta-front-page";

export const Route = createLazyFileRoute("/_app/meta")({
  component: MetaFrontPage,
});
