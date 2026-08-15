import type { FriendGroupDetailResponse } from "@openrift/shared";
import { formatDayTimeLocal, needsViewerAction } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import {
  ChevronRightIcon,
  FolderIcon,
  HeartIcon,
  TrophyIcon,
  UsersIcon,
  ZapIcon,
} from "lucide-react";
import type { ComponentType, ReactNode, SVGProps } from "react";

import { ActionBand } from "@/components/ui/action-band";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardList } from "@/components/ui/card-list";
import { IconChip } from "@/components/ui/icon-chip";
import { SectionHeading } from "@/components/ui/section-heading";
import type { StatTileTone } from "@/components/ui/stat-tile";
import { StatTile } from "@/components/ui/stat-tile";
import { UserAvatar } from "@/components/user-avatar";
import { UserAvatarStack } from "@/components/user-avatar-stack";
import { useGroupTrades, useUserTrades } from "@/hooks/use-card-trades";
import { useCollections } from "@/hooks/use-collections";
import { useFriendGroupMatches, useGroupBoxWants } from "@/hooks/use-friend-groups";
import { useGroupTournaments } from "@/hooks/use-tournaments";
import { useRequiredUserId } from "@/lib/auth-session";
import { compareTournamentsForList, partitionTournaments } from "@/lib/tournament-display";
import {
  countTradeSuggestions,
  groupTradesByCounterparty,
  tradeSection,
  tradesHubSummary,
  withoutLiveTradeMatches,
} from "@/lib/trade-derivation";
import { needsYouCounts } from "@/lib/trade-hub";
import { capitalize, cn } from "@/lib/utils";

import { FriendGroupActivityFeed } from "./friend-group-activity-feed";
import { isAdmin } from "./friend-group-shell";
import { GroupSetupNudges } from "./group-setup-nudges";
import { HOVER_ROW_CLASS } from "./hover-row";
import { LIST_INTENT_ICON, LIST_INTENT_NOUN } from "./list-intent-meta";
import { PendingRequestsBand } from "./pending-requests-band";

/**
 * The group overview / dashboard: pending join requests (admins only) as the
 * page's first band, the trades hub (who is waiting on the viewer, and a chip
 * per person), a row of tiles linking to the shared / members / events pages,
 * then the recent activity feed beside a rail with the newest shares and the
 * tournament nudge.
 *
 * The requests band leads because the groups index and the avatar badge both
 * advertise "N requests to review" and land here; without it the only trace on
 * this page is the Members tile's hint, which reads as nothing to do.
 * @returns The overview-page content.
 */
export function OverviewContent({ slug, data }: { slug: string; data: FriendGroupDetailResponse }) {
  return (
    <div className="flex flex-col gap-8">
      {isAdmin(data.viewerRole) && data.pendingRequests.length > 0 ? (
        <PendingRequestsBand slug={slug} requests={data.pendingRequests} />
      ) : null}
      <GroupSetupNudges slug={slug} data={data} />
      <TradesHub slug={slug} data={data} />
      <ActionTiles slug={slug} data={data} />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <FriendGroupActivityFeed slug={slug} />
        <OverviewRail slug={slug} data={data} />
      </div>
    </div>
  );
}

/**
 * The page's primary module: everything trade-related in one full-width band.
 * The header row counts the people waiting on the viewer (see
 * {@link tradesHubSummary}), and one chip per person sits below it, each
 * leading to that person's trade sheet — the surface where their whole pile is
 * actually worked through. A trade count would be the wrong unit: three members
 * can hold dozens of rows between them, and there is nothing the viewer does to
 * "59 trades".
 * @returns The trades hub band.
 */
function TradesHub({ slug, data }: { slug: string; data: FriendGroupDetailResponse }) {
  const { data: matches } = useFriendGroupMatches(slug);
  const { data: tradesData } = useGroupTrades(data.group.id);
  const { data: allTradesData } = useUserTrades();

  const trades = tradesData?.items ?? [];
  const active = trades.filter((trade) => tradeSection(trade) === "active");
  // Count what the Trades page renders: per-copy match rows collapsed into
  // suggestion tiles, minus suggestions already covered by a live trade in any
  // group (falling back to this group's own trades until the all-groups list
  // loads).
  const liveTrades = allTradesData?.items ?? trades;
  const matchCount = countTradeSuggestions(
    withoutLiveTradeMatches(matches.othersHaveYourWants, liveTrades),
    withoutLiveTradeMatches(matches.othersWantYourHaves, liveTrades),
  );

  // Every viewer-side action counts as waiting: requests to answer, cards to
  // hand over, cards to receive. Grouping them by counterparty turns the pile
  // into the conversations it really is, biggest first.
  const needsYou = trades.filter((trade) => needsViewerAction(trade));
  const waiting = groupTradesByCounterparty(needsYou);
  const { toAnswer, toHandOver, toReceive } = needsYouCounts(needsYou);

  const needsAction = waiting.length > 0;
  const { headline, sub } = tradesHubSummary(
    waiting.length,
    toAnswer,
    toHandOver,
    toReceive,
    matchCount,
    active.length,
  );

  // The band is plain chrome, not one giant anchor: the person chips and the CTA
  // are each their own link, and nesting those inside a band-wide anchor would
  // be invalid HTML.
  return (
    <ActionBand
      icon={ZapIcon}
      accent={needsAction}
      label="Trades"
      value={headline}
      sub={sub}
      action={
        <Button
          variant={needsAction ? "default" : "ghost"}
          render={<Link to="/groups/$slug/trades" params={{ slug }} />}
        >
          View trades
          <ChevronRightIcon />
        </Button>
      }
    >
      {waiting.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {waiting.map(({ counterparty, trades: theirs }) => (
            <li key={counterparty.userId} className="min-w-0">
              {/* Badge's warning tone carries the band's gold palette; the
                  height and left padding open up for the avatar, which is
                  taller than a plain text chip. */}
              <Badge
                variant="warning"
                className="h-auto max-w-52 gap-1.5 py-1 pl-1 text-sm hover:bg-amber-500/20 dark:hover:bg-amber-500/30"
                render={
                  <Link
                    to="/trades/$userId"
                    params={{ userId: counterparty.userId }}
                    search={{ from: slug }}
                  />
                }
              >
                <UserAvatar
                  image={counterparty.image}
                  name={counterparty.name}
                  gravatarHash={counterparty.gravatarHash}
                  size="sm"
                />
                <span className="truncate font-medium">{counterparty.name ?? "A member"}</span>
                <span className="tabular-nums opacity-80">· {theirs.length}</span>
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
    </ActionBand>
  );
}

function ActionTiles({ slug, data }: { slug: string; data: FriendGroupDetailResponse }) {
  const viewerId = useRequiredUserId();
  const { data: collections } = useCollections();

  // The Shared page lists collections owned by the group itself plus members'
  // personal collections shared in. The tile leads with the group's own count;
  // member shares are the supporting hint. The viewer's own shares live in
  // `collectionShares` too, so "from members" excludes them by `userId`.
  const groupCollections = collections.filter((col) => col.groupId === data.group.id);
  const memberShareCount = data.collectionShares.filter(
    (share) => share.userId !== viewerId,
  ).length;

  // A group with no box of its own has nothing to want from, so it never asks.
  const boxWants = useGroupBoxWants(groupCollections.length > 0 ? slug : undefined);

  // Cards the viewer's wish lists want that the group's bulk boxes can actually
  // hand over. The tile leads to the box holding the most of them, already
  // filtered; a group with no box, or nothing wanted in one, gets no tile at
  // all rather than a zero.
  const bestBoxId = boxWants.bestCollection(groupCollections.map((box) => box.id));
  const wantedBox = groupCollections.find((col) => col.id === bestBoxId);
  // The value counts every wanted card in the group, so when more than one box
  // holds some, the hint says so instead of naming only the linked one.
  const boxesWithWants = groupCollections.filter(
    (col) => boxWants.wantedCardCount(col.id) > 0,
  ).length;

  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4",
        wantedBox ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3",
      )}
    >
      {wantedBox ? (
        <StatTile
          render={
            <Link
              to="/collections/$collectionId"
              params={{ collectionId: wantedBox.id }}
              search={{ wanted: true }}
            />
          }
          icon={HeartIcon}
          tone="gold"
          label="Cards you want"
          value={boxWants.wantedCardCount()}
          hint={
            boxesWithWants > 1
              ? `across ${boxesWithWants} group boxes`
              : `waiting in ${wantedBox.name}`
          }
        />
      ) : null}
      <GroupTournamentsTile slug={slug} data={data} />
      <StatCard
        to="/groups/$slug/shared"
        slug={slug}
        icon={FolderIcon}
        tone="sky"
        label="Group collections"
        value={groupCollections.length}
        hint={
          memberShareCount > 0 ? `+${memberShareCount} shared by members` : "owned by the group"
        }
      />
      <MembersCard slug={slug} data={data} />
    </div>
  );
}

/**
 * The Tournaments tile, shown to every group member: the count of the group's
 * open tournaments, with the viewer's participation in those same tournaments
 * as the supporting hint. When nothing is open, admins get a nudge to plan one
 * (creation is admin-gated); members get a plain empty state. The
 * group-tournaments list is member-scoped server-side, so the query is safe
 * for any role that reaches the overview.
 * @returns The Tournaments tile.
 */
function GroupTournamentsTile({ slug, data }: { slug: string; data: FriendGroupDetailResponse }) {
  const { data: tournaments } = useGroupTournaments(slug);
  // The same date-aware "current" bucket the events page renders, so the tile
  // can never disagree with it. Completed and cancelled tournaments only
  // surface through the "N total" fallback.
  const open = partitionTournaments(tournaments.items).current;
  const joined = open.filter((tournament) => tournament.myRoles.includes("participant")).length;

  if (open.length === 0) {
    return (
      <StatCard
        to="/groups/$slug/events"
        slug={slug}
        icon={TrophyIcon}
        tone="violet"
        label="Tournaments"
        value="None open"
        valueClassName="text-muted-foreground truncate text-lg"
        hint={
          isAdmin(data.viewerRole)
            ? "Plan one for the next game night →"
            : tournaments.items.length === 0
              ? "no tournaments yet"
              : `${tournaments.items.length} total`
        }
      />
    );
  }
  return (
    <StatCard
      to="/groups/$slug/events"
      slug={slug}
      icon={TrophyIcon}
      tone="violet"
      label="Open tournaments"
      value={open.length}
      hint={joined > 0 ? `you're in ${joined}` : `${tournaments.items.length} total`}
    />
  );
}

type StatCardTarget =
  | "/groups/$slug/trades"
  | "/groups/$slug/shared"
  | "/groups/$slug/members"
  | "/groups/$slug/events";

/**
 * A group-page StatTile: binds the shared dashboard-tile primitive to the
 * group's typed navigation targets.
 * @returns The tile.
 */
function StatCard({
  to,
  slug,
  ...props
}: {
  to: StatCardTarget;
  slug: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: ReactNode;
  valueClassName?: string;
  accent?: boolean;
  tone?: StatTileTone;
  hint?: ReactNode;
  children?: ReactNode;
}): ReactNode {
  return <StatTile render={<Link to={to} params={{ slug }} />} {...props} />;
}

// Pending requests are announced by the band at the top of the page, which
// carries the count and the approve/deny actions, so the tile no longer
// repeats them — one accent per page, and no second count to keep in step.
function MembersCard({ slug, data }: { slug: string; data: FriendGroupDetailResponse }): ReactNode {
  const shown = data.members.slice(0, 5);
  return (
    <StatCard
      to="/groups/$slug/members"
      slug={slug}
      icon={UsersIcon}
      tone="green"
      label="Members"
      value={data.members.length}
    >
      <UserAvatarStack members={shown} totalCount={data.members.length} size="sm" />
    </StatCard>
  );
}

/**
 * The overview's right rail: the group's newest shared lists and collections,
 * and, while no tournament is open, the role-aware "plan one" nudge.
 * @returns The rail column.
 */
function OverviewRail({ slug, data }: { slug: string; data: FriendGroupDetailResponse }) {
  return (
    <aside className="flex flex-col gap-8">
      <NewestShared slug={slug} data={data} />
      <TournamentNudge slug={slug} data={data} />
    </aside>
  );
}

type SharedRow = {
  key: string;
  sharedAt: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  name: string;
  sub: string;
} & ({ target: "list"; listId: string } | { target: "collection"; collectionId: string });

/** @returns The icon + name + sub body shared by every rail row. */
function RailRowBody({ row }: { row: SharedRow }) {
  return (
    <>
      <IconChip icon={row.icon} size="sm" shape="round" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{row.name}</span>
        <span className="text-muted-foreground truncate text-xs">{row.sub}</span>
      </span>
    </>
  );
}

/**
 * The most recently shared lists and collections, so fresh shares don't drown
 * in the activity feed. Renders nothing when the group has no shares yet.
 * @returns The newest-shared section, or null.
 */
function NewestShared({ slug, data }: { slug: string; data: FriendGroupDetailResponse }) {
  const rows: SharedRow[] = [
    ...data.shares.map((share): SharedRow => ({
      key: `list:${share.listId}`,
      sharedAt: share.sharedAt,
      icon: LIST_INTENT_ICON[share.listIntent],
      name: share.listName,
      sub: `${capitalize(LIST_INTENT_NOUN[share.listIntent])} · ${share.userName ?? "a member"}`,
      target: "list",
      listId: share.listId,
    })),
    ...data.collectionShares.map((share): SharedRow => ({
      key: `collection:${share.collectionId}`,
      sharedAt: share.sharedAt,
      icon: FolderIcon,
      name: share.collectionName,
      sub: `Collection · ${share.userName ?? "a member"}`,
      target: "collection",
      collectionId: share.collectionId,
    })),
  ]
    .toSorted((a, b) => b.sharedAt.localeCompare(a.sharedAt))
    .slice(0, 3);

  if (rows.length === 0) {
    return null;
  }
  return (
    <section className="flex flex-col gap-3">
      <SectionHeading>Newest shared</SectionHeading>
      <CardList>
        {rows.map((row) => (
          <li key={row.key}>
            {/* Each branch renders its own concrete <Link> so `to`/`params`
                stay correlated (TanStack types them together). */}
            {row.target === "list" ? (
              <Link
                to="/groups/$slug/lists/$listId"
                params={{ slug, listId: row.listId }}
                className={HOVER_ROW_CLASS}
              >
                <RailRowBody row={row} />
              </Link>
            ) : (
              <Link
                to="/groups/$slug/collections/$collectionId"
                params={{ slug, collectionId: row.collectionId }}
                className={HOVER_ROW_CLASS}
              >
                <RailRowBody row={row} />
              </Link>
            )}
          </li>
        ))}
      </CardList>
    </section>
  );
}

/**
 * The rail's tournament slot: the group's next open tournaments as compact
 * rows when there are any, otherwise a role-aware nudge — admins (who can
 * create tournaments) get a call-to-action, members a plain heads-up.
 * @returns The next-up section.
 */
function TournamentNudge({ slug, data }: { slug: string; data: FriendGroupDetailResponse }) {
  const { data: tournaments } = useGroupTournaments(slug);
  const current = partitionTournaments(tournaments.items)
    .current.toSorted((a, b) => compareTournamentsForList(a, b))
    .slice(0, 2);
  const admin = isAdmin(data.viewerRole);
  return (
    <section className="flex flex-col gap-3">
      <SectionHeading>Next up</SectionHeading>
      {current.length > 0 ? (
        <CardList>
          {current.map((tournament) => (
            <li key={tournament.id}>
              <Link
                to="/tournaments/$id"
                params={{ id: tournament.id }}
                className={HOVER_ROW_CLASS}
              >
                <IconChip icon={TrophyIcon} tone="violet" size="sm" shape="round" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{tournament.name}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {formatDayTimeLocal(tournament.startsAt)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </CardList>
      ) : (
        <div className="border-border flex flex-col gap-2 rounded-lg border border-dashed p-4">
          <p className="text-muted-foreground text-sm">
            {admin
              ? "No tournaments planned. Set one up for the next game night."
              : "No tournaments planned yet. When an admin sets one up, it will show up here."}
          </p>
          {admin ? (
            <Link
              to="/groups/$slug/events"
              params={{ slug }}
              className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
            >
              Plan a tournament
              <ChevronRightIcon className="size-4" />
            </Link>
          ) : null}
        </div>
      )}
    </section>
  );
}
