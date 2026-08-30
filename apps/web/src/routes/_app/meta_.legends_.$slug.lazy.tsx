import { createLazyFileRoute } from "@tanstack/react-router";

import { MetaLegendPage } from "@/components/meta/meta-legend-page";

export const Route = createLazyFileRoute("/_app/meta_/legends_/$slug")({
  component: MetaLegendPage,
});
