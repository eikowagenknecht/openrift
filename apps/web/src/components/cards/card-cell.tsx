import type { Printing } from "@openrift/shared";
import type { MouseEvent as ReactMouseEvent, ReactElement, ReactNode } from "react";
import { cloneElement } from "react";

import type { CardRenderContext } from "@/components/card-viewer-types";
import type { CardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import { CardThumbnail } from "@/components/cards/card-thumbnail";

export interface CardCellProps {
  printing: Printing;
  ctx: CardRenderContext;
  display: CardThumbnailDisplay;
  showImages: boolean;
  view?: "cards" | "printings";

  onClick: (printing: Printing, event?: ReactMouseEvent) => void;
  onSiblingClick?: (printing: Printing) => void;

  strip?: ReactNode;

  siblings?: Printing[];
  priceRange?: { min: number; max: number };

  belowLabel?: ReactNode;
  imageOverlay?: ReactNode;
  leftOverlay?: ReactNode;

  dimmed?: boolean;
  highlighted?: boolean;
  showBanOverlay?: boolean;
  hideBanIndicators?: boolean;

  dragData?: Record<string, unknown>;
  dragId?: string;

  wrap?: ReactElement<{ children?: ReactNode }>;
  contextMenu?: ReactElement<{ children?: ReactNode }>;
}

export function CardCell({
  printing,
  ctx,
  display,
  showImages,
  view,
  onClick,
  onSiblingClick,
  strip,
  siblings,
  priceRange,
  belowLabel,
  imageOverlay,
  leftOverlay,
  dimmed,
  highlighted,
  showBanOverlay,
  hideBanIndicators,
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
      hideBanIndicators={hideBanIndicators}
      belowLabel={belowLabel}
      imageOverlay={imageOverlay}
      dragData={dragData}
      dragId={dragId}
      aboveCard={strip}
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
