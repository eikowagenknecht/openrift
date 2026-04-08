import { createFileRoute } from "@tanstack/react-router";

import { DeckListPage } from "@/components/deck/deck-list-page";
import { RouteErrorFallback } from "@/components/error-message";
import { catalogQueryOptions } from "@/hooks/use-cards";
import { decksQueryOptions } from "@/hooks/use-decks";

export const Route = createFileRoute("/_app/_authenticated/decks/")({
  head: () => ({ meta: [{ title: "Decks — OpenRift" }] }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(decksQueryOptions),
      context.queryClient.ensureQueryData(catalogQueryOptions),
    ]);
  },
  component: DeckListPage,
  errorComponent: RouteErrorFallback,
});
