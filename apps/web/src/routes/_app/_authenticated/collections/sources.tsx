import { createFileRoute } from "@tanstack/react-router";

import { CollectionPending } from "@/components/collection/collection-pending";
import { SourcesPage } from "@/components/collection/sources-page";
import { RouteErrorFallback } from "@/components/error-message";
import { acquisitionSourcesQueryOptions } from "@/hooks/use-acquisition-sources";

import { useCollectionTitle } from "./route";

export const Route = createFileRoute("/_app/_authenticated/collections/sources")({
  loader: ({ context }) => context.queryClient.ensureQueryData(acquisitionSourcesQueryOptions),
  component: SourcesRoute,
  pendingComponent: CollectionPending,
  errorComponent: RouteErrorFallback,
});

function SourcesRoute() {
  useCollectionTitle("Sources");
  return <SourcesPage />;
}
