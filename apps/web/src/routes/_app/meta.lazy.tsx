import { createLazyFileRoute } from "@tanstack/react-router";

import { MetaFrontPage } from "@/components/meta/meta-front-page";

export const Route = createLazyFileRoute("/_app/meta")({
  component: MetaFrontPage,
});
