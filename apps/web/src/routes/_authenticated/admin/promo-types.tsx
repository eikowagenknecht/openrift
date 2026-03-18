import { createFileRoute } from "@tanstack/react-router";

import { Skeleton } from "@/components/ui/skeleton";
import { adminPromoTypesQueryOptions } from "@/hooks/use-promo-types";

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

export const Route = createFileRoute("/_authenticated/admin/promo-types")({
  loader: ({ context }) => context.queryClient.ensureQueryData(adminPromoTypesQueryOptions),
  pendingComponent: AdminPending,
  errorComponent: AdminError,
});
