import { createLazyFileRoute } from "@tanstack/react-router";

import { FeaturesPage } from "@/features/marketing/components/features-page";

export const Route = createLazyFileRoute("/_app/features")({
  component: FeaturesPage,
});
