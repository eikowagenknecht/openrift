import { createFileRoute } from "@tanstack/react-router";

import { Skeleton } from "@/components/ui/skeleton";
import { unmatchedCardDetailQueryOptions } from "@/hooks/use-candidates";
import { adminPromoTypesQueryOptions } from "@/hooks/use-promo-types";
import { providerSettingsQueryOptions } from "@/hooks/use-provider-settings";

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

export const Route = createFileRoute("/_authenticated/admin/cards_/new/$name")({
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(unmatchedCardDetailQueryOptions(params.name)),
      context.queryClient.ensureQueryData(adminPromoTypesQueryOptions),
      context.queryClient.ensureQueryData(providerSettingsQueryOptions),
    ]);
  },
  pendingComponent: AdminPending,
  errorComponent: AdminError,
});
