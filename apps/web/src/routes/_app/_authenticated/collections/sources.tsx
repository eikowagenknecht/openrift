import { createFileRoute, redirect } from "@tanstack/react-router";

import { CollectionPending } from "@/components/collection/collection-pending";
import { SourcesPage } from "@/components/collection/sources-page";
import { RouteErrorFallback } from "@/components/error-message";
import { acquisitionSourcesQueryOptions } from "@/hooks/use-acquisition-sources";
import type { FeatureFlags } from "@/lib/feature-flags";
import { featureEnabled, featureFlagsQueryOptions } from "@/lib/feature-flags";

import { useCollectionTitle } from "./route";

export const Route = createFileRoute("/_app/_authenticated/collections/sources")({
  beforeLoad: async ({ context }) => {
    const flags = (await context.queryClient.ensureQueryData(
      featureFlagsQueryOptions,
    )) as FeatureFlags;
    if (!featureEnabled(flags, "acquisition-sources")) {
      throw redirect({ to: "/collections" });
    }
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(acquisitionSourcesQueryOptions),
  component: SourcesRoute,
  pendingComponent: CollectionPending,
  errorComponent: RouteErrorFallback,
});

function SourcesRoute() {
  useCollectionTitle("Sources");
  return <SourcesPage />;
}
