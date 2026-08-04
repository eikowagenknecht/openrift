import type {
  CardTradeLiveAnnotation,
  Currency,
  ListKind,
  Printing,
  TradePreference,
} from "@openrift/shared";
import { legendDisplayName } from "@openrift/shared";
import { ListIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { memo } from "react";

import type { CardRenderContext } from "@/components/card-viewer-types";
import { CardCell } from "@/components/cards/card-cell";
import { CardCountStrip } from "@/components/cards/card-count-strip";
import { CardStrip, StripIconButton } from "@/components/cards/card-strip";
import type { CardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import type { ListEntryDragData } from "@/components/collection/dnd-types";
import { SelectionCheckbox } from "@/components/collection/selection-checkbox";
import { DraggableListEntry } from "@/components/list/draggable-list-entry";
import { ListEntryContextMenu } from "@/components/list/list-entry-context-menu";
import type { ListTradeIndex } from "@/components/list/list-trade-status";
import { listEntryTradeStatus } from "@/components/list/list-trade-status";
import { isRuleSourced, RuleSourceBadge } from "@/components/list/rule-source-badge";
import { TradePreferenceGridPill } from "@/components/trade-preferences/trade-preference-grid-pill";
import { TradeStatusChip } from "@/components/trades/trade-status-chip";
import { Badge } from "@/components/ui/badge";
import { entryToExcludeTarget } from "@/lib/rule-exclude";
import {
  dispatchEntryQuantityChange,
  dispatchExcludeFromRule,
  dispatchIncrement,
  dispatchItemClick,
  dispatchItemToggle,
  dispatchListBulkAction,
  dispatchMoveCopyToCollection,
  dispatchRemoveEntry,
  dispatchSetPreference,
  dispatchSiblingClick,
  isQuantityPending,
} from "@/stores/card-row-actions-store";
import { useGridFocusStore } from "@/stores/grid-focus-store";
import { useGridSelectionStore } from "@/stores/grid-selection-store";
import { useListEntriesStore } from "@/stores/list-entries-store";
import { useSiblingOverrideStore } from "@/stores/sibling-override-store";

interface ListGridCellProps {
  /** The grid item's underlying printing (pre-override-resolution). */
  printing: Printing;
  /** Grid item identifier (printingId, cardId-first-sibling, or copyId per kind/view). */
  itemId: string;
  /** Layout dimensions + load priority from the row. Primitive props avoid
   * the row's `.map`-built ctx object busting the cell's memo on every
   * parent render. isSelected / isFlashing are resolved per-cell below. */
  cardWidth: number;
  priority: boolean;
  /** "cards" | "printings"; "copies" is collapsed to "printings" at the data level. */
  dataView: "cards" | "printings";
  /** Locked view per the list's kind: cards/printings/copies. */
  view: "cards" | "printings" | "copies";
  kind: ListKind;
  intent: "wish" | "trade" | "organize";
  listId: string;
  listTradeDefaults: TradePreference;
  listCurrency: Currency | null;
  /** Browse renders +/-, drag, and trade controls; select renders a checkbox. */
  mode: "browse" | "select";
  /** True when the grid is rendering the catalog (library mode). */
  showLibrary: boolean;
  supportsTradePrefs: boolean;
  /** Catalog siblings for this card (cards view, otherwise undefined). */
  siblings: Printing[] | undefined;
  display: CardThumbnailDisplay;
  showImages: boolean;
  priceRange?: { min: number; max: number };
  /** The viewer's live-trade annotations, indexed by printing and by card. */
  tradeIndex: ListTradeIndex;
}

/**
 * Per-cell wrapper for /lists grid tiles. Self-subscribes to its own
 * sibling-swap override and entry data so the parent's `.map()` stays stable
 * across entry mutations — only the cell whose entry actually changed
 * re-renders. Click / quantity / remove / set-preference actions hand off
 * through dispatchers in {@link useCardRowActionsStore}.
 *
 * Wrapped in `React.memo`: every prop is primitive or comes from a
 * reference-stable source (printing/siblings from useCards, display from
 * useCardThumbnailDisplay's "use memo"), so shallow equality reliably skips
 * unchanged cells when an unrelated entry mutates.
 *
 * @returns The card cell with its strip, drag wrap, and context menu.
 */
// oxlint-disable-next-line eslint/prefer-arrow-callback -- named for React DevTools
export const ListGridCell = memo(function ListGridCell({
  printing,
  itemId,
  cardWidth,
  priority,
  dataView,
  view,
  kind,
  listId,
  intent,
  listTradeDefaults,
  listCurrency,
  mode,
  showLibrary,
  supportsTradePrefs,
  siblings,
  display,
  showImages,
  priceRange,
  tradeIndex,
}: ListGridCellProps) {
  const inCardsView = view === "cards";
  const inSelectMode = mode === "select";

  // Per-cell focus + flash subscriptions (granular selectors return
  // identity-equal booleans for cells that didn't toggle).
  const isSelected = useGridFocusStore(
    (s) => s.selectedItemId === itemId || s.selectedItemId === printing.id,
  );
  const isFlashing = useGridFocusStore(
    (s) => s.flashCardId === itemId || s.flashCardId === printing.id,
  );
  const resolvedCtx: CardRenderContext = {
    isSelected,
    isFlashing,
    cardWidth,
    priority,
  };

  // Per-cell sibling-swap override. Only re-fires when THIS card's override
  // changes — pins on other cards in the same grid are ignored here.
  const overrideId = useSiblingOverrideStore((s) =>
    inCardsView ? s.overrides.list.get(printing.cardId) : undefined,
  );
  const displayPrinting =
    overrideId && siblings
      ? (siblings.find((sibling) => sibling.id === overrideId) ?? printing)
      : printing;

  // Per-cell entry lookup. The store carries both indexes; the cell picks
  // based on whether items come from the catalog (library mode) or the
  // entries themselves (browse mode). Object.is on the returned entry ref
  // means cells whose entry didn't mutate skip re-render.
  const key = kind === "card" ? printing.cardId : displayPrinting.id;
  const entry = useListEntriesStore((s) =>
    showLibrary ? s.entryByKey.get(key) : s.entryByItemId.get(itemId),
  );

  // Selection keyed by entry id (one tile = one entry). The selector returns a
  // bare boolean, so only the cell whose selection flipped re-renders.
  // Rule-derived entries (ADR-034) have no list_entries row, so they can't be
  // selected, dragged, edited, or removed — they're managed by the rule. The
  // cell renders them read-only.
  const editableEntryId = entry !== undefined && entry.id !== null ? entry.id : null;
  const isItemSelected = useGridSelectionStore(
    (state) => inSelectMode && editableEntryId !== null && state.selected.has(editableEntryId),
  );

  // The tile's live-trade status. Resolved here, in the component, because
  // buildStrip is a plain function and the entry-shape mapping can't be done
  // from a printing id alone — a card-kind wish entry names a card.
  const tradeStatus = entry ? listEntryTradeStatus(entry, tradeIndex) : null;

  // Select mode hides the browse controls (quantity stepper, trade pill) and
  // the drag wrap, and shows a checkbox instead — mirrors /collections.
  const strip = inSelectMode
    ? undefined
    : buildStrip({
        showLibrary,
        kind,
        entry,
        displayPrinting,
        listTradeDefaults,
        listCurrency,
        supportsTradePrefs,
        tradeStatus,
      });

  // Drag wiring: browse-mode tiles with a backing entry are draggable. The
  // drag payload is the single entry the tile represents — buildItems
  // guarantees a 1:1 mapping in browse mode.
  const dragData: ListEntryDragData | undefined =
    entry && editableEntryId !== null
      ? {
          type: "list-entry",
          entryIds: [editableEntryId],
          sourceListId: listId,
          sourceKind: kind,
          sourceIntent: intent,
          totalQuantity: entry.quantity,
          printing,
          cardName: entry.cardName,
        }
      : undefined;
  const dragId = editableEntryId === null ? undefined : `list-entry-${editableEntryId}`;
  const wrap =
    !inSelectMode && !showLibrary && dragData && dragId ? (
      <DraggableListEntry id={dragId} data={dragData} />
    ) : undefined;

  // Move / take-off act on the current selection when this entry is part of it,
  // otherwise just this entry — the browser resolves which via the bulk-action
  // handler. Trade preference stays single-entry. Copy-kind tradelists use
  // "Take off list…" (a keep-vs-sold chooser); other kinds get a plain Remove.
  // Copy-kind entries also offer "Move to collection…", which files the
  // physical copy elsewhere and leaves the list alone.
  const copyId = entry?.kind === "copy" ? entry.copyId : null;
  const contextMenu =
    entry && editableEntryId !== null ? (
      <ListEntryContextMenu
        onRemove={
          kind === "copy" ? undefined : () => dispatchListBulkAction(editableEntryId, "remove")
        }
        onTakeOff={
          kind === "copy" ? () => dispatchListBulkAction(editableEntryId, "takeOff") : undefined
        }
        onMove={() => dispatchListBulkAction(editableEntryId, "move")}
        onMoveToCollection={copyId ? () => dispatchMoveCopyToCollection(copyId) : undefined}
        onSetPreference={
          supportsTradePrefs ? () => dispatchSetPreference(editableEntryId) : undefined
        }
      />
    ) : entry && !showLibrary ? (
      // Rule-produced entries (ADR-034) can't be removed — the rule owns them,
      // so the only list-side action is excluding them from it. Moving the copy
      // between collections isn't a list edit, so a copy entry keeps that one.
      <ListEntryContextMenu
        onMoveToCollection={copyId ? () => dispatchMoveCopyToCollection(copyId) : undefined}
        onExclude={() => dispatchExcludeFromRule(entryToExcludeTarget(entry))}
      />
    ) : undefined;

  const leftOverlay =
    inSelectMode && entry ? (
      <>
        <SelectionCheckbox
          isSelected={isItemSelected}
          onToggle={() => dispatchItemToggle(itemId)}
        />
        {isItemSelected && (
          <div className="ring-primary/50 pointer-events-none absolute inset-1.5 z-10 rounded-lg ring-2" />
        )}
      </>
    ) : undefined;

  return (
    <CardCell
      printing={displayPrinting}
      ctx={resolvedCtx}
      display={display}
      showImages={showImages}
      view={dataView}
      onClick={(clicked, event) =>
        dispatchItemClick(itemId, clicked, {
          shift: event?.shiftKey ?? false,
          ctrl: event?.ctrlKey ?? false,
        })
      }
      onSiblingClick={dispatchSiblingClick}
      siblings={inCardsView ? siblings : undefined}
      priceRange={priceRange}
      dimmed={showLibrary && (entry?.quantity ?? 0) === 0}
      strip={strip}
      leftOverlay={leftOverlay}
      contextMenu={contextMenu}
      wrap={wrap}
    />
  );
});

interface BuildStripArgs {
  showLibrary: boolean;
  kind: ListKind;
  entry: ReturnType<typeof useListEntriesStore.getState>["entryByItemId"] extends Map<
    string,
    infer V
  >
    ? V | undefined
    : never;
  displayPrinting: Printing;
  listTradeDefaults: TradePreference;
  listCurrency: Currency | null;
  supportsTradePrefs: boolean;
  /** The entry's live-trade status, resolved by the cell. Null when nothing is in flight. */
  tradeStatus: CardTradeLiveAnnotation | null;
}

function buildStrip({
  showLibrary,
  kind,
  entry,
  displayPrinting,
  listTradeDefaults,
  listCurrency,
  supportsTradePrefs,
  tradeStatus,
}: BuildStripArgs): ReactNode {
  // The word ("Reserved", "Traded", "Offered", …) rather than the icon alone:
  // the icon is the direction arrow, so an icon-only chip says which way the
  // card is going but not whether it is promised or already pinned.
  //
  // A copy list's tile is one physical copy, so it drops the number: the
  // annotation counts the whole printing, and two reserved copies of it would
  // otherwise each read "Reserved 2" and look like four.
  const tradeChip = tradeStatus ? (
    <TradeStatusChip annotation={tradeStatus} detail={kind === "copy" ? "word" : "label"} />
  ) : null;
  if (showLibrary) {
    // Library mode: + adds to the list (bulk-add upserts by key), - decrements
    // the manual part (the rule's contribution can't be stepped below — ADR-034
    // additive model), and at the last manual copy removes the row outright.
    // The pill shows the editable manual part and the rule's contribution rides
    // alongside in the chip (same split as browse mode), so the count never
    // reads as cumulative. Rule-only entries (null id, manual part 0) are
    // read-only, so the decrement is disabled there.
    const manualPart = entry ? entry.quantity - entry.ruleQuantity : 0;
    return (
      <CardCountStrip
        count={manualPart}
        icon={ListIcon}
        decrement={{
          onClick: () => {
            // Rule-derived entries (null id, ADR-034) can't be decremented/removed.
            if (!entry || entry.id === null) {
              return;
            }
            if (manualPart <= 1) {
              dispatchRemoveEntry(entry.id, legendDisplayName(displayPrinting.card));
            } else {
              dispatchEntryQuantityChange(entry.id, manualPart - 1);
            }
          },
          disabled: manualPart === 0,
          ariaLabel: `Decrease ${legendDisplayName(displayPrinting.card)} quantity on list`,
        }}
        increment={{
          onClick: () => dispatchIncrement(displayPrinting),
          ariaLabel: `Add ${legendDisplayName(displayPrinting.card)} to list`,
        }}
        extras={
          <>
            {entry && entry.ruleQuantity > 0 && <RuleSourceBadge quantity={entry.ruleQuantity} />}
            {tradeChip}
          </>
        }
      />
    );
  }

  if (!entry) {
    return null;
  }

  // Rule-derived entries (ADR-034) are read-only — no stepper, no take-off, no
  // preference edit. The rule badge marks them (same badge as the table view);
  // the static quantity / trade-status signal sits alongside.
  if (entry.id === null) {
    const onLoan = entry.kind === "copy" && entry.onLoan;
    return (
      <CardStrip
        center={
          <>
            <RuleSourceBadge
              quantity={kind === "copy" ? undefined : entry.ruleQuantity}
              onExclude={() => dispatchExcludeFromRule(entryToExcludeTarget(entry))}
              excludeLabel={`Don't include ${entry.cardName}`}
            />
            {tradeChip}
            {onLoan && <Badge variant="secondary">On loan</Badge>}
          </>
        }
      />
    );
  }

  // Narrowed to non-null by the read-only guard above; a local const keeps the
  // narrowing inside the closures below (property narrowing is lost in closures).
  const entryId = entry.id;
  const tradePill = supportsTradePrefs ? (
    <TradePreferenceGridPill
      override={entry.tradeOverride}
      listDefault={listTradeDefaults}
      currency={listCurrency}
      isOverridden={
        entry.tradeOverride.pricePref !== null ||
        entry.tradeOverride.priceAbsoluteCents !== null ||
        entry.tradeOverride.tradeType !== null
      }
      onEdit={() => dispatchSetPreference(entryId)}
    />
  ) : null;

  if (kind === "copy") {
    // Copy-kind (tradelists): no count, no stepper. Surface a take-off button
    // so it isn't hidden behind the context menu. It opens the keep-vs-sold
    // chooser rather than removing outright, since taking a copy off a tradelist
    // has two outcomes (kept vs sold). The trade-status chip (Reserved, Traded,
    // Offered, Requested) and the take-off button sit in the shell's edge zones,
    // whose equal flex widths keep the trade pill dead-centered even against an
    // uneven-width chip. `entry` is guaranteed non-null here.
    // A lent copy can't also be pinned to a trade (the claims exclude each
    // other), but it can still carry an unpinned offer on its printing, so the
    // two left-hand markers are not mutually exclusive.
    const onLoan = entry.kind === "copy" && entry.onLoan;
    return (
      <CardStrip
        left={
          <>
            {tradeChip}
            {onLoan && <Badge variant="secondary">On loan</Badge>}
          </>
        }
        center={
          <>
            {isRuleSourced(entry.source) && <RuleSourceBadge />}
            {tradePill}
          </>
        }
        right={
          <StripIconButton
            className="text-muted-foreground hover:text-destructive"
            onClick={() => dispatchListBulkAction(entryId, "takeOff")}
            aria-label={`Take ${entry.cardName} off list`}
          >
            <XIcon />
          </StripIconButton>
        }
      />
    );
  }

  const isPending = isQuantityPending(entryId);
  // Additive model (ADR-034): the stepper edits the manual part only; the rule's
  // contribution shows in the chip and can't be stepped below. Total = manual +
  // rule. Decrementing the last manual copy removes the row (reverts to rule-only).
  const manualPart = entry.quantity - entry.ruleQuantity;
  return (
    <CardCountStrip
      count={manualPart}
      icon={ListIcon}
      decrement={{
        onClick: () =>
          manualPart <= 1
            ? dispatchRemoveEntry(entryId, entry.cardName)
            : dispatchEntryQuantityChange(entryId, manualPart - 1),
        disabled: isPending,
        ariaLabel: `Decrease ${entry.cardName} quantity`,
      }}
      increment={{
        onClick: () => dispatchEntryQuantityChange(entryId, manualPart + 1),
        disabled: isPending,
        ariaLabel: `Increase ${entry.cardName} quantity`,
      }}
      extras={
        <>
          {entry.ruleQuantity > 0 && <RuleSourceBadge quantity={entry.ruleQuantity} />}
          {tradeChip}
          {tradePill}
        </>
      }
    />
  );
}
