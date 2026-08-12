import type {
  CardTradeResponse,
  CardTradeStatus,
  FriendGroupMatchRow,
  Marketplace,
  MarketplaceInfo,
  Printing,
} from "@openrift/shared";
import { legendDisplayName, setIndexById, UNKNOWN_SET_INDEX } from "@openrift/shared";
import { useRef, useState } from "react";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { CardDetailNameButton } from "@/components/cards/card-detail-opener";
import { PrintingHoverPreview } from "@/components/cards/printing-hover-preview";
import { MatchPreferenceCell } from "@/components/trade-preferences/match-preference-cell";
import { Button } from "@/components/ui/button";
import { ExpandToggle } from "@/components/ui/expand-toggle";
import { Pressable } from "@/components/ui/pressable";
import { useCreateTrade, useDeclineTrade, useUserTrades } from "@/hooks/use-card-trades";
import { useCards } from "@/hooks/use-cards";
import { useEnumOrders } from "@/hooks/use-enums";
import { useMarketplaceInfo } from "@/hooks/use-marketplace-info";
import { useMouseHover } from "@/hooks/use-mouse-hover";
import { usePrices } from "@/hooks/use-prices";
import type { CatalogPosition } from "@/lib/catalog-position";
import { compareCatalogPosition } from "@/lib/catalog-position";
import { compactFormatterForMarketplace, priceColorClass } from "@/lib/format";
import type { MatchCopyDetail, MatchDirection } from "@/lib/trade-derivation";
import {
  describeViewerSource,
  matchCopyConditionLabel,
  matchSuggestionKey,
  maxTradeQuantity,
  summarizeMatchCopies,
} from "@/lib/trade-derivation";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";
import { useMatchVariantsFoldStore } from "@/stores/match-variants-fold-store";

import { RequestTradeDialog } from "./request-trade-dialog";
import { TradeCopyPickerDialog, useTradeAcceptFlow } from "./trade-copy-picker-dialog";
import {
  CardMetaLine,
  TradeDirectionIcon,
  TradePerCopyPrice,
  TradeStatusBadge,
} from "./trade-row-parts";

// Receive-first, give-second: incoming rows sort ahead of outgoing ones, then
// each direction is ordered by catalog position (set, then card number).
const DIRECTION_ORDER: Record<MatchDirection, number> = { incoming: 0, outgoing: 1 };

/**
 * A match row, optionally tagged with the friend group it came from. The trade
 * sheet pools rows from every group the two people share, so it tags each one;
 * a row that carries no tag falls back to the list's own `groupSlug`.
 */
export type MatchTradeListRow = FriendGroupMatchRow & { groupSlug?: string };

/**
 * Key into the live-trade lookup: the group, the other member and the exact
 * printing. The group is part of the key because a list can span several of
 * them, where the same member and printing may be in flight in more than one.
 * @returns The composite lookup key.
 */
function liveTradeKey(groupSlug: string, counterpartyUserId: string, printingId: string): string {
  return `${groupSlug}\0${counterpartyUserId}\0${printingId}`;
}

/**
 * The per-row trade action. When a live trade already exists between the two of
 * you for this printing: if it's awaiting your response, show Accept/Decline
 * inline; otherwise show its status. With no live trade, show Request/Offer.
 * The trade is created in the row's own group, which on a mixed list is not
 * necessarily the one the list was opened from.
 * @returns The action element.
 */
function MatchRowTradeAction({
  match,
  liveTrade,
}: {
  match: DirectedMatch;
  liveTrade?: CardTradeResponse;
}) {
  const [open, setOpen] = useState(false);
  const createTrade = useCreateTrade();
  const acceptFlow = useTradeAcceptFlow();
  const declineTrade = useDeclineTrade();

  const groupSlug = match.groupSlug;

  if (liveTrade !== undefined) {
    // A request/offer awaiting the viewer — let them act without leaving the tab.
    if (liveTrade.actionNeeded === "accept-or-decline") {
      const busy = acceptFlow.busy || declineTrade.isPending;
      return (
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => declineTrade.mutate({ tradeId: liveTrade.id, groupSlug })}
          >
            Decline
          </Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              acceptFlow.start({
                tradeId: liveTrade.id,
                groupSlug,
                role: liveTrade.role,
                cardName: match.cardName,
              })
            }
          >
            Accept
          </Button>
          <TradeCopyPickerDialog flow={acceptFlow} />
        </div>
      );
    }
    // Your own pending request awaiting them, or a reserved trade. The page this
    // list sits on is already about one member, so the badge stays anonymous:
    // "Waiting for them".
    return <TradeStatusBadge status={liveTrade.status} />;
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
  /** The friend group this row belongs to, resolved from the row or the list. */
  groupSlug: string;
  cardSlug: string;
  shortCode: string;
  /** The set's position in catalog order; {@link UNKNOWN_SET_INDEX} when unknown. */
  setIndex: number;
  setName: string;
  rarityLabel: string;
  finishLabel: string;
  /** The card's domains, used to tint the art-less thumbnail placeholder. */
  domains: string[];
  /** The full catalog printing, for the hover preview. Null when unknown. */
  printing: Printing | null;
}

/**
 * One tile = one (counterparty, wish entry, printing). N copies of the same
 * printing collapse into one tile with an `availableCount`; each copy's
 * recorded metadata (condition, public note — ADR-038) is kept in `copies` so
 * the tile can summarize what the counterparty would actually get.
 */
export interface AggregatedMatch extends ResolvedMatchRow {
  availableCount: number;
  /** Per-copy recorded metadata across the aggregated copies, in row order. */
  copies: MatchCopyDetail[];
}

interface DirectedMatch extends AggregatedMatch {
  direction: MatchDirection;
}

/**
 * Resolves UUID set IDs and rarity/finish slugs to display names via the
 * catalog so row metadata doesn't leak raw IDs, and pins each row to the group
 * it belongs to (its own, or the list's when it carries none).
 * @returns The rows with catalog-resolved display fields.
 */
function resolveMatchRows(
  rows: MatchTradeListRow[],
  cardsById: ReturnType<typeof useCards>["cardsById"],
  printingsById: ReturnType<typeof useCards>["printingsById"],
  sets: ReturnType<typeof useCards>["sets"],
  labels: ReturnType<typeof useEnumOrders>["labels"],
  fallbackGroupSlug: string,
): ResolvedMatchRow[] {
  const setsById = new Map(sets.map((set) => [set.id, set]));
  const setIndexes = setIndexById(sets);
  return rows.map((row) => {
    const card = cardsById[row.cardId];
    const set = setsById.get(row.setId);
    const printing = printingsById[row.printingId] ?? null;
    return {
      ...row,
      groupSlug: row.groupSlug ?? fallbackGroupSlug,
      cardName: card ? legendDisplayName(card) : row.cardName,
      cardSlug: card?.slug ?? row.cardId,
      shortCode: printing?.shortCode ?? "",
      setIndex: setIndexes.get(row.setId) ?? UNKNOWN_SET_INDEX,
      setName: set?.name ?? row.setId,
      rarityLabel: labels.rarities[row.rarity],
      finishLabel: labels.finishes[row.finish],
      domains: card?.domains ?? [],
      printing,
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
 * The offered copies' recorded metadata (ADR-038): a condition/grade summary
 * ("Near Mint ×2 · PSA 9") and the sellers' public notes, so the counterparty
 * sees what they'd actually get before requesting. Renders nothing when no
 * aggregated copy records either — the common all-unrecorded stack stays quiet.
 * @returns The copy-metadata line, or null.
 */
function MatchCopyMetadataLine({ match }: { match: AggregatedMatch }) {
  const { labels } = useEnumOrders();
  const { conditions, notes } = summarizeMatchCopies(match.copies, (copy) =>
    matchCopyConditionLabel(copy, labels),
  );
  if (conditions === null && notes.length === 0) {
    return null;
  }
  const noteText = notes.map((note) => `“${note}”`).join(" · ");
  const text = [conditions, noteText].filter((part) => part !== null && part !== "").join(" · ");
  return (
    <span className="text-muted-foreground truncate text-xs" title={text}>
      {text}
    </span>
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
  marketplaceInfos,
  liveTrade,
}: {
  match: DirectedMatch;
  marketplaceInfos: Record<Marketplace, MarketplaceInfo> | null;
  /** An existing live trade for this (counterparty, printing), if any. */
  liveTrade?: CardTradeResponse;
}) {
  const incoming = match.direction === "incoming";
  // Large card preview beside the row on hover, anchored to the row so it floats
  // out to whichever side has room — the same interaction as the deck builder's
  // list. Mouse-only via useMouseHover: iOS Safari synthesizes hover on a tap,
  // which otherwise opened this 400px portal over most of the phone screen with
  // nothing to dismiss it.
  const rowRef = useRef<HTMLDivElement>(null);
  const { hovering: previewing, hoverProps } = useMouseHover();
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
    // A suggestion (an opportunity), not a started trade: dashed border + a
    // washed muted fill, versus the solid ring-carrying bg-card rows of trades
    // the viewer has actually started. The wash reads as "not yet real" even
    // when the two kinds of row sit in the same column on the trade sheet.
    // On phones the row stacks: the card identity (with price hint + member
    // chip) sits on top, and the action drops to its own right-aligned bar
    // below. From sm up both groups dissolve (sm:contents) back into one row.
    <div
      ref={rowRef}
      {...hoverProps}
      className="group bg-muted/30 hover:bg-muted flex flex-col gap-2 rounded-md border border-dashed p-2 transition-colors sm:flex-row sm:items-center sm:gap-3"
    >
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
          <CardDetailNameButton
            // Only the resolved catalog printing can be shown, so an unknown
            // one keeps the name as plain text rather than a dead control.
            printingId={match.printing ? match.printingId : undefined}
            className="max-w-full self-start truncate font-medium"
          >
            {match.cardName}
          </CardDetailNameButton>
          <MatchRowMeta match={match} />
          <MatchCopyMetadataLine match={match} />
          <MatchSourceLine direction={match.direction} listNames={[match.viewerListName]} />
        </div>
      </div>

      {/* Deal footer: on phones a second row that carries the price on the left
          and the action on the right, so nothing crams onto the identity line.
          The price keeps its own wrapper so the action stays pinned right even
          when there is no price to show. From sm up both wrappers dissolve
          (sm:contents) back into the single inline row. */}
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
        </div>

        <MatchRowTradeAction match={match} liveTrade={liveTrade} />
      </div>

      {previewing && match.printing ? (
        <PrintingHoverPreview printing={match.printing} anchorRef={rowRef} />
      ) : null}
    </div>
  );
}

/**
 * Collapse rows with the same `(groupSlug, buyEntryId, counterpartyListId,
 * printingId)` into one tile so that 100 copies of the same printing in the
 * same source list no longer render 100 cells. Different counterparty lists
 * (e.g. "Spare Foils" vs "Sell Pile") with the same printing stay separate
 * tiles so the source list is visible. The group is part of the key so that on
 * a list spanning several groups a tile is never a mix of them — a trade
 * created from it has one unambiguous group.
 * @returns One aggregated match per unique (groupSlug, buyEntryId, counterpartyListId, printingId) tuple.
 */
function aggregateMatches(rows: ResolvedMatchRow[]): AggregatedMatch[] {
  const aggregated = new Map<string, AggregatedMatch>();
  for (const row of rows) {
    const key = `${row.groupSlug}\0${row.buyEntryId}\0${row.counterpartyListId}\0${row.printingId}`;
    const copy: MatchCopyDetail = {
      condition: row.condition,
      grader: row.grader,
      grade: row.grade,
      notesPublic: row.notesPublic,
    };
    const existing = aggregated.get(key);
    if (existing) {
      existing.availableCount += 1;
      existing.copies.push(copy);
    } else {
      aggregated.set(key, { ...row, availableCount: 1, copies: [copy] });
    }
  }
  return [...aggregated.values()];
}

export interface MatchTradeGroup extends CatalogPosition {
  /** Stable, per-counterparty key used both as the React key and the fold-store id. */
  foldId: string;
  /** The friend group every variant in this group belongs to. */
  groupSlug: string;
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
 * Rows from different friend groups never merge, even when everything else
 * about them matches, so a trade started from a group has one group to go to.
 *
 * Variants are ordered by catalog position, and each group takes the position of
 * its earliest one, so a card-level wish sorts with the first printing it can be
 * filled from rather than with whichever one the match query happened to find
 * first.
 * @returns One group per row in the list, in first-seen order.
 */
export function groupTradeMatches(rows: DirectedMatch[]): MatchTradeGroup[] {
  const groups = new Map<string, MatchTradeGroup>();
  for (const row of rows) {
    const key = `${row.groupSlug}\0${matchSuggestionKey(row.direction, row)}`;
    const existing = groups.get(key);
    if (existing) {
      existing.variants.push(row);
      existing.totalAvailable += row.availableCount;
    } else {
      groups.set(key, {
        foldId: key,
        groupSlug: row.groupSlug,
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
        // Provisional: rewritten from the earliest variant once they're sorted.
        setIndex: row.setIndex,
        shortCode: row.shortCode,
        totalAvailable: row.availableCount,
        variants: [row],
      });
    }
  }
  for (const group of groups.values()) {
    group.variants.sort(compareCatalogPosition);
    group.setIndex = group.variants[0].setIndex;
    group.shortCode = group.variants[0].shortCode;
  }
  return [...groups.values()];
}

/**
 * Suggestion order: everything the viewer would receive first, then everything
 * they'd give, each direction in catalog order (set, then card number). Two
 * printings that share a position — a card with no catalog printing, so no short
 * code — fall back to the card name.
 * @returns Negative when `a` comes first, positive when `b` does, 0 when equal.
 */
export function compareMatchTradeGroups(a: MatchTradeGroup, b: MatchTradeGroup): number {
  return (
    DIRECTION_ORDER[a.direction] - DIRECTION_ORDER[b.direction] ||
    compareCatalogPosition(a, b) ||
    a.cardName.localeCompare(b.cardName)
  );
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
  infosByPrinting,
  liveTradeByKey,
}: {
  group: MatchTradeGroup;
  infosByPrinting: Record<string, Record<Marketplace, MarketplaceInfo>>;
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
      liveTradeByKey.get(
        liveTradeKey(variant.groupSlug, variant.counterpartyUserId, variant.printingId),
      )?.status,
  );
  const headerStatus: CardTradeStatus | null = variantStatuses.includes("reserved")
    ? "reserved"
    : variantStatuses.includes("pending")
      ? "pending"
      : null;

  return (
    // Suggestion group: dashed border + washed muted fill, matching MatchRow.
    <div className="bg-muted/30 overflow-hidden rounded-md border border-dashed">
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

        {headerStatus ? (
          // The status badge sits on its own row on phones; from sm up it
          // dissolves back into the header row (before the chevron, which is
          // pinned last via sm:order-last).
          <div className="flex flex-wrap items-center gap-2 sm:contents">
            <TradeStatusBadge status={headerStatus} className="min-w-0 shrink" />
          </div>
        ) : null}
      </div>

      {expanded ? (
        <div className="flex flex-col gap-2 border-t p-2">
          {group.variants.map((variant) => (
            <MatchRow
              key={`${variant.counterpartyListId}\0${variant.printingId}`}
              match={variant}
              marketplaceInfos={infosByPrinting[variant.printingId] ?? null}
              liveTrade={liveTradeByKey.get(
                liveTradeKey(variant.groupSlug, variant.counterpartyUserId, variant.printingId),
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Renders one suggestion group as the collapsed multi-variant card when a
 * card-level wish spans several printings, or a single wide row otherwise.
 * @returns The suggestion element.
 */
function MatchGroupItem({
  group,
  infosByPrinting,
  liveTradeByKey,
}: {
  group: MatchTradeGroup;
  infosByPrinting: Record<string, Record<Marketplace, MarketplaceInfo>>;
  liveTradeByKey: Map<string, CardTradeResponse>;
}) {
  if (group.variants.length > 1) {
    return (
      <MatchTradeRowGroup
        group={group}
        infosByPrinting={infosByPrinting}
        liveTradeByKey={liveTradeByKey}
      />
    );
  }
  const variant = group.variants[0];
  return (
    <MatchRow
      match={variant}
      marketplaceInfos={infosByPrinting[variant.printingId] ?? null}
      liveTrade={liveTradeByKey.get(
        liveTradeKey(variant.groupSlug, variant.counterpartyUserId, variant.printingId),
      )}
    />
  );
}

interface MatchTradeListProps {
  /** Rows where a member has a card you want (the card flows to you). */
  incoming: MatchTradeListRow[];
  /** Rows where a member wants a card you have (the card flows to them). */
  outgoing: MatchTradeListRow[];
  /** The group a row belongs to when it doesn't name one of its own. */
  groupSlug: string;
}

/**
 * The suggestions list on a person's trade sheet: a flat list of wide rows,
 * everything you'd receive first, then everything you'd give. The whole list is
 * one member already, so no row names them.
 * @returns The list of match rows.
 */
/**
 * Whether "Request all" can fire this suggestion unattended: an incoming,
 * single-printing group with copies actually available. A card-level wish
 * spanning several printings needs the human to pick one, so it stays out.
 * @param group The aggregated suggestion group.
 * @returns True when "Request all" can fire this suggestion unattended.
 */
function isBulkRequestable(group: MatchTradeGroup): boolean {
  return (
    group.direction === "incoming" &&
    group.variants.length === 1 &&
    maxTradeQuantity(group.buyQuantity, group.totalAvailable) > 0
  );
}

/**
 * One press to request every unambiguous incoming suggestion in the list. Each
 * request is created in its own group's context, so on a trade sheet spanning
 * several shared groups the trades land where their source lists live. Only
 * offered from two requestable rows up — a single row's own button is enough.
 * @returns The right-aligned bulk row, or null.
 */
function BulkRequestRow({ groups }: { groups: MatchTradeGroup[] }) {
  const createTrade = useCreateTrade();
  const requestable = groups.filter((group) => isBulkRequestable(group));
  if (requestable.length < 2) {
    return null;
  }

  function requestAll(): void {
    for (const group of requestable) {
      const variant = group.variants[0];
      createTrade.mutate({
        groupSlug: group.groupSlug,
        counterpartyUserId: variant.counterpartyUserId,
        role: "receiver",
        printingId: variant.printingId,
        quantity: maxTradeQuantity(group.buyQuantity, group.totalAvailable),
      });
    }
  }

  return (
    <div className="flex items-center justify-end">
      <Button size="sm" variant="outline" onClick={requestAll}>
        Request all ({requestable.length})
      </Button>
    </div>
  );
}

export function MatchTradeList({ incoming, outgoing, groupSlug }: MatchTradeListProps) {
  const { cardsById, printingsById, sets } = useCards();
  const { labels } = useEnumOrders();
  const { data: userTrades } = useUserTrades();

  // Lookup of the viewer's live trades in the groups this list covers, so a
  // matched row can show accept/decline (when awaiting the viewer) or its status
  // inline instead of a Request/Offer button. A list is usually one group, but
  // rows may name their own, so every group present is allowed through.
  const listGroupSlugs = new Set<string>([groupSlug]);
  for (const row of [...incoming, ...outgoing]) {
    if (row.groupSlug !== undefined) {
      listGroupSlugs.add(row.groupSlug);
    }
  }
  const liveTradeByKey = new Map<string, CardTradeResponse>();
  for (const trade of userTrades?.items ?? []) {
    if (
      listGroupSlugs.has(trade.groupSlug) &&
      (trade.status === "pending" || trade.status === "reserved")
    ) {
      liveTradeByKey.set(
        liveTradeKey(trade.groupSlug, trade.counterparty.userId, trade.printingId),
        trade,
      );
    }
  }

  const printingIds = [...new Set([...incoming, ...outgoing].map((row) => row.printingId))];
  const { data: marketplaceInfo } = useMarketplaceInfo(printingIds);

  const incomingRows = aggregateMatches(
    resolveMatchRows(incoming, cardsById, printingsById, sets, labels, groupSlug),
  ).map((match): DirectedMatch => ({ ...match, direction: "incoming" }));
  const outgoingRows = aggregateMatches(
    resolveMatchRows(outgoing, cardsById, printingsById, sets, labels, groupSlug),
  ).map((match): DirectedMatch => ({ ...match, direction: "outgoing" }));
  // Keep the "everything you'd receive, then everything you'd give" split, but
  // order each direction the way the catalog does — set first, then card number
  // — so the list matches how the same cards read in the browsers and in a
  // binder, instead of following match-discovery order.
  const groups = groupTradeMatches([...incomingRows, ...outgoingRows]).toSorted(
    compareMatchTradeGroups,
  );
  const infosByPrinting = marketplaceInfo?.infos ?? {};

  return (
    <div className="flex flex-col gap-2">
      <BulkRequestRow groups={groups} />
      {groups.map((group) => (
        <MatchGroupItem
          key={group.foldId}
          group={group}
          infosByPrinting={infosByPrinting}
          liveTradeByKey={liveTradeByKey}
        />
      ))}
    </div>
  );
}
