import type { FriendGroupDetailResponse } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import {
  FolderIcon,
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
import { useFriendGroupMatches } from "@/hooks/use-friend-groups";

import { FriendGroupActivityFeed } from "./friend-group-activity-feed";

/**
 * The group overview / dashboard: quick actions, a row of cards linking to the
 * trades / shared / members pages with at-a-glance counts, and the recent
 * activity feed.
 * @returns The overview-page content.
 */
export function OverviewContent({ slug, data }: { slug: string; data: FriendGroupDetailResponse }) {
  return (
    <div className="flex flex-col gap-8">
      <QuickActions data={data} />
      <ActionCards slug={slug} data={data} />
      <FriendGroupActivityFeed slug={slug} />
    </div>
  );
}

function QuickActions({ data }: { data: FriendGroupDetailResponse }) {
  const [createOpen, setCreateOpen] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="outline"
        render={<Link to="/groups/$slug/manage" params={{ slug: data.group.slug }} />}
      >
        <UserPlusIcon className="size-4" />
        Invite a member
      </Button>
      <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
        <PlusIcon className="size-4" />
        New shared collection
      </Button>
      <Button
        size="sm"
        variant="outline"
        render={<Link to="/groups/$slug/manage" params={{ slug: data.group.slug }} />}
      >
        <Share2Icon className="size-4" />
        Share a list
      </Button>
      <CreateCollectionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        groupSlug={data.group.slug}
        groupName={data.group.name}
      />
    </div>
  );
}

function ActionCards({ slug, data }: { slug: string; data: FriendGroupDetailResponse }) {
  const { data: matches } = useFriendGroupMatches(slug);
  const { data: actionCounts } = useTradeActionCounts();
  const { data: collections } = useCollections();

  const tradesActionCount =
    actionCounts?.byGroup.find((entry) => entry.groupId === data.group.id)?.count ?? 0;
  const matchCount = matches.othersHaveYourWants.length + matches.othersWantYourHaves.length;
  const groupCollectionCount = collections.filter((col) => col.groupId === data.group.id).length;
  const sharedCollectionCount = groupCollectionCount + data.collectionShares.length;
  const sharedListCount = data.shares.filter(
    (share) => share.listIntent === "wish" || share.listIntent === "trade",
  ).length;
  const memberCount = data.members.length;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <TradesCard slug={slug} count={tradesActionCount} />
      <ActionCard
        to="/groups/$slug/trades"
        slug={slug}
        icon={SparklesIcon}
        label="Matches"
        value={matchCount}
        hint="suggested trades"
      />
      <ActionCard
        to="/groups/$slug/shared"
        slug={slug}
        icon={FolderIcon}
        label="Shared"
        value={sharedCollectionCount}
        hint={`${sharedCollectionCount === 1 ? "collection" : "collections"} · ${sharedListCount} ${sharedListCount === 1 ? "list" : "lists"}`}
      />
      <MembersCard slug={slug} data={data} memberCount={memberCount} />
    </div>
  );
}

const CARD_CLASS =
  "bg-card hover:bg-muted flex flex-col gap-1 rounded-lg border p-4 transition-colors";

function ActionCard({
  to,
  slug,
  icon: Icon,
  label,
  value,
  hint,
}: {
  to: "/groups/$slug/trades" | "/groups/$slug/shared";
  slug: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <Link to={to} params={{ slug }} className={CARD_CLASS}>
      <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
        <Icon className="size-4" />
        {label}
      </span>
      <span className="text-2xl font-semibold">{value}</span>
      <span className="text-muted-foreground text-xs">{hint}</span>
    </Link>
  );
}

function TradesCard({ slug, count }: { slug: string; count: number }): ReactNode {
  // Count of trades waiting on the viewer to accept/decline or add to their
  // collection. The number turns accent while any are waiting; the hint names
  // the actions so "what needs doing" is clear without clicking in.
  const active = count > 0;
  return (
    <Link to="/groups/$slug/trades" params={{ slug }} className={CARD_CLASS}>
      <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
        <ZapIcon className="size-4" />
        Trades
      </span>
      <span className={active ? "text-primary text-2xl font-semibold" : "text-2xl font-semibold"}>
        {count}
      </span>
      <span className="text-muted-foreground text-xs">
        {active ? "to accept, decline, or finish" : "all caught up"}
      </span>
    </Link>
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
    <Link to="/groups/$slug/members" params={{ slug }} className={CARD_CLASS}>
      <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
        <UsersIcon className="size-4" />
        Members
      </span>
      <span className="text-2xl font-semibold">{memberCount}</span>
      <span className="flex items-center -space-x-2">
        {shown.map((member) => (
          <UserAvatar
            key={member.userId}
            image={member.userImage}
            name={member.userName}
            gravatarHash={member.gravatarHash}
            size="sm"
            className="ring-card ring-2"
          />
        ))}
        {extra > 0 ? <span className="text-muted-foreground pl-3 text-xs">+{extra}</span> : null}
      </span>
    </Link>
  );
}
