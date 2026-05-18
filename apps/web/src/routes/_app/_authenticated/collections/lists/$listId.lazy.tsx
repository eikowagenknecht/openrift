import { createLazyFileRoute } from "@tanstack/react-router";

import { ListPage } from "@/components/list/list-page";
import { useHydrated } from "@/hooks/use-hydrated";

export const Route = createLazyFileRoute("/_app/_authenticated/collections/lists/$listId")({
  component: ListDetail,
});

function ListDetail() {
  const { listId } = Route.useParams();
  // List entries render via CardThumbnail, which calls useLiveQuery
  // (printings catalog). Match the collection route's pattern and defer
  // mount until hydration to avoid SSR mismatch.
  const hydrated = useHydrated();
  if (!hydrated) {
    return null;
  }
  return <ListPage listId={listId} />;
}
