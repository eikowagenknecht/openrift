import type { ListIntent, PublicUserBundleListResponse } from "@openrift/shared";
import { Link, createLazyFileRoute } from "@tanstack/react-router";
import { HeartIcon } from "lucide-react";

import { PublicListRow } from "@/components/list/public-list-row";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { UserAvatar } from "@/components/user-avatar";
import { usePublicUserBundle } from "@/hooks/use-user-share";
import { CONTAINER_WIDTH, PAGE_PADDING } from "@/lib/utils";

export const Route = createLazyFileRoute("/_app/users_/share/$token")({
  component: SharedUserBundlePage,
});

const SECTIONS: { intent: Extract<ListIntent, "wish" | "trade">; heading: string }[] = [
  { intent: "wish", heading: "Wishlists" },
  { intent: "trade", heading: "Tradelists" },
];

function SharedUserBundlePage() {
  const { token } = Route.useParams();
  const { data } = usePublicUserBundle(token);
  const { owner, lists } = data;

  return (
    <div className={`${PAGE_PADDING} ${CONTAINER_WIDTH} flex flex-col gap-6 py-4`}>
      <header className="flex items-center gap-3">
        <UserAvatar
          name={owner.displayName}
          gravatarHash={owner.gravatarHash}
          size="lg"
          className="size-12"
        />
        <h1 className="text-2xl font-semibold">{owner.displayName}</h1>
      </header>

      {lists.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HeartIcon />
            </EmptyMedia>
            <EmptyTitle>Nothing shared yet</EmptyTitle>
            <EmptyDescription>
              This person hasn&apos;t added any wishlist or tradelist items yet. Check back later.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        SECTIONS.map(({ intent, heading }) => {
          const sectionLists = lists.filter((list) => list.intent === intent);
          if (sectionLists.length === 0) {
            return null;
          }
          return (
            <section key={intent} className="flex flex-col gap-3">
              <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
                {heading}
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sectionLists.map((list) => (
                  <BundleListRow key={list.id} token={token} list={list} />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

function BundleListRow({ token, list }: { token: string; list: PublicUserBundleListResponse }) {
  return (
    <PublicListRow
      intent={list.intent}
      kind={list.kind}
      name={list.name}
      entryCount={list.entryCount}
      render={<Link to="/users/share/$token/lists/$listId" params={{ token, listId: list.id }} />}
    />
  );
}
