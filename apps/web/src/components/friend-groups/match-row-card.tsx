import type {
  CardTradeResponse,
  CardTradeStatus,
  FriendGroupMatchRow,
  Marketplace,
  MarketplaceInfo,
  Printing,
} from "@openrift/shared";
import {
  getOrientation,
  legendDisplayName,
  setIndexById,
  UNKNOWN_SET_INDEX,
} from "@openrift/shared";
import { useRef, useState } from "react";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { CardDetailNameButton } from "@/components/cards/card-detail-opener";
import { PrintingHoverPreview } from "@/components/cards/printing-hover-preview";
import { MatchPreferenceCell } from "@/components/trade-preferences/match-preference-cell";
import { Badge } from "@/components/ui/badge";
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
  describeCounterpartySource,
  describeViewerSource,
  matchCopyConditionLabel,
  matchSuggestionKey,
  maxTradeQuantity,
  summarizeMatchCopies,
} from "@/lib/trade-derivation";
import { cn } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";
import { useMatchVariantsFoldStore } from "@/stores/match-variants-fold-store";

import { AvailableCopiesPopover } from "./available-copies-popover";
import { RequestTradeDialog } from "./request-trade-dialog";
import { TradeCopyPickerDialog, useTradeAcceptFlow } from "./trade-copy-picker-dialog";
import {
  CardMetaLine,
  TradeDirectionIcon,
  TradePerCopyPrice,
  TradeStatusBadge,
} from "./trade-row-parts";

const DIRECTION_ORDER: Record<MatchDirection, number> = { incoming: 0, outgoing: 1 };

export type MatchTradeListRow = FriendGroupMatchRow & { groupSlug?: string };

function liveTradeKey(groupSlug: string, counterpartyUserId: string, printingId: string): string {
  return `${groupSlug}\0${counterpartyUserId}\0${printingId}`;
}

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

interface ResolvedMatchRow extends FriendGroupMatchRow {
  groupSlug: string;
  groupLabel?: string;
  cardSlug: string;
  shortCode: string;
  setIndex: number;
  setName: string;
  rarityLabel: string;
  finishLabel: string;
  domains: string[];
  printing: Printing | null;
}

export interface AggregatedMatch extends ResolvedMatchRow {
  availableCount: number;
  copies: MatchCopyDetail[];
}

interface DirectedMatch extends AggregatedMatch {
  direction: MatchDirection;
}

export function resolveMatchRows(
  rows: MatchTradeListRow[],
  cardsById: ReturnType<typeof useCards>["cardsById"],
  printingsById: ReturnType<typeof useCards>["printingsById"],
  sets: ReturnType<typeof useCards>["sets"],
  labels: ReturnType<typeof useEnumOrders>["labels"],
  fallbackGroupSlug: string,
  groupLabels: ReadonlyMap<string, string> | null,
): ResolvedMatchRow[] {
  const setsById = new Map(sets.map((set) => [set.id, set]));
  const setIndexes = setIndexById(sets);
  return rows.map((row) => {
    const card = cardsById[row.cardId];
    const set = setsById.get(row.setId);
    const printing = printingsById[row.printingId] ?? null;
    const groupSlug = row.groupSlug ?? fallbackGroupSlug;
    return {
      ...row,
      groupSlug,
      groupLabel: groupLabels?.get(groupSlug),
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

// Counts stay separate and price stays per-copy: a wished quantity can exceed
// what's available, so it must never read as count times price.
function MatchRowMeta({ match }: { match: DirectedMatch }) {
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
          {match.direction === "outgoing" ? (
            <>
              <span>·</span>
              <AvailableCopiesPopover cardId={match.cardId} availableCount={match.availableCount} />
            </>
          ) : (
            <span>· {match.availableCount} available</span>
          )}
          <TradePerCopyPrice printingId={match.printingId} />
        </>
      }
    />
  );
}

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

function MatchSourceLine({
  direction,
  listNames,
  counterpartyListNames,
}: {
  direction: MatchDirection;
  listNames: string[];
  counterpartyListNames: string[];
}) {
  const text = [
    describeViewerSource(direction, listNames),
    describeCounterpartySource(direction, counterpartyListNames),
  ]
    .filter((part) => part !== null)
    .join(" · ");
  if (text === "") {
    return null;
  }
  return (
    <span className="text-muted-foreground truncate text-xs" title={text}>
      {text}
    </span>
  );
}

function MatchGroupBadges({ rows }: { rows: readonly ResolvedMatchRow[] }) {
  const labels = [
    ...new Set(rows.map((row) => row.groupLabel).filter((label) => label !== undefined)),
  ];
  if (labels.length === 0) {
    return null;
  }
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1">
      {labels.map((label) => (
        // Badge clips overflow; truncate goes on the inner span.
        <Badge key={label} variant="outline" className="min-w-0">
          <span className="truncate">{label}</span>
        </Badge>
      ))}
    </span>
  );
}

function MatchRow({
  match,
  marketplaceInfos,
  liveTrade,
}: {
  match: DirectedMatch;
  marketplaceInfos: Record<Marketplace, MarketplaceInfo> | null;
  liveTrade?: CardTradeResponse;
}) {
  const incoming = match.direction === "incoming";
  // Mouse-only: iOS Safari synthesizes hover on tap, which would otherwise
  // open this 400px preview over most of the phone screen with no way to dismiss it.
  const rowRef = useRef<HTMLDivElement>(null);
  const { hovering: previewing, hoverProps } = useMouseHover();
  // sellPref is always the seller's side, buyPref the buyer's: the counterparty
  // is the seller when the card comes to the viewer, the buyer when it goes to them.
  const counterpartyPref = incoming ? match.sellPref : match.buyPref;
  const priceLabel = incoming ? "Price" : "They'd pay";
  const hasCounterpartyPref =
    counterpartyPref.pricePref !== null || counterpartyPref.tradeType !== null;

  return (
    <div
      ref={rowRef}
      {...hoverProps}
      className="group bg-muted/30 hover:bg-muted/50 flex flex-col gap-2 rounded-md border border-dashed p-2 transition-colors sm:flex-row sm:items-center sm:gap-3"
    >
      <div className="flex min-w-0 items-center gap-3 sm:contents">
        <TradeDirectionIcon incoming={incoming} />

        <CardArtThumb
          shape="strip"
          imageId={match.imageId}
          alt={match.cardName}
          landscape={
            match.printing ? getOrientation(match.printing.card.types) === "landscape" : false
          }
          rarity={match.rarity}
          domains={match.domains}
          className="h-10"
          loading="lazy"
        />

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <CardDetailNameButton
            printingId={match.printing ? match.printingId : undefined}
            className="max-w-full self-start truncate font-medium"
          >
            {match.cardName}
          </CardDetailNameButton>
          <MatchRowMeta match={match} />
          <MatchCopyMetadataLine match={match} />
          <MatchSourceLine
            direction={match.direction}
            listNames={[match.viewerListName]}
            counterpartyListNames={[match.counterpartyListName]}
          />
          <MatchGroupBadges rows={[match]} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 sm:contents">
        <div className="flex min-w-0 items-center gap-2 sm:contents">
          {hasCounterpartyPref ? (
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
  foldId: string;
  direction: MatchDirection;
  cardId: string;
  cardName: string;
  cardSlug: string;
  imageId: string | null;
  domains: string[];
  buyEntryKind: "card" | "printing";
  buyQuantity: number;
  counterpartyUserId: string;
  counterpartyName: string | null;
  counterpartyImage: string | null;
  counterpartyGravatarHash: string;
  totalAvailable: number;
  variants: DirectedMatch[];
}

// groupSlug is deliberately excluded from the key: a card reachable through
// two shared groups is one opportunity, not a duplicate tile per group.
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
        cardId: row.cardId,
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

export function compareMatchTradeGroups(a: MatchTradeGroup, b: MatchTradeGroup): number {
  return (
    DIRECTION_ORDER[a.direction] - DIRECTION_ORDER[b.direction] ||
    compareCatalogPosition(a, b) ||
    a.cardName.localeCompare(b.cardName)
  );
}

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

  // Cheapest per-copy price across variants, shown as "from X" when they vary.
  // Per-copy, never times the wish quantity: a wish can exceed any one variant's stock.
  const prices = usePrices();
  const marketplace = useDisplayStore((state) => state.marketplaceOrder[0] ?? "cardtrader");
  const variantPrices = group.variants
    .map((variant) => prices.get(variant.printingId, marketplace))
    .filter((price) => price !== undefined);
  const cheapestUnit = variantPrices.length > 0 ? Math.min(...variantPrices) : undefined;
  const pricesVary =
    variantPrices.length > 0 && Math.min(...variantPrices) !== Math.max(...variantPrices);

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
    <div className="bg-muted/30 overflow-hidden rounded-md border border-dashed">
      <div className="hover:bg-muted/50 flex flex-col gap-2 p-2 transition-colors sm:flex-row sm:items-center sm:gap-3">
        <div className="flex min-w-0 items-center gap-3 sm:contents">
          {/* Stops at the card name: the counts line below can hold its own
              control (available-count popover), and nesting buttons is invalid. */}
          <Pressable
            onClick={() => toggle(group.foldId)}
            tabIndex={-1}
            aria-label={`Toggle ${group.cardName} variants`}
            className="hover:text-foreground flex shrink-0 items-center gap-3 transition-colors"
          >
            <TradeDirectionIcon incoming={incoming} />

            <CardArtThumb
              imageId={group.imageId}
              alt={group.cardName}
              domains={group.domains}
              className="w-10"
              loading="lazy"
            />
          </Pressable>

          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <Pressable
              onClick={() => toggle(group.foldId)}
              tabIndex={-1}
              className="hover:text-foreground max-w-full self-start truncate font-medium transition-colors"
            >
              {group.cardName}
            </Pressable>
            <span className="text-muted-foreground text-xs">
              {group.variants.length} variants · {group.buyQuantity} wanted ·{" "}
              {group.direction === "outgoing" ? (
                <AvailableCopiesPopover
                  cardId={group.cardId}
                  availableCount={group.totalAvailable}
                />
              ) : (
                <>{group.totalAvailable} available</>
              )}
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
              counterpartyListNames={group.variants.map((variant) => variant.counterpartyListName)}
            />
            <MatchGroupBadges rows={group.variants} />
          </span>

          <ExpandToggle
            expanded={expanded}
            onClick={() => toggle(group.foldId)}
            aria-label={
              expanded ? `Collapse ${group.cardName} variants` : `Expand ${group.cardName} variants`
            }
            className="text-muted-foreground hover:text-foreground shrink-0 transition-colors sm:order-last"
            chevronClassName="text-inherit"
          />
        </div>

        {headerStatus ? (
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
  incoming: MatchTradeListRow[];
  outgoing: MatchTradeListRow[];
  groupSlug: string;
  groupNames?: ReadonlyMap<string, string> | null;
}

function isBulkRequestable(group: MatchTradeGroup): boolean {
  return (
    group.direction === "incoming" &&
    group.variants.length === 1 &&
    maxTradeQuantity(group.buyQuantity, group.totalAvailable) > 0
  );
}

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
        groupSlug: variant.groupSlug,
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

export function MatchTradeList({
  incoming,
  outgoing,
  groupSlug,
  groupNames = null,
}: MatchTradeListProps) {
  const { cardsById, printingsById, sets } = useCards();
  const { labels } = useEnumOrders();
  const { data: userTrades } = useUserTrades();

  const listGroupSlugs = new Set<string>([groupSlug]);
  for (const row of [...incoming, ...outgoing]) {
    if (row.groupSlug !== undefined) {
      listGroupSlugs.add(row.groupSlug);
    }
  }
  const liveTradeByKey = new Map<string, CardTradeResponse>();
  for (const trade of userTrades?.items ?? []) {
    // counterpartyUserId/groupSlug can be null once a trade finishes; the
    // checks here confirm a live trade always still has both.
    const counterpartyUserId = trade.counterparty.userId;
    const tradeGroupSlug = trade.groupSlug;
    if (
      tradeGroupSlug !== null &&
      listGroupSlugs.has(tradeGroupSlug) &&
      counterpartyUserId !== null &&
      (trade.status === "pending" || trade.status === "reserved")
    ) {
      liveTradeByKey.set(liveTradeKey(tradeGroupSlug, counterpartyUserId, trade.printingId), trade);
    }
  }

  const printingIds = [...new Set([...incoming, ...outgoing].map((row) => row.printingId))];
  const { data: marketplaceInfo } = useMarketplaceInfo(printingIds);

  const incomingRows = aggregateMatches(
    resolveMatchRows(incoming, cardsById, printingsById, sets, labels, groupSlug, groupNames),
  ).map((match): DirectedMatch => ({ ...match, direction: "incoming" }));
  const outgoingRows = aggregateMatches(
    resolveMatchRows(outgoing, cardsById, printingsById, sets, labels, groupSlug, groupNames),
  ).map((match): DirectedMatch => ({ ...match, direction: "outgoing" }));
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
