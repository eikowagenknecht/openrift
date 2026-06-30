import type { FriendGroupDetailResponse } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ChevronRightIcon, FolderIcon, TrophyIcon, UsersIcon, ZapIcon } from "lucide-react";
import type { ComponentType, ReactNode, SVGProps } from "react";

import { UserAvatar } from "@/components/user-avatar";
import { useGroupTrades, useTradeActionCounts } from "@/hooks/use-card-trades";
import { useCollections } from "@/hooks/use-collections";
import { useMyTournamentDecks } from "@/hooks/use-deck-check-player";
import { useFriendGroupMatches } from "@/hooks/use-friend-groups";
import { useGroupTournaments } from "@/hooks/use-tournaments";
import { useRequiredUserId } from "@/lib/auth-session";
import { countOpenTournaments } from "@/lib/tournament-display";
import { countTradeSuggestions, withoutLiveTradeMatches } from "@/lib/trade-derivation";
import { cn } from "@/lib/utils";

import { FriendGroupActivityFeed } from "./friend-group-activity-feed";
import { canManageGroupTournaments } from "./friend-group-shell";

/**
 * The group overview / dashboard: an optional "trades need you" banner, a grid
 * of tiles linking to the trades / shared / members / events pages with
 * at-a-glance counts, then the recent activity feed.
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
  // A plain member still reaches the Events tile when they entered one of this
  // group's events; the tile then counts only their own entries (ADR-026).
  const { data: ownDecks } = useMyTournamentDecks();
  const ownEntries = (ownDecks?.items ?? []).filter((entry) => entry.groupSlug === data.group.slug);
  const canManageTournaments = canManageGroupTournaments(data.viewerRole);
  const showChecks = canManageTournaments || ownEntries.length > 0;

  const tradesActionCount =
    actionCounts?.byGroup.find((entry) => entry.groupId === data.group.id)?.count ?? 0;
  // Count what the Trades page renders: per-copy match rows collapsed into
  // suggestion tiles, minus suggestions already covered by a live trade.
  const trades = tradesData?.items ?? [];
  const matchCount = countTradeSuggestions(
    withoutLiveTradeMatches(matches.othersHaveYourWants, trades),
    withoutLiveTradeMatches(matches.othersWantYourHaves, trades),
  );

  // The Shared page lists collections owned by the group itself plus members'
  // personal collections shared in. The tile leads with the group's own count;
  // member shares are the supporting hint. The viewer's own shares live in
  // `collectionShares` too, so "from members" excludes them by `userId`.
  const groupCollectionCount = collections.filter((col) => col.groupId === data.group.id).length;
  const memberShareCount = data.collectionShares.filter(
    (share) => share.userId !== viewerId,
  ).length;

  const memberCount = data.members.length;
  // `pendingRequests` is only populated for admins/owners, so the indicator
  // hides itself for plain members.
  const pendingRequestCount = data.pendingRequests.length;

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
    <div className="flex flex-col gap-4">
      {tradesActionCount > 0 ? (
        <TradesActionBanner slug={slug} count={tradesActionCount} possible={matchCount} />
      ) : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* When the banner is up it already carries the trade counts, so the tile
            would just repeat it — show the tile only when there's no banner. */}
        {tradesActionCount === 0 ? (
          <StatCard
            to="/groups/$slug/trades"
            slug={slug}
            icon={ZapIcon}
            label="Trades"
            value={tradesValue}
            hint={tradesHint}
          />
        ) : null}
        <StatCard
          to="/groups/$slug/shared"
          slug={slug}
          icon={FolderIcon}
          label="Group collections"
          value={groupCollectionCount}
          hint={
            memberShareCount > 0 ? `+${memberShareCount} shared by members` : "owned by the group"
          }
        />
        <MembersCard
          slug={slug}
          data={data}
          memberCount={memberCount}
          pendingRequestCount={pendingRequestCount}
        />
        {showChecks ? (
          canManageTournaments ? (
            <GroupTournamentsTile slug={slug} ownEntries={ownEntries.length} />
          ) : (
            <StatCard
              to="/groups/$slug/events"
              slug={slug}
              icon={TrophyIcon}
              label="Tournaments"
              value={ownEntries.length}
              hint="your entries"
            />
          )
        ) : null}
      </div>
    </div>
  );
}

/**
 * Full-width call-to-action shown above the tiles when the viewer has trades
 * waiting on them — the one thing on the page worth interrupting for. The whole
 * banner is a single link to the Trades page.
 * @returns The banner.
 */
function TradesActionBanner({
  slug,
  count,
  possible,
}: {
  slug: string;
  count: number;
  possible: number;
}) {
  return (
    <Link
      to="/groups/$slug/trades"
      params={{ slug }}
      className="bg-primary text-primary-foreground group flex items-start gap-3 rounded-xl p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      <span className="bg-primary-foreground/15 flex size-10 shrink-0 items-center justify-center rounded-lg">
        <ZapIcon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {count} {count === 1 ? "trade needs" : "trades need"} your action
        </p>
        {possible > 0 ? (
          <p className="text-primary-foreground/80 text-sm">
            plus {possible} possible {possible === 1 ? "trade" : "trades"} waiting
          </p>
        ) : null}
      </div>
      <span className="bg-primary-foreground/15 group-hover:bg-primary-foreground/25 inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors">
        View trades
        <ChevronRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

/**
 * The Tournaments tile for group admins/owners: the count of the group's
 * tournaments, with the viewer's own entries as the supporting hint. Split out
 * so the group-tournaments query only runs for roles that load this surface.
 * @returns The Tournaments tile.
 */
function GroupTournamentsTile({ slug, ownEntries }: { slug: string; ownEntries: number }) {
  const { data: tournaments } = useGroupTournaments(slug);
  const open = countOpenTournaments(tournaments.items);
  const hint =
    ownEntries > 0
      ? `${ownEntries} of your ${ownEntries === 1 ? "entry" : "entries"}`
      : tournaments.items.length === 0
        ? "no tournaments yet"
        : `${tournaments.items.length} total`;
  return (
    <StatCard
      to="/groups/$slug/events"
      slug={slug}
      icon={TrophyIcon}
      label="Open tournaments"
      value={open}
      hint={hint}
    />
  );
}

type StatCardTarget =
  | "/groups/$slug/trades"
  | "/groups/$slug/shared"
  | "/groups/$slug/members"
  | "/groups/$slug/events";

/**
 * A dashboard tile linking to one of the group pages: a tinted icon chip, a
 * label, the stat value, an optional hint pinned to the bottom, and a chevron
 * that slides in on hover. `accent` gives the tile the gold treatment reserved
 * for the one thing that needs the viewer's attention.
 * @returns The tile.
 */
function StatCard({
  to,
  slug,
  icon: Icon,
  label,
  value,
  accent = false,
  hint,
  children,
}: {
  to: StatCardTarget;
  slug: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: ReactNode;
  accent?: boolean;
  hint?: ReactNode;
  children?: ReactNode;
}): ReactNode {
  return (
    <Link
      to={to}
      params={{ slug }}
      className={cn(
        "group relative flex flex-col gap-4 rounded-xl border p-5 transition-all hover:shadow-md sm:min-h-28",
        accent
          ? "border-primary/30 bg-primary/5 hover:border-primary/50"
          : "bg-card hover:border-primary/30 hover:bg-muted/40",
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg",
            accent ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="size-5" />
        </span>
        <span className="text-muted-foreground text-sm font-medium">{label}</span>
        <span className="ml-auto text-3xl font-semibold tabular-nums">{value}</span>
        <ChevronRightIcon className="text-muted-foreground/40 group-hover:text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
      </div>
      {children}
      {hint ? <span className="text-muted-foreground mt-auto text-xs">{hint}</span> : null}
    </Link>
  );
}

function MembersCard({
  slug,
  data,
  memberCount,
  pendingRequestCount,
}: {
  slug: string;
  data: FriendGroupDetailResponse;
  memberCount: number;
  pendingRequestCount: number;
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
      accent={pendingRequestCount > 0}
      hint={
        pendingRequestCount > 0
          ? `${pendingRequestCount} ${pendingRequestCount === 1 ? "request" : "requests"} to review`
          : undefined
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
