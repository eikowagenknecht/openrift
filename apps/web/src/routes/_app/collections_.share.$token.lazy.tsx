import { createLazyFileRoute } from "@tanstack/react-router";

import { PublicShareCta } from "@/features/account/components/signed-out-cta";
import { SharedCollectionAccessNotice } from "@/features/collections/components/shared-collection-access-notice";
import { SharedCollectionView } from "@/features/collections/components/shared-collection-view";
import { usePublicCollection } from "@/features/collections/hooks/use-collections";

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
      notice={
        <>
          <SharedCollectionAccessNotice collectionId={data.collection.id} />
          <PublicShareCta title="Keep track of your own cards">
            Log what you own, see what a binder is worth, and share it with a link like this one.
          </PublicShareCta>
        </>
      }
    />
  );
}
