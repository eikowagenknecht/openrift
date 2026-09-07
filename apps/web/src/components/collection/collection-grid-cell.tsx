import { copyHasMetadata } from "@openrift/shared/copy-metadata";
import type { Printing } from "@openrift/shared/types/catalog";
import { legendDisplayName } from "@openrift/shared/utils";
import { ArrowDownToLineIcon } from "lucide-react";
import type { ReactNode } from "react";
import { memo } from "react";

import { CardCell } from "@/components/cards/card-cell";
import { CardCountStrip } from "@/components/cards/card-count-strip";
import { OwnedCollectionsPopover } from "@/components/cards/card-detail/owned-collections-popover";
import { WishlistHeart } from "@/components/cards/wishlist-heart";
import { CollectionCardContextMenu } from "@/components/collection/collection-card-context-menu";
import { CopyMetadataStrip, StackMetadataChip } from "@/components/collection/copy-metadata-badges";
import { DraggableCard } from "@/components/collection/draggable-card";
import { SelectionCheckbox } from "@/components/collection/selection-checkbox";
import { tileTradeStatus } from "@/components/collection/tile-trade-status";
import { OnLoanChip } from "@/components/loans/on-loan-chip";
import { TradeStatusChip } from "@/components/trades/trade-status-chip";
import { Button } from "@/components/ui/button";
import type { CardThumbnailDisplay } from "@/hooks/use-card-thumbnail-display";
import { useLiveTradesByPrinting } from "@/hooks/use-card-trades";
import { useCopyRowsForPrintings, useOwnedCountsForPrintings } from "@/hooks/use-owned-count";
import type { CardRenderContext } from "@/lib/card-viewer-types";
import { isStackSelected } from "@/lib/stack-selection";
import type { WishEntryFlat } from "@/lib/wish-entry";
import {
  dispatchDecrement,
  dispatchIncrement,
  dispatchItemClick,
  dispatchItemToggle,
  dispatchOpenVariants,
  dispatchSiblingClick,
  dispatchTake,
} from "@/stores/card-row-actions-store";
import { useDragPreviewStore } from "@/stores/drag-preview-store";
import { useGridFocusStore } from "@/stores/grid-focus-store";
import { useGridSelectionStore } from "@/stores/grid-selection-store";
import { useSiblingOverrideStore } from "@/stores/sibling-override-store";

interface CollectionGridCellProps {
  printing: Printing;
  itemId: string;
  cardWidth: number;
  priority: boolean;
  dataView: "cards" | "printings";
  mode: "browse" | "select";
  showLibrary: boolean;
  stacked: boolean;
  siblings: Printing[] | undefined;
  collectionId: string | undefined;
  sourceCollectionIsGroup: boolean;
  display: CardThumbnailDisplay;
  showImages: boolean;
  priceRange?: { min: number; max: number };
  wishEntries?: readonly WishEntryFlat[];
  canTake?: boolean;
}

// oxlint-disable-next-line eslint/prefer-arrow-callback -- named for React DevTools
export const CollectionGridCell = memo(function CollectionGridCell({
  printing,
  itemId,
  cardWidth,
  priority,
  dataView,
  mode,
  showLibrary,
  stacked,
  siblings,
  collectionId,
  sourceCollectionIsGroup,
  display,
  showImages,
  priceRange,
  wishEntries,
  canTake,
}: CollectionGridCellProps) {
  const inCardsView = dataView === "cards";

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
    inCardsView ? s.overrides.collection.get(printing.cardId) : undefined,
  );
  const displayPrinting =
    overrideId && siblings
      ? (siblings.find((sibling) => sibling.id === overrideId) ?? printing)
      : printing;

  const siblingIds = inCardsView && siblings ? siblings.map((s) => s.id) : [displayPrinting.id];
  const { data: counts } = useOwnedCountsForPrintings(siblingIds, true, collectionId);

  const { data: cardCopies } = useCopyRowsForPrintings(siblingIds, true, collectionId);
  const cardCopyIds = cardCopies?.map((copy) => copy.id);

  const onLoanCopies = stacked ? (cardCopies?.filter((copy) => copy.onLoan) ?? []) : [];
  const onLoanCount = onLoanCopies.filter((copy) => copy.printingId === displayPrinting.id).length;
  const onLoanChip =
    onLoanCopies.length > 0 ? (
      <OnLoanChip count={onLoanCount} totalCount={inCardsView ? onLoanCopies.length : undefined} />
    ) : undefined;

  const { data: liveTrades } = useLiveTradesByPrinting();
  const tradeStatus = tileTradeStatus({
    annotations: liveTrades?.annotations,
    copies: cardCopies,
    printingId: displayPrinting.id,
    siblingIds,
    withSiblingTotal: inCardsView,
    isGroupCollection: sourceCollectionIsGroup,
  });
  const tradeChip =
    stacked && tradeStatus ? (
      <TradeStatusChip
        annotation={tradeStatus.annotation}
        totalCount={tradeStatus.totalCount}
        title={tradeStatus.title}
      />
    ) : undefined;

  const ownedCount = counts?.totals[displayPrinting.id] ?? 0;
  const totalInCollection =
    counts && inCardsView && siblings && siblings.length > 1 ? counts.total : undefined;
  const cardTotalInCollection = counts?.total ?? 0;

  const effectiveCopyIds = cardCopyIds ?? [];
  const isItemSelected = useGridSelectionStore(
    (state) =>
      mode === "select" && isStackSelected(stacked, itemId, effectiveCopyIds, state.selected),
  );

  const openLocations =
    ownedCount > 0 || (inCardsView && (siblings?.length ?? 0) > 1)
      ? (event: { currentTarget: HTMLElement }) =>
          dispatchOpenVariants(displayPrinting, event.currentTarget, "add")
      : undefined;

  const wished = wishEntries?.reduce((sum, entry) => sum + entry.quantity, 0) ?? 0;
  const takeAllCount = wished > 0 ? Math.min(wished, ownedCount) : 0;
  const boxExtras =
    wished > 0 || canTake ? (
      <>
        {wished > 0 && wishEntries && <WishlistHeart entries={wishEntries} />}
        {canTake && (
          <Button
            type="button"
            tabIndex={-1}
            size="icon-xs"
            variant="ghost"
            onClick={(event) => {
              event.stopPropagation();
              dispatchTake(itemId, 1);
            }}
            aria-label={`Take a copy of ${legendDisplayName(displayPrinting.card)}`}
            title="Take a copy"
          >
            <ArrowDownToLineIcon />
          </Button>
        )}
      </>
    ) : undefined;

  const singleCopy = stacked ? undefined : cardCopies?.find((copy) => copy.id === itemId);
  const annotatedCount = stacked
    ? (cardCopies?.filter((copy) => copyHasMetadata(copy)).length ?? 0)
    : 0;
  const metadataChip =
    annotatedCount > 0 ? (
      <StackMetadataChip itemId={itemId} annotatedCount={annotatedCount} />
    ) : undefined;

  let strip: ReactNode | undefined;
  if (!stacked) {
    strip = <CopyMetadataStrip copy={singleCopy} tradeAnnotation={tradeStatus?.annotation} />;
  } else if (mode === "browse") {
    strip = (
      <CardCountStrip
        count={ownedCount}
        totalCount={totalInCollection}
        decrement={
          ownedCount > 0
            ? {
                onClick: (event) => dispatchDecrement(displayPrinting, event.currentTarget),
                ariaLabel: `Remove ${legendDisplayName(displayPrinting.card)}`,
              }
            : undefined
        }
        increment={{
          onClick: () => dispatchIncrement(displayPrinting),
          ariaLabel: `Add ${legendDisplayName(displayPrinting.card)}`,
        }}
        onPillClick={openLocations}
        pillAriaLabel={
          openLocations
            ? ownedCount > 0
              ? `Variants and collections for ${legendDisplayName(displayPrinting.card)}`
              : `Choose variant for ${legendDisplayName(displayPrinting.card)}`
            : undefined
        }
        extras={
          onLoanChip || tradeChip || metadataChip || boxExtras ? (
            <>
              {onLoanChip}
              {tradeChip}
              {metadataChip}
              {boxExtras}
            </>
          ) : undefined
        }
      />
    );
  } else if (ownedCount > 0 || cardTotalInCollection > 0) {
    strip = (
      <CardCountStrip
        count={ownedCount}
        totalCount={totalInCollection}
        pillOverride={
          <OwnedCollectionsPopover
            printingId={displayPrinting.id}
            cardName={legendDisplayName(displayPrinting.card)}
            shortCode={displayPrinting.shortCode}
            count={ownedCount}
            totalCount={totalInCollection}
            siblings={inCardsView ? siblings : undefined}
          />
        }
        extras={
          onLoanChip || tradeChip || metadataChip ? (
            <>
              {onLoanChip}
              {tradeChip}
              {metadataChip}
            </>
          ) : undefined
        }
      />
    );
  }

  const dragPreview = useDragPreviewStore((s) => s.preview);
  const ownCopyIds = stacked ? effectiveCopyIds : [itemId];
  const isStackDrag = !isItemSelected && stacked && ownCopyIds.length > 1;
  const previewPrintings = dragPreview.length > 0 ? dragPreview : [displayPrinting];
  const sourceAllGroupCopies = !isItemSelected && ownCopyIds.length > 0 && sourceCollectionIsGroup;
  const wrap =
    ownCopyIds.length > 0 ? (
      <DraggableCard
        id={itemId}
        copyIds={ownCopyIds}
        fromSelection={isItemSelected}
        isStackDrag={isStackDrag}
        printing={displayPrinting}
        previewPrintings={previewPrintings}
        sourceCollectionId={collectionId}
        sourceAllGroupCopies={sourceAllGroupCopies}
      />
    ) : undefined;

  const handleClick = (clicked: Printing, event?: { shiftKey: boolean; ctrlKey: boolean }) => {
    dispatchItemClick(itemId, clicked, {
      shift: event?.shiftKey ?? false,
      ctrl: event?.ctrlKey ?? false,
    });
  };

  const leftOverlay =
    mode === "select" && cardTotalInCollection > 0 ? (
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
      onClick={handleClick}
      onSiblingClick={(p) => dispatchSiblingClick(p)}
      siblings={inCardsView ? siblings : undefined}
      priceRange={showLibrary ? priceRange : undefined}
      dimmed={cardTotalInCollection === 0}
      strip={strip}
      leftOverlay={leftOverlay}
      contextMenu={
        cardTotalInCollection > 0 ? (
          <CollectionCardContextMenu
            itemId={itemId}
            canTake={canTake}
            takeAllCount={takeAllCount}
            stacked={stacked}
            canLend={!sourceCollectionIsGroup}
            lendPrinting={displayPrinting}
          />
        ) : undefined
      }
      wrap={wrap}
    />
  );
});
