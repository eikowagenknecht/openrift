import { createLazyFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";

import { CardBrowser } from "@/components/card-browser";
import { FirstRowPreview } from "@/components/cards/first-row-preview";
import { useHydrated } from "@/hooks/use-hydrated";
import { ViewSurfaceProvider } from "@/hooks/use-view-prefs";
import { seedCatalogVersion } from "@/lib/catalog-version";
import { FilterSearchProvider } from "@/lib/search-schemas";
import { cn, PAGE_PADDING_NO_TOP } from "@/lib/utils";

export const Route = createLazyFileRoute("/_app/cards")({
  component: CardsPage,
});

// <CardBrowser> only mounts post-hydration: rendering it server-side would
// trigger the catalog useSuspenseQuery and stage the full 310 KB catalog
// into the dehydrated per-request QueryClient.
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
  const { catalogVersion } = Route.useLoaderData();
  // Seed during render: the catalog query fires from useSuspenseQuery right
  // after useHydrated's own effect, before an effect here would run.
  if (globalThis.window !== undefined) {
    seedCatalogVersion(catalogVersion);
  }
  return (
    <ViewSurfaceProvider value="cards">
      <FilterSearchProvider value={search}>
        <div className={cn("flex flex-1 flex-col", PAGE_PADDING_NO_TOP)}>
          <CardBrowserShell />
        </div>
      </FilterSearchProvider>
    </ViewSurfaceProvider>
  );
}
