import { createLazyFileRoute } from "@tanstack/react-router";

import { CollectionGrid } from "@/features/collections/components/collection-grid";
import { useHydrated } from "@/hooks/use-hydrated";

export const Route = createLazyFileRoute("/_app/_authenticated/collections/")({
  component: CollectionIndex,
});

function CollectionIndex() {
  // CollectionGrid reads from useOwnedCount → useLiveQuery, which calls
  // useSyncExternalStore without a server snapshot. Defer the mount until
  // hydration so SSR doesn't trip React's client-rendering fallback.
  const hydrated = useHydrated();
  if (!hydrated) {
    return null;
  }
  return <CollectionGrid title="All Cards" />;
}
