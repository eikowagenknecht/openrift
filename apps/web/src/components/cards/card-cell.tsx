import type { Printing } from "@openrift/shared";
import type { MouseEvent as ReactMouseEvent, ReactElement, ReactNode } from "react";
import { cloneElement } from "react";

import type { CardRenderContext } from "@/components/card-viewer-types";
import type { CardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import { CardThumbnail } from "@/components/cards/card-thumbnail";

export interface CardCellProps {
  printing: Printing;
  /** Per-cell selection/highlight context produced by CardGrid. */
  ctx: CardRenderContext;
  display: CardThumbnailDisplay;
  showImages: boolean;
  view?: "cards" | "printings";

  onClick: (printing: Printing, event?: ReactMouseEvent) => void;
  onSiblingClick?: (printing: Printing) => void;

  /**
   * Per-card strip (owned count, add controls, deck add controls, …).
   * Mounted as either `aboveCard` (default) or `topSlot` on the underlying
   * CardThumbnail.
   *
   * Choose `topSlot` when the strip needs to sit in the sticky region above
   * the scroll boundary (e.g. deck builder's add controls so they stay
   * tappable as a card scrolls off-screen); choose `aboveCard` (default) for
   * decorative strips that should scroll with the image.
   */
  strip?: ReactNode;
  stripSlot?: "aboveCard" | "topSlot";

  /** Variant chevron + per-card price aggregate (cards view). */
  siblings?: Printing[];
  priceRange?: { min: number; max: number };

  /** Content rendered below the meta-label row (e.g. marker chips on /promos). */
  belowLabel?: ReactNode;
  /** Content overlaid on the card image area (e.g. SuggestImageOverlay). */
  imageOverlay?: ReactNode;
  /**
   * Absolutely-positioned overlay rendered as a sibling of the thumbnail
   * inside a `relative` wrapper (e.g. select-mode checkbox + selection ring).
   * When provided, CardCell adds the wrapper itself.
   */
  leftOverlay?: ReactNode;

  /** Visual flags forwarded to CardThumbnail. */
  dimmed?: boolean;
  highlighted?: boolean;
  showBanOverlay?: boolean;

  /** dnd-kit drag source attached to the CardThumbnail itself. */
  dragData?: Record<string, unknown>;
  dragId?: string;

  /**
   * Outer wrap (e.g. <DraggableCard> from the collection grid). Pass a JSX
   * element with the wrapper's props; CardCell injects the composed cell as
   * its children via cloneElement.
   */
  wrap?: ReactElement<{ children?: ReactNode }>;
  /** Inner wrap, applied before {@link wrap} (e.g. <DeckCardDetailMenu>). */
  contextMenu?: ReactElement<{ children?: ReactNode }>;
}

/**
 * Renders a CardThumbnail with the standard slot configuration used across
 * every card-browser surface (catalog, collections, deck builder, shared
 * collection). Centralizes the thumbnail-wiring boilerplate that each
 * surface's `renderCard` used to re-derive — strip placement, click + sibling
 * wiring, selection overlay, DnD wrap, context-menu wrap.
 *
 * Each surface still owns the *product logic* that produces the strip and
 * handlers (deck-zone-aware add controls, in-collection select shift-range,
 * variant override routing, etc.). CardCell only handles the JSX assembly.
 *
 * @returns The composed card cell node, including any outer wrap.
 */
export function CardCell({
  printing,
  ctx,
  display,
  showImages,
  view,
  onClick,
  onSiblingClick,
  strip,
  stripSlot = "aboveCard",
  siblings,
  priceRange,
  belowLabel,
  imageOverlay,
  leftOverlay,
  dimmed,
  highlighted,
  showBanOverlay,
  dragData,
  dragId,
  wrap,
  contextMenu,
}: CardCellProps) {
  const thumbnail = (
    <CardThumbnail
      printing={printing}
      onClick={onClick}
      onSiblingClick={onSiblingClick}
      showImages={showImages}
      isSelected={ctx.isSelected}
      isFlashing={ctx.isFlashing}
      cardWidth={ctx.cardWidth}
      priority={ctx.priority}
      display={display}
      view={view}
      siblings={siblings}
      priceRange={priceRange}
      dimmed={dimmed}
      highlighted={highlighted}
      showBanOverlay={showBanOverlay}
      belowLabel={belowLabel}
      imageOverlay={imageOverlay}
      dragData={dragData}
      dragId={dragId}
      aboveCard={stripSlot === "aboveCard" ? strip : undefined}
      topSlot={stripSlot === "topSlot" ? strip : undefined}
    />
  );

  let content: ReactNode = thumbnail;
  if (leftOverlay) {
    content = (
      <div className="relative">
        {leftOverlay}
        {content}
      </div>
    );
  }
  if (contextMenu) {
    content = cloneElement(contextMenu, undefined, content);
  }
  if (wrap) {
    content = cloneElement(wrap, undefined, content);
  }
  return content;
}
