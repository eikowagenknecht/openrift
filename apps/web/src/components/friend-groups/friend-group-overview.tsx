import type { FriendGroupDetailResponse } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import {
  FolderIcon,
  HandshakeIcon,
  PlusIcon,
  Share2Icon,
  SparklesIcon,
  UserPlusIcon,
  UsersIcon,
  ZapIcon,
} from "lucide-react";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { useState } from "react";

import { CreateCollectionDialog } from "@/components/collection/create-collection-dialog";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { useTradeActionCounts } from "@/hooks/use-card-trades";
import { useCollections } from "@/hooks/use-collections";
import {
  useFriendGroupMatches,
  useFriendGroupShareableCollections,
} from "@/hooks/use-friend-groups";
import { useRequiredUserId } from "@/lib/auth-session";
import { cn } from "@/lib/utils";

import { FriendGroupActivityFeed } from "./friend-group-activity-feed";

/**
 * The group overview / dashboard: a row of cards linking to the trades /
 * shared / members pages with at-a-glance counts, each carrying its own
 * primary action, followed by the recent activity feed.
 * @returns The overview-page content.
 */
export function OverviewContent({ slug, data }: { slug: string; data: FriendGroupDetailResponse }) {
  return (
    <div className="flex flex-col gap-8">
      <ActionCards slug={slug} data={data} />
      <FriendGroupActivityFeed slug={slug} />
    </div>
  );
}

function ActionCards({ slug, data }: { slug: string; data: FriendGroupDetailResponse }) {
  const viewerId = useRequiredUserId();
  const { data: matches } = useFriendGroupMatches(slug);
  const { data: actionCounts } = useTradeActionCounts();
  const { data: collections } = useCollections();
  const { data: shareable } = useFriendGroupShareableCollections(slug);

  const tradesActionCount =
    actionCounts?.byGroup.find((entry) => entry.groupId === data.group.id)?.count ?? 0;
  const matchCount = matches.othersHaveYourWants.length + matches.othersWantYourHaves.length;

  // Collections owned by the group itself, vs. members' personal collections
  // shared into the group. The viewer's own shares live in `collectionShares`
  // too, so "from members" excludes them by `userId`.
  const groupCollectionCount = collections.filter((col) => col.groupId === data.group.id).length;
  const myShareableTotal = shareable.items.length;
  const mySharedCount = shareable.items.filter((item) => item.sharedAt !== null).length;
  const memberCollectionCount = data.collectionShares.filter(
    (share) => share.userId !== viewerId,
  ).length;
  const memberListCount = data.shares.filter(
    (share) =>
      share.userId !== viewerId && (share.listIntent === "wish" || share.listIntent === "trade"),
  ).length;

  const memberCount = data.members.length;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <GroupCollectionsCard slug={slug} data={data} count={groupCollectionCount} />
      <MemberCollectionsCard
        slug={slug}
        sharedCount={mySharedCount}
        shareableTotal={myShareableTotal}
        memberCollectionCount={memberCollectionCount}
        memberListCount={memberListCount}
      />
      <MembersCard slug={slug} data={data} memberCount={memberCount} />
      <StatCard
        to="/groups/$slug/trades"
        slug={slug}
        icon={ZapIcon}
        label="Trades"
        value={tradesActionCount}
        valueClassName={tradesActionCount > 0 ? "text-primary" : undefined}
        hint={tradesActionCount > 0 ? "to accept, decline, or finish" : "all caught up"}
      />
      <StatCard
        to="/groups/$slug/trades"
        slug={slug}
        icon={SparklesIcon}
        label="Matches"
        value={matchCount}
        hint="suggested trades"
      />
    </div>
  );
}

type StatCardTarget = "/groups/$slug/trades" | "/groups/$slug/shared" | "/groups/$slug/members";

/**
 * A dashboard tile: an icon + label, a big value, an optional hint, optional
 * extra content (e.g. member avatars), and an optional action button. The
 * label / value / hint area links to `to`; the action is a small ghost button
 * tucked into the bottom-right corner (it must carry its own positioning
 * classes), so it sits over the link rather than nested inside it. When an
 * action is present the link reserves a right gutter so text never runs under
 * the button.
 * @returns The tile.
 */
function StatCard({
  to,
  slug,
  icon: Icon,
  label,
  value,
  valueClassName,
  hint,
  children,
  action,
}: {
  to: StatCardTarget;
  slug: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: ReactNode;
  valueClassName?: string;
  hint?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}): ReactNode {
  return (
    <div className="bg-card relative flex flex-col gap-2 rounded-lg border p-3">
      <Link
        to={to}
        params={{ slug }}
        className={cn(
          "hover:bg-muted -m-1 flex flex-1 flex-col gap-1 rounded-md p-1 transition-colors",
          action && "pe-9",
        )}
      >
        <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
          <Icon className="size-4" />
          {label}
        </span>
        <span className={cn("text-2xl font-semibold", valueClassName)}>{value}</span>
        {hint ? <span className="text-muted-foreground text-xs">{hint}</span> : null}
        {children}
      </Link>
      {action}
    </div>
  );
}

function GroupCollectionsCard({
  slug,
  data,
  count,
}: {
  slug: string;
  data: FriendGroupDetailResponse;
  count: number;
}): ReactNode {
  const [createOpen, setCreateOpen] = useState(false);
  return (
    <StatCard
      to="/groups/$slug/shared"
      slug={slug}
      icon={FolderIcon}
      label="Group collections"
      value={count}
      hint="owned by the group"
      action={
        <>
          <Button
            size="icon-sm"
            variant="ghost"
            className="text-muted-foreground absolute right-2 bottom-2 rounded-md"
            aria-label="New shared collection"
            onClick={() => setCreateOpen(true)}
          >
            <PlusIcon className="size-4" />
          </Button>
          <CreateCollectionDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            groupSlug={data.group.slug}
            groupName={data.group.name}
          />
        </>
      }
    />
  );
}

function MemberCollectionsCard({
  slug,
  sharedCount,
  shareableTotal,
  memberCollectionCount,
  memberListCount,
}: {
  slug: string;
  sharedCount: number;
  shareableTotal: number;
  memberCollectionCount: number;
  memberListCount: number;
}): ReactNode {
  const fromMembers = `${memberCollectionCount} from members`;
  const listsSuffix =
    memberListCount > 0 ? ` · ${memberListCount} ${memberListCount === 1 ? "list" : "lists"}` : "";
  return (
    <StatCard
      to="/groups/$slug/shared"
      slug={slug}
      icon={HandshakeIcon}
      label="Member collections"
      value={`${sharedCount} of ${shareableTotal}`}
      hint={`of yours shared · ${fromMembers}${listsSuffix}`}
      action={
        <Button
          size="icon-sm"
          variant="ghost"
          className="text-muted-foreground absolute right-2 bottom-2 rounded-md"
          aria-label="Share a list"
          render={<Link to="/groups/$slug/manage" params={{ slug }} />}
        >
          <Share2Icon className="size-4" />
        </Button>
      }
    />
  );
}

function MembersCard({
  slug,
  data,
  memberCount,
}: {
  slug: string;
  data: FriendGroupDetailResponse;
  memberCount: number;
}): ReactNode {
  const shown = data.members.slice(0, 5);
  const extra = memberCount - shown.length;
  return (
    <StatCard
      to="/groups/$slug/members"
      slug={slug}
      icon={UsersIcon}
      label="Members"
      value={memberCount}
      action={
        <Button
          size="icon-sm"
          variant="ghost"
          className="text-muted-foreground absolute right-2 bottom-2 rounded-md"
          aria-label="Invite a member"
          render={<Link to="/groups/$slug/manage" params={{ slug }} />}
        >
          <UserPlusIcon className="size-4" />
        </Button>
      }
    >
      <span className="flex items-center -space-x-2">
        {shown.map((member) => (
          <UserAvatar
            key={member.userId}
            image={member.userImage}
            name={member.userName}
            gravatarHash={member.gravatarHash}
            size="sm"
            className="bg-card ring-card ring-2"
          />
        ))}
        {extra > 0 ? <span className="text-muted-foreground pl-3 text-xs">+{extra}</span> : null}
      </span>
    </StatCard>
  );
}
