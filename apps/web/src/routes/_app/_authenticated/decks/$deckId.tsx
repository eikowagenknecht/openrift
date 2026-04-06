import { createFileRoute } from "@tanstack/react-router";

import { DeckEditorPage } from "@/components/deck/deck-editor-page";
import { RouteErrorFallback } from "@/components/error-message";
import { catalogQueryOptions } from "@/hooks/use-cards";
import { deckDetailQueryOptions } from "@/hooks/use-decks";
import { enumsQueryOptions } from "@/hooks/use-enums";

export const Route = createFileRoute("/_app/_authenticated/decks/$deckId")({
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(deckDetailQueryOptions(params.deckId)),
      context.queryClient.ensureQueryData(catalogQueryOptions),
      context.queryClient.ensureQueryData(enumsQueryOptions),
    ]);
  },
  component: DeckEditor,
  errorComponent: RouteErrorFallback,
});

function DeckEditor() {
  const { deckId } = Route.useParams();
  return <DeckEditorPage deckId={deckId} />;
}
