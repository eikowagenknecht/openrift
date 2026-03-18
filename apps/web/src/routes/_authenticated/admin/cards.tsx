import { createFileRoute } from "@tanstack/react-router";

import { Skeleton } from "@/components/ui/skeleton";
import { cardSourceListQueryOptions } from "@/hooks/use-card-sources";
import { sourceSettingsQueryOptions } from "@/hooks/use-source-settings";

interface CardsSearch {
  set?: string;
}

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

export const Route = createFileRoute("/_authenticated/admin/cards")({
  validateSearch: (search: Record<string, unknown>): CardsSearch => ({
    set: typeof search.set === "string" ? search.set : undefined,
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(cardSourceListQueryOptions),
      context.queryClient.ensureQueryData(sourceSettingsQueryOptions),
    ]);
  },
  pendingComponent: AdminPending,
  errorComponent: AdminError,
});
