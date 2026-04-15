import { createFileRoute } from "@tanstack/react-router";

import { DeckEditorPage } from "@/components/deck/deck-editor-page";
import { RouteErrorFallback } from "@/components/error-message";
import { deckDetailQueryOptions } from "@/hooks/use-decks";
import { initQueryOptions } from "@/hooks/use-init";
import { FilterSearchProvider, filterSearchSchema } from "@/lib/search-schemas";
import { seoHead } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site-config";

export const Route = createFileRoute("/_app/_authenticated/decks/$deckId")({
  ssr: "data-only",
  validateSearch: filterSearchSchema,
  head: () => seoHead({ siteUrl: getSiteUrl(), title: "Deck Editor", noIndex: true }),
  staticData: { hideFooter: true },
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(deckDetailQueryOptions(params.deckId)),
      context.queryClient.ensureQueryData(initQueryOptions),
    ]);
  },
  component: DeckEditor,
  errorComponent: RouteErrorFallback,
});

function DeckEditor() {
  const { deckId } = Route.useParams();
  const search = Route.useSearch();
  return (
    <FilterSearchProvider value={search}>
      <DeckEditorPage deckId={deckId} />
    </FilterSearchProvider>
  );
}
