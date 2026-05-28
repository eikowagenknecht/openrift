import type { FriendGroupMatchRow, Marketplace, MarketplaceInfo } from "@openrift/shared";
import { imageUrl } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ArrowDownLeftIcon, ArrowUpRightIcon } from "lucide-react";

import { MatchPreferenceCell } from "@/components/trade-preferences/match-preference-cell";
import { UserAvatar } from "@/components/user-avatar";
import { useCards } from "@/hooks/use-cards";
import { useEnumOrders } from "@/hooks/use-enums";
import { useMarketplaceInfo } from "@/hooks/use-marketplace-info";
import { cn } from "@/lib/utils";

// Lightweight per-cell renderer for the matches panel. Doesn't go through
// the full <CardCell> pipeline because match rows already carry enough
// per-card info (cardId, printingId, imageId, name) and the catalog-grade
// CardCell needs a full Printing object we'd have to synthesize. Wiring
// CardCell is a follow-up when the matches panel needs siblings / chevrons.
interface ResolvedMatchRow extends FriendGroupMatchRow {
  cardSlug: string;
  setName: string;
  rarityLabel: string;
  finishLabel: string;
}

/**
 * One tile = one (counterparty, wish entry, printing). The same physical copy
 * is interchangeable in a tradelist today (per-copy condition is deferred in
 * ADR-005), so N copies of the same printing collapse into one tile with an
 * `availableCount`.
 */
export interface AggregatedMatch extends ResolvedMatchRow {
  availableCount: number;
}

/** Whether the card flows to the viewer (`incoming`) or away (`outgoing`). */
type MatchDirection = "incoming" | "outgoing";

interface DirectedMatch extends AggregatedMatch {
  direction: MatchDirection;
}

/**
 * Resolves UUID set IDs and rarity/finish slugs to display names via the
 * catalog so row metadata doesn't leak raw IDs.
 * @returns The rows with catalog-resolved display fields.
 */
function resolveMatchRows(
  rows: FriendGroupMatchRow[],
  cardsById: ReturnType<typeof useCards>["cardsById"],
  sets: ReturnType<typeof useCards>["sets"],
  labels: ReturnType<typeof useEnumOrders>["labels"],
): ResolvedMatchRow[] {
  const setsById = new Map(sets.map((set) => [set.id, set]));
  return rows.map((row) => {
    const card = cardsById[row.cardId];
    const set = setsById.get(row.setId);
    return {
      ...row,
      cardSlug: card?.slug ?? row.cardId,
      setName: set?.name ?? row.setId,
      rarityLabel: labels.rarities[row.rarity] ?? row.rarity,
      finishLabel: labels.finishes[row.finish] ?? row.finish,
    };
  });
}

interface MatchRowCardProps {
  match: AggregatedMatch;
  marketplaceInfos: Record<Marketplace, MarketplaceInfo> | null;
}

export function MatchRowCard({ match, marketplaceInfos }: MatchRowCardProps) {
  return (
    <div className="bg-card hover:bg-muted hover:text-foreground group relative flex items-stretch gap-3 rounded-md border p-2 transition-colors">
      <div className="bg-muted relative aspect-[5/7] w-12 shrink-0 self-start overflow-hidden rounded">
        {match.imageId ? (
          <img
            src={imageUrl(match.imageId, "120w")}
            alt={match.cardName}
            className="size-full object-cover"
            loading="lazy"
          />
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-col gap-0.5">
          <span className="truncate font-medium">
            <Link
              to="/cards/$cardSlug"
              params={{ cardSlug: match.cardSlug }}
              className="before:absolute before:inset-0 before:rounded-md before:content-['']"
            >
              {match.cardName}
            </Link>
          </span>
          <span className="text-muted-foreground text-xs">
            {match.setName} · {match.rarityLabel} · {match.finishLabel} · ×{match.availableCount}
            {match.buyEntryKind === "card" && match.buyQuantity > 1
              ? ` · wants ×${match.buyQuantity}`
              : null}
          </span>
          <span className="text-muted-foreground truncate text-xs">
            from {match.counterpartyListName}
          </span>
        </div>
        <div className="divide-border/60 border-border/60 grid grid-cols-2 divide-x overflow-hidden rounded border">
          <MatchPreferenceCell
            label="They want"
            pref={match.sellPref}
            marketplaceInfos={marketplaceInfos}
            searchQuery={match.cardName}
          />
          <MatchPreferenceCell
            label="You'd pay"
            pref={match.buyPref}
            marketplaceInfos={marketplaceInfos}
            searchQuery={match.cardName}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * One wide row in the unified "Possible trades" list. The direction arrow
 * tells you which way the card flows; the price hint shows the *counterparty's*
 * preference (their ask when the card comes to you, their offer when it goes to
 * them), since that's the side of the deal that's about them.
 * @returns The match row element.
 */
function MatchRow({
  match,
  groupSlug,
  marketplaceInfos,
  showCounterparty,
}: {
  match: DirectedMatch;
  groupSlug: string;
  marketplaceInfos: Record<Marketplace, MarketplaceInfo> | null;
  /** When false (member-detail page), the counterparty is fixed, so the chip is hidden. */
  showCounterparty: boolean;
}) {
  const incoming = match.direction === "incoming";
  const DirectionIcon = incoming ? ArrowDownLeftIcon : ArrowUpRightIcon;
  // sellPref is always the seller's side, buyPref the buyer's. When the card
  // comes to you the counterparty is the seller (sellPref = their ask); when it
  // goes to them they're the buyer (buyPref = their offer).
  const counterpartyPref = incoming ? match.sellPref : match.buyPref;
  const priceLabel = incoming ? "They want" : "They'd pay";

  return (
    <div className="bg-card hover:bg-muted flex items-center gap-3 rounded-md border p-2 transition-colors">
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full",
          incoming
            ? "bg-green-500/10 text-green-600 dark:text-green-500"
            : "bg-amber-500/10 text-amber-600 dark:text-amber-500",
        )}
        title={incoming ? "Comes to you" : "Goes to them"}
        aria-label={incoming ? "Comes to you" : "Goes to them"}
      >
        <DirectionIcon className="size-4" />
      </span>

      <div className="bg-muted relative aspect-[5/7] w-10 shrink-0 overflow-hidden rounded">
        {match.imageId ? (
          <img
            src={imageUrl(match.imageId, "120w")}
            alt={match.cardName}
            className="size-full object-cover"
            loading="lazy"
          />
        ) : null}
      </div>

      <div
        className="flex min-w-0 flex-1 flex-col gap-0.5"
        title={`From ${match.counterpartyListName}`}
      >
        <Link
          to="/cards/$cardSlug"
          params={{ cardSlug: match.cardSlug }}
          className="truncate font-medium hover:underline"
        >
          {match.cardName}
        </Link>
        <span className="text-muted-foreground text-xs">
          {match.setName} · {match.rarityLabel} · {match.finishLabel} · ×{match.availableCount}
          {match.buyEntryKind === "card" && match.buyQuantity > 1
            ? ` · wants ×${match.buyQuantity}`
            : null}
        </span>
      </div>

      <div className="w-32 shrink-0 text-right">
        <MatchPreferenceCell
          label={priceLabel}
          pref={counterpartyPref}
          marketplaceInfos={marketplaceInfos}
          searchQuery={match.cardName}
        />
      </div>

      {showCounterparty ? (
        <Link
          to="/groups/$slug/members/$userId"
          params={{ slug: groupSlug, userId: match.counterpartyUserId }}
          className="hover:bg-muted/60 flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1"
        >
          <UserAvatar
            image={match.counterpartyImage}
            name={match.counterpartyName}
            gravatarHash={match.counterpartyGravatarHash}
            size="sm"
          />
          <span className="hidden text-sm sm:inline">{match.counterpartyName ?? "Member"}</span>
        </Link>
      ) : null}
    </div>
  );
}

/**
 * Collapse rows with the same `(buyEntryId, counterpartyListId, printingId)`
 * into one tile so that 100 copies of the same printing in the same source
 * list no longer render 100 cells. Different counterparty lists (e.g. "Spare
 * Foils" vs "Sell Pile") with the same printing stay separate tiles so the
 * source list is visible.
 * @returns One aggregated match per unique (buyEntryId, counterpartyListId, printingId) triple.
 */
function aggregateMatches(rows: ResolvedMatchRow[]): AggregatedMatch[] {
  const aggregated = new Map<string, AggregatedMatch>();
  for (const row of rows) {
    const key = `${row.buyEntryId}\0${row.counterpartyListId}\0${row.printingId}`;
    const existing = aggregated.get(key);
    if (existing) {
      existing.availableCount += 1;
    } else {
      aggregated.set(key, { ...row, availableCount: 1 });
    }
  }
  return [...aggregated.values()];
}

interface MatchGroupProps {
  rows: FriendGroupMatchRow[];
  groupSlug: string;
  /** When set, counterparty headings link to the member-detail page. */
  linkCounterparty?: boolean;
  className?: string;
}

interface CounterpartyGroup {
  userId: string;
  name: string | null;
  nickname: string | null;
  image: string | null;
  gravatarHash: string;
  rows: AggregatedMatch[];
}

function groupByCounterparty(rows: AggregatedMatch[]): CounterpartyGroup[] {
  const byUser = new Map<string, CounterpartyGroup>();
  for (const row of rows) {
    const existing = byUser.get(row.counterpartyUserId);
    if (existing) {
      existing.rows.push(row);
    } else {
      byUser.set(row.counterpartyUserId, {
        userId: row.counterpartyUserId,
        name: row.counterpartyName,
        nickname: row.counterpartyNickname,
        image: row.counterpartyImage,
        gravatarHash: row.counterpartyGravatarHash,
        rows: [row],
      });
    }
  }
  return [...byUser.values()];
}

interface MatchTradeListProps {
  /** Rows where a member has a card you want (the card flows to you). */
  incoming: FriendGroupMatchRow[];
  /** Rows where a member wants a card you have (the card flows to them). */
  outgoing: FriendGroupMatchRow[];
  groupSlug: string;
  /** Hide the per-row counterparty chip when the whole list is one member. */
  showCounterparty?: boolean;
}

/**
 * The unified trades view: one flat list of wide rows, everything you'd receive
 * first, then everything you'd give. Each row carries its own direction
 * indicator and the counterparty's price preference. Used on the group page
 * (with the counterparty chip) and the member-detail page (without it).
 * @returns The flat list of match rows.
 */
export function MatchTradeList({
  incoming,
  outgoing,
  groupSlug,
  showCounterparty = true,
}: MatchTradeListProps) {
  const { cardsById, sets } = useCards();
  const { labels } = useEnumOrders();

  const printingIds = [...new Set([...incoming, ...outgoing].map((row) => row.printingId))];
  const { data: marketplaceInfo } = useMarketplaceInfo(printingIds);

  const incomingRows = aggregateMatches(resolveMatchRows(incoming, cardsById, sets, labels)).map(
    (match): DirectedMatch => ({ ...match, direction: "incoming" }),
  );
  const outgoingRows = aggregateMatches(resolveMatchRows(outgoing, cardsById, sets, labels)).map(
    (match): DirectedMatch => ({ ...match, direction: "outgoing" }),
  );
  const rows = [...incomingRows, ...outgoingRows];

  return (
    <div className="flex flex-col gap-2">
      {rows.map((match) => (
        <MatchRow
          key={`${match.direction}:${match.buyEntryId}:${match.counterpartyListId}:${match.printingId}`}
          match={match}
          groupSlug={groupSlug}
          marketplaceInfos={marketplaceInfo?.infos[match.printingId] ?? null}
          showCounterparty={showCounterparty}
        />
      ))}
    </div>
  );
}

/**
 * Groups match rows by counterparty and renders a tile-grid per counterparty.
 * Used by the member-detail page, where direction is already conveyed by the
 * surrounding section heading.
 * @returns The stacked sections of match tiles.
 */
export function MatchRowGroup({ rows, groupSlug, linkCounterparty, className }: MatchGroupProps) {
  const { cardsById, sets } = useCards();
  const { labels } = useEnumOrders();

  const printingIds = [...new Set(rows.map((row) => row.printingId))];
  const { data: marketplaceInfo } = useMarketplaceInfo(printingIds);

  const resolved = resolveMatchRows(rows, cardsById, sets, labels);
  const grouped = groupByCounterparty(aggregateMatches(resolved));
  return (
    <div className={cn("flex flex-col gap-6", className)}>
      {grouped.map((group) => {
        const headingInner = (
          <>
            <UserAvatar
              image={group.image}
              name={group.name}
              gravatarHash={group.gravatarHash}
              size="sm"
            />
            <span>{group.name ?? "Member"}</span>
            {group.nickname ? (
              <span className="text-muted-foreground text-xs">{group.nickname}</span>
            ) : null}
            <span className="text-muted-foreground text-xs">({group.rows.length})</span>
          </>
        );
        return (
          <div key={group.userId} className="flex flex-col gap-3">
            {linkCounterparty ? (
              <Link
                to="/groups/$slug/members/$userId"
                params={{ slug: groupSlug, userId: group.userId }}
                className="hover:bg-muted/50 flex items-center gap-2 rounded-md px-2 py-1.5 font-medium"
              >
                {headingInner}
              </Link>
            ) : (
              <div className="flex items-center gap-2 px-2 py-1.5 font-medium">{headingInner}</div>
            )}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {group.rows.map((match) => (
                <MatchRowCard
                  key={`${match.buyEntryId}:${match.printingId}`}
                  match={match}
                  marketplaceInfos={marketplaceInfo?.infos[match.printingId] ?? null}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
