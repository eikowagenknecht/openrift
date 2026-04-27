import { createLazyFileRoute } from "@tanstack/react-router";

import { CardBrowser } from "@/components/card-browser";
import { useHideScrollbar } from "@/hooks/use-hide-scrollbar";
import { FilterSearchProvider } from "@/lib/search-schemas";
import { PAGE_PADDING_NO_TOP } from "@/lib/utils";

export const Route = createLazyFileRoute("/_app/cards")({
  component: CardsPage,
});

function CardsPage() {
  const search = Route.useSearch();
  useHideScrollbar();
  return (
    <FilterSearchProvider value={search}>
      <div className={`flex flex-1 flex-col ${PAGE_PADDING_NO_TOP}`}>
        <CardBrowser />
      </div>
    </FilterSearchProvider>
  );
}
