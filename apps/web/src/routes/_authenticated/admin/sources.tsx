import { createFileRoute } from "@tanstack/react-router";

import { sourceStatsQueryOptions } from "@/hooks/use-card-sources";

export const Route = createFileRoute("/_authenticated/admin/sources")({
  loader: ({ context }) => context.queryClient.ensureQueryData(sourceStatsQueryOptions),
});
