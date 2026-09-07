import { createLazyFileRoute } from "@tanstack/react-router";

import { MetaLegendPage } from "@/features/meta/components/meta-legend-page";

export const Route = createLazyFileRoute("/_app/meta_/legends_/$slug")({
  component: MetaLegendPage,
});
