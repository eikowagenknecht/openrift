import type { ListIntent, PublicUserBundleListResponse } from "@openrift/shared";
import { Link, createLazyFileRoute } from "@tanstack/react-router";
import { GlobeIcon, HeartIcon, UsersIcon } from "lucide-react";

import { Heading } from "@/components/heading";
import { PublicListRow } from "@/components/list/public-list-row";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { UserAvatar } from "@/components/user-avatar";
import { usePublicUserBundle } from "@/hooks/use-user-share";
import { useUserId } from "@/lib/auth-session";
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
  const viewerUserId = useUserId();
  const showVisibility = viewerUserId !== null;

  return (
    <div className={`${PAGE_PADDING} ${CONTAINER_WIDTH} flex flex-col gap-6 py-4`}>
      <header className="flex items-center gap-3">
        <UserAvatar
          name={owner.displayName}
          gravatarHash={owner.gravatarHash}
          size="lg"
          className="size-12"
        />
        <Heading level={1}>{owner.displayName}</Heading>
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
                  <BundleListRow
                    key={list.id}
                    token={token}
                    list={list}
                    showVisibility={showVisibility}
                  />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

function BundleListRow({
  token,
  list,
  showVisibility,
}: {
  token: string;
  list: PublicUserBundleListResponse;
  showVisibility: boolean;
}) {
  return (
    <PublicListRow
      intent={list.intent}
      kind={list.kind}
      name={list.name}
      entryCount={list.entryCount}
      badges={showVisibility ? <VisibilityBadges list={list} /> : null}
      render={<Link to="/users/share/$token/lists/$listId" params={{ token, listId: list.id }} />}
    />
  );
}

function VisibilityBadges({ list }: { list: PublicUserBundleListResponse }) {
  return (
    <>
      {list.isPubliclyShared ? (
        <Badge variant="outline" className="text-2xs gap-1" title="Has a public share link">
          <GlobeIcon className="size-3" />
          Public
        </Badge>
      ) : null}
      {list.viaGroups.map((group) => (
        <Badge
          key={group.id}
          variant="outline"
          className="text-2xs max-w-[10rem] gap-1"
          title={`Shared with ${group.name}`}
        >
          <UsersIcon className="size-3 shrink-0" />
          <span className="truncate">{group.name}</span>
        </Badge>
      ))}
    </>
  );
}
