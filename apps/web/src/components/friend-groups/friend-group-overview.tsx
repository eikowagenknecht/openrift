import type { CardTradeResponse, FriendGroupDetailResponse } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ChevronRightIcon, FolderIcon, TrophyIcon, UsersIcon, ZapIcon } from "lucide-react";
import type { ComponentType, ReactNode, SVGProps } from "react";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import type { StatTileTone } from "@/components/ui/stat-tile";
import { StatTile } from "@/components/ui/stat-tile";
import { UserAvatarStack } from "@/components/user-avatar-stack";
import { useGroupTrades, useTradeActionCounts } from "@/hooks/use-card-trades";
import { useCards } from "@/hooks/use-cards";
import { useCollections } from "@/hooks/use-collections";
import { useFriendGroupMatches } from "@/hooks/use-friend-groups";
import { useGroupTournaments } from "@/hooks/use-tournaments";
import { useRequiredUserId } from "@/lib/auth-session";
import {
  compareTournamentsForList,
  formatTournamentDate,
  partitionTournaments,
} from "@/lib/tournament-display";
import {
  countTradeSuggestions,
  tradeSection,
  withoutLiveTradeMatches,
} from "@/lib/trade-derivation";
import { cn } from "@/lib/utils";

import { FriendGroupActivityFeed } from "./friend-group-activity-feed";
import { SECTION_HEADING, isAdmin } from "./friend-group-shell";
import { LIST_INTENT_ICON, LIST_INTENT_NOUN } from "./list-intent-meta";
import { TradeDirectionIcon, TradeExpiry, TradeStatusBadge } from "./trade-row-parts";

// The hub's gold wash: the warm accent token mixed toward the card surface,
// fading out by 55% along the band. Token-based (like the hero wash and the
// fan glow) so it stays visible on the dark theme — a low-alpha amber overlay
// all but disappears against the dark card.
const HUB_WASH =
  "linear-gradient(135deg, color-mix(in oklab, var(--border-accent) 14%, transparent), transparent 55%)";

/**
 * The group overview / dashboard: the trades hub (count, action state, and
 * in-progress trades in one surface), a row of tiles linking to the shared /
 * members / events pages, then the recent activity feed beside a rail with
 * the newest shares and the tournament nudge.
 * @returns The overview-page content.
 */
export function OverviewContent({ slug, data }: { slug: string; data: FriendGroupDetailResponse }) {
  return (
    <div className="flex flex-col gap-8">
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
 * The header row carries the headline count — trades needing the viewer's
 * action when there are any (the old banner state), otherwise the possible
 * trades the matcher found — and the in-progress trades render as inline rows
 * below it. Replaces the old three-surface split (banner, stat tile,
 * in-progress strip), which fragmented one domain across the page.
 * @returns The trades hub band.
 */
function TradesHub({ slug, data }: { slug: string; data: FriendGroupDetailResponse }) {
  const { data: matches } = useFriendGroupMatches(slug);
  const { data: actionCounts } = useTradeActionCounts();
  const { data: tradesData } = useGroupTrades(data.group.id);

  const actionCount =
    actionCounts?.byGroup.find((entry) => entry.groupId === data.group.id)?.count ?? 0;
  const trades = tradesData?.items ?? [];
  const active = trades.filter((trade) => tradeSection(trade) === "active");
  // Count what the Trades page renders: per-copy match rows collapsed into
  // suggestion tiles, minus suggestions already covered by a live trade.
  const matchCount = countTradeSuggestions(
    withoutLiveTradeMatches(matches.othersHaveYourWants, trades),
    withoutLiveTradeMatches(matches.othersWantYourHaves, trades),
  );

  const needsAction = actionCount > 0;
  const headline = needsAction ? actionCount : matchCount;
  const sub = needsAction
    ? `${actionCount === 1 ? "trade needs" : "trades need"} your action${
        matchCount > 0 ? ` · ${matchCount} possible` : ""
      }`
    : matchCount > 0
      ? `possible ${matchCount === 1 ? "trade" : "trades"} · none waiting on you`
      : active.length > 0
        ? "no new matches right now"
        : "no open trades right now";

  // The whole band is one click target (like the stat tiles), so the
  // in-progress rows inside are plain divs — they all lead to the Trades page
  // anyway, and nested anchors are invalid HTML.
  return (
    <Link
      to="/groups/$slug/trades"
      params={{ slug }}
      className={cn(
        "group/trades-hub bg-card flex flex-col gap-3 rounded-lg p-4 ring-1 transition-all hover:shadow-md",
        needsAction
          ? "ring-primary/40 hover:ring-primary/50"
          : "ring-amber-600/30 hover:ring-amber-600/45 dark:ring-amber-400/30 dark:hover:ring-amber-400/45",
      )}
      style={{ backgroundImage: HUB_WASH }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <ZapIcon className="size-5" />
        </span>
        <span className="text-muted-foreground text-sm font-medium">Trades</span>
        <span className="font-heading text-2xl font-semibold tabular-nums">{headline}</span>
        <span className="text-muted-foreground min-w-0 truncate text-xs">{sub}</span>
        <span
          className={cn(
            "ml-auto inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-3 text-sm font-medium transition-colors",
            needsAction
              ? "bg-primary text-primary-foreground group-hover/trades-hub:bg-primary/90"
              : "group-hover/trades-hub:bg-muted text-foreground",
          )}
        >
          View trades
          <ChevronRightIcon className="size-4 transition-transform group-hover/trades-hub:translate-x-0.5" />
        </span>
      </div>
      {active.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {active.map((trade) => (
            <li key={trade.id}>
              <InProgressTradeRow trade={trade} />
            </li>
          ))}
        </ul>
      ) : null}
    </Link>
  );
}

/**
 * One in-progress trade as a compact row inside the trades hub: the direction
 * arrow, the card thumb, the card name with the counterparty, then the status
 * badge and any expiry countdown. A plain div — the hub band around it is the
 * link to the Trades page, where the actual cancel / mark-traded controls live.
 * @returns The trade row.
 */
function InProgressTradeRow({ trade }: { trade: CardTradeResponse }) {
  const { cardsById, printingsById } = useCards();
  const card = cardsById[trade.cardId];
  const printing = printingsById[trade.printingId];
  const cardName = card?.name ?? "Card";
  const imageId = printing?.images.find((image) => image.face === "front")?.imageId ?? null;
  const incoming = trade.role === "receiver";
  // A pending trade's badge already reads "Waiting for {name}", so only name the
  // member in the row text when the badge doesn't (a reserved "Ready to swap").
  const showCounterparty = trade.status === "reserved";
  return (
    <div className="bg-muted/40 flex items-center gap-2.5 rounded-lg px-2.5 py-2">
      <TradeDirectionIcon incoming={incoming} />
      <CardArtThumb imageId={imageId} alt={cardName} className="w-7" loading="lazy" />
      <span className="min-w-0 flex-1 truncate text-sm">
        <span className="font-medium">
          {trade.quantity}× {cardName}
        </span>
        {showCounterparty ? (
          <span className="text-muted-foreground">
            {" "}
            · with {trade.counterparty.name ?? "a member"}
          </span>
        ) : null}
      </span>
      <TradeStatusBadge
        status={trade.status}
        counterpartyName={trade.counterparty.name}
        awaitingViewer={false}
      />
      <TradeExpiry status={trade.status} expiresAt={trade.expiresAt} />
    </div>
  );
}

function ActionTiles({ slug, data }: { slug: string; data: FriendGroupDetailResponse }) {
  const viewerId = useRequiredUserId();
  const { data: collections } = useCollections();

  // The Shared page lists collections owned by the group itself plus members'
  // personal collections shared in. The tile leads with the group's own count;
  // member shares are the supporting hint. The viewer's own shares live in
  // `collectionShares` too, so "from members" excludes them by `userId`.
  const groupCollectionCount = collections.filter((col) => col.groupId === data.group.id).length;
  const memberShareCount = data.collectionShares.filter(
    (share) => share.userId !== viewerId,
  ).length;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatCard
        to="/groups/$slug/shared"
        slug={slug}
        icon={FolderIcon}
        tone="sky"
        label="Group collections"
        value={groupCollectionCount}
        hint={
          memberShareCount > 0 ? `+${memberShareCount} shared by members` : "owned by the group"
        }
      />
      <MembersCard slug={slug} data={data} />
      <GroupTournamentsTile slug={slug} data={data} />
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

function MembersCard({ slug, data }: { slug: string; data: FriendGroupDetailResponse }): ReactNode {
  const shown = data.members.slice(0, 5);
  // `pendingRequests` is only populated for admins/owners, so the indicator
  // hides itself for plain members.
  const pendingRequestCount = data.pendingRequests.length;
  return (
    <StatCard
      to="/groups/$slug/members"
      slug={slug}
      icon={UsersIcon}
      tone="green"
      label="Members"
      value={data.members.length}
      accent={pendingRequestCount > 0}
      hint={
        pendingRequestCount > 0
          ? `${pendingRequestCount} ${pendingRequestCount === 1 ? "request" : "requests"} to review`
          : undefined
      }
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

const RAIL_ROW_CLASS = "hover:bg-muted/50 flex items-center gap-2.5 rounded-md px-2 py-2";

type SharedRow = {
  key: string;
  sharedAt: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  name: string;
  sub: string;
} & ({ target: "list"; listId: string } | { target: "collection"; collectionId: string });

/** @returns The icon + name + sub body shared by every rail row. */
function RailRowBody({ row }: { row: SharedRow }) {
  const Icon = row.icon;
  return (
    <>
      <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full">
        <Icon className="size-4" />
      </span>
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
    ...data.shares.map(
      (share): SharedRow => ({
        key: `list:${share.listId}`,
        sharedAt: share.sharedAt,
        icon: LIST_INTENT_ICON[share.listIntent],
        name: share.listName,
        sub: `${LIST_INTENT_NOUN[share.listIntent]} · ${share.userName ?? "a member"}`,
        target: "list",
        listId: share.listId,
      }),
    ),
    ...data.collectionShares.map(
      (share): SharedRow => ({
        key: `collection:${share.collectionId}`,
        sharedAt: share.sharedAt,
        icon: FolderIcon,
        name: share.collectionName,
        sub: `collection · ${share.userName ?? "a member"}`,
        target: "collection",
        collectionId: share.collectionId,
      }),
    ),
  ]
    .toSorted((a, b) => b.sharedAt.localeCompare(a.sharedAt))
    .slice(0, 3);

  if (rows.length === 0) {
    return null;
  }
  return (
    <section className="flex flex-col gap-3">
      <h2 className={SECTION_HEADING}>Newest shared</h2>
      <ul className="ring-foreground/10 bg-card flex flex-col rounded-lg p-1.5 ring-1">
        {rows.map((row) => (
          <li key={row.key}>
            {/* Each branch renders its own concrete <Link> so `to`/`params`
                stay correlated (TanStack types them together). */}
            {row.target === "list" ? (
              <Link
                to="/groups/$slug/lists/$listId"
                params={{ slug, listId: row.listId }}
                className={RAIL_ROW_CLASS}
              >
                <RailRowBody row={row} />
              </Link>
            ) : (
              <Link
                to="/groups/$slug/collections/$collectionId"
                params={{ slug, collectionId: row.collectionId }}
                className={RAIL_ROW_CLASS}
              >
                <RailRowBody row={row} />
              </Link>
            )}
          </li>
        ))}
      </ul>
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
      <h2 className={SECTION_HEADING}>Next up</h2>
      {current.length > 0 ? (
        <ul className="ring-foreground/10 bg-card flex flex-col rounded-lg p-1.5 ring-1">
          {current.map((tournament) => (
            <li key={tournament.id}>
              <Link to="/tournaments/$id" params={{ id: tournament.id }} className={RAIL_ROW_CLASS}>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-400">
                  <TrophyIcon className="size-4" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{tournament.name}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {formatTournamentDate(tournament.startsAt)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="border-border flex flex-col gap-2 rounded-lg border-2 border-dashed p-4">
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
