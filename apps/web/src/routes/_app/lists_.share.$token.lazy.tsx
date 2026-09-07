import type { ListIntent } from "@openrift/shared/types/api/list";
import { createLazyFileRoute } from "@tanstack/react-router";

import { SharedListContent } from "@/components/list/shared-list-content";
import { PublicShareCta } from "@/components/signed-out-cta";
import { usePublicList } from "@/hooks/use-lists";
import { FilterSearchProvider } from "@/lib/search-schemas";

const CTA_BY_INTENT: Record<ListIntent, { title: string; body: string }> = {
  wish: {
    title: "Keep your own wishlist",
    body: "Track the cards you still need, and let the people you trade with see them.",
  },
  trade: {
    title: "Keep your own tradelist",
    body: "Show what you have spare, and find who has the cards you are after.",
  },
  organize: {
    title: "Keep your own lists",
    body: "Track what you own, sort it how you like, and share it with a link like this one.",
  },
};

export const Route = createLazyFileRoute("/_app/lists_/share/$token")({
  component: SharedListPage,
});

function SharedListPage() {
  const { token } = Route.useParams();
  const { data } = usePublicList(token);
  const search = Route.useSearch();
  const cta = CTA_BY_INTENT[data.list.intent];

  return (
    <FilterSearchProvider value={search}>
      <SharedListContent
        data={data}
        notice={<PublicShareCta title={cta.title}>{cta.body}</PublicShareCta>}
      />
    </FilterSearchProvider>
  );
}
