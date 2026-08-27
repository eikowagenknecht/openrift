import type { Printing } from "@openrift/shared";
import { legendDisplayName } from "@openrift/shared";
import type { ReactNode } from "react";
import { memo } from "react";

import type { CardRenderContext } from "@/components/card-viewer-types";
import { CardCell } from "@/components/cards/card-cell";
import { CardCountStrip } from "@/components/cards/card-count-strip";
import { OwnedCollectionsPopover } from "@/components/cards/card-detail/owned-collections-popover";
import type { CardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import { CatalogCardContextMenu } from "@/components/cards/catalog-card-context-menu";
import { WishlistButton } from "@/components/cards/wishlist-heart";
import { useOwnedCountsForPrintings } from "@/hooks/use-owned-count";
import type { WishEntryFlat } from "@/hooks/use-wish-entries";
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
  /** The item's underlying printing (pre-override-resolution). */
  printing: Printing;
  /** Stable item id (printingId for the catalog grid). */
  itemId: string;
  /** Sibling printings of the same card (cards view) for the variant chevron + per-variant breakdown. */
  siblings: Printing[] | undefined;
  /** Layout dimensions + load priority from the row (primitive props so the
   * per-cell memo isn't busted by `ctx`'s identity flipping every row render). */
  cardWidth: number;
  priority: boolean;
  showImages: boolean;
  view: "cards" | "printings";
  display: CardThumbnailDisplay;
  priceRange: { min: number; max: number } | undefined;
  /** True when owned counts should be visible (logged-in + cardsShowCounts on). */
  showStrip: boolean;
  /** True when the browser has an add target, so the strip carries +/- as well as the count. */
  canAdd: boolean;
  /**
   * True when the context menu may offer the add shortcut. Wider than
   * {@link canAdd}: the menu stays useful with the owned-count toggle off,
   * where the strip it lives beside is not rendered at all.
   */
  canMenuAdd: boolean;
  /** True when the viewer can put the card on a wishlist (signed in). */
  canWish: boolean;
  /** Collection an add lands in, named in the context menu. */
  addTargetName: string;
  /**
   * The viewer's wish entries matching this card, for the filled heart and its
   * popover. Undefined — not an empty array — when the card is on no wishlist,
   * so an unwished cell's props stay reference-stable and its memo holds.
   */
  wishEntries?: readonly WishEntryFlat[];
  inCardsView: boolean;
}

/**
 * Per-cell wrapper for the catalog browser grid. Self-subscribes to its own
 * owned count and sibling-swap override so the parent's `renderCard` closure
 * stays stable across +/- and sibling clicks — only the cell whose data
 * actually changed re-renders.
 *
 * Wrapped in `React.memo`: every prop is primitive or comes from a
 * reference-stable source (printing/siblings from useCards, display from
 * useCardThumbnailDisplay's "use memo", priceRange from useCardData's "use
 * memo"), so shallow equality reliably skips unchanged cells.
 *
 * @returns The card cell with its strip, owned-count, and click wiring.
 */
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
  // Per-cell subscription: when the user pins a different variant on this
  // card the store updates and this cell re-renders. Other cells (different
  // cardId) get the same string back from their selector and skip.
  const overrideId = useSiblingOverrideStore((s) =>
    inCardsView ? s.overrides.cards.get(printing.cardId) : undefined,
  );
  const displayPrinting =
    overrideId && siblings
      ? (siblings.find((sibling) => sibling.id === overrideId) ?? printing)
      : printing;

  const siblingIds = siblings ? siblings.map((sibling) => sibling.id) : [displayPrinting.id];
  const { data: counts } = useOwnedCountsForPrintings(siblingIds, showStrip);

  // Primary count = the displayed printing's owned count. The "(M)" hint is
  // the per-card sum across siblings — only meaningful in cards view when
  // more than one variant has copies.
  const ownedCount = counts?.totals[displayPrinting.id] ?? 0;
  const cardTotal = counts?.total ?? 0;
  const hasMultipleOwnedVariants =
    counts && inCardsView && siblings
      ? siblings.filter((sibling) => (counts.totals[sibling.id] ?? 0) > 0).length > 1
      : false;
  const totalCount = hasMultipleOwnedVariants ? cardTotal : undefined;

  // Once the cell can write, the pill opens the variant×collection popover
  // instead of the read-only breakdown: that popover is how a copy reaches a
  // collection other than the add target, and in cards view it doubles as the
  // variant chooser. With nothing owned and a single variant there is nothing
  // to manage there, so the pill keeps the read-only breakdown.
  const openLocations =
    canAdd && (ownedCount > 0 || (inCardsView && (siblings?.length ?? 0) > 1))
      ? (event: { currentTarget: HTMLElement }) =>
          dispatchOpenVariants(displayPrinting, event.currentTarget, "add")
      : undefined;

  const cardName = legendDisplayName(displayPrinting.card);
  // The heart rides the strip when there is one; the context menu carries the
  // same action for viewers browsing with counts turned off.
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

  // Build the ctx that CardCell + CardThumbnail expect. isSelected /
  // isFlashing are read per-cell from useGridFocusStore so the parent's
  // .map closure stays unstable-prop-free.
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
