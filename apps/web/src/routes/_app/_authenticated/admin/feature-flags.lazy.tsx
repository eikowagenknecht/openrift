import { createLazyFileRoute } from "@tanstack/react-router";

import { FeatureFlagsPage } from "@/features/admin/components/feature-flags-page";

export const Route = createLazyFileRoute("/_app/_authenticated/admin/feature-flags")({
  component: FeatureFlagsPage,
});
