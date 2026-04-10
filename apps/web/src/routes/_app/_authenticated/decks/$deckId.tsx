import { createFileRoute } from "@tanstack/react-router";

import { DeckEditorPage } from "@/components/deck/deck-editor-page";
import { RouteErrorFallback } from "@/components/error-message";
import { catalogQueryOptions } from "@/hooks/use-cards";
import { deckDetailQueryOptions } from "@/hooks/use-decks";
import { initQueryOptions } from "@/hooks/use-init";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/decks/$deckId")({
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Deck Editor", noIndex: true }),
  staticData: { hideFooter: true },
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(deckDetailQueryOptions(params.deckId)),
      context.queryClient.ensureQueryData(catalogQueryOptions),
      context.queryClient.ensureQueryData(initQueryOptions),
    ]);
  },
  component: DeckEditor,
  errorComponent: RouteErrorFallback,
});

function DeckEditor() {
  const { deckId } = Route.useParams();
  return <DeckEditorPage deckId={deckId} />;
}
