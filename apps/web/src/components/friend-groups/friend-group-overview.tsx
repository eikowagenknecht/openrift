import type { FriendGroupDetailResponse } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { FolderIcon, HandshakeIcon, UsersIcon, ZapIcon } from "lucide-react";
import type { ComponentType, ReactNode, SVGProps } from "react";

import { UserAvatar } from "@/components/user-avatar";
import { useGroupTrades, useTradeActionCounts } from "@/hooks/use-card-trades";
import { useCollections } from "@/hooks/use-collections";
import {
  useFriendGroupMatches,
  useFriendGroupShareableCollections,
  useFriendGroupShareableLists,
} from "@/hooks/use-friend-groups";
import { useRequiredUserId } from "@/lib/auth-session";
import { countTradeSuggestions, withoutLiveTradeMatches } from "@/lib/trade-derivation";
import { cn } from "@/lib/utils";

import { FriendGroupActivityFeed } from "./friend-group-activity-feed";

/**
 * The group overview / dashboard: a row of cards linking to the trades /
 * shared / members pages with at-a-glance counts, followed by the recent
 * activity feed.
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
  const { data: tradesData } = useGroupTrades(data.group.id);
  const { data: collections } = useCollections();
  const { data: shareableCollections } = useFriendGroupShareableCollections(slug);
  const { data: shareableLists } = useFriendGroupShareableLists(slug);

  const tradesActionCount =
    actionCounts?.byGroup.find((entry) => entry.groupId === data.group.id)?.count ?? 0;
  // Count what the Trades tab renders: per-copy match rows collapsed into
  // suggestion tiles, minus suggestions already covered by a live trade.
  const trades = tradesData?.items ?? [];
  const matchCount = countTradeSuggestions(
    withoutLiveTradeMatches(matches.othersHaveYourWants, trades),
    withoutLiveTradeMatches(matches.othersWantYourHaves, trades),
  );

  // Collections owned by the group itself, vs. members' personal collections
  // and lists shared into the group. The viewer's own shares live in
  // `collectionShares` / `shares` too, so "from members" excludes them by
  // `userId`.
  const groupCollectionCount = collections.filter((col) => col.groupId === data.group.id).length;
  const myShareableTotal = shareableCollections.items.length + shareableLists.items.length;
  const mySharedCount =
    shareableCollections.items.filter((item) => item.sharedAt !== null).length +
    shareableLists.items.filter((item) => item.sharedAt !== null).length;
  const memberShareCount =
    data.collectionShares.filter((share) => share.userId !== viewerId).length +
    data.shares.filter(
      (share) =>
        share.userId !== viewerId && (share.listIntent === "wish" || share.listIntent === "trade"),
    ).length;

  const memberCount = data.members.length;

  // The most urgent number wins the big slot: trades waiting on the viewer
  // when there are any, otherwise the possible trades the matcher found.
  const needsYou = tradesActionCount === 1 ? "needs you" : "need you";
  const tradesValue = tradesActionCount > 0 ? tradesActionCount : matchCount;
  const tradesHint =
    tradesActionCount > 0
      ? matchCount > 0
        ? `${needsYou} · ${matchCount} possible`
        : needsYou
      : `${matchCount === 1 ? "possible trade" : "possible trades"} · none waiting on you`;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        to="/groups/$slug/shared"
        slug={slug}
        icon={FolderIcon}
        label="Group collections"
        value={groupCollectionCount}
        hint="owned by the group"
      />
      <StatCard
        to="/groups/$slug/shared"
        slug={slug}
        icon={HandshakeIcon}
        label="Shared by members"
        value={memberShareCount}
        hint={`you share ${mySharedCount} of ${myShareableTotal}`}
      />
      <MembersCard slug={slug} data={data} memberCount={memberCount} />
      <StatCard
        to="/groups/$slug/trades"
        slug={slug}
        icon={ZapIcon}
        label="Trades"
        value={tradesValue}
        valueClassName={tradesActionCount > 0 ? "text-primary" : undefined}
        hint={tradesHint}
      />
    </div>
  );
}

type StatCardTarget = "/groups/$slug/trades" | "/groups/$slug/shared" | "/groups/$slug/members";

/**
 * A dashboard tile linking to one of the group pages: an icon + label, a big
 * value, optional extra content (e.g. member avatars), and an optional hint
 * pinned to the bottom.
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
}: {
  to: StatCardTarget;
  slug: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: ReactNode;
  valueClassName?: string;
  hint?: ReactNode;
  children?: ReactNode;
}): ReactNode {
  return (
    <Link
      to={to}
      params={{ slug }}
      className="bg-card hover:bg-muted/50 flex flex-col gap-1 rounded-lg border p-3 transition-colors"
    >
      <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
        <Icon className="size-4" />
        {label}
      </span>
      <span className={cn("text-2xl font-semibold", valueClassName)}>{value}</span>
      {children}
      {hint ? <span className="text-muted-foreground mt-auto pt-1 text-xs">{hint}</span> : null}
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
    <StatCard
      to="/groups/$slug/members"
      slug={slug}
      icon={UsersIcon}
      label="Members"
      value={memberCount}
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
