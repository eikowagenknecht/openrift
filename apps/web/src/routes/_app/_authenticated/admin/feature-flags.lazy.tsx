import { createLazyFileRoute } from "@tanstack/react-router";

import { FeatureFlagsPage } from "@/components/admin/feature-flags-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/feature-flags")({
  component: FeatureFlagsPage,
});
