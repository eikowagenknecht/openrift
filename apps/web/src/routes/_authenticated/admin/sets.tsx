import { createFileRoute } from "@tanstack/react-router";

import { setsQueryOptions } from "@/hooks/use-sets";

export const Route = createFileRoute("/_authenticated/admin/sets")({
  loader: ({ context }) => context.queryClient.ensureQueryData(setsQueryOptions),
});
