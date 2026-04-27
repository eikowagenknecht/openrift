import { createLazyFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";

import { CardBrowser } from "@/components/card-browser";
import { FirstRowPreview } from "@/components/cards/first-row-preview";
import { useHideScrollbar } from "@/hooks/use-hide-scrollbar";
import { useHydrated } from "@/hooks/use-hydrated";
import { FilterSearchProvider } from "@/lib/search-schemas";
import { PAGE_PADDING_NO_TOP } from "@/lib/utils";

export const Route = createLazyFileRoute("/_app/cards")({
  component: CardsPage,
});

// Render the SSR-discoverable preview on the server (and during the hydration
// window on the client) so the served HTML carries real `<img>` tags for the
// LCP candidate. <CardBrowser> only mounts post-hydration: rendering it on the
// server would trigger the catalog `useSuspenseQuery`, which stages the full
// 310 KB catalog into the per-request QueryClient — and that QueryClient is
// dehydrated into the document. We want exactly the opposite.
function CardBrowserShell() {
  const hydrated = useHydrated();
  if (!hydrated) {
    return <FirstRowPreview />;
  }
  return (
    <Suspense fallback={<FirstRowPreview />}>
      <CardBrowser />
    </Suspense>
  );
}

function CardsPage() {
  const search = Route.useSearch();
  useHideScrollbar();
  return (
    <FilterSearchProvider value={search}>
      <div className={`flex flex-1 flex-col ${PAGE_PADDING_NO_TOP}`}>
        <CardBrowserShell />
      </div>
    </FilterSearchProvider>
  );
}
