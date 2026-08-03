import { createLazyFileRoute } from "@tanstack/react-router";

import { SharedCollectionAccessNotice } from "@/components/collection/shared-collection-access-notice";
import { SharedCollectionView } from "@/components/collection/shared-collection-view";
import { usePublicCollection } from "@/hooks/use-collections";

export const Route = createLazyFileRoute("/_app/collections_/share/$token")({
  component: SharedCollectionPage,
});

function SharedCollectionPage() {
  const { token } = Route.useParams();
  const { data } = usePublicCollection(token);
  const search = Route.useSearch();

  return (
    <SharedCollectionView
      data={data}
      search={search}
      notice={<SharedCollectionAccessNotice collectionId={data.collection.id} />}
    />
  );
}
