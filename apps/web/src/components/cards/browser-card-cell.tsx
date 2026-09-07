import type { Printing } from "@openrift/shared";
import { legendDisplayName } from "@openrift/shared";
import type { ReactNode } from "react";
import { memo } from "react";

import { CardCell } from "@/components/cards/card-cell";
import { CardCountStrip } from "@/components/cards/card-count-strip";
import { OwnedCollectionsPopover } from "@/components/cards/card-detail/owned-collections-popover";
import { CatalogCardContextMenu } from "@/components/cards/catalog-card-context-menu";
import { WishlistButton } from "@/components/cards/wishlist-heart";
import type { CardThumbnailDisplay } from "@/hooks/use-card-thumbnail-display";
import { useOwnedCountsForPrintings } from "@/hooks/use-owned-count";
import type { CardRenderContext } from "@/lib/card-viewer-types";
import type { WishEntryFlat } from "@/lib/wish-entry";
import {
  dispatchAddToWishlist,
  dispatchDecrement,
  dispatchIncrement,
  dispatchOpenVariants,
  dispatchRowClick,
  dispatchSiblingClick,
} from "@/stores/card-row-actions-store";
import { useGridFocusStore } from "@/stores/grid-focus-store";
import { useSiblingOverrideStore } from "@/stores/sibling-override-store";

const EMPTY_WISH_ENTRIES: readonly WishEntryFlat[] = [];

interface BrowserCardCellProps {
  printing: Printing;
  itemId: string;
  siblings: Printing[] | undefined;
  cardWidth: number;
  priority: boolean;
  showImages: boolean;
  view: "cards" | "printings";
  display: CardThumbnailDisplay;
  priceRange: { min: number; max: number } | undefined;
  showStrip: boolean;
  canAdd: boolean;
  canMenuAdd: boolean;
  canWish: boolean;
  addTargetName: string;
  wishEntries?: readonly WishEntryFlat[];
  inCardsView: boolean;
}

// Every prop must stay primitive or reference-stable; a fresh object literal
// here defeats the memo below.
// oxlint-disable-next-line eslint/prefer-arrow-callback -- named for React DevTools
export const BrowserCardCell = memo(function BrowserCardCell({
  printing,
  itemId,
  siblings,
  cardWidth,
  priority,
  showImages,
  view,
  display,
  priceRange,
  showStrip,
  canAdd,
  canMenuAdd,
  canWish,
  addTargetName,
  wishEntries,
  inCardsView,
}: BrowserCardCellProps) {
  const overrideId = useSiblingOverrideStore((s) =>
    inCardsView ? s.overrides.cards.get(printing.cardId) : undefined,
  );
  const displayPrinting =
    overrideId && siblings
      ? (siblings.find((sibling) => sibling.id === overrideId) ?? printing)
      : printing;

  const siblingIds = siblings ? siblings.map((sibling) => sibling.id) : [displayPrinting.id];
  const { data: counts } = useOwnedCountsForPrintings(siblingIds, showStrip);

  const ownedCount = counts?.totals[displayPrinting.id] ?? 0;
  const cardTotal = counts?.total ?? 0;
  const hasMultipleOwnedVariants =
    counts && inCardsView && siblings
      ? siblings.filter((sibling) => (counts.totals[sibling.id] ?? 0) > 0).length > 1
      : false;
  const totalCount = hasMultipleOwnedVariants ? cardTotal : undefined;

  const openLocations =
    canAdd && (ownedCount > 0 || (inCardsView && (siblings?.length ?? 0) > 1))
      ? (event: { currentTarget: HTMLElement }) =>
          dispatchOpenVariants(displayPrinting, event.currentTarget, "add")
      : undefined;

  const cardName = legendDisplayName(displayPrinting.card);
  const wishSlot = canWish ? (
    <WishlistButton
      entries={wishEntries ?? EMPTY_WISH_ENTRIES}
      cardName={cardName}
      onAdd={() => dispatchAddToWishlist(displayPrinting)}
    />
  ) : undefined;

  let strip: ReactNode | undefined;
  if (showStrip) {
    strip = (
      <CardCountStrip
        extras={wishSlot}
        count={ownedCount}
        totalCount={totalCount}
        pillOverride={
          openLocations ? undefined : (
            <OwnedCollectionsPopover
              printingId={displayPrinting.id}
              cardName={cardName}
              shortCode={displayPrinting.shortCode}
              count={ownedCount}
              totalCount={totalCount}
              siblings={inCardsView ? siblings : undefined}
            />
          )
        }
        onPillClick={openLocations}
        pillAriaLabel={
          openLocations
            ? ownedCount > 0
              ? `Variants and collections for ${cardName}`
              : `Choose variant for ${cardName}`
            : undefined
        }
        decrement={
          canAdd && ownedCount > 0
            ? {
                onClick: (event) => dispatchDecrement(displayPrinting, event.currentTarget),
                ariaLabel: `Remove ${cardName}`,
              }
            : undefined
        }
        increment={
          canAdd
            ? {
                onClick: () => dispatchIncrement(displayPrinting),
                ariaLabel: `Add ${cardName}`,
              }
            : undefined
        }
      />
    );
  }

  const isSelected = useGridFocusStore(
    (s) => s.selectedItemId === itemId || s.selectedItemId === printing.id,
  );
  const isFlashing = useGridFocusStore(
    (s) => s.flashCardId === itemId || s.flashCardId === printing.id,
  );
  const ctx: CardRenderContext = { isSelected, isFlashing, cardWidth, priority };
  return (
    <CardCell
      printing={displayPrinting}
      ctx={ctx}
      display={display}
      showImages={showImages}
      view={view}
      onClick={dispatchRowClick}
      onSiblingClick={dispatchSiblingClick}
      siblings={inCardsView ? siblings : undefined}
      priceRange={priceRange}
      dimmed={showStrip && cardTotal === 0}
      strip={strip}
      contextMenu={
        <CatalogCardContextMenu
          printing={displayPrinting}
          canAdd={canMenuAdd}
          canWish={canWish}
          addTargetName={addTargetName}
        />
      }
    />
  );
});
