import type { FriendGroupMatchRow } from "@openrift/shared";
import { imageUrl } from "@openrift/shared";
import { Link } from "@tanstack/react-router";

import { useCards } from "@/hooks/use-cards";
import { useEnumOrders } from "@/hooks/use-enums";
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
interface AggregatedMatch extends ResolvedMatchRow {
  availableCount: number;
}

interface MatchRowCardProps {
  match: AggregatedMatch;
}

export function MatchRowCard({ match }: MatchRowCardProps) {
  return (
    <Link
      to="/cards/$cardSlug"
      params={{ cardSlug: match.cardSlug }}
      className="bg-card hover:bg-muted hover:text-foreground group flex items-center gap-3 rounded-md border p-2 transition-colors"
    >
      <div className="bg-muted relative aspect-[5/7] w-12 shrink-0 overflow-hidden rounded">
        {match.imageId ? (
          <img
            src={imageUrl(match.imageId, "120w")}
            alt={match.cardName}
            className="size-full object-cover"
            loading="lazy"
          />
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-medium">{match.cardName}</span>
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
    </Link>
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
        rows: [row],
      });
    }
  }
  return [...byUser.values()];
}

/**
 * Groups match rows by counterparty and renders a tile-grid per counterparty.
 * Resolves UUID set IDs and rarity slugs to display names via the catalog so
 * tile metadata doesn't leak raw IDs.
 * @returns The two stacked sections of match tiles.
 */
export function MatchRowGroup({ rows, groupSlug, linkCounterparty, className }: MatchGroupProps) {
  const { cardsById, sets } = useCards();
  const { labels } = useEnumOrders();
  const setsById = new Map(sets.map((set) => [set.id, set]));

  const resolved = rows.map((row): ResolvedMatchRow => {
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

  const grouped = groupByCounterparty(aggregateMatches(resolved));
  return (
    <div className={cn("flex flex-col gap-6", className)}>
      {grouped.map((group) => {
        const heading = (
          <div className="flex items-center gap-2 font-medium">
            {group.image ? (
              <img src={group.image} alt="" className="size-6 rounded-full" />
            ) : (
              <span className="bg-muted size-6 rounded-full" />
            )}
            <span>{group.name ?? "Member"}</span>
            {group.nickname ? (
              <span className="text-muted-foreground text-xs">{group.nickname}</span>
            ) : null}
            <span className="text-muted-foreground text-xs">({group.rows.length})</span>
          </div>
        );
        return (
          <div key={group.userId} className="flex flex-col gap-3">
            {linkCounterparty ? (
              <Link
                to="/groups/$slug/members/$userId"
                params={{ slug: groupSlug, userId: group.userId }}
                className="hover:underline"
              >
                {heading}
              </Link>
            ) : (
              heading
            )}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {group.rows.map((match) => (
                <MatchRowCard key={`${match.buyEntryId}:${match.printingId}`} match={match} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
