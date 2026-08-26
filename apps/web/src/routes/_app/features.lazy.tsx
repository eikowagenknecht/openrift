import { createLazyFileRoute } from "@tanstack/react-router";

import { FeaturesPage } from "@/components/marketing/features-page";

export const Route = createLazyFileRoute("/_app/features")({
  component: FeaturesPage,
});
