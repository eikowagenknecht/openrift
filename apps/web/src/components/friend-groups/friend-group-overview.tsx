import type { CardTradeResponse, FriendGroupDetailResponse } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ChevronRightIcon, FolderIcon, TrophyIcon, UsersIcon, ZapIcon } from "lucide-react";
import type { ComponentType, ReactNode, SVGProps } from "react";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { ActionBand } from "@/components/ui/action-band";
import { buttonVariants } from "@/components/ui/button";
import { CardList } from "@/components/ui/card-list";
import { IconChip } from "@/components/ui/icon-chip";
import { SectionHeading } from "@/components/ui/section-heading";
import type { StatTileTone } from "@/components/ui/stat-tile";
import { StatTile } from "@/components/ui/stat-tile";
import { UserAvatarStack } from "@/components/user-avatar-stack";
import { useGroupTrades, useTradeActionCounts } from "@/hooks/use-card-trades";
import { useCards } from "@/hooks/use-cards";
import { useCollections } from "@/hooks/use-collections";
import { useFriendGroupMatches } from "@/hooks/use-friend-groups";
import { useGroupTournaments } from "@/hooks/use-tournaments";
import { useRequiredUserId } from "@/lib/auth-session";
import { frontImageId } from "@/lib/card-meta";
import {
  compareTournamentsForList,
  formatTournamentDate,
  partitionTournaments,
} from "@/lib/tournament-display";
import {
  countTradeSuggestions,
  tradeSection,
  tradesHubSummary,
  withoutLiveTradeMatches,
} from "@/lib/trade-derivation";
import { capitalize, cn } from "@/lib/utils";

import { FriendGroupActivityFeed } from "./friend-group-activity-feed";
import { isAdmin } from "./friend-group-shell";
import { HOVER_ROW_CLASS } from "./hover-row";
import { LIST_INTENT_ICON, LIST_INTENT_NOUN } from "./list-intent-meta";
import { TradeDirectionIcon, TradeExpiry, TradeStatusBadge } from "./trade-row-parts";

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
  const { headline, sub } = tradesHubSummary(actionCount, matchCount, active.length);

  // The whole band is one click target (like the stat tiles), so the
  // in-progress rows inside are plain divs — they all lead to the Trades page
  // anyway, and nested anchors are invalid HTML.
  return (
    <ActionBand
      render={<Link to="/groups/$slug/trades" params={{ slug }} />}
      icon={ZapIcon}
      accent={needsAction}
      label="Trades"
      value={headline}
      sub={sub}
      action={
        // A span with Button's classes, not a Button: the whole band is the
        // anchor, and a nested interactive element would be invalid HTML. The
        // group-hover overrides re-key the hover styles to the band.
        <span
          className={cn(
            buttonVariants({ variant: needsAction ? "default" : "ghost" }),
            needsAction
              ? "group-hover/action-band:bg-primary/90"
              : "group-hover/action-band:bg-muted",
          )}
        >
          View trades
          <ChevronRightIcon className="size-4 transition-transform group-hover/action-band:translate-x-0.5" />
        </span>
      }
    >
      {active.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {active.map((trade) => (
            <li key={trade.id}>
              <InProgressTradeRow trade={trade} />
            </li>
          ))}
        </ul>
      ) : null}
    </ActionBand>
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
  const imageId = frontImageId(printing);
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
      <GroupTournamentsTile slug={slug} data={data} />
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
    ...data.shares.map(
      (share): SharedRow => ({
        key: `list:${share.listId}`,
        sharedAt: share.sharedAt,
        icon: LIST_INTENT_ICON[share.listIntent],
        name: share.listName,
        sub: `${capitalize(LIST_INTENT_NOUN[share.listIntent])} · ${share.userName ?? "a member"}`,
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
        sub: `Collection · ${share.userName ?? "a member"}`,
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
                    {formatTournamentDate(tournament.startsAt)}
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
