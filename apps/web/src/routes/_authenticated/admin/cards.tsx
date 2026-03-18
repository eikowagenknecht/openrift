import { createFileRoute } from "@tanstack/react-router";

import { cardSourceListQueryOptions, sourceNamesQueryOptions } from "@/hooks/use-card-sources";

interface CardsSearch {
  set?: string;
}

export const Route = createFileRoute("/_authenticated/admin/cards")({
  validateSearch: (search: Record<string, unknown>): CardsSearch => ({
    set: typeof search.set === "string" ? search.set : undefined,
  }),
  loader: async ({ context, search }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(cardSourceListQueryOptions("all", undefined, search.set)),
      context.queryClient.ensureQueryData(sourceNamesQueryOptions),
    ]);
  },
});
