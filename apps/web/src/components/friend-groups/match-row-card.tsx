import type { FriendGroupMatchRow, Marketplace, MarketplaceInfo } from "@openrift/shared";
import { imageUrl } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ArrowDownLeftIcon, ArrowUpRightIcon, ChevronDownIcon } from "lucide-react";

import { MatchPreferenceCell } from "@/components/trade-preferences/match-preference-cell";
import { UserAvatar } from "@/components/user-avatar";
import { useCards } from "@/hooks/use-cards";
import { useEnumOrders } from "@/hooks/use-enums";
import { useMarketplaceInfo } from "@/hooks/use-marketplace-info";
import { cn } from "@/lib/utils";
import { useMatchVariantsFoldStore } from "@/stores/match-variants-fold-store";

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
              {match.buyQuantity}× {match.cardName}
            </Link>
          </span>
          <span className="text-muted-foreground text-xs">
            {match.setName} · {match.rarityLabel} · {match.finishLabel} · ×{match.availableCount}{" "}
            available
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
          {match.buyQuantity}× {match.cardName}
        </Link>
        <span className="text-muted-foreground text-xs">
          {match.setName} · {match.rarityLabel} · {match.finishLabel} · ×{match.availableCount}{" "}
          available
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

interface MatchTradeGroup {
  /** Stable, per-counterparty key used both as the React key and the fold-store id. */
  foldId: string;
  direction: MatchDirection;
  cardName: string;
  cardSlug: string;
  imageId: string | null;
  buyEntryKind: "card" | "printing";
  buyQuantity: number;
  counterpartyUserId: string;
  counterpartyName: string | null;
  counterpartyImage: string | null;
  counterpartyGravatarHash: string;
  /** Copies available across every variant in this group. */
  totalAvailable: number;
  variants: DirectedMatch[];
}

/**
 * Collapses the per-printing rows of a single card-level wish (from one
 * counterparty, in one direction) into one group. A wish like "any Fury Rune"
 * that a member can fill with four different printings becomes one expandable
 * group of four variants instead of four sibling rows. Printing-level wishes
 * target one specific printing, so they stay one group per
 * (direction, counterparty, list, printing) and keep their existing one-row look.
 * @returns One group per row in the list, in first-seen order.
 */
export function groupTradeMatches(rows: DirectedMatch[]): MatchTradeGroup[] {
  const groups = new Map<string, MatchTradeGroup>();
  for (const row of rows) {
    const key =
      row.buyEntryKind === "card"
        ? `card\0${row.direction}\0${row.counterpartyUserId}\0${row.buyEntryId}`
        : `printing\0${row.direction}\0${row.counterpartyUserId}\0${row.buyEntryId}\0${row.counterpartyListId}\0${row.printingId}`;
    const existing = groups.get(key);
    if (existing) {
      existing.variants.push(row);
      existing.totalAvailable += row.availableCount;
    } else {
      groups.set(key, {
        foldId: key,
        direction: row.direction,
        cardName: row.cardName,
        cardSlug: row.cardSlug,
        imageId: row.imageId,
        buyEntryKind: row.buyEntryKind,
        buyQuantity: row.buyQuantity,
        counterpartyUserId: row.counterpartyUserId,
        counterpartyName: row.counterpartyName,
        counterpartyImage: row.counterpartyImage,
        counterpartyGravatarHash: row.counterpartyGravatarHash,
        totalAvailable: row.availableCount,
        variants: [row],
      });
    }
  }
  return [...groups.values()];
}

/**
 * A collapsed stand-in for several variant rows of the same card. Shows the card
 * once with a "N variants" summary; expanding reveals the individual priced rows.
 * Each group subscribes to only its own fold key so toggling one doesn't
 * re-render the rest of the list.
 * @returns The expandable group element.
 */
function MatchTradeRowGroup({
  group,
  groupSlug,
  infosByPrinting,
  showCounterparty,
}: {
  group: MatchTradeGroup;
  groupSlug: string;
  infosByPrinting: Record<string, Record<Marketplace, MarketplaceInfo>>;
  showCounterparty: boolean;
}) {
  const expanded = useMatchVariantsFoldStore((state) => state.expanded.has(group.foldId));
  const toggle = useMatchVariantsFoldStore((state) => state.toggle);
  const incoming = group.direction === "incoming";
  const DirectionIcon = incoming ? ArrowDownLeftIcon : ArrowUpRightIcon;

  return (
    <div className="bg-card rounded-md border">
      <div className="flex items-center gap-3 p-2">
        <button
          type="button"
          onClick={() => toggle(group.foldId)}
          aria-expanded={expanded}
          className="hover:text-foreground flex min-w-0 flex-1 items-center gap-3 text-left transition-colors"
        >
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

          <span className="bg-muted relative aspect-[5/7] w-10 shrink-0 overflow-hidden rounded">
            {group.imageId ? (
              <img
                src={imageUrl(group.imageId, "120w")}
                alt={group.cardName}
                className="size-full object-cover"
                loading="lazy"
              />
            ) : null}
          </span>

          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate font-medium">
              {group.buyQuantity}× {group.cardName}
            </span>
            <span className="text-muted-foreground text-xs">
              {group.variants.length} variants · ×{group.totalAvailable} available
            </span>
          </span>

          <ChevronDownIcon
            className={cn(
              "text-muted-foreground size-4 shrink-0 transition-transform",
              expanded && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>

        {showCounterparty ? (
          <Link
            to="/groups/$slug/members/$userId"
            params={{ slug: groupSlug, userId: group.counterpartyUserId }}
            className="hover:bg-muted/60 flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1"
          >
            <UserAvatar
              image={group.counterpartyImage}
              name={group.counterpartyName}
              gravatarHash={group.counterpartyGravatarHash}
              size="sm"
            />
            <span className="hidden text-sm sm:inline">{group.counterpartyName ?? "Member"}</span>
          </Link>
        ) : null}
      </div>

      {expanded ? (
        <div className="flex flex-col gap-2 border-t p-2">
          {group.variants.map((variant) => (
            <MatchRow
              key={`${variant.counterpartyListId}\0${variant.printingId}`}
              match={variant}
              groupSlug={groupSlug}
              marketplaceInfos={infosByPrinting[variant.printingId] ?? null}
              showCounterparty={false}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
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
  const groups = groupTradeMatches([...incomingRows, ...outgoingRows]);
  const infosByPrinting = marketplaceInfo?.infos ?? {};

  return (
    <div className="flex flex-col gap-2">
      {groups.map((group) =>
        group.variants.length > 1 ? (
          <MatchTradeRowGroup
            key={group.foldId}
            group={group}
            groupSlug={groupSlug}
            infosByPrinting={infosByPrinting}
            showCounterparty={showCounterparty}
          />
        ) : (
          <MatchRow
            key={group.foldId}
            match={group.variants[0]}
            groupSlug={groupSlug}
            marketplaceInfos={infosByPrinting[group.variants[0].printingId] ?? null}
            showCounterparty={showCounterparty}
          />
        ),
      )}
    </div>
  );
}
