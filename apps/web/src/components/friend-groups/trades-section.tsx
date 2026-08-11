import type { CardTradeResponse } from "@openrift/shared";
import {
  BellIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  EllipsisVerticalIcon,
  FolderPlusIcon,
  LayersIcon,
  XIcon,
} from "lucide-react";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { useState } from "react";

import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { CardDetailNameButton } from "@/components/cards/card-detail-opener";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconChip } from "@/components/ui/icon-chip";
import { SectionHeading } from "@/components/ui/section-heading";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/user-avatar";
import { useCappedRows } from "@/hooks/use-capped-rows";
import {
  useAcceptTrade,
  useApplyTradeSync,
  useCancelTrade,
  useDeclineTrade,
  useGroupTrades,
  useSkipTradeSync,
} from "@/hooks/use-card-trades";
import { useCards } from "@/hooks/use-cards";
import { useEnumOrders } from "@/hooks/use-enums";
import { usePrices } from "@/hooks/use-prices";
import { useTradeAddTarget } from "@/hooks/use-trade-add-target";
import { frontImageId } from "@/lib/card-meta";
import { comparePrintingIdsByCatalog } from "@/lib/catalog-position";
import { MARKETPLACE_META } from "@/lib/marketplace-meta";
import type { ResolvedTradeAddTarget } from "@/lib/trade-add-target";
import type { TradeCounterpartyGroup } from "@/lib/trade-derivation";
import {
  bucketMemberTrades,
  dominantTradeBadge,
  groupTradesByCounterparty,
  sameTradeBadge,
  sumTradeValues,
  tradeBadge,
  tradeSection,
} from "@/lib/trade-derivation";
import { useDisplayStore } from "@/stores/display-store";
import { useTradeActionStore } from "@/stores/trade-action-store";

import { AddToCollectionDialog } from "./add-to-collection-dialog";
import { TradeCardmarketExportDialog } from "./trade-cardmarket-export-dialog";
import {
  TradeCopyPickerDialog,
  TradeSettleCopyPickerDialog,
  useTradeAcceptFlow,
  useTradeSettleCopyFlow,
} from "./trade-copy-picker-dialog";
import {
  CardMetaLine,
  TradeDirectionIcon,
  TradeEstimatedPrice,
  TradeExpiry,
  TradeShowMoreRow,
  TradeStatusBadge,
  TradeValueSummary,
} from "./trade-row-parts";

/**
 * The apply-sync mutation variables for one trade. The target collection is only
 * named when there is one to name — omitting it is what tells the server to file
 * the copies in the inbox.
 * @param trade The completed trade whose copies are being filed.
 * @param target The viewer's resolved add target.
 * @returns The mutation variables.
 */
function syncVariables(
  trade: CardTradeResponse,
  target: ResolvedTradeAddTarget,
): { tradeId: string; groupSlug: string; targetCollectionId?: string } {
  const base = { tradeId: trade.id, groupSlug: trade.groupSlug };
  if (target.collectionId === undefined) {
    return base;
  }
  return { ...base, targetCollectionId: target.collectionId };
}

/**
 * The overflow menu that sits beside a settle button. One trigger per row: on
 * phones it is pinned to the card's top-right corner, so a second menu would
 * land on top of the first.
 * @returns The menu.
 */
function SettleOverflowMenu({ disabled, children }: { disabled: boolean; children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          // On phones the action bar is already carrying Skip and the primary
          // button, so the menu lifts out of it to the card's top-right
          // corner; from sm up it rejoins the button row.
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={disabled}
            aria-label="More trade actions"
            className="absolute top-2 right-2 sm:static"
          />
        }
      >
        <EllipsisVerticalIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The receiver's side of a reserved trade: one press files the copies into the
 * remembered target (the inbox until the viewer picks otherwise), with an
 * overflow menu to send them somewhere else. Picking somewhere else is
 * remembered, so the button then reads "Got them, add to <that collection>"
 * everywhere.
 *
 * Mounted only for the rows that can actually add, since it is what pulls the
 * viewer's collections in to label itself.
 * @returns The add button, its overflow menu and the picker dialog.
 */
function AddIncomingTradeButtons({
  trade,
  cardName,
  cancelItem,
  onSkip,
}: {
  trade: CardTradeResponse;
  cardName: string;
  /** The row's "Cancel trade" item, or null once the trade is past cancelling. */
  cancelItem: ReactNode;
  /** Settles this half without touching the collection. */
  onSkip: () => void;
}) {
  const acting = useTradeActionStore((state) => state.pending.has(trade.id));
  const begin = useTradeActionStore((state) => state.begin);
  const settle = useTradeActionStore((state) => state.settle);
  const applySync = useApplyTradeSync();
  const target = useTradeAddTarget();
  const [pickerOpen, setPickerOpen] = useState(false);

  function addToTarget(): void {
    begin(trade.id);
    applySync.mutate(syncVariables(trade, target), { onSettled: () => settle(trade.id) });
  }

  return (
    <>
      {/* A collection name can be any length, so the label truncates rather
          than pushing the row wider than the card. */}
      <Button size="sm" className="max-w-56 min-w-0" disabled={acting} onClick={addToTarget}>
        <span className="truncate">Got them, add to {target.label}</span>
      </Button>
      <SettleOverflowMenu disabled={acting}>
        <DropdownMenuItem onClick={() => setPickerOpen(true)}>
          <FolderPlusIcon className="size-4" />
          Add to another collection…
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onSkip}>
          <CheckIcon className="size-4" />
          Got them, don&apos;t add
        </DropdownMenuItem>
        {cancelItem}
      </SettleOverflowMenu>
      <AddToCollectionDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        tradeId={trade.id}
        groupSlug={trade.groupSlug}
        cardName={cardName}
        quantity={trade.quantity}
      />
    </>
  );
}

/**
 * The giver's side of a reserved trade: one press removes the copies that
 * changed hands, asking which ones when the candidates differ, with an overflow
 * menu to ask anyway.
 *
 * The pinned copies are only ever a guess at what travelled. A giver-initiated
 * offer pins without asking them at all, and even a picked pin was picked before
 * the swap, so the copy that changed hands can easily have come out of a
 * different binder — one the group may never have seen. Nothing here re-pins:
 * the rows are about to be deleted, so the choice is a correction to what
 * leaves, not to what is promised.
 * @returns The remove button, its overflow menu and the picker dialog.
 */
function RemoveOutgoingTradeButtons({
  trade,
  cardName,
  cancelItem,
  onSkip,
}: {
  trade: CardTradeResponse;
  cardName: string;
  /** The row's "Cancel trade" item, or null once the trade is past cancelling. */
  cancelItem: ReactNode;
  /** Settles this half without touching the collection. */
  onSkip: () => void;
}) {
  const acting = useTradeActionStore((state) => state.pending.has(trade.id));
  const begin = useTradeActionStore((state) => state.begin);
  const settle = useTradeActionStore((state) => state.settle);
  const flow = useTradeSettleCopyFlow({
    tradeId: trade.id,
    groupSlug: trade.groupSlug,
    onSettled: () => settle(trade.id),
  });

  function startSettle(force: boolean): void {
    begin(trade.id);
    flow.start({ force });
  }

  return (
    <>
      <Button size="sm" disabled={acting} onClick={() => startSettle(false)}>
        Handed over, remove from my collection
      </Button>
      <SettleOverflowMenu disabled={acting}>
        <DropdownMenuItem onClick={() => startSettle(true)}>
          <LayersIcon className="size-4" />
          Choose which copies…
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onSkip}>
          <CheckIcon className="size-4" />
          Handed over, keep mine
        </DropdownMenuItem>
        {cancelItem}
      </SettleOverflowMenu>
      <TradeSettleCopyPickerDialog flow={flow} cardName={cardName} />
    </>
  );
}

/**
 * One trade as a wide row with a contextual action set. `hideBadge` is set by
 * the counterparty group when this row's status is the one its header already
 * carries, so a block of seven reserved trades doesn't print "Ready to swap"
 * seven times; the odd row out keeps its badge and is the only chip in the list.
 * @returns The trade row element.
 */
function TradeRow({ trade, hideBadge }: { trade: CardTradeResponse; hideBadge?: boolean }) {
  const { cardsById, printingsById } = useCards();
  const { labels } = useEnumOrders();
  const acting = useTradeActionStore((state) => state.pending.has(trade.id));
  const begin = useTradeActionStore((state) => state.begin);
  const settle = useTradeActionStore((state) => state.settle);

  const acceptFlow = useTradeAcceptFlow({ onSettled: () => settle(trade.id) });
  const decline = useDeclineTrade();
  const cancel = useCancelTrade();
  const skipSync = useSkipTradeSync();

  const card = cardsById[trade.cardId];
  const printing = printingsById[trade.printingId];
  const cardName = card?.name ?? "Card";
  const imageId = frontImageId(printing);

  const incoming = trade.role === "receiver";
  // A pending trade awaiting the viewer's accept/decline is "Your decision", not
  // "Waiting for them".
  const awaitingViewer = trade.actionNeeded === "accept-or-decline";
  // Cancelling a reservation both sides agreed to is the rare exit, so it lives
  // in the overflow menu. It disappears entirely once either side has settled:
  // the giver's settle hard-deletes the copies, so there is nothing to undo and
  // the server refuses it (ADR-019, amendment 2026-08-10).
  const settledSide =
    trade.viewerSyncAppliedAt !== null || trade.counterpartySyncAppliedAt !== null;
  const cancellable = !settledSide;

  function run<TVariables>(
    mutation: { mutate: (variables: TVariables, options?: { onSettled?: () => void }) => void },
    variables: TVariables,
  ): void {
    begin(trade.id);
    mutation.mutate(variables, { onSettled: () => settle(trade.id) });
  }

  const actionArgs = { tradeId: trade.id, groupSlug: trade.groupSlug };

  // Handed to whichever settle-side component the row renders, so the cancel
  // action shares that side's single overflow menu.
  const cancelItem = cancellable ? (
    <DropdownMenuItem variant="destructive" onClick={() => run(cancel, actionArgs)}>
      <XIcon className="size-4" />
      Cancel trade
    </DropdownMenuItem>
  ) : null;

  return (
    // On phones the row stacks: the card identity sits on top, and an action bar
    // below carries the status badge on the left and the buttons on the right.
    // From sm up both groups dissolve (sm:contents) back into one horizontal row.
    <Card className="relative gap-2 p-2 sm:flex-row sm:items-center sm:gap-3">
      {/* pr-8 keeps the card name clear of the overflow menu, which is pinned to
          the card's top-right corner on phones (see the trigger below). From sm
          up this wrapper is display:contents, so the padding stops applying. */}
      <div className="flex min-w-0 items-center gap-3 pr-8 sm:contents">
        <TradeDirectionIcon incoming={incoming} />

        <CardArtThumb imageId={imageId} alt={cardName} className="w-10" loading="lazy" />

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {/* The quantity rides along inside the control: an inline-block button
              nested in a truncating span gets clipped without an ellipsis, so
              the truncation has to live on the button itself. Only the resolved
              catalog printing can be shown, so an unknown one keeps the line as
              plain text rather than a dead control. */}
          <CardDetailNameButton
            printingId={printing?.id}
            className="max-w-full self-start truncate font-medium"
          >
            {trade.quantity}× {cardName}
          </CardDetailNameButton>
          {printing ? (
            <CardMetaLine
              shortCode={printing.shortCode}
              rarity={printing.rarity}
              rarityLabel={labels.rarities[printing.rarity]}
              finish={printing.finish}
              finishLabel={labels.finishes[printing.finish]}
              trailing={
                <TradeEstimatedPrice printingId={trade.printingId} quantity={trade.quantity} />
              }
            />
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:contents">
        {/* Every row sits under a counterparty header that already carries the
            member's avatar and name, so the row itself never names them: no
            member chip, and the pending badge reads "Waiting for them". */}
        {hideBadge ? null : (
          <TradeStatusBadge
            status={trade.status}
            awaitingViewer={awaitingViewer}
            viewerSettled={trade.viewerSyncAppliedAt !== null}
            className="min-w-0 shrink"
          />
        )}

        <TradeExpiry status={trade.status} expiresAt={trade.expiresAt} />

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:ml-0">
          {trade.actionNeeded === "accept-or-decline" ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={acting}
                onClick={() => run(decline, actionArgs)}
              >
                Decline
              </Button>
              <Button
                size="sm"
                disabled={acting}
                onClick={() => {
                  begin(trade.id);
                  acceptFlow.start({ ...actionArgs, role: trade.role, cardName });
                }}
              >
                Accept
              </Button>
            </>
          ) : null}

          {trade.actionNeeded === "cancel" ? (
            <Button
              size="sm"
              variant="outline"
              disabled={acting}
              onClick={() => run(cancel, actionArgs)}
            >
              Cancel
            </Button>
          ) : null}

          {trade.actionNeeded === "settle" ? (
            // The viewer settles their own half and nothing else. There is no
            // "mark traded" that speaks for both parties: the receiver says they
            // got the cards, the giver says they handed them over, and the
            // second of those completes the trade (ADR-019, amendment
            // 2026-08-10). The skip variant settles the same half without
            // touching the collection, for someone whose data is already right.
            // It is the rarer choice, so it joins the cancel item in the side's
            // single overflow menu and the primary button carries the whole
            // sentence instead. The side components own that menu, so the row
            // never renders two triggers into the same corner.
            incoming ? (
              <AddIncomingTradeButtons
                trade={trade}
                cardName={cardName}
                cancelItem={cancelItem}
                onSkip={() => run(skipSync, actionArgs)}
              />
            ) : (
              <RemoveOutgoingTradeButtons
                trade={trade}
                cardName={cardName}
                cancelItem={cancelItem}
                onSkip={() => run(skipSync, actionArgs)}
              />
            )
          ) : null}
        </div>
      </div>

      {trade.actionNeeded === "accept-or-decline" ? (
        <TradeCopyPickerDialog flow={acceptFlow} />
      ) : null}
    </Card>
  );
}

/** Which bulk action a counterparty group offers, keyed to its lifecycle bucket:
 * accept/decline for the requests awaiting the viewer, cancel for the requests
 * the viewer sent, or none (completed history). */
type BulkMode = "accept-decline" | "cancel" | "none";

/**
 * The bulk form of the row's "Add to <collection>" button: files every completed
 * trade in this group whose incoming copies the viewer hasn't dealt with yet,
 * all into the same remembered target. Split out from {@link BulkTradeActions}
 * so the collections query behind the label only mounts on the headers that
 * actually offer it.
 * @returns The bulk add button.
 */
function BulkAddButton({ trades }: { trades: CardTradeResponse[] }) {
  const applySync = useApplyTradeSync();
  const target = useTradeAddTarget();
  const begin = useTradeActionStore((state) => state.begin);
  const settle = useTradeActionStore((state) => state.settle);
  const acting = useTradeActionStore((state) =>
    trades.some((trade) => state.pending.has(trade.id)),
  );

  function addAll(): void {
    for (const trade of trades) {
      begin(trade.id);
      applySync.mutate(syncVariables(trade, target), { onSettled: () => settle(trade.id) });
    }
  }

  return (
    <Button size="sm" className="max-w-56 min-w-0 shrink-0" disabled={acting} onClick={addAll}>
      <span className="truncate">
        Add all ({trades.length}) to {target.label}
      </span>
    </Button>
  );
}

/**
 * The bulk action buttons on a counterparty group header. Acts on the trades in
 * this group whose contextual action matches the mode — accept/decline for
 * "Your move" requests, cancel for the viewer's own pending ones — firing one
 * mutation per trade and driving the shared action store so every affected row
 * shows its in-flight state. Renders nothing until there are at least two to act
 * on, since a lone trade is served fine by its own row button.
 *
 * Completed trades awaiting the receiver's "add to my collection" get their own
 * button alongside, since they sit in the same bucket as the requests awaiting a
 * decision and a header can end up offering both.
 *
 * Bulk accept deliberately does not offer the copy picker the row buttons do.
 * Choosing copies needs one options read per trade, and that read re-derives
 * the giver's supply, so an "Accept all (12)" would pay twelve of them before
 * anything happened and then stop on a queue of dialogs. Sending no `copyIds`
 * leaves the server pinning the plainest copies first, which is the protection
 * that matters here. A giver who wants to hand over a specific copy accepts
 * that trade from its own row.
 * @returns The bulk-action buttons, or null when fewer than two apply.
 */
function BulkTradeActions({ trades, mode }: { trades: CardTradeResponse[]; mode: BulkMode }) {
  const accept = useAcceptTrade();
  const decline = useDeclineTrade();
  const cancel = useCancelTrade();
  const begin = useTradeActionStore((state) => state.begin);
  const settle = useTradeActionStore((state) => state.settle);

  const needle = mode === "accept-decline" ? "accept-or-decline" : "cancel";
  const targets = mode === "none" ? [] : trades.filter((trade) => trade.actionNeeded === needle);
  const addTargets =
    mode === "none"
      ? []
      : trades.filter((trade) => trade.actionNeeded === "settle" && trade.role === "receiver");
  const acting = useTradeActionStore((state) =>
    targets.some((trade) => state.pending.has(trade.id)),
  );

  // Declared ahead of the early returns below: the React Compiler bails on a
  // function declaration it reaches only after a `return`.
  function runAll(mutation: {
    mutate: (
      variables: { tradeId: string; groupSlug?: string },
      options?: { onSettled?: () => void },
    ) => void;
  }): void {
    for (const trade of targets) {
      begin(trade.id);
      mutation.mutate(
        { tradeId: trade.id, groupSlug: trade.groupSlug },
        { onSettled: () => settle(trade.id) },
      );
    }
  }

  if (targets.length < 2 && addTargets.length < 2) {
    return null;
  }

  const addAll = addTargets.length < 2 ? null : <BulkAddButton trades={addTargets} />;

  if (targets.length < 2) {
    return addAll;
  }

  if (mode === "cancel") {
    return (
      <div className="flex shrink-0 items-center gap-1.5">
        {addAll}
        <Button size="sm" variant="outline" disabled={acting} onClick={() => runAll(cancel)}>
          Cancel all ({targets.length})
        </Button>
      </div>
    );
  }
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {addAll}
      <Button size="sm" variant="outline" disabled={acting} onClick={() => runAll(decline)}>
        Decline all
      </Button>
      <Button size="sm" disabled={acting} onClick={() => runAll(accept)}>
        Accept all ({targets.length})
      </Button>
    </div>
  );
}

/**
 * Icon button on a counterparty group header that opens the Cardmarket export
 * for the group's reserved trades. Rendered only when there is at least one
 * reserved trade, so it never offers an empty export.
 * @returns The export button with its dialog, or null when nothing is reserved.
 */
function CardmarketExportButton({
  counterpartyName,
  trades,
}: {
  counterpartyName: string | null;
  trades: CardTradeResponse[];
}) {
  const [open, setOpen] = useState(false);

  const reserved = trades.filter((trade) => trade.status === "reserved");
  if (reserved.length === 0) {
    return null;
  }

  return (
    <>
      <TooltipProvider delay={200}>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-sm"
                variant="outline"
                className="shrink-0"
                aria-label="Export for Cardmarket"
                onClick={() => setOpen(true)}
              />
            }
          >
            <img
              src={MARKETPLACE_META.cardmarket.icon}
              alt=""
              className="h-3.5 invert dark:invert-0"
            />
          </TooltipTrigger>
          <TooltipContent>Export for Cardmarket</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <TradeCardmarketExportDialog
        counterpartyName={counterpartyName}
        trades={reserved}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

/**
 * One counterparty's trades under a collapsible header: avatar, name, count, the
 * status most of them share, and the estimated get/give value, with the bulk
 * action for the bucket next to it. Default-open so the rows are visible, but
 * collapsible so a big pile from one person can be folded away.
 *
 * The header's status badge is the block's summary: trades pile up per person in
 * the same lifecycle state, so without it every row repeats the same chip. Rows
 * matching it drop theirs, which also means the badge still reads correctly when
 * the block is folded shut.
 * @returns The per-counterparty trade group.
 */
function CounterpartyTradeGroup({
  group,
  bulk,
  defaultOpen = true,
}: {
  group: TradeCounterpartyGroup;
  bulk: BulkMode;
  /**
   * Whether the block starts expanded. Action needed folds its blocks so a pile
   * of requests across several members reads as an index; everywhere else the
   * rows are the point of the section.
   */
  defaultOpen?: boolean;
}) {
  const { counterparty } = group;
  const prices = usePrices();
  const { printingsById, sets } = useCards();
  const marketplace = useDisplayStore((state) => state.marketplaceOrder[0] ?? "cardtrader");

  // Rows read in catalog order (set, then card number), the same order the
  // suggestions above and the card browsers use, rather than in the order the
  // trades happened to be opened. Everything below — the value summary, the
  // bulk actions, the Cardmarket export — works off the sorted list, so the
  // export file comes out in that order too.
  const byCatalogPosition = comparePrintingIdsByCatalog(printingsById, sets);
  const trades = group.trades.toSorted((a, b) => byCatalogPosition(a.printingId, b.printingId));
  const split = sumTradeValues(trades, (printingId) => prices.get(printingId, marketplace));
  // The header count, the value summary and the shared status stay over *all*
  // their trades — the fold is a display cap, not a filter.
  const fold = useCappedRows(trades);
  const shared = dominantTradeBadge(trades);

  return (
    <Collapsible defaultOpen={defaultOpen}>
      <div className="flex items-center gap-2">
        <CollapsibleTrigger className="group hover:bg-muted/50 flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left font-medium">
          <UserAvatar
            image={counterparty.image}
            name={counterparty.name}
            gravatarHash={counterparty.gravatarHash}
            size="sm"
          />
          {/* Narrow screens stack the value summary under the name — inline it
              leaves the name a few characters wide. It wraps there too, since
              the both-directions wording outruns a phone's width on its own. */}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate">{counterparty.name ?? "Member"}</span>
              <span className="text-muted-foreground shrink-0 text-xs">({trades.length})</span>
              {shared ? (
                <TradeStatusBadge
                  status={shared.status}
                  awaitingViewer={shared.awaitingViewer}
                  className="min-w-0 shrink"
                />
              ) : null}
            </span>
            <TradeValueSummary split={split} marketplace={marketplace} className="sm:ml-auto" />
          </span>
          <ChevronRightIcon className="text-muted-foreground size-4 shrink-0 transition-transform group-data-[panel-open]:rotate-90" />
        </CollapsibleTrigger>
        <CardmarketExportButton counterpartyName={counterparty.name} trades={trades} />
        <BulkTradeActions trades={trades} mode={bulk} />
      </div>
      <CollapsibleContent>
        <div className="mt-1 flex flex-col gap-2">
          {fold.rows.map((trade) => (
            <TradeRow
              key={trade.id}
              trade={trade}
              hideBadge={shared !== null && sameTradeBadge(tradeBadge(trade), shared)}
            />
          ))}
          {fold.foldable ? <TradeShowMoreRow fold={fold} /> : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * A lifecycle bucket (In progress / Action needed), its trades grouped per
 * counterparty so a pile of requests to one person reads as a single foldable
 * block with a running value and a bulk action.
 * @returns The bucket section, or null when empty.
 */
function CounterpartyGroupedBucket({
  heading,
  icon,
  trades,
  bulk,
  foldGroups,
}: {
  heading: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  trades: CardTradeResponse[];
  bulk: BulkMode;
  /**
   * Starts the multi-trade counterparty blocks collapsed. Set on Action needed,
   * where the headers alone answer who is waiting and on how much, and the bulk
   * buttons live on the header row so a pile needs no expanding to act on.
   *
   * A block holding one trade stays open regardless: folding a single row saves
   * no space, and `BulkTradeActions` renders nothing below two, so the header
   * would carry no action at all.
   */
  foldGroups?: boolean;
}) {
  if (trades.length === 0) {
    return null;
  }
  const groups = groupTradesByCounterparty(trades);
  return (
    <section className="flex flex-col gap-3">
      <SectionHeading as="h3" icon={icon} tone="gold" count={trades.length}>
        {heading}
      </SectionHeading>
      <div className="flex flex-col gap-2">
        {groups.map((group) => (
          <CounterpartyTradeGroup
            key={group.counterparty.userId}
            group={group}
            bulk={bulk}
            defaultOpen={foldGroups !== true || group.trades.length < 2}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * Completed trades, collapsed by default behind a clickable heading and grouped
 * per counterparty inside. History accrues and rarely needs acting on, so it
 * stays out of the way until the viewer expands it.
 * @returns The collapsible completed group, or null when empty.
 */
function CompletedBucket({ trades }: { trades: CardTradeResponse[] }) {
  if (trades.length === 0) {
    return null;
  }
  const groups = groupTradesByCounterparty(trades);
  return (
    // The id anchors the Trades page's jump link; the scroll margin clears the
    // sticky header + page top bar so the heading isn't buried under them.
    <Collapsible
      id="completed-trades"
      defaultOpen={false}
      className="flex scroll-mt-28 flex-col gap-3"
    >
      <SectionHeading as="h3">
        <CollapsibleTrigger className="group hover:text-foreground flex w-full items-center gap-2.5 text-left transition-colors">
          <IconChip icon={CheckIcon} size="sm" />
          Completed
          <span className="text-xs">({trades.length})</span>
          <ChevronRightIcon className="size-4 shrink-0 transition-transform group-data-[panel-open]:rotate-90" />
        </CollapsibleTrigger>
      </SectionHeading>
      <CollapsibleContent>
        <div className="flex flex-col gap-2">
          {groups.map((group) => (
            <CounterpartyTradeGroup key={group.counterparty.userId} group={group} bulk="none" />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * The viewer's trades with a single member, bucketed into In progress / Action
 * needed / Completed. Used on the member-detail page, which is already scoped to
 * one counterparty. Unlike the match-suggestion overlay — which only shows an
 * in-progress trade while a matching suggestion row still exists — this lists
 * every trade, including ones whose copies are fully reserved and so no longer
 * surface as a match (ADR-019). Renders nothing when there are no trades.
 * @returns The member's trade buckets, or null when there are none.
 */
export function MemberTradesSection({
  groupId,
  counterpartyUserId,
}: {
  groupId: string;
  counterpartyUserId: string;
}) {
  const { data } = useGroupTrades(groupId);
  const { active, actionNeeded, history } = bucketMemberTrades(
    data?.items ?? [],
    counterpartyUserId,
  );

  if (active.length + actionNeeded.length + history.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-8">
      <CounterpartyGroupedBucket
        heading="Action needed"
        icon={BellIcon}
        trades={actionNeeded}
        bulk="accept-decline"
        foldGroups
      />
      <CounterpartyGroupedBucket
        heading="In progress"
        icon={ClockIcon}
        trades={active}
        bulk="cancel"
      />
      <CompletedBucket trades={history} />
    </div>
  );
}

interface TradesSectionProps {
  groupId: string;
  /**
   * The "Possible trades" suggestions block, injected between the active trade
   * buckets (Action needed / In progress) and the wishlists & tradelists so the
   * page reads Action needed → In progress → Possible trades → Wishlists &
   * tradelists → Completed.
   */
  suggestions: React.ReactNode;
  /**
   * The "Wishlists & tradelists" browse block (each member's shared wishlists
   * and tradelists), slotted just below the suggestions so the Trades page is the
   * one-stop place to both act on matches and browse what members offer.
   */
  memberLists: React.ReactNode;
}

/**
 * The viewer's trades in this group, bucketed into Action needed / In progress /
 * Completed, with the Possible trades suggestions and Wishlists & tradelists slotted in
 * just above Completed. Whatever is waiting on the viewer stays at the very top.
 * @returns The trades content.
 */
export function TradesSection({ groupId, suggestions, memberLists }: TradesSectionProps) {
  const { data } = useGroupTrades(groupId);

  const trades = data?.items ?? [];

  if (trades.length === 0) {
    return (
      <div className="flex flex-col gap-8">
        {suggestions}
        {memberLists}
        <p className="text-muted-foreground">
          No trades in this group yet. When you request one of the suggestions above, it&apos;ll
          show up here.
        </p>
      </div>
    );
  }

  const actionNeeded = trades.filter((trade) => tradeSection(trade) === "action-needed");
  const active = trades.filter((trade) => tradeSection(trade) === "active");
  const history = trades.filter((trade) => tradeSection(trade) === "history");

  return (
    <div className="flex flex-col gap-8">
      <CounterpartyGroupedBucket
        heading="Action needed"
        icon={BellIcon}
        trades={actionNeeded}
        bulk="accept-decline"
        foldGroups
      />
      <CounterpartyGroupedBucket
        heading="In progress"
        icon={ClockIcon}
        trades={active}
        bulk="cancel"
      />
      {suggestions}
      {memberLists}
      <CompletedBucket trades={history} />
    </div>
  );
}
