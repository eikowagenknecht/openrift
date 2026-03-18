import { createFileRoute } from "@tanstack/react-router";

import { ignoredSourcesQueryOptions } from "@/hooks/use-ignored-sources";

export const Route = createFileRoute("/_authenticated/admin/ignored-sources")({
  loader: ({ context }) => context.queryClient.ensureQueryData(ignoredSourcesQueryOptions),
});
