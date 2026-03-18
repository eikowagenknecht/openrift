import { createFileRoute } from "@tanstack/react-router";

import { SourcesPage } from "@/components/collection/sources-page";
import { sourcesQueryOptions } from "@/hooks/use-sources";

export const Route = createFileRoute("/_authenticated/collections/sources")({
  loader: ({ context }) => context.queryClient.ensureQueryData(sourcesQueryOptions),
  component: SourcesPage,
});
