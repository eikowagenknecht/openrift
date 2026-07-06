import type {
  CardTradeResponse,
  CardTradeStatus,
  FriendGroupMatchRow,
  Marketplace,
  MarketplaceInfo,
} from "@openrift/shared";
import { legendDisplayName } from "@openrift/shared";
import { useState } from "react";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { MatchPreferenceCell } from "@/components/trade-preferences/match-preference-cell";
import { Button } from "@/components/ui/button";
import { ExpandToggle } from "@/components/ui/expand-toggle";
import { Pressable } from "@/components/ui/pressable";
import {
  useAcceptTrade,
  useCreateTrade,
  useDeclineTrade,
  useUserTrades,
} from "@/hooks/use-card-trades";
import { useCards } from "@/hooks/use-cards";
import { useEnumOrders } from "@/hooks/use-enums";
import { useMarketplaceInfo } from "@/hooks/use-marketplace-info";
import { usePrices } from "@/hooks/use-prices";
import { compactFormatterForMarketplace, priceColorClass } from "@/lib/format";
import type { MatchDirection } from "@/lib/trade-derivation";
import { describeViewerSource, matchSuggestionKey } from "@/lib/trade-derivation";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";
import { useMatchVariantsFoldStore } from "@/stores/match-variants-fold-store";

import { RequestTradeDialog } from "./request-trade-dialog";
import {
  CardMetaLine,
  CounterpartyChip,
  TradeDirectionIcon,
  TradePerCopyPrice,
  TradeStatusBadge,
} from "./trade-row-parts";

// Receive-first, give-second: incoming rows sort ahead of outgoing ones, then
// each direction is ordered by card name.
const DIRECTION_ORDER: Record<MatchDirection, number> = { incoming: 0, outgoing: 1 };

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
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => declineTrade.mutate(args)}
          >
            Decline
          </Button>
          <Button size="sm" disabled={busy} onClick={() => acceptTrade.mutate(args)}>
            Accept
          </Button>
        </div>
      );
    }
    // Your own pending request awaiting them, or a reserved trade.
    return <TradeStatusBadge status={liveTrade.status} counterpartyName={match.counterpartyName} />;
  }

  const incoming = match.direction === "incoming";
  const role = incoming ? "receiver" : "giver";

  return (
    <>
      <Button
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
  /** The card's domains, used to tint the art-less thumbnail placeholder. */
  domains: string[];
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
      cardName: card ? legendDisplayName(card) : row.cardName,
      cardSlug: card?.slug ?? row.cardId,
      shortCode: printingsById[row.printingId]?.shortCode ?? "",
      setName: set?.name ?? row.setId,
      rarityLabel: labels.rarities[row.rarity] ?? row.rarity,
      finishLabel: labels.finishes[row.finish] ?? row.finish,
      domains: card?.domains ?? [],
    };
  });
}

/**
 * The compact metadata line for a match row: the shared card-detail line plus
 * the wished / available counts and the per-copy price. The counts are kept
 * separate and the price stays per-copy, so a "3 wanted" wish backed by only 1
 * copy never reads as "3 × price". The shortcode already encodes the set, so
 * the set name is dropped; rarity and finish render as icons rather than words.
 * @returns The metadata line element.
 */
function MatchRowMeta({ match }: { match: AggregatedMatch }) {
  return (
    <CardMetaLine
      shortCode={match.shortCode}
      rarity={match.rarity}
      rarityLabel={match.rarityLabel}
      finish={match.finish}
      finishLabel={match.finishLabel}
      trailing={
        <>
          <span>· {match.buyQuantity} wanted</span>
          <span>· {match.availableCount} available</span>
          <TradePerCopyPrice printingId={match.printingId} />
        </>
      }
    />
  );
}

/**
 * A muted line naming which of the viewer's own lists produced the suggestion,
 * so it's clear why the row is here (the viewer's wishlist for an incoming card,
 * their tradelist for an outgoing one). Renders nothing when no list name is known.
 * @returns The source-list line, or null.
 */
function MatchSourceLine({
  direction,
  listNames,
}: {
  direction: MatchDirection;
  listNames: string[];
}) {
  const label = describeViewerSource(direction, listNames);
  if (label === null) {
    return null;
  }
  return <span className="text-muted-foreground truncate text-xs">{label}</span>;
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
  // sellPref is always the seller's side, buyPref the buyer's. When the card
  // comes to you the counterparty is the seller (sellPref = their ask); when it
  // goes to them they're the buyer (buyPref = their offer).
  const counterpartyPref = incoming ? match.sellPref : match.buyPref;
  const priceLabel = incoming ? "Price" : "They'd pay";
  // Hide the price cell entirely when the counterparty has no preference set —
  // a bare "They want · Not set" just clutters the row.
  const hasCounterpartyPref =
    counterpartyPref.pricePref !== null || counterpartyPref.tradeType !== null;

  return (
    // A suggestion (an opportunity), not a started trade: dashed border + no
    // resting fill (an outlined slot that fills on hover), versus the solid,
    // filled bg-card rows of trades the viewer has actually started.
    // On phones the row stacks: the card identity (with price hint + member
    // chip) sits on top, and the action drops to its own right-aligned bar
    // below. From sm up both groups dissolve (sm:contents) back into one row.
    <div className="group hover:bg-muted flex flex-col gap-2 rounded-md border border-dashed p-2 transition-colors sm:flex-row sm:items-center sm:gap-3">
      {/* Identity: on phones its own top row (arrow + art + name/meta); from sm
          up the wrapper dissolves (sm:contents) so it flows into the inline row. */}
      <div className="flex min-w-0 items-center gap-3 sm:contents">
        <TradeDirectionIcon incoming={incoming} />

        <CardArtThumb
          imageId={match.imageId}
          alt={match.cardName}
          rarity={match.rarity}
          domains={match.domains}
          className="w-10"
          loading="lazy"
        />

        <div
          className="flex min-w-0 flex-1 flex-col gap-0.5"
          title={`Their list: ${match.counterpartyListName}`}
        >
          <span className="truncate font-medium">{match.cardName}</span>
          <MatchRowMeta match={match} />
          <MatchSourceLine direction={match.direction} listNames={[match.viewerListName]} />
        </div>
      </div>

      {/* Deal footer: on phones a second row that carries the price + member on
          the left and the action on the right, so nothing crams onto the
          identity line. From sm up this wrapper and the price/member group both
          dissolve (sm:contents) back into the single inline row. */}
      <div className="flex items-center justify-between gap-2 sm:contents">
        <div className="flex min-w-0 items-center gap-2 sm:contents">
          {hasCounterpartyPref ? (
            // On desktop the price only surfaces when the row is highlighted
            // (hover fills the dashed slot), keeping the resting list quiet;
            // opacity (not display) reserves the column so nothing shifts. The
            // column sizes to its content (min-w-32) so the price + accepts line
            // can widen to stay two lines instead of wrapping to a third.
            // Phones have no hover, so it stays visible in the footer.
            <div className="shrink-0 text-right sm:min-w-32 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
              <MatchPreferenceCell
                label={priceLabel}
                pref={counterpartyPref}
                marketplaceInfos={marketplaceInfos}
                searchQuery={match.cardName}
              />
            </div>
          ) : null}

          {showCounterparty ? (
            <CounterpartyChip
              groupSlug={groupSlug}
              userId={match.counterpartyUserId}
              name={match.counterpartyName}
              image={match.counterpartyImage}
              gravatarHash={match.counterpartyGravatarHash}
              // The action slot shows "Waiting for {name}" for a sent-and-pending
              // trade, so the chip drops its name to avoid repeating it.
              hideName={
                liveTrade?.status === "pending" && liveTrade.actionNeeded !== "accept-or-decline"
              }
            />
          ) : null}
        </div>

        <MatchRowTradeAction match={match} groupSlug={groupSlug} liveTrade={liveTrade} />
      </div>
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
  /** Shared across variants (one card-level wish), used to tint the placeholder. */
  domains: string[];
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
    const key = matchSuggestionKey(row.direction, row);
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
        domains: row.domains,
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

  // The collapsed header spans variants with different prices, so it shows the
  // cheapest per-copy price ("from X" when they differ) at the user's favorite
  // marketplace. Per-copy, never times the wished quantity, since a wish can
  // outrun what any one member has available.
  const prices = usePrices();
  const marketplace = useDisplayStore((state) => state.marketplaceOrder[0] ?? "cardtrader");
  const variantPrices = group.variants
    .map((variant) => prices.get(variant.printingId, marketplace))
    .filter((price) => price !== undefined);
  const cheapestUnit = variantPrices.length > 0 ? Math.min(...variantPrices) : undefined;
  const pricesVary =
    variantPrices.length > 0 && Math.min(...variantPrices) !== Math.max(...variantPrices);

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
    // Suggestion group: dashed border + no resting fill, matching MatchRow.
    <div className="overflow-hidden rounded-md border border-dashed">
      <div className="hover:bg-muted flex flex-col gap-2 p-2 transition-colors sm:flex-row sm:items-center sm:gap-3">
        {/* Identity + disclosure share the top row on phones; from sm up the
            wrapper dissolves (sm:contents) and the chevron's sm:order-last drops
            it to the far right, past the member chip and status. */}
        <div className="flex min-w-0 items-center gap-3 sm:contents">
          <Pressable
            onClick={() => toggle(group.foldId)}
            aria-expanded={expanded}
            className="hover:text-foreground flex min-w-0 flex-1 items-center gap-3 transition-colors"
          >
            <TradeDirectionIcon incoming={incoming} />

            <CardArtThumb
              imageId={group.imageId}
              alt={group.cardName}
              domains={group.domains}
              className="w-10"
              loading="lazy"
            />

            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate font-medium">{group.cardName}</span>
              <span className="text-muted-foreground text-xs">
                {group.variants.length} variants · {group.buyQuantity} wanted ·{" "}
                {group.totalAvailable} available
                {cheapestUnit !== undefined && (
                  <>
                    {" · "}
                    {pricesVary ? "from " : ""}
                    <span className={cn("font-medium", priceColorClass(cheapestUnit))}>
                      {compactFormatterForMarketplace(marketplace)(cheapestUnit)}/copy
                    </span>
                  </>
                )}
              </span>
              <MatchSourceLine
                direction={group.direction}
                listNames={group.variants.map((variant) => variant.viewerListName)}
              />
            </span>
          </Pressable>

          <ExpandToggle
            expanded={expanded}
            onClick={() => toggle(group.foldId)}
            aria-label={expanded ? "Collapse variants" : "Expand variants"}
            className="text-muted-foreground hover:text-foreground shrink-0 transition-colors sm:order-last"
            chevronClassName="text-inherit"
          />
        </div>

        {showCounterparty || headerStatus ? (
          // The member chip and status badge sit on their own row on phones;
          // from sm up they dissolve back into the header row (before the
          // chevron, which is pinned last via sm:order-last).
          <div className="flex flex-wrap items-center gap-2 sm:contents">
            {showCounterparty ? (
              <CounterpartyChip
                groupSlug={groupSlug}
                userId={group.counterpartyUserId}
                name={group.counterpartyName}
                image={group.counterpartyImage}
                gravatarHash={group.counterpartyGravatarHash}
                // A pending header status renders "Waiting for {name}", so drop the
                // chip's name to avoid showing it twice.
                hideName={headerStatus === "pending"}
              />
            ) : null}

            {headerStatus ? (
              <TradeStatusBadge status={headerStatus} counterpartyName={group.counterpartyName} />
            ) : null}
          </div>
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
  // Keep the "everything you'd receive, then everything you'd give" split, but
  // order each direction by card name so the list reads alphabetically instead
  // of in match-discovery order.
  const groups = groupTradeMatches([...incomingRows, ...outgoingRows]).toSorted(
    (a, b) =>
      DIRECTION_ORDER[a.direction] - DIRECTION_ORDER[b.direction] ||
      a.cardName.localeCompare(b.cardName),
  );
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
