import { createFileRoute } from "@tanstack/react-router";

import { unmatchedCardDetailQueryOptions } from "@/hooks/use-card-sources";

export const Route = createFileRoute("/_authenticated/admin/cards_/new/$name")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(unmatchedCardDetailQueryOptions(params.name)),
});
