import { createFileRoute } from "@tanstack/react-router";

import { Skeleton } from "@/components/ui/skeleton";
import { marketplaceGroupsQueryOptions } from "@/hooks/use-marketplace-groups";

function AdminPending() {
  return (
    <div className="space-y-4 p-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function AdminError({ error }: { error: Error }) {
  return <p className="p-4 text-sm text-destructive">Failed to load: {error.message}</p>;
}

export const Route = createFileRoute("/_authenticated/admin/marketplace-groups")({
  loader: ({ context }) => context.queryClient.ensureQueryData(marketplaceGroupsQueryOptions),
  pendingComponent: AdminPending,
  errorComponent: AdminError,
});
