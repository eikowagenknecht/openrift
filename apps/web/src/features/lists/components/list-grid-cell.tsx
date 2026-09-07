import type { CardTradeLiveAnnotation } from "@openrift/shared/types/api/card-trade";
import type { ListKind } from "@openrift/shared/types/api/list";
import type { Currency, TradePreference } from "@openrift/shared/types/api/trade-preferences";
import type { Printing } from "@openrift/shared/types/catalog";
import { legendDisplayName } from "@openrift/shared/utils";
import { ListIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { memo } from "react";

import { Badge } from "@/components/ui/badge";
import { CardCell } from "@/features/cards/components/card-cell";
import { CardCountStrip } from "@/features/cards/components/card-count-strip";
import { CardStrip, StripIconButton } from "@/features/cards/components/card-strip";
import type { CardThumbnailDisplay } from "@/features/cards/hooks/use-card-thumbnail-display";
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
} from "@/features/cards/stores/card-row-actions-store";
import { useGridFocusStore } from "@/features/cards/stores/grid-focus-store";
import { useGridSelectionStore } from "@/features/cards/stores/grid-selection-store";
import { useSiblingOverrideStore } from "@/features/cards/stores/sibling-override-store";
import type { ListEntryDragData } from "@/features/collections/components/dnd-types";
import { SelectionCheckbox } from "@/features/collections/components/selection-checkbox";
import { TradePreferenceGridPill } from "@/features/groups/components/trade-preference-grid-pill";
import { TradeStatusChip } from "@/features/groups/components/trade-status-chip";
import { DraggableListEntry } from "@/features/lists/components/draggable-list-entry";
import { ListEntryContextMenu } from "@/features/lists/components/list-entry-context-menu";
import type { ListTradeIndex } from "@/features/lists/components/list-trade-status";
import { listEntryTradeStatus } from "@/features/lists/components/list-trade-status";
import { isRuleSourced, RuleSourceBadge } from "@/features/lists/components/rule-source-badge";
import { useListEntriesStore } from "@/features/lists/stores/list-entries-store";
import { entryToExcludeTarget } from "@/features/rules/lib/rule-exclude";
import type { CardRenderContext } from "@/lib/card-viewer-types";

interface ListGridCellProps {
  printing: Printing;
  itemId: string;
  cardWidth: number;
  priority: boolean;
  dataView: "cards" | "printings";
  view: "cards" | "printings" | "copies";
  kind: ListKind;
  intent: "wish" | "trade" | "organize";
  listId: string;
  listTradeDefaults: TradePreference;
  listCurrency: Currency | null;
  mode: "browse" | "select";
  showLibrary: boolean;
  supportsTradePrefs: boolean;
  siblings: Printing[] | undefined;
  display: CardThumbnailDisplay;
  showImages: boolean;
  priceRange?: { min: number; max: number };
  tradeIndex: ListTradeIndex;
}

// Every prop must stay primitive or reference-stable, or React.memo below
// stops skipping unchanged cells.
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

  const overrideId = useSiblingOverrideStore((s) =>
    inCardsView ? s.overrides.list.get(printing.cardId) : undefined,
  );
  const displayPrinting =
    overrideId && siblings
      ? (siblings.find((sibling) => sibling.id === overrideId) ?? printing)
      : printing;

  const key = kind === "card" ? printing.cardId : displayPrinting.id;
  const entry = useListEntriesStore((s) =>
    showLibrary ? s.entryByKey.get(key) : s.entryByItemId.get(itemId),
  );

  // Rule-derived entries have no list_entries row, so entry.id is null and
  // they can't be selected, dragged, edited, or removed.
  const editableEntryId = entry !== undefined && entry.id !== null ? entry.id : null;
  const isItemSelected = useGridSelectionStore(
    (state) => inSelectMode && editableEntryId !== null && state.selected.has(editableEntryId),
  );

  const tradeStatus = entry ? listEntryTradeStatus(entry, tradeIndex) : null;

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
          <div className="ring-primary pointer-events-none absolute inset-1.5 z-10 rounded-lg ring-2" />
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
  const tradeChip = tradeStatus ? (
    <TradeStatusChip annotation={tradeStatus} detail={kind === "copy" ? "word" : "label"} />
  ) : null;
  if (showLibrary) {
    // The stepper edits only the manual part; the rule's contribution can't be
    // stepped below and shows in the chip instead.
    const manualPart = entry ? entry.quantity - entry.ruleQuantity : 0;
    return (
      <CardCountStrip
        count={manualPart}
        icon={ListIcon}
        decrement={{
          onClick: () => {
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

  // Property narrowing doesn't survive into closures, so entryId is captured
  // as its own const for the handlers below.
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
    // A copy on loan can't also be pinned to a trade, but it can still carry
    // an unpinned offer, so the on-loan badge and trade chip aren't exclusive.
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
