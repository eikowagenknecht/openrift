import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";

import { CollectionGrid } from "@/components/collection/collection-grid";
import { useCollectionsMap } from "@/hooks/use-collections";
import { useHydrated } from "@/hooks/use-hydrated";

export const Route = createLazyFileRoute("/_app/_authenticated/collections/$collectionId")({
  component: CollectionDetail,
});

function CollectionDetail() {
  const { collectionId } = Route.useParams();
  const { wanted } = Route.useSearch();
  const navigate = useNavigate();
  const collectionsMap = useCollectionsMap();
  const collection = collectionsMap.get(collectionId);
  // CollectionGrid reads from useOwnedCount → useLiveQuery, which calls
  // useSyncExternalStore without a server snapshot. Defer the mount until
  // hydration so SSR doesn't trip React's client-rendering fallback.
  const hydrated = useHydrated();
  if (!hydrated) {
    return null;
  }
  return (
    <CollectionGrid
      collectionId={collectionId}
      title={collection?.name ?? "Collection"}
      wantedOnly={wanted === true}
      // Off drops the key rather than writing `wanted=false`, so the URL only
      // carries the filter where it is actually doing something. Replaces the
      // history entry — a toggle is a view state, not a place to go back to.
      onWantedOnlyChange={(next) => {
        void navigate({
          to: "/collections/$collectionId",
          params: { collectionId },
          search: (prev) => ({ ...prev, wanted: next ? true : undefined }),
          replace: true,
        });
      }}
    />
  );
}
