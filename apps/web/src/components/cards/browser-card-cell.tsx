import type { Printing } from "@openrift/shared";
import type { ReactNode } from "react";

import type { CardRenderContext } from "@/components/card-viewer-types";
import { CardCell } from "@/components/cards/card-cell";
import type { CardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import { OwnedCountStrip } from "@/components/cards/owned-count-strip";
import { SuggestImageOverlay } from "@/components/cards/suggest-image-overlay";
import { CollectionAddStrip } from "@/components/collection/collection-add-strip";
import { useOwnedCountsForPrintings } from "@/hooks/use-owned-count";
import {
  dispatchDecrement,
  dispatchIncrement,
  dispatchOpenVariants,
  dispatchRowClick,
  dispatchSiblingClick,
} from "@/stores/card-row-actions-store";

interface BrowserCardCellProps {
  printing: Printing;
  /** Sibling printings of the same card (cards view) for the variant chevron + per-variant breakdown. */
  siblings: Printing[] | undefined;
  ctx: CardRenderContext;
  showImages: boolean;
  view: "cards" | "printings";
  display: CardThumbnailDisplay;
  priceRange: { min: number; max: number } | undefined;
  /** True when owned counts should be visible (logged-in browse or add mode). */
  showStrip: boolean;
  /** True when add mode is on (renders +/- strip instead of read-only count). */
  showAddControls: boolean;
  inCardsView: boolean;
}

/**
 * Per-cell wrapper for the catalog browser grid. Self-subscribes to its own
 * owned count via {@link useOwnedCountsForPrintings} and dispatches click /
 * +/- via the module-stable trampolines in `card-row-actions-store`. With
 * unstable closures lifted out of the parent's `renderCard`, only the cell
 * whose data actually changed re-renders on add/remove.
 *
 * The JSX wiring is handed off to {@link CardCell}; this component owns the
 * catalog-specific concerns (live owned-count subscription + strip choice).
 *
 * @returns The card cell with its strip, owned-count, and click wiring.
 */
export function BrowserCardCell({
  printing,
  siblings,
  ctx,
  showImages,
  view,
  display,
  priceRange,
  showStrip,
  showAddControls,
  inCardsView,
}: BrowserCardCellProps) {
  const siblingIds = siblings ? siblings.map((sibling) => sibling.id) : [printing.id];
  const enabled = showStrip || showAddControls;
  const { data: counts } = useOwnedCountsForPrintings(siblingIds, enabled);

  const ownedCount = counts?.total ?? 0;
  const ownedVariantCount =
    counts && inCardsView && siblings
      ? siblings.filter((sibling) => (counts.totals[sibling.id] ?? 0) > 0).length
      : 0;
  // Cards view: minus on a card with copies across multiple variants is
  // ambiguous — route to the variant popover instead of silently disposing
  // the displayed printing.
  const onUndoAdd = ownedVariantCount > 1 ? dispatchOpenVariants : dispatchDecrement;

  let strip: ReactNode | undefined;
  if (enabled) {
    strip = showAddControls ? (
      <CollectionAddStrip
        printing={printing}
        ownedCount={ownedCount}
        hasVariants={inCardsView && (siblings?.length ?? 0) > 1}
        onQuickAdd={dispatchIncrement}
        onUndoAdd={onUndoAdd}
        onOpenVariants={dispatchOpenVariants}
      />
    ) : (
      <OwnedCountStrip
        count={ownedCount}
        printingId={printing.id}
        cardName={printing.card.name}
        shortCode={printing.shortCode}
        siblings={inCardsView ? siblings : undefined}
      />
    );
  }

  return (
    <CardCell
      printing={printing}
      ctx={ctx}
      display={display}
      showImages={showImages}
      view={view}
      onClick={dispatchRowClick}
      onSiblingClick={dispatchSiblingClick}
      siblings={inCardsView ? siblings : undefined}
      priceRange={priceRange}
      dimmed={enabled && ownedCount === 0}
      strip={strip}
      imageOverlay={<SuggestImageOverlay printing={printing} />}
    />
  );
}
