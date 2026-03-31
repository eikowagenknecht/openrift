import { createFileRoute } from "@tanstack/react-router";

import { DeckListPage } from "@/components/deck/deck-list-page";
import { RouteErrorFallback } from "@/components/error-message";
import { decksQueryOptions } from "@/hooks/use-decks";

export const Route = createFileRoute("/_app/_authenticated/decks/")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(decksQueryOptions);
  },
  component: DeckListPage,
  errorComponent: RouteErrorFallback,
});
