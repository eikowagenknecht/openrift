import { createFileRoute } from "@tanstack/react-router";

import { cardSourceDetailQueryOptions } from "@/hooks/use-card-sources";

export const Route = createFileRoute("/_authenticated/admin/cards_/$cardId")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(cardSourceDetailQueryOptions(params.cardId)),
});
