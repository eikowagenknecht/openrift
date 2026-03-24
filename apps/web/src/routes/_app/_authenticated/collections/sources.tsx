import { createFileRoute } from "@tanstack/react-router";

import { SourcesPage } from "@/components/collection/sources-page";
import { Skeleton } from "@/components/ui/skeleton";
import { acquisitionSourcesQueryOptions } from "@/hooks/use-acquisition-sources";

export const Route = createFileRoute("/_app/_authenticated/collections/sources")({
  loader: ({ context }) => context.queryClient.ensureQueryData(acquisitionSourcesQueryOptions),
  component: SourcesPage,
  pendingComponent: SourcesPending,
  errorComponent: SourcesError,
});

function SourcesPending() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function SourcesError({ error }: { error: Error }) {
  return <p className="p-4 text-sm text-destructive">Failed to load: {error.message}</p>;
}
