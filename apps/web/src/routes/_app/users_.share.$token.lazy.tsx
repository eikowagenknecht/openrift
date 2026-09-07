import type { ListIntent } from "@openrift/shared/types/api/list";
import type {
  PublicUserBundleCollectionResponse,
  PublicUserBundleListResponse,
} from "@openrift/shared/types/api/user-share";
import { Link, createLazyFileRoute } from "@tanstack/react-router";
import { BookOpenIcon, GlobeIcon, HeartIcon, UsersIcon } from "lucide-react";

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
import { SectionHeading } from "@/components/ui/section-heading";
import { UserAvatar } from "@/components/user-avatar";
import { usePublicUserBundle } from "@/hooks/use-user-share";
import { useUserId } from "@/lib/auth-session";
import { cn, PAGE_WIDTH, PAGE_PADDING } from "@/lib/utils";

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
  const { owner, lists, collections } = data;
  const viewerUserId = useUserId();
  const showVisibility = viewerUserId !== null;
  const isEmpty = lists.length === 0 && collections.length === 0;

  return (
    <div className={cn(PAGE_PADDING, PAGE_WIDTH.full, "flex flex-col gap-6 py-4")}>
      <header className="flex items-center gap-3">
        <UserAvatar
          name={owner.displayName}
          gravatarHash={owner.gravatarHash}
          size="lg"
          className="size-12"
        />
        <Heading level={1}>{owner.displayName}</Heading>
      </header>

      {isEmpty ? (
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
        <>
          {SECTIONS.map(({ intent, heading }) => {
            const sectionLists = lists.filter((list) => list.intent === intent);
            if (sectionLists.length === 0) {
              return null;
            }
            return (
              <section key={intent} className="flex flex-col gap-3">
                <SectionHeading>{heading}</SectionHeading>
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
          })}

          {collections.length > 0 ? (
            <section className="flex flex-col gap-3">
              <SectionHeading>Collections</SectionHeading>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {collections.map((collection) => (
                  <BundleCollectionRow key={collection.id} collection={collection} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function BundleCollectionRow({ collection }: { collection: PublicUserBundleCollectionResponse }) {
  // Group-shared collections always link through one of the via-groups; pick
  // the first as the canonical route. Membership is required server-side.
  const viaGroup = collection.viaGroups[0];
  if (!viaGroup) {
    return null;
  }
  return (
    <Link
      to="/groups/$slug/collections/$collectionId"
      params={{ slug: viaGroup.slug, collectionId: collection.id }}
      className="hover:bg-muted/50 flex flex-col gap-1 rounded-md border px-3 py-3"
    >
      <div className="flex items-center gap-2">
        <BookOpenIcon className="size-4 shrink-0" />
        <span className="flex-1 truncate font-medium">{collection.name}</span>
      </div>
      {collection.description ? (
        <p className="text-muted-foreground line-clamp-2 text-sm">{collection.description}</p>
      ) : null}
      <div className="mt-1 flex flex-wrap gap-1">
        {collection.viaGroups.map((group) => (
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
      </div>
    </Link>
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
      {list.isPublic ? (
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
