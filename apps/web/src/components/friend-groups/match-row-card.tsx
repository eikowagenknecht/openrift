import type {
  CardTradeResponse,
  CardTradeStatus,
  FriendGroupMatchRow,
  Marketplace,
  MarketplaceInfo,
} from "@openrift/shared";
import { imageUrl } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ArrowDownLeftIcon, ArrowUpRightIcon, ChevronDownIcon } from "lucide-react";
import { useState } from "react";

import { FinishIcon } from "@/components/cards/finish-icon";
import { MatchPreferenceCell } from "@/components/trade-preferences/match-preference-cell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import {
  useAcceptTrade,
  useCreateTrade,
  useDeclineTrade,
  useUserTrades,
} from "@/hooks/use-card-trades";
import { useCards } from "@/hooks/use-cards";
import { useEnumOrders } from "@/hooks/use-enums";
import { useMarketplaceInfo } from "@/hooks/use-marketplace-info";
import { getFilterIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useMatchVariantsFoldStore } from "@/stores/match-variants-fold-store";

import { RequestTradeDialog } from "./request-trade-dialog";

/**
 * Key into the live-trade lookup: the other member + the exact printing.
 * @returns The composite lookup key.
 */
function liveTradeKey(counterpartyUserId: string, printingId: string): string {
  return `${counterpartyUserId}\0${printingId}`;
}

/**
 * The per-row trade action. When a live trade already exists between the two of
 * you for this printing: if it's awaiting your response, show Accept/Decline
 * inline; otherwise show its status. With no live trade, show Request/Offer.
 * @returns The action element.
 */
function MatchRowTradeAction({
  match,
  groupSlug,
  liveTrade,
}: {
  match: DirectedMatch;
  groupSlug: string;
  liveTrade?: CardTradeResponse;
}) {
  const [open, setOpen] = useState(false);
  const createTrade = useCreateTrade();
  const acceptTrade = useAcceptTrade();
  const declineTrade = useDeclineTrade();

  if (liveTrade !== undefined) {
    // A request/offer awaiting the viewer — let them act without leaving the tab.
    if (liveTrade.actionNeeded === "accept-or-decline") {
      const busy = acceptTrade.isPending || declineTrade.isPending;
      const args = { tradeId: liveTrade.id, groupSlug };
      return (
        <div className="flex shrink-0 items-center gap-1.5">
          <Button size="sm" disabled={busy} onClick={() => acceptTrade.mutate(args)}>
            Accept
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => declineTrade.mutate(args)}
          >
            Decline
          </Button>
        </div>
      );
    }
    // Your own pending request awaiting them, or a reserved trade.
    return (
      <Badge variant="secondary" className="shrink-0">
        {liveTrade.status === "reserved" ? "Reserved" : "Pending"}
      </Badge>
    );
  }

  const incoming = match.direction === "incoming";
  const role = incoming ? "receiver" : "giver";

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0"
        disabled={createTrade.isPending || match.availableCount <= 0}
        onClick={() => setOpen(true)}
      >
        {incoming ? "Request" : "Offer"}
      </Button>
      <RequestTradeDialog
        open={open}
        onOpenChange={setOpen}
        mode={incoming ? "request" : "offer"}
        cardName={match.cardName}
        availableCount={match.availableCount}
        demandQuantity={match.buyQuantity}
        pending={createTrade.isPending}
        onConfirm={(quantity) => {
          createTrade.mutate(
            {
              groupSlug,
              counterpartyUserId: match.counterpartyUserId,
              role,
              printingId: match.printingId,
              quantity,
            },
            { onSuccess: () => setOpen(false) },
          );
        }}
      />
    </>
  );
}

// Lightweight per-cell renderer for the matches panel. Doesn't go through
// the full <CardCell> pipeline because match rows already carry enough
// per-card info (cardId, printingId, imageId, name) and the catalog-grade
// CardCell needs a full Printing object we'd have to synthesize. Wiring
// CardCell is a follow-up when the matches panel needs siblings / chevrons.
interface ResolvedMatchRow extends FriendGroupMatchRow {
  cardSlug: string;
  shortCode: string;
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
  printingsById: ReturnType<typeof useCards>["printingsById"],
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
      shortCode: printingsById[row.printingId]?.shortCode ?? "",
      setName: set?.name ?? row.setId,
      rarityLabel: labels.rarities[row.rarity] ?? row.rarity,
      finishLabel: labels.finishes[row.finish] ?? row.finish,
    };
  });
}

/**
 * The compact metadata line for a match row: shortcode, rarity icon, finish icon,
 * and the available count. The shortcode already encodes the set, so the set
 * name is dropped; rarity and finish render as icons rather than words.
 * @returns The metadata line element.
 */
function MatchRowMeta({ match }: { match: AggregatedMatch }) {
  const rarityIcon = getFilterIconPath("rarities", match.rarity);
  return (
    <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
      <span className="font-medium">{match.shortCode}</span>
      {rarityIcon ? (
        <img
          src={rarityIcon}
          alt={match.rarityLabel}
          title={match.rarityLabel}
          width={28}
          height={28}
          className="size-3.5"
        />
      ) : null}
      <FinishIcon finish={match.finish} title={match.finishLabel} />
      <span>· ×{match.availableCount} available</span>
    </span>
  );
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
            {match.buyQuantity}× {match.cardName}
          </span>
          <MatchRowMeta match={match} />
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
  liveTrade,
}: {
  match: DirectedMatch;
  groupSlug: string;
  marketplaceInfos: Record<Marketplace, MarketplaceInfo> | null;
  /** When false (member-detail page), the counterparty is fixed, so the chip is hidden. */
  showCounterparty: boolean;
  /** An existing live trade for this (counterparty, printing), if any. */
  liveTrade?: CardTradeResponse;
}) {
  const incoming = match.direction === "incoming";
  const DirectionIcon = incoming ? ArrowDownLeftIcon : ArrowUpRightIcon;
  // sellPref is always the seller's side, buyPref the buyer's. When the card
  // comes to you the counterparty is the seller (sellPref = their ask); when it
  // goes to them they're the buyer (buyPref = their offer).
  const counterpartyPref = incoming ? match.sellPref : match.buyPref;
  const priceLabel = incoming ? "They want" : "They'd pay";
  // Hide the price cell entirely when the counterparty has no preference set —
  // a bare "They want · Not set" just clutters the row.
  const hasCounterpartyPref =
    counterpartyPref.pricePref !== null || counterpartyPref.tradeType !== null;

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
        <span className="truncate font-medium">
          {match.buyQuantity}× {match.cardName}
        </span>
        <MatchRowMeta match={match} />
      </div>

      {hasCounterpartyPref ? (
        <div className="w-32 shrink-0 text-right">
          <MatchPreferenceCell
            label={priceLabel}
            pref={counterpartyPref}
            marketplaceInfos={marketplaceInfos}
            searchQuery={match.cardName}
          />
        </div>
      ) : null}

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

      <MatchRowTradeAction match={match} groupSlug={groupSlug} liveTrade={liveTrade} />
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
  liveTradeByKey,
}: {
  group: MatchTradeGroup;
  groupSlug: string;
  infosByPrinting: Record<string, Record<Marketplace, MarketplaceInfo>>;
  showCounterparty: boolean;
  liveTradeByKey: Map<string, CardTradeResponse>;
}) {
  const expanded = useMatchVariantsFoldStore((state) => state.expanded.has(group.foldId));
  const toggle = useMatchVariantsFoldStore((state) => state.toggle);
  const incoming = group.direction === "incoming";
  const DirectionIcon = incoming ? ArrowDownLeftIcon : ArrowUpRightIcon;

  // Surface live-trade activity on the collapsed header (a specific variant's
  // accept/decline still lives on the expanded row). Reserved outranks pending.
  const variantStatuses = group.variants.map(
    (variant) =>
      liveTradeByKey.get(liveTradeKey(variant.counterpartyUserId, variant.printingId))?.status,
  );
  const headerStatus: CardTradeStatus | null = variantStatuses.includes("reserved")
    ? "reserved"
    : variantStatuses.includes("pending")
      ? "pending"
      : null;

  return (
    <div className="bg-card overflow-hidden rounded-md border">
      <div className="hover:bg-muted flex items-center gap-3 p-2 transition-colors">
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

        {headerStatus ? (
          <Badge variant="secondary" className="shrink-0">
            {headerStatus === "reserved" ? "Reserved" : "Pending"}
          </Badge>
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
              liveTrade={liveTradeByKey.get(
                liveTradeKey(variant.counterpartyUserId, variant.printingId),
              )}
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
  const { cardsById, printingsById, sets } = useCards();
  const { labels } = useEnumOrders();
  const { data: userTrades } = useUserTrades();

  // Lookup of the viewer's live trades in THIS group, so a matched row can show
  // accept/decline (when awaiting the viewer) or its status inline instead of a
  // Request/Offer button.
  const liveTradeByKey = new Map<string, CardTradeResponse>();
  for (const trade of userTrades?.items ?? []) {
    if (
      trade.groupSlug === groupSlug &&
      (trade.status === "pending" || trade.status === "reserved")
    ) {
      liveTradeByKey.set(liveTradeKey(trade.counterparty.userId, trade.printingId), trade);
    }
  }

  const printingIds = [...new Set([...incoming, ...outgoing].map((row) => row.printingId))];
  const { data: marketplaceInfo } = useMarketplaceInfo(printingIds);

  const incomingRows = aggregateMatches(
    resolveMatchRows(incoming, cardsById, printingsById, sets, labels),
  ).map((match): DirectedMatch => ({ ...match, direction: "incoming" }));
  const outgoingRows = aggregateMatches(
    resolveMatchRows(outgoing, cardsById, printingsById, sets, labels),
  ).map((match): DirectedMatch => ({ ...match, direction: "outgoing" }));
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
            liveTradeByKey={liveTradeByKey}
          />
        ) : (
          <MatchRow
            key={group.foldId}
            match={group.variants[0]}
            groupSlug={groupSlug}
            marketplaceInfos={infosByPrinting[group.variants[0].printingId] ?? null}
            showCounterparty={showCounterparty}
            liveTrade={liveTradeByKey.get(
              liveTradeKey(group.variants[0].counterpartyUserId, group.variants[0].printingId),
            )}
          />
        ),
      )}
    </div>
  );
}
